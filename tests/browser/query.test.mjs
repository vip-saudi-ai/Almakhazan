// Browser test for the query engine at the plan ceiling.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/query.test.mjs
//
// The claim under test is the one this pass exists to make true: browsing a
// 20,000-record workspace reads the records it shows, not the records it has.
// So every check here asserts a *cost*, not just an answer — which index was
// used, and how many records were examined to fill a page. An answer that is
// right but was reached by reading everything is the failure being tested for.

import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const COUNT = 20000;
const IN_FOLDER = 740;
const IN_CATEGORY = 512;
const IN_LOCATION = 310;

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await page.route('**/src/subscription.js', r => r.fulfill({
  contentType: 'text/javascript', body: planStub({ planId: 'business' }),
}));
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });

// ── 20,000 records ─────────────────────────────────────────────────────────
const seeded = await page.evaluate(async ({ count, inFolder, inCategory, inLocation }) => {
  const { repository } = await import('/src/repository.js');
  const local = await import('/src/local-store.js');

  const folder = await repository.saveFolder({ name: 'الخزنة', icon: '🗂', color: '#2563FF' });
  const location = await repository.saveLocation({ name: 'المستودع الشمالي' });
  const category = await repository.saveCategory({ name: 'ساعات', icon: '⌚' });
  const now = Date.now();

  for (let start = 0; start < count; start += 1000) {
    const rows = [];
    for (let i = start; i < Math.min(count, start + 1000); i += 1) {
      rows.push({
        id: 'q' + String(i).padStart(6, '0'),
        name: i === count - 1 ? 'أسطرلاب نحاسي نادر' : `قطعة ${i}`,
        quantity: 1, unit: 'قطعة',
        categoryId: i < inCategory ? category.id : 'art_paintings',
        // The folder sits at the far end of the inventory, so reaching it
        // from a newest-first window would mean reading everything.
        folderId: i >= count - inFolder ? folder.id : null,
        // The location band sits just before it and stays unfiled, because
        // browsing the root shows unfiled records — a location filter narrows
        // that scope rather than replacing it.
        locationId: (i >= count - inFolder - inLocation && i < count - inFolder) ? location.id : null,
        sku: `INV-2026-${String(i).padStart(6, '0')}`,
        barcode: String(6281000000000 + i),
        serialNumber: `SN-${String(i).padStart(7, '0')}`,
        condition: i % 5 === 0 ? 'ممتازة' : '',
        images: [], deletedAt: null,
        createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1,
      });
    }
    await local.putMany('items', rows);
  }
  return { folderId: folder.id, locationId: location.id, categoryId: category.id };
}, { count: COUNT, inFolder: IN_FOLDER, inCategory: IN_CATEGORY, inLocation: IN_LOCATION });

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
await page.evaluate((ids) => Object.assign(window, { __ids: ids }), seeded);
await page.waitForTimeout(600);

const ask = (query, options = {}) => page.evaluate(async ({ query, options }) => {
  const { queryInventory } = await import('/src/query.js');
  const q = { ...query };
  if (q.folderId === '$folder') q.folderId = window.__ids.folderId;
  if (q.categoryId === '$category') q.categoryId = window.__ids.categoryId;
  if (q.filters?.locationId === '$location') q.filters = { ...q.filters, locationId: window.__ids.locationId };
  const t0 = performance.now();
  const result = await queryInventory(q, options);
  return {
    ms: +(performance.now() - t0).toFixed(1),
    ids: result.rows.map((r) => r.id),
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    hasMore: result.hasMore,
    baseIndex: result.plan?.baseIndex ?? null,
    residual: result.plan?.residualPredicates ?? [],
    examined: result.examined,
    strategy: result.plan?.paginationStrategy ?? null,
  };
}, { query, options });

// ── default Home ───────────────────────────────────────────────────────────
{
  const home = await ask({ page: 1, perPage: 24 });
  check('Q1 the default browse starts from the createdAt index',
    home.baseIndex === 'createdAt', JSON.stringify(home));
  check('Q2 it returns one page', home.ids.length === 24, String(home.ids.length));
  check('Q3 and it reads about a page to do it, not the inventory',
    home.examined < 500, `examined ${home.examined} of ${COUNT}`);
  check('Q4 the total is still exact, from index sizes rather than a walk',
    home.total === COUNT - IN_FOLDER, `${home.total} vs ${COUNT - IN_FOLDER}`);

  const held = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return { loaded: repository.state.items.length, complete: repository.itemsComplete };
  });
  check('Q5 without the inventory being materialised to answer it',
    held.loaded <= 200 && held.complete === false, JSON.stringify(held));
}

// ── a folder ───────────────────────────────────────────────────────────────
{
  const folder = await ask({ folderId: '$folder', page: 1, perPage: 24 });
  // The compound index, not the plain equality one: the order the screen asked
  // for has to come out of the cursor, not out of a sort over one page.
  check('Q6 a folder scope starts from the folder-and-time index',
    folder.baseIndex === 'folderCreatedAt', JSON.stringify(folder));
  check('Q7 its total is the folder, exactly', folder.total === IN_FOLDER, String(folder.total));
  check('Q8 and reaching the first page reads the folder, not the inventory',
    folder.examined <= IN_FOLDER, `examined ${folder.examined} of ${COUNT}`);
  check('Q9 the pager is numbered, because the total is known',
    folder.totalPages === Math.ceil(IN_FOLDER / 24), String(folder.totalPages));

  const deep = await ask({ folderId: '$folder', page: 20, perPage: 24 });
  check('Q10 a later page of the folder is still the folder',
    deep.ids.length === 24 && deep.page === 20, JSON.stringify({ n: deep.ids.length, page: deep.page }));
  check('Q11 with no overlap against the first page',
    deep.ids.every((id) => !folder.ids.includes(id)), '');
}

// ── a category ─────────────────────────────────────────────────────────────
{
  const category = await ask({ categoryId: '$category', page: 1, perPage: 24 });
  check('Q12 a category starts from the category-and-time index',
    category.baseIndex === 'categoryCreatedAt', JSON.stringify(category));
  check('Q13 its total is the category, exactly', category.total === IN_CATEGORY, String(category.total));
  check('Q14 and it reads the category, not the inventory',
    category.examined <= IN_CATEGORY, `examined ${category.examined}`);
}

// ── a location ─────────────────────────────────────────────────────────────
{
  const location = await ask({ filters: { locationId: '$location' }, page: 1, perPage: 24 });
  check('Q15 a location filter starts from the location-and-time index',
    location.baseIndex === 'locationCreatedAt', JSON.stringify(location));
  check('Q16 its total is the location, exactly', location.total === IN_LOCATION, String(location.total));
  check('Q17 and it reads the location, not the inventory',
    location.examined <= IN_LOCATION, `examined ${location.examined}`);
}

// ── exact identifiers ──────────────────────────────────────────────────────
{
  // The target is the very last record written, as far from a newest-first
  // window as a record can be.
  const target = 'q0' + String(COUNT - 1).padStart(5, '0');
  for (const [label, term] of [
    ['Q18 a barcode', String(6281000000000 + COUNT - 1)],
    ['Q19 a SKU', `INV-2026-${String(COUNT - 1).padStart(6, '0')}`],
    ['Q20 a serial number', `SN-${String(COUNT - 1).padStart(7, '0')}`],
  ]) {
    const found = await ask({ search: term });
    check(`${label} outside the window is found by index`,
      found.ids.length === 1 && found.ids[0] === target && found.ms < 200,
      JSON.stringify({ ids: found.ids, ms: found.ms }));
  }

  const held = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.state.items.length;
  });
  check('Q21 and none of it loaded the inventory', held <= 200, String(held));
}

// ── text search ────────────────────────────────────────────────────────────
{
  // A word that is not an identifier, on the last record in the database.
  const found = await ask({ search: 'أسطرلاب' });
  check('Q22 a word only the last record carries is found',
    found.ids.length === 1 && found.ids[0] === 'q0' + String(COUNT - 1).padStart(5, '0'),
    JSON.stringify(found.ids));
  check('Q23 the search is named as the thing no index answers',
    found.residual.includes('search'), JSON.stringify(found.residual));

  const held = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return { loaded: repository.state.items.length, complete: repository.itemsComplete };
  });
  check('Q24 and it did not permanently materialise the inventory to do it',
    held.loaded <= 200 && held.complete === false, JSON.stringify(held));
}

// ── a stale answer never paints over a newer one ───────────────────────────
{
  const race = await page.evaluate(async () => {
    const { queryInventory } = await import('/src/query.js');
    let generation = 0;
    const painted = [];

    const run = async (term) => {
      const ticket = ++generation;
      const signal = { get aborted() { return ticket !== generation; } };
      const result = await queryInventory({ search: term }, { signal });
      if (!result || ticket !== generation) return;
      painted.push(term);
    };

    // The slow one starts first and is superseded immediately.
    const slow = run('قطعة');        // matches ~20,000 records: a long walk
    const fast = run('أسطرلاب');     // matches one
    await Promise.all([slow, fast]);
    return painted;
  });

  check('Q25 only the newest question paints', race.length === 1 && race[0] === 'أسطرلاب',
    JSON.stringify(race));
}

// ── paging over tied timestamps ────────────────────────────────────────────
{
  const paging = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');

    // 1,000 records, most of them sharing a handful of timestamps — which is
    // what a bulk write produces, and what a cursor keyed on time alone either
    // replays or skips.
    const stamp = 1700000000000;
    const rows = [];
    for (let i = 0; i < 1000; i += 1) {
      rows.push({
        id: 'tie' + String(i).padStart(4, '0'),
        name: 'مكرر ' + i, quantity: 1, unit: 'قطعة', categoryId: 'art_paintings',
        folderId: null, locationId: null, images: [], deletedAt: null,
        createdAt: stamp, version: 1,
        // Five distinct values across a thousand records.
        updatedAt: stamp + (i % 5),
      });
    }
    for (let i = 0; i < rows.length; i += 500) await local.putMany('items', rows.slice(i, i + 500));

    const walkAll = async (direction) => {
      const seen = [];
      let after;
      let afterPrimary;
      for (let guard = 0; guard < 200; guard += 1) {
        const result = await local.page('items', {
          index: 'updatedAt', direction, limit: 7,
          range: IDBKeyRange.bound(stamp, stamp + 4),
          after, afterPrimary,
        });
        seen.push(...result.rows.map((r) => r.id));
        if (result.done || !result.rows.length) break;
        after = result.nextKey;
        afterPrimary = result.nextPrimaryKey;
      }
      return seen;
    };

    const forward = await walkAll('next');
    const backward = await walkAll('prev');
    return {
      forward: forward.length,
      forwardUnique: new Set(forward).size,
      backward: backward.length,
      backwardUnique: new Set(backward).size,
      reversed: backward.slice().reverse().join() === forward.join(),
    };
  });

  check('Q26 paging forward over tied keys returns every record',
    paging.forward === 1000, String(paging.forward));
  check('Q27 and returns none of them twice',
    paging.forwardUnique === 1000, `${paging.forwardUnique} unique of ${paging.forward}`);
  check('Q28 paging backward returns every record, once',
    paging.backward === 1000 && paging.backwardUnique === 1000,
    JSON.stringify({ n: paging.backward, unique: paging.backwardUnique }));
  check('Q29 and backwards is forwards, reversed', paging.reversed === true, String(paging.reversed));
}

// ── scoped chronological order is global, not page-local ───────────────────
//
// The failure this replaces: an equality index orders by its own key and then
// by primary key, so reading the first 24 entries of a 740-record folder and
// sorting those by date produced a page that was internally ordered and
// globally wrong. The actual newest record could be the 700th entry in the
// index and never reach the first page at all.
{
  const scoped = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const { queryInventory } = await import('/src/query.js');

    // Three sets of 500, one per scope, with ids deliberately in the opposite
    // order to their timestamps and many timestamps repeated so ties have to
    // be broken by something.
    //
    // The category and location sets are left unfiled, because browsing at the
    // root shows unfiled records — a category pill or a location filter
    // narrows that scope rather than replacing it.
    const folderId = 'sort-folder';
    const categoryId = 'sort-category';
    const locationId = 'sort-location';

    const build = (prefix, over) => Array.from({ length: 500 }, (_, i) => ({
      // id ascending, createdAt descending: primary-key order is the exact
      // reverse of chronological order.
      id: prefix + String(i).padStart(4, '0'),
      name: `مرتَّب ${i}`, quantity: 1, unit: 'قطعة',
      categoryId: 'art_paintings', folderId: null, locationId: null,
      condition: '', images: [], deletedAt: null,
      // Repeated on purpose: 100 distinct values across 500 records.
      createdAt: 1600000000000 + (500 - i) * 1000 - (i % 5),
      updatedAt: 1600000000000, version: 1,
      ...over,
    }));

    const rows = build('srt', { folderId });
    const catRows = build('sct', { categoryId });
    const locRows = build('slc', { locationId });
    for (const set of [rows, catRows, locRows]) {
      for (let i = 0; i < set.length; i += 250) await local.putMany('items', set.slice(i, i + 250));
    }

    const byDate = (a, b) => b.createdAt - a.createdAt || String(a.id).localeCompare(String(b.id));
    const expectedNewest = [...rows].sort(byDate).map((r) => r.id);
    const expectedOldest = [...expectedNewest].reverse();

    const collect = async (query) => {
      const ids = [];
      const plans = new Set();
      let cursor = null;
      for (let n = 1; n <= 40; n += 1) {
        const result = await queryInventory({ ...query, page: n, perPage: 24 }, cursor ? { cursor } : {});
        plans.add(result.plan?.baseIndex + ':' + result.plan?.sortStrategy);
        ids.push(...result.rows.map((r) => r.id));
        cursor = result.nextCursor;
        if (!cursor || !result.hasMore) break;
      }
      return { ids, plans: [...plans] };
    };

    const folderNewest = await collect({ folderId, sort: 'newest' });
    const folderOldest = await collect({ folderId, sort: 'oldest' });
    const categoryNewest = await collect({ categoryId, sort: 'newest' });
    const locationNewest = await collect({ filters: { locationId }, sort: 'newest' });
    const expectedCategory = [...catRows].sort(byDate).map((r) => r.id);
    const expectedLocation = [...locRows].sort(byDate).map((r) => r.id);

    const ordered = (ids, expected) => ids.join() === expected.slice(0, ids.length).join();

    return {
      total: rows.length,
      firstExpected: expectedNewest[0],
      // The newest record by date, and where it sits in primary-key order.
      newestIsLastById: expectedNewest[0] === 'srt0000',
      folderNewest: {
        n: folderNewest.ids.length,
        unique: new Set(folderNewest.ids).size,
        ordered: ordered(folderNewest.ids, expectedNewest),
        first: folderNewest.ids[0],
        plans: folderNewest.plans,
      },
      folderOldest: {
        n: folderOldest.ids.length,
        unique: new Set(folderOldest.ids).size,
        ordered: ordered(folderOldest.ids, expectedOldest),
        first: folderOldest.ids[0],
      },
      categoryOrdered: ordered(categoryNewest.ids, expectedCategory),
      categoryN: categoryNewest.ids.length,
      categoryPlans: categoryNewest.plans,
      locationOrdered: ordered(locationNewest.ids, expectedLocation),
      locationN: locationNewest.ids.length,
      locationPlans: locationNewest.plans,
    };
  });

  check('Q35 the folder is read through the scope-and-time index',
    scoped.folderNewest.plans.join() === 'folderCreatedAt:index', scoped.folderNewest.plans.join());
  check('Q36 every record in the folder comes back, once',
    scoped.folderNewest.n === 500 && scoped.folderNewest.unique === 500,
    JSON.stringify({ n: scoped.folderNewest.n, unique: scoped.folderNewest.unique }));
  check('Q37 folder + newest is in date order across every page, not within pages',
    scoped.folderNewest.ordered === true, `first was ${scoped.folderNewest.first}`);
  check('Q38 and the newest record is first even though it is last by id',
    scoped.folderNewest.first === scoped.firstExpected, scoped.folderNewest.first);
  check('Q39 folder + oldest is the same order reversed',
    scoped.folderOldest.ordered === true && scoped.folderOldest.n === 500,
    JSON.stringify(scoped.folderOldest));
  check('Q40 a category is read through its own scope-and-time index, in date order',
    scoped.categoryPlans.join() === 'categoryCreatedAt:index'
      && scoped.categoryOrdered && scoped.categoryN === 500,
    JSON.stringify({ plans: scoped.categoryPlans, ordered: scoped.categoryOrdered, n: scoped.categoryN }));
  check('Q41 a location too',
    scoped.locationPlans.join() === 'locationCreatedAt:index'
      && scoped.locationOrdered && scoped.locationN === 500,
    JSON.stringify({ plans: scoped.locationPlans, ordered: scoped.locationOrdered, n: scoped.locationN }));
}

// ── paging a walked answer by cursor ───────────────────────────────────────
{
  const walked = await page.evaluate(async () => {
    const { queryInventory } = await import('/src/query.js');
    const q = { search: 'قطعة', perPage: 24 };   // matches almost everything

    const seen = [];
    const costs = [];
    let cursor = null;
    let result = null;
    for (let n = 1; n <= 8; n += 1) {
      const t0 = performance.now();
      result = await queryInventory({ ...q, page: n }, cursor ? { cursor } : {});
      costs.push(Math.round(result.examined ?? -1));
      seen.push(...result.rows.map((r) => r.id));
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    // A token from this question, spent on a different one.
    const foreign = await queryInventory({ search: 'أسطرلاب', perPage: 24 }, { cursor });
    return {
      rows: seen.length,
      unique: new Set(seen).size,
      costs,
      foreignRows: foreign.rows.length,
      foreignFirst: foreign.rows[0]?.id ?? null,
    };
  });

  check('Q31 eight cursor pages return eight pages of records',
    walked.rows === 192, String(walked.rows));
  check('Q32 with none of them repeated', walked.unique === 192,
    `${walked.unique} unique of ${walked.rows}`);
  check('Q33 and each page costs a page, not the distance to it',
    walked.costs.slice(1).every((n) => n <= walked.costs[0] * 2 + 64),
    JSON.stringify(walked.costs));
  check('Q34 a cursor from another question is refused, not spent',
    walked.foreignRows === 1 && /^q0/.test(walked.foreignFirst || ''),
    JSON.stringify({ n: walked.foreignRows, first: walked.foreignFirst }));
}

// ── the exact lookup is an optimisation, not a different question ──────────
//
// A fast path that returns a record the ordinary path would have excluded is
// not faster, it is wrong. Scanning a SKU while a location filter is on must
// not hand back the item from the other warehouse.
{
  const semantics = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const { queryInventory } = await import('/src/query.js');
    const { repository } = await import('/src/repository.js');

    const riyadh = await repository.saveLocation({ name: 'الرياض' });
    const jeddah = await repository.saveLocation({ name: 'جدة' });
    const watches = await repository.saveCategory({ name: 'ساعات دقيقة', icon: '⌚' });
    const now = Date.now();

    const base = {
      quantity: 1, unit: 'قطعة', images: [], deletedAt: null,
      createdAt: now, updatedAt: now, version: 1, folderId: null,
    };
    await local.putMany('items', [
      {
        ...base, id: 'exA', name: 'ساعة الرياض', categoryId: watches.id,
        locationId: riyadh.id, condition: 'ممتازة',
        sku: 'ABC-123', barcode: '9990001', serialNumber: 'SNX-0001',
      },
      {
        ...base, id: 'exB', name: 'ساعة جدة', categoryId: 'art_paintings',
        locationId: jeddah.id, condition: 'جيدة',
        sku: 'XYZ-789', barcode: '9990002', serialNumber: 'SNX-0002',
      },
      {
        ...base, id: 'exC', name: 'ساعة محذوفة', categoryId: 'art_paintings',
        locationId: jeddah.id, condition: '',
        sku: 'DEL-555', barcode: '9990003', serialNumber: 'SNX-0003',
        deletedAt: now,
      },
    ]);

    const ask = (query) => queryInventory(query);
    const ids = (r) => r.rows.map((x) => x.id);
    const empty = { condition: '', folderId: '', locationId: '', categoryId: '', ai: '', valuation: '', currency: '' };

    // The same logical question asked both ways: once by identifier (fast
    // path) and once by a term no index can answer (ordinary path).
    const both = async (term, filters) => {
      const fast = await ask({ search: term, filters: { ...empty, ...filters } });
      const slow = await ask({ search: 'ساعة', filters: { ...empty, ...filters } });
      return { fast: ids(fast), slowIncludes: ids(slow) };
    };

    return {
      // SKU with a location filter that excludes it.
      skuBlocked: ids(await ask({ search: 'XYZ-789', filters: { ...empty, locationId: riyadh.id } })),
      skuAllowed: ids(await ask({ search: 'XYZ-789', filters: { ...empty } })),
      skuMatchingFilter: ids(await ask({ search: 'ABC-123', filters: { ...empty, locationId: riyadh.id } })),
      // Barcode with a category filter.
      barcodeBlocked: ids(await ask({ search: '9990002', filters: { ...empty, categoryId: watches.id } })),
      barcodeAllowed: ids(await ask({ search: '9990002', filters: { ...empty } })),
      // Serial with a condition filter.
      serialBlocked: ids(await ask({ search: 'SNX-0002', filters: { ...empty, condition: 'ممتازة' } })),
      serialAllowed: ids(await ask({ search: 'SNX-0002', filters: { ...empty } })),
      // The category pill is a restriction too.
      pillBlocked: ids(await ask({ search: 'XYZ-789', categoryId: watches.id })),
      // A deleted record is never an exact match outside the Trash.
      trashed: ids(await ask({ search: 'DEL-555', filters: { ...empty } })),
      // A search still reaches across folder navigation, which is the
      // established behaviour and is deliberately unchanged.
      acrossFolders: ids(await ask({ search: 'ABC-123', folderId: 'some-other-folder' })),
      agree: await both('ABC-123', { locationId: riyadh.id }),
    };
  });

  check('Q42 an exact SKU is not returned when a location filter excludes it',
    semantics.skuBlocked.length === 0, JSON.stringify(semantics.skuBlocked));
  check('Q43 and is returned the moment the filter is lifted',
    semantics.skuAllowed.join() === 'exB', JSON.stringify(semantics.skuAllowed));
  check('Q44 a SKU that does match the filter still comes back',
    semantics.skuMatchingFilter.join() === 'exA', JSON.stringify(semantics.skuMatchingFilter));
  check('Q45 a barcode respects a category filter',
    semantics.barcodeBlocked.length === 0 && semantics.barcodeAllowed.join() === 'exB',
    JSON.stringify(semantics));
  check('Q46 a serial number respects a condition filter',
    semantics.serialBlocked.length === 0 && semantics.serialAllowed.join() === 'exB',
    JSON.stringify(semantics));
  check('Q47 the category pill restricts the exact lookup too',
    semantics.pillBlocked.length === 0, JSON.stringify(semantics.pillBlocked));
  check('Q48 a trashed record is never an exact match outside the Trash',
    semantics.trashed.length === 0, JSON.stringify(semantics.trashed));
  check('Q49 but a search still crosses folder navigation, as it always has',
    semantics.acrossFolders.join() === 'exA', JSON.stringify(semantics.acrossFolders));
  check('Q50 the fast path and the ordinary path agree on the same question',
    semantics.agree.fast.every((id) => semantics.agree.slowIncludes.includes(id)),
    JSON.stringify(semantics.agree));
}

// ── the semantics matrix ───────────────────────────────────────────────────
//
// §46. Every previous check asks one question well. This asks the same
// question of a spread of scopes, sorts and filters, and checks the three
// properties that have to hold for all of them:
//
//   completeness  paging through the answer returns every record once, and
//                 the same set a single unpaged read returns;
//   order         the concatenated pages are in the order the customer asked
//                 for, across page boundaries and not merely inside them;
//   membership    every record returned really does satisfy the scope and the
//                 filters, checked against the stored record rather than
//                 against what the engine claimed.
//
// The reference is the engine's own unpaged answer rather than a second
// implementation of the semantics, because a second implementation would be a
// second thing to get wrong; the order and membership checks read the records
// and so do not depend on the engine being right about anything.
{
  const matrix = await page.evaluate(async (ids) => {
    const { queryInventory } = await import('/src/query.js');
    const local = await import('/src/local-store.js');
    const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

    const cases = [
      { label: 'الجذر · الأحدث', query: { sort: 'newest' } },
      { label: 'الجذر · الأقدم', query: { sort: 'oldest' } },
      { label: 'الجذر · الاسم', query: { sort: 'name-az' } },
      { label: 'مجلد · الأحدث', query: { folderId: ids.folderId, sort: 'newest' } },
      { label: 'مجلد · الأقدم', query: { folderId: ids.folderId, sort: 'oldest' } },
      { label: 'مجلد · الاسم', query: { folderId: ids.folderId, sort: 'name-az' } },
      { label: 'تصنيف · الأحدث', query: { filters: { categoryId: ids.categoryId }, sort: 'newest' } },
      { label: 'تصنيف · الاسم', query: { filters: { categoryId: ids.categoryId }, sort: 'name-za' } },
      { label: 'موقع · الأحدث', query: { filters: { locationId: ids.locationId }, sort: 'newest' } },
      { label: 'موقع · الأقدم', query: { filters: { locationId: ids.locationId }, sort: 'oldest' } },
      {
        label: 'مجلد + حالة · الأحدث',
        query: { folderId: ids.folderId, filters: { condition: 'ممتازة' }, sort: 'newest' },
      },
      { label: 'المحذوفات · الأحدث', query: { trashed: true, sort: 'newest' } },
    ];

    // Bounded on purpose. Walking all twenty thousand records twenty-five at
    // a time would be eight hundred queries for one row of the matrix, and
    // would measure the loop rather than the engine. A scope that fits inside
    // the budget is walked whole; a larger one is walked to the budget, and
    // the check says how far it got rather than implying it went further.
    const PER_PAGE = 25;
    const MAX_PAGES = 24;
    const report = [];

    for (const { label, query } of cases) {
      const first = await queryInventory({ ...query, page: 1, perPage: PER_PAGE });
      const total = first.total;
      const pages = total == null
        ? 1
        : Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PER_PAGE)));

      const paged = [...first.rows.map((row) => row.id)];
      for (let n = 2; n <= pages; n += 1) {
        const next = await queryInventory({ ...query, page: n, perPage: PER_PAGE });
        paged.push(...next.rows.map((row) => row.id));
      }
      const whole = total != null && total <= pages * PER_PAGE;

      // The same question asked once, as the reference for the stretch the
      // paged walk covered.
      const unpaged = await queryInventory({
        ...query, page: 1, perPage: Math.max(1, pages * PER_PAGE),
      });
      const wholeIds = unpaged.rows.map((row) => row.id).slice(0, paged.length);

      const records = [];
      for (const id of paged) records.push(await local.get('items', id));

      const wanted = query.sort || 'newest';
      let ordered = true;
      for (let n = 1; n < records.length; n += 1) {
        const a = records[n - 1];
        const b = records[n];
        if (!a || !b) { ordered = false; break; }
        if (wanted === 'newest' && b.createdAt > a.createdAt) { ordered = false; break; }
        if (wanted === 'oldest' && b.createdAt < a.createdAt) { ordered = false; break; }
        // Arabic collation, not code-point order: "قطعة 10" and "قطعة 2" sort
        // by the locale's rules, and the test has to use the same ones the app
        // does or it measures the difference between two collations.
        if (wanted === 'name-az' && collator.compare(a.name, b.name) > 0) { ordered = false; break; }
        if (wanted === 'name-za' && collator.compare(b.name, a.name) > 0) { ordered = false; break; }
      }

      const filters = query.filters || {};
      const belongs = records.every((row) => row
        && (query.trashed ? row.deletedAt != null : row.deletedAt == null)
        && (query.folderId ? row.folderId === query.folderId : true)
        // Browsing without a folder shows what is unfiled; a filter narrows
        // that scope rather than replacing it.
        && (!query.folderId && !query.trashed && !Object.keys(filters).length
          ? row.folderId == null : true)
        && (filters.categoryId ? row.categoryId === filters.categoryId : true)
        && (filters.locationId ? row.locationId === filters.locationId : true)
        && (filters.condition ? row.condition === filters.condition : true));

      report.push({
        label,
        total,
        walked: paged.length,
        whole,
        distinct: new Set(paged).size,
        sameAsUnpaged: wholeIds.length === paged.length
          && wholeIds.every((id, n) => id === paged[n]),
        ordered,
        belongs,
      });
    }
    return report;
  }, seeded);

  for (const row of matrix) {
    const detail = JSON.stringify(row);
    // A total the engine cannot derive from index sizes is reported as
    // unknown rather than guessed, and the pager falls back to prev/next —
    // that is the honest answer, not a missing one.
    check(`M «${row.label}» no record is returned twice${row.whole ? ', and every one comes back' : ''}`,
      row.distinct === row.walked
      && row.walked > 0
      && (row.whole ? row.walked === row.total : true),
      detail);
    check(`M «${row.label}» paged and unpaged are the same answer, in the same order`,
      row.sameAsUnpaged, detail);
    check(`M «${row.label}» the order holds across page boundaries`, row.ordered, detail);
    check(`M «${row.label}» and nothing outside the scope got in`, row.belongs, detail);
  }
}

check('Q30 no JS errors', errs.length === 0, errs.slice(0, 2).join(' / '));
await context.close();

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
