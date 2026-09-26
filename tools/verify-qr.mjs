// Round-trip verification for the QR encoder.
//
//   node tools/verify-qr.mjs            → writes PNGs to /tmp/qr-verify
//   python3 tools/verify-qr.py          → decodes them with OpenCV and reports
//
// Matching another encoder module for module proves conformance; decoding the
// result with somebody else's decoder proves the label works. Both are worth
// having, and this is the second one. A QR label that encodes the wrong SKU is
// worse than no label at all.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { encodeQr } from '../src/qr.js';

const PAYLOADS = [
  'INV-2026-000138',
  'INV-2026-000001',
  'HELLO WORLD',
  'A',
  '1234567890',
  'https://nazm.app/i/abc123',
  'ساعة جيب فضية',
  'INV-2026-999999 · خزنة A',
  'abcdefghijklmnopqrstuvwxyz',
];

const out = '/tmp/qr-verify';
mkdirSync(out, { recursive: true });

const rows = {};
for (const payload of PAYLOADS) {
  const code = encodeQr(payload);
  rows[payload] = code.cells.map((row) => row.join(''));
}
writeFileSync(join(out, 'codes.json'), JSON.stringify(rows, null, 1));
console.log(`wrote ${PAYLOADS.length} codes → ${join(out, 'codes.json')}`);
console.log('now run: python3 tools/verify-qr.py');
