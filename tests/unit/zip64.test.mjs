// The Full Backup container: classic ZIP while everything fits, real ZIP64
// structures once an offset or a count does not — exercised without a 4 GB
// fixture by starting the writer's logical offset just below 4 GiB and
// reading back through a sparse file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Zip64Writer, ZipReader, isSafeArchivePath, toSafeNumber } from '../../src/zip64.js';

const enc = new TextEncoder();

/** Collects what the writer emits. */
class MemorySink {
  constructor() { this.parts = []; this.length = 0; }
  async write(bytes) { this.parts.push(bytes.slice()); this.length += bytes.length; }
  bytes() {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) { out.set(part, at); at += part.length; }
    return out;
  }
}

/**
 * A file whose first `prefix` bytes are virtual zeros: what a reader sees of
 * an archive that really begins 4 GiB in, without allocating 4 GiB.
 */
class SparseFile {
  constructor(prefix, real) { this.prefix = prefix; this.real = real; this.size = prefix + real.length; }
  slice(start, end) {
    const { prefix, real } = this;
    return {
      async arrayBuffer() {
        const out = new Uint8Array(end - start);
        const from = Math.max(start, prefix);
        if (end > from) out.set(real.subarray(from - prefix, end - prefix), from - start);
        return out.buffer;
      },
    };
  }
}

async function build(entries, options) {
  const sink = new MemorySink();
  const zip = new Zip64Writer(sink, options);
  for (const [name, bytes] of entries) await zip.add(name, bytes);
  const result = await zip.finish();
  return { bytes: sink.bytes(), result };
}

async function readAll(file) {
  const reader = await ZipReader.open(file);
  const out = [];
  for await (const entry of reader.entries({ windowBytes: 4096 })) out.push({ entry, bytes: await reader.read(entry) });
  return { reader, out };
}

const u32 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true);
const u16 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset).getUint16(at, true);
const u64 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(at, true);
const find = (bytes, signature) => {
  for (let i = bytes.length - 4; i >= 0; i -= 1) if (u32(bytes, i) === signature) return i;
  return -1;
};

test('a small archive is classic ZIP and reads back exactly', async () => {
  const files = [['manifest.json', enc.encode('{"a":1}')], ['items/00000001.ndjson', enc.encode('{"id":"x"}\n')], ['media/00000001.jpg', new Uint8Array([0xff, 0xd8, 1, 2, 0xff, 0xd9])]];
  const { bytes, result } = await build(files);
  assert.equal(result.zip64, false);
  assert.equal(find(bytes, 0x06064b50), -1, 'no ZIP64 end record');
  const { reader, out } = await readAll(new Blob([bytes]));
  assert.equal(reader.zip64, false);
  assert.deepEqual(out.map((o) => o.entry.name), files.map((f) => f[0]));
  out.forEach((o, i) => assert.deepEqual([...o.bytes], [...files[i][1]]));
});

test('offsets past 4 GiB are written as ZIP64 and read back through 64-bit fields', async () => {
  const start = 0xffffffff - 40; // the second entry's header begins beyond 4 GiB
  const files = [['metadata.json', enc.encode('x'.repeat(64))], ['media/00000001.jpg', enc.encode('image bytes')], ['manifest.json', enc.encode('{}')]];
  const { bytes, result } = await build(files, { startOffset: BigInt(start) });
  assert.equal(result.zip64, true);

  // The classic end record saturates only what does not fit.
  const end = find(bytes, 0x06054b50);
  assert.equal(u16(bytes, end + 10), 3, 'entry count still fits');
  assert.equal(u32(bytes, end + 16), 0xffffffff, 'directory offset saturated');
  // The locator sits immediately before it and points at the ZIP64 record.
  assert.equal(u32(bytes, end - 20), 0x07064b50);
  const end64Logical = u64(bytes, end - 20 + 8);
  const end64 = Number(end64Logical) - start;
  assert.equal(u32(bytes, end64), 0x06064b50);
  assert.equal(u64(bytes, end64 + 4), 44n);
  assert.equal(u64(bytes, end64 + 32), 3n);
  const directoryOffset = u64(bytes, end64 + 48);
  assert.ok(directoryOffset > 0xffffffffn, 'directory offset is a real 64-bit value');

  // The second and third directory records carry their offset in a ZIP64 extra.
  const directory = Number(directoryOffset) - start;
  let at = directory;
  const offsets = [];
  for (let i = 0; i < 3; i += 1) {
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const classic = u32(bytes, at + 42);
    if (classic === 0xffffffff) {
      assert.equal(u16(bytes, at + 46 + nameLength), 0x0001);
      offsets.push(u64(bytes, at + 46 + nameLength + 4));
    } else {
      assert.equal(extraLength, 0);
      offsets.push(BigInt(classic));
    }
    at += 46 + nameLength + extraLength;
  }
  assert.equal(offsets[0], BigInt(start));
  assert.ok(offsets[1] > 0xffffffffn && offsets[2] > offsets[1]);

  const { reader, out } = await readAll(new SparseFile(start, bytes));
  assert.equal(reader.zip64, true);
  assert.deepEqual(out.map((o) => o.entry.name), files.map((f) => f[0]));
  assert.equal(new TextDecoder().decode(out[1].bytes), 'image bytes');
  assert.equal(out[1].entry.offset, offsets[1]);
});

test('more than 65,535 entries use the ZIP64 count and all are read', async () => {
  const total = 70_000;
  const sink = new MemorySink();
  const zip = new Zip64Writer(sink);
  const one = new Uint8Array([7]);
  for (let i = 0; i < total; i += 1) await zip.add(`media/${String(i).padStart(8, '0')}.jpg`, one);
  const result = await zip.finish();
  assert.equal(result.zip64, true);
  const bytes = sink.bytes();
  const end = find(bytes, 0x06054b50);
  assert.equal(u16(bytes, end + 10), 0xffff, 'classic count saturated');
  const end64 = Number(u64(bytes, end - 20 + 8));
  assert.equal(u64(bytes, end64 + 24), BigInt(total));
  const reader = await ZipReader.open(new Blob([bytes]));
  let n = 0;
  for await (const entry of reader.entries()) { if (entry.size !== 1n) throw new Error('size'); n += 1; }
  assert.equal(n, total);
});

test('unsafe paths are refused on writing and on reading', async () => {
  for (const bad of ['../x', '/abs', 'a\\b', 'a//b', 'C:/x', 'a/./b', 'a\u0000b', '']) assert.equal(isSafeArchivePath(bad), false, bad);
  assert.equal(isSafeArchivePath('media/00000001.thumb.jpg'), true);
  await assert.rejects(build([['../evil', enc.encode('x')]]), { code: 'backup/unsafe-path' });

  // The same bytes with the name patched to walk up, in both headers.
  const { bytes } = await build([['ab/x', enc.encode('x')]]);
  const patched = bytes.slice();
  for (let i = 0; i < patched.length - 3; i += 1) {
    if (patched[i] === 0x61 && patched[i + 1] === 0x62 && patched[i + 2] === 0x2f && patched[i + 3] === 0x78) patched.set(enc.encode('../x'), i);
  }
  await assert.rejects(readAll(new Blob([patched])), { code: 'backup/unsafe-path' });
});

test('compression, truncation and a directory outside the file are refused', async () => {
  const { bytes } = await build([['manifest.json', enc.encode('{"a":1}')]]);
  const directory = find(bytes, 0x02014b50);

  const compressed = bytes.slice();
  new DataView(compressed.buffer).setUint16(directory + 10, 8, true);
  await assert.rejects(readAll(new Blob([compressed])), { code: 'backup/compressed' });

  const outside = bytes.slice();
  const end = find(outside, 0x06054b50);
  new DataView(outside.buffer).setUint32(end + 16, 0x7ffffff0, true);
  await assert.rejects(ZipReader.open(new Blob([outside])), { code: 'backup/truncated' });

  const flipped = bytes.slice();
  flipped[30 + "manifest.json".length + 2] ^= 0xff; // a data byte: the CRC no longer matches
  await assert.rejects(readAll(new Blob([flipped])), { code: 'backup/crc' });

  await assert.rejects(ZipReader.open(new Blob([bytes.subarray(0, bytes.length - 5)])), { code: 'backup/not-archive' });
  assert.throws(() => toSafeNumber(2n ** 60n), { code: 'backup/zip64-invalid' });
});

test('a saturated classic record without a ZIP64 locator is refused', async () => {
  const { bytes } = await build([['manifest.json', enc.encode('{}')]]);
  const end = find(bytes, 0x06054b50);
  const forged = bytes.slice();
  new DataView(forged.buffer).setUint32(end + 16, 0xffffffff, true);
  await assert.rejects(ZipReader.open(new Blob([forged])), { code: 'backup/zip64-invalid' });
});
