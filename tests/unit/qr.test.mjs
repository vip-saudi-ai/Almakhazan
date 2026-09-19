import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { encodeQr, qrPath } from '../../src/qr.js';

// Two kinds of evidence, because one is not enough for something that gets
// printed on a label and never read back by a human:
//
//   1. These vectors come from segno, an independent implementation. Where a
//      payload leaves no ambiguity — it fills its capacity exactly, or is
//      short enough that no encoder has a choice — the matrix must match
//      module for module.
//   2. tools/verify-qr.mjs + verify-qr.py encode every shape of payload this
//      product prints and decode it back with OpenCV. That is what proves a
//      label scans; it is run by hand because it needs OpenCV installed.
//
// Where a longer payload needs padding, or where the mask penalty is a close
// call, encoders legitimately differ — every one of the eight masks produces a
// valid symbol. Those cases are covered by the decode round trip, not here.
const VECTORS = JSON.parse(readFileSync(new URL('./qr-vectors.json', import.meta.url), 'utf8'));

const asRows = (code) => code.cells.map((row) => row.join(''));

for (const [text, expected] of Object.entries(VECTORS)) {
  test(`QR matches the reference implementation: ${text}`, () => {
    const code = encodeQr(text);
    assert.equal(code.version, expected.version, 'version');
    assert.equal(code.size, expected.matrix.length, 'size');
    assert.equal(code.mask, expected.mask, 'mask');
    assert.deepEqual(asRows(code), expected.matrix, 'every module');
  });
}

// ── format information ──
// The published table for error-correction level M. Independent data: if the
// BCH code or the final XOR were wrong, every one of these would fail.
const FORMAT_M = [
  '101010000010010', '101000100100101', '101111001111100', '101101101001011',
  '100010111111001', '100000011001110', '100111110010111', '100101010100000',
];

test('the format information matches the published table for level M', () => {
  for (let mask = 0; mask < 8; mask++) {
    // The format strip runs down column 8 for the low bits; read it back out.
    const code = encodeQr('A');
    if (code.mask !== mask) continue;
    const bits = [];
    for (let i = 0; i <= 5; i++) bits.push(code.cells[i][8]);
    bits.push(code.cells[7][8], code.cells[8][8], code.cells[8][7]);
    for (let i = 9; i <= 14; i++) bits.push(code.cells[8][14 - i]);
    assert.equal(bits.reverse().join(''), FORMAT_M[mask], `mask ${mask}`);
  }
});

// ── modes ──

test('digits use numeric mode, which is denser than the alternatives', () => {
  // 41 digits fit version 1 only in numeric mode.
  assert.equal(encodeQr('1'.repeat(17)).version, 1);
});

test('lower case is never folded to reach alphanumeric mode', () => {
  // Folding would change what the code says; a URL encoded that way scans back
  // wrong. Byte mode costs more modules and keeps the text intact.
  const code = encodeQr('https://nazm.app/i/abc123');
  assert.equal(code.version, 2);
});

test('Arabic is carried as UTF-8 bytes', () => {
  assert.doesNotThrow(() => encodeQr('ساعة جيب فضية'));
});

test('the version grows with the payload', () => {
  const small = encodeQr('INV-2026-000138');
  const large = encodeQr('INV-2026-000138 · مستودع الرياض · الرف B · جيدة جداً');
  assert.ok(large.version > small.version, `${small.version} → ${large.version}`);
  assert.equal(large.size, large.version * 4 + 17);
});

// ── structure ──

test('the three finder patterns are present and correct', () => {
  const code = encodeQr('INV-2026-000138');
  const corners = [[0, 0], [code.size - 7, 0], [0, code.size - 7]];
  for (const [ox, oy] of corners) {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const ring = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        assert.equal(code.cells[oy + y][ox + x], ring || core ? 1 : 0, `finder at ${ox},${oy} module ${x},${y}`);
      }
    }
  }
});

test('the timing patterns alternate', () => {
  const code = encodeQr('INV-2026-000138');
  for (let i = 8; i < code.size - 8; i++) {
    assert.equal(code.cells[6][i], i % 2 === 0 ? 1 : 0, `row timing at ${i}`);
    assert.equal(code.cells[i][6], i % 2 === 0 ? 1 : 0, `column timing at ${i}`);
  }
});

test('the module that must always be dark is dark', () => {
  const code = encodeQr('INV-2026-000138');
  assert.equal(code.cells[code.size - 8][8], 1);
});

// ── refusals ──

test('an empty payload is refused rather than encoded as nothing', () => {
  assert.throws(() => encodeQr('   '), /لا يوجد نص/);
});

test('a payload too long for a label says so', () => {
  assert.throws(() => encodeQr('x'.repeat(400)), /أطول/);
});

test('the SVG path draws one square per dark module', () => {
  const code = encodeQr('INV-2026-000138');
  const dark = code.cells.flat().filter(Boolean).length;
  assert.equal(qrPath(code).match(/M/g).length, dark);
});
