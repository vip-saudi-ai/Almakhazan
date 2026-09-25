// Authentication and workspace membership.
//
// Every mutation is attributed to a signed-in user. Roles are stored server-side
// in workspaces/{id}/members/{uid} and enforced by Security Rules; the role kept
// here only drives what the UI offers.

import { ROLES } from './config.js';
import { AppError } from './utils.js';
import { hasMessage, t } from './i18n.js';
import { firebaseContext, isCloudEnabled } from './firebase.js';

let session = { user: null, workspaceId: null, role: null, ready: false };
const listeners = new Set();

export function currentSession() {
  return session;
}

export function onSessionChange(listener) {
  listeners.add(listener);
  if (session.ready) listener(session);
  return () => listeners.delete(listener);
}

function emit(next) {
  session = { ...session, ...next };
  for (const listener of listeners) listener(session);
}

/** Starts observing auth state. Resolves once the first state is known. */
export function initializeAuthentication() {
  const { auth, sdk } = firebaseContext();
  if (!isCloudEnabled() || !auth) {
    emit({ user: null, workspaceId: 'local', role: ROLES.OWNER, ready: true, local: true });
    return Promise.resolve(session);
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // Auth normally reports within a few hundred milliseconds. If it does not
    // report at all, start signed out rather than stalling startup; a later
    // callback still switches the app into cloud mode through onSessionChange.
    const timer = setTimeout(() => {
      if (settled) return;
      console.error('[auth] no auth state within 8s — starting signed out');
      emit({ user: null, workspaceId: null, role: null, ready: true, local: false });
      settle(session);
    }, 8000);

    sdk.auth.onAuthStateChanged(auth, async (user) => {
      if (!user) {
        emit({ user: null, workspaceId: null, role: null, ready: true, local: false });
      } else {
        try {
          const membership = await resolveWorkspace(user);
          emit({ user: toProfile(user), ...membership, ready: true, local: false });
        } catch (error) {
          console.error('[auth] workspace resolution failed', error);
          emit({ user: toProfile(user), workspaceId: null, role: null, ready: true, error, local: false });
        }
      }
      clearTimeout(timer);
      settle(session);
    });
  });
}

function toProfile(user) {
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || user.email?.split('@')[0] || t('auth.defaultUser'),
    photoURL: user.photoURL || null,
    isAnonymous: user.isAnonymous,
    emailVerified: user.emailVerified,
  };
}

/**
 * Finds the workspace this user belongs to, creating a personal one on first
 * sign-in. The owner document and the membership are written together so a
 * half-created workspace cannot be left behind.
 */
async function resolveWorkspace(user) {
  const { db, sdk } = firebaseContext();
  const fs = sdk.firestore;

  const profileRef = fs.doc(db, 'users', user.uid);
  const profileSnap = await fs.getDoc(profileRef);
  const existingId = profileSnap.exists() ? profileSnap.data().defaultWorkspaceId : null;

  if (existingId) {
    const memberSnap = await fs.getDoc(fs.doc(db, 'workspaces', existingId, 'members', user.uid));
    if (memberSnap.exists()) {
      return { workspaceId: existingId, role: memberSnap.data().role || ROLES.VIEWER };
    }
  }

  const workspaceId = user.uid; // personal workspace, stable and collision-free
  const batch = fs.writeBatch(db);
  batch.set(fs.doc(db, 'workspaces', workspaceId), {
    name: t('workspace.defaultName', { name: toProfile(user).displayName }),
    ownerId: user.uid,
    createdAt: fs.serverTimestamp(),
    schemaVersion: 2,
  }, { merge: true });
  batch.set(fs.doc(db, 'workspaces', workspaceId, 'members', user.uid), {
    role: ROLES.OWNER,
    email: user.email || null,
    displayName: toProfile(user).displayName,
    joinedAt: fs.serverTimestamp(),
  }, { merge: true });
  batch.set(profileRef, {
    defaultWorkspaceId: workspaceId,
    email: user.email || null,
    updatedAt: fs.serverTimestamp(),
  }, { merge: true });
  await batch.commit();

  return { workspaceId, role: ROLES.OWNER };
}

function authError(error) {
  // Each Firebase code has its own message (`error.auth/…`); anything else
  // is a sign-in failure, said as one.
  const key = error?.code && hasMessage(`error.${error.code}`) ? `error.${error.code}` : 'error.auth/failed';
  return new AppError(key, { code: error?.code, cause: error });
}

export async function signInWithEmail(email, password) {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('error.auth/no-cloud', { code: 'auth/no-cloud' });
  try {
    await sdk.auth.signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error('[auth] email sign-in failed', error);
    throw authError(error);
  }
}

export async function registerWithEmail(email, password, displayName) {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('error.auth/no-cloud', { code: 'auth/no-cloud' });
  try {
    const credential = await sdk.auth.createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await sdk.auth.updateProfile(credential.user, { displayName });
  } catch (error) {
    console.error('[auth] registration failed', error);
    throw authError(error);
  }
}

/**
 * Apple sign-in. Requires the Apple provider to be enabled in the Firebase
 * console and an Apple Developer Services ID — see DEPLOYMENT.md § Auth.
 * Until then the call returns a clear, actionable error rather than a stack
 * trace, and the button is hidden by appleSignInAvailable().
 */
export async function signInWithApple() {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('error.auth/no-cloud', { code: 'auth/no-cloud' });
  try {
    const provider = new sdk.auth.OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    provider.setCustomParameters({ locale: 'ar' });
    await sdk.auth.signInWithPopup(auth, provider);
  } catch (error) {
    console.error('[auth] Apple sign-in failed', error);
    if (error?.code === 'auth/operation-not-allowed') {
      throw new AppError('error.auth/apple-disabled', { code: error.code });
    }
    throw authError(error);
  }
}

export async function signInWithGoogle() {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('error.auth/no-cloud', { code: 'auth/no-cloud' });
  try {
    await sdk.auth.signInWithPopup(auth, new sdk.auth.GoogleAuthProvider());
  } catch (error) {
    console.error('[auth] Google sign-in failed', error);
    throw authError(error);
  }
}

/** Sends (or resends) the verification email for the signed-in account. */
export async function sendVerification() {
  const { auth, sdk } = firebaseContext();
  const user = auth?.currentUser;
  if (!user) throw new AppError('error.auth/no-user', { code: 'auth/no-user' });
  try {
    await sdk.auth.sendEmailVerification(user);
  } catch (error) {
    console.error('[auth] verification email failed', error);
    if (error?.code === 'auth/too-many-requests') {
      throw new AppError('error.auth/verify-too-many', { code: error.code });
    }
    throw new AppError('error.auth/verify-failed', { code: 'auth/verify-failed', cause: error });
  }
}

/**
 * Re-reads the account from the server. Clicking the link in the email does not
 * notify this tab, so verification is confirmed by asking.
 */
export async function refreshVerification() {
  const { auth } = firebaseContext();
  const user = auth?.currentUser;
  if (!user) return false;
  try {
    await user.reload();
    if (user.emailVerified) {
      // The ID token carries email_verified, which Security Rules read.
      await user.getIdToken(true);
      emit({ user: { ...toProfile(user), emailVerified: true } });
    }
    return user.emailVerified;
  } catch (error) {
    console.error('[auth] could not refresh verification state', error);
    return false;
  }
}

export function needsVerification() {
  const { auth } = firebaseContext();
  const user = auth?.currentUser;
  if (!user) return false;
  // Federated identities arrive verified; only password accounts need this.
  return !user.emailVerified
    && user.providerData.some((p) => p.providerId === 'password');
}

export async function sendPasswordReset(email) {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('error.auth/no-cloud', { code: 'auth/no-cloud' });
  try {
    await sdk.auth.sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('[auth] password reset failed', error);
    throw authError(error);
  }
}

/**
 * Re-reads which workspace this user is in and re-emits the session. Called
 * after the active workspace changes or an invitation is accepted: the whole
 * app hangs off `onSessionChange`, so this is what actually reopens the
 * inventory rather than swapping collections under a rendered screen.
 */
export async function refreshWorkspace() {
  const { auth } = firebaseContext();
  const user = auth?.currentUser;
  if (!user) return session;
  try {
    const membership = await resolveWorkspace(user);
    emit({ user: toProfile(user), ...membership, ready: true, local: false });
  } catch (error) {
    console.error('[auth] workspace refresh failed', error);
    throw new AppError('workspace.openFailed', { code: 'workspace/open-failed', cause: error });
  }
  return session;
}

export async function signOutUser() {
  const { auth, sdk } = firebaseContext();
  if (!auth) return;
  try {
    await sdk.auth.signOut(auth);
  } catch (error) {
    console.error('[auth] sign-out failed', error);
    throw new AppError('error.auth/sign-out', { code: 'auth/sign-out', cause: error });
  }
}

export async function listMembers(workspaceId) {
  const { db, sdk } = firebaseContext();
  if (!db || !workspaceId) return [];
  const snap = await sdk.firestore.getDocs(
    sdk.firestore.collection(db, 'workspaces', workspaceId, 'members'),
  );
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}
