// Browser test for bulk selection.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/bulk.test.mjs

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

// The plan decides whether bulk actions exist at all, so the stub drives it.
function stub(feature) {
  return planStub({ planId: feature ? 'pro' : 'free', usage: { items: 4 } });
}

async function open({ bulk = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.route('**/src/subscription.js', r => r.fulfill({ contentType: 'text/javascript', body: stub(bulk) }));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const folder = await repository.saveFolder({ name: 'الخزنة', icon: '🗂', color: '#2563FF' });
    const now = Date.now();
    await repository.bulkWrite(['ساعة جيب', 'لوحة زيتية', 'خاتم ذهب', 'سيف عثماني'].map((name, i) => ({
      type: 'set', collection: 'items', id: 'b' + i,
      data: { id: 'b' + i, name, quantity: 1, unit: 'قطعة', categoryId: 'c1', images: [],
              createdAt: now - i * 1000, updatedAt: now, version: 1 },
    })));
    window.__folderId = folder.id;
  });
  await page.waitForTimeout(400);
  return { page, context, errs };
}

const startSelecting = async (page) => page.evaluate(async () => {
  const { startSelection } = await import('/src/views/home.js');
  startSelection();
});

// ── the plan gate ─────────────────────────────────────────────────────────
{
  const { page, context } = await open({ bulk: false });
  await startSelecting(page);
  await page.waitForTimeout(400);
  const gated = await page.evaluate(() => ({
    bar: document.getElementById('select-bar').style.display,
    plans: document.getElementById('sh-plans').classList.contains('open'),
    reason: document.querySelector('#plans-body .plan-alert')?.textContent || '',
  }));
  check('B1 a plan without bulk actions is told so, and shown the plans',
    gated.bar === 'none' && gated.plans && gated.reason.includes('الإجراءات الجماعية'), JSON.stringify(gated));
  await context.close();
}

// ── selecting ─────────────────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  await startSelecting(page);
  await page.waitForTimeout(300);

  const entered = await page.evaluate(() => ({
    bar: document.getElementById('select-bar').style.display,
    count: document.querySelector('.selbar-count')?.textContent,
    marks: document.querySelectorAll('.pickmark').length,
    role: document.querySelector('#hgrid .icard')?.getAttribute('role'),
    disabled: [...document.querySelectorAll('.selact')].every(b => b.disabled),
  }));
  check('B2 selection mode is visible and every card becomes a checkbox',
    entered.bar === 'flex' && entered.marks === 4 && entered.role === 'checkbox', JSON.stringify(entered));
  check('B3 with nothing chosen, no action is offered', entered.disabled === true);

  await page.click('#hgrid .icard');
  await page.waitForTimeout(250);
  const one = await page.evaluate(() => ({
    count: document.querySelector('.selbar-count')?.textContent,
    checked: document.querySelector('#hgrid .icard')?.getAttribute('aria-checked'),
    detailOpen: document.getElementById('sh-det').classList.contains('open'),
    enabled: [...document.querySelectorAll('.selact')].some(b => !b.disabled),
  }));
  check('B4 tapping a card picks it instead of opening it',
    one.count.includes('1') && one.checked === 'true' && !one.detailOpen && one.enabled, JSON.stringify(one));

  await page.click('.selbar-all');
  await page.waitForTimeout(250);
  const all = await page.evaluate(() => document.querySelector('.selbar-count')?.textContent);
  check('B5 the page can be selected at once', all.includes('4'), all);

  // ── change a field across the selection ──
  await page.evaluate(() => [...document.querySelectorAll('.selact')].find(b => b.textContent.includes('نقل')).click());
  await page.waitForTimeout(350);
  const sheet = await page.evaluate(() => ({
    open: document.getElementById('sh-bulk').classList.contains('open'),
    title: document.getElementById('bulk-title')?.textContent,
    options: [...document.querySelectorAll('#bulk-options .srowl')].map(n => n.textContent),
  }));
  check('B6 moving offers the folders that exist', sheet.open && sheet.options.some(o => o.includes('الخزنة')), JSON.stringify(sheet));

  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#bulk-options .srow-btn')].find(b => b.textContent.includes('الخزنة'));
    row.click();
  });
  await page.waitForFunction(
    () => document.getElementById('select-bar').style.display === 'none', null, { timeout: 5000 },
  ).catch(() => {});
  const moved = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const inFolder = repository.liveItems().filter(i => i.folderId === window.__folderId);
    return {
      moved: inFolder.length,
      versionsBumped: inFolder.every(i => (i.version ?? 1) >= 2),
      barGone: document.getElementById('select-bar').style.display === 'none',
    };
  });
  check('B7 the whole selection moves in one action', moved.moved === 4, JSON.stringify(moved));
  check('B8 every changed record gets a new version', moved.versionsBumped, String(moved.versionsBumped));
  check('B9 the mode ends once the action is done', moved.barGone, String(moved.barGone));

  // ── only the fields a bulk edit is allowed to touch ──
  const refused = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    try {
      await repository.bulkUpdate(['b0'], { name: 'اسم مفروض جماعياً' });
      return { threw: false };
    } catch (error) {
      return { threw: true, code: error.code, name: repository.item('b0').name };
    }
  });
  check('B10 a bulk edit cannot rewrite a field it has no business touching',
    refused.threw && refused.code === 'repo/bulk-field' && refused.name === 'ساعة جيب', JSON.stringify(refused));

  check('B12 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  await context.close();
}

// ── delete goes to Trash, not to nothing ─────────────────────────────────
{
  const { page, context } = await open();
  await startSelecting(page);
  await page.waitForTimeout(250);
  await page.click('.selbar-all');
  await page.waitForTimeout(200);
  await page.evaluate(() => [...document.querySelectorAll('.selact')].find(b => b.textContent.includes('حذف')).click());
  await page.waitForFunction(
    () => document.getElementById('del-confirm')?.classList.contains('open'), null, { timeout: 5000 },
  );
  await page.click('#del-confirm-btn');
  await page.waitForFunction(
    () => document.getElementById('hempty')?.style.display === 'flex', null, { timeout: 6000 },
  ).catch(() => {});
  const trashed = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return { live: repository.liveItems().length, trash: repository.trashedItems().length };
  });
  check('B11 deleting a selection moves it to Trash, recoverably',
    trashed.live === 0 && trashed.trash === 4, JSON.stringify(trashed));

  const exitable = await page.evaluate(() => ({
    bar: document.getElementById('select-bar').style.display,
    empty: document.getElementById('hempty').style.display,
  }));
  check('B13 an empty page still offers the way out of selection mode',
    exitable.bar !== 'none' || exitable.empty === 'flex', JSON.stringify(exitable));

  await context.close();
}

await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
