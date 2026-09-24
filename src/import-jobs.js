// Import jobs: what is on the device about an import, and getting it back into
// a known state after the tab died at the worst possible moment.
//
// The job record is not bookkeeping. It is what makes an import resumable
// (which file, which sheet, which mapping, how far), what makes it
// deterministic (its id is inside every record id it writes), and what makes
// it reversible (which taxonomy it created, and the provenance every record
// carries points back at it). So the writes that carry that information are
// *critical*: they either commit or the import stops — see
// `persistJobCritical`. Only history housekeeping is best effort.
//
// ── the lifecycle ──────────────────────────────────────────────────────────
//
//   (new) → prepared → running → completed
//                       running → stopped            the customer stopped it,
//                                                    a write failed, or a dead
//                                                    runtime left it running
//                       stopped → running            continued
//                       stopped → rolling-back → rolled-back
//                       stopped → abandoned          records kept, never resumed
//
// A cancellation always passes through `stopped`: a running import is stopped
// at a chunk boundary first, and only then rolled back. Nothing else moves a
// job, and pruning never touches a job that can still move.
//
// ── recovery ───────────────────────────────────────────────────────────────
//
// Two states on disk mean a previous page lifecycle died mid-operation:
//
//   running / prepared   an import was writing. No page lifecycle can outlive
//                        its JavaScript runtime, so a job in either state that
//                        this runtime did not start is not running — it is
//                        interrupted. It becomes `stopped`, with everything it
//                        knew kept: same id, same `written`, same mapping.
//   rolling-back         a cancellation was deleting. It is finished, because
//                        a half-removed import is the one state nothing else
//                        in the app can make sense of.
//
// Both run once at startup (`runImportRecovery`, from app.js) and again
// before any new import is accepted. If a cancellation cannot be finished, new
// imports are refused until it can — the inventory can still be browsed, it
// just cannot be imported into while it is half-undone.

import * as local from './local-store.js';
import { repository } from './repository.js';
import { AppError, uid } from './utils.js';

/** The states an import passes through. One vocabulary, used everywhere. */
export const JOB = {
  PREPARED: 'prepared',
  RUNNING: 'running',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
  // Closed with its records kept: the customer walked away from the file, but
  // what it already wrote is real inventory.
  ABANDONED: 'abandoned',
  // Being undone, and undone. Recorded before the first delete and after the
  // last, so a tab that dies half way through a cancellation is recognisable
  // as one — and running the cancellation again finishes it, because removing
  // records that are already gone removes nothing.
  ROLLING_BACK: 'rolling-back',
  ROLLED_BACK: 'rolled-back',
};

/** Finished jobs worth keeping for context, and no more. */
export const JOB_HISTORY = 20;

/** Only these are history. Everything else is something that can still move. */
const FINISHED = new Set([JOB.COMPLETED, JOB.ABANDONED, JOB.ROLLED_BACK]);

/**
 * Which page lifecycle this is.
 *
 * Stamped on a job whenever it is written, and — the half that matters — only
 * jobs this runtime is actively writing are in `active`. A `running` job that
 * is not in that set was left by a runtime that no longer exists, or by a
 * write loop in this one that stopped without being able to say so. Either
 * way nothing is writing it.
 */
export const RUNTIME_SESSION_ID = uid('rt');
const active = new Set();

export function markJobActive(id) { if (id) active.add(id); }
export function markJobInactive(id) { active.delete(id); }
function isLive(job) {
  return job.runtimeSessionId === RUNTIME_SESSION_ID && active.has(job.id);
}

/** What the customer reads when the device would not keep the job record. */
export const JOB_STATE_UNSAVED_MESSAGE = 'أوقف نَظْم الاستيراد لحماية البيانات. تعذّر حفظ حالة الاستيراد بأمان. أعد فتح الملف للمتابعة.';

function record(job, status) {
  return {
    id: job.id,
    startedAt: job.startedAt,
    updatedAt: Date.now(),
    status,
    runtimeSessionId: RUNTIME_SESSION_ID,
    fileName: job.fileName,
    fileSize: job.fileSize,
    fileFingerprint: job.fileFingerprint,
    sheetName: job.sheetName,
    // The decisions that give the file its meaning. Without them a resumed
    // import would re-guess the columns, and "Ref" could come back meaning
    // something other than the serial number the customer said it was.
    mapping: job.mapping,
    resolved: job.resolved,
    total: job.total,
    written: job.written,
    failedAt: job.failedAt ?? null,
    lastErrorCode: job.lastErrorCode ?? null,
    // Which taxonomy rows this import brought into existence. Cancelling can
    // then take back what the import added without touching a category the
    // customer had before it — and without having to guess from names.
    created: job.created || { categories: [], locations: [], folders: [] },
    // The id chosen for each taxonomy name this import needs, keyed by the
    // normalised name. Written before the row exists, so a resume after a
    // crash creates the same id it already claimed, never a second one.
    plannedTaxonomy: job.plannedTaxonomy || { categories: {}, locations: {}, folders: {} },
    // Why a job that will never run again is not running — e.g. `legacy`.
    reason: job.reason ?? null,
  };
}

// ── test seam ──
//
// A job write that fails is not something a browser does on request. This
// lets the tests make one fail — the first, the third, the one carrying a
// particular `written` — so the code that has to stop can be seen stopping.
let fault = null;
export function __setJobWriteFaultForTest(predicate) { fault = predicate || null; }

/**
 * Write the job, and throw if it did not commit.
 *
 * For every write the import cannot safely proceed without: the job's
 * existence before the first record carries its id, `running` before writing
 * starts, `written` after each chunk, `stopped`, and `rolling-back` before the
 * first delete. The caller stops on a throw — it does not log and carry on,
 * because carrying on is exactly what widens the gap between what is on the
 * device and what the job says is there.
 */
export async function persistJobCritical(job, status) {
  if (!job?.id || !job.fileFingerprint) {
    // An unidentifiable job is one that can never be safely resumed; better
    // never to write records under it at all.
    throw new AppError(JOB_STATE_UNSAVED_MESSAGE, { code: 'import/job-unidentified' });
  }
  try {
    if (fault?.(job, status)) throw new Error('forced job write failure');
    await local.put('importJobs', record(job, status));
  } catch (error) {
    console.error(`[import] critical job persistence failed (${status}, written ${job.written})`, error);
    throw new AppError(JOB_STATE_UNSAVED_MESSAGE, { code: 'import/job-unsaved', cause: error, status });
  }
  if (FINISHED.has(status)) void pruneJobHistory();
}

/** For writes nothing is recovered from. Logs and moves on. */
export async function persistJobBestEffort(job, status) {
  try {
    await persistJobCritical(job, status);
  } catch (error) {
    console.error('[import] could not record the import job', error);
  }
}

/** Finished jobs are history, and history does not need to be unbounded.
 *  Anything that can still move — running, stopped, rolling back — is never
 *  pruned, whatever its age. */
export async function pruneJobHistory() {
  try {
    const jobs = await local.getAll('importJobs');
    const finished = jobs
      .filter((job) => FINISHED.has(job.status))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const stale = finished.slice(JOB_HISTORY).map((job) => job.id);
    if (stale.length) await local.removeMany('importJobs', stale);
  } catch (error) {
    console.error('[import] could not prune the import history', error);
  }
}

/**
 * Jobs a dead runtime left `running` or `prepared` become `stopped`.
 *
 * Nothing about them is reset. `written` is the last boundary that was
 * durably recorded; if the tab died between a chunk committing and its
 * progress being recorded, that chunk is written again on resume — which
 * changes nothing, because its record ids are the same.
 *
 * @returns {Promise<string[]>} the ids of the jobs recovered
 */
export async function recoverInterruptedImportJobs() {
  const recovered = [];
  for (const status of [JOB.RUNNING, JOB.PREPARED]) {
    const jobs = await local.getAllByIndex('importJobs', 'status', status);
    for (const job of jobs) {
      if (isLive(job)) continue;
      const stopped = { ...job, failedAt: job.written ?? 0 };
      if (job.fileFingerprint) {
        await persistJobCritical(stopped, JOB.STOPPED);
      } else {
        await abandonLegacy(job);
      }
      recovered.push(job.id);
      console.info(`[import] stale ${status} job recovered as stopped: ${job.id} at ${job.written ?? 0}`);
    }
  }
  return recovered;
}

/**
 * A job from before file identity was required.
 *
 * It can never be matched to a file again — resuming it by name and size is
 * exactly the mistake the fingerprint exists to prevent — so it will never
 * run again. It is marked abandoned, with the reason, which also lets the
 * ordinary history pruning retire it; a `stopped` job is never pruned, and a
 * legacy one left stopped would sit there forever. Its records stay: they are
 * real inventory.
 */
async function abandonLegacy(job) {
  await local.put('importJobs', {
    ...record({ ...job, reason: 'legacy-unidentified' }, JOB.ABANDONED),
    runtimeSessionId: job.runtimeSessionId ?? null,
  });
  console.info(`[import] legacy job without a file identity retired as abandoned: ${job.id}`);
}

/** Stopped jobs with no fingerprint can never resume; retire them. */
export async function retireLegacyJobs() {
  const stopped = await local.getAllByIndex('importJobs', 'status', JOB.STOPPED);
  let retired = 0;
  for (const job of stopped) {
    if (job.fileFingerprint) continue;
    await abandonLegacy(job);
    retired += 1;
  }
  if (retired) void pruneJobHistory();
  return retired;
}

/**
 * Finish every cancellation a closed tab interrupted.
 *
 * @returns {Promise<{ok: true, recoveredJobs: string[]}
 *   | {ok: false, recoveredJobs: string[], failedJobs: string[], error: Error}>}
 *   Never a quiet success: a job that could not be finished is named.
 */
export async function finishInterruptedRollbacks() {
  const recoveredJobs = [];
  const failedJobs = [];
  let firstError = null;

  let stuck;
  try {
    stuck = await local.getAllByIndex('importJobs', 'status', JOB.ROLLING_BACK);
  } catch (error) {
    console.error('[import] rollback recovery failed: the import history could not be read', error);
    return { ok: false, recoveredJobs, failedJobs, error };
  }

  for (const job of stuck) {
    // A cancellation this runtime is performing right now is not interrupted.
    // It is not finished either, so a new import still waits for it.
    if (isLive(job)) { failedJobs.push(job.id); continue; }
    try {
      const result = await repository.rollbackImport(job.id, job.created);
      await persistJobCritical({ ...job, written: 0 }, JOB.ROLLED_BACK);
      recoveredJobs.push(job.id);
      console.info(`[import] rollback resumed successfully: ${job.id}, ${result.removed} record(s)`);
    } catch (error) {
      failedJobs.push(job.id);
      firstError = firstError || error;
      console.error(`[import] rollback recovery failed: ${job.id}`, error);
    }
  }
  return failedJobs.length
    ? { ok: false, recoveredJobs, failedJobs, error: firstError }
    : { ok: true, recoveredJobs };
}

// ── the recovery state ──────────────────────────────────────────────────────

/**
 * Whether a new import may start. Read by the import screen and nothing else:
 * a half-undone import blocks importing, not browsing.
 */
export const importRecoveryState = {
  ready: false,
  checked: false,
  error: null,
  pendingRollbackJobs: [],
};

let inFlight = null;

/**
 * Both recovery steps, in order. Safe to call more than once; concurrent calls
 * share one run, so startup and an import opened during startup cannot both
 * be deleting the same records.
 *
 * @returns {Promise<typeof importRecoveryState>}
 */
export function runImportRecovery() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await recoverInterruptedImportJobs();
      await retireLegacyJobs();
      const rollbacks = await finishInterruptedRollbacks();
      importRecoveryState.ready = rollbacks.ok;
      importRecoveryState.error = rollbacks.ok ? null : rollbacks.error;
      importRecoveryState.pendingRollbackJobs = rollbacks.ok ? [] : rollbacks.failedJobs;
    } catch (error) {
      console.error('[import] import recovery failed', error);
      importRecoveryState.ready = false;
      importRecoveryState.error = error;
    } finally {
      importRecoveryState.checked = true;
      inFlight = null;
    }
    return importRecoveryState;
  })();
  return inFlight;
}

export const RECOVERY_BLOCKED_MESSAGE = 'تعذّر إكمال التراجع عن استيراد سابق. أعد المحاولة قبل بدء استيراد جديد.';

/**
 * The gate in front of every new import: recovery has run and succeeded, or
 * this throws before the file is so much as fingerprinted.
 */
export async function ensureImportReady() {
  const state = await runImportRecovery();
  if (!state.ready) {
    throw new AppError(RECOVERY_BLOCKED_MESSAGE, {
      code: 'import/recovery-blocked',
      cause: state.error,
      pendingRollbackJobs: [...state.pendingRollbackJobs],
    });
  }
}

/**
 * An import of this exact file that can be continued.
 *
 * A stale `running` job is recovered first rather than skipped: an older job
 * that has already written records under its id must never be passed over
 * for a new job that would write the same rows again under another. And a
 * history that cannot be read is an error, not "no previous job" — guessing
 * the latter is how the same rows get imported twice.
 */
export async function findUnfinishedJob(fileFingerprint) {
  if (!fileFingerprint) return null;
  let candidates;
  try {
    candidates = await local.getAllByIndex('importJobs', 'fileFingerprint', fileFingerprint);
  } catch (error) {
    console.error('[import] could not read the import history', error);
    throw new AppError(JOB_STATE_UNSAVED_MESSAGE, { code: 'import/history-unreadable', cause: error });
  }

  const resumable = [];
  for (const job of candidates) {
    if (job.status === JOB.STOPPED) {
      resumable.push(job);
    } else if ((job.status === JOB.RUNNING || job.status === JOB.PREPARED) && !isLive(job)) {
      const stopped = { ...job, failedAt: job.written ?? 0, status: JOB.STOPPED };
      await persistJobCritical(stopped, JOB.STOPPED);
      console.info(`[import] stale ${job.status} job recovered as stopped: ${job.id}`);
      resumable.push(stopped);
    }
  }
  return resumable.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}

/**
 * The last completed import of this exact file, if there is one — so picking
 * it again can be questioned rather than silently doubling the inventory.
 * Never a block: importing a file twice is sometimes what the customer means.
 */
export async function findCompletedJob(fileFingerprint) {
  if (!fileFingerprint) return null;
  const jobs = await local.getAllByIndex('importJobs', 'fileFingerprint', fileFingerprint).catch(() => []);
  return jobs
    .filter((job) => job.status === JOB.COMPLETED)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}
