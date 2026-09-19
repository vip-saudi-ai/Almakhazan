// The scanning sheet.
//
// Opens the camera, reads the first code, and hands it to whoever asked. On a
// device without BarcodeDetector it says so and closes — no half-working
// camera view that never finds anything.

import { scanFromCamera, scanningSupported } from '../scanner.js';
import { $, setText } from '../utils.js';
import { closeSheet, openSheet, toast, toastError } from '../ui.js';

let controller = null;

/**
 * @param {{onCode: (code: {value: string, format: string}) => void, title?: string}} options
 */
export async function openScanner({ onCode, title = 'وجّه الكاميرا نحو الباركود أو رمز QR' }) {
  if (!scanningSupported()) {
    toast('هذا الجهاز لا يدعم المسح داخل المتصفح — أدخل الرقم يدوياً', '⚠');
    return;
  }

  openSheet('scan');
  setText('scan-hint', title);

  controller?.abort();
  controller = new AbortController();

  try {
    const code = await scanFromCamera($('scan-video'), { signal: controller.signal });
    closeSheet('scan');
    onCode(code);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    closeSheet('scan');
    toastError(error, 'تعذّر المسح');
  }
}

/** Called when the sheet closes by any route, so the camera never stays on. */
export function stopScanner() {
  controller?.abort();
  controller = null;
}
