// Browser test: the language gate, and three things a language switch must
// not do — lose a filter draft, leave an open confirmation in the old
// language, or lay customer text out in the interface's direction.
//
//   THE CUSTOMER CHOOSES THE LANGUAGE BEFORE ENTERING NAZM.
//   CHANGING PRESENTATION MUST NEVER CHANGE OR DESTROY APPLICATION STATE.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/language-gate.test.mjs

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

async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  await ctx.route('**/src/subscription.js', (r) => r.fulfill({ contentType: 'text/javascript', body: planStub({ planId: 'business' }) }));
  return ctx;
}

function watchErrors(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if ((m.type() === 'error' || /\[i18n\]/.test(m.text())) && !QUIET.test(m.text())) errs.push(`${m.type()}: ${m.text()}`);
  });
  return errs;
}

const ready = (page) => page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
const locale = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
const setLanguage = (page, lang) => page.evaluate(async (lang) => (await import('/src/i18n.js')).setLanguage(lang), lang);

/** What the first frames look like: the gate, and nothing of the app. */
const gateState = (page) => page.evaluate(() => {
  const gate = document.getElementById('lang-gate');
  const visible = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return false;
    const style = getComputedStyle(node);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };
  return {
    gate: Boolean(gate) && visible('#lang-gate'),
    pending: document.documentElement.classList.contains('lang-pending'),
    ready: document.body.classList.contains('ready'),
    app: visible('.app'), nav: visible('.tbar'), welcome: visible('#gate'), boot: visible('#boot'),
    title: document.title,
    previous: document.querySelector('.lg-option.is-previous')?.dataset.language || null,
  };
});

// ── the gate on a fresh launch (§60) ─────────────────────────────────────
{
  const ctx = await context({ languageGate: 'show' });
  const page = await ctx.newPage();
  const errs = watchErrors(page);

  // The very first frame, before any script has run.
  await page.route('**/src/boot-guard.js', async (route) => { await new Promise((r) => setTimeout(r, 400)); await route.continue(); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'commit' });
  await page.waitForSelector('#lang-gate', { state: 'attached' });
  const first = await gateState(page);
  check('LG1 the first frame is the language gate, with nothing of the app drawn under it',
    first.gate && first.pending && !first.app && !first.nav && !first.welcome && !first.boot, JSON.stringify(first));
  await page.waitForLoadState('load');
  await page.unroute('**/src/boot-guard.js');
  await page.waitForTimeout(1500);

  const waiting = await gateState(page);
  check('LG2 the app waits at the gate: not ready, nothing revealed', waiting.gate && !waiting.ready && !waiting.app, JSON.stringify(waiting));
  check('LG3 before a choice the title is the neutral brand', waiting.title === 'NAZM | نَظْم', waiting.title);

  const structure = await page.evaluate(() => ({
    heading: document.querySelector('#lang-gate h1')?.innerText.replace(/\n/g, ' / '),
    labelled: document.getElementById('lang-gate').getAttribute('aria-labelledby') === 'lg-title',
    buttons: [...document.querySelectorAll('#lang-gate .lg-option')].map((b) => ({
      tag: b.tagName, type: b.getAttribute('type'), lang: b.getAttribute('lang'), dir: b.getAttribute('dir'),
      name: b.querySelector('.lg-option-name').textContent, height: b.getBoundingClientRect().height,
    })),
    decorative: document.querySelector('#lang-gate svg')?.getAttribute('aria-hidden'),
    flags: /[\u{1F1E6}-\u{1F1FF}]/u.test(document.getElementById('lang-gate').textContent),
  }));
  check('LG4 a heading names the choice in both languages',
    /Choose your language/.test(structure.heading) && /اختر اللغة/.test(structure.heading) && structure.labelled, structure.heading);
  check('LG5 two real buttons, each in its own language and direction, no flags',
    structure.buttons.length === 2
    && structure.buttons[0].tag === 'BUTTON' && structure.buttons[0].type === 'button'
    && structure.buttons[0].name === 'العربية' && structure.buttons[0].lang === 'ar' && structure.buttons[0].dir === 'rtl'
    && structure.buttons[1].name === 'English' && structure.buttons[1].lang === 'en' && structure.buttons[1].dir === 'ltr'
    && structure.buttons.every((b) => b.height >= 44) && !structure.flags && structure.decorative === 'true',
    JSON.stringify(structure));

  // Keyboard: the first Tab reaches a language, Space chooses it.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    language: document.activeElement?.dataset.language,
    ring: getComputedStyle(document.activeElement).outlineStyle,
  }));
  check('LG6 the first Tab reaches a language option, with a visible focus ring',
    focused.language === 'ar' && focused.ring !== 'none', JSON.stringify(focused));
  await page.keyboard.press('Space');
  await ready(page);
  const arabic = { ...(await locale(page)), gate: await page.evaluate(() => Boolean(document.getElementById('lang-gate'))) };
  check('LG7 choosing Arabic enters an Arabic right-to-left app', arabic.lang === 'ar' && arabic.dir === 'rtl' && !arabic.gate, JSON.stringify(arabic));
  const inside = await page.evaluate(() => ({
    title: document.title, stored: localStorage.getItem('nazm.language'),
    home: document.getElementById('v-home')?.classList.contains('active') || getComputedStyle(document.getElementById('v-home')).display !== 'none',
  }));
  check('LG8 …with its title, its stored choice (nazm.language), and the home screen',
    inside.title === 'نَظْم — الجرد الذكي للمقتنيات والأصول' && inside.stored === 'ar' && inside.home, JSON.stringify(inside));

  // Moving around never brings the gate back (§56).
  for (const tab of ['set', 'ov', 'home']) {
    await page.evaluate(async (tab) => (await import('/src/navigation.js')).goTab(tab), tab);
    await page.waitForTimeout(150);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
  await setLanguage(page, 'en');
  await page.waitForTimeout(200);
  const settled = await page.evaluate(() => ({
    gate: Boolean(document.getElementById('lang-gate')),
    pending: document.documentElement.classList.contains('lang-pending'),
    lang: document.documentElement.lang, dir: document.documentElement.dir,
  }));
  check('LG9 navigating, resizing and switching in Settings never reopen the gate (§56, §63)',
    !settled.gate && !settled.pending && settled.lang === 'en' && settled.dir === 'ltr', JSON.stringify(settled));
  await page.setViewportSize({ width: 390, height: 844 });

  // A reload is a fresh launch: the gate again, the last choice highlighted,
  // and nothing entered until the customer chooses.
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const again = await gateState(page);
  check('LG10 a reload opens the gate again, highlighting the last choice, and waits',
    again.gate && !again.ready && again.previous === 'en', JSON.stringify(again));
  const described = await page.evaluate(() => {
    const button = document.querySelector('.lg-option[data-language="en"]');
    const id = button.getAttribute('aria-describedby');
    return { id, text: id ? document.getElementById(id)?.textContent : null };
  });
  check('LG11 the highlighted choice says so to a screen reader too', described.text === 'Your previous choice', JSON.stringify(described));
  await page.click('.lg-option[data-language="en"]');
  await ready(page);
  const english = await page.evaluate(() => ({
    lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title,
    nav: document.querySelector('.tbar')?.innerText.replace(/\n/g, ' ').slice(0, 60),
  }));
  check('LG12 choosing English enters an English left-to-right app',
    english.lang === 'en' && english.dir === 'ltr' && english.title === 'NAZM — Smart Inventory for Collections and Assets' && !/[؀-ۿ]/.test(english.nav),
    JSON.stringify(english));

  // Data is untouched by the gate (§12).
  const kept = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const made = await repository.createItem({ name: 'Survives a relaunch', quantity: 1 });
    return made.id;
  });
  await page.reload({ waitUntil: 'load' });
  await page.click('.lg-option[data-language="ar"]');
  await ready(page);
  const survived = await page.evaluate(async (id) => {
    const local = await import('/src/local-store.js');
    return (await local.get('items', id))?.name || null;
  }, kept);
  check('LG13 the gate is presentation only: the inventory is there after a relaunch', survived === 'Survives a relaunch', String(survived));
  check('LG14 no errors across launches and choices', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();
}

// ── a new visitor on the cloud build: gate first, then the welcome (§62) ──
{
  const ctx = await context({ languageGate: 'show' });
  // The real firebase.js, told it is connected, with nobody signed in.
  await ctx.route('**/src/firebase.js', async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace('export function initializeFirebase() {', `export function initializeFirebase() {
  context = { ...context, status: FirebaseStatus.READY, auth: {}, sdk: { auth: { onAuthStateChanged: (_a, callback) => setTimeout(() => callback(null), 0) } } };
  return Promise.resolve(context);
}
function __realInitializeFirebase() {`);
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const before = await gateState(page);
  check('LG15 a new visitor sees the language gate before the welcome screen', before.gate && !before.welcome && !before.ready, JSON.stringify(before));
  await page.click('.lg-option[data-language="en"]');
  await ready(page);
  await page.waitForTimeout(400);
  const welcome = await page.evaluate(() => ({
    open: document.getElementById('gate')?.classList.contains('open'),
    text: document.getElementById('gate-panel')?.innerText.replace(/\n/g, ' / ').slice(0, 160),
    dir: document.documentElement.dir,
  }));
  check('LG16 …then the welcome screen, already in English and left to right',
    welcome.open && /Start free/.test(welcome.text) && /Sign in/.test(welcome.text) && welcome.dir === 'ltr', JSON.stringify(welcome));
  await ctx.close();
}

// ── the gate in both themes and at every width (§17, §18) ───────────────
{
  const colours = {};
  for (const scheme of ['light', 'dark']) {
    const ctx = await context({ languageGate: 'show', colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    colours[scheme] = await page.evaluate(() => ({
      text: getComputedStyle(document.querySelector('.lg-option')).color,
      background: getComputedStyle(document.getElementById('lang-gate')).backgroundImage,
    }));
    await ctx.close();
  }
  check('LG17 the gate follows light and dark from the theme tokens',
    colours.light.text !== colours.dark.text && colours.light.background !== colours.dark.background, JSON.stringify(colours));

  for (const [label, viewport] of [
    ['320', { width: 320, height: 568 }], ['375', { width: 375, height: 667 }], ['390', { width: 390, height: 844 }],
    ['430', { width: 430, height: 932 }], ['tablet', { width: 820, height: 1180 }], ['desktop', { width: 1440, height: 900 }],
  ]) {
    const ctx = await context({ languageGate: 'show', viewport });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    const box = await page.evaluate(() => {
      const panel = document.querySelector('.lg-panel').getBoundingClientRect();
      const options = [...document.querySelectorAll('.lg-option')].map((b) => b.getBoundingClientRect());
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panel: Math.round(panel.width),
        inside: options.every((r) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight),
      };
    });
    check(`LG18 ${label}: no overflow, options on screen, panel at most 440px wide`,
      box.overflow <= 1 && box.inside && box.panel <= 440, JSON.stringify(box));
    await ctx.close();
  }
}

// ── the filter draft survives a switch, and is not applied (§31, §64) ────
{
  const ctx = await context();
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.saveLocation({ name: 'الرياض' });
    await repository.createItem({ name: 'Watch', quantity: 1, locationId: 'riyadh', condition: 'ممتازة', valuation: { min: 100, max: 100, currency: 'USD' } });
    await repository.createItem({ name: 'Lamp', quantity: 1, valuation: { min: 50, max: 50, currency: 'SAR' } });
  });
  const locationId = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.state.locations.find((l) => l.name === 'الرياض')?.id || null;
  });
  await page.evaluate(async () => (await import('/src/views/home.js')).openFilterSheet());
  await page.waitForTimeout(500);
  await page.selectOption('#fp-loc', locationId);
  await page.selectOption('#fp-cond', 'ممتازة');
  await page.selectOption('#fp-currency', 'USD');
  const before = await page.evaluate(async () => {
    const home = await import('/src/views/home.js');
    return { applied: JSON.stringify(home.view.filters), page: home.view.page, badge: document.getElementById('filter-badge').textContent };
  });

  const snapshot = () => page.evaluate(async () => {
    const home = await import('/src/views/home.js');
    return {
      open: document.getElementById('sh-filter').classList.contains('open'),
      loc: document.getElementById('fp-loc').value,
      locText: document.getElementById('fp-loc').selectedOptions[0]?.textContent,
      cond: document.getElementById('fp-cond').value,
      condText: document.getElementById('fp-cond').selectedOptions[0]?.textContent,
      currency: document.getElementById('fp-currency').value,
      applied: JSON.stringify(home.view.filters), page: home.view.page,
      badge: document.getElementById('filter-badge').textContent,
      apply: document.getElementById('filter-apply').textContent,
    };
  });

  await setLanguage(page, 'en');
  await page.waitForTimeout(300);
  const english = await snapshot();
  check('LF1 switching to English keeps the sheet open with all three draft values',
    english.open && english.loc === locationId && english.cond === 'ممتازة' && english.currency === 'USD', JSON.stringify(english));
  check('LF2 …the system labels turn English, the customer\'s location name does not',
    english.condText === 'Excellent' && english.locText === 'الرياض' && english.apply === 'Apply filter', JSON.stringify(english));
  check('LF3 …and nothing is applied: same applied filters, same page, same badge',
    english.applied === before.applied && english.page === before.page && english.badge === before.badge, JSON.stringify({ before, english }));

  await setLanguage(page, 'ar');
  await page.waitForTimeout(300);
  const arabic = await snapshot();
  check('LF4 switching back to Arabic still keeps the draft, unapplied',
    arabic.open && arabic.loc === locationId && arabic.cond === 'ممتازة' && arabic.currency === 'USD'
    && arabic.condText === 'ممتازة' && arabic.applied === before.applied, JSON.stringify(arabic));

  await page.click('#filter-apply');
  await page.waitForTimeout(500);
  const applied = await page.evaluate(async () => (await import('/src/views/home.js')).view.filters);
  check('LF5 Apply then applies exactly the draft', applied.locationId === locationId && applied.condition === 'ممتازة' && applied.currency === 'USD', JSON.stringify(applied));
  check('LF6 no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── an open confirmation follows the language (§39, §65) ─────────────────
{
  const ctx = await context();
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const id = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const item = await repository.createItem({ name: 'ساعة جيب', quantity: 1 });
    await repository.deleteItem(item.id);
    return item.id;
  });
  await page.evaluate(async () => (await import('/src/views/manage.js')).openTrashSheet());
  await page.waitForTimeout(600);
  await page.click('#trash-list .btn-d');
  await page.waitForTimeout(300);

  const dialog = () => page.evaluate(() => ({
    open: document.getElementById('del-confirm').classList.contains('open'),
    title: document.getElementById('del-title').textContent,
    message: document.getElementById('del-sub').textContent,
    confirm: document.getElementById('del-confirm-btn').textContent,
    cancel: document.getElementById('del-cancel-btn').textContent,
    phrase: document.getElementById('del-phrase-label').textContent,
    typed: document.getElementById('del-phrase').value,
    disabled: document.getElementById('del-confirm-btn').disabled,
  }));
  const arabic = await dialog();
  check('LC1 the permanent-delete confirmation opens in Arabic, naming the item',
    arabic.open && arabic.title.includes('ساعة جيب') && /[؀-ۿ]/.test(arabic.confirm), JSON.stringify(arabic));

  await page.fill('#del-phrase', 'حذ');
  await setLanguage(page, 'en');
  await page.waitForTimeout(200);
  const english = await dialog();
  check('LC2 switching to English redraws the same dialog in English — title, message, buttons',
    english.open && /Delete|delete/.test(english.title) && english.title.includes('ساعة جيب')
    && !/[؀-ۿ]/.test(english.message) && english.cancel === 'Cancel' && !/[؀-ۿ]/.test(english.confirm),
    JSON.stringify(english));
  check('LC3 the phrase to type stays the one the dialog opened with; what was typed stays',
    english.phrase.startsWith('Type') && english.phrase.includes('حذف') && english.typed === 'حذ' && english.disabled, JSON.stringify(english));

  await setLanguage(page, 'ar');
  await page.waitForTimeout(200);
  const back = await dialog();
  check('LC4 switching back redraws it in Arabic, still open', back.open && back.title === arabic.title && back.cancel === 'إلغاء', JSON.stringify(back));
  const stillThere = await page.evaluate(async (id) => Boolean(await (await import('/src/local-store.js')).get('items', id)), id);
  check('LC5 nothing was confirmed or cancelled by the switches', back.open && stillThere);

  await page.fill('#del-phrase', 'حذف');
  await page.click('#del-confirm-btn');
  await page.waitForTimeout(600);
  const gone = await page.evaluate(async (id) => !(await (await import('/src/local-store.js')).get('items', id)), id);
  check('LC6 the dialog still works: the real confirm purges', gone);

  // One listener for every dialog: opening many never piles up redraws.
  const listeners = await page.evaluate(async () => {
    const ui = await import('/src/ui.js');
    for (let i = 0; i < 5; i += 1) {
      const pending = ui.confirmAction({ titleKey: 'common.delete', messageKey: 'confirm.cannotUndo' });
      ui.resolveConfirm(false);
      await pending;
    }
    let calls = 0;
    const title = document.getElementById('del-title');
    const observer = new MutationObserver(() => { calls += 1; });
    observer.observe(title, { childList: true, characterData: true, subtree: true });
    const pending = ui.confirmAction({ titleKey: 'common.delete', messageKey: 'confirm.cannotUndo' });
    await new Promise((r) => setTimeout(r, 50));
    calls = 0;
    (await import('/src/i18n.js')).setLanguage('en');
    await new Promise((r) => setTimeout(r, 50));
    ui.resolveConfirm(false);
    const result = await pending;
    observer.disconnect();
    return { calls, result };
  });
  check('LC7 six dialogs later, a switch redraws the open one once (no listener pile-up)', listeners.calls === 1 && listeners.result === false, JSON.stringify(listeners));
  check('LC8 no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── text direction follows the text, identifiers stay left to right (§66–§68)
{
  const ctx = await context();
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await ready(page);

  const directions = () => page.evaluate(() => Object.fromEntries(
    ['f-name', 'f-brand', 'f-desc', 'f-sku', 'f-barcode', 'f-serial', 'f-model', 'f-ref', 'f-qty', 'f-valuation']
      .map((id) => [id, getComputedStyle(document.getElementById(id)).direction]),
  ));

  await setLanguage(page, 'en');
  await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({}));
  await page.waitForTimeout(400);
  const empty = await directions();
  check('LD1 English UI, empty fields follow the interface (left to right)',
    Object.values(empty).every((d) => d === 'ltr'), JSON.stringify(empty));
  await page.fill('#f-name', 'ساعة رولكس نادرة');
  await page.fill('#f-desc', 'ساعة قديمة بحالة ممتازة، مع علبتها الأصلية.');
  await page.fill('#f-sku', 'INV-2026-000100');
  await page.fill('#f-serial', '٧٧-AB');
  const english = await directions();
  check('LD2 English UI: an Arabic name and description run right to left',
    english['f-name'] === 'rtl' && english['f-desc'] === 'rtl', JSON.stringify(english));
  check('LD3 …the SKU and a serial with Arabic digits stay left to right',
    english['f-sku'] === 'ltr' && english['f-serial'] === 'ltr', JSON.stringify(english));
  const attrs = await page.evaluate(() => Object.fromEntries(
    ['f-name', 'f-brand', 'f-desc', 'f-sku', 'f-barcode', 'f-serial', 'f-model', 'f-ref', 'f-qty', 'f-valuation', 'fld-name', 'cat-name', 'loc-name', 'hsearch']
      .map((id) => [id, document.getElementById(id).getAttribute('dir')]),
  ));
  check('LD4 human text is dir="auto"; identifiers dir="ltr"; numbers and money untouched',
    ['f-name', 'f-brand', 'f-desc', 'fld-name', 'cat-name', 'loc-name', 'hsearch'].every((id) => attrs[id] === 'auto')
    && ['f-sku', 'f-barcode', 'f-serial', 'f-model', 'f-ref'].every((id) => attrs[id] === 'ltr')
    && attrs['f-qty'] === null && attrs['f-valuation'] === null, JSON.stringify(attrs));
  const labelled = await page.evaluate(() => ['f-name', 'f-brand', 'f-desc', 'f-sku'].every((id) => document.getElementById(id).labels?.length > 0));
  check('LD5 the fields keep their labels', labelled);

  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('add'));
  await setLanguage(page, 'ar');
  await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({}));
  await page.waitForTimeout(400);
  const emptyAr = await directions();
  const provisional = await page.$eval('#f-sku', (n) => n.value);
  const { 'f-sku': skuDir, ...others } = emptyAr;
  check('LD6 Arabic UI: empty fields follow the interface (right to left), identifiers included for their placeholder',
    Object.values(others).every((d) => d === 'rtl'), JSON.stringify(emptyAr));
  check('LD6b …while the provisional SKU a new form carries reads left to right, in Latin digits',
    /^INV-\d{4}-\d{6}$/.test(provisional) && skuDir === 'ltr', JSON.stringify({ provisional, skuDir }));
  await page.fill('#f-name', 'Vintage Rolex Submariner');
  await page.fill('#f-sku', 'INV-2026-000101');
  const arabic = await directions();
  const shell = await page.evaluate(() => getComputedStyle(document.getElementById('sh-add')).direction);
  check('LD7 Arabic UI: an English name runs left to right, the form around it stays right to left',
    arabic['f-name'] === 'ltr' && arabic['f-sku'] === 'ltr' && shell === 'rtl', JSON.stringify({ arabic, shell }));

  // Mixed text, saved and shown: the characters are stored exactly as typed.
  await page.fill('#f-name', 'Rolex ساعة 2026');
  await page.click('#save-item-btn');
  await page.waitForTimeout(800);
  const stored = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    return (await local.getAll('items')).map((item) => item.name);
  });
  check('LD8 mixed Arabic/English text is stored exactly as typed', stored.includes('Rolex ساعة 2026'), JSON.stringify(stored));
  await setLanguage(page, 'en');
  await page.waitForTimeout(300);
  const card = await page.evaluate(() => {
    const node = [...document.querySelectorAll('[dir="auto"]')].find((n) => n.textContent === 'Rolex ساعة 2026');
    return node ? { dir: getComputedStyle(node).direction, width: node.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth } : null;
  });
  check('LD9 …and shown isolated in the English list, readable, without breaking the layout',
    card && card.dir === 'ltr' && card.width > 0 && card.overflow <= 1, JSON.stringify(card));
  check('LD10 no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── direction lives in the layout, not in the words (final RTL/LTR pass) ──
{
  const ctx = await context();
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const { itemId, folderId } = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const folder = await repository.saveFolder({ name: 'Archive' });
    const item = await repository.createItem({ name: 'Brass lamp', quantity: 1 });
    return { itemId: item.id, folderId: folder.id };
  });
  await page.waitForFunction(async (id) => {
    const { repository } = await import('/src/repository.js');
    return repository.state.folders.some((f) => f.id === id);
  }, folderId, { timeout: 10000 });

  // The action sheet's rows follow the reading direction.
  const actionSheet = async () => {
    await page.evaluate(async (id) => (await import('/src/views/home.js')).openContextMenu(id), itemId);
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => {
      const button = document.querySelector('.ctx-as-btn');
      const label = button?.querySelector('.ctx-as-lbl');
      const icon = button?.querySelector('.ctx-as-ico');
      const b = button.getBoundingClientRect(); const l = label.getBoundingClientRect(); const i = icon.getBoundingClientRect();
      return {
        align: getComputedStyle(button).textAlign,
        direction: getComputedStyle(button).direction,
        iconSide: i.left < l.left ? 'left' : 'right',
        labelNearStart: document.documentElement.dir === 'rtl' ? b.right - l.right < 80 : l.left - b.left < 80,
        cancelAlign: getComputedStyle(document.querySelector('.ctx-as-cancel-btn')).textAlign,
      };
    });
    await page.evaluate(async () => (await import('/src/views/home.js')).closeContextMenu());
    await page.waitForTimeout(250);
    return result;
  };
  const arSheet = await actionSheet();
  check('LR1 Arabic action sheet: rows start at the right, the icon leading on the right, Cancel still centred',
    arSheet.align === 'start' && arSheet.direction === 'rtl' && arSheet.iconSide === 'right' && arSheet.labelNearStart && arSheet.cancelAlign === 'center',
    JSON.stringify(arSheet));
  await setLanguage(page, 'en');
  const enSheet = await actionSheet();
  check('LR2 English action sheet: rows start at the left, the icon leading on the left, Cancel still centred',
    enSheet.align === 'start' && enSheet.direction === 'ltr' && enSheet.iconSide === 'left' && enSheet.labelNearStart && enSheet.cancelAlign === 'center',
    JSON.stringify(enSheet));

  // A back button is an icon and a word, and the icon turns with the page.
  const backButton = (selector) => page.evaluate((selector) => {
    const button = document.querySelector(selector);
    if (!button || button.offsetParent === null) return null;
    const svg = button.querySelector('svg');
    const path = svg.querySelector('path').getAttribute('d');
    const matrix = new DOMMatrix(getComputedStyle(svg).transform);
    // The path is drawn pointing right (">"); a mirrored matrix turns it left.
    const points = matrix.a < 0 ? 'left' : 'right';
    const text = button.textContent.trim();
    return {
      points, text, hidden: svg.getAttribute('aria-hidden'), path,
      glyph: /[\u2039\u203A\u2190\u2192]/.test(button.textContent),
      name: (button.getAttribute('aria-label') || button.innerText).trim(),
    };
  }, selector);

  await page.evaluate(async (id) => (await import('/src/views/home.js')).enterFolder(id), folderId);
  await page.waitForSelector('#v-home .nback', { state: 'visible', timeout: 10000 });
  const folderEn = await backButton('#v-home .nback');
  check('LR3 English: the folder back button points left, reads "Inventory", has no arrow character, icon hidden',
    folderEn && folderEn.points === 'left' && folderEn.text === 'Inventory' && folderEn.name === 'Inventory' && !folderEn.glyph && folderEn.hidden === 'true',
    JSON.stringify(folderEn));
  const selection = await page.evaluate(async () => (await import('/src/views/home.js')).view.folderId);
  await setLanguage(page, 'ar');
  await page.waitForTimeout(400);
  const folderAr = await backButton('#v-home .nback');
  const stillIn = await page.evaluate(async () => (await import('/src/views/home.js')).view.folderId);
  check('LR4 switching to Arabic with the folder open: the chevron turns right, the label is Arabic, the folder stays open',
    folderAr && folderAr.points === 'right' && folderAr.text === 'المخزون' && !folderAr.glyph && stillIn === selection && stillIn === folderId,
    JSON.stringify({ folderAr, stillIn }));
  await page.evaluate(async () => (await import('/src/views/home.js')).exitFolder());

  // The static one (Categories → Settings) and the assistant's.
  await page.evaluate(async () => (await import('/src/navigation.js')).goTab('cats'));
  await page.waitForTimeout(300);
  const catsAr = await backButton('#cats-back');
  await setLanguage(page, 'en');
  await page.waitForTimeout(300);
  const catsEn = await backButton('#cats-back');
  check('LR5 Categories back button: right + "الإعدادات" in Arabic, left + "Settings" in English',
    catsAr?.points === 'right' && catsAr.text === 'الإعدادات' && catsEn?.points === 'left' && catsEn.text === 'Settings' && !catsEn.glyph,
    JSON.stringify({ catsAr, catsEn }));

  await page.evaluate(async () => (await import('/src/navigation.js')).goTab('ai'));
  await page.waitForTimeout(300);
  await page.click('.qa:nth-child(2)');
  await page.waitForTimeout(300);
  const aiEn = await backButton('#v-ai .nback');
  await setLanguage(page, 'ar');
  await page.waitForTimeout(300);
  const aiAr = await backButton('#v-ai .nback');
  check('LR6 Assistant back button: left + "Assistant" in English, right + "المساعد" in Arabic, same screen kept',
    aiEn?.points === 'left' && aiEn.text === 'Assistant' && aiAr?.points === 'right' && aiAr.text === 'المساعد',
    JSON.stringify({ aiEn, aiAr }));

  // Arrows turn; nothing else does.
  const unflipped = await page.evaluate(() => [...document.querySelectorAll('svg.nz-icon:not(.nz-dir)')]
    .filter((svg) => new DOMMatrix(getComputedStyle(svg).transform).a < 0).length);
  await setLanguage(page, 'en');
  await page.waitForTimeout(200);
  const unflippedEn = await page.evaluate(() => [...document.querySelectorAll('svg.nz-icon:not(.nz-dir)')]
    .filter((svg) => new DOMMatrix(getComputedStyle(svg).transform).a < 0).length);
  check('LR7 no non-directional icon is mirrored in either language', unflipped === 0 && unflippedEn === 0, JSON.stringify({ unflipped, unflippedEn }));
  check('LR8 no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
for (const line of pass) console.log(`  ✓ ${line}`);
for (const line of fail) console.log(`  ✗ ${line}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
