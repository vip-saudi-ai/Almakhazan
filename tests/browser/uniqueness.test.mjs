// Browser test for the data-integrity pass:
//
//   IDENTIFIER UNIQUENESS MUST HOLD ACROSS EVERY ENTRY PATH.
//   REPLAYED DATA MUST NEVER BECOME "NEW" AGAIN.
//   CLOUD MIGRATION MUST PRESERVE EXISTING CLOUD DATA.
//   AND NAZM MUST ALWAYS BE ABLE TO READ THE BACKUPS IT CREATES.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/uniqueness.test.mjs
//
// The cloud cases run against an in-memory stand-in for Firestore and
// Storage, injected through `firebaseContext()`: enough to prove which
// documents are read and written and in what order, not a test of Firestore.

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
const YEAR = new Date().getFullYear();
const measurements = [];

async function newContext(stub = { planId: 'business' }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await context.route('**/src/subscription.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: planStub(stub),
  }));
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

const expectedErrors = (errs, pattern) => errs.filter((line) => !pattern.test(line));

/** Opens a CSV in the import screen, goes to the preview and waits for the
 *  SKU check to answer. Returns what the preview says. */
async function preview(page, csv, name) {
  await page.evaluate(async ({ csv, name }) => {
    const view = await import('/src/views/sheet-import.js');
    await view.openSpreadsheetImport(new File([csv], name, { type: 'text/csv' }));
  }, { csv, name });
  await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll('#simport-foot button')].find((b) => b.textContent.includes('معاينة'))?.click());
  for (let i = 0; i < 200; i += 1) {
    const pending = await page.evaluate(() => document.getElementById('simport-body')?.innerText.includes('جارٍ التحقق من رموز SKU'));
    if (!pending) break;
    await page.waitForTimeout(100);
  }
  return page.evaluate(() => ({
    body: document.getElementById('simport-body')?.innerText || '',
    importButton: [...document.querySelectorAll('#simport-foot button')].map((b) => ({ text: b.textContent, disabled: b.disabled })),
  }));
}

const runImport = (page) => page.evaluate(async () => {
  const view = await import('/src/views/sheet-import.js');
  await view.__runForTest();
  await new Promise((r) => setTimeout(r, 300));
  return [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | ');
});

const liveBySku = (page, sku) => page.evaluate(async (sku) => {
  const local = await import('/src/local-store.js');
  return (await local.getAllByIndex('items', 'sku', sku)).filter((row) => !row.deletedAt)
    .map((row) => ({ id: row.id, name: row.name, sku: row.sku }));
}, sku);

// ── 1. spreadsheet: against the live inventory (§64) ───────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const a = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return (await repository.createItem({ name: 'ساعة أ', sku: 'WATCH-001', quantity: 1 })).id;
  });
  const shown = await preview(page, 'الاسم,الرمز\nجديدة 1,WATCH-001\nجديدة 2,WATCH-002\n', 'existing.csv');
  check('U1 the preview says which row is held back, and why, before anything is written',
    /صف 2: الرمز SKU مستخدم على قطعة أخرى: WATCH-001/.test(shown.body) && /«ساعة أ»/.test(shown.body), shown.body.slice(0, 600));
  check('U2 it is counted as a row that will not be imported, and the button counts only the rest',
    /1\s*صفّاً لن يُستورد/.test(shown.body) && shown.importButton.some((b) => b.text === 'استيراد 1 قطعة' && !b.disabled), JSON.stringify(shown.importButton));
  await runImport(page);
  const after = { one: await liveBySku(page, 'WATCH-001'), two: await liveBySku(page, 'WATCH-002') };
  check('U3 no second live WATCH-001; the existing item is unchanged; the clean row is imported',
    after.one.length === 1 && after.one[0].id === a && after.one[0].name === 'ساعة أ' && after.two.length === 1, JSON.stringify(after));
  check('U4 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 2. spreadsheet: duplicate inside the file (§65) ────────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  // Line 1 is the header, so data line n is row index n − 2.
  const rows = Array.from({ length: 499 }, (_, i) => `قطعة ${i + 2},${[10, 500].includes(i + 2) ? 'ABC-1' : ''}`);
  const shown = await preview(page, `الاسم,الرمز\n${rows.join('\n')}\n`, 'dup.csv');
  check('U5 both rows carrying the same SKU are flagged, each naming the other',
    /صف 10: الرمز SKU مكرر داخل الملف: ABC-1 \(صف 500\)/.test(shown.body) && /صف 500: الرمز SKU مكرر داخل الملف: ABC-1 \(صف 10\)/.test(shown.body),
    shown.body.slice(0, 800));
  check('U6 two rows will not be imported; 497 will', /2\s*صفّاً لن يُستورد/.test(shown.body)
    && shown.importButton.some((b) => b.text === 'استيراد 497 قطعة'), JSON.stringify(shown.importButton));
  await runImport(page);
  const count = await page.evaluate(async () => (await import('/src/local-store.js')).count('items'));
  check('U7 neither is imported — no "last wins", no silent rename', (await liveBySku(page, 'ABC-1')).length === 0 && count === 497, String(count));
  check('U8 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 3. spreadsheet: a trashed SKU does not block (§66) ─────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const old = await repository.createItem({ name: 'قديمة', sku: 'TR-1', quantity: 1 });
    await repository.deleteItem(old.id);
  });
  const shown = await preview(page, 'الاسم,الرمز\nجديدة,TR-1\n', 'trash.csv');
  await runImport(page);
  check('U9 a SKU held only by a trashed record is free for a new live one',
    !/TR-1/.test(shown.body) && (await liveBySku(page, 'TR-1')).length === 1, shown.body.slice(0, 300));
  check('U10 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 4. spreadsheet: a replay is not "new" (§67, §68) ───────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const csv = 'الاسم,الرمز\nأولى,RP-1\nثانية,RP-2\nثالثة,RP-3\n';
  await preview(page, csv, 'replay.csv');
  const setup = await page.evaluate(async () => {
    const view = await import('/src/views/sheet-import.js');
    const { importItemId } = await import('/src/import-mapping.js');
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    // The tab died having committed lines 2 and 3, before `written` moved.
    const job = await view.__stopJobForTest(0);
    await repository.bulkCreateItems([
      { id: importItemId(job.id, 2), name: 'أولى', sku: 'RP-1', quantity: 1, importJobId: job.id },
      { id: importItemId(job.id, 3), name: 'ثانية', sku: 'RP-2', quantity: 1, importJobId: job.id },
    ], { log: false });
    // The customer then renamed line 3's SKU — and gave RP-2 to something else.
    const row = await local.get('items', importItemId(job.id, 3));
    await repository.updateItem(row.id, { sku: 'RP-9' }, row.version);
    await repository.createItem({ name: 'أخرى', sku: 'RP-2', quantity: 1 });
    (await import('/src/ui.js')).closeSheet('simport');
    return { id: job.id, line2: importItemId(job.id, 2), line3: importItemId(job.id, 3) };
  });
  await page.waitForTimeout(300);
  const shown = await preview(page, csv, 'replay.csv');
  await page.evaluate(async () => {
    const view = await import('/src/views/sheet-import.js');
    await view.__runForTest();
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(async (ids) => {
    const local = await import('/src/local-store.js');
    const job = (await local.getAll('importJobs')).find((j) => j.id === ids.id) || {};
    return {
      line2: (await local.get('items', ids.line2))?.sku,
      line3: (await local.get('items', ids.line3))?.sku,
      written: job.written, created: job.createdRecords, skipped: job.skippedRecords, blocked: job.blockedRecords,
    };
  }, setup);
  check('U11 a replayed row is not a conflict with its own record (RP-1)', !/RP-1/.test(shown.body), shown.body.slice(0, 500));
  check('U12 nor with what the file said after the record was edited (RP-2 is someone else\'s now)',
    !/RP-2/.test(shown.body) && !/لن يُستورد[\s\S]*RP/.test(shown.body), shown.body.slice(0, 500));
  check('U13 the edit survives: line 3 is still RP-9, and RP-2 stays unique',
    after.line3 === 'RP-9' && (await liveBySku(page, 'RP-2')).length === 1 && (await liveBySku(page, 'RP-1')).length === 1, JSON.stringify(after));
  check('U14 all three rows processed: 1 created, 2 already there, none blocked',
    after.written === 3 && after.created === 1 && after.skipped === 2 && (after.blocked || 0) === 0, JSON.stringify(after));
  check('U15 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 5. spreadsheet: generated SKUs move the right year's floor (§72) ───────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await preview(page, `الاسم,الرمز\nمولّدة,INV-${YEAR}-004500\nقديمة,INV-${YEAR - 1}-009000\n`, 'gen.csv');
  await runImport(page);
  const next = await page.evaluate(async (year) => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const item = await repository.createItem({ name: 'تلقائي', sku: await repository.reserveUniqueSku(), quantity: 1 });
    return { sku: item.sku, lastYear: await local.getMeta(`counter.sku.${year - 1}`) };
  }, YEAR);
  check('U16 after importing INV-…-004500 the next automatic SKU is 004501', next.sku === `INV-${YEAR}-004501`, next.sku);
  check('U17 an old year\'s generated SKU does not touch that year\'s counter or this one',
    next.lastYear == null, JSON.stringify(next));
  check('U18 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 6. spreadsheet: a conflict appearing after the preview (§7) ────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const shown = await preview(page, 'الاسم,الرمز\nأ,LATE-1\nب,LATE-2\n', 'late.csv');
  const late = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.createItem({ name: 'سبقت', sku: 'LATE-1', quantity: 1 });
    const view = await import('/src/views/sheet-import.js');
    await view.__runForTest();
    await new Promise((r) => setTimeout(r, 300));
    const local = await import('/src/local-store.js');
    const first = { count: await local.count('items'), body: document.getElementById('simport-body').innerText };
    await view.__runForTest();
    await new Promise((r) => setTimeout(r, 300));
    return { first, count: await local.count('items') };
  });
  check('U19 a SKU taken between preview and import sends the customer back to the preview, writing nothing',
    !/LATE/.test(shown.body) && late.first.count === 1 && /الرمز SKU مستخدم على قطعة أخرى: LATE-1/.test(late.first.body), JSON.stringify(late.first).slice(0, 400));
  check('U20 confirmed again, only the clean row is written', late.count === 2 && (await liveBySku(page, 'LATE-1')).length === 1, String(late.count));
  check('U21 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 7. JSON merge (§69–§71) ────────────────────────────────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const merge = await page.evaluate(async () => {
    const { applyMerge } = await import('/src/exporting.js');
    const local = await import('/src/local-store.js');
    const row = (id, sku, extra = {}) => ({ id, name: `سجل ${id}`, sku, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1, ...extra });
    await local.put('items', row('mA', 'ABC-1'));
    await local.put('items', row('mT', 'TT-1', { deletedAt: Date.now() }));
    const counts = async () => ({ items: await local.count('items'), categories: await local.count('categories') });
    const before = await counts();
    const attempt = async (data) => { try { return { ok: await applyMerge(data) }; } catch (error) { return { code: error.code, message: error.message, conflicts: error.conflicts }; } };
    const existing = await attempt({ items: [row('mB', 'ABC-1'), row('mZ', 'Z-1')], categories: [{ id: 'catNew', name: 'جديد' }], folders: [], locations: [] });
    const afterExisting = await counts();
    const internal = await attempt({ items: [row('mC', 'DUP-1'), row('mD', 'DUP-1')], folders: [], categories: [], locations: [] });
    const afterInternal = await counts();
    const self = await attempt({ items: [row('mA', 'ABC-1'), row('mE', 'E-1'), row('mF', 'TT-1')], folders: [], categories: [], locations: [] });
    return { before, existing, afterExisting, internal, afterInternal, self, catNew: Boolean(await local.get('categories', 'catNew')) };
  });
  check('M1 a new record with a live record\'s SKU stops the merge, with a structured conflict',
    merge.existing.code === 'import/sku-conflict' && merge.existing.conflicts?.[0]?.type === 'existing'
    && merge.existing.conflicts[0].incomingId === 'mB' && merge.existing.conflicts[0].existingId === 'mA'
    && merge.existing.message === 'يتضمن ملف البيانات رموز SKU مكررة أو مستخدمة مسبقاً. صحّح التعارضات ثم أعد المحاولة.', JSON.stringify(merge.existing));
  check('M2 before any write: no item, no category', JSON.stringify(merge.afterExisting) === JSON.stringify(merge.before) && !merge.catNew,
    JSON.stringify({ before: merge.before, after: merge.afterExisting }));
  check('M3 two new records sharing a SKU stop it too, both reported',
    merge.internal.code === 'import/sku-conflict' && merge.internal.conflicts.length === 2
    && merge.internal.conflicts.every((c) => c.type === 'incoming-duplicate') && JSON.stringify(merge.afterInternal) === JSON.stringify(merge.before), JSON.stringify(merge.internal));
  check('M4 a record already present is skipped by id — its own SKU is no conflict; a trashed SKU is free',
    merge.self.ok?.added === 2 && merge.self.ok?.skipped.items === 1, JSON.stringify(merge.self));
  check('M5 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 8. the local counter's one-time legacy rule (§23) ──────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const localLegacy = await page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    const row = (id, sku) => ({ id, name: id, sku, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    await local.setMeta('counter.sku', 850);
    for (let n = 1; n <= 10; n += 1) await local.put('items', row(`g${n}`, `INV-${year}-${String(n).padStart(6, '0')}`));
    const first = await local.reserveSkuSequence(year, await local.maxSkuSequence(year));
    const marker = await local.getMeta('counter.sku.legacyMigrated');
    return { first, marker };
  }, YEAR);
  check('L1 on the device: legacy 850 with no evidence, and this year at 10 → 11, and the marker is written',
    localLegacy.first === 11 && localLegacy.marker?.applied === false, JSON.stringify(localLegacy));
  const evidenced = await page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    await local.clearStore('meta');
    await local.setMeta('counter.sku', 850);
    await local.put('items', { id: 'g850', name: 'g850', sku: `INV-${year}-000850`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: Date.now(), createdAt: 1, updatedAt: 1, version: 1 });
    const first = await local.reserveSkuSequence(year, 10);
    const later = await local.reserveSkuSequence(year + 1, 0);
    return { first, later, marker: await local.getMeta('counter.sku.legacyMigrated') };
  }, YEAR);
  check('L2 with its last SKU on record (even in the Trash) it is honoured once — 851 — and never for a later year',
    evidenced.first === 851 && evidenced.later === 1 && evidenced.marker?.applied === true, JSON.stringify(evidenced));
  check('L3 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 9. the cloud counter's one-time legacy rule (§22–§26, §73, §74) ────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const cloud = await page.evaluate(async (year) => {
    const { repository } = await import('/src/repository.js');
    const { firebaseContext } = await import('/src/firebase.js');
    const ctx = firebaseContext();
    const saved = { db: ctx.db, sdk: ctx.sdk, session: repository.session, backend: repository.backend };

    let docs = new Map();
    const snap = (ref) => ({ exists: () => docs.has(ref.path), data: () => docs.get(ref.path), id: ref.path.split('/').pop() });
    const firestore = {
      doc: (_db, ...parts) => ({ path: parts.join('/') }),
      serverTimestamp: () => 'TS',
      getDoc: async (ref) => snap(ref),
      runTransaction: async (_db, fn) => {
        const ops = [];
        const tx = {
          get: async (ref) => snap(ref),
          set: (ref, data) => ops.push(() => docs.set(ref.path, { ...data })),
          update: (ref, data) => ops.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...data })),
        };
        const result = await fn(tx);
        ops.forEach((op) => op());
        return result;
      },
    };
    let cloudItems = [];
    ctx.db = {};
    ctx.sdk = { ...(ctx.sdk || {}), firestore };
    repository.session = { ...repository.session, mode: 'cloud', workspaceId: 'W' };
    repository.backend = { findItemsByField: async (field, value) => cloudItems.filter((row) => row[field] === value) };
    const gen = (n, y = year) => ({ id: `c${y}-${n}`, sku: `INV-${y}-${String(n).padStart(6, '0')}` });
    const out = {};
    try {
      // §73: an old counter at 850 from another year; this year already has 1–10.
      docs = new Map([['workspaces/W/counters/sku', { value: 850 }]]);
      cloudItems = Array.from({ length: 10 }, (_, i) => gen(i + 1));
      out.newYear = await repository._reserveCloudSkuSequence(year, 10);
      out.newYearMarker = docs.get('workspaces/W/counters/sku-legacy-migration');
      out.again = await repository._reserveCloudSkuSequence(year, 10);

      // §74: a workspace from the old architecture, whose counter's last SKU
      // is on record this year — migrated once, then ignored.
      docs = new Map([['workspaces/W/counters/sku', { value: 850 }]]);
      cloudItems = [gen(849), gen(850)];
      out.migrated = await repository._reserveCloudSkuSequence(year, 850);
      out.migratedMarker = docs.get('workspaces/W/counters/sku-legacy-migration');
      out.nextYear = await repository._reserveCloudSkuSequence(year + 1, 0);
      // The old counter moves after the marker (an old client still running),
      // and even its last SKU is on record for that year: still ignored — the
      // marker says it has been considered, and it never is again.
      docs.set('workspaces/W/counters/sku', { value: 999 });
      cloudItems.push(gen(999, year + 2));
      out.yearAfter = await repository._reserveCloudSkuSequence(year + 2, 0);
    } finally {
      Object.assign(ctx, { db: saved.db, sdk: saved.sdk });
      repository.session = saved.session;
      repository.backend = saved.backend;
    }
    return out;
  }, YEAR);
  check('C1 cloud: legacy 850, this year already at 10, no year counter → 000011, not 000851',
    cloud.newYear === 11 && cloud.newYearMarker?.applied === false && cloud.newYearMarker?.value === 850, JSON.stringify(cloud));
  check('C2 and the year then counts on from its own counter', cloud.again === 12, String(cloud.again));
  check('C3 an old workspace whose counter\'s last SKU is on record migrates it once (851)',
    cloud.migrated === 851 && cloud.migratedMarker?.applied === true && cloud.migratedMarker?.year === YEAR, JSON.stringify(cloud));
  check('C4 after the marker, later years ignore the old counter entirely', cloud.nextYear === 1 && cloud.yearAfter === 1, JSON.stringify(cloud));
  check('C5 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 10. device → cloud keeps the cloud's records (§27–§33, §75, §76) ───────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const upload = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { firebaseContext } = await import('/src/firebase.js');
    const local = await import('/src/local-store.js');
    const { uploadDeviceData } = await import('/src/device-upload.js');
    const ctx = firebaseContext();
    const saved = {
      db: ctx.db, sdk: ctx.sdk, storage: ctx.storage, session: repository.session, backend: repository.backend,
      completeItems: repository.completeItems, assertItemsComplete: repository.assertItemsComplete,
    };

    // In-memory Firestore (media assets live here) and Storage.
    const docs = new Map();
    const snap = (ref) => ({ exists: () => docs.has(ref.path), data: () => docs.get(ref.path), id: ref.path.split('/').pop() });
    const firestore = {
      doc: (_db, ...parts) => ({ path: parts.join('/') }),
      serverTimestamp: () => 'TS',
      getDoc: async (ref) => snap(ref),
      setDoc: async (ref, data) => { docs.set(ref.path, { ...data }); },
      runTransaction: async (_db, fn) => {
        const ops = [];
        const tx = {
          get: async (ref) => snap(ref),
          set: (ref, data) => ops.push(() => docs.set(ref.path, { ...data })),
          update: (ref, data) => ops.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...data })),
        };
        const result = await fn(tx);
        ops.forEach((op) => op());
        return result;
      },
    };
    const uploads = [];
    const storage = {
      ref: (_s, path) => ({ path }),
      uploadBytes: async (ref) => { uploads.push(ref.path); },
      getDownloadURL: async (ref) => `https://storage.example/${ref.path}`,
    };

    // The cloud workspace: items and taxonomy by id.
    const cloud = { items: new Map(), categories: new Map(), locations: new Map(), folders: new Map() };
    cloud.items.set('X', { id: 'X', name: 'Cloud Version', sku: 'X-1', images: [], deletedAt: null });
    cloud.categories.set('cat1', { id: 'cat1', name: 'سحابي' });
    let raced = false;
    const backend = {
      existingIds: async (name, ids) => new Set(ids.filter((id) => cloud[name]?.has(id))),
      countItems: async () => ({ live: [...cloud.items.values()].filter((i) => !i.deletedAt).length, total: cloud.items.size }),
      findItemsBySkus: async (skus) => {
        const out = new Map();
        for (const row of cloud.items.values()) if (skus.includes(row.sku)) out.set(row.sku, [...(out.get(row.sku) || []), row]);
        return out;
      },
      runBatch: async (ops) => {
        const skippedExisting = [];
        for (const op of ops) {
          // Another device creates R between the preflight and this write.
          if (op.id === 'R' && !raced) { raced = true; cloud.items.set('R', { id: 'R', name: 'من جهاز آخر', sku: 'R-OTHER', images: [], deletedAt: null }); }
          const store = cloud[op.collection];
          if (op.ifAbsent && store.has(op.id)) { skippedExisting.push(op.id); continue; }
          store.set(op.id, { ...op.data });
        }
        return { applied: ops.length - skippedExisting.length, skippedExisting };
      },
    };

    // The device: X also exists in the cloud, Y is new, R is raced.
    const blob = new Uint8Array([1, 2, 3, 4]).buffer;
    const localImage = (id) => ({ id, mediaId: id, storagePath: `local:${id}`, thumbnailPath: `local:${id}`, mimeType: 'image/jpeg', uploadedAt: 1 });
    const row = (id, name, image) => ({ id, name, sku: `${id}-1`, quantity: 1, categoryId: 'cat1', images: [localImage(image)], primaryImageId: image, deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    await local.put('categories', { id: 'cat1', name: 'محلي' });
    for (const [id, name, image] of [['X', 'Local Version', 'imgX'], ['Y', 'جديدة', 'imgY'], ['R', 'نسختي', 'imgR']]) {
      await local.put('items', row(id, name, image));
      await local.put('images', { id: image, itemId: id, original: blob, originalType: 'image/jpeg', thumbnail: blob, thumbnailType: 'image/jpeg', meta: {} });
    }

    Object.assign(ctx, { db: {}, storage: {}, sdk: { ...(ctx.sdk || {}), firestore, storage } });
    repository.session = { mode: 'cloud', workspaceId: 'W', userId: 'u1', role: 'owner' };
    repository.backend = backend;
    repository.completeItems = async () => { repository.state.items = [...cloud.items.values()]; };
    repository.assertItemsComplete = () => {};
    let result;
    try {
      result = await uploadDeviceData();
    } catch (error) {
      result = { error: error.code || error.message };
    } finally {
      Object.assign(ctx, { db: saved.db, sdk: saved.sdk, storage: saved.storage });
      repository.session = saved.session;
      repository.backend = saved.backend;
      repository.completeItems = saved.completeItems;
      repository.assertItemsComplete = saved.assertItemsComplete;
    }
    const media = [...docs.entries()].filter(([path]) => path.includes('/media/')).map(([path, data]) => ({ path, refCount: data.refCount, item: data.storagePath.split('/')[3] }));
    return {
      result: { created: result.created, skippedExisting: result.skippedExisting, images: result.images, error: result.error },
      cloudX: cloud.items.get('X')?.name, cloudR: cloud.items.get('R')?.name, cloudY: cloud.items.get('Y')?.name,
      localX: (await local.get('items', 'X'))?.name, localR: (await local.get('items', 'R'))?.name,
      uploadsForX: uploads.filter((p) => p.includes('/items/X/')).length,
      uploadsForY: uploads.filter((p) => p.includes('/items/Y/')).length,
      media, cat: cloud.categories.get('cat1')?.name,
    };
  });
  check('D1 an item the cloud already has keeps the cloud\'s version; the device copy is untouched',
    upload.cloudX === 'Cloud Version' && upload.localX === 'Local Version', JSON.stringify(upload));
  check('D2 and its images are never uploaded', upload.uploadsForX === 0 && upload.uploadsForY === 2, JSON.stringify(upload));
  check('D3 an id another device took mid-run is skipped at the write, not overwritten',
    upload.cloudR === 'من جهاز آخر' && upload.localR === 'نسختي', JSON.stringify(upload));
  check('D4 its freshly uploaded media is left unclaimed (refCount 0) for the sweeper; Y\'s is claimed',
    upload.media.some((m) => m.item === 'R' && m.refCount === 0) && upload.media.filter((m) => m.item === 'Y').every((m) => m.refCount === 1)
    && !upload.media.some((m) => m.item === 'R' && m.refCount > 0), JSON.stringify(upload.media));
  check('D5 counts: 1 created, 2 preserved, 1 image uploaded — no failure',
    upload.result.created === 1 && upload.result.skippedExisting === 2 && upload.result.images === 1 && !upload.result.error, JSON.stringify(upload.result));
  check('D6 a category the cloud already has keeps the cloud\'s name', upload.cat === 'سحابي', upload.cat);
  check('D7 no JS errors', expectedErrors(errs, /device-upload|media/).length === 0, errs[0]);
  await context.close();
}

// ── 11. a device item whose SKU the cloud already uses (§80) ───────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const blocked = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const { uploadDeviceData } = await import('/src/device-upload.js');
    const saved = { session: repository.session, backend: repository.backend };
    const writes = [];
    repository.session = { mode: 'cloud', workspaceId: 'W', userId: 'u1', role: 'owner' };
    repository.backend = {
      existingIds: async () => new Set(),
      countItems: async () => ({ live: 1, total: 1 }),
      findItemsBySkus: async (skus) => new Map(skus.includes('SAME-1') ? [['SAME-1', [{ id: 'cloudOne', name: 'سحابية', sku: 'SAME-1', deletedAt: null }]]] : []),
      runBatch: async (ops) => { writes.push(...ops); return { applied: ops.length, skippedExisting: [] }; },
    };
    await local.put('items', { id: 'dev1', name: 'جهازي', sku: 'SAME-1', quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    let code;
    try { await uploadDeviceData(); code = 'uploaded'; } catch (error) { code = error.code; } finally {
      repository.session = saved.session; repository.backend = saved.backend;
    }
    return { code, writes: writes.length };
  });
  check('D8 a device record whose SKU a live cloud record carries stops the upload before anything is written',
    blocked.code === 'import/sku-conflict' && blocked.writes === 0, JSON.stringify(blocked));
  check('D9 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 12. NAZM reads the backups it writes (§34–§40, §77) ────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  for (const [count, profile] of [[50, 'realistic'], [1000, 'realistic'], [5000, 'realistic'], [20000, 'realistic'], [5000, 'maximum']]) {
    const outcome = await page.evaluate(async ({ count, profile }) => {
      const { item } = await import('/tools/measure-backup-size.mjs');
      const { exportJSON, readBackupFile, MAX_BACKUP_FILE_BYTES } = await import('/src/exporting.js');
      const { repository } = await import('/src/repository.js');
      const saved = { items: repository.state.items, complete: repository.itemsComplete };
      let captured = null;
      const original = URL.createObjectURL;
      URL.createObjectURL = (blob) => { captured = blob; return original.call(URL, blob); };
      try {
        repository.state.items = Array.from({ length: count }, (_, i) => item(i, profile));
        repository.itemsComplete = true;
        const written = await exportJSON();
        repository.state.items = saved.items;
        const started = performance.now();
        const read = await readBackupFile(new File([captured], 'nazm_backup.json', { type: 'application/json' }));
        return {
          bytes: written.bytes, restorable: written.restorable, max: MAX_BACKUP_FILE_BYTES,
          readItems: read.data.items.length, readMs: Math.round(performance.now() - started),
        };
      } catch (error) {
        return { error: error.code || error.message };
      } finally {
        URL.createObjectURL = original;
        repository.state.items = saved.items;
        repository.itemsComplete = saved.complete;
      }
    }, { count, profile });
    measurements.push(`backup ${profile} ${count}: ${outcome.bytes ? (outcome.bytes / 1048576).toFixed(1) + ' MB' : outcome.error}, read back in ${outcome.readMs} ms`);
    check(`B${count}/${profile} an exported backup of ${count} ${profile} records is accepted by the same version's restore`,
      outcome.restorable === true && outcome.readItems === count, JSON.stringify(outcome));
  }
  check('B-last no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 13. 50,000 rows: the SKU check stays bounded (§41, §78) ────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  // 2,000 existing records, 30 of whose SKUs the file reuses.
  await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: `e${i}`, name: `موجودة ${i}`, sku: `EX-${i}`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 }));
    await local.putMany('items', rows);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  // 50,000 rows: 600 with a SKU — 20 pairs duplicated inside the file, 30
  // already used — the rest blank.
  const lines = ['الاسم,الرمز'];
  for (let i = 0; i < 50000; i += 1) {
    let sku = '';
    if (i < 600) sku = i < 40 ? `DUP-${i >> 1}` : i < 70 ? `EX-${i}` : `NEW-${i}`;
    lines.push(`قطعة ${i},${sku}`);
  }
  await page.evaluate(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] });
    window.__skuCalls = [];
    window.__storeGetAll = 0;
    const originalGetAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function patched(...args) {
      if (this.name === 'items') window.__storeGetAll += 1;
      return originalGetAll.apply(this, args);
    };
  });
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const original = repository.backend.findItemsBySkus.bind(repository.backend);
    repository.backend.findItemsBySkus = (skus) => { window.__skuCalls.push(skus.length); return original(skus); };
  });
  const started = Date.now();
  const shown = await preview(page, lines.join('\n') + '\n', 'big.csv');
  const elapsed = Date.now() - started;
  const stats = await page.evaluate(() => ({ calls: window.__skuCalls, storeGetAll: window.__storeGetAll, longTasks: window.__longTasks }));
  const errorsLine = /([\d,٬]+)\s*صفّاً لن يُستورد/.exec(shown.body)?.[1];
  measurements.push(`50k-row preview incl. SKU check: ${elapsed} ms; SKU lookups: ${JSON.stringify(stats.calls)}; longest main-thread task: ${Math.max(0, ...stats.longTasks)} ms (${stats.longTasks.length} long tasks)`);
  check('P1 600 SKUs of 50,000 rows are one engine call over 580 distinct values — not one query per row',
    stats.calls.length === 1 && stats.calls[0] === 580, JSON.stringify(stats.calls));
  check('P2 the items store is never read whole (no store-level getAll on items)', stats.storeGetAll === 0, String(stats.storeGetAll));
  check('P3 70 rows are held back: 40 duplicated inside the file, 30 already used', errorsLine === '70', String(errorsLine));
  const sameSku = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const entries = Array.from({ length: 50000 }, (_, i) => ({ key: i + 2, id: null, sku: 'ONE-SKU' }));
    const started = performance.now();
    const conflicts = await repository.findSkuConflicts(entries);
    return { count: conflicts.length, ms: Math.round(performance.now() - started), shared: conflicts[0].groupKeys === conflicts[49999].groupKeys };
  });
  measurements.push(`50,000 rows on one SKU: ${sameSku.ms} ms`);
  check('P5 50,000 rows sharing one SKU: every row reported, one shared group, linear time',
    sameSku.count === 50000 && sameSku.shared && sameSku.ms < 5000, JSON.stringify(sameSku));
  check('P4 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

await browser.close();
for (const line of measurements) console.log('  · ' + line);
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
