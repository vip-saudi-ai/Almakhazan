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
import { GENERATED_SKU_MAX, formatGeneratedSku, generatedSkuPrefix, parseGeneratedSku } from './sku.js';

const DB_NAME = 'almakhzan';
// Bumped when STORES or INDEXES gains an entry. `onupgradeneeded` creates
// whatever is missing — stores and indexes alike — so an existing database
// upgrades in place without losing a single record. Never remove a store here
// to "clean up": an older tab may still be writing to it.
const DB_VERSION = 8;

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
      serialNumber: 'serialNumber',
      // An equality filter the customer can apply from the filter sheet, so it
      // is a base the query engine can start from rather than a predicate it
      // has to test record by record. Every record has carried a `condition`
      // since the first schema (possibly the empty string, which is a valid
      // key), so an existing database backfills this index completely.
      condition: 'condition',
      // ── scope + time ──
      //
      // These exist because an equality index does not order by anything the
      // customer asked for. `folderId` orders by folder and then by record id,
      // so reading the first 24 entries of a 740-record folder and sorting
      // *those* by date produced a page that was internally ordered and
      // globally wrong: the actual newest record could be the 700th entry and
      // never reach the page at all.
      //
      // A compound key puts the date inside the index, so the cursor hands
      // records over in the order the screen asked for and the first page is
      // the first page. The primary key still breaks ties between records
      // created in the same millisecond.
      folderCreatedAt: ['folderId', 'createdAt'],
      categoryCreatedAt: ['categoryId', 'createdAt'],
      locationCreatedAt: ['locationId', 'createdAt'],
      // Which import wrote this record, so cancelling one can find its records
      // without reading the inventory. Null on everything else, and IndexedDB
      // does not index null, so the index holds imported records only.
      importJobId: 'importJobId',
      // ── scope + trash ──
      //
      // A live record carries `deletedAt: null`, and a compound key with a
      // null part is not a valid key, so IndexedDB leaves the record out of
      // these indexes entirely. Each one therefore holds exactly the trashed
      // records of each folder, category or location — which makes "how many
      // live records are in this folder" two range counts and a subtraction,
      // with no walk and no stored flag that could drift from `deletedAt`.
      // An existing database backfills them in the upgrade transaction.
      // The currencies the inventory holds values in, without reading it: a
      // record with no valuation has no key here and is left out. The
      // `...Deleted` twin holds the same for the Trash, as above.
      valuationCurrency: 'valuation.currency',
      currencyDeleted: ['valuation.currency', 'deletedAt'],
      folderDeleted: ['folderId', 'deletedAt'],
      categoryDeleted: ['categoryId', 'deletedAt'],
      locationDeleted: ['locationId', 'deletedAt'],
      deletedAt: 'deletedAt',
    },
  },
  folders: { key: 'id', indexes: {} },
  categories: { key: 'id', indexes: {} },
  locations: { key: 'id', indexes: {} },
  activity: { key: 'id', indexes: { timestamp: 'timestamp' } },
  images: { key: 'id', indexes: {} },
  mediaAssets: { key: 'id', indexes: {} },
  importJobs: {
    key: 'id',
    // A stopped import is found by what the file *is*, not by what it is
    // called — see `fileFingerprint` in views/sheet-import.js.
    indexes: { startedAt: 'startedAt', fileFingerprint: 'fileFingerprint', status: 'status' },
  },
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
  if (mode === 'readwrite') for (const name of names) storeCounts.delete(name);
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

/**
 * Which of these keys are present in the store, without reading the records.
 * One transaction, one keyed probe per id — what a merge needs to know before
 * it writes, and nothing it does not.
 */
export function existingKeys(storeName, ids) {
  const wanted = [...new Set(ids.filter((id) => id != null))];
  if (!wanted.length) return Promise.resolve(new Set());
  return run(storeName, 'readonly', async (store) => {
    const found = new Set();
    for (const id of wanted) {
      if (await req(store.count(id))) found.add(id);
    }
    return found;
  });
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

/**
 * How many records a store holds.
 *
 * Cached, because it is not the O(1) lookup it reads as: counting a store with
 * no key range walks it, and at 20,000 records that was 15ms — charged to
 * every query, to produce a number that only changes when a record is written.
 * Any write to the store drops the cached value (see `transaction`).
 *
 * The cache is per tab. Another tab adding a record leaves this one's total
 * stale until its own next write or reload, which is a few records' drift in a
 * displayed total rather than a wrong answer to a query.
 */
const storeCounts = new Map();

export async function count(storeName) {
  if (storeCounts.has(storeName)) return storeCounts.get(storeName);
  const total = await run(storeName, 'readonly', (store) => req(store.count()));
  storeCounts.set(storeName, total);
  return total;
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

/**
 * The records under each of several index values, in one read transaction.
 * One request per value, all queued at once in the same transaction — a
 * uniqueness check over several hundred SKUs is one round trip to the
 * database, not several hundred sequential ones, and it touches only the
 * matching records, never the store.
 * @returns {Promise<Map<*, object[]>>}
 */
export function getAllByIndexValues(storeName, indexName, values) {
  return run(storeName, 'readonly', async (store) => {
    const index = store.index(indexName);
    const pending = values.map((value) => req(index.getAll(IDBKeyRange.only(value))).then((rows) => [value, rows]));
    return new Map(await Promise.all(pending));
  });
}

/**
 * The primary keys of the records matching an index value, without reading the
 * records themselves.
 *
 * Cancelling an import has to delete up to twenty thousand records. Reading
 * them first to learn their ids would put the whole import in memory to throw
 * it away, which is the one thing the rest of this file exists to avoid.
 */
export function keysByIndex(storeName, indexName, value, limit) {
  return run(storeName, 'readonly', (store) => {
    const index = store.index(indexName);
    const range = value instanceof IDBKeyRange ? value : IDBKeyRange.only(value);
    return req(limit ? index.getAllKeys(range, limit) : index.getAllKeys(range));
  });
}

/**
 * The distinct keys of an index, one cursor step per distinct value — the
 * cost is the number of different values, not the number of records.
 */
export function uniqueKeys(storeName, indexName) {
  return run(storeName, 'readonly', (store) => new Promise((resolve, reject) => {
    const keys = [];
    const cursorRequest = store.index(indexName).openKeyCursor(null, 'nextunique');
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) { resolve(keys); return; }
      keys.push(cursor.key);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(storageError(cursorRequest.error));
  }));
}

/**
 * The highest generated SKU sequence for a year, read from the `sku` index
 * backwards over `INV-<year>-000000 … INV-<year>-999999`. Generated sequences
 * are exactly six digits (see sku.js), and among strings of one length text
 * order is numeric order — so the first key met that parses as a generated SKU
 * is the highest. Keys of other shapes inside the range (custom SKUs sharing
 * the prefix) are stepped over.
 */
export function maxSkuSequence(year) {
  const prefix = generatedSkuPrefix(year);
  const range = IDBKeyRange.bound(`${prefix}000000`, `${prefix}999999`);
  return run('items', 'readonly', (store) => new Promise((resolve, reject) => {
    const cursorRequest = store.index('sku').openKeyCursor(range, 'prev');
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) { resolve(0); return; }
      const parsed = parseGeneratedSku(String(cursor.key));
      if (parsed && parsed.year === year) { resolve(parsed.sequence); return; }
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(storageError(cursorRequest.error));
  }));
}

/** Set once the year-less counter from before per-year counters has been
 *  considered. After that it is never read again. */
const LEGACY_SKU_KEY = 'counter.sku';
const LEGACY_SKU_MIGRATED = 'counter.sku.legacyMigrated';

/**
 * Take the next generated SKU sequence for a year, in ONE readwrite
 * transaction on the meta store, so two tabs cannot take the same number.
 *
 *   · the counter (`counter.sku.<year>`) holds the LAST sequence handed out,
 *     and is written before this resolves — a number returned is always one
 *     the counter has already reached;
 *   · the result is above `floor`, the highest generated SKU on record for
 *     the year, so records imported or restored with higher SKUs than the
 *     counter issued are never collided with;
 *   · each year starts again at 000001.
 *
 * The year-less counter the app used before is considered once, ever — the
 * first reservation of any year writes the marker, in the same transaction.
 * It counts toward a year only on evidence that it was counting that year:
 * the SKU it last handed out, INV-<year>-<its value>, is on record (live or
 * in the Trash). Without that, the data on record decides — so a counter
 * left at 850 in 2026 does not start 2027 at 000851 even when 2027 already
 * has imported generated SKUs; 2027 continues from its own highest.
 *
 * @throws {AppError} `repo/sku-exhausted` past INV-<year>-999999
 */
export function reserveSkuSequence(year, floor = 0) {
  const key = `counter.sku.${year}`;
  return transaction(['meta', 'items'], 'readwrite', async ({ meta, items }) => {
    const current = await req(meta.get(key));
    let last = Number(current?.value) || 0;
    if (current == null) {
      const migrated = await req(meta.get(LEGACY_SKU_MIGRATED));
      if (!migrated) {
        const legacy = Number((await req(meta.get(LEGACY_SKU_KEY)))?.value) || 0;
        const evidence = legacy > 0 && legacy <= GENERATED_SKU_MAX
          && (await req(items.index('sku').count(IDBKeyRange.only(formatGeneratedSku(legacy, year))))) > 0;
        if (evidence) last = Math.max(last, legacy);
        await req(meta.put({ key: LEGACY_SKU_MIGRATED, value: { year, legacy, applied: evidence } }));
      }
    }
    const next = Math.max(last, Number(floor) || 0) + 1;
    if (next > GENERATED_SKU_MAX) {
      throw new AppError('تعذّر إنشاء رمز تلقائي جديد لهذه السنة.', { code: 'repo/sku-exhausted' });
    }
    await req(meta.put({ key, value: next }));
    return next;
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
 * `after` / `afterPrimary` are the key and primary key the previous page ended
 * on, and continuation from them is EXCLUSIVE: the first record of this page is
 * the one after that record, never that record again.
 *
 * This is not what `continue(key)` does. IDB positions the cursor ON the key,
 * so resuming from the last row of a page returned that row as the first row of
 * the next page. With a page size of 24 that is one duplicate every screen, and
 * with `updatedAt` after a bulk write — where hundreds of records share a
 * millisecond — resuming by key alone did worse: it either replayed the whole
 * tied group or skipped past it. Hence the primary key in the cursor, and the
 * explicit step past the boundary below.
 *
 * If the boundary record has been deleted since the previous page, the cursor
 * lands on the record *after* it instead, which is a real record and is kept.
 *
 * @returns {{rows, nextKey, nextPrimaryKey, done}}
 */
export function page(storeName, {
  index: indexName = null, direction = 'next', limit = 200,
  range = null, after, afterPrimary, offset = 0,
} = {}) {
  return run(storeName, 'readonly', (store) => {
    const source = indexName ? store.index(indexName) : store;
    const rows = [];
    // An index cursor resumed by key alone cannot be exclusive per-record —
    // every tied entry shares that key. Narrow the range instead, which is
    // exactly "keys beyond this one".
    const effectiveRange = (indexName && after !== undefined && afterPrimary === undefined)
      ? boundRange(range, after, direction)
      : range;
    const seeking = after !== undefined && effectiveRange === range;

    const request = source.openCursor(effectiveRange, direction);
    let phase = seeking ? 'seek' : 'collect';
    let skip = Math.max(0, offset);

    return new Promise((resolve, reject) => {
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve({ rows, nextKey: null, nextPrimaryKey: null, done: true });
          return;
        }

        if (phase === 'seek') {
          phase = 'boundary';
          // `continuePrimaryKey` is the tie-safe seek and exists only on index
          // cursors; a store cursor's key already is its primary key.
          if (indexName && afterPrimary !== undefined) cursor.continuePrimaryKey(after, afterPrimary);
          else cursor.continue(after);
          return;
        }

        if (phase === 'boundary') {
          phase = 'collect';
          const onBoundary = indexedDB.cmp(cursor.key, after) === 0
            && (afterPrimary === undefined || indexedDB.cmp(cursor.primaryKey, afterPrimary) === 0);
          if (onBoundary) { cursor.continue(); return; }
        }

        // Jumping to a numbered page. `advance` skips inside the engine without
        // handing a record over, so page 200 of an indexed list costs a walk of
        // the index rather than 4,800 deserialised records.
        if (skip > 0) {
          const step = skip;
          skip = 0;
          cursor.advance(step);
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

/** The part of `range` strictly beyond `key`, in the cursor's direction. */
function boundRange(range, key, direction) {
  const back = direction === 'prev' || direction === 'prevunique';
  if (!range) {
    return back ? IDBKeyRange.upperBound(key, true) : IDBKeyRange.lowerBound(key, true);
  }
  return back
    ? IDBKeyRange.bound(range.lower ?? key, key, range.lowerOpen ?? false, true)
    : IDBKeyRange.bound(key, range.upper ?? key, true, range.upperOpen ?? false);
}

/** How many records a range holds, without reading any of them. */
export function countRange(storeName, indexName, range) {
  // An unbounded count of the store itself is the cached one — the same
  // question `count()` answers, and the expensive one.
  if (!indexName && !range) return count(storeName);
  return run(storeName, 'readonly', (store) => {
    const source = indexName ? store.index(indexName) : store;
    return req(range ? source.count(range) : source.count());
  });
}

/**
 * Walk a store or index, handing each batch to `onBatch`, and stop as soon as
 * it says to. This is the primitive behind a search that must not materialise
 * the inventory: it reads in pages, lets the caller keep only what matches,
 * and yields between pages so the tab stays answerable.
 *
 * @param {(rows: Array) => (boolean|Promise<boolean>)} onBatch return false to stop.
 * @param {number|Function} [batchSize] a function is asked before each batch,
 *   so a caller can start small and grow once it learns how selective its
 *   predicate is.
 * @param {*} [after] / @param {*} [afterPrimary] resume from a position rather
 *   than from the start — the same exclusive boundary `page` uses.
 */
export async function walk(storeName, {
  index: indexName = null, direction = 'next', range = null,
  batchSize = 400, onBatch, after: startKey, afterPrimary: startPrimary,
} = {}) {
  let after = startKey;
  let afterPrimary = startPrimary;
  let scanned = 0;
  for (;;) {
    const limit = typeof batchSize === 'function' ? batchSize() : batchSize;
    const result = await page(storeName, {
      index: indexName, direction, range, limit, after, afterPrimary,
    });
    if (result.rows.length) {
      scanned += result.rows.length;
      if ((await onBatch?.(result.rows)) === false) return { scanned, exhausted: false };
    }
    if (result.done || result.rows.length < limit) return { scanned, exhausted: true };
    after = result.nextKey;
    afterPrimary = result.nextPrimaryKey;
  }
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

/**
 * Delete everything in one index range, without reading any of it.
 *
 * A cursor over the index deletes in place: the records never leave the
 * database, so pruning a year of activity costs the entries removed rather
 * than the entries kept. Reading them all in to filter them is the shape this
 * exists to avoid.
 *
 * @returns {Promise<number>} how many were removed.
 */
export function deleteRange(storeName, indexName, range) {
  return run(storeName, 'readwrite', (store) => new Promise((resolve, reject) => {
    const source = indexName ? store.index(indexName) : store;
    // A key cursor hands over keys, not records: the values are never
    // deserialised on their way to being thrown away.
    const request = source.openKeyCursor(range);
    let removed = 0;
    request.onerror = () => reject(storageError(request.error));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(removed); return; }
      store.delete(cursor.primaryKey);
      removed += 1;
      cursor.continue();
    };
  }));
}

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
