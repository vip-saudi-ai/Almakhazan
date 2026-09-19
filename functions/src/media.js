'use strict';

// Media lifecycle: reconciliation, orphan sweeping and safe physical deletion.
//
// A browser may adjust a reference count, but only this file deletes bytes —
// and only after confirming, server-side, that nothing points at them.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall } = require('firebase-functions/v2/https');
const { admin, db, bucket, callable, logger, requireAuth, requireMember } = require('./lib');

const FieldValue = admin.firestore.FieldValue;

// An asset must look unreferenced for this long before its bytes are removed,
// so an upload sitting in an open editor is never swept out from under it.
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 200;

/** Ground truth: how many live items actually reference this asset. */
async function countReferences(workspaceId, mediaId) {
  const snap = await db.collection(`workspaces/${workspaceId}/items`)
    .where('mediaIds', 'array-contains', mediaId)
    .count()
    .get();
  return snap.data().count;
}

async function deleteObjects(paths) {
  for (const path of paths) {
    if (!path || path.startsWith('local:')) continue;
    try {
      await bucket().file(path).delete();
    } catch (error) {
      if (error.code === 404) continue;
      throw error;
    }
  }
}

/**
 * Deletes the bytes of assets that are genuinely unreferenced and past the
 * grace window. Runs daily; safe to run more often.
 */
exports.sweepOrphanMedia = onSchedule(
  { schedule: 'every 24 hours', region: 'us-central1', timeoutSeconds: 540 },
  async () => {
    const cutoff = Date.now() - ORPHAN_GRACE_MS;
    const candidates = await db.collectionGroup('media')
      .where('refCount', '==', 0)
      .limit(SWEEP_BATCH)
      .get();

    let removed = 0;
    let skipped = 0;

    for (const doc of candidates.docs) {
      const data = doc.data();
      const orphanedAt = data.orphanedAt?.toMillis?.() ?? data.orphanedAt ?? null;
      if (!orphanedAt || orphanedAt > cutoff) { skipped += 1; continue; }

      // workspaces/{workspaceId}/media/{mediaId}
      const workspaceId = doc.ref.parent.parent.id;

      // Re-verify against the items collection before destroying anything: a
      // drifted counter must not cost a customer their photograph.
      const actual = await countReferences(workspaceId, doc.id);
      if (actual > 0) {
        await doc.ref.update({ refCount: actual, orphanedAt: null, reconciledAt: FieldValue.serverTimestamp() });
        logger.warn('media: refCount drift corrected, delete skipped', {
          workspaceId, mediaId: doc.id, actual,
        });
        skipped += 1;
        continue;
      }

      try {
        await deleteObjects([data.storagePath, data.thumbnailPath]);
        await doc.ref.delete();
        removed += 1;
      } catch (error) {
        logger.error('media: sweep failed for asset', {
          workspaceId, mediaId: doc.id, error: error.message,
        });
      }
    }

    logger.info('media: sweep complete', { removed, skipped, scanned: candidates.size });
  },
);

/**
 * Keeps `mediaIds` in step with `images` so the sweeper's verification query
 * has something to count. Denormalised deliberately: `array-contains` cannot
 * reach into an array of maps.
 */
exports.onItemMediaChanged = require('firebase-functions/v2/firestore').onDocumentWritten(
  'workspaces/{workspaceId}/items/{itemId}',
  async (event) => {
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after) return;

    const expected = Array.isArray(after.images)
      ? [...new Set(after.images.map((i) => i.mediaId || i.id).filter(Boolean))]
      : [];
    const current = Array.isArray(after.mediaIds) ? after.mediaIds : null;

    const same = current
      && current.length === expected.length
      && expected.every((id) => current.includes(id));
    if (same) return;

    try {
      await event.data.after.ref.update({ mediaIds: expected });
    } catch (error) {
      logger.error('media: mediaIds sync failed', {
        path: event.data.after.ref.path, error: error.message,
      });
    }
  },
);

/** Admin-triggered reconciliation, for support and post-migration checks. */
exports.reconcileMedia = onCall(callable({ timeoutSeconds: 540 }), async (request) => {
  const uid = requireAuth(request);
  const workspaceId = String(request.data?.workspaceId || '');
  await requireMember(uid, workspaceId, 'admin');

  const assets = await db.collection(`workspaces/${workspaceId}/media`).get();
  let corrected = 0;

  for (const doc of assets.docs) {
    const actual = await countReferences(workspaceId, doc.id);
    if ((doc.data().refCount ?? 0) !== actual) {
      await doc.ref.update({
        refCount: actual,
        orphanedAt: actual === 0 ? FieldValue.serverTimestamp() : null,
        reconciledAt: FieldValue.serverTimestamp(),
      });
      corrected += 1;
    }
  }

  logger.info('media: reconciled', { workspaceId, scanned: assets.size, corrected });
  return { ok: true, scanned: assets.size, corrected };
});

exports._internal = { countReferences, deleteObjects, ORPHAN_GRACE_MS };
