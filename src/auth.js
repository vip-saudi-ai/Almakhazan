// Authentication and workspace membership.
//
// Every mutation is attributed to a signed-in user. Roles are stored server-side
// in workspaces/{id}/members/{uid} and enforced by Security Rules; the role kept
// here only drives what the UI offers.

import { ROLES } from './config.js';
import { AppError } from './utils.js';
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
      if (!settled) { settled = true; resolve(session); }
    });
  });
}

function toProfile(user) {
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || user.email?.split('@')[0] || 'مستخدم',
    photoURL: user.photoURL || null,
    isAnonymous: user.isAnonymous,
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
    name: `مخزن ${toProfile(user).displayName}`,
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
  const messages = {
    'auth/invalid-email': 'البريد الإلكتروني غير صالح',
    'auth/user-disabled': 'هذا الحساب معطّل',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
    'auth/wrong-password': 'كلمة المرور غير صحيحة',
    'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
    'auth/email-already-in-use': 'هذا البريد مسجّل مسبقاً',
    'auth/weak-password': 'كلمة المرور ضعيفة (6 أحرف على الأقل)',
    'auth/popup-closed-by-user': 'أُغلقت نافذة الدخول',
    'auth/network-request-failed': 'تعذّر الاتصال بالشبكة',
    'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً',
    'auth/operation-not-allowed': 'طريقة الدخول هذه غير مفعّلة في المشروع',
  };
  return new AppError(messages[error?.code] || 'تعذّر تسجيل الدخول', { code: error?.code, cause: error });
}

export async function signInWithEmail(email, password) {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('الخدمة السحابية غير متاحة');
  try {
    await sdk.auth.signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error('[auth] email sign-in failed', error);
    throw authError(error);
  }
}

export async function registerWithEmail(email, password, displayName) {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('الخدمة السحابية غير متاحة');
  try {
    const credential = await sdk.auth.createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await sdk.auth.updateProfile(credential.user, { displayName });
  } catch (error) {
    console.error('[auth] registration failed', error);
    throw authError(error);
  }
}

export async function signInWithGoogle() {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('الخدمة السحابية غير متاحة');
  try {
    await sdk.auth.signInWithPopup(auth, new sdk.auth.GoogleAuthProvider());
  } catch (error) {
    console.error('[auth] Google sign-in failed', error);
    throw authError(error);
  }
}

export async function sendPasswordReset(email) {
  const { auth, sdk } = firebaseContext();
  if (!auth) throw new AppError('الخدمة السحابية غير متاحة');
  try {
    await sdk.auth.sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('[auth] password reset failed', error);
    throw authError(error);
  }
}

export async function signOutUser() {
  const { auth, sdk } = firebaseContext();
  if (!auth) return;
  try {
    await sdk.auth.signOut(auth);
  } catch (error) {
    console.error('[auth] sign-out failed', error);
    throw new AppError('تعذّر تسجيل الخروج', { cause: error });
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
