// Browser test: Arabic and English, switched at run time.
//
//   LANGUAGE IS A PRESENTATION LAYER. IT MUST NEVER CHANGE THE MEANING OR
//   IDENTITY OF THE CUSTOMER'S DATA.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/i18n.test.mjs
//
// Covers: the default and its persistence, lang/dir, no Arabic left on the
// main screens in English, what a switch must not lose (form, import mapping,
// search, selection, open detail), one error code with a message in each
// language, and the layout at phone, tablet and desktop widths in both
// directions.

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
const ARABIC = /[؀-ۿ]/;

async function newContext(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  await context.route('**/src/subscription.js', (r) => r.fulfill({ contentType: 'text/javascript', body: planStub({ planId: 'business' }) }));
  return context;
}

async function openPage(context) {
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if ((m.type() === 'error' || (m.type() === 'warning' && /\[i18n\]/.test(m.text()))) && !QUIET.test(m.text())) errs.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  return { page, errs };
}

const setLanguage = (page, lang) => page.evaluate(async (lang) => (await import('/src/i18n.js')).setLanguage(lang), lang);
const docLocale = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));

/** Arabic in visible text, ignoring customer text (dir="auto") and brand marks. */
const visibleArabic = (page, rootSelector) => page.evaluate(({ rootSelector, source }) => {
  const arabic = new RegExp(source);
  const root = document.querySelector(rootSelector);
  if (!root) return ['<no root>'];
  const found = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (!text || !arabic.test(text)) continue;
    const host = node.parentElement;
    if (!host || host.closest('[dir="auto"], [lang="ar"], svg, .gate-brand, [aria-hidden="true"]')) continue;
    const style = getComputedStyle(host);
    if (style.display === 'none' || style.visibility === 'hidden' || host.offsetParent === null) continue;
    found.push(text.slice(0, 60));
  }
  // Labels a screen reader reads count too.
  for (const node of root.querySelectorAll('[aria-label], [placeholder], [title]')) {
    if (node.closest('[dir="auto"], [aria-hidden="true"]') || node.offsetParent === null) continue;
    for (const attr of ['aria-label', 'placeholder', 'title']) {
      const value = node.getAttribute(attr);
      if (value && arabic.test(value)) found.push(`${attr}=${value.slice(0, 50)}`);
    }
  }
  return found;
}, { rootSelector, source: ARABIC.source });

const seed = (page) => page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  const made = [];
  for (const [name, sku] of [['Pocket watch', 'W-1'], ['Oil painting', 'P-1'], ['Brass lamp', 'L-1']]) {
    made.push(await repository.createItem({ name, sku, quantity: 1, categoryId: 'art_paintings', locationId: 'l1', condition: 'ممتازة' }));
  }
  return made.map((item) => item.id);
});

// ── default, persistence, lang/dir (§117) ─────────────────────────────────
const context = await newContext();
let { page, errs } = await openPage(context);
{
  const first = await docLocale(page);
  check('I1 Arabic is the default and right to left', first.lang === 'ar' && first.dir === 'rtl', JSON.stringify(first));

  await setLanguage(page, 'en');
  const english = await docLocale(page);
  check('I2 switching sets lang="en" dir="ltr" at run time', english.lang === 'en' && english.dir === 'ltr', JSON.stringify(english));
  const title = await page.title();
  check('I3 the document title follows the language', !ARABIC.test(title), title);

  // Every launch now starts at the language gate (language-gate.test.mjs
  // covers it); what a reload keeps is the stored choice the gate highlights.
  const stored = await page.evaluate(() => localStorage.getItem('nazm.language'));
  check('I4 the choice is stored for the next launch', stored === 'en', String(stored));
}

// ── no Arabic left on the main screens in English (§118) ─────────────────
const ids = await seed(page);
{
  const screens = [
    ['home', '#v-home'], ['ov', '#v-ov'], ['ai', '#v-ai'], ['set', '#v-set'],
  ];
  for (const [tab, selector] of screens) {
    await page.evaluate(async (tab) => (await import('/src/navigation.js')).goTab(tab), tab);
    await page.waitForTimeout(350);
    const leaks = await visibleArabic(page, selector);
    check(`I5 no Arabic on the ${tab} screen in English`, leaks.length === 0, leaks.slice(0, 6).join(' | '));
  }
  const nav = await visibleArabic(page, '.tbar');
  check('I6 no Arabic in the navigation in English', nav.length === 0, nav.join(' | '));

  // Sheets people open most.
  await page.evaluate(async () => (await import('/src/navigation.js')).goTab('home'));
  await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({}));
  await page.waitForTimeout(400);
  const form = await visibleArabic(page, '#sh-add');
  check('I7 the add-item form has no Arabic in English', form.length === 0, form.slice(0, 6).join(' | '));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('add'));

  await page.evaluate(async (id) => (await import('/src/views/detail.js')).openDetail(id), ids[0]);
  await page.waitForTimeout(400);
  const detail = await visibleArabic(page, '#sh-det');
  check('I8 the item detail has no Arabic in English (customer data aside)', detail.length === 0, detail.slice(0, 6).join(' | '));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('det'));

  await page.evaluate(async () => (await import('/src/views/plans.js')).openPlansSheet());
  await page.waitForTimeout(300);
  const plans = await visibleArabic(page, '#sh-plans');
  const prices = await page.evaluate(() => [...document.querySelectorAll('#sh-plans .plan-amount')].map((n) => n.textContent));
  check('I9 the plans sheet has no Arabic in English', plans.length === 0, plans.slice(0, 6).join(' | '));
  check('I10 prices are unchanged in English (69 / 159 / 279)', JSON.stringify(prices) === JSON.stringify(['69', '159', '279']), JSON.stringify(prices));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('plans'));
}

// ── a switch loses nothing (§119–§121) ───────────────────────────────────
{
  // Form in progress.
  await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({}));
  await page.waitForTimeout(300);
  await page.fill('#f-name', 'Silver tray');
  await page.fill('#f-sku', 'T-77');
  await page.fill('#f-qty', '4');
  await page.selectOption('#f-cond', { index: 2 });
  const condBefore = await page.$eval('#f-cond', (s) => s.value);
  await setLanguage(page, 'ar');
  await page.waitForTimeout(200);
  const kept = await page.evaluate(() => ({
    name: document.getElementById('f-name').value, sku: document.getElementById('f-sku').value,
    qty: document.getElementById('f-qty').value, cond: document.getElementById('f-cond').value,
    open: document.getElementById('sh-add').classList.contains('open'),
  }));
  check('I11 a half-filled form survives a switch, values and selects intact',
    kept.open && kept.name === 'Silver tray' && kept.sku === 'T-77' && kept.qty === '4' && kept.cond === condBefore, JSON.stringify(kept));
  const condLabel = await page.$eval('#f-cond', (s) => s.options[s.selectedIndex].textContent);
  check('I12 the selected condition is relabelled, its stored value unchanged', ARABIC.test(condLabel), condLabel);
  await setLanguage(page, 'en');
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('add'));
  await page.waitForTimeout(200);

  // Search.
  await page.fill('#hsearch', 'watch');
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => document.querySelectorAll('#hgrid .icard, #hlist .litem, .icard, .litem').length);
  await setLanguage(page, 'ar');
  await page.waitForTimeout(400);
  const search = await page.evaluate(() => ({
    value: document.getElementById('hsearch').value,
    shown: document.querySelectorAll('.icard, .litem').length,
  }));
  check('I13 the search text and its results survive a switch', search.value === 'watch' && search.shown === before && before >= 1, JSON.stringify({ ...search, before }));
  await page.evaluate(async () => (await import('/src/views/home.js')).clearSearch());
  await page.waitForTimeout(300);

  // Selection.
  await page.evaluate(async (ids) => {
    const home = await import('/src/views/home.js');
    home.startSelection(ids[0]);
  }, ids);
  await page.waitForTimeout(300);
  await setLanguage(page, 'en');
  await page.waitForTimeout(300);
  const selection = await page.evaluate(async () => {
    const home = await import('/src/views/home.js');
    return { selecting: home.isSelecting(), picked: document.querySelectorAll('.picked').length };
  });
  check('I14 a selection survives a switch', selection.selecting && selection.picked === 1, JSON.stringify(selection));
  await page.evaluate(async () => (await import('/src/views/home.js')).endSelection());

  // Open detail.
  await page.evaluate(async (id) => (await import('/src/views/detail.js')).openDetail(id), ids[1]);
  await page.waitForTimeout(400);
  await setLanguage(page, 'ar');
  await page.waitForTimeout(300);
  const detail = await page.evaluate(() => ({
    open: document.getElementById('sh-det').classList.contains('open'),
    text: document.getElementById('sh-det').innerText,
  }));
  check('I15 an open detail stays open on the same item after a switch', detail.open && detail.text.includes('Oil painting') && detail.text.includes('P-1'), detail.text.slice(0, 80));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('det'));
  await setLanguage(page, 'en');

  // Import in progress: the mapping step.
  await page.evaluate(async () => {
    const csv = 'Item name,SKU,Qty,Condition\nCopper jug,J-1,2,Good\nOld map,M-9,1,Fair\n';
    const file = new File([csv], 'stock.csv', { type: 'text/csv' });
    await (await import('/src/views/sheet-import.js')).openSpreadsheetImport(file);
  });
  await page.waitForTimeout(700);
  const mapBefore = await page.evaluate(async () => (await import('/src/views/sheet-import.js')).__mappingForTest());
  const enLabels = await visibleArabic(page, '#sh-simport');
  check('I16 the import mapping screen has no Arabic in English', enLabels.length === 0, enLabels.slice(0, 6).join(' | '));
  check('I17 English headers are recognised (Item name → name, SKU → sku, Qty → quantity)',
    mapBefore.name === 0 && mapBefore.sku === 1 && mapBefore.quantity === 2, JSON.stringify(mapBefore));
  await setLanguage(page, 'ar');
  await page.waitForTimeout(300);
  const mapAfter = await page.evaluate(async () => (await import('/src/views/sheet-import.js')).__mappingForTest());
  const importOpen = await page.evaluate(() => document.getElementById('sh-simport').classList.contains('open'));
  check('I18 the import stays open with the same mapping after a switch',
    importOpen && JSON.stringify(mapAfter) === JSON.stringify(mapBefore), JSON.stringify(mapAfter));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('simport'));
  await setLanguage(page, 'en');
}

// ── one code, two messages (§122) ────────────────────────────────────────
{
  const attempt = () => page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { describeError } = await import('/src/utils.js');
    try {
      await repository.createItem({ name: 'Another watch', sku: 'W-1', quantity: 1 });
      return { code: null };
    } catch (error) {
      return { code: error.code, message: describeError(error) };
    }
  });
  const en = await attempt();
  await setLanguage(page, 'ar');
  const ar = await attempt();
  check('I19 a SKU conflict is the same code in both languages', en.code === 'repo/sku-conflict' && ar.code === 'repo/sku-conflict', JSON.stringify({ en: en.code, ar: ar.code }));
  check('I20 …with the English message in English', en.message === 'This SKU is already used by another item.', en.message);
  check('I21 …and the Arabic message in Arabic', ar.message === 'الرمز SKU مستخدم على قطعة أخرى.', ar.message);
}

// ── data identity (§123) ──────────────────────────────────────────────────
{
  const stored = await page.evaluate(async (id) => {
    const local = await import('/src/local-store.js');
    const row = await local.get('items', id);
    return { name: row.name, condition: row.condition, categoryId: row.categoryId };
  }, ids[0]);
  check('I22 switching language changes nothing stored', stored.name === 'Pocket watch' && stored.condition === 'ممتازة' && stored.categoryId === 'art_paintings', JSON.stringify(stored));

  const activity = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.state.activity.slice(0, 5).map((entry) => Object.values(entry).filter((v) => typeof v === 'string').join(' '));
  });
  check('I23 activity entries hold codes and facts, not sentences', activity.every((line) => !/قطعة من|items from/.test(line)), activity.join(' | ').slice(0, 160));
}

// ── Settings control and gate switcher are accessible radio groups (§124) ─
{
  await page.evaluate(async () => (await import('/src/navigation.js')).goTab('set'));
  await page.waitForTimeout(300);
  const group = await page.evaluate(() => {
    const g = document.querySelector('#language-panel [role="radiogroup"]');
    const radios = [...(g?.querySelectorAll('[role="radio"]') || [])];
    return {
      labelled: Boolean(g?.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby'))),
      radios: radios.map((r) => ({ lang: r.getAttribute('lang'), checked: r.getAttribute('aria-checked'), tab: r.tabIndex })),
    };
  });
  const checked = group.radios.filter((r) => r.checked === 'true');
  check('I24 Settings has a labelled radio group with exactly one checked option', group.labelled && group.radios.length === 2 && checked.length === 1 && checked[0].lang === 'ar', JSON.stringify(group));
  await page.focus('#language-panel [role="radio"][aria-checked="true"]');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  const byKeyboard = await docLocale(page);
  check('I25 the arrow keys change the language from the radio group', byKeyboard.lang === 'en', JSON.stringify(byKeyboard));
  await page.click('#language-panel [lang="ar"]');
  await page.waitForTimeout(300);
  check('I26 clicking an option switches back', (await docLocale(page)).lang === 'ar');
}

check('I27 no page errors and no missing-translation warnings', errs.length === 0, errs.slice(0, 5).join(' | '));
await context.close();

// ── the gate: a visitor can find English on their own (§125) ─────────────
{
  const gateContext = await newContext();
  const { page: gatePage, errs: gateErrs } = await openPage(gateContext);
  await gatePage.evaluate(async () => (await import('/src/views/welcome.js')).openGate({}));
  await gatePage.waitForTimeout(300);
  await gatePage.evaluate(() => [...document.querySelectorAll('#gate-panel button')].find((b) => /تسجيل الدخول/.test(b.textContent))?.click());
  await gatePage.waitForTimeout(200);
  await gatePage.fill('#gate-email', 'someone@example.com');
  const switcher = await gatePage.evaluate(() => ({
    group: document.querySelector('#gate-lang')?.getAttribute('role'),
    options: [...document.querySelectorAll('#gate-lang [role="radio"]')].map((b) => b.textContent),
  }));
  check('I28 the gate shows a language switch', switcher.group === 'radiogroup' && switcher.options.includes('English'), JSON.stringify(switcher));
  await gatePage.click('#gate-lang [lang="en"]');
  await gatePage.waitForTimeout(300);
  const gate = await gatePage.evaluate(() => ({
    email: document.getElementById('gate-email')?.value,
    screen: document.getElementById('gate-panel').dataset.screen,
    dir: document.documentElement.dir,
  }));
  const gateLeaks = await visibleArabic(gatePage, '#gate');
  check('I29 the gate switches in place: same screen, typed email kept', gate.email === 'someone@example.com' && gate.screen === 'signin' && gate.dir === 'ltr', JSON.stringify(gate));
  check('I30 the gate has no Arabic in English', gateLeaks.length === 0, gateLeaks.slice(0, 6).join(' | '));
  check('I31 no errors on the gate', gateErrs.length === 0, gateErrs.slice(0, 3).join(' | '));
  await gateContext.close();
}

// ── layout in both directions at every width (§125) ──────────────────────
for (const [label, viewport] of [
  ['320', { width: 320, height: 640 }], ['390', { width: 390, height: 844 }], ['430', { width: 430, height: 932 }],
  ['tablet', { width: 820, height: 1180 }], ['desktop', { width: 1440, height: 900 }],
]) {
  const ctx = await newContext(viewport);
  const { page: p, errs: e } = await openPage(ctx);
  await seed(p);
  for (const lang of ['ar', 'en']) {
    await setLanguage(p, lang);
    for (const tab of ['home', 'set', 'ov']) {
      await p.evaluate(async (tab) => (await import('/src/navigation.js')).goTab(tab), tab);
      await p.waitForTimeout(250);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) check(`I32 ${label} ${lang} ${tab}: no horizontal overflow`, false, `${overflow}px`);
    }
  }
  check(`I32 ${label}: both directions render without horizontal overflow or errors`, e.length === 0, e.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
for (const line of pass) console.log(`  ✓ ${line}`);
for (const line of fail) console.log(`  ✗ ${line}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
