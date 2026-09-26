// The QR label PDF — structure a reader can open, and a symbol a scanner can
// find: vector modules with the four-module quiet zone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLabelsPdf, labelsPerPage, LABEL_PDF_LAYOUT } from '../../src/label-pdf.js';
import { encodeQr } from '../../src/qr.js';

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const fakeJpeg = { jpeg: new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]), width: 10, height: 6 };

test('a label PDF has a valid header, xref and trailer', () => {
  const pdf = latin1(buildLabelsPdf([{ code: encodeQr('SKU-0001'), text: fakeJpeg }]));
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
  const startxref = Number(pdf.match(/startxref\n(\d+)\n/)[1]);
  assert.equal(pdf.slice(startxref, startxref + 4), 'xref');
  const count = Number(pdf.match(/xref\n0 (\d+)\n/)[1]);
  const entries = [...pdf.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  assert.equal(entries.length, count - 1);
  entries.forEach((offset, index) => assert.ok(pdf.startsWith(`${index + 1} 0 obj`, offset), `object ${index + 1}`));
  // Stream lengths match the bytes between stream and endstream.
  for (const match of pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const start = match.index + match[0].length;
    assert.equal(pdf.slice(start + Number(match[1]), start + Number(match[1]) + 10), '\nendstream');
  }
  assert.match(pdf, /\/Filter \/DCTDecode/);
});

test('the QR is drawn as vector rectangles inside a four-module quiet zone', () => {
  const code = encodeQr('SKU-0001');
  const pdf = latin1(buildLabelsPdf([{ code }], { rtl: false }));
  const L = LABEL_PDF_LAYOUT;
  const unit = L.qrSide / (code.size + 2 * L.quietModules);
  const qrX = L.margin + L.padding;
  const rects = [...pdf.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re$/gm)].map((m) => m.slice(1).map(Number));
  assert.ok(rects.length > 20);
  const minX = Math.min(...rects.map((r) => r[0]));
  assert.ok(Math.abs(minX - (qrX + L.quietModules * unit)) < 0.01, 'first module sits after the quiet zone');
  // Every dark module is covered, and nothing else.
  let dark = 0;
  for (const row of code.cells) for (const cell of row) if (cell) dark++;
  const covered = rects.reduce((sum, r) => sum + Math.round(r[2] / unit), 0);
  assert.equal(covered, dark);
  assert.doesNotMatch(pdf, /DCTDecode/, 'no text image when none was given');
});

test('many labels flow onto further pages', () => {
  const per = labelsPerPage();
  const labels = Array.from({ length: per + 1 }, (_, i) => ({ code: encodeQr(`SKU-${i}`), text: fakeJpeg }));
  const pdf = latin1(buildLabelsPdf(labels, { rtl: true, mono: true }));
  assert.match(pdf, /\/Count 2 >>/);
  assert.equal([...pdf.matchAll(/\/Subtype \/Image/g)].length, per + 1);
  assert.throws(() => buildLabelsPdf([]));
});
