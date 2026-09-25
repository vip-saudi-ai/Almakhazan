// Uploading a device's local inventory into a cloud workspace.
//
// The hard part is the images: local records point at `local:{id}` blobs in
// IndexedDB, which mean nothing to another device. Every one is uploaded to
// Storage and its reference rewritten before the item document is written, so
// a cloud document can never contain an unusable local reference.
//
// The run is checkpointed per item and resumable, and the local copy is left
// untouched until the whole thing is verified.
//
// The cloud copy wins. A record the workspace already has under the same id is
// never replaced by the device's copy: it is skipped before its images are
// uploaded when that is known up front, and the write itself is `ifAbsent`, so
// one created by another device mid-run is skipped at the commit too — and
// the images uploaded for it are left unclaimed for the sweeper, not counted.

import * as local from './local-store.js';
import { discardUnreferenced, mediaStore, mediaReference, reconcileLocalMediaReferences } from './media.js';
import { repository } from './repository.js';
import { firebaseContext } from './firebase.js';
import { AppError, uid } from './utils.js';
import { t } from './i18n.js';

const STATE_KEY = 'deviceUpload.v1';

export const UploadState = {
  IDLE: 'idle',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export async function deviceUploadState() {
  return (await local.getMeta(STATE_KEY)) || { status: UploadState.IDLE };
}

/** Anything still sitting in this device's local store. */
export async function localDataSummary() {
  const [items, folders, categories, locations, mediaAssets] = await Promise.all([
    local.getAll('items'), local.getAll('folders'),
    local.getAll('categories'), local.getAll('locations'),
    local.getAll('mediaAssets').catch(() => []),
  ]);
  const localImages = items.reduce(
    (sum, item) => sum + (item.images || []).filter(isLocalImage).length, 0,
  );
  return {
    items: items.length,
    folders: folders.length,
    categories: categories.length,
    locations: locations.length,
    images: localImages,
    mediaAssets: mediaAssets.length,
  };
}

export function isLocalImage(image) {
  return typeof image?.storagePath === 'string' && image.storagePath.startsWith('local:');
}

function localBlobId(image) {
  return image.storagePath.slice('local:'.length);
}

const EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
};

function toBlob(data, type) {
  if (data instanceof Blob) return data;
  if (!data) return null;
  return new Blob([data], { type: type || 'image/jpeg' });
}

/**
 * Uploads one locally stored image and returns a cloud media reference.
 * Throws if the blob is missing, so the caller can record the failure rather
 * than writing a broken reference.
 */
/**
 * The stored bytes behind one local image: one keyed read. It used to read the
 * whole image table and search it — for every image — so a device with 3,000
 * photographs read 3,000 × 3,000 rows (and their bytes) to upload them.
 */
export async function readLocalImageRecord(image) {
  return (await local.get('images', localBlobId(image))) || null;
}

async function uploadLocalImage(image, ctx) {
  const record = await readLocalImageRecord(image);
  if (!record) {
    throw new AppError('error.upload/missing-blob', { code: 'upload/missing-blob' });
  }

  const originalBlob = toBlob(record.original, record.originalType || image.mimeType);
  const thumbnailBlob = toBlob(record.thumbnail, record.thumbnailType || 'image/jpeg') || originalBlob;
  if (!originalBlob) {
    throw new AppError('error.upload/empty-blob', { code: 'upload/empty-blob' });
  }

  const { storage, sdk } = firebaseContext();
  const mediaId = uid('med');
  const mimeType = originalBlob.type || 'image/jpeg';
  const extension = EXTENSIONS[mimeType] || 'jpg';
  const prefix = `workspaces/${ctx.workspaceId}/items/${ctx.itemId}`;
  const storagePath = `${prefix}/original/${mediaId}.${extension}`;
  const thumbnailPath = `${prefix}/thumbnails/${mediaId}.jpg`;

  const originalRef = sdk.storage.ref(storage, storagePath);
  await sdk.storage.uploadBytes(originalRef, originalBlob, {
    contentType: mimeType,
    cacheControl: 'public,max-age=31536000,immutable',
    customMetadata: { migratedFrom: 'device', uploadedBy: ctx.userId || '' },
  });

  const thumbRef = sdk.storage.ref(storage, thumbnailPath);
  await sdk.storage.uploadBytes(thumbRef, thumbnailBlob, {
    contentType: thumbnailBlob.type || 'image/jpeg',
    cacheControl: 'public,max-age=31536000,immutable',
  });

  const [url, thumbnailUrl] = await Promise.all([
    sdk.storage.getDownloadURL(originalRef),
    sdk.storage.getDownloadURL(thumbRef),
  ]);

  const asset = await mediaStore({ mode: 'cloud', workspaceId: ctx.workspaceId }).create({
    id: mediaId,
    storagePath,
    thumbnailPath,
    url,
    thumbnailUrl,
    originalFilename: image.originalFilename ?? null,
    mimeType,
    width: image.width ?? null,
    height: image.height ?? null,
    fileSize: originalBlob.size,
    hash: image.hash ?? record.meta?.hash ?? null,
    createdBy: ctx.userId,
  });

  return mediaReference({ ...asset, storagePath, thumbnailPath, url, thumbnailUrl });
}

/**
 * Runs the upload.
 *
 * @param {(progress: {phase: string, done: number, total: number, message: string}) => void} onProgress
 * @returns {Promise<{status: string, items: number, images: number, imageFailures: string[]}>}
 */
export async function uploadDeviceData({ onProgress } = {}) {
  const session = repository.session;
  if (session.mode !== 'cloud') {
    throw new AppError('error.upload/not-signed-in', { code: 'upload/not-signed-in' });
  }

  const state = (await deviceUploadState()) || {};
  const uploaded = new Set(state.uploadedItemIds || []);
  // Records the workspace already had: preserved, not uploaded, not failures.
  const skipped = new Set(state.skippedItemIds || []);
  const imageFailures = [...(state.imageFailures || [])];
  const report = (phase, done, total, message) => onProgress?.({ phase, done, total, message });

  // Counts first: an upload should carry the device's real reference counts,
  // and it only ever uploads images a record references, so an orphan left
  // on the device is never sent to the cloud.
  await reconcileLocalMediaReferences({ reclaim: false }).catch((error) => {
    console.error('[upload] media reconciliation before upload failed', error);
  });

  // A full-data operation by definition: everything on the device goes up.
  const [items, folders, categories, locations] = await Promise.all([
    local.getAll('items'), local.getAll('folders'),
    local.getAll('categories'), local.getAll('locations'),
  ]);

  // Room in the cloud workspace for what this device will add — asked before
  // anything is uploaded or the run is recorded, not discovered at item 1,001
  // of 3,000. Records already uploaded by an earlier run, or already in the
  // workspace, cost nothing. The device's copy is never touched either way.
  const pendingItems = items.filter((item) => item?.id && !uploaded.has(item.id) && !skipped.has(item.id));
  const present = await repository.backend.existingIds('items', pendingItems.map((item) => item.id));
  const toAdd = pendingItems.filter((item) => !item.deletedAt);
  const newLive = toAdd.filter((item) => !present.has(item.id));
  await repository.assertItemCapacity(newLive.length);

  // Live SKUs stay unique in the workspace too. Checked, like a merge, before
  // a single image is uploaded: a device record whose SKU a live cloud record
  // (or another record on this device) already carries stops the upload, and
  // the customer renames one of them first. Nothing is changed on either side.
  const conflicts = await repository.findSkuConflicts(newLive.map((item) => ({ key: item.id, id: item.id, sku: item.sku })));
  if (conflicts.length) {
    const names = new Map(newLive.map((item) => [item.id, item.name || '']));
    throw new AppError('error.upload/sku-conflict', {
      code: 'import/sku-conflict',
      conflicts: conflicts.map((c) => ({
        sku: c.sku, incomingId: c.id, incomingName: names.get(c.id) || '', type: c.type,
        ...(c.type === 'existing' ? { existingId: c.existingId, existingName: c.existingName } : { duplicateIds: firstOthers(c) }),
      })),
    });
  }

  await local.setMeta(STATE_KEY, {
    ...state,
    status: UploadState.IN_PROGRESS,
    startedAt: state.startedAt || Date.now(),
    workspaceId: session.workspaceId,
  });

  try {
    // Taxonomy first, so item references resolve on arrival.
    report('taxonomy', 0, 1, t('upload.progressTaxonomy'));
    // Created where missing, never replaced: a category the workspace
    // already has keeps the workspace's name and icon.
    const taxonomy = [
      ...categories.map((r) => ({ type: 'set', collection: 'categories', id: r.id, data: r, merge: false, ifAbsent: true })),
      ...locations.map((r) => ({ type: 'set', collection: 'locations', id: r.id, data: r, merge: false, ifAbsent: true })),
      ...folders.map((r) => ({ type: 'set', collection: 'folders', id: r.id, data: r, merge: false, ifAbsent: true })),
    ];
    if (taxonomy.length) await repository.bulkWrite(taxonomy);

    let done = uploaded.size;
    let imagesUploaded = 0;

    const checkpoint = () => local.setMeta(STATE_KEY, {
      ...state,
      status: UploadState.IN_PROGRESS,
      workspaceId: session.workspaceId,
      uploadedItemIds: [...uploaded],
      skippedItemIds: [...skipped],
      imageFailures,
    });

    for (const item of items) {
      if (!item?.id || uploaded.has(item.id) || skipped.has(item.id)) continue;
      report('items', done, items.length, t('upload.progressItems', { done, total: items.length }));

      // Already in the workspace: the cloud's record stays as it is, and
      // this device's photographs of it are not uploaded at all.
      if (present.has(item.id)) {
        skipped.add(item.id);
        done += 1;
        await checkpoint();
        continue;
      }

      const images = [];
      // Uploaded by this run for this record: claimed if the record lands,
      // left for the sweeper if it does not.
      const fresh = [];
      for (const image of item.images || []) {
        if (!isLocalImage(image)) { images.push(image); continue; }
        try {
          const cloudImage = await uploadLocalImage(image, {
            workspaceId: session.workspaceId,
            userId: session.userId,
            itemId: item.id,
          });
          images.push(cloudImage);
          fresh.push(cloudImage);
        } catch (error) {
          // The record is worth more than the photograph: keep the item, record
          // the miss, and never write a `local:` reference into the cloud.
          console.error(`[device-upload] image failed for item ${item.id}`, error);
          imageFailures.push(`${item.id}:${image.id}`);
        }
      }

      const primaryImageId = images.some((i) => i.id === item.primaryImageId)
        ? item.primaryImageId
        : images[0]?.id ?? null;

      const written = await repository.bulkWrite([{
        type: 'set',
        collection: 'items',
        id: item.id,
        data: { ...item, images, primaryImageId, mediaIds: images.map((i) => i.mediaId || i.id) },
        merge: false,
        ifAbsent: true,
      }]);

      if (written.skippedExisting?.includes(item.id)) {
        // Another device created this id between the check above and this
        // write. Its record stands. The images just uploaded for ours are not
        // claimed — they stay unreferenced and orphan-marked, which is what the
        // sweeper collects — and they are not counted as uploaded.
        await discardUnreferenced(session, fresh);
        skipped.add(item.id);
        done += 1;
        await checkpoint();
        continue;
      }

      imagesUploaded += fresh.length;

      // Claim the uploaded assets so the sweeper does not reclaim them.
      for (const image of images) {
        try {
          await mediaStore(session).adjust(image.mediaId || image.id, 1);
        } catch (error) {
          console.error('[device-upload] could not claim media', error);
        }
      }

      uploaded.add(item.id);
      done += 1;
      await checkpoint();
    }

    // Verification: nothing may have reached the cloud carrying a local path.
    report('verify', items.length, items.length, t('upload.progressVerify'));
    const leftover = await findLocalReferences(session.workspaceId);
    if (leftover.length) {
      throw new AppError(
        'error.upload/local-refs-remain',
        { code: 'upload/local-refs-remain', count: leftover.length },
      );
    }

    const result = {
      status: UploadState.COMPLETED,
      completedAt: Date.now(),
      workspaceId: session.workspaceId,
      items: uploaded.size,
      created: uploaded.size,
      skippedExisting: skipped.size,
      images: imagesUploaded,
      imageFailures,
      uploadedItemIds: [...uploaded],
      skippedItemIds: [...skipped],
    };
    await local.setMeta(STATE_KEY, result);
    report('done', items.length, items.length, t('upload.progressDone'));
    return result;
  } catch (error) {
    await local.setMeta(STATE_KEY, {
      ...state,
      status: UploadState.FAILED,
      workspaceId: session.workspaceId,
      uploadedItemIds: [...uploaded],
      skippedItemIds: [...skipped],
      imageFailures,
      failedAt: Date.now(),
      error: error.message,
    });
    throw error instanceof AppError ? error : new AppError('error.upload/failed', { code: 'upload/failed', cause: error });
  }
}

/** Scans the live workspace for any image still pointing at device storage. */
export async function findLocalReferences(workspaceId) {
  // "No image still points at the device" has to be true of every record, not
  // of the window the screen is showing.
  await repository.completeItems();
  repository.assertItemsComplete('partial.checkImages');
  const offenders = [];
  for (const item of repository.state.items) {
    for (const image of item.images || []) {
      if (isLocalImage(image)) offenders.push({ itemId: item.id, imageId: image.id });
    }
  }
  return offenders;
}

/**
 * Clears the device copy. Deliberately separate from the upload and only
 * offered once a completed run has been verified.
 */
export async function clearLocalCopy() {
  const state = await deviceUploadState();
  if (state.status !== UploadState.COMPLETED) {
    throw new AppError('error.upload/not-complete', { code: 'upload/not-complete' });
  }
  for (const store of ['items', 'folders', 'categories', 'locations', 'images', 'mediaAssets', 'activity']) {
    await local.clearStore(store).catch((error) => {
      console.error(`[device-upload] could not clear ${store}`, error);
    });
  }
  await local.setMeta(STATE_KEY, { ...state, localCleared: true, clearedAt: Date.now() });
}

/** Up to five other records carrying the same SKU — enough to find them,
 *  without a list per record when thousands share one. */
function firstOthers(conflict) {
  const out = [];
  for (const key of conflict.groupKeys) {
    if (key !== conflict.key) out.push(key);
    if (out.length === 5) break;
  }
  return out;
}
