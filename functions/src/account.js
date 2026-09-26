'use strict';

// Account lifecycle: deletion, leaving a workspace, handing one over.
//
// Deleting an account is a server operation. The client asks; this code checks
// who is asking, how recently they proved it, and what their deletion would do
// to other people's data — and only then deletes. Nothing here trusts a flag
// or a role the client sent.
//
// What deleting an account removes:
//   · every workspace the user owns alone (records, media, activity, usage,
//     AI usage — purgeWorkspace), immediately rather than after a grace period:
//     the owner asked for their data to go, and nobody else depends on it;
//   · their membership in workspaces other people own (the records they wrote
//     there stay: they are the workspace's, and the activity log keeps the
//     name recorded at the time);
//   · invitations they sent that are still pending, and invitations addressed
//     to them;
//   · their profile (users/{uid}) and billing customer link;
//   · the Firebase Authentication user, last — so a failure part way leaves
//     an account that can sign in and try again, never data without an owner.
//
// What blocks it: owning a workspace that has other members. Deleting that
// would delete their business data without their decision, so the owner
// transfers ownership or deletes the workspace first. The client shows why.
//
// Subscriptions bought through the App Store are Apple's to cancel; the client
// tells the user so. Web subscriptions are cancelled through billing.js by the
// deployment before this runs (see IOS-RELEASE.md § Account deletion).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const {
  admin, db, logger, requireAuth, requireString, requireMember, callable,
} = require('./lib');
const { _internal: { purgeWorkspace } } = require('./workspaces');

const FieldValue = admin.firestore.FieldValue;

/** A sign-in older than this is asked again before deleting (seconds). */
const RECENT_AUTH_SECONDS = 5 * 60;
/** Deletion attempts per user per hour. */
const DELETE_RATE = { max: 5, windowMs: 60 * 60 * 1000 };

async function enforceRate(uid) {
  const ref = db.doc(`rateLimits/account-delete-${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : { count: 0, windowStart: now };
    const fresh = now - data.windowStart > DELETE_RATE.windowMs;
    const count = fresh ? 0 : data.count;
    if (count >= DELETE_RATE.max) throw new HttpsError('resource-exhausted', 'account/too-many-attempts');
    tx.set(ref, { count: count + 1, windowStart: fresh ? now : data.windowStart });
  });
}

/** Every workspace this user is in, and whether each one blocks deletion. */
async function footprint(uid) {
  const profile = await db.doc(`users/${uid}`).get();
  const ids = new Set(profile.exists ? (profile.data().workspaceIds || []) : []);
  if (profile.exists && profile.data().defaultWorkspaceId) ids.add(profile.data().defaultWorkspaceId);
  const owned = await db.collection('workspaces').where('ownerId', '==', uid).get();
  owned.docs.forEach((doc) => ids.add(doc.id));

  const workspaces = [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const [ws, member, members] = await Promise.all([
      db.doc(`workspaces/${id}`).get(),
      db.doc(`workspaces/${id}/members/${uid}`).get(),
      db.collection(`workspaces/${id}/members`).limit(2).get(),
    ]);
    if (!ws.exists) continue;
    const isOwner = ws.data().ownerId === uid || member.data()?.role === 'owner';
    const others = members.docs.some((doc) => doc.id !== uid);
    workspaces.push({ id, name: ws.data().name || '', owner: isOwner, shared: others, member: member.exists });
  }
  return workspaces;
}

/** What deleting would do, for the client to explain before it asks. */
exports.accountDeletionStatus = onCall(callable(), async (request) => {
  const uid = requireAuth(request);
  const workspaces = await footprint(uid);
  const blocking = workspaces.filter((ws) => ws.owner && ws.shared);
  return {
    ok: true,
    blocked: blocking.length > 0,
    blocking: blocking.map(({ id, name }) => ({ id, name })),
    ownedAlone: workspaces.filter((ws) => ws.owner && !ws.shared).length,
    memberOf: workspaces.filter((ws) => !ws.owner && ws.member).length,
  };
});

exports.deleteAccount = onCall(callable({ timeoutSeconds: 540 }), async (request) => {
  const uid = requireAuth(request);
  if (request.data?.confirm !== true) throw new HttpsError('invalid-argument', 'account/confirmation-required');

  // A session left open on a shared device must not be enough.
  const authTime = Number(request.auth.token.auth_time || 0);
  if (!authTime || Date.now() / 1000 - authTime > RECENT_AUTH_SECONDS) {
    throw new HttpsError('failed-precondition', 'account/requires-recent-login');
  }
  await enforceRate(uid);

  const workspaces = await footprint(uid);
  const blocking = workspaces.filter((ws) => ws.owner && ws.shared);
  if (blocking.length) {
    throw new HttpsError('failed-precondition', 'account/owns-shared-workspace', {
      blocking: blocking.map(({ id, name }) => ({ id, name })),
    });
  }

  for (const ws of workspaces) {
    if (ws.owner) {
      // eslint-disable-next-line no-await-in-loop
      await purgeWorkspace(ws.id);
    } else if (ws.member) {
      // eslint-disable-next-line no-await-in-loop
      await db.doc(`workspaces/${ws.id}/members/${uid}`).delete();
    }
  }

  const email = (request.auth.token.email || '').toLowerCase();
  const pending = await db.collection('invitations').where('invitedBy', '==', uid).get();
  const addressed = email ? await db.collection('invitations').where('email', '==', email).get() : { docs: [] };
  const batch = db.batch();
  [...pending.docs, ...addressed.docs].forEach((doc) => batch.delete(doc.ref));
  batch.delete(db.doc(`users/${uid}`));
  batch.delete(db.doc(`customers/${uid}`));
  batch.delete(db.doc(`rateLimits/invite-${uid}`));
  await batch.commit();

  await admin.auth().deleteUser(uid);
  logger.warn('account deleted', { uid, workspacesPurged: workspaces.filter((ws) => ws.owner).length });
  return { ok: true };
});

/** A member leaves a workspace. The owner cannot: they transfer or delete it. */
exports.leaveWorkspace = onCall(callable(), async (request) => {
  const uid = requireAuth(request);
  const workspaceId = requireString(request.data?.workspaceId, 'workspaceId', 128);
  const role = await requireMember(uid, workspaceId);
  if (role === 'owner') throw new HttpsError('failed-precondition', 'workspace/owner-cannot-leave');
  await db.doc(`workspaces/${workspaceId}/members/${uid}`).delete();
  await db.doc(`users/${uid}`).set({
    workspaceIds: FieldValue.arrayRemove(workspaceId),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  logger.info('member left workspace', { workspaceId, uid });
  return { ok: true };
});

/** The owner hands the workspace to an existing member, who becomes owner. */
exports.transferWorkspaceOwnership = onCall(callable(), async (request) => {
  const uid = requireAuth(request);
  const workspaceId = requireString(request.data?.workspaceId, 'workspaceId', 128);
  const newOwnerId = requireString(request.data?.newOwnerId, 'newOwnerId', 128);
  await requireMember(uid, workspaceId, 'owner');
  if (newOwnerId === uid) throw new HttpsError('invalid-argument', 'workspace/same-owner');

  await db.runTransaction(async (tx) => {
    const target = await tx.get(db.doc(`workspaces/${workspaceId}/members/${newOwnerId}`));
    if (!target.exists) throw new HttpsError('failed-precondition', 'workspace/not-a-member');
    tx.update(db.doc(`workspaces/${workspaceId}`), { ownerId: newOwnerId, updatedAt: FieldValue.serverTimestamp() });
    tx.update(target.ref, { role: 'owner' });
    tx.update(db.doc(`workspaces/${workspaceId}/members/${uid}`), { role: 'admin' });
  });
  logger.warn('workspace ownership transferred', { workspaceId, from: uid, to: newOwnerId });
  return { ok: true };
});
