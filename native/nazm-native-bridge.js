// Reference bridge for the iOS container — NOT loaded by the web app.
//
// The app talks to the platform only through window.NazmNative (see
// src/platform.js). In the Capacitor project, load this file (bundled with
// the plugins below) BEFORE nazm.config.js and the app, for example as the
// first <script> in the copied index.html. Every method is optional: a method
// that is not defined simply makes its feature unavailable in the UI.
//
// Plugins assumed (install and `npx cap sync ios`):
//   @capacitor/app, @capacitor/browser, @capacitor/share, @capacitor/filesystem,
//   @capacitor/status-bar,
//   capacitor-native-settings                       (Open Settings)
//   @capacitor-firebase/authentication              (Apple / Google, native)
//   a StoreKit plugin of your choice                (only when billing is on)
//   a print plugin of your choice                   (only if labels print)
//
// Adjust to the plugin versions you install; this file documents the shape the
// app expects, it is not a tested build artefact.

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { StatusBar, Style } from '@capacitor/status-bar';
import { NativeSettings, IOSSettings } from 'capacitor-native-settings';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const info = await App.getInfo();

window.NazmNative = {
  platform: 'ios',
  appVersion: info.version,   // CFBundleShortVersionString — keep equal to APP_VERSION
  buildNumber: info.build,    // CFBundleVersion

  /** https only (the app validates before calling). */
  openUrl(url) {
    if (url.startsWith('mailto:')) return window.open(url, '_system');
    return Browser.open({ url, presentationStyle: 'popover' });
  },

  /** A validated address; subject and body are plain text. Optional: without
   *  it the app hands openUrl an encoded mailto: URL. */
  composeEmail({ to, subject, body }) {
    const query = new URLSearchParams({ subject, body }).toString().replaceAll('+', '%20');
    return window.open(`mailto:${to}?${query}`, '_system');
  },

  /** Exports and backups: write to a temporary file, then the share sheet. */
  async shareFile({ filename, mimeType, base64 }) {
    const written = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, url: written.uri, dialogTitle: filename });
    } finally {
      Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {});
    }
  },

  // ── large files, written a piece at a time (the Full Backup) ──
  // The archive can be many gigabytes (ZIP64); it never exists in the
  // WebView's memory. The contract the app relies on (src/platform.js):
  //
  //   beginFile({ filename, mimeType }) → handle
  //       create an EMPTY temporary file under Caches, in a folder of its own,
  //       named `<filename>.partial` — never the final name.
  //   appendFile({ handle, base64 })
  //       append one decoded slice (≤ 512 KB of Base64) to the end of that file,
  //       without reading or rewriting what is already there. Reject on any
  //       write error (disk full included): the app then aborts.
  //   finishFile({ handle })
  //       close the file, rename `<filename>.partial` to `<filename>` (an
  //       atomic rename within the folder), and present the share sheet
  //       (Save to Files, iCloud Drive, AirDrop…). Resolve only once the
  //       system has taken the file; REJECT if the customer cancels or the
  //       export fails. Delete the temporary folder either way. The app records
  //       a successful backup only when this resolves.
  //   abortFile({ handle })
  //       delete the partial file. Never throws.
  //
  // A partially written .nazmbackup is therefore never visible under its real
  // name, and never offered to the customer.
  //
  // For a long backup, the Swift side may wrap the work between beginFile and
  // finishFile in UIApplication.beginBackgroundTask so a brief switch away does
  // not kill it; iOS still limits that time, and the app does not depend on it
  // — an interrupted backup simply is not recorded, and is made again.
  async beginFile({ filename }) {
    const folder = `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const handle = { folder, partial: `${folder}/${filename}.partial`, final: `${folder}/${filename}` };
    await Filesystem.writeFile({ path: handle.partial, data: '', directory: Directory.Cache, recursive: true });
    return JSON.stringify(handle);
  },
  appendFile({ handle, base64 }) {
    const { partial } = JSON.parse(handle);
    // No `encoding`: Capacitor decodes the Base64 and appends raw bytes.
    return Filesystem.appendFile({ path: partial, data: base64, directory: Directory.Cache });
  },
  async finishFile({ handle }) {
    const { folder, partial, final } = JSON.parse(handle);
    try {
      await Filesystem.rename({ from: partial, to: final, directory: Directory.Cache, toDirectory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: final, directory: Directory.Cache });
      await Share.share({ url: uri });
    } finally {
      Filesystem.rmdir({ path: folder, directory: Directory.Cache, recursive: true }).catch(() => {});
    }
  },
  abortFile({ handle }) {
    const { folder } = JSON.parse(handle);
    return Filesystem.rmdir({ path: folder, directory: Directory.Cache, recursive: true }).catch(() => {});
  },

  // Free space for a Full Backup or Restore, checked before starting (optional).
  // Implement natively with URLResourceValues.volumeAvailableCapacityForImportantUsage
  // on the app's container URL and return the number of bytes; @capacitor/device
  // (getInfo().realDiskFree) is an acceptable approximation. Without it the app
  // proceeds and relies on the write failing cleanly instead.
  // async availableDiskSpace() { return (await Device.getInfo()).realDiskFree; },

  openSettings() {
    return NativeSettings.openIOS({ option: IOSSettings.App });
  },

  setStatusBarStyle(theme) {
    // 'dark' page → light text; 'light' page → dark text.
    return StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
  },

  /**
   * Native federated sign-in. Returns the identity token the web layer turns
   * into a Firebase credential (src/auth.js). skipNativeAuth keeps the
   * Firebase session in the web SDK, which is the one the app uses.
   */
  async signIn(provider) {
    if (provider === 'apple') {
      const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
      return { idToken: result.credential?.idToken, rawNonce: result.credential?.nonce };
    }
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    return { idToken: result.credential?.idToken, accessToken: result.credential?.accessToken };
  },

  // print() — add only with a print plugin (UIPrintInteractionController on
  // the WebView). Without it, the QR-label buttons are hidden automatically.

  // purchase / restorePurchases / manageSubscriptions — add only with StoreKit,
  // and only switch features.billing on once all three work (src/billing.js).
};
