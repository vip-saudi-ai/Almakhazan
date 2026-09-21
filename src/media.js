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

  async adjust(mediaId, delta) {
    if (!delta) return null;
    const asset = await this.get(mediaId);
    if (!asset) return null;
    const next = Math.max(0, (asset.refCount ?? 0) + delta);
    await local.put('mediaAssets', {
      ...asset,
      refCount: next,
      orphanedAt: next === 0 ? Date.now() : null,
    });
    // On a single device there is no backend sweeper, so reclaim immediately.
    if (next === 0) await this.discard(mediaId);
    return next;
  }

  /** Reclaim now: the blob and its row, in one transaction. */
  async discard(mediaId) {
    await local.transaction(['images', 'mediaAssets'], 'readwrite', async (stores) => {
      await local.request(stores.images.delete(mediaId));
      await local.request(stores.mediaAssets.delete(mediaId));
    });
    return true;
  }
}

export function mediaStore(session) {
  if (!session?.workspaceId) throw new AppError('لا يوجد مخزن نشط', { code: 'media/no-workspace' });
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
