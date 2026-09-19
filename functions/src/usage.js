'use strict';

// Trusted usage accounting.
//
// Counters are maintained by Firestore triggers rather than by counting a
// collection on demand — a workspace with 100k items must not cost 100k reads
// to show "312 / 1,000" in Settings. Clients can read these counters and can
// never write them (see firestore.rules).

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall } = require('firebase-functions/v2/https');
const { admin, db, logger, requireAuth, requireMember, resolveEntitlement, readUsage, monthKey } = require('./lib');

const FieldValue = admin.firestore.FieldValue;

function usageRef(workspaceId) {
  return db.doc(`workspaces/${workspaceId}/usage/current`);
}

async function bump(workspaceId, fields) {
  await usageRef(workspaceId).set(
    { ...fields, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/**
 * Active (non-trashed) item count. A soft delete decrements, a restore
 * increments — the number a customer sees is what their plan is measured on.
 */
exports.onItemWritten = onDocumentWritten('workspaces/{workspaceId}/items/{itemId}', async (event) => {
  const { workspaceId } = event.params;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;

  const countedBefore = before && !before.deletedAt ? 1 : 0;
  const countedAfter = after && !after.deletedAt ? 1 : 0;
  const delta = countedAfter - countedBefore;

  if (delta !== 0) {
    try {
      await bump(workspaceId, { items: FieldValue.increment(delta) });
    } catch (error) {
      logger.error('usage: item counter update failed', { workspaceId, error: error.message });
    }
  }
});

/**
 * Storage accounting follows the media asset, not the item, so a duplicated
 * item does not double-count bytes that exist once.
 */
exports.onMediaWritten = onDocumentWritten('workspaces/{workspaceId}/media/{mediaId}', async (event) => {
  const { workspaceId } = event.params;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;

  const bytesBefore = before ? (before.fileSize ?? 0) : 0;
  const bytesAfter = after ? (after.fileSize ?? 0) : 0;
  const delta = bytesAfter - bytesBefore;

  if (delta !== 0) {
    try {
      await bump(workspaceId, { storageBytes: FieldValue.increment(delta) });
    } catch (error) {
      logger.error('usage: storage counter update failed', { workspaceId, error: error.message });
    }
  }
});

exports.onMemberWritten = onDocumentWritten('workspaces/{workspaceId}/members/{userId}', async (event) => {
  const { workspaceId } = event.params;
  const existedBefore = event.data?.before?.exists ? 1 : 0;
  const existsAfter = event.data?.after?.exists ? 1 : 0;
  const delta = existsAfter - existedBefore;

  if (delta !== 0) {
    try {
      await bump(workspaceId, { members: FieldValue.increment(delta) });
    } catch (error) {
      logger.error('usage: member counter update failed', { workspaceId, error: error.message });
    }
  }
});

/** Records one AI credit, rolling the counter over at the start of each month. */
async function consumeAiCredit(workspaceId) {
  const period = monthKey();
  await db.runTransaction(async (tx) => {
    const ref = usageRef(workspaceId);
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const samePeriod = data.aiPeriod === period;
    tx.set(ref, {
      aiPeriod: period,
      aiCreditsUsed: samePeriod ? (data.aiCreditsUsed ?? 0) + 1 : 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/**
 * Recomputes counters from scratch. Used after a migration or a restore, and
 * available to an admin when a trigger has been missed.
 */
async function recalculate(workspaceId) {
  const [items, media, members] = await Promise.all([
    db.collection(`workspaces/${workspaceId}/items`).where('deletedAt', '==', null).count().get(),
    db.collection(`workspaces/${workspaceId}/media`).get(),
    db.collection(`workspaces/${workspaceId}/members`).count().get(),
  ]);

  const storageBytes = media.docs.reduce((sum, doc) => sum + (doc.data().fileSize ?? 0), 0);

  await usageRef(workspaceId).set({
    items: items.data().count,
    storageBytes,
    members: members.data().count,
    recalculatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { items: items.data().count, storageBytes, members: members.data().count };
}

exports.recalculateUsage = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAuth(request);
  const workspaceId = String(request.data?.workspaceId || '');
  await requireMember(uid, workspaceId, 'admin');
  const result = await recalculate(workspaceId);
  logger.info('usage recalculated', { workspaceId, ...result });
  return { ok: true, usage: result };
});

/** One call for the subscription card: plan, limits and usage together. */
exports.getWorkspaceStatus = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAuth(request);
  const workspaceId = String(request.data?.workspaceId || '');
  await requireMember(uid, workspaceId, 'viewer');

  const [entitlement, usage] = await Promise.all([
    resolveEntitlement(workspaceId),
    readUsage(workspaceId),
  ]);

  return {
    ok: true,
    planId: entitlement.planId,
    status: entitlement.status,
    inTrial: entitlement.inTrial,
    readOnly: entitlement.readOnly,
    limits: entitlement.plan.limits,
    features: entitlement.plan.features,
    usage,
  };
});

exports.consumeAiCredit = consumeAiCredit;
exports.recalculate = recalculate;
