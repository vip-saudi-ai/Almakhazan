// Media asset ownership.
//
// An item does not own a Storage object; it holds a reference to a media asset
// that does. Duplicating an item raises that asset's reference count, so
// removing the image from the copy cannot destroy the file the original still
// displays. A file is physically deleted only once nothing points at it, and
// that deletion runs in the backend (functions/media.js), never from a browser.
//
//   workspaces/{workspaceId}/media/{mediaId}
//     { storagePath, thumbnailPath, url, thumbnailUrl, hash, mimeType,
//       width, height, fileSize, createdAt, createdBy, refCount, orphanedAt }

import { firebaseContext } from './firebase.js';
import * as local from './local-store.js';
import { AppError, uid } from './utils.js';

export const MEDIA_COLLECTION = 'media';

/** The item-side reference. Display fields are cached here to avoid an extra read. */
export function mediaReference(asset) {
  return {
    id: asset.id,
    mediaId: asset.id,
    storagePath: asset.storagePath,
    thumbnailPath: asset.thumbnailPath ?? null,
    url: asset.url ?? null,
    thumbnailUrl: asset.thumbnailUrl ?? null,
    originalFilename: asset.originalFilename ?? null,
    mimeType: asset.mimeType ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    fileSize: asset.fileSize ?? null,
    hash: asset.hash ?? null,
    uploadedAt: asset.createdAt ?? Date.now(),
    uploadedBy: asset.createdBy ?? null,
  };
}

export function mediaIdsOf(item) {
  if (!item?.images?.length) return [];
  return item.images.map((image) => image.mediaId || image.id).filter(Boolean);
}

/** Counts how many times each media id appears, so a batch moves by the right delta. */
export function referenceDelta(beforeItem, afterItem) {
  const counts = new Map();
  for (const id of mediaIdsOf(beforeItem)) counts.set(id, (counts.get(id) || 0) - 1);
  for (const id of mediaIdsOf(afterItem)) counts.set(id, (counts.get(id) || 0) + 1);
  for (const [id, delta] of counts) if (delta === 0) counts.delete(id);
  return counts;
}

// ── cloud backend ──────────────────────────────────────────────────────────
class CloudMediaStore {
  constructor(workspaceId) {
    this.workspaceId = workspaceId;
    const { db, sdk } = firebaseContext();
    this.db = db;
    this.fs = sdk.firestore;
  }

  ref(mediaId) {
    return this.fs.doc(this.db, 'workspaces', this.workspaceId, MEDIA_COLLECTION, mediaId);
  }

  async create(asset) {
    const id = asset.id || uid('med');
    await this.fs.setDoc(this.ref(id), {
      storagePath: asset.storagePath,
      thumbnailPath: asset.thumbnailPath ?? null,
      url: asset.url ?? null,
      thumbnailUrl: asset.thumbnailUrl ?? null,
      originalFilename: asset.originalFilename ?? null,
      mimeType: asset.mimeType ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      fileSize: asset.fileSize ?? null,
      hash: asset.hash ?? null,
      createdAt: this.fs.serverTimestamp(),
      createdBy: asset.createdBy ?? null,
      // Starts unreferenced: saving the item is what claims it. A form the user
      // abandons therefore leaves an asset at zero, which the backend sweeper
      // reclaims after its grace window — no orphan survives a cancelled edit.
      refCount: 0,
      orphanedAt: this.fs.serverTimestamp(),
    });
    return { ...asset, id, refCount: 0 };
  }

  async get(mediaId) {
    const snap = await this.fs.getDoc(this.ref(mediaId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  /**
   * Applies a reference delta transactionally. Security Rules cap each write at
   * ±1, so a multi-step change is applied as repeated single steps.
   */
  async adjust(mediaId, delta) {
    if (!delta) return null;
    const step = delta > 0 ? 1 : -1;
    let result = null;
    for (let i = 0; i < Math.abs(delta); i++) {
      result = await this._adjustOnce(mediaId, step);
    }
    return result;
  }

  async _adjustOnce(mediaId, step) {
    const ref = this.ref(mediaId);
    return this.fs.runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return null;
      const current = snap.data().refCount ?? 0;
      const next = Math.max(0, current + step);
      tx.update(ref, {
        refCount: next,
        // The backend sweeper deletes the file only after this has been set
        // for longer than the retention window.
        orphanedAt: next === 0 ? this.fs.serverTimestamp() : null,
      });
      return next;
    });
  }
}

// ── pending media ──────────────────────────────────────────────────────────
//
// An image uploaded into an open form belongs to no record yet: its asset sits
// at a reference count of nought until the save claims it. That is also
// exactly what an orphan looks like. The reconciler below must never mistake
// one for the other, so the form says which media it is holding, and they are
// left alone until it lets go.

const pending = new Set();

export function markPending(ids) { for (const id of ids || []) if (id) pending.add(id); }
export function releasePending(ids) { for (const id of ids || []) pending.delete(id); }
export function pendingMediaIds() { return new Set(pending); }

// ── local backend ──────────────────────────────────────────────────────────
class LocalMediaStore {
  async create(asset) {
    const id = asset.id || uid('med');
    const record = { ...asset, id, refCount: 0, orphanedAt: Date.now() };
    await local.put('mediaAssets', record);
    return record;
  }

  async get(mediaId) {
    // Keyed, not a scan: reference counting runs on every image add and remove,
    // and reading the whole asset table each time made saving an item cost the
    // size of the workspace's media rather than the size of the edit.
    return (await local.get('mediaAssets', mediaId)) || null;
  }

  /**
   * Read, count and — at nought — reclaim, in ONE readwrite transaction.
   *
   * It used to be a read in one transaction and a write in the next. Two tabs
   * each adding a reference to an asset at 1 both read 1 and both wrote 2, and
   * the asset that two more records now showed was one release away from
   * being deleted under them. IndexedDB serialises overlapping readwrite
   * transactions on the same store, so inside one the count read is the count
   * written against, and the decision to delete is made on the value this
   * transaction read — never on one another transaction may have changed.
   */
  async adjust(mediaId, delta) {
    if (!delta) return null;
    let next = null;
    await local.transaction(['mediaAssets', 'images'], 'readwrite', async (stores) => {
      const asset = await local.request(stores.mediaAssets.get(mediaId));
      if (!asset) return;
      next = Math.max(0, (asset.refCount ?? 0) + delta);
      if (next === 0 && !pending.has(mediaId)) {
        // On a single device there is no backend sweeper, so reclaim now.
        await local.request(stores.images.delete(mediaId));
        await local.request(stores.mediaAssets.delete(mediaId));
        return;
      }
      await local.request(stores.mediaAssets.put({
        ...asset,
        refCount: next,
        orphanedAt: next === 0 ? Date.now() : null,
      }));
    });
    return next;
  }

  /**
   * Reclaim the blob and its row — only if, read inside this same
   * transaction, nothing references it. A check in one transaction and a
   * delete in another would let a record pick the file up in between.
   */
  async discard(mediaId) {
    let removed = false;
    await local.transaction(['images', 'mediaAssets'], 'readwrite', async (stores) => {
      const asset = await local.request(stores.mediaAssets.get(mediaId));
      if (asset && (asset.refCount ?? 0) > 0) return;
      await local.request(stores.images.delete(mediaId));
      await local.request(stores.mediaAssets.delete(mediaId));
      removed = true;
    });
    return removed;
  }

  /** Set the count to what the records actually hold, inside one transaction. */
  async setCount(mediaId, refCount) {
    await local.transaction('mediaAssets', 'readwrite', async (stores) => {
      const asset = await local.request(stores.mediaAssets.get(mediaId));
      if (!asset) return;
      await local.request(stores.mediaAssets.put({
        ...asset, refCount, orphanedAt: refCount === 0 ? (asset.orphanedAt || Date.now()) : null,
      }));
    });
  }
}

export function mediaStore(session) {
  if (!session?.workspaceId) throw new AppError('error.media/no-workspace', { code: 'media/no-workspace' });
  return session.mode === 'cloud' ? new CloudMediaStore(session.workspaceId) : new LocalMediaStore();
}

/**
 * Throws away media that no record ever pointed at.
 *
 * An image uploaded into a form that is then abandoned — the customer
 * photographs something, changes their mind, closes the sheet — leaves a blob
 * on the device and an asset row with a reference count of nought. Nothing
 * ever adjusted that count, so nothing ever reclaimed it: on a phone, a
 * session of adding and abandoning a few records quietly cost tens of
 * megabytes that no record accounted for.
 *
 * The count is what decides. A second record may have picked up the same file
 * in the meantime — uploads are deduplicated by hash, so two records can share
 * one asset — and in that case this does nothing at all. Never destroy a file
 * something still points at.
 *
 * Only the device backend reclaims here. A cloud asset is already created
 * unreferenced and marked orphaned, and the backend sweeper collects it after
 * its grace window; deleting a Storage object from a browser is not something
 * this app does, for the same reason it is not something it can be trusted to
 * get right under a dropped connection.
 *
 * @returns {Promise<number>} how many assets were actually reclaimed.
 */
export async function discardUnreferenced(session, images) {
  if (!images?.length) return 0;
  const store = mediaStore(session);
  let reclaimed = 0;
  for (const image of images) {
    const mediaId = image.mediaId || image.id;
    if (!mediaId) continue;
    try {
      const asset = await store.get(mediaId);
      if (!asset) continue;
      if ((asset.refCount ?? 0) > 0) continue;
      if (await store.discard?.(mediaId, image)) reclaimed += 1;
    } catch (error) {
      // Reclaiming space is a courtesy; failing at it must never surface as an
      // error on a screen the customer has already walked away from.
      console.error(`[media] could not reclaim ${mediaId}`, error);
    }
  }
  return reclaimed;
}

/**
 * Applies every reference change implied by an item edit.
 * Failures are logged, never thrown: a reference-count drift is repaired by the
 * backend reconciler, whereas throwing here would lose the user's item edit.
 */
export async function applyReferenceDelta(session, beforeItem, afterItem) {
  const deltas = referenceDelta(beforeItem, afterItem);
  if (!deltas.size) return;
  const store = mediaStore(session);
  for (const [mediaId, delta] of deltas) {
    try {
      await store.adjust(mediaId, delta);
    } catch (error) {
      console.error(`[media] could not adjust refCount for ${mediaId}`, error);
    }
  }
}

/** Raises the count for every image a duplicate now shares with its source. */
export function retainAll(session, item) {
  return applyReferenceDelta(session, null, item);
}

/** Lowers the count for every image an item held, when it is purged. */
export function releaseAll(session, item) {
  return applyReferenceDelta(session, item, null);
}

// ── reconciling counts with what records hold ──────────────────────────────

/** How long an unreferenced asset is left alone before it may be reclaimed:
 *  long enough for a form in another tab to finish saving it. */
export const ORPHAN_GRACE_MS = 30 * 60 * 1000;

/**
 * Make the device's reference counts agree with its records.
 *
 * Counts are maintained incrementally, and an increment that is lost — a tab
 * killed between writing a record and adjusting its images' counts — is not
 * noticed by anything else. This walks the records once (a cursor, not a
 * copy), counts every image reference, and compares.
 *
 *   count wrong, asset referenced   the count is set to the real number. Safe:
 *                                   the records are the truth.
 *   referenced, asset missing       reported, never invented.
 *   nothing references it           an orphan. Reclaimed only when `reclaim`
 *                                   is asked for, it is not held by an open
 *                                   form, and it has been orphaned for longer
 *                                   than the grace window. Otherwise reported.
 *
 * Maintenance, not a hot path: run at startup at most once a day, before a
 * device-to-cloud upload, and by the integrity tests.
 *
 * @returns {Promise<{checked: number, corrected: Array, orphans: string[],
 *   reclaimed: string[], missing: Array}>}
 */
export async function reconcileLocalMediaReferences({ reclaim = false, now = Date.now() } = {}) {
  const actual = new Map();
  const missing = [];
  await local.walk('items', {
    batchSize: 500,
    onBatch: (batch) => {
      for (const item of batch) {
        for (const mediaId of mediaIdsOf(item)) actual.set(mediaId, (actual.get(mediaId) || 0) + 1);
      }
      return true;
    },
  });

  const store = new LocalMediaStore();
  const assets = await local.getAll('mediaAssets');
  const known = new Set(assets.map((asset) => asset.id));
  for (const mediaId of actual.keys()) if (!known.has(mediaId)) missing.push({ mediaId, references: actual.get(mediaId) });

  const held = pendingMediaIds();
  const corrected = [];
  const orphans = [];
  const reclaimed = [];
  for (const asset of assets) {
    const real = actual.get(asset.id) || 0;
    const stored = asset.refCount ?? 0;
    if (real > 0 && stored !== real) {
      await store.setCount(asset.id, real);
      corrected.push({ mediaId: asset.id, from: stored, to: real });
      continue;
    }
    if (real > 0) continue;
    if (held.has(asset.id)) continue;
    orphans.push(asset.id);
    if (stored !== 0) {
      await store.setCount(asset.id, 0);
      corrected.push({ mediaId: asset.id, from: stored, to: 0 });
    }
    const orphanedFor = now - (asset.orphanedAt || asset.createdAt || now);
    if (reclaim && orphanedFor >= ORPHAN_GRACE_MS && await store.discard(asset.id)) {
      reclaimed.push(asset.id);
    }
  }
  if (corrected.length || reclaimed.length || missing.length) {
    console.info('[media] reconciled', { corrected: corrected.length, reclaimed: reclaimed.length, missing: missing.length });
  }
  return { checked: assets.length, corrected, orphans, reclaimed, missing };
}

const RECONCILE_KEY = 'media.lastReconciledAt';

/**
 * The reconciler, at most once a day, on a device-only workspace. Housekeeping:
 * a failure is logged and the app opens regardless.
 */
export async function reconcileOccasionally(session, { now = Date.now(), minimumInterval = 24 * 60 * 60 * 1000 } = {}) {
  if (session?.mode === 'cloud') return null;
  try {
    const last = await local.getMeta(RECONCILE_KEY, 0);
    if (now - last < minimumInterval) return null;
    const result = await reconcileLocalMediaReferences({ reclaim: true, now });
    await local.setMeta(RECONCILE_KEY, now);
    return result;
  } catch (error) {
    console.error('[media] reconciliation could not run', error);
    return null;
  }
}
