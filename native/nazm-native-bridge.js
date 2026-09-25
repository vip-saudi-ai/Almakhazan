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

  /** https and mailto only (the app enforces this before calling). */
  openUrl(url) {
    if (url.startsWith('mailto:')) return App.openUrl?.({ url }) ?? window.open(url, '_system');
    return Browser.open({ url, presentationStyle: 'popover' });
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
