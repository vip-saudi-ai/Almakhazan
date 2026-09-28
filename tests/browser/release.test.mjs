// Browser test: the 1.0.0 release as it ships — nazm.config.js untouched.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/release.test.mjs
//
// The other suites run with every feature switched on (they exercise the whole
// product). This one checks what a customer of the App Store build meets: a
// complete device inventory, nothing unfinished on screen, no request leaving
// the device, the legal documents in both languages, erasing the device, the
// native adapter, and — with the cloud simulated — the sign-up consent line,
// provider availability and the account deletion flow.

import { autoChooseLanguage } from './language-gate.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const pass = [], fail = [];
const check = (n, ok, d = '') => {
  (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
  if (process.env.VERBOSE) console.error(ok ? '✓' : '✗', n, ok ? '' : d);
};
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const UNFINISHED = /\bbeta\b|تجريبي|coming soon|قريباً|\bTODO\b|lorem|\bdemo\b|payment pending|قيد التفعيل|placeholder/i;

const browser = await chromium.launch();
autoChooseLanguage(browser, 'ar');

async function open(ctx, path = '/index.html') {
  const page = await ctx.newPage();
  const errs = [];
  const external = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  return { page, errs, external };
}

const screenText = (page) => page.evaluate(() => document.body.innerText);
const goTab = (page, tab) => page.evaluate(async (tab) => { (await import('/src/navigation.js')).goTab(tab); await new Promise((r) => setTimeout(r, 350)); }, tab);

// ── 1. the shipped configuration ───────────────────────────────────────────
{
  const ctx = await browser.newContext({ ...PHONE, release: true });
  const { page, errs, external } = await open(ctx);
  await page.waitForTimeout(600);

  const env = await page.evaluate(async () => {
    const { ENV } = await import('/src/environment.js');
    const { APP_VERSION } = await import('/src/config.js');
    const { firebaseContext } = await import('/src/firebase.js');
    return { features: ENV.features, providers: ENV.auth.providers, version: APP_VERSION, status: firebaseContext().status, contact: ENV.contact };
  });
  check('R1 the release is 1.0.0 with cloud, team, billing and cloud AI switched off',
    env.version === '1.0.0' && Object.values(env.features).every((v) => v === false) && env.status === 'disabled', JSON.stringify(env));
  check('R2 no request leaves the device — the Firebase SDK is never fetched', external.length === 0, JSON.stringify(external.slice(0, 3)));
  check('R3 no contact address is shipped as a placeholder', Object.values(env.contact).every((v) => v === null), JSON.stringify(env.contact));

  const gate = await page.evaluate(() => ({ gated: document.body.classList.contains('gated'), gateOpen: document.getElementById('gate').classList.contains('open') }));
  check('R4 the inventory opens directly — no sign-in screen', !gate.gated && !gate.gateOpen, JSON.stringify(gate));

  // Nothing unfinished anywhere a customer goes, in either language.
  const leaks = [];
  for (const lang of ['ar', 'en']) {
    await page.evaluate(async (lang) => (await import('/src/i18n.js')).setLanguage(lang), lang);
    for (const tab of ['home', 'ai', 'set']) {
      await goTab(page, tab);
      const text = await screenText(page);
      const hit = text.match(UNFINISHED);
      if (hit) leaks.push(`${lang}/${tab}: ${hit[0]}`);
    }
    await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({}));
    await page.waitForTimeout(400);
    const formText = await page.evaluate(() => document.getElementById('sh-add').innerText);
    if (UNFINISHED.test(formText)) leaks.push(`${lang}/form: ${formText.match(UNFINISHED)[0]}`);
    await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('add'));
  }
  check('R5 no beta, demo, placeholder, "coming soon" or "payment pending" text on any screen, ar and en', leaks.length === 0, leaks.join(' | '));

  await page.evaluate(async () => (await import('/src/i18n.js')).setLanguage('ar'));
  await goTab(page, 'set');
  const settings = await page.evaluate(() => {
    const shown = (id) => { const n = document.getElementById(id); return Boolean(n) && !n.hidden && n.offsetParent !== null; };
    return {
      plan: shown('plan-panel'), ai: shown('ai-settings'),
      headings: [...document.querySelectorAll('#v-set .stitle')].filter((h) => h.offsetParent).map((h) => h.textContent),
      legal: [...document.querySelectorAll('#legal-panel .srowl')].map((n) => n.textContent),
      version: document.getElementById('app-version').textContent,
      auth: document.getElementById('auth-panel').innerText,
      danger: [...document.querySelectorAll('#danger-panel .srowl')].map((n) => n.textContent),
    };
  });
  check('R6 no plan, price or subscription panel; no assistant-cloud panel', !settings.plan && !settings.ai, JSON.stringify(settings.headings));
  check('R7 Settings: Account, Data, Legal & Privacy, About — in that order',
    ['الحساب', 'البيانات', 'القانونية والخصوصية', 'حول التطبيق'].every((h, i, all) => settings.headings.indexOf(h) >= 0
      && (i === 0 || settings.headings.indexOf(h) > settings.headings.indexOf(all[i - 1]))), JSON.stringify(settings.headings));
  check('R8 Legal & Privacy lists the policy, the terms, Data & AI and Support — no Delete Account without an account',
    JSON.stringify(settings.legal) === JSON.stringify(['سياسة الخصوصية', 'الشروط والأحكام', 'البيانات والذكاء الاصطناعي', 'الدعم']), JSON.stringify(settings.legal));
  check('R9 About shows the version as a customer reads it', settings.version === 'الإصدار 1.0.0', settings.version);
  check('R10 the account section says the inventory lives on this device, as a mode — not a failure',
    settings.auth.includes('على هذا الجهاز') && !/فشل|خطأ|غير متاح/.test(settings.auth), settings.auth.replace(/\n/g, ' / '));
  check('R11 Erase Data on This Device is offered', settings.danger.includes('مسح بيانات هذا الجهاز'), JSON.stringify(settings.danger));

  // No plan limit can trap a device inventory while nothing is sold.
  const limits = await page.evaluate(async () => {
    const sub = await import('/src/subscription.js');
    const home = await import('/src/views/home.js');
    home.startSelection();
    await new Promise((r) => setTimeout(r, 200));
    const selecting = home.view.selection instanceof Set;
    home.view.selection = null; home.renderHome?.();
    return { status: sub.planStatus(), add: sub.canAddItem().allowed, bulk: sub.canUseFeature('bulkActions').allowed, selecting, dialog: document.getElementById('del-confirm').classList.contains('open') };
  });
  check('R12 the device inventory has no plan limit and no upgrade wall (bulk selection works)',
    limits.status === 'local' && limits.add && limits.bulk && limits.selecting && !limits.dialog, JSON.stringify(limits));
  const planAsk = await page.evaluate(async () => {
    (await import('/src/views/plans.js')).openPlansSheet('limit');
    await new Promise((r) => setTimeout(r, 250));
    const state = {
      plansOpen: document.getElementById('sh-plans').classList.contains('open'),
      notice: document.getElementById('del-confirm').classList.contains('open'),
      cancelHidden: document.getElementById('del-cancel-btn').hidden,
      prices: document.querySelectorAll('.plan-card, .plan-amount').length,
    };
    (await import('/src/ui.js')).resolveConfirm(false);
    return state;
  });
  check('R13 anything that would have opened the plans sheet explains instead — no prices, no purchase button',
    !planAsk.plansOpen && planAsk.notice && planAsk.cancelHidden && planAsk.prices === 0, JSON.stringify(planAsk));

  const ai = await page.evaluate(async () => {
    (await import('/src/views/item-form.js')).openItemForm({});
    await new Promise((r) => setTimeout(r, 300));
    const toggle = document.querySelector('.desc-toggle');
    const state = { toggle: Boolean(toggle?.offsetParent), section: Boolean(document.getElementById('ai-section')?.offsetParent), manual: Boolean(document.getElementById('desc-manual-sec')?.offsetParent) };
    (await import('/src/ui.js')).closeSheet('add');
    return state;
  });
  check('R14 no AI analysis control in the item form; the description field is there', !ai.toggle && !ai.section && ai.manual, JSON.stringify(ai));

  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '');
  check('R15 a Content Security Policy without unsafe-eval and without any AI provider domain',
    csp.includes("default-src 'self'") && !csp.includes('unsafe-eval') && !/anthropic|openai/i.test(csp) && csp.includes("object-src 'none'"), csp.replace(/\s+/g, ' ').slice(0, 120));
  const polluted = await page.evaluate(async () => {
    const { readBackupFile } = await import('/src/exporting.js');
    const text = '{"items":[{"id":"a","name":"x","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}],"__proto__":{"polluted":true}}';
    const { data } = await readBackupFile(new File([text], 'nazm_backup.json', { type: 'application/json' }));
    return {
      global: ({}).polluted === true,
      item: Object.getPrototypeOf(data.items[0]) === Object.prototype && !Object.prototype.hasOwnProperty.call(data.items[0], '__proto__')
        && !Object.prototype.hasOwnProperty.call(data.items[0], 'constructor'),
      name: data.items[0].name,
    };
  });
  check('R16 a backup file cannot smuggle prototype keys into records', !polluted.global && polluted.item && polluted.name === 'x', JSON.stringify(polluted));
  check('R17 no errors in the release build', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 2. the legal documents ─────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ ...PHONE, release: true });
  const { page, errs } = await open(ctx);
  await goTab(page, 'set');

  const read = () => page.evaluate(() => ({
    open: document.getElementById('sh-legal').classList.contains('open'),
    title: document.getElementById('legal-title').textContent,
    sections: [...document.querySelectorAll('#legal-body section h3')].map((h) => h.textContent),
    text: document.getElementById('legal-body').innerText,
    role: document.getElementById('sh-legal').getAttribute('role'),
    labelledBy: document.getElementById('sh-legal').getAttribute('aria-labelledby'),
    focusInside: document.getElementById('sh-legal').contains(document.activeElement),
  }));

  await page.click('#legal-privacy');
  await page.waitForTimeout(350);
  const privacyAr = await read();
  check('L1 the Privacy Policy opens inside the app, as a labelled dialog with focus inside',
    privacyAr.open && privacyAr.title === 'سياسة الخصوصية' && privacyAr.role === 'dialog' && privacyAr.labelledBy === 'legal-title' && privacyAr.focusInside, JSON.stringify({ ...privacyAr, text: undefined, sections: privacyAr.sections.length }));
  check('L2 it names the controller: شركة مزايدة، المالكة والمشغلة لتطبيق نَظْم', privacyAr.text.includes('شركة مزايدة، المالكة والمشغلة لتطبيق نَظْم (NAZM)'));
  const required = ['الجهة المسؤولة عن البيانات', 'الأساس النظامي للمعالجة', 'النقل خارج المملكة', 'مدة الاحتفاظ', 'حذف الحساب', 'حقوقك', 'القاصرون', 'الإعلانات والتتبع', 'الشكاوى والتواصل'];
  check('L3 the policy covers controller, legal basis, transfers, retention, deletion, rights, minors, tracking and complaints',
    required.every((h) => privacyAr.sections.includes(h)), JSON.stringify(required.filter((h) => !privacyAr.sections.includes(h))));
  check('L4 cloud, AI and payments are described conditionally ("عند تفعيل"), not as running',
    /عند تفعيل/.test(privacyAr.text) && /عند إتاحة/.test(privacyAr.text) && !/Anthropic|Claude|OpenAI|Stripe/i.test(privacyAr.text));
  check('L5 no email address is invented — the Support page is the channel', !/@[a-z0-9-]+\.[a-z]/i.test(privacyAr.text) && privacyAr.text.includes('صفحة «الدعم»'));
  check('L6 the Arabic document shows Arabic only', !/[A-Za-z]{6,}/.test(privacyAr.text.replace(/NAZM|WebP|JPEG|Bluetooth|Google|Apple|App Store|HEIC|QR|SKU/g, '')));

  await page.evaluate(async () => (await import('/src/i18n.js')).setLanguage('en'));
  await page.waitForTimeout(300);
  const privacyEn = await read();
  check('L7 switching language redraws the open document in English, same structure',
    privacyEn.open && privacyEn.title === 'Privacy Policy' && privacyEn.sections.length === privacyAr.sections.length
    && privacyEn.text.includes('Mazayda Company, owner and operator of the NAZM application') && !/[؀-ۿ]/.test(privacyEn.text), `${privacyEn.sections.length} vs ${privacyAr.sections.length}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const closed = await page.evaluate(() => ({ open: document.getElementById('sh-legal').classList.contains('open'), focus: document.activeElement?.id }));
  check('L8 Escape closes it and focus returns to the row that opened it', !closed.open && closed.focus === 'legal-privacy', JSON.stringify(closed));

  await page.click('#legal-terms');
  await page.waitForTimeout(300);
  const terms = await read();
  check('L9 the Terms: Saudi law, consumer rights kept, App Store terms, AI not an appraisal',
    terms.title === 'Terms & Conditions' && terms.text.includes('laws of the Kingdom of Saudi Arabia')
    && terms.sections.includes('Consumer rights') && terms.sections.includes('The App Store') && /not a professional appraisal/.test(terms.text), terms.sections.length);
  await page.keyboard.press('Escape');

  await page.click('#legal-data-ai');
  await page.waitForTimeout(300);
  const dataAi = await read();
  check('L10 Data & AI Privacy is a short summary, with the full policy one tap away',
    dataAi.title === 'Data & AI Privacy' && dataAi.sections.length >= 6 && dataAi.sections.length <= 10 && /does not sell/.test(dataAi.text), dataAi.sections.join(' | '));
  await page.keyboard.press('Escape');

  await page.click('#legal-support');
  await page.waitForTimeout(300);
  const support = await page.evaluate(() => ({
    title: document.getElementById('legal-title').textContent,
    text: document.getElementById('legal-body').innerText,
    mail: document.querySelectorAll('#legal-body .srow-btn').length,
  }));
  check('L11 Support: help and privacy requests, and no contact row while no address is configured',
    support.title === 'Support' && support.text.includes('Quick help') && support.text.includes('Privacy requests') && support.mail === 0 && /NAZM 1\.0\.0/.test(support.text), JSON.stringify({ ...support, text: support.text.slice(0, 80) }));
  await page.keyboard.press('Escape');
  check('L12 no errors in the legal screens', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 3. erasing this device ─────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ ...PHONE, release: true });
  const { page, errs } = await open(ctx);
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.createItem({ name: 'Lamp', quantity: 1 });
    localStorage.setItem('makhzan7', '{"items":[]}');
  });
  const before = await page.evaluate(async () => (await (await import('/src/repository.js')).repository.recordCounts()).live);
  await goTab(page, 'set');
  await page.click('#erase-device');
  await page.waitForTimeout(300);
  const dialog = await page.evaluate(() => ({
    title: document.getElementById('del-title').textContent,
    message: document.getElementById('del-sub').textContent,
    disabled: document.getElementById('del-confirm-btn').disabled,
  }));
  check('E1 erasing asks for a typed phrase and says it is the only copy', dialog.disabled && dialog.message.includes('النسخة الوحيدة'), JSON.stringify(dialog));
  await page.fill('#del-phrase', 'مسح');
  const navigated = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  await page.click('#del-confirm-btn');
  await navigated;
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  const after = await page.evaluate(async () => ({
    live: (await (await import('/src/repository.js')).repository.recordCounts()).live,
    legacy: localStorage.getItem('makhzan7'),
    language: localStorage.getItem('nazm.language') || document.documentElement.lang,
  }));
  check('E2 after erasing, the device inventory is empty, legacy copies are gone, the language is kept',
    before === 1 && after.live === 0 && after.legacy === null && after.language === 'ar', JSON.stringify({ before, ...after }));
  check('E3 no errors while erasing', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 4. inside the native app ───────────────────────────────────────────────
{
  const ctx = await browser.newContext({ ...PHONE, release: true });
  await ctx.addInitScript(() => {
    window.__shared = [];
    window.__status = [];
    window.NazmNative = {
      platform: 'ios', appVersion: '1.0.0', buildNumber: '12',
      shareFile: (file) => { window.__shared.push(file); return Promise.resolve(); },
      openSettings: () => Promise.resolve(),
      setStatusBarStyle: (style) => { window.__status.push(style); },
    };
  });
  const { page, errs } = await open(ctx, '/index.html?sw-test');
  await page.waitForTimeout(500);
  const native = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.createItem({ name: 'Clock', quantity: 1 });
    (await import('/src/navigation.js')).goTab('set');
    await new Promise((r) => setTimeout(r, 300));
    const { runFullJsonExport } = await import('/src/views/manage.js');
    await runFullJsonExport();
    const registrations = await navigator.serviceWorker.getRegistrations();
    return {
      version: document.getElementById('app-version').textContent,
      label: Boolean(document.getElementById('detlabel')?.hidden) && Boolean(document.getElementById('ctx-label')?.hidden),
      shared: window.__shared.map((f) => ({ filename: f.filename, mimeType: f.mimeType, bytes: f.base64.length })),
      sw: registrations.length,
      status: window.__status,
      nativeClass: document.documentElement.classList.contains('native-app'),
    };
  });
  check('N1 About shows the native version and build', native.version === 'الإصدار 1.0.0 (12)', native.version);
  check('N2 an export goes to the share sheet (no blob download a WebView cannot follow)',
    native.shared.length === 1 && /\.json$/.test(native.shared[0].filename) && native.shared[0].mimeType === 'application/json' && native.shared[0].bytes > 100, JSON.stringify(native.shared));
  check('N3 no service worker in the native app, even where the web would register one', native.sw === 0, String(native.sw));
  check('N4 QR-label printing is hidden when the native app provides no print bridge', native.label, String(native.label));
  check('N5 the native status bar follows the theme', native.status.length >= 1 && ['light', 'dark'].includes(native.status[0]), JSON.stringify(native.status));
  check('N6 no errors in the native mode', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 5. with the cloud simulated: sign-up consent, providers, deletion ──────
async function cloudContext({ user = null, providers = { email: true, apple: true, google: true } } = {}) {
  const ctx = await browser.newContext({ ...PHONE, release: true });
  await ctx.route('**/nazm.config.js', async (route) => {
    const response = await route.fetch();
    const body = `${await response.text()}
window.NAZM_CONFIG.features = { cloud: true, team: false, billing: false, cloudAi: false };
window.NAZM_CONFIG.auth = { providers: ${JSON.stringify(providers)} };`;
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  // Firebase reachable, with nobody signed in (or the given user).
  await ctx.route('**/src/firebase.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('export function initializeFirebase() {', `export function initializeFirebase() {
  context = { ...context, status: FirebaseStatus.READY, functions: {}, auth: { currentUser: ${JSON.stringify(user)} }, sdk: { auth: { onAuthStateChanged: (_a, cb) => setTimeout(() => cb(${JSON.stringify(user)}), 0) } } };
  return Promise.resolve(context);
}
function __realInitializeFirebase() {`);
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  return ctx;
}

{
  const ctx = await cloudContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('gate')?.classList.contains('open'), null, { timeout: 30000 });
  const welcome = await page.evaluate(() => ({
    text: document.getElementById('gate-panel').innerText,
    pricing: Boolean(document.querySelector('.gate-pricing-link')),
    legal: [...document.querySelectorAll('#gate-panel .legal-footer .legal-inline')].map((b) => b.textContent),
  }));
  check('C1 with billing off, the welcome screen shows no pricing and no "free" wording',
    !welcome.pricing && !/مجاني|مجاناً/.test(welcome.text), welcome.text.replace(/\n/g, ' / ').slice(0, 160));
  check('C2 the Privacy Policy and Terms are reachable before any account exists', JSON.stringify(welcome.legal) === JSON.stringify(['سياسة الخصوصية', 'الشروط والأحكام']), JSON.stringify(welcome.legal));

  await page.evaluate(() => [...document.querySelectorAll('#gate-panel button')].find((b) => b.textContent === 'إنشاء حساب')?.click());
  await page.waitForTimeout(300);
  const signup = await page.evaluate(() => ({
    consent: document.querySelector('#gate-panel .legal-consent')?.innerText || '',
    links: [...document.querySelectorAll('#gate-panel .legal-consent .legal-inline')].map((b) => b.textContent),
    rule: document.getElementById('gate-password-rule')?.textContent || '',
    providers: [...document.querySelectorAll('#gate-panel .gate-btn-provider')].map((b) => b.textContent),
    consentBeforeCreate: (() => {
      const consent = document.querySelector('#gate-panel .legal-consent');
      const create = [...document.querySelectorAll('#gate-panel .gate-btn-primary')].pop();
      return Boolean(consent && create && (consent.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING));
    })(),
  }));
  check('C3 the sign-up screen says: بإنشاء الحساب، فإنك توافق على الشروط والأحكام وتقر بالاطلاع على سياسة الخصوصية — before the button',
    signup.consent === 'بإنشاء الحساب، فإنك توافق على الشروط والأحكام وتقر بالاطلاع على سياسة الخصوصية.'
    && JSON.stringify(signup.links) === JSON.stringify(['الشروط والأحكام', 'سياسة الخصوصية']) && signup.consentBeforeCreate, JSON.stringify(signup));
  check('C4 the password rule is visible before the first attempt', signup.rule.includes('6'), signup.rule);
  check('C5 Apple and Google are both offered when both are configured', signup.providers.length === 2, JSON.stringify(signup.providers));

  await page.evaluate(() => document.querySelectorAll('#gate-panel .legal-consent .legal-inline')[0].click());
  await page.waitForTimeout(350);
  const termsOverGate = await page.evaluate(() => ({
    open: document.getElementById('sh-legal').classList.contains('open'),
    title: document.getElementById('legal-title').textContent,
    gateInert: document.getElementById('gate').inert,
    gateStill: document.getElementById('gate').classList.contains('open'),
  }));
  check('C6 tapping "Terms" opens them in the app, over the sign-up screen, which waits underneath',
    termsOverGate.open && termsOverGate.title === 'الشروط والأحكام' && termsOverGate.gateInert && termsOverGate.gateStill, JSON.stringify(termsOverGate));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const back = await page.evaluate(() => ({ gateInert: document.getElementById('gate').inert, value: document.querySelector('#gate-panel .legal-consent') !== null }));
  check('C7 closing them returns to the sign-up screen, usable', !back.gateInert && back.value, JSON.stringify(back));
  check('C8 no errors on the sign-up screen', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

{
  // Google configured without Apple: on iOS it must not be offered.
  const ctx = await cloudContext({ providers: { email: true, apple: false, google: true } });
  await ctx.addInitScript(() => { window.NazmNative = { platform: 'ios', signIn: () => Promise.resolve({}) }; });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('gate')?.classList.contains('open'), null, { timeout: 30000 });
  const offered = await page.evaluate(async () => {
    const { isAuthProviderAvailable } = await import('/src/features.js');
    return { google: isAuthProviderAvailable('google'), apple: isAuthProviderAvailable('apple'), email: isAuthProviderAvailable('email') };
  });
  check('C9 on iOS, Google is never offered without Sign in with Apple', !offered.google && !offered.apple && offered.email, JSON.stringify(offered));
  await ctx.close();
}

{
  // The deletion flow, with the account service stubbed at its one boundary.
  const user = { uid: 'u1', email: 'owner@example.com', displayName: 'Owner', emailVerified: true, isAnonymous: false, providerData: [{ providerId: 'password' }] };
  for (const scenario of ['blocked', 'ok']) {
    const ctx = await cloudContext({ user });
    await ctx.route('**/src/account.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
      window.__acct = [];
      export async function accountDeletionStatus() { window.__acct.push('status');
        return ${scenario === 'blocked'
          ? "{ blocked: true, blocking: [{ id: 'w2', name: 'Shared store' }], ownedAlone: 0, memberOf: 0 }"
          : '{ blocked: false, blocking: [], ownedAlone: 1, memberOf: 2 }'}; }
      export function accountSignInMethods() { return { password: true, apple: false, google: false, email: 'owner@example.com' }; }
      export async function reauthenticate(method, secret) { window.__acct.push('reauth:' + method + ':' + secret.length); }
      export async function deleteAccount() { window.__acct.push('delete'); await new Promise((r) => setTimeout(r, 300)); return { ok: true }; }
      export async function eraseLocalData() { return { ok: true }; }
      export function accountDeletionAvailable() { return true; }
    ` }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
    await page.evaluate(async () => (await import('/src/views/account.js')).openDeleteAccount());
    await page.waitForTimeout(350);
    const step1 = await page.evaluate(() => document.getElementById('account-body').innerText);
    if (scenario === 'blocked') {
      check('D1 step 1 explains deletion, that the device inventory stays, and that deleting the app is not deleting the account',
        step1.includes('سيؤدي حذف حسابك إلى إنهاء الوصول') && step1.includes('حذف التطبيق من جهازك لا يحذف الحساب'), step1.slice(0, 120));
    }
    await page.evaluate(() => [...document.querySelectorAll('#account-body button')].find((b) => b.textContent === 'متابعة').click());
    await page.waitForTimeout(350);
    if (scenario === 'blocked') {
      const blocked = await page.evaluate(() => ({ text: document.getElementById('account-body').innerText, calls: window.__acct }));
      check('D2 owning a shared workspace blocks deletion, names it, and says how to resolve it',
        blocked.text.includes('Shared store') && blocked.text.includes('انقل ملكية') && !blocked.calls.includes('delete'), JSON.stringify(blocked.calls));
    } else {
      const reauth = await page.evaluate(() => document.getElementById('account-body').innerText);
      check('D3 what will happen is said before anything is asked: owned workspaces deleted, memberships removed',
        reauth.includes('ستُحذف مساحة عمل واحدة') && reauth.includes('ستُزال عضويتك من مساحتَي عمل'), reauth.slice(0, 160));
      await page.fill('#account-password', 'secret1');
      await page.evaluate(() => [...document.querySelectorAll('#account-body button')].find((b) => b.textContent === 'تأكيد بكلمة المرور').click());
      await page.waitForTimeout(300);
      const confirmStep = await page.evaluate(() => ({ label: document.getElementById('account-confirm-hint')?.textContent, disabled: [...document.querySelectorAll('#account-body button')].find((b) => b.textContent === 'حذف الحساب نهائياً')?.disabled }));
      check('D4 after a fresh sign-in, the final step needs the typed word "حذف"', confirmStep.label === 'اكتب "حذف" للتأكيد' && confirmStep.disabled === true, JSON.stringify(confirmStep));
      await page.fill('#account-confirm', 'حذ');
      const partial = await page.evaluate(() => [...document.querySelectorAll('#account-body button')].find((b) => b.textContent === 'حذف الحساب نهائياً').disabled);
      await page.fill('#account-confirm', 'حذف');
      const finalButton = await page.evaluate(() => {
        const button = [...document.querySelectorAll('#account-body button')].find((b) => b.textContent === 'حذف الحساب نهائياً');
        button.click(); button.click();
        return { busy: button.getAttribute('aria-busy'), text: document.getElementById('account-body').innerText.includes('حُذف حسابك') };
      });
      check('D5 while the backend works, the button is busy and nothing claims success yet', partial === true && finalButton.busy === 'true' && !finalButton.text, JSON.stringify({ partial, ...finalButton }));
      await page.waitForTimeout(600);
      const done = await page.evaluate(() => ({ text: document.getElementById('account-body').innerText, calls: window.__acct }));
      check('D6 success is shown only after the backend confirms — once, after status and a password re-authentication',
        done.text.includes('حُذف حسابك') && JSON.stringify(done.calls) === JSON.stringify(['status', 'reauth:password:7', 'delete']), JSON.stringify(done.calls));
      await goTab(page, 'set');
      const row = await page.evaluate(() => [...document.querySelectorAll('#legal-panel .srowl')].map((n) => n.textContent));
      check('D7 with an account, Delete Account is in Legal & Privacy', row.includes('حذف الحساب'), JSON.stringify(row));
    }
    check(`D8 no errors in the deletion flow (${scenario})`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

await browser.close();
for (const line of pass) console.log(`  ✓ ${line}`);
for (const line of fail) console.log(`  ✗ ${line}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
