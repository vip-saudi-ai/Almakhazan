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

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
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
        categoryId: i < inCategory ? category.id : 'c1',
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
  check('Q6 a folder scope starts from the folderId index',
    folder.baseIndex === 'folderId', JSON.stringify(folder));
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
  check('Q12 a category starts from the categoryId index',
    category.baseIndex === 'categoryId', JSON.stringify(category));
  check('Q13 its total is the category, exactly', category.total === IN_CATEGORY, String(category.total));
  check('Q14 and it reads the category, not the inventory',
    category.examined <= IN_CATEGORY, `examined ${category.examined}`);
}

// ── a location ─────────────────────────────────────────────────────────────
{
  const location = await ask({ filters: { locationId: '$location' }, page: 1, perPage: 24 });
  check('Q15 a location filter starts from the locationId index',
    location.baseIndex === 'locationId', JSON.stringify(location));
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
        name: 'مكرر ' + i, quantity: 1, unit: 'قطعة', categoryId: 'c1',
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

check('Q30 no JS errors', errs.length === 0, errs.slice(0, 2).join(' / '));
await context.close();

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
