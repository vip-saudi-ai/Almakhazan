// The restore index: what an incoming Full Backup contains, kept on disk under
// the restore's own key — [key, collection, id] in the `restoreIndex` store —
// instead of in a set of every id in the page's memory.
//
// It is built while the backup is verified, before anything is written:
//   items / categories / fieldDefinitions / locations / folders
//       the records the backup holds (a repeated id is a damaged backup)
//   media / media-missing
//       the images the backup carries, and the ones it declares missing
// and it answers the two questions a replacement restore needs at any size:
// does the backup reference this image, and does the backup hold this record
// (if not, the old record is removed). It survives an interruption, so an
// unfinished restore resumes with it; it is deleted when the restore completes.

import * as local from './local-store.js';
import { AppError } from './utils.js';

const indexError = (cause) => new AppError('restore.indexFailed', { code: 'restore/index-failed', cause });

async function guarded(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError && error.code !== 'idb/tx-failed' && error.code !== 'idb/tx-aborted') throw error;
    throw indexError(error);
  }
}

/**
 * Adds ids under a collection in one transaction. With `unique`, an id that
 * is already there — from this call or an earlier one — is returned as a
 * duplicate instead of being written twice.
 */
export function markMany(key, collection, ids, { unique = true } = {}) {
  if (!ids.length) return Promise.resolve([]);
  return guarded(() => local.transaction('restoreIndex', 'readwrite', async ({ restoreIndex }) => {
    const duplicates = [];
    for (const id of ids) {
      if (unique && await local.request(restoreIndex.count([key, collection, id]))) { duplicates.push(id); continue; }
      await local.request(restoreIndex.put({ job: key, collection, id }));
    }
    return duplicates;
  }));
}

/** Which of these ids are under any of these collections, in one transaction. */
export function presentIn(key, collections, ids) {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return Promise.resolve(new Set());
  return guarded(() => local.transaction('restoreIndex', 'readonly', async ({ restoreIndex }) => {
    const found = new Set();
    for (const id of wanted) {
      for (const collection of collections) {
        if (await local.request(restoreIndex.count([key, collection, id]))) { found.add(id); break; }
      }
    }
    return found;
  }));
}

/** How many ids a collection holds for this key. */
export function countOf(key, collection) {
  return guarded(() => local.countFresh('restoreIndex', local.prefixRange(key, collection)));
}

/** The ids of one collection a page at a time, in key order, from after `after`. */
export async function idsPage(key, collection, { after, limit = 500 } = {}) {
  const keys = await guarded(() => local.keysPage('restoreIndex', {
    range: local.prefixRange(key, collection),
    after: after === undefined ? undefined : [key, collection, after],
    limit,
  }));
  return keys.map((k) => k[2]);
}

/** Everything under a key, or one collection of it. */
export function clear(key, collection = null) {
  const range = collection ? local.prefixRange(key, collection) : local.prefixRange(key);
  return guarded(() => local.deleteKeyRange('restoreIndex', range));
}

/**
 * Removes every key's entries except those named — what an abandoned check or
 * a completed restore left behind. One cursor step per distinct key.
 */
export async function clearExcept(keep) {
  const kept = new Set([...keep].filter(Boolean));
  let after;
  for (;;) {
    const [first] = await guarded(() => local.keysPage('restoreIndex', { after, limit: 1 }));
    if (!first) return;
    const job = first[0];
    if (!kept.has(job)) await clear(job);
    // Past every key of this job: an array sorts after any string or number.
    after = [job, []];
  }
}
