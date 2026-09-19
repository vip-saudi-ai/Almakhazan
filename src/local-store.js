// IndexedDB store used when the app runs without a reachable cloud backend.
// LocalStorage holds only lightweight UI preferences (see prefs below) — never
// inventory records, images or secrets.

import { AppError } from './utils.js';

const DB_NAME = 'almakhzan';
const DB_VERSION = 1;
export const STORES = ['items', 'folders', 'categories', 'locations', 'activity', 'images', 'meta'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new AppError('المتصفح لا يدعم التخزين المحلي', { code: 'idb/unsupported' }));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
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

function run(storeName, mode, operation) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      tx.abort();
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result && typeof result.result !== 'undefined' ? result.result : result);
    tx.onerror = () => reject(storageError(tx.error));
    tx.onabort = () => reject(storageError(tx.error, true));
  }));
}

export function getAll(storeName) {
  return run(storeName, 'readonly', (store) => store.getAll());
}

export function put(storeName, record) {
  return run(storeName, 'readwrite', (store) => store.put(record));
}

export function putMany(storeName, records) {
  return run(storeName, 'readwrite', (store) => {
    for (const record of records) store.put(record);
  });
}

export function remove(storeName, id) {
  return run(storeName, 'readwrite', (store) => store.delete(id));
}

export function clearStore(storeName) {
  return run(storeName, 'readwrite', (store) => store.clear());
}

export async function getMeta(key, fallback = null) {
  const record = await run('meta', 'readonly', (store) => store.get(key));
  return record?.value ?? fallback;
}

export function setMeta(key, value) {
  return put('meta', { key, value });
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
