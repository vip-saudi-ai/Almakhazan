// Uploading a device's local inventory into a cloud workspace.
//
// The hard part is the images: local records point at `local:{id}` blobs in
// IndexedDB, which mean nothing to another device. Every one is uploaded to
// Storage and its reference rewritten before the item document is written, so
// a cloud document can never contain an unusable local reference.
//
// The run is checkpointed per item and resumable, and the local copy is left
// untouched until the whole thing is verified.

import * as local from './local-store.js';
import { mediaStore, mediaReference } from './media.js';
import { repository } from './repository.js';
import { firebaseContext } from './firebase.js';
import { AppError, uid } from './utils.js';

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
async function uploadLocalImage(image, ctx) {
  const blobId = localBlobId(image);
  const rows = await local.getAll('images');
  const record = rows.find((r) => r.id === blobId);
  if (!record) {
    throw new AppError('لم يُعثر على ملف الصورة على هذا الجهاز', { code: 'upload/missing-blob' });
  }

  const originalBlob = toBlob(record.original, record.originalType || image.mimeType);
  const thumbnailBlob = toBlob(record.thumbnail, record.thumbnailType || 'image/jpeg') || originalBlob;
  if (!originalBlob) {
    throw new AppError('ملف الصورة تالف على هذا الجهاز', { code: 'upload/empty-blob' });
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
    throw new AppError('سجّل الدخول أولاً لرفع البيانات', { code: 'upload/not-signed-in' });
  }

  const state = (await deviceUploadState()) || {};
  const uploaded = new Set(state.uploadedItemIds || []);
  const imageFailures = [...(state.imageFailures || [])];
  const report = (phase, done, total, message) => onProgress?.({ phase, done, total, message });

  const [items, folders, categories, locations] = await Promise.all([
    local.getAll('items'), local.getAll('folders'),
    local.getAll('categories'), local.getAll('locations'),
  ]);

  await local.setMeta(STATE_KEY, {
    ...state,
    status: UploadState.IN_PROGRESS,
    startedAt: state.startedAt || Date.now(),
    workspaceId: session.workspaceId,
  });

  try {
    // Taxonomy first, so item references resolve on arrival.
    report('taxonomy', 0, 1, 'رفع التصنيفات والمجلدات…');
    const taxonomy = [
      ...categories.map((r) => ({ type: 'set', collection: 'categories', id: r.id, data: r, merge: false })),
      ...locations.map((r) => ({ type: 'set', collection: 'locations', id: r.id, data: r, merge: false })),
      ...folders.map((r) => ({ type: 'set', collection: 'folders', id: r.id, data: r, merge: false })),
    ];
    if (taxonomy.length) await repository.bulkWrite(taxonomy);

    let done = uploaded.size;
    let imagesUploaded = 0;

    for (const item of items) {
      if (!item?.id || uploaded.has(item.id)) continue;
      report('items', done, items.length, `رفع القطع… ${done}/${items.length}`);

      const images = [];
      for (const image of item.images || []) {
        if (!isLocalImage(image)) { images.push(image); continue; }
        try {
          const cloudImage = await uploadLocalImage(image, {
            workspaceId: session.workspaceId,
            userId: session.userId,
            itemId: item.id,
          });
          images.push(cloudImage);
          imagesUploaded += 1;
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

      await repository.bulkWrite([{
        type: 'set',
        collection: 'items',
        id: item.id,
        data: { ...item, images, primaryImageId, mediaIds: images.map((i) => i.mediaId || i.id) },
        merge: false,
      }]);

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
      await local.setMeta(STATE_KEY, {
        ...state,
        status: UploadState.IN_PROGRESS,
        workspaceId: session.workspaceId,
        uploadedItemIds: [...uploaded],
        imageFailures,
      });
    }

    // Verification: nothing may have reached the cloud carrying a local path.
    report('verify', items.length, items.length, 'التحقق من اكتمال الرفع…');
    const leftover = await findLocalReferences(session.workspaceId);
    if (leftover.length) {
      throw new AppError(
        `بقيت ${leftover.length} صورة بمرجع محلي — أعد المحاولة`,
        { code: 'upload/local-refs-remain' },
      );
    }

    const result = {
      status: UploadState.COMPLETED,
      completedAt: Date.now(),
      workspaceId: session.workspaceId,
      items: uploaded.size,
      images: imagesUploaded,
      imageFailures,
      uploadedItemIds: [...uploaded],
    };
    await local.setMeta(STATE_KEY, result);
    report('done', items.length, items.length, 'اكتمل الرفع');
    return result;
  } catch (error) {
    await local.setMeta(STATE_KEY, {
      ...state,
      status: UploadState.FAILED,
      workspaceId: session.workspaceId,
      uploadedItemIds: [...uploaded],
      imageFailures,
      failedAt: Date.now(),
      error: error.message,
    });
    throw error instanceof AppError ? error : new AppError('فشل رفع البيانات', { cause: error });
  }
}

/** Scans the live workspace for any image still pointing at device storage. */
export async function findLocalReferences(workspaceId) {
  // "No image still points at the device" has to be true of every record, not
  // of the window the screen is showing.
  await repository.completeItems();
  repository.assertItemsComplete('التحقق من الصور');
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
    throw new AppError('لم يكتمل الرفع بعد', { code: 'upload/not-complete' });
  }
  for (const store of ['items', 'folders', 'categories', 'locations', 'images', 'mediaAssets', 'activity']) {
    await local.clearStore(store).catch((error) => {
      console.error(`[device-upload] could not clear ${store}`, error);
    });
  }
  await local.setMeta(STATE_KEY, { ...state, localCleared: true, clearedAt: Date.now() });
}
