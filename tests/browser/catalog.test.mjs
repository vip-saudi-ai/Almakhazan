// Browser test for the catalog and domain-details layer: the searchable
// cascading picker in the item form, custom entries, Save & Add Next, the
// detail rows, category changes, spreadsheet-free round trips through a Full
// Backup, and the catalog's own speed.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/catalog.test.mjs

import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const outside = [];
page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url()); });
await page.route('**/src/subscription.js', (r) => r.fulfill({ contentType: 'text/javascript', body: planStub({ planId: 'business' }) }));
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
await page.waitForTimeout(300);

const H = "const { repository } = await import('/src/repository.js'); const local = await import('/src/local-store.js'); const { catalogService } = await import('/src/catalog/service.js'); const { fieldRows } = await import('/src/field-format.js');";
const run = (body, arg) => page.evaluate(new Function('arg', `return (async () => { ${H} ${body} })();`), arg);
const quick = () => page.evaluate(() => document.getElementById('f-quick').innerText.replace(/\s+/g, ' '));
const extra = () => page.evaluate(() => { document.getElementById('f-extra').open = true; return document.getElementById('f-extra-body').innerText.replace(/\s+/g, ' '); });
const pickerOpen = () => page.evaluate(() => document.getElementById('ov-catpick')?.classList.contains('open'));

async function newForm(category) {
  await page.evaluate(async (category) => {
    const f = await import('/src/views/item-form.js');
    await f.openItemForm();
    if (category) (await import('/src/views/item-fields.js')).applySuggestedCategory(category);
  }, category);
  await page.waitForTimeout(300);
}
async function pick(fieldId, query) {
  await page.click(`#cf-${fieldId}`);
  await page.waitForSelector('#ov-catpick.open', { timeout: 5000 });
  if (query != null) { await page.fill('#catpick-search', query); await page.waitForTimeout(250); }
  await page.press('#catpick-search', 'Enter');
  await page.waitForTimeout(250);
}
async function save(name) {
  await page.fill('#f-name', name);
  await page.click('#save-item-btn');
  await page.waitForTimeout(700);
  return run('const all = await local.getAll("items"); return all.find((i) => i.name === arg && !i.deletedAt) || null;', name);
}

// ── 1. watches: Rolex → reference → the rest of the path ──────────────────
await newForm('jewellery_watches');
const q1 = await quick();
const t1 = await page.evaluate(() => document.getElementById('f-extra-title').textContent);
const brandHidden = await page.evaluate(() => document.getElementById('f-brand').closest('.frow').hidden);
check('W1 a watch shows Brand and Reference up front, a watch title, and no duplicate brand row',
  /البراند|الماركة/.test(q1) && q1.includes('المرجع') && t1.includes('الساعة') && brandHidden, `${q1} | ${t1} | ${brandHidden}`);
await page.click('#cf-watch_brand');
await page.waitForSelector('#ov-catpick.open');
await page.fill('#catpick-search', 'رولكس');
await page.waitForTimeout(250);
const firstHit = await page.evaluate(() => document.querySelector('#catpick-body .catpick-opt')?.dataset.id);
check('W2 «رولكس» ranks Rolex first', firstHit === 'watch_brand_rolex', firstHit);
await page.press('#catpick-search', 'Enter');
await page.waitForTimeout(250);
await pick('watch_reference', '126500');
const q1b = await quick();
const d1 = await extra();
check('W3 a reference fills its collection and model', d1.includes('Daytona') && q1b.includes('126500'), `${q1b} | ${d1.slice(0, 200)}`);
const watch = await save('ساعة دايتونا');
check('W4 saved with catalog ids and official labels, brand mirrored, searchable by reference',
  watch?.customFields?.watch_brand?.ref === 'watch_brand_rolex' && watch.brand === 'Rolex'
  && watch.catalogRefs?.includes('watch_brand_rolex') && watch.searchTokens?.some((t) => t.includes('126500')),
  JSON.stringify({ cf: watch?.customFields, brand: watch?.brand, refs: watch?.catalogRefs }));

// ── 2. Patek → Nautilus: the collection list is scoped to the brand ───────
await newForm('jewellery_watches');
await pick('watch_brand', 'Patek');
await page.click('#cf-watch_collection');
await page.waitForSelector('#ov-catpick.open');
await page.waitForTimeout(200);
const scoped = await page.evaluate(() => [...document.querySelectorAll('#catpick-body .catpick-opt')].map((b) => b.dataset.id));
check('W5 Patek Philippe → collections are only Patek collections, Nautilus among them',
  scoped.length > 0 && scoped.every((id) => id.startsWith('watch_col_patek')) && scoped.some((id) => id.includes('nautilus')), scoped.slice(0, 6).join(','));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ── 3. cascade: changing the brand drops a reference that no longer fits ──
await pick('watch_reference', '5711');
const before = await quick();
await pick('watch_brand', 'Omega');
const after = await quick();
const notice = await page.evaluate(() => document.getElementById('f-extra-body').innerText);
check('W6 a new brand clears the old brand\'s reference and says so',
  before.includes('5711') && !after.includes('5711') && /Omega|أوميغا/.test(after) && notice.includes('5711'), `${before} → ${after} | ${notice.slice(0, 120)}`);
await page.keyboard.press('Escape');

// ── 4. name only, brand only ──────────────────────────────────────────────
await newForm('jewellery_watches');
const bare = await save('ساعة بلا تفاصيل');
check('W7 a watch saves with its name alone', bare && Object.keys(bare.customFields || {}).length === 0, JSON.stringify(bare?.customFields));
await newForm('jewellery_watches');
await pick('watch_brand', 'Seiko');
const brandOnly = await save('سيكو فقط');
check('W8 brand only is enough', brandOnly?.customFields?.watch_brand?.ref === 'watch_brand_seiko' && !brandOnly.customFields.watch_reference, JSON.stringify(brandOnly?.customFields));

// ── 5. a custom brand and a one-off reference ─────────────────────────────
await newForm('jewellery_watches');
await page.click('#cf-watch_brand');
await page.waitForSelector('#ov-catpick.open');
await page.fill('#catpick-search', 'Maison Qasr');
await page.waitForTimeout(250);
await page.click('#catpick-add');
await page.waitForTimeout(150);
await page.click('#catpick-confirm'); // first press: duplicate check
await page.waitForTimeout(150);
await page.click('#catpick-confirm'); // second press: create
await page.waitForTimeout(400);
await page.click('#cf-watch_reference');
await page.waitForSelector('#ov-catpick.open');
await page.fill('#catpick-search', 'MQ-001');
await page.waitForTimeout(250);
await page.click('#catpick-add');
await page.waitForTimeout(150);
await page.click('#catpick-oneoff');
await page.waitForTimeout(300);
const custom = await save('ساعة قصر');
const customEntity = await run('return repository.catalogEntities().find((e) => e.nameEn === "Maison Qasr") || null;');
check('W9 a custom brand gets a stable cust_ id in the workspace; a one-off reference keeps its text',
  customEntity?.id?.startsWith('cust_') && customEntity.source === 'custom'
  && custom?.customFields?.watch_brand?.ref === customEntity.id
  && custom.customFields.watch_reference?.ref === null && custom.customFields.watch_reference?.label === 'MQ-001',
  JSON.stringify({ e: customEntity, cf: custom?.customFields }));
const found = await run('const r = await catalogService.search({ domain: "watch", entityType: "brand", query: "qasr" }); return r.items.map((i) => i.entity.id);');
check('W10 the custom brand is searchable next to the built-in ones', found[0] === customEntity?.id, found.join(','));
const dup = await run('return catalogService.findDuplicates({ domain: "watch", entityType: "brand", label: "rolex" });');
check('W11 adding «rolex» finds the existing Rolex instead of a second one', dup?.exact?.id === 'watch_brand_rolex', JSON.stringify(dup?.exact?.id));
const retire = await run('return catalogService.retireCustom(arg);', customEntity?.id);
check('W12 a custom entry in use is not retired silently', retire?.inUse >= 1, JSON.stringify(retire));

// ── 6. vehicles: Toyota → Land Cruiser → year ─────────────────────────────
await newForm('vehicles_cars');
await pick('vehicle_manufacturer', 'تويوتا');
await pick('vehicle_model', 'Land Cruiser');
await page.evaluate(() => { document.getElementById('f-extra').open = true; });
await page.click('#cf-manufacture_year');
await page.waitForSelector('#ov-catpick.open');
await page.fill('#catpick-search', '2019');
await page.waitForTimeout(200);
await page.press('#catpick-search', 'Enter');
await page.waitForTimeout(250);
const carForm = await quick();
const car = await save('لاندكروزر');
check('W13 Toyota → Land Cruiser → 2019',
  car?.customFields?.vehicle_manufacturer?.ref === 'vehicle_make_toyota'
  && car.customFields.vehicle_model?.ref?.startsWith('vehicle_model_toyota_land') && car.customFields.manufacture_year === 2019,
  JSON.stringify(car?.customFields) + ' | ' + carForm + ' | ' + JSON.stringify(car && { n: car.name }));
const carDetail = await run('const item = await repository.getItem(arg, { fresh: true }); if (!item) return []; const rows = fieldRows(item, repository.taxonomy()); return rows.current.map((r) => r.label + "=" + r.text);', car?.id);
check('W14 the detail shows only filled rows', carDetail.length === 3 && carDetail.every((r) => !/=\s*$/.test(r)), carDetail.join(' | '));

// ── 7. machinery, forklift, crane, lab, gems, art ─────────────────────────
await newForm('equipment_heavy');
await pick('machinery_manufacturer', 'كاتربيلر');
const machine = await save('حفار كاتربيلر');
check('W15 heavy equipment: Caterpillar by its Arabic name', machine?.customFields?.machinery_manufacturer?.ref === 'mfr_caterpillar', JSON.stringify(machine?.customFields));
const liftFields = await run('return repository.taxonomy().fieldsFor({ categoryId: "vehicles_forklifts" }).map((f) => f.id);');
const craneFields = await run('return repository.taxonomy().fieldsFor({ categoryId: "vehicles_cranes" }).map((f) => f.id);');
check('W16 forklift and crane templates carry their own fields',
  liftFields.some((id) => id.startsWith('forklift_')) && craneFields.some((id) => id.startsWith('crane_')), `${liftFields.slice(0, 5)} | ${craneFields.slice(0, 5)}`);
await newForm('professional_lab');
await pick('lab_model', 'i50');
const labQuick = await quick();
const labDetail = await extra();
const lab = await save('مطياف');
check('W17 lab: «i50» finds Nicolet iS50 and fills Thermo Fisher and the family',
  lab?.customFields?.lab_model?.ref?.includes('is50') && lab.customFields.lab_manufacturer?.ref?.includes('thermo') && lab.customFields.lab_family?.ref,
  `${labQuick} | ${labDetail.slice(0, 150)} | ${JSON.stringify(lab?.customFields)}`);
const gem = await run(`
  const { fieldApplies } = await import('/src/taxonomy.js');
  const fields = repository.taxonomy().fieldsFor({ categoryId: 'jewellery_gems' });
  const ids = new Set(fields.map((f) => f.id));
  const gated = fields.filter((f) => f.showWhen?.refIn?.includes('gem_diamond'));
  const shows = (ref) => gated.filter((f) => fieldApplies(f, { templateIds: ids, values: { gem_type: { ref, label: ref } } })).length;
  return { gated: gated.length, diamond: shows('gem_diamond'), sapphire: shows('gem_sapphire'), lab: ids.has('gem_laboratory') };`);
check('W18 gemstones: diamond grades only for a diamond; a lab picker', gem.gated > 0 && gem.diamond === gem.gated && gem.sapphire === 0 && gem.lab, JSON.stringify(gem));
const art = await run(`
  const r = await catalogService.createCustom({ domain: 'art', entityType: 'artist', label: 'فنان محلي' });
  const again = await catalogService.createCustom({ domain: 'art', entityType: 'artist', label: 'فنان محلي' });
  return { id: r.entity?.id, dup: again.duplicate?.id, nameAr: r.entity?.nameAr };`);
check('W19 a custom artist is stored in Arabic as typed, and a second one is recognised as a duplicate',
  art.id?.startsWith('cust_') && art.dup === art.id && art.nameAr === 'فنان محلي', JSON.stringify(art));

// ── 8. Save & Add Next ────────────────────────────────────────────────────
const setup = await run(`
  const folder = await repository.saveFolder({ name: 'خزنة الساعات', icon: '🗂', color: '#2563FF' });
  const location = await repository.saveLocation({ name: 'غرفة 1' });
  return { folderId: folder.id, locationId: location.id };`);
await newForm('jewellery_watches');
await pick('watch_brand', 'Rolex');
await page.selectOption('#f-folder', setup.folderId);
await page.selectOption('#f-loc', setup.locationId);
await page.fill('#f-serial', 'SER-001');
await page.fill('#f-barcode', '6281234567890');
await page.fill('#f-name', 'رولكس 1');
await page.click('#save-next-btn');
await page.waitForTimeout(900);
const nextState = await page.evaluate(() => ({
  open: document.getElementById('ov-add')?.classList.contains('open') ?? null,
  name: document.getElementById('f-name').value,
  serial: document.getElementById('f-serial').value,
  barcode: document.getElementById('f-barcode').value,
  folder: document.getElementById('f-folder').value,
  loc: document.getElementById('f-loc').value,
  lastChip: Boolean(document.getElementById('f-use-last')),
  focused: document.activeElement?.id,
}));
check('W20 Save & Add Next keeps folder and location, clears name, serial and barcode',
  nextState.name === '' && nextState.serial === '' && nextState.barcode === ''
  && nextState.folder === setup.folderId && nextState.loc === setup.locationId && nextState.focused === 'f-name', JSON.stringify(nextState));
const firstSaved = await run('const all = await local.getAll("items"); return all.find((i) => i.name === "رولكس 1") || null;');
check('W21 the first record was saved in full', firstSaved?.serialNumber === 'SER-001' && firstSaved.customFields?.watch_brand?.ref === 'watch_brand_rolex', JSON.stringify(firstSaved?.customFields));
await page.evaluate(async () => (await import('/src/views/item-fields.js')).applySuggestedCategory('jewellery_watches'));
await page.waitForTimeout(250);
const chip = await page.$('#f-use-last');
if (chip) { await chip.click(); await page.waitForTimeout(250); }
const reused = await quick();
check('W22 «Use last selection» brings back the brand for the same category', Boolean(chip) && /Rolex|رولكس/.test(reused), reused);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ── 9. category change keeps what was entered; unknown ids fall back ──────
const moved = await run(`
  const item = await repository.getItem(arg, { fresh: true });
  const next = await repository.updateItem(item.id, { ...item, categoryId: 'art_paintings', mainCategoryId: null, subcategoryId: null });
  const fresh = await repository.getItem(item.id, { fresh: true });
  const rows = fieldRows(fresh, repository.taxonomy());
  return { kept: Boolean(fresh.customFields.watch_brand), previous: rows.previous.map((r) => r.label + '=' + r.text) };`, watch?.id);
check('W23 moving a watch to Paintings keeps its values under previous fields', moved.kept && moved.previous.some((r) => /Rolex|رولكس/.test(r)), JSON.stringify(moved));
const ghost = await run(`
  const rows = fieldRows({ categoryId: 'jewellery_watches', customFields: { watch_brand: { ref: 'watch_brand_retired_house', label: 'Old House' } } }, repository.taxonomy());
  return rows.current.map((r) => r.text);`);
check('W24 an id the catalog no longer knows shows its saved label', ghost.includes('Old House'), ghost.join(','));

// ── 10. Full Backup round trip with a custom brand ────────────────────────
const round = await run(`
  const h = await import('/tests/browser/backup-helpers.mjs');
  const { file } = await h.backupToFile();
  await local.remove('catalogEntities', arg.id);
  await h.restoreFile(file);
  const back = (await local.getAll('catalogEntities')).find((e) => e.id === arg.id);
  const item = await repository.getItem(arg.itemId, { fresh: true });
  const rows = fieldRows(item, repository.taxonomy());
  return { back: back?.nameEn, label: rows.current.find((r) => r.text.includes('Maison'))?.text };`,
  { id: customEntity?.id, itemId: custom?.id });
check('W25 a Full Backup carries custom catalog entries and a restore brings them back before items',
  round.back === 'Maison Qasr' && round.label?.includes('Maison Qasr'), JSON.stringify(round));

// ── 11. speed, network, errors ────────────────────────────────────────────
const speed = await run(`
  const queries = ['ro', 'rolex', 'رولكس', '126500', 'omega speed', 'cat', '320', 'land', 'apple', 'thermo'];
  const t0 = performance.now();
  for (let i = 0; i < 5; i += 1) for (const q of queries) {
    await catalogService.search({ domain: 'watch', entityType: 'brand', query: q, limit: 30 });
    await catalogService.search({ domain: 'watch', entityType: 'reference', query: q, limit: 30 });
  }
  return (performance.now() - t0) / 100;`);
check('W26 a picker search takes well under the 80 ms debounce', speed < 30, `${speed.toFixed(2)} ms/search`);
check('W27 no request leaves the device', outside.length === 0, outside.slice(0, 3).join(' | '));
check('W28 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 400));

await context.close();
await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach((f) => console.log('  ✗', f)); process.exit(1); }
