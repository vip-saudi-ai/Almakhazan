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
import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const PLAN_STUB = planStub({ planId: 'business' });

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
          categoryId: 'art_paintings', folderId: 'old-folder', locationId: null,
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
          id, name: `قطعة ${i}`, quantity: 1, unit: 'قطعة', categoryId: 'art_paintings',
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

// ── upgrading from the version this build replaces ─────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.route('**/src/subscription.js', r => r.fulfill({ contentType: 'text/javascript', body: PLAN_STUB }));

  // A database written by the previous release: every store and index it had,
  // and none of the ones this build added.
  await page.addInitScript(() => {
    const request = indexedDB.open('almakhzan', 5);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      const spec = {
        items: ['updatedAt', 'createdAt', 'folderId', 'categoryId', 'locationId', 'sku', 'barcode', 'serialNumber', 'deletedAt', 'condition'],
        folders: [], categories: [], locations: [],
        activity: ['timestamp'], images: [], mediaAssets: [],
        importJobs: ['startedAt', 'fileFingerprint', 'status'], meta: [],
      };
      for (const [name, indexes] of Object.entries(spec)) {
        const store = db.objectStoreNames.contains(name)
          ? tx.objectStore(name)
          : db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        for (const index of indexes) if (!store.indexNames.contains(index)) store.createIndex(index, index);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['items', 'folders'], 'readwrite');
      tx.objectStore('folders').put({ id: 'f-old', name: 'مجلد قديم', icon: '🗂', color: '#007AFF' });
      for (let i = 0; i < 50; i += 1) {
        tx.objectStore('items').put({
          id: 'v4-' + i, name: `سجل قديم ${i}`, quantity: 1, unit: 'قطعة',
          categoryId: 'art_paintings', folderId: i < 12 ? 'f-old' : null, locationId: null,
          sku: `INV-2025-${String(i).padStart(6, '0')}`, barcode: String(600000 + i),
          serialNumber: `SN-OLD-${i}`, condition: i % 2 ? 'جيدة' : '',
          images: [], createdAt: 1700000000000 + i, updatedAt: 1700000000000 + i,
          version: 1, deletedAt: null,
        });
      }
      tx.oncomplete = () => db.close();
    };
  });

  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 25000 });
  await page.waitForTimeout(600);

  const upgraded = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const { queryInventory } = await import('/src/query.js');

    const kept = await local.count('items');
    const one = await local.get('items', 'v4-7');
    // The compound index this build added, backfilled from records written
    // before it existed — which is what makes a folder's chronological order
    // correct for a database that predates the index.
    const itemIndexes = await local.transaction('items', 'readonly',
      (stores) => [...stores.items.indexNames]);
    const scoped = await local.getAllByIndex('items', 'folderCreatedAt',
      IDBKeyRange.bound(['f-old'], ['f-old', []]));

    const folder = await queryInventory({ folderId: 'f-old', perPage: 24 });
    return {
      kept,
      name: one?.name || null,
      hasCompound: ['folderCreatedAt', 'categoryCreatedAt', 'locationCreatedAt']
        .every((index) => itemIndexes.includes(index)),
      backfilled: scoped.length,
      folderTotal: folder.total,
      folderBase: folder.plan?.baseIndex ?? null,
    };
  });

  check('M1 every record written by the previous version survives the upgrade',
    upgraded.kept === 50 && upgraded.name === 'سجل قديم 7', JSON.stringify(upgraded));
  check('M2 the compound indexes this build added exist after the upgrade',
    upgraded.hasCompound === true, String(upgraded.hasCompound));
  check('M3 and they are backfilled from records written before they existed',
    upgraded.backfilled === 12, String(upgraded.backfilled));
  check('M4 the query engine reads the upgraded database through them',
    upgraded.folderBase === 'folderCreatedAt' && upgraded.folderTotal === 12,
    JSON.stringify(upgraded));
  check('M5 no JS errors during the upgrade', errs.length === 0, errs[0]);
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
            categoryId: 'art_paintings', folderId: null, locationId: null, images: [],
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
    await repository.createItem({ name: 'قطعة محفوظة', quantity: 1, unit: 'قطعة', categoryId: 'art_paintings', images: [kept] });
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

    // The customer presses import again. The whole file is processed; the
    // half that already landed is skipped, never duplicated or overwritten.
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

// ── an import is identified by what the file is ────────────────────────────
{
  const { page, context, errs } = await open();

  const identity = await page.evaluate(async () => {
    const view = await import('/src/views/sheet-import.js');
    const wait = () => new Promise((r) => setTimeout(r, 500));

    // Two different files with the same name and the same byte count —
    // same character counts, every character in the same byte class. Name and
    // size were the old identity, and they would have matched each other here
    // — writing one file's numbers under the other file's record ids.
    const a = 'الاسم,الرقم\nساعة,1111\nخاتم,2222\n';
    const b = 'الاسم,الرقم\nمصبح,3333\nكرسي,4444\n';
    const fileA = () => new File([a], 'inventory.csv', { type: 'text/csv' });
    const fileB = () => new File([b], 'inventory.csv', { type: 'text/csv' });
    const sameSize = fileA().size === fileB().size;

    await view.openSpreadsheetImport(fileA());
    await wait();
    // The customer says the ambiguous column is a serial number, then the
    // import stops half way.
    view.__setMappingForTest({ name: 0, serialNumber: 1 }, { 1: 'serialNumber' });
    await view.__stopJobForTest(1);
    const stoppedId = view.__jobForTest()?.id || null;

    // The same file again: the job is found, and the mapping is the mapping.
    await view.openSpreadsheetImport(fileA());
    await wait();
    const resumed = view.__jobForTest();
    const resumedMapping = view.__mappingForTest();

    // The other file: same name, same size, different content.
    await view.openSpreadsheetImport(fileB());
    await wait();
    const other = view.__jobForTest();

    return {
      sameSize,
      stoppedId,
      resumedId: resumed?.id || null,
      resumedWritten: resumed?.written ?? null,
      resumedMapping,
      otherJob: other?.id || null,
    };
  });

  check('I42 the two files really are the same name and the same size',
    identity.sameSize === true, String(identity.sameSize));
  check('I43 the same file continues the import that stopped',
    identity.resumedId === identity.stoppedId && identity.resumedWritten === 1,
    JSON.stringify(identity));
  check('I44 with the mapping the customer chose, not a fresh guess at it',
    identity.resumedMapping?.serialNumber === 1, JSON.stringify(identity.resumedMapping));
  check('I45 a different file with the same name and size starts a new import',
    identity.otherJob === null, String(identity.otherJob));
  check('I46 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── a resumed import starts where it stopped ───────────────────────────────
{
  const { page, context, errs } = await open();

  const resumed = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { planImport, attachTaxonomy, importItemId } = await import('/src/import-mapping.js');
    const local = await import('/src/local-store.js');

    const ROWS = 1000;
    const CHUNK = 200;
    const rows = Array.from({ length: ROWS }, (_, i) => [`قطعة ${i}`, '1']);
    const { records } = planImport({
      rows, lines: rows.map((_, i) => i + 2), mapping: { name: 0, quantity: 1 },
      existing: { categories: [], locations: [], folders: [] },
    });
    const jobId = 'resume-job';
    const resolvedRecords = attachTaxonomy(records, { categories: {}, locations: {}, folders: {} })
      .map((r) => ({ ...r, id: importItemId(jobId, r.sourceLine) }));

    // The first attempt writes 400 and stops.
    let written = 0;
    for (let i = 0; i < 400; i += CHUNK) {
      await repository.bulkCreateItems(resolvedRecords.slice(i, i + CHUNK));
      written = i + CHUNK;
    }
    await new Promise((r) => setTimeout(r, 300));
    const afterStop = await local.count('items');

    // The resume, with the loop the screen runs: it begins at `written`.
    const touched = [];
    for (let i = Math.max(0, written); i < resolvedRecords.length; i += CHUNK) {
      const slice = resolvedRecords.slice(i, i + CHUNK);
      touched.push(i);
      await repository.bulkCreateItems(slice);
    }
    await new Promise((r) => setTimeout(r, 300));

    return { afterStop, firstChunkIndex: touched[0], chunks: touched.length, total: await local.count('items') };
  });

  check('I50 the stopped attempt left exactly what it wrote', resumed.afterStop === 400, String(resumed.afterStop));
  check('I51 the resume begins at the row it stopped on, not at the first',
    resumed.firstChunkIndex === 400, String(resumed.firstChunkIndex));
  check('I52 and writes only the chunks that were left', resumed.chunks === 3, String(resumed.chunks));
  check('I53 ending with the file written once', resumed.total === 1000, String(resumed.total));
  check('I54 no JS errors', errs.length === 0, errs[0]);
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

  check('I47 an oversized file is refused before it is read', limits.code === 'sheet/too-large', String(limits.code));
  check('I48 and an ordinary one still opens', limits.rows === 1 && limits.headers.length === 2, JSON.stringify(limits));
  check('I49 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── the activity log does not grow forever ─────────────────────────────────
{
  const { page, context, errs } = await open();

  const retention = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Three ages: today, inside a 30-day window, and well outside it.
    const rows = [];
    for (let i = 0; i < 20; i += 1) rows.push({ id: 'fresh' + i, action: 'ITEM_UPDATED', itemId: 'x', timestamp: now - i * 1000 });
    for (let i = 0; i < 20; i += 1) rows.push({ id: 'recent' + i, action: 'ITEM_UPDATED', itemId: 'x', timestamp: now - (5 * DAY) - i });
    for (let i = 0; i < 60; i += 1) rows.push({ id: 'old' + i, action: 'ITEM_UPDATED', itemId: 'x', timestamp: now - (200 * DAY) - i });
    await local.putMany('activity', rows);
    const before = await local.count('activity');

    await local.setMeta('activity.lastPrunedAt', 0);
    const result = await repository.enforceActivityRetention(30, { now });
    const after = await local.count('activity');
    const survivors = await local.getAll('activity');

    // And it does not run again straight away.
    const second = await repository.enforceActivityRetention(30, { now });

    return {
      before, after, pruned: result.pruned, secondSkipped: second.skipped,
      oldestKept: Math.min(...survivors.map((r) => r.timestamp)),
      cutoff: result.cutoff,
      structured: survivors.every((r) => r.action && r.itemId && r.timestamp),
    };
  });

  check('I55 only the entries older than the cutoff are removed',
    retention.before === 100 && retention.after === 40 && retention.pruned === 60,
    JSON.stringify(retention));
  check('I56 and nothing inside the retention window is touched',
    retention.oldestKept >= retention.cutoff, JSON.stringify(retention));
  check('I57 the entries that remain are still structured events, not text',
    retention.structured === true, String(retention.structured));
  check('I58 pruning does not run again on the next start of the same day',
    retention.secondSkipped === 'recent', String(retention.secondSkipped));
  check('I59 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── the integrity checker finds what it is for ─────────────────────────────
{
  const { page, context, errs } = await open();

  const report = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const { checkIntegrity } = await import('/src/integrity.js');
    const now = Date.now();
    const base = {
      quantity: 1, unit: 'قطعة', categoryId: 'art_paintings', folderId: null, locationId: null,
      images: [], deletedAt: null, createdAt: now, updatedAt: now, version: 1,
    };

    await local.putMany('items', [
      { ...base, id: 'ok-1', name: 'سليم', sku: 'INV-1' },
      // One of each thing the checker is supposed to notice.
      { ...base, id: 'bad-folder', name: 'مجلد مفقود', folderId: 'gone' },
      { ...base, id: 'bad-location', name: 'موقع مفقود', locationId: 'gone' },
      { ...base, id: 'bad-category', name: 'تصنيف مفقود', categoryId: 'gone' },
      { ...base, id: 'bad-primary', name: 'صورة رئيسية',
        images: [{ id: 'img-a', mediaId: 'img-a' }], primaryImageId: 'img-z' },
      { ...base, id: 'bad-version', name: 'إصدار', version: 0 },
      { ...base, id: 'bad-qty', name: 'كمية', quantity: -3 },
      { ...base, id: 'bad-money', name: 'مال',
        valuation: { min: 9000, max: 5000, currency: 'SAR', source: 'manual' } },
      { ...base, id: 'bad-currency', name: 'عملة',
        valuation: { min: 100, max: 100, currency: 'AEDXX', source: 'manual' } },
      { ...base, id: 'bad-deleted', name: 'محذوف', deletedAt: 'أمس' },
      { ...base, id: 'dup-a', name: 'مكرر أ', sku: 'INV-SAME', serialNumber: 'SN-SAME' },
      { ...base, id: 'dup-b', name: 'مكرر ب', sku: 'INV-SAME', serialNumber: 'SN-SAME' },
    ]);
    await local.put('mediaAssets', { id: 'orphan-1', refCount: -1 });

    const result = await checkIntegrity();
    return {
      kinds: [...new Set(result.findings.map((f) => f.kind))].sort(),
      ok: result.ok,
      items: result.checked.items,
    };
  });

  const expected = [
    'bad-currency', 'bad-deleted-at', 'bad-quantity', 'bad-version',
    'dangling-category', 'dangling-folder', 'dangling-location',
    'duplicate-serial', 'duplicate-sku', 'inverted-valuation',
    'negative-refcount', 'primary-image-missing',
  ];
  const missing = expected.filter((kind) => !report.kinds.includes(kind));

  check('I60 every kind of damage the checker is for is reported',
    missing.length === 0, `missing: ${missing.join(', ')}`);
  check('I61 and the workspace is reported as not ok', report.ok === false, String(report.ok));
  check('I62 having read every record', report.items === 12, String(report.items));
  check('I63 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── a clean workspace reports clean ────────────────────────────────────────
{
  const { page, context, errs } = await open({ seed: 300, inFolder: 40 });

  const clean = await page.evaluate(async () => {
    const { checkIntegrity } = await import('/src/integrity.js');
    const result = await checkIntegrity();
    return { ok: result.ok, findings: result.findings.slice(0, 5), items: result.checked.items };
  });

  // The seeded workspace is written the way the app writes: if the checker
  // complains about it, either the checker or the app is wrong, and that is
  // worth knowing before either one is trusted.
  check('I64 a workspace the app itself wrote passes the check',
    clean.ok === true && clean.items === 300, JSON.stringify(clean));
  check('I65 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── a stale screen does not overwrite a newer edit ─────────────────────────
{
  const { page, context, errs } = await open({ seed: 40, inFolder: 0 });

  const conflict = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');

    const id = 'k00000';
    const before = await local.get('items', id);

    // This screen is holding version 1 — the copy the customer selected from.
    const stale = repository.item(id);

    // Another tab edits the same record. Written straight to the store,
    // because that is what another tab's write looks like from here: the
    // device backend has no cross-tab notification, so this tab's copy stays
    // at version 1 while the stored record moves to 2. That gap is the hazard.
    await local.put('items', { ...before, name: 'اسم من تبويب آخر', version: before.version + 1 });
    const afterOther = await local.get('items', id);

    // The stale screen now includes it in a bulk move.
    let error = null;
    try {
      await repository.bulkUpdate([id, 'k00001', 'k00002'], { condition: 'ممتازة' });
    } catch (e) { error = { code: e.code, message: e.message }; }
    await new Promise((r) => setTimeout(r, 200));

    const afterBulk = await local.get('items', id);
    const neighbour = await local.get('items', 'k00001');

    return {
      startedAt: before.version,
      staleVersion: stale.version,
      otherTabVersion: afterOther.version,
      otherTabName: afterOther.name,
      error,
      finalVersion: afterBulk.version,
      finalName: afterBulk.name,
      finalCondition: afterBulk.condition,
      neighbourCondition: neighbour.condition,
    };
  });

  check('I66 the other tab\'s edit landed', conflict.otherTabVersion === conflict.startedAt + 1
    && conflict.otherTabName === 'اسم من تبويب آخر', JSON.stringify(conflict));
  check('I67 the bulk write refuses rather than overwriting it',
    conflict.error?.code === 'repo/bulk-conflict', JSON.stringify(conflict.error));
  check('I68 and says what to do about it',
    /حدّث القائمة/.test(conflict.error?.message || ''), conflict.error?.message);
  check('I69 the newer edit survives untouched',
    conflict.finalName === 'اسم من تبويب آخر' && conflict.finalVersion === conflict.otherTabVersion,
    JSON.stringify(conflict));
  check('I70 and the chunk rolled back rather than half-applying',
    conflict.finalCondition !== 'ممتازة' && conflict.neighbourCondition !== 'ممتازة',
    JSON.stringify({ a: conflict.finalCondition, b: conflict.neighbourCondition }));
  check('I71 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── the same protection on the Trash ───────────────────────────────────────
{
  const { page, context, errs } = await open({ seed: 40, inFolder: 0 });

  const trashed = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const id = 'k00000';
    const stale = repository.item(id);

    // Another tab's write, as above: straight to the store, leaving this tab
    // holding the older copy.
    const stored = await local.get('items', id);
    await local.put('items', { ...stored, name: 'حُرّر في مكان آخر', version: stored.version + 1 });

    let error = null;
    try { await repository.bulkTrash([id]); } catch (e) { error = e.code; }
    await new Promise((r) => setTimeout(r, 200));
    const after = await local.get('items', id);
    return { staleVersion: stale.version, error, deletedAt: after.deletedAt, name: after.name };
  });

  check('I72 trashing a record somebody else just edited is refused',
    trashed.error === 'repo/bulk-conflict', String(trashed.error));
  check('I73 and the record is neither trashed nor reverted',
    trashed.deletedAt == null && trashed.name === 'حُرّر في مكان آخر', JSON.stringify(trashed));
  check('I74 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 250 records, one of them stale ─────────────────────────────────────────
{
  const { page, context, errs } = await open({ seed: 300, inFolder: 0 });

  const outcome = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');

    await repository.completeItems();
    const ids = Array.from({ length: 250 }, (_, i) => 'k' + String(i).padStart(5, '0'));

    // Record 143 is edited elsewhere — written straight to the store, which is
    // what another tab's write looks like from here.
    const staleId = ids[142];
    const stored = await local.get('items', staleId);
    await local.put('items', { ...stored, name: 'حُرّر في مكان آخر', version: stored.version + 1 });

    let error = null;
    try {
      await repository.bulkUpdate(ids, { condition: 'ممتازة' });
    } catch (e) { error = { code: e.code, message: e.message, applied: e.applied }; }
    await new Promise((r) => setTimeout(r, 300));

    // Nothing at all should have changed — including the first hundred, which
    // a chunked implementation would already have committed.
    let changed = 0;
    for (const id of ids) {
      const row = await local.get('items', id);
      if (row.condition === 'ممتازة') changed += 1;
    }

    // Now refresh and retry, as the message says to.
    await repository.completeItems();
    const fresh = await local.get('items', staleId);
    await repository.backend.runAtomicBatch([{
      type: 'set', collection: 'items', id: staleId, merge: true, data: { name: fresh.name },
    }]);
    await new Promise((r) => setTimeout(r, 300));

    let retryError = null;
    try {
      await repository.bulkUpdate(ids, { condition: 'ممتازة' });
    } catch (e) { retryError = e.code; }
    await new Promise((r) => setTimeout(r, 300));

    let after = 0;
    for (const id of ids) {
      const row = await local.get('items', id);
      if (row.condition === 'ممتازة') after += 1;
    }
    const untouched = await local.get('items', 'k00260');

    return { error, changed, retryError, after, untouchedCondition: untouched.condition };
  });

  check('I75 a conflict anywhere in 250 records refuses the whole operation',
    outcome.error?.code === 'repo/bulk-conflict', JSON.stringify(outcome.error));
  check('I76 and zero of the 250 are modified — not the first hundred',
    outcome.changed === 0, `${outcome.changed} of 250 changed`);
  check('I77 the message says nothing was applied, because nothing was',
    /لم يتم تطبيق أي تغيير/.test(outcome.error?.message || ''), outcome.error?.message);
  check('I78 after refreshing, the retry applies all 250',
    outcome.retryError === null && outcome.after === 250,
    JSON.stringify({ error: outcome.retryError, after: outcome.after }));
  check('I79 and touches nothing outside the selection',
    outcome.untouchedCondition !== 'ممتازة', String(outcome.untouchedCondition));
  check('I80 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── the same for the Trash ─────────────────────────────────────────────────
{
  const { page, context, errs } = await open({ seed: 300, inFolder: 0 });

  const outcome = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    await repository.completeItems();

    const ids = Array.from({ length: 250 }, (_, i) => 'k' + String(i).padStart(5, '0'));
    const staleId = ids[142];
    const stored = await local.get('items', staleId);
    await local.put('items', { ...stored, name: 'حُرّر في مكان آخر', version: stored.version + 1 });

    let error = null;
    try { await repository.bulkTrash(ids); } catch (e) { error = e.code; }
    await new Promise((r) => setTimeout(r, 300));

    let trashed = 0;
    for (const id of ids) {
      const row = await local.get('items', id);
      if (row.deletedAt) trashed += 1;
    }
    return { error, trashed };
  });

  check('I81 a stale record in a 250-record trash refuses the whole operation',
    outcome.error === 'repo/bulk-conflict', String(outcome.error));
  check('I82 and none of the 250 are trashed', outcome.trashed === 0, `${outcome.trashed} of 250`);
  check('I83 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
