// Full Backup: one file holding everything NAZM keeps on the device — the
// records, the classification and field definitions, and the images' own
// bytes — so a lost or replaced device can be put back exactly.
//
//   NAZM-Backup-YYYY-MM-DD.nazmbackup     a ZIP archive (stored, not deflated:
//                                         photographs do not compress)
//     data.json       records, folders, locations, classification, field
//                     definitions (retired and recovered ones included) and
//                     the images' metadata
//     media/<id>.<ext>        each image's original bytes
//     media/<id>.thumb.jpg    its display copy
//     manifest.json   written last: versions, counts, and a SHA-256 for
//                     data.json and for every media file
//
// Memory. Nothing here holds more than one image at a time. The archive is
// written as it is produced — straight to disk through the native bridge
// (platform.nativeFileStream), or in a browser as a Blob built from one Blob
// per image, which the browser can keep outside the page's memory. Images are
// never Base64-encoded into JSON. Each path has a size ceiling
// (FULL_BACKUP_LIMITS), checked before anything is read.
//
// Restoring reads the archive in slices, verifies every checksum before a
// single record is written, takes a safety backup of what is there now, then
// writes: classification and field definitions, places, images, records —
// through the existing restore job, so an interruption is recoverable.

import {
  APP_VERSION, FULL_BACKUP_LIMITS, SCHEMA_VERSION, TAXONOMY_SCHEMA_VERSION,
} from './config.js';
import * as local from './local-store.js';
import { mediaIdsOf } from './media.js';
import { isNative, nativeFileStream, saveFile } from './platform.js';
import { repository } from './repository.js';
import { restoreFromBackup } from './restore.js';
import { AppError, uid } from './utils.js';
import { validateImport } from './validation.js';
import { crc32 } from './xlsx-writer.js';

/** The archive format this build writes and the newest it can read. */
export const BACKUP_FORMAT_VERSION = 1;
const FORMAT = 'nazm-backup';
const MIME = 'application/zip';
const encoder = new TextEncoder();
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const LAST_KEY = 'backup.last';
const SNOOZE_KEY = 'backup.reminderSnoozedUntil';
const DAY = 24 * 60 * 60 * 1000;

const EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
  'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif', 'image/tiff': 'tiff', 'image/bmp': 'bmp',
};

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function stamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function backupFilename(date = new Date()) {
  return `NAZM-Backup-${stamp(date)}.nazmbackup`;
}

// ── where the bytes go ─────────────────────────────────────────────────────

/** Base64 of a slice, without building one giant string for the whole file. */
function base64Of(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Written to disk by the native app, a slice at a time. */
class NativeStreamSink {
  constructor(stream, filename) {
    this.stream = stream;
    this.filename = filename;
    this.handle = null;
  }

  async open() { this.handle = await this.stream.begin(this.filename, MIME); }

  async write(bytes) {
    for (let i = 0; i < bytes.length; i += 512 * 1024) {
      await this.stream.append(this.handle, base64Of(bytes.subarray(i, i + 512 * 1024)));
    }
  }

  /** Resolves once the share sheet has taken the file — that is the handoff. */
  async close() { await this.stream.finish(this.handle); }

  async abort() { if (this.handle) await this.stream.abort(this.handle); }
}

/** A Blob built from one Blob per chunk; handed to the download or share sheet. */
class BlobSink {
  constructor(filename) {
    this.filename = filename;
    this.parts = [];
  }

  async open() {}

  async write(bytes) {
    // Copied into its own Blob now, so the page's copy can be let go.
    this.parts.push(new Blob([bytes]));
  }

  async close() {
    const blob = new Blob(this.parts, { type: MIME });
    this.parts = [];
    await saveFile(blob, this.filename);
  }

  async abort() { this.parts = []; }
}

/** The sink this device writes a backup through, and how large it may be. */
export function backupPath() {
  const stream = nativeFileStream();
  if (stream) return { kind: 'nativeStream', limit: FULL_BACKUP_LIMITS.nativeStream, sink: (name) => new NativeStreamSink(stream, name) };
  if (isNative()) return { kind: 'nativeSingle', limit: FULL_BACKUP_LIMITS.nativeSingle, sink: (name) => new BlobSink(name) };
  return { kind: 'download', limit: FULL_BACKUP_LIMITS.download, sink: (name) => new BlobSink(name) };
}

// ── a ZIP written as it goes ───────────────────────────────────────────────

function dosDateTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, day };
}

/**
 * Stored entries, local header then data, each written as soon as it is
 * ready; the central directory (a few dozen bytes per entry) is kept until
 * the end. No ZIP64: the path limits keep an archive under 4 GB.
 */
class ZipWriter {
  constructor(sink) {
    this.sink = sink;
    this.offset = 0;
    this.central = [];
    this.count = 0;
    Object.assign(this, dosDateTime(new Date()));
  }

  async add(path, bytes) {
    if (this.count >= FULL_BACKUP_LIMITS.entries) throw new AppError('backup.tooLarge', { code: 'backup/too-many' });
    const name = encoder.encode(path);
    const crc = crc32(bytes);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true);
    header.setUint16(8, 0, true);
    header.setUint16(10, this.time, true);
    header.setUint16(12, this.day, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, bytes.length, true);
    header.setUint32(22, bytes.length, true);
    header.setUint16(26, name.length, true);
    const head = new Uint8Array(30 + name.length);
    head.set(new Uint8Array(header.buffer), 0);
    head.set(name, 30);
    await this.sink.write(head);
    await this.sink.write(bytes);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(12, this.time, true);
    entry.setUint16(14, this.day, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true);
    entry.setUint32(24, bytes.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, this.offset, true);
    const record = new Uint8Array(46 + name.length);
    record.set(new Uint8Array(entry.buffer), 0);
    record.set(name, 46);
    this.central.push(record);
    this.offset += head.length + bytes.length;
    this.count += 1;
    if (this.offset > 0xffffffff) throw new AppError('backup.tooLarge', { code: 'backup/too-large' });
  }

  async finish() {
    const size = this.central.reduce((sum, chunk) => sum + chunk.length, 0);
    const directory = new Uint8Array(size);
    let at = 0;
    for (const chunk of this.central) { directory.set(chunk, at); at += chunk.length; }
    await this.sink.write(directory);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.count, true);
    end.setUint16(10, this.count, true);
    end.setUint32(12, size, true);
    end.setUint32(16, this.offset, true);
    await this.sink.write(new Uint8Array(end.buffer));
  }
}

// ── writing a backup ───────────────────────────────────────────────────────

/**
 * Everything the device holds, as one archive handed to the customer.
 *
 * @param {{onProgress?: (p: {done: number, total: number}) => void, purpose?: 'backup'|'safety'}} [options]
 * @returns {Promise<{filename, items, media, missing: string[], bytes: number}>}
 */
export async function createFullBackup({ onProgress = () => {}, purpose = 'backup' } = {}) {
  const repo = repository;
  if (repo.session?.mode === 'cloud') throw new AppError('backup.fullLocalOnly', { code: 'backup/local-only' });
  await repo.completeItems();
  repo.assertItemsComplete('partial.backup');

  const items = repo.state.items;
  const referenced = new Set(items.flatMap((item) => mediaIdsOf(item)));
  const assets = (await local.getAll('mediaAssets')).filter((asset) => referenced.has(asset.id));
  const data = {
    format: 'nazm-data',
    schemaVersion: SCHEMA_VERSION,
    taxonomy: { schemaVersion: TAXONOMY_SCHEMA_VERSION },
    items,
    folders: repo.state.folders,
    locations: repo.state.locations,
    categories: repo.state.categories,
    fieldDefinitions: repo.state.fieldDefinitions,
    mediaAssets: assets,
  };
  const dataBytes = encoder.encode(JSON.stringify(data));

  const path = backupPath();
  const estimate = dataBytes.length + assets.reduce((sum, asset) => sum + (asset.fileSize || 0), 0) * 1.35;
  if (estimate > path.limit) {
    throw new AppError('backup.tooLarge', { code: 'backup/too-large', size: Math.ceil(estimate / 1048576), limit: Math.floor(path.limit / 1048576) });
  }

  const filename = purpose === 'safety' ? `NAZM-Safety-${stamp()}.nazmbackup` : backupFilename();
  const sink = path.sink(filename);
  await sink.open();
  const zip = new ZipWriter(sink);
  const manifestMedia = [];
  const missing = [...referenced].filter((id) => !assets.some((asset) => asset.id === id));
  let mediaBytes = 0;
  try {
    await zip.add('data.json', dataBytes);
    const dataHash = await sha256(dataBytes);
    let done = 0;
    for (const asset of assets) {
      const record = await local.get('images', asset.id);
      if (!record?.original) { missing.push(asset.id); done += 1; continue; }
      const original = new Uint8Array(record.original);
      const type = record.originalType || asset.mimeType || 'image/jpeg';
      const entry = {
        id: asset.id,
        path: `media/${asset.id}.${EXTENSIONS[type] || 'bin'}`,
        mimeType: type,
        size: original.length,
        sha256: await sha256(original),
      };
      await zip.add(entry.path, original);
      mediaBytes += original.length;
      if (record.thumbnail) {
        const thumbnail = new Uint8Array(record.thumbnail);
        Object.assign(entry, {
          thumbnailPath: `media/${asset.id}.thumb.jpg`,
          thumbnailType: record.thumbnailType || 'image/jpeg',
          thumbnailSize: thumbnail.length,
          thumbnailSha256: await sha256(thumbnail),
        });
        await zip.add(entry.thumbnailPath, thumbnail);
        mediaBytes += thumbnail.length;
      }
      manifestMedia.push(entry);
      done += 1;
      onProgress({ done, total: assets.length });
    }

    const manifest = {
      format: FORMAT,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      minReaderVersion: 1,
      backupId: uid('bkp'),
      backupType: 'full',
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      databaseVersion: local.DATABASE_VERSION,
      taxonomySchemaVersion: TAXONOMY_SCHEMA_VERSION,
      counts: {
        items: items.length,
        folders: data.folders.length,
        locations: data.locations.length,
        categories: data.categories.length,
        fieldDefinitions: data.fieldDefinitions.length,
        media: manifestMedia.length,
      },
      mediaBytes,
      data: { path: 'data.json', size: dataBytes.length, sha256: dataHash },
      media: manifestMedia,
      // Referenced by a record but not on this device when the backup was
      // made: said in the file, so a restore can say it too.
      missingMedia: [...new Set(missing)],
    };
    await zip.add('manifest.json', encoder.encode(JSON.stringify(manifest, null, 1)));
    await zip.finish();
    // Only a handoff the system confirms counts as a backup.
    await sink.close();
  } catch (error) {
    await sink.abort();
    throw error;
  }

  const summary = {
    filename, items: items.length, media: manifestMedia.length,
    missing: [...new Set(missing)], bytes: zip.offset,
  };
  if (purpose === 'backup') {
    await local.setMeta(LAST_KEY, { at: Date.now(), type: 'full', items: repo.liveItems().length, media: manifestMedia.length });
  }
  return summary;
}

// ── reading one back ───────────────────────────────────────────────────────

function u16(view, at) { return view.getUint16(at, true); }
function u32(view, at) { return view.getUint32(at, true); }

async function sliceBytes(file, start, end) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

/** The archive's table of contents, read from its end — never the whole file. */
async function readDirectory(file) {
  const tailStart = Math.max(0, file.size - 65_557);
  const tail = await sliceBytes(file, tailStart, file.size);
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new AppError('backup.corrupt', { code: 'backup/not-archive' });
  const count = u16(view, eocd + 10);
  const size = u32(view, eocd + 12);
  const offset = u32(view, eocd + 16);
  if (offset + size > file.size) throw new AppError('backup.corrupt', { code: 'backup/truncated' });
  const directory = await sliceBytes(file, offset, offset + size);
  const dir = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const entries = new Map();
  let at = 0;
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > directory.length || u32(dir, at) !== 0x02014b50) throw new AppError('backup.corrupt', { code: 'backup/bad-directory' });
    const nameLength = u16(dir, at + 28);
    const name = new TextDecoder().decode(directory.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, {
      method: u16(dir, at + 10),
      crc: u32(dir, at + 16),
      size: u32(dir, at + 20),
      localOffset: u32(dir, at + 42),
    });
    at += 46 + nameLength + u16(dir, at + 30) + u16(dir, at + 32);
  }
  return entries;
}

async function readEntry(file, entries, name) {
  const entry = entries.get(name);
  if (!entry) throw new AppError('backup.corrupt', { code: 'backup/missing-entry', entry: name });
  if (entry.method !== 0) throw new AppError('backup.corrupt', { code: 'backup/compressed' });
  const header = await sliceBytes(file, entry.localOffset, entry.localOffset + 30);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 30 || u32(view, 0) !== 0x04034b50) throw new AppError('backup.corrupt', { code: 'backup/bad-entry' });
  const start = entry.localOffset + 30 + u16(view, 26) + u16(view, 28);
  const bytes = await sliceBytes(file, start, start + entry.size);
  if (bytes.length !== entry.size) throw new AppError('backup.corrupt', { code: 'backup/truncated' });
  return bytes;
}

function parseJson(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes), (key, value) => (UNSAFE_KEYS.has(key) ? undefined : value));
}

/** Is this file a NAZM Full Backup? Decided by its content, not its name. */
export async function looksLikeFullBackup(file) {
  if (!file || file.size < 22) return false;
  const head = await sliceBytes(file, 0, 4);
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

/**
 * Opens and checks an archive — structure, versions, data, classification,
 * field definitions, and that every image the records need is in it. Image
 * bytes are verified separately (`verifyFullBackupMedia`), one at a time.
 *
 * @returns {Promise<{file, entries, manifest, data, stats, warnings: string[], fingerprint: string, missingMedia: string[]}>}
 */
export async function openFullBackup(file) {
  if (file.size > FULL_BACKUP_LIMITS.restoreBytes) {
    throw new AppError('backup.tooLarge', { code: 'backup/too-large', size: Math.ceil(file.size / 1048576), limit: Math.floor(FULL_BACKUP_LIMITS.restoreBytes / 1048576) });
  }
  let entries;
  try {
    entries = await readDirectory(file);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('backup.corrupt', { code: 'backup/unreadable', cause: error });
  }
  if (!entries.has('manifest.json') || !entries.has('data.json')) throw new AppError('backup.notFullBackup', { code: 'backup/not-full' });

  const manifestBytes = await readEntry(file, entries, 'manifest.json');
  let manifest;
  try { manifest = parseJson(manifestBytes); } catch (error) { throw new AppError('backup.corrupt', { code: 'backup/manifest', cause: error }); }
  if (manifest?.format !== FORMAT || !Number.isInteger(manifest.backupFormatVersion)) {
    throw new AppError('backup.notFullBackup', { code: 'backup/not-full' });
  }
  // Written by a newer NAZM: refused whole, never flattened into what this
  // version happens to understand.
  if (manifest.backupFormatVersion > BACKUP_FORMAT_VERSION || (manifest.minReaderVersion || 1) > BACKUP_FORMAT_VERSION
    || (Number.isInteger(manifest.taxonomySchemaVersion) && manifest.taxonomySchemaVersion > TAXONOMY_SCHEMA_VERSION)
    || (Number.isInteger(manifest.schemaVersion) && manifest.schemaVersion > SCHEMA_VERSION)) {
    throw new AppError('backup.newerVersion', { code: 'backup/newer' });
  }

  const dataLimit = isNative() ? FULL_BACKUP_LIMITS.dataBytes.native : FULL_BACKUP_LIMITS.dataBytes.web;
  if ((entries.get('data.json')?.size || 0) > dataLimit) throw new AppError('backup.tooLarge', { code: 'backup/data-too-large' });
  const dataBytes = await readEntry(file, entries, 'data.json');
  if (manifest.data?.sha256 && await sha256(dataBytes) !== manifest.data.sha256) {
    throw new AppError('backup.integrity', { code: 'backup/data-checksum' });
  }
  let raw;
  try { raw = parseJson(dataBytes); } catch (error) { throw new AppError('backup.corrupt', { code: 'backup/data', cause: error }); }
  const checked = validateImport(raw);
  if (!checked.ok) throw new AppError('backup.corrupt', { code: 'backup/invalid', details: checked.errors });
  if (Number.isInteger(manifest.counts?.items) && (raw.items || []).length !== manifest.counts.items) {
    throw new AppError('backup.integrity', { code: 'backup/count' });
  }

  // Every image named by the manifest is in the archive, and every image a
  // record references is either in it or declared missing by the manifest.
  const media = Array.isArray(manifest.media) ? manifest.media : [];
  for (const entry of media) {
    if (!entries.has(entry.path) || (entry.thumbnailPath && !entries.has(entry.thumbnailPath))) {
      throw new AppError('backup.missingImage', { code: 'backup/missing-image' });
    }
  }
  const inArchive = new Set(media.map((entry) => entry.id));
  const declaredMissing = new Set(manifest.missingMedia || []);
  const referenced = new Set(checked.data.items.flatMap((item) => mediaIdsOf(item)));
  for (const id of referenced) {
    if (!inArchive.has(id) && !declaredMissing.has(id)) throw new AppError('backup.missingImage', { code: 'backup/unlisted-image' });
  }

  return {
    file,
    entries,
    manifest,
    data: { ...checked.data, mediaAssets: Array.isArray(raw.mediaAssets) ? raw.mediaAssets : [] },
    stats: { ...checked.stats, media: media.length },
    warnings: checked.warnings,
    missingMedia: [...declaredMissing].filter((id) => referenced.has(id)),
    fingerprint: `full:${await sha256(manifestBytes)}`,
  };
}

/** Every image's bytes against its checksum, before anything is written. */
export async function verifyFullBackupMedia(archive, { onProgress = () => {} } = {}) {
  const media = archive.manifest.media || [];
  let done = 0;
  for (const entry of media) {
    for (const [path, hash, size] of [[entry.path, entry.sha256, entry.size], [entry.thumbnailPath, entry.thumbnailSha256, entry.thumbnailSize]]) {
      if (!path) continue;
      const bytes = await readEntry(archive.file, archive.entries, path);
      if ((Number.isInteger(size) && bytes.length !== size) || await sha256(bytes) !== hash) {
        throw new AppError('backup.corruptImage', { code: 'backup/image-checksum', mediaId: entry.id });
      }
    }
    done += 1;
    onProgress({ done, total: media.length });
  }
  const bytes = media.reduce((sum, entry) => sum + (entry.size || 0) + (entry.thumbnailSize || 0), 0);
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota && estimate.quota - (estimate.usage || 0) < bytes * 1.2) {
      throw new AppError('backup.noSpace', { code: 'backup/no-space' });
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
  }
  return { images: media.length, bytes };
}

/** Writes the archive's images into this device, idempotently. */
async function writeMedia(archive, { onProgress }) {
  const assets = new Map((archive.data.mediaAssets || []).map((asset) => [asset.id, asset]));
  const media = archive.manifest.media || [];
  let done = 0;
  for (const entry of media) {
    const [haveAsset, haveImage] = await Promise.all([local.get('mediaAssets', entry.id), local.get('images', entry.id)]);
    if (!haveAsset || !haveImage) {
      const original = await readEntry(archive.file, archive.entries, entry.path);
      if (await sha256(original) !== entry.sha256) throw new AppError('backup.corruptImage', { code: 'backup/image-checksum', mediaId: entry.id });
      const thumbnail = entry.thumbnailPath ? await readEntry(archive.file, archive.entries, entry.thumbnailPath) : original;
      const asset = assets.get(entry.id) || {};
      await local.transaction(['images', 'mediaAssets'], 'readwrite', async (stores) => {
        await local.request(stores.images.put({
          id: entry.id,
          itemId: null,
          original: original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength),
          originalType: entry.mimeType,
          thumbnail: thumbnail.buffer.slice(thumbnail.byteOffset, thumbnail.byteOffset + thumbnail.byteLength),
          thumbnailType: entry.thumbnailType || entry.mimeType,
          meta: asset,
        }));
        // Counted by the reconciliation that follows the restore.
        if (!haveAsset) {
          await local.request(stores.mediaAssets.put({
            ...asset, id: entry.id, storagePath: `local:${entry.id}`, thumbnailPath: `local:${entry.id}`,
            mimeType: entry.mimeType, refCount: 0, orphanedAt: Date.now(),
          }));
        }
      });
    }
    done += 1;
    onProgress({ stage: 'media', done, total: media.length });
  }
}

/**
 * Replaces this device's inventory with the archive's — only after it has
 * been verified in full, and after what is here now has been saved.
 *
 * @param {object} archive from `openFullBackup`, already verified
 * @param {{onProgress?: Function, saveBackup: (text: string) => Promise<void>}} options
 */
export async function restoreFullBackup(archive, { onProgress = () => {}, saveBackup }) {
  const repo = repository;
  repo.assertCanWrite();
  await repo.completeItems();
  // A safety copy that includes this device's images when it has any: the
  // inventory being replaced deserves the same protection as the one coming in.
  const hasImages = repo.state.items.some((item) => mediaIdsOf(item).length);
  let safetyDone = false;
  if (hasImages) {
    await createFullBackup({ purpose: 'safety' });
    safetyDone = true;
  }
  const result = await restoreFromBackup(archive.data, {
    sourceFingerprint: archive.fingerprint,
    saveBackup: safetyDone ? async () => {} : saveBackup,
    onProgress,
    beforeWrite: () => writeMedia(archive, { onProgress }),
  });
  return { ...result, images: (archive.manifest.media || []).length, declaredMissing: archive.missingMedia.length };
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

/** For the tests: the archive's table of contents and one entry's bytes. */
export async function __readArchiveForTest(file) {
  const entries = await readDirectory(file);
  return { names: [...entries.keys()], read: (name) => readEntry(file, entries, name) };
}
