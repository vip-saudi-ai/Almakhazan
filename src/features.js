// Which capabilities this build offers, in one place.
//
// Two questions, kept apart:
//
//   isFeatureEnabled(name)   — is it part of this release at all? Read from
//                              nazm.config.js. A disabled feature has no UI:
//                              no button, no price, no "coming soon".
//   isFeatureAvailable(name) — can it be used right now? Enabled, and whatever
//                              it depends on is up (the cloud reachable, the
//                              customer signed in, the platform capable).
//
// Views ask these two functions; none of them reads a flag, a Firebase status
// or `window.Capacitor` directly. Hidden UI is not access control — every
// backend operation still checks the caller, the workspace, the role and the
// resource itself (SECURITY.md).

import { ENV } from './environment.js';
import { firebaseContext, isCloudOff, FirebaseStatus } from './firebase.js';
import { canOpenSettings, canPrint, hasNativeSignIn, isNative, usesServiceWorker } from './platform.js';

export const Feature = Object.freeze({
  CLOUD: 'cloud',             // Firebase at all
  ACCOUNTS: 'accounts',       // sign-in, registration, the account screen
  SYNC: 'sync',               // records in Firestore
  CLOUD_MEDIA: 'cloudMedia',  // images in Cloud Storage
  CLOUD_RESTORE: 'cloudRestore',
  REMOTE_IMPORT: 'remoteImport', // server-side import jobs
  TEAM: 'team',               // members, invitations, workspace switching
  BILLING: 'billing',         // paid plans, purchase, restore, manage
  CLOUD_AI: 'cloudAi',        // photo analysis by an external provider
  PRINT: 'print',             // printing QR labels
  APP_SETTINGS_LINK: 'appSettingsLink', // "Open Settings" after a denied permission
  WEB_UPDATES: 'webUpdates',  // service-worker update prompt
});

const CLOUD_DEPENDENT = new Set([
  Feature.ACCOUNTS, Feature.SYNC, Feature.CLOUD_MEDIA, Feature.CLOUD_RESTORE,
  Feature.REMOTE_IMPORT, Feature.TEAM, Feature.CLOUD_AI,
]);

/** Part of this release? (Configuration only; no runtime state.) */
export function isFeatureEnabled(name) {
  const flags = ENV.features;
  switch (name) {
    case Feature.CLOUD:
    case Feature.ACCOUNTS:
    case Feature.SYNC:
    case Feature.CLOUD_MEDIA:
    case Feature.CLOUD_RESTORE:
    case Feature.REMOTE_IMPORT:
      return flags.cloud;
    case Feature.TEAM: return flags.cloud && flags.team;
    case Feature.CLOUD_AI: return flags.cloud && flags.cloudAi;
    case Feature.BILLING: return flags.billing;
    case Feature.PRINT: return canPrint();
    case Feature.APP_SETTINGS_LINK: return canOpenSettings();
    case Feature.WEB_UPDATES: return usesServiceWorker();
    default: return false;
  }
}

/** Usable now: enabled, and the cloud up when it needs the cloud. */
export function isFeatureAvailable(name) {
  if (!isFeatureEnabled(name)) return false;
  if (!CLOUD_DEPENDENT.has(name)) return true;
  const { status } = firebaseContext();
  return !isCloudOff(status) && (status === FirebaseStatus.READY || status === FirebaseStatus.OFFLINE);
}

/**
 * Sign-in methods, by what is configured — not by what a button would like to
 * offer. Apple and Google are offered together or not at all on iOS (App
 * Review Guideline 4.8); inside the native app both need the native bridge,
 * because the web popup flows do not work in a WKWebView.
 */
export function isAuthProviderAvailable(provider) {
  if (!isFeatureAvailable(Feature.ACCOUNTS)) return false;
  const configured = ENV.auth.providers;
  if (provider === 'email') return configured.email;
  if (provider !== 'apple' && provider !== 'google') return false;
  if (!configured[provider]) return false;
  // Offering Google without Apple on iOS would be rejected; refuse to.
  if (provider === 'google' && isNative() && !configured.apple) {
    warnOnce('google-without-apple', 'Google sign-in is configured without Sign in with Apple; hidden on iOS.');
    return false;
  }
  if (isNative() && !hasNativeSignIn()) {
    warnOnce(`native-${provider}`, `${provider} sign-in needs the native bridge (NazmNative.signIn) in the iOS app; hidden.`);
    return false;
  }
  return true;
}

const warned = new Set();
function warnOnce(key, message) {
  if (warned.has(key) || ENV.environment !== 'development') return;
  warned.add(key);
  console.warn(`[features] ${message}`);
}

/**
 * Hides the static markup of features this build does not offer. Elements are
 * tagged `data-feature="<name>"` in index.html; `hidden` plus the stylesheet's
 * `[data-feature][hidden]` rule keeps them out of layout, the accessibility
 * tree and the tab order even if a view later touches their inline style.
 */
export function applyFeatureVisibility(root = document) {
  for (const node of root.querySelectorAll('[data-feature]')) {
    node.hidden = !isFeatureEnabled(node.dataset.feature);
  }
}
