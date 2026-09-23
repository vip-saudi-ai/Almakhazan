// Browser test for spreadsheet import.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/import.test.mjs
//
// The file used here carries every mess a real export has: a semicolon
// separator, a blank row, a row with no name, Arabic-Indic digits, a quantity
// written as a word, a condition that is not one of ours, a quoted comma, and
// two taxonomy names that do not exist yet.
//
// What is being tested is not "the import works". It is that the screen shows
// exactly what the write will do before it does it, and that nothing is
// invented to make a messy file look clean.

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
import { planStub } from './plan-stub.mjs';

const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);


async function open({ limit = 5000 } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.route('**/src/subscription.js', r => r.fulfill({ contentType: 'text/javascript', body: planStub({ planId: 'pro', quotaLimit: limit }) }));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  return { page, context, errs };
}

/** Feeds a fixture in without a file picker, through the same entry point. */
async function feed(page, path, name) {
  await page.evaluate(async ({ path, name }) => {
    const { readSpreadsheet } = await import('/src/spreadsheet.js');
    const mod = await import('/src/views/sheet-import.js');
    const res = await fetch(path);
    const file = new File([await res.blob()], name);
    window.__sheet = await readSpreadsheet(file);
    await mod.openSpreadsheetImport(file);
  }, { path, name });
  await page.waitForTimeout(400);
}

const body = (page) => page.evaluate(() => document.getElementById('simport-body').innerText);
const foot = (page) => page.evaluate(() => document.getElementById('simport-foot').innerText);

// ── mapping ───────────────────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  await feed(page, '/tests/fixtures/inventory.csv', 'inventory.csv');

  const mapped = await page.evaluate(() => {
    const value = (key) => {
      const select = document.getElementById('map-' + key);
      return select ? (select.value === '' ? null : select.options[select.selectedIndex].textContent) : 'missing';
    };
    return {
      name: value('name'), quantity: value('quantity'), category: value('category'),
      location: value('location'), condition: value('condition'), description: value('description'),
      sku: value('sku'), barcode: value('barcode'),
    };
  });
  check('I1 a semicolon file is read as columns, not as one',
    mapped.name === 'الاسم' && mapped.quantity === 'الكميه', JSON.stringify(mapped));
  check('I2 Arabic headers are matched despite spelling — الكميه, الحاله',
    mapped.condition === 'الحاله' && mapped.category === 'التصنيف' && mapped.location === 'الموقع', JSON.stringify(mapped));
  check('I3 a header nobody recognises is left on «تجاهل», not guessed',
    mapped.sku === null && mapped.barcode === null, JSON.stringify(mapped));
  check('I4 ملاحظات is recognised as the description', mapped.description === 'ملاحظات', String(mapped.description));

  const preview = await page.evaluate(() => ({
    headers: [...document.querySelectorAll('.imp-table th')].map(n => n.textContent),
    first: [...document.querySelectorAll('.imp-table tbody tr:first-child td')].map(n => n.textContent),
  }));
  check('I5 the file is previewed as it is, quoted commas intact',
    preview.first[6] === 'ذهب, عيار 18', JSON.stringify(preview.first));

  check('I6 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── the confirm screen is the whole truth ─────────────────────────────────
{
  const { page, context, errs } = await open();
  await feed(page, '/tests/fixtures/inventory.csv', 'inventory.csv');
  await page.evaluate(() => [...document.querySelectorAll('#simport-foot button')].find(b => b.textContent.includes('معاينة')).click());
  await page.waitForTimeout(350);

  const t = await body(page);
  check('I7 the count to be written is stated', /4\s*قطعة ستُضاف/.test(t.replace(/\n/g, ' ')), t.replace(/\n/g, ' / ').slice(0, 160));
  check('I8 new taxonomy is declared before it is created, by name',
    t.includes('سيُنشأ') && t.includes('أسلحة') && t.includes('المستودع'), t.replace(/\n/g, ' / ').slice(0, 260));
  check('I9 the row with no name is reported, not silently dropped',
    t.includes('بلا اسم'), t.replace(/\n/g, ' / ').slice(0, 260));
  check('I10 an unreadable quantity is reported with the cell that caused it',
    t.includes('ثلاثة'), t.replace(/\n/g, ' / ').slice(0, 260));
  check('I11 a condition outside the list is reported, not coerced',
    t.includes('رائعة'), t.replace(/\n/g, ' / ').slice(0, 260));
  check('I12 the screen says the import only adds', t.includes('يضيف فقط'), t.slice(-120));
  // Line 5 of the file is the blank row. The bad quantity is on line 6, and a
  // warning that said 5 would send the customer to the wrong row in Excel.
  check('I13 warnings name the row in the file, not the row after blanks were dropped',
    t.includes('صف 4') && t.includes('صف 6') && !t.includes('صف 5'),
    t.replace(/\n/g, ' / ').slice(0, 300));

  const button = await foot(page);
  check('I14 the button names the number it will write', button.includes('4'), button.replace(/\n/g, ' / '));
  check('I15 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── what actually lands ───────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  await feed(page, '/tests/fixtures/inventory.csv', 'inventory.csv');
  await page.evaluate(() => [...document.querySelectorAll('#simport-foot button')].find(b => b.textContent.includes('معاينة')).click());
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('#simport-foot button')].find(b => b.textContent.includes('استيراد')).click());
  await page.waitForFunction(() => !document.getElementById('sh-simport').classList.contains('open'), null, { timeout: 15000 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const items = repository.liveItems();
    const byName = (n) => items.find(i => i.name === n);
    const cat = (id) => repository.state.categories.find(c => c.id === id)?.name;
    const loc = (id) => repository.state.locations.find(l => l.id === id)?.name;
    return {
      count: items.length,
      watch: byName('ساعة جيب') && {
        quantity: byName('ساعة جيب').quantity,
        condition: byName('ساعة جيب').condition,
        category: cat(byName('ساعة جيب').categoryId),
        location: loc(byName('ساعة جيب').locationId),
        valuation: byName('ساعة جيب').valuation,
        description: byName('ساعة جيب').description,
      },
      painting: byName('لوحة زيتية') && {
        quantity: byName('لوحة زيتية').quantity,
        condition: byName('لوحة زيتية').condition,
        valuation: byName('لوحة زيتية').valuation,
      },
      ring: byName('خاتم') && { quantity: byName('خاتم').quantity, condition: byName('خاتم').condition },
      sword: byName('سيف عثماني') && {
        category: cat(byName('سيف عثماني').categoryId),
        location: loc(byName('سيف عثماني').locationId),
      },
      nameless: items.some(i => !i.name),
    };
  });

  check('I16 exactly the named rows were written', result.count === 4 && !result.nameless, JSON.stringify({ count: result.count, nameless: result.nameless }));
  check('I17 a mapped row lands with every field it had',
    result.watch.quantity === 2 && result.watch.condition === 'ممتازة'
    && result.watch.category === 'مقتنيات' && result.watch.location === 'الخزنة'
    && result.watch.valuation.min === 1500 && result.watch.description === 'ذهب, عيار 18',
    JSON.stringify(result.watch));
  check('I18 an Arabic-Indic digit is a number', result.painting.quantity === 1, JSON.stringify(result.painting));
  check('I19 «جيده» is «جيدة» — the spelling is folded, the value is real',
    result.painting.condition === 'جيدة', String(result.painting.condition));
  check('I20 an empty price writes no valuation at all', !result.painting.valuation?.min, JSON.stringify(result.painting.valuation));
  check('I21 an unreadable quantity falls back to 1 — after saying so',
    result.ring.quantity === 1, JSON.stringify(result.ring));
  check('I22 an unknown condition is left empty rather than guessed',
    !result.ring.condition, JSON.stringify(result.ring));
  check('I23 new taxonomy was created and the record points at it',
    result.sword.category === 'أسلحة' && result.sword.location === 'المستودع', JSON.stringify(result.sword));
  check('I24 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── a plan that cannot hold the file ──────────────────────────────────────
{
  const { page, context, errs } = await open({ limit: 2 });
  await feed(page, '/tests/fixtures/inventory.csv', 'inventory.csv');
  await page.evaluate(() => [...document.querySelectorAll('#simport-foot button')].find(b => b.textContent.includes('معاينة')).click());
  await page.waitForTimeout(300);

  const t = await body(page);
  const disabled = await page.evaluate(() =>
    [...document.querySelectorAll('#simport-foot button')].find(b => b.textContent.includes('استيراد'))?.disabled);
  check('I25 a file larger than the plan is refused before anything is written, with the numbers',
    t.includes('لا تتسع خطتك') && t.includes('2'), t.replace(/\n/g, ' / ').slice(0, 220));
  check('I26 and the import button cannot be pressed', disabled === true, String(disabled));

  const written = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return repository.liveItems().length;
  });
  check('I27 nothing was written', written === 0, String(written));

  // §38–§41. Two limits that constrain different things: how much of a file
  // may be read, and how much the workspace may hold. Both are on the screen,
  // and the one that bites is the reason the import is blocked rather than
  // trimmed to fit.
  check('I27b both limits are named, not just whichever one bit',
    t.includes('الحدود') && t.includes('صفّاً لكل ملف') && t.includes('قطعة متبقية في خطتك'),
    t.replace(/\n/g, ' / ').slice(0, 300));
  check('I27c and it says nothing will be written, rather than a part of it',
    /\b0\b[\s\S]*قطعة ستُكتب الآن/.test(t) && t.includes('الاستيراد الناقص'),
    t.replace(/\n/g, ' / ').slice(0, 300));

  // The button is disabled, but the rule is also asked again where the screen
  // cannot skip it: calling the write path directly must refuse too.
  const forced = await page.evaluate(async () => {
    const mod = await import('/src/views/sheet-import.js');
    await mod.__runForTest();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const { repository } = await import('/src/repository.js');
    return {
      items: repository.liveItems().length,
      toast: (document.querySelector('.toast') || {}).innerText || '',
    };
  });
  check('I27d pressing past the screen does not write a part of the file',
    forced.items === 0, String(forced.items));
  check('I27e it refuses with the numbers instead',
    /المتبقي في خطتك/.test(forced.toast), JSON.stringify(forced.toast));

  check('I28 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── XLSX ──────────────────────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  await feed(page, '/tests/fixtures/sample.xlsx', 'sample.xlsx');
  const read = await page.evaluate(() => window.__sheet);
  check('I29 a real xlsx is read: shared or inline strings, dates, gaps',
    read.headers[0] === 'الاسم' && read.rows[0][4] === '2024-03-17' && read.rows[2][5] === '&ampersand',
    JSON.stringify(read.rows[2]));
  check('I30 an empty cell stays in its own column', read.rows[2][3] === '' && read.rows[2][4] === '',
    JSON.stringify(read.rows[2]));

  const legacy = await page.evaluate(async () => {
    const { readSpreadsheet } = await import('/src/spreadsheet.js');
    try { await readSpreadsheet(new File(['x'], 'old.xls')); return null; }
    catch (error) { return { code: error.code, message: error.message }; }
  });
  check('I31 .xls is refused by name with a way out, not half-read',
    legacy?.code === 'sheet/legacy-xls' && legacy.message.includes('.csv'), JSON.stringify(legacy));
  check('I32 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── the plan allowance is enforced, not merely displayed ───────────────────
for (const [planId, allowance] of [['free', 200], ['personal', 2000]]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.route('**/src/subscription.js', r => r.fulfill({
    contentType: 'text/javascript', body: planStub({ planId }),
  }));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 20000 });

  const outcome = await page.evaluate(async ({ allowance }) => {
    const { readSpreadsheet } = await import('/src/spreadsheet.js');
    const { canImportRows, importLimit } = await import('/src/subscription.js');

    const make = (rows) => new File(
      ['الاسم,الكمية\n' + Array.from({ length: rows }, (_, i) => `قطعة ${i},1`).join('\n') + '\n'],
      'big.csv', { type: 'text/csv' },
    );

    const limit = importLimit();
    const atLimit = await readSpreadsheet(make(allowance), { rowLimit: limit.effective });
    const over = await readSpreadsheet(make(allowance + 1), { rowLimit: limit.effective });

    return {
      limit: limit.effective,
      boundBy: limit.boundBy,
      atLimitRows: atLimit.rows.length,
      atLimitTruncated: atLimit.truncated,
      overRows: over.rows.length,
      overTruncated: over.truncated,
      // And the rule, independent of what the reader did.
      allowedAtLimit: canImportRows(allowance).allowed,
      allowedOver: canImportRows(allowance + 1).allowed,
      message: canImportRows(allowance + 1).message || '',
    };
  }, { allowance });

  check(`L-${planId} the allowance is the plan's`, outcome.limit === allowance && outcome.boundBy === 'plan',
    JSON.stringify(outcome));
  check(`L-${planId} a file exactly at the limit is read whole`,
    outcome.atLimitRows === allowance && outcome.atLimitTruncated === false, JSON.stringify(outcome));
  check(`L-${planId} a file one row over stops at the limit and says so`,
    outcome.overRows === allowance && outcome.overTruncated === true, JSON.stringify(outcome));
  check(`L-${planId} the rule allows the limit and refuses one more`,
    outcome.allowedAtLimit === true && outcome.allowedOver === false, JSON.stringify(outcome));
  check(`L-${planId} and the refusal names the plan`, /خطة/.test(outcome.message), outcome.message);
  check(`L-${planId} no JS errors`, errs.length === 0, errs[0]);
  await context.close();
}

// ── Business can process what Business was sold ────────────────────────────
{
  const { page, context, errs } = await open();

  const big = await page.evaluate(async () => {
    const { readSpreadsheet, MAX_ROWS } = await import('/src/spreadsheet.js');
    const { importRowLimit } = await import('/src/entitlements.js');
    const { PLAN_CONFIG } = await import('/src/plans.generated.js');

    const entitlement = { plan: PLAN_CONFIG.plans.business, planId: 'business' };
    const limit = importRowLimit({ entitlement }, MAX_ROWS);

    // A realistic 50,000-row export: five columns, Arabic names, no images.
    const header = 'الاسم,الكمية,التصنيف,الرمز,السعر\n';
    const lines = new Array(50000);
    for (let i = 0; i < 50000; i += 1) lines[i] = `قطعة ${i},1,ساعات,INV-${i},${1000 + i}`;
    const file = new File([header + lines.join('\n') + '\n'], 'business.csv', { type: 'text/csv' });

    const t0 = performance.now();
    const sheet = await readSpreadsheet(file, { rowLimit: limit.effective });
    const ms = Math.round(performance.now() - t0);

    return {
      limit: limit.effective,
      rows: sheet.rows.length,
      truncated: sheet.truncated,
      headers: sheet.headers.length,
      firstRow: sheet.rows[0],
      lastRow: sheet.rows[sheet.rows.length - 1],
      ms,
      bytes: file.size,
    };
  });

  check('L-business the allowance really is 50,000', big.limit === 50000, String(big.limit));
  check('L-business all 50,000 rows are read', big.rows === 50000 && big.truncated === false,
    JSON.stringify({ rows: big.rows, truncated: big.truncated }));
  check('L-business with the columns intact at both ends',
    big.headers === 5 && big.firstRow[0] === 'قطعة 0' && big.lastRow[0] === 'قطعة 49999',
    JSON.stringify({ first: big.firstRow, last: big.lastRow }));
  check('L-business and the tab survives reading it',
    big.ms < 20000, `${big.ms}ms for ${Math.round(big.bytes / 1024)}KB`);
  check('L-business no JS errors', errs.length === 0, errs[0]);
  await context.close();
}


// ── the file must be identifiable ─────────────────────────────────────────
//
// The fingerprint is what decides whether a picked file is the one a stopped
// import was writing. There is no weaker fallback for it: name and size are
// not identity, and resuming the wrong file would write last week's numbers
// under this week's record ids. So when the digest is unavailable — an
// insecure origin, a locked-down browser, a hardware failure — the import has
// to stop before it has written anything, and say so.
{
  const { page, context, errs } = await open();

  const before = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    return { items: await local.count('items') };
  });

  const outcome = await page.evaluate(async () => {
    const mod = await import('/src/views/sheet-import.js');
    const original = crypto.subtle.digest;
    // What a browser that refuses SubtleCrypto actually does.
    crypto.subtle.digest = () => Promise.reject(new DOMException('denied', 'NotSupportedError'));
    try {
      const res = await fetch('/tests/fixtures/inventory.csv');
      const file = new File([await res.blob()], 'inventory.csv');
      await mod.openSpreadsheetImport(file);
    } finally {
      crypto.subtle.digest = original;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    const local = await import('/src/local-store.js');
    const sheet = document.getElementById('simport');
    return {
      opened: Boolean(sheet && sheet.classList.contains('open')),
      toast: (document.querySelector('.toast') || {}).innerText || '',
      jobs: await local.count('importJobs'),
      items: await local.count('items'),
    };
  });

  check('F1 an unidentifiable file does not open the import flow',
    outcome.opened === false, String(outcome.opened));
  check('F2 it says so in Arabic instead of failing silently',
    /هوية الملف/.test(outcome.toast), JSON.stringify(outcome.toast));
  check('F3 no import job was recorded', outcome.jobs === 0, String(outcome.jobs));
  check('F4 and no records were written',
    outcome.items === before.items, JSON.stringify({ before: before.items, after: outcome.items }));
  // The refusal itself is reported to the console by the error toast, which is
  // the intended behaviour here; anything else is not.
  const unexpected = errs.filter((line) => !/هوية الملف/.test(line));
  check('F5 the refusal is the only thing logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── a large xlsx is read without the tab dying ────────────────────────────
//
// §77. The numbers printed here are what this machine measured in this run of
// headless Chromium; they are not a promise about a phone. What is being
// asserted is only the shape: that every row arrives, that the columns are
// intact at both ends, and that the time does not explode as the file grows.
{
  const { page, context, errs } = await open({ limit: 60000 });

  const sizes = [5000, 10000, 20000, 50000];
  const results = [];
  for (const rows of sizes) {
    const measured = await page.evaluate(async (count) => {
      const { makeXlsx } = await import('/tests/browser/make-xlsx.mjs');
      const { readSpreadsheet } = await import('/src/spreadsheet.js');
      const file = await makeXlsx(count);

      const heapBefore = performance.memory ? performance.memory.usedJSHeapSize : null;
      const t0 = performance.now();
      const sheet = await readSpreadsheet(file, { rowLimit: 60000 });
      const ms = Math.round(performance.now() - t0);
      const heapAfter = performance.memory ? performance.memory.usedJSHeapSize : null;

      return {
        bytes: file.size,
        ms,
        rows: sheet.rows.length,
        truncated: sheet.truncated,
        headers: sheet.headers.length,
        first: sheet.rows[0],
        last: sheet.rows[sheet.rows.length - 1],
        heapMB: heapBefore == null ? null : Math.round((heapAfter - heapBefore) / 1048576),
      };
    }, rows);
    results.push({ rows, ...measured });

    check(`X-${rows} every row arrives`,
      measured.rows === rows && measured.truncated === false,
      JSON.stringify({ rows: measured.rows, truncated: measured.truncated }));
    check(`X-${rows} the columns are intact at both ends`,
      measured.headers === 5
      && measured.first[0] === 'قطعة رقم 0'
      && measured.last[0] === `قطعة رقم ${rows - 1}`
      && measured.last[3] === `INV-${String(rows - 1).padStart(6, '0')}`,
      JSON.stringify({ first: measured.first, last: measured.last }));
    check(`X-${rows} and the tab survives reading it`,
      measured.ms < 30000,
      `${measured.ms}ms · ${Math.round(measured.bytes / 1024)}KB compressed · heap +${measured.heapMB}MB`);
  }

  // Four times the rows must not cost anything like sixteen times the time.
  const small = results[0];
  const large = results[results.length - 1];
  const growth = large.ms / Math.max(1, small.ms);
  check('X-scaling the cost grows with the file, not with its square',
    growth < (large.rows / small.rows) * 2.5,
    `${small.rows}→${small.ms}ms, ${large.rows}→${large.ms}ms (×${growth.toFixed(1)} for ×${large.rows / small.rows} rows)`);
  check('X no JS errors', errs.length === 0, errs[0]);
  await context.close();
}


// ── stopping, keeping, and taking it back ─────────────────────────────────
//
// §21–§27. Two different things a customer can mean by stopping an import,
// and the app has to mean the same thing they do:
//
//   إغلاق والمتابعة لاحقاً — what was written stays. It is real inventory.
//   إلغاء الاستيراد        — it was a mistake; take exactly it back out.
//
// "Exactly it" is the whole test: the records that import wrote go, a record
// that was there before does not, and a category the import created survives
// if anything else has since been put in it.
{
  const { page, context, errs } = await open({ limit: 60000 });
  page.on('dialog', (dialog) => dialog.accept());

  // A file big enough that the write takes more than one transaction, so
  // there is a middle to stop in.
  await page.evaluate(async () => {
    const mod = await import('/src/views/sheet-import.js');
    const header = 'الاسم,الكمية,التصنيف,الموقع\n';
    const lines = new Array(3000);
    for (let i = 0; i < 3000; i += 1) lines[i] = `قطعة ${i},1,صنف مستورد,موقع مستورد`;
    const file = new File([header + lines.join('\n') + '\n'], 'rollback.csv', { type: 'text/csv' });
    await mod.openSpreadsheetImport(file);
  });
  await page.waitForTimeout(600);

  const beforeItems = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    return local.count('items');
  });

  // Through the mapping step to the confirm screen, the way a customer goes.
  await page.evaluate(() => {
    [...document.querySelectorAll('#simport-foot button')]
      .find((button) => button.textContent.includes('معاينة'))
      .click();
  });
  await page.waitForTimeout(300);

  // Start it, then stop it from the running screen the way a customer would.
  await page.evaluate(() => {
    [...document.querySelectorAll('#simport-foot button')]
      .find((button) => button.textContent.startsWith('استيراد'))
      .click();
  });
  await page.waitForFunction(
    () => document.querySelector('#simport-body .import-progress'), null, { timeout: 15000 },
  );
  await page.evaluate(() => {
    [...document.querySelectorAll('#simport-foot button')]
      .find((button) => button.textContent === 'إيقاف')
      .click();
  });
  await page.waitForFunction(
    () => !document.querySelector('#simport-body .import-progress'), null, { timeout: 30000 },
  );

  const stopped = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const mod = await import('/src/views/sheet-import.js');
    const job = mod.__jobForTest();
    const jobs = await local.getAll('importJobs');
    const stored = jobs.find((row) => row.id === job.id);
    const ids = await local.keysByIndex('items', 'importJobId', job.id);
    return {
      jobId: job.id,
      written: job.written,
      total: job.total,
      status: stored?.status,
      created: stored?.created,
      imported: ids.length,
      items: await local.count('items'),
      buttons: [...document.querySelectorAll('#simport-foot button')].map((b) => b.textContent),
    };
  });

  check('R1 a running import can be stopped from its own screen',
    stopped.written > 0 && stopped.written < stopped.total,
    JSON.stringify({ written: stopped.written, total: stopped.total }));
  check('R2 it stops as a resumable job, not as a failure',
    stopped.status === 'stopped', String(stopped.status));
  check('R3 every record it wrote carries which import wrote it',
    stopped.imported === stopped.written,
    JSON.stringify({ tagged: stopped.imported, written: stopped.written }));
  check('R4 the taxonomy it created is recorded on the job',
    stopped.created.categories.length === 1 && stopped.created.locations.length === 1,
    JSON.stringify(stopped.created));
  check('R5 the screen offers keeping and cancelling as different things',
    stopped.buttons.some((text) => text === 'إغلاق والمتابعة لاحقاً')
    && stopped.buttons.some((text) => text.startsWith('إلغاء الاستيراد'))
    && stopped.buttons.some((text) => text.startsWith('متابعة الاستيراد')),
    JSON.stringify(stopped.buttons));

  const sample = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const mod = await import('/src/views/sheet-import.js');
    const ids = await local.keysByIndex('items', 'importJobId', mod.__jobForTest().id, 1);
    return local.get('items', ids[0]);
  });
  check('R6 and which line of the file it came from',
    Number.isInteger(sample.sourceLine) && sample.sourceLine > 1,
    JSON.stringify({ importJobId: sample.importJobId, sourceLine: sample.sourceLine }));

  // Something the import did not write, put into the category the import
  // created. Cancelling must leave both alone.
  const survivor = await page.evaluate(async (categoryId) => {
    const { repository } = await import('/src/repository.js');
    const item = await repository.createItem({
      name: 'قطعة كتبها المستخدم', quantity: 1, categoryId,
    });
    return { id: item.id, categoryId: item.categoryId };
  }, stopped.created.categories[0]);

  await page.evaluate(() => {
    [...document.querySelectorAll('#simport-foot button')]
      .find((button) => button.textContent.startsWith('إلغاء الاستيراد'))
      .click();
  });
  await page.waitForFunction(
    // The sheet closes as the last step of the cancellation, so this is the
    // signal that the whole of it — records, taxonomy, job record — is done.
    () => !document.getElementById('sh-simport').classList.contains('open'),
    null, { timeout: 30000 },
  );

  const after = await page.evaluate(async (context) => {
    const local = await import('/src/local-store.js');
    const jobs = await local.getAll('importJobs');
    return {
      leftTagged: (await local.keysByIndex('items', 'importJobId', context.jobId)).length,
      items: await local.count('items'),
      survivor: await local.get('items', context.survivorId),
      category: await local.get('categories', context.categoryId),
      location: await local.get('locations', context.locationId),
      status: jobs.find((row) => row.id === context.jobId)?.status,
    };
  }, {
    jobId: stopped.jobId,
    survivorId: survivor.id,
    categoryId: stopped.created.categories[0],
    locationId: stopped.created.locations[0],
  });

  check('R7 cancelling removes every record that import wrote',
    after.leftTagged === 0, String(after.leftTagged));
  check('R8 and only those — the inventory is back where it started, plus the one added since',
    after.items === beforeItems + 1,
    JSON.stringify({ before: beforeItems, after: after.items }));
  check('R9 a record written by hand into the new category survives',
    Boolean(after.survivor) && after.survivor.id === survivor.id,
    JSON.stringify(after.survivor && { id: after.survivor.id }));
  check('R10 a category the import created but something else now uses is kept',
    Boolean(after.category), JSON.stringify(after.category));
  check('R11 a location the import created and nothing references is removed',
    after.location == null, JSON.stringify(after.location));
  check('R12 the job is recorded as rolled back, so it is not offered as resumable',
    after.status === 'rolled-back', String(after.status));

  // Idempotent: the recovery path runs the same rollback again and finds
  // nothing left to do, rather than failing or removing something else.
  const again = await page.evaluate(async (context) => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const result = await repository.rollbackImport(context.jobId, {
      categories: [context.categoryId], locations: [context.locationId], folders: [],
    });
    return { result, items: await local.count('items'), category: await local.get('categories', context.categoryId) };
  }, {
    jobId: stopped.jobId,
    categoryId: stopped.created.categories[0],
    locationId: stopped.created.locations[0],
  });
  check('R13 running the cancellation twice is a no-op, and reports it as one',
    again.result.removed === 0 && again.result.taxonomy === 0
    && again.items === beforeItems + 1 && Boolean(again.category),
    JSON.stringify(again.result));
  check('R14 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
