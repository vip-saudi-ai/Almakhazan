// Browser test for QR labels and the scanner's honesty about what a device can
// actually do.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/labels.test.mjs

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });

const ids = await page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  const place = await repository.saveLocation({ name: 'خزنة A' });
  const a = await repository.createItem({ name: 'ساعة جيب فضية', quantity: 1, unit: 'قطعة', categoryId: 'c1', barcode: 'BC-77421', locationId: place.id });
  const b = await repository.createItem({ name: 'لوحة زيتية', quantity: 1, unit: 'قطعة', categoryId: 'c1' });
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
check('L5 the QR keeps its quiet zone', sheet.viewBoxes.every(v => v.startsWith('-2 -2')), JSON.stringify(sheet.viewBoxes));

// The encoded value must be exactly the identifier, not a decorated version.
const encoded = await page.evaluate(async () => {
  const { encodeQr } = await import('/src/qr.js');
  const { repository } = await import('/src/repository.js');
  const item = repository.liveItems().find(i => i.barcode === 'BC-77421');
  const expected = encodeQr(item.sku || item.barcode).cells.map(r => r.join('')).join('|');
  const drawn = [...document.querySelectorAll('.label-qr')][0].querySelector('svg');
  const size = Number(drawn.getAttribute('viewBox').split(' ')[2]) - 4;
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

// scanning: the app must not pretend
const scanning = await page.evaluate(async () => {
  const { scanningSupported } = await import('/src/scanner.js');
  return { supported: scanningSupported(), hasApi: 'BarcodeDetector' in window };
});
check('L9 scanning support is reported from the platform, not assumed',
  scanning.supported === scanning.hasApi, JSON.stringify(scanning));

await page.evaluate(() => { document.getElementById('sh-labels').querySelector('[data-close]').click(); });
await page.waitForTimeout(300);
await page.click('#scan-btn');
await page.waitForTimeout(500);
const afterScan = await page.evaluate(() => ({
  sheetOpen: document.getElementById('sh-scan').classList.contains('open'),
  toast: document.querySelector('.toast')?.innerText || '',
}));
check('L10 an unsupported device is told so instead of shown a dead camera',
  scanning.supported ? afterScan.sheetOpen : afterScan.toast.includes('لا يدعم المسح'),
  JSON.stringify(afterScan));

check('L11 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 200));

await page.close();
await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
