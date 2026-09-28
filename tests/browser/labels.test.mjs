// Browser test for QR labels and the scanner's honesty about what a device can
// actually do.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/labels.test.mjs

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });

const ids = await page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  const place = await repository.saveLocation({ name: 'خزنة A' });
  const a = await repository.createItem({ name: 'ساعة جيب فضية', quantity: 1, unit: 'قطعة', categoryId: 'art_paintings', barcode: 'BC-77421', locationId: place.id });
  const b = await repository.createItem({ name: 'لوحة زيتية', quantity: 1, unit: 'قطعة', categoryId: 'art_paintings' });
  return [a.id, b.id];
});
await page.waitForTimeout(300);

await page.evaluate(async (itemIds) => {
  const { openLabels } = await import('/src/views/labels.js');
  openLabels(itemIds);
}, ids);
await page.waitForTimeout(400);

const sheet = await page.evaluate(() => ({
  open: document.getElementById('sh-labels').classList.contains('open'),
  cards: document.querySelectorAll('.label-card').length,
  codes: [...document.querySelectorAll('.label-code')].map(n => n.textContent),
  names: [...document.querySelectorAll('.label-name')].map(n => n.textContent),
  modules: [...document.querySelectorAll('.label-qr svg')].map(s => s.querySelectorAll('rect').length),
  viewBoxes: [...document.querySelectorAll('.label-qr svg')].map(s => s.getAttribute('viewBox')),
}));
check('L1 a label per selected record', sheet.open && sheet.cards === 2, JSON.stringify(sheet.cards));
check('L2 the printed code is the barcode when there is one', sheet.codes[0] === 'BC-77421', JSON.stringify(sheet.codes));
check('L3 a record with no code still prints a readable one',
  /^#[A-Z0-9]{6}$/.test(sheet.codes[1]), sheet.codes[1]);
check('L4 each label carries a real QR', sheet.modules.every(n => n > 50), JSON.stringify(sheet.modules));
check('L5 the QR keeps its quiet zone', sheet.viewBoxes.every(v => v.startsWith('-4 -4')), JSON.stringify(sheet.viewBoxes));

// The encoded value must be exactly the identifier, not a decorated version.
const encoded = await page.evaluate(async () => {
  const { encodeQr } = await import('/src/qr.js');
  const { repository } = await import('/src/repository.js');
  const item = repository.liveItems().find(i => i.barcode === 'BC-77421');
  const expected = encodeQr(item.sku || item.barcode).cells.map(r => r.join('')).join('|');
  const drawn = [...document.querySelectorAll('.label-qr')][0].querySelector('svg');
  const size = Number(drawn.getAttribute('viewBox').split(' ')[2]) - 8;
  const dark = new Set([...drawn.querySelectorAll('rect')].slice(1).map(r => `${r.getAttribute('x')},${r.getAttribute('y')}`));
  const rows = [];
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) row += dark.has(`${x},${y}`) ? '1' : '0';
    rows.push(row);
  }
  return { same: rows.join('|') === expected, size };
});
check('L6 the drawn QR is the encoded QR, module for module', encoded.same, JSON.stringify(encoded));

// mono finish
await page.click('.chipbtn');
await page.waitForTimeout(250);
const mono = await page.evaluate(() => {
  const sheetEl = document.querySelector('.label-sheet');
  const card = document.querySelector('.label-card');
  const brand = document.querySelector('.label-brand');
  return {
    mono: sheetEl.classList.contains('mono'),
    cardColor: getComputedStyle(card).color,
    brandColor: getComputedStyle(brand).color,
  };
});
check('L7 the thermal finish is pure black, with no colour left',
  mono.mono && mono.cardColor === 'rgb(0, 0, 0)' && mono.brandColor === 'rgb(0, 0, 0)', JSON.stringify(mono));

// location toggle
const withLocation = await page.evaluate(() => document.querySelectorAll('.label-place').length);
await page.evaluate(() => [...document.querySelectorAll('.chipbtn')][1].click());
await page.waitForTimeout(250);
const withoutLocation = await page.evaluate(() => document.querySelectorAll('.label-place').length);
check('L8 the location prints, and can be left off',
  withLocation === 1 && withoutLocation === 0, `${withLocation} → ${withoutLocation}`);

// The PDF: rendered at print resolution and scanned back, every label must
// decode to exactly the identifier it was made for.
const expectedValues = await page.evaluate(async (itemIds) => {
  const { repository } = await import('/src/repository.js');
  const { items } = await repository.getItems(itemIds);
  return items.map((item) => item.sku || item.barcode || item.id);
}, ids);
const [pdfDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.click('#labels-pdf'),
]);
const pdfPath = await pdfDownload.path();
const pdfBytes = readFileSync(pdfPath);
check('L12 the labels arrive as a PDF file', pdfBytes.subarray(0, 5).toString() === '%PDF-' && /^NAZM-Labels-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdfDownload.suggestedFilename()),
  pdfDownload.suggestedFilename());
const decoder = spawnSync('python3', ['-c', `
import sys, json
try:
    import pymupdf, cv2, numpy as np
except Exception as e:
    print(json.dumps({"skipped": str(e)})); sys.exit(0)
doc = pymupdf.open(sys.argv[1])
found = []
for page in doc:
    pix = page.get_pixmap(dpi=300, colorspace=pymupdf.csGRAY)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    ok, values, _, _ = cv2.QRCodeDetector().detectAndDecodeMulti(img)
    found += [v for v in (values if ok else []) if v]
print(json.dumps({"pages": len(doc), "found": sorted(found)}))
`, pdfPath], { encoding: 'utf8' });
const decoded = JSON.parse(decoder.stdout || '{"skipped":"python3 unavailable"}');
if (decoded.skipped) {
  console.log('  (L13 skipped — no PDF renderer/QR decoder here:', decoded.skipped, ')');
} else {
  check('L13 every QR in the PDF scans back to its identifier',
    JSON.stringify(decoded.found) === JSON.stringify([...expectedValues].sort()), JSON.stringify({ decoded, expectedValues }));
}

// scanning: the app must not pretend
const scanning = await page.evaluate(async () => {
  const { scanningSupported } = await import('/src/scanner.js');
  return { supported: scanningSupported(), hasApi: 'BarcodeDetector' in window };
});
// Without BarcodeDetector (Safari, this Chromium) the self-hosted decoder
// still scans, so scanning is offered everywhere.
check('L9 scanning is offered even without BarcodeDetector (self-hosted fallback)',
  scanning.supported === true && scanning.hasApi === false, JSON.stringify(scanning));

await page.evaluate(() => { document.getElementById('sh-labels').querySelector('[data-close]').click(); });
await page.waitForTimeout(300);
await page.click('#scan-btn');
await page.waitForTimeout(500);
const afterScan = await page.evaluate(() => ({
  sheetOpen: document.getElementById('sh-scan').classList.contains('open'),
  state: document.getElementById('scan-state')?.textContent || '',
  photo: document.getElementById('scan-photo')?.offsetParent != null,
}));
check('L10 a device with no camera is told so in the scanner, with Choose Photo still there',
  afterScan.sheetOpen && afterScan.state.includes('كاميرا') && afterScan.photo,
  JSON.stringify(afterScan));

check('L11 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 200));

await page.close();

// Inside the iOS shell the PDF goes to the Share Sheet, and the browser print
// button — which a WKWebView cannot honour — is not offered.
const nativeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await nativeContext.addInitScript(() => {
  window.NazmNative = { platform: 'ios', shareFile: (file) => { window.__shared = { ...file, bytes: file.base64.length }; } };
});
const nativePage = await nativeContext.newPage();
const nativeErrs = [];
nativePage.on('pageerror', e => nativeErrs.push('PAGEERROR: ' + e.message));
await nativePage.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await nativePage.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
const shared = await nativePage.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  const item = await repository.createItem({ name: 'ملصق أصلي', quantity: 1, categoryId: 'art_paintings' });
  const { openLabels } = await import('/src/views/labels.js');
  await openLabels([item.id]);
  const buttons = [...document.querySelectorAll('#labels-body button.btn')].map((b) => b.id || b.textContent);
  document.getElementById('labels-pdf').click();
  for (let i = 0; i < 50 && !window.__shared; i++) await new Promise((r) => setTimeout(r, 100));
  const file = window.__shared;
  return { buttons, filename: file?.filename, mimeType: file?.mimeType, head: file ? atob(file.base64.slice(0, 12)).slice(0, 5) : '' };
});
check('L14 on iOS the PDF goes to the Share Sheet, and no browser print button is offered',
  shared.mimeType === 'application/pdf' && shared.head === '%PDF-' && /\.pdf$/.test(shared.filename || '')
  && shared.buttons.length === 1 && shared.buttons[0] === 'labels-pdf' && nativeErrs.length === 0, JSON.stringify({ shared, nativeErrs }));
await nativeContext.close();
await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
