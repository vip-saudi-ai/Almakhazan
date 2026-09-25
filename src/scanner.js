// Barcode and QR scanning — from the camera, or from a photo.
//
// Two engines behind one interface, chosen by what the browser can actually
// do, never by what it claims to be:
//
//   1. native  — the browser's BarcodeDetector (Chrome on Android, and any
//                browser that ships it later). Fast, and free.
//   2. zxing   — @zxing/library, self-hosted in public/vendor/zxing (Apache-2.0).
//                Safari on iPhone and iPad has no BarcodeDetector, and barcode
//                capture is the one field a phone should never make the
//                customer type, so this is the path most iPhones take. It is
//                ~360 KB, so it is loaded the first time a scan is asked for,
//                not at startup; the service worker keeps it for offline use.
//
// Both engines take a frame (the video, a canvas, a decoded photo) and return
// the first code in it, or nothing. Nothing outside this module knows which
// one answered.
//
// Formats: QR, Data Matrix, EAN-13/8, UPC-A/E, Code 128/39/93, ITF and Codabar
// — the eleven NAZM asks for. ZXing reads all eleven; a native detector reads
// whichever of them its platform reports, and a code it cannot read falls to
// the photo path rather than being pretended to work.

import { AppError } from './utils.js';
import { onBackground } from './lifecycle.js';

/** The formats NAZM scans, in the names BarcodeDetector uses. */
export const FORMATS = [
  'qr_code', 'data_matrix', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'code_93', 'itf', 'codabar',
];

/** ZXing's names for the same formats. */
const ZXING_FORMATS = {
  QR_CODE: 'qr_code', DATA_MATRIX: 'data_matrix', EAN_13: 'ean_13', EAN_8: 'ean_8',
  UPC_A: 'upc_a', UPC_E: 'upc_e', CODE_128: 'code_128', CODE_39: 'code_39',
  CODE_93: 'code_93', ITF: 'itf', CODABAR: 'codabar',
};

/** 2-D symbols carry their own error correction: one read is a read. */
const SELF_CHECKING = new Set(['qr_code', 'data_matrix']);

const VENDOR_URL = 'public/vendor/zxing/zxing.min.js';

// ── capability ─────────────────────────────────────────────────────────────

/** A live camera is possible here: an API to ask, in a secure context. */
export function cameraAvailable() {
  return Boolean(window.isSecureContext !== false && navigator.mediaDevices?.getUserMedia);
}

/**
 * Scanning is always offered: where there is no camera there is still a
 * photo. Kept for callers that used to hide the scan button.
 */
export function scanningSupported() {
  return true;
}

// ── engines ────────────────────────────────────────────────────────────────

let nativeEngine;   // undefined: not asked yet; null: not available
let zxingEngine;
let zxingLoading = null;

async function loadNative() {
  if (nativeEngine !== undefined) return nativeEngine;
  nativeEngine = null;
  if (!('BarcodeDetector' in window)) return null;
  try {
    const available = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((format) => available.includes(format));
    // A detector that reads no format we need — some desktop builds report an
    // empty list — is not a detector for our purposes.
    if (!formats.length) return null;
    const detector = new window.BarcodeDetector({ formats });
    nativeEngine = {
      name: 'native',
      formats,
      async detect(source) {
        const codes = await detector.detect(source);
        const first = codes.find((code) => code.rawValue);
        return first ? { value: first.rawValue.trim(), format: first.format } : null;
      },
    };
  } catch (error) {
    console.warn('[scan] BarcodeDetector present but unusable', error);
    nativeEngine = null;
  }
  return nativeEngine;
}

/**
 * The ZXing build, from the page when the single-file build carries it inline
 * (as inert text, parsed only now), otherwise from this origin.
 */
function loadZxingScript() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingLoading) return zxingLoading;
  zxingLoading = new Promise((resolve, reject) => {
    const inline = document.getElementById('nazm-zxing-source');
    const script = document.createElement('script');
    if (inline) {
      script.textContent = inline.textContent;
      document.head.appendChild(script);
      if (window.ZXing) resolve(window.ZXing);
      else reject(new Error('inline decoder did not load'));
      return;
    }
    script.src = VENDOR_URL;
    script.async = true;
    script.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error('decoder loaded without ZXing')));
    script.onerror = () => reject(new Error('decoder could not be fetched'));
    document.head.appendChild(script);
  }).catch((error) => {
    zxingLoading = null;   // a later attempt (back online) may succeed
    throw error;
  });
  return zxingLoading;
}

async function loadZxing() {
  if (zxingEngine) return zxingEngine;
  let ZX;
  try {
    ZX = await loadZxingScript();
  } catch (error) {
    console.error('[scan] fallback decoder unavailable', error);
    throw new AppError(navigator.onLine === false ? 'error.scan/decoder-offline' : 'error.scan/decoder', {
      code: navigator.onLine === false ? 'scan/decoder-offline' : 'scan/decoder', cause: error,
    });
  }
  const hints = new Map();
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, Object.keys(ZXING_FORMATS).map((name) => ZX.BarcodeFormat[name]));
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  const reader = new ZX.MultiFormatReader();
  reader.setHints(hints);

  const quietWarn = (warn) => (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('MultiFormatReader:')) return;
    warn(...args);
  };

  const decodeCanvas = (canvas) => {
    const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.HTMLCanvasElementLuminanceSource(canvas)));
    // MultiFormatReader console.warns (with a stack) whenever one of its
    // readers gives up on a frame in an unexpected way — for an empty frame,
    // several times per frame, ten frames a second. That is not an error for
    // us, and the logging alone costs a phone real time, so it is muted for
    // the length of this synchronous call only.
    const warn = console.warn;
    console.warn = quietWarn(warn);
    try {
      const result = reader.decodeWithState(bitmap);
      const format = ZXING_FORMATS[ZX.BarcodeFormat[result.getBarcodeFormat()]];
      const value = String(result.getText() || '').trim();
      return format && value ? { value, format } : null;
    } catch (error) {
      // NotFound / Checksum / Format are "no code in this frame", the normal
      // answer for most frames.
      if (error instanceof ZX.NotFoundException || error instanceof ZX.ChecksumException
        || error instanceof ZX.FormatException || /NotFound|Checksum|Format/.test(error?.name || '')) return null;
      throw error;
    } finally {
      console.warn = warn;
      reader.reset();
    }
  };

  zxingEngine = {
    name: 'zxing',
    formats: Object.values(ZXING_FORMATS),
    decodeCanvas,
    async detect(source) {
      const canvas = frameCanvas(source, { region: source instanceof HTMLVideoElement });
      return canvas ? decodeCanvas(canvas) : null;
    },
  };
  return zxingEngine;
}

/**
 * The engine for this browser: native where it works, ZXing otherwise.
 * `prefer: 'zxing'` exists for tests and for the photo path's second try.
 */
export async function scannerEngine({ prefer } = {}) {
  if (prefer !== 'zxing') {
    const native = await loadNative();
    if (native) return native;
  }
  return loadZxing();
}

// ── frames ─────────────────────────────────────────────────────────────────

let scratch = null;

/**
 * Draws a frame into a reused canvas, scaled so the long side is at most
 * `max` pixels. From live video only the centre is kept — the region inside
 * the on-screen guide — which is where the customer is aiming and a fraction
 * of the pixels a full 1280×720 frame would cost to decode, on every frame,
 * on a phone's battery. Not so tight that a code held slightly off-centre is
 * cut: 90% of the width (barcodes are wide) and 70% of the height.
 */
function frameCanvas(source, { region = false, max = 960 } = {}) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!width || !height) return null;
  const sw = region ? Math.round(width * 0.9) : width;
  const sh = region ? Math.round(height * 0.7) : height;
  const sx = Math.round((width - sw) / 2);
  const sy = Math.round((height - sh) / 2);
  const scale = Math.min(1, max / Math.max(sw, sh));
  scratch = scratch || document.createElement('canvas');
  scratch.width = Math.max(1, Math.round(sw * scale));
  scratch.height = Math.max(1, Math.round(sh * scale));
  const context = scratch.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, sx, sy, sw, sh, 0, 0, scratch.width, scratch.height);
  return scratch;
}

/** Gives the scratch canvas's memory back: iOS counts canvas backing stores. */
function releaseScratch() {
  if (!scratch) return;
  scratch.width = 0;
  scratch.height = 0;
  scratch = null;
}

// ── the camera ─────────────────────────────────────────────────────────────

/** The one live camera session, so every exit path can stop it. */
let session = null;

function cameraError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new AppError('error.scan/denied', { code: 'scan/denied', cause: error });
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return new AppError('error.scan/no-camera', { code: 'scan/no-camera', cause: error });
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return new AppError('error.scan/busy', { code: 'scan/busy', cause: error });
  }
  return new AppError('error.scan/camera', { code: 'scan/camera', cause: error });
}

/**
 * Stops whatever camera session is running: tracks, frame loop, video, the
 * scratch canvas. Idempotent — the sheet closing, a result, an error, the app
 * going to the background and the page being frozen can all call it, in any
 * order, any number of times. No green camera light survives it.
 */
export function stopCamera() {
  const current = session;
  session = null;
  if (!current) return;
  current.stopped = true;
  cancelAnimationFrame(current.frame);
  for (const track of current.stream?.getTracks() || []) track.stop();
  if (current.video) {
    current.video.pause?.();
    current.video.srcObject = null;
    current.video.removeAttribute('src');
  }
  releaseScratch();
  current.reject?.(new DOMException('stopped', 'AbortError'));
}

// Leaving the screen stops the camera: iOS would otherwise keep the indicator
// lit (or kill the page for holding it), and a scan nobody is looking at is
// not a scan.
onBackground(() => stopCamera());

/**
 * Opens the camera into `video` and resolves with the first code read.
 *
 * @param {HTMLVideoElement} video
 * @param {{signal?: AbortSignal, onEngine?: (name: string) => void}} [options]
 * @returns {Promise<{value: string, format: string}>}
 */
export async function scanFromCamera(video, { signal, onEngine } = {}) {
  stopCamera();
  if (!cameraAvailable()) throw new AppError('error.scan/no-camera', { code: 'scan/no-camera' });

  // The engine first: if the decoder cannot be had (offline, never cached) the
  // camera is not switched on for nothing.
  const engine = await scannerEngine();
  onEngine?.(engine.name);
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  let stream;
  try {
    // Preferences, not requirements: an `exact` constraint is how a perfectly
    // good iPhone camera gets refused.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (error) {
    // Refused, missing or busy is a normal answer from a phone, told to the
    // customer in the sheet; a warning here, not an error.
    console.warn('[scan] camera refused', error?.name || error);
    throw cameraError(error);
  }

  const mine = { stream, video, stopped: false, frame: 0, reject: null };
  if (signal?.aborted) { for (const track of stream.getTracks()) track.stop(); throw new DOMException('aborted', 'AbortError'); }
  session = mine;

  // Inline, muted, no controls: Safari otherwise takes a playing <video>
  // fullscreen, and refuses to autoplay one with sound.
  video.muted = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.srcObject = stream;
  try {
    await video.play();
  } catch (error) {
    if (!mine.stopped) console.warn('[scan] preview did not start', error);
  }

  try {
    return await new Promise((resolve, reject) => {
      mine.reject = reject;
      signal?.addEventListener('abort', () => { if (session === mine) stopCamera(); else reject(new DOMException('aborted', 'AbortError')); }, { once: true });

      // Throttled: a decode per frame at 60fps would heat the phone for no
      // better result. ~10 attempts a second for ZXing, a little more for the
      // native detector, which is far cheaper.
      const interval = engine.name === 'native' ? 80 : 100;
      let last = 0;
      let busy = false;
      let candidate = null;

      const tick = async (now) => {
        if (mine.stopped) return;
        mine.frame = requestAnimationFrame(tick);
        if (busy || now - last < interval || video.readyState < 2) return;
        last = now;
        busy = true;
        try {
          const code = await engine.detect(video);
          if (mine.stopped || !code) return;
          // A 1-D code misread once is still a misread; two identical reads
          // in a row are a read. 2-D symbols check themselves.
          if (SELF_CHECKING.has(code.format) || (candidate && candidate.value === code.value && candidate.format === code.format)) {
            mine.reject = null;
            resolve(code);
            stopCamera();
          } else {
            candidate = code;
          }
        } catch (error) {
          // A frame the decoder chokes on is skipped, not fatal.
          console.debug('[scan] frame skipped', error?.message);
        } finally {
          busy = false;
        }
      };
      mine.frame = requestAnimationFrame(tick);
    });
  } finally {
    if (session === mine) stopCamera();
  }
}

// ── photos ─────────────────────────────────────────────────────────────────

/**
 * Reads a code from a photo the customer chose — the way through when the
 * camera is refused, the code is already in Photos, or live scanning fights
 * reflective packaging.
 *
 * @param {File|Blob} file
 * @returns {Promise<{value: string, format: string}>}
 */
export async function scanFromImage(file) {
  const image = await decodeImage(file);
  try {
    const engine = await scannerEngine();
    let code = await engine.detect(image.source);
    // A photo is worth a second, harder look: the native detector sometimes
    // passes on a code ZXing reads at full resolution.
    if (!code && engine.name !== 'zxing') {
      const zxing = await loadZxing().catch(() => null);
      if (zxing) code = await zxing.detect(image.source);
    }
    if (!code) throw new AppError('error.scan/not-found', { code: 'scan/not-found' });
    return code;
  } finally {
    image.release();
    releaseScratch();
  }
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, release: () => bitmap.close?.() };
    } catch (error) {
      console.debug('[scan] createImageBitmap refused the file; trying <img>', error?.message);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new AppError('error.scan/bad-image', { code: 'scan/bad-image', cause: error });
  }
}
