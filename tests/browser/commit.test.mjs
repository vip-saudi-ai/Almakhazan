// Browser test for the rule of this pass:
//
//   CHECK EARLY FOR UX. ENFORCE AGAIN AT COMMIT FOR CORRECTNESS.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/commit.test.mjs
//
// Each block puts a guarantee at the write itself and then tries to get past
// it the way real use would: a record appearing between a check and a
// commit, two tabs taking the last slot, a counter behind imported data, a
// backup with the same ids and different contents, a form closed half-way.

import { planStub } from './plan-stub.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const QUIET = /gstatic|ERR_|net::|firebase/;
const YEAR = new Date().getFullYear();

async function newContext(stub = { planId: 'business' }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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

async function seed(page, { live = 0, trashed = 0, extra = [] } = {}) {
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < live + trashed; i += 1) {
    rows.push({
      id: 's' + String(i).padStart(5, '0'), name: `قطعة ${i}`, quantity: 1, categoryId: 'uncategorized',
      folderId: null, images: [], deletedAt: i >= live ? now - i : null,
      createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1,
    });
  }
  rows.push(...extra);
  await page.evaluate(async (rows) => {
    const local = await import('/src/local-store.js');
    for (let i = 0; i < rows.length; i += 2000) await local.putMany('items', rows.slice(i, i + 2000));
  }, rows);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
}

const liveCount = (page) => page.evaluate(async () => {
  const local = await import('/src/local-store.js');
  const [all, trashed] = await Promise.all([local.count('items'), local.countRange('items', 'deletedAt', null)]);
  return all - trashed;
});

const expectedErrors = (errs, pattern) => errs.filter((line) => !pattern.test(line));

// ── 1. ifAbsent is enforced at the commit, on both backends ────────────────
//
// §1–§7, §75, §76, §95.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);

  const cloud = await page.evaluate(async () => {
    const { FirestoreBackend } = await import('/src/repository.js');
    // An in-memory Firestore: writeBatch cannot read; runTransaction reads
    // then writes. Enough to prove which path an operation takes.
    const docs = new Map();
    let batches = 0;
    const snap = (ref) => {
      const data = docs.get(ref.path);
      return { exists: () => data !== undefined, data: () => data, id: ref.path.split('/').pop() };
    };
    const put = (ref, data, options) => docs.set(ref.path, options?.merge ? { ...docs.get(ref.path), ...data } : { ...data });
    const fs = {
      collection: (_db, ...parts) => ({ path: parts.join('/') }),
      doc: (_db, ...parts) => ({ path: parts.join('/') }),
      serverTimestamp: () => 'TS',
      getDoc: async (ref) => snap(ref),
      writeBatch: () => {
        batches += 1;
        const ops = [];
        return {
          set: (ref, data, options) => ops.push(() => put(ref, data, options)),
          delete: (ref) => ops.push(() => docs.delete(ref.path)),
          commit: async () => ops.forEach((op) => op()),
        };
      },
      runTransaction: async (_db, fn) => {
        const ops = [];
        const tx = {
          get: async (ref) => snap(ref),
          set: (ref, data, options) => ops.push(() => put(ref, data, options)),
          update: (ref, data) => ops.push(() => put(ref, data, { merge: true })),
          delete: (ref) => ops.push(() => docs.delete(ref.path)),
        };
        const result = await fn(tx);
        ops.forEach((op) => op());
        return result;
      },
    };
    const backend = Object.create(FirestoreBackend.prototype);
    Object.assign(backend, { fs, db: {}, workspaceId: 'w1' });

    // The merge checked, and itm_A was not there…
    const before = await backend.existingIds('items', ['itm_A', 'itm_B']);
    // …then another device created it.
    docs.set('workspaces/w1/items/itm_A', { name: 'من جهاز آخر', version: 3 });
    const result = await backend.runBatch([
      { type: 'set', collection: 'items', id: 'itm_A', data: { name: 'من الملف' }, merge: false, ifAbsent: true },
      { type: 'set', collection: 'items', id: 'itm_B', data: { name: 'جديدة' }, merge: false, ifAbsent: true },
    ]);
    // A mixed batch: version guard and ifAbsent side by side.
    docs.set('workspaces/w1/items/itm_C', { name: 'ج', version: 1 });
    const mixed = await backend.runBatch([
      { type: 'set', collection: 'items', id: 'itm_C', data: { name: 'ج٢' }, merge: true, expectedVersion: 1, bumpVersion: true },
      { type: 'set', collection: 'items', id: 'itm_D', data: { name: 'د' }, merge: false, ifAbsent: true },
    ]);
    return {
      preflightSawA: before.has('itm_A'),
      result,
      a: docs.get('workspaces/w1/items/itm_A'),
      b: docs.get('workspaces/w1/items/itm_B'),
      c: docs.get('workspaces/w1/items/itm_C'),
      d: docs.get('workspaces/w1/items/itm_D'),
      mixed,
      batches,
    };
  });
  check('F1 a document created after the merge checked is not overwritten in the cloud',
    cloud.preflightSawA === false && cloud.a.name === 'من جهاز آخر' && cloud.a.version === 3, JSON.stringify(cloud.a));
  check('F2 it is reported as skipped, and the new one as applied',
    cloud.result.applied === 1 && cloud.result.skippedExisting.join() === 'itm_A' && cloud.b?.name === 'جديدة',
    JSON.stringify(cloud.result));
  check('F3 ifAbsent never goes through a write batch, which cannot read', cloud.batches === 0, String(cloud.batches));
  check('F4 a version guard and ifAbsent in one batch each keep their own rule',
    cloud.c.version === 2 && cloud.c.name === 'ج٢' && cloud.d?.name === 'د' && cloud.mixed.applied === 2,
    JSON.stringify({ c: cloud.c, d: cloud.d }));

  // The same race on the device, through the real merge.
  const device = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const { applyMerge } = await import('/src/exporting.js');
    const realExisting = repository.backend.existingIds.bind(repository.backend);
    // The check runs, finds nothing — then the record appears before the commit.
    repository.backend.existingIds = async (name, ids) => {
      const found = await realExisting(name, ids);
      if (name === 'items') await local.put('items', { id: 'race-1', name: 'سبقتها', quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 7 });
      return found;
    };
    const incoming = (id, name) => ({ id, name, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    await local.put('items', incoming('pre-existing', 'موجودة'));
    let result;
    try {
      result = await applyMerge({
        items: [incoming('race-1', 'من الملف'), incoming('fresh-1', 'جديدة'), incoming('pre-existing', 'من الملف')],
        folders: [], categories: [], locations: [],
      });
    } finally {
      repository.backend.existingIds = realExisting;
    }
    const log = (await local.getAll('activity')).filter((e) => e.action === 'IMPORT_MERGED').pop();
    return {
      result, logAdded: log?.added, logSkipped: log?.skipped,
      race: await local.get('items', 'race-1'),
      fresh: Boolean(await local.get('items', 'fresh-1')),
    };
  });
  check('F5 on the device the same race is a skip, and the record is untouched',
    device.race.name === 'سبقتها' && device.race.version === 7 && device.fresh, JSON.stringify(device.race));
  check('F6 the merge reports what it actually wrote: 1 added, 2 skipped — in the result and the log',
    device.result.added === 1 && device.result.skipped.items === 2 && device.logAdded === 1 && device.logSkipped === 2,
    JSON.stringify(device));
  check('F7 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 2. the plan limit, at every path that makes a record live ──────────────
//
// §8–§24, §67, §68.
{
  const context = await newContext({ planId: 'free' });
  const { page, errs } = await openPage(context);
  await seed(page, {
    live: 50,
    trashed: 5,
    extra: [],
  });
  await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    await local.put('images', { id: 'img-dup', original: new ArrayBuffer(4) });
    await local.put('mediaAssets', { id: 'img-dup', refCount: 1, storagePath: 'local:img-dup' });
    const row = await local.get('items', 's00000');
    await local.put('items', { ...row, images: [{ id: 'img-dup', mediaId: 'img-dup', storagePath: 'local:img-dup' }], primaryImageId: 'img-dup' });
  });

  const full = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const { applyMerge } = await import('/src/exporting.js');
    const attempt = async (fn) => { try { await fn(); return 'allowed'; } catch (error) { return error.code; } };
    const activityBefore = await local.count('activity');
    const out = {
      create: await attempt(() => repository.createItem({ name: 'الحادية والخمسون', quantity: 1 })),
      duplicate: await attempt(() => repository.duplicateItem('s00000')),
      restore: await attempt(() => repository.restoreItem('s00050')),
      merge: await attempt(() => applyMerge({ items: [{ id: 'merge-new', name: 'جديدة', quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 }], folders: [], categories: [], locations: [] })),
      edit: await attempt(async () => {
        const item = await repository.getItem('s00001', { fresh: true });
        await repository.updateItem('s00001', { name: 'معدّلة عند الحد' }, item.version);
      }),
    };
    out.dupRefCount = (await local.get('mediaAssets', 'img-dup')).refCount;
    out.restoredStillTrashed = Boolean((await local.get('items', 's00050')).deletedAt);
    out.mergeWritten = Boolean(await local.get('items', 'merge-new'));
    out.newActivity = (await local.getAll('activity')).slice(-5).map((e) => e.action)
      .filter((a) => a === 'ITEM_CREATED' || a === 'ITEM_DUPLICATED' || a === 'ITEM_RESTORED');
    out.activityDelta = (await local.count('activity')) - activityBefore;
    return out;
  });
  check('Q1 at 50 of 50, a new item is refused at the write', full.create === 'plan/item-limit', full.create);
  check('Q2 so is a duplicate — with no image reference taken', full.duplicate === 'plan/item-limit' && full.dupRefCount === 1, JSON.stringify(full));
  check('Q3 so is restoring from the Trash — the record stays there', full.restore === 'plan/item-limit' && full.restoredStillTrashed, JSON.stringify(full));
  check('Q4 so is merging one new record — nothing written', full.merge === 'plan/item-limit' && !full.mergeWritten, JSON.stringify(full));
  check('Q5 editing an existing record is still allowed at the limit', full.edit === 'allowed', full.edit);
  check('Q6 a refusal logs no success', full.newActivity.length === 0, JSON.stringify(full.newActivity));

  // The spreadsheet path, through the screen.
  await page.evaluate(async () => {
    const mod = await import('/src/views/sheet-import.js');
    await mod.openSpreadsheetImport(new File(['الاسم,الكمية\nجديدة من ملف,1\n'], 'one.csv', { type: 'text/csv' }));
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('#simport-foot button')].find((b) => b.textContent.includes('معاينة')).click());
  await page.waitForTimeout(200);
  const importDisabled = await page.evaluate(() =>
    [...document.querySelectorAll('#simport-foot button')].find((b) => b.textContent.startsWith('استيراد'))?.disabled);
  const forced = await page.evaluate(async () => {
    const mod = await import('/src/views/sheet-import.js');
    await mod.__runForTest();
    const local = await import('/src/local-store.js');
    return { jobs: await local.count('importJobs'), toast: [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | ') };
  });
  check('Q7 a one-row import at the limit is refused before a job or a record exists',
    importDisabled === true && forced.jobs === 0 && /خطتك/.test(forced.toast), JSON.stringify({ importDisabled, ...forced }));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('simport'));

  const cycle = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.deleteItem('s00002');
    const afterTrash = await (async () => {
      const local = await import('/src/local-store.js');
      return (await local.count('items')) - (await local.countRange('items', 'deletedAt', null));
    })();
    let created = 'allowed';
    try { await repository.createItem({ name: 'تتسع الآن', quantity: 1 }); } catch (error) { created = error.code; }
    let again = 'allowed';
    try { await repository.createItem({ name: 'لا تتسع', quantity: 1 }); } catch (error) { again = error.code; }
    return { afterTrash, created, again };
  });
  check('Q8 trashing one frees a slot (49), creating one fills it, the next is refused',
    cycle.afterTrash === 49 && cycle.created === 'allowed' && cycle.again === 'plan/item-limit', JSON.stringify(cycle));
  check('Q9 the count ends at exactly 50', (await liveCount(page)) === 50, String(await liveCount(page)));
  const unexpected = expectedErrors(errs, /plan\/item-limit|خطتك/);
  check('Q10 only the refusals are logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 3. the boundary is exact at every plan size ─────────────────────────────
//
// §96.
for (const limit of [50, 1000, 5000]) {
  const context = await newContext({ planId: 'business', quotaLimit: limit });
  const { page, errs } = await openPage(context);
  await seed(page, { live: limit - 1, trashed: 2 });
  const edge = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { applyMerge } = await import('/src/exporting.js');
    const attempt = async (fn) => { try { await fn(); return 'ok'; } catch (error) { return error.code; } };
    const record = (id) => ({ id, name: id, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    return {
      mergeLast: await attempt(() => applyMerge({ items: [record('edge-merge')], folders: [], categories: [], locations: [] })),
      createOver: await attempt(() => repository.createItem({ name: 'فوق الحد', quantity: 1 })),
      duplicateOver: await attempt(() => repository.duplicateItem('s00000')),
    };
  });
  const restoreId = `s${String(limit - 1).padStart(5, '0')}`;
  const restoreOver = await page.evaluate(async (id) => {
    const { repository } = await import('/src/repository.js');
    try { await repository.restoreItem(id); return 'ok'; } catch (error) { return error.code; }
  }, restoreId);
  const freed = await page.evaluate(async (id) => {
    const { repository } = await import('/src/repository.js');
    await repository.deleteItem('s00001');
    try { await repository.restoreItem(id); return 'ok'; } catch (error) { return error.code; }
  }, restoreId);
  check(`B-${limit} ${limit - 1}/${limit}: the last slot can be taken, then nothing more`,
    edge.mergeLast === 'ok' && edge.createOver === 'plan/item-limit' && edge.duplicateOver === 'plan/item-limit'
    && restoreOver === 'plan/item-limit' && freed === 'ok',
    JSON.stringify({ ...edge, restoreOver, freed }));
  check(`B-${limit} and the live count is exactly ${limit}`, (await liveCount(page)) === limit, String(await liveCount(page)));
  const unexpected = expectedErrors(errs, /plan\/item-limit|خطتك/);
  check(`B-${limit} no unexpected errors`, unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 4. a merge is charged only for what it adds ────────────────────────────
//
// §16, §97.
{
  const context = await newContext({ planId: 'free' });
  const { page, errs } = await openPage(context);
  await seed(page, { live: 48 });
  const mixed = await page.evaluate(async () => {
    const { applyMerge } = await import('/src/exporting.js');
    const record = (id) => ({ id, name: id, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    const existing = Array.from({ length: 8 }, (_, i) => record(`s${String(i).padStart(5, '0')}`));
    const first = await applyMerge({ items: [...existing, record('new-1'), record('new-2')], folders: [], categories: [], locations: [] });
    return { added: first.added, skipped: first.skipped.items };
  });
  check('M1 at 48/50, eight existing and two new: two added, eight skipped',
    mixed.added === 2 && mixed.skipped === 8 && (await liveCount(page)) === 50, JSON.stringify(mixed));
  await context.close();

  const context2 = await newContext({ planId: 'free' });
  const second = await openPage(context2);
  await seed(second.page, { live: 48 });
  const blocked = await second.page.evaluate(async () => {
    const { applyMerge } = await import('/src/exporting.js');
    const local = await import('/src/local-store.js');
    const record = (id) => ({ id, name: id, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    const existing = Array.from({ length: 7 }, (_, i) => record(`s${String(i).padStart(5, '0')}`));
    let code = null;
    try {
      await applyMerge({ items: [...existing, record('n-1'), record('n-2'), record('n-3')], folders: [], categories: [], locations: [] });
    } catch (error) { code = error.code; }
    return { code, written: (await local.getMany('items', ['n-1', 'n-2', 'n-3'])).length };
  });
  check('M2 at 48/50, three new: refused whole — not two of three', blocked.code === 'plan/item-limit' && blocked.written === 0, JSON.stringify(blocked));
  check('M3 no unexpected errors', expectedErrors([...errs, ...second.errs], /plan\/item-limit|خطتك/).length === 0);
  await context2.close();
}

// ── 5. two tabs, one slot ───────────────────────────────────────────────────
//
// §19, §20, §25.
{
  const context = await newContext({ planId: 'free' });
  const first = await openPage(context);
  await seed(first.page, { live: 49 });
  const second = await openPage(context);
  const create = (page, name) => page.evaluate(async (name) => {
    const { repository } = await import('/src/repository.js');
    try { await repository.createItem({ name, quantity: 1 }); return 'ok'; } catch (error) { return error.code; }
  }, name);
  const results = await Promise.all([create(first.page, 'من التبويب الأول'), create(second.page, 'من التبويب الثاني')]);
  const final = await liveCount(first.page);
  check('T1 two tabs at 49/50 creating at once: exactly one succeeds',
    results.filter((r) => r === 'ok').length === 1 && results.includes('plan/item-limit'), JSON.stringify(results));
  check('T2 and the inventory holds 50, not 51', final === 50, String(final));
  await context.close();
}

// ── 6. a full restore puts everything back, over the plan if it must ───────
//
// §18, §98.
{
  const context = await newContext({ planId: 'free' });
  const { page, errs } = await openPage(context);
  await seed(page, { live: 10 });
  const restored = await page.evaluate(async () => {
    const restore = await import('/src/restore.js');
    const { readBackupFile } = await import('/src/exporting.js');
    const { repository } = await import('/src/repository.js');
    const items = Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, name: `من النسخة ${i}`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1 + i, updatedAt: 1 + i, version: 1 }));
    const data = { items, folders: [], categories: [], locations: [] };
    const { sourceFingerprint } = await readBackupFile(new File([JSON.stringify(data)], 'b.json'));
    const result = await restore.restoreFromBackup(data, { saveBackup: () => {}, sourceFingerprint });
    const attempt = async (fn) => { try { await fn(); return 'ok'; } catch (error) { return error.code; } };
    return {
      restored: result.restored,
      create: await attempt(() => repository.createItem({ name: 'فوق الحد', quantity: 1 })),
      edit: await attempt(async () => { const it = await repository.getItem('b5', { fresh: true }); await repository.updateItem('b5', { name: 'عُدّلت' }, it.version); }),
      trash: await attempt(() => repository.deleteItem('b6')),
      export: await (await import('/src/views/manage.js')).runFullJsonExport(),
    };
  });
  const live = await liveCount(page);
  check('R1 a 100-record backup is restored whole on a 50-record plan', restored.restored === 100 && live === 99, JSON.stringify({ ...restored, live }));
  check('R2 and then: no new records, but edit, trash and export all work',
    restored.create === 'plan/item-limit' && restored.edit === 'ok' && restored.trash === 'ok' && restored.export === true,
    JSON.stringify(restored));
  check('R3 no unexpected errors', expectedErrors(errs, /plan\/item-limit|خطتك/).length === 0, expectedErrors(errs, /plan\/item-limit|خطتك/)[0]);
  await context.close();
}

// ── 7. a backup is identified by its bytes ─────────────────────────────────
//
// §26–§33, §77, §99.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const identity = await page.evaluate(async () => {
    const { readBackupFile } = await import('/src/exporting.js');
    const local = await import('/src/local-store.js');
    const restore = await import('/src/restore.js');
    const A = { items: [{ id: 'itm_1', name: 'Rolex', quantity: 1, categoryId: 'uncategorized', images: [], valuation: { min: 50000, max: 50000, currency: 'SAR' }, deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 }], folders: [], categories: [], locations: [] };
    const B = { items: [{ id: 'itm_1', name: 'Omega', quantity: 1, categoryId: 'uncategorized', images: [], valuation: { min: 10000, max: 10000, currency: 'USD' }, deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 }], folders: [], categories: [], locations: [] };
    const fa = (await readBackupFile(new File([JSON.stringify(A)], 'a.json'))).sourceFingerprint;
    const fb = (await readBackupFile(new File([JSON.stringify(B)], 'b.json'))).sourceFingerprint;
    const faAgain = (await readBackupFile(new File([JSON.stringify(A)], 'renamed.json'))).sourceFingerprint;
    // A restore of A that a dead tab left mid-removal.
    await local.setMeta('restoreJob', { id: 'rst-a', status: 'recovery-required', stage: 'remove', sourceFingerprint: fa, startedAt: 1 });
    let wrong = null;
    try { await restore.restoreFromBackup(B, { saveBackup: () => {}, sourceFingerprint: fb }); } catch (error) { wrong = { code: error.code, message: error.message }; }
    const untouched = await local.get('items', 'itm_1');
    const done = await restore.restoreFromBackup(A, { saveBackup: () => {}, sourceFingerprint: fa });
    const job = await local.getMeta('restoreJob');
    let none = null;
    try { await restore.restoreFromBackup(A, { saveBackup: () => {} }); } catch (error) { none = error.code; }
    return { differ: fa !== fb, stable: fa === faAgain, wrong, untouched: untouched == null, jobId: job.id, status: job.status, name: (await local.get('items', 'itm_1')).name, none, restored: done.restored };
  });
  check('I1 two backups with the same ids and different values have different identities',
    identity.differ && identity.stable, JSON.stringify(identity));
  check('I2 the other file cannot finish an interrupted restore, and changes nothing',
    identity.wrong?.code === 'restore/recovery-required' && /اختر ملف الاستعادة نفسه/.test(identity.wrong.message) && identity.untouched,
    JSON.stringify(identity.wrong));
  check('I3 the same file finishes it, under the same job',
    identity.jobId === 'rst-a' && identity.status === 'completed' && identity.name === 'Rolex', JSON.stringify(identity));
  check('I4 a restore with no identity does not start', identity.none === 'backup/fingerprint-unavailable', identity.none);

  const noDigest = await page.evaluate(async () => {
    const { readBackupFile } = await import('/src/exporting.js');
    const real = crypto.subtle.digest;
    crypto.subtle.digest = () => Promise.reject(new Error('denied'));
    try { await readBackupFile(new File(['{}'], 'x.json')); return null; } catch (error) { return { code: error.code, message: error.message }; } finally { crypto.subtle.digest = real; }
  });
  check('I5 a backup that cannot be hashed is refused with a plain message',
    noDigest?.code === 'backup/fingerprint-unavailable' && /هوية ملف النسخة الاحتياطية/.test(noDigest.message), JSON.stringify(noDigest));
  const unexpected = expectedErrors(errs, /fingerprint could not be computed|interrupted restore/);
  check('I6 no unexpected errors', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 8. a pending image lives exactly as long as its form ───────────────────
//
// §34–§45, §100.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const state = () => page.evaluate(async () => {
    const form = await import('/src/views/item-form.js');
    const media = await import('/src/media.js');
    return { form: form.__formPendingForTest(), global: [...media.pendingMediaIds()] };
  });
  // A real, decodable photograph, drawn by the browser itself.
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2563ff'; ctx.fillRect(0, 0, 64, 48);
    ctx.fillStyle = '#fff'; ctx.fillRect(8, 8, 20, 20);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  let shot = 0;
  const upload = async () => {
    const before = (await state()).form.length;
    shot += 1;
    await page.setInputFiles('#imgInput', { name: `photo-${shot}.png`, mimeType: 'image/png', buffer: png });
    // Polled from here: an async predicate would hand back a promise, which
    // counts as "true" before the upload has finished.
    for (let i = 0; i < 150; i += 1) {
      const now = await state();
      if (now.form.length > before) return now.form.at(-1);
      await page.waitForTimeout(100);
    }
    throw new Error('upload never became pending');
  };
  const asset = (id) => page.evaluate(async (id) => {
    const local = await import('/src/local-store.js');
    return (await local.get('mediaAssets', id)) || null;
  }, id);
  const openNew = () => page.evaluate(async () => {
    const form = await import('/src/views/item-form.js');
    await form.openItemForm();
    document.getElementById('f-name').value = 'قطعة بصورة';
  });
  const settle = () => page.waitForTimeout(600);

  // (a) saved
  await openNew();
  const a = await upload();
  const whileOpen = await state();
  await page.evaluate(() => document.getElementById('save-item-btn').click());
  await page.waitForFunction(() => !document.getElementById('sh-add').classList.contains('open'), null, { timeout: 15000 });
  await settle();
  const afterSave = await state();
  const savedAsset = await asset(a);
  check('P1 an uploaded image is pending while its form is open', whileOpen.global.includes(a), JSON.stringify(whileOpen));
  check('P2 once saved, it is no longer pending — and is counted once, not reclaimed',
    !afterSave.global.includes(a) && afterSave.form.length === 0 && savedAsset?.refCount === 1, JSON.stringify({ afterSave, savedAsset }));

  // (b)–(d) abandoned three ways
  for (const [label, close] of [
    ['closed by its button', () => page.evaluate(async () => (await import('/src/ui.js')).closeSheet('add'))],
    ['closed by Escape', () => page.keyboard.press('Escape')],
    ['closed by the overlay', () => page.evaluate(() => document.getElementById('ov-add').click())],
  ]) {
    await openNew();
    const id = await upload();
    await close();
    await settle();
    const after = await state();
    check(`P3 an unsaved image ${label} is released and reclaimed`,
      !after.global.includes(id) && (await asset(id)) == null, JSON.stringify({ after, id }));
  }

  // (e) conflict → reload latest
  const itemId = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return (await repository.createItem({ name: 'تعارض', quantity: 1 })).id;
  });
  const conflictSave = async (keepMine) => {
    await page.evaluate(async (id) => (await import('/src/views/item-form.js')).openItemForm({ itemId: id }), itemId);
    const id = await upload();
    await page.evaluate(async (itemId) => {
      const local = await import('/src/local-store.js');
      const row = await local.get('items', itemId);
      await local.put('items', { ...row, name: 'غيّرها جهاز آخر', version: row.version + 1 });
      document.getElementById('save-item-btn').click();
    }, itemId);
    await page.waitForFunction(() => document.getElementById('del-confirm').classList.contains('open'), null, { timeout: 15000 });
    await page.evaluate(async (keep) => (await import('/src/ui.js')).resolveConfirm(keep), keepMine);
    await settle();
    await page.waitForTimeout(400);
    return id;
  };
  const b = await conflictSave(false);
  const afterReload = await state();
  check('P4 conflict → reload latest: the unsaved image is released and reclaimed',
    !afterReload.global.includes(b) && afterReload.form.length === 0 && (await asset(b)) == null, JSON.stringify({ afterReload, b }));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('add'));
  await settle();

  // (f) conflict → keep mine
  const c = await conflictSave(true);
  await page.waitForFunction(() => !document.getElementById('sh-add').classList.contains('open'), null, { timeout: 15000 }).catch(() => {});
  await settle();
  const afterKeep = await state();
  const kept = await page.evaluate(async (id) => {
    const local = await import('/src/local-store.js');
    return (await local.get('items', id)).images.map((i) => i.id);
  }, itemId);
  check('P5 conflict → keep mine: the image is kept pending through the retry, then saved and released',
    kept.includes(c) && !afterKeep.global.includes(c) && (await asset(c))?.refCount === 1, JSON.stringify({ kept, afterKeep, c }));
  const unexpected = expectedErrors(errs, /عُدّلت هذه القطعة/);
  check('P6 no unexpected errors', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 9. generated SKUs: atomic, above what exists, per year ─────────────────
//
// §46–§60, §71–§74, §101, §102.
{
  const context = await newContext();
  const first = await openPage(context);
  const second = await openPage(context);
  const reserve = (page) => page.evaluate(async () => (await import('/src/repository.js')).repository.reserveSku());
  const meta = (key) => first.page.evaluate(async (key) => (await import('/src/local-store.js')).getMeta(key), key);

  await first.page.evaluate(async (year) => (await import('/src/local-store.js')).setMeta(`counter.sku.${year}`, 150), YEAR);
  const pair = await Promise.all([reserve(first.page), reserve(second.page)]);
  check('K1 two tabs reserving at once get two numbers',
    new Set(pair).size === 2 && pair.includes(`INV-${YEAR}-000151`) && pair.includes(`INV-${YEAR}-000152`), JSON.stringify(pair));
  check('K2 and the counter ends at the last one handed out', (await meta(`counter.sku.${YEAR}`)) === 152, String(await meta(`counter.sku.${YEAR}`)));

  const behind = await first.page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    await local.setMeta(`counter.sku.${year}`, 10);
    await local.put('items', { id: 'imported-500', name: 'مستوردة', sku: `INV-${year}-000500`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    await local.put('items', { id: 'custom-sku', name: 'رمز خاص', sku: `INV-${year}-WATCH`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    repository.invalidateSkuFloor();
    const one = await repository.reserveSku();
    const stored = await local.getMeta(`counter.sku.${year}`);
    const two = await repository.reserveSku();
    return { one, stored, two };
  }, YEAR);
  check('K3 a counter behind imported data jumps past it, and stores what it returned',
    behind.one === `INV-${YEAR}-000501` && behind.stored === 501 && behind.two === `INV-${YEAR}-000502`, JSON.stringify(behind));

  const imported = await first.page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    await local.setMeta(`counter.sku.${year}`, 12);
    await repository.bulkCreateItems([{ id: 'imp-4500', name: 'من جدول', sku: `INV-${year}-004500`, quantity: 1, categoryId: 'uncategorized' }], { log: false });
    return [await repository.reserveSku(), await repository.reserveSku()];
  }, YEAR);
  check('K4 after an import carrying INV-…-004500 the next two are 4501 and 4502',
    imported[0] === `INV-${YEAR}-004501` && imported[1] === `INV-${YEAR}-004502`, JSON.stringify(imported));

  const restoredFloor = await first.page.evaluate(async (year) => {
    const restore = await import('/src/restore.js');
    const { readBackupFile } = await import('/src/exporting.js');
    const { repository } = await import('/src/repository.js');
    const data = { items: [{ id: 'r-9999', name: 'من نسخة', sku: `INV-${year}-009999`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 }], folders: [], categories: [], locations: [] };
    const { sourceFingerprint } = await readBackupFile(new File([JSON.stringify(data)], 'b.json'));
    await restore.restoreFromBackup(data, { saveBackup: () => {}, sourceFingerprint });
    return repository.reserveSku();
  }, YEAR);
  check('K5 after a restore carrying INV-…-009999 the next is 010000', restoredFloor === `INV-${YEAR}-010000`, restoredFloor);

  const merged = await first.page.evaluate(async (year) => {
    const { applyMerge } = await import('/src/exporting.js');
    const { repository } = await import('/src/repository.js');
    await applyMerge({ items: [{ id: 'm-20000', name: 'مدمجة', sku: `INV-${year}-020000`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 }], folders: [], categories: [], locations: [] });
    return repository.reserveSku();
  }, YEAR);
  check('K6 after a merge carrying INV-…-020000 the next is 020001', merged === `INV-${YEAR}-020001`, merged);

  const nextYear = await first.page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    const floor = await local.maxSkuSequence(`INV-${year + 1}-`);
    const first = await local.reserveSkuSequence(year + 1, floor);
    return { floor, first, thisYear: await local.getMeta(`counter.sku.${year}`) };
  }, YEAR);
  check('K7 a new year starts its own sequence at 000001, and leaves this year\'s alone',
    nextYear.floor === 0 && nextYear.first === 1 && nextYear.thisYear === 20001, JSON.stringify(nextYear));

  const legacy = await first.page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    await local.setMeta('counter.sku', 777);
    return local.reserveSkuSequence(year + 5, 0);
  }, YEAR);
  check('K8 the old single counter is honoured once, as a floor, for a year with no counter yet', legacy === 778, String(legacy));

  const collision = await first.page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    const next = (await local.getMeta(`counter.sku.${year}`)) + 1;
    // Written behind the floor's back: the cached floor does not know it.
    await local.put('items', { id: 'sneaky', name: 'سبقت', sku: `INV-${year}-${String(next).padStart(6, '0')}`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    const sku = await repository.reserveUniqueSku();
    return { taken: `INV-${year}-${String(next).padStart(6, '0')}`, sku };
  }, YEAR);
  check('K9 the final check steps over a generated SKU a record already carries',
    collision.sku !== collision.taken && collision.sku > collision.taken, JSON.stringify(collision));

  const custom = await first.page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const item = await repository.createItem({ name: 'ساعتي', sku: 'WATCH-001', quantity: 1 });
    const local = await import('/src/local-store.js');
    return (await local.get('items', item.id)).sku;
  });
  check('K10 a customer\'s own SKU is kept as typed', custom === 'WATCH-001', custom);
  check('K11 no JS errors', [...first.errs, ...second.errs].length === 0, [...first.errs, ...second.errs][0]);
  await context.close();
}

// ── 10. detail and preview show the record as it is now ────────────────────
//
// §61–§66, §103, §104.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await seed(page, { live: 400 });
  const fresh = await page.evaluate(async () => {
    const detail = await import('/src/views/detail.js');
    const ui = await import('/src/ui.js');
    const local = await import('/src/local-store.js');
    await detail.openDetail('s00300');
    const first = document.getElementById('dettitle').textContent;
    ui.closeSheet('det');
    const row = await local.get('items', 's00300');
    await local.put('items', { ...row, name: 'اسم جديد من تبويب آخر', version: row.version + 1 });
    await detail.openDetail('s00300');
    const second = document.getElementById('dettitle').textContent;
    ui.closeSheet('det');
    await detail.openQuickPreview('s00300');
    const preview = document.getElementById('qptitle').textContent;
    ui.closeSheet('qp');
    return { first, second, preview };
  });
  check('D1 reopening a detail shows the change another tab made, without a reload',
    fresh.first === 'قطعة 300' && fresh.second === 'اسم جديد من تبويب آخر', JSON.stringify(fresh));
  check('D2 so does the quick preview', fresh.preview === 'اسم جديد من تبويب آخر', fresh.preview);

  const race = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const detail = await import('/src/views/detail.js');
    const real = repository.getItem.bind(repository);
    repository.getItem = async (id, options) => {
      if (id === 's00301') await new Promise((r) => setTimeout(r, 400));
      return real(id, options);
    };
    const slow = detail.openDetail('s00301');
    await detail.openDetail('s00302');
    await slow;
    repository.getItem = real;
    const title = document.getElementById('dettitle').textContent;
    (await import('/src/ui.js')).closeSheet('det');
    return title;
  });
  check('D3 a slower earlier read still cannot replace the detail opened after it', race === 'قطعة 302', race);
  check('D4 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
