// Long operations — exports, imports, backups, restores — as jobs.
//
// Every such operation is started through `startJob` and answered with a job:
// `{ jobId, kind, status, progress, result, error }`. On the device a job runs
// in this tab and is usually finished by the time `startJob` resolves; a cloud
// backend will instead accept the job, return it `queued`, and run it on a
// server (a large export written to storage, an import applied in batches).
// Callers that read `status` and `result` rather than assuming the work is
// already done keep working unchanged when that happens.
//
// Nothing here is persisted: a device job's durable state (an import's or a
// restore's resume point) stays where it already is, in its own store. This is
// the calling convention, not a second record of the same thing.

export const JobStatus = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/** The most recent jobs kept for `getJob`; older ones are forgotten. */
const KEEP = 20;
const jobs = new Map();

function newJobId(kind) {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `job_${kind}_${Date.now().toString(36)}_${random[0].toString(36)}${random[1].toString(36)}`;
}

function remember(job) {
  jobs.set(job.jobId, job);
  while (jobs.size > KEEP) jobs.delete(jobs.keys().next().value);
}

/**
 * Runs `work` as a job on this device.
 *
 * @param {string} kind 'export.csv', 'export.xlsx', 'backup.full', …
 * @param {(job: {progress: Function, signal: {aborted: boolean}}) => Promise<any>} work
 * @returns {Promise<object>} the finished job — `status` says how it ended;
 *   a failure is reported in `error` (an AppError), never thrown past here.
 */
export async function startJob(kind, work) {
  const job = { jobId: newJobId(kind), kind, status: JobStatus.RUNNING, progress: null, result: null, error: null, startedAt: Date.now() };
  const signal = { aborted: false };
  job.cancel = () => { signal.aborted = true; };
  remember(job);
  try {
    job.result = await work({ progress: (value) => { job.progress = value; }, signal });
    job.status = signal.aborted ? JobStatus.CANCELLED : JobStatus.COMPLETED;
  } catch (error) {
    job.status = JobStatus.FAILED;
    job.error = error;
  }
  job.finishedAt = Date.now();
  return job;
}

/** A job started in this session, or null. */
export function getJob(jobId) {
  return jobs.get(jobId) || null;
}
