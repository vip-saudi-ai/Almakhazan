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
import { mediaReference, mediaStore } from './media.js';
import { AppError, sha256Hex, uid } from './utils.js';

const EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
};

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|avif|heic|heif|gif|bmp|tiff?|jfif|dng)$/i;

/**
 * Accepts anything that plausibly is an image. iOS often reports an empty
 * `type` for camera captures and library picks, so the real gate is whether
 * the browser can decode it — checked in prepare().
 */
function assertAcceptable(file) {
  if (!file) throw new AppError('لم يتم اختيار ملف');

  const looksLikeImage = (file.type && file.type.startsWith('image/'))
    || (!file.type && IMAGE_EXTENSION.test(file.name || ''));
  if (!looksLikeImage) {
    throw new AppError('الملف المختار ليس صورة', { code: 'image/type' });
  }
  if (file.size > IMAGE_LIMITS.maxBytes) {
    const mb = Math.round(IMAGE_LIMITS.maxBytes / 1024 / 1024);
    throw new AppError(`حجم الصورة يتجاوز ${mb} ميجابايت`, { code: 'image/size' });
  }
}

/**
 * Decodes the file. `resizeTo` lets the browser downscale during decode, which
 * is far faster than decoding a 48MP photo in full and scaling afterwards.
 */
async function loadBitmap(file, resizeTo) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, resizeTo
        ? { resizeWidth: resizeTo.width, resizeHeight: resizeTo.height, resizeQuality: 'high' }
        : undefined);
    } catch (error) {
      console.error('[image] createImageBitmap failed, falling back to <img>', error);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new AppError(
        'تعذّر فتح هذه الصورة — جرّب صيغة أخرى',
        { code: 'image/decode' },
      ));
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
  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('تعذّر فتح هذه الصورة — جرّب صيغة أخرى', { code: 'image/decode', cause: error });
  }

  const { width, height } = bitmap;
  if (!width || !height) {
    throw new AppError('تعذّر فتح هذه الصورة — جرّب صيغة أخرى', { code: 'image/decode' });
  }

  const webSafe = IMAGE_LIMITS.webSafeTypes.includes(file.type);
  const oversized = Math.max(width, height) > IMAGE_LIMITS.maxOriginalEdge;

  let originalBlob = file;
  let originalWidth = width;
  let originalHeight = height;

  // Re-encode only when we must: the file is too large to keep at full size, or
  // its format (HEIC from an iPhone, TIFF, BMP…) would not display elsewhere.
  if (oversized || !webSafe) {
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
    originalType: originalBlob.type || file.type || 'image/jpeg',
    sourceType: file.type || null,
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
  // Decoding and re-encoding a modern phone photo takes seconds; say so before
  // starting rather than leaving the bar at zero.
  onProgress?.(3, 'prepare');
  const prepared = await prepare(file);
  onProgress?.(30, ctx.mode === 'cloud' ? 'upload' : 'save');
  const originalBuffer = await prepared.originalBlob.arrayBuffer();
  const hash = await sha256Hex(new Uint8Array(originalBuffer));
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
    // Stored as ArrayBuffers, not Blobs: WebKit has long-standing bugs reading
    // Blobs back out of IndexedDB, which surfaced as a failed save on iPhone.
    const thumbnailBuffer = await prepared.thumbnailBlob.arrayBuffer();
    await local.put('images', {
      id: imageId,
      itemId: ctx.itemId,
      original: originalBuffer,
      originalType: prepared.originalType,
      thumbnail: thumbnailBuffer,
      thumbnailType: 'image/jpeg',
      meta: base,
    });
    const asset = await mediaStore({ mode: 'local', workspaceId: ctx.workspaceId || 'local' }).create({
      ...base,
      storagePath: `local:${imageId}`,
      thumbnailPath: `local:${imageId}`,
      createdBy: ctx.userId,
    });
    onProgress?.(100);
    return mediaReference({ ...asset, storagePath: `local:${imageId}`, thumbnailPath: `local:${imageId}` });
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
        (snapshot) => onProgress?.(
          30 + Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 60),
          'upload',
        ),
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

    // The media asset owns the file and carries the reference count; the item
    // only points at it.
    const asset = await mediaStore({ mode: 'cloud', workspaceId: ctx.workspaceId })
      .create({ ...base, storagePath, thumbnailPath, url, thumbnailUrl, createdBy: ctx.userId });
    return mediaReference({ ...asset, storagePath, thumbnailPath, url, thumbnailUrl });
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

/**
 * The three jobs an image does, and which stored file each one gets.
 *
 * Two files are kept per image: a 640px display copy and the original, capped
 * at 2560px (`IMAGE_LIMITS`). That is two files, not three — and three tiers,
 * because the middle tier is a decision about the screen rather than a third
 * upload the customer would pay to store.
 *
 *   THUMB    a grid or list cell. Always the 640px copy.
 *   DISPLAY  an item's own screen. The 640px copy on a phone, where that is
 *            already more pixels than the box; the original on a wide or
 *            high-density display, where it would visibly soften.
 *   FULL     the full-screen viewer. Always the original — the whole point of
 *            opening it is to read a serial number or look at a scratch.
 */
export const ImageTier = { THUMB: 'thumb', DISPLAY: 'display', FULL: 'full' };

/** The widest a 640px copy can be drawn before it starts to soften. */
const DISPLAY_CEILING = 640;

function wantsOriginal(tier) {
  if (tier === ImageTier.FULL) return true;
  if (tier !== ImageTier.DISPLAY) return false;
  const dpr = window.devicePixelRatio || 1;
  // The detail image is roughly the viewport width on a phone and a column of
  // it on a tablet or laptop; either way this is the box it has to fill.
  const box = Math.min(window.innerWidth, 900) * dpr;
  return box > DISPLAY_CEILING;
}

/** Resolves a displayable URL for one tier. */
export async function imageSrc(image, options = {}) {
  const { tier } = options;
  const thumbnail = tier ? !wantsOriginal(tier) : options.thumbnail !== false;
  return resolveSrc(image, thumbnail);
}

async function resolveSrc(image, thumbnail) {
  if (!image) return null;
  if (!image.storagePath?.startsWith('local:')) {
    return (thumbnail ? image.thumbnailUrl : image.url) || image.url || image.thumbnailUrl || null;
  }
  const cacheKey = `${image.id}:${thumbnail}`;
  if (objectUrlCache.has(cacheKey)) return objectUrlCache.get(cacheKey);
  try {
    const rows = await local.getAll('images');
    const record = rows.find((r) => r.id === image.id);
    if (!record) return null;

    const [data, type] = thumbnail
      ? [record.thumbnail ?? record.original, record.thumbnailType || 'image/jpeg']
      : [record.original ?? record.thumbnail, record.originalType || 'image/jpeg'];
    if (!data) return null;

    // Older records held Blobs directly; newer ones hold ArrayBuffers.
    const blob = data instanceof Blob ? data : new Blob([data], { type });
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

/**
 * Whether a higher tier would actually be a different file. The viewer uses
 * this to decide between "swap in the original" and "there is nothing better
 * to wait for", so it never shows a loading state for a load that will not
 * happen.
 */
export async function hasDistinctOriginal(image) {
  if (!image) return false;
  const [a, b] = await Promise.all([resolveSrc(image, true), resolveSrc(image, false)]);
  return Boolean(a && b && a !== b);
}
