// Account and data lifecycle — the one module that deletes people's things.
//
// Every destructive operation the account screens offer is a function here,
// and nothing else in the UI mutates storage or calls the backend for them:
//
//   eraseLocalData()               this device's inventory, gone from this device
//   deleteAccount()                the cloud account, by the backend
//   accountDeletionStatus()        what deleting would do, asked first
//   reauthenticate(method, secret) a fresh sign-in, required before deleting
//   leaveWorkspace(id)             a member leaves (backend)
//   transferWorkspaceOwnership()   an owner hands over (backend)
//   deleteWorkspace(id, name)      an owner deletes, with a grace period (backend)
//
// None of these reports success before the operation has actually completed,
// and none of them runs twice at once. Access control is the backend's: these
// calls are checked there again for identity, recent sign-in, membership and
// role — the client deciding to show a button proves nothing.

import * as local from './local-store.js';
import { firebaseContext } from './firebase.js';
import { Feature, isFeatureAvailable } from './features.js';
import { hasNativeSignIn, nativeSignIn } from './platform.js';
import { releaseObjectUrls } from './storage.js';
import { AppError } from './utils.js';
import { isImportRunning } from './views/sheet-import.js';
import { isRestoreRunning } from './restore.js';

/** Keys in localStorage that hold inventory data from earlier versions. */
const LEGACY_DATA_KEYS = ['makhzan7', 'makhzan5', 'migration.v2', 'migration.v2.backup'];

let busy = null;

/** One destructive operation at a time; a second tap waits for the first. */
function exclusive(name, work) {
  if (busy) throw new AppError('error.account/busy', { code: 'account/busy' });
  busy = name;
  return Promise.resolve().then(work).finally(() => { busy = null; });
}

// ── this device ────────────────────────────────────────────────────────────

/**
 * Deletes the device inventory: every record, folder, category, location,
 * image and import job NAZM keeps in this browser or app, the legacy copies
 * earlier versions kept, and the image URLs held in memory. It does not touch
 * a cloud account or cloud data, the chosen language, or display preferences.
 * Resolves only once every store is empty; the caller then restarts the app
 * into its first-run state.
 */
export function eraseLocalData() {
  return exclusive('erase', async () => {
    if (isImportRunning() || isRestoreRunning()) {
      throw new AppError('error.account/operation-running', { code: 'account/operation-running' });
    }
    for (const store of local.STORES) {
      await local.clearStore(store);
    }
    for (const key of LEGACY_DATA_KEYS) {
      try { localStorage.removeItem(key); } catch { /* storage blocked: nothing kept there either */ }
    }
    releaseObjectUrls();
    return { ok: true };
  });
}

// ── the cloud account ──────────────────────────────────────────────────────

function callable(name) {
  const { functions, sdk } = firebaseContext();
  if (!functions || !isFeatureAvailable(Feature.ACCOUNTS)) {
    throw new AppError('error.account/unavailable', { code: 'account/unavailable' });
  }
  return sdk.functions.httpsCallable(functions, name, { timeout: 540_000 });
}

/** The backend's reasons, as this app's error keys; never its raw text. */
function accountError(error, fallback = 'error.account/failed') {
  const reason = String(error?.message || '');
  const known = {
    'account/requires-recent-login': 'error.account/requires-recent-login',
    'account/owns-shared-workspace': 'error.account/owns-shared-workspace',
    'account/too-many-attempts': 'error.account/too-many-attempts',
    'workspace/owner-cannot-leave': 'error.account/owner-cannot-leave',
    'workspace/not-a-member': 'error.account/not-a-member',
  };
  if (known[reason]) return new AppError(known[reason], { code: reason, details: error?.details });
  if (error?.code === 'functions/unavailable' || error?.code === 'functions/deadline-exceeded') {
    return new AppError('error.account/offline', { code: 'account/offline' });
  }
  return new AppError(fallback, { code: 'account/failed' });
}

/** Whether this build can delete a cloud account from inside the app. */
export function accountDeletionAvailable() {
  return isFeatureAvailable(Feature.ACCOUNTS) && Boolean(firebaseContext().auth?.currentUser);
}

/**
 * @returns {Promise<{blocked: boolean, blocking: {id: string, name: string}[],
 *   ownedAlone: number, memberOf: number}>}
 */
export async function accountDeletionStatus() {
  try {
    const { data } = await callable('accountDeletionStatus')({});
    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw accountError(error);
  }
}

/** The sign-in methods this account has, for asking it to prove itself again. */
export function accountSignInMethods() {
  const user = firebaseContext().auth?.currentUser;
  const ids = (user?.providerData || []).map((p) => p.providerId);
  return {
    password: ids.includes('password'),
    apple: ids.includes('apple.com'),
    google: ids.includes('google.com'),
    email: user?.email || null,
  };
}

/**
 * A fresh sign-in, which the backend requires within the last few minutes
 * before it deletes anything. `method` is 'password' | 'apple' | 'google'.
 */
export async function reauthenticate(method, secret = '') {
  const { auth, sdk } = firebaseContext();
  const user = auth?.currentUser;
  if (!user) throw new AppError('error.auth/no-user', { code: 'auth/no-user' });
  const fa = sdk.auth;
  try {
    if (method === 'password') {
      await fa.reauthenticateWithCredential(user, fa.EmailAuthProvider.credential(user.email, secret));
    } else if (hasNativeSignIn()) {
      // Inside the iOS app the native sheet signs in and returns a token.
      const result = await nativeSignIn(method);
      const credential = method === 'apple'
        ? new fa.OAuthProvider('apple.com').credential({ idToken: result.idToken, rawNonce: result.rawNonce })
        : fa.GoogleAuthProvider.credential(result.idToken, result.accessToken);
      await fa.reauthenticateWithCredential(user, credential);
    } else {
      const provider = method === 'apple' ? new fa.OAuthProvider('apple.com') : new fa.GoogleAuthProvider();
      await fa.reauthenticateWithPopup(user, provider);
    }
    // The backend reads auth_time from the ID token; make sure it is the new one.
    await user.getIdToken(true);
  } catch (error) {
    const code = error?.code || '';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
      throw new AppError('error.auth/wrong-password', { code });
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'cancelled') {
      throw new AppError('error.account/reauth-cancelled', { code: 'account/reauth-cancelled' });
    }
    throw new AppError('error.account/reauth-failed', { code: 'account/reauth-failed' });
  }
}

/**
 * Deletes the account through the backend, then signs out locally. Resolves
 * only when the backend has confirmed the deletion.
 */
export function deleteAccount() {
  return exclusive('delete-account', async () => {
    try {
      await callable('deleteAccount')({ confirm: true });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw accountError(error);
    }
    // The Authentication user no longer exists; drop the local session and the
    // cloud cache it read. The device inventory is not the account's to erase.
    const { auth, sdk, db } = firebaseContext();
    // The caller restarts the app afterwards, so the Firestore instance can be
    // shut down and its on-device cache of the deleted account removed.
    await sdk.auth.signOut(auth).catch(() => {});
    await sdk.firestore.terminate?.(db).catch(() => {});
    await sdk.firestore.clearIndexedDbPersistence?.(db).catch(() => {});
    releaseObjectUrls();
    return { ok: true };
  });
}

export async function leaveWorkspace(workspaceId) {
  try {
    await callable('leaveWorkspace')({ workspaceId });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw accountError(error);
  }
}

export async function transferWorkspaceOwnership(workspaceId, newOwnerId) {
  try {
    await callable('transferWorkspaceOwnership')({ workspaceId, newOwnerId });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw accountError(error);
  }
}

export async function deleteWorkspace(workspaceId, confirmName) {
  try {
    const { data } = await callable('requestWorkspaceDeletion')({ workspaceId, confirmName });
    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw accountError(error);
  }
}
