// The Full Backup format, in one place: its versions, its layout, the size of
// the pieces it is cut into, and the limits a reader holds every piece to.
//
// Four versions travel in a backup and they mean different things:
//   backupFormatVersion   how the archive is laid out (this file)
//   schemaVersion         the shape of a record (config.js SCHEMA_VERSION)
//   databaseVersion       the device database that wrote it (local-store.js)
//   taxonomySchemaVersion the classification model (config.js)
// A reader refuses a layout newer than it knows, and a schema or taxonomy
// newer than this app, rather than flatten what it cannot understand.
//
// Layout of version 2:
//
//   metadata.json                  classification, field definitions, places,
//                                  folders — naturally small, one object
//   items/00000001.ndjson …        the records, one JSON object per line, in
//                                  chunks bounded by count AND by bytes
//   media/00000001.jpg             each image's original bytes, named by its
//   media/00000001.thumb.jpg       position in the backup, never by an id a
//                                  record once carried (ids are data; paths
//                                  must be safe)
//   manifests/media-000001.ndjson  one line per image: id, paths, sizes,
//                                  SHA-256s, its asset metadata — or a line
//                                  declaring an image the records reference but
//                                  the device no longer held
//   manifest.json                  written last, small: versions, counts, and
//                                  a SHA-256 for metadata, every item chunk and
//                                  every media manifest
//
// Why these chunk sizes. A chunk is parsed, hashed and written as one unit on
// the phone, so it is sized for that: at most 2,000 records and 4 MiB, the
// first reached. Typical records are 1–3 KB, so a chunk is usually ~2,000
// records and 2–6 MB of JSON — a few hundred milliseconds of work and a
// bounded amount of memory, and small enough that a restore interrupted in
// the middle of one repeats little. 100,000 records make ~50 chunks.

export const BACKUP_FORMAT = 'nazm-backup';
/** The layout this build writes. */
export const BACKUP_FORMAT_VERSION = 2;
/** The oldest layout this build still reads. */
export const MIN_SUPPORTED_BACKUP_FORMAT_VERSION = 1;
export const BACKUP_MIME = 'application/zip';
export const BACKUP_EXTENSION = 'nazmbackup';

export const CHUNK_LIMITS = Object.freeze({
  /** Records per item chunk, at most. */
  itemsPerChunk: 2000,
  /** Bytes of NDJSON per item chunk, at most (a single larger record still
   *  gets a chunk of its own, up to `itemBytes`). */
  chunkBytes: 4 * 1024 * 1024,
  /** Media descriptors per media manifest. */
  mediaPerManifest: 5000,
});

/**
 * What a reader accepts. These protect the parser from a malformed or hostile
 * file; none of them limits how large an inventory may be.
 */
export const READ_LIMITS = Object.freeze({
  manifestBytes: 16 * 1024 * 1024,
  metadataBytes: 64 * 1024 * 1024,
  itemBytes: 1024 * 1024,
  chunkBytes: 8 * 1024 * 1024,
  mediaManifestBytes: 8 * 1024 * 1024,
  /** One image's original, as stored — far above any photograph. */
  mediaBytes: 512 * 1024 * 1024,
  itemChunks: 1_000_000,
  mediaManifests: 1_000_000,
  entries: 5_000_000,
  /** Legacy (version 1) data.json, parsed whole: the old ceilings. */
  v1DataBytes: { web: 256 * 1024 * 1024, native: 64 * 1024 * 1024 },
});

export const MEDIA_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
  'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif', 'image/tiff': 'tiff', 'image/bmp': 'bmp',
});

const pad = (n, width) => String(n).padStart(width, '0');

export const paths = Object.freeze({
  manifest: 'manifest.json',
  metadata: 'metadata.json',
  itemChunk: (sequence) => `items/${pad(sequence, 8)}.ndjson`,
  mediaManifest: (sequence) => `manifests/media-${pad(sequence, 6)}.ndjson`,
  mediaOriginal: (sequence, mimeType) => `media/${pad(sequence, 8)}.${MEDIA_EXTENSIONS[mimeType] || 'bin'}`,
  mediaThumbnail: (sequence) => `media/${pad(sequence, 8)}.thumb.jpg`,
});

/** The shapes every path in a version 2 archive must have. */
export const V2_PATH = Object.freeze({
  itemChunk: /^items\/(\d{8})\.ndjson$/,
  mediaManifest: /^manifests\/media-(\d{6})\.ndjson$/,
  media: /^media\/(\d{8})\.(thumb\.jpg|[a-z0-9]{2,5})$/,
});

// ── JSON with no prototype surprises ───────────────────────────────────────

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

/** JSON.parse that drops the keys prototype pollution travels under. */
export function parseSafeJson(text) {
  return JSON.parse(text, (key, value) => (UNSAFE_KEYS.has(key) ? undefined : value));
}

export function decodeUtf8(bytes) {
  return strictDecoder.decode(bytes);
}

/**
 * The records of one NDJSON chunk, each parsed on its own. A blank final line
 * is the terminator; a blank line anywhere else is malformed.
 */
export function* parseNdjson(bytes, { maxLineBytes = READ_LIMITS.itemBytes } = {}) {
  const text = decodeUtf8(bytes);
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end);
    if (!line) throw new Error('empty line');
    if (line.length > maxLineBytes) throw new Error('line too long');
    yield parseSafeJson(line);
    start = end + 1;
  }
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A filename that sorts by time and does not collide within a day. */
export function backupFilename(purpose = 'backup', date = new Date()) {
  // The customer's own clock: the day in the name is the day they made it.
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
  const time = `${pad(date.getHours(), 2)}${pad(date.getMinutes(), 2)}${pad(date.getSeconds(), 2)}`;
  return `NAZM-${purpose === 'safety' ? 'Safety' : 'Backup'}-${day}-${time}.${BACKUP_EXTENSION}`;
}
