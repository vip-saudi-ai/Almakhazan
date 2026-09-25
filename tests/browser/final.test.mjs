// Browser test for the final core-hardening pass:
//
//   REPLAY MUST NEVER OVERWRITE. A YEARLY IDENTIFIER MUST ACTUALLY BE YEARLY.
//   RESTORING OLD DATA MUST NOT BREAK LIVE UNIQUENESS. REJECT UNSAFE FILES
//   BEFORE READING THEM. USE ONE VISUAL LANGUAGE FOR CORE ACTIONS.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/final.test.mjs

import { mkdirSync } from 'node:fs';
import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS_DIR || '';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const QUIET = /gstatic|ERR_|net::|firebase/;
const YEAR = new Date().getFullYear();

async function newContext(stub = { planId: 'business' }, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
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

// ── 1. a replayed import never overwrites (§72, §73) ───────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);

  const replay = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const { importItemId } = await import('/src/import-mapping.js');
    const records = Array.from({ length: 200 }, (_, i) => ({
      id: importItemId('replayjob', i + 2), name: `صف ${i}`, quantity: 1, categoryId: 'uncategorized', importJobId: 'replayjob',
    }));
    // 50 rows committed before the crash; one of them edited since.
    const first = await repository.bulkCreateItems(records.slice(0, 50), { log: false });
    const edited = await local.get('items', records[10].id);
    await repository.updateItem(edited.id, { name: 'عُدّلت يدوياً', quantity: 7 }, edited.version);
    const activityBefore = await local.count('activity');
    const second = await repository.bulkCreateItems(records);
    const after = await local.get('items', records[10].id);
    const log = (await local.getAll('activity')).slice(-1)[0];
    return {
      first: first.created,
      created: second.created, skipped: second.skippedExisting.length, processed: second.processed,
      name: after.name, quantity: after.quantity, total: await local.count('items'),
      logged: (await local.count('activity')) - activityBefore, logItems: log?.meta?.items ?? log?.items ?? null,
    };
  });
  check('R1 200 rows with 50 already there: 150 created, 50 skipped, 200 processed',
    replay.first === 50 && replay.created === 150 && replay.skipped === 50 && replay.processed === 200, JSON.stringify(replay));
  check('R2 the record edited after its row landed keeps the edit', replay.name === 'عُدّلت يدوياً' && replay.quantity === 7, JSON.stringify(replay));
  check('R3 and there are exactly 200 records', replay.total === 200, String(replay.total));
  check('R4 the activity entry counts what was created', replay.logged === 1, JSON.stringify(replay));
  check('R5 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 2. replayed ids cost no plan slot (§73) ────────────────────────────────
{
  const context = await newContext({ planId: 'free' });
  const { page, errs } = await openPage(context);
  const full = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { importItemId } = await import('/src/import-mapping.js');
    const records = Array.from({ length: 50 }, (_, i) => ({ id: importItemId('fulljob', i + 2), name: `صف ${i}`, quantity: 1, categoryId: 'uncategorized' }));
    await repository.bulkCreateItems(records, { log: false });
    let replayed;
    try { replayed = await repository.bulkCreateItems(records, { log: false }); } catch (error) { replayed = error.code; }
    let extra;
    try { await repository.bulkCreateItems([{ id: importItemId('fulljob', 60), name: 'زائدة', quantity: 1 }], { log: false }); extra = 'allowed'; } catch (error) { extra = error.code; }
    return { replayed: typeof replayed === 'object' ? { created: replayed.created, skipped: replayed.skippedExisting.length } : replayed, extra };
  });
  check('R6 at 50 of 50, replaying the same 50 ids is not refused and creates nothing',
    full.replayed?.created === 0 && full.replayed?.skipped === 50, JSON.stringify(full));
  check('R7 while one genuinely new row still is', full.extra === 'plan/item-limit', full.extra);
  check('R8 no JS errors', expectedErrors(errs, /خطتك|plan/).length === 0, errs[0]);
  await context.close();
}

// ── 3. the same, through the import screen, after a crash (§72) ────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const csv = 'الاسم,الكمية\n' + Array.from({ length: 200 }, (_, i) => `قطعة ملف ${i},1`).join('\n') + '\n';
  const open = () => page.evaluate(async (csv) => {
    const view = await import('/src/views/sheet-import.js');
    await view.openSpreadsheetImport(new File([csv], 'crash.csv', { type: 'text/csv' }));
    await new Promise((r) => setTimeout(r, 600));
  }, csv);

  await open();
  const job = await page.evaluate(async () => {
    const view = await import('/src/views/sheet-import.js');
    // The tab died having committed rows 100–149, before `written` moved
    // past 100.
    const stopped = await view.__stopJobForTest(100);
    const { importItemId } = await import('/src/import-mapping.js');
    const { repository } = await import('/src/repository.js');
    const rows = Array.from({ length: 50 }, (_, k) => ({
      id: importItemId(stopped.id, 100 + k + 2), name: `قطعة ملف ${100 + k}`, quantity: 1, categoryId: 'uncategorized', importJobId: stopped.id,
    }));
    await repository.bulkCreateItems(rows, { log: false });
    // …and the customer then edited one of them.
    const local = await import('/src/local-store.js');
    const row = await local.get('items', rows[5].id);
    await repository.updateItem(row.id, { name: 'تعديل بعد الانقطاع' }, row.version);
    (await import('/src/ui.js')).closeSheet('simport');
    return { id: stopped.id, edited: rows[5].id };
  });
  await page.waitForTimeout(300);
  await open();
  const resumed = await page.evaluate(async (edited) => {
    const view = await import('/src/views/sheet-import.js');
    const before = view.__jobForTest();
    const resumedFrom = before?.written ?? null;
    await view.__runForTest();
    await new Promise((r) => setTimeout(r, 400));
    const local = await import('/src/local-store.js');
    const jobs = await local.getAll('importJobs');
    const record = jobs.find((j) => j.id === before?.id) || {};
    return {
      resumedFrom,
      name: (await local.get('items', edited))?.name,
      total: await local.count('items'),
      written: record.written, created: record.createdRecords, skipped: record.skippedRecords,
      toast: [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '),
    };
  }, job.edited);
  check('R9 the resumed import starts from the persisted position', resumed.resumedFrom === 100, JSON.stringify(resumed));
  check('R10 the row edited after the crash is not overwritten by the replay', resumed.name === 'تعديل بعد الانقطاع', resumed.name);
  check('R11 the rows are processed to the end, 50 created and 50 skipped',
    resumed.written === 200 && resumed.created === 50 && resumed.skipped === 50 && resumed.total === 100, JSON.stringify(resumed));
  check('R12 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 4. a yearly identifier is yearly (§74–§76) ─────────────────────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);

  const parse = await page.evaluate(async () => {
    const sku = await import('/src/sku.js');
    return {
      ok: sku.parseGeneratedSku('INV-2026-004500'),
      five: sku.parseGeneratedSku('INV-2026-12345'),
      seven: sku.parseGeneratedSku('INV-2026-0000001'),
      custom: sku.parseGeneratedSku('WATCH-999999'),
      lower: sku.parseGeneratedSku('inv-2026-000001'),
      format: sku.formatGeneratedSku(7, 2026),
    };
  });
  check('S1 one parser: exactly six digits, nothing else is a generated SKU',
    parse.ok?.sequence === 4500 && parse.ok?.year === 2026 && !parse.five && !parse.seven && !parse.custom && !parse.lower
    && parse.format === 'INV-2026-000007', JSON.stringify(parse));

  const reset = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    await local.setMeta('counter.sku', 850);
    repository.invalidateSkuFloor();
    return [await repository.reserveSku(), await repository.reserveSku()];
  });
  check('S2 legacy counter at 850 and no generated SKU this year: 000001, then 000002',
    reset[0] === `INV-${YEAR}-000001` && reset[1] === `INV-${YEAR}-000002`, JSON.stringify(reset));

  const once = await page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    // A device whose old counter was in use this year: honoured once.
    await local.clearStore('meta');
    await local.setMeta('counter.sku', 850);
    await local.put('items', { id: 'old-gen', name: 'قديمة', sku: `INV-${year}-000100`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    const first = await local.reserveSkuSequence(year, await local.maxSkuSequence(year));
    const later = await local.reserveSkuSequence(year + 3, await local.maxSkuSequence(year + 3));
    return { first, later };
  }, YEAR);
  // The old counter counts only on evidence it was counting this year — its
  // last SKU on record. INV-…-000100 is not that evidence; the data decides.
  check('S3 an old counter without evidence does not lift this year (101), and never seeds a later year (1)',
    once.first === 101 && once.later === 1, JSON.stringify(once));

  const floor = await page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    for (const [id, sku] of [['g4500', `INV-${year}-004500`], ['c1', 'WATCH-999999'], ['c2', `INV-${year}-99999`], ['c3', `INV-${year}-0999999`], ['c4', `INV-${year}-WATCH`]]) {
      await local.put('items', { id, name: id, sku, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    }
    repository.invalidateSkuFloor();
    const next = await repository.reserveSku();
    const stored = await local.getMeta(`counter.sku.${year}`);
    const customs = await Promise.all(['c1', 'c2', 'c3', 'c4'].map(async (id) => (await local.get('items', id)).sku));
    return { next, stored, customs };
  }, YEAR);
  check('S4 INV-…-004500 present: the next is 004501, and 4501 is what the counter stores',
    floor.next === `INV-${YEAR}-004501` && floor.stored === 4501, JSON.stringify(floor));
  check('S5 custom SKUs (WATCH-999999, five or seven digits, letters) neither move the floor nor change',
    JSON.stringify(floor.customs) === JSON.stringify(['WATCH-999999', `INV-${YEAR}-99999`, `INV-${YEAR}-0999999`, `INV-${YEAR}-WATCH`]), JSON.stringify(floor.customs));

  const exhausted = await page.evaluate(async (year) => {
    const local = await import('/src/local-store.js');
    const { repository } = await import('/src/repository.js');
    await local.put('items', { id: 'g-max', name: 'الأخيرة', sku: `INV-${year}-999999`, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    repository.invalidateSkuFloor();
    try { return { sku: await repository.reserveSku() }; } catch (error) { return { code: error.code, message: error.message }; }
  }, YEAR);
  check('S6 past 999999 there is a clear error, not a seven-digit SKU', exhausted.code === 'repo/sku-exhausted' && /رمز/.test(exhausted.message), JSON.stringify(exhausted));
  check('S7 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 5. restoring from the Trash keeps live SKUs unique (§77) ───────────────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const blocked = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const a = await repository.createItem({ name: 'ساعة أ', sku: 'WATCH-001', quantity: 1 });
    await repository.deleteItem(a.id);
    const b = await repository.createItem({ name: 'ساعة ب', sku: 'WATCH-001', quantity: 1 });
    const activity = await local.count('activity');
    const live = async () => (await local.count('items')) - (await local.countRange('items', 'deletedAt', null));
    const liveBefore = await live();
    let code, message, generated;
    try { await repository.restoreItem(a.id); code = 'restored'; } catch (error) { ({ code, message, generated } = error); }
    const stillTrashed = Boolean((await local.get('items', a.id)).deletedAt);
    const out = { code, message, generated, stillTrashed, logged: (await local.count('activity')) - activity, liveDelta: (await live()) - liveBefore };
    // B takes another SKU; now A may come back.
    const row = await local.get('items', b.id);
    await repository.updateItem(b.id, { sku: 'WATCH-002' }, row.version);
    await repository.restoreItem(a.id);
    out.afterFix = { restored: !(await local.get('items', a.id)).deletedAt, sku: (await local.get('items', a.id)).sku };
    return out;
  });
  check('T1 a trashed record whose SKU a live record now has is not restored',
    blocked.code === 'item/sku-conflict' && blocked.stillTrashed, JSON.stringify(blocked));
  check('T2 with the exact message, no activity entry and no slot taken',
    blocked.message === 'لا يمكن استعادة القطعة لأن الرمز SKU مستخدم على قطعة أخرى.' && blocked.logged === 0 && blocked.liveDelta === 0, JSON.stringify(blocked));
  check('T3 a custom SKU is never offered a replacement', blocked.generated === false, JSON.stringify(blocked));
  check('T4 once the other record changes its SKU, the restore succeeds with the original SKU',
    blocked.afterFix.restored && blocked.afterFix.sku === 'WATCH-001', JSON.stringify(blocked.afterFix));

  const generated = await page.evaluate(async (year) => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const sku = `INV-${year}-000042`;
    await local.put('items', { id: 'gen-a', name: 'مولّد أ', sku, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: Date.now(), createdAt: 1, updatedAt: 1, version: 1 });
    await local.put('items', { id: 'gen-b', name: 'مولّد ب', sku, quantity: 1, categoryId: 'uncategorized', images: [], deletedAt: null, createdAt: 1, updatedAt: 1, version: 1 });
    let first;
    try { await repository.restoreItem('gen-a'); first = 'restored'; } catch (error) { first = { code: error.code, generated: error.generated }; }
    const result = await repository.restoreItem('gen-a', undefined, { newSku: true });
    const a = await local.get('items', 'gen-a');
    const b = await local.get('items', 'gen-b');
    return { first, result, aSku: a.sku, aLive: !a.deletedAt, bSku: b.sku };
  }, YEAR);
  check('T5 a generated SKU in conflict is offered «إنشاء رمز جديد واستعادة»', generated.first?.code === 'item/sku-conflict' && generated.first.generated === true, JSON.stringify(generated));
  check('T6 which restores it under a fresh generated SKU, leaving the live record alone',
    generated.aLive && generated.aSku !== generated.bSku && /^INV-\d{4}-\d{6}$/.test(generated.aSku) && generated.bSku === `INV-${YEAR}-000042`, JSON.stringify(generated));

  // Through the Trash screen.
  const screen = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const c = await repository.createItem({ name: 'خاتم ج', sku: 'RING-7', quantity: 1 });
    await repository.deleteItem(c.id);
    await repository.createItem({ name: 'خاتم د', sku: 'RING-7', quantity: 1 });
    await (await import('/src/views/manage.js')).openTrashSheet();
    await new Promise((r) => setTimeout(r, 500));
    const row = [...document.querySelectorAll('#sh-trash .trash-btn')].find((b) => b.textContent.includes('استعادة') && b.closest('*:has(.lname)')?.textContent.includes('خاتم ج'));
    row?.click();
    await new Promise((r) => setTimeout(r, 500));
    const dialog = document.querySelector('.confirm-dialog, [role="alertdialog"], #sh-confirm');
    return { clicked: Boolean(row), text: document.body.innerText.includes('لا يمكن استعادة القطعة لأن الرمز SKU مستخدم على قطعة أخرى.'),
      edit: document.body.innerText.includes('تعديل القطعة'), dialog: Boolean(dialog) };
  });
  check('T7 in the Trash, the refusal is explained and «تعديل القطعة» is offered', screen.clicked && screen.text && screen.edit, JSON.stringify(screen));
  check('T8 no JS errors', expectedErrors(errs, /SKU|sku-conflict/).length === 0, errs[0]);
  await context.close();
}

// ── 6. unsafe backup files are refused before they are read (§78, §79) ─────
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const files = await page.evaluate(async () => {
    const { readBackupFile, MAX_BACKUP_FILE_BYTES } = await import('/src/exporting.js');
    let read = 0;
    const fake = (name, size) => ({ name, size, type: 'application/json', arrayBuffer: async () => { read += 1; return new ArrayBuffer(0); } });
    const attempt = async (file) => { try { await readBackupFile(file); return 'read'; } catch (error) { return { code: error.code, message: error.message }; } };
    const big = await attempt(fake('big.json', MAX_BACKUP_FILE_BYTES + 1));
    const empty = await attempt(fake('empty.json', 0));
    const txt = await attempt(fake('notes.txt', 100));
    const none = await attempt(null);
    const data = { items: [{ id: 'x', name: 'س' }], folders: [], categories: [], locations: [] };
    const ok = await readBackupFile(new File([JSON.stringify(data)], 'backup.json', { type: 'text/plain' }));
    const upper = await readBackupFile(new File([JSON.stringify(data)], 'BACKUP.JSON'));
    return { max: MAX_BACKUP_FILE_BYTES, big, empty, txt, none, read, ok: { items: ok.data.items.length, fp: ok.sourceFingerprint.length }, upper: upper.sourceFingerprint === ok.sourceFingerprint };
  });
  check('B1 a file past the limit is refused with the exact message, without its bytes being read',
    files.big.code === 'backup/file-too-large' && files.big.message === 'حجم ملف البيانات أكبر من الحد المسموح.' && files.read === 0, JSON.stringify(files));
  check('B2 so are an empty file, a non-JSON extension and no file', files.empty.code === 'backup/empty-file'
    && files.txt.code === 'backup/not-json' && files.none.code === 'backup/no-file', JSON.stringify(files));
  check('B3 a valid .json file reads (MIME only a hint), with its SHA-256 identity',
    files.ok.items === 1 && files.ok.fp === 64 && files.upper === true, JSON.stringify(files));
  check('B4 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 7. core actions share one icon language (§80) ──────────────────────────
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
for (const colorScheme of ['light', 'dark']) {
  for (const width of [320, 390, 1280]) {
    const context = await newContext({ planId: 'business' }, { viewport: { width, height: width > 900 ? 900 : 780 }, colorScheme });
    const { page, errs } = await openPage(context);
    const tag = `${colorScheme}@${width}`;
    const form = await page.evaluate(async () => {
      await (await import('/src/views/item-form.js')).openItemForm();
      await new Promise((r) => setTimeout(r, 400));
      const scan = document.getElementById('f-barcode-scan');
      const svg = scan.querySelector('svg');
      const rect = scan.getBoundingClientRect();
      return { label: scan.getAttribute('aria-label'), svg: Boolean(svg), hidden: svg?.getAttribute('aria-hidden'), text: scan.textContent.trim(), w: rect.width, h: rect.height };
    });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/form-${colorScheme}-${width}.png` });
    check(`V1 ${tag} barcode scan: an SVG icon, decorative, the button keeps «مسح الباركود»`,
      form.svg && form.hidden === 'true' && form.label === 'مسح الباركود' && form.text === '' && form.w >= 30, JSON.stringify(form));

    const detail = await page.evaluate(async () => {
      (await import('/src/ui.js')).closeSheet('add');
      const { repository } = await import('/src/repository.js');
      const item = await repository.createItem({ name: 'للأيقونات', quantity: 1 });
      await new Promise((r) => setTimeout(r, 300));
      await (await import('/src/views/detail.js')).openDetail(item.id);
      await new Promise((r) => setTimeout(r, 500));
      const out = {};
      for (const id of ['detlabel', 'detmove', 'detedit', 'detdel']) {
        const button = document.getElementById(id);
        const svg = button.querySelector('svg');
        const r = button.getBoundingClientRect();
        out[id] = {
          text: button.textContent.trim(), svg: Boolean(svg), hidden: svg?.closest('[aria-hidden="true"]') ? 'true' : svg?.getAttribute('aria-hidden') || null,
          fits: button.scrollWidth <= button.clientWidth + 1, top: Math.round(r.top), stroke: svg ? getComputedStyle(svg).color : null, color: getComputedStyle(button).color,
        };
      }
      return out;
    });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/detail-${colorScheme}-${width}.png` });
    const glyph = /[⊡🗂✎✓✕]/u;
    check(`V2 ${tag} detail actions: ملصق / نقل / تعديل with decorative SVGs, no glyphs`,
      detail.detlabel.text === 'ملصق' && detail.detmove.text === 'نقل' && detail.detedit.text === 'تعديل'
      && ['detlabel', 'detmove', 'detedit'].every((id) => detail[id].svg && detail[id].hidden === 'true' && !glyph.test(detail[id].text)), JSON.stringify(detail));
    // Below 360px a footer row is allowed to wrap rather than squeeze each
    // label (layout.css, max-width: 359px); above it, one row.
    check(`V3 ${tag} nothing overflows, one row from 360px, the icon in the button's own colour`,
      ['detlabel', 'detmove', 'detedit', 'detdel'].every((id) => detail[id].fits && (width < 360 || detail[id].top === detail.detdel.top))
      && ['detlabel', 'detmove', 'detedit'].every((id) => detail[id].stroke === detail[id].color), JSON.stringify(detail));
    check(`V4 ${tag} no JS errors`, errs.length === 0, errs[0]);
    await context.close();
  }
}

{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const busy = await page.evaluate(async () => {
    const { withBusy } = await import('/src/ui.js');
    const button = document.getElementById('save-item-btn');
    const before = button.innerHTML;
    await withBusy(button, 'جارٍ الحفظ…', async () => {});
    return { same: button.innerHTML === before, svg: Boolean(button.querySelector('svg')), text: button.textContent.trim() };
  });
  check('V5 a busy button gets its icon back with its label', busy.same && busy.svg && busy.text === 'حفظ', JSON.stringify(busy));
  const leftovers = await page.evaluate(() => {
    const glyph = /^[⊡🗂✎✏✓✕📊💾📄📥↩]/u;
    return [...document.querySelectorAll('button')].filter((b) => glyph.test(b.textContent.trim())).map((b) => b.id || b.className);
  });
  check('V6 no core button in the page still starts with a raw glyph', leftovers.length === 0, JSON.stringify(leftovers));
  check('V7 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
