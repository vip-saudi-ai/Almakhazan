// The scanning sheet.
//
// Three ways to a code, in the order a customer reaches for them: the live
// camera (native detector or the self-hosted ZXing fallback — see
// src/scanner.js), a photo from the library, or typing it. A camera that is
// refused, missing or busy says which, in the sheet, and the other two ways
// stay one tap away; nothing closes on the customer with a bare "failed".
//
// The camera stops on every way out: a read, Cancel, the close button, the
// overlay, Escape, another sheet, the app leaving the screen.

import { cameraAvailable, scanFromCamera, scanFromImage, stopCamera } from '../scanner.js';
import { $, describeError, setText } from '../utils.js';
import { closeSheet, isSheetOpen, onSheetClose, openSheet } from '../ui.js';
import { onLanguageChange, t } from '../i18n.js';
import { Feature, isFeatureEnabled } from '../features.js';
import { openSettings } from '../platform.js';

let controller = null;
/** The open request: what to do with a code, or with "I'll type it". */
let request = null;
/** What the status line says, as a key or an error, so a switch re-translates it. */
let status = null;
let bound = false;

function frame() { return $('scan-frame'); }

function showStatus(next) {
  status = next;
  let text = '';
  if (next?.error) text = describeError(next.error, 'scan.failed');
  else if (next?.key) text = t(next.key);
  setText('scan-state', text);
  frame()?.classList.toggle('is-idle', Boolean(next?.error));
  // A refused camera is re-allowed in the system Settings; in the native app
  // that page is one tap away. The web cannot open it, so there it is said.
  const settings = $('scan-settings');
  if (settings) settings.hidden = !(next?.error?.code === 'scan/denied' && isFeatureEnabled(Feature.APP_SETTINGS_LINK));
}

function bind() {
  if (bound) return;
  bound = true;
  $('scan-photo')?.addEventListener('click', () => $('scan-photo-input')?.click());
  $('scan-settings')?.addEventListener('click', () => openSettings());
  $('scan-photo-input')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void readPhoto(file);
  });
  $('scan-manual')?.addEventListener('click', () => {
    const current = request;
    finish();
    closeSheet('scan');
    current?.onManual?.();
  });
  // However the sheet closes, the camera goes off with it.
  onSheetClose('scan', () => finish());
  onLanguageChange(() => {
    if (!isSheetOpen('scan')) return;
    if (request?.titleKey) setText('scan-hint', t(request.titleKey));
    showStatus(status);
  });
}

/**
 * @param {{onCode: (code: {value: string, format: string}) => void,
 *          onManual?: () => void, titleKey?: string}} options
 */
export async function openScanner({ onCode, onManual, titleKey = 'scan.aim' }) {
  bind();
  finish();
  request = { onCode, onManual, titleKey };
  setText('scan-hint', t(titleKey));
  showStatus(null);
  openSheet('scan');
  await startLive();
}

async function startLive() {
  if (!cameraAvailable()) {
    showStatus({ error: { code: 'scan/no-camera', messageKey: 'error.scan/no-camera' } });
    return;
  }
  controller = new AbortController();
  const { signal } = controller;
  showStatus({ key: 'scan.starting' });
  try {
    const code = await scanFromCamera($('scan-video'), {
      signal,
      onEngine: () => { if (!signal.aborted) showStatus(null); },
    });
    if (!signal.aborted) deliver(code);
  } catch (error) {
    if (error?.name === 'AbortError' || signal.aborted) return;
    report('live scan ended', error);
    showStatus({ error });
  }
}

/** An answer the customer is shown (no camera, no code in the photo) is a
 *  warning; anything else is a fault worth an error in the log. */
const EXPECTED = new Set(['scan/denied', 'scan/no-camera', 'scan/busy', 'scan/not-found', 'scan/bad-image']);
function report(what, error) {
  if (EXPECTED.has(error?.code)) console.warn(`[scan] ${what}:`, error.code);
  else console.error(`[scan] ${what}`, error);
}

async function readPhoto(file) {
  // The live preview stops while a photo is read: one decoder at a time, and
  // the camera light off the moment it is not needed.
  controller?.abort();
  stopCamera();
  showStatus({ key: 'scan.reading' });
  try {
    const code = await scanFromImage(file);
    if (request) deliver(code);
  } catch (error) {
    report('photo not read', error);
    if (request) showStatus({ error });
  }
}

function deliver(code) {
  const current = request;
  frame()?.classList.add('hit');
  // A tick where the platform has one (Android); iOS has no web vibration, and
  // the flash of the guide is the feedback there.
  try { navigator.vibrate?.(30); } catch { /* not allowed: fine */ }
  finish();
  setTimeout(() => {
    frame()?.classList.remove('hit');
    closeSheet('scan');
    current?.onCode(code);
  }, 160);
}

/** Stops the camera and forgets the request. Safe to call any number of times. */
function finish() {
  controller?.abort();
  controller = null;
  stopCamera();
  request = null;
}

/** Called when the sheet closes by any route, so the camera never stays on. */
export function stopScanner() {
  finish();
}
