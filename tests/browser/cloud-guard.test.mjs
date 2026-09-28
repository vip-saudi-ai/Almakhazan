// A cloud workspace is never downloaded whole because a screen lacks a
// server-side answer.
//
// The repository is pointed at a mock cloud backend: it answers the query
// contract, counts and aggregates from records it holds (as a server would),
// declares the cloud's capabilities, and its whole-collection read throws
// UNBOUNDED_READ_FORBIDDEN. Every ordinary screen and function is then run
// against it, and none may reach that read.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/cloud-guard.test.mjs

import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase|\[overview\]|\[assistant\]|\[home\]|\[repo\]/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await page.route('**/src/subscription.js', (r) => r.fulfill({ contentType: 'text/javascript', body: planStub({ planId: 'business' }) }));
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });

// More records than the window holds, so the window is not the inventory.
await page.evaluate(async () => {
  const local = await import('/src/local-store.js');
  const { repository } = await import('/src/repository.js');
  const folder = await repository.saveFolder({ name: 'مستودع', icon: '🗂', color: '#2563FF' });
  const rows = [];
  for (let i = 0; i < 650; i += 1) {
    rows.push({
      id: 'cg' + String(i).padStart(4, '0'), name: i % 50 === 0 ? `ساعة رولكس ${i}` : `قطعة ${i}`, brand: i % 50 === 0 ? 'Rolex' : '',
      quantity: 1, unit: 'قطعة', categoryId: i % 2 ? 'jewellery_watches' : 'uncategorized', folderId: i % 5 === 0 ? folder.id : null,
      barcode: i % 97 === 0 ? '6281000000001' : String(6281000200000 + i), sku: `CG-${i}`,
      valuation: i % 3 === 0 ? { min: 100, max: 200, currency: 'SAR', source: 'manual' } : null,
      images: [], createdAt: Date.now() - i * 1000, updatedAt: Date.now() - i * 1000, version: 1, deletedAt: null,
    });
  }
  await local.putMany('items', rows);
  await local.remove('aggregates', 'inventory');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
for (let tries = 0; ; tries += 1) {
  const ready = await page.evaluate(async () => (await import('/src/repository.js')).repository.indexFieldsReady === true);
  if (ready) break;
  if (tries > 200) throw new Error('index fields never became ready');
  await page.waitForTimeout(250);
}

// ── the mock cloud ─────────────────────────────────────────────────────────
await page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  const local = await import('/src/local-store.js');
  const { useQueryAdapter } = await import('/src/query.js');
  const { matchesSpec, compareForSort, encodeSpecCursor, decodeSpecCursor, project } = await import('/src/query-spec.js');
  const { searchTokensOf } = await import('/src/item-index.js');
  const { normalizeItem } = await import('/src/validation.js');
  const records = (await local.getAll('items')).map(normalizeItem);
  const aggregate = await repository.backend.inventoryAggregate();
  const device = repository.backend;
  const calls = { scanAll: 0, completeItems: 0, queryItems: 0, countItemsMatching: 0, aggregateItems: 0, inventoryAggregate: 0, duplicateCandidates: 0 };
  const matching = (spec) => records.filter((i) => matchesSpec(i, spec, searchTokensOf));
  const mock = {
    capabilities: Object.freeze({ serverQueries: true, aggregates: true, search: true, duplicateCandidates: false, fullExport: true, wholeInventoryRead: false }),
    keepsAggregates: false,
    serveAggregate: true,
    async scanAll() { calls.scanAll += 1; throw new Error('UNBOUNDED_READ_FORBIDDEN'); },
    async queryItems(spec) {
      calls.queryItems += 1;
      const found = matching(spec).sort(compareForSort(spec.sort));
      const at = decodeSpecCursor(spec)?.offset || 0;
      const items = found.slice(at, at + spec.limit);
      const more = at + spec.limit < found.length;
      return { items: items.map((i) => project(i, spec.projection)), nextCursor: more ? encodeSpecCursor(spec, { offset: at + spec.limit }) : null, hasMore: more, total: null, meta: { source: 'mock-cloud' } };
    },
    async countItemsMatching(spec) { calls.countItemsMatching += 1; return { count: matching(spec).length }; },
    async aggregateItems(spec) {
      calls.aggregateItems += 1;
      const found = matching(spec);
      const byCurrency = {};
      for (const i of found) if (i.valuation) {
        const e = byCurrency[i.valuation.currency] ||= { count: 0, total: 0 };
        e.count += 1; e.total += (i.valuation.min + i.valuation.max) / 2;
      }
      return { count: found.length, quantity: found.reduce((n, i) => n + i.quantity, 0), byCurrency };
    },
    async inventoryAggregate() { calls.inventoryAggregate += 1; return mock.serveAggregate ? aggregate : null; },
    async duplicateCandidates() { calls.duplicateCandidates += 1; return null; },
    async countItemsByField(field, value) { return records.filter((i) => i[field] === value).length; },
    async currenciesPresent() { return null; },
    watch: (...a) => device.watch(...a),
    watchWindow: (...a) => device.watchWindow(...a),
  };
  const original = repository.completeItems.bind(repository);
  repository.completeItems = (...args) => { calls.completeItems += 1; return original(...args); };
  window.__cloud = { mock, calls, device, original };
  repository.backend = mock;
  useQueryAdapter('memory');
});

const H = "const { repository } = await import('/src/repository.js'); const c = window.__cloud;";
const run = (body, arg) => page.evaluate(new Function('arg', `return (async () => { ${H} ${body} })();`), arg);
const reset = () => run('for (const k of Object.keys(c.calls)) c.calls[k] = 0;');

const base = await run('return { complete: repository.itemsComplete, held: repository.state.items.length, caps: repository.capabilities };');
check('G0 the window is not the inventory, and the backend declares no whole-inventory read',
  base.complete === false && base.held <= 250 && base.caps.wholeInventoryRead === false, JSON.stringify(base));

// completeItems itself
await reset();
const direct = await run(`
  let code = null;
  try { await c.original(); } catch (e) { code = e.code; }
  let purposeCode = null;
  try { await c.original({ purpose: 'overview' }); } catch (e) { purposeCode = e.code; }
  return { code, purposeCode, scans: c.calls.scanAll };`);
check('G1 completeItems() without an explicit whole-dataset purpose is refused before any read',
  direct.code === 'repo/unbounded-read' && direct.purposeCode === 'repo/unbounded-read' && direct.scans === 0, JSON.stringify(direct));

// Overview, aggregate available
await reset();
const ov = await run(`
  const o = await repository.getInventoryOverview();
  const { renderOverview } = await import('/src/views/overview.js');
  const { goTab } = await import('/src/navigation.js');
  goTab('ov'); await renderOverview(); await new Promise((r) => setTimeout(r, 300));
  return { total: o?.totalItems, text: document.getElementById('ov-scroll').innerText.slice(0, 200), calls: { ...c.calls } };`);
check('G2 Overview with a server aggregate: the totals, no whole read',
  ov.total === 650 && ov.calls.completeItems === 0 && ov.calls.scanAll === 0 && ov.calls.inventoryAggregate > 0 && /650/.test(ov.text), JSON.stringify(ov).slice(0, 300));

// Overview, aggregate unavailable
await reset();
const ovNone = await run(`
  c.mock.serveAggregate = false;
  const o = await repository.getInventoryOverview();
  const { renderOverview } = await import('/src/views/overview.js');
  await renderOverview(); await new Promise((r) => setTimeout(r, 200));
  return { overview: o, text: document.getElementById('ov-scroll').innerText, calls: { ...c.calls } };`);
check('G3 Overview without an aggregate: "not available", never a count of the window, no whole read',
  ovNone.overview === null && ovNone.calls.completeItems === 0 && ovNone.calls.scanAll === 0
  && /غير متاحة|not available/i.test(ovNone.text) && !/650|200/.test(ovNone.text), JSON.stringify(ovNone).slice(0, 300));

// Assistant: health and a question, aggregate unavailable then available
await reset();
const ai = await run(`
  const { goTab } = await import('/src/navigation.js');
  goTab('ai'); await new Promise((r) => setTimeout(r, 800));
  const text = document.getElementById('ai-scroll').innerText;
  const { inventoryHealthSnapshot } = await import('/src/insights.js');
  const health = await inventoryHealthSnapshot();
  return { text: text.slice(0, 400), health, calls: { ...c.calls }, tab: document.querySelector('#v-ai.active') != null };`);
check('G4 Assistant and Health without an aggregate: the tab opens, health says it is unavailable, no whole read',
  ai.tab && ai.health === null && ai.calls.completeItems === 0 && ai.calls.scanAll === 0 && /لا يمكن حساب|cannot be worked out/.test(ai.text), JSON.stringify(ai).slice(0, 400));

await reset();
const ask = await run(`
  c.mock.serveAggregate = true;
  const { askRepository } = await import('/src/insights.js');
  const lookups = { categories: repository.state.categories, taxonomy: repository.taxonomy(), locations: repository.state.locations, folders: repository.state.folders };
  const count = await askRepository('كم عدد القطع؟', { lookups });
  const sum = await askRepository('كم إجمالي قيمة المخزون بالريال؟', { lookups });
  const rolex = await askRepository('كم ساعة رولكس؟', { lookups });
  const { inventoryHealthSnapshot } = await import('/src/insights.js');
  const health = await inventoryHealthSnapshot();
  return { count: count?.text || count?.answer || JSON.stringify(count).slice(0, 120), sum: JSON.stringify(sum).slice(0, 200), rolex: JSON.stringify(rolex).slice(0, 200),
    score: health?.score, duplicatesKnown: health?.duplicatesKnown, calls: { ...c.calls } };`);
check('G5 Assistant questions go to the query, count and aggregate calls; no whole read',
  ask.calls.completeItems === 0 && ask.calls.scanAll === 0 && (ask.calls.queryItems + ask.calls.countItemsMatching + ask.calls.aggregateItems) > 0, JSON.stringify(ask).slice(0, 500));
check('G6 Health from the server aggregate and counts; duplicates marked unknown, not guessed',
  typeof ask.score === 'number' && ask.duplicatesKnown === false && ask.calls.duplicateCandidates > 0, JSON.stringify({ score: ask.score, dk: ask.duplicatesKnown }));

// Search and filters on the Inventory screen
await reset();
const search = await run(`
  const { queryInventory } = await import('/src/query.js');
  const { withFullInventory } = await import('/src/inventory-load.js');
  const narrowed = await queryInventory({ search: 'رولكس' }, { ensure: () => withFullInventory('') });
  const byText = await repository.searchItems('Rolex', { limit: 20 });
  const code = await queryInventory({ search: 'CG-4' }, { ensure: () => withFullInventory('') });
  return { answerable: narrowed?.answerable, complete: narrowed?.complete, found: byText.items.length, codeAnswerable: code?.answerable, calls: { ...c.calls } };`);
check('G7 Search goes to the search contract; a question the window cannot answer is marked unanswered, not downloaded',
  search.found === 13 && search.calls.completeItems === 0 && search.calls.scanAll === 0 && search.answerable === false, JSON.stringify(search));

// Folder, category and location counts
await reset();
const counts = await run(`
  const { inventoryCounts } = await import('/src/query.js');
  const r = await inventoryCounts();
  const folder = repository.state.folders.find((f) => f.name === 'مستودع');
  return { complete: r.complete, folder: r.folders.get(folder.id), watches: r.categories.get('jewellery_watches'), calls: { ...c.calls } };`);
check('G8 Folder and category counts come from the aggregate, whole and exact; no whole read',
  counts.complete === true && counts.folder === 130 && counts.watches === 325 && counts.calls.completeItems === 0 && counts.calls.scanAll === 0, JSON.stringify(counts));
await reset();
const countsNone = await run(`
  c.mock.serveAggregate = false;
  const { inventoryCounts } = await import('/src/query.js');
  const r = await inventoryCounts();
  c.mock.serveAggregate = true;
  return { complete: r.complete, calls: { ...c.calls } };`);
check('G9 without an aggregate the counts are marked incomplete (no number drawn), no whole read',
  countsNone.complete === false && countsNone.calls.completeItems === 0 && countsNone.calls.scanAll === 0, JSON.stringify(countsNone));

// Duplicates
await reset();
const dups = await run(`
  const r = await repository.duplicateCandidates();
  return { r, calls: { ...c.calls } };`);
check('G10 Duplicate candidates: the backend is asked, "unknown" is the answer, no whole read',
  dups.r === null && dups.calls.duplicateCandidates === 1 && dups.calls.completeItems === 0 && dups.calls.scanAll === 0, JSON.stringify(dups));

// Home, Inventory, Trash, Categories and Settings, and the "show all" line
await reset();
const screens = await run(`
  const { goTab } = await import('/src/navigation.js');
  for (const tab of ['home', 'ov', 'ai', 'home']) { goTab(tab); await new Promise((r) => setTimeout(r, 400)); }
  const { openTrashSheet } = await import('/src/views/manage.js');
  await openTrashSheet(); await new Promise((r) => setTimeout(r, 600));
  const trashText = document.getElementById('trash-list')?.innerText || '';
  (await import('/src/ui.js')).closeSheet('trash');
  const { partialNotice } = await import('/src/inventory-load.js');
  const note = partialNotice(() => {});
  return { calls: { ...c.calls }, loadAllOffered: Boolean(note?.querySelector('button')), trash: trashText.slice(0, 80) };`);
check('G11 Home, Overview, Assistant and Trash open without a whole read', screens.calls.completeItems === 0 && screens.calls.scanAll === 0, JSON.stringify(screens.calls));
check('G12 "Show all" is not offered for a cloud workspace', screens.loadAllOffered === false, String(screens.loadAllOffered));

// An explicit whole-dataset job is allowed to ask — and the mock refuses it
await reset();
const exportRun = await run(`
  const { withFullInventory } = await import('/src/inventory-load.js');
  const ok = await withFullInventory('', { purpose: 'export' });
  return { ok, calls: { ...c.calls } };`);
check('G13 a user-requested export is the one path that may ask for every record (here the mock refuses it and the export stops)',
  exportRun.ok === false && exportRun.calls.scanAll === 1, JSON.stringify(exportRun));

// Put the device back
await run(`repository.backend = c.device; repository.completeItems = c.original; (await import('/src/query.js')).useQueryAdapter('indexeddb');`);
const localOk = await run(`const o = await repository.getInventoryOverview(); return { total: o?.totalItems, caps: repository.capabilities.wholeInventoryRead };`);
check('G14 the device backend keeps its whole-inventory capability and its aggregate', localOk.total === 650 && localOk.caps === true, JSON.stringify(localOk));

const unexpected = errs.filter((e) => !/UNBOUNDED_READ_FORBIDDEN|unbounded-read/.test(e));
check('G15 no JS errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));

await context.close();
await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach((f) => console.log('  ✗', f)); process.exit(1); }
