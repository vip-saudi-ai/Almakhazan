// Writing a Full Backup (format version 2) — see backup-format.js for the
// layout. The whole of it is a stream: records are read from the device
// database a page at a time and cut into chunks, images are read and written
// one at a time, and the archive goes to its destination as it is produced.
// Nothing here ever holds the inventory, the list of its images, or the file.
//
//   memory at any moment ≈ one item chunk (≤ 4 MiB of JSON, ≤ 2,000 records)
//                        + one image (original or thumbnail)
//                        + one media manifest part (≤ 5,000 short lines)
//                        + the descriptors of the item chunks and manifest
//                          parts (one short object each — ~50 for 100,000
//                          records)
//
// Which images go in is decided by the records actually written: each chunk's
// image references are added to a scratch index on disk (`workIndex`, under
// this run's key) as the chunk is written, and the images are then read in
// that index's order. The media in a backup therefore always agree with its
// records — an image a record references and the device no longer holds is
// declared in the backup (`missing`) and the backup is marked `degraded`,
// never silently presented as whole.

import { APP_VERSION, FULL_BACKUP_LIMITS, SCHEMA_VERSION, TAXONOMY_SCHEMA_VERSION } from './config.js';
import * as local from './local-store.js';
import { mediaIdsOf } from './media.js';
import { availableDiskSpace, isNative, nativeFileStream, saveFile } from './platform.js';
import { AppError, uid } from './utils.js';
import { Zip64Writer } from './zip64.js';
import { INDEX_ONLY_FIELDS } from './item-index.js';
import { BUILTIN_CATALOG_DATA_VERSION, CATALOG_SCHEMA_VERSION } from './catalog/model.js';
import {
  BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BACKUP_MIME, CHUNK_LIMITS, READ_LIMITS,
  backupFilename, paths, sha256Hex,
} from './backup-format.js';

const encoder = new TextEncoder();
const NEWLINE = encoder.encode('\n');
/** Bytes per bridge call; each is Base64-encoded on its own, never the file. */
const BRIDGE_SLICE = 384 * 1024;
/** Missing image ids named in the root manifest; the full list is in the media manifests. */
const MISSING_SAMPLE = 1000;

// ── where the bytes go ─────────────────────────────────────────────────────

function base64Of(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Collects small writes (headers, records) into slices of a bounded size. */
class Coalescer {
  constructor(size, flush) {
    this.buffer = new Uint8Array(size);
    this.used = 0;
    this.flushTo = flush;
  }

  async write(bytes) {
    let at = 0;
    while (at < bytes.length) {
      const take = Math.min(bytes.length - at, this.buffer.length - this.used);
      this.buffer.set(bytes.subarray(at, at + take), this.used);
      this.used += take;
      at += take;
      if (this.used === this.buffer.length) await this.flush();
    }
  }

  async flush() {
    if (!this.used) return;
    const slice = this.buffer.slice(0, this.used);
    this.used = 0;
    await this.flushTo(slice);
  }
}

/**
 * Written to a temporary file by the native app, a slice at a time. Closing
 * asks the app to finish the file and hand it to the share sheet; it resolves
 * only once the system has taken it, and rejects if the customer cancels.
 */
class NativeStreamSink {
  constructor(stream, filename) {
    this.stream = stream;
    this.filename = filename;
    this.handle = null;
    this.buffer = new Coalescer(BRIDGE_SLICE, (bytes) => this.stream.append(this.handle, base64Of(bytes)));
  }

  async open() { this.handle = await this.stream.begin(this.filename, BACKUP_MIME); }
  write(bytes) { return this.buffer.write(bytes); }

  async close() {
    await this.buffer.flush();
    await this.stream.finish(this.handle);
  }

  async abort() { if (this.handle) await this.stream.abort(this.handle); }
}

/**
 * A Blob built from bounded Blob parts; the browser may keep those outside the
 * page's heap. Handed to the download (web) or, in a native build without the
 * streaming bridge, to the one-piece share call — hence that path's limit.
 */
class BlobSink {
  constructor(filename) {
    this.filename = filename;
    this.parts = [];
    this.buffer = new Coalescer(1024 * 1024, async (bytes) => { this.parts.push(new Blob([bytes])); });
  }

  async open() {}
  write(bytes) { return this.buffer.write(bytes); }

  async close() {
    await this.buffer.flush();
    const blob = new Blob(this.parts, { type: BACKUP_MIME });
    this.parts = [];
    await saveFile(blob, this.filename);
  }

  async abort() { this.parts = []; }
}

/**
 * The destination this device writes a backup to, and how large it may be.
 * The native streaming path has no container limit (ZIP64) — only the disk.
 */
export function backupPath() {
  const stream = nativeFileStream();
  if (stream) return { kind: 'nativeStream', limit: FULL_BACKUP_LIMITS.nativeStream, sink: (name) => new NativeStreamSink(stream, name) };
  if (isNative()) return { kind: 'nativeSingle', limit: FULL_BACKUP_LIMITS.nativeSingle, sink: (name) => new BlobSink(name) };
  return { kind: 'download', limit: FULL_BACKUP_LIMITS.download, sink: (name) => new BlobSink(name) };
}

// ── estimating before starting ─────────────────────────────────────────────

/** Roughly how large the backup will be: image sizes from their asset rows,
 *  plus a generous allowance per record. Read a page at a time. */
export async function estimateBackupBytes({ itemCount }) {
  let media = 0;
  await local.walk('mediaAssets', {
    batchSize: 1000,
    onBatch: (rows) => { for (const asset of rows) media += Number(asset.fileSize) || 0; return true; },
  });
  // Thumbnails and ZIP headers: about a tenth again.
  return Math.ceil(media * 1.1 + itemCount * 4096 + 1024 * 1024);
}

async function assertRoomFor(path, estimate) {
  if (path.limit != null && estimate > path.limit) {
    throw new AppError('backup.tooLarge', {
      code: 'backup/too-large', size: Math.ceil(estimate / 1048576), limit: Math.floor(path.limit / 1048576),
    });
  }
  // The native app writes a temporary file before handing it over.
  if (path.kind === 'nativeStream') {
    const free = await availableDiskSpace();
    if (free != null && free < estimate * 1.1) throw new AppError('backup.noSpaceBackup', { code: 'backup/no-space' });
  }
}

// ── the pieces ─────────────────────────────────────────────────────────────

/**
 * Records into chunks of at most `itemsPerChunk` records and `chunkBytes`
 * bytes. A chunk is written the moment it is full; only its descriptor stays.
 */
class ItemChunkWriter {
  constructor(zip) {
    this.zip = zip;
    this.lines = [];
    this.bytes = 0;
    this.chunks = [];
    this.count = 0;
    this.totalBytes = 0;
    this.largestChunk = 0;
  }

  async add(stored) {
    // Derived index fields are the device's, recomputed wherever a record is
    // stored (item-index.js); the backup carries the record, not its indexes.
    const item = { ...stored };
    for (const field of INDEX_ONLY_FIELDS) delete item[field];
    const line = encoder.encode(JSON.stringify(item));
    if (line.length > READ_LIMITS.itemBytes) {
      throw new AppError('backup.itemTooLarge', { code: 'backup/item-too-large', itemId: item.id });
    }
    if (this.lines.length && (this.lines.length >= CHUNK_LIMITS.itemsPerChunk || this.bytes + line.length + 1 > CHUNK_LIMITS.chunkBytes)) {
      await this.flush();
    }
    this.lines.push(line);
    this.bytes += line.length + 1;
  }

  async flush() {
    if (!this.lines.length) return;
    const bytes = new Uint8Array(this.bytes);
    let at = 0;
    for (const line of this.lines) { bytes.set(line, at); at += line.length; bytes.set(NEWLINE, at); at += 1; }
    const sequence = this.chunks.length + 1;
    const path = paths.itemChunk(sequence);
    const descriptor = { path, sequence, count: this.lines.length, size: bytes.length, sha256: await sha256Hex(bytes) };
    await this.zip.add(path, bytes);
    this.chunks.push(descriptor);
    this.count += this.lines.length;
    this.totalBytes += bytes.length;
    this.largestChunk = Math.max(this.largestChunk, bytes.length);
    this.lines = [];
    this.bytes = 0;
  }
}

/** Media descriptors into NDJSON manifest parts, each written when full. */
class MediaManifestWriter {
  constructor(zip) {
    this.zip = zip;
    this.lines = [];
    this.bytes = 0;
    this.parts = [];
  }

  async add(descriptor) {
    const line = encoder.encode(JSON.stringify(descriptor));
    if (this.lines.length >= CHUNK_LIMITS.mediaPerManifest || this.bytes + line.length + 1 > READ_LIMITS.mediaManifestBytes / 2) {
      await this.flush();
    }
    this.lines.push(line);
    this.bytes += line.length + 1;
  }

  async flush() {
    if (!this.lines.length) return;
    const bytes = new Uint8Array(this.bytes);
    let at = 0;
    for (const line of this.lines) { bytes.set(line, at); at += line.length; bytes.set(NEWLINE, at); at += 1; }
    const sequence = this.parts.length + 1;
    const path = paths.mediaManifest(sequence);
    this.parts.push({ path, sequence, count: this.lines.length, size: bytes.length, sha256: await sha256Hex(bytes) });
    await this.zip.add(path, bytes);
    this.lines = [];
    this.bytes = 0;
  }
}

/** An asset row as it travels: its description, not this device's counters. */
function portableAsset(asset) {
  if (!asset) return null;
  const { refCount, orphanedAt, storagePath, thumbnailPath, url, thumbnailUrl, ...rest } = asset;
  return rest;
}

async function hashed(path, bytes, zip) {
  const sha256 = await sha256Hex(bytes);
  await zip.add(path, bytes);
  return sha256;
}

// ── the backup ─────────────────────────────────────────────────────────────

/**
 * Writes one version 2 Full Backup.
 *
 * @param {{onProgress?: Function, purpose?: 'backup'|'safety', sink?: object,
 *          itemCount?: number}} options
 *   `sink` replaces the device's destination (used by the tests to keep the
 *   file in the page); it must implement open/write/close/abort.
 * @returns {Promise<object>} what was written — counts, sizes, integrity, and
 *   the measurements the tests report (largest chunk, records held at once).
 */
export async function writeBackupV2({ onProgress = () => {}, purpose = 'backup', sink: customSink = null, itemCount = 0 } = {}) {
  const run = uid('bk');
  const report = (phase, extra = {}) => onProgress({ phase, ...extra });
  report('preparing');

  // The small collections: classification, field definitions, places,
  // folders. Read from the database itself, not from the page's copy.
  const [categories, fieldDefinitions, folders, locations, catalogEntities] = await Promise.all([
    local.getAll('categories'), local.getAll('fieldDefinitions'), local.getAll('folders'), local.getAll('locations'),
    local.getAll('catalogEntities'),
  ]);
  const metadata = {
    format: 'nazm-metadata',
    schemaVersion: SCHEMA_VERSION,
    taxonomy: { schemaVersion: TAXONOMY_SCHEMA_VERSION },
    categories, fieldDefinitions, folders, locations,
    // The customer's own catalog entries, in full. The bundled catalog is
    // not copied: items keep each selection's id and a display snapshot,
    // which is enough to read them under any catalog version.
    catalogEntities,
    catalog: { schemaVersion: CATALOG_SCHEMA_VERSION, catalogDataVersion: BUILTIN_CATALOG_DATA_VERSION },
  };
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  if (metadataBytes.length > READ_LIMITS.metadataBytes) throw new AppError('backup.metadataTooLarge', { code: 'backup/metadata-too-large' });

  const path = customSink ? { kind: 'custom', limit: null } : backupPath();
  if (!customSink) await assertRoomFor(path, await estimateBackupBytes({ itemCount }));

  const filename = backupFilename(purpose);
  const sink = customSink || path.sink(filename);
  await sink.open();
  const zip = new Zip64Writer(sink, { maxEntries: READ_LIMITS.entries });
  const items = new ItemChunkWriter(zip);
  const manifests = new MediaManifestWriter(zip);
  const missing = [];
  let missingCount = 0;
  let mediaCount = 0;
  let mediaBytes = 0;
  let largestBatch = 0;

  try {
    await zip.add(paths.metadata, metadataBytes);
    const metadataHash = await sha256Hex(metadataBytes);

    // ── records, in primary-key order, a page at a time ──
    report('items', { done: 0, total: itemCount });
    await local.walk('items', {
      batchSize: 500,
      onBatch: async (batch) => {
        largestBatch = Math.max(largestBatch, batch.length);
        const referenced = new Set();
        for (const item of batch) {
          await items.add(item);
          for (const id of mediaIdsOf(item)) referenced.add(id);
        }
        if (referenced.size) {
          await local.transaction('workIndex', 'readwrite', async ({ workIndex }) => {
            for (const id of referenced) await local.request(workIndex.put({ run, kind: 'media', id }));
          });
        }
        report('items', { done: items.count + items.lines.length, total: itemCount });
        return true;
      },
    });
    await items.flush();

    // ── images, in the order of their ids, one at a time ──
    const mediaRange = local.prefixRange(run, 'media');
    const mediaTotal = await local.countFresh('workIndex', mediaRange);
    let after;
    let done = 0;
    report('media', { done, total: mediaTotal });
    for (;;) {
      const keys = await local.keysPage('workIndex', { range: mediaRange, after, limit: 200 });
      if (!keys.length) break;
      after = keys[keys.length - 1];
      for (const [, , id] of keys) {
        const [asset, record] = await Promise.all([local.get('mediaAssets', id), local.get('images', id)]);
        if (!record?.original) {
          await manifests.add({ id, missing: true });
          missingCount += 1;
          if (missing.length < MISSING_SAMPLE) missing.push(id);
        } else {
          mediaCount += 1;
          const original = new Uint8Array(record.original);
          const mimeType = record.originalType || asset?.mimeType || 'image/jpeg';
          const descriptor = {
            sequence: mediaCount,
            id,
            path: paths.mediaOriginal(mediaCount, mimeType),
            mimeType,
            size: original.length,
            sha256: await hashed(paths.mediaOriginal(mediaCount, mimeType), original, zip),
            asset: portableAsset(asset),
          };
          mediaBytes += original.length;
          if (record.thumbnail) {
            const thumbnail = new Uint8Array(record.thumbnail);
            descriptor.thumbnailPath = paths.mediaThumbnail(mediaCount);
            descriptor.thumbnailType = record.thumbnailType || 'image/jpeg';
            descriptor.thumbnailSize = thumbnail.length;
            descriptor.thumbnailSha256 = await hashed(descriptor.thumbnailPath, thumbnail, zip);
            mediaBytes += thumbnail.length;
          }
          await manifests.add(descriptor);
        }
        done += 1;
        report('media', { done, total: mediaTotal, bytes: mediaBytes });
      }
      if (keys.length < 200) break;
    }
    await manifests.flush();

    // ── the manifest, last ──
    report('manifest');
    const integrityStatus = missingCount ? 'degraded' : 'complete';
    const manifest = {
      format: BACKUP_FORMAT,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      minReaderVersion: 2,
      backupId: uid('bkp'),
      backupType: purpose === 'safety' ? 'safety' : 'full',
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      databaseVersion: local.DATABASE_VERSION,
      taxonomySchemaVersion: TAXONOMY_SCHEMA_VERSION,
      integrityStatus,
      counts: {
        items: items.count,
        itemChunks: items.chunks.length,
        categories: categories.length,
        fieldDefinitions: fieldDefinitions.length,
        folders: folders.length,
        locations: locations.length,
        catalogEntities: catalogEntities.length,
        media: mediaCount,
        missingMedia: missingCount,
        mediaManifests: manifests.parts.length,
      },
      bytes: { items: items.totalBytes, media: mediaBytes, metadata: metadataBytes.length },
      chunking: { ...CHUNK_LIMITS },
      metadata: { path: paths.metadata, size: metadataBytes.length, sha256: metadataHash },
      itemChunks: items.chunks,
      mediaManifests: manifests.parts,
      // Referenced by a record, not on the device when this was made: the
      // first ones by name here, every one of them in the media manifests.
      missingMedia: missing,
    };
    const manifestBytes = encoder.encode(JSON.stringify(manifest));
    await zip.add(paths.manifest, manifestBytes);
    report('finalizing');
    const archive = await zip.finish();
    report('handoff');
    await sink.close();
    return {
      filename,
      backupId: manifest.backupId,
      integrityStatus,
      items: items.count,
      media: mediaCount,
      missing,
      missingCount,
      bytes: Number(archive.size),
      zip64: archive.zip64,
      itemChunks: items.chunks.length,
      largestChunkBytes: items.largestChunk,
      largestChunkRecords: items.chunks.reduce((max, chunk) => Math.max(max, chunk.count), 0),
      largestReadBatch: largestBatch,
    };
  } catch (error) {
    await sink.abort().catch(() => {});
    if (error instanceof AppError) throw error;
    // The share sheet was closed, or the app could not finish the file:
    // nothing was saved, and it is said as such.
    console.error('[backup] the backup was not completed', error);
    throw new AppError('backup.notSaved', { code: 'backup/handoff-failed', cause: error });
  } finally {
    await local.deleteKeyRange('workIndex', local.prefixRange(run)).catch((error) => {
      console.error('[backup] scratch index could not be cleared', error);
    });
  }
}
