// Custom-field lifetime, merge collisions, import classification checks, the
// Excel sheets and the Full Backup surfaces — the customer-facing half of the
// data-integrity work, driven through the real screens where there is one.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/fields.test.mjs

import { spawnSync } from 'node:child_process';
import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase|\[media\]/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { page, context, errs };
}

const text = (page, id) => page.evaluate((id) => document.getElementById(id)?.innerText || '', id);

// ── 1. removing a field that records use, through the manager ─────────────
{
  const { page, context, errs } = await open();
  const setup = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const main = await repository.createTaxonomyNode({ level: 'main', name: 'مختبر' });
    const cat = await repository.createTaxonomyNode({ level: 'category', parentId: main, name: 'مجاهر' });
    await repository.saveTaxonomyNodeFields(cat, [
      { id: 'custom_f_zoom', type: 'number', label: 'التكبير' },
      { id: 'custom_f_unused', type: 'text', label: 'حقل غير مستخدم' },
    ]);
    await repository.createItem({ id: 'm1', name: 'مجهر ضوئي', categoryId: cat, customFields: { custom_f_zoom: 400 } });
    await repository.createItem({ id: 'm2', name: 'مجهر رقمي', categoryId: cat, customFields: { custom_f_zoom: 1000 } });
    const { openClassificationManager } = await import('/src/views/manage.js');
    openClassificationManager({ mainId: main });
    return { main, cat };
  });
  await page.waitForTimeout(400);
  await page.evaluate((cat) => [...document.querySelectorAll('#catgrid [data-node]')].find((n) => n.dataset.node === cat)?.querySelector('.tx-open')?.click(), setup.cat);
  await page.waitForTimeout(300);
  const removeButtons = await page.evaluate(() => [...document.querySelectorAll('#catgrid .tx-act')].map((b) => b.getAttribute('aria-label')));
  check('U1 the Category shows its saved fields with a remove action', removeButtons.some((l) => l?.includes('التكبير')), JSON.stringify(removeButtons));

  await page.evaluate(() => [...document.querySelectorAll('#catgrid .tx-act')].find((b) => b.getAttribute('aria-label')?.includes('التكبير')).click());
  await page.waitForSelector('#del-confirm.open', { timeout: 5000 });
  const dialog = await text(page, 'del-confirm');
  check('U2 the confirmation states how many records use the field and that values stay',
    dialog.includes('2') && dialog.includes('قطعة'), dialog.replace(/\n/g, ' / '));
  await page.click('#del-confirm-btn');
  await page.waitForTimeout(500);
  const after = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { fieldRows } = await import('/src/field-format.js');
    const def = repository.fieldDefinitions().find((d) => d.id === 'custom_f_zoom');
    const item = await repository.getItem('m1', { fresh: true });
    const rows = fieldRows(item, repository.taxonomy());
    return { retired: def?.retired, value: item.customFields.custom_f_zoom, previous: rows.previous.map((r) => `${r.label}=${r.text}`) };
  });
  check('U3 a field in use is retired, the values untouched and still shown under «حقول سابقة»',
    after.retired === true && after.value === 400 && after.previous.some((r) => r.startsWith('التكبير=') && r.includes('400')), JSON.stringify(after));

  await page.evaluate(() => [...document.querySelectorAll('#catgrid .tx-act')].find((b) => b.getAttribute('aria-label')?.includes('غير مستخدم')).click());
  await page.waitForSelector('#del-confirm.open', { timeout: 5000 });
  await page.click('#del-confirm-btn');
  await page.waitForTimeout(500);
  const unused = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.fieldDefinitions().some((d) => d.id === 'custom_f_unused');
  });
  check('U4 a field no record uses is deleted outright', unused === false);

  // A record in the Trash still counts: restoring it must find its field.
  const trashed = await page.evaluate(async (cat) => {
    const { repository } = await import('/src/repository.js');
    const fields = repository.taxonomy().savedFields(cat);
    await repository.saveTaxonomyNodeFields(cat, [...fields, { id: 'custom_f_trash', type: 'text', label: 'ملاحظة المختبر' }]);
    await repository.createItem({ id: 't1', name: 'مجهر في السلة', categoryId: cat, customFields: { custom_f_trash: 'قديم' } });
    await repository.deleteItem('t1');
    const usage = await repository.fieldUsage('custom_f_trash');
    const result = await repository.saveTaxonomyNodeFields(cat, fields);
    const def = repository.fieldDefinitions().find((d) => d.id === 'custom_f_trash');
    return { usage, retired: result.retired.map((r) => r.id), def: def && { retired: def.retired, label: def.label } };
  }, setup.cat);
  check('U4b a field used only by a record in the Trash is retired, not deleted',
    trashed.usage === 1 && trashed.def?.retired === true && trashed.def.label === 'ملاحظة المختبر', JSON.stringify(trashed));

  // The retired list, and bringing the field back.
  await page.evaluate(async () => { const { openClassificationManager } = await import('/src/views/manage.js'); openClassificationManager({ fields: true }); });
  await page.waitForTimeout(400);
  const overview = await text(page, 'catgrid');
  check('U5 «حقول متوقفة» lists the retired field', overview.includes('حقول متوقفة') && overview.includes('التكبير'), overview.replace(/\n/g, ' / ').slice(0, 300));
  await page.evaluate(() => [...document.querySelectorAll('#catgrid .tx-act')].find((b) => b.getAttribute('aria-label')?.includes('التكبير'))?.click());
  await page.waitForTimeout(500);
  const reactivated = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const def = repository.fieldDefinitions().find((d) => d.id === 'custom_f_zoom');
    const item = await repository.getItem('m1', { fresh: true });
    const { fieldRows } = await import('/src/field-format.js');
    const rows = fieldRows(item, repository.taxonomy());
    return { retired: def?.retired, onTemplate: repository.taxonomy().savedFields(item.categoryId).some((f) => f.id === 'custom_f_zoom'), previous: rows.previous.length };
  });
  check('U6 reactivating puts the field back on its Category, values in place', reactivated.retired === false && reactivated.onTemplate && reactivated.previous === 0, JSON.stringify(reactivated));

  // Deleting the Category keeps what the records say.
  const deleted = await page.evaluate(async (cat) => {
    const { repository } = await import('/src/repository.js');
    await repository.deleteTaxonomyNode(cat, 'uncategorize');
    const { fieldRows } = await import('/src/field-format.js');
    const item = await repository.getItem('m2', { fresh: true });
    const rows = fieldRows(item, repository.taxonomy());
    const def = repository.fieldDefinitions().find((d) => d.id === 'custom_f_zoom');
    return { value: item.customFields.custom_f_zoom, rows: [...rows.current, ...rows.previous].map((r) => `${r.label}=${r.text}`), def: def && { retired: def.retired, label: def.label } };
  }, setup.cat);
  check('U7 deleting a Category retires its fields; the label and value stay readable',
    deleted.value === 1000 && deleted.def?.retired === true && deleted.rows.some((r) => r.startsWith('التكبير=')), JSON.stringify(deleted));

  // A value whose definition is gone entirely is still shown, never dropped.
  const orphan = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.createItem({ id: 'o1', name: 'قطعة بحقل يتيم', categoryId: 'art_paintings', customFields: { custom_f_ghost: 'قيمة قديمة' } });
    const { fieldRows } = await import('/src/field-format.js');
    const item = await repository.getItem('o1', { fresh: true });
    const rows = fieldRows(item, repository.taxonomy());
    return [...rows.current, ...rows.previous].map((r) => `${r.label}=${r.text}`);
  });
  check('U8 an orphaned value shows as «حقل محفوظ سابقاً» with its value', orphan.includes('حقل محفوظ سابقاً=قيمة قديمة'), JSON.stringify(orphan));
  check('U9 no JS errors (fields)', errs.length === 0, errs.join(' | ').slice(0, 300));
  await context.close();
}

// ── 2. merging two trees whose children share names ────────────────────────
{
  const { page, context, errs } = await open();
  const merged = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const make = (level, parentId, name) => repository.createTaxonomyNode({ level, parentId, name });
    const a = await make('main', null, 'تصوير أ');
    const aCam = await make('category', a, 'كاميرات');
    const aLens = await make('sub', aCam, 'عدسات');
    const b = await make('main', null, 'تصوير ب');
    const bCam = await make('category', b, 'كاميرات');
    const bLens = await make('sub', bCam, 'عدسات');
    const bTri = await make('sub', bCam, 'حوامل');
    const aOnly = await make('category', a, 'إضاءة');
    await repository.saveTaxonomyNodeFields(aCam, [{ id: 'custom_f_mount', type: 'text', label: 'التركيب' }]);
    await repository.saveTaxonomyNodeFields(bCam, [{ id: 'custom_f_sensor', type: 'text', label: 'الحساس' }]);
    await repository.createItem({ id: 'p1', name: 'عدسة 50', categoryId: aCam, subcategoryId: aLens, customFields: { custom_f_mount: 'EF' } });
    await repository.createItem({ id: 'p2', name: 'فلاش', categoryId: aOnly });
    await repository.createItem({ id: 'p3', name: 'حامل', categoryId: bCam, subcategoryId: bTri });
    const plan = repository.planTaxonomyMerge(a, b);
    await repository.mergeTaxonomyNodes(a, b);
    const tax = repository.taxonomy();
    const get = async (id) => repository.getItem(id, { fresh: true });
    const [p1, p2, p3] = await Promise.all(['p1', 'p2', 'p3'].map(get));
    const cats = tax.categories(b).map((n) => tax.label(n));
    const subs = tax.subcategories(bCam).map((n) => tax.label(n));
    return {
      planOk: Boolean(plan),
      p1: [p1.mainCategoryId === b, p1.categoryId === bCam, p1.subcategoryId === bLens, p1.customFields.custom_f_mount],
      p2: [p2.mainCategoryId === b, p2.categoryId === aOnly],
      p3: [p3.subcategoryId === bTri],
      cats, subs,
      fields: tax.savedFields(bCam).map((f) => f.id).sort(),
      sourceGone: !tax.mainCategories().some((n) => n.id === a),
    };
  });
  const unique = (list) => new Set(list).size === list.length;
  check('M1 a same-named child is merged into its twin, recursively — no duplicate siblings',
    merged.p1.slice(0, 3).every(Boolean) && unique(merged.cats) && unique(merged.subs) && merged.subs.length === 2, JSON.stringify(merged));
  check('M2 a child with no twin is moved, its records re-pointed', merged.p2.every(Boolean) && merged.p3.every(Boolean), JSON.stringify(merged));
  check('M3 the twins’ fields are united, values kept', JSON.stringify(merged.fields) === '["custom_f_mount","custom_f_sensor"]' && merged.p1[3] === 'EF', JSON.stringify(merged.fields));
  check('M4 the source Main Category no longer appears', merged.sourceGone);
  check('M5 no JS errors (merge)', errs.length === 0, errs.join(' | ').slice(0, 300));
  await context.close();
}

// ── 3. classification problems in a spreadsheet import ────────────────────
{
  const { page, context, errs } = await open();
  const csv = [
    'الاسم,الفئة الرئيسية,الصنف,الصنف الفرعي',
    'صف سليم,فنون ومقتنيات,لوحات,',
    'فرعي بلا صنف,فنون ومقتنيات,,زيتية',
    'صنف في غير فئته,معدات,لوحات,',
  ].join('\n');
  await page.evaluate(async (csv) => {
    const mod = await import('/src/views/sheet-import.js');
    await mod.openSpreadsheetImport(new File([csv], 'classes.csv', { type: 'text/csv' }));
  }, csv);
  await page.waitForTimeout(500);
  await page.evaluate(() => [...document.querySelectorAll('#simport-foot button')].find((b) => b.textContent.includes('معاينة'))?.click());
  await page.waitForTimeout(500);
  const preview = (await text(page, 'simport-body')).replace(/\n/g, ' / ');
  const hasChoice = await page.evaluate(() => Boolean(document.getElementById('simport-create-under-main')));
  check('X1 a Subcategory without a Category is reported and held back', /صنف فرعي|الصنف الفرعي/.test(preview) && preview.includes('صف 3'), preview.slice(0, 400));
  check('X2 a Category under the wrong Main Category is reported, with a choice offered', preview.includes('صف 4') && hasChoice, preview.slice(0, 400));
  const beforeCount = await page.evaluate(() => document.getElementById('simport-foot').innerText);
  await page.click('#simport-create-under-main');
  await page.waitForTimeout(400);
  const afterChoice = (await text(page, 'simport-body')).replace(/\n/g, ' / ');
  const afterCount = await page.evaluate(() => document.getElementById('simport-foot').innerText);
  check('X3 choosing to create it under the named Main Category admits the row',
    !afterChoice.includes('صف 4') && afterCount !== beforeCount, JSON.stringify({ beforeCount, afterCount }));
  check('X4 no JS errors (import)', errs.length === 0, errs.join(' | ').slice(0, 300));
  await context.close();
}

// ── 4. the Excel file and the Full Backup surfaces ─────────────────────────
{
  const { page, context, errs } = await open({ acceptDownloads: true });
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const cat = await repository.createTaxonomyNode({ level: 'category', parentId: 'art', name: 'مخطوطات' }).catch(() => 'art_paintings');
    await repository.saveTaxonomyNodeFields(cat, [{ id: 'custom_f_age', type: 'text', label: 'العمر التقريبي' }]).catch(() => {});
    for (let i = 0; i < 12; i++) await repository.createItem({ id: `x${i}`, name: `قطعة ${i}`, categoryId: cat, customFields: { custom_f_age: `${100 + i} سنة` } });
  });
  const [xlsx] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.evaluate(async () => { const { exportExcel } = await import('/src/exporting.js'); await exportExcel(); }),
  ]);
  const path = await xlsx.path();
  const inspect = spawnSync('python3', ['-c', `
import sys, zipfile, re, json
z = zipfile.ZipFile(sys.argv[1])
wb = z.read('xl/workbook.xml').decode()
names = re.findall(r'<sheet [^>]*name="([^"]+)"', wb)
blob = ' '.join(z.read(n).decode('utf8', 'ignore') for n in z.namelist() if n.startswith('xl/'))
print(json.dumps({"names": names, "itemId": 'itemId' in blob, "fieldId": 'custom_f_age' in blob, "value": '100 سنة' in blob}))
`, path], { encoding: 'utf8' });
  const book = JSON.parse(inspect.stdout || '{}');
  check('E1 the Excel file carries the technical sheet with itemId and a structured fields sheet',
    book.itemId && book.fieldId && book.value && book.names?.some((n) => n === 'الحقول'), JSON.stringify(book));

  await page.evaluate(async () => { const { goTab } = await import('/src/navigation.js'); goTab('set'); });
  await page.waitForTimeout(500);
  const settings = (await text(page, 'data-panel')).replace(/\n/g, ' / ');
  check('S1 Settings offers the Full Backup and its restore, apart from the JSON export',
    settings.includes('نسخة احتياطية كاملة') && /استعادة/.test(settings) && settings.includes('JSON'), settings.slice(0, 400));
  check('S2 the Full Backup row says it has never been made', /لم تُنشأ|لم تُؤخذ|أبداً|بعد/.test(await text(page, 'full-backup-sub')), await text(page, 'full-backup-sub'));

  await page.evaluate(async () => { const { refreshBackupReminder } = await import('/src/views/backup-reminder.js'); await refreshBackupReminder(); const { goTab } = await import('/src/navigation.js'); goTab('home'); });
  await page.waitForTimeout(500);
  const card = await text(page, 'backup-card');
  check('S3 with 10+ items and no backup, a quiet reminder appears on the inventory', card.length > 0 && Boolean(await page.$('#backup-now')), card);
  await page.evaluate(() => [...document.querySelectorAll('#backup-card button')].find((b) => b.id !== 'backup-now')?.click());
  await page.waitForTimeout(300);
  const snoozed = await page.evaluate(async () => {
    const { refreshBackupReminder } = await import('/src/views/backup-reminder.js');
    await refreshBackupReminder();
    return document.getElementById('backup-card').innerText;
  });
  check('S4 «لاحقاً» puts the reminder away', snoozed.trim() === '', snoozed);
  check('S5 no JS errors (excel/settings)', errs.length === 0, errs.join(' | ').slice(0, 300));
  await context.close();
}

await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach((f) => console.log('  ✗', f)); process.exit(1); }
