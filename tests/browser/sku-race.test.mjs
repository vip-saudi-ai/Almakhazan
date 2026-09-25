// Browser test: live-SKU uniqueness is a commit-time invariant on the device.
//
//   A PRECHECK IMPROVES UX. THE COMMIT TRANSACTION GUARANTEES DATA INTEGRITY.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/sku-race.test.mjs
//
// Two tabs of the same origin share one IndexedDB. Each race below lets both
// tabs pass every precheck and then commit at the same moment; exactly one
// may win.

import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const QUIET = /gstatic|ERR_|net::|firebase/;

async function newContext(stub = { planId: 'business' }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/src/subscription.js', (r) => r.fulfill({ contentType: 'text/javascript', body: planStub(stub) }));
  return context;
}

async function openPage(context) {
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !QUIET.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  return { page, errs };
}

const live = (page, sku) => page.evaluate(async (sku) => {
  const local = await import('/src/local-store.js');
  return (await local.getAllByIndex('items', 'sku', sku)).filter((row) => !row.deletedAt).map((row) => row.id);
}, sku);

/** Runs `fn` in both tabs at once; returns each outcome (`ok` or the error code). */
async function race(a, b, fnA, fnB, arg) {
  const wrap = (fn) => `(async (arg) => { try { await (${fn})(arg); return 'ok'; } catch (e) { return e.code || e.message; } })`;
  return Promise.all([
    a.evaluate(`${wrap(fnA)}(${JSON.stringify(arg ?? null)})`),
    b.evaluate(`${wrap(fnB)}(${JSON.stringify(arg ?? null)})`),
  ]);
}

const context = await newContext();
const A = await openPage(context);
const B = await openPage(context);

// ── create vs create (§16) ─────────────────────────────────────────────────
{
  const create = async () => {
    const { repository } = await import('/src/repository.js');
    // Both tabs ask first — and both are told the SKU is free.
    if (await repository.skuConflict('WATCH-001')) throw Object.assign(new Error('precheck'), { code: 'precheck' });
    // A barrier: neither tab writes until both have been told the SKU is free,
    // so the race is the one described — two prechecks passed, two commits
    // attempted — however the scheduler happens to interleave the tabs.
    const channel = new BroadcastChannel('sku-race-r1');
    const otherChecked = new Promise((resolve) => { channel.onmessage = resolve; });
    channel.postMessage('checked');
    await Promise.race([otherChecked, new Promise((resolve) => setTimeout(resolve, 2000))]);
    channel.postMessage('checked');
    channel.close();
    await repository.createItem({ name: 'ساعة', sku: 'WATCH-001', quantity: 1 });
  };
  const outcome = await race(A.page, B.page, create.toString(), create.toString());
  check('R1 two tabs creating WATCH-001 at once: exactly one commits, the other gets repo/sku-conflict',
    outcome.filter((o) => o === 'ok').length === 1 && outcome.includes('repo/sku-conflict'), JSON.stringify(outcome));
  check('R2 one live WATCH-001', (await live(A.page, 'WATCH-001')).length === 1);
}

// ── edit vs edit (§17) ─────────────────────────────────────────────────────
{
  const ids = await A.page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const a = await repository.createItem({ name: 'أ', sku: 'SKU-A', quantity: 1 });
    const b = await repository.createItem({ name: 'ب', sku: 'SKU-B', quantity: 1 });
    return [a.id, b.id];
  });
  const edit = (index) => `async (ids) => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const row = await local.get('items', ids[${index}]);
    await repository.updateItem(row.id, { sku: 'SKU-C' }, row.version);
  }`;
  const outcome = await race(A.page, B.page, edit(0), edit(1), ids);
  check('R3 A→C and B→C at once: one wins, the other is refused', outcome.filter((o) => o === 'ok').length === 1
    && outcome.includes('repo/sku-conflict'), JSON.stringify(outcome));
  check('R4 never two live SKU-C', (await live(A.page, 'SKU-C')).length === 1);
}

// ── restore vs create (§18) ────────────────────────────────────────────────
{
  const trashed = await A.page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const x = await repository.createItem({ name: 'محذوفة', sku: 'SKU-X', quantity: 1 });
    await repository.deleteItem(x.id);
    return x.id;
  });
  const restore = `async (id) => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    // Past the precheck: go straight to the write, as a tab whose check
    // passed a moment before the other tab committed would.
    const row = await local.get('items', id);
    await repository.backend.update('items', id, { deletedAt: null, deletedBy: null }, row.version, {});
  }`;
  const create = `async () => {
    const { repository } = await import('/src/repository.js');
    await repository.createItem({ name: 'جديدة', sku: 'SKU-X', quantity: 1 });
  }`;
  const outcome = await race(A.page, B.page, restore, create, trashed);
  check('R5 restoring a trashed SKU-X while another tab creates SKU-X: one wins, the other is refused',
    outcome.filter((o) => o === 'ok').length === 1 && outcome.includes('repo/sku-conflict'), JSON.stringify(outcome));
  check('R6 only one live SKU-X', (await live(A.page, 'SKU-X')).length === 1);
}

// ── spreadsheet import vs manual create (§19) ──────────────────────────────
{
  const out = await A.page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const view = await import('/src/views/sheet-import.js');
    await view.openSpreadsheetImport(new File(['الاسم,الرمز\nمستوردة,IMP-X\nأخرى,IMP-Y\n'], 'race.csv', { type: 'text/csv' }));
    await new Promise((r) => setTimeout(r, 500));
    // The import's own check has run and found IMP-X free…
    const real = repository.findSkuConflicts.bind(repository);
    repository.findSkuConflicts = async () => [];
    // …then another tab commits IMP-X before the chunk is written.
    return { real: Boolean(real) };
  });
  await B.page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.createItem({ name: 'يدوية', sku: 'IMP-X', quantity: 1 });
  });
  const run = await A.page.evaluate(async () => {
    const view = await import('/src/views/sheet-import.js');
    await view.__runForTest();
    await new Promise((r) => setTimeout(r, 400));
    const local = await import('/src/local-store.js');
    return { imported: (await local.getAllByIndex('items', 'sku', 'IMP-Y')).length, job: view.__jobForTest()?.failedAt };
  });
  check('R7 an import chunk carrying a SKU another tab took after the check is refused at the commit',
    (await live(A.page, 'IMP-X')).length === 1 && out.real, JSON.stringify(run));
  check('R8 and the chunk wrote nothing — the import stopped, resumable', run.imported === 0 && run.job != null, JSON.stringify(run));
  await A.page.reload();
  await A.page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
}

// ── one batch, two records, one SKU (§20); a swap (§11) ────────────────────
{
  const batch = await A.page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const row = (id, sku) => ({ id, name: id, sku, quantity: 1, unit: 'قطعة', categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    let same;
    try {
      await repository.bulkWrite([
        { type: 'set', collection: 'items', id: 'bt1', data: row('bt1', 'BATCH-X'), merge: false, ifAbsent: true },
        { type: 'set', collection: 'items', id: 'bt2', data: row('bt2', 'BATCH-X'), merge: false, ifAbsent: true },
      ]);
      same = 'ok';
    } catch (error) { same = error.code; }
    const wrote = Boolean(await local.get('items', 'bt1')) || Boolean(await local.get('items', 'bt2'));

    await local.put('items', row('sw1', 'SWAP-1'));
    await local.put('items', row('sw2', 'SWAP-2'));
    let swap;
    try {
      await repository.backend.runAtomicBatch([
        { type: 'set', collection: 'items', id: 'sw1', data: { sku: 'SWAP-2' } },
        { type: 'set', collection: 'items', id: 'sw2', data: { sku: 'SWAP-1' } },
      ]);
      swap = 'ok';
    } catch (error) { swap = error.code; }
    const after = [(await local.get('items', 'sw1')).sku, (await local.get('items', 'sw2')).sku];

    let trashReuse;
    await local.put('items', { ...row('tr1', 'TRASH-1'), deletedAt: Date.now() });
    try { await repository.createItem({ name: 'تعيد الاستخدام', sku: 'TRASH-1', quantity: 1 }); trashReuse = 'ok'; } catch (error) { trashReuse = error.code; }

    let self;
    const own = await repository.createItem({ name: 'نفسها', sku: 'SELF-1', quantity: 1 });
    const stored = await local.get('items', own.id);
    try { await repository.updateItem(own.id, { name: 'نفسها ٢' }, stored.version); self = 'ok'; } catch (error) { self = error.code; }

    let replay;
    try {
      const result = await repository.bulkWrite([
        { type: 'set', collection: 'items', id: 'bt1x', data: row('bt1x', 'SELF-1'), merge: false, ifAbsent: true },
      ].concat([{ type: 'set', collection: 'items', id: own.id, data: row(own.id, 'SOMETHING-ELSE'), merge: false, ifAbsent: true }]));
      replay = result;
    } catch (error) { replay = error.code; }
    return { same, wrote, swap, after, trashReuse, self, replay };
  });
  check('R9 two new records in one batch with one SKU: refused before any write', batch.same === 'repo/sku-conflict' && !batch.wrote, JSON.stringify(batch));
  check('R10 an atomic swap of two SKUs is a valid final state', batch.swap === 'ok' && batch.after.join() === 'SWAP-2,SWAP-1', JSON.stringify(batch));
  check('R11 a SKU only in the Trash is free', batch.trashReuse === 'ok', batch.trashReuse);
  check('R12 a record never conflicts with itself', batch.self === 'ok', batch.self);
  check('R13 a skipped ifAbsent record claims nothing; a new one on a live SKU is refused',
    batch.replay === 'repo/sku-conflict', JSON.stringify(batch.replay));
}

// ── quota and SKU in the same transaction (§13) ────────────────────────────
{
  const ctx = await newContext({ planId: 'free' });
  const { page } = await openPage(ctx);
  const atLimit = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    for (let i = 0; i < 49; i += 1) await repository.createItem({ name: `q${i}`, quantity: 1 });
    await repository.createItem({ name: 'مالكة', sku: 'Q-1', quantity: 1 });
    const before = await local.count('items');
    let full, conflict;
    try { await repository.createItem({ name: 'زائدة', sku: 'Q-2', quantity: 1 }); full = 'ok'; } catch (e) { full = e.code; }
    const one = (await local.getAll('items')).find((r) => r.name === 'q0');
    await repository.deleteItem(one.id);
    try { await repository.createItem({ name: 'مكررة', sku: 'Q-1', quantity: 1 }); conflict = 'ok'; } catch (e) { conflict = e.code; }
    return { full, conflict, grew: (await local.count('items')) - before };
  });
  check('R14 at the limit the capacity rule refuses; with room, the SKU rule does — neither writes',
    atLimit.full === 'plan/item-limit' && atLimit.conflict === 'repo/sku-conflict' && atLimit.grew === 0, JSON.stringify(atLimit));
  await ctx.close();
}

const errs = [...A.errs, ...B.errs].filter((line) => !/sku-conflict|SKU|import/.test(line));
check('R15 no unexpected JS errors', errs.length === 0, errs[0]);
await context.close();
await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
