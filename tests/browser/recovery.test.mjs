// Browser test for recoverable state.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/recovery.test.mjs
//
// The claim under test: the browser can die at the worst possible moment, the
// customer can come back, and NAZM can say exactly what happened — resume or
// undo the same operation, and never quietly create duplicate or ambiguous
// inventory. So several of these checks kill a page without warning and look
// at what the next page finds.

import { planStub } from './plan-stub.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const QUIET = /gstatic|ERR_|net::|firebase/;

/** A context is one browser profile: its IndexedDB outlives any page in it,
 *  which is what lets a page be killed and the next one find what it left. */
async function newContext({ stub = {}, faultRollback = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/src/subscription.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: planStub({ planId: 'business', ...stub }),
  }));
  if (faultRollback) {
    // The real repository module, with one fault appended: rollback throws
    // until the test says otherwise. Nothing in the shipped code knows.
    await context.route('**/src/repository.js', async (route) => {
      const response = await route.fetch();
      const body = await response.text() + `
        const __realRollback = repository.rollbackImport;
        repository.rollbackImport = async function (...args) {
          if (globalThis.__nazmRollbackFault !== false) throw new Error('forced rollback failure');
          return __realRollback.apply(this, args);
        };`;
      await route.fulfill({ response, body, contentType: 'text/javascript' });
    });
  }
  return context;
}

async function openPage(context) {
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !QUIET.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  return { page, errs };
}

/** The same bytes every time, so a reopened file has the same fingerprint. */
const CSV = (rows, category = 'صنف مستورد') => {
  const lines = ['الاسم,الكمية,التصنيف,Ref'];
  for (let i = 0; i < rows; i += 1) lines.push(`قطعة ${i},1,${category},S-${String(i).padStart(6, '0')}`);
  return lines.join('\n') + '\n';
};

async function openImport(page, rows, name = 'crash.csv', category) {
  await page.evaluate(async ({ text, name }) => {
    const mod = await import('/src/views/sheet-import.js');
    await mod.openSpreadsheetImport(new File([text], name, { type: 'text/csv' }));
  }, { text: CSV(rows, category), name });
  await page.waitForTimeout(300);
}

const footButton = (page, match) => page.evaluate((source) => {
  const test = new RegExp(source);
  const button = [...document.querySelectorAll('#simport-foot button')].find((b) => test.test(b.textContent));
  if (!button) return false;
  button.click();
  return true;
}, match.source);

const importState = (page) => page.evaluate(async () => {
  const mod = await import('/src/views/sheet-import.js');
  const job = mod.__jobForTest();
  return {
    job: job && { id: job.id, written: job.written, mapping: job.mapping, resolved: job.resolved },
    mapping: mod.__mappingForTest(),
    memory: mod.__importMemoryForTest(),
  };
});

const disk = (page, jobId) => page.evaluate(async (jobId) => {
  const local = await import('/src/local-store.js');
  const jobs = await local.getAll('importJobs');
  const tagged = jobId ? await local.keysByIndex('items', 'importJobId', jobId) : [];
  return {
    jobs: jobs.map((j) => ({ id: j.id, status: j.status, written: j.written, runtimeSessionId: j.runtimeSessionId })),
    job: jobs.find((j) => j.id === jobId) || null,
    tagged: tagged.length,
    distinct: new Set(tagged).size,
    items: await local.count('items'),
    categories: (await local.getAll('categories')).map((c) => c.name),
  };
}, jobId);

const sheetClosed = (page) => page.waitForFunction(
  () => !document.getElementById('sh-simport').classList.contains('open'), null, { timeout: 60000 },
);

// ── 1. the tab dies while an import is running ────────────────────────────
//
// §6, §62. 5,000 rows, killed once at least 2,000 are written. The job is on
// the device as `running`, because nothing got the chance to say otherwise.
{
  const context = await newContext();
  const first = await openPage(context);
  await openImport(first.page, 5000);

  // The ambiguous column, answered: this answer must survive the crash.
  await first.page.evaluate(() => {
    [...document.querySelectorAll('.imp-ask-opts button')]
      .find((b) => b.textContent === 'الرقم التسلسلي').click();
  });
  const before = await importState(first.page);
  await footButton(first.page, /معاينة/);
  await first.page.waitForTimeout(200);
  await footButton(first.page, /^استيراد/);
  await first.page.waitForFunction(() => {
    const text = document.querySelector('#simport-body .import-progress')?.innerText || '';
    const done = Number((text.match(/([\d,]+) من/) || [, '0'])[1].replace(/,/g, ''));
    return done >= 2000;
  }, null, { timeout: 60000, polling: 5 });
  const crashedJob = (await importState(first.page)).job;
  // No beforeunload, no cleanup, no chance to write "stopped".
  await first.page.close({ runBeforeUnload: false });

  const second = await openPage(context);
  const afterBoot = await disk(second.page, crashedJob.id);
  check('C1 a job a dead tab left running is found stopped when the app opens',
    afterBoot.job?.status === 'stopped', JSON.stringify(afterBoot.job));
  check('C2 with the progress it had durably recorded, not reset',
    afterBoot.job?.written >= 2000 && afterBoot.job.written < 5000, String(afterBoot.job?.written));
  check('C3 and no more than one chunk written beyond it',
    afterBoot.tagged >= afterBoot.job.written && afterBoot.tagged <= afterBoot.job.written + 200,
    JSON.stringify({ tagged: afterBoot.tagged, written: afterBoot.job.written }));

  await openImport(second.page, 5000);
  const resumed = await importState(second.page);
  check('C4 picking the same file finds the same job',
    resumed.job?.id === crashedJob.id, JSON.stringify({ was: crashedJob.id, now: resumed.job?.id }));
  check('C5 at the same written boundary',
    resumed.job?.written === afterBoot.job.written, String(resumed.job?.written));
  check('C6 with the mapping restored',
    JSON.stringify(resumed.mapping) === JSON.stringify(before.mapping),
    JSON.stringify({ before: before.mapping, after: resumed.mapping }));
  check('C7 and the ambiguity answer restored',
    JSON.stringify(resumed.job?.resolved) === JSON.stringify({ 3: 'serialNumber' }),
    JSON.stringify(resumed.job?.resolved));
  const banner = await second.page.evaluate(() => document.getElementById('simport-body').innerText);
  check('C8 and it says an earlier import stopped before finishing',
    banner.includes('وجد نَظْم استيراداً سابقاً توقف قبل اكتماله'), banner.slice(0, 160));

  await footButton(second.page, /^متابعة الاستيراد/);
  await sheetClosed(second.page);
  const finished = await disk(second.page, crashedJob.id);
  check('C9 resuming writes the rest under the same job',
    finished.job?.status === 'completed' && finished.tagged === 5000,
    JSON.stringify({ status: finished.job?.status, tagged: finished.tagged }));
  check('C10 and no row was written twice',
    finished.distinct === 5000 && finished.items === 5000,
    JSON.stringify({ distinct: finished.distinct, items: finished.items }));
  check('C11 no second job was started for the same file',
    finished.jobs.length === 1, JSON.stringify(finished.jobs));
  const sample = await second.page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const ids = await local.keysByIndex('items', 'serialNumber', 'S-004999');
    return ids.length;
  });
  check('C12 the answered column still means what the customer said, after the crash',
    sample === 1, String(sample));
  const memory = (await importState(second.page)).memory;
  check('C13 a completed import lets go of the file',
    Object.values(memory).every((v) => v === false), JSON.stringify(memory));
  check('C14 no JS errors', [...first.errs, ...second.errs].length === 0, [...first.errs, ...second.errs][0]);
  await context.close();
}

// ── 2. the job cannot be written before any record is ──────────────────────
//
// §10, §63. Nothing may carry a job id the device does not know about.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await openImport(page, 50, 'prepared.csv', 'تصنيف لم يُنشأ');
  await page.evaluate(async () => {
    const jobs = await import('/src/import-jobs.js');
    jobs.__setJobWriteFaultForTest((job, status) => status === 'prepared');
  });
  await footButton(page, /معاينة/);
  await page.waitForTimeout(200);
  await footButton(page, /^استيراد/);
  await page.waitForTimeout(800);
  const after = await disk(page, null);
  const toast = await page.evaluate(() => document.querySelector('.toast')?.innerText || '');
  check('P1 a job that cannot be recorded writes no records',
    after.items === 0, String(after.items));
  check('P2 and creates no taxonomy',
    !after.categories.includes('تصنيف لم يُنشأ'), JSON.stringify(after.categories));
  check('P3 and leaves no job behind', after.jobs.length === 0, JSON.stringify(after.jobs));
  check('P4 it says the import was stopped to protect the data',
    toast.includes('أوقف نَظْم الاستيراد لحماية البيانات'), JSON.stringify(toast));
  const memory = (await importState(page)).memory;
  check('P5 and lets go of the file', Object.values(memory).every((v) => v === false), JSON.stringify(memory));
  const unexpected = errs.filter((line) => !/critical job persistence failed|forced job write|لحماية البيانات/.test(line));
  check('P6 only the expected failure is logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 3. a chunk commits and its progress cannot be recorded ─────────────────
//
// §11, §12, §64. The import stops at once. The chunk that did land is safe to
// write again because its ids are the same, so the resume replays it.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await openImport(page, 1000, 'progress.csv');
  await page.evaluate(async () => {
    const jobs = await import('/src/import-jobs.js');
    jobs.__setJobWriteFaultForTest((job, status) => status === 'running' && job.written === 200);
  });
  await footButton(page, /معاينة/);
  await page.waitForTimeout(200);
  await footButton(page, /^استيراد/);
  await page.waitForTimeout(1200);
  const jobId = await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    return (await local.getAll('importJobs'))[0]?.id;
  });
  const stopped = await disk(page, jobId);
  check('G1 the import stops after the chunk whose progress could not be recorded',
    stopped.tagged === 200, String(stopped.tagged));
  check('G2 the job on the device still says where it last durably reached',
    stopped.job?.written === 0 && stopped.job.status === 'running', JSON.stringify(stopped.job));

  await page.evaluate(async () => {
    const jobs = await import('/src/import-jobs.js');
    jobs.__setJobWriteFaultForTest(null);
  });
  await openImport(page, 1000, 'progress.csv');
  const resumed = await importState(page);
  check('G3 picking the file again finds the same job, from the durable boundary',
    resumed.job?.id === jobId && resumed.job.written === 0, JSON.stringify(resumed.job));
  await footButton(page, /^متابعة الاستيراد/);
  await sheetClosed(page);
  const done = await disk(page, jobId);
  check('G4 the replayed chunk is not a second copy of itself',
    done.tagged === 1000 && done.distinct === 1000 && done.items === 1000,
    JSON.stringify({ tagged: done.tagged, items: done.items }));
  const unexpected = errs.filter((line) => !/critical job persistence failed|forced job write|لحماية البيانات/.test(line));
  check('G5 only the expected failure is logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 4. `rolling-back` must be on the device before the first delete ─────────
//
// §14.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await openImport(page, 800, 'undo.csv');
  await footButton(page, /معاينة/);
  await page.waitForTimeout(200);
  await footButton(page, /^استيراد/);
  await page.waitForFunction(() => document.querySelector('#simport-body .import-progress'), null, { timeout: 15000 });
  await footButton(page, /^إيقاف$/);
  await page.waitForFunction(() => !document.querySelector('#simport-body .import-progress'), null, { timeout: 30000 });
  const jobId = (await importState(page)).job.id;
  const beforeUndo = await disk(page, jobId);

  await page.evaluate(async () => {
    const jobs = await import('/src/import-jobs.js');
    jobs.__setJobWriteFaultForTest((job, status) => status === 'rolling-back');
  });
  await footButton(page, /^إلغاء الاستيراد/);
  await page.waitForTimeout(800);
  const afterUndo = await disk(page, jobId);
  check('U1 a cancellation that cannot be recorded deletes nothing',
    afterUndo.tagged === beforeUndo.tagged && beforeUndo.tagged > 0,
    JSON.stringify({ before: beforeUndo.tagged, after: afterUndo.tagged }));
  check('U2 and the job is still the stopped job it was',
    afterUndo.job?.status === 'stopped', String(afterUndo.job?.status));
  await page.evaluate(async () => {
    const jobs = await import('/src/import-jobs.js');
    jobs.__setJobWriteFaultForTest(null);
  });
  const unexpected = errs.filter((line) => !/critical job persistence failed|forced job write|لحماية البيانات/.test(line));
  check('U3 only the expected failure is logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 5. a cancellation left half done, and finishing it fails ───────────────
//
// §15–§18, §60, §61, §65, §66. The previous tab died deleting. The next one
// cannot finish the job: the inventory must still open, new imports must be
// refused before the file is even read, and a retry must be offered.
{
  const context = await newContext({ faultRollback: true });
  // Seed inside this context, then reload: the reload is the "app opens again".
  const seeding = await openPage(context);
  await openImport(seeding.page, 600, 'halfway.csv');
  await footButton(seeding.page, /معاينة/);
  await seeding.page.waitForTimeout(200);
  await footButton(seeding.page, /^استيراد/);
  await sheetClosed(seeding.page);
  const seeded = await seeding.page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const job = (await local.getAll('importJobs'))[0];
    await local.put('importJobs', { ...job, status: 'rolling-back', runtimeSessionId: 'rt-dead' });
    const ids = await local.keysByIndex('items', 'importJobId', job.id);
    await local.removeMany('items', ids.slice(0, 250));
    return { id: job.id, left: ids.length - 250 };
  });
  await seeding.page.close({ runBeforeUnload: false });

  const { page, errs } = await openPage(context);
  const state = await page.evaluate(async () => {
    const jobs = await import('/src/import-jobs.js');
    return { ...jobs.importRecoveryState, error: Boolean(jobs.importRecoveryState.error) };
  });
  check('B1 a cancellation that cannot be finished at startup leaves imports blocked',
    state.checked && state.ready === false && state.pendingRollbackJobs.includes(seeded.id),
    JSON.stringify(state));
  const viewing = await page.evaluate(async () => {
    const { queryInventory } = await import('/src/query.js');
    const result = await queryInventory({ page: 1, perPage: 24 });
    return { rows: result.rows.length, cards: document.querySelectorAll('#grid .card, #list .li, [data-id]').length };
  });
  check('B2 and the inventory can still be browsed',
    viewing.rows === 24, JSON.stringify(viewing));

  const refused = await page.evaluate(async () => {
    let digests = 0;
    const real = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = (...args) => { digests += 1; return real(...args); };
    const local = await import('/src/local-store.js');
    const jobsBefore = await local.count('importJobs');
    const mod = await import('/src/views/sheet-import.js');
    await mod.openSpreadsheetImport(new File(['الاسم\nقطعة جديدة\n'], 'new.csv', { type: 'text/csv' }));
    await new Promise((r) => setTimeout(r, 300));
    crypto.subtle.digest = real;
    return {
      digests,
      jobsAfter: await local.count('importJobs'),
      jobsBefore,
      body: document.getElementById('simport-body').innerText,
      buttons: [...document.querySelectorAll('#simport-foot button')].map((b) => b.textContent),
      open: document.getElementById('sh-simport').classList.contains('open'),
    };
  });
  check('B3 a new file is refused before it is even fingerprinted',
    refused.digests === 0, String(refused.digests));
  check('B4 no new import job is created',
    refused.jobsAfter === refused.jobsBefore, JSON.stringify(refused));
  check('B5 the screen says why, and offers the retry',
    refused.open && refused.body.includes('تعذّر إكمال التراجع عن استيراد سابق')
    && refused.buttons.includes('إعادة محاولة إكمال التراجع'),
    JSON.stringify({ body: refused.body.slice(0, 120), buttons: refused.buttons }));

  // The fault clears; the retry finishes the cancellation.
  await page.evaluate(() => { globalThis.__nazmRollbackFault = false; });
  await footButton(page, /^إعادة محاولة إكمال التراجع$/);
  await sheetClosed(page);
  const recovered = await disk(page, seeded.id);
  const ready = await page.evaluate(async () => (await import('/src/import-jobs.js')).importRecoveryState.ready);
  check('B6 the retry finishes the cancellation',
    recovered.job?.status === 'rolled-back' && recovered.tagged === 0,
    JSON.stringify({ status: recovered.job?.status, tagged: recovered.tagged }));
  check('B7 and imports are accepted again', ready === true, String(ready));
  await openImport(page, 5, 'after.csv');
  const accepted = await importState(page);
  check('B8 a new file now opens normally', accepted.memory.sheet === true, JSON.stringify(accepted.memory));
  const unexpected = errs.filter((line) => !/rollback recovery failed|import recovery is needed|forced rollback/.test(line));
  check('B9 only the expected failure is logged', unexpected.length === 0, unexpected[0]);
  await context.close();
}

// ── 6. a cancellation left half done is finished at startup ────────────────
//
// §18, §20. No import screen opened; the app finishes it on the way up.
{
  const context = await newContext();
  const seeding = await openPage(context);
  await openImport(seeding.page, 600, 'startup.csv');
  await footButton(seeding.page, /معاينة/);
  await seeding.page.waitForTimeout(200);
  await footButton(seeding.page, /^استيراد/);
  await sheetClosed(seeding.page);
  const jobId = await seeding.page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const job = (await local.getAll('importJobs'))[0];
    await local.put('importJobs', { ...job, status: 'rolling-back', runtimeSessionId: 'rt-dead' });
    const ids = await local.keysByIndex('items', 'importJobId', job.id);
    await local.removeMany('items', ids.slice(0, 300));
    return job.id;
  });
  await seeding.page.close({ runBeforeUnload: false });

  const { page, errs } = await openPage(context);
  const after = await disk(page, jobId);
  const ready = await page.evaluate(async () => (await import('/src/import-jobs.js')).importRecoveryState.ready);
  check('S1 startup finishes a cancellation a dead tab left half done',
    after.job?.status === 'rolled-back' && after.tagged === 0 && after.items === 0,
    JSON.stringify({ status: after.job?.status, tagged: after.tagged, items: after.items }));
  check('S2 and imports are ready', ready === true, String(ready));
  check('S3 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 7. continue later lets go of the file, and the file picks up again ─────
//
// §31, §34, §69.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  await openImport(page, 3000, 'later.csv');
  await footButton(page, /معاينة/);
  await page.waitForTimeout(200);
  await footButton(page, /^استيراد/);
  await page.waitForFunction(() => document.querySelector('#simport-body .import-progress'), null, { timeout: 15000 });
  await footButton(page, /^إيقاف$/);
  await page.waitForFunction(() => !document.querySelector('#simport-body .import-progress'), null, { timeout: 30000 });
  const jobId = (await importState(page)).job.id;
  await footButton(page, /^إغلاق والمتابعة لاحقاً$/);
  await sheetClosed(page);
  await page.waitForTimeout(200);
  const memory = (await importState(page)).memory;
  check('L1 continue-later lets go of the file and the parsed sheet',
    Object.values(memory).every((v) => v === false), JSON.stringify(memory));
  const kept = await disk(page, jobId);
  check('L2 while the job stays on the device, stopped',
    kept.job?.status === 'stopped' && kept.job.written > 0, JSON.stringify(kept.job));

  await openImport(page, 3000, 'later.csv');
  const resumed = await importState(page);
  check('L3 the same file picks the same job up again',
    resumed.job?.id === jobId && resumed.job.written === kept.job.written, JSON.stringify(resumed.job));
  await footButton(page, /^متابعة الاستيراد/);
  await sheetClosed(page);
  const done = await disk(page, jobId);
  check('L4 and finishes it without a duplicate',
    done.tagged === 3000 && done.items === 3000, JSON.stringify({ tagged: done.tagged, items: done.items }));

  // Closing before anything was written keeps nothing either.
  await openImport(page, 20, 'nothing.csv');
  await footButton(page, /^إلغاء$/);
  await sheetClosed(page);
  const cancelled = (await importState(page)).memory;
  check('L5 cancelling before writing lets go of the file',
    Object.values(cancelled).every((v) => v === false), JSON.stringify(cancelled));
  check('L6 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 8. import next to 20,000 records, without loading them ─────────────────
//
// §21–§26, §67. The plan room is a count; taxonomy is already held in full.
{
  // A counter that has fallen behind (it says 0) and a store that holds
  // 20,000: the store wins, so the room is 25,000 − 20,000.
  const context = await newContext({ stub: { quotaLimit: 25000, usage: { items: 0 } } });
  const first = await openPage(context);
  await first.page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const now = Date.now();
    for (let start = 0; start < 20000; start += 1000) {
      const rows = [];
      for (let i = start; i < start + 1000; i += 1) {
        rows.push({
          id: 'x' + String(i).padStart(6, '0'), name: `قطعة ${i}`, quantity: 1, unit: 'قطعة',
          categoryId: 'c1', folderId: null, locationId: null, condition: '', images: [],
          deletedAt: null, createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1,
        });
      }
      await local.putMany('items', rows);
    }
  });
  await first.page.close();
  const { page, errs } = await openPage(context);
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.saveCategory({ name: 'ساعات', icon: '⌚' });
  });
  await openImport(page, 10000, 'big.csv', 'ساعات');
  const loaded = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return { complete: repository.itemsComplete, held: repository.state.items.length };
  });
  check('F1 opening an import beside 20,000 records does not load them',
    loaded.complete === false && loaded.held <= 400, JSON.stringify(loaded));
  await footButton(page, /معاينة/);
  await page.waitForTimeout(300);
  const preview = await page.evaluate(() => document.getElementById('simport-body').innerText);
  check('F2 the preview works, and an existing category is matched, not re-created',
    preview.includes('10,000 قطعة ستُضاف') && !preview.includes('سيُنشأ'), preview.replace(/\n/g, ' / ').slice(0, 200));
  check('F3 the room is counted from the store, not only the counter',
    preview.includes('5,000 قطعة متبقية في خطتك'), preview.replace(/\n/g, ' / ').slice(0, 400));
  check('F4 and a file larger than that room is refused whole',
    preview.includes('لا تتسع خطتك'), '');
  check('F5 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 9. "no folder" as a place, and as a filter ─────────────────────────────
//
// §35–§39, §70.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  const answers = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const { queryInventory, emptyQuery } = await import('/src/query.js');
    const folder = await repository.saveFolder({ name: 'F1', icon: '🗂', color: '#2563FF' });
    const now = Date.now();
    await local.putMany('items', [
      { id: 'root-a', name: 'قطعة الجذر', sku: 'ROOT-A', quantity: 1, categoryId: 'c1', folderId: null,
        images: [], deletedAt: null, createdAt: now, updatedAt: now, version: 1 },
      { id: 'folder-b', name: 'قطعة المجلد', sku: 'FOLDER-B', quantity: 1, categoryId: 'c1', folderId: folder.id,
        images: [], deletedAt: null, createdAt: now - 1, updatedAt: now - 1, version: 1 },
    ]);
    const base = emptyQuery();
    const ask = async (search, filters = {}) => (await queryInventory({
      ...base, search, filters: { ...base.filters, ...filters }, page: 1, perPage: 24,
    })).rows.map((r) => r.id);
    return {
      browseSearch: await ask('FOLDER-B'),
      filterSearch: await ask('FOLDER-B', { folderId: '__root__' }),
      filterRoot: await ask('ROOT-A', { folderId: '__root__' }),
    };
  });
  check('Q1 browsing the root, an exact search still reaches into folders',
    answers.browseSearch.includes('folder-b'), JSON.stringify(answers.browseSearch));
  check('Q2 with «المخزون الرئيسي» chosen as a filter, it does not',
    answers.filterSearch.length === 0, JSON.stringify(answers.filterSearch));
  check('Q3 and a record that is unfiled is still found under that filter',
    answers.filterRoot.length === 1 && answers.filterRoot[0] === 'root-a', JSON.stringify(answers.filterRoot));
  check('Q4 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

// ── 10. a very large bulk change that stops part way ───────────────────────
//
// §40–§45, §71, §72.
{
  const context = await newContext();
  const { page, errs } = await openPage(context);
  // Seeded straight into the store, then the page reloaded, so the
  // repository reads the records the way it reads any existing inventory.
  await page.evaluate(async () => {
    const local = await import('/src/local-store.js');
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < 2500; i += 1) {
      rows.push({
        id: 'b' + String(i).padStart(5, '0'), name: `قطعة ${i}`, quantity: 1, categoryId: 'c1',
        folderId: null, locationId: null, images: [], deletedAt: null,
        createdAt: now - i * 1000, updatedAt: now - i * 1000, version: 1,
      });
    }
    await local.putMany('items', rows);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');
    const location = await repository.saveLocation({ name: 'المستودع' });
    await repository.completeItems();
    const rows = repository.state.items.filter((item) => item.id.startsWith('b'))
      .sort((a, b) => a.id.localeCompare(b.id));

    const activityBefore = await local.count('activity');

    // ── chunked: 2,500 > the atomic ceiling. The eighth chunk holds a record
    // another tab changed, so seven chunks land and the eighth does not.
    const ids = rows.map((r) => r.id);
    const stale = await local.get('items', ids[750]);
    await local.put('items', { ...stale, version: 9 });
    let partial = null;
    try {
      await repository.bulkUpdate(ids, { locationId: location.id });
    } catch (error) {
      partial = {
        code: error.code, requested: error.requested, applied: error.applied,
        remaining: error.remaining, atomic: error.atomic, message: error.message,
      };
    }
    const moved = (await local.keysByIndex('items', 'locationId', location.id)).length;
    const log = (await local.getAll('activity'))
      .filter((entry) => entry.action === 'ITEMS_BULK_UPDATED')
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    // ── atomic: 300 records, one stale. Nothing may change, nothing logged.
    const fresh = await local.getMany('items', ids.slice(1000, 1300));
    await repository.completeItems();
    const other = await repository.saveLocation({ name: 'مكان آخر' });
    const staleAgain = await local.get('items', ids[1150]);
    await local.put('items', { ...staleAgain, version: (staleAgain.version || 1) + 5 });
    const activityMid = await local.count('activity');
    let atomic = null;
    try {
      await repository.bulkUpdate(fresh.map((r) => r.id), { locationId: other.id });
    } catch (error) {
      atomic = { code: error.code, applied: error.applied, atomic: error.atomic, message: error.message };
    }
    const movedAtomic = (await local.keysByIndex('items', 'locationId', other.id)).length;
    const activityAfter = await local.count('activity');

    return {
      partial, moved, log: log && {
        applied: log.applied, count: log.count, requested: log.requested,
        remaining: log.remaining, status: log.status, atomic: log.atomic, operation: log.operation,
      },
      activityBefore, atomic, movedAtomic, atomicLogged: activityAfter - activityMid,
    };
  });

  check('K1 a chunked bulk change that stops part way says so in structured form',
    result.partial?.code === 'repo/bulk-partial' && result.partial.requested === 2500
    && result.partial.applied === 700 && result.partial.atomic === false,
    JSON.stringify(result.partial));
  check('K2 exactly that many records really changed', result.moved === 700, String(result.moved));
  check('K3 the activity log records the partial change with the same count',
    result.log?.status === 'partial' && result.log.applied === 700 && result.log.requested === 2500
    && result.log.remaining === 1800 && result.log.operation === 'move-location',
    JSON.stringify(result.log));
  check('K4 and the customer is told the same number',
    /700/.test(result.partial?.message || ''), result.partial?.message);
  check('K5 an ordinary bulk change with one conflict changes nothing',
    result.atomic?.code === 'repo/bulk-conflict' && result.atomic.applied === 0 && result.movedAtomic === 0,
    JSON.stringify({ ...result.atomic, moved: result.movedAtomic }));
  check('K6 and logs no change', result.atomicLogged === 0, String(result.atomicLogged));
  check('K7 its message says nothing was applied',
    (result.atomic?.message || '').includes('لم يتم تطبيق أي تغيير'), result.atomic?.message);
  check('K8 no JS errors', errs.length === 0, errs[0]);
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
