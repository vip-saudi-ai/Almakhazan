// IndexedDB store used when the app runs without a reachable cloud backend.
// LocalStorage holds only lightweight UI preferences (see prefs below) — never
// inventory records, images or secrets.
//
// This module is deliberately a thin, indexed key-value layer rather than a
// convenience wrapper around `getAll()`. A workspace at the Business limit is
// 20,000 records: reading all of them to answer "which items are in this
// folder" is 20,000 deserialisations for an answer an index gives directly,
// and it makes every relational operation scale with the inventory instead of
// with the result. Every read below is either a keyed lookup, an index range,
// or an explicit cursor — never a full materialisation unless the caller asks.

import { AppError } from './utils.js';

const DB_NAME = 'almakhzan';
// Bumped when STORES or INDEXES gains an entry. `onupgradeneeded` creates
// whatever is missing — stores and indexes alike — so an existing database
// upgrades in place without losing a single record. Never remove a store here
// to "clean up": an older tab may still be writing to it.
const DB_VERSION = 3;

/**
 * The shape of the database in one place. `key` is the keyPath; `indexes` maps
 * an index name to the property it indexes.
 *
 * Records whose indexed property is null or undefined are absent from that
 * index — that is IndexedDB's rule, not ours, and two of these indexes depend
 * on it: `deletedAt` therefore contains exactly the trashed records, and
 * `folderId` exactly the filed ones. Neither `sku` nor `barcode` is declared
 * unique: uniqueness is an application rule with its own error message, and a
 * unique index would instead abort the whole transaction — including an
 * import's other 499 rows — on a duplicate that already exists in old data.
 */
export const SCHEMA = {
  items: {
    key: 'id',
    indexes: {
      updatedAt: 'updatedAt',
      createdAt: 'createdAt',
      folderId: 'folderId',
      categoryId: 'categoryId',
      locationId: 'locationId',
      sku: 'sku',
      barcode: 'barcode',
      deletedAt: 'deletedAt',
    },
  },
  folders: { key: 'id', indexes: {} },
  categories: { key: 'id', indexes: {} },
  locations: { key: 'id', indexes: {} },
  activity: { key: 'id', indexes: { timestamp: 'timestamp' } },
  images: { key: 'id', indexes: {} },
  mediaAssets: { key: 'id', indexes: {} },
  importJobs: { key: 'id', indexes: { startedAt: 'startedAt' } },
  meta: { key: 'key', indexes: {} },
};

export const STORES = Object.keys(SCHEMA);

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new AppError('المتصفح لا يدعم التخزين المحلي', { code: 'idb/unsupported' }));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      for (const [name, spec] of Object.entries(SCHEMA)) {
        const store = db.objectStoreNames.contains(name)
          ? tx.objectStore(name)
          : db.createObjectStore(name, { keyPath: spec.key });
        // Adding an index to a populated store backfills it from the existing
        // records inside this same upgrade transaction, so a database written
        // by an older version gains working indexes without a re-import.
        for (const [indexName, keyPath] of Object.entries(spec.indexes)) {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath);
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab running a newer build needs this connection out of the way,
      // or its upgrade blocks forever and that tab simply never starts.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(new AppError('تعذّر فتح التخزين المحلي', {
      code: 'idb/open-failed', cause: request.error,
    }));
    request.onblocked = () => reject(new AppError('التخزين المحلي مشغول في تبويب آخر', {
      code: 'idb/blocked',
    }));
  });
  return dbPromise;
}

/** A full quota is the common failure here, and it needs its own advice. */
function storageError(cause, aborted = false) {
  if (cause?.name === 'QuotaExceededError') {
    return new AppError('مساحة التخزين على هذا الجهاز ممتلئة — احذف صوراً أو سجّل الدخول للحفظ سحابياً', {
      code: 'idb/quota', cause,
    });
  }
  return new AppError(
    aborted ? 'أُلغيت عملية التخزين المحلي' : `فشل الحفظ المحلي${cause?.name ? ` (${cause.name})` : ''}`,
    { code: aborted ? 'idb/tx-aborted' : 'idb/tx-failed', cause },
  );
}

/** One IDBRequest as a promise. Resolving inside `onsuccess` keeps the
 *  surrounding transaction alive, which is what lets `transaction()` below
 *  await several requests in sequence. */
export function request(idbRequest) {
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => reject(storageError(idbRequest.error));
  });
}

/** The same helper under the name the rest of this module reads better with. */
const req = request;

/**
 * Run `work` inside one transaction spanning `storeNames`, and resolve only
 * once that transaction has actually committed.
 *
 * This is the difference between "several writes" and "one write": a folder
 * deletion that moves 300 records to the root and then removes the folder must
 * not be able to half-happen. If `work` throws, the transaction is aborted and
 * every write inside it is rolled back.
 *
 * `work` receives a map of store name → objectStore. It may await the promises
 * returned by the helpers below; it must not await anything else (a timer, a
 * fetch), because a transaction ends as soon as it has no pending request.
 */
export function transaction(storeNames, mode, work) {
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    const stores = {};
    for (const name of names) stores[name] = tx.objectStore(name);
    let value;
    let failure = null;
    tx.oncomplete = () => (failure ? reject(failure) : resolve(value));
    tx.onerror = () => reject(failure || storageError(tx.error));
    tx.onabort = () => reject(failure || storageError(tx.error, true));
    Promise.resolve()
      .then(() => work(stores, tx))
      .then((result) => { value = result; })
      .catch((error) => {
        failure = error;
        try { tx.abort(); } catch { /* already settled */ }
      });
  }));
}

function run(storeName, mode, operation) {
  return transaction(storeName, mode, (stores) => operation(stores[storeName]));
}

// ── reads ──────────────────────────────────────────────────────────────────

/** Every record in a store. Appropriate for the taxonomies, which are small by
 *  design; for `items` prefer an index, a cursor page, or `scan`. */
export function getAll(storeName) {
  return run(storeName, 'readonly', (store) => req(store.getAll()));
}

/** One record by primary key — the lookup `getAll().find()` was standing in for. */
export function get(storeName, id) {
  if (id == null) return Promise.resolve(undefined);
  return run(storeName, 'readonly', (store) => req(store.get(id)));
}

export function getMany(storeName, ids) {
  const wanted = [...new Set(ids.filter((id) => id != null))];
  if (!wanted.length) return Promise.resolve([]);
  return run(storeName, 'readonly', async (store) => {
    const found = [];
    for (const id of wanted) {
      const row = await req(store.get(id));
      if (row) found.push(row);
    }
    return found;
  });
}

export function count(storeName) {
  return run(storeName, 'readonly', (store) => req(store.count()));
}

/** Records whose indexed property equals `value`. The answer costs the size of
 *  the answer, not the size of the store. */
export function getAllByIndex(storeName, indexName, value, limit) {
  return run(storeName, 'readonly', (store) => {
    const index = store.index(indexName);
    const range = value instanceof IDBKeyRange ? value : IDBKeyRange.only(value);
    return req(limit ? index.getAll(range, limit) : index.getAll(range));
  });
}

/** The first record matching an index value, without materialising the rest —
 *  what a uniqueness check actually needs. */
export async function firstByIndex(storeName, indexName, value) {
  const rows = await getAllByIndex(storeName, indexName, value, 1);
  return rows[0] || null;
}

export function countByIndex(storeName, indexName, value) {
  return run(storeName, 'readonly', (store) => {
    const index = store.index(indexName);
    const range = value instanceof IDBKeyRange ? value : IDBKeyRange.only(value);
    return req(index.count(range));
  });
}

/**
 * One page of a store or index, walked with a cursor.
 *
 * `after` is the key the previous page ended on, so paging never re-sorts or
 * re-reads what came before. When paging an index whose keys tie — `updatedAt`
 * after a bulk write gives hundreds of records the same millisecond — pass the
 * primary key too, as `afterPrimary`: the cursor then resumes at the exact
 * record rather than at the first of the tied group, which would otherwise
 * repeat rows or skip them.
 */
export function page(storeName, {
  index: indexName = null, direction = 'next', limit = 200,
  range = null, after, afterPrimary,
} = {}) {
  return run(storeName, 'readonly', async (store) => {
    const source = indexName ? store.index(indexName) : store;
    const rows = [];
    const request = source.openCursor(range, direction);
    let positioned = after === undefined;
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve({ rows, nextKey: null, nextPrimaryKey: null, done: true });
          return;
        }
        if (!positioned) {
          positioned = true;
          // `continuePrimaryKey` is the tie-safe resume; it exists only on
          // index cursors, so a store cursor resumes by key with `>`/`<`.
          if (indexName && afterPrimary !== undefined) {
            cursor.continuePrimaryKey(after, afterPrimary);
            return;
          }
          cursor.continue(after);
          return;
        }
        rows.push(cursor.value);
        if (rows.length >= limit) {
          resolve({ rows, nextKey: cursor.key, nextPrimaryKey: cursor.primaryKey, done: false });
          return;
        }
        cursor.continue();
      };
    });
  });
}

/**
 * Every record, a page at a time, ordered by primary key — the order a scan
 * needs, because it is the only one that cannot tie.
 *
 * Each page gets its own short transaction rather than one long-lived cursor:
 * a transaction held open across 40 awaited callbacks blocks every write
 * behind it, and the caller's `onPage` is free to be slow.
 */
export async function scan(storeName, { pageSize = 500, onPage } = {}) {
  let after;
  for (;;) {
    const { rows, done } = await page(storeName, { limit: pageSize, after });
    if (rows.length) await onPage?.(rows);
    if (done || rows.length < pageSize) return;
    after = rows[rows.length - 1][SCHEMA[storeName]?.key || 'id'];
  }
}

// ── writes ─────────────────────────────────────────────────────────────────

export function put(storeName, record) {
  return run(storeName, 'readwrite', (store) => req(store.put(record)));
}

/** Several records in one transaction: either all of them land or none do. */
export function putMany(storeName, records) {
  if (!records.length) return Promise.resolve(0);
  return run(storeName, 'readwrite', async (store) => {
    for (const record of records) await req(store.put(record));
    return records.length;
  });
}

export const batchPut = putMany;

export function remove(storeName, id) {
  return run(storeName, 'readwrite', (store) => req(store.delete(id)));
}

export function removeMany(storeName, ids) {
  if (!ids.length) return Promise.resolve(0);
  return run(storeName, 'readwrite', async (store) => {
    for (const id of ids) await req(store.delete(id));
    return ids.length;
  });
}

export const batchDelete = removeMany;

export function clearStore(storeName) {
  return run(storeName, 'readwrite', (store) => req(store.clear()));
}

export async function getMeta(key, fallback = null) {
  const record = await get('meta', key);
  return record?.value ?? fallback;
}

export function setMeta(key, value) {
  return put('meta', { key, value });
}

// ── device storage budget ──────────────────────────────────────────────────

/**
 * How much room this origin is using and has. Browsers report an approximation
 * — and Safari reports nothing useful at all — so a null here means "unknown",
 * never "empty", and the caller must not present it as a number.
 */
export async function storageEstimate() {
  if (!navigator?.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number' || !quota) return null;
    return { usage, quota, ratio: usage / quota, remaining: Math.max(0, quota - usage) };
  } catch {
    return null;
  }
}

/**
 * Ask the browser to stop evicting this origin under storage pressure. A
 * device-only inventory is the customer's only copy of it; eviction is data
 * loss, not a cleared cache. Returns whether the data is persisted — declining
 * is normal and is not an error.
 */
export async function requestPersistence() {
  if (!navigator?.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// ── UI preferences (LocalStorage is appropriate here) ──
const PREF_KEY = 'almakhzan.prefs';

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('[prefs] unreadable, using defaults', error);
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch (error) {
    // Private mode or a full quota: preferences are expendable, data is not.
    console.error('[prefs] could not be saved', error);
  }
}
