// Members, invitations and which workspace is open.
//
// Every state change here is a backend decision, not a client one:
//
//  - An invitation is created by a callable that hashes the token before it
//    stores it. The plain token exists once, in the reply, and is never
//    retrievable again — not by us, not by an admin, not from the database.
//  - Acceptance is a callable too. Security Rules refuse any client write to
//    a membership document that would grant one, so a forged link cannot buy
//    access even if the rules were the only thing standing in the way.
//  - Roles and removals are client writes, but rules bound them: an admin
//    cannot promote anyone to owner, cannot edit their own role, and cannot
//    remove themselves or the owner.
//
// There is no mail provider wired up. Rather than pretend an email went out,
// the invite link is handed to the person who created it to send however they
// already talk to their colleague.

import { ROLES } from './config.js';
import { firebaseContext } from './firebase.js';
import { AppError } from './utils.js';

export const INVITABLE_ROLES = [ROLES.VIEWER, ROLES.EDITOR, ROLES.ADMIN];

function fs() {
  const { db, sdk } = firebaseContext();
  if (!db) throw new AppError('error.team/offline', { code: 'team/offline' });
  return { db, f: sdk.firestore, sdk };
}

async function call(name, payload, { timeout = 30_000 } = {}) {
  const { functions, sdk } = firebaseContext();
  if (!functions) throw new AppError('error.team/offline', { code: 'team/offline' });
  const fn = sdk.functions.httpsCallable(functions, name, { timeout });
  const result = await fn(payload);
  return result.data;
}

// ── members ────────────────────────────────────────────────────────────────

/** Live, because a role change should reach the other admin's screen. */
export function watchMembers(workspaceId, onData, onError) {
  const { db, f } = fs();
  return f.onSnapshot(
    f.collection(db, 'workspaces', workspaceId, 'members'),
    (snap) => onData(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    (error) => onError?.(error),
  );
}

export async function changeRole(workspaceId, uid, role) {
  if (!INVITABLE_ROLES.includes(role)) {
    throw new AppError('error.team/role', { code: 'team/role' });
  }
  const { db, f } = fs();
  await f.updateDoc(f.doc(db, 'workspaces', workspaceId, 'members', uid), { role });
}

export async function removeMember(workspaceId, uid) {
  const { db, f } = fs();
  await f.deleteDoc(f.doc(db, 'workspaces', workspaceId, 'members', uid));
}

// ── invitations ────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{inviteId: string, token: string, link: string, expiresInDays: number}>}
 *   `token` and `link` are shown once and never stored anywhere we can read.
 */
export async function inviteMember(workspaceId, email, role) {
  const data = await call('inviteMember', { workspaceId, email, role });
  return { ...data, link: invitationLink(data.inviteId, data.token) };
}

export function invitationLink(inviteId, token) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = `?invite=${encodeURIComponent(inviteId)}&token=${encodeURIComponent(token)}`;
  return url.toString();
}

/** Pending invitations, newest first. Sorted here, so no composite index. */
export async function listInvitations(workspaceId) {
  const { db, f } = fs();
  const snap = await f.getDocs(f.query(
    f.collection(db, 'invitations'),
    f.where('workspaceId', '==', workspaceId),
    f.where('status', '==', 'pending'),
  ));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((i) => !i.expiresAt || i.expiresAt > Date.now())
    .sort((a, b) => (b.expiresAt || 0) - (a.expiresAt || 0));
}

export async function revokeInvitation(inviteId) {
  const { db, f } = fs();
  await f.deleteDoc(f.doc(db, 'invitations', inviteId));
}

export async function acceptInvitation(inviteId, token) {
  return call('acceptInvitation', { inviteId, token });
}

/**
 * An invitation carried in the address bar. Read once and cleared, so a
 * refresh does not replay it and the token does not sit in history.
 */
export function takeInvitationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const inviteId = params.get('invite');
  const token = params.get('token');
  if (!inviteId || !token) return null;

  params.delete('invite');
  params.delete('token');
  const rest = params.toString();
  window.history.replaceState(
    null, '',
    window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
  );
  return { inviteId, token };
}

// ── which workspace is open ────────────────────────────────────────────────

/**
 * The workspaces this user can open, with the names they carry. A workspace
 * whose membership was removed simply does not read, so it is dropped rather
 * than shown as a door that opens onto an error.
 */
export async function listWorkspaces(uid) {
  const { db, f } = fs();
  const profile = await f.getDoc(f.doc(db, 'users', uid));
  if (!profile.exists()) return { active: null, workspaces: [] };

  const data = profile.data();
  const ids = [...new Set([data.defaultWorkspaceId, ...(data.workspaceIds || [])].filter(Boolean))];

  const workspaces = [];
  for (const id of ids) {
    try {
      const [wsSnap, memberSnap] = await Promise.all([
        f.getDoc(f.doc(db, 'workspaces', id)),
        f.getDoc(f.doc(db, 'workspaces', id, 'members', uid)),
      ]);
      if (!memberSnap.exists()) continue;
      workspaces.push({
        id,
        // The name the workspace was given; a missing one is shown as untitled by the screen.
        name: wsSnap.exists() ? (wsSnap.data().name || '') : '',
        role: memberSnap.data().role || ROLES.VIEWER,
      });
    } catch (error) {
      console.error('[team] workspace unreadable, skipped', id, error);
    }
  }
  return { active: data.defaultWorkspaceId || null, workspaces };
}

/** Remembers the choice; the caller is what actually reopens the inventory. */
export async function setActiveWorkspace(uid, workspaceId) {
  const { db, f } = fs();
  await f.setDoc(
    f.doc(db, 'users', uid),
    { defaultWorkspaceId: workspaceId, updatedAt: f.serverTimestamp() },
    { merge: true },
  );
}
