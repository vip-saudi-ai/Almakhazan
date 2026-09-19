// Image pipeline.
//
// Each upload produces two objects: a documentation-grade original and a light
// thumbnail for list and grid views. Only paths, URLs and metadata reach
// Firestore — never the pixels.
//
// Storage layout:
//   workspaces/{workspaceId}/items/{itemId}/original/{imageId}.{ext}
//   workspaces/{workspaceId}/items/{itemId}/thumbnails/{imageId}.jpg

import { IMAGE_LIMITS } from './config.js';
import { firebaseContext } from './firebase.js';
import * as local from './local-store.js';
import { AppError, sha256Hex, uid } from './utils.js';

const EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
};

function assertAcceptable(file) {
  if (!file) throw new AppError('لم يتم اختيار ملف');
  if (!IMAGE_LIMITS.allowedTypes.includes(file.type)) {
    throw new AppError('صيغة الصورة غير مدعومة (JPG · PNG · WEBP · AVIF)', { code: 'image/type' });
  }
  if (file.size > IMAGE_LIMITS.maxBytes) {
    const mb = Math.round(IMAGE_LIMITS.maxBytes / 1024 / 1024);
    throw new AppError(`حجم الصورة يتجاوز ${mb} ميجابايت`, { code: 'image/size' });
  }
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch (error) {
      console.error('[image] createImageBitmap failed, falling back to <img>', error);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new AppError('تعذّر قراءة الصورة', { code: 'image/decode' }));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(bitmap, maxEdge) {
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, width, height, scaled: scale < 1 };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new AppError('تعذّر تجهيز الصورة', { code: 'image/encode' }))),
      type,
      quality,
    );
  });
}

/**
 * Produces the pair to store. The original keeps its own format and is only
 * resized when it exceeds the documentation ceiling, so serial numbers, marks
 * and inscriptions stay readable. PNG is never transcoded to JPEG.
 */
async function prepare(file) {
  const bitmap = await loadBitmap(file);
  const { width, height } = bitmap;

  let originalBlob = file;
  let originalWidth = width;
  let originalHeight = height;

  if (Math.max(width, height) > IMAGE_LIMITS.maxOriginalEdge) {
    const drawn = drawScaled(bitmap, IMAGE_LIMITS.maxOriginalEdge);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    originalBlob = await canvasToBlob(drawn.canvas, type, 0.95);
    originalWidth = drawn.width;
    originalHeight = drawn.height;
  }

  const thumb = drawScaled(bitmap, IMAGE_LIMITS.thumbnailEdge);
  const thumbnailBlob = await canvasToBlob(thumb.canvas, 'image/jpeg', 0.82);

  if (typeof bitmap.close === 'function') bitmap.close();

  return {
    originalBlob,
    originalWidth,
    originalHeight,
    originalType: originalBlob.type || file.type,
    thumbnailBlob,
  };
}

/**
 * Uploads one image and returns the metadata record to store on the item.
 * @param {{workspaceId: string, itemId: string, userId: string, mode: 'cloud'|'local'}} ctx
 */
export async function uploadImage(file, ctx, onProgress) {
  assertAcceptable(file);
  const imageId = uid('img');
  const prepared = await prepare(file);
  const hash = await sha256Hex(new Uint8Array(await prepared.originalBlob.arrayBuffer()));
  const extension = EXTENSIONS[prepared.originalType] || 'jpg';

  const base = {
    id: imageId,
    originalFilename: file.name?.slice(0, 255) || null,
    mimeType: prepared.originalType,
    width: prepared.originalWidth,
    height: prepared.originalHeight,
    fileSize: prepared.originalBlob.size,
    hash,
    uploadedAt: Date.now(),
    uploadedBy: ctx.userId || null,
  };

  if (ctx.mode !== 'cloud') {
    // Blobs live in IndexedDB; object URLs are minted on read.
    await local.put('images', {
      id: imageId, itemId: ctx.itemId, original: prepared.originalBlob, thumbnail: prepared.thumbnailBlob, meta: base,
    });
    onProgress?.(100);
    return { ...base, storagePath: `local:${imageId}`, thumbnailPath: `local:${imageId}`, url: null, thumbnailUrl: null };
  }

  const { storage, sdk } = firebaseContext();
  if (!storage) throw new AppError('خدمة تخزين الصور غير متاحة', { code: 'image/no-storage' });

  const prefix = `workspaces/${ctx.workspaceId}/items/${ctx.itemId}`;
  const storagePath = `${prefix}/original/${imageId}.${extension}`;
  const thumbnailPath = `${prefix}/thumbnails/${imageId}.jpg`;

  const metadata = {
    contentType: prepared.originalType,
    cacheControl: 'public,max-age=31536000,immutable',
    customMetadata: { uploadedBy: ctx.userId || '', itemId: ctx.itemId, hash },
  };

  try {
    const originalRef = sdk.storage.ref(storage, storagePath);
    const task = sdk.storage.uploadBytesResumable(originalRef, prepared.originalBlob, metadata);
    await new Promise((resolve, reject) => {
      task.on('state_changed',
        (snapshot) => onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 90)),
        reject,
        resolve);
    });

    const thumbRef = sdk.storage.ref(storage, thumbnailPath);
    await sdk.storage.uploadBytes(thumbRef, prepared.thumbnailBlob, {
      contentType: 'image/jpeg',
      cacheControl: 'public,max-age=31536000,immutable',
    });
    onProgress?.(95);

    const [url, thumbnailUrl] = await Promise.all([
      sdk.storage.getDownloadURL(originalRef),
      sdk.storage.getDownloadURL(thumbRef),
    ]);
    onProgress?.(100);

    return { ...base, storagePath, thumbnailPath, url, thumbnailUrl };
  } catch (error) {
    console.error('[image] upload failed', error);
    if (error?.code === 'storage/unauthorized') {
      throw new AppError('لا تملك صلاحية رفع الصور', { code: error.code, cause: error });
    }
    throw new AppError('فشل رفع الصورة', { code: error?.code, cause: error });
  }
}

/** Deletes the stored objects. A missing object is not an error. */
export async function deleteImage(image, ctx) {
  if (!image) return;
  if (image.storagePath?.startsWith('local:')) {
    await local.remove('images', image.id);
    return;
  }
  if (ctx.mode !== 'cloud') return;
  const { storage, sdk } = firebaseContext();
  if (!storage) return;

  for (const path of [image.storagePath, image.thumbnailPath]) {
    if (!path) continue;
    try {
      await sdk.storage.deleteObject(sdk.storage.ref(storage, path));
    } catch (error) {
      if (error?.code === 'storage/object-not-found') continue;
      console.error('[image] delete failed', path, error);
    }
  }
}

const objectUrlCache = new Map();

/** Resolves a displayable URL, preferring the thumbnail for list rendering. */
export async function imageSrc(image, { thumbnail = true } = {}) {
  if (!image) return null;
  if (!image.storagePath?.startsWith('local:')) {
    return (thumbnail ? image.thumbnailUrl : image.url) || image.url || image.thumbnailUrl || null;
  }
  const cacheKey = `${image.id}:${thumbnail}`;
  if (objectUrlCache.has(cacheKey)) return objectUrlCache.get(cacheKey);
  try {
    const rows = await local.getAll('images');
    const record = rows.find((r) => r.id === image.id);
    const blob = thumbnail ? (record?.thumbnail || record?.original) : (record?.original || record?.thumbnail);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrlCache.set(cacheKey, url);
    return url;
  } catch (error) {
    console.error('[image] local read failed', error);
    return null;
  }
}

/** Attaches a lazily resolved source to an <img>. */
export function bindImageSrc(imgElement, image, options) {
  imageSrc(image, options)
    .then((src) => { if (src) imgElement.src = src; })
    .catch((error) => console.error('[image] could not resolve source', error));
}
