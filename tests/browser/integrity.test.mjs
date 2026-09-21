// Browser test for data integrity and indexed access at scale.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/integrity.test.mjs
//
// The property under test: a relational or destructive operation acts on every
// record that references the thing, not on the records this device happens to
// have loaded. A folder holding 300 records must lose all 300 when it is
// deleted, whether the window holds 200 of them or none of them — and the
// number the confirmation quotes must be the number that moves.
//
// The second property: the cost of an answer is the size of the answer. A
// device with 5,000 records must resolve "which items are in this folder" and
// "is this SKU taken" without reading 5,000 records.

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

async function open({ seed = 0, inFolder = 0, legacyDatabase = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.route('**/src/subscription.js', r => r.fulfill({ contentType: 'text/javascript', body: PLAN_STUB }));

  if (legacyDatabase) {
    // A database written by the previous release: the same stores, none of the
    // indexes. This must upgrade in place, with every record still readable and
    // every index populated from what was already there.
    await page.addInitScript(() => {
      const request = indexedDB.open('almakhzan', 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ['items', 'folders', 'categories', 'locations', 'activity', 'images', 'mediaAssets', 'meta']) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
          }
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').put({
          id: 'legacy-1', name: 'سجل قديم', quantity: 1, unit: 'قطعة',
          categoryId: 'c1', folderId: 'old-folder', locationId: null,
          sku: 'INV-2024-000001', barcode: '6281000000001',
          images: [], createdAt: 1, updatedAt: 1, version: 1, deletedAt: null,
        });
        tx.oncomplete = () => db.close();
      };
    });
  }

  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 20000 });

  if (seed) {
    // Written straight to the store, because a batch write stamps its own
    // `updatedAt` — which would give all 5,000 records the same timestamp and
    // leave the window arbitrary. Here the timestamps are staggered on purpose
    // so "outside the window" means a specific, known set of records.
    const ids = await page.evaluate(async ({ count, folderCount }) => {
      const { repository } = await import('/src/repository.js');
      const local = await import('/src/local-store.js');
      const folder = await repository.saveFolder({ name: 'الخزنة', icon: '🗂', color: '#2563FF' });
      const location = await repository.saveLocation({ name: 'المستودع الشمالي' });
      const now = Date.now();
      const rows = [];
      for (let i = 0; i < count; i += 1) {
        const id = 'k' + String(i).padStart(5, '0');
        rows.push({
          id, name: `قطعة ${i}`, quantity: 1, unit: 'قطعة', categoryId: 'c1',
          // The folder members are the OLDEST records, so they sort to the far
          // side of the window and none of them is loaded.
          folderId: i >= count - folderCount ? folder.id : null,
          locationId: i >= count - folderCount ? location.id : null,
          sku: `INV-2026-${String(i).padStart(6, '0')}`,
          barcode: String(6281000000000 + i),
          images: [], deletedAt: null,
          createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1,
        });
      }
      for (let i = 0; i < rows.length; i += 500) await local.putMany('items', rows.slice(i, i + 500));
      return { folderId: folder.id, locationId: location.id };
    }, { count: seed, folderCount: inFolder });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 20000 });
    await page.evaluate((v) => { window.__folderId = v.folderId; window.__locationId = v.locationId; }, ids);
    await page.waitForTimeout(500);
  }
  return { page, context, errs };
}

const state = (page) => page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  return { loaded: repository.state.items.length, complete: repository.itemsComplete };
});

// ── the upgrade path ───────────────────────────────────────────────────────
{
  const { page, context, errs } = await open({ legacyDatabase: true });

  const upgraded = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const row = await local.get('items', 'legacy-1');
    const bySku = await local.firstByIndex('items', 'sku', 'INV-2024-000001');
    const byFolder = await local.getAllByIndex('items', 'folderId', 'old-folder');
    return { kept: row?.name || null, sku: bySku?.id || null, folder: byFolder.map(r => r.id) };
  });

  check('I1 a database from the previous release keeps its records', upgraded.kept === 'سجل قديم', upgraded.kept);
  check('I2 and its records are backfilled into the new indexes',
    upgraded.sku === 'legacy-1' && upgraded.folder.join() === 'legacy-1', JSON.stringify(upgraded));
  check('I3 no JS errors during the upgrade', errs.length === 0, errs[0]);
  await context.close();
}

// ── a relational delete on a partial inventory ─────────────────────────────
{
  const { page, context, errs } = await open({ seed: 600, inFolder: 300 });
  const before = await state(page);

  check('I4 the inventory really is partial', before.loaded === 200 && before.complete === false, JSON.stringify(before));

  const loadedInFolder = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.state.items.filter(i => i.folderId === window.__folderId).length;
  });
  check('I5 and not one of the folder\'s records is loaded', loadedInFolder === 0, String(loadedInFolder));

  const counted = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.countItemsReferencing('folderId', window.__folderId);
  });
  check('I6 the count offered before deleting is the real one, not the loaded one',
    counted === 300, String(counted));

  const moved = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.deleteFolder(window.__folderId);
  });
  check('I7 deleting reports every record it moved', moved === 300, String(moved));

  const left = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const dangling = await local.getAllByIndex('items', 'folderId', window.__folderId);
    const total = await local.count('items');
    return { dangling: dangling.length, total };
  });
  check('I8 and no record anywhere still points at the deleted folder', left.dangling === 0, String(left.dangling));
  check('I9 while every record still exists — nothing was destroyed', left.total === 600, String(left.total));

  const bumped = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const row = await local.get('items', 'k00599');
    return { folderId: row.folderId, version: row.version };
  });
  check('I10 an indirectly changed record carries a new version, so another device sees a conflict',
    bumped.folderId === null && bumped.version === 2, JSON.stringify(bumped));

  check('I11 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── the same for a location ────────────────────────────────────────────────
{
  const { page, context, errs } = await open({ seed: 600, inFolder: 300 });

  const cleared = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.deleteLocation(window.__locationId);
  });
  check('I12 deleting a location clears it from every record that referenced it', cleared === 300, String(cleared));

  const dangling = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    return (await local.getAllByIndex('items', 'locationId', window.__locationId)).length;
  });
  check('I13 and leaves nothing pointing at it', dangling === 0, String(dangling));
  check('I14 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── uniqueness without a scan ──────────────────────────────────────────────
{
  const { page, context, errs } = await open({ seed: 5000, inFolder: 10 });
  const before = await state(page);
  check('I15 5,000 records, 200 of them loaded', before.loaded === 200 && !before.complete, JSON.stringify(before));

  const found = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const t0 = performance.now();
    const row = await local.firstByIndex('items', 'sku', 'INV-2026-004900');
    const ms = performance.now() - t0;
    const missing = await local.firstByIndex('items', 'sku', 'INV-2026-999999');
    return { id: row?.id || null, ms: Math.round(ms * 10) / 10, missing };
  });
  check('I16 a SKU outside the window is still found', found.id === 'k04900', JSON.stringify(found));
  check('I17 a SKU nobody holds comes back empty', found.missing === null, JSON.stringify(found.missing));

  const scale = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const t0 = performance.now();
    const few = await local.getAllByIndex('items', 'folderId', window.__folderId);
    const indexed = performance.now() - t0;
    const t1 = performance.now();
    const all = await local.getAll('items');
    const scanned = performance.now() - t1;
    return { few: few.length, all: all.length, indexed: Math.round(indexed), scanned: Math.round(scanned) };
  });
  check('I18 an indexed lookup of 10 records out of 5,000 returns exactly those 10',
    scale.few === 10 && scale.all === 5000, JSON.stringify(scale));
  check('I19 and costs a fraction of reading the inventory',
    scale.indexed * 4 < scale.scanned || scale.scanned < 8,
    `indexed ${scale.indexed}ms vs full read ${scale.scanned}ms`);
  check('I20 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── a batch is one write, not many ─────────────────────────────────────────
{
  const { page, context, errs } = await open({ seed: 20, inFolder: 0 });

  const rolledBack = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const before = await local.get('items', 'k00000');
    let threw = false;
    try {
      await local.transaction(['items'], 'readwrite', async (stores) => {
        await local.request(stores.items.put({ ...before, name: 'اسم جديد' }));
        throw new Error('حدث فشل في منتصف العملية');
      });
    } catch { threw = true; }
    const after = await local.get('items', 'k00000');
    return { threw, before: before.name, after: after.name };
  });
  check('I21 a failure inside a transaction rolls back the writes that preceded it',
    rolledBack.threw && rolledBack.after === rolledBack.before, JSON.stringify(rolledBack));
  check('I22 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── the object-URL cache is bounded ────────────────────────────────────────
{
  const { page, context, errs } = await open();

  const bounded = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    const local = await import('/src/local-store.js');
    // 400 one-pixel images, resolved one after another. Before the cache was
    // bounded, every object URL created here stayed alive for the session.
    const pixel = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    const urls = [];
    for (let i = 0; i < 400; i += 1) {
      const id = 'px' + i;
      await local.put('images', { id, thumbnail: pixel.buffer.slice(0), thumbnailType: 'image/png' });
      urls.push(await storage.imageSrc({ id, storagePath: 'local:' + id }, { thumbnail: true }));
    }
    // A cached entry hands back the URL it already made; an evicted one has
    // been revoked and has to make a new one. Comparing the strings says which
    // happened without touching the blob — the document's own policy forbids
    // fetching a blob: URL, and the object identity is the real property here.
    const newest = await storage.imageSrc({ id: 'px399', storagePath: 'local:px399' }, { thumbnail: true });
    const oldest = await storage.imageSrc({ id: 'px0', storagePath: 'local:px0' }, { thumbnail: true });
    return {
      alive: newest === urls[urls.length - 1],
      evicted: oldest !== urls[0],
      resolved: urls.filter(Boolean).length,
    };
  });
  check('I23 every image resolved', bounded.resolved === 400, String(bounded.resolved));
  check('I24 a recent image is still served from the cache', bounded.alive === true, String(bounded.alive));
  check('I25 and the oldest was evicted and revoked rather than held forever', bounded.evicted === true, String(bounded.evicted));
  check('I26 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── a hidden screen is not redrawn ─────────────────────────────────────────
{
  const { page, context, errs } = await open({ seed: 400, inFolder: 0 });

  const counted = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const grid = document.getElementById('hgrid');

    // Count the inventory grid being rebuilt. An import writing records emits
    // a snapshot per chunk, and each one used to rebuild every card on a
    // screen nobody was looking at — on the same thread as the screen they
    // were.
    let rebuilds = 0;
    const observer = new MutationObserver(() => { rebuilds += 1; });
    observer.observe(grid, { childList: true });

    const write = async (n) => {
      for (let i = 0; i < n; i += 1) {
        await repository.backend.runBatch([{
          type: 'set', collection: 'items', id: 'burst' + i, merge: false,
          data: {
            id: 'burst' + i, name: 'دفعة ' + i, quantity: 1, unit: 'قطعة',
            categoryId: 'c1', folderId: null, locationId: null, images: [],
            deletedAt: null, createdAt: Date.now(), updatedAt: Date.now(), version: 1,
          },
        }]);
      }
      await new Promise((r) => setTimeout(r, 600));
    };

    // Visible: writing must redraw it.
    rebuilds = 0;
    await write(4);
    const whileVisible = rebuilds;

    // Hidden behind Settings: writing must not.
    const { goTab } = await import('/src/navigation.js');
    goTab('set');
    await new Promise((r) => setTimeout(r, 400));
    rebuilds = 0;
    await write(4);
    const whileHidden = rebuilds;

    // And it is correct again the moment it is shown.
    rebuilds = 0;
    goTab('home');
    await new Promise((r) => setTimeout(r, 400));
    const onReturn = rebuilds;
    const shows = [...grid.querySelectorAll('.icard')].some((c) => /دفعة/.test(c.textContent));

    observer.disconnect();
    return { whileVisible, whileHidden, onReturn, shows };
  });

  check('I27 a visible list redraws when the data changes', counted.whileVisible > 0, String(counted.whileVisible));
  check('I28 a hidden list does not', counted.whileHidden === 0, String(counted.whileHidden));
  check('I29 and it is redrawn the moment it is shown again', counted.onReturn > 0, String(counted.onReturn));
  check('I30 showing the records written while it was hidden', counted.shows === true, String(counted.shows));
  check('I31 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── a photograph nobody kept does not keep its bytes ───────────────────────
{
  const { page, context, errs } = await open();

  const reclaimed = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    const { discardUnreferenced } = await import('/src/media.js');

    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const upload = (name) => storage.uploadImage(
      new File([png], name, { type: 'image/png' }),
      { mode: repository.session.mode, workspaceId: repository.session.workspaceId, itemId: 'i-' + name, userId: 'u' },
    );

    // Two uploads: one abandoned, one saved onto a record.
    const abandoned = await upload('abandoned.png');
    const kept = await upload('kept.png');
    await repository.createItem({ name: 'قطعة محفوظة', quantity: 1, unit: 'قطعة', categoryId: 'c1', images: [kept] });
    await new Promise((r) => setTimeout(r, 300));

    const before = await local.count('images');
    await discardUnreferenced(repository.session, [abandoned]);
    const after = await local.count('images');

    // The saved one must survive being offered for reclamation.
    await discardUnreferenced(repository.session, [kept]);
    const keptRow = await local.get('images', kept.id);
    const goneRow = await local.get('images', abandoned.id);

    return { before, after, keptSurvives: Boolean(keptRow), abandonedGone: !goneRow };
  });

  check('I32 an abandoned upload is reclaimed', reclaimed.after === reclaimed.before - 1
    && reclaimed.abandonedGone, JSON.stringify(reclaimed));
  check('I33 and a file a record points at is never touched',
    reclaimed.keptSurvives === true, String(reclaimed.keptSurvives));
  check('I34 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── an import that stopped does not write twice ────────────────────────────
{
  const { page, context, errs } = await open();

  const twice = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { planImport, attachTaxonomy, importItemId } = await import('/src/import-mapping.js');

    const rows = Array.from({ length: 40 }, (_, i) => [`قطعة مستوردة ${i}`, '1']);
    const { records } = planImport({
      rows, lines: rows.map((_, i) => i + 2), mapping: { name: 0, quantity: 1 },
      existing: { categories: [], locations: [], folders: [] },
    });
    const jobId = 'fixedjob';
    const resolved = attachTaxonomy(records, { categories: {}, locations: {}, folders: {} })
      .map((r) => ({ ...r, id: importItemId(jobId, r.sourceLine) }));

    // First attempt stops half way, as a dropped connection or a full quota
    // would stop it.
    await repository.bulkCreateItems(resolved.slice(0, 20));
    await new Promise((r) => setTimeout(r, 300));
    const afterPartial = await (await import('/src/local-store.js')).count('items');

    // The customer presses import again. The whole file is written, and the
    // half that already landed is rewritten rather than duplicated.
    await repository.bulkCreateItems(resolved);
    await new Promise((r) => setTimeout(r, 300));
    const afterRetry = await (await import('/src/local-store.js')).count('items');

    const names = new Set();
    await (await import('/src/local-store.js')).scan('items', { onPage: (page) => {
      for (const row of page) names.add(row.name);
    } });

    return { afterPartial, afterRetry, distinct: names.size };
  });

  check('I35 a half-finished import leaves exactly what it wrote', twice.afterPartial === 20, String(twice.afterPartial));
  check('I36 and retrying it writes the file once, not one and a half times',
    twice.afterRetry === 40, String(twice.afterRetry));
  check('I37 with no record duplicated', twice.distinct === 40, String(twice.distinct));
  check('I38 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── an import that the tab forgot is still remembered ──────────────────────
{
  const { page, context, errs } = await open();

  const remembered = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const view = await import('/src/views/sheet-import.js');

    const csv = ['الاسم,الكمية', ...Array.from({ length: 6 }, (_, i) => `قطعة ${i},1`)].join('\n');
    const file = () => new File([csv], 'stock.csv', { type: 'text/csv' });

    await view.openSpreadsheetImport(file());
    await new Promise((r) => setTimeout(r, 400));

    // The job as it would be left by a tab discarded mid-write.
    await local.put('importJobs', {
      id: 'stopped-job', startedAt: Date.now(), fileName: 'stock.csv',
      fileSize: file().size, total: 6, written: 3, status: 'stopped',
    });

    // The customer opens the app again and picks the same file.
    await view.openSpreadsheetImport(file());
    await new Promise((r) => setTimeout(r, 400));
    const resumed = view.__jobForTest?.() || null;

    // A different file is a different import.
    await view.openSpreadsheetImport(new File([csv], 'other.csv', { type: 'text/csv' }));
    await new Promise((r) => setTimeout(r, 400));
    const fresh = view.__jobForTest?.() || null;

    return { resumedId: resumed?.id || null, resumedWritten: resumed?.written ?? null, fresh };
  });

  check('I42 picking the same file again continues the import that stopped',
    remembered.resumedId === 'stopped-job' && remembered.resumedWritten === 3,
    JSON.stringify(remembered));
  check('I43 and a different file starts a new one', remembered.fresh === null, JSON.stringify(remembered.fresh));
  check('I44 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── a file is not allowed to cost the tab ──────────────────────────────────
{
  const { page, context, errs } = await open();

  const limits = await page.evaluate(async () => {
    const sheet = await import('/src/spreadsheet.js');
    const huge = new File([new Uint8Array(sheet.MAX_FILE_BYTES + 1024)], 'big.csv', { type: 'text/csv' });
    let code = null;
    try { await sheet.readSpreadsheet(huge); } catch (e) { code = e.code; }
    // And an ordinary file still opens.
    const fine = new File(['الاسم,الكمية\nساعة,2\n'], 'ok.csv', { type: 'text/csv' });
    const table = await sheet.readSpreadsheet(fine);
    return { code, headers: table.headers, rows: table.rows.length, limit: sheet.MAX_FILE_BYTES };
  });

  check('I39 an oversized file is refused before it is read', limits.code === 'sheet/too-large', String(limits.code));
  check('I40 and an ordinary one still opens', limits.rows === 1 && limits.headers.length === 2, JSON.stringify(limits));
  check('I41 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
