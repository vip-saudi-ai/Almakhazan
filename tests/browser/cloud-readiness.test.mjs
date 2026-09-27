// Browser test for the cloud-readiness layer: the query contract, the kept
// aggregates, the query-driven assistant and health score, streaming CSV, the
// dormant sync queue, the query cache — and a contract test holding the device
// backend and a mock cloud backend to the same answers.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/cloud-readiness.test.mjs

import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const COUNT = 3000;

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase|\[assistant\]|\[repo\]/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await page.route('**/src/subscription.js', (r) => r.fulfill({ contentType: 'text/javascript', body: planStub({ planId: 'business' }) }));
// Firebase must never be asked for anything in the device-only release.
const firebaseRequests = [];
page.on('request', (r) => { if (!r.url().startsWith(BASE) && /firebase|googleapis|gstatic/.test(r.url())) firebaseRequests.push(r.url()); });
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });

// ── an inventory written the way an older version wrote it: no derived fields ──
const seed = await page.evaluate(async ({ count }) => {
  const { repository } = await import('/src/repository.js');
  const local = await import('/src/local-store.js');
  const folder = await repository.saveFolder({ name: 'الخزنة', icon: '🗂', color: '#2563FF' });
  const location = await repository.saveLocation({ name: 'مستودع الرياض' });
  const now = Date.now();
  const YEAR = 365 * 24 * 3600 * 1000;
  const cats = ['equipment_tools', 'art_paintings', 'uncategorized', 'electronics_devices'];
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const currency = i % 7 === 0 ? 'USD' : 'SAR';
    rows.push({
      id: 'cr' + String(i).padStart(5, '0'),
      name: i % 97 === 0 ? `مولد كهربائي ${i}` : `قطعة ${i}`,
      brand: i % 11 === 0 ? 'Honda' : '',
      quantity: (i % 4) + 1, unit: 'قطعة',
      categoryId: cats[i % cats.length],
      folderId: i % 10 === 0 ? folder.id : null,
      locationId: i % 3 === 0 ? location.id : null,
      sku: `CR-${String(i).padStart(5, '0')}`,
      barcode: i % 50 === 0 ? '6281000000001' : String(6281000100000 + i),
      serialNumber: i === 5 || i === 6 ? 'SN-TWIN-0001' : `SN-${i}`,
      condition: i % 5 === 0 ? 'ممتازة' : '',
      valuation: i % 2 === 0 ? { min: 100 + i, max: 200 + i, currency, source: 'manual' } : null,
      description: i % 13 === 0 ? '=HYPERLINK("http://x")' : '',
      images: i % 4 === 0 ? [{ id: `img${i}`, mediaId: `img${i}`, storagePath: `local/img${i}` }] : [],
      deletedAt: i % 29 === 0 ? now - 1000 : null,
      createdAt: now - i * 1000, updatedAt: i % 17 === 0 ? now - 2 * YEAR : now - i * 1000, version: 1,
    });
  }
  await local.putMany('items', rows);
  // Forget any aggregate and backfill state: the start must rebuild both.
  await local.remove('aggregates', 'inventory');
  await local.remove('meta', 'items.indexFields').catch(() => {});
  return { folderId: folder.id, locationId: location.id };
}, { count: COUNT });

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
// Polled from here: waitForFunction treats an async predicate's promise as truthy.
for (let tries = 0; ; tries += 1) {
  const ready = await page.evaluate(async () => (await import('/src/repository.js')).repository.indexFieldsReady === true);
  if (ready) break;
  if (tries > 240) throw new Error('index fields never became ready');
  await page.waitForTimeout(250);
}
await page.evaluate((value) => { window.__seed = value; }, seed);

// ── the query contract ─────────────────────────────────────────────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const codes = [];
    for (const bad of [
      { filters: { 'name.__proto__': 'x' } },
      { filters: { notAField: 1 } },
      { filters: { quantity: { regex: '.*' } } },
      { limit: 5000 },
      { sort: { field: 'valuation', direction: 'desc' } },
      { filters: { valuationMidpoint: { gt: 1 } } },
      { cursor: 'garbage' },
    ]) {
      try { await repository.queryItems(bad); codes.push('accepted'); } catch (e) { codes.push(e.code); }
    }
    // A cursor from one query is refused by another.
    const a = await repository.queryItems({ limit: 5 });
    let foreign;
    try { await repository.queryItems({ limit: 5, sort: { field: 'name', direction: 'asc' }, cursor: a.nextCursor }); foreign = 'accepted'; } catch (e) { foreign = e.code; }
    return { codes, foreign };
  });
  check('C1 fields, operators, page size, orders and cursors outside the contract are refused',
    r.codes.every((c) => c === 'query/invalid'), JSON.stringify(r.codes));
  check('C2 a cursor spent on another query is refused', r.foreign === 'query/invalid', r.foreign);
}

{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { nameSortKey } = await import('/src/search.js');
    const walk = async (spec) => {
      const ids = [];
      let cursor = null;
      let pages = 0;
      let maxScanned = 0;
      do {
        const page = await repository.queryItems({ ...spec, limit: 97, cursor });
        ids.push(...page.items);
        cursor = page.nextCursor;
        pages += 1;
        maxScanned = Math.max(maxScanned, page.meta.scanned);
      } while (cursor && pages < 200);
      return { ids, pages, maxScanned };
    };
    const byName = await walk({ sort: { field: 'name', direction: 'asc' }, projection: 'list' });
    const keys = byName.ids.map((i) => nameSortKey(i.name));
    const ordered = keys.every((k, i) => i === 0 || keys[i - 1] <= k);
    const live = (await repository.countItemsMatching({})).count;
    const byValue = await walk({ filters: { valuationCurrency: 'SAR' }, sort: { field: 'valuation', direction: 'desc' } });
    const values = byValue.ids.map((i) => (i.valuation.min + i.valuation.max) / 2);
    const trash = await repository.countItemsMatching({ filters: { deleted: true } });
    const projectedKeys = Object.keys(byName.ids[0]);
    return {
      n: byName.ids.length, distinct: new Set(byName.ids.map((i) => i.id)).size, live, ordered,
      pages: byName.pages, maxScanned: byName.maxScanned,
      valueOrdered: values.every((v, i) => i === 0 || values[i - 1] >= v),
      valueAllSar: byValue.ids.every((i) => i.valuation.currency === 'SAR'),
      trash: trash.count,
      projectedOnly: !projectedKeys.includes('description') && projectedKeys.includes('name'),
    };
  });
  check('C3 walking every page by name returns every live record once', r.n === r.live && r.distinct === r.live, JSON.stringify(r));
  check('C4 in name order, numbers compared as numbers', r.ordered);
  check('C5 each page reads about a page, not the inventory', r.maxScanned < 400, `max scanned ${r.maxScanned}`);
  check('C6 value order is within one currency, highest first', r.valueOrdered && r.valueAllSar);
  check('C7 the Trash is its own question', r.trash === Math.ceil(COUNT / 29), String(r.trash));
  check('C8 the list projection leaves out what a row does not draw', r.projectedOnly);
}

{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const bySku = await repository.searchItems('CR-00042');
    const byWord = await repository.searchItems('مولد', { limit: 200 });
    const byBrand = await repository.searchItems('honda', { limit: 200 });
    return {
      sku: bySku.items.map((i) => i.id),
      words: byWord.items.length, wordsOk: byWord.items.every((i) => i.name.includes('مولد')),
      brand: byBrand.items.length, strategy: byWord.meta.strategy,
    };
  });
  check('C9 an identifier is found by search', r.sku.includes('cr00042'), JSON.stringify(r.sku));
  check('C10 a word of the name finds exactly those records, from the token index',
    r.wordsOk && r.words > 0 && /text/.test(r.strategy), JSON.stringify(r));
  check('C11 a brand is a search word too', r.brand > 0, String(r.brand));
}

// ── aggregates ─────────────────────────────────────────────────────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const before = await repository.getInventoryOverview();
    const item = await repository.createItem({ name: 'مولد اختبار', quantity: 3, categoryId: 'equipment_tools', valuation: { min: 1000, max: 1000, currency: 'EUR', source: 'manual' } });
    const fresh = await repository.getItem(item.id);
    await repository.updateItem(item.id, { quantity: 5 }, fresh.version);
    const afterEdit = await repository.getItem(item.id);
    await repository.deleteItem(item.id, afterEdit.version);
    const incremental = await repository.getInventoryOverview();
    await repository.rebuildAggregates();
    const rebuilt = await repository.getInventoryOverview();
    // Key order is not part of the answer.
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
    const strip = (o) => JSON.stringify(canon({ ...o, builtAt: null }));
    const rows = await local.getAll('items');
    const live = rows.filter((i) => !i.deletedAt);
    return {
      before: before.totalItems, equal: strip(incremental) === strip(rebuilt),
      live: live.length, total: rebuilt.totalItems,
      qty: live.reduce((n, i) => n + (Number(i.quantity) || 0), 0), totalQty: rebuilt.totalQuantity,
      currencies: rebuilt.valuationByCurrency.map((c) => c.currency),
    };
  });
  check('A1 the kept aggregate equals a rebuild after create, edit and trash', r.equal);
  check('A2 and it is the inventory, exactly', r.live === r.total && r.qty === r.totalQty, JSON.stringify(r));
  check('A3 values stay per currency', r.currencies.includes('SAR') && r.currencies.includes('USD'), JSON.stringify(r.currencies));
}

// ── the assistant and health, through the repository ──────────────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const { askRepository, inventoryHealthSnapshot } = await import('/src/insights.js');
    const { askInventory } = await import('/src/ask.js');
    const { inventoryHealth } = await import('/src/health.js');
    const { normalizeItem } = await import('/src/validation.js');
    const lookups = {
      categories: repository.state.categories, taxonomy: repository.taxonomy(),
      locations: repository.state.locations, folders: repository.state.folders,
    };
    const loadedBefore = repository.state.items.length;
    const all = (await local.getAll('items')).map(normalizeItem).filter((i) => !i.deletedAt);
    const questions = ['قطع بدون صور', 'قطع بدون موقع', 'قطع بدون تصنيف', 'ما تم تحديثها من سنة', 'كم عندي', 'إجمالي القيمة', 'وين مولد', 'قطع قيمتها فوق 1000 ريال', 'مستودع الرياض'];
    const rows = [];
    for (const q of questions) {
      const a = await askRepository(q, { lookups });
      const b = askInventory(q, { items: all, lookups });
      rows.push({ q, a: a.answer, b: b.answer, ta: a.total ?? null, tb: b.total ?? (b.items?.length ?? null), same: a.answer === b.answer });
    }
    const snapshot = await inventoryHealthSnapshot();
    const reference = inventoryHealth(all, { classify: (i) => repository.classification(i) });
    return {
      rows, loadedBefore, loadedAfter: repository.state.items.length, complete: repository.itemsComplete,
      score: [snapshot.score, reference.score],
      counts: [snapshot.counts, reference.counts],
      dups: [snapshot.counts.duplicateGroups, reference.counts.duplicateGroups],
    };
  });
  for (const row of r.rows) check(`S «${row.q}» the same answer as the reference`, row.same, `${row.a} | ${row.b}`);
  check('S1 the health score from counts equals the score from every record', r.score[0] === r.score[1], JSON.stringify(r.score));
  const keys = ['total', 'missingImages', 'missingLocation', 'missingCategory', 'missingCondition', 'stale'];
  check('S2 and so does every count behind it', keys.every((k) => r.counts[0][k] === r.counts[1][k]),
    JSON.stringify(keys.map((k) => [k, r.counts[0][k], r.counts[1][k]])));
  check('S3 duplicates are found from the identifier indexes', r.dups[0] === r.dups[1] && r.dups[0] > 0, JSON.stringify(r.dups));
  check('S4 answering loaded nothing into the window', r.loadedAfter <= Math.max(200, r.loadedBefore) && !r.complete, JSON.stringify([r.loadedBefore, r.loadedAfter, r.complete]));
}

// ── navigation never loads the whole inventory ────────────────────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { goTab } = await import('/src/navigation.js');
    let calls = 0;
    const original = repository.completeItems.bind(repository);
    repository.completeItems = (...args) => { calls += 1; return original(...args); };
    for (const tab of ['ov', 'ai', 'home', 'set', 'cats', 'ov', 'ai', 'home']) {
      goTab(tab);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const overviewText = document.getElementById('ov-scroll')?.textContent || '';
    const aiText = document.getElementById('ai-scroll')?.textContent || '';
    repository.completeItems = original;
    return { calls, overview: overviewText.length, ai: aiText.length, complete: repository.itemsComplete };
  });
  check('N1 Overview, Assistant, Inventory and Settings open without loading every record', r.calls === 0 && !r.complete, JSON.stringify(r));
  check('N2 and they have content', r.overview > 50 && r.ai > 50, JSON.stringify(r));
}

// ── a question handed to the inventory screen ─────────────────────────────
{
  const r = await page.evaluate(async () => {
    const { applyAssistantFilter } = await import('/src/views/home.js');
    const { queryInventory } = await import('/src/query.js');
    const { repository } = await import('/src/repository.js');
    applyAssistantFilter({ label: 'x', query: { filters: { hasImages: false } } });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const first = await queryInventory({ spec: { filters: { hasImages: false } }, perPage: 24 });
    const second = await queryInventory({ spec: { filters: { hasImages: false } }, perPage: 24, page: 2 }, { cursor: first.nextCursor });
    const expected = (await repository.countItemsMatching({ filters: { hasImages: false } })).count;
    const banner = document.getElementById('assistant-banner')?.textContent || '';
    const { clearAssistantFilter } = await import('/src/views/home.js');
    clearAssistantFilter();
    return {
      total: first.total, expected, n1: first.rows.length, n2: second.rows.length,
      overlap: first.rows.filter((a) => second.rows.some((b) => b.id === a.id)).length,
      noImages: [...first.rows, ...second.rows].every((i) => !i.images?.length), banner,
    };
  });
  check('H1 the handed-over question is paged through the repository', r.total === r.expected && r.n1 === 24 && r.n2 === 24 && r.overlap === 0, JSON.stringify(r));
  check('H2 every row answers it', r.noImages);
}

// ── CSV export ─────────────────────────────────────────────────────────────
{
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.evaluate(async () => {
      delete window.showSaveFilePicker;
      const { exportCsv } = await import('/src/export-service.js');
      window.__csvJob = await exportCsv();
    }),
  ]);
  const path = await download.path();
  const fs = await import('node:fs');
  const text = fs.readFileSync(path, 'utf8');
  const job = await page.evaluate(() => ({ status: window.__csvJob.status, rows: window.__csvJob.result?.rows, jobId: window.__csvJob.jobId }));
  const live = await page.evaluate(async () => (await (await import('/src/repository.js')).repository.countItemsMatching({})).count);
  const lines = text.split('\r\n').filter(Boolean);
  check('E1 CSV export runs as a job and writes every live record', job.status === 'completed' && job.rows === live && lines.length === live + 1 && /^job_/.test(job.jobId), JSON.stringify({ job, lines: lines.length, live }));
  check('E2 with a byte-order mark for spreadsheet programs', text.charCodeAt(0) === 0xfeff);
  check('E3 formula-like text is neutralised', text.includes(`"'=HYPERLINK(""http://x"")"`) && !/,=HYPERLINK/.test(text));
  const advice = await page.evaluate(async () => {
    const { exportAdvice, EXPORT_LIMITS } = await import('/src/export-service.js');
    return { xlsx: await exportAdvice('xlsx'), limits: EXPORT_LIMITS };
  });
  check('E4 formats built in memory carry a size limit', advice.limits.xlsx > 0 && advice.xlsx.overLimit === false, JSON.stringify(advice));
}

// ── the sync queue is dormant ──────────────────────────────────────────────
{
  const r = await page.evaluate(async () => {
    const sync = await import('/src/sync-queue.js');
    const local = await import('/src/local-store.js');
    const queued = await sync.enqueueMutation({ entityType: 'item', entityId: 'cr00001', op: 'update', payload: { name: 'x' }, baseVersion: 1 });
    const stored = await local.count('mutations');
    const m = sync.createMutation({ entityType: 'item', entityId: 'cr00001', op: 'update', payload: { name: 'x' }, baseVersion: 3 });
    let invalid;
    try { sync.createMutation({ entityType: 'item', entityId: 'a', op: 'explode' }); invalid = 'accepted'; } catch (e) { invalid = e.code; }
    return {
      queued, stored, active: sync.syncQueueActive(),
      roundTrip: JSON.stringify(JSON.parse(JSON.stringify(m))) === JSON.stringify(m),
      conflicts: [
        sync.detectConflict(m, { exists: true, version: 3 }).kind,
        sync.detectConflict(m, { exists: true, version: 4 }).kind,
        sync.detectConflict(m, { exists: false }).kind,
        sync.detectConflict({ ...m, op: 'create' }, { exists: true, version: 1 }).kind,
      ],
      invalid,
    };
  });
  check('Q1 with cloud off nothing is queued and the store stays empty', r.queued === null && r.stored === 0 && r.active === false, JSON.stringify(r));
  check('Q2 a mutation is plain serializable data', r.roundTrip);
  check('Q3 conflicts are detected by base version', JSON.stringify(r.conflicts) === JSON.stringify(['none', 'stale-base', 'deleted-remotely', 'already-exists']), JSON.stringify(r.conflicts));
  check('Q4 an unknown operation is refused', r.invalid === 'sync/invalid', r.invalid);
}

// ── the query cache ────────────────────────────────────────────────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const spec = { filters: { folderId: window.__seed.folderId }, limit: 10, sort: { field: 'createdAt', direction: 'desc' } };
    const a = await repository.queryItems(spec);
    const b = await repository.queryItems(spec);
    const target = await repository.getItem(a.items[0].id);
    await repository.updateItem(target.id, { name: 'اسم بعد التعديل' }, target.version);
    const c = await repository.queryItems(spec);
    return {
      cachedSame: JSON.stringify(a.items) === JSON.stringify(b.items),
      sizeBounded: repository.queryCache.size <= 30,
      seesWrite: c.items.find((i) => i.id === target.id)?.name,
    };
  });
  check('K1 a repeated query is answered the same', r.cachedSame);
  check('K2 and a write is never hidden by the cache', r.seesWrite === 'اسم بعد التعديل', r.seesWrite);
  check('K3 the cache is bounded', r.sizeBounded);
}

// ── contract: the device backend and a mock cloud backend agree ────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const { validateQuerySpec, matchesSpec, compareForSort, encodeSpecCursor, decodeSpecCursor, project } = await import('/src/query-spec.js');
    const { searchTokensOf } = await import('/src/item-index.js');
    const { normalizeItem } = await import('/src/validation.js');
    // A server that holds the records and answers the contract — what the
    // cloud backend must be — built from the contract's reference semantics
    // and nothing of the device engine.
    const records = (await local.getAll('items')).map(normalizeItem);
    const mock = {
      queryItems(spec) {
        const found = records.filter((i) => matchesSpec(i, spec, searchTokensOf)).sort(compareForSort(spec.sort));
        const at = decodeSpecCursor(spec)?.offset || 0;
        const items = found.slice(at, at + spec.limit);
        const more = at + spec.limit < found.length;
        return { items: items.map((i) => project(i, spec.projection)), nextCursor: more ? encodeSpecCursor(spec, { offset: at + spec.limit }) : null, hasMore: more, total: found.length };
      },
      countItemsMatching(spec) { return { count: records.filter((i) => matchesSpec(i, spec, searchTokensOf)).length }; },
    };
    const specs = [
      {},
      { sort: { field: 'name', direction: 'asc' } },
      { sort: { field: 'name', direction: 'desc' } },
      { sort: { field: 'updatedAt', direction: 'asc' } },
      { filters: { folderId: window.__seed.folderId } },
      { filters: { locationId: { exists: false } }, sort: { field: 'name', direction: 'asc' } },
      { filters: { hasImages: false, categoryId: 'art_paintings' } },
      { filters: { valuationCurrency: 'USD' }, sort: { field: 'valuation', direction: 'asc' } },
      { filters: { valuationCurrency: 'SAR', valuationMidpoint: { gt: 1500 } } },
      { filters: { deleted: true } },
      { filters: { condition: 'ممتازة', quantity: { gte: 3 } } },
      { text: 'مولد' },
      { text: 'CR-0004' },
      { filters: { updatedAt: { lt: Date.now() - 365 * 24 * 3600 * 1000 } } },
      { filters: { categoryId: { in: ['uncategorized', 'art_paintings'] } }, sort: { field: 'createdAt', direction: 'asc' } },
    ];
    const out = [];
    for (const input of specs) {
      const walk = async (backend) => {
        const ids = [];
        let cursor = null;
        let guard = 0;
        do {
          const spec = validateQuerySpec({ ...input, limit: 83, cursor });
          const page = await backend.queryItems(spec, { indexReady: true });
          ids.push(...page.items.map((i) => i.id));
          cursor = page.nextCursor;
        } while (cursor && ++guard < 100);
        return ids;
      };
      const a = await walk(repository.backend);
      const b = await walk(mock);
      const ca = (await repository.backend.countItemsMatching(validateQuerySpec(input), { indexReady: true })).count;
      const cb = mock.countItemsMatching(validateQuerySpec(input)).count;
      out.push({ spec: JSON.stringify(input), same: a.length === b.length && a.every((id, i) => id === b[i]), n: [a.length, b.length], counts: [ca, cb] });
    }
    return out;
  });
  for (const row of r) {
    check(`K ${row.spec} — device and cloud return the same records in the same order, and the same count`,
      row.same && row.counts[0] === row.counts[1] && row.counts[0] === row.n[0], JSON.stringify({ n: row.n, counts: row.counts }));
  }
}

// ── clear inventory is bounded ─────────────────────────────────────────────
{
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    let calls = 0;
    const original = repository.completeItems.bind(repository);
    repository.completeItems = (...args) => { calls += 1; return original(...args); };
    await repository.clearInventory();
    repository.completeItems = original;
    const overview = await repository.getInventoryOverview();
    const left = (await repository.countItemsMatching({})).count;
    return { calls, total: overview.totalItems, trashed: overview.trashedItems, left };
  });
  check('X1 clearing the inventory never loads it', r.calls === 0, JSON.stringify(r));
  check('X2 and leaves nothing, the aggregate agreeing', r.left === 0 && r.total === 0 && r.trashed === 0, JSON.stringify(r));
}

check('F1 no request to Firebase or Google in the device-only release', firebaseRequests.length === 0, firebaseRequests.slice(0, 2).join(' '));
check('F2 no JS errors', errs.length === 0, errs.slice(0, 3).join(' / '));
await context.close();
await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
