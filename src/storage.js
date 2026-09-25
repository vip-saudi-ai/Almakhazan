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
  if (!file) throw new AppError('error.image/none', { code: 'image/none' });

  const looksLikeImage = (file.type && file.type.startsWith('image/'))
    || (!file.type && IMAGE_EXTENSION.test(file.name || ''));
  if (!looksLikeImage) {
    throw new AppError('error.image/type', { code: 'image/type' });
  }
  if (file.size > IMAGE_LIMITS.maxBytes) {
    const mb = Math.round(IMAGE_LIMITS.maxBytes / 1024 / 1024);
    throw new AppError('error.image/size', { code: 'image/size', mb });
  }
}

/**
 * The image's intrinsic size, read from an <img> that is never inserted or
 * drawn. This is the header parse, not the picture: it is what lets the real
 * decode below be asked for a bounded bitmap instead of a 48-megapixel one.
 */
function probeSize(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  return new Promise((resolve) => {
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  }).finally(() => {
    URL.revokeObjectURL(url);
    // The element is only ever asked for two numbers. Clearing its source
    // lets the browser drop whatever it decoded to answer, instead of holding
    // a full-size bitmap alive behind a reference nobody needs any more.
    img.onload = null;
    img.onerror = null;
    img.removeAttribute('src');
  });
}

/**
 * The largest picture the fallback path may decode.
 *
 * `createImageBitmap` can downscale while decoding, so the main path's peak
 * cost is bounded by what we ask for. The `<img>` fallback — for a browser
 * without it, or one where it failed — cannot: it decodes at native size,
 * four bytes a pixel. A 100-megapixel scan is 400MB of bitmap, and the tab
 * does not survive being asked for it.
 *
 * So the fallback declines, and says what to do instead. Declining is a worse
 * answer than resizing; it is a much better answer than the tab disappearing
 * with the customer's half-finished record in it.
 */
const FALLBACK_MAX_PIXELS = 40 * 1000 * 1000;

/**
 * Decodes the file, downscaling *during* the decode when the picture is larger
 * than anything we would keep.
 *
 * A 48MP phone photo is 192MB of bitmap at full size, and the old path decoded
 * it in full before scaling it down to 2560px — so the peak cost of adding one
 * photo was set by the camera rather than by the app, and three of them in a
 * row could take the tab down. Asking for one dimension and letting the
 * browser compute the other preserves the aspect ratio, so the caller still
 * gets a correctly shaped image, just never a huge one.
 */
async function loadBitmap(file, maxEdge = IMAGE_LIMITS.maxOriginalEdge) {
  if ('createImageBitmap' in window) {
    const size = await probeSize(file);
    let options;
    if (size?.width && size?.height && Math.max(size.width, size.height) > maxEdge) {
      options = size.width >= size.height
        ? { resizeWidth: maxEdge, resizeQuality: 'high' }
        : { resizeHeight: maxEdge, resizeQuality: 'high' };
    }
    try {
      return await createImageBitmap(file, options);
    } catch (error) {
      console.error('[image] createImageBitmap failed, falling back to <img>', error);
    }
  }
  const probe = await probeSize(file);
  if (probe && probe.width * probe.height > FALLBACK_MAX_PIXELS) {
    throw new AppError(
      'error.image/too-large',
      { code: 'image/too-large' },
    );
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new AppError(
        'error.image/decode',
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
      (blob) => (blob ? resolve(blob) : reject(new AppError('error.image/encode', { code: 'image/encode' }))),
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
    throw new AppError('error.image/decode', { code: 'image/decode', cause: error });
  }

  const { width, height } = bitmap;
  if (!width || !height) {
    throw new AppError('error.image/decode', { code: 'image/decode' });
  }

  const webSafe = IMAGE_LIMITS.webSafeTypes.includes(file.type);
  const oversized = Math.max(width, height) > IMAGE_LIMITS.maxOriginalEdge;

  let originalBlob = file;
  let originalWidth = width;
  let originalHeight = height;

  // A decoded bitmap holds real memory that garbage collection does not hurry
  // to reclaim, so it is released whatever happens next — an encode that fails
  // on the fourth photo must not leave the first three resident.
  try {
    // Re-encode only when we must: the file is too large to keep at full size,
    // or its format (HEIC from an iPhone, TIFF, BMP…) would not display
    // elsewhere. A file the decode already downscaled counts as oversized:
    // `width`/`height` are the decoded size, so this compares the right thing.
    if (oversized || !webSafe || bitmapWasResized(file, width, height)) {
      const drawn = drawScaled(bitmap, IMAGE_LIMITS.maxOriginalEdge);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      originalBlob = await canvasToBlob(drawn.canvas, type, 0.95);
      originalWidth = drawn.width;
      originalHeight = drawn.height;
    }

    const thumb = drawScaled(bitmap, IMAGE_LIMITS.thumbnailEdge);
    const thumbnailBlob = await canvasToBlob(thumb.canvas, 'image/jpeg', 0.82);

    return {
      originalBlob,
      originalWidth,
      originalHeight,
      originalType: originalBlob.type || file.type || 'image/jpeg',
      sourceType: file.type || null,
      thumbnailBlob,
    };
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

/**
 * Whether the decode downscaled the picture, which makes the original file on
 * disk no longer the picture we measured. Storing that file unchanged would
 * record dimensions the bytes do not have, so it has to be re-encoded from the
 * bitmap we actually hold.
 */
function bitmapWasResized(file, width, height) {
  return Math.max(width, height) >= IMAGE_LIMITS.maxOriginalEdge && file.size > 0
    && Math.max(width, height) === IMAGE_LIMITS.maxOriginalEdge;
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
  if (!storage) throw new AppError('error.image/no-storage', { code: 'image/no-storage' });

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
      throw new AppError('error.image/forbidden', { code: error.code, cause: error });
    }
    throw new AppError('error.image/upload', { code: error?.code, cause: error });
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

/**
 * Object URLs for locally stored blobs, bounded and revoked.
 *
 * Every `URL.createObjectURL` pins its blob in memory until the URL is revoked
 * or the document goes away. An unbounded cache therefore does not cache
 * images — it accumulates them: scrolling a 2,000-record inventory once held
 * every thumbnail it had ever drawn, and the tab grew until it was killed.
 *
 * So the cache is a fixed-size LRU. Evicting an entry revokes its URL, which
 * releases the blob; an <img> already showing that URL keeps its pixels (the
 * fetch has completed), and anything that needs it again re-reads it from
 * IndexedDB, which is cheap and keyed.
 */
const OBJECT_URL_CACHE_MAX = 120;
const objectUrlCache = new Map();

function cacheObjectUrl(key, url) {
  objectUrlCache.set(key, url);
  while (objectUrlCache.size > OBJECT_URL_CACHE_MAX) {
    // Map preserves insertion order, so the first key is the least recently
    // inserted — and `touchObjectUrl` re-inserts on every hit, which makes it
    // the least recently *used*.
    const oldest = objectUrlCache.keys().next().value;
    const stale = objectUrlCache.get(oldest);
    objectUrlCache.delete(oldest);
    try { URL.revokeObjectURL(stale); } catch { /* already gone */ }
  }
  return url;
}

function touchObjectUrl(key) {
  const url = objectUrlCache.get(key);
  objectUrlCache.delete(key);
  objectUrlCache.set(key, url);
  return url;
}

/**
 * Drop every cached URL. Called when the workspace changes: those blobs belong
 * to an inventory this session is no longer looking at, and holding them is
 * both a leak and a way for one workspace's image to appear in another.
 */
export function releaseObjectUrls() {
  for (const url of objectUrlCache.values()) {
    try { URL.revokeObjectURL(url); } catch { /* already gone */ }
  }
  objectUrlCache.clear();
}

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
  if (objectUrlCache.has(cacheKey)) return touchObjectUrl(cacheKey);
  try {
    // One keyed read. This used to be `getAll('images')` followed by a `find`,
    // which deserialised every stored blob on the device to display one of
    // them — on an inventory with 500 photos, hundreds of megabytes of reads
    // to draw a single thumbnail.
    const record = await local.get('images', image.id);
    if (!record) return null;

    const [data, type] = thumbnail
      ? [record.thumbnail ?? record.original, record.thumbnailType || 'image/jpeg']
      : [record.original ?? record.thumbnail, record.originalType || 'image/jpeg'];
    if (!data) return null;

    // Older records held Blobs directly; newer ones hold ArrayBuffers.
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    return cacheObjectUrl(cacheKey, URL.createObjectURL(blob));
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
