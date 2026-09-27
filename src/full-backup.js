// Full Backup and Full Restore — what the screens call. The work itself lives
// in its own modules:
//
//   backup-format.js    the layout, versions, chunk sizes and read limits
//   zip64.js            the ZIP/ZIP64 container, written and read in slices
//   backup-writer.js    writing a version 2 backup as a stream
//   backup-reader.js    opening version 1 and 2 backups, verifying all of it
//   restore-index.js    what an incoming backup holds, kept on disk
//   restore-engine.js   the resumable, verified replacement restore
//
// This module adds what a customer-facing operation needs around them: only
// one backup or restore at a time (a second tap is refused, not queued), the
// screen kept awake where the platform allows it, and «آخر نسخة احتياطية»
// recorded only when the system has actually taken the file — together with
// whether that backup was complete or degraded.

import * as local from './local-store.js';
import { repository } from './repository.js';
import { unfinishedRestore } from './restore.js';
import * as restoreIndex from './restore-index.js';
import { AppError } from './utils.js';
import { ZipReader } from './zip64.js';
import { writeBackupV2 } from './backup-writer.js';
import * as reader from './backup-reader.js';
import * as engine from './restore-engine.js';

const LAST_KEY = 'backup.last';
const SNOOZE_KEY = 'backup.reminderSnoozedUntil';
const DAY = 24 * 60 * 60 * 1000;

// ── one operation at a time ────────────────────────────────────────────────

let running = null;

/** 'backup' | 'restore' | 'verify' while one runs in this page, else null. */
export function fullBackupOperation() {
  return running;
}

/**
 * The screen is kept on while a long backup or restore runs, where the
 * platform allows it. This is a courtesy, not a guarantee: the operation is
 * built to survive being stopped anywhere, and relies on nothing else.
 */
async function keepAwake() {
  try {
    return await navigator.wakeLock?.request?.('screen') || null;
  } catch {
    return null;
  }
}

async function exclusive(kind, work) {
  if (running) throw new AppError('backup.busy', { code: 'backup/busy' });
  running = kind;
  const lock = await keepAwake();
  try {
    return await work();
  } finally {
    running = null;
    lock?.release?.().catch?.(() => {});
  }
}

function assertLocal() {
  if (repository.session?.mode === 'cloud') throw new AppError('backup.fullLocalOnly', { code: 'backup/local-only' });
}

// ── backing up ─────────────────────────────────────────────────────────────

/**
 * Everything on this device, as one .nazmbackup handed to the customer.
 *
 * @param {{onProgress?: Function, sink?: object}} [options] `sink` keeps the
 *   file in the page instead of handing it over (the tests).
 * @returns {Promise<object>} the summary from backup-writer.js
 */
export function createFullBackup({ onProgress, sink } = {}) {
  return exclusive('backup', async () => {
    assertLocal();
    const counts = await repository.recordCounts().catch(() => null);
    const summary = await writeBackupV2({ onProgress, sink, purpose: 'backup', itemCount: counts?.total || 0 });
    // Recorded only now that the system has taken the file.
    await local.setMeta(LAST_KEY, {
      at: Date.now(),
      type: 'full',
      formatVersion: 2,
      integrity: summary.integrityStatus,
      items: counts?.live ?? summary.items,
      media: summary.media,
      missing: summary.missingCount,
    });
    return summary;
  });
}

// ── restoring ──────────────────────────────────────────────────────────────

/** Is this file a NAZM Full Backup? Decided by its content, not its name. */
export function looksLikeFullBackup(file) {
  return reader.looksLikeFullBackup(file);
}

/** Opens a backup's structure, manifest and metadata. */
export function openFullBackup(file) {
  return reader.openFullBackup(file);
}

/**
 * Checks every record, definition and image of an opened backup, and builds
 * its restore index. Nothing in the inventory changes.
 *
 * @param {{onProgress?: Function, signal?: AbortSignal}} [options]
 */
export function verifyFullBackup(archive, { onProgress, signal } = {}) {
  return exclusive('verify', async () => {
    const job = await unfinishedRestore();
    return reader.verifyFullBackup(archive, { onProgress, signal, keepKeys: [job?.restoreKey] });
  });
}

/** Replaces the inventory with a verified backup (restore-engine.js). */
export function restoreFullBackup(archive, { onProgress, recoveryCheckpoint = false } = {}) {
  return exclusive('restore', () => engine.restoreFullBackup(archive, { onProgress, recoveryCheckpoint }));
}

/**
 * At startup: restore-index entries no unfinished restore needs — left by a
 * check that was never followed by a restore — are removed.
 */
export async function cleanupAbandonedRestoreState() {
  try {
    const job = await unfinishedRestore();
    await restoreIndex.clearExcept(new Set([job?.restoreKey]));
  } catch (error) {
    console.error('[restore] abandoned restore state could not be cleared', error);
  }
}

// ── when the last one was made ─────────────────────────────────────────────

export async function lastBackupInfo() {
  return local.getMeta(LAST_KEY, null).catch(() => null);
}

/**
 * Whether to show the quiet reminder: never backed up with something worth
 * keeping, a month since the last one, or many records added or removed since
 * — and not snoozed. Never a blocking prompt, never a notification.
 */
export async function backupReminderDue({ liveCount, now = Date.now() } = {}) {
  if (repository.session?.mode === 'cloud' || !(liveCount > 0)) return false;
  const snoozed = await local.getMeta(SNOOZE_KEY, 0).catch(() => 0);
  if (now < snoozed) return false;
  const last = await lastBackupInfo();
  if (!last) return liveCount >= 10;
  if (now - last.at > 30 * DAY) return true;
  return Math.abs(liveCount - (last.items || 0)) >= 50;
}

export async function snoozeBackupReminder({ now = Date.now(), days = 7 } = {}) {
  await local.setMeta(SNOOZE_KEY, now + days * DAY).catch(() => {});
}

/** For the tests: an archive's entries by name, and one entry's bytes. */
export async function __readArchiveForTest(file) {
  const zip = await ZipReader.open(file);
  const entries = new Map();
  for await (const entry of zip.entries()) entries.set(entry.name, entry);
  return { names: [...entries.keys()], zip64: zip.zip64, read: (name) => zip.read(entries.get(name)) };
}
