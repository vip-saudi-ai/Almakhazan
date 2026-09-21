// Browser test at 50, 1,000, 5,000 and 20,000 records.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/scale.test.mjs
//
// 20,000 is the Business plan's ceiling, so it is the size the product has to
// be honest about rather than the size it is unlikely to meet. The property
// under test is that the cost of using the app is set by what is on screen and
// by what was asked for — never by how much the customer owns.
//
// Concretely: opening the inventory draws one page whatever the total is; a
// record is found by its identifier without reading the others; the count of
// records in a folder costs the folder, not the inventory. A number that grows
// with the inventory is a number that will one day be a frozen tab.

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const PLAN_STUB = `
  import { PLAN_CONFIG } from '/src/plans.generated.js';
  import { checkCreateItem, itemQuotaStatus, usageSummary, assistantPresentation, checkUseAI, checkFeature } from '/src/entitlements.js';
  const plan = { ...PLAN_CONFIG.plans['business'], id: 'business' };
  const entitlement = { plan, planId: plan.id, status: 'active', readOnly: false };
  const usage = { items: 0, storageBytes: 0, members: 1, aiCreditsUsed: 0 };
  export function startPlanWatch(){} export function stopPlanWatch(){}
  export function onSubscriptionChange(listener){ listener({ entitlement, usage, ready: true }); return () => {}; }
  export function subscriptionState(){ return { entitlement, usage, ready: true }; }
  export function currentPlan(){ return plan; }
  export function planStatus(){ return 'active'; }
  export function quotaStatus(){ return itemQuotaStatus({ entitlement, usage }); }
  export function canAddItem(){ return checkCreateItem({ entitlement, usage }); }
  export function planUsage(){ return usageSummary({ entitlement, usage }); }
  export function assistantLabel(){ return assistantPresentation({ entitlement }); }
  export function canUseAssistant(){ return checkUseAI({ entitlement, usage }); }
  export function canUseFeature(name){ return checkFeature({ entitlement }, name); }
`;

const SIZES = [50, 1000, 5000, 20000];
const results = [];

for (const size of SIZES) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.route('**/src/subscription.js', r => r.fulfill({ contentType: 'text/javascript', body: PLAN_STUB }));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });

  // Written straight to the store so the timestamps stagger and the window is
  // a known set — and so seeding cost is not mistaken for app cost.
  await page.evaluate(async (count) => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const folder = await repository.saveFolder({ name: 'الخزنة', icon: '🗂', color: '#2563FF' });
    const now = Date.now();
    for (let start = 0; start < count; start += 1000) {
      const rows = [];
      for (let i = start; i < Math.min(count, start + 1000); i += 1) {
        rows.push({
          id: 's' + String(i).padStart(6, '0'),
          name: i === 0 ? 'أسطرلاب نحاسي نادر' : `قطعة ${i}`,
          quantity: 1, unit: 'قطعة', categoryId: 'c1',
          // Ten records in the folder, all at the far end of the window.
          folderId: i >= count - 10 ? folder.id : null,
          locationId: null,
          sku: `INV-2026-${String(i).padStart(6, '0')}`,
          barcode: String(6281000000000 + i),
          serialNumber: `SN-${String(i).padStart(7, '0')}`,
          images: [], deletedAt: null,
          valuation: { min: 100 + i, max: 100 + i, currency: 'SAR', source: 'manual' },
          createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1,
        });
      }
      await local.putMany('items', rows);
    }
    window.__folderId = folder.id;
  }, size);

  const folderId = await page.evaluate(() => window.__folderId);

  // Timed from a cold start with the records already on the device, which is
  // what opening the app on the second day actually is.
  const firstPaint = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#hgrid .icard').length > 0, null, { timeout: 30000 });
  const boot = Date.now() - firstPaint;
  await page.evaluate((id) => { window.__folderId = id; }, folderId);

  const measured = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { runQuery } = await import('/src/query.js');
    const local = await import('/src/local-store.js');
    const home = await import('/src/views/home.js');

    const time = async (fn) => { const t = performance.now(); await fn(); return +(performance.now() - t).toFixed(1); };

    // The median of several lookups, not one. The first read of an index also
    // pays to page it in, which is a real cost but a one-off — and timing a
    // single call measures whichever of the two happened to be sampled.
    const median = async (fn, runs = 7) => {
      const times = [];
      for (let i = 0; i < runs; i += 1) times.push(await time(() => fn(i)));
      return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
    };

    const query = await time(() => runQuery({ page: 1, perPage: 24 }));
    const render = await time(() => home.renderHome());
    const bySku = await median((i) => local.firstByIndex('items', 'sku', `INV-2026-${String(i * 7).padStart(6, '0')}`));
    const bySerial = await median((i) => local.firstByIndex('items', 'serialNumber', `SN-${String(i * 7).padStart(7, '0')}`));
    const folderCount = await median(() => repository.countItemsReferencing('folderId', window.__folderId));
    const folderRows = await repository.itemsReferencing('folderId', window.__folderId);

    // What the same answer costs by reading everything, for scale.
    const fullRead = await time(() => local.getAll('items'));

    return {
      loaded: repository.state.items.length,
      complete: repository.itemsComplete,
      total: repository.loadState().total,
      cards: document.querySelectorAll('#hgrid .icard').length,
      domNodes: document.getElementsByTagName('*').length,
      query, render, bySku, bySerial, folderCount, fullRead,
      folderMatches: folderRows.length,
    };
  });

  results.push({ size, boot, ...measured });
  check(`S${size} the folder's ten records are found, whatever the inventory holds`,
    measured.folderMatches === 10, String(measured.folderMatches));
  check(`S${size} no JS errors`, errs.length === 0, errs[0]);
  await context.close();
}

console.log('\n  size    boot  loaded  cards  dom   query  render  sku   serial  count  (read all)');
for (const r of results) {
  console.log(`  ${String(r.size).padStart(5)}  ${String(r.boot).padStart(5)}  ${String(r.loaded).padStart(6)}  ${String(r.cards).padStart(5)}  ${String(r.domNodes).padStart(4)}  ${String(r.query).padStart(5)}  ${String(r.render).padStart(6)}  ${String(r.bySku).padStart(4)}  ${String(r.bySerial).padStart(6)}  ${String(r.folderCount).padStart(5)}  ${String(r.fullRead).padStart(9)}`);
}
console.log('');

const small = results[0];
const large = results[results.length - 1];

// The window is what bounds everything downstream of it.
check('S1 the window holds the same number of records at 50 and at 20,000',
  large.loaded <= 200 && small.loaded === 50,
  `${small.loaded} → ${large.loaded}`);
check('S2 and the same number of cards are drawn',
  small.cards === large.cards, `${small.cards} → ${large.cards}`);
check('S3 the page is the same size in nodes',
  Math.abs(large.domNodes - small.domNodes) < 60, `${small.domNodes} → ${large.domNodes}`);

// Rendering and querying are about the page, not the inventory.
check('S4 drawing a page costs the page, not the inventory',
  large.render < Math.max(30, small.render * 3 + 8), `${small.render}ms → ${large.render}ms`);
check('S5 asking for a page costs the page, not the inventory',
  large.query < Math.max(20, small.query * 4 + 6), `${small.query}ms → ${large.query}ms`);

// Indexed lookups.
check('S6 finding a record by its SKU does not read the others',
  large.bySku < Math.max(12, small.bySku * 4 + 4), `${small.bySku}ms → ${large.bySku}ms`);
check('S7 nor by its serial number',
  large.bySerial < Math.max(12, small.bySerial * 4 + 4), `${small.bySerial}ms → ${large.bySerial}ms`);

// Counting a relation.
check('S8 counting a folder costs the folder',
  large.folderCount < Math.max(25, small.folderCount * 5 + 8), `${small.folderCount}ms → ${large.folderCount}ms`);

// The comparison that makes the point: what these answers would cost if the
// app read the records to work them out, as it used to.
check('S8b an indexed answer is a fraction of reading the inventory',
  large.bySku + large.bySerial + large.folderCount < large.fullRead / 4,
  `indexed ${(large.bySku + large.bySerial + large.folderCount).toFixed(1)}ms vs full read ${large.fullRead}ms`);

// Opening the app.
check('S9 the app still opens promptly at the plan ceiling',
  large.boot < 12000, `${small.boot}ms → ${large.boot}ms`);
check('S10 and it knows it is holding a window, not the inventory',
  large.complete === false && small.complete === true && large.total === 20000,
  JSON.stringify({ complete: large.complete, total: large.total }));

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
