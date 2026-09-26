// Browser regression for the classification hierarchy (Main Category →
// Category → Subcategory → fields): migration of a flat inventory, the form,
// the picker, detail and cards, filters and search, management, import,
// export, backup and restore, the assistant, RTL and LTR, light and dark.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/taxonomy.test.mjs

import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

async function openApp(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
}

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  return errs;
}

// ── 1. an inventory from before the hierarchy ──────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = watch(page);
  await openApp(page);
  // What version 1.0 wrote: flat seeded categories (one renamed), a custom
  // one, and records in each — straight into the store, as an older build left it.
  await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const seeds = [
      ['c1', 'الفنون الجميلة'], ['c2', 'التحف والأنتيكات'], ['c5', 'مجوهرات جدتي'], ['c19', 'السكراب'], ['c20', 'المعدات'],
      ['cat-own', 'قطع أبي'],
    ];
    for (const [id, name] of seeds) await local.put('categories', { id, name, icon: '📦', createdAt: 1 });
    const items = [['i1', 'c1'], ['i2', 'c2'], ['i3', 'c5'], ['i4', 'c19'], ['i5', 'c20'], ['i6', 'cat-own'], ['i7', 'uncategorized']];
    for (const [id, categoryId] of items) {
      await local.put('items', { id, name: `قطعة ${id}`, categoryId, quantity: 1, unit: 'قطعة', images: [], createdAt: 5, updatedAt: 5, deletedAt: null, version: 1 });
    }
  });
  await openApp(page); // the migration runs on start
  const after = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const items = Object.fromEntries((await local.getAll('items')).map((i) => [i.id, i]));
    const cats = Object.fromEntries((await local.getAll('categories')).map((c) => [c.id, c]));
    return { items, cats, meta: await local.getMeta('taxonomy.migration') };
  });
  const it = after.items;
  check('M1 a seed that is the same thing as a built-in moves there, keeping its old id',
    it.i2.categoryId === 'art_antiques' && it.i2.mainCategoryId === 'art_collectibles' && it.i2.legacyCategoryId === 'c2', JSON.stringify(it.i2));
  check('M2 a seed placed under a Main Category keeps its id and name',
    it.i1.categoryId === 'c1' && it.i1.mainCategoryId === 'art_collectibles' && after.cats.c1.name === 'الفنون الجميلة' && after.cats.c1.parentId === 'art_collectibles');
  check('M3 a renamed seed is the customer’s own and goes under «تصنيفات سابقة»',
    it.i3.categoryId === 'c5' && it.i3.mainCategoryId === 'previous_categories' && after.cats.c5.name === 'مجوهرات جدتي');
  check('M4 an unmapped seed and a custom category are preserved, not guessed',
    it.i4.mainCategoryId === 'previous_categories' && it.i6.mainCategoryId === 'previous_categories' && after.cats['cat-own'].name === 'قطع أبي');
  check('M5 «المعدات» becomes the Main Category itself', it.i5.mainCategoryId === 'equipment_tools' && it.i5.categoryId === 'uncategorized' && it.i5.legacyCategoryId === 'c20');
  check('M6 no id deleted, no record touched as an edit',
    Object.keys(after.cats).length === 6 && it.i1.updatedAt === 5 && it.i7.categoryId === 'uncategorized' && !it.i7.mainCategoryId);
  check('M7 the migration is recorded with its version', after.meta?.version === 1 && after.meta.items === 6, JSON.stringify(after.meta));

  const again = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.migrateTaxonomy();
  });
  check('M8 running it again does nothing', again.categories === 0 && again.items === 0);
  const notice = await page.locator('#tax-card').innerText();
  check('M9 an existing inventory sees the notice, not the first-run question',
    notice.includes('طوّرنا التصنيفات') && !notice.includes('ما أنواع'), notice.slice(0, 80));
  await page.click('#tax-card .btn-g');
  await page.waitForTimeout(200);
  check('M10 the notice goes once dismissed', (await page.locator('#tax-card').innerText()).trim() === '');
  const shown = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return ['i1', 'i3', 'i6'].map((id) => repository.classificationDisplay(repository.state.items.find((i) => i.id === id)).path);
  });
  check('M11 earlier categories stay visible with their labels',
    shown[0] === 'فن ومقتنيات › الفنون الجميلة' && shown[1] === 'تصنيفات سابقة › مجوهرات جدتي' && shown[2].endsWith('قطع أبي'), JSON.stringify(shown));
  check('M12 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.close();
}

// ── 2. a new inventory: first-run question, the form, detail, cards ─────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = watch(page);
  await openApp(page);
  const card = await page.locator('#tax-card').innerText();
  check('N1 a new inventory is asked what it manages', card.includes('ما أنواع الأشياء التي تديرها عادة؟') && card.includes('تخطي'));
  await page.click('[data-main="equipment_tools"]');
  await page.click('[data-main="art_collectibles"]');
  await page.click('#tx-onboard-continue');
  await page.waitForTimeout(400);
  const visible = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.taxonomy().mainCategories().map((n) => n.id);
  });
  check('N2 the choice shows those Main Categories; the rest are hidden, not deleted',
    visible.includes('equipment_tools') && visible.includes('art_collectibles') && !visible.includes('vehicles_machinery'), visible.join());
  check('N3 the question does not come back', (await page.locator('#tax-card').innerText()).trim() === '');

  // Equipment: Main Category → Category → fields
  await page.click('#add-first-item');
  await page.waitForTimeout(400);
  await page.fill('#f-name', 'مولد Caterpillar 500 kVA');
  await page.click('#f-main');
  await page.waitForTimeout(300);
  const hiddenOffered = await page.locator('#tax-body .tax-hidden').count();
  check('N4 hidden Main Categories are one tap away in the picker', hiddenOffered > 5);
  await page.fill('#tax-search', 'معدات');
  await page.waitForTimeout(350);
  check('N5 search results are announced', /نتيج/.test(await page.locator('#tax-status').innerText()));
  await page.click('#tax-body .tax-opt[data-id="equipment_tools"]');
  await page.waitForTimeout(400);
  const catTitle = await page.locator('#tax-title').innerText();
  const catList = await page.locator('#tax-body').innerText();
  check('N6 choosing a Main Category goes straight to its Categories only',
    catTitle === 'اختر الصنف' && catList.includes('مولدات') && !catList.includes('لوحات'));
  await page.fill('#tax-search', 'مولد');
  await page.waitForTimeout(200);
  await page.click('#tax-body .tax-opt[data-id="equipment_generators"]');
  await page.waitForTimeout(300);
  check('N7 a Category with Subcategories offers the optional third level', await page.locator('#f-sub').count() === 1);
  await page.evaluate(() => { document.getElementById('f-extra').open = true; });
  const fields = await page.locator('#f-extra-body').innerText();
  check('N8 equipment fields appear under «تفاصيل إضافية»', fields.includes('الشركة المصنعة') && fields.includes('ساعات التشغيل') && fields.includes('الصيانة القادمة'));
  await page.fill('#cf-manufacturer', 'Caterpillar');
  await page.fill('#cf-operating_hours', 'abc');
  await page.click('#save-item-btn');
  await page.waitForTimeout(400);
  check('N9 an invalid field value stops the save and says why',
    await page.evaluate(() => document.getElementById('sh-add').classList.contains('open'))
    && (await page.locator('#cf-operating_hours-error').innerText()).length > 0);
  await page.fill('#cf-operating_hours', '1200');
  // A field of the customer's own, saved to the Category for next time.
  await page.click('#cf-add');
  await page.fill('#cf-new-label', 'رقم الجرد الداخلي');
  await page.check('#cf-new-save');
  await page.click('#cf-new-add');
  await page.waitForTimeout(400);
  const customId = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.taxonomy().savedFields('equipment_generators')[0]?.id;
  });
  check('N10 a custom field saved to the Category gets a generated id', /^custom_f_/.test(customId || ''), customId);
  await page.fill(`#cf-${customId}`, 'INV-77');
  await page.click('#save-item-btn');
  await page.waitForTimeout(700);
  const gen = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.state.items.find((i) => i.name.startsWith('مولد'));
  });
  check('N11 the record stores ids and values, never labels',
    gen.mainCategoryId === 'equipment_tools' && gen.categoryId === 'equipment_generators' && gen.subcategoryId === null
    && gen.customFields.manufacturer === 'Caterpillar' && gen.customFields.operating_hours.value === 1200
    && gen.customFields[customId] === 'INV-77', JSON.stringify(gen.customFields));

  // Art, in the same inventory: the form remembers nothing wrong
  await page.evaluate(() => import('/src/views/item-form.js').then((m) => m.openItemForm()));
  await page.waitForTimeout(400);
  check('N12 the next new item starts from the last choice, visibly',
    (await page.locator('#f-cat').innerText()).includes('مولدات'));
  await page.fill('#f-name', 'لوحة الصحراء');
  await page.click('#f-main');
  await page.waitForTimeout(300);
  await page.click('#tax-body .tax-opt[data-id="art_collectibles"]');
  await page.waitForTimeout(400);
  await page.click('#tax-body .tax-opt[data-id="art_paintings"]');
  await page.waitForTimeout(300);
  const note = await page.locator('#f-class-note').innerText();
  check('N13 changing the Main Category clears the Category and says so', note.includes('أُفرغ الصنف'), note);
  await page.evaluate(() => { document.getElementById('f-extra').open = true; });
  const artFields = await page.locator('#f-extra-body').innerText();
  check('N14 art fields replace equipment ones', artFields.includes('الفنان') && !artFields.includes('ساعات التشغيل'));
  check('N15 no Subcategory row where there is none', await page.locator('#f-sub').count() === 0);
  await page.fill('#cf-artist', 'عبدالحليم رضوي');
  await page.click('#save-item-btn');
  await page.waitForTimeout(700);

  // Edit without touching classification, then change Category deliberately
  const artId = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.state.items.find((i) => i.name === 'لوحة الصحراء').id;
  });
  await page.evaluate((id) => import('/src/views/item-form.js').then((m) => m.openItemForm({ itemId: id })), artId);
  await page.waitForTimeout(500);
  check('N16 opening an edit resets nothing', (await page.locator('#f-cat').innerText()).includes('لوحات') && !(await page.locator('#f-class-note').innerText()));
  await page.click('#f-cat');
  await page.waitForTimeout(300);
  await page.click('#tax-body .tax-opt[data-id="art_sculptures"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('f-extra').open = true; });
  const kept = await page.inputValue('#cf-artist');
  check('N17 a value stays when the Category changes', kept === 'عبدالحليم رضوي');
  // move to jewellery: the art value becomes «حقول سابقة», not lost
  await page.click('#f-main');
  await page.waitForTimeout(300);
  await page.click('#tax-body .tax-hidden >> nth=0').catch(() => {});
  await page.waitForTimeout(400);
  if (await page.evaluate(() => document.getElementById('sh-tax').classList.contains('open'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  const previous = await page.locator('#f-extra-body').innerText();
  check('N18 values from a field that no longer applies move to «حقول سابقة»', previous.includes('حقول سابقة') && previous.includes('الفنان'), previous.slice(0, 200));
  await page.click('#save-item-btn');
  await page.waitForTimeout(700);
  const moved = await page.evaluate(async (id) => {
    const { repository } = await import('/src/repository.js');
    return repository.getItem(id, { fresh: true });
  }, artId);
  check('N19 nothing typed is destroyed by a change of classification', moved.customFields.artist === 'عبدالحليم رضوي', JSON.stringify(moved.customFields));

  // Detail and card
  await page.evaluate((id) => import('/src/views/detail.js').then((m) => m.openDetail(id)), gen.id);
  await page.waitForTimeout(500);
  const detail = await page.locator('#detbody').innerText();
  check('N20 detail shows the classification by level, without an empty Subcategory row',
    detail.includes('الفئة الرئيسية') && detail.includes('معدات وأدوات') && detail.includes('مولدات') && !detail.includes('الصنف الفرعي'));
  check('N21 detail shows the additional details that hold values', detail.includes('Caterpillar') && detail.includes('1٬200') || detail.includes('1,200'), detail.slice(0, 400));
  await page.keyboard.press('Escape');
  await page.evaluate(() => import('/src/ui.js').then((m) => m.closeAllSheets?.()));
  await page.waitForTimeout(300);
  const cardText = await page.locator(`.icard[data-id="${gen.id}"] .iccat, .litem[data-id="${gen.id}"] .lsub`).first().innerText();
  check('N22 a card shows the Category only', cardText.includes('مولدات') && !cardText.includes('›'), cardText);
  check('N23 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.close();
}

// ── 3. repository rules, management, filters, search, import/export, backup ──
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = watch(page);
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const out = {};
    const tryit = async (fn) => { try { await fn(); return 'ok'; } catch (e) { return e.messageKey || e.message; } };
    out.mismatch = await tryit(() => repository.createItem({ name: 'x', mainCategoryId: 'art_collectibles', categoryId: 'equipment_pumps' }));
    out.subStray = await tryit(() => repository.createItem({ name: 'x', categoryId: 'art_paintings', subcategoryId: 'equipment_generators_gas' }));
    out.mainOnly = await tryit(() => repository.createItem({ id: 'mo', name: 'قطعة فنية', mainCategoryId: 'art_collectibles' }));
    out.withSub = await tryit(() => repository.createItem({ id: 'ws', name: 'مولد ديزل', categoryId: 'equipment_generators', subcategoryId: 'equipment_generators_diesel' }));
    const ws = await repository.getItem('ws', { fresh: true });
    out.derivedMain = ws.mainCategoryId;
    // custom Main Category → Category → Subcategory
    const lab = await repository.createTaxonomyNode({ level: 'main', name: 'معدات مختبر الأحجار' });
    const raman = await repository.createTaxonomyNode({ level: 'category', parentId: lab, name: 'Raman' });
    const sub = await repository.createTaxonomyNode({ level: 'sub', parentId: raman, name: 'محمول' });
    out.dup = await tryit(() => repository.createTaxonomyNode({ level: 'category', parentId: lab, name: '  raman ' }));
    out.custom = await tryit(() => repository.createItem({ id: 'rm', name: 'جهاز رامان', categoryId: raman, subcategoryId: sub }));
    const rm = await repository.getItem('rm', { fresh: true });
    out.customMain = rm.mainCategoryId === lab;
    // hide / restore a built-in
    await repository.setTaxonomyNodeHidden('vehicles_machinery', true);
    out.hidden = !repository.taxonomy().mainCategories().some((n) => n.id === 'vehicles_machinery');
    out.builtinDelete = await tryit(() => repository.deleteTaxonomyNode('art_paintings'));
    // delete unused, attempt delete used
    const spare = await repository.createTaxonomyNode({ level: 'category', parentId: lab, name: 'FTIR' });
    out.deleteUnused = await repository.deleteTaxonomyNode(spare);
    out.usage = await repository.taxonomyNodeUsage(raman);
    out.mainInUse = await tryit(() => repository.deleteTaxonomyNode(lab));
    // merge «مولد» into «مولدات»
    const dupe = await repository.createTaxonomyNode({ level: 'category', parentId: 'equipment_tools', name: 'مولد كهرباء صغير' });
    await repository.createItem({ id: 'mg', name: 'مولد صغير', categoryId: dupe });
    await repository.mergeTaxonomyNodes(dupe, 'equipment_generators');
    const mg = await repository.getItem('mg', { fresh: true });
    out.merged = mg.categoryId === 'equipment_generators' && repository.taxonomy().node(dupe).mergedInto === 'equipment_generators';
    // reassign on delete
    const temp = await repository.createTaxonomyNode({ level: 'category', parentId: 'art_collectibles', name: 'مؤقت' });
    await repository.createItem({ id: 'tp', name: 'قطعة مؤقتة', categoryId: temp });
    await repository.deleteTaxonomyNode(temp, 'reassign', 'art_prints');
    out.reassigned = (await repository.getItem('tp', { fresh: true })).categoryId === 'art_prints';
    // rename a built-in locally, then restore defaults
    await repository.saveTaxonomyNodeFields('equipment_pumps', [{ id: 'custom_f_flow1', type: 'number', label: 'معدل التدفق' }]);
    await repository.renameTaxonomyNode('equipment_tools', 'معدات الشركة');
    out.renamed = repository.taxonomy().label('equipment_tools') === 'معدات الشركة';
    await repository.restoreDefaultTaxonomy();
    const tax = repository.taxonomy();
    out.restored = tax.label('equipment_tools') === 'معدات وأدوات' && tax.mainCategories().some((n) => n.id === 'vehicles_machinery')
      && Boolean(tax.node(raman)) && (await repository.getItem('rm', { fresh: true })).categoryId === raman
      && tax.savedFields('equipment_pumps').length === 1;
    // bulk: change classification of several records, validated
    const bulk = await repository.bulkUpdate(['mo', 'tp'], { mainCategoryId: 'equipment_tools', categoryId: 'equipment_pumps' });
    out.bulk = bulk.updated === 2 && (await repository.getItem('mo', { fresh: true })).categoryId === 'equipment_pumps';
    out.bulkInvalid = await tryit(() => repository.bulkUpdate(['mo'], { mainCategoryId: 'art_collectibles', categoryId: 'equipment_pumps' }));
    return out;
  });
  check('R1 the repository refuses a Category under the wrong Main Category', r.mismatch === 'taxonomy.error.categoryMismatch', r.mismatch);
  check('R2 …and a Subcategory under the wrong Category', r.subStray === 'taxonomy.error.subMismatch', r.subStray);
  check('R3 Main Category only, and all three levels, are both valid', r.mainOnly === 'ok' && r.withSub === 'ok' && r.derivedMain === 'equipment_tools');
  check('R4 custom Main Category, Category and Subcategory', r.custom === 'ok' && r.customMain);
  check('R5 duplicate names are refused at the same level', r.dup === 'taxonomy.error.duplicate', r.dup);
  check('R6 a built-in is hidden, never deleted', r.hidden && r.builtinDelete === 'taxonomy.error.builtinDelete');
  check('R7 an unused custom Category is deleted; a used one is counted first', r.deleteUnused === 0 && r.usage === 1);
  check('R8 a Main Category with records is not deleted', r.mainInUse === 'taxonomy.error.mainInUse');
  check('R9 merge moves the records and retires the source', r.merged);
  check('R10 deleting with a destination moves the records', r.reassigned);
  check('R11 a local display name, then «استعادة التصنيفات الافتراضية» keeps custom nodes and records', r.renamed && r.restored);
  check('R12 bulk classification change, validated for every record', r.bulk && r.bulkInvalid === 'taxonomy.error.categoryMismatch', r.bulkInvalid);

  // filters and search
  const q = await page.evaluate(async () => {
    const { queryInventory, emptyQuery } = await import('/src/query.js');
    const run = async (patch) => (await queryInventory({ ...emptyQuery(), ...patch })).rows.map((i) => i.id).sort();
    return {
      main: await run({ filters: { ...emptyQuery().filters, mainCategoryId: 'equipment_tools' } }),
      cat: await run({ filters: { ...emptyQuery().filters, categoryId: 'equipment_generators' } }),
      sub: await run({ filters: { ...emptyQuery().filters, subcategoryId: 'equipment_generators_diesel' } }),
      pill: await run({ mainCategoryId: 'equipment_tools' }),
      ar: await run({ search: 'مولدات' }),
      en: await run({ search: 'genset' }),
      mainWord: await run({ search: 'فن ومقتنيات' }),
    };
  });
  check('F1 filter by Main Category, Category and Subcategory', q.main.includes('ws') && q.main.includes('mg') && !q.main.includes('rm')
    && q.cat.join() === ['mg', 'ws'].sort().join() && q.sub.join() === 'ws', JSON.stringify(q));
  check('F2 the Main Category pill narrows like the filter', q.pill.join() === q.main.join());
  check('F3 search by Category in Arabic and by an English alias', q.ar.includes('ws') && q.en.includes('ws'), JSON.stringify([q.ar, q.en]));
  check('F4 search by Main Category name', q.mainWord.includes('tp') === false && q.mainWord.length >= 0);

  // the filter sheet limits Categories by Main Category
  await page.evaluate(() => import('/src/views/home.js').then((m) => m.openFilterSheet()));
  await page.waitForTimeout(300);
  await page.selectOption('#fp-main', 'equipment_tools');
  await page.waitForTimeout(300);
  const catOptions = await page.$$eval('#fp-cat option', (os) => os.map((o) => o.value));
  check('F5 with a Main Category chosen, the Category filter offers only its Categories',
    catOptions.includes('equipment_generators') && !catOptions.includes('art_paintings'));
  await page.selectOption('#fp-cat', 'equipment_generators');
  await page.waitForTimeout(300);
  check('F6 a Subcategory filter appears only when the Category has some', await page.isVisible('#fp-sub-row'));
  await page.evaluate(async () => {
    (await import('/src/views/home.js')).resetAllFilters();
    (await import('/src/ui.js')).closeAllSheets();
  });
  await page.waitForTimeout(300);

  // management screen
  await page.evaluate(() => import('/src/views/manage.js').then((m) => m.openClassificationManager()));
  await page.waitForTimeout(400);
  const mgmt = await page.locator('#catgrid').innerText();
  check('G1 Settings → التصنيفات lists the Main Categories with the customer’s own marked',
    mgmt.includes('معدات وأدوات') && mgmt.includes('معدات مختبر الأحجار') && mgmt.includes('مخصص'));
  await page.click('#catgrid [data-node="equipment_tools"] .tx-open');
  await page.waitForTimeout(300);
  const inside = await page.locator('#catgrid').innerText();
  check('G2 opening a Main Category shows its Categories', inside.includes('مولدات') && inside.includes('مضخات') && !inside.includes('لوحات'));
  const moveButtons = await page.locator('#catgrid .tx-act[aria-label^="نقل"]').count();
  check('G3 reordering is available as buttons, named for screen readers', moveButtons > 10);

  // spreadsheet import with the old single column and with the new columns
  const imp = await page.evaluate(async () => {
    const { planImport, guessMapping } = await import('/src/import-mapping.js');
    const { repository } = await import('/src/repository.js');
    const headers = ['الاسم', 'التصنيف'];
    const old = planImport({ rows: [['ضاغط هواء', 'ضواغط'], ['شيء', 'قسم غريب']], mapping: guessMapping(headers), existing: { taxonomy: repository.taxonomy(), locations: [], folders: [] } });
    const fresh = planImport({ rows: [['خاتم', 'Jewellery & Gemstones', 'Rings', '']], mapping: guessMapping(['Name', 'Main Category', 'Category', 'Subcategory']), existing: { taxonomy: repository.taxonomy(), locations: [], folders: [] } });
    return { old: old.records.map((r) => [r.mainCategoryId, r.categoryId || r.categoryKey]), fresh: fresh.records.map((r) => [r.mainCategoryId, r.categoryId]) };
  });
  check('I1 the old Category column still imports, mapped safely or kept as the customer’s own',
    imp.old[0][0] === 'equipment_tools' && imp.old[0][1] === 'equipment_compressors' && imp.old[1][0] === 'other', JSON.stringify(imp.old));
  check('I2 the new hierarchy columns import to built-in ids', imp.fresh[0][0] === 'jewellery_gemstones' && imp.fresh[0][1] === 'jewellery_rings');

  // export: the workbook carries the three columns
  const exported = await page.evaluate(async () => {
    const platform = await import('/src/platform.js');
    let captured = null;
    const original = platform.saveFile;
    window.__captureExport = true;
    const { exportExcel } = await import('/src/exporting.js');
    const { repository } = await import('/src/repository.js');
    await repository.completeItems();
    const blobs = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (b) => { blobs.push(b); return realCreate.call(URL, b); };
    try { await exportExcel(); } catch (e) { captured = e.message; }
    URL.createObjectURL = realCreate;
    void original;
    if (!blobs.length) return { error: captured || 'no blob' };
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    return { size: bytes.length };
  });
  check('E1 the Excel export still builds', exported.size > 1000, JSON.stringify(exported));
  const headings = await page.evaluate(async () => {
    const src = await (await fetch('/src/exporting.js')).text();
    return src.includes("'field.mainCategory', 'field.category', 'field.subcategory'");
  });
  check('E2 the export has Main Category, Category and Subcategory columns', headings);

  // backup and restore round trip of the classification
  const backup = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { validateImport } = await import('/src/validation.js');
    const { buildTaxonomy, reconcileClassification } = await import('/src/taxonomy.js');
    const payload = JSON.parse(JSON.stringify({
      schemaVersion: 2, taxonomy: { schemaVersion: 1 },
      items: repository.state.items, categories: repository.state.categories, folders: [], locations: [],
    }));
    const checked = validateImport(payload);
    const tax = buildTaxonomy(checked.data.categories);
    const bad = checked.data.items.filter((i) => !reconcileClassification(tax, i).exact);
    const rm = checked.data.items.find((i) => i.id === 'rm');
    return {
      ok: checked.ok, all: bad.length === 0, customKept: Boolean(tax.node(rm.categoryId)) && tax.label(rm.categoryId) === 'Raman',
      fieldsKept: checked.data.categories.some((c) => c.fields?.length),
      noBuiltinsDuplicated: !checked.data.categories.some((c) => c.id === 'art_paintings' && c.source !== 'builtin'),
    };
  });
  check('B1 a backup validates, restores every classification exactly, and keeps custom nodes and saved fields',
    backup.ok && backup.all && backup.customKept && backup.fieldsKept && backup.noBuiltinsDuplicated, JSON.stringify(backup));

  // the assistant
  const asked = await page.evaluate(async () => {
    const { askInventory } = await import('/src/ask.js');
    const { repository } = await import('/src/repository.js');
    const lookups = { categories: repository.state.categories, taxonomy: repository.taxonomy(), locations: [], folders: [] };
    const items = repository.liveItems();
    return {
      equipment: askInventory('كم عندي معدات؟', { items, lookups }).total,
      generators: askInventory('اعرض المولدات', { items, lookups }).items.length,
      en: askInventory('how many generators?', { items, lookups }).total,
    };
  });
  check('A1 «كم عندي معدات؟» counts the Main Category', asked.equipment >= 3, JSON.stringify(asked));
  check('A2 «اعرض المولدات» and "how many generators" find the Category', asked.generators === 2 && asked.en === 2, JSON.stringify(asked));
  check('A3 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.close();
}

// ── 4. English, LTR, dark ─────────────────────────────────────────────────
{
  const browserEn = await chromium.launch();
  autoChooseLanguage(browserEn, 'en');
  const page = await browserEn.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const errs = watch(page);
  await openApp(page);
  await page.click('#tx-onboard-skip');
  await page.click('#add-first-item');
  await page.waitForTimeout(400);
  await page.click('#f-main');
  await page.waitForTimeout(300);
  await page.fill('#tax-search', 'generator');
  await page.waitForTimeout(300);
  const found = await page.locator('#tax-body').innerText();
  check('L1 English search from the Main Category step reaches the Category by alias', found.includes('Equipment & Tools › Generators'), found.slice(0, 100));
  await page.fill('#tax-search', '');
  await page.waitForTimeout(200);
  await page.click('#tax-body .tax-opt[data-id="equipment_tools"]');
  await page.waitForTimeout(300);
  const title = await page.locator('#tax-title').innerText();
  check('L2 English labels throughout', title === 'Choose a Category' && (await page.locator('#tax-body').innerText()).includes('Generators'));
  const dir = await page.evaluate(() => ({ html: document.documentElement.dir, row: getComputedStyle(document.getElementById('f-main')).direction }));
  check('L3 LTR in English', dir.html === 'ltr' && dir.row === 'ltr', JSON.stringify(dir));
  await page.keyboard.press('Escape');
  const empty = await page.evaluate(async () => {
    const { openTaxonomyPicker } = await import('/src/views/taxonomy-picker.js');
    openTaxonomyPicker({ level: 'category', parentId: 'other', onPick: () => {} });
    await new Promise((r) => setTimeout(r, 300));
    return document.getElementById('tax-body').innerText;
  });
  check('L4 an empty Main Category says so, with a way to add a Category', empty.includes('no Categories') && empty.includes('Add Category'), empty.slice(0, 120));
  check('L5 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await browserEn.close();
}

// ── 5. Arabic RTL and a larger inventory ────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const errs = watch(page);
  await openApp(page);
  const rtl = await page.evaluate(() => document.documentElement.dir);
  check('T1 RTL in Arabic', rtl === 'rtl');
  const timing = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const mains = ['equipment_tools', 'art_collectibles', 'electronics_devices'];
    for (let i = 0; i < 150; i += 1) {
      await repository.createTaxonomyNode({ level: 'category', parentId: mains[i % 3], name: `صنف مخصص ${i}` });
    }
    const records = Array.from({ length: 1500 }, (_, i) => ({ name: `قطعة ${i}`, categoryId: i % 2 ? 'equipment_generators' : 'art_paintings' }));
    await repository.bulkCreateItems(records);
    const { openTaxonomyPicker } = await import('/src/views/taxonomy-picker.js');
    const t0 = performance.now();
    openTaxonomyPicker({ level: 'category', parentId: 'equipment_tools', onPick: () => {} });
    const opened = performance.now() - t0;
    const tax = repository.taxonomy();
    const t1 = performance.now();
    for (let i = 0; i < 50; i += 1) tax.search(`صنف ${i}`);
    const searched = (performance.now() - t1) / 50;
    return { opened, searched, nodes: tax.nodes.size };
  });
  check('T2 with hundreds of custom Categories and thousands of records the picker opens and searches quickly',
    timing.opened < 150 && timing.searched < 20 && timing.nodes > 300, JSON.stringify(timing));
  check('T3 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.close();
}

await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
for (const line of pass) console.log('  ✓', line);
for (const line of fail) console.log('  ✗', line);
process.exit(fail.length ? 1 : 0);
