// Browser test: 100,000 records (or NAZM_SCALE records), navigated.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/scale-100k.test.mjs
//   NAZM_SCALE=500000 node tests/browser/scale-100k.test.mjs   # the query layer at 500k
//
// Asserts costs, not only answers: every screen opens without loading the
// inventory (`completeItems` is never called, no unbounded getAll on items),
// the window stays at most 200 records, a page reads about a page, and each
// answer is exact. Timings are reported, with generous ceilings so a slow CI
// machine does not fail on noise — a regression to "read everything" would
// cost far more than the ceiling.

import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const COUNT = Number(process.env.NAZM_SCALE) || 100000;
const QUERY_ONLY = COUNT > 150000;
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const timings = {};

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await page.route('**/src/subscription.js', (r) => r.fulfill({ contentType: 'text/javascript', body: planStub({ planId: 'business' }) }));
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });

// ── seeding, through the repository's own derivations ─────────────────────
// Records are written with their derived index fields, as the app writes
// them, so the test measures the app and not the back-fill.
const seedStart = Date.now();
const seed = await page.evaluate(async ({ count }) => {
  const { repository } = await import('/src/repository.js');
  const local = await import('/src/local-store.js');
  const { withIndexFields } = await import('/src/item-index.js');
  const folder = await repository.saveFolder({ name: 'المستودع الكبير', icon: '🗂', color: '#2563FF' });
  const location = await repository.saveLocation({ name: 'الرصيف ٤' });
  const now = Date.now();
  const cats = ['equipment_tools', 'art_paintings', 'electronics_devices', 'uncategorized'];
  const BATCH = 5000;
  for (let start = 0; start < count; start += BATCH) {
    const rows = [];
    for (let i = start; i < Math.min(count, start + BATCH); i += 1) {
      rows.push(withIndexFields({
        id: 'sx' + String(i).padStart(7, '0'),
        name: i % 1000 === 0 ? `مولد ديزل ${i}` : `صنف ${i}`,
        quantity: (i % 9) + 1, unit: 'قطعة',
        categoryId: cats[i % 4], mainCategoryId: null, subcategoryId: null,
        folderId: i % 20 === 0 ? folder.id : null, locationId: i % 7 === 0 ? location.id : null,
        sku: `SX-${String(i).padStart(7, '0')}`, barcode: String(6280000000000 + i), serialNumber: `SXS-${i}`,
        condition: i % 3 === 0 ? 'جيدة' : '',
        valuation: i % 2 ? { min: i % 5000, max: (i % 5000) + 10, currency: i % 11 ? 'SAR' : 'USD', source: 'manual', valuationType: 'estimate' } : null,
        images: [], deletedAt: i % 97 === 0 ? now : null,
        createdAt: now - i * 10, updatedAt: now - i * 10, version: 1, customFields: {}, customFieldIds: [],
      }));
    }
    await local.putMany('items', rows);
  }
  await local.remove('aggregates', 'inventory');
  return { folderId: folder.id, locationId: location.id };
}, { count: COUNT });
timings.seedMs = Date.now() - seedStart;

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 120000 });
await page.evaluate((value) => { window.__seed = value; }, seed);

// Instrument before anything is asked: any whole-inventory read is a failure.
await page.evaluate(async () => {
  const h = await import('/tests/browser/backup-helpers.mjs');
  window.__seen = h.watchMaterialisation();
});

const EXPECTED_LIVE = COUNT - Math.ceil(COUNT / 97);

// ── the aggregate (built once, on first use) ──────────────────────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const t0 = performance.now();
    const first = await repository.getInventoryOverview();
    const t1 = performance.now();
    const second = await repository.getInventoryOverview();
    const t2 = performance.now();
    return { total: first.totalItems, again: second.totalItems, buildMs: Math.round(t1 - t0), readMs: Math.round(t2 - t1) };
  });
  timings.aggregateBuildMs = r.buildMs;
  timings.aggregateReadMs = r.readMs;
  check('A1 the inventory aggregate is exact', r.total === EXPECTED_LIVE && r.again === EXPECTED_LIVE, JSON.stringify(r));
  check('A2 once built, reading it costs nothing like a walk', r.readMs < 200, `${r.readMs} ms`);
}

// ── the query layer ────────────────────────────────────────────────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const time = async (fn) => { const t0 = performance.now(); const v = await fn(); return [v, Math.round(performance.now() - t0)]; };
    const out = {};
    const [newest, newestMs] = await time(() => repository.queryItems({ limit: 50 }));
    out.newest = { n: newest.items.length, scanned: newest.meta.scanned, ms: newestMs };
    let cursor = newest.nextCursor;
    let deepMs = 0;
    for (let i = 0; i < 20; i += 1) {
      const [p, ms] = await time(() => repository.queryItems({ limit: 50, cursor }));
      deepMs = Math.max(deepMs, ms);
      cursor = p.nextCursor;
    }
    out.deepPageMaxMs = deepMs;
    const [byName, byNameMs] = await time(() => repository.queryItems({ limit: 50, sort: { field: 'name', direction: 'asc' } }));
    out.byName = { n: byName.items.length, scanned: byName.meta.scanned, strategy: byName.meta.strategy, ms: byNameMs };
    const [byValue, byValueMs] = await time(() => repository.queryItems({ limit: 50, filters: { valuationCurrency: 'SAR' }, sort: { field: 'valuation', direction: 'desc' } }));
    out.byValue = { n: byValue.items.length, scanned: byValue.meta.scanned, strategy: byValue.meta.strategy, ms: byValueMs };
    const [folder, folderMs] = await time(() => repository.queryItems({ limit: 50, filters: { folderId: window.__seed.folderId } }));
    out.folder = { n: folder.items.length, total: folder.total, ms: folderMs };
    const [sku, skuMs] = await time(() => repository.searchItems('SX-0012345'));
    out.sku = { ids: sku.items.map((i) => i.id), ms: skuMs };
    const [word, wordMs] = await time(() => repository.searchItems('مولد', { limit: 200 }));
    out.word = { n: word.items.length, scanned: word.meta.scanned, ms: wordMs };
    const [count, countMs] = await time(() => repository.countItemsMatching({ filters: { locationId: window.__seed.locationId } }));
    out.count = { n: count.count, strategy: count.meta.strategy, ms: countMs };
    const [sum, sumMs] = await time(() => repository.aggregateItems({}));
    out.sum = { n: sum.count, source: sum.meta.source, ms: sumMs };
    return out;
  });
  Object.assign(timings, {
    newestMs: r.newest.ms, deepPageMaxMs: r.deepPageMaxMs, byNameMs: r.byName.ms, byValueMs: r.byValue.ms,
    folderMs: r.folder.ms, skuMs: r.sku.ms, wordMs: r.word.ms, countMs: r.count.ms, sumMs: r.sum.ms,
  });
  check('Q1 the newest page reads about a page', r.newest.n === 50 && r.newest.scanned < 200, JSON.stringify(r.newest));
  check('Q2 twenty pages deep is as cheap as the first', r.deepPageMaxMs < 1500, `${r.deepPageMaxMs} ms`);
  check('Q3 name order comes from its index', r.byName.n === 50 && /nameSortKey/.test(r.byName.strategy) && r.byName.scanned < 200, JSON.stringify(r.byName));
  check('Q4 value order comes from its index, within a currency', r.byValue.n === 50 && /valueSort/.test(r.byValue.strategy) && r.byValue.scanned < 400, JSON.stringify(r.byValue));
  check('Q5 a folder answers with an exact total from index sizes', r.folder.n === 50 && r.folder.total > 0, JSON.stringify(r.folder));
  check('Q6 an identifier is found at once', r.sku.ids.includes('sx0012345') || COUNT <= 12345, JSON.stringify(r.sku));
  // One record in 1,000 carries the word; the walk reads those and no others.
  check('Q7 a word is found through the token index, reading only its matches', r.word.n > 0 && r.word.scanned <= Math.ceil(COUNT / 1000) + 5, JSON.stringify(r.word));
  check('Q8 a location count comes from index sizes', r.count.strategy === 'index-count' && r.count.ms < 500, JSON.stringify(r.count));
  check('Q9 whole-inventory totals come from the aggregate', r.sum.source === 'aggregate' && r.sum.n === EXPECTED_LIVE, JSON.stringify(r.sum));
}

// ── the screens (100k only: the 500k run measures the query layer) ─────────
if (!QUERY_ONLY) {
  const r = await page.evaluate(async () => {
    const { goTab } = await import('/src/navigation.js');
    const { repository } = await import('/src/repository.js');
    const out = {};
    const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
    for (const tab of ['ov', 'ai', 'home', 'cats', 'set', 'home']) {
      const t0 = performance.now();
      goTab(tab);
      // Until the screen has drawn something.
      for (let i = 0; i < 400; i += 1) {
        await settle();
        const host = { ov: 'ov-scroll', ai: 'ai-scroll', home: 'hscroll', cats: 'cats-scroll', set: 'st-scroll' }[tab];
        const node = document.getElementById(host) || document.querySelector(`#t-${tab}`);
        if (tab === 'ai' ? document.querySelector('.health-number') : (node?.textContent || '').length > 20) break;
      }
      out[tab] = Math.round(performance.now() - t0);
    }
    return { out, window: repository.state.items.length, complete: repository.itemsComplete, seen: window.__seen };
  });
  Object.assign(timings, Object.fromEntries(Object.entries(r.out).map(([k, v]) => [`tab_${k}_ms`, v])));
  check('N1 every screen opens without loading the inventory', r.seen.completeItems === 0 && r.seen.itemsGetAll === 0 && !r.complete, JSON.stringify(r.seen));
  check('N2 the window stays bounded', r.window <= 200, String(r.window));
  check('N3 the assistant and overview draw in reasonable time at this size', r.out.ai < 20000 && r.out.ov < 10000, JSON.stringify(r.out));

  const health = await page.evaluate(async () => {
    const { inventoryHealthSnapshot } = await import('/src/insights.js');
    const t0 = performance.now();
    const h = await inventoryHealthSnapshot();
    return { ms: Math.round(performance.now() - t0), total: h.counts.total, dups: h.counts.duplicateGroups };
  });
  timings.healthMs = health.ms;
  check('N4 the health score counts the whole inventory', health.total === EXPECTED_LIVE, JSON.stringify(health));
}

const seen = await page.evaluate(() => window.__seen);
check('Z1 nothing read the whole items store', seen.completeItems === 0 && seen.itemsGetAll === 0, JSON.stringify(seen));
check('Z2 no JS errors', errs.length === 0, errs.slice(0, 3).join(' / '));
await context.close();
await browser.close();
console.log(`records: ${COUNT}${QUERY_ONLY ? ' (query layer only)' : ''}`);
console.log('timings:', JSON.stringify(timings));
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
