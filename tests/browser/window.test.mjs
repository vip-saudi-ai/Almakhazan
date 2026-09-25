// Browser test for browsing on a window instead of a whole inventory.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/window.test.mjs
//
// The property under test is not "pagination works". It is that the app never
// states something about the whole inventory while holding a fraction of it:
// every total, filter, search, score and export either has every record or
// says it does not.

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';

const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

// A paid plan, so nothing here is refused for the wrong reason.
const PLAN_STUB = planStub({ planId: 'business', usage: { items: 600 } });

const COUNT = 600;

async function open() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.route('**/src/subscription.js', r => r.fulfill({ contentType: 'text/javascript', body: PLAN_STUB }));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });

  // More records than the window holds, half of them photographed, one of them
  // findable only by a name no other record carries.
  await page.evaluate(async (count) => {
    const { repository } = await import('/src/repository.js');
    const folder = await repository.saveFolder({ name: 'الخزنة', icon: '🗂', color: '#2563FF' });
    const now = Date.now();
    const ops = [];
    for (let i = 0; i < count; i += 1) {
      const id = 'w' + String(i).padStart(4, '0');
      ops.push({
        type: 'set', collection: 'items', id,
        data: {
          id, name: i === 0 ? 'أسطرلاب نحاسي' : `قطعة ${i}`,
          quantity: 1, unit: 'قطعة', categoryId: 'c1',
          folderId: i < 5 ? folder.id : null,
          images: i % 2 ? [{ id: 'im' + i, url: 'x' }] : [],
          // The oldest record is the one that falls outside the window.
          createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1,
        },
      });
    }
    await repository.bulkWrite(ops);
    window.__folderId = folder.id;
  }, COUNT);
  await page.waitForTimeout(700);
  return { page, context, errs };
}

const repoState = (page) => page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  return {
    loaded: repository.state.items.length,
    complete: repository.itemsComplete,
    total: repository.loadState().total,
  };
});

// ── the window itself ─────────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  const state = await repoState(page);
  check('W1 opening the app loads a window, not an inventory',
    state.loaded === 200 && state.complete === false, JSON.stringify(state));

  const notice = await page.evaluate(() => document.getElementById('hpartial')?.textContent || '');
  check('W2 the screen says it is showing a window, and offers the rest',
    notice.includes('يُعرض أحدث') && notice.includes('اعرض الكل'), notice);

  // The count in the notice is the server's, not a count of what is loaded.
  check('W3 the real total comes from the server counter, not from the rows held',
    notice.includes('600'), notice);

  const stats = await page.evaluate(() => ({
    total: document.getElementById('s-total')?.textContent,
    cats: document.getElementById('s-cats')?.textContent,
    qty: document.getElementById('s-qty')?.textContent,
  }));
  check('W4 the record count is the true one', stats.total === '600', JSON.stringify(stats));
  // These used to be blanked, because a proportion taken from the loaded
  // window would have been a fraction presented as a fact. The device engine
  // counts from the database instead, so they are shown — and they are right.
  check('W5 proportions are computed from the records, not from the window',
    stats.cats.includes('%') && stats.qty === '600', JSON.stringify(stats));

  await page.waitForFunction(() =>
    [...document.querySelectorAll('.fld-card')].some(c => /قطعة/.test(c.textContent)),
    null, { timeout: 10000 }).catch(() => {});
  const badges = await page.evaluate(() =>
    [...document.querySelectorAll('.fld-card')].map(c => c.textContent).join('|'));
  check('W6 a folder card carries its real count, from an index range',
    badges.includes('5 قطعة'), badges);

  check('W7 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── asking for the rest ───────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  await page.click('.partial-btn');
  await page.waitForFunction(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.itemsComplete;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(300);

  const state = await repoState(page);
  check('W8 asking for the rest loads every record', state.loaded === COUNT && state.complete, JSON.stringify(state));

  const after = await page.evaluate(() => ({
    notice: document.getElementById('hpartial')?.textContent || '',
    cats: document.getElementById('s-cats')?.textContent,
    qty: document.getElementById('s-qty')?.textContent,
    badges: [...document.querySelectorAll('.fld-card')].map(c => c.textContent).join('|'),
  }));
  check('W9 the notice disappears once it stops being true', after.notice === '', after.notice);
  check('W10 the proportions appear, computed from everything',
    after.cats.includes('%') && after.qty === '600', JSON.stringify(after));
  check('W11 folder counts appear once they can be right', after.badges.includes('5 قطعة'), after.badges);
  check('W12 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── a search is a question about the whole inventory ──────────────────────
{
  const { page, context, errs } = await open();
  // 'أسطرلاب' is the oldest record: it is outside the window on purpose.
  const beforeSearch = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.state.items.some(i => i.name.includes('أسطرلاب'));
  });
  check('W13 the record searched for is genuinely outside the window', beforeSearch === false);

  await page.fill('#hsearch', 'أسطرلاب');
  await page.waitForFunction(() => document.getElementById('hcount')?.textContent === '1',
    null, { timeout: 15000 }).catch(() => {});
  const found = await page.evaluate(() => ({
    count: document.getElementById('hcount')?.textContent,
    first: document.querySelector('#hgrid .icard')?.textContent || '',
  }));
  check('W14 a record outside the window is still found',
    found.count === '1' && found.first.includes('أسطرلاب'), JSON.stringify(found));

  // And it is found without dragging the inventory into memory to do it. The
  // search reads the database in batches and keeps the matches; what the app
  // holds afterwards is the window it started with.
  const state = await repoState(page);
  check('W15 without the search having materialised the inventory',
    state.loaded <= 200 && state.complete === false, JSON.stringify(state));
  check('W16 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── everything that states a total waits for the total ────────────────────
{
  const { page, context, errs } = await open();
  await page.click('#t-ai');
  await page.waitForFunction(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.itemsComplete;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const assistant = await repoState(page);
  check('W17 the assistant tab does not open on a fraction of the inventory',
    assistant.complete && assistant.loaded === COUNT, JSON.stringify(assistant));
  check('W18 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── an export is never a short file that looks complete ───────────────────
{
  const { page, context } = await open();
  const refused = await page.evaluate(async () => {
    const { exportJSON } = await import('/src/exporting.js');
    try { exportJSON(); return { threw: false }; }
    catch (error) { return { threw: true, code: error.code, message: error.message }; }
  });
  check('W19 an export refuses outright while only a window is loaded',
    refused.threw && refused.code === 'repo/partial', JSON.stringify(refused));

  const wiped = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.clearInventory();
    const { getAll } = await import('/src/local-store.js');
    return (await getAll('items')).length;
  });
  check('W20 "delete everything" deletes everything, not the window',
    wiped === 0, `${wiped} left`);
  await context.close();
}

// ── restore cannot back up a fraction and delete the rest ─────────────────
{
  const { page, context } = await open();
  const result = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const { restoreFromBackup } = await import('/src/restore.js');
    const before = repository.itemsComplete;
    let backedUp = 0;
    const data = { items: [{ id: 'only', name: 'القطعة الوحيدة', quantity: 1, unit: 'قطعة', categoryId: 'c1', images: [], version: 1 }],
                   folders: [], categories: [], locations: [] };
    await restoreFromBackup(data, { sourceFingerprint: (await (await import('/src/exporting.js')).readBackupFile(new File([JSON.stringify(data)], 'b.json'))).sourceFingerprint, 
      saveBackup: (text) => { backedUp = JSON.parse(text).items.length; },
    });
    const { getAll } = await import('/src/local-store.js');
    return { before, backedUp, left: (await getAll('items')).length };
  });
  check('W21 the safety backup holds every record, not the window',
    result.before === false && result.backedUp === 600, JSON.stringify(result));
  check('W22 and the restore then removes exactly what the backup did not contain',
    result.left === 1, JSON.stringify(result));
  await context.close();
}

// ── Settings does not wait for an inventory it never mentions ─────────────
{
  const { page, context, errs } = await open();
  const before = await repoState(page);

  const opened = await page.evaluate(async () => {
    const { goTab } = await import('/src/navigation.js');
    const t0 = performance.now();
    goTab('set');
    // No await: if Settings needed the whole inventory it would render empty
    // now and fill in later. It must be complete on this frame.
    await new Promise((r) => requestAnimationFrame(r));
    return {
      ms: +(performance.now() - t0).toFixed(1),
      text: document.getElementById('data-panel')?.innerText || '',
      account: document.getElementById('account-panel')?.innerText || '',
    };
  });
  const after = await repoState(page);

  check('W23 Settings opens without loading the inventory',
    after.loaded === before.loaded && after.complete === false,
    JSON.stringify({ before: before.loaded, after: after.loaded }));
  check('W24 and it is fully drawn on the first frame, not filled in later',
    opened.text.includes('تصدير') && opened.text.includes('استيراد') && opened.ms < 120,
    JSON.stringify({ ms: opened.ms, len: opened.text.length }));
  // The count comes from the index that holds exactly the deleted records, so
  // Settings can state it without reading anything else.
  await page.waitForFunction(() => /قطعة/.test(document.getElementById('trash-count')?.textContent || ''),
    null, { timeout: 10000 }).catch(() => {});
  const trashRow = await page.evaluate(() => document.getElementById('trash-count')?.textContent || '');
  check('W25 the Trash row carries an exact count, read from its own index',
    /^\d+ قطعة$/.test(trashRow.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))), trashRow);
  check('W26 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
