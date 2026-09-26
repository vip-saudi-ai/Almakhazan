// Data access layer.
//
// Two interchangeable backends sit behind one facade: Firestore (per-document
// writes, server timestamps, realtime listeners) and IndexedDB (single-device
// fallback). Nothing in the UI knows which one is active.
//
// Rules that hold for both backends:
//  - writes target one document, never the whole database;
//  - an update carries the version it was based on, and a mismatch is a
//    conflict rather than a silent overwrite;
//  - deletes are soft by default (Trash), purge is a separate deliberate step;
//  - every meaningful change appends an activity-log entry.

import { ACTIONS, DEFAULT_LOCATIONS, ROLES, TAXONOMY_LIMITS, UNCATEGORIZED_ID, roleAtLeast } from './config.js';
import { firebaseContext } from './firebase.js';
import * as local from './local-store.js';
import { applyReferenceDelta, releaseAll, retainAll } from './media.js';
import { releaseObjectUrls } from './storage.js';
import { currenciesPresent as currenciesInItems } from './money.js';
import { quotaStatus } from './subscription.js';
import {
  GENERATED_SKU_MAX, formatGeneratedSku, generatedSkuPrefix, parseGeneratedSku,
} from './sku.js';
import { AppError, toMillis, uid } from './utils.js';
import { t } from './i18n.js';
import {
  LEVELS, OTHER_MAIN_ID, TAXONOMY_SCHEMA_VERSION, buildTaxonomy, isBuiltinId, legacyPlacement,
  reconcileClassification,
} from './taxonomy.js';
import {
  normalizeCategory, normalizeFolder, normalizeItem, normalizeLocation, normalizeSku,
} from './validation.js';

export const SyncState = {
  LOADING: 'loading',
  SYNCED: 'synced',
  SAVING: 'saving',
  OFFLINE: 'offline',
  LOCAL: 'local',
  ERROR: 'error',
  CONFLICT: 'conflict',
};

/** Sync statuses are shown through the `sync.<status>` messages (i18n.js). */

export class ConflictError extends AppError {
  constructor(current) {
    super('error.repo/conflict', { code: 'repo/conflict' });
    this.name = 'ConflictError';
    this.current = current;
  }
}

const COLLECTIONS = ['items', 'folders', 'categories', 'locations'];

/** The index holding only the trashed records of each scope value. */
const TRASH_INDEX_BY_FIELD = {
  folderId: 'folderDeleted',
  categoryId: 'categoryDeleted',
  mainCategoryId: 'mainCategoryDeleted',
  subcategoryId: 'subcategoryDeleted',
  locationId: 'locationDeleted',
};

/** The item fields that make up a classification. */
const CLASSIFICATION_FIELDS = ['mainCategoryId', 'categoryId', 'subcategoryId'];

const TAXONOMY_MIGRATION_KEY = 'taxonomy.migration';

// The taxonomies are small by design and stay whole. Records are not: a
// workspace at the Business limit is 20,000 of them, and loading all of it to
// draw one screen costs 20,000 reads and a slow first paint. So the live view
// is bounded to the newest records, and the rest is fetched once, on demand,
// by whatever needs all of it — see `completeItems`.
export const ITEM_WINDOW = 200;

/**
 * The largest selection the device backend will treat as one transaction.
 *
 * Above it the operation is chunked and says so. An IndexedDB transaction has
 * no documented operation cap, but one holding tens of thousands of requests
 * open across a slow device is a promise this code cannot keep — and a
 * guarantee that only holds on a fast phone is not a guarantee.
 */
const ATOMIC_BULK_MAX = 1000;

// ── plan capacity ──────────────────────────────────────────────────────────

/**
 * The refusal when an operation would take live records past the plan.
 * Structured, so a caller reads numbers rather than parsing a sentence.
 */
export function capacityError({ limit, used, requested }) {
  const remaining = Math.max(0, limit - used);
  return new AppError(
    remaining > 0 ? 'error.plan/item-limit.remaining' : 'error.plan/item-limit.full',
    // `count` chooses the plural form of the message.
    { code: 'plan/item-limit', limit, used, remaining, requested, count: remaining },
  );
}

/**
 * Inside a readwrite transaction on `items`: are there `adds` more live slots?
 * Counted with the store's own count and the Trash index — no records read —
 * in the same transaction that then writes, which is what stops two tabs at
 * 49 of 50 from both writing the fiftieth.
 */
async function assertLiveRoom(itemsStore, limit, adds) {
  const [total, trashed] = await Promise.all([
    local.request(itemsStore.count()),
    local.request(itemsStore.index('deletedAt').count(IDBKeyRange.lowerBound(0))),
  ]);
  const used = total - trashed;
  if (used + adds > limit) throw capacityError({ limit, used, requested: adds });
}

/**
 * The live-SKU invariant, enforced inside the IndexedDB transaction that
 * writes: after the commit, no two live records share a non-empty SKU.
 *
 * `affected` is every item record the transaction touches, each with its
 * FINAL state (`null` when the transaction deletes it). Checking final states
 * rather than one write at a time is what lets an atomic batch swap two SKUs
 * (A→B, B→A), and what catches two new records in the same batch claiming the
 * same SKU before either exists in the index.
 *
 *   · among the affected records: two live finals with the same SKU → conflict
 *   · against the rest of the store: a record whose final live SKU is newly
 *     claimed (new record, restored from the Trash, or SKU changed) is looked
 *     up in the `sku` index — in THIS transaction, so nothing can commit in
 *     between — and any live record not itself affected is a conflict.
 *
 * A record that keeps the live SKU it already had is not looked up: it owns
 * it already, and a bulk move of five thousand records costs no index reads.
 * Trashed records never block. Values are compared through `normalizeSku`,
 * the same definition every precheck uses. The prechecks
 * (`skuConflict`, `findSkuConflicts`) are for the screen; this is the guarantee.
 *
 * @param {IDBObjectStore} itemsStore  the items store of the active transaction
 * @param {Array<{id: string, before: object|null, after: object|null}>} affected
 * @throws {AppError} `repo/sku-conflict` with `{sku, id, existingId, existingName}`
 */
async function assertLiveSkusInStore(itemsStore, affected) {
  const affectedIds = new Set(affected.map((entry) => entry.id));
  const owners = new Map();
  const toLookUp = [];
  for (const { id, before, after } of affected) {
    if (!after || after.deletedAt) continue;
    const sku = normalizeSku(after.sku);
    if (!sku) continue;
    const other = owners.get(sku);
    if (other && other !== id) throw skuConflictError({ sku, id, existingId: other });
    owners.set(sku, id);
    const alreadyOwned = before && !before.deletedAt && normalizeSku(before.sku) === sku;
    if (!alreadyOwned) toLookUp.push({ id, sku, raw: after.sku });
  }
  if (!toLookUp.length) return;
  const index = itemsStore.index('sku');
  const found = await Promise.all(toLookUp.map(async (entry) => {
    const keys = entry.raw && entry.raw !== entry.sku ? [entry.sku, entry.raw] : [entry.sku];
    const rows = (await Promise.all(keys.map((key) => local.request(index.getAll(IDBKeyRange.only(key)))))).flat();
    return { entry, rows };
  }));
  for (const { entry, rows } of found) {
    const clash = rows.find((row) => !row.deletedAt && !affectedIds.has(row.id));
    if (clash) throw skuConflictError({ sku: entry.sku, id: entry.id, existingId: clash.id, existingName: clash.name });
  }
}

function skuConflictError({ sku, id, existingId, existingName = '' }) {
  return new AppError('error.repo/sku-conflict', {
    code: 'repo/sku-conflict', sku, id, existingId, existingName,
  });
}

/**
 * Each item record's state before and after a batch, keyed by id — the last
 * operation on an id decides its final state, as it would in the store.
 */
function finalItemStates(plan) {
  const byId = new Map();
  for (const { op, existing } of plan) {
    if (op.collection !== 'items' || (op.type !== 'set' && op.type !== 'delete')) continue;
    const entry = byId.get(op.id) || { id: op.id, before: existing || null, after: existing || null };
    entry.after = op.type === 'delete' ? null : { ...(op.merge !== false ? entry.after : null), ...op.data, id: op.id };
    byId.set(op.id, entry);
  }
  return [...byId.values()];
}

/** Keyed reads per transaction or per round of requests. Bounded, so a
 *  selection of five thousand is fifty short reads, not one unbounded fan-out. */
const KEYED_BATCH = 100;

/** Records fetched by id and kept for a moment — a detail opened twice, the
 *  item a context menu was opened on. Small on purpose: this is a cache, not a
 *  second copy of the inventory. */
const ITEM_CACHE_MAX = 100;

/** What a bulk edit did, named for the activity log rather than inferred from
 *  its patch by whoever reads the log later. */
function bulkOperationName(patch) {
  const keys = Object.keys(patch);
  if (keys.length !== 1) return 'update';
  return {
    folderId: 'move-folder',
    categoryId: 'set-category',
    locationId: 'move-location',
    condition: 'set-condition',
    unit: 'set-unit',
  }[keys[0]] || 'update';
}
/** How many operations one chunk carries when the whole set cannot be atomic. */
const BULK_CHUNK = 100;
/** How many records a cancellation removes per round trip. */
const ROLLBACK_CHUNK = 200;

const DAY = 24 * 60 * 60 * 1000;
/** When the activity log was last trimmed, so it is trimmed about once a day. */
const ACTIVITY_PRUNE_KEY = 'activity.lastPrunedAt';
const SCAN_PAGE = 500;
/** Marks the old year-less SKU counter as considered, once, in the cloud. */
const LEGACY_SKU_MARKER = 'sku-legacy-migration';
/** SKUs asked of the local index per read transaction. */
const SKU_LOOKUP_BATCH = 500;
/** Firestore's ceiling on the values of one `in` query. */
const FIRESTORE_IN_LIMIT = 30;
/** How many of those queries run at once. */
const SKU_QUERY_CONCURRENCY = 4;

// ── Firestore backend ──────────────────────────────────────────────────────
export class FirestoreBackend {
  constructor(workspaceId) {
    this.workspaceId = workspaceId;
    const { db, sdk } = firebaseContext();
    this.db = db;
    this.fs = sdk.firestore;
  }

  col(name) {
    return this.fs.collection(this.db, 'workspaces', this.workspaceId, name);
  }

  ref(name, id) {
    return this.fs.doc(this.db, 'workspaces', this.workspaceId, name, id);
  }

  get serverTime() {
    return this.fs.serverTimestamp();
  }

  /** Realtime listeners keep other devices' edits flowing in without a refresh. */
  watch(name, onData, onError) {
    return this.fs.onSnapshot(
      this.col(name),
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data({ serverTimestamps: 'estimate' }),
        }));
        onData(rows, { fromCache: snapshot.metadata.fromCache, pending: snapshot.metadata.hasPendingWrites });
      },
      (error) => onError(error),
    );
  }

  watchActivity(onData, onError) {
    const q = this.fs.query(this.col('activityLogs'), this.fs.orderBy('timestamp', 'desc'), this.fs.limit(60));
    return this.fs.onSnapshot(
      q,
      (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
      (error) => onError(error),
    );
  }

  /**
   * A bounded live view: the newest `max` records, kept in sync like any other
   * listener. `complete` tells the caller whether the window happens to be the
   * whole collection — when it is, nothing else needs fetching.
   */
  watchWindow(name, max, onData, onError) {
    const q = this.fs.query(this.col(name), this.fs.orderBy('updatedAt', 'desc'), this.fs.limit(max));
    return this.fs.onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data({ serverTimestamps: 'estimate' }),
        }));
        onData(rows, {
          fromCache: snapshot.metadata.fromCache,
          pending: snapshot.metadata.hasPendingWrites,
          complete: rows.length < max,
        });
      },
      (error) => onError(error),
    );
  }

  /**
   * Every record, a page at a time. Ordered by document id rather than by
   * `updatedAt`, because a bulk write gives hundreds of records the same
   * timestamp and a cursor over a tied field either repeats rows or skips
   * them. Ids are unique, so the cursor cannot do either.
   */
  async scanAll(name, { pageSize = SCAN_PAGE, onPage } = {}) {
    let cursor = null;
    for (;;) {
      const parts = [this.fs.orderBy(this.fs.documentId())];
      if (cursor) parts.push(this.fs.startAfter(cursor));
      parts.push(this.fs.limit(pageSize));
      const snapshot = await this.fs.getDocs(this.fs.query(this.col(name), ...parts));
      if (snapshot.empty) return;
      await onPage?.(snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data({ serverTimestamps: 'estimate' }),
      })));
      if (snapshot.docs.length < pageSize) return;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }

  async create(name, record, { liveLimit = null } = {}) {
    const { id, ...rest } = record;
    if (liveLimit != null && name === 'items') await this._precheckCapacity([{ type: 'set', collection: 'items', id, data: rest }], liveLimit);
    await this.fs.setDoc(this.ref(name, id), {
      ...rest,
      createdAt: this.serverTime,
      updatedAt: this.serverTime,
      version: 1,
    });
  }

  /**
   * Optimistic concurrency: the transaction re-reads the document and refuses
   * the write when its version moved since the caller read it.
   */
  async update(name, id, patch, expectedVersion, { liveLimit = null } = {}) {
    const ref = this.ref(name, id);
    if (liveLimit != null && name === 'items' && 'deletedAt' in patch && !patch.deletedAt) {
      const counts = await this.countItems();
      if (counts && counts.live + 1 > liveLimit) throw capacityError({ limit: liveLimit, used: counts.live, requested: 1 });
    }
    await this.fs.runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new AppError('error.repo/missing', { code: 'repo/missing' });
      const current = snap.data();
      if (expectedVersion != null && (current.version ?? 1) !== expectedVersion) {
        throw new ConflictError({ id, ...current });
      }
      tx.update(ref, {
        ...patch,
        updatedAt: this.serverTime,
        version: (current.version ?? 1) + 1,
      });
    });
  }

  async purge(name, id) {
    await this.fs.deleteDoc(this.ref(name, id));
  }

  /**
   * The highest generated SKU sequence for a year — one indexed query over
   * the six-digit range, newest first, once per session (the caller caches
   * it). The first result that parses as a generated SKU is the highest.
   */
  async maxGeneratedSkuSequence(year) {
    const prefix = generatedSkuPrefix(year);
    const snapshot = await this.fs.getDocs(this.fs.query(
      this.col('items'),
      this.fs.where('sku', '>=', `${prefix}000000`),
      this.fs.where('sku', '<=', `${prefix}999999`),
      this.fs.orderBy('sku', 'desc'),
      this.fs.limit(20),
    ));
    for (const doc of snapshot.docs) {
      const parsed = parseGeneratedSku(doc.data().sku);
      if (parsed && parsed.year === year) return parsed.sequence;
    }
    return 0;
  }

  /** One document by id — answered by the server whether or not any listener
   *  on this device happens to hold it. */
  async get(name, id) {
    const snap = await this.fs.getDoc(this.ref(name, id));
    return snap.exists() ? { id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } : null;
  }

  async getMany(name, ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += KEYED_BATCH) {
      const rows = await Promise.all(ids.slice(i, i + KEYED_BATCH).map((id) => this.get(name, id)));
      out.push(...rows.filter(Boolean));
    }
    return out;
  }

  async existingIds(name, ids) {
    const rows = await this.getMany(name, ids);
    return new Set(rows.map((row) => row.id));
  }

  async appendLog(entry) {
    const ref = this.fs.doc(this.col('activityLogs'));
    await this.fs.setDoc(ref, { ...entry, timestamp: this.serverTime });
  }

  /**
   * Records referencing one taxonomy row. A `where` query is answered by the
   * index on the server, so the result costs the number of matches rather than
   * the size of the collection, and — the point of it — it is complete whether
   * or not this device has loaded the whole inventory.
   */
  async findItemsByField(field, value) {
    if (value == null) return [];
    const rows = [];
    let cursor = null;
    for (;;) {
      const parts = [this.fs.where(field, '==', value), this.fs.orderBy(this.fs.documentId())];
      if (cursor) parts.push(this.fs.startAfter(cursor));
      parts.push(this.fs.limit(SCAN_PAGE));
      const snapshot = await this.fs.getDocs(this.fs.query(this.col('items'), ...parts));
      if (snapshot.empty) return rows;
      for (const doc of snapshot.docs) rows.push({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) });
      if (snapshot.docs.length < SCAN_PAGE) return rows;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }

  /**
   * Records carrying any of these SKUs. Firestore answers an `in` query of up
   * to 30 values from its index; the groups run a few at a time rather than
   * all at once, so five hundred SKUs are seventeen bounded queries, never
   * five hundred simultaneous reads and never the collection.
   */
  async findItemsBySkus(skus) {
    const groups = [];
    for (let i = 0; i < skus.length; i += FIRESTORE_IN_LIMIT) groups.push(skus.slice(i, i + FIRESTORE_IN_LIMIT));
    const out = new Map();
    for (let i = 0; i < groups.length; i += SKU_QUERY_CONCURRENCY) {
      const snapshots = await Promise.all(groups.slice(i, i + SKU_QUERY_CONCURRENCY).map((group) =>
        this.fs.getDocs(this.fs.query(this.col('items'), this.fs.where('sku', 'in', group)))));
      for (const snapshot of snapshots) {
        for (const doc of snapshot.docs) {
          const row = { id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) };
          if (!out.has(row.sku)) out.set(row.sku, []);
          out.get(row.sku).push(row);
        }
      }
    }
    return out;
  }

  /** The ids an import wrote. The server answers from its index, so the cost is
   *  the size of the import rather than the size of the collection. */
  async importedItemIds(importJobId, limit = SCAN_PAGE) {
    if (!importJobId) return [];
    const snapshot = await this.fs.getDocs(this.fs.query(
      this.col('items'),
      this.fs.where('importJobId', '==', importJobId),
      this.fs.orderBy(this.fs.documentId()),
      this.fs.limit(limit),
    ));
    return snapshot.docs.map((doc) => doc.id);
  }

  /** The first record carrying this identifier, for a uniqueness check. */
  async findItemByUnique(field, value) {
    if (!value) return null;
    const snapshot = await this.fs.getDocs(
      this.fs.query(this.col('items'), this.fs.where(field, '==', value), this.fs.limit(1)),
    );
    const doc = snapshot.docs[0];
    return doc ? { id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) } : null;
  }

  /**
   * How many records reference a value, counted on the server. This is what a
   * confirmation dialog needs: "312 items will return to the inventory" has to
   * be the real number, not the number this device happens to have loaded.
   */
  async countItemsByField(field, value) {
    if (value == null) return 0;
    const q = this.fs.query(this.col('items'), this.fs.where(field, '==', value));
    if (this.fs.getCountFromServer) {
      const snapshot = await this.fs.getCountFromServer(q);
      return snapshot.data().count;
    }
    return (await this.findItemsByField(field, value)).length;
  }

  /** Live records carrying a value — the Trash excluded, counted on the server. */
  async countLiveItemsByField(field, value) {
    if (value == null) return 0;
    const q = this.fs.query(this.col('items'), this.fs.where(field, '==', value), this.fs.where('deletedAt', '==', null));
    if (this.fs.getCountFromServer) return (await this.fs.getCountFromServer(q)).data().count;
    const snapshot = await this.fs.getDocs(q);
    return snapshot.size;
  }

  /** How many records exist, live and trashed, counted on the server. */
  async countItems() {
    if (!this.fs.getCountFromServer) return null;
    const [all, trashed] = await Promise.all([
      this.fs.getCountFromServer(this.fs.query(this.col('items'))),
      this.fs.getCountFromServer(this.fs.query(this.col('items'), this.fs.where('deletedAt', '!=', null))),
    ]);
    const total = all.data().count;
    const gone = trashed.data().count;
    return { total, live: total - gone, trashed: gone };
  }

  /**
   * A batch, with an optional version check.
   *
   * A write batch cannot read, so a batch carrying `expectedVersion` runs as a
   * transaction instead: Firestore re-reads each document inside it and retries
   * the whole thing if anything moved underneath. That caps the chunk at what
   * one transaction may touch, which is why the caller chunks rather than
   * handing over a thousand operations at once.
   */
  /**
   * @returns {Promise<{applied: number, skippedExisting: string[]}>}
   *   `skippedExisting` names every `ifAbsent` write that found its document
   *   already there and so wrote nothing — the same contract as the device
   *   backend.
   */
  async runBatch(operations, { liveLimit = null } = {}) {
    // Anything whose correctness depends on what is stored *at commit time*
    // runs as a transaction. That includes `ifAbsent`: a write batch cannot
    // read, and `set(..., {merge: false})` on a document another device
    // created a moment ago replaces it. The existence query a merge runs
    // beforehand is for counting and for the screen; this is the guarantee.
    const guarded = operations.some((op) => op.expectedVersion != null || op.bumpVersion || op.ifAbsent);
    if (liveLimit != null) await this._precheckCapacity(operations, liveLimit);
    if (guarded) return this._runGuardedBatch(operations);

    // Firestore caps a batch at 500 writes.
    for (let i = 0; i < operations.length; i += 450) {
      const batch = this.fs.writeBatch(this.db);
      for (const op of operations.slice(i, i + 450)) {
        const ref = this.ref(op.collection, op.id);
        if (op.type === 'set') {
          batch.set(ref, op.preserveUpdatedAt ? { ...op.data } : { ...op.data, updatedAt: this.serverTime }, { merge: op.merge !== false });
        } else if (op.type === 'delete') {
          batch.delete(ref);
        }
      }
      await batch.commit();
    }
    return { applied: operations.length, skippedExisting: [] };
  }

  /**
   * The cloud's capacity check, just before the commit.
   *
   * Counted on the server immediately beforehand, so a limit reached on
   * another device a minute ago is seen. It is not inside the transaction —
   * the usage counter is maintained server-side and a client transaction
   * cannot hold it — so two devices committing the last slot in the same
   * instant can both pass. Closing that needs enforcement in the backend,
   * which is deferred; see the note at `assertItemCapacity`.
   */
  async _precheckCapacity(operations, liveLimit) {
    const counts = await this.countItems();
    if (!counts) return;
    const items = operations.filter((op) => op.collection === 'items' && op.type === 'set' && !op.data?.deletedAt);
    const present = await this.existingIds('items', items.map((op) => op.id));
    const adds = items.filter((op) => !present.has(op.id)).length;
    if (counts.live + adds > liveLimit) {
      throw capacityError({ limit: liveLimit, used: counts.live, requested: adds });
    }
  }

  async _runGuardedBatch(operations) {
    let applied = 0;
    const skippedExisting = [];
    for (let i = 0; i < operations.length; i += 100) {
      const chunk = operations.slice(i, i + 100);
      // Collected per attempt: Firestore may run the function more than once.
      const result = await this.fs.runTransaction(this.db, async (tx) => {
        const attempt = { applied: 0, skipped: [] };
        const refs = chunk.map((op) => this.ref(op.collection, op.id));
        // Every read before any write: a Firestore transaction requires it.
        const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
        chunk.forEach((op, index) => {
          const ref = refs[index];
          const snap = snapshots[index];
          if (op.type === 'delete') { tx.delete(ref); attempt.applied += 1; return; }
          // Read inside the transaction, so a document created after any
          // earlier check is still seen here — and left exactly as it is.
          if (op.ifAbsent && snap.exists()) { attempt.skipped.push(op.id); return; }
          if (op.expectedVersion != null) {
            if (!snap.exists()) throw new AppError('error.repo/missing', { code: 'repo/missing' });
            const current = snap.data();
            if ((current.version ?? 1) !== op.expectedVersion) {
              throw new ConflictError({ id: op.id, ...current });
            }
          }
          const data = op.preserveUpdatedAt ? { ...op.data } : { ...op.data, updatedAt: this.serverTime };
          if (op.bumpVersion) data.version = ((snap.exists() ? snap.data().version : 0) ?? 0) + 1;
          tx.set(ref, data, { merge: op.merge !== false });
          attempt.applied += 1;
        });
        return attempt;
      });
      applied += result.applied;
      skippedExisting.push(...result.skipped);
    }
    return { applied, skippedExisting };
  }
}

// ── IndexedDB backend ──────────────────────────────────────────────────────
//
// Every read below is keyed, indexed or cursored. A device holding 20,000
// records must answer "which items are in this folder" and "is this SKU taken"
// at the cost of the answer, not the cost of the inventory — otherwise the
// relational operations that depend on them are correct only on small data,
// which is the same as being wrong.
export class LocalBackend {
  constructor() {
    this.watchers = new Map();
  }

  get serverTime() {
    return Date.now();
  }

  /** The newest `max` records, straight off the updatedAt index. */
  async _window(name, max) {
    const { rows } = await local.page(name, { index: 'updatedAt', direction: 'prev', limit: max });
    return rows;
  }

  /**
   * How many live records exist, without reading any of them. Trashed records
   * carry a numeric `deletedAt` and so occupy the `deletedAt` index; live ones
   * carry null and are absent from it by IndexedDB's own rule, which makes the
   * subtraction exact. (A record migrated down from the cloud with a non-key
   * `deletedAt` would count as live; locally `deletedAt` is always a number.)
   */
  async _liveCount(name) {
    const [total, trashed] = await Promise.all([
      local.count(name),
      local.countByIndex(name, 'deletedAt', IDBKeyRange.lowerBound(0)),
    ]);
    return { total, live: total - trashed, trashed };
  }

  async _notify(name) {
    const watcher = this.watchers.get(name);
    if (!watcher) return;
    await watcher.refresh();
  }

  watch(name, onData, onError) {
    const refresh = () => local.getAll(name)
      .then((rows) => onData(rows, { fromCache: true, pending: false }))
      .catch(onError);
    this.watchers.set(name, { refresh });
    refresh();
    return () => this.watchers.delete(name);
  }

  watchActivity(onData, onError) {
    // Newest 60, off the timestamp index — the log grows without bound and
    // sorting all of it to show a screenful got more expensive every day.
    const refresh = () => local.page('activity', { index: 'timestamp', direction: 'prev', limit: 60 })
      .then(({ rows }) => onData(rows))
      .catch(onError);
    this.watchers.set('activity', { refresh });
    refresh();
    return () => this.watchers.delete('activity');
  }

  watchWindow(name, max, onData, onError) {
    // The same contract as the cloud backend, so one window exists in the app
    // rather than two shapes of truth. `complete` comes from a store count
    // rather than from the length of the window: a window of exactly `max`
    // rows is ambiguous otherwise, and a count costs nothing.
    const refresh = async () => {
      try {
        const [rows, counts] = await Promise.all([this._window(name, max), this._liveCount(name)]);
        onData(rows, {
          fromCache: true,
          pending: false,
          complete: counts.total <= max,
          liveTotal: counts.live,
        });
      } catch (error) {
        onError(error);
      }
    };
    this.watchers.set(name, { refresh });
    refresh();
    return () => this.watchers.delete(name);
  }

  async scanAll(name, { pageSize = SCAN_PAGE, onPage } = {}) {
    // Ordered by primary key and walked with a cursor: no full materialisation,
    // and no sort of 20,000 rows before the first page can be handed over.
    await local.scan(name, { pageSize, onPage });
  }

  async create(name, record, { liveLimit = null } = {}) {
    const row = { ...record, createdAt: record.createdAt || Date.now(), updatedAt: Date.now(), version: 1 };
    if (name !== 'items') {
      await local.put(name, row);
    } else {
      // Capacity, SKU and the write in one transaction: nothing can commit
      // between the checks and the put, and a refusal writes nothing.
      await local.transaction(name, 'readwrite', async (stores) => {
        const store = stores[name];
        if (liveLimit != null) await assertLiveRoom(store, liveLimit, 1);
        const before = (await local.request(store.get(row.id))) || null;
        await assertLiveSkusInStore(store, [{ id: row.id, before, after: row }]);
        await local.request(store.put(row));
      });
    }
    await this._notify(name);
  }

  /**
   * Optimistic concurrency, read and write inside one transaction. Reading the
   * current version in a separate transaction and writing in the next leaves a
   * window in which another tab can commit between the two, and the version
   * check then passes against a record that no longer exists as read.
   */
  async update(name, id, patch, expectedVersion, { liveLimit = null } = {}) {
    await local.transaction(name, 'readwrite', async (stores) => {
      const store = stores[name];
      const current = await local.request(store.get(id));
      if (!current) throw new AppError('error.repo/missing', { code: 'repo/missing' });
      if (expectedVersion != null && (current.version ?? 1) !== expectedVersion) {
        throw new ConflictError(current);
      }
      const next = { ...current, ...patch, updatedAt: Date.now(), version: (current.version ?? 1) + 1 };
      // A record coming back out of the Trash takes a live slot again.
      if (liveLimit != null && current.deletedAt && !next.deletedAt) {
        await assertLiveRoom(store, liveLimit, 1);
      }
      // An edit that changes the SKU, or a restore, claims it here — against
      // whatever another tab committed a moment ago. Leaving for the Trash
      // claims nothing.
      if (name === 'items') await assertLiveSkusInStore(store, [{ id, before: current, after: next }]);
      await local.request(store.put(next));
    });
    await this._notify(name);
  }

  async purge(name, id) {
    await local.remove(name, id);
    await this._notify(name);
  }

  /** The highest generated SKU sequence for a year, from the index. */
  async maxGeneratedSkuSequence(year) {
    return local.maxSkuSequence(year);
  }

  /** One record by primary key. Never a scan. */
  async get(name, id) {
    return (await local.get(name, id)) || null;
  }

  async getMany(name, ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += KEYED_BATCH) {
      out.push(...await local.getMany(name, ids.slice(i, i + KEYED_BATCH)));
    }
    return out;
  }

  async existingIds(name, ids) {
    const found = new Set();
    for (let i = 0; i < ids.length; i += KEYED_BATCH) {
      for (const id of await local.existingKeys(name, ids.slice(i, i + KEYED_BATCH))) found.add(id);
    }
    return found;
  }

  async appendLog(entry) {
    await local.put('activity', { id: uid('log'), ...entry, timestamp: Date.now() });
    await this._notify('activity');
  }

  /**
   * Remove activity older than the retention the plan grants.
   *
   * Deleted through the timestamp index, in place: the entries being removed
   * are the only ones touched, and the ones being kept are never read. The log
   * grows with every edit, so this is the difference between a device store
   * that settles and one that only ever gets larger.
   *
   * What retention affects is how long an event is kept, never what an event
   * is — the entries themselves stay structured.
   */
  async pruneActivity(cutoff) {
    if (!Number.isFinite(cutoff)) return 0;
    return local.deleteRange('activity', 'timestamp', IDBKeyRange.upperBound(cutoff, true));
  }

  /**
   * Every operation in one transaction. A folder deletion that reassigns 300
   * records and then removes the folder must not be able to half-happen: with
   * a loop of independent writes, a quota failure on record 200 left 200
   * records moved, 100 not, and the folder still there or already gone
   * depending on the order. Here the whole batch rolls back instead.
   */
  /**
   * Every operation in one transaction, with the version checked inside it.
   *
   * Two properties, and both need the transaction.
   *
   * Atomicity: a folder deletion that reassigns 300 records and then removes
   * the folder must not be able to half-happen. With a loop of independent
   * writes, a quota failure on record 200 left 200 moved, 100 not, and the
   * folder either still there or already gone depending on the order.
   *
   * Concurrency: an operation may carry `expectedVersion`, and the version it
   * is compared against is read here, inside the transaction, from the record
   * as stored. Comparing beforehand — against the copy the screen was holding
   * — leaves a window in which another tab commits between the check and the
   * write, and the check then passed against a record that no longer exists as
   * it was read. The new version is computed from the stored one for the same
   * reason: a stale screen's idea of "version 5" must not become version 6 on
   * top of somebody else's version 6.
   */
  /**
   * One transaction, in two phases: every record the batch touches is read
   * and every condition checked, then everything is written. A condition that
   * fails — a version that moved, a plan limit — fails before any write.
   *
   * @param {{liveLimit?: number|null}} [options] when set, the batch may not
   *   take the number of live records above it. Counted inside this same
   *   transaction, so two tabs cannot both take the last slot.
   * @returns {Promise<{applied: number, skippedExisting: string[]}>}
   */
  async runBatch(operations, { liveLimit = null } = {}) {
    if (!operations.length) return { applied: 0, skippedExisting: [] };
    const touched = [...new Set([...operations.map((op) => op.collection), ...(liveLimit != null ? ['items'] : [])])];
    const skippedExisting = [];
    let applied = 0;
    await local.transaction(touched, 'readwrite', async (stores) => {
      // ── phase one: read and check ──
      const plan = [];
      for (const op of operations) {
        const store = stores[op.collection];
        if (op.type === 'delete') {
          plan.push({ op, existing: op.collection === 'items' ? await local.request(store.get(op.id)) : null });
          continue;
        }
        if (op.type !== 'set') continue;
        // Items are always read: the SKU guard needs what each record was.
        const needsCurrent = op.merge !== false || op.expectedVersion != null || op.bumpVersion || op.ifAbsent
          || op.collection === 'items';
        const existing = needsCurrent ? await local.request(store.get(op.id)) : null;
        // A write that must never replace a record: read in this transaction,
        // so nothing can appear between the check and the put. A skipped
        // record claims nothing: its stored SKU is already its own.
        if (op.ifAbsent && existing) { skippedExisting.push(op.id); continue; }
        if (op.expectedVersion != null) {
          if (!existing) throw new AppError('error.repo/missing', { code: 'repo/missing' });
          if ((existing.version ?? 1) !== op.expectedVersion) throw new ConflictError(existing);
        }
        plan.push({ op, existing });
      }

      if (liveLimit != null) {
        // Records this batch brings to life: new ones, and trashed ones it
        // restores. A record already live, or a replayed one, costs nothing.
        let adds = 0;
        for (const { op, existing } of plan) {
          if (op.collection !== 'items' || op.type !== 'set') continue;
          const after = { ...(op.merge !== false ? existing : null), ...op.data };
          const wasLive = existing && !existing.deletedAt;
          if (!after.deletedAt && !wasLive) adds += 1;
        }
        if (adds) await assertLiveRoom(stores.items, liveLimit, adds);
      }

      if (stores.items) await assertLiveSkusInStore(stores.items, finalItemStates(plan));

      // ── phase two: write ──
      for (const { op, existing } of plan) {
        const store = stores[op.collection];
        if (op.type === 'delete') { await local.request(store.delete(op.id)); applied += 1; continue; }
        const record = {
          ...(op.merge !== false ? existing : null),
          ...op.data,
          id: op.id,
          // A migration that fills in a derived field is not an edit, and must
          // not make every record look as if it had just been changed.
          updatedAt: op.preserveUpdatedAt && existing?.updatedAt ? existing.updatedAt : Date.now(),
        };
        // The next version is the stored one plus one, never the caller's.
        if (op.bumpVersion) record.version = (existing?.version ?? 0) + 1;
        await local.request(store.put(record));
        applied += 1;
      }
    });
    for (const name of touched) await this._notify(name);
    return { applied, skippedExisting };
  }

  /**
   * Every operation in one transaction, validated before anything is written.
   *
   * Two phases, and the order is the point. Phase one reads every selected
   * record and checks every expected version. Phase two writes. Interleaving
   * them — read one, write one, read the next — means a conflict discovered on
   * record 143 arrives after records 1 to 142 have already been changed, and
   * the transaction's rollback is then the only thing standing between the
   * customer and a half-applied edit. It works, but it makes the guarantee
   * depend on the abort path rather than on the shape of the code.
   *
   * On any conflict the transaction aborts and nothing in it lands.
   */
  async runAtomicBatch(operations) {
    if (!operations.length) return { applied: 0 };
    const touched = [...new Set(operations.map((op) => op.collection))];

    await local.transaction(touched, 'readwrite', async (stores) => {
      // Phase one: read and validate. No writes yet.
      const current = [];
      for (const op of operations) {
        const store = stores[op.collection];
        const needsCurrent = op.collection === 'items'
          || (op.type === 'set' && (op.merge !== false || op.expectedVersion != null || op.bumpVersion));
        const existing = needsCurrent ? await local.request(store.get(op.id)) : null;

        if (op.expectedVersion != null) {
          if (!existing) throw new AppError('error.repo/missing', { code: 'repo/missing' });
          if ((existing.version ?? 1) !== op.expectedVersion) throw new ConflictError(existing);
        }
        current.push(existing);
      }

      // The final state of every item the batch touches, checked as a whole.
      if (stores.items) {
        await assertLiveSkusInStore(stores.items, finalItemStates(operations.map((op, index) => ({ op, existing: current[index] }))));
      }

      // Phase two: write. Every check has passed.
      for (const [index, op] of operations.entries()) {
        const store = stores[op.collection];
        if (op.type === 'delete') {
          await local.request(store.delete(op.id));
          continue;
        }
        if (op.type !== 'set') continue;
        const existing = current[index];
        const record = {
          ...(op.merge !== false ? existing : null),
          ...op.data,
          id: op.id,
          // A migration that fills in a derived field is not an edit, and must
          // not make every record look as if it had just been changed.
          updatedAt: op.preserveUpdatedAt && existing?.updatedAt ? existing.updatedAt : Date.now(),
        };
        if (op.bumpVersion) record.version = (existing?.version ?? 0) + 1;
        await local.request(store.put(record));
      }
    });

    for (const name of touched) await this._notify(name);
    return { applied: operations.length };
  }

  /**
   * Records referencing one taxonomy row, by index. This is the query the
   * relational deletions need: it is complete regardless of how much of the
   * inventory the app happens to have loaded, which a filter over the loaded
   * window can never be.
   */
  async findItemsByField(field, value) {
    if (value == null) return [];
    return local.getAllByIndex('items', field, value);
  }

  /** Records carrying any of these SKUs, from the `sku` index, in bounded
   *  batches. Map of SKU → the records (live and trashed) carrying it. */
  async findItemsBySkus(skus) {
    const out = new Map();
    for (let i = 0; i < skus.length; i += SKU_LOOKUP_BATCH) {
      const found = await local.getAllByIndexValues('items', 'sku', skus.slice(i, i + SKU_LOOKUP_BATCH));
      for (const [sku, rows] of found) if (rows.length) out.set(sku, rows);
    }
    return out;
  }

  /** The first record carrying this identifier, for a uniqueness check. */
  async findItemByUnique(field, value) {
    if (!value) return null;
    return local.firstByIndex('items', field, value);
  }

  async countItemsByField(field, value) {
    if (value == null) return 0;
    return local.countByIndex('items', field, value);
  }

  /** Every currency a live record holds a value in, from the currency index. */
  async currenciesPresent() {
    const candidates = await local.uniqueKeys('items', 'valuationCurrency');
    const present = [];
    for (const code of candidates) {
      const [all, trashed] = await Promise.all([
        local.countByIndex('items', 'valuationCurrency', code),
        local.countByIndex('items', 'currencyDeleted', IDBKeyRange.bound([code], [code, []])),
      ]);
      if (all - trashed > 0) present.push(code);
    }
    return present;
  }

  /** Live records only: every record carrying the value, less those in the
   *  Trash, which have an index of their own per scope (see local-store). */
  async countLiveItemsByField(field, value) {
    if (value == null) return 0;
    const trashIndex = TRASH_INDEX_BY_FIELD[field];
    const [all, trashed] = await Promise.all([
      local.countByIndex('items', field, value),
      trashIndex ? local.countByIndex('items', trashIndex, IDBKeyRange.bound([value], [value, []])) : 0,
    ]);
    return Math.max(0, all - trashed);
  }

  /**
   * The ids an import wrote, a page at a time, without reading the records.
   *
   * Cancelling an import of twenty thousand rows has to delete twenty thousand
   * records. Reading them to learn their ids would load the entire import into
   * memory in order to throw it away.
   */
  async importedItemIds(importJobId, limit) {
    if (!importJobId) return [];
    return local.keysByIndex('items', 'importJobId', importJobId, limit);
  }

  async countItems() {
    return this._liveCount('items');
  }
}

// ── Repository facade ──────────────────────────────────────────────────────
class Repository {
  constructor() {
    this.state = { items: [], folders: [], categories: [], locations: [], activity: [] };
    this.sync = { status: SyncState.LOADING, message: null, error: null };
    this.session = { userId: null, role: ROLES.OWNER, workspaceId: null, mode: 'local' };
    this.listeners = new Set();
    this.unsubscribers = [];
    this.backend = null;
    this.ready = false;
    this._taxonomyCounts = null;

    // `state.items` is composed from two sources: the live window, and the
    // rest of the inventory once something has asked for all of it.
    // `itemsComplete` is the only honest answer to "is this the whole
    // inventory?" — every total, search and score is gated on it.
    this.itemsWindow = [];
    this.itemsRest = new Map();
    this.itemsWindowShort = false;
    this.itemsScanned = false;
    // Records fetched by id. Separate from the window on purpose: the window
    // is "the newest N", this is "the ones somebody just asked for", and
    // mixing them would turn a bounded window into an unbounded one.
    this.itemCache = new Map();
    this.itemsComplete = false;
    this.itemsTotal = null;
    this.itemsTotalFromBackend = false;
    this._completing = null;
    this._taxonomyCounts = null;
    // Those object URLs point at the previous workspace's blobs. Keeping them
    // pins that memory, and a cache keyed only by image id could otherwise
    // hand one workspace a URL created for another.
    releaseObjectUrls();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.ready) listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return { ...this.state, sync: this.sync, session: this.session };
  }

  emit() {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  setSync(status, extra = {}) {
    this.sync = { status, message: null, messageKey: null, error: null, ...extra };
    this.emit();
  }

  canWrite() {
    return roleAtLeast(this.session.role, ROLES.EDITOR);
  }

  assertCanWrite() {
    if (!this.canWrite()) {
      throw new AppError('error.repo/forbidden.viewer', { code: 'repo/forbidden' });
    }
  }

  assertCanAdmin() {
    if (!roleAtLeast(this.session.role, ROLES.ADMIN)) {
      throw new AppError('error.repo/forbidden.admin', { code: 'repo/forbidden' });
    }
  }

  // ── lifecycle ──
  async start({ mode, workspaceId, userId, role }) {
    this.stop();
    this.session = { mode, workspaceId, userId, role: role || ROLES.OWNER };
    this.backend = mode === 'cloud' ? new FirestoreBackend(workspaceId) : new LocalBackend();
    this.setSync(SyncState.LOADING);

    await new Promise((resolve) => {
      const pending = new Set(COLLECTIONS);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve();
      };
      // Listeners normally deliver a first snapshot (from cache if offline)
      // immediately. If one never does, open the app anyway — late snapshots
      // still flow in through the same handler.
      const guard = setTimeout(() => {
        if (done) return;
        console.error('[repo] first snapshot did not arrive for', [...pending]);
        finish();
      }, 10_000);

      const settle = (name) => {
        pending.delete(name);
        if (!pending.size) finish();
      };

      for (const name of COLLECTIONS) {
        const onRows = (rows, meta) => {
          if (name === 'items') {
            // Something wrote an item. A fetched copy may now be stale, and a
            // stale copy is exactly what a mutation must never start from.
            this.itemCache.clear();
            this.itemsWindow = this._normalizeRows('items', rows);
            // A window that came back short *is* the whole collection — but
            // only for as long as it stays short. It is re-read on every
            // snapshot, never latched.
            this.itemsWindowShort = meta.complete === true;
            if (this.itemsWindowShort) this.itemsRest = new Map();
            // A device-only backend can count its own records exactly, which
            // is the same fact the cloud's usage counter supplies. Taking it
            // here means "the newest 200 of 6,400" is true on both backends —
            // and it is marked as coming from the backend, so the plan's usage
            // counter (which counts cloud records, and is nought on a device)
            // cannot overwrite a number the store just counted.
            if (typeof meta.liveTotal === 'number') {
              this.itemsTotal = meta.liveTotal;
              this.itemsTotalFromBackend = true;
            }
            this._composeItems();
          } else {
            this.state[name] = this._normalizeRows(name, rows);
          }
          this.ready = true;
          if (mode === 'local') this.setSync(SyncState.LOCAL);
          else if (meta.pending) this.setSync(SyncState.SAVING);
          else if (meta.fromCache && !navigator.onLine) this.setSync(SyncState.OFFLINE);
          else this.setSync(SyncState.SYNCED);
          settle(name);
        };
        const onFailure = (error) => {
          console.error(`[repo] listener failed for ${name}`, error);
          this.setSync(SyncState.ERROR, { error, messageKey: this._listenerMessage(error) });
          settle(name);
        };
        const unsubscribe = name === 'items'
          ? this.backend.watchWindow('items', ITEM_WINDOW, onRows, onFailure)
          : this.backend.watch(name, onRows, onFailure);
        this.unsubscribers.push(unsubscribe);
      }

      this.unsubscribers.push(this.backend.watchActivity(
        (rows) => { this.state.activity = rows; this.emit(); },
        (error) => console.error('[repo] activity listener failed', error),
      ));
    });

    await this._seedDefaults();
    await this.migrateTaxonomy();
    this.ready = true;
    this.emit();
  }

  _listenerMessage(error) {
    if (error?.code === 'permission-denied') return 'sync.permissionDenied';
    return 'sync.error';
  }

  _normalizeRows(name, rows) {
    switch (name) {
      case 'items': return rows.map((r) => normalizeItem(r));
      case 'folders': return rows.map((r) => normalizeFolder(r));
      case 'categories': return rows.map((r) => normalizeCategory(r));
      case 'locations': return rows.map((r) => normalizeLocation(r));
      default: return rows;
    }
  }

  /**
   * First run in an empty workspace gets the default locations, nothing else.
   * Classification needs no seed: the built-in library lives in the bundle
   * (src/taxonomy.js), and a new inventory starts with all of it available.
   */
  async _seedDefaults() {
    if (!this.canWrite()) return;
    if (this.state.categories.length || this.state.locations.length || this.state.items.length) return;
    try {
      await this.backend.runBatch([
        ...DEFAULT_LOCATIONS.map((l) => ({ type: 'set', collection: 'locations', id: l.id, data: normalizeLocation(l) })),
      ]);
    } catch (error) {
      console.error('[repo] seeding defaults failed', error);
    }
  }

  stop() {
    for (const unsubscribe of this.unsubscribers) {
      try { unsubscribe?.(); } catch (error) { console.error('[repo] unsubscribe failed', error); }
    }
    this.unsubscribers = [];
    this.ready = false;
    // A new workspace starts from nothing loaded — never from the last one's
    // records, and never from its "this is complete" answer.
    this.itemsWindow = [];
    this.itemsRest = new Map();
    this.itemsWindowShort = false;
    this.itemsScanned = false;
    this.itemCache.clear();
    this.itemsComplete = false;
    this.itemsTotal = null;
    this.itemsTotalFromBackend = false;
    this._completing = null;
    this._invalidateAggregates();
    // Those object URLs point at the previous workspace's blobs. Keeping them
    // pins that memory, and a cache keyed only by image id could otherwise
    // hand one workspace a URL created for another.
    releaseObjectUrls();
  }

  // ── how much of the inventory is loaded ──

  /** state.items = the live window, plus whatever the scan found beyond it. */
  /** Every figure derived from the whole inventory rather than from the
   *  window — live taxonomy counts, the currencies present — is dropped
   *  whenever an item is written, and recomputed from the store on next use. */
  _invalidateAggregates() {
    this._taxonomyCounts = null;
    this._currencies = null;
  }

  _composeItems() {
    this._invalidateAggregates();
    const live = new Set(this.itemsWindow.map((i) => i.id));
    const rest = [];
    for (const [id, row] of this.itemsRest) if (!live.has(id)) rest.push(row);
    this.state.items = [...this.itemsWindow, ...rest];
    this._recomputeCompleteness();
  }

  /**
   * Two things can prove the app holds the whole inventory: a window that came
   * back shorter than its limit, or a scan that read every page. Either can go
   * stale — records added since, from another device, land outside both — so
   * the server's own count has the last word where there is one. That counter
   * counts live records, so that is what is compared against it.
   */
  _recomputeCompleteness() {
    let complete = this.itemsWindowShort || this.itemsScanned;
    if (complete && this.itemsTotal != null) {
      const loadedLive = this.state.items.reduce((n, i) => n + (i.deletedAt ? 0 : 1), 0);
      if (loadedLive < this.itemsTotal) {
        complete = false;
        this.itemsScanned = false;
      }
    }
    this.itemsComplete = complete;
  }

  /** How many records the app is holding, against how many exist if known. */
  loadState() {
    return {
      loaded: this.state.items.length,
      total: this.itemsComplete
        ? this.state.items.reduce((n, i) => n + (i.deletedAt ? 0 : 1), 0)
        : this.itemsTotal,
      complete: this.itemsComplete,
    };
  }

  /**
   * The server-side record count, when the backend maintains one. It lets the
   * app say "the newest 200 of 6,400" instead of "the newest 200 of ?".
   */
  setKnownTotal(total) {
    if (typeof total !== 'number' || !Number.isFinite(total)) return;
    // The backend's own count wins where there is one. On a device-only
    // session the plan's usage counter describes a cloud workspace that does
    // not exist, and it reads nought — which turned an exact "the newest 200
    // of 20,000" into "the newest 200 of 0".
    if (this.itemsTotalFromBackend) return;
    this.itemsTotal = total;
    this._recomputeCompleteness();
  }

  /**
   * Load the rest of the inventory. Idempotent, and concurrent callers share
   * one pass. On failure `itemsComplete` stays false: a partial set is never
   * presented as a whole one.
   */
  async completeItems({ onProgress } = {}) {
    if (this.itemsComplete) return this.state.items;
    if (this._completing) return this._completing;
    this._completing = (async () => {
      const rest = new Map();
      let seen = 0;
      await this.backend.scanAll('items', {
        onPage: (rows) => {
          for (const row of rows) rest.set(row.id, normalizeItem(row));
          seen += rows.length;
          onProgress?.(seen);
        },
      });
      this.itemsRest = rest;
      this.itemsScanned = true;
      this._composeItems();
      this.emit();
      return this.state.items;
    })();
    try {
      return await this._completing;
    } finally {
      this._completing = null;
    }
  }

  // ── lookups ──
  //
  // THE HOME SCREEN IS A WINDOW, NOT THE DATABASE. `state.items` holds the
  // newest few hundred records (and everything, only after an explicit
  // full-data operation). A record found by a search, a filter or a scan can
  // be anywhere in the store, so:
  //
  //   item(id)           synchronous; what is in memory right now — the window
  //                      or the small fetch cache. Null means "not held", never
  //                      "does not exist". For display only.
  //   getItem(id)        authoritative; memory first, then the store by primary
  //                      key. Null means the store has no such record.
  //   getItems(ids)      the same for a selection, in bounded keyed batches.
  //
  // A mutation always starts from `{ fresh: true }`: a query row or a card is
  // a display snapshot, not a mutation source.

  item(id) {
    return this.state.items.find((i) => i.id === id) || this.itemCache.get(id) || null;
  }

  _cacheItem(item) {
    if (!item) return;
    this.itemCache.delete(item.id);
    this.itemCache.set(item.id, item);
    while (this.itemCache.size > ITEM_CACHE_MAX) {
      this.itemCache.delete(this.itemCache.keys().next().value);
    }
  }

  _forgetItem(id) {
    this.itemCache.delete(id);
  }

  /**
   * @param {string} id
   * @param {{fresh?: boolean}} [options] fresh skips memory and reads the store
   * @returns {Promise<object|null>} null only when the store has no such record
   * @throws {AppError} `item/load-failed` when the store could not be read —
   *   which is not the same thing as the record not existing
   */
  async getItem(id, { fresh = false } = {}) {
    if (!id) return null;
    if (!fresh) {
      const held = this.item(id);
      if (held) return held;
    }
    let row;
    try {
      row = await this.backend.get('items', id);
    } catch (error) {
      throw new AppError('error.item/load-failed', { code: 'item/load-failed', cause: error });
    }
    if (!row) { this._forgetItem(id); return null; }
    const item = normalizeItem(row);
    this._cacheItem(item);
    return item;
  }

  /**
   * @returns {Promise<{items: object[], missing: string[]}>} `items` in the
   *   order asked for; `missing` names every id the store does not hold, so a
   *   caller can say so rather than quietly acting on fewer.
   */
  async getItems(ids, { fresh = false } = {}) {
    const wanted = [...new Set(ids.filter(Boolean))];
    const found = new Map();
    const toFetch = [];
    for (const id of wanted) {
      const held = fresh ? null : this.item(id);
      if (held) found.set(id, held); else toFetch.push(id);
    }
    if (toFetch.length) {
      let rows;
      try {
        rows = await this.backend.getMany('items', toFetch);
      } catch (error) {
        throw new AppError('error.item/load-failed.many', { code: 'item/load-failed', cause: error });
      }
      for (const row of rows) {
        const item = normalizeItem(row);
        found.set(item.id, item);
        this._cacheItem(item);
      }
    }
    return {
      items: wanted.filter((id) => found.has(id)).map((id) => found.get(id)),
      missing: wanted.filter((id) => !found.has(id)),
    };
  }

  /**
   * Every currency the live inventory holds a value in — the whole store, not
   * the window. Cached until the next item write.
   *
   * @returns {Promise<string[]|null>} null when the backend cannot say without
   *   reading everything, which the caller treats as "not known", not "none".
   */
  currenciesPresent() {
    if (this._currencies) return this._currencies;
    if (this.backend?.currenciesPresent) {
      this._currencies = this.backend.currenciesPresent().catch((error) => {
        console.error('[repo] currencies unavailable', error);
        this._currencies = null;
        return null;
      });
    } else {
      this._currencies = Promise.resolve(
        this.itemsComplete ? currenciesInItems(this.liveItems()) : null,
      );
    }
    return this._currencies;
  }

  /** The item a mutation starts from: read now, from the store. */
  async _current(id) {
    const item = await this.getItem(id, { fresh: true });
    if (!item) throw new AppError('error.item/not-found', { code: 'item/not-found' });
    return item;
  }
  folder(id) { return id ? this.state.folders.find((f) => f.id === id) || null : null; }
  /**
   * The classification hierarchy: the built-in library merged with what this
   * inventory stored. Rebuilt only when the stored nodes change.
   */
  taxonomy() {
    if (this._taxonomySource !== this.state.categories) {
      this._taxonomySource = this.state.categories;
      this._taxonomy = buildTaxonomy(this.state.categories);
    }
    return this._taxonomy;
  }

  /**
   * A node for display: `name` is its label in the current language. Any
   * level — a Main Category, a Category or a Subcategory. An id that names
   * nothing any more reads as a deleted category rather than disappearing.
   */
  category(id) {
    if (!id || id === UNCATEGORIZED_ID) {
      return { id: UNCATEGORIZED_ID, name: t('category.uncategorized'), icon: '📦', resolved: true };
    }
    const taxonomy = this.taxonomy();
    const node = taxonomy.resolve(id);
    if (!node) return { id, name: t('category.deleted'), icon: '❓', resolved: true };
    return { id: node.id, name: taxonomy.label(node), icon: taxonomy.icon(node), level: node.level, resolved: true };
  }

  /** The classification of a record, resolved (see Taxonomy.path). */
  classification(item) {
    return this.taxonomy().path(item);
  }

  /**
   * What a list card shows for a record: its Category — or its Main Category
   * when that is all it has — with that node's icon, and the full path.
   */
  classificationDisplay(item) {
    const taxonomy = this.taxonomy();
    const { main, category, sub } = taxonomy.path(item);
    const primary = category || main;
    if (!primary) {
      // A reference to something that no longer exists reads as such.
      const dangling = item?.categoryId && item.categoryId !== UNCATEGORIZED_ID;
      return {
        id: dangling ? item.categoryId : UNCATEGORIZED_ID,
        name: t(dangling ? 'category.deleted' : 'category.uncategorized'),
        icon: dangling ? '❓' : '📦',
        path: '',
        main: null, category: null, sub: null,
        resolved: true,
      };
    }
    return {
      id: primary.id,
      name: taxonomy.label(primary),
      icon: taxonomy.icon(primary),
      path: [main, category, sub].filter(Boolean).map((node) => taxonomy.label(node)).join(' › '),
      main, category, sub,
      resolved: true,
    };
  }
  location(id) { return id ? this.state.locations.find((l) => l.id === id) || null : null; }

  liveItems() { return this.state.items.filter((i) => !i.deletedAt); }
  trashedItems() { return this.state.items.filter((i) => i.deletedAt); }

  lookups() {
    return {
      category: (id) => this.category(id),
      classificationWords: (item) => this.taxonomy().searchWords(item),
      folder: (id) => this.folder(id),
      location: (id) => this.location(id),
    };
  }

  // ── SKU ──
  static formatSku(sequence, year = new Date().getFullYear()) {
    return formatGeneratedSku(sequence, year);
  }

  /**
   * A best guess for the form field, computed from what this device has
   * loaded. It is only a placeholder — two devices can produce the same one.
   */
  provisionalSku() {
    return Repository.formatSku(this._provisionalSequence());
  }

  // ── generated SKU sequence ──
  //
  // Generated SKUs are `INV-<year>-<sequence>`. The rules:
  //
  //   · the sequence is per year — 2027 starts again at 000001 — because the
  //     year is in the code and a 2027 SKU numbered after 2026's last one
  //     reads as a mistake. The counter key is per year to match.
  //   · the counter holds the LAST sequence handed out, and is advanced in
  //     the same transaction that reads it. reserveSku() never returns a
  //     number the counter has not already moved to.
  //   · the counter never falls behind the SKUs that exist. Records arrive
  //     from imports, merges and restores carrying generated SKUs the counter
  //     never issued, so each reservation takes the larger of the counter and
  //     the highest generated SKU on record (the "floor", read from the SKU
  //     index and cached until the next bulk write).
  //   · a customer's own SKU (WATCH-001) is never part of this and never
  //     rewritten. What counts as generated is decided in one place, sku.js:
  //     exactly INV-<year>-<six digits>.
  //   · the old year-less counter is considered once, and only for a year
  //     that already has generated SKUs; see local-store `reserveSkuSequence`.

  static skuPrefix(year = new Date().getFullYear()) {
    return generatedSkuPrefix(year);
  }

  /** Forget the known floor: a bulk write may have brought higher SKUs in. */
  invalidateSkuFloor() {
    this._skuFloor = null;
  }

  /** The highest generated sequence on record for a year, from the index. */
  async _generatedSkuFloor(year) {
    if (this._skuFloor?.year === year && this._skuFloor.workspaceId === this.session.workspaceId) {
      return this._skuFloor.value;
    }
    const value = await this.backend.maxGeneratedSkuSequence(year);
    this._skuFloor = { year, workspaceId: this.session.workspaceId, value };
    return value;
  }

  /**
   * Takes the next SKU authoritatively: transactional on both backends, and
   * above every generated SKU already on record.
   */
  async reserveSku() {
    const year = new Date().getFullYear();
    const floor = await this._generatedSkuFloor(year);
    const sequence = this.session.mode !== 'cloud'
      ? await local.reserveSkuSequence(year, floor)
      : await this._reserveCloudSkuSequence(year, floor);
    // Keep the cached floor at what has now been issued, so the next
    // reservation in this session does not need to consult the index.
    if (this._skuFloor?.year === year) this._skuFloor.value = Math.max(this._skuFloor.value, sequence);
    return Repository.formatSku(sequence, year);
  }

  /**
   * A generated SKU no live record already carries. The floor makes a clash
   * all but impossible; this is the last check, bounded, for data the floor
   * could not see (a record written in another tab a moment ago).
   */
  async reserveUniqueSku() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sku = await this.reserveSku();
      if (!(await this.skuConflict(sku))) return sku;
      this.invalidateSkuFloor();
    }
    throw new AppError('error.repo/sku-unavailable', { code: 'repo/sku-unavailable' });
  }

  /**
   * The cloud side of `local.reserveSkuSequence`, with the same rules: one
   * counter per year (`counters/sku-<year>`), above the floor, and the old
   * year-less counter (`counters/sku`) considered once, ever.
   *
   * Once: the first reservation of any year that finds no year counter
   * creates `counters/sku-legacy-migration` in the same transaction; after
   * that the old counter is never read. Two devices racing the first
   * reservation conflict on those documents and one transaction retries.
   *
   * Counted toward a year only on evidence: the SKU it last handed out,
   * INV-<year>-<its value>, is on record. That is asked of the index before the
   * transaction (Firestore transactions cannot run queries) and applied only
   * if the old counter still holds the same value inside it. Without evidence
   * the data on record decides, so a counter left at 850 in 2026 does not
   * start 2027 at 000851 because 2027 already has imported generated SKUs.
   */
  async _reserveCloudSkuSequence(year, floor) {
    const { db, sdk } = firebaseContext();
    const counters = (id) => sdk.firestore.doc(db, 'workspaces', this.session.workspaceId, 'counters', id);
    const ref = counters(`sku-${year}`);
    const legacyRef = counters('sku');
    const markerRef = counters(LEGACY_SKU_MARKER);
    const exhausted = () => new AppError('error.repo/sku-exhausted', { code: 'repo/sku-exhausted' });

    // Contention between devices is the expected failure here, and it is
    // transient — so retry. What must never happen is falling back to a
    // locally guessed number, which is exactly how two devices collide.
    //
    // Contention does not always arrive as a contention error. Two devices
    // creating the year's counter at once: the second commit finds the
    // document there, the rules judge its write as an update that does not
    // move the counter forward, and it is refused as PERMISSION_DENIED. Seen
    // against the emulator (tests/rules/cloud-integrity.test.mjs); the retry
    // reads the counter afresh and succeeds, so the refusal is retried too.
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const evidence = await this._legacySkuEvidence(year, { yearRef: ref, legacyRef, markerRef });
        return await sdk.firestore.runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) {
            let last = 0;
            const marker = await tx.get(markerRef);
            if (!marker.exists()) {
              const legacy = await tx.get(legacyRef);
              const value = legacy.exists() ? Number(legacy.data().value) || 0 : 0;
              const applied = evidence != null && evidence === value;
              if (applied) last = value;
              tx.set(markerRef, { value, year, applied, migratedAt: sdk.firestore.serverTimestamp() });
            }
            const start = Math.max(last, floor) + 1;
            if (start > GENERATED_SKU_MAX) throw exhausted();
            tx.set(ref, { value: start, updatedAt: sdk.firestore.serverTimestamp() });
            return start;
          }
          const next = Math.max((snap.data().value ?? 0) + 1, floor + 1);
          if (next > GENERATED_SKU_MAX) throw exhausted();
          tx.update(ref, { value: next, updatedAt: sdk.firestore.serverTimestamp() });
          return next;
        });
      } catch (error) {
        // The year's sequence is used up: retrying cannot change that.
        if (error?.code === 'repo/sku-exhausted') throw error;
        lastError = error;
        console.error(`[repo] SKU reservation attempt ${attempt + 1} failed`, error);
        await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
      }
    }

    throw new AppError('error.repo/sku-unavailable.cloud', {
      code: 'repo/sku-unavailable',
      cause: lastError,
    });
  }

  /**
   * The old counter's value, if it is proven to have been counting `year`:
   * only asked when it could still matter (no year counter, no marker), and
   * proven by its last SKU being on record. Otherwise null.
   */
  async _legacySkuEvidence(year, { yearRef, legacyRef, markerRef }) {
    const { sdk } = firebaseContext();
    const [yearSnap, markerSnap] = await Promise.all([sdk.firestore.getDoc(yearRef), sdk.firestore.getDoc(markerRef)]);
    if (yearSnap.exists() || markerSnap.exists()) return null;
    const legacySnap = await sdk.firestore.getDoc(legacyRef);
    const value = legacySnap.exists() ? Number(legacySnap.data().value) || 0 : 0;
    if (!(value > 0) || value > GENERATED_SKU_MAX) return null;
    const rows = await this.backend.findItemsByField('sku', formatGeneratedSku(value, year));
    return rows.length ? value : null;
  }

  /** A placeholder only: what the window suggests. The saved SKU is reserved. */
  _provisionalSequence() {
    const year = new Date().getFullYear();
    let highest = 0;
    for (const item of this.state.items) {
      const parsed = parseGeneratedSku(item.sku);
      if (parsed && parsed.year === year && parsed.sequence > highest) highest = parsed.sequence;
    }
    return Math.min(highest + 1, GENERATED_SKU_MAX);
  }

  /**
   * Is this identifier already on another record? Asked of the index, not of
   * the loaded window.
   *
   * Scanning `state.items` made uniqueness a property of what happened to be on
   * screen: a workspace of 3,000 records would accept a barcode that a record
   * outside the newest 200 already carried, and the customer found out when two
   * different things scanned to the same item. Both checks now see every
   * record. A trashed record does not block the identifier — the customer
   * deleted it on purpose — so only live records count as a conflict.
   */
  async identifierConflict(field, value, exceptId) {
    if (!value) return null;
    const rows = await this.backend.findItemsByField(field, value);
    return rows.find((row) => row.id !== exceptId && !row.deletedAt) || null;
  }

  skuConflict(sku, exceptId) {
    return this.identifierConflict('sku', normalizeSku(sku), exceptId);
  }

  /**
   * The SKU prechecks (`skuConflict`, `findSkuConflicts`) are for the screen:
   * they let the customer see a conflict before pressing save. On the device
   * they are not the guarantee — the write transaction is (see
   * `assertLiveSkusInStore`), so a tab that passed the check a moment before
   * another tab committed the same SKU is still refused at its commit.
   *
   * The SKU conflicts of a set of records about to become live — the batched
   * form of `skuConflict`, with the same rules, for the paths that create
   * many records at once (spreadsheet import, JSON merge).
   *
   * The invariant: two live records never share a non-empty SKU. So an entry
   * conflicts when
   *   · another entry in the same set carries the same SKU
   *     (`incoming-duplicate`; every one of them is reported), or
   *   · a live record with a different id already carries it (`existing`).
   * A trashed record never blocks, and a record never conflicts with itself
   * (same id) — which is what lets a replayed import row, or a merge record
   * that is already present, pass.
   *
   * Values are compared after `normalizeSku`, exactly as the add/edit form and
   * the Trash restore compare them. Lookups go to the `sku` index in bounded
   * batches; the inventory is never loaded.
   *
   * @param {Array<{key: *, id?: string, sku?: string}>} entries  `key` is how
   *   the caller finds the entry again (a source line, an incoming id)
   * @returns {Promise<Array<{key, id, sku, type: 'incoming-duplicate'|'existing',
   *   groupKeys?: Array, existingId?: string, existingName?: string}>>}
   *   `groupKeys` is every entry's key carrying that SKU, this one included.
   */
  async findSkuConflicts(entries) {
    // A few hundred SKUs in a 50,000-row file: the loop is over the rows once,
    // the lookups over the distinct SKUs in batches.
    const bySku = new Map();
    for (const entry of entries) {
      const sku = normalizeSku(entry.sku);
      if (!sku) continue;
      if (!bySku.has(sku)) bySku.set(sku, []);
      bySku.get(sku).push(entry);
    }
    if (!bySku.size) return [];

    const conflicts = [];
    for (const [sku, group] of bySku) {
      if (group.length < 2) continue;
      // One array per SKU, shared by every entry carrying it — a file with
      // thousands of rows on one SKU must not build thousands of lists.
      const groupKeys = group.map((entry) => entry.key);
      for (const entry of group) {
        conflicts.push({ key: entry.key, id: entry.id ?? null, sku, type: 'incoming-duplicate', groupKeys });
      }
    }

    const found = await this.backend.findItemsBySkus([...bySku.keys()]);
    for (const [sku, rows] of found) {
      const live = rows.filter((row) => !row.deletedAt);
      if (!live.length) continue;
      for (const entry of bySku.get(sku) || []) {
        const other = live.find((row) => row.id !== entry.id);
        if (!other) continue;
        conflicts.push({
          key: entry.key, id: entry.id ?? null, sku, type: 'existing', existingId: other.id, existingName: other.name || '',
        });
      }
    }
    return conflicts;
  }

  barcodeConflict(barcode, exceptId) {
    return this.identifierConflict('barcode', barcode, exceptId);
  }

  // ── activity ──
  async log(action, details = {}) {
    try {
      await this.backend.appendLog({
        action,
        userId: this.session.userId || null,
        userName: this.session.userName || null,
        ...details,
      });
    } catch (error) {
      // A failed audit entry must never roll back the change it describes, but
      // it must be visible.
      console.error('[repo] activity log failed', error);
    }
  }

  /** Records only the fields that actually changed. */
  static diff(before, after, fields) {
    const changes = { before: {}, after: {} };
    for (const field of fields) {
      const a = JSON.stringify(before?.[field] ?? null);
      const b = JSON.stringify(after?.[field] ?? null);
      if (a !== b) {
        changes.before[field] = before?.[field] ?? null;
        changes.after[field] = after?.[field] ?? null;
      }
    }
    return Object.keys(changes.after).length ? changes : null;
  }

  // ── plan capacity ──
  //
  // A plan's record limit is a property of the data, not of a button. The
  // screens still ask early (`canAddItem`, the import preview) so the customer
  // hears it before filling a form in; every path that makes a record live
  // asks again at the write:
  //
  //   create · duplicate · restore from Trash · spreadsheet import · merge ·
  //   device-to-cloud upload
  //
  // Editing, moving and trashing are never refused for capacity. A full
  // backup restore is the one exception, on purpose: it puts back the
  // customer's own data whatever the plan now allows, and the workspace is
  // then simply over its limit until they trim it or upgrade.
  //
  // On the device the limit is checked inside the same transaction as the
  // write. In the cloud it is checked against a fresh server count just
  // before the commit; two devices taking the last slot in the same instant
  // can both pass until the backend enforces it, which is deferred.

  /** The live-record limit in force, or null when no plan limit applies. */
  _liveLimit() {
    const quota = quotaStatus();
    if (!quota || quota.limit == null || quota.limit < 0) return null;
    return quota.limit;
  }

  /**
   * Refuses, before any side effect, an operation that would add `requested`
   * live records past the plan.
   * @throws {AppError} `plan/item-limit` with `{limit, used, remaining, requested}`
   */
  async assertItemCapacity(requested) {
    const limit = this._liveLimit();
    if (limit == null || !(requested > 0)) return;
    const counts = await this.backend.countItems();
    const counted = counts?.live ?? 0;
    // On the device the store is the authority; in the cloud the server's
    // usage counter is, checked against a fresh count of its own.
    const used = this.session.mode === 'cloud' ? Math.max(quotaStatus()?.used ?? 0, counted) : counted;
    if (used + requested > limit) throw capacityError({ limit, used, requested });
  }

  // ── items ──
  async createItem(data) {
    this.assertCanWrite();
    const item = normalizeItem({ ...data, createdBy: this.session.userId, updatedBy: this.session.userId }, {
      userId: this.session.userId,
    });
    this._classifyNew(item);
    this.setSync(SyncState.SAVING);
    // Refused here, at the write, before the images are claimed or anything is
    // logged — not only when the form opened, which may have been before
    // another tab took the last slot.
    await this.backend.create('items', item, { liveLimit: this._liveLimit() });
    this._invalidateAggregates();
    // Claims the images this item uses. Until now they were unreferenced, which
    // is what lets an abandoned form be cleaned up automatically.
    await retainAll(this.session, item);
    await this.log(ACTIONS.ITEM_CREATED, { itemId: item.id, itemName: item.name });
    return item;
  }

  async updateItem(id, patch, expectedVersion) {
    this.assertCanWrite();
    const before = await this._current(id);
    patch = this._classificationPatch(before, patch);
    this.setSync(SyncState.SAVING);
    await this.backend.update('items', id, { ...patch, updatedBy: this.session.userId }, expectedVersion);

    // Images added or removed by this edit change what the media assets are
    // referenced by; the files themselves are reclaimed by the backend once
    // nothing points at them.
    if (patch.images) {
      await applyReferenceDelta(this.session, before, { ...before, ...patch });
    }

    const changes = Repository.diff(before, { ...before, ...patch }, [
      'name', 'sku', 'barcode', 'mainCategoryId', 'categoryId', 'subcategoryId', 'folderId', 'locationId',
      'quantity', 'unit', 'condition', 'brand', 'valuation', 'description',
      'images', 'primaryImageId', 'aiData', 'customFields',
    ]);
    await this.log(ACTIONS.ITEM_UPDATED, { itemId: id, itemName: patch.name ?? before?.name, changes });
  }

  /**
   * @param {number} [expectedVersion] the version the screen was showing. When
   *   given, a record changed since is a conflict; when not, the version just
   *   read is used.
   */
  async moveItem(id, folderId, expectedVersion) {
    this.assertCanWrite();
    const shown = this._shownVersions([id]).get(id);
    const before = await this._current(id);
    await this.backend.update('items', id, { folderId: folderId || null, updatedBy: this.session.userId },
      expectedVersion ?? shown ?? before.version);
    this._forgetItem(id);
    await this.log(ACTIONS.ITEM_MOVED, {
      itemId: id,
      itemName: before?.name,
      changes: { before: { folderId: before?.folderId ?? null }, after: { folderId: folderId || null } },
    });
  }

  /** Soft delete — the record moves to Trash and stays recoverable. */
  async deleteItem(id, expectedVersion) {
    this.assertCanWrite();
    const shown = this._shownVersions([id]).get(id);
    const item = await this._current(id);
    this.setSync(SyncState.SAVING);
    await this.backend.update('items', id, {
      deletedAt: this.backend.serverTime,
      deletedBy: this.session.userId,
    }, expectedVersion ?? shown ?? item.version);
    this._forgetItem(id);
    this._invalidateAggregates();
    await this.log(ACTIONS.ITEM_DELETED, { itemId: id, itemName: item.name });
  }

  /**
   * Out of the Trash and back into the inventory.
   *
   * A trashed record does not hold its SKU — the customer may have given the
   * same SKU to a new record since. Bringing the old one back would then put
   * two live records under one SKU, so that is checked first, before any
   * write and before the plan's capacity is asked: a conflict changes
   * nothing, consumes nothing and logs nothing. Barcodes and serial numbers
   * keep their existing, softer rule (a warning at save), and are not checked
   * here.
   *
   * @param {{newSku?: boolean}} [options] `newSku` gives a record whose
   *   generated SKU is now taken a freshly reserved one, in the same write.
   *   Only offered for generated SKUs; a customer's own is never changed
   *   without them editing it.
   * @throws {AppError} `item/sku-conflict` with `{sku, conflictId,
   *   conflictName, generated}`
   */
  async restoreItem(id, expectedVersion, { newSku = false } = {}) {
    this.assertCanWrite();
    const shown = this._shownVersions([id]).get(id);
    const item = await this._current(id);
    const patch = { deletedAt: null, deletedBy: null };
    if (item.deletedAt && item.sku) {
      const clash = await this.skuConflict(item.sku, id);
      if (clash) {
        const generated = Boolean(parseGeneratedSku(item.sku));
        if (!(newSku && generated)) {
          throw new AppError('error.item/sku-conflict', {
            code: 'item/sku-conflict', sku: item.sku, conflictId: clash.id, conflictName: clash.name, generated,
          });
        }
        // A counter number is spent only once the plan would take it back.
        if (item.deletedAt) await this.assertItemCapacity(1);
        patch.sku = await this.reserveUniqueSku();
      }
    }
    // Out of the Trash is back into the plan's count.
    await this.backend.update('items', id, patch,
      expectedVersion ?? shown ?? item.version, { liveLimit: item.deletedAt ? this._liveLimit() : null });
    this._forgetItem(id);
    this._invalidateAggregates();
    await this.log(ACTIONS.ITEM_RESTORED, {
      itemId: id, itemName: item.name, ...(patch.sku ? { changes: { before: { sku: item.sku }, after: { sku: patch.sku } } } : {}),
    });
    return { sku: patch.sku || item.sku };
  }

  /**
   * Permanent delete. The record is read from the store first, because its
   * image list is what says which media this purge releases — a purge that
   * did not know the images would delete the record and leak every file it
   * pointed at.
   */
  async purgeItem(id) {
    this.assertCanAdmin();
    const item = await this._current(id);
    await this.backend.purge('items', id);
    // Gone from the store; gone from every copy held here too, or it lingers
    // until the next reload.
    this.itemsRest.delete(id);
    this._forgetItem(id);
    this._composeItems();
    this._invalidateAggregates();
    // Releases this item's hold on its images. Any image another item still
    // references keeps a non-zero count and survives.
    await releaseAll(this.session, item);
    await this.log(ACTIONS.ITEM_PURGED, { itemId: id, itemName: item.name });
  }

  /**
   * Duplicates the record, not its history and not its bytes: the copy shares
   * the source's media assets and raises their reference count, so no file is
   * uploaded twice and neither item can delete a file the other still shows.
   */
  async duplicateItem(id) {
    this.assertCanWrite();
    const source = await this._current(id);
    // Asked before a SKU is reserved or anything is written; the create below
    // asks again inside its own write.
    await this.assertItemCapacity(1);
    const copy = normalizeItem({
      ...source,
      id: uid('itm'),
      sku: await this.reserveUniqueSku(),
      barcode: '', // barcodes identify a physical object; a copy has none yet
      name: t('item.copyName', { name: source.name }),
      createdAt: null,
      updatedAt: null,
      createdBy: this.session.userId,
      updatedBy: this.session.userId,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    }, { userId: this.session.userId });

    await this.backend.create('items', copy, { liveLimit: this._liveLimit() });
    this._invalidateAggregates();
    // Only a copy that exists claims its images.
    await retainAll(this.session, copy);
    await this.log(ACTIONS.ITEM_DUPLICATED, { itemId: copy.id, itemName: copy.name, sourceId: id });
    return copy;
  }

  // ── referential integrity ──
  //
  // A relational operation is defined by every record that references a row,
  // not by every record this device has loaded. Those two sets are the same
  // only on a small inventory, which is precisely the case that never fails in
  // testing. So the set comes from the backend's index, always.

  /**
   * Exact live-record counts for every taxonomy row, in one call — the Trash
   * excluded, so a folder's number is what opening it shows.
   *
   * The lists that show "N items" next to a folder or a category were counting
   * the loaded window, so a workspace with 6,000 records described its folders
   * by whichever 200 happened to be newest. These counts come from the index
   * instead. They are cached until the next item write, because the lists
   * re-render on every snapshot and the answer only changes when the data does.
   */
  taxonomyCounts() {
    if (this._taxonomyCounts) return this._taxonomyCounts;
    const rows = [
      ...this.state.folders.map((f) => ['folders', 'folderId', f.id]),
      ...this.state.categories.map((c) => ['categories', 'categoryId', c.id]),
      ...this.state.locations.map((l) => ['locations', 'locationId', l.id]),
    ];
    this._taxonomyCounts = Promise.all(
      // Live records: the numbers beside a folder or a category describe what
      // opening it shows, and the Trash is not in it.
      rows.map(async ([group, field, id]) => [group, id, await this.backend.countLiveItemsByField(field, id)]),
    ).then((results) => {
      const counts = { folders: new Map(), categories: new Map(), locations: new Map() };
      for (const [group, id, n] of results) counts[group].set(id, n);
      return counts;
    }).catch((error) => {
      // A count is a nicety; failing to get one must not blank the list.
      console.error('[repo] taxonomy counts unavailable', error);
      this._taxonomyCounts = null;
      return { folders: new Map(), categories: new Map(), locations: new Map() };
    });
    return this._taxonomyCounts;
  }

  /** Every record referencing `value` in `field`, trashed ones included —
   *  a record in the Trash still carries the reference, and leaving it behind
   *  is how a restored item comes back pointing at a folder that is gone. */
  async itemsReferencing(field, value) {
    if (value == null) return [];
    return this.backend.findItemsByField(field, value);
  }

  /**
   * Clear out activity the plan no longer promises to keep.
   *
   * Not on every write: an edit should not pay for a cleanup, and the log does
   * not become a problem in the seconds between two of them. Once a day, at
   * startup, is enough — and the last run is recorded so a customer who opens
   * the app ten times a day pays for it once.
   *
   * @param {number} retentionDays from the plan; a non-positive value means
   *   "keep everything", which is what an unlimited plan says.
   */
  async enforceActivityRetention(retentionDays, { now = Date.now(), minimumInterval = DAY } = {}) {
    if (!this.backend?.pruneActivity) return { pruned: 0, skipped: 'unsupported' };
    if (!(retentionDays > 0)) return { pruned: 0, skipped: 'unlimited' };

    try {
      const last = await local.getMeta(ACTIVITY_PRUNE_KEY, 0);
      if (now - last < minimumInterval) return { pruned: 0, skipped: 'recent' };

      const cutoff = now - retentionDays * DAY;
      const pruned = await this.backend.pruneActivity(cutoff);
      await local.setMeta(ACTIVITY_PRUNE_KEY, now);
      if (pruned) await this.backend._notify?.('activity');
      return { pruned, cutoff };
    } catch (error) {
      // Housekeeping. A failure here must not stop the app from opening.
      console.error('[repo] activity retention could not run', error);
      return { pruned: 0, error };
    }
  }

  /**
   * How many records exist — live, trashed and in total — asked of the
   * backend rather than counted from what is loaded. Null when the backend
   * cannot say, which the caller must present as "not known" rather than nought.
   */
  async recordCounts() {
    try {
      return (await this.backend.countItems?.()) || null;
    } catch (error) {
      console.error('[repo] record counts unavailable', error);
      return null;
    }
  }

  /** The same set's size, counted without reading the records. */
  async countItemsReferencing(field, value) {
    if (value == null) return 0;
    return this.backend.countItemsByField(field, value);
  }

  /**
   * Write operations that clear or redirect a reference. The version moves
   * with the record: an indirect change is still a change, and a device
   * holding the old copy has to see a conflict rather than overwrite this.
   */
  _clearReferenceOps(items, patch) {
    return items.map((item) => ({
      type: 'set',
      collection: 'items',
      id: item.id,
      merge: true,
      // The version moves with the record, computed inside the write from the
      // stored one — an indirect change is still a change, and a device
      // holding the old copy has to see a conflict rather than overwrite this.
      // No `expectedVersion`: the customer is removing a folder, not resolving
      // an edit conflict, and a record edited elsewhere still has to lose its
      // reference to a folder that is about to stop existing.
      bumpVersion: true,
      data: { ...patch, updatedBy: this.session.userId },
    }));
  }

  /**
   * Apply the same patch to whatever copies this device is holding. The window
   * re-reads itself from its listener, but records pulled in by an earlier
   * full scan live in `itemsRest` and nothing else would refresh them — they
   * would keep showing a folder that no longer exists.
   */
  _patchLoaded(items, patch) {
    if (!items.length) return;
    const ids = new Set(items.map((i) => i.id));
    let changed = false;
    for (const [id, row] of this.itemsRest) {
      if (!ids.has(id)) continue;
      this.itemsRest.set(id, { ...row, ...patch, version: (row.version ?? 1) + 1 });
      changed = true;
    }
    if (changed) {
      this._composeItems();
      this.emit();
    }
  }

  // ── folders ──
  async saveFolder(data) {
    this.assertCanWrite();
    const folder = normalizeFolder(data, { userId: this.session.userId });
    const existing = this.folder(folder.id);
    if (existing) {
      await this.backend.update('folders', folder.id, {
        name: folder.name, description: folder.description, icon: folder.icon, color: folder.color,
      }, existing.version);
      await this.log(ACTIONS.FOLDER_UPDATED, { folderId: folder.id, folderName: folder.name });
    } else {
      await this.backend.create('folders', folder);
      await this.log(ACTIONS.FOLDER_CREATED, { folderId: folder.id, folderName: folder.name });
    }
    return folder;
  }

  /** Items in a deleted folder return to the root inventory; the move is logged. */
  async deleteFolder(id) {
    this.assertCanWrite();
    const folder = this.folder(id);
    const affected = await this.itemsReferencing('folderId', id);
    await this._runRelational([
      ...this._clearReferenceOps(affected, { folderId: null }),
      { type: 'delete', collection: 'folders', id },
    ]);
    this._patchLoaded(affected, { folderId: null });
    await this.log(ACTIONS.FOLDER_DELETED, {
      folderId: id, folderName: folder?.name, movedToRoot: affected.length,
    });
    return affected.length;
  }

  // ── classification ──
  //
  // The hierarchy itself is read through `taxonomy()` (src/taxonomy.js). What
  // follows writes it: the customer's own nodes, the local settings of the
  // built-in ones (hidden, order, pinned, a preferred display name, fields
  // saved to them), and the records whose classification a change moves.
  // Every write validates the hierarchy here, not only in the picker.

  _storedNode(id) {
    return this.state.categories.find((c) => c.id === id) || null;
  }

  _taxonomyError(key) {
    return new AppError(key, { code: 'taxonomy/invalid' });
  }

  /**
   * A classification patch made canonical, or refused. Changing the Main
   * Category clears the Category and Subcategory beneath it unless the patch
   * says what they become; changing the Category clears the Subcategory. A
   * patch that leaves the classification as it was is not re-checked, so a
   * record whose Category was removed elsewhere can still be edited.
   */
  _classificationPatch(before, patch) {
    if (!CLASSIFICATION_FIELDS.some((field) => field in patch)) return patch;
    const was = {
      mainCategoryId: before?.mainCategoryId ?? null,
      categoryId: before?.categoryId || UNCATEGORIZED_ID,
      subcategoryId: before?.subcategoryId ?? null,
    };
    const next = { ...was };
    for (const field of CLASSIFICATION_FIELDS) if (field in patch) next[field] = patch[field] || null;
    if (!next.categoryId) next.categoryId = UNCATEGORIZED_ID;
    if ('categoryId' in patch && !('subcategoryId' in patch) && next.categoryId !== was.categoryId) next.subcategoryId = null;
    if ('categoryId' in patch && !('mainCategoryId' in patch) && next.categoryId !== UNCATEGORIZED_ID) next.mainCategoryId = null;
    if ('mainCategoryId' in patch && !('categoryId' in patch) && next.mainCategoryId !== was.mainCategoryId) {
      next.categoryId = UNCATEGORIZED_ID;
      next.subcategoryId = null;
    }
    if (CLASSIFICATION_FIELDS.every((field) => next[field] === was[field])) return { ...patch, ...next };
    const result = this.taxonomy().check(next);
    if (!result.ok) throw this._taxonomyError(result.error);
    return { ...patch, ...result.value };
  }

  /** A new record's classification, made canonical or refused. */
  _classifyNew(item) {
    const result = this.taxonomy().check(item);
    if (!result.ok) throw this._taxonomyError(result.error);
    Object.assign(item, result.value);
    return item;
  }

  /**
   * Creates the customer's own Main Category, Category or Subcategory.
   * @param {{level: string, parentId?: string, name: string, icon?: string}} data
   * @returns {Promise<string>} the new node's id
   */
  async createTaxonomyNode({ level, parentId = null, name, icon = null, id = null }) {
    this.assertCanWrite();
    const taxonomy = this.taxonomy();
    const label = normalizeCategory({ name }).name;
    if (!label) throw this._taxonomyError('taxonomy.error.nameRequired');
    if (![LEVELS.MAIN, LEVELS.CATEGORY, LEVELS.SUB].includes(level)) throw this._taxonomyError('taxonomy.error.unknown');
    if (level !== LEVELS.MAIN) {
      const parent = taxonomy.resolve(parentId);
      const wanted = level === LEVELS.CATEGORY ? LEVELS.MAIN : LEVELS.CATEGORY;
      if (!parent || parent.level !== wanted) throw this._taxonomyError('taxonomy.error.unknown');
      parentId = parent.id;
    } else {
      parentId = null;
    }
    if (taxonomy.duplicateOf(label, { level, parentId })) throw this._taxonomyError('taxonomy.error.duplicate');
    if (taxonomy.customNodes().length >= TAXONOMY_LIMITS.customNodes) throw this._taxonomyError('taxonomy.error.limit');

    const record = normalizeCategory({
      // A caller may fix the id in advance — an import that must land on the
      // same node if it is resumed.
      id: id || uid('cat'), name: label, icon: icon || undefined, level, parentId,
      source: 'custom', taxonomyVersion: TAXONOMY_SCHEMA_VERSION,
    });
    if (!icon) delete record.icon;
    await this.backend.create('categories', record);
    await this.log(ACTIONS.CATEGORY_CREATED, { categoryId: record.id, categoryName: record.name });
    return record.id;
  }

  /**
   * Writes settings onto a node. A built-in node gets (or updates) the record
   * that holds its local settings; the built-in definition is never changed.
   */
  async _patchNode(id, patch) {
    const taxonomy = this.taxonomy();
    const node = taxonomy.node(id);
    if (!node) throw this._taxonomyError('taxonomy.error.unknown');
    const existing = this._storedNode(id);
    if (existing) {
      await this.backend.update('categories', id, patch, existing.version);
    } else {
      await this.backend.create('categories', {
        ...normalizeCategory({ id, name: '', source: 'builtin' }), ...patch, source: 'builtin',
      });
    }
  }

  /**
   * Renames a node. The customer's own node takes the name; a built-in one
   * keeps its definition and shows the name as a local display name. An empty
   * name on a built-in node goes back to the built-in label.
   */
  async renameTaxonomyNode(id, name) {
    this.assertCanWrite();
    const taxonomy = this.taxonomy();
    const node = taxonomy.node(id);
    if (!node) throw this._taxonomyError('taxonomy.error.unknown');
    const label = normalizeCategory({ name }).name;
    if (!label && node.source === 'custom') throw this._taxonomyError('taxonomy.error.nameRequired');
    if (label && taxonomy.duplicateOf(label, { level: node.level, parentId: node.parentId, exceptId: id })) {
      throw this._taxonomyError('taxonomy.error.duplicate');
    }
    const value = node.source === 'builtin' && label === taxonomy.defaultLabel(node) ? '' : label;
    await this._patchNode(id, { name: value });
    await this.log(ACTIONS.CATEGORY_UPDATED, { categoryId: id, categoryName: value || taxonomy.label(node) });
  }

  async setTaxonomyNodeHidden(id, hidden) {
    this.assertCanWrite();
    await this._patchNode(id, { hidden: Boolean(hidden) });
  }

  async setTaxonomyNodePinned(id, pinned) {
    this.assertCanWrite();
    await this._patchNode(id, { pinned: Boolean(pinned) });
  }

  /** The customer's order for one level of the hierarchy, by id. */
  async reorderTaxonomyNodes(orderedIds) {
    this.assertCanWrite();
    const taxonomy = this.taxonomy();
    const operations = [];
    orderedIds.forEach((id, order) => {
      const node = taxonomy.node(id);
      if (!node) return;
      const existing = this._storedNode(id);
      operations.push({
        type: 'set', collection: 'categories', id, merge: true,
        data: existing ? { order } : { ...normalizeCategory({ id, name: '', source: 'builtin' }), source: 'builtin', order },
      });
    });
    if (operations.length) await this._runRelational(operations);
  }

  /** Field definitions the customer saves to a node, for every record under it. */
  async saveTaxonomyNodeFields(id, fields) {
    this.assertCanWrite();
    const clean = normalizeCategory({ id, fields }).fields || [];
    if (Array.isArray(fields) && fields.length > TAXONOMY_LIMITS.fieldsPerTemplate) throw this._taxonomyError('taxonomy.error.limit');
    await this._patchNode(id, { fields: clean });
  }

  /** The records field holding a node of this level. */
  _levelField(level) {
    return { [LEVELS.MAIN]: 'mainCategoryId', [LEVELS.CATEGORY]: 'categoryId', [LEVELS.SUB]: 'subcategoryId' }[level];
  }

  /**
   * How many records reference this node — asked of the backend, so the
   * number in the dialog is the number a deletion or merge will rewrite.
   */
  taxonomyNodeUsage(id) {
    const node = this.taxonomy().node(id);
    if (!node) return Promise.resolve(0);
    return this.countItemsReferencing(this._levelField(node.level), id);
  }

  /** Kept for callers of the flat model: the records in one Category. */
  categoryUsage(id) {
    return this.taxonomyNodeUsage(id);
  }

  /**
   * Kept for callers of the flat model: an existing node is renamed, a new one
   * is created as a Category (under «أخرى» unless a Main Category is given).
   */
  async saveCategory(data) {
    this.assertCanWrite();
    if (data?.id && this.taxonomy().node(data.id)) {
      await this.renameTaxonomyNode(data.id, data.name);
      return this.taxonomy().node(data.id);
    }
    const id = await this.createTaxonomyNode({
      level: data?.level || LEVELS.CATEGORY,
      parentId: data?.parentId || OTHER_MAIN_ID,
      name: data?.name,
      icon: data?.icon,
    });
    return { id, name: data?.name };
  }

  /**
   * Deletes one of the customer's own nodes. Built-in nodes cannot be deleted;
   * they are hidden.
   *
   * A Category in use: `reassign` moves its records to `targetId` (another
   * Category, whose Main Category they take), `uncategorize` keeps their Main
   * Category and clears the Category. A Subcategory in use: its records keep
   * their Category. A Main Category must be empty of records first — its
   * records' Categories would otherwise have nowhere to be.
   *
   * @param {'reassign'|'uncategorize'} strategy
   */
  async deleteTaxonomyNode(id, strategy = 'uncategorize', targetId = null) {
    this.assertCanWrite();
    const taxonomy = this.taxonomy();
    const node = taxonomy.node(id);
    if (!node) throw this._taxonomyError('taxonomy.error.unknown');
    if (node.source !== 'custom') throw this._taxonomyError('taxonomy.error.builtinDelete');

    const field = this._levelField(node.level);
    const affected = await this.itemsReferencing(field, id);
    let patch = null;
    if (affected.length) {
      if (node.level === LEVELS.MAIN) throw this._taxonomyError('taxonomy.error.mainInUse');
      if (strategy === 'reassign') {
        const target = taxonomy.resolve(targetId);
        if (!target || target.id === id || target.level !== node.level) throw new AppError('error.repo/needs-target', { code: 'repo/needs-target' });
        patch = node.level === LEVELS.CATEGORY
          ? { mainCategoryId: taxonomy.mainOf(target)?.id || null, categoryId: target.id, subcategoryId: null }
          : { mainCategoryId: taxonomy.mainOf(target)?.id || null, categoryId: target.parentId, subcategoryId: target.id };
      } else {
        patch = node.level === LEVELS.CATEGORY
          ? { categoryId: UNCATEGORIZED_ID, subcategoryId: null }
          : { subcategoryId: null };
      }
    }

    // The customer's nodes beneath it go with it; built-in ones are not below
    // a custom node by construction.
    const below = [];
    const collect = (parentId) => {
      for (const child of taxonomy.children(parentId)) {
        if (child.source !== 'custom') continue;
        below.push(child);
        collect(child.id);
      }
    };
    collect(id);
    for (const child of below) {
      if (await this.countItemsReferencing(this._levelField(child.level), child.id)) {
        if (node.level === LEVELS.MAIN) throw this._taxonomyError('taxonomy.error.mainInUse');
      }
    }

    await this._runRelational([
      ...(patch ? this._clearReferenceOps(affected, patch) : []),
      ...below.map((child) => ({ type: 'delete', collection: 'categories', id: child.id })),
      { type: 'delete', collection: 'categories', id },
    ]);
    if (patch) this._patchLoaded(affected, patch);
    await this.log(ACTIONS.CATEGORY_DELETED, {
      categoryId: id, categoryName: taxonomy.label(node), reassigned: affected.length, newCategoryId: targetId || null,
    });
    return affected.length;
  }

  /** Kept for callers of the flat model. */
  deleteCategory(id, strategy, targetId) {
    return this.deleteTaxonomyNode(id, strategy, targetId);
  }

  /**
   * Merges one of the customer's nodes into another of the same level: its
   * records move to the target, the nodes beneath it move under the target,
   * and the source stays behind as a retired record pointing at the target —
   * so an old reference (a backup, another device) still resolves. One
   * transaction on the device whenever the change fits in one.
   */
  async mergeTaxonomyNodes(sourceId, targetId) {
    this.assertCanWrite();
    const taxonomy = this.taxonomy();
    const source = taxonomy.node(sourceId);
    const target = taxonomy.resolve(targetId);
    if (!source || !target || source.id === target.id) throw this._taxonomyError('taxonomy.error.unknown');
    if (source.source !== 'custom') throw this._taxonomyError('taxonomy.error.builtinDelete');
    if (source.level !== target.level) throw this._taxonomyError('taxonomy.error.mergeLevel');

    const field = this._levelField(source.level);
    const affected = await this.itemsReferencing(field, sourceId);
    const targetMain = taxonomy.mainOf(target)?.id || null;
    let patch;
    if (source.level === LEVELS.MAIN) patch = { mainCategoryId: target.id };
    else if (source.level === LEVELS.CATEGORY) patch = { mainCategoryId: targetMain, categoryId: target.id };
    else patch = { mainCategoryId: targetMain, categoryId: target.parentId, subcategoryId: target.id };

    const children = taxonomy.children(sourceId).filter((child) => child.source === 'custom');
    const operations = [
      ...this._clearReferenceOps(affected, patch),
      ...children.map((child) => ({ type: 'set', collection: 'categories', id: child.id, merge: true, data: { parentId: target.id } })),
      { type: 'set', collection: 'categories', id: sourceId, merge: true, data: { mergedInto: target.id, hidden: true } },
    ];
    // Records under a moved Category keep it, but their Main Category moves.
    if (source.level === LEVELS.MAIN) {
      for (const child of children) {
        const under = await this.itemsReferencing('categoryId', child.id);
        const extra = under.filter((item) => !affected.some((a) => a.id === item.id));
        operations.unshift(...this._clearReferenceOps(extra, { mainCategoryId: target.id }));
      }
    }
    await this._runRelational(operations);
    this._patchLoaded(affected, patch);
    await this.log(ACTIONS.CATEGORY_MERGED, {
      categoryId: sourceId, categoryName: taxonomy.label(source), reassigned: affected.length, newCategoryId: target.id,
    });
    return affected.length;
  }

  /**
   * «استعادة التصنيفات الافتراضية»: every built-in node visible again, in its
   * default order and under its built-in name; the customer's own nodes
   * visible and in creation order. No record is touched, no custom node is
   * removed, and fields saved to a node stay.
   */
  async restoreDefaultTaxonomy() {
    this.assertCanWrite();
    const operations = [];
    for (const record of this.state.categories) {
      if (record.mergedInto) continue;
      if (isBuiltinId(record.id)) {
        operations.push(record.fields?.length
          ? { type: 'set', collection: 'categories', id: record.id, merge: false, data: normalizeCategory({ id: record.id, name: '', source: 'builtin', fields: record.fields, createdAt: record.createdAt }) }
          : { type: 'delete', collection: 'categories', id: record.id });
      } else if (record.level) {
        operations.push({ type: 'set', collection: 'categories', id: record.id, merge: true, data: { hidden: false, order: null, pinned: false } });
      }
    }
    if (operations.length) await this._runRelational(operations);
    await this.log(ACTIONS.TAXONOMY_RESET, {});
  }

  /**
   * The first-run choice «ما أنواع الأشياء التي تديرها عادة؟»: the chosen Main
   * Categories are shown in the picker, the rest are hidden — not removed, and
   * one tap away in Settings.
   */
  async applyMainCategoryChoice(chosenIds) {
    this.assertCanWrite();
    const chosen = new Set(chosenIds);
    const taxonomy = this.taxonomy();
    const operations = [];
    for (const main of taxonomy.mainCategories({ includeHidden: true })) {
      if (main.source !== 'builtin' || main.builtin.onlyWhenUsed) continue;
      const hidden = !chosen.has(main.id);
      if (main.hidden === hidden) continue;
      operations.push({
        type: 'set', collection: 'categories', id: main.id, merge: true,
        data: this._storedNode(main.id) ? { hidden } : { ...normalizeCategory({ id: main.id, name: '', source: 'builtin' }), source: 'builtin', hidden },
      });
    }
    if (operations.length) await this._runRelational(operations);
  }

  /**
   * Places the categories written before the hierarchy existed, once.
   *
   * Versioned and idempotent: it looks only for stored categories with no
   * `level`, so a second run finds nothing to do, and a run interrupted half
   * way resumes where it stopped (each category's records are written before
   * the category itself is marked). Nothing is deleted:
   *
   *   • a category the catalog's explicit table maps to a built-in Category
   *     (and the customer never renamed) has its records moved there — the
   *     old id kept on each record as `legacyCategoryId` — and stays as a
   *     retired record pointing at the built-in one;
   *   • a category the table places under a Main Category stays, with its id
   *     and name, as the customer's Category there, and its records gain that
   *     Main Category;
   *   • anything else stays, unchanged, under «تصنيفات سابقة».
   *
   * A record's `updatedAt` is left alone: filling in a derived field is not
   * an edit.
   */
  async migrateTaxonomy() {
    if (!this.backend || !this.canWrite()) return { categories: 0, items: 0 };
    const legacy = this.state.categories.filter((c) => !c.level && !isBuiltinId(c.id) && c.id !== UNCATEGORIZED_ID);
    if (!legacy.length) return { categories: 0, items: 0 };

    let items = 0;
    try {
      for (const record of legacy) {
        const placement = legacyPlacement(record);
        const mergedToMain = placement.mergedInto && placement.mergedInto === placement.parentId;
        let data;
        if (mergedToMain) {
          data = { mainCategoryId: placement.parentId, categoryId: UNCATEGORIZED_ID, subcategoryId: null, legacyCategoryId: record.id };
        } else if (placement.mergedInto) {
          data = { mainCategoryId: placement.parentId, categoryId: placement.mergedInto, legacyCategoryId: record.id };
        } else {
          data = { mainCategoryId: placement.parentId };
        }
        const affected = await this.itemsReferencing('categoryId', record.id);
        const itemOps = affected.map((item) => ({
          type: 'set', collection: 'items', id: item.id, merge: true, bumpVersion: true, preserveUpdatedAt: true, data,
        }));
        for (let i = 0; i < itemOps.length; i += ATOMIC_BULK_MAX) {
          await this._runRelational(itemOps.slice(i, i + ATOMIC_BULK_MAX));
        }
        this._patchLoaded(affected, data);
        items += affected.length;
        await this._runRelational([{
          type: 'set', collection: 'categories', id: record.id, merge: true,
          data: {
            level: LEVELS.CATEGORY,
            parentId: placement.parentId,
            source: 'custom',
            taxonomyVersion: TAXONOMY_SCHEMA_VERSION,
            ...(placement.mergedInto ? { mergedInto: placement.mergedInto, hidden: true } : {}),
          },
        }]);
      }
      await this.log(ACTIONS.TAXONOMY_MIGRATED, { items, categories: legacy.length });
      await local.setMeta(TAXONOMY_MIGRATION_KEY, {
        version: TAXONOMY_SCHEMA_VERSION, at: Date.now(), categories: legacy.length, items, notice: 'pending',
      });
    } catch (error) {
      // Nothing is lost by stopping: the records not yet written still read
      // correctly (the same placement rule applies on display), and the next
      // start resumes.
      console.error('[repo] classification migration stopped; it resumes on the next start', error);
    }
    return { categories: legacy.length, items };
  }

  /** Whether to show «طوّرنا التصنيفات…» — once, after an existing inventory was migrated. */
  async taxonomyNotice() {
    const state = await local.getMeta(TAXONOMY_MIGRATION_KEY, null);
    return state?.notice === 'pending';
  }

  async dismissTaxonomyNotice() {
    const state = await local.getMeta(TAXONOMY_MIGRATION_KEY, null);
    if (state) await local.setMeta(TAXONOMY_MIGRATION_KEY, { ...state, notice: 'dismissed' });
  }

  // ── locations ──
  async saveLocation(data) {
    this.assertCanWrite();
    const location = normalizeLocation(data);
    const existing = this.state.locations.find((l) => l.id === location.id);
    if (existing) {
      await this.backend.update('locations', location.id, { name: location.name }, existing.version);
    } else {
      await this.backend.create('locations', location);
      await this.log(ACTIONS.LOCATION_CREATED, { locationId: location.id, locationName: location.name });
    }
    return location;
  }

  async deleteLocation(id) {
    this.assertCanWrite();
    const location = this.state.locations.find((l) => l.id === id);
    const affected = await this.itemsReferencing('locationId', id);
    await this._runRelational([
      ...this._clearReferenceOps(affected, { locationId: null }),
      { type: 'delete', collection: 'locations', id },
    ]);
    this._patchLoaded(affected, { locationId: null });
    await this.log(ACTIONS.LOCATION_DELETED, {
      locationId: id, locationName: location?.name, clearedFrom: affected.length,
    });
    return affected.length;
  }

  // ── bulk ──
  /**
   * Applies the same patch to several records. Written as one batch per chunk
   * rather than a loop of updates: a hundred separate writes is a hundred
   * chances for the connection to drop halfway, and a hundred times the cost.
   *
   * Every record carries the version the screen showed when it was selected,
   * so a record another tab changed in the meantime is a conflict rather than
   * an overwrite — see `_runBulk` for what a conflict leaves behind.
   */
  async bulkUpdate(ids, patch, { versions = null } = {}) {
    this.assertCanWrite();
    const allowed = new Set(['folderId', 'mainCategoryId', 'categoryId', 'subcategoryId', 'locationId', 'condition', 'unit']);
    for (const key of Object.keys(patch)) {
      if (!allowed.has(key)) {
        throw new AppError('error.repo/bulk-field', { code: 'repo/bulk-field' });
      }
    }

    const shown = this._shownVersions(ids);
    const { selected, missing, skipped } = await this._resolveSelection(ids);
    if (!selected.length) return { updated: 0, requested: ids.length, missing, skipped };

    const operations = selected.map((item) => ({
      type: 'set',
      collection: 'items',
      id: item.id,
      merge: true,
      // The version the screen was showing when the customer chose this
      // record. It is checked against the stored one inside the write, so a
      // record another tab changed in the meantime is a conflict rather than
      // an overwrite — and the new version is computed there too, from what is
      // stored, never from the copy this screen is holding.
      expectedVersion: versions?.get(item.id) ?? shown.get(item.id) ?? item.version ?? 1,
      bumpVersion: true,
      // Each record's own classification decides what a new Main Category or
      // Category leaves valid, so the patch is made canonical per record — and
      // an invalid combination refuses the whole change before anything is
      // written.
      data: { ...this._classificationPatch(item, patch), updatedBy: this.session.userId },
    }));

    this.setSync(SyncState.SAVING);
    const { applied, atomic } = await this._runBulk(operations, {
      what: t('bulk.whatUpdate'),
      action: ACTIONS.ITEMS_BULK_UPDATED,
      operation: bulkOperationName(patch),
      meta: { fields: Object.keys(patch) },
    });
    // The log records what happened, not what was asked for. "250 updated"
    // against 100 actual changes is a record that lies to whoever reads it next.
    this._invalidateAggregates();
    await this.log(ACTIONS.ITEMS_BULK_UPDATED, {
      requested: operations.length, count: applied, applied, atomic, status: 'complete',
      operation: bulkOperationName(patch), fields: Object.keys(patch),
    });
    return { updated: applied, atomic, requested: ids.length, missing, skipped };
  }

  /**
   * A relational rewrite — clearing every reference to a taxonomy row, then
   * removing the row.
   *
   * No expected versions: the customer is deleting a folder, not resolving an
   * edit conflict, and a record edited elsewhere still has to stop pointing at
   * something that is about to stop existing. What matters here is that the
   * reference clearing and the deletion cannot come apart, which is why it is
   * one transaction on the device.
   */
  async _runRelational(operations) {
    if (this.backend.runAtomicBatch && operations.length <= ATOMIC_BULK_MAX) {
      await this.backend.runAtomicBatch(operations);
      return;
    }
    await this.backend.runBatch(operations);
  }

  /**
   * A bulk write, as atomic as the backend can actually make it.
   *
   * Two models, and the difference is stated rather than glossed:
   *
   *   ALL OR NOTHING — one transaction over the whole selection. A conflict on
   *   any record leaves every record untouched. This is what the device
   *   backend does for an ordinary selection, and it is what lets the message
   *   say "nothing was applied" and mean it.
   *
   *   CHUNK BY CHUNK — each chunk lands or rolls back on its own, and a
   *   conflict in the fourth chunk leaves the first three committed. The cloud
   *   backend works this way because a Firestore transaction has a size limit,
   *   and a selection larger than `ATOMIC_BULK_MAX` works this way on the
   *   device too, because one transaction holding forty thousand requests open
   *   is not a guarantee, it is a gamble.
   *
   * The caller is told which one happened, because the sentence the customer
   * reads depends on it.
   *
   * When the chunked path stops part way, what did land is written to the
   * activity log before the error goes back up — as a partial entry, with the
   * same `applied` number the error carries and the customer is told. A
   * thrown error used to skip the log line entirely, which left 700 changed
   * records with no trace of who changed them. An all-or-nothing failure logs
   * nothing: nothing happened.
   *
   * @param {Array} operations
   * @param {{what: string, action: string, operation: string, meta?: object}} audit
   * @returns {Promise<{applied: number, atomic: boolean}>}
   * @throws {AppError} `repo/bulk-conflict` when nothing was applied, or
   *   `repo/bulk-partial` carrying `{requested, applied, remaining, failedAt,
   *   atomic: false}` when some of it was.
   */
  async _runBulk(operations, { what, action, operation, meta = {} }) {
    const requested = operations.length;
    const atomic = Boolean(this.backend.runAtomicBatch) && requested <= ATOMIC_BULK_MAX;

    if (atomic) {
      try {
        await this.backend.runAtomicBatch(operations);
        return { applied: requested, atomic: true };
      } catch (error) {
        if (error instanceof ConflictError) {
          throw new AppError(
            'error.repo/bulk-conflict',
            { code: 'repo/bulk-conflict', what, cause: error, requested, applied: 0, atomic: true },
          );
        }
        throw error;
      }
    }

    let applied = 0;
    try {
      for (let i = 0; i < requested; i += BULK_CHUNK) {
        const chunk = operations.slice(i, i + BULK_CHUNK);
        await this.backend.runBatch(chunk);
        applied += chunk.length;
      }
      return { applied, atomic: false };
    } catch (error) {
      const conflict = error instanceof ConflictError;
      if (!applied) {
        if (!conflict) throw error;
        throw new AppError(
          'error.repo/bulk-conflict',
          { code: 'repo/bulk-conflict', what, cause: error, requested, applied: 0, atomic: false },
        );
      }

      // Some of it landed. Never "nothing was applied": the chunks before this
      // one are committed, and telling the customer otherwise sends them
      // looking for a change that already happened.
      const partial = {
        requested,
        applied,
        remaining: requested - applied,
        failedAt: applied,
        atomic: false,
      };
      try {
        await this.log(action, {
          ...meta, ...partial, count: applied, status: 'partial', operation,
        });
      } catch (logError) {
        console.error('[repo] the partial bulk change could not be logged', logError);
      }
      throw new AppError(
        conflict ? 'error.repo/bulk-partial.conflict' : 'error.repo/bulk-partial',
        { code: 'repo/bulk-partial', what, cause: error, ...partial, count: applied },
      );
    }
  }

  /** Moves several records to Trash. Nothing is destroyed; Trash is reversible. */
  async bulkTrash(ids, { versions = null } = {}) {
    this.assertCanWrite();
    const shown = this._shownVersions(ids);
    const { selected: items, missing, skipped } = await this._resolveSelection(ids);
    if (!items.length) return { trashed: 0, requested: ids.length, missing, skipped };

    this.setSync(SyncState.SAVING);
    // The same concurrency rule as a bulk edit: moving a record to the Trash
    // is a change to it, and a record somebody else has just edited is not one
    // this screen's stale copy gets to overwrite.
    const { applied, atomic } = await this._runBulk(items.map((item) => ({
      type: 'set',
      collection: 'items',
      id: item.id,
      merge: true,
      expectedVersion: versions?.get(item.id) ?? shown.get(item.id) ?? item.version ?? 1,
      bumpVersion: true,
      data: {
        deletedAt: this.backend.serverTime,
        deletedBy: this.session.userId,
      },
    })), { what: t('bulk.whatDelete'), action: ACTIONS.ITEMS_BULK_DELETED, operation: 'trash' });
    this._invalidateAggregates();
    await this.log(ACTIONS.ITEMS_BULK_DELETED, {
      requested: items.length, count: applied, applied, atomic, status: 'complete', operation: 'trash',
    });
    return { trashed: applied, atomic, requested: ids.length, missing, skipped };
  }

  /**
   * A selection is a set of ids, and every one of them is looked up in the
   * store — not in the window, which holds the newest few hundred and would
   * quietly turn "7 selected" into "2 changed".
   *
   * @returns {Promise<{selected: object[], missing: string[], skipped: string[]}>}
   *   `missing` no longer exist; `skipped` are already in the Trash. Both are
   *   returned so the caller can say so rather than act on fewer in silence.
   */
  /**
   * The versions the screen was showing, for the records it holds. A record
   * changed elsewhere since it was drawn is a conflict, not an overwrite; a
   * record the screen does not hold has no shown version, and the one just
   * read from the store stands in for it.
   */
  _shownVersions(ids) {
    const shown = new Map();
    for (const id of ids) {
      const held = this.state.items.find((i) => i.id === id);
      if (held) shown.set(id, held.version ?? 1);
    }
    return shown;
  }

  async _resolveSelection(ids) {
    const { items, missing } = await this.getItems(ids, { fresh: true });
    const selected = items.filter((item) => !item.deletedAt);
    const skipped = items.filter((item) => item.deletedAt).map((item) => item.id);
    return { selected, missing, skipped };
  }

  /**
   * Creates many records in one pass, for an import. Each one still goes
   * through `normalizeItem`, so a spreadsheet cannot write a shape the app
   * would not accept from its own form; only the per-record activity log is
   * traded for one entry naming the count.
   */
  /**
   * @param {{log?: boolean}} [options] a spreadsheet import writes in chunks of
   *   two hundred and logs once, as the import, when it finishes — not once per
   *   chunk, which made a 12,000-row file sixty entries of "200 added".
   */
  /**
   * @returns {Promise<{created: number, skippedExisting: string[], processed: number}>}
   *   `created` is what was actually written; `processed` is every record
   *   handed in, including those skipped because they already exist.
   */
  async bulkCreateItems(records, { log = true } = {}) {
    this.assertCanWrite();
    if (!records.length) return { created: 0, skippedExisting: [], processed: 0 };
    const taxonomy = this.taxonomy();
    const items = records.map((record) => {
      const item = normalizeItem(
        { ...record, createdBy: this.session.userId, updatedBy: this.session.userId },
        { userId: this.session.userId },
      );
      // An import row is never refused for its classification: what does not
      // fit the hierarchy keeps as much of it as does (see reconcileClassification).
      Object.assign(item, reconcileClassification(taxonomy, item).value);
      return item;
    });
    this.setSync(SyncState.SAVING);
    // Create, never replace. An import's ids are deterministic so that a
    // chunk replayed after a crash lands on the same records — and a record
    // that already exists under one of them is proof that row was committed.
    // It may have been edited since; replaying the spreadsheet's original
    // values over it would silently undo that edit. So an existing id is
    // skipped, whole, inside the write (`ifAbsent`), and costs no plan slot.
    const result = await this.backend.runBatch(items.map((item) => ({
      type: 'set', collection: 'items', id: item.id, data: item, merge: false, ifAbsent: true,
    })), { liveLimit: this._liveLimit() });
    const skippedExisting = result?.skippedExisting || [];
    const created = items.length - skippedExisting.length;
    this._invalidateAggregates();
    this.invalidateSkuFloor();
    if (log && created) await this.log(ACTIONS.IMPORT_MERGED, { items: created });
    return { created, skippedExisting, processed: items.length };
  }

  /**
   * Undo an import: remove exactly the records it wrote, and nothing else.
   *
   * This is what "إلغاء الاستيراد" means, as distinct from closing the screen.
   * Closing keeps what was written — those are real records the customer can
   * see and use. Cancelling says the half-written import was a mistake, and a
   * half-written import is the one case where records can be removed outright
   * rather than moved to the Trash: they are seconds old, the customer is
   * watching, and leaving four hundred rows of a file they are abandoning in
   * the Trash is not mercy, it is a second mess.
   *
   * What decides membership is the record's own `importJobId`, not its id.
   * Nothing else is touched: a record the customer edited before cancelling is
   * still that import's record and still goes, but a record that merely looks
   * similar does not.
   *
   * Taxonomy the import created is removed only when it was created by this
   * import *and* nothing references it any more — the count is asked of the
   * backend, so a category the customer meanwhile put a hand-typed record into
   * survives. `غير مصنّف` is never a candidate; it is not created by anything.
   *
   * Idempotent: running it twice removes nothing the second time, which is
   * what makes it safe to retry after a failure half way through.
   *
   * @param {string} importJobId
   * @param {{categories?: string[], locations?: string[], folders?: string[]}} created
   * @param {{onProgress?: (removed: number) => void}} options
   * @returns {Promise<{removed: number, taxonomy: number}>}
   */
  async rollbackImport(importJobId, created = {}, { onProgress } = {}) {
    this.assertCanWrite();
    if (!importJobId) return { removed: 0, taxonomy: 0 };
    this.setSync(SyncState.SAVING);

    let removed = 0;
    for (;;) {
      const ids = await this._importedIds(importJobId, ROLLBACK_CHUNK);
      if (!ids.length) break;
      await this.backend.runBatch(ids.map((id) => ({
        type: 'delete', collection: 'items', id,
      })));
      removed += ids.length;
      onProgress?.(removed);
      // A pass that deletes fewer than it asked for has reached the end. The
      // equal case still loops once more, and that pass finds nothing.
      if (ids.length < ROLLBACK_CHUNK) break;
    }

    const orphans = [];
    for (const [collection, field] of [
      ['categories', null],
      ['locations', 'locationId'],
      ['folders', 'folderId'],
    ]) {
      const present = new Set(this.state[collection].map((row) => row.id));
      for (const id of created[collection] || []) {
        // A row that is already gone is not one this run removed. Counting it
        // would make a second cancellation report work it did not do.
        if (!id || id === UNCATEGORIZED_ID || !present.has(id)) continue;
        const used = field ? await this.countItemsReferencing(field, id) : await this.taxonomyNodeUsage(id);
        if (used) continue;
        orphans.push({ type: 'delete', collection, id });
      }
    }
    // A classification node stays while something below it stays: a Main
    // Category the import made is kept if a Category under it is still in use.
    const leaving = new Set(orphans.filter((op) => op.collection === 'categories').map((op) => op.id));
    const taxonomy = this.taxonomy();
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...leaving]) {
        if (taxonomy.children(id).some((child) => !leaving.has(child.id))) { leaving.delete(id); changed = true; }
      }
    }
    for (let i = orphans.length - 1; i >= 0; i -= 1) {
      if (orphans[i].collection === 'categories' && !leaving.has(orphans[i].id)) orphans.splice(i, 1);
    }
    if (orphans.length) await this._runRelational(orphans);

    if (removed || orphans.length) {
      await this.log(ACTIONS.IMPORT_ROLLED_BACK, {
        importJobId, items: removed, taxonomy: orphans.length,
      });
    }
    return { removed, taxonomy: orphans.length };
  }

  /** The ids one import wrote, asked of the backend when it can answer from an
   *  index and read from what is loaded when it cannot. */
  async _importedIds(importJobId, limit) {
    if (this.backend.importedItemIds) {
      return this.backend.importedItemIds(importJobId, limit);
    }
    return this.state.items
      .filter((item) => item.importJobId === importJobId)
      .slice(0, limit)
      .map((item) => item.id);
  }

  /**
   * @param {{liveLimit?: number|null}} [options] a merge passes the plan's
   *   limit; a full restore deliberately does not.
   * @returns {Promise<{applied: number, skippedExisting: string[]}>}
   */
  async bulkWrite(operations, { liveLimit = null } = {}) {
    this.assertCanWrite();
    this.setSync(SyncState.SAVING);
    const result = await this.backend.runBatch(operations, { liveLimit });
    this._invalidateAggregates();
    this.invalidateSkuFloor();
    return result || { applied: operations.length, skippedExisting: [] };
  }

  /**
   * Throws unless the whole inventory is loaded. Anything that reads or
   * removes "everything" is silently wrong on a window, so it says so instead.
   */
  /** @param {string} [whatKey] a message key naming the operation */
  assertItemsComplete(whatKey = 'partial.thisOperation') {
    if (!this.itemsComplete) {
      throw new AppError('error.repo/partial', { code: 'repo/partial', what: t(whatKey) });
    }
  }

  /** Removes every item and folder. Categories and locations are kept. */
  async clearInventory() {
    this.assertCanAdmin();
    // Every item — not every loaded item. On a window this would delete the
    // newest 200 and leave the rest behind, reporting success.
    await this.completeItems();
    this.assertItemsComplete('partial.clearInventory');
    const operations = [
      ...this.state.items.map((i) => ({ type: 'delete', collection: 'items', id: i.id })),
      ...this.state.folders.map((f) => ({ type: 'delete', collection: 'folders', id: f.id })),
    ];
    await this.backend.runBatch(operations);
    await this.log(ACTIONS.WORKSPACE_CLEARED, {
      itemsRemoved: this.state.items.length, foldersRemoved: this.state.folders.length,
    });
  }
}

export const repository = new Repository();
