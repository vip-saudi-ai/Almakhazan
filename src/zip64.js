// The container of a Full Backup: a ZIP archive, stored (not deflated), with
// real ZIP64 structures once any offset, size or count leaves the range the
// classic format can express. Written as it is produced and read in slices,
// so neither side ever holds the archive.
//
// Offsets and sizes are BigInt inside this module. A number becomes a
// JavaScript Number only when it is proved to be a safe integer and an API
// needs one (Blob.slice). A classic 32-bit field is never trusted for a value
// that may have overflowed into its ZIP64 extra.
//
// What is refused, before anything is read beyond the directory:
//   · an end record that is missing, inconsistent, or points outside the file
//   · a ZIP64 locator or end record with a wrong signature or impossible range
//   · a directory whose entry count, size or records disagree with the end record
//   · an entry that is encrypted, compressed, or whose data lies outside the
//     file or overlaps the directory
//   · a path that is absolute, walks up, uses a backslash, a drive letter, a
//     control character or an empty segment
// Deciding which paths a backup may contain, and that none repeats, is the
// backup reader's job (see backup-reader.js); this module only guarantees
// that every name it hands over is a safe relative path.

import { AppError } from './utils.js';
import { crc32 } from './xlsx-writer.js';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_END64 = 0x06064b50;
const SIG_LOCATOR64 = 0x07064b50;
const ZIP64_EXTRA = 0x0001;

const MAX16 = 0xffff;
const MAX32 = 0xffffffff;
const BIG_MAX32 = 0xffffffffn;
const FLAG_UTF8 = 0x0800;
const VERSION_ZIP64 = 45;
const VERSION_CLASSIC = 20;

/** Longest path accepted in an archive, in bytes. */
export const ZIP_PATH_MAX = 255;

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

function zipError(code, extra = {}) {
  return new AppError('backup.corrupt', { code, ...extra });
}

/** A BigInt as a Number, refused unless exactly representable. */
export function toSafeNumber(value) {
  const big = BigInt(value);
  if (big < 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) throw zipError('backup/zip64-invalid');
  return Number(big);
}

/**
 * Whether a name is a safe relative path. Anything a naive extractor could be
 * tricked into writing outside its folder is refused, whatever the backup
 * format would later make of it.
 */
export function isSafeArchivePath(name) {
  if (typeof name !== 'string' || !name || encoder.encode(name).length > ZIP_PATH_MAX) return false;
  if (name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name)) return false;
  // Control characters and the Unicode direction overrides that can disguise one.
  if (/[\u0000-\u001f\u007f‪-‮⁦-⁩]/.test(name)) return false;
  return name.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function dosDateTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & MAX16;
  const day = (((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & MAX16;
  return { time, day };
}

function setU64(view, at, value) { view.setBigUint64(at, BigInt(value), true); }

/**
 * The central directory is a few dozen bytes per entry and is written last, so
 * it has to be kept until the end — for hundreds of thousands of images, tens
 * of megabytes. Where it is kept is a spool, any object with:
 *
 *   push(record: Uint8Array)          one directory record, in order
 *   size: bigint                      bytes pushed so far
 *   drainTo(write): Promise<void>     every record, in order, then empty
 *
 * The default moves records out of the page's heap into Blobs as it grows and
 * reads them back a Blob at a time (browsers may keep large Blobs on disk). A
 * spool backed by the origin-private file system, or by a temporary file in
 * the native app, can be passed to Zip64Writer without changing it.
 */
export class BlobDirectorySpool {
  constructor(flushBytes = 512 * 1024) {
    this.flushBytes = flushBytes;
    this.pending = [];
    this.pendingBytes = 0;
    this.blobs = [];
    this.size = 0n;
  }

  push(record) {
    this.pending.push(record);
    this.pendingBytes += record.length;
    this.size += BigInt(record.length);
    if (this.pendingBytes >= this.flushBytes) this.flush();
  }

  flush() {
    if (!this.pending.length) return;
    this.blobs.push(new Blob(this.pending));
    this.pending = [];
    this.pendingBytes = 0;
  }

  async drainTo(write) {
    this.flush();
    for (const blob of this.blobs) await write(new Uint8Array(await blob.arrayBuffer()));
    this.blobs = [];
  }
}

/**
 * A ZIP written entry by entry to a sink with `write(bytes)`.
 *
 * `startOffset` exists for the tests: it makes the writer believe the first
 * entry starts that far into the file, so the ZIP64 paths can be exercised
 * with a few kilobytes instead of a 4 GB fixture. Production never sets it.
 */
export class Zip64Writer {
  constructor(sink, { startOffset = 0n, date = new Date(), maxEntries = Infinity, spool = null } = {}) {
    this.sink = sink;
    this.offset = BigInt(startOffset);
    this.count = 0;
    this.maxEntries = maxEntries;
    this.spool = spool || new BlobDirectorySpool();
    this.usedZip64 = false;
    this.finished = false;
    Object.assign(this, dosDateTime(date));
  }

  /** Stores one entry. `bytes` is a Uint8Array held only for this call. */
  async add(path, bytes) {
    if (this.finished) throw new Error('archive already finished');
    if (!isSafeArchivePath(path)) throw zipError('backup/unsafe-path', { entry: path });
    if (this.count >= this.maxEntries) throw new AppError('backup.tooLarge', { code: 'backup/too-many' });
    const name = encoder.encode(path);
    const size = BigInt(bytes.length);
    const crc = crc32(bytes);
    const localOffset = this.offset;
    const bigSize = size >= BIG_MAX32;

    // The local header carries a ZIP64 extra only when the entry itself is
    // too large for 32 bits; its offset is recorded in the directory alone.
    const localExtra = bigSize ? 20 : 0;
    const head = new Uint8Array(30 + name.length + localExtra);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, SIG_LOCAL, true);
    hv.setUint16(4, bigSize ? VERSION_ZIP64 : VERSION_CLASSIC, true);
    hv.setUint16(6, FLAG_UTF8, true);
    hv.setUint16(8, 0, true);
    hv.setUint16(10, this.time, true);
    hv.setUint16(12, this.day, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, bigSize ? MAX32 : Number(size), true);
    hv.setUint32(22, bigSize ? MAX32 : Number(size), true);
    hv.setUint16(26, name.length, true);
    hv.setUint16(28, localExtra, true);
    head.set(name, 30);
    if (bigSize) {
      const at = 30 + name.length;
      hv.setUint16(at, ZIP64_EXTRA, true);
      hv.setUint16(at + 2, 16, true);
      setU64(hv, at + 4, size);
      setU64(hv, at + 12, size);
    }
    await this.sink.write(head);
    if (bytes.length) await this.sink.write(bytes);
    this.offset += BigInt(head.length) + size;

    // The directory record: every value that does not fit goes into the
    // ZIP64 extra, in the order the specification fixes (sizes, then offset).
    const bigOffset = localOffset >= BIG_MAX32;
    const extraValues = [];
    if (bigSize) extraValues.push(size, size);
    if (bigOffset) extraValues.push(localOffset);
    const extraLength = extraValues.length ? 4 + extraValues.length * 8 : 0;
    const zip64 = bigSize || bigOffset;
    if (zip64) this.usedZip64 = true;
    const record = new Uint8Array(46 + name.length + extraLength);
    const rv = new DataView(record.buffer);
    rv.setUint32(0, SIG_CENTRAL, true);
    rv.setUint16(4, VERSION_ZIP64, true);
    rv.setUint16(6, zip64 ? VERSION_ZIP64 : VERSION_CLASSIC, true);
    rv.setUint16(8, FLAG_UTF8, true);
    rv.setUint16(10, 0, true);
    rv.setUint16(12, this.time, true);
    rv.setUint16(14, this.day, true);
    rv.setUint32(16, crc, true);
    rv.setUint32(20, bigSize ? MAX32 : Number(size), true);
    rv.setUint32(24, bigSize ? MAX32 : Number(size), true);
    rv.setUint16(28, name.length, true);
    rv.setUint16(30, extraLength, true);
    rv.setUint32(42, bigOffset ? MAX32 : Number(localOffset), true);
    record.set(name, 46);
    if (extraLength) {
      let at = 46 + name.length;
      rv.setUint16(at, ZIP64_EXTRA, true);
      rv.setUint16(at + 2, extraValues.length * 8, true);
      at += 4;
      for (const value of extraValues) { setU64(rv, at, value); at += 8; }
    }
    this.spool.push(record);
    this.count += 1;
    return { offset: localOffset, size };
  }

  /**
   * The directory, then — when any count, size or offset needs it — the ZIP64
   * end record and its locator, then the classic end record with its
   * overflowing fields saturated as the specification requires.
   */
  async finish() {
    const directoryOffset = this.offset;
    const directorySize = this.spool.size;
    await this.spool.drainTo((bytes) => this.sink.write(bytes));
    this.offset += directorySize;

    const needs64 = this.usedZip64 || this.count >= MAX16
      || directorySize >= BIG_MAX32 || directoryOffset >= BIG_MAX32;
    if (needs64) {
      const end64Offset = this.offset;
      const end64 = new Uint8Array(56);
      const ev = new DataView(end64.buffer);
      ev.setUint32(0, SIG_END64, true);
      setU64(ev, 4, 44n);
      ev.setUint16(12, VERSION_ZIP64, true);
      ev.setUint16(14, VERSION_ZIP64, true);
      ev.setUint32(16, 0, true);
      ev.setUint32(20, 0, true);
      setU64(ev, 24, this.count);
      setU64(ev, 32, this.count);
      setU64(ev, 40, directorySize);
      setU64(ev, 48, directoryOffset);
      await this.sink.write(end64);
      this.offset += 56n;

      const locator = new Uint8Array(20);
      const lv = new DataView(locator.buffer);
      lv.setUint32(0, SIG_LOCATOR64, true);
      lv.setUint32(4, 0, true);
      setU64(lv, 8, end64Offset);
      lv.setUint32(16, 1, true);
      await this.sink.write(locator);
      this.offset += 20n;
    }

    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, SIG_END, true);
    // A value that fits keeps its real value here too, for readers that never
    // look at the ZIP64 record; one that does not is saturated.
    view.setUint16(8, Math.min(this.count, MAX16), true);
    view.setUint16(10, Math.min(this.count, MAX16), true);
    view.setUint32(12, directorySize >= BIG_MAX32 ? MAX32 : Number(directorySize), true);
    view.setUint32(16, directoryOffset >= BIG_MAX32 ? MAX32 : Number(directoryOffset), true);
    await this.sink.write(end);
    this.offset += 22n;
    this.finished = true;
    return { entries: this.count, size: this.offset, zip64: needs64 };
  }
}

// ── reading ────────────────────────────────────────────────────────────────

async function sliceBytes(file, start, end) {
  const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
  if (bytes.length !== end - start) throw zipError('backup/truncated');
  return bytes;
}

/** Walks the extra fields of a directory record for the ZIP64 one. */
function readZip64Extra(view, start, length, wanted) {
  let at = start;
  const end = start + length;
  while (at + 4 <= end) {
    const id = view.getUint16(at, true);
    const size = view.getUint16(at + 2, true);
    if (at + 4 + size > end) throw zipError('backup/zip64-invalid');
    if (id === ZIP64_EXTRA) {
      const values = [];
      let p = at + 4;
      for (let i = 0; i < wanted; i += 1) {
        if (p + 8 > at + 4 + size) throw zipError('backup/zip64-invalid');
        values.push(view.getBigUint64(p, true));
        p += 8;
      }
      return values;
    }
    at += 4 + size;
  }
  if (wanted) throw zipError('backup/zip64-invalid');
  return [];
}

/**
 * A ZIP read through `file.slice` — its end records once, its directory as a
 * stream, and one entry's bytes at a time.
 */
export class ZipReader {
  constructor(file, layout) {
    this.file = file;
    this.size = BigInt(file.size);
    Object.assign(this, layout);
  }

  static async open(file) {
    if (!file || file.size < 22) throw zipError('backup/not-archive');
    const size = BigInt(file.size);
    const tailLength = Math.min(file.size, 22 + MAX16);
    const tailStart = file.size - tailLength;
    const tail = await sliceBytes(file, tailStart, file.size);
    const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

    // The end record is the last signature whose comment length reaches
    // exactly to the end of the file — a signature-shaped run of bytes inside
    // an entry does not satisfy that.
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (view.getUint32(i, true) !== SIG_END) continue;
      if (i + 22 + view.getUint16(i + 20, true) === tail.length) { end = i; break; }
    }
    if (end < 0) throw zipError('backup/not-archive');
    if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw zipError('backup/multi-disk');

    let count = BigInt(view.getUint16(end + 10, true));
    let directorySize = BigInt(view.getUint32(end + 12, true));
    let directoryOffset = BigInt(view.getUint32(end + 16, true));
    let limit = BigInt(tailStart + end);
    let zip64 = false;

    const locatorAt = end - 20;
    const hasLocator = locatorAt >= 0 && view.getUint32(locatorAt, true) === SIG_LOCATOR64;
    const saturated = count === 0xffffn || directorySize === BIG_MAX32 || directoryOffset === BIG_MAX32
      || view.getUint16(end + 8, true) === MAX16;
    if (hasLocator || saturated) {
      if (!hasLocator) throw zipError('backup/zip64-invalid');
      if (view.getUint32(locatorAt + 4, true) !== 0 || view.getUint32(locatorAt + 16, true) !== 1) throw zipError('backup/multi-disk');
      const end64Offset = view.getBigUint64(locatorAt + 8, true);
      const locatorOffset = BigInt(tailStart + locatorAt);
      if (end64Offset + 56n > locatorOffset) throw zipError('backup/zip64-invalid');
      const record = await sliceBytes(file, toSafeNumber(end64Offset), toSafeNumber(end64Offset + 56n));
      const rv = new DataView(record.buffer, record.byteOffset, record.byteLength);
      if (rv.getUint32(0, true) !== SIG_END64 || rv.getBigUint64(4, true) < 44n) throw zipError('backup/zip64-invalid');
      if (rv.getUint32(16, true) !== 0 || rv.getUint32(20, true) !== 0) throw zipError('backup/multi-disk');
      const onDisk = rv.getBigUint64(24, true);
      count = rv.getBigUint64(32, true);
      if (onDisk !== count) throw zipError('backup/multi-disk');
      directorySize = rv.getBigUint64(40, true);
      directoryOffset = rv.getBigUint64(48, true);
      limit = end64Offset;
      zip64 = true;
    }
    if (directoryOffset + directorySize > limit || directoryOffset + directorySize > size) throw zipError('backup/truncated');
    // Every directory record is at least 46 bytes: a count the directory
    // cannot hold is refused before a single record is parsed.
    if (count * 46n > directorySize) throw zipError('backup/bad-directory');
    return new ZipReader(file, { count, directorySize, directoryOffset, zip64 });
  }

  /**
   * Every directory record in order, read through a bounded window. Each is
   * validated as it is met; the caller decides what the names mean.
   */
  async *entries({ windowBytes = 1024 * 1024 } = {}) {
    const start = this.directoryOffset;
    const stop = this.directoryOffset + this.directorySize;
    let position = start;
    let buffer = new Uint8Array(0);
    let bufferStart = start;
    let seen = 0n;

    const ensure = async (needed) => {
      const available = BigInt(buffer.length) - (position - bufferStart);
      if (available >= BigInt(needed)) return;
      const from = position;
      const to = from + BigInt(Math.max(needed, windowBytes)) > stop ? stop : from + BigInt(Math.max(needed, windowBytes));
      if (to - from < BigInt(needed)) throw zipError('backup/bad-directory');
      buffer = await sliceBytes(this.file, toSafeNumber(from), toSafeNumber(to));
      bufferStart = from;
    };

    while (position < stop) {
      await ensure(46);
      let at = Number(position - bufferStart);
      let view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      if (view.getUint32(at, true) !== SIG_CENTRAL) throw zipError('backup/bad-directory');
      const nameLength = view.getUint16(at + 28, true);
      const extraLength = view.getUint16(at + 30, true);
      const commentLength = view.getUint16(at + 32, true);
      const recordLength = 46 + nameLength + extraLength + commentLength;
      await ensure(recordLength);
      at = Number(position - bufferStart);
      view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

      const flags = view.getUint16(at + 8, true);
      const method = view.getUint16(at + 10, true);
      const crc = view.getUint32(at + 16, true);
      let compressed = BigInt(view.getUint32(at + 20, true));
      let size = BigInt(view.getUint32(at + 24, true));
      const disk = view.getUint16(at + 34, true);
      let offset = BigInt(view.getUint32(at + 42, true));
      let name;
      try {
        name = strictDecoder.decode(buffer.subarray(at + 46, at + 46 + nameLength));
      } catch {
        throw zipError('backup/unsafe-path');
      }
      const wanted = (size === BIG_MAX32 ? 1 : 0) + (compressed === BIG_MAX32 ? 1 : 0) + (offset === BIG_MAX32 ? 1 : 0);
      const extra = readZip64Extra(view, at + 46 + nameLength, extraLength, wanted);
      if (size === BIG_MAX32) size = extra.shift();
      if (compressed === BIG_MAX32) compressed = extra.shift();
      if (offset === BIG_MAX32) offset = extra.shift();

      if (!isSafeArchivePath(name)) throw zipError('backup/unsafe-path', { entry: name });
      if (flags & 0x0001) throw zipError('backup/encrypted', { entry: name });
      if (method !== 0) throw zipError('backup/compressed', { entry: name });
      if (compressed !== size) throw zipError('backup/bad-entry', { entry: name });
      if (disk !== 0 && disk !== MAX16) throw zipError('backup/multi-disk');
      // The entry's header and data lie wholly before the directory.
      if (offset + 30n + BigInt(nameLength) + size > this.directoryOffset) throw zipError('backup/bad-entry', { entry: name });

      seen += 1n;
      if (seen > this.count) throw zipError('backup/bad-directory');
      position += BigInt(recordLength);
      yield { name, crc, size, offset, nameLength, flags };
    }
    if (seen !== this.count) throw zipError('backup/bad-directory');
  }

  /**
   * One entry's bytes. The local header must name the same path as the
   * directory, and the data must end before the directory starts.
   */
  async read(entry) {
    const header = await sliceBytes(this.file, toSafeNumber(entry.offset), toSafeNumber(entry.offset + 30n));
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (view.getUint32(0, true) !== SIG_LOCAL) throw zipError('backup/bad-entry', { entry: entry.name });
    if (view.getUint16(8, true) !== 0) throw zipError('backup/compressed', { entry: entry.name });
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const dataStart = entry.offset + 30n + BigInt(nameLength) + BigInt(extraLength);
    const dataEnd = dataStart + entry.size;
    if (dataEnd > this.directoryOffset) throw zipError('backup/bad-entry', { entry: entry.name });
    const name = await sliceBytes(this.file, toSafeNumber(entry.offset + 30n), toSafeNumber(entry.offset + 30n + BigInt(nameLength)));
    let localName;
    try { localName = strictDecoder.decode(name); } catch { throw zipError('backup/unsafe-path'); }
    if (localName !== entry.name) throw zipError('backup/bad-entry', { entry: entry.name });
    const bytes = await sliceBytes(this.file, toSafeNumber(dataStart), toSafeNumber(dataEnd));
    if (crc32(bytes) !== entry.crc) throw new AppError('backup.integrity', { code: 'backup/crc', entry: entry.name });
    return bytes;
  }
}
