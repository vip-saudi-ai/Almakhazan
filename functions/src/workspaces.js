'use strict';

// Workspace lifecycle: onboarding, invitations, and deletion.
//
// Membership is never granted by a client write. An invitation is created by an
// admin, and accepting it runs here — where the token, its expiry, the target
// email and the plan's seat allowance are all checked against server state.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const crypto = require('node:crypto');
const {
  admin, db, bucket, logger, PLAN_CONFIG,
  requireAuth, requireString, requireMember, assertWithinLimits, resolveEntitlement,
} = require('./lib');

const FieldValue = admin.firestore.FieldValue;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_RATE = { max: 20, windowMs: 60 * 60 * 1000 };

const DEFAULT_CATEGORY_SETS = {
  personal: ['إلكترونيات', 'أثاث', 'وثائق', 'مقتنيات', 'أخرى'],
  art: ['فنون جميلة', 'تحف وأنتيكات', 'مخطوطات', 'مجوهرات', 'ساعات', 'قطع تاريخية'],
  retail: ['بضاعة', 'معدات', 'مستلزمات', 'مرتجعات'],
  warehouse: ['مخزون', 'معدات', 'مستلزمات', 'مرتجعات'],
  estate: ['أثاث', 'مجوهرات', 'فنون', 'وثائق', 'أدوات منزلية'],
  equipment: ['معدات ثقيلة', 'أدوات', 'قطع غيار', 'أجهزة قياس'],
  other: ['عام'],
};

/**
 * Creates the caller's first workspace with a seeded taxonomy.
 * Runs server-side so the plan, trial window and owner membership are all set
 * from values a client cannot influence.
 */
exports.createWorkspace = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAuth(request);
  const name = requireString(request.data?.name, 'name', 120);
  const useCase = String(request.data?.useCase || 'other');
  const currency = ['SAR', 'USD', 'EUR', 'GBP'].includes(request.data?.currency)
    ? request.data.currency : 'SAR';
  const locale = request.data?.locale === 'en' ? 'en' : 'ar';

  const profileRef = db.doc(`users/${uid}`);
  const profileSnap = await profileRef.get();
  const owned = profileSnap.exists ? (profileSnap.data().workspaceIds || []) : [];

  // Seat/workspace allowance is checked against the user's existing footprint.
  if (owned.length > 0) {
    const entitlement = await resolveEntitlement(owned[0]);
    const limit = entitlement.plan.limits.workspaces;
    if (limit !== -1 && owned.length >= limit) {
      throw new HttpsError('resource-exhausted',
        `خطة ${entitlement.plan.name.ar} تسمح بـ ${limit} مخزن.`);
    }
  }

  const workspaceId = owned.length === 0 ? uid : db.collection('workspaces').doc().id;
  const categories = DEFAULT_CATEGORY_SETS[useCase] || DEFAULT_CATEGORY_SETS.other;
  const batch = db.batch();

  batch.set(db.doc(`workspaces/${workspaceId}`), {
    name,
    ownerId: uid,
    useCase,
    plan: PLAN_CONFIG.defaultPlan,
    planSource: 'system',
    schemaVersion: 2,
    readOnly: false,
    trialEndsAt: PLAN_CONFIG.trialDays > 0
      ? Date.now() + PLAN_CONFIG.trialDays * 86_400_000
      : null,
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(db.doc(`workspaces/${workspaceId}/members/${uid}`), {
    role: 'owner',
    email: request.auth.token.email || null,
    displayName: request.auth.token.name || null,
    joinedAt: FieldValue.serverTimestamp(),
  });

  batch.set(db.doc(`workspaces/${workspaceId}/settings/general`), {
    locale, currency, timezone: request.data?.timezone || 'Asia/Riyadh',
  });

  categories.forEach((categoryName, index) => {
    const ref = db.collection(`workspaces/${workspaceId}/categories`).doc();
    batch.set(ref, { name: categoryName, icon: '📦', order: index, createdAt: Date.now() });
  });

  batch.set(profileRef, {
    defaultWorkspaceId: profileSnap.exists ? profileSnap.data().defaultWorkspaceId ?? workspaceId : workspaceId,
    workspaceIds: FieldValue.arrayUnion(workspaceId),
    email: request.auth.token.email || null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await batch.commit();
  logger.info('workspace created', { uid, workspaceId, useCase });

  return { ok: true, workspaceId, categories: categories.length };
});

// ── invitations ────────────────────────────────────────────────────────────

async function enforceInviteRate(uid) {
  const ref = db.doc(`rateLimits/invite-${uid}`);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (!data || now - (data.windowStart ?? 0) > INVITE_RATE.windowMs) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }
    if ((data.count ?? 0) >= INVITE_RATE.max) {
      throw new HttpsError('resource-exhausted', 'عدد كبير من الدعوات، حاول لاحقاً');
    }
    tx.update(ref, { count: (data.count ?? 0) + 1 });
  });
}

exports.inviteMember = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAuth(request);
  const workspaceId = requireString(request.data?.workspaceId, 'workspaceId', 128);
  const email = requireString(request.data?.email, 'email', 254).toLowerCase();
  const role = request.data?.role;

  if (!['viewer', 'editor', 'admin'].includes(role)) {
    throw new HttpsError('invalid-argument', 'دور غير صالح');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'بريد إلكتروني غير صالح');
  }

  await requireMember(uid, workspaceId, 'admin');
  await assertWithinLimits(workspaceId, 'members');
  await enforceInviteRate(uid);

  // Only the hash is stored; the token itself is delivered to the invitee and
  // never retrievable from the database.
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const inviteRef = db.collection('invitations').doc();

  await inviteRef.set({
    workspaceId,
    email,
    role,
    tokenHash,
    status: 'pending',
    invitedBy: uid,
    expiresAt: Date.now() + INVITE_TTL_MS,
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info('invitation created', { workspaceId, role, inviteId: inviteRef.id });

  // Delivery is left to the deployment's mail provider — see DEPLOYMENT.md.
  return { ok: true, inviteId: inviteRef.id, token, expiresInDays: INVITE_TTL_MS / 86_400_000 };
});

exports.acceptInvitation = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAuth(request);
  const inviteId = requireString(request.data?.inviteId, 'inviteId', 128);
  const token = requireString(request.data?.token, 'token', 256);

  if (request.auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'فعّل بريدك الإلكتروني أولاً');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const inviteRef = db.doc(`invitations/${inviteId}`);

  const workspaceId = await db.runTransaction(async (tx) => {
    const snap = await tx.get(inviteRef);
    if (!snap.exists) throw new HttpsError('not-found', 'الدعوة غير موجودة');

    const invite = snap.data();
    if (invite.status !== 'pending') throw new HttpsError('failed-precondition', 'الدعوة استُخدمت مسبقاً');
    if (invite.expiresAt < Date.now()) throw new HttpsError('failed-precondition', 'انتهت صلاحية الدعوة');

    // Constant-time compare so a wrong token cannot be probed by timing.
    const expected = Buffer.from(invite.tokenHash, 'hex');
    const actual = Buffer.from(tokenHash, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      throw new HttpsError('permission-denied', 'رابط الدعوة غير صالح');
    }
    if (invite.email !== (request.auth.token.email || '').toLowerCase()) {
      throw new HttpsError('permission-denied', 'هذه الدعوة لبريد إلكتروني آخر');
    }

    tx.update(inviteRef, {
      status: 'accepted', acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`workspaces/${invite.workspaceId}/members/${uid}`), {
      role: invite.role,
      email: request.auth.token.email || null,
      displayName: request.auth.token.name || null,
      joinedAt: FieldValue.serverTimestamp(),
      invitedBy: invite.invitedBy,
    });
    tx.set(db.doc(`users/${uid}`), {
      workspaceIds: FieldValue.arrayUnion(invite.workspaceId),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return invite.workspaceId;
  });

  logger.info('invitation accepted', { workspaceId, uid });
  return { ok: true, workspaceId };
});

// ── deletion ───────────────────────────────────────────────────────────────

/**
 * Marks a workspace for deletion rather than deleting it inline: thousands of
 * documents and Storage objects cannot be removed reliably inside one request.
 * The sweeper below does the work, and the grace window makes it recoverable.
 */
exports.requestWorkspaceDeletion = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAuth(request);
  const workspaceId = requireString(request.data?.workspaceId, 'workspaceId', 128);
  const confirmName = requireString(request.data?.confirmName, 'confirmName', 200);

  await requireMember(uid, workspaceId, 'owner');

  const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
  if (wsSnap.data().name !== confirmName) {
    throw new HttpsError('invalid-argument', 'اسم المخزن غير مطابق');
  }

  const graceDays = PLAN_CONFIG.retention.readOnlyGraceDays;
  await db.doc(`workspaces/${workspaceId}`).set({
    readOnly: true,
    deletionRequestedAt: FieldValue.serverTimestamp(),
    deletionRequestedBy: uid,
    purgeAfter: Date.now() + graceDays * 86_400_000,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.warn('workspace deletion requested', { workspaceId, uid, graceDays });
  return { ok: true, purgeAfterDays: graceDays };
});

exports.cancelWorkspaceDeletion = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAuth(request);
  const workspaceId = requireString(request.data?.workspaceId, 'workspaceId', 128);
  await requireMember(uid, workspaceId, 'owner');

  await db.doc(`workspaces/${workspaceId}`).set({
    readOnly: false,
    deletionRequestedAt: FieldValue.delete(),
    purgeAfter: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
});

const SUBCOLLECTIONS = [
  'items', 'folders', 'categories', 'locations', 'activityLogs',
  'media', 'members', 'usage', 'counters', 'settings', 'aiUsage',
];

async function purgeWorkspace(workspaceId) {
  for (const name of SUBCOLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    await deleteCollection(`workspaces/${workspaceId}/${name}`);
  }
  await bucket().deleteFiles({ prefix: `workspaces/${workspaceId}/`, force: true });
  await db.doc(`workspaces/${workspaceId}`).delete();
  logger.warn('workspace purged', { workspaceId });
}

async function deleteCollection(path, batchSize = 300) {
  const ref = db.collection(path);
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await ref.limit(batchSize).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    if (snap.size < batchSize) return;
  }
}

/** Purges workspaces whose grace window has expired, and enforces retention. */
exports.sweepDeletedWorkspaces = onSchedule(
  { schedule: 'every 24 hours', region: 'us-central1', timeoutSeconds: 540 },
  async () => {
    const now = Date.now();

    const due = await db.collection('workspaces')
      .where('purgeAfter', '<=', now)
      .limit(10)
      .get();
    for (const doc of due.docs) {
      try {
        await purgeWorkspace(doc.id);
      } catch (error) {
        logger.error('workspace purge failed', { workspaceId: doc.id, error: error.message });
      }
    }

    // A lapsed subscription freezes the workspace after the grace window. Data
    // is retained, never silently destroyed.
    const graceMs = PLAN_CONFIG.retention.readOnlyGraceDays * 86_400_000;
    const lapsed = await db.collection('workspaces')
      .where('retentionUntil', '<=', now + PLAN_CONFIG.retention.deleteAfterDays * 86_400_000 - graceMs)
      .limit(50)
      .get();
    for (const doc of lapsed.docs) {
      const data = doc.data();
      if (data.readOnly === true || !data.retentionUntil) continue;
      await doc.ref.set({ readOnly: true, frozenAt: FieldValue.serverTimestamp() }, { merge: true });
      logger.info('workspace frozen after lapse', { workspaceId: doc.id });
    }

    logger.info('workspace sweep complete', { purged: due.size, frozen: lapsed.size });
  },
);

exports._internal = { purgeWorkspace, deleteCollection, DEFAULT_CATEGORY_SETS };
