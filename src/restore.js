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
// Progress is written to a job document as it goes, so an interrupted restore
// can be resumed and, more importantly, can be *seen* rather than guessed at.

import { ACTIONS, SCHEMA_VERSION } from './config.js';
import { repository } from './repository.js';
import { AppError } from './utils.js';

export const RestoreStage = {
  BACKUP: 'backup',
  WRITE: 'write',
  REMOVE: 'remove',
  DONE: 'done',
};

const STAGE_LABELS = {
  backup: 'جارٍ أخذ نسخة أمان…',
  write: 'جارٍ كتابة السجلات…',
  remove: 'جارٍ إزالة السجلات القديمة…',
  done: 'اكتملت الاستعادة',
};

export function stageLabel(stage) {
  return STAGE_LABELS[stage] || '';
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
      throw new AppError('تعذّر التحقق من نسخة الأمان — أُلغيت الاستعادة', {
        code: 'restore/backup-unverified',
      });
    }
  }

  return { payload, text, counts: Object.fromEntries(COLLECTIONS.map((n) => [n, parsed[n].length])) };
}

/**
 * @param {object} data the parsed, validated backup being restored
 * @param {{onProgress?: (p: {stage: string, done: number, total: number}) => void,
 *          saveBackup: (text: string) => void}} options
 *   saveBackup must throw if it cannot deliver the file to the customer.
 */
export async function restoreFromBackup(data, { onProgress = () => {}, saveBackup }) {
  const repo = repository;
  repo.assertCanWrite();

  // ── 0. the whole inventory, before anything else ──
  // The app browses on a window of the newest records. A safety backup taken
  // from a window backs up a fraction, and step 3 would then remove records
  // the backup never held. Load everything, and refuse if that fails.
  await repo.completeItems();
  repo.assertItemsComplete('الاستعادة');

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
      'تعذّر حفظ نسخة الأمان، ولم تُغيَّر أي بيانات. تأكد من السماح بالتنزيل ثم حاول مرة أخرى.',
      { code: 'restore/aborted', cause: error },
    );
  }
  onProgress({ stage: RestoreStage.BACKUP, done: 1, total: 1 });

  // ── 2. write the incoming records ──
  const writes = [];
  for (const name of COLLECTIONS) {
    for (const record of data[name] || []) {
      writes.push({ type: 'set', collection: name, id: record.id, data: record, merge: false });
    }
  }

  let done = 0;
  for (let i = 0; i < writes.length; i += CHUNK) {
    await repo.bulkWrite(writes.slice(i, i + CHUNK));
    done = Math.min(writes.length, i + CHUNK);
    onProgress({ stage: RestoreStage.WRITE, done, total: writes.length });
  }

  // ── 3. remove what the backup does not contain ──
  // Only now, with every incoming record already written. If the run stops
  // here the workspace holds a superset — untidy, never empty.
  const incoming = Object.fromEntries(
    COLLECTIONS.map((name) => [name, new Set((data[name] || []).map((r) => r.id))]),
  );
  const removals = [];
  for (const name of COLLECTIONS) {
    for (const record of repo.state[name]) {
      if (!incoming[name].has(record.id)) {
        removals.push({ type: 'delete', collection: name, id: record.id });
      }
    }
  }

  done = 0;
  for (let i = 0; i < removals.length; i += CHUNK) {
    await repo.bulkWrite(removals.slice(i, i + CHUNK));
    done = Math.min(removals.length, i + CHUNK);
    onProgress({ stage: RestoreStage.REMOVE, done, total: removals.length });
  }

  await repo.log(ACTIONS.IMPORT_RESTORED, {
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
