// Browser test for the public gate (welcome → auth → onboarding).
//
//   npx http-server -p 8123 -c-1 &   # serve the repo root
//   node tests/browser/gate.test.mjs
//
// auth.js and firebase.js are replaced with stubs so the flow can be walked
// end to end without a Firebase project; everything else is the real app.

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

// ── 1. the real app in local mode must NOT show the gate ────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|firebase\] SDK/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => ({
    gated: document.body.classList.contains('gated'),
    open: document.getElementById('gate')?.classList.contains('open'),
    gateVisible: document.getElementById('gate')?.offsetParent !== null,
    appVisible: !!document.querySelector('.app')?.offsetHeight,
    panelEmpty: document.getElementById('gate-panel')?.childElementCount === 0,
  }));
  check('G1 local mode: no gate', s.gated === false && s.open === false && s.gateVisible === false, JSON.stringify(s));
  check('G2 local mode: inventory visible', s.appVisible === true, JSON.stringify(s.appVisible));
  check('G3 local mode: gate never rendered', s.panelEmpty === true);
  check('G4 no JS errors in local boot', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.close();
}

// ── 2. the gate itself, with auth + firebase stubbed ───────────────────────
async function gatePage({ user = null, verificationNeeded = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.route('**/src/auth.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      window.__calls = window.__calls || [];
      const rec = (n) => (...a) => { window.__calls.push([n, ...a.map(x => typeof x === 'string' ? x : '')]); return Promise.resolve(); };
      export function currentSession() { return ${JSON.stringify({ user, workspaceId: null, role: null, ready: true })}; }
      export function needsVerification() { return ${verificationNeeded}; }
      export const refreshVerification = () => { window.__calls.push(['refreshVerification']); return Promise.resolve(true); };
      export const registerWithEmail = rec('registerWithEmail');
      export const sendPasswordReset = rec('sendPasswordReset');
      export const sendVerification = rec('sendVerification');
      export const signInWithApple = rec('signInWithApple');
      export const signInWithEmail = rec('signInWithEmail');
      export const signInWithGoogle = rec('signInWithGoogle');
      export const signOutUser = rec('signOutUser');
    `,
  }));
  await page.route('**/src/firebase.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export const FirebaseStatus = { LOCAL: 'local', CLOUD: 'cloud' };
      export function isCloudEnabled() { return true; }
      export function firebaseContext() {
        return { functions: {}, sdk: { functions: { httpsCallable: (_f, name) => (payload) => {
          window.__calls = window.__calls || [];
          window.__calls.push(['callable:' + name, JSON.stringify(payload)]);
          return Promise.resolve({ data: { workspaceId: 'w1' } });
        } } } };
      }
      export function initializeFirebase() { return Promise.resolve(); }
      export function watchConnectivity() { return () => {}; }
    `,
  }));

  await page.goto(`${BASE}/tests/browser/gate-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.harness === 'ready', null, { timeout: 15000 });
  return { page, errs };
}

const text = (page) => page.evaluate(() => document.getElementById('gate-panel').innerText);

{
  const { page, errs } = await gatePage();
  const open = await page.evaluate(() => ({
    open: document.getElementById('gate').classList.contains('open'),
    gated: document.body.classList.contains('gated'),
    appHidden: getComputedStyle(document.querySelector('.app')).display === 'none',
    screen: document.getElementById('gate-panel').dataset.screen,
  }));
  check('G5 gate opens and hides the app', open.open && open.gated && open.appHidden && open.screen === 'welcome', JSON.stringify(open));

  const t = await text(page);
  check('G6 welcome copy', t.includes('كل ما تملك، في مكانه.') && t.includes('ابدأ مجاناً') && t.includes('تسجيل الدخول')
    && t.includes('مجاني حتى 50 قطعة') && t.includes('مساعد نَظْم'), t.replace(/\n/g, ' / ').slice(0, 200));
  check('G7 the assistant carries no other name', !/claude|كلود|المخزن|almakhzan/i.test(t), t.slice(0, 120));

  // pricing
  await page.click('.gate-pricing-link');
  const plans = await page.evaluate(() => [...document.querySelectorAll('.gate-plan')].map(p => ({
    name: p.querySelector('.gate-plan-name')?.textContent,
    price: p.querySelector('.gate-plan-amount')?.textContent || p.querySelector('.gate-plan-custom')?.textContent,
    items: p.querySelector('.gate-plan-items')?.textContent,
    badge: p.querySelector('.gate-plan-badge')?.textContent || null,
  })));
  check('G8 five plans at the NAZM monthly prices',
    plans.length === 5
    && plans[0].price === 'مجاناً' && plans[0].items.includes('50')
    && plans[1].price === '69' && plans[2].price === '159' && plans[3].price === '279'
    && plans[4].price === 'حسب الاتفاق',
    JSON.stringify(plans));
  check('G8b enterprise is custom limits, never "unlimited"',
    plans[4].items === 'حدود مخصصة', plans[4].items);
  await page.click('.gate-billing-opt:nth-child(2)');
  const annual = await page.evaluate(() => ({
    prices: [...document.querySelectorAll('.gate-plan-amount')].map(n => n.textContent),
    unit: document.querySelector('.gate-plan-unit')?.textContent,
    note: document.querySelector('.gate-annual-note')?.textContent || '',
    pressed: document.querySelector('.gate-billing-opt:nth-child(2)')?.getAttribute('aria-pressed'),
  }));
  check('G8c annual shows the published yearly figures',
    JSON.stringify(annual.prices) === JSON.stringify(['690', '1,590', '2,790'])
    && annual.unit === 'ريال / سنة' && annual.pressed === 'true',
    JSON.stringify(annual));
  check('G8d annual says what the customer saves', annual.note.includes('شهران مجاناً'), annual.note);
  await page.click('.gate-billing-opt:nth-child(1)');

  check('G9 Pro carries the badge', plans[2].badge === 'الأكثر شعبية' && plans.filter(p => p.badge).length === 1,
    plans.map(p => p.badge).join('|'));

  // back → welcome → signup
  await page.click('.gate-btn-secondary');
  await page.click('.gate-btn-primary');
  const signup = await page.evaluate(() => ({
    screen: document.getElementById('gate-panel').dataset.screen,
    providers: [...document.querySelectorAll('.gate-btn-provider')].map(b => b.textContent),
    fields: [...document.querySelectorAll('.gate-input')].map(i => i.id),
    divider: document.querySelector('.gate-divider span')?.textContent,
  }));
  check('G10 signup: Apple + Google + email', signup.screen === 'signup'
    && signup.providers.length === 2 && signup.providers[0].includes('Apple') && signup.providers[1].includes('Google')
    && signup.divider === 'أو باستخدام البريد الإلكتروني'
    && JSON.stringify(signup.fields) === JSON.stringify(['gate-name', 'gate-email', 'gate-password']),
    JSON.stringify(signup));

  // weak password is refused client-side, nothing is sent
  await page.fill('#gate-name', 'عمر');
  await page.fill('#gate-email', 'omar@example.com');
  await page.fill('#gate-password', '123');
  await page.click('.gate-btn-primary');
  await page.waitForTimeout(300);
  let calls = await page.evaluate(() => window.__calls || []);
  check('G11 weak password blocked before registering', !calls.some(c => c[0] === 'registerWithEmail'), JSON.stringify(calls));

  await page.fill('#gate-password', 'secret123');
  await page.click('.gate-btn-primary');
  await page.waitForFunction(() => document.getElementById('gate-panel').dataset.screen === 'verify', null, { timeout: 5000 });
  calls = await page.evaluate(() => window.__calls.map(c => c[0]));
  check('G12 registration sends the verification email',
    calls.includes('registerWithEmail') && calls.includes('sendVerification'), JSON.stringify(calls));

  await page.click('.gate-btn-primary'); // "تحققت، تابع" → stub returns verified
  await page.waitForFunction(() => document.getElementById('gate-panel').dataset.screen === 'onboarding', null, { timeout: 5000 });
  const step1 = await page.evaluate(() => [...document.querySelectorAll('.gate-choice')].map(b => b.innerText.trim()));
  check('G13 onboarding step 1 offers use cases', step1.length === 7 && step1.some(s => s.includes('فن')), JSON.stringify(step1).slice(0, 160));

  await page.click('.gate-choice'); // first: personal
  const suggested = await page.evaluate(() => document.getElementById('gate-workspace')?.placeholder);
  check('G14 step 2 suggests a name', suggested === 'مقتنياتي', String(suggested));

  await page.click('.gate-btn-primary');
  await page.waitForFunction(() => document.getElementById('gate-panel').innerText.includes('مخزنك جاهز'), null, { timeout: 5000 });
  const payload = await page.evaluate(() => window.__calls.find(c => c[0] === 'callable:createWorkspace')?.[1]);
  const parsed = payload ? JSON.parse(payload) : null;
  check('G15 workspace created through the backend',
    !!parsed && parsed.name === 'مقتنياتي' && parsed.useCase === 'personal' && parsed.currency === 'SAR',
    JSON.stringify(parsed));

  await page.click('.gate-btn-primary'); // "إضافة أول قطعة"
  const done = await page.evaluate(() => ({
    result: window.gateResult,
    gated: document.body.classList.contains('gated'),
    open: document.getElementById('gate').classList.contains('open'),
  }));
  check('G16 finishing closes the gate and reports intent',
    done.result?.intent === 'add-item' && done.gated === false && done.open === false, JSON.stringify(done));

  check('G17 no JS errors across the gate flow', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.close();
}

// ── 3. an unverified session reopens on the verify screen ──────────────────
{
  const { page, errs } = await gatePage({ user: { uid: 'u1', email: 'omar@example.com', displayName: 'عمر' }, verificationNeeded: true });
  const t = await text(page);
  const screen = await page.evaluate(() => document.getElementById('gate-panel').dataset.screen);
  check('G18 unverified session lands on verify', screen === 'verify' && t.includes('omar@example.com'), screen + ' / ' + t.slice(0, 80));
  check('G19 verify screen has no errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  await page.close();
}

// ── 4. a verified session skips straight to onboarding ─────────────────────
{
  const { page } = await gatePage({ user: { uid: 'u2', email: 'a@b.co' }, verificationNeeded: false });
  const screen = await page.evaluate(() => document.getElementById('gate-panel').dataset.screen);
  check('G20 verified session goes to onboarding', screen === 'onboarding', screen);
  await page.close();
}

await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
