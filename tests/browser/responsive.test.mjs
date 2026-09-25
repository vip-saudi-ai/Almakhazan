// Browser test for the responsive system.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/responsive.test.mjs
//
// Every viewport class the product claims to support, plus the two that catch
// the failures nothing else does: a landscape phone, where height is the
// scarce axis, and a 195px viewport, which is what browser zoom at 200% leaves
// of a 390px phone. The people who most need larger text are the ones who
// would otherwise be unable to use the app at all.

import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const SEED = `
  const { repository } = await import('/src/repository.js');
  const now = Date.now();
  const names = [
    'ساعة جيب ذهبية عثمانية نادرة من القرن التاسع عشر بعلبتها الأصلية وشهادة المنشأ',
    'Rolex Datejust 126334 Wimbledon Dial Oyster Perpetual Superlative Chronometer',
    'لوحة', 'خاتم', 'سيف', 'مزهرية', 'كتاب', 'عملة',
  ];
  await repository.bulkWrite(names.map((name, i) => ({
    type: 'set', collection: 'items', id: 'r' + i,
    data: { id: 'r' + i, name, quantity: i + 1, unit: 'قطعة', categoryId: 'c1', images: [],
      condition: i % 2 ? 'ممتازة' : 'جيدة',
      valuation: { min: 1500 * (i + 1), max: 999999 * (i + 1), currency: 'SAR' },
      createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1 } })));
`;

const VIEWPORTS = [
  ['320×568  small phone', 320, 568, { minCols: 1, maxCols: 2 }],
  ['375×667  phone', 375, 667, { minCols: 2, maxCols: 2 }],
  ['390×844  phone', 390, 844, { minCols: 2, maxCols: 2 }],
  ['430×932  large phone', 430, 932, { minCols: 2, maxCols: 3 }],
  ['768×1024 tablet', 768, 1024, { minCols: 3, maxCols: 4, rail: false }],
  ['820×1180 tablet', 820, 1180, { minCols: 3, maxCols: 4, rail: false }],
  ['1024×768 laptop', 1024, 768, { minCols: 3, maxCols: 5, rail: true }],
  ['1280×800 laptop', 1280, 800, { minCols: 4, maxCols: 6, rail: true }],
  ['1440×900 desktop', 1440, 900, { minCols: 4, maxCols: 6, rail: true }],
  ['1920×1080 desktop', 1920, 1080, { minCols: 5, maxCols: 8, rail: true }],
  ['844×390  landscape', 844, 390, { minCols: 3, maxCols: 5 }],
  ['195×422  200% zoom', 195, 422, { minCols: 1, maxCols: 1 }],
];

for (const [label, width, height, expect] of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 20000 });
  await page.evaluate(new Function('return (async () => {' + SEED + '})()'));
  await page.waitForTimeout(400);

  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const inside = (sel) => {
      const n = document.querySelector(sel);
      if (!n || !n.checkVisibility?.({ visibilityProperty: true })) return true;
      const r = n.getBoundingClientRect();
      return r.left >= -1 && r.right <= window.innerWidth + 1;
    };
    // Anything visible that sticks out past the viewport on either side —
    // except what sits inside a horizontal scroller, where being off-screen is
    // the point rather than a bug. The category pills are such a row.
    const inScroller = (n) => {
      for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
      }
      return false;
    };
    const escaped = [...document.querySelectorAll('.app button, .app input, .tbar button')]
      .filter(n => n.checkVisibility?.({ visibilityProperty: true }))
      .filter(n => !inScroller(n))
      .filter(n => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1); })
      .map(n => n.id || n.className.split(' ')[0]);
    return {
      overflow: doc.scrollWidth > doc.clientWidth + 1,
      cols: getComputedStyle(document.getElementById('hgrid')).gridTemplateColumns.split(' ').filter(Boolean).length,
      rail: getComputedStyle(document.querySelector('.tbar')).flexDirection === 'column',
      escaped: [...new Set(escaped)],
      searchIn: inside('#hsearch'), scanIn: inside('#scan-btn'), addIn: inside('.nacts button:last-child'),
    };
  });

  check(`R: ${label} — no horizontal overflow`, !m.overflow, `${m.cols} cols`);
  check(`R: ${label} — the grid is ${expect.minCols}–${expect.maxCols} columns`,
    m.cols >= expect.minCols && m.cols <= expect.maxCols, `got ${m.cols}`);
  check(`R: ${label} — every control stays on screen`,
    m.escaped.length === 0 && m.searchIn && m.scanIn && m.addIn,
    m.escaped.join(',') || `search:${m.searchIn} scan:${m.scanIn} add:${m.addIn}`);
  if (expect.rail !== undefined) {
    check(`R: ${label} — navigation is a ${expect.rail ? 'rail' : 'bar'}`,
      m.rail === expect.rail, `rail=${m.rail}`);
  }
  check(`R: ${label} — no JS errors`, errs.length === 0, errs[0] || '');
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
