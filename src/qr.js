// A QR encoder, written out rather than pulled in.
//
// The labels this product prints carry a SKU or a short link. That needs byte
// and alphanumeric mode, error correction level M, and versions 1–10 — a
// bounded problem, and a bounded amount of code. A dependency for it would be
// larger than this file and would have to be audited anyway, because a label
// that encodes the wrong SKU is worse than no label.
//
// Correctness is checked against segno (a reference implementation) in
// tests/unit/qr.test.mjs: same input, same version, same mask, same matrix.

import { AppError } from './utils.js';

const EC_LEVEL_M = 0;   // the format-information code for level M

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// Data capacity in bits, and the error-correction block layout, for level M.
// [ecPerBlock, group1Blocks, group1Words, group2Blocks, group2Words]
const BLOCKS_M = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

const ALIGNMENT = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

// ── GF(256) ────────────────────────────────────────────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generatorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function remainder(data, degree) {
  const poly = generatorPoly(degree);
  const buffer = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = buffer[i];
    if (!factor) continue;
    for (let j = 0; j < poly.length; j++) buffer[i + j] ^= mul(poly[j], factor);
  }
  return buffer.slice(data.length);
}

// ── bit writing ────────────────────────────────────────────────────────────
class Bits {
  constructor() { this.bits = []; }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
  get length() { return this.bits.length; }
  toBytes() {
    const bytes = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | (this.bits[i + j] ?? 0);
      bytes.push(byte);
    }
    return bytes;
  }
}

const isNumeric = (text) => /^[0-9]+$/.test(text);
// Deliberately not case-folded: alphanumeric mode has no lower case, so
// upper-casing to reach it would change what the code says. A URL encoded that
// way scans back wrong.
const isAlnum = (text) => [...text].every((c) => ALNUM.includes(c));

function utf8(text) {
  return [...new TextEncoder().encode(text)];
}

function capacityBits(version) {
  const [ec, b1, w1, b2, w2] = BLOCKS_M[version];
  return ((b1 * w1) + (b2 * w2)) * 8;
}

const COUNT_BITS = {
  numeric: (version) => (version < 10 ? 10 : 12),
  alnum: (version) => (version < 10 ? 9 : 11),
  byte: (version) => (version < 10 ? 8 : 16),
};

function dataBitsFor(text, mode) {
  if (mode === 'numeric') {
    const groups = Math.floor(text.length / 3);
    const rest = text.length % 3;
    return groups * 10 + (rest === 0 ? 0 : rest === 1 ? 4 : 7);
  }
  if (mode === 'alnum') {
    return Math.floor(text.length / 2) * 11 + (text.length % 2 ? 6 : 0);
  }
  return utf8(text).length * 8;
}

function pickVersion(text, mode) {
  for (let version = 1; version <= 10; version++) {
    if (4 + COUNT_BITS[mode](version) + dataBitsFor(text, mode) <= capacityBits(version)) return version;
  }
  throw new AppError('error.qr/too-long', { code: 'qr/too-long' });
}

function encodeData(text, version, mode) {
  const bits = new Bits();
  if (mode === 'numeric') {
    bits.push(0b0001, 4);
    bits.push(text.length, COUNT_BITS.numeric(version));
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      bits.push(Number(chunk), chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4);
    }
  } else if (mode === 'alnum') {
    bits.push(0b0010, 4);
    bits.push(text.length, COUNT_BITS.alnum(version));
    for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) {
        bits.push(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
      } else {
        bits.push(ALNUM.indexOf(text[i]), 6);
      }
    }
  } else {
    const bytes = utf8(text);
    bits.push(0b0100, 4);
    bits.push(bytes.length, COUNT_BITS.byte(version));
    for (const byte of bytes) bits.push(byte, 8);
  }

  const capacity = capacityBits(version);
  bits.push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0, 1);

  const bytes = bits.toBytes();
  const target = capacity / 8;
  for (let i = 0; bytes.length < target; i++) bytes.push(i % 2 === 0 ? 0xec : 0x11);
  return bytes;
}

/** Interleaves data and error-correction words across the version's blocks. */
function interleave(data, version) {
  const [ecWords, g1, w1, g2, w2] = BLOCKS_M[version];
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < g1; i++) { blocks.push(data.slice(offset, offset + w1)); offset += w1; }
  for (let i = 0; i < g2; i++) { blocks.push(data.slice(offset, offset + w2)); offset += w2; }

  const ec = blocks.map((block) => remainder(block, ecWords));
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecWords; i++) {
    for (const block of ec) out.push(block[i]);
  }
  return out;
}

// ── the matrix ─────────────────────────────────────────────────────────────
function blankMatrix(size) {
  return {
    cells: Array.from({ length: size }, () => new Array(size).fill(0)),
    fixed: Array.from({ length: size }, () => new Array(size).fill(false)),
    size,
  };
}

function place(matrix, x, y, value) {
  matrix.cells[y][x] = value ? 1 : 0;
  matrix.fixed[y][x] = true;
}

function drawFinder(matrix, cx, cy) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) continue;
      const inRing = (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6))
        || (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6));
      const inCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      place(matrix, x, y, inRing || inCore);
    }
  }
}

function drawAlignment(matrix, version) {
  const centres = ALIGNMENT[version];
  for (const cy of centres) {
    for (const cx of centres) {
      // The three finder corners have no alignment pattern.
      if ((cx === 6 && cy === 6)
        || (cx === 6 && cy === centres[centres.length - 1])
        || (cy === 6 && cx === centres[centres.length - 1])) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          place(matrix, cx + dx, cy + dy, ring !== 1);
        }
      }
    }
  }
}

function drawFunction(matrix, version) {
  const size = matrix.size;
  drawFinder(matrix, 0, 0);
  drawFinder(matrix, size - 7, 0);
  drawFinder(matrix, 0, size - 7);
  drawAlignment(matrix, version);

  for (let i = 8; i < size - 8; i++) {
    place(matrix, i, 6, i % 2 === 0);
    place(matrix, 6, i, i % 2 === 0);
  }

  place(matrix, 8, size - 8, 1);                 // the always-dark module

  // Reserve the format areas; their values are written after masking.
  for (let i = 0; i < 9; i++) {
    if (!matrix.fixed[8][i]) place(matrix, i, 8, 0);
    if (!matrix.fixed[i][8]) place(matrix, 8, i, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!matrix.fixed[8][size - 1 - i]) place(matrix, size - 1 - i, 8, 0);
    if (!matrix.fixed[size - 1 - i][8]) place(matrix, 8, size - 1 - i, 0);
  }
}

function placeData(matrix, words) {
  const size = matrix.size;
  const bits = [];
  for (const word of words) for (let i = 7; i >= 0; i--) bits.push((word >> i) & 1);

  let index = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;                  // the vertical timing column is skipped
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (matrix.fixed[y][x]) continue;
        matrix.cells[y][x] = bits[index++] ?? 0;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(matrix, mask) {
  const out = {
    cells: matrix.cells.map((row) => [...row]),
    fixed: matrix.fixed,
    size: matrix.size,
  };
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.fixed[y][x]) continue;
      if (MASKS[mask](x, y)) out.cells[y][x] ^= 1;
    }
  }
  return out;
}

const FORMAT_GEN = 0b10100110111;
const FORMAT_XOR = 0b101010000010010;

function formatBits(mask) {
  const data = (EC_LEVEL_M << 3) | mask;
  let rest = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rest >> i) & 1) rest ^= FORMAT_GEN << (i - 10);
  }
  return ((data << 10) | rest) ^ FORMAT_XOR;
}

function writeFormat(matrix, mask) {
  const bits = formatBits(mask);
  const size = matrix.size;
  const bit = (i) => (bits >> i) & 1;
  // (x, y), not [row][column]: the two format copies run in opposite
  // directions and swapping the axes silently produces an unreadable code.
  const set = (x, y, value) => { matrix.cells[y][x] = value; };

  // First copy, around the top-left finder: low bits down the column, high
  // bits back along the row.
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i <= 14; i++) set(14 - i, 8, bit(i));

  // Second copy, split between the bottom-left and top-right finders.
  for (let i = 0; i <= 7; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i <= 14; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, 1);
}

function penalty(matrix) {
  const size = matrix.size;
  const cells = matrix.cells;
  let score = 0;

  const runScore = (line) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) {
        run += 1;
      } else {
        if (run >= 5) total += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) total += 3 + (run - 5);
    return total;
  };

  for (let y = 0; y < size; y++) score += runScore(cells[y]);
  for (let x = 0; x < size; x++) score += runScore(cells.map((row) => row[x]));

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v = cells[y][x];
      if (v === cells[y][x + 1] && v === cells[y + 1][x] && v === cells[y + 1][x + 1]) score += 3;
    }
  }

  // Rule 3 counts the finder-like 1:1:3:1:1 pattern with four light modules on
  // one side. Those four may fall outside the symbol, where the quiet zone is
  // light — so each line is padded with light modules before scanning. Without
  // the padding a pattern at the edge goes uncounted and a worse mask wins.
  const PATTERN = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const REVERSE = [...PATTERN].reverse();
  const hasAt = (line, i, pattern) => pattern.every((p, k) => line[i + k] === p);
  const scanLine = (row) => {
    const line = [0, 0, 0, 0, ...row, 0, 0, 0, 0];
    let total = 0;
    for (let i = 0; i + 11 <= line.length; i++) {
      if (hasAt(line, i, PATTERN) || hasAt(line, i, REVERSE)) total += 40;
    }
    return total;
  };
  for (let y = 0; y < size; y++) score += scanLine(cells[y]);
  for (let x = 0; x < size; x++) score += scanLine(cells.map((row) => row[x]));

  const dark = cells.flat().reduce((sum, v) => sum + v, 0);
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/**
 * @param {string} text
 * @returns {{size: number, version: number, mask: number, cells: number[][]}}
 */
export function encodeQr(text) {
  const value = String(text ?? '').trim();
  if (!value) throw new AppError('error.qr/empty', { code: 'qr/empty' });

  const mode = isNumeric(value) ? 'numeric' : isAlnum(value) ? 'alnum' : 'byte';
  const version = pickVersion(value, mode);
  const words = interleave(encodeData(value, version, mode), version);

  const size = version * 4 + 17;
  const base = blankMatrix(size);
  drawFunction(base, version);
  placeData(base, words);

  // Every one of the eight masks yields a valid symbol; the penalty rules only
  // pick the most readable. Implementations differ at the margins of those
  // rules, so a mask that differs from another encoder's choice is not a bug —
  // what matters is that the symbol decodes, which tools/verify-qr.mjs checks
  // against a third-party decoder.
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = applyMask(base, mask);
    writeFormat(candidate, mask);
    const score = penalty(candidate);
    if (!best || score < best.score) best = { score, mask, matrix: candidate };
  }

  return { size, version, mask: best.mask, cells: best.matrix.cells };
}

/** The QR as an SVG path, one square per dark module. */
export function qrPath(code) {
  const parts = [];
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.cells[y][x]) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return parts.join('');
}
