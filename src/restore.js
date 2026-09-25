// Restoring a backup, without the possibility of losing an inventory.
//
// The old shape of this — delete everything, then write the file — has one
// failure mode that cannot be recovered from: the network drops between the
// two halves and the customer's records are gone. This one is built so that
// every point at which it can fail leaves either the old data or the new data
// intact, never neither.
//
//   1. Take a safety backup and verify it. If that fails, ABORT. The whole
//      operation stops; nothing has been touched.
//   2. Write the incoming records first. The workspace now holds both sets.
//   3. Remove only the records that the backup does not contain, and only
//      after every write has landed.
//
// A compact restore job is kept on the device (`restoreJob` in the meta
// store): which backup, which stage, how far. It is written before each stage
// begins and as each chunk lands, so a restore the tab died in the middle of
// is *known* to be unfinished the next time the app opens — rather than a
// workspace holding half of two inventories looking like a normal one.
//
// Resuming is re-running. Both halves are idempotent: step 2 writes each
// incoming record under its own id, so writing it again changes nothing, and
// step 3 removes whatever the backup does not contain, which on a second run
// is only what the first run did not reach. So picking the same backup again
// finishes the job — after taking a new safety backup of the mixed state,
// because that state is now the thing that must not be lost. A different
// backup, or a merge, is refused until the unfinished one is finished.

import { ACTIONS, SCHEMA_VERSION } from './config.js';
import * as local from './local-store.js';
import { repository } from './repository.js';
import { AppError } from './utils.js';
import { t } from './i18n.js';

// ── the restore job ──

const JOB_KEY = 'restoreJob';

export const RestoreStatus = {
  PREPARED: 'prepared',
  WRITING: 'writing',
  REMOVING: 'removing',
  COMPLETED: 'completed',
  RECOVERY_REQUIRED: 'recovery-required',
};

const UNFINISHED = new Set([
  RestoreStatus.PREPARED, RestoreStatus.WRITING, RestoreStatus.REMOVING, RestoreStatus.RECOVERY_REQUIRED,
]);

/** A restore running in this page right now — not an interrupted one. */
let activeRestoreId = null;

/** Message keys (i18n.js): the screens say them in the current language. */
export const RESTORE_BLOCKED_MESSAGE = 'restore.blocked';
export const RESTORE_WRONG_FILE_MESSAGE = 'restore.wrongFile';

async function saveJob(job) {
  try {
    await local.setMeta(JOB_KEY, { ...job, updatedAt: Date.now() });
  } catch (error) {
    // The job is what makes an interruption visible. Without it, stop.
    throw new AppError('error.restore/state-unsaved', {
      code: 'restore/state-unsaved', cause: error,
    });
  }
}

/** The unfinished restore on this device, if any. */
export async function unfinishedRestore() {
  const job = await local.getMeta(JOB_KEY, null).catch(() => null);
  if (!job || !UNFINISHED.has(job.status)) return null;
  if (job.id === activeRestoreId) return null;
  return job;
}

/**
 * At startup: a restore the previous page left mid-way is marked as needing
 * recovery. Nothing is changed in the inventory; it is only made visible.
 */
export async function markInterruptedRestore() {
  const job = await unfinishedRestore();
  if (!job || job.status === RestoreStatus.RECOVERY_REQUIRED) return job;
  const marked = { ...job, status: RestoreStatus.RECOVERY_REQUIRED, interruptedAt: job.status };
  await local.setMeta(JOB_KEY, { ...marked, updatedAt: Date.now() }).catch((error) => {
    console.error('[restore] could not mark an interrupted restore', error);
  });
  console.error(`[restore] an interrupted restore was found (stage ${job.status}); recovery is required`);
  return marked;
}

/** Throws unless no restore is unfinished — the gate in front of merge. */
export async function assertNoUnfinishedRestore() {
  if (await unfinishedRestore()) {
    throw new AppError(RESTORE_BLOCKED_MESSAGE, { code: 'restore/recovery-required' });
  }
}


export const RestoreStage = {
  BACKUP: 'backup',
  WRITE: 'write',
  REMOVE: 'remove',
  DONE: 'done',
};

export function stageLabel(stage) {
  return stage && Object.values(RestoreStage).includes(stage) ? t(`restore.stage.${stage}`) : '';
}

const COLLECTIONS = ['categories', 'locations', 'folders', 'items'];
const CHUNK = 300;

/**
 * Builds the safety backup and checks it is actually usable before anything is
 * touched. A backup nobody verified is not a backup.
 */
export function buildSafetyBackup() {
  const repo = repository;
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    backupType: 'pre-restore',
    workspaceId: repo.session.workspaceId,
    items: repo.state.items,
    folders: repo.state.folders,
    categories: repo.state.categories,
    locations: repo.state.locations,
  };

  const text = JSON.stringify(payload);
  const parsed = JSON.parse(text);

  // Verify by reading it back: the counts must match what is in memory, or the
  // file is not a copy of this workspace and must not be relied on.
  for (const name of COLLECTIONS) {
    if ((parsed[name] || []).length !== repo.state[name].length) {
      throw new AppError('error.restore/backup-unverified', {
        code: 'restore/backup-unverified',
      });
    }
  }

  return { payload, text, counts: Object.fromEntries(COLLECTIONS.map((n) => [n, parsed[n].length])) };
}

/**
 * A full restore puts the backup back whatever the plan now allows: this is
 * the customer's own data, and it is not held behind a limit. If the result
 * is over the plan, the workspace is simply over it — nothing new can be
 * added until it is trimmed or upgraded, and everything else keeps working.
 *
 * @param {object} data the parsed, validated backup being restored
 * @param {{onProgress?: (p: {stage: string, done: number, total: number}) => void,
 *          saveBackup: (text: string) => void,
 *          sourceFingerprint: string}} options
 *   saveBackup must throw if it cannot deliver the file to the customer.
 *   sourceFingerprint is the SHA-256 of the backup file's exact bytes, from
 *   `readBackupFile`. It is the restore's identity: an interrupted restore is
 *   finished only by the file with the same bytes, never by another backup
 *   of the same records.
 */
export async function restoreFromBackup(data, { onProgress = () => {}, saveBackup, sourceFingerprint }) {
  const repo = repository;
  repo.assertCanWrite();
  if (!sourceFingerprint) {
    // No identity, no restore job — and no restore.
    throw new AppError('error.backup/fingerprint-unavailable', {
      code: 'backup/fingerprint-unavailable',
    });
  }

  // An unfinished restore of a *different* file blocks this one. The same
  // file resumes it: see the note at the top of this file.
  const previous = await unfinishedRestore();
  if (previous && previous.sourceFingerprint !== sourceFingerprint) {
    throw new AppError(RESTORE_WRONG_FILE_MESSAGE, { code: 'restore/recovery-required' });
  }
  const job = {
    id: previous?.id || `rst-${Date.now().toString(36)}`,
    status: RestoreStatus.PREPARED,
    stage: RestoreStage.BACKUP,
    startedAt: previous?.startedAt || Date.now(),
    resumed: Boolean(previous),
    sourceFingerprint,
    sourceCounts: Object.fromEntries(COLLECTIONS.map((name) => [name, (data[name] || []).length])),
    writeProgress: { done: 0, total: 0 },
    removalProgress: { done: 0, total: 0 },
    safetyBackup: null,
  };
  activeRestoreId = job.id;
  try {
    return await runRestore(repo, data, job, { onProgress, saveBackup });
  } finally {
    activeRestoreId = null;
  }
}

async function runRestore(repo, data, job, { onProgress, saveBackup }) {

  // ── 0. the whole inventory, before anything else ──
  // The app browses on a window of the newest records. A safety backup taken
  // from a window backs up a fraction, and step 3 would then remove records
  // the backup never held. Load everything, and refuse if that fails.
  await repo.completeItems();
  repo.assertItemsComplete('partial.restore');

  // ── 1. safety backup ──
  onProgress({ stage: RestoreStage.BACKUP, done: 0, total: 1 });
  let safety;
  try {
    safety = buildSafetyBackup();
    saveBackup(safety.text);
  } catch (error) {
    // Not a warning. Without a backup this operation does not run at all.
    console.error('[restore] safety backup failed — aborting', error);

    throw new AppError(
      'error.restore/aborted',
      { code: 'restore/aborted', cause: error },
    );
  }
  onProgress({ stage: RestoreStage.BACKUP, done: 1, total: 1 });
  job.safetyBackup = safety.counts;
  // The job is recorded once the safety backup is in the customer's hands and
  // before the first write — so a restore that stopped before changing
  // anything leaves nothing that looks like one that stopped half way.
  await saveJob(job);

  // ── 2. write the incoming records ──
  const writes = [];
  for (const name of COLLECTIONS) {
    for (const record of data[name] || []) {
      writes.push({ type: 'set', collection: name, id: record.id, data: record, merge: false });
    }
  }

  job.status = RestoreStatus.WRITING;
  job.stage = RestoreStage.WRITE;
  job.writeProgress = { done: 0, total: writes.length };
  await saveJob(job);

  let done = 0;
  for (let i = 0; i < writes.length; i += CHUNK) {
    await repo.bulkWrite(writes.slice(i, i + CHUNK));
    done = Math.min(writes.length, i + CHUNK);
    job.writeProgress = { done, total: writes.length };
    await saveJob(job);
    onProgress({ stage: RestoreStage.WRITE, done, total: writes.length });
  }

  // ── 3. remove what the backup does not contain ──
  // Only now, with every incoming record already written. If the run stops
  // here the workspace holds a superset — untidy, never empty — and the job
  // says so. Which records existed before is read from the safety backup,
  // the complete copy taken in step 1, not from whatever is in memory now.
  const incoming = Object.fromEntries(
    COLLECTIONS.map((name) => [name, new Set((data[name] || []).map((r) => r.id))]),
  );
  const removals = [];
  for (const name of COLLECTIONS) {
    for (const record of safety.payload[name] || []) {
      if (!incoming[name].has(record.id)) {
        removals.push({ type: 'delete', collection: name, id: record.id });
      }
    }
  }

  job.status = RestoreStatus.REMOVING;
  job.stage = RestoreStage.REMOVE;
  job.removalProgress = { done: 0, total: removals.length };
  await saveJob(job);

  done = 0;
  for (let i = 0; i < removals.length; i += CHUNK) {
    await repo.bulkWrite(removals.slice(i, i + CHUNK));
    done = Math.min(removals.length, i + CHUNK);
    job.removalProgress = { done, total: removals.length };
    await saveJob(job);
    onProgress({ stage: RestoreStage.REMOVE, done, total: removals.length });
  }

  job.status = RestoreStatus.COMPLETED;
  job.stage = RestoreStage.DONE;
  await saveJob(job);

  await repo.log(ACTIONS.IMPORT_RESTORED, {
    restoreJobId: job.id,
    resumed: job.resumed,
    items: data.items?.length || 0,
    folders: data.folders?.length || 0,
    removed: removals.length,
    safetyBackup: safety.counts,
  });

  onProgress({ stage: RestoreStage.DONE, done: 1, total: 1 });
  return {
    restored: data.items?.length || 0,
    removed: removals.length,
    written: writes.length,
  };
}
