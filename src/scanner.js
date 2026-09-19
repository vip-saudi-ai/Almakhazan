// Barcode and QR scanning from the camera.
//
// Uses the browser's own BarcodeDetector where it exists (Chrome and Android
// WebView today). Safari does not ship it, so rather than bundling a decoder
// that would double the app's size for one field, the scanner says plainly
// that the device cannot do it and hands the customer back to typing. A
// feature that pretends to work is worse than one that admits it does not.

const FORMATS = [
  'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'data_matrix',
];

export function scanningSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/** Formats the device can actually read, which is not always all of them. */
export async function supportedFormats() {
  if (!scanningSupported()) return [];
  try {
    const available = await window.BarcodeDetector.getSupportedFormats();
    return FORMATS.filter((format) => available.includes(format));
  } catch (error) {
    console.error('[scan] could not list formats', error);
    return [];
  }
}

/**
 * Opens the camera and resolves with the first code it reads.
 *
 * @param {HTMLVideoElement} video where to show the camera
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<{value: string, format: string}>}
 */
export async function scanFromCamera(video, { signal } = {}) {
  if (!scanningSupported()) {
    throw new Error('هذا الجهاز لا يدعم المسح داخل المتصفح — أدخل الرقم يدوياً');
  }

  const formats = await supportedFormats();
  const detector = new window.BarcodeDetector({ formats: formats.length ? formats : undefined });

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch (error) {
    console.error('[scan] camera refused', error);
    if (error?.name === 'NotAllowedError') throw new Error('لم يُسمح باستخدام الكاميرا');
    throw new Error('تعذّر فتح الكاميرا');
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play().catch(() => {});

  const stop = () => {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  try {
    return await new Promise((resolve, reject) => {
      let stopped = false;
      const finish = (fn, value) => { if (!stopped) { stopped = true; fn(value); } };

      signal?.addEventListener('abort', () => finish(reject, new DOMException('aborted', 'AbortError')));

      const tick = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          const first = codes.find((code) => code.rawValue);
          if (first) {
            finish(resolve, { value: first.rawValue.trim(), format: first.format });
            return;
          }
        } catch (error) {
          // A frame that cannot be decoded is normal; a detector that keeps
          // throwing is not, so it is reported once and the loop continues.
          console.debug('[scan] frame skipped', error?.message);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } finally {
    stop();
  }
}
