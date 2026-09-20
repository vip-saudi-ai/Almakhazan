// Browser test for the plan surfaces: the quota banner, the Settings card and
// the ceiling that stops a new record before the form opens.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/quota.test.mjs
//
// src/subscription.js is replaced with a stub so each level (70%, 90%, 100%,
// and no plan at all) can be shown without a Firebase project. Everything the
// stub feeds is what the real module reads from server-written counters.

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

function stub({ used, limit = 50, planId = 'free', status = 'free' }) {
  return `
    import { PLAN_CONFIG } from '/src/plans.generated.js';
    import { checkCreateItem, itemQuotaStatus, usageSummary, assistantPresentation } from '/src/entitlements.js';
    const plan = { ...PLAN_CONFIG.plans['${planId}'], id: '${planId}' };
    const entitlement = { plan, planId: '${planId}', status: '${status}', readOnly: false };
    const usage = { items: ${used}, storageBytes: 1024 * 1024 * 120, members: 1, aiCreditsUsed: 3 };
    export function startPlanWatch() {}
    export function stopPlanWatch() {}
    export function onSubscriptionChange(fn) { return () => {}; }
    export function subscriptionState() { return { entitlement, usage, ready: true }; }
    export function currentPlan() { return plan; }
    export function planStatus() { return '${status}'; }
    export function quotaStatus() { return ${status === 'local'} ? null : itemQuotaStatus({ entitlement, usage }); }
    export function canAddItem() { return ${status === 'local'} ? { allowed: true } : checkCreateItem({ entitlement, usage }); }
    export function planUsage() { return ${status === 'local'} ? [] : usageSummary({ entitlement, usage }); }
    export function assistantLabel() { return assistantPresentation({ entitlement }); }
    export function canUseAssistant() { return { allowed: false, message: 'غير متاح في الاختبار' }; }
    export function canUseFeature() { return { allowed: true }; }
  `;
}

async function appWith(options) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase\] SDK/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.route('**/src/subscription.js', r => r.fulfill({ contentType: 'text/javascript', body: stub(options) }));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  return { page, errs };
}

const banner = (page) => page.evaluate(() => {
  const b = document.getElementById('quota-banner');
  return { shown: b.style.display !== 'none', level: b.className.replace('quota-banner', '').trim(), text: b.innerText };
});

// ── under the notice threshold: nothing is said ────────────────────────────
{
  const { page, errs } = await appWith({ used: 20 });
  const b = await banner(page);
  check('Q1 quiet below 70%', b.shown === false, JSON.stringify(b));
  check('Q2 no errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  await page.close();
}

// ── 70% ────────────────────────────────────────────────────────────────────
{
  const { page } = await appWith({ used: 36 });
  const b = await banner(page);
  check('Q3 notice at 70%', b.shown && b.level === 'notice' && b.text.includes('72%'), JSON.stringify(b));
  // dismissible at this level
  await page.click('.qb-close');
  const after = await banner(page);
  check('Q4 notice can be dismissed', after.shown === false, JSON.stringify(after));
  await page.close();
}

// ── 90% ────────────────────────────────────────────────────────────────────
{
  const { page } = await appWith({ used: 46 });
  const b = await banner(page);
  check('Q5 warning at 90% counts what is left', b.shown && b.level === 'warn' && b.text.includes('4'), JSON.stringify(b));
  await page.close();
}

// ── 100%: the wall, and what it must not break ─────────────────────────────
{
  const { page } = await appWith({ used: 50 });
  const b = await banner(page);
  check('Q6 full at 100%', b.shown && b.level === 'full' && b.text.includes('50'), JSON.stringify(b));
  check('Q7 the wall cannot be dismissed', await page.locator('.qb-close').count() === 0);

  await page.click('.nacts button[aria-label="إضافة قطعة"]');
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    plansOpen: document.getElementById('sh-plans').classList.contains('open'),
    formOpen: document.getElementById('sh-add').classList.contains('open'),
    reason: document.querySelector('#plans-body .plan-alert')?.textContent || '',
    plans: [...document.querySelectorAll('#plans-body .plan-card .plan-name')].map(n => n.textContent),
    current: document.querySelector('#plans-body .plan-card.current .plan-name')?.textContent,
  }));
  check('Q8 a new record opens the plans sheet, not the form',
    state.plansOpen && !state.formOpen, JSON.stringify({ p: state.plansOpen, f: state.formOpen }));
  check('Q9 the sheet says why and promises nothing is lost',
    state.reason.includes('اكتمل الحد') && state.reason.includes('ستبقى محفوظة'), state.reason.slice(0, 90));
  check('Q10 all five plans, current one marked',
    state.plans.length === 5 && state.current === 'مجاني', JSON.stringify(state.plans) + ' / ' + state.current);

  // editing an existing record must still work at the ceiling
  await page.click('#sh-plans [data-close]');
  await page.waitForTimeout(400);
  const edited = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const item = await repository.createItem({ name: 'قطعة قائمة', quantity: 1, unit: 'قطعة', categoryId: 'c1' });
    const { openItemForm } = await import('/src/views/item-form.js');
    openItemForm({ itemId: item.id });
    await new Promise(r => setTimeout(r, 400));
    return {
      formOpen: document.getElementById('sh-add').classList.contains('open'),
      title: document.getElementById('addtitle').textContent,
    };
  });
  check('Q11 an existing record can still be edited at the ceiling',
    edited.formOpen && edited.title === 'تعديل القطعة', JSON.stringify(edited));
  await page.close();
}

// ── the Settings card ──────────────────────────────────────────────────────
{
  const { page } = await appWith({ used: 36 });
  await page.click('#t-set');
  await page.waitForTimeout(500);
  const card = await page.evaluate(() => ({
    text: document.getElementById('plan-panel').innerText,
    pill: document.querySelector('#plan-panel .plan-pill')?.textContent,
    used: document.querySelector('#plan-panel .plan-count-used')?.textContent,
    of: document.querySelector('#plan-panel .plan-count-of')?.textContent,
    meters: [...document.querySelectorAll('#plan-panel .plan-meter')].map(r => r.innerText.replace(/\n/g, ' ')),
    fill: document.querySelector('#plan-panel .usage-fill')?.style.width,
    note: document.querySelector('#plan-panel .plan-head-note')?.textContent || '',
  }));
  check('Q12 the card names the plan and leads with the record count',
    card.pill === 'الخطة المجانية' && card.used === '36' && card.of.includes('50'), JSON.stringify(card));
  check('Q13 the other metered dimensions each get a row',
    card.meters.length === 3
    && card.meters[0].includes('التخزين')
    && card.meters[1].includes('مساعد نَظْم')
    && card.meters[2].includes('أعضاء الفريق'), JSON.stringify(card.meters));
  check('Q14 the bar reflects real usage', card.fill === '72%', String(card.fill));
  check('Q14b the free tier is told how much room is left', card.note.includes('72%'), card.note);
  check('Q14c a counted assistant shows its number, not "included"',
    card.meters[1].includes('3') && card.meters[1].includes('10'), card.meters[1]);

  await page.click('#plan-panel .btn-p');
  await page.waitForTimeout(400);
  const sheet = await page.evaluate(() => ({
    open: document.getElementById('sh-plans').classList.contains('open'),
    note: document.querySelector('#plans-body .plan-note')?.textContent || '',
    featured: document.querySelector('#plans-body .plan-card.featured .plan-name')?.textContent,
  }));
  check('Q15 upgrade button opens the plans sheet', sheet.open, JSON.stringify(sheet.open));
  check('Q16 the sheet promises no data loss', sheet.note.includes('لا يحذف'), sheet.note.slice(0, 60));
  check('Q17 the popular plan is highlighted', sheet.featured === 'احترافي', String(sheet.featured));

  const monthly = await page.evaluate(() => [...document.querySelectorAll('#plans-body .plan-amount')].map(n => n.textContent));
  check('Q17b in-app monthly prices match the published table',
    JSON.stringify(monthly) === JSON.stringify(['69', '159', '279']), JSON.stringify(monthly));

  await page.click('#plans-body .gate-billing-opt:nth-child(2)');
  await page.waitForTimeout(250);
  const yearly = await page.evaluate(() => ({
    prices: [...document.querySelectorAll('#plans-body .plan-amount')].map(n => n.textContent),
    unit: document.querySelector('#plans-body .plan-unit')?.textContent,
    note: document.querySelector('#plans-body .gate-annual-note')?.textContent || '',
    enterprise: [...document.querySelectorAll('#plans-body .plan-card')].pop()?.innerText || '',
  }));
  check('Q17c the annual cycle shows the published yearly figures',
    JSON.stringify(yearly.prices) === JSON.stringify(['690', '1,590', '2,790'])
    && yearly.unit === 'ريال / سنة' && yearly.note.includes('شهران مجاناً'), JSON.stringify(yearly.prices));
  check('Q17d enterprise promises custom limits, not unlimited',
    yearly.enterprise.includes('حدود مخصصة') && !yearly.enterprise.includes('بلا حد'),
    yearly.enterprise.replace(/\n/g, ' / ').slice(0, 120));
  await page.click('#plans-body .gate-billing-opt:nth-child(1)');
  await page.waitForTimeout(200);

  // nothing may claim a plan was bought while no provider is connected
  const activated = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('#plans-body .plan-card')];
    const pro = cards.find(c => c.querySelector('.plan-name').textContent === 'احترافي');
    pro.querySelector('button').click();
    await new Promise(r => setTimeout(r, 300));
    const { currentPlan } = await import('/src/subscription.js');
    return { plan: currentPlan().id, toast: document.querySelector('.toast')?.innerText || '' };
  });
  check('Q18 choosing a plan never activates it client-side',
    activated.plan === 'free' && /قيد التفعيل/.test(activated.toast), JSON.stringify(activated));
  await page.close();
}

// ── local mode: no plan, no ceiling ────────────────────────────────────────
{
  const { page, errs } = await appWith({ used: 500, status: 'local' });
  const b = await banner(page);
  check('Q19 device-only mode shows no quota banner', b.shown === false, JSON.stringify(b));
  await page.click('#t-set');
  await page.waitForTimeout(400);
  const card = await page.evaluate(() => document.getElementById('plan-panel').innerText);
  check('Q20 device-only card explains the mode', card.includes('هذا الجهاز فقط'), card.replace(/\n/g, ' / ').slice(0, 120));

  await page.click('#t-home');
  await page.waitForTimeout(300);
  await page.click('.nacts button[aria-label="إضافة قطعة"]');
  await page.waitForTimeout(400);
  const formOpen = await page.evaluate(() => document.getElementById('sh-add').classList.contains('open'));
  check('Q21 device-only mode is never blocked', formOpen === true);
  check('Q22 no errors in device-only mode', errs.length === 0, errs.join(' | ').slice(0, 200));
  await page.close();
}

await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
