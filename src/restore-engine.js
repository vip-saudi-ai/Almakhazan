// Full Restore: replacing this device's inventory with a verified Full Backup
// (version 2, or version 1 read through the same interface) at any size,
// without ever holding the incoming inventory, and without a moment in which
// the device holds neither the old inventory nor a recoverable restore.
//
// Order — each step begins only when the one before it has finished:
//
//   0  the backup was verified whole (backup-reader.js verifyFullBackup) and
//      its restore index built: every record, image and definition it holds
//   1  a Full Backup of what is here now is made and handed to the customer —
//      the same streaming, ZIP64 backup as any other. If it cannot be made or
//      handed over, the restore stops here and nothing has changed.
//   2  the restore job is recorded (prepared)
//   3  writing-metadata   classification, field definitions, places, folders
//   4  writing-media      each image, bytes checked; an image already here is
//                         kept only if its bytes hash to the backup's
//   5  writing-items      one chunk at a time, records stored exactly as saved
//   6  removing-old-records   whatever the restore index says the backup does
//                         not hold — found by walking the stores' keys, never
//                         from a set of every incoming id
//   7  reconciling        classification upgrade, image reference counts
//   8  verifying          counts, every incoming id present, nothing left over,
//                         every image present or declared missing, counts
//                         consistent — only then:
//   9  completed          the restore index is cleared, one activity event
//
// The job records its stage and how far it got (the last committed chunk, the
// last image, the last key examined for removal), saved after each unit is
// committed. Every step is idempotent, so a restore interrupted anywhere is
// finished by running it again with the same backup — which first takes a new
// safety backup of the mixed state, because that is now what must not be
// lost. A different backup is refused until then. From step 2 on, any
// failure leaves the job in recovery-required, never in an untracked state.

import { ACTIONS } from './config.js';
import * as local from './local-store.js';
import { reconcileLocalMediaReferences } from './media.js';
import { availableDiskSpace } from './platform.js';
import { repository } from './repository.js';
import {
  RESTORE_WRONG_FILE_MESSAGE, RestoreStatus, saveRestoreJob, setActiveRestore, unfinishedRestore,
} from './restore.js';
import * as restoreIndex from './restore-index.js';
import { buildTaxonomy, reconcileClassification } from './taxonomy.js';
import { AppError } from './utils.js';
import { mediaEntries, readItems, readMediaBytes } from './backup-reader.js';
import { estimateBackupBytes, writeBackupV2 } from './backup-writer.js';
import { sha256Hex } from './backup-format.js';

/** Records per write transaction. */
export const RESTORE_WRITE_BATCH = 500;
/** Keys examined per removal page. */
const REMOVAL_PAGE = 500;
/** How often the media stage records its progress. */
const MEDIA_SAVE_EVERY = { images: 25, bytes: 32 * 1024 * 1024 };
const SMALL = ['categories', 'fieldDefinitions', 'locations', 'folders'];
const REMOVAL_ORDER = ['items', ...SMALL];

// ── interruption, for the tests ───────────────────────────────────────────
//
// A restore interrupted by the system (the app killed, the phone locked for
// too long) stops between two awaited steps. The tests reproduce that exactly
// by throwing at a named checkpoint; production never sets a fault.
let fault = null;
export function __setRestoreFaultForTest(fn) { fault = fn; }
async function checkpoint(name, detail = {}) { if (fault) await fault(name, detail); }

/** Largest number of records any single step held, for the tests' report. */
const measured = { chunkRecords: 0, writeBatch: 0, removalPage: 0 };
export function __restoreMeasurements() { return { ...measured }; }

function arrayBufferOf(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// ── space ──────────────────────────────────────────────────────────────────

/**
 * Whether the restore can be expected to fit, before anything changes: the
 * incoming images and records, their database overhead, and the safety
 * backup's temporary file. Where the platform cannot say how much room there
 * is, nothing is promised and the restore proceeds.
 */
async function assertSpace(archive) {
  const v = archive.verification;
  const incoming = v.mediaBytes + v.itemBytes * 3 + 32 * 1024 * 1024;
  const free = await availableDiskSpace();
  if (free != null) {
    const counts = await repository.recordCounts().catch(() => null);
    const safety = await estimateBackupBytes({ itemCount: counts?.total || 0 });
    if (free < (incoming + safety) * 1.1) throw new AppError('backup.noSpace', { code: 'backup/no-space' });
    return;
  }
  const estimate = await local.storageEstimate();
  if (estimate && estimate.remaining < incoming * 1.1) throw new AppError('backup.noSpace', { code: 'backup/no-space' });
}

// ── images ─────────────────────────────────────────────────────────────────

/**
 * One image from the backup onto this device.
 *
 * An image already here under the same id is not trusted for its id: its
 * original and its thumbnail are hashed, and each one whose bytes differ from
 * the backup's is replaced — only after the replacement has been read from
 * the archive and verified, and in one transaction with its asset row, so a
 * valid image is never removed before its replacement is in hand.
 *
 * @returns {Promise<'kept'|'written'|'repaired'>}
 */
async function restoreMedia(archive, d, originalEntry, thumbnailEntry) {
  const [existing, asset] = await Promise.all([local.get('images', d.id), local.get('mediaAssets', d.id)]);
  const thumbnailHash = d.thumbnailPath ? d.thumbnailSha256 : d.sha256;
  const originalOk = Boolean(existing?.original) && await sha256Hex(new Uint8Array(existing.original)) === d.sha256;
  const thumbnailOk = Boolean(existing?.thumbnail) && await sha256Hex(new Uint8Array(existing.thumbnail)) === thumbnailHash;
  if (originalOk && thumbnailOk && asset) return 'kept';

  const original = originalOk ? null : await readMediaBytes(archive, originalEntry, { size: d.size, sha256: d.sha256 });
  let thumbnail = null;
  if (!thumbnailOk) {
    thumbnail = d.thumbnailPath
      ? await readMediaBytes(archive, thumbnailEntry, { size: d.thumbnailSize, sha256: d.thumbnailSha256 })
      : original || await readMediaBytes(archive, originalEntry, { size: d.size, sha256: d.sha256 });
  }

  await local.transaction(['images', 'mediaAssets'], 'readwrite', async (stores) => {
    const current = await local.request(stores.images.get(d.id));
    const currentAsset = await local.request(stores.mediaAssets.get(d.id));
    await local.request(stores.images.put({
      id: d.id,
      itemId: current?.itemId ?? null,
      original: original ? arrayBufferOf(original) : current.original,
      originalType: d.mimeType,
      thumbnail: thumbnail ? arrayBufferOf(thumbnail) : current.thumbnail,
      thumbnailType: d.thumbnailType || d.mimeType,
      meta: d.asset || current?.meta || {},
    }));
    // The backup's description of the image; this device's own count, which
    // the reconciliation after the restore sets to what the records hold.
    await local.request(stores.mediaAssets.put({
      ...(d.asset || {}),
      id: d.id,
      storagePath: `local:${d.id}`,
      thumbnailPath: `local:${d.id}`,
      mimeType: d.mimeType,
      fileSize: d.size,
      refCount: currentAsset?.refCount ?? 0,
      orphanedAt: currentAsset ? (currentAsset.orphanedAt ?? null) : Date.now(),
    }));
  });
  return existing ? 'repaired' : 'written';
}

// ── the stages ─────────────────────────────────────────────────────────────

async function save(job, patch = {}) {
  Object.assign(job, patch);
  await saveRestoreJob(job);
}

async function writeMetadata(repo, archive, job) {
  await save(job, { status: RestoreStatus.WRITING_METADATA });
  for (const name of SMALL) {
    const records = archive.metadata[name];
    for (let i = 0; i < records.length; i += RESTORE_WRITE_BATCH) {
      await repo.restorePut(name, records.slice(i, i + RESTORE_WRITE_BATCH));
    }
  }
  await repo.afterRestoreWrites(SMALL);
  await checkpoint('metadata');
}

async function writeMedia(archive, job, report) {
  await save(job, { status: RestoreStatus.WRITING_MEDIA });
  const total = archive.verification.media;
  let done = job.progress.media || 0;
  let sinceImages = 0;
  let sinceBytes = 0;
  report('media', { done, total });
  for await (const { index, descriptor, original, thumbnail } of mediaEntries(archive, { from: done })) {
    const outcome = await restoreMedia(archive, descriptor, original, thumbnail);
    job.progress.mediaOutcomes[outcome] = (job.progress.mediaOutcomes[outcome] || 0) + 1;
    done = index + 1;
    sinceImages += 1;
    sinceBytes += descriptor.size + (descriptor.thumbnailSize || 0);
    if (sinceImages >= MEDIA_SAVE_EVERY.images || sinceBytes >= MEDIA_SAVE_EVERY.bytes) {
      job.progress.media = done;
      await save(job);
      sinceImages = 0;
      sinceBytes = 0;
    }
    report('media', { done, total });
    await checkpoint('media', { done });
  }
  job.progress.media = done;
  await save(job);
}

async function writeItems(repo, archive, job, report) {
  await save(job, { status: RestoreStatus.WRITING_ITEMS });
  const key = archive.restoreKey;
  const { categories, fieldDefinitions } = archive.metadata;
  // A value whose definition the backup does not carry is kept under a
  // recovered definition — one this device already knew, or one inferred from
  // the value — never restored into invisibility. Definitions are few; the
  // recovered ones are remembered across chunks.
  const fallbackDefinitions = [...repo.state.fieldDefinitions, ...repo.state.categories.flatMap((c) => c.fields || [])];
  const recovered = new Map();
  let taxonomy = buildTaxonomy(categories, fieldDefinitions);
  const total = archive.verification.items;
  let written = job.progress.itemsWritten || 0;
  report('items', { done: written, total });

  for (let sequence = (job.progress.chunk || 0) + 1; sequence <= archive.itemChunks.length; sequence += 1) {
    const { items } = await readItems(archive, sequence);
    measured.chunkRecords = Math.max(measured.chunkRecords, items.length);
    for (const item of items) Object.assign(item, reconcileClassification(taxonomy, item).value);

    const found = repo.recoveredFieldOps(items, { taxonomy, fallbackDefinitions })
      .map((op) => op.data).filter((def) => !recovered.has(def.id));
    if (found.length) {
      await repo.restorePut('fieldDefinitions', found);
      await restoreIndex.markMany(key, 'fieldDefinitions', found.map((def) => def.id), { unique: false });
      for (const def of found) recovered.set(def.id, def);
      taxonomy = buildTaxonomy(categories, [...fieldDefinitions, ...recovered.values()]);
    }

    for (let i = 0; i < items.length; i += RESTORE_WRITE_BATCH) {
      const batch = items.slice(i, i + RESTORE_WRITE_BATCH);
      measured.writeBatch = Math.max(measured.writeBatch, batch.length);
      const { unchanged } = await repo.restorePut('items', batch);
      job.progress.itemsUnchanged = (job.progress.itemsUnchanged || 0) + unchanged;
    }
    written += items.length;
    // Recorded only once every record of the chunk has committed.
    job.progress.chunk = sequence;
    job.progress.itemsWritten = written;
    await save(job);
    report('items', { done: written, total });
    await checkpoint('items', { chunk: sequence });
  }
  job.progress.recoveredFields = (job.progress.recoveredFields || 0) + recovered.size;
  await repo.afterRestoreWrites(['items', 'fieldDefinitions']);
}

/**
 * Removes what the backup does not hold, collection by collection, walking
 * each store's keys a page at a time and asking the restore index about each
 * page. Resumes from the last key examined.
 */
async function removeOld(repo, archive, job, report) {
  await save(job, { status: RestoreStatus.REMOVING_OLD });
  const key = archive.restoreKey;
  const removal = job.progress.removal || { collection: REMOVAL_ORDER[0], after: undefined };
  const removed = job.progress.removed || {};
  // 'done' (a resumed restore past this stage) starts beyond the last one.
  const first = removal.collection === 'done' ? REMOVAL_ORDER.length : Math.max(0, REMOVAL_ORDER.indexOf(removal.collection));
  for (let c = first; c < REMOVAL_ORDER.length; c += 1) {
    const collection = REMOVAL_ORDER[c];
    let after = collection === removal.collection ? removal.after : undefined;
    for (;;) {
      const keys = await local.keysPage(collection, { after, limit: REMOVAL_PAGE });
      if (!keys.length) break;
      measured.removalPage = Math.max(measured.removalPage, keys.length);
      const present = await restoreIndex.presentIn(key, [collection], keys);
      const absent = keys.filter((id) => !present.has(id));
      await repo.restoreRemove(collection, absent);
      removed[collection] = (removed[collection] || 0) + absent.length;
      after = keys[keys.length - 1];
      job.progress.removal = { collection, after };
      job.progress.removed = removed;
      await save(job);
      report('remove', { done: Object.values(removed).reduce((a, b) => a + b, 0) });
      await checkpoint('remove', { collection, after });
      if (keys.length < REMOVAL_PAGE) break;
    }
  }
  job.progress.removal = { collection: 'done' };
  await save(job);
  await repo.afterRestoreWrites(REMOVAL_ORDER);
}

async function reconcile(repo, job) {
  await save(job, { status: RestoreStatus.RECONCILING });
  // A backup from before the hierarchy carries flat categories: placed
  // exactly as an upgraded inventory's are.
  try { await repo.migrateTaxonomy(); } catch (error) { console.error('[restore] classification upgrade deferred', error); }
  // Counted, not reclaimed: an image the restore still needs cannot be
  // removed under it. Orphans are reclaimed later, after their grace period.
  const result = await reconcileLocalMediaReferences({ reclaim: false });
  job.progress.referencesCorrected = result.correctedCount;
  await checkpoint('reconcile');
}

function verificationFailed(detail) {
  return new AppError('error.restore/final-verification', { code: 'restore/final-verification', detail });
}

/**
 * The restored state, checked against the backup before the job may be
 * completed — with counts and key probes a page at a time, never by loading
 * the records.
 */
async function verifyResult(archive, job) {
  await save(job, { status: RestoreStatus.VERIFYING });
  const key = archive.restoreKey;

  const itemCount = await local.countFresh('items');
  if (itemCount !== archive.verification.items) throw verificationFailed(`items ${itemCount}/${archive.verification.items}`);
  for (const collection of ['items', ...SMALL]) {
    const expected = await restoreIndex.countOf(key, collection);
    const actual = await local.countFresh(collection);
    // With every incoming id present, equal counts mean nothing old is left.
    if (actual !== expected) throw verificationFailed(`${collection} count ${actual}/${expected}`);
    let after;
    for (;;) {
      const ids = await restoreIndex.idsPage(key, collection, { after, limit: 500 });
      if (!ids.length) break;
      const present = await local.existingKeys(collection, ids);
      if (present.size !== ids.length) throw verificationFailed(`${collection} missing`);
      after = ids[ids.length - 1];
      if (ids.length < 500) break;
    }
  }

  // Every image the backup carried is here.
  let after;
  for (;;) {
    const ids = await restoreIndex.idsPage(key, 'media', { after, limit: 500 });
    if (!ids.length) break;
    const [images, assets] = await Promise.all([local.existingKeys('images', ids), local.existingKeys('mediaAssets', ids)]);
    if (images.size !== ids.length || assets.size !== ids.length) throw verificationFailed('media missing');
    after = ids[ids.length - 1];
    if (ids.length < 500) break;
  }

  // Reference counts agree with the records, and the only images records
  // reference without holding are the ones the backup declared missing.
  const check = await reconcileLocalMediaReferences({ dryRun: true });
  if (check.correctedCount) throw verificationFailed(`reference counts ${check.correctedCount}`);
  const declared = await restoreIndex.countOf(key, 'media-missing');
  if (check.missingCount > declared) throw verificationFailed('undeclared missing media');
  const sample = check.missing.map((m) => m.mediaId);
  const known = await restoreIndex.presentIn(key, ['media-missing'], sample);
  if (sample.some((id) => !known.has(id))) throw verificationFailed('undeclared missing media');
  await checkpoint('verify');
  return { missingMedia: check.missingCount };
}

// ── the restore ────────────────────────────────────────────────────────────

/**
 * Replaces this device's inventory with a verified Full Backup.
 *
 * @param {object} archive from `openFullBackup`, verified by `verifyFullBackup`
 * @param {{onProgress?: Function}} options
 */
export async function restoreFullBackup(archive, { onProgress = () => {} } = {}) {
  const repo = repository;
  repo.assertCanWrite();
  if (repo.session?.mode === 'cloud') throw new AppError('backup.fullLocalOnly', { code: 'backup/local-only' });
  if (!archive?.verified) throw new AppError('backup.corrupt', { code: 'backup/unverified' });
  // The restore index is what decides which records are removed. An index
  // that no longer holds every record the check counted — cleared by a
  // completed restore, or by clean-up — would remove records it should keep,
  // so the backup must be checked again first.
  if (await restoreIndex.countOf(archive.restoreKey, 'items') !== archive.verification.items) {
    archive.verified = false;
    throw new AppError('backup.corrupt', { code: 'backup/unverified' });
  }

  const previous = await unfinishedRestore();
  if (previous && previous.sourceFingerprint !== archive.fingerprint) {
    throw new AppError(RESTORE_WRONG_FILE_MESSAGE, { code: 'restore/recovery-required' });
  }
  const resuming = previous?.engine === 'full';
  // A restore that failed its final check does not continue from where it
  // stopped — what it wrote is not what the backup holds. It is repeated
  // whole: every write is idempotent, so the repeat is a repair pass.
  const repair = resuming && previous.lastError === 'restore/final-verification';
  const progress = repair
    ? { media: 0, chunk: 0, itemsWritten: 0, mediaOutcomes: {}, removed: previous.progress?.removed }
    : { mediaOutcomes: {}, ...previous?.progress };
  const job = resuming ? { ...previous, lastError: null, resumed: true, repair, progress } : {
    id: `rst-${Date.now().toString(36)}`,
    engine: 'full',
    backupFormatVersion: archive.version,
    backupId: archive.manifest.backupId || null,
    sourceFingerprint: archive.fingerprint,
    restoreKey: archive.restoreKey,
    startedAt: Date.now(),
    resumed: false,
    expected: { items: archive.verification.items, media: archive.verification.media, missingMedia: archive.verification.missingMedia },
    progress: { media: 0, chunk: 0, itemsWritten: 0, mediaOutcomes: {} },
  };
  const report = (phase, extra = {}) => onProgress({ phase, ...extra });
  let recorded = false;
  setActiveRestore(job.id);
  try {
    await assertSpace(archive);

    // ── 1. the safety backup: nothing continues without it ──
    report('safety');
    let safety;
    try {
      const counts = await repo.recordCounts().catch(() => null);
      safety = await writeBackupV2({
        purpose: 'safety',
        itemCount: counts?.total || 0,
        onProgress: (p) => report('safety', { step: p }),
      });
    } catch (error) {
      console.error('[restore] safety backup failed — aborting', error);
      throw new AppError('error.restore/aborted', { code: 'restore/aborted', cause: error });
    }
    job.safetyBackup = { filename: safety.filename, items: safety.items, media: safety.media, integrity: safety.integrityStatus, at: Date.now() };

    // ── 2. the job, before the first write ──
    await save(job, { status: RestoreStatus.PREPARED });
    recorded = true;
    await checkpoint('prepared');

    await writeMetadata(repo, archive, job);
    await writeMedia(archive, job, report);
    await writeItems(repo, archive, job, report);
    await removeOld(repo, archive, job, report);
    await reconcile(repo, job);
    report('verify');
    const verified = await verifyResult(archive, job);

    await restoreIndex.clear(archive.restoreKey);
    // Its index is gone: this opened backup cannot drive another restore
    // without being checked again.
    archive.verified = false;
    await save(job, { status: RestoreStatus.COMPLETED, completedAt: Date.now() });

    const removed = job.progress.removed || {};
    await repo.log(ACTIONS.IMPORT_RESTORED, {
      restoreJobId: job.id,
      kind: 'full',
      backupFormatVersion: archive.version,
      resumed: job.resumed,
      items: archive.verification.items,
      folders: archive.metadata.folders.length,
      images: archive.verification.media,
      removed: removed.items || 0,
      safetyBackup: job.safetyBackup,
    });
    report('done');
    return {
      restored: archive.verification.items,
      images: archive.verification.media,
      declaredMissing: archive.verification.missingMedia,
      missingMedia: verified.missingMedia,
      removed,
      mediaOutcomes: job.progress.mediaOutcomes,
      recoveredFields: job.progress.recoveredFields || 0,
      // Records already stored exactly as the backup holds them, left as they were.
      unchanged: job.progress.itemsUnchanged || 0,
      resumed: job.resumed,
      jobId: job.id,
    };
  } catch (error) {
    if (recorded) {
      // The job already says how far the restore got; it now also says that
      // it needs finishing, and why — never an untracked half state.
      await saveRestoreJob({ ...job, status: RestoreStatus.RECOVERY_REQUIRED, interruptedAt: job.status, lastError: error?.code || 'unknown' })
        .catch((saveError) => console.error('[restore] could not record the interruption', saveError));
    }
    throw error;
  } finally {
    setActiveRestore(null);
  }
}
