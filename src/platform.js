// The platform the app is running on, and the capabilities that differ.
//
// Feature code asks this module — never `window.Capacitor`, never a user-agent
// string. On the web every function has a browser implementation. Inside the
// native iOS container (Capacitor or any WKWebView host) the host installs a
// bridge object before the app loads:
//
//   window.NazmNative = {
//     platform: 'ios',
//     appVersion: '1.0.0', buildNumber: '1',
//     openUrl(url),                         // SFSafariViewController / system browser
//     shareFile({ filename, mimeType, base64 }),   // UIActivityViewController
//     openSettings(),                       // UIApplication.openSettingsURLString
//     print(),                              // UIPrintInteractionController of the WebView
//     setStatusBarStyle('light' | 'dark'),
//     signIn(provider),  // 'apple' | 'google' → { idToken, rawNonce?, accessToken? }
//   };
//
// Every method is optional; a capability the bridge does not provide is
// reported as unavailable and its UI is not shown. See IOS-RELEASE.md.

import { APP_VERSION } from './config.js';

const bridge = () => globalThis.NazmNative || null;

/** Running inside the native app container rather than a browser. */
export function isNative() {
  if (bridge()) return true;
  return Boolean(globalThis.Capacitor?.isNativePlatform?.());
}

/** 'ios' | 'android' | 'web'. */
export function platformName() {
  const declared = bridge()?.platform || globalThis.Capacitor?.getPlatform?.();
  return declared === 'ios' || declared === 'android' ? declared : 'web';
}

/** The marketing version, and the native build number when there is one. */
export function getAppVersion() {
  const native = bridge();
  return {
    version: typeof native?.appVersion === 'string' ? native.appVersion : APP_VERSION,
    build: typeof native?.buildNumber === 'string' ? native.buildNumber : null,
  };
}

const SAFE_SCHEMES = new Set(['https:', 'mailto:']);

/**
 * Opens a web page or a mail draft outside the app. Only https and mailto are
 * accepted: nothing here may navigate the app's own WebView away from itself.
 * @returns {boolean} whether it was handed to the platform
 */
export function openExternalUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (!SAFE_SCHEMES.has(parsed.protocol)) return false;
  const native = bridge();
  if (native?.openUrl) {
    Promise.resolve(native.openUrl(parsed.href)).catch((error) => console.warn('[platform] openUrl failed', error?.message));
    return true;
  }
  if (parsed.protocol === 'mailto:') {
    // A mailto link opens the mail app and leaves the page where it is.
    const link = document.createElement('a');
    link.href = parsed.href;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    return true;
  }
  return Boolean(window.open(parsed.href, '_blank', 'noopener,noreferrer'));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Hands a generated file to the customer: the share sheet (Save to Files,
 * Mail, AirDrop…) in the native app, a download in a browser. A WKWebView
 * cannot follow a blob: download link, which is why this is not left to an
 * anchor there. Throws when the platform refuses, so callers that depend on
 * the file (the restore safety backup) can stop.
 */
export async function saveFile(blob, filename) {
  const native = bridge();
  if (native?.shareFile) {
    const base64 = await blobToBase64(blob);
    await native.shareFile({ filename, mimeType: blob.type || 'application/octet-stream', base64 });
    return;
  }
  if (isNative()) throw new Error('file export is not available in this build');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Printing works in browsers; in the native app only through the bridge. */
export function canPrint() {
  if (isNative()) return typeof bridge()?.print === 'function';
  return typeof window.print === 'function';
}

export function print() {
  const native = bridge();
  if (native?.print) return Promise.resolve(native.print());
  window.print();
  return Promise.resolve();
}

/** The system Settings page for this app — where a denied camera is re-allowed. */
export function canOpenSettings() {
  return typeof bridge()?.openSettings === 'function';
}

export function openSettings() {
  if (!canOpenSettings()) return false;
  Promise.resolve(bridge().openSettings()).catch((error) => console.warn('[platform] openSettings failed', error?.message));
  return true;
}

/** The status bar follows the app's theme; the native host draws it. */
export function setStatusBarStyle(theme) {
  const native = bridge();
  if (typeof native?.setStatusBarStyle !== 'function') return;
  Promise.resolve(native.setStatusBarStyle(theme === 'dark' ? 'dark' : 'light')).catch(() => {});
}

/**
 * Native sign-in for a federated provider. In a WKWebView, Firebase's popup
 * and redirect flows are unreliable (no popups, and Apple requires the native
 * AuthenticationServices sheet), so the host performs the sign-in and returns
 * the identity token, which src/auth.js exchanges for a Firebase credential.
 * @returns {boolean}
 */
export function hasNativeSignIn() {
  return typeof bridge()?.signIn === 'function';
}

export function nativeSignIn(provider) {
  return Promise.resolve(bridge().signIn(provider));
}

/** Service workers are a web delivery mechanism; the native app ships its code
 *  in the bundle and is updated through the App Store. */
export function usesServiceWorker() {
  return !isNative();
}
