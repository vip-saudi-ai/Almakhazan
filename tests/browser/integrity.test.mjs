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

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
