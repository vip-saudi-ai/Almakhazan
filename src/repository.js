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

import { ACTIONS, DEFAULT_CATEGORIES, DEFAULT_LOCATIONS, ROLES, UNCATEGORIZED_ID, roleAtLeast } from './config.js';
import { firebaseContext } from './firebase.js';
import * as local from './local-store.js';
import { applyReferenceDelta, releaseAll, retainAll } from './media.js';
import { releaseObjectUrls } from './storage.js';
import { AppError, toMillis, uid } from './utils.js';
import {
  normalizeCategory, normalizeFolder, normalizeItem, normalizeLocation,
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

export const SYNC_LABELS = {
  loading: 'جارٍ التحميل…',
  synced: 'محفوظ ☁',
  saving: 'جارٍ الحفظ…',
  offline: 'غير متصل — محفوظ محلياً',
  local: 'محلي على هذا الجهاز',
  error: 'فشل المزامنة',
  conflict: 'تعارض في التعديل',
};

export class ConflictError extends AppError {
  constructor(current) {
    super('عُدّلت هذه القطعة على جهاز آخر', { code: 'repo/conflict' });
    this.name = 'ConflictError';
    this.current = current;
  }
}

const COLLECTIONS = ['items', 'folders', 'categories', 'locations'];

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
/** How many operations one chunk carries when the whole set cannot be atomic. */
const BULK_CHUNK = 100;

const DAY = 24 * 60 * 60 * 1000;
/** When the activity log was last trimmed, so it is trimmed about once a day. */
const ACTIVITY_PRUNE_KEY = 'activity.lastPrunedAt';
const SCAN_PAGE = 500;

// ── Firestore backend ──────────────────────────────────────────────────────
class FirestoreBackend {
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

  async create(name, record) {
    const { id, ...rest } = record;
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
  async update(name, id, patch, expectedVersion) {
    const ref = this.ref(name, id);
    await this.fs.runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new AppError('السجل لم يعد موجوداً', { code: 'repo/missing' });
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
  async runBatch(operations) {
    const guarded = operations.some((op) => op.expectedVersion != null || op.bumpVersion);
    if (guarded) return this._runGuardedBatch(operations);

    // Firestore caps a batch at 500 writes.
    for (let i = 0; i < operations.length; i += 450) {
      const batch = this.fs.writeBatch(this.db);
      for (const op of operations.slice(i, i + 450)) {
        const ref = this.ref(op.collection, op.id);
        if (op.type === 'set') {
          batch.set(ref, { ...op.data, updatedAt: this.serverTime }, { merge: op.merge !== false });
        } else if (op.type === 'delete') {
          batch.delete(ref);
        }
      }
      await batch.commit();
    }
  }

  async _runGuardedBatch(operations) {
    for (let i = 0; i < operations.length; i += 100) {
      const chunk = operations.slice(i, i + 100);
      await this.fs.runTransaction(this.db, async (tx) => {
        const refs = chunk.map((op) => this.ref(op.collection, op.id));
        // Every read before any write: a Firestore transaction requires it.
        const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
        chunk.forEach((op, index) => {
          const ref = refs[index];
          const snap = snapshots[index];
          if (op.type === 'delete') { tx.delete(ref); return; }
          if (op.expectedVersion != null) {
            if (!snap.exists()) throw new AppError('السجل لم يعد موجوداً', { code: 'repo/missing' });
            const current = snap.data();
            if ((current.version ?? 1) !== op.expectedVersion) {
              throw new ConflictError({ id: op.id, ...current });
            }
          }
          const data = { ...op.data, updatedAt: this.serverTime };
          if (op.bumpVersion) data.version = ((snap.exists() ? snap.data().version : 0) ?? 0) + 1;
          tx.set(ref, data, { merge: op.merge !== false });
        });
      });
    }
  }
}

// ── IndexedDB backend ──────────────────────────────────────────────────────
//
// Every read below is keyed, indexed or cursored. A device holding 20,000
// records must answer "which items are in this folder" and "is this SKU taken"
// at the cost of the answer, not the cost of the inventory — otherwise the
// relational operations that depend on them are correct only on small data,
// which is the same as being wrong.
class LocalBackend {
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

  async create(name, record) {
    await local.put(name, { ...record, createdAt: record.createdAt || Date.now(), updatedAt: Date.now(), version: 1 });
    await this._notify(name);
  }

  /**
   * Optimistic concurrency, read and write inside one transaction. Reading the
   * current version in a separate transaction and writing in the next leaves a
   * window in which another tab can commit between the two, and the version
   * check then passes against a record that no longer exists as read.
   */
  async update(name, id, patch, expectedVersion) {
    await local.transaction(name, 'readwrite', async (stores) => {
      const store = stores[name];
      const current = await local.request(store.get(id));
      if (!current) throw new AppError('السجل لم يعد موجوداً', { code: 'repo/missing' });
      if (expectedVersion != null && (current.version ?? 1) !== expectedVersion) {
        throw new ConflictError(current);
      }
      await local.request(store.put({
        ...current, ...patch, updatedAt: Date.now(), version: (current.version ?? 1) + 1,
      }));
    });
    await this._notify(name);
  }

  async purge(name, id) {
    await local.remove(name, id);
    await this._notify(name);
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
  async runBatch(operations) {
    if (!operations.length) return;
    const touched = [...new Set(operations.map((op) => op.collection))];
    await local.transaction(touched, 'readwrite', async (stores) => {
      for (const op of operations) {
        const store = stores[op.collection];
        if (op.type === 'delete') {
          await local.request(store.delete(op.id));
          continue;
        }
        if (op.type !== 'set') continue;

        const needsCurrent = op.merge !== false || op.expectedVersion != null || op.bumpVersion;
        const existing = needsCurrent ? await local.request(store.get(op.id)) : null;

        if (op.expectedVersion != null) {
          if (!existing) throw new AppError('السجل لم يعد موجوداً', { code: 'repo/missing' });
          if ((existing.version ?? 1) !== op.expectedVersion) throw new ConflictError(existing);
        }

        const record = {
          ...(op.merge !== false ? existing : null),
          ...op.data,
          id: op.id,
          updatedAt: Date.now(),
        };
        // The next version is the stored one plus one, never the caller's.
        if (op.bumpVersion) record.version = (existing?.version ?? 0) + 1;
        await local.request(store.put(record));
      }
    });
    for (const name of touched) await this._notify(name);
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
        const needsCurrent = op.type === 'set'
          && (op.merge !== false || op.expectedVersion != null || op.bumpVersion);
        const existing = needsCurrent ? await local.request(store.get(op.id)) : null;

        if (op.expectedVersion != null) {
          if (!existing) throw new AppError('السجل لم يعد موجوداً', { code: 'repo/missing' });
          if ((existing.version ?? 1) !== op.expectedVersion) throw new ConflictError(existing);
        }
        current.push(existing);
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
          updatedAt: Date.now(),
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

  /** The first record carrying this identifier, for a uniqueness check. */
  async findItemByUnique(field, value) {
    if (!value) return null;
    return local.firstByIndex('items', field, value);
  }

  async countItemsByField(field, value) {
    if (value == null) return 0;
    return local.countByIndex('items', field, value);
  }

  async countItems() {
    return this._liveCount('items');
  }
}

// ── Repository facade ──────────────────────────────────────────────────────
class Repository {
  constructor() {
    this.state = { items: [], folders: [], categories: [], locations: [], activity: [] };
    this.sync = { status: SyncState.LOADING, message: SYNC_LABELS.loading, error: null };
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
    this.sync = { status, message: SYNC_LABELS[status] || status, error: null, ...extra };
    this.emit();
  }

  canWrite() {
    return roleAtLeast(this.session.role, ROLES.EDITOR);
  }

  assertCanWrite() {
    if (!this.canWrite()) {
      throw new AppError('صلاحيتك للعرض فقط', { code: 'repo/forbidden' });
    }
  }

  assertCanAdmin() {
    if (!roleAtLeast(this.session.role, ROLES.ADMIN)) {
      throw new AppError('هذا الإجراء يتطلب صلاحية مدير', { code: 'repo/forbidden' });
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
          this.setSync(SyncState.ERROR, { error, message: this._listenerMessage(error) });
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
    this.ready = true;
    this.emit();
  }

  _listenerMessage(error) {
    if (error?.code === 'permission-denied') return 'لا تملك صلاحية قراءة هذه البيانات';
    return SYNC_LABELS.error;
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

  /** First run in an empty workspace gets the default taxonomy, nothing else. */
  async _seedDefaults() {
    if (!this.canWrite()) return;
    if (this.state.categories.length || this.state.locations.length || this.state.items.length) return;
    try {
      await this.backend.runBatch([
        ...DEFAULT_CATEGORIES.map((c) => ({ type: 'set', collection: 'categories', id: c.id, data: normalizeCategory(c) })),
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

  // ── how much of the inventory is loaded ──

  /** state.items = the live window, plus whatever the scan found beyond it. */
  _composeItems() {
    this._taxonomyCounts = null;
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
  item(id) { return this.state.items.find((i) => i.id === id) || null; }
  folder(id) { return id ? this.state.folders.find((f) => f.id === id) || null : null; }
  category(id) {
    if (!id || id === UNCATEGORIZED_ID) return { id: UNCATEGORIZED_ID, name: 'غير مصنّف', icon: '📦' };
    return this.state.categories.find((c) => c.id === id) || { id, name: 'تصنيف محذوف', icon: '❓' };
  }
  location(id) { return id ? this.state.locations.find((l) => l.id === id) || null : null; }

  liveItems() { return this.state.items.filter((i) => !i.deletedAt); }
  trashedItems() { return this.state.items.filter((i) => i.deletedAt); }

  lookups() {
    return {
      category: (id) => this.category(id),
      folder: (id) => this.folder(id),
      location: (id) => this.location(id),
    };
  }

  // ── SKU ──
  static formatSku(sequence, year = new Date().getFullYear()) {
    return `INV-${year}-${String(sequence).padStart(6, '0')}`;
  }

  /**
   * A best guess for the form field, computed from what this device has
   * loaded. It is only a placeholder — two devices can produce the same one.
   */
  provisionalSku() {
    const prefix = `INV-${new Date().getFullYear()}-`;
    let highest = 0;
    for (const item of this.state.items) {
      if (typeof item.sku === 'string' && item.sku.startsWith(prefix)) {
        const n = Number.parseInt(item.sku.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > highest) highest = n;
      }
    }
    return Repository.formatSku(highest + 1);
  }

  /**
   * Takes the next SKU authoritatively. The counter lives in the workspace and
   * is advanced in a transaction, so two devices saving at the same moment get
   * different numbers. Security Rules only permit +1, so the sequence cannot be
   * rewritten or rewound by a client.
   */
  async reserveSku() {
    if (this.session.mode !== 'cloud') {
      const next = (await local.getMeta('counter.sku', 0)) + 1;
      await local.setMeta('counter.sku', next);
      return Repository.formatSku(Math.max(next, this._provisionalSequence()));
    }

    const { db, sdk } = firebaseContext();
    const ref = sdk.firestore.doc(db, 'workspaces', this.session.workspaceId, 'counters', 'sku');

    // Contention between devices is the expected failure here, and it is
    // transient — so retry. What must never happen is falling back to a
    // locally guessed number, which is exactly how two devices collide.
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const value = await sdk.firestore.runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) {
            tx.set(ref, { value: 1, updatedAt: sdk.firestore.serverTimestamp() });
            return 1;
          }
          const next = (snap.data().value ?? 0) + 1;
          tx.update(ref, { value: next, updatedAt: sdk.firestore.serverTimestamp() });
          return next;
        });
        return Repository.formatSku(value);
      } catch (error) {
        lastError = error;
        console.error(`[repo] SKU reservation attempt ${attempt + 1} failed`, error);
        await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
      }
    }

    throw new AppError('تعذّر حجز رمز للقطعة — تحقق من الاتصال وحاول مرة أخرى', {
      code: 'repo/sku-unavailable',
      cause: lastError,
    });
  }

  _provisionalSequence() {
    const prefix = `INV-${new Date().getFullYear()}-`;
    let highest = 0;
    for (const item of this.state.items) {
      if (typeof item.sku === 'string' && item.sku.startsWith(prefix)) {
        const n = Number.parseInt(item.sku.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > highest) highest = n;
      }
    }
    return highest + 1;
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
    return this.identifierConflict('sku', sku, exceptId);
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

  // ── items ──
  async createItem(data) {
    this.assertCanWrite();
    const item = normalizeItem({ ...data, createdBy: this.session.userId, updatedBy: this.session.userId }, {
      userId: this.session.userId,
    });
    this.setSync(SyncState.SAVING);
    await this.backend.create('items', item);
    // Claims the images this item uses. Until now they were unreferenced, which
    // is what lets an abandoned form be cleaned up automatically.
    await retainAll(this.session, item);
    await this.log(ACTIONS.ITEM_CREATED, { itemId: item.id, itemName: item.name });
    return item;
  }

  async updateItem(id, patch, expectedVersion) {
    this.assertCanWrite();
    const before = this.item(id);
    this.setSync(SyncState.SAVING);
    await this.backend.update('items', id, { ...patch, updatedBy: this.session.userId }, expectedVersion);

    // Images added or removed by this edit change what the media assets are
    // referenced by; the files themselves are reclaimed by the backend once
    // nothing points at them.
    if (patch.images) {
      await applyReferenceDelta(this.session, before, { ...before, ...patch });
    }

    const changes = Repository.diff(before, { ...before, ...patch }, [
      'name', 'sku', 'barcode', 'categoryId', 'folderId', 'locationId',
      'quantity', 'unit', 'condition', 'brand', 'valuation', 'description',
      'images', 'primaryImageId', 'aiData',
    ]);
    await this.log(ACTIONS.ITEM_UPDATED, { itemId: id, itemName: patch.name ?? before?.name, changes });
  }

  async moveItem(id, folderId) {
    this.assertCanWrite();
    const before = this.item(id);
    await this.backend.update('items', id, { folderId: folderId || null, updatedBy: this.session.userId }, before?.version);
    await this.log(ACTIONS.ITEM_MOVED, {
      itemId: id,
      itemName: before?.name,
      changes: { before: { folderId: before?.folderId ?? null }, after: { folderId: folderId || null } },
    });
  }

  /** Soft delete — the record moves to Trash and stays recoverable. */
  async deleteItem(id) {
    this.assertCanWrite();
    const item = this.item(id);
    this.setSync(SyncState.SAVING);
    await this.backend.update('items', id, {
      deletedAt: this.backend.serverTime,
      deletedBy: this.session.userId,
    }, item?.version);
    await this.log(ACTIONS.ITEM_DELETED, { itemId: id, itemName: item?.name });
  }

  async restoreItem(id) {
    this.assertCanWrite();
    const item = this.item(id);
    await this.backend.update('items', id, { deletedAt: null, deletedBy: null }, item?.version);
    await this.log(ACTIONS.ITEM_RESTORED, { itemId: id, itemName: item?.name });
  }

  async purgeItem(id) {
    this.assertCanAdmin();
    const item = this.item(id);
    await this.backend.purge('items', id);
    // A purged record is gone from the backend; drop the scanned copy too, or
    // it lingers in `state.items` until the next reload.
    this.itemsRest.delete(id);
    this._composeItems();
    // Releases this item's hold on its images. Any image another item still
    // references keeps a non-zero count and survives.
    if (item) await releaseAll(this.session, item);
    await this.log(ACTIONS.ITEM_PURGED, { itemId: id, itemName: item?.name });
  }

  /**
   * Duplicates the record, not its history and not its bytes: the copy shares
   * the source's media assets and raises their reference count, so no file is
   * uploaded twice and neither item can delete a file the other still shows.
   */
  async duplicateItem(id) {
    this.assertCanWrite();
    const source = this.item(id);
    if (!source) throw new AppError('القطعة غير موجودة', { code: 'repo/missing' });
    const copy = normalizeItem({
      ...source,
      id: uid('itm'),
      sku: await this.reserveSku(),
      barcode: '', // barcodes identify a physical object; a copy has none yet
      name: `${source.name} (نسخة)`,
      createdAt: null,
      updatedAt: null,
      createdBy: this.session.userId,
      updatedBy: this.session.userId,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    }, { userId: this.session.userId });

    await this.backend.create('items', copy);
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
   * Exact reference counts for every taxonomy row, in one call.
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
      rows.map(async ([group, field, id]) => [group, id, await this.countItemsReferencing(field, id)]),
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

  // ── categories ──
  async saveCategory(data) {
    this.assertCanWrite();
    const category = normalizeCategory(data);
    const existing = this.state.categories.find((c) => c.id === category.id);
    if (existing) {
      await this.backend.update('categories', category.id, { name: category.name, icon: category.icon }, existing.version);
      await this.log(ACTIONS.CATEGORY_UPDATED, { categoryId: category.id, categoryName: category.name });
    } else {
      await this.backend.create('categories', category);
      await this.log(ACTIONS.CATEGORY_CREATED, { categoryId: category.id, categoryName: category.name });
    }
    return category;
  }

  /**
   * How many records reference this category — asked of the backend, not of
   * the window, so the number in the confirmation dialog is the number of
   * records the deletion will actually rewrite.
   */
  categoryUsage(id) {
    return this.countItemsReferencing('categoryId', id);
  }

  /**
   * @param {'reassign'|'uncategorize'} strategy
   * @param {string} [targetId] required when reassigning
   */
  async deleteCategory(id, strategy, targetId) {
    this.assertCanWrite();
    const category = this.state.categories.find((c) => c.id === id);
    const affected = await this.itemsReferencing('categoryId', id);
    if (affected.length && strategy === 'reassign' && !targetId) {
      throw new AppError('اختر التصنيف البديل', { code: 'repo/needs-target' });
    }
    const newCategory = strategy === 'reassign' ? targetId : UNCATEGORIZED_ID;
    await this._runRelational([
      ...this._clearReferenceOps(affected, { categoryId: newCategory }),
      { type: 'delete', collection: 'categories', id },
    ]);
    this._patchLoaded(affected, { categoryId: newCategory });
    await this.log(ACTIONS.CATEGORY_DELETED, {
      categoryId: id, categoryName: category?.name, reassigned: affected.length, newCategoryId: newCategory,
    });
    return affected.length;
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
   * Optimistic concurrency does not apply here — the customer is changing one
   * field across a selection they can see, not resolving an edit conflict.
   */
  async bulkUpdate(ids, patch) {
    this.assertCanWrite();
    const allowed = new Set(['folderId', 'categoryId', 'locationId', 'condition', 'unit']);
    for (const key of Object.keys(patch)) {
      if (!allowed.has(key)) {
        throw new AppError('حقل غير مسموح بتعديله جماعياً', { code: 'repo/bulk-field' });
      }
    }

    const selected = ids.map((id) => this.item(id)).filter(Boolean);
    if (!selected.length) return { updated: 0 };

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
      expectedVersion: item.version ?? 1,
      bumpVersion: true,
      data: { ...patch, updatedBy: this.session.userId },
    }));

    this.setSync(SyncState.SAVING);
    const { applied, atomic } = await this._runBulk(operations, 'التعديل الجماعي');
    // The log records what happened, not what was asked for. "250 updated"
    // against 100 actual changes is a record that lies to whoever reads it next.
    await this.log(ACTIONS.ITEMS_BULK_UPDATED, {
      requested: operations.length, count: applied, atomic, fields: Object.keys(patch),
    });
    return { updated: applied, atomic };
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
   * @returns {Promise<{applied: number, atomic: boolean}>}
   */
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

  async _runBulk(operations, what) {
    const atomic = Boolean(this.backend.runAtomicBatch) && operations.length <= ATOMIC_BULK_MAX;

    if (atomic) {
      try {
        await this.backend.runAtomicBatch(operations);
        return { applied: operations.length, atomic: true };
      } catch (error) {
        if (error instanceof ConflictError) {
          throw new AppError(
            `تعذّر إكمال ${what} لأن بعض القطع تغيّرت منذ فتح القائمة. لم يتم تطبيق أي تغيير. حدّث القائمة وحاول مرة أخرى.`,
            { code: 'repo/bulk-conflict', cause: error, applied: 0 },
          );
        }
        throw error;
      }
    }

    let applied = 0;
    try {
      for (let i = 0; i < operations.length; i += BULK_CHUNK) {
        const chunk = operations.slice(i, i + BULK_CHUNK);
        await this.backend.runBatch(chunk);
        applied += chunk.length;
      }
      return { applied, atomic: false };
    } catch (error) {
      if (error instanceof ConflictError) {
        // Never "nothing was applied" here: the chunks before this one are
        // committed, and telling the customer otherwise sends them looking for
        // a change that already happened.
        throw new AppError(
          applied
            ? `تعذّر إكمال ${what}: طُبّق التغيير على ${applied.toLocaleString('en-US')} قطعة ثم تغيّرت قطعة أخرى منذ فتح القائمة. حدّث القائمة وأكمل الباقي.`
            : `تعذّر إكمال ${what} لأن بعض القطع تغيّرت منذ فتح القائمة. لم يتم تطبيق أي تغيير. حدّث القائمة وحاول مرة أخرى.`,
          { code: 'repo/bulk-conflict', cause: error, applied },
        );
      }
      throw error;
    }
  }

  /** Moves several records to Trash. Nothing is destroyed; Trash is reversible. */
  async bulkTrash(ids) {
    this.assertCanWrite();
    const items = ids.map((id) => this.item(id)).filter(Boolean);
    if (!items.length) return { trashed: 0 };

    this.setSync(SyncState.SAVING);
    // The same concurrency rule as a bulk edit: moving a record to the Trash
    // is a change to it, and a record somebody else has just edited is not one
    // this screen's stale copy gets to overwrite.
    const { applied, atomic } = await this._runBulk(items.map((item) => ({
      type: 'set',
      collection: 'items',
      id: item.id,
      merge: true,
      expectedVersion: item.version ?? 1,
      bumpVersion: true,
      data: {
        deletedAt: this.backend.serverTime,
        deletedBy: this.session.userId,
      },
    })), 'الحذف الجماعي');
    await this.log(ACTIONS.ITEMS_BULK_DELETED, { requested: items.length, count: applied, atomic });
    return { trashed: applied, atomic };
  }

  /**
   * Creates many records in one pass, for an import. Each one still goes
   * through `normalizeItem`, so a spreadsheet cannot write a shape the app
   * would not accept from its own form; only the per-record activity log is
   * traded for one entry naming the count.
   */
  async bulkCreateItems(records) {
    this.assertCanWrite();
    if (!records.length) return { created: 0 };
    const items = records.map((record) => normalizeItem(
      { ...record, createdBy: this.session.userId, updatedBy: this.session.userId },
      { userId: this.session.userId },
    ));
    this.setSync(SyncState.SAVING);
    await this.backend.runBatch(items.map((item) => ({
      type: 'set', collection: 'items', id: item.id, data: item, merge: false,
    })));
    await this.log(ACTIONS.IMPORT_MERGED, { items: items.length });
    return { created: items.length };
  }

  async bulkWrite(operations) {
    this.assertCanWrite();
    this.setSync(SyncState.SAVING);
    await this.backend.runBatch(operations);
  }

  /**
   * Throws unless the whole inventory is loaded. Anything that reads or
   * removes "everything" is silently wrong on a window, so it says so instead.
   */
  assertItemsComplete(what = 'هذه العملية') {
    if (!this.itemsComplete) {
      throw new AppError(`${what} تحتاج المخزون كاملاً، ولم يكتمل تحميله`, { code: 'repo/partial' });
    }
  }

  /** Removes every item and folder. Categories and locations are kept. */
  async clearInventory() {
    this.assertCanAdmin();
    // Every item — not every loaded item. On a window this would delete the
    // newest 200 and leave the rest behind, reporting success.
    await this.completeItems();
    this.assertItemsComplete('مسح المخزون');
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
