// Reading a Full Backup — version 2 (chunked, ZIP64) and version 1 (one
// data.json) — and verifying all of it before a restore may write anything.
//
// `openFullBackup` reads only what is small: the archive's end records, a
// streamed pass over its directory, the root manifest and metadata.json.
// `verifyFullBackup` then checks every piece, one at a time:
//
//   every media manifest   hash, lines, sequences, no repeated image
//   every item chunk       hash, size, record count, every record parsed and
//                          normalized, no repeated record, every image a
//                          record references present or declared missing
//   every image            original and thumbnail against size and SHA-256
//   the whole              counts equal to the manifest's, no entry the
//                          manifest does not account for, no repeated path
//
// and builds the restore index (restore-index.js) the restore then works
// from. Nothing is held beyond one chunk, one manifest part or one image.
//
// Images are matched to the directory in lockstep: the writer stores them in
// the order of their descriptors, so the reader walks both sequences
// together — no map of hundreds of thousands of paths is ever built, and an
// extra, missing, repeated or out-of-order image is caught by the walk itself.

import { APP_VERSION, SCHEMA_VERSION, TAXONOMY_SCHEMA_VERSION } from './config.js';
import { mediaIdsOf } from './media.js';
import { isNative } from './platform.js';
import { AppError } from './utils.js';
import { validateImport } from './validation.js';
import { backupItemContext, validateBackupItem, validateBackupMetadata } from './backup-validate.js';
import { ZipReader } from './zip64.js';
import * as restoreIndex from './restore-index.js';
import {
  BACKUP_FORMAT, BACKUP_FORMAT_VERSION, MEDIA_EXTENSIONS, MIN_SUPPORTED_BACKUP_FORMAT_VERSION,
  READ_LIMITS, V2_PATH, decodeUtf8, parseNdjson, parseSafeJson, paths, sha256Hex,
} from './backup-format.js';

const encoder = new TextEncoder();
/** Warnings kept by text; the count is always exact. */
const WARNING_SAMPLE = 50;

const corrupt = (code, extra = {}) => new AppError('backup.corrupt', { code, ...extra });
const integrity = (code, extra = {}) => new AppError('backup.integrity', { code, ...extra });

function checkAbort(signal) {
  if (signal?.aborted) throw new AppError('backup.checkCancelled', { code: 'backup/cancelled' });
}

function parseJsonEntry(bytes, code) {
  try { return parseSafeJson(decodeUtf8(bytes)); } catch (error) { throw corrupt(code, { cause: error }); }
}

/** Is this file a NAZM Full Backup? Decided by its content, not its name. */
export async function looksLikeFullBackup(file) {
  if (!file || file.size < 22) return false;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

// ── the directory ──────────────────────────────────────────────────────────

/**
 * One streamed pass over the directory: every name checked for safety, the
 * small entries kept by name (a repeat refused), the images only counted.
 */
async function scanDirectory(reader) {
  const small = new Map();
  let mediaEntries = 0;
  let total = 0;
  for await (const entry of reader.entries()) {
    total += 1;
    if (total > READ_LIMITS.entries) throw new AppError('backup.tooLarge', { code: 'backup/too-many' });
    if (entry.name.startsWith('media/')) { mediaEntries += 1; continue; }
    if (small.has(entry.name)) throw corrupt('backup/duplicate-entry', { entry: entry.name });
    small.set(entry.name, entry);
  }
  return { small, mediaEntries, total };
}

async function readSmall(archive, name, limit, code) {
  const entry = archive.small.get(name);
  if (!entry) throw corrupt('backup/missing-entry', { entry: name });
  if (entry.size > BigInt(limit)) throw new AppError(code === 'backup/metadata' ? 'backup.metadataTooLarge' : 'backup.corrupt', { code: code === 'backup/metadata' ? 'backup/metadata-too-large' : 'backup/entry-too-large', entry: name });
  return archive.reader.read(entry);
}

// ── opening ────────────────────────────────────────────────────────────────

function assertReadable(manifest) {
  if (manifest?.format !== BACKUP_FORMAT || !Number.isInteger(manifest.backupFormatVersion)) {
    throw new AppError('backup.notFullBackup', { code: 'backup/not-full' });
  }
  // Written by a newer NAZM: refused whole, never flattened into what this
  // version happens to understand.
  if (manifest.backupFormatVersion > BACKUP_FORMAT_VERSION || (manifest.minReaderVersion || 1) > BACKUP_FORMAT_VERSION
    || manifest.backupFormatVersion < MIN_SUPPORTED_BACKUP_FORMAT_VERSION
    || (Number.isInteger(manifest.taxonomySchemaVersion) && manifest.taxonomySchemaVersion > TAXONOMY_SCHEMA_VERSION)
    || (Number.isInteger(manifest.schemaVersion) && manifest.schemaVersion > SCHEMA_VERSION)) {
    throw new AppError('backup.newerVersion', { code: 'backup/newer' });
  }
}

/**
 * Opens an archive: its structure, its manifest, its versions and its
 * metadata. Items and images are checked by `verifyFullBackup`.
 */
export async function openFullBackup(file) {
  let reader;
  let directory;
  try {
    reader = await ZipReader.open(file);
    directory = await scanDirectory(reader);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw corrupt('backup/unreadable', { cause: error });
  }
  const base = { file, reader, small: directory.small, mediaEntries: directory.mediaEntries, entryCount: directory.total };
  if (!directory.small.has(paths.manifest)) throw new AppError('backup.notFullBackup', { code: 'backup/not-full' });
  const manifestBytes = await readSmall(base, paths.manifest, READ_LIMITS.manifestBytes, 'backup/manifest');
  const manifest = parseJsonEntry(manifestBytes, 'backup/manifest');
  assertReadable(manifest);
  const manifestHash = await sha256Hex(manifestBytes);
  return manifest.backupFormatVersion === 1
    ? readV1Backup({ ...base, manifest, manifestHash })
    : readV2Backup({ ...base, manifest, manifestHash });
}

async function restoreKeyFor(fingerprint) {
  return `rk${(await sha256Hex(encoder.encode(fingerprint))).slice(0, 24)}`;
}

// ── version 2 ──────────────────────────────────────────────────────────────

function sequenceList(list, pattern, max, what) {
  if (!Array.isArray(list) || list.length > max) throw corrupt(`backup/${what}`);
  list.forEach((d, index) => {
    const match = typeof d?.path === 'string' && pattern.exec(d.path);
    if (!match || Number(match[1]) !== index + 1 || d.sequence !== index + 1
      || !Number.isInteger(d.count) || d.count < 0 || !Number.isInteger(d.size) || d.size < 0
      || typeof d.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(d.sha256)) {
      throw corrupt(`backup/${what}`);
    }
  });
  return list;
}

async function readV2Backup(archive) {
  const { manifest } = archive;
  const counts = manifest.counts || {};
  const chunks = sequenceList(manifest.itemChunks, V2_PATH.itemChunk, READ_LIMITS.itemChunks, 'chunk-count');
  const parts = sequenceList(manifest.mediaManifests, V2_PATH.mediaManifest, READ_LIMITS.mediaManifests, 'media-manifest');
  if (chunks.length !== counts.itemChunks || parts.length !== counts.mediaManifests) throw integrity('backup/chunk-count');
  if (chunks.reduce((sum, c) => sum + c.count, 0) !== counts.items) throw integrity('backup/count');
  for (const chunk of chunks) {
    if (chunk.size > READ_LIMITS.chunkBytes) throw corrupt('backup/entry-too-large', { entry: chunk.path });
  }

  // Every small entry is one the manifest names — and every one it names is
  // there. Anything else in the archive is refused, not ignored.
  const expected = new Set([paths.manifest, paths.metadata, ...chunks.map((c) => c.path), ...parts.map((p) => p.path)]);
  for (const name of archive.small.keys()) {
    if (!expected.has(name)) throw corrupt(/^[\w./-]+$/.test(name) ? 'backup/unexpected-entry' : 'backup/unsafe-path', { entry: name });
  }
  for (const name of expected) if (!archive.small.has(name)) throw corrupt('backup/missing-entry', { entry: name });
  const mediaCount = Number(counts.media) || 0;
  if (!Number.isInteger(counts.media) || counts.media < 0 || archive.mediaEntries < mediaCount) throw integrity('backup/media-count');

  // metadata.json, one bounded object.
  const descriptor = manifest.metadata || {};
  const entry = archive.small.get(paths.metadata);
  if (entry.size !== BigInt(descriptor.size ?? -1)) throw integrity('backup/metadata-checksum');
  const metadataBytes = await readSmall(archive, paths.metadata, READ_LIMITS.metadataBytes, 'backup/metadata');
  if (await sha256Hex(metadataBytes) !== descriptor.sha256) throw integrity('backup/metadata-checksum');
  const rawMetadata = parseJsonEntry(metadataBytes, 'backup/metadata');
  if (Number.isInteger(rawMetadata?.schemaVersion) && rawMetadata.schemaVersion > SCHEMA_VERSION) throw new AppError('backup.newerVersion', { code: 'backup/newer' });
  // Every record whole, or the backup is refused (backup-validate.js).
  const metadata = validateBackupMetadata(rawMetadata);
  for (const name of ['categories', 'fieldDefinitions', 'folders', 'locations']) {
    if (!Array.isArray(rawMetadata?.[name]) || rawMetadata[name].length !== counts[name]) throw integrity('backup/count');
  }

  const fingerprint = `full2:${manifest.backupId}:${archive.manifestHash}`;
  return {
    ...archive,
    version: 2,
    fingerprint,
    restoreKey: await restoreKeyFor(fingerprint),
    metadata,
    itemChunks: chunks,
    mediaManifests: parts,
    integrityStatus: manifest.integrityStatus === 'complete' ? 'complete' : 'degraded',
    stats: {
      items: counts.items,
      folders: metadata.folders.length,
      categories: metadata.categories.length,
      fieldDefinitions: metadata.fieldDefinitions.length,
      locations: metadata.locations.length,
      media: mediaCount,
      missingMedia: Number(counts.missingMedia) || 0,
    },
    warnings: [],
    warningCount: 0,
    verified: false,
  };
}

/** One item chunk, read, checked against its descriptor, parsed. */
async function readItemChunk(archive, chunk) {
  const entry = archive.small.get(chunk.path);
  if (!entry || entry.size !== BigInt(chunk.size)) throw integrity('backup/chunk-checksum', { entry: chunk.path });
  const bytes = await archive.reader.read(entry);
  if (await sha256Hex(bytes) !== chunk.sha256) throw integrity('backup/chunk-checksum', { entry: chunk.path });
  let records;
  try {
    records = [...parseNdjson(bytes)];
  } catch (error) {
    throw corrupt('backup/chunk-malformed', { entry: chunk.path, cause: error });
  }
  if (records.length !== chunk.count) throw integrity('backup/chunk-count', { entry: chunk.path });
  return records;
}

/** One media manifest part, read, checked, parsed. */
async function readMediaManifest(archive, part) {
  const entry = archive.small.get(part.path);
  if (!entry || entry.size !== BigInt(part.size) || part.size > READ_LIMITS.mediaManifestBytes) throw integrity('backup/media-manifest', { entry: part.path });
  const bytes = await archive.reader.read(entry);
  if (await sha256Hex(bytes) !== part.sha256) throw integrity('backup/media-manifest', { entry: part.path });
  let lines;
  try { lines = [...parseNdjson(bytes, { maxLineBytes: 64 * 1024 })]; } catch (error) { throw corrupt('backup/media-manifest', { cause: error }); }
  if (lines.length !== part.count) throw integrity('backup/media-manifest', { entry: part.path });
  return lines;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** A media descriptor is exactly the shape the writer produces, or refused. */
function checkDescriptor(d, expectedSequence) {
  if (!d || typeof d.id !== 'string' || !d.id || d.id.length > 128) throw corrupt('backup/media-manifest');
  if (d.missing === true) return false;
  const extension = MEDIA_EXTENSIONS[d.mimeType] || 'bin';
  if (d.sequence !== expectedSequence || d.path !== paths.mediaOriginal(d.sequence, d.mimeType)
    || !d.path.endsWith(`.${extension}`) || !Number.isInteger(d.size) || d.size < 0 || d.size > READ_LIMITS.mediaBytes
    || !HEX64.test(d.sha256 || '')) {
    throw corrupt('backup/media-manifest');
  }
  if (d.thumbnailPath != null && (d.thumbnailPath !== paths.mediaThumbnail(d.sequence)
    || !Number.isInteger(d.thumbnailSize) || d.thumbnailSize < 0 || d.thumbnailSize > READ_LIMITS.mediaBytes || !HEX64.test(d.thumbnailSha256 || ''))) {
    throw corrupt('backup/media-manifest');
  }
  return true;
}

/** The media descriptors of a version 2 backup, in order, one part at a time. */
async function* v2Descriptors(archive) {
  let sequence = 0;
  for (const part of archive.mediaManifests) {
    for (const d of await readMediaManifest(archive, part)) {
      if (checkDescriptor(d, sequence + 1)) sequence += 1;
      yield d;
    }
  }
}

/**
 * The images of a version 2 backup, each with its directory entries, walked
 * in lockstep with the directory. `from` skips images already handled by an
 * interrupted restore (the walk still passes them, reading only headers).
 */
async function* v2Media(archive, { from = 0 } = {}) {
  const directory = archive.reader.entries();
  const nextMedia = async () => {
    for (;;) {
      const { value, done } = await directory.next();
      if (done) return null;
      if (value.name.startsWith('media/')) return value;
    }
  };
  let index = 0;
  try {
    for await (const d of v2Descriptors(archive)) {
      if (d.missing === true) continue;
      const original = await nextMedia();
      if (!original || original.name !== d.path || original.size !== BigInt(d.size)) throw new AppError('backup.missingImage', { code: 'backup/missing-image', mediaId: d.id });
      let thumbnail = null;
      if (d.thumbnailPath) {
        thumbnail = await nextMedia();
        if (!thumbnail || thumbnail.name !== d.thumbnailPath || thumbnail.size !== BigInt(d.thumbnailSize)) throw new AppError('backup.missingImage', { code: 'backup/missing-image', mediaId: d.id });
      }
      if (index >= from) yield { index, descriptor: d, original, thumbnail };
      index += 1;
    }
    // Nothing in the archive's media/ that no descriptor accounts for.
    if (await nextMedia()) throw corrupt('backup/unexpected-entry');
  } finally {
    await directory.return?.();
  }
}

// ── version 1 ──────────────────────────────────────────────────────────────

/**
 * A version 1 backup keeps everything but the images in one data.json, parsed
 * whole — so it keeps version 1's ceilings. It is otherwise restored through
 * the same streaming restore as version 2, from the parsed records.
 */
async function readV1Backup(archive) {
  const { manifest } = archive;
  if (!archive.small.has('data.json')) throw new AppError('backup.notFullBackup', { code: 'backup/not-full' });
  for (const name of archive.small.keys()) {
    if (name !== 'data.json' && name !== paths.manifest) throw corrupt('backup/unexpected-entry', { entry: name });
  }
  const limit = isNative() ? READ_LIMITS.v1DataBytes.native : READ_LIMITS.v1DataBytes.web;
  const dataBytes = await readSmall(archive, 'data.json', limit, 'backup/data');
  if (!manifest.data?.sha256 || await sha256Hex(dataBytes) !== manifest.data.sha256) throw integrity('backup/data-checksum');
  const raw = parseJsonEntry(dataBytes, 'backup/data');
  const checked = validateImport(raw);
  if (!checked.ok) throw corrupt('backup/invalid', { details: checked.errors });
  if (Number.isInteger(manifest.counts?.items) && (raw.items || []).length !== manifest.counts.items) throw integrity('backup/count');

  // Version 1 names images by their ids; it is bounded (65,000 entries), so
  // its media entries are simply collected by name.
  const media = Array.isArray(manifest.media) ? manifest.media : [];
  const mediaByPath = new Map();
  for await (const entry of archive.reader.entries()) {
    if (!entry.name.startsWith('media/')) continue;
    if (mediaByPath.has(entry.name)) throw corrupt('backup/duplicate-entry', { entry: entry.name });
    mediaByPath.set(entry.name, entry);
  }
  const listed = new Set();
  for (const d of media) {
    if (!d || typeof d.id !== 'string' || typeof d.path !== 'string' || !HEX64.test(d.sha256 || '')) throw corrupt('backup/media-manifest');
    for (const p of [d.path, d.thumbnailPath].filter(Boolean)) {
      if (!mediaByPath.has(p)) throw new AppError('backup.missingImage', { code: 'backup/missing-image', mediaId: d.id });
      listed.add(p);
    }
  }
  if (listed.size !== mediaByPath.size) throw corrupt('backup/unexpected-entry');

  const fingerprint = `full:${archive.manifestHash}`;
  const assets = new Map((Array.isArray(raw.mediaAssets) ? raw.mediaAssets : []).map((a) => [a?.id, a]));
  // The raw records: each is validated whole when its chunk is read, exactly
  // as a version 2 chunk is — never dropped by the general import rules.
  const items = Array.isArray(raw.items) ? raw.items : [];
  const v1Metadata = validateBackupMetadata(raw);
  const chunkSize = 2000;
  return {
    ...archive,
    version: 1,
    fingerprint,
    restoreKey: await restoreKeyFor(fingerprint),
    metadata: v1Metadata,
    // The parsed records, cut into the same chunks the restore writes.
    v1: { items, media, mediaByPath, assets, missingMedia: Array.isArray(manifest.missingMedia) ? manifest.missingMedia : [], chunkSize },
    itemChunks: Array.from({ length: Math.ceil(items.length / chunkSize) }, (_, i) => ({ sequence: i + 1, count: Math.min(chunkSize, items.length - i * chunkSize) })),
    integrityStatus: (manifest.missingMedia || []).length ? 'degraded' : 'complete',
    stats: {
      ...checked.stats,
      items: items.length,
      folders: v1Metadata.folders.length,
      categories: v1Metadata.categories.length,
      fieldDefinitions: v1Metadata.fieldDefinitions.length,
      locations: v1Metadata.locations.length,
      media: media.length,
      missingMedia: (manifest.missingMedia || []).length,
    },
    warnings: [],
    warningCount: 0,
    verified: false,
  };
}

async function* v1Descriptors(archive) {
  for (const d of archive.v1.media) {
    yield {
      id: d.id, path: d.path, mimeType: d.mimeType, size: d.size, sha256: d.sha256,
      thumbnailPath: d.thumbnailPath, thumbnailType: d.thumbnailType, thumbnailSize: d.thumbnailSize, thumbnailSha256: d.thumbnailSha256,
      asset: archive.v1.assets.get(d.id) || null,
    };
  }
  for (const id of archive.v1.missingMedia) if (typeof id === 'string' && id) yield { id, missing: true };
}

async function* v1Media(archive, { from = 0 } = {}) {
  let index = 0;
  for await (const d of v1Descriptors(archive)) {
    if (d.missing) continue;
    if (index >= from) {
      yield {
        index,
        descriptor: d,
        original: archive.v1.mediaByPath.get(d.path),
        thumbnail: d.thumbnailPath ? archive.v1.mediaByPath.get(d.thumbnailPath) : null,
      };
    }
    index += 1;
  }
}

// ── one interface for both ─────────────────────────────────────────────────

/** Media descriptors (missing ones included), in backup order. */
export function mediaDescriptors(archive) {
  return archive.version === 1 ? v1Descriptors(archive) : v2Descriptors(archive);
}

/** Images with their archive entries, in backup order, from `from`. */
export function mediaEntries(archive, options) {
  return archive.version === 1 ? v1Media(archive, options) : v2Media(archive, options);
}

/**
 * The records of one chunk, normalized exactly as the restore will write
 * them. `sequence` is 1-based.
 */
export async function readItems(archive, sequence) {
  const context = archive.context || (archive.context = backupItemContext(archive.metadata));
  const records = archive.version === 1
    ? archive.v1.items.slice((sequence - 1) * archive.v1.chunkSize, sequence * archive.v1.chunkSize)
    : await readItemChunk(archive, archive.itemChunks[sequence - 1]);
  // A record that would not be restored whole refuses the backup: a Full
  // Restore never skips (backup-validate.js).
  const items = records.map((raw) => validateBackupItem(raw, context));
  return { items, skipped: 0, warnings: [] };
}

/** One image's bytes from the archive, checked against its descriptor. */
export async function readMediaBytes(archive, entry, { size, sha256 }) {
  if (!entry || entry.size !== BigInt(size)) throw new AppError('backup.corruptImage', { code: 'backup/image-checksum' });
  const bytes = await archive.reader.read(entry);
  if (bytes.length !== size || await sha256Hex(bytes) !== sha256) throw new AppError('backup.corruptImage', { code: 'backup/image-checksum' });
  return bytes;
}

// ── verification ───────────────────────────────────────────────────────────

/**
 * Verifies every piece of an opened backup and builds its restore index.
 * Nothing in the inventory is touched. On any failure the backup is refused
 * and its partial index removed.
 *
 * @param {{onProgress?: Function, signal?: AbortSignal, keepKeys?: string[]}} options
 *   `keepKeys` are restore keys that must survive (an unfinished restore's).
 */
export async function verifyFullBackup(archive, { onProgress = () => {}, signal, keepKeys = [] } = {}) {
  const key = archive.restoreKey;
  await restoreIndex.clearExcept(new Set([...keepKeys, key]));
  await restoreIndex.clear(key);
  const report = (phase, extra = {}) => onProgress({ phase, ...extra });
  try {
    // ── the small collections, with no repeated id ──
    report('metadata');
    for (const name of ['categories', 'fieldDefinitions', 'folders', 'locations']) {
      const ids = archive.metadata[name].map((record) => record.id);
      if ((await restoreIndex.markMany(key, name, ids)).length) throw corrupt('backup/duplicate-entry', { collection: name });
    }

    // ── the media manifests: every image once ──
    let media = 0;
    let missing = 0;
    let mediaBytes = 0;
    let batch = [];
    let missingBatch = [];
    const flush = async () => {
      if ((await restoreIndex.markMany(key, 'media', batch)).length) throw corrupt('backup/duplicate-entry', { collection: 'media' });
      if ((await restoreIndex.markMany(key, 'media-missing', missingBatch)).length) throw corrupt('backup/duplicate-entry', { collection: 'media' });
      batch = [];
      missingBatch = [];
    };
    for await (const d of mediaDescriptors(archive)) {
      if (d.missing === true) { missing += 1; missingBatch.push(d.id); } else {
        media += 1;
        mediaBytes += (d.size || 0) + (d.thumbnailSize || 0);
        batch.push(d.id);
      }
      if (batch.length + missingBatch.length >= 1000) { checkAbort(signal); await flush(); }
    }
    await flush();
    if (media !== archive.stats.media || missing !== archive.stats.missingMedia) throw integrity('backup/media-count');

    // ── every item chunk ──
    let items = 0;
    let largestChunk = 0;
    const total = archive.stats.items;
    report('items', { done: 0, total });
    for (const chunk of archive.itemChunks) {
      checkAbort(signal);
      const read = await readItems(archive, chunk.sequence);
      largestChunk = Math.max(largestChunk, read.items.length);
      for (const warning of read.warnings) {
        archive.warningCount += 1;
        if (archive.warnings.length < WARNING_SAMPLE) archive.warnings.push(warning);
      }
      const ids = read.items.map((item) => item.id);
      if ((await restoreIndex.markMany(key, 'items', ids)).length) throw corrupt('backup/duplicate-entry', { collection: 'items' });
      const referenced = read.items.flatMap((item) => mediaIdsOf(item));
      const present = await restoreIndex.presentIn(key, ['media', 'media-missing'], referenced);
      if (referenced.some((id) => !present.has(id))) throw new AppError('backup.missingImage', { code: 'backup/unlisted-image' });
      items += read.items.length;
      report('items', { done: items, total });
    }
    if (items !== total) throw integrity('backup/count');

    // ── every image's bytes ──
    let checked = 0;
    report('media', { done: 0, total: media });
    for await (const { descriptor: d, original, thumbnail } of mediaEntries(archive)) {
      checkAbort(signal);
      await readMediaBytes(archive, original, { size: d.size, sha256: d.sha256 });
      if (d.thumbnailPath) await readMediaBytes(archive, thumbnail, { size: d.thumbnailSize, sha256: d.thumbnailSha256 });
      checked += 1;
      report('media', { done: checked, total: media });
    }
    if (checked !== media) throw integrity('backup/media-count');

    archive.verified = true;
    archive.verification = {
      items,
      // A Full Restore never skips a record: one that would not survive whole
      // refuses the backup (backup-validate.js). Kept for older callers.
      skipped: 0,
      media,
      missingMedia: missing,
      mediaBytes,
      itemBytes: archive.version === 2 ? archive.itemChunks.reduce((sum, c) => sum + c.size, 0) : 0,
      largestChunkRecords: largestChunk,
      appVersion: APP_VERSION,
    };
    return archive.verification;
  } catch (error) {
    await restoreIndex.clear(key).catch(() => {});
    throw error;
  }
}
