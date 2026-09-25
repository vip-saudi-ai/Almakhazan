// Browser test for the rule this pass exists to make true:
//
//   THE HOME SCREEN IS A WINDOW, NOT THE DATABASE.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/authority.test.mjs
//
// Every check here uses a record the window of the newest few hundred has
// never held — found by a search, deep in the inventory — and asserts that
// opening, editing, moving, deleting, labelling, selecting, merging, purging
// and counting it behave as they would for the newest record on the screen.

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

async function newContext({ stub = { planId: 'business' }, extraRoutes } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/src/subscription.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: planStub(stub),
  }));
  if (extraRoutes) await extraRoutes(context);
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

/** Seeds straight into the store, then reloads — the way an old inventory is
 *  met: by a repository that holds only the newest window of it. The rows are
 *  built here, not in the page: the app's CSP rightly refuses \`new Function\`. */
async function seed(page, count, shape = () => ({})) {
  const now = Date.now();
  for (let start = 0; start < count; start += 2000) {
    const rows = [];
    for (let i = start; i < Math.min(count, start + 2000); i += 1) {
      rows.push({
        id: 'r' + String(i).padStart(6, '0'), name: `قطعة ${i}`, quantity: 1, unit: 'قطعة',
        sku: `SKU-${String(i).padStart(6, '0')}`, serialNumber: `SER-${String(i).padStart(6, '0')}`,
        categoryId: 'uncategorized', folderId: null, locationId: null, condition: '', images: [],
        deletedAt: null, createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1,
        ...shape(i, now),
      });
    }
    await page.evaluate(async (rows) => {
      const local = await import('/src/local-store.js');
      await local.putMany('items', rows);
    }, rows);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  await page.waitForTimeout(300);
}

const acceptConfirm = (page) => page.evaluate(async () => {
  for (let i = 0; i < 40; i += 1) {
    if (document.getElementById('del-confirm').classList.contains('open')) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  (await import('/src/ui.js')).resolveConfirm(true);
});

// ── 1. a record found by a search, far outside the window ───────────────────
//
// §107, §1–§18, §85–§89, §125–§126.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await seed(page, 10000);

  const found = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { queryInventory, emptyQuery } = await import('/src/query.js');
    const result = await queryInventory({ ...emptyQuery(), search: 'SER-005000', page: 1, perPage: 24 });
    return {
      ids: result.rows.map((r) => r.id),
      held: repository.state.items.length,
      inWindow: Boolean(repository.state.items.find((i) => i.id === 'r005000')),
    };
  });
  check('W1 the search finds a record the window does not hold',
    found.ids[0] === 'r005000' && !found.inWindow && found.held <= 400, JSON.stringify(found));

  const detail = await page.evaluate(async () => {
    const mod = await import('/src/views/detail.js');
    await mod.openDetail('r005000');
    return {
      open: document.getElementById('sh-det').classList.contains('open'),
      title: document.getElementById('dettitle').textContent,
      toast: [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '),
    };
  });
  check('W2 its detail opens — not «القطعة غير موجودة»',
    detail.open && detail.title === 'قطعة 5000' && !/غير موجودة/.test(detail.toast), JSON.stringify(detail));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('det'));

  const preview = await page.evaluate(async () => {
    const mod = await import('/src/views/detail.js');
    await mod.openQuickPreview('r005000');
    return { open: document.getElementById('sh-qp').classList.contains('open'), title: document.getElementById('qptitle').textContent };
  });
  check('W3 and its quick preview', preview.open && preview.title === 'قطعة 5000', JSON.stringify(preview));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('qp'));

  const menu = await page.evaluate(async () => {
    const home = await import('/src/views/home.js');
    await home.openContextMenu('r005000');
    const out = { open: document.getElementById('ctx-as').classList.contains('open'), name: document.getElementById('ctx-name').textContent };
    home.closeContextMenu();
    return out;
  });
  check('W4 and its context menu', menu.open && menu.name === 'قطعة 5000', JSON.stringify(menu));

  const edit = await page.evaluate(async () => {
    const form = await import('/src/views/item-form.js');
    await form.openItemForm({ itemId: 'r005000' });
    const name = document.getElementById('f-name');
    const before = name.value;
    name.value = 'قطعة 5000 معدّلة';
    document.getElementById('save-item-btn').click();
    for (let i = 0; i < 60; i += 1) {
      if (!document.getElementById('sh-add').classList.contains('open')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const local = await import('/src/local-store.js');
    const stored = await local.get('items', 'r005000');
    return { before, name: stored.name, version: stored.version };
  });
  check('W5 it can be edited, from the stored version',
    edit.before === 'قطعة 5000' && edit.name === 'قطعة 5000 معدّلة' && edit.version === 2, JSON.stringify(edit));

  const moved = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const folder = await repository.saveFolder({ name: 'بعيد', icon: '🗂', color: '#2563FF' });
    const mod = await import('/src/views/detail.js');
    await mod.openMoveSheet('r004000');
    const row = [...document.querySelectorAll('#mvlist .mv-row')].find((b) => b.textContent.includes('بعيد'));
    row.click();
    await new Promise((r) => setTimeout(r, 400));
    const local = await import('/src/local-store.js');
    return { folderId: (await local.get('items', 'r004000')).folderId, expected: folder.id };
  });
  check('W6 it can be moved', moved.folderId === moved.expected, JSON.stringify(moved));

  const duplicated = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const copy = await repository.duplicateItem('r006000');
    return { name: copy.name, id: copy.id };
  });
  check('W7 it can be duplicated from the stored record',
    duplicated.name === 'قطعة 6000 (نسخة)', JSON.stringify(duplicated));

  const labels = await page.evaluate(async () => {
    const mod = await import('/src/views/labels.js');
    await mod.openLabels(['r007000', 'r007001', 'gone-for-good']);
    const out = {
      open: document.getElementById('sh-labels').classList.contains('open'),
      names: [...document.querySelectorAll('.label-name')].map((n) => n.textContent),
      toast: [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '),
    };
    mod.closeLabels();
    return out;
  });
  check('W8 it can be labelled, and a missing id is said, not dropped',
    labels.open && labels.names.includes('قطعة 7000') && labels.names.includes('قطعة 7001') && /لم تعد موجودة/.test(labels.toast),
    JSON.stringify(labels));

  const deleted = await page.evaluate(async () => {
    const mod = await import('/src/views/detail.js');
    const run = mod.deleteItemFlow('r008000');
    for (let i = 0; i < 40; i += 1) {
      if (document.getElementById('del-confirm').classList.contains('open')) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    (await import('/src/ui.js')).resolveConfirm(true);
    await run;
    const local = await import('/src/local-store.js');
    return { deletedAt: (await local.get('items', 'r008000')).deletedAt };
  });
  check('W9 it can be deleted', Number.isFinite(deleted.deletedAt), JSON.stringify(deleted));

  const missing = await page.evaluate(async () => {
    const mod = await import('/src/views/detail.js');
    await mod.openDetail('no-such-record');
    return [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | ');
  });
  check('W10 only a record the store does not hold is «not there»',
    /لم تعد هذه القطعة موجودة/.test(missing), missing);

  // §87: a card drawn at version N; another tab writes N+1; the old card's
  // delete must conflict, not overwrite.
  const stale = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const shown = await repository.getItem('r009000');
    await local.put('items', { ...shown, name: 'غيّرها تبويب آخر', version: shown.version + 1 });
    let code = null;
    try { await repository.deleteItem('r009000', shown.version); } catch (error) { code = error.code; }
    return { code, deletedAt: (await local.get('items', 'r009000')).deletedAt };
  });
  check('W11 a delete from a stale card is a conflict, not an overwrite',
    stale.code === 'repo/conflict' && stale.deletedAt == null, JSON.stringify(stale));

  // §125: A then B; A's slower answer must not replace B.
  const race = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const mod = await import('/src/views/detail.js');
    const real = repository.getItem.bind(repository);
    repository.getItem = async (id, options) => {
      if (id === 'r001234') await new Promise((r) => setTimeout(r, 400));
      return real(id, options);
    };
    const slow = mod.openDetail('r001234');
    await mod.openDetail('r001235');
    await slow;
    repository.getItem = real;
    const title = document.getElementById('dettitle').textContent;
    (await import('/src/ui.js')).closeSheet('det');
    return title;
  });
  check('W12 a slower earlier fetch does not replace the detail opened after it', race === 'قطعة 1235', race);

  // §126: navigating away while the fetch is in flight opens nothing.
  const navigated = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const mod = await import('/src/views/detail.js');
    const nav = await import('/src/navigation.js');
    const real = repository.getItem.bind(repository);
    repository.getItem = async (id, options) => { await new Promise((r) => setTimeout(r, 300)); return real(id, options); };
    const pending = mod.openDetail('r002345');
    nav.goTab('set');
    await pending;
    repository.getItem = real;
    nav.goTab('home');
    return document.getElementById('sh-det').classList.contains('open');
  });
  check('W13 navigating away during the fetch does not reopen the detail', navigated === false, String(navigated));
  check('W14 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 2. selection across records the window never held ──────────────────────
//
// §12, §13, §108.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await seed(page, 3000, (i) => (i >= 2000 && i < 2010 ? { name: `بعيدة ${i}` } : {}));

  // Through the screen: search, select seven cards, move them.
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.saveFolder({ id: 'fld-dest', name: 'الوجهة', icon: '🗂', color: '#2563FF' });
    const input = document.getElementById('hsearch');
    input.value = 'بعيدة';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  const picked = await page.evaluate(async () => {
    const home = await import('/src/views/home.js');
    home.startSelection();
    await new Promise((r) => setTimeout(r, 300));
    const ids = [...new Set([...document.querySelectorAll('[data-id]')].map((n) => n.dataset.id))]
      .filter((id) => id.startsWith('r002')).slice(0, 7);
    for (const id of ids) {
      // Re-found each time: a toggle re-renders the page.
      const card = document.querySelector(`[data-id="${id}"]`);
      (card.querySelector('.icard-open') || card).click();
      await new Promise((r) => setTimeout(r, 150));
    }
    // A search over 3,000 records is a scan, and the bar repaints with the
    // list — wait for the paint that follows the last toggle.
    for (let i = 0; i < 60; i += 1) {
      if (/7/.test(document.querySelector('.selbar-count')?.textContent || '')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return { count: document.querySelector('.selbar-count')?.textContent || '', ids };
  });
  check('S1 seven records outside the window can be selected',
    /7/.test(picked.count) && picked.ids.length === 7, JSON.stringify(picked));

  await page.evaluate(() => {
    [...document.querySelectorAll('.selact')].find((b) => b.textContent.includes('نقل')).click();
  });
  await page.waitForTimeout(400);
  const options = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('#bulk-options button')];
    const target = buttons.find((b) => b.textContent.includes('الوجهة'));
    target?.click();
    return buttons.map((b) => b.textContent);
  });
  if (!options.some((o) => o.includes('الوجهة'))) console.log('bulk options:', JSON.stringify(options));
  await page.waitForTimeout(1500);
  const moved = await page.evaluate(async (ids) => {
    const local = await import('/src/local-store.js');
    const rows = await local.getMany('items', ids);
    return {
      moved: rows.filter((r) => r.folderId === 'fld-dest').length,
      toast: [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '),
    };
  }, picked.ids);
  check('S2 all seven are moved — not the few the window happened to hold',
    moved.moved === 7, JSON.stringify(moved));
  check('S3 and the screen says seven', /7/.test(moved.toast), moved.toast);

  const reported = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const result = await repository.bulkUpdate(['r002008', 'r002009', 'nope-1'], { condition: 'ممتازة' });
    return { updated: result.updated, missing: result.missing, requested: result.requested };
  });
  check('S4 an id that no longer exists is reported, not silently dropped',
    reported.updated === 2 && reported.missing.includes('nope-1') && reported.requested === 3, JSON.stringify(reported));
  check('S5 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 3. purging a record the window never held releases its media ───────────
//
// §16, §36, §109.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await seed(page, 800);
  const result = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    const img = (id) => ({ id, mediaId: id, storagePath: `local:${id}`, thumbnailPath: `local:${id}`, mimeType: 'image/jpeg' });
    for (const id of ['m-own-1', 'm-own-2', 'm-shared']) {
      await local.put('images', { id, original: new ArrayBuffer(8), thumbnail: new ArrayBuffer(4), originalType: 'image/jpeg' });
    }
    await local.put('mediaAssets', { id: 'm-own-1', refCount: 1, storagePath: 'local:m-own-1' });
    await local.put('mediaAssets', { id: 'm-own-2', refCount: 1, storagePath: 'local:m-own-2' });
    await local.put('mediaAssets', { id: 'm-shared', refCount: 2, storagePath: 'local:m-shared' });
    const old = Date.now() - 10 ** 9;
    await local.put('items', {
      id: 'purge-me', name: 'قديمة محذوفة', quantity: 1, categoryId: 'uncategorized', folderId: null,
      images: [img('m-own-1'), img('m-own-2'), img('m-shared')], primaryImageId: 'm-own-1',
      deletedAt: old, createdAt: old, updatedAt: old, version: 1,
    });
    await local.put('items', {
      id: 'keeps-shared', name: 'تشارك الصورة', quantity: 1, categoryId: 'uncategorized', folderId: null,
      images: [img('m-shared')], primaryImageId: 'm-shared', deletedAt: null, createdAt: old, updatedAt: old, version: 1,
    });
    const inWindow = Boolean(repository.item('purge-me'));
    await repository.purgeItem('purge-me');
    return {
      inWindow,
      item: await local.get('items', 'purge-me'),
      own1: await local.get('mediaAssets', 'm-own-1'),
      own2Blob: await local.get('images', 'm-own-2'),
      shared: (await local.get('mediaAssets', 'm-shared'))?.refCount,
      sharedBlob: Boolean(await local.get('images', 'm-shared')),
    };
  });
  check('M1 a trashed record outside the window can be purged',
    result.inWindow === false && result.item == null, JSON.stringify({ inWindow: result.inWindow }));
  check('M2 its own images are released and reclaimed',
    result.own1 == null && result.own2Blob == null, JSON.stringify(result));
  check('M3 an image another record still shows survives, one reference lighter',
    result.shared === 1 && result.sharedBlob === true, JSON.stringify(result));
  check('M4 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 4. media counts: no lost update, and a real reconciler ──────────────────
//
// §25–§30, §111, §112.
{
  const context = await newContext();
  const first = await openPage(context);
  const second = await openPage(context);
  await first.page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    await local.put('images', { id: 'm-race', original: new ArrayBuffer(4) });
    await local.put('mediaAssets', { id: 'm-race', refCount: 1, storagePath: 'local:m-race' });
  });

  // Same tab, overlapping.
  const sameTab = await first.page.evaluate(async () => {
    const { mediaStore } = await import('/src/media.js');
    const store = mediaStore({ mode: 'local', workspaceId: 'local' });
    await Promise.all([store.adjust('m-race', 1), store.adjust('m-race', 1)]);
    const local = await import('/src/local-store.js');
    return (await local.get('mediaAssets', 'm-race')).refCount;
  });
  check('R1 two overlapping increments both land (1 → 3)', sameTab === 3, String(sameTab));

  // Two tabs, overlapping.
  const adjust = (page, delta) => page.evaluate(async (delta) => {
    const { mediaStore } = await import('/src/media.js');
    await mediaStore({ mode: 'local', workspaceId: 'local' }).adjust('m-race', delta);
  }, delta);
  await Promise.all([adjust(first.page, -1), adjust(second.page, -1)]);
  const afterTabs = await first.page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    return { count: (await local.get('mediaAssets', 'm-race'))?.refCount, blob: Boolean(await local.get('images', 'm-race')) };
  });
  check('R2 two tabs releasing at once both land (3 → 1), and the asset survives',
    afterTabs.count === 1 && afterTabs.blob, JSON.stringify(afterTabs));

  const reconciled = await first.page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const media = await import('/src/media.js');
    const img = (id) => ({ id, mediaId: id, storagePath: `local:${id}` });
    const long = Date.now() - 2 * 60 * 60 * 1000;
    for (const id of ['m-over', 'm-under', 'm-orphan', 'm-pending']) {
      await local.put('images', { id, original: new ArrayBuffer(4) });
    }
    await local.put('mediaAssets', { id: 'm-over', refCount: 5, storagePath: 'local:m-over' });
    await local.put('mediaAssets', { id: 'm-under', refCount: 0, storagePath: 'local:m-under', orphanedAt: long });
    await local.put('mediaAssets', { id: 'm-orphan', refCount: 0, storagePath: 'local:m-orphan', orphanedAt: long });
    await local.put('mediaAssets', { id: 'm-pending', refCount: 0, storagePath: 'local:m-pending', orphanedAt: long });
    await local.putMany('items', [
      { id: 'ref-a', name: 'a', images: [img('m-over'), img('m-under')], createdAt: 1, updatedAt: 1, version: 1, deletedAt: null, categoryId: 'uncategorized' },
      { id: 'ref-b', name: 'b', images: [img('m-under'), img('m-race')], createdAt: 1, updatedAt: 1, version: 1, deletedAt: null, categoryId: 'uncategorized' },
    ]);
    media.markPending(['m-pending']);
    const result = await media.reconcileLocalMediaReferences({ reclaim: true });
    media.releasePending(['m-pending']);
    return {
      over: (await local.get('mediaAssets', 'm-over'))?.refCount,
      under: (await local.get('mediaAssets', 'm-under'))?.refCount,
      race: (await local.get('mediaAssets', 'm-race'))?.refCount,
      orphan: await local.get('mediaAssets', 'm-orphan'),
      orphanBlob: await local.get('images', 'm-orphan'),
      pending: Boolean(await local.get('mediaAssets', 'm-pending')),
      reclaimed: result.reclaimed,
    };
  });
  check('R3 the reconciler corrects overstated and understated counts',
    reconciled.over === 1 && reconciled.under === 2 && reconciled.race === 1, JSON.stringify(reconciled));
  check('R4 a truly unreferenced file past its grace window is reclaimed',
    reconciled.orphan == null && reconciled.orphanBlob == null && reconciled.reclaimed.includes('m-orphan'),
    JSON.stringify(reconciled));
  check('R5 a file an open form is still holding is left alone',
    reconciled.pending === true && !reconciled.reclaimed.includes('m-pending'), JSON.stringify(reconciled));

  const integrity = await first.page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    await local.put('mediaAssets', { id: 'm-over', refCount: 7, storagePath: 'local:m-over' });
    await local.remove('images', 'm-under');
    const { checkIntegrity } = await import('/src/integrity.js');
    const { findings } = await checkIntegrity();
    return findings.map((f) => f.kind);
  });
  check('R6 the integrity check reports a wrong count and a missing blob, and repairs neither',
    integrity.includes('refcount-overstated') && integrity.includes('blob-missing'), JSON.stringify(integrity));
  check('R7 no JS errors', [...first.errs, ...second.errs].length === 0, [...first.errs, ...second.errs][0]);
  await context.close();
}

// ── 5. a JSON merge cannot overwrite a record outside the window ────────────
//
// §21–§24, §110.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await seed(page, 5000);
  const result = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    const { applyMerge } = await import('/src/exporting.js');
    const current = await local.get('items', 'r002500');
    await local.put('items', { ...current, name: 'عدّلها المستخدم بعد التصدير', version: 2 });
    const held = repository.state.items.length;
    const merged = await applyMerge({
      items: [
        { ...current, name: 'نسخة الملف القديمة' },
        { id: 'brand-new', name: 'جديدة من الملف', quantity: 1, categoryId: 'uncategorized', images: [], createdAt: 1, updatedAt: 1, version: 1, deletedAt: null },
      ],
      folders: [], categories: [], locations: [],
    });
    return {
      held,
      name: (await local.get('items', 'r002500')).name,
      skipped: merged.skipped.items,
      added: merged.added,
      newOne: Boolean(await local.get('items', 'brand-new')),
    };
  });
  check('J1 the merge ran against a window, not the inventory', result.held <= 400, String(result.held));
  check('J2 an existing record outside the window is not overwritten',
    result.name === 'عدّلها المستخدم بعد التصدير', result.name);
  check('J3 it is counted as skipped, and a genuinely new record is added',
    result.skipped === 1 && result.added === 1 && result.newOne, JSON.stringify(result));
  check('J4 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 6. a Trash of 650, every one reachable ──────────────────────────────────
//
// §31–§36, §113.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  // Pairs deleted in the same millisecond, to test the tie-break.
  await seed(page, 650, (i, now) => ({ name: `محذوفة ${i}`, deletedAt: now - Math.floor(i / 2) * 1000 }));
  await page.evaluate(async () => (await import('/src/views/manage.js')).openTrashSheet());
  await page.waitForTimeout(500);

  const names = new Set();
  let pages = 0;
  for (;;) {
    const view = await page.evaluate(() => ({
      names: [...document.querySelectorAll('#trash-list .lname')].map((n) => n.textContent),
      next: [...document.querySelectorAll('#trash-list .trash-pager button')].find((b) => b.textContent === 'التالية'),
      label: document.querySelector('#trash-list .trash-pager span')?.textContent || '',
      nextDisabled: [...document.querySelectorAll('#trash-list .trash-pager button')].find((b) => b.textContent === 'التالية')?.disabled,
    }));
    pages += 1;
    for (const n of view.names) names.add(n);
    if (view.nextDisabled || pages > 20) break;
    await page.evaluate(() => [...document.querySelectorAll('#trash-list .trash-pager button')].find((b) => b.textContent === 'التالية').click());
    await page.waitForTimeout(250);
  }
  check('T1 every one of 650 trashed records is reachable', names.size === 650, `${names.size} over ${pages} pages`);

  // Back to page 5, restore one there.
  const restored = await page.evaluate(async () => {
    const go = async (label) => {
      [...document.querySelectorAll('#trash-list .trash-pager button')].find((b) => b.textContent === label).click();
      await new Promise((r) => setTimeout(r, 250));
    };
    for (let i = 0; i < 12; i += 1) await go('السابقة');
    for (let i = 0; i < 4; i += 1) await go('التالية');
    const before = document.querySelector('#trash-list .trash-pager span').textContent;
    const row = document.querySelector('#trash-list .trash-row');
    const name = row.querySelector('.lname').textContent;
    row.querySelector('.btn-g').click();
    await new Promise((r) => setTimeout(r, 600));
    return { before, after: document.querySelector('#trash-list .trash-pager span').textContent, name };
  });
  check('T2 restoring on page 5 keeps the customer on page 5, one fewer in the Trash',
    /صفحة 5 /.test(restored.after) && /649/.test(restored.after), JSON.stringify(restored));

  const purged = await page.evaluate(async () => {
    const row = document.querySelector('#trash-list .trash-row');
    const name = row.querySelector('.lname').textContent;
    row.querySelector('.btn-d').click();
    for (let i = 0; i < 40; i += 1) {
      if (document.getElementById('del-confirm').classList.contains('open')) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    (await import('/src/ui.js')).resolveConfirm(true);
    await new Promise((r) => setTimeout(r, 700));
    return { after: document.querySelector('#trash-list .trash-pager span').textContent, name };
  });
  check('T3 purging on a later page works and stays on it',
    /صفحة 5 /.test(purged.after) && /648/.test(purged.after), JSON.stringify(purged));
  check('T4 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 7. counts are live counts ───────────────────────────────────────────────
//
// §37–§42, §114.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.saveFolder({ id: 'fld-a', name: 'مجلد أ', icon: '🗂', color: '#2563FF' });
    await repository.saveCategory({ id: 'cat-a', name: 'تصنيف أ', icon: '📦' });
    await repository.saveLocation({ id: 'loc-a', name: 'موقع أ' });
  });
  await seed(page, 100, (i, now) => ({
    folderId: i < 20 ? 'fld-a' : null,
    categoryId: i < 42 ? 'cat-a' : 'uncategorized',
    locationId: i >= 50 && i < 75 ? 'loc-a' : null,
    deletedAt: (i < 3) || (i >= 20 && i < 22) || (i >= 50 && i < 54) ? now - i : null,
  }));
  // folder: 20 − 3 = 17 · category: 42 − 3 − 2 = 37 · location: 25 − 4 = 21
  const counts = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { queryInventory, emptyQuery } = await import('/src/query.js');
    const taxonomy = await repository.taxonomyCounts();
    const folderQuery = await queryInventory({ ...emptyQuery(), folderId: 'fld-a', page: 1, perPage: 50 });
    const summary = folderQuery.summary || {};
    const trash = await queryInventory({ ...emptyQuery(), trashed: true, page: 1, perPage: 50 });
    return {
      folder: taxonomy.folders.get('fld-a'),
      category: taxonomy.categories.get('cat-a'),
      location: taxonomy.locations.get('loc-a'),
      opened: folderQuery.total,
      summary: summary.records,
      trashInFolder: trash.rows.filter((r) => r.folderId === 'fld-a').length,
    };
  });
  check('C1 a folder of 17 live and 3 trashed says 17, opens on 17, summarises 17',
    counts.folder === 17 && counts.opened === 17 && counts.summary === 17 && counts.trashInFolder === 3, JSON.stringify(counts));
  check('C2 a category excludes its trashed records', counts.category === 37, String(counts.category));
  check('C3 a location excludes its trashed records', counts.location === 21, String(counts.location));

  const after = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.restoreItem('r000000');
    const restored = (await repository.taxonomyCounts()).folders.get('fld-a');
    await repository.deleteItem('r000010');
    const deleted = (await repository.taxonomyCounts()).folders.get('fld-a');
    return { restored, deleted };
  });
  check('C4 restoring one makes 18, deleting one makes 17 — without a reload',
    after.restored === 18 && after.deleted === 17, JSON.stringify(after));
  check('C5 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 8. an oversized file is refused before it is read ───────────────────────
//
// §43–§46, §115.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const refused = await page.evaluate(async () => {
    let digests = 0;
    let reads = 0;
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = (...args) => { digests += 1; return realDigest(...args); };
    const realBuffer = Blob.prototype.arrayBuffer;
    const realText = Blob.prototype.text;
    Blob.prototype.arrayBuffer = function (...args) { reads += 1; return realBuffer.apply(this, args); };
    Blob.prototype.text = function (...args) { reads += 1; return realText.apply(this, args); };
    const big = new File([new Uint8Array(26 * 1024 * 1024)], 'huge.csv', { type: 'text/csv' });
    const mod = await import('/src/views/sheet-import.js');
    await mod.openSpreadsheetImport(big);
    crypto.subtle.digest = realDigest;
    Blob.prototype.arrayBuffer = realBuffer;
    Blob.prototype.text = realText;
    const local = await import('/src/local-store.js');
    return {
      digests, reads,
      jobs: await local.count('importJobs'),
      toast: [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '),
    };
  });
  check('P1 an oversized file is refused before it is hashed or read',
    refused.digests === 0 && refused.reads === 0, JSON.stringify(refused));
  check('P2 with no import job, and the limit in the message',
    refused.jobs === 0 && /حجم الملف أكبر من الحد المسموح/.test(refused.toast), JSON.stringify(refused));
  const unexpected = errs.filter((line) => !/حجم الملف أكبر/.test(line));
  check('P3 only the refusal is logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 9. taxonomy ownership survives a crash either side of creation ──────────
//
// §47–§50, §116.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const csv = ['الاسم,الكمية,التصنيف'];
  for (let i = 0; i < 300; i += 1) csv.push(`قطعة ${i},1,ساعات يدوية`);
  const text = csv.join('\n') + '\n';

  const open = () => page.evaluate(async (text) => {
    const mod = await import('/src/views/sheet-import.js');
    await mod.openSpreadsheetImport(new File([text], 'watches.csv', { type: 'text/csv' }));
  }, text);
  const foot = (label) => page.evaluate((label) => {
    [...document.querySelectorAll('#simport-foot button')].find((b) => b.textContent.startsWith(label)).click();
  }, label);

  // (a) the id is recorded, then the tab "dies" before the category exists.
  await open();
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const real = repository.saveCategory.bind(repository);
    globalThis.__realSaveCategory = real;
    repository.saveCategory = async () => { throw new Error('crash before creation'); };
  });
  await foot('معاينة');
  await page.waitForTimeout(200);
  await foot('استيراد');
  await page.waitForTimeout(800);
  const a = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    repository.saveCategory = globalThis.__realSaveCategory;
    const local = await import('/src/local-store.js');
    const job = (await local.getAll('importJobs'))[0];
    return {
      jobId: job.id, status: job.status, claimed: job.created.categories,
      exists: Boolean(await local.get('categories', job.created.categories[0])),
    };
  });
  check('X1 the category id is on the job before the category exists',
    a.claimed.length === 1 && a.exists === false, JSON.stringify(a));

  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('simport'));
  await open();
  await foot('متابعة الاستيراد');
  await page.waitForFunction(() => !document.getElementById('sh-simport').classList.contains('open'), null, { timeout: 30000 });
  const resumed = await page.evaluate(async (claimed) => {
    const local = await import('/src/local-store.js');
    const job = (await local.getAll('importJobs'))[0];
    const withCat = await local.keysByIndex('items', 'categoryId', claimed);
    return { status: job.status, created: job.created.categories, exists: Boolean(await local.get('categories', claimed)), items: withCat.length };
  }, a.claimed[0]);
  check('X2 resuming creates it with the id it already claimed, and the records use it',
    resumed.status === 'completed' && resumed.exists && resumed.created.length === 1 && resumed.items === 300,
    JSON.stringify(resumed));

  // (b) the category is created, then the job cannot record that it is running.
  const csv2 = ['الاسم,الكمية,التصنيف'];
  for (let i = 0; i < 50; i += 1) csv2.push(`عنصر ${i},1,عملات نادرة`);
  const text2 = csv2.join('\n') + '\n';
  await page.evaluate(async (text) => {
    const jobs = await import('/src/import-jobs.js');
    jobs.__setJobWriteFaultForTest((job, status) => status === 'running');
    const mod = await import('/src/views/sheet-import.js');
    await mod.openSpreadsheetImport(new File([text], 'coins.csv', { type: 'text/csv' }));
  }, text2);
  await foot('معاينة');
  await page.waitForTimeout(200);
  await foot('استيراد');
  await page.waitForTimeout(800);
  const b = await page.evaluate(async () => {
    const jobs = await import('/src/import-jobs.js');
    jobs.__setJobWriteFaultForTest(null);
    const local = await import('/src/local-store.js');
    const job = (await local.getAll('importJobs')).find((j) => j.fileName === 'coins.csv');
    const cat = (await local.getAll('categories')).find((c) => c.name === 'عملات نادرة');
    return { status: job.status, claimed: job.created.categories, catId: cat?.id, items: await local.count('items') };
  });
  check('X3 created and then interrupted: the job already names the category it made',
    b.catId && b.claimed.includes(b.catId), JSON.stringify(b));

  await open2(page, text2);
  await foot('إلغاء الاستيراد');
  await page.waitForTimeout(800);
  const undone = await page.evaluate(async (catId) => {
    const local = await import('/src/local-store.js');
    return { category: await local.get('categories', catId) };
  }, b.catId);
  check('X4 and cancelling it takes that category back out', undone.category == null, JSON.stringify(undone));
  const unexpected = errs.filter((line) => !/crash before creation|critical job persistence|forced job write|لحماية البيانات|تعذّر الاستيراد/.test(line));
  check('X5 only the expected failures are logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

async function open2(page, text) {
  await page.evaluate(async (text) => {
    const mod = await import('/src/views/sheet-import.js');
    await mod.openSpreadsheetImport(new File([text], 'coins.csv', { type: 'text/csv' }));
  }, text);
  await page.waitForTimeout(300);
}

// ── 10. currencies, exports and wording ─────────────────────────────────────
//
// §57–§66, §117–§119.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  // The real subscription module: device-only, on a development origin.
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !QUIET.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  await seed(page, 5000, (i) => ({ valuation: { min: 100, max: 100, currency: i === 4000 ? 'USD' : 'SAR', source: 'manual' } }));

  const currencies = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const windowCurrencies = [...new Set(repository.state.items.map((i) => i.valuation?.currency))];
    const home = await import('/src/views/home.js');
    home.openFilterSheet();
    const present = await repository.currenciesPresent();
    await new Promise((r) => setTimeout(r, 200));
    const row = document.getElementById('fp-currency-row');
    const out = { windowCurrencies, present, rowShown: row ? row.style.display !== 'none' : null };
    (await import('/src/ui.js')).closeSheet('filter');
    return out;
  });
  check('E1 a currency only an old record carries is known',
    currencies.present.includes('USD') && !currencies.windowCurrencies.includes('USD'), JSON.stringify(currencies));
  check('E2 and the currency filter is offered because of it', currencies.rowShown === true, JSON.stringify(currencies));

  const exported = await page.evaluate(async () => {
    const blobs = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (blob) => { blobs.push(blob); return realCreate(blob); };
    const manage = await import('/src/views/manage.js');
    const { repository } = await import('/src/repository.js');
    const heldBefore = repository.itemsComplete;
    const excelOk = await manage.runFullExcelExport();
    const jsonOk = await manage.runFullJsonExport();
    URL.createObjectURL = realCreate;
    const json = JSON.parse(await blobs[blobs.length - 1].text());
    const { readSpreadsheet } = await import('/src/spreadsheet.js');
    const sheet = await readSpreadsheet(new File([blobs[0]], 'x.xlsx'));
    return { heldBefore, excelOk, jsonOk, jsonItems: json.items.length, images: json.imagesIncluded, note: json.note, excelRows: sheet.rows.length };
  });
  check('E3 the settings Excel export writes the whole inventory',
    exported.heldBefore === false && exported.excelOk && exported.excelRows === 5000, JSON.stringify(exported));
  check('E4 the JSON export writes every record, and says images are not in it',
    exported.jsonOk && exported.jsonItems === 5000 && exported.images === false && /على الجهاز/.test(exported.note),
    JSON.stringify(exported));

  const wording = await page.evaluate(async () => {
    const nav = await import('/src/navigation.js');
    nav.goTab('set');
    await new Promise((r) => setTimeout(r, 400));
    const text = document.getElementById('v-set').innerText;
    return { cloudClaim: /التخزين السحابي/.test(text), honest: /لا يتضمن ملفات الصور/.test(text) };
  });
  check('E5 on a device, the JSON row never says images are in the cloud',
    wording.cloudClaim === false && wording.honest === true, JSON.stringify(wording));
  check('E6 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 11. the device-only policy is a decision, not a side effect ─────────────
//
// §67–§71.
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  const policy = await page.evaluate(async () => {
    const config = await import('/src/config.js');
    const plans = await import('/src/plans.generated.js');
    const sub = await import('/src/subscription.js');
    return {
      here: config.localModePolicy(),
      hosted: config.localModePolicy({ protocol: 'https:', hostname: 'app.example.com' }),
      demo: config.localModePolicy({ protocol: 'file:', hostname: '' }),
      retentionHere: sub.activityRetentionDays(),
      free: plans.PLAN_CONFIG.plans.free.limits.items,
      prices: Object.fromEntries(Object.entries(plans.PLAN_CONFIG.plans).map(([id, p]) => [id, [p.price?.monthly ?? p.priceMonthly ?? null, p.limits.items]])),
    };
  });
  check('L1 a hosted origin holds a device-only inventory to the free tier',
    policy.hosted === 'consumer_free_tier', JSON.stringify(policy));
  check('L2 development and the file:// demo are unlimited, by name',
    policy.here === 'development_unlimited' && policy.demo === 'development_unlimited', JSON.stringify(policy));
  check('L3 retention follows the same policy (unlimited here keeps everything)',
    policy.retentionHere === 0, String(policy.retentionHere));
  check('L4 the free plan is still 50 records', policy.free === 50, JSON.stringify(policy.prices));
  await context.close();
}

// ── 12. the team watcher is closed however the sheet closes ─────────────────
//
// §72–§74, §120.
{
  const context = await newContext({
    extraRoutes: async (ctx) => {
      await ctx.route('**/src/auth.js', async (route) => {
        const response = await route.fetch();
        const body = await response.text() + `
          const __realSession = currentSession;
          currentSession = function () {
            const real = __realSession();
            return globalThis.__teamTest ? { ...real, workspaceId: 'ws-test', local: false, role: 'owner' } : real;
          };`;
        await route.fulfill({ response, body, contentType: 'text/javascript' });
      });
      await ctx.route('**/src/team.js', async (route) => {
        const response = await route.fetch();
        const body = await response.text() + `
          watchMembers = function (workspaceId, onData) {
            globalThis.__watchers = (globalThis.__watchers || 0) + 1;
            globalThis.__peak = Math.max(globalThis.__peak || 0, globalThis.__watchers);
            setTimeout(() => onData([]), 0);
            return () => { globalThis.__watchers -= 1; };
          };
          listInvitations = async function () { return []; };`;
        await route.fulfill({ response, body, contentType: 'text/javascript' });
      });
    },
  });
  const { page, errs } = await openPage(context);
  const cycle = await page.evaluate(async () => {
    globalThis.__teamTest = true;
    const team = await import('/src/views/team.js');
    const ui = await import('/src/ui.js');
    const counts = [];
    const open = async () => { team.openTeamSheet(); await new Promise((r) => setTimeout(r, 50)); counts.push(['open', globalThis.__watchers]); };

    await open();
    document.querySelector('#sh-team [data-close]').click();
    await new Promise((r) => setTimeout(r, 50));
    counts.push(['x', globalThis.__watchers]);

    await open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    counts.push(['escape', globalThis.__watchers]);

    await open();
    document.getElementById('ov-team').click();
    await new Promise((r) => setTimeout(r, 50));
    counts.push(['overlay', globalThis.__watchers]);

    await open();
    await open();
    ui.closeAllSheets();
    await new Promise((r) => setTimeout(r, 50));
    counts.push(['closeAll', globalThis.__watchers]);
    return { counts, peak: globalThis.__peak, active: team.__teamWatcherActive() };
  });
  check('G1 closing the team sheet by any route closes its watcher',
    cycle.counts.filter(([k]) => k !== 'open').every(([, n]) => n === 0), JSON.stringify(cycle.counts));
  check('G2 and there is never more than one open', cycle.peak === 1 && cycle.active === false, JSON.stringify(cycle));
  check('G3 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 13. device → cloud reads each image by key ──────────────────────────────
//
// §75–§77, §121.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const reads = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const rows = [];
    for (let i = 0; i < 3000; i += 1) rows.push({ id: `img-${i}`, original: new ArrayBuffer(1) });
    await local.putMany('images', rows);

    let getAll = 0;
    let get = 0;
    const realGetAll = IDBObjectStore.prototype.getAll;
    const realGet = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.getAll = function (...args) { if (this.name === 'images') getAll += 1; return realGetAll.apply(this, args); };
    IDBObjectStore.prototype.get = function (...args) { if (this.name === 'images') get += 1; return realGet.apply(this, args); };
    const upload = await import('/src/device-upload.js');
    let found = 0;
    for (let i = 0; i < 3000; i += 1) {
      if (await upload.readLocalImageRecord({ storagePath: `local:img-${i}` })) found += 1;
    }
    const missing = await upload.readLocalImageRecord({ storagePath: 'local:not-there' });
    IDBObjectStore.prototype.getAll = realGetAll;
    IDBObjectStore.prototype.get = realGet;
    return { getAll, get, found, missing };
  });
  check('U1 3,000 images are read with 3,000 keyed reads and no table scans',
    reads.getAll === 0 && reads.get === 3001 && reads.found === 3000, JSON.stringify(reads));
  check('U2 a missing blob is reported as missing, not invented', reads.missing === null, JSON.stringify(reads.missing));
  check('U3 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 14. restore interruption is known, and the same backup finishes it ─────
//
// §51–§56.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await seed(page, 300);
  const marked = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const restore = await import('/src/restore.js');
    const data = { items: [{ id: 'from-backup', name: 'من النسخة', quantity: 1, categoryId: 'uncategorized', images: [], createdAt: 1, updatedAt: 1, version: 1, deletedAt: null }], folders: [], categories: [], locations: [] };
    const { readBackupFile } = await import('/src/exporting.js');
    const fp = (await readBackupFile(new File([JSON.stringify(data)], 'backup.json'))).sourceFingerprint;
    // What a tab killed mid-removal leaves behind.
    await local.setMeta('restoreJob', { id: 'rst-dead', status: 'removing', stage: 'remove', sourceFingerprint: fp, startedAt: 1 });
    globalThis.__backup = data;
    return fp;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  const state = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const { applyMerge } = await import('/src/exporting.js');
    const restore = await import('/src/restore.js');
    const job = await local.getMeta('restoreJob');
    let mergeCode = null;
    try { await applyMerge({ items: [], folders: [], categories: [], locations: [] }); } catch (error) { mergeCode = error.code; }
    let otherCode = null;
    try {
      const other = { items: [], folders: [], categories: [], locations: [] };
      const { readBackupFile } = await import('/src/exporting.js');
      const otherFp = (await readBackupFile(new File([JSON.stringify(other)], 'other.json'))).sourceFingerprint;
      await restore.restoreFromBackup(other, { saveBackup: () => {}, sourceFingerprint: otherFp });
    } catch (error) { otherCode = error.code; }
    return { status: job.status, mergeCode, otherCode };
  });
  check('Z1 an interrupted restore is marked as needing recovery at startup',
    state.status === 'recovery-required', JSON.stringify(state));
  check('Z2 a merge is refused until it is finished', state.mergeCode === 'restore/recovery-required', JSON.stringify(state));
  check('Z3 so is a restore of a different backup', state.otherCode === 'restore/recovery-required', JSON.stringify(state));

  const finished = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const restore = await import('/src/restore.js');
    const data = { items: [{ id: 'from-backup', name: 'من النسخة', quantity: 1, categoryId: 'uncategorized', images: [], createdAt: 1, updatedAt: 1, version: 1, deletedAt: null }], folders: [], categories: [], locations: [] };
    let saved = 0;
    const { readBackupFile } = await import('/src/exporting.js');
    const { sourceFingerprint } = await readBackupFile(new File([JSON.stringify(data)], 'backup.json'));
    const result = await restore.restoreFromBackup(data, { saveBackup: () => { saved += 1; }, sourceFingerprint });
    const job = await local.getMeta('restoreJob');
    return { status: job.status, resumed: job.resumed, saved, items: await local.count('items'), restored: result.restored };
  });
  check('Z4 the same backup finishes it — with a fresh safety backup first',
    finished.status === 'completed' && finished.resumed === true && finished.saved === 1 && finished.items === 1,
    JSON.stringify(finished));
  const unexpected = errs.filter((line) => !/interrupted restore/.test(line));
  check('Z5 only the expected warning is logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
