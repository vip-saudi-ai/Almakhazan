// Deterministic Firebase bootstrap.
//
// initializeFirebase() is awaited exactly once and resolves to an explicit
// status. Nothing else in the app guesses at readiness from a global flag, and
// no data is loaded or written before this settles.

import { APP_CHECK_SITE_KEY, FIREBASE_CONFIG, FUNCTIONS_REGION } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.0';

export const FirebaseStatus = {
  READY: 'ready',           // SDK loaded, project reachable
  OFFLINE: 'offline',       // SDK loaded but no network; cached reads only
  UNAVAILABLE: 'unavailable', // SDK could not be loaded at all
  UNCONFIGURED: 'unconfigured', // no project configured
};

// Startup must never be able to hang. A slow CDN, a captive portal, or an
// origin where Firebase cannot run all resolve to "no cloud" instead of an
// await that never settles.
const BOOTSTRAP_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    )),
  ]);
}

let bootstrapPromise = null;

/** @type {{status: string, app: any, db: any, storage: any, auth: any, functions: any, sdk: any, error: Error|null}} */
let context = {
  status: FirebaseStatus.UNAVAILABLE,
  app: null, db: null, storage: null, auth: null, functions: null, sdk: null, error: null,
};

export function firebaseContext() {
  return context;
}

export function isCloudEnabled() {
  return context.status === FirebaseStatus.READY || context.status === FirebaseStatus.OFFLINE;
}

async function loadSdk() {
  const [appMod, firestoreMod, storageMod, authMod, functionsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-storage.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-functions.js`),
  ]);
  return { app: appMod, firestore: firestoreMod, storage: storageMod, auth: authMod, functions: functionsMod };
}

async function enableAppCheck(app) {
  if (!APP_CHECK_SITE_KEY) return;
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import(`${SDK}/firebase-app-check.js`);
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    // App Check is a hardening layer; its absence must be visible but not fatal.
    console.error('[firebase] App Check initialization failed', error);
  }
}

/**
 * Initializes Firebase once. Safe to await from multiple call sites.
 * Never throws — the caller inspects `status` and decides how to proceed.
 */
export function initializeFirebase() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    if (!FIREBASE_CONFIG?.projectId) {
      context = { ...context, status: FirebaseStatus.UNCONFIGURED };
      return context;
    }

    // Firebase Auth and Firestore cannot operate on a file:// origin — Auth in
    // particular never reports a state there, which would stall startup.
    if (window.location.protocol === 'file:') {
      console.warn('[firebase] file:// origin — running locally without cloud services');
      context = { ...context, status: FirebaseStatus.UNCONFIGURED };
      return context;
    }

    let sdk;
    try {
      sdk = await withTimeout(loadSdk(), BOOTSTRAP_TIMEOUT_MS, 'Firebase SDK load');
    } catch (error) {
      console.error('[firebase] SDK could not be loaded', error);
      context = { ...context, status: FirebaseStatus.UNAVAILABLE, error };
      return context;
    }

    try {
      const app = sdk.app.initializeApp(FIREBASE_CONFIG);
      await withTimeout(enableAppCheck(app), BOOTSTRAP_TIMEOUT_MS, 'App Check')
        .catch((error) => console.error('[firebase] App Check did not settle', error));

      // Firestore's own IndexedDB cache is the offline store; the app does not
      // keep a second copy of cloud data anywhere else.
      let db;
      try {
        db = sdk.firestore.initializeFirestore(app, {
          localCache: sdk.firestore.persistentLocalCache({
            tabManager: sdk.firestore.persistentMultipleTabManager(),
          }),
        });
      } catch (error) {
        console.error('[firebase] persistent cache unavailable, falling back to memory cache', error);
        db = sdk.firestore.getFirestore(app);
      }

      const storage = sdk.storage.getStorage(app);
      const auth = sdk.auth.getAuth(app);
      const functions = sdk.functions.getFunctions(app, FUNCTIONS_REGION);

      context = {
        status: navigator.onLine ? FirebaseStatus.READY : FirebaseStatus.OFFLINE,
        app, db, storage, auth, functions, sdk, error: null,
      };
      return context;
    } catch (error) {
      console.error('[firebase] initialization failed', error);
      context = { ...context, status: FirebaseStatus.UNAVAILABLE, error };
      return context;
    }
  })();

  return bootstrapPromise;
}

/** Keeps the reported status in step with connectivity once initialized. */
export function watchConnectivity(onChange) {
  const update = () => {
    if (context.status === FirebaseStatus.UNAVAILABLE || context.status === FirebaseStatus.UNCONFIGURED) return;
    context = { ...context, status: navigator.onLine ? FirebaseStatus.READY : FirebaseStatus.OFFLINE };
    onChange?.(context.status);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}
