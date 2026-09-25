// Browser test for restore safety.
//
// The property under test is not "restore works" — it is "restore cannot lose
// an inventory". Each check breaks the operation at a different point and
// asserts the customer still has their records.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/restore.test.mjs

import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase|\[restore\]/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const now = Date.now();
    await repository.bulkWrite(['ساعة جيب', 'لوحة زيتية', 'خاتم ذهب', 'سيف عثماني'].map((name, i) => ({
      type: 'set', collection: 'items', id: 'old' + i,
      data: { id: 'old' + i, name, quantity: 1, unit: 'قطعة', categoryId: 'c1',
              images: [], createdAt: now - i * 1000, updatedAt: now, version: 1 },
    })));
  });
  await page.waitForTimeout(300);
  return { page, context, errs };
}

const INCOMING = {
  items: [
    { id: 'new1', name: 'قطعة مستعادة أولى', quantity: 1, unit: 'قطعة', categoryId: 'c1', images: [], version: 1 },
    { id: 'new2', name: 'قطعة مستعادة ثانية', quantity: 2, unit: 'قطعة', categoryId: 'c1', images: [], version: 1 },
  ],
  folders: [], categories: [], locations: [],
};

const names = (page) => page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  return repository.liveItems().map(i => i.name).sort();
});

// ── 1. the backup must be taken, and it must be real ──────────────────────
{
  const { page, context, errs } = await freshPage();
  const result = await page.evaluate(async (data) => {
    const { restoreFromBackup } = await import('/src/restore.js');
    let saved = null;
    await restoreFromBackup(data, { sourceFingerprint: (await (await import('/src/exporting.js')).readBackupFile(new File([JSON.stringify(data)], 'b.json'))).sourceFingerprint,  saveBackup: (text) => { saved = text; } });
    return { length: saved?.length ?? 0, parsed: saved ? JSON.parse(saved) : null };
  }, INCOMING);

  check('R1 a backup is taken before anything changes', result.length > 100, String(result.length));
  check('R2 the backup holds the records that were there',
    result.parsed.items.length === 4 && result.parsed.items.some(i => i.name === 'ساعة جيب'),
    JSON.stringify(result.parsed.items.map(i => i.name)));
  check('R3 the backup says what it is', result.parsed.backupType === 'pre-restore', result.parsed.backupType);

  const after = await names(page);
  check('R4 the restore then replaces the inventory',
    JSON.stringify(after) === JSON.stringify(['قطعة مستعادة أولى', 'قطعة مستعادة ثانية']), JSON.stringify(after));
  check('R5 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  await context.close();
}

// ── 2. a backup that cannot be saved aborts the whole thing ───────────────
{
  const { page, context } = await freshPage();
  const outcome = await page.evaluate(async (data) => {
    const { restoreFromBackup } = await import('/src/restore.js');
    try {
      await restoreFromBackup(data, { sourceFingerprint: (await (await import('/src/exporting.js')).readBackupFile(new File([JSON.stringify(data)], 'b.json'))).sourceFingerprint, 
        saveBackup: () => { throw new Error('downloads blocked'); },
      });
      return { threw: false, message: '' };
    } catch (error) {
      return { threw: true, message: error.message, code: error.code };
    }
  }, INCOMING);

  check('R6 a failed backup stops the restore', outcome.threw, JSON.stringify(outcome));
  check('R7 and says so in a way a customer can act on',
    outcome.message.includes('لم تُغيَّر أي بيانات'), outcome.message);

  const after = await names(page);
  check('R8 not one record was touched',
    JSON.stringify(after) === JSON.stringify(['خاتم ذهب', 'سيف عثماني', 'ساعة جيب', 'لوحة زيتية'].sort()),
    JSON.stringify(after));
  await context.close();
}

// ── 3. failing partway never leaves the workspace empty ───────────────────
{
  const { page, context } = await freshPage();
  const outcome = await page.evaluate(async (data) => {
    const { restoreFromBackup } = await import('/src/restore.js');
    const { repository } = await import('/src/repository.js');
    const original = repository.bulkWrite.bind(repository);
    let calls = 0;
    // Break the run after the incoming records are written but before the old
    // ones are removed — the exact point the old implementation lost data.
    repository.bulkWrite = async (ops) => {
      calls += 1;
      if (calls > 1) throw new Error('network gone');
      return original(ops);
    };
    let threw = false;
    try {
      await restoreFromBackup(data, { sourceFingerprint: (await (await import('/src/exporting.js')).readBackupFile(new File([JSON.stringify(data)], 'b.json'))).sourceFingerprint,  saveBackup: () => {} });
    } catch { threw = true; }
    repository.bulkWrite = original;
    return { threw, names: repository.liveItems().map(i => i.name).sort() };
  }, INCOMING);

  check('R9 an interruption is reported, not swallowed', outcome.threw);
  check('R10 the old records are still there after an interruption',
    outcome.names.includes('ساعة جيب') && outcome.names.includes('لوحة زيتية'), JSON.stringify(outcome.names));
  check('R11 and the incoming records landed too — a superset, never nothing',
    outcome.names.includes('قطعة مستعادة أولى'), JSON.stringify(outcome.names));
  await context.close();
}

// ── 4. progress is reported at every stage ────────────────────────────────
{
  const { page, context } = await freshPage();
  const stages = await page.evaluate(async (data) => {
    const { restoreFromBackup } = await import('/src/restore.js');
    const seen = [];
    await restoreFromBackup(data, { sourceFingerprint: (await (await import('/src/exporting.js')).readBackupFile(new File([JSON.stringify(data)], 'b.json'))).sourceFingerprint, 
      saveBackup: () => {},
      onProgress: ({ stage }) => { if (seen[seen.length - 1] !== stage) seen.push(stage); },
    });
    return seen;
  }, INCOMING);
  check('R12 every stage is reported in order',
    JSON.stringify(stages) === JSON.stringify(['backup', 'backup', 'write', 'remove', 'done'])
    || (stages[0] === 'backup' && stages.includes('write') && stages.includes('remove') && stages.at(-1) === 'done'),
    JSON.stringify(stages));
  await context.close();
}

// ── 5. a restore that keeps a record does not delete and recreate it ──────
{
  const { page, context } = await freshPage();
  const kept = await page.evaluate(async () => {
    const { restoreFromBackup } = await import('/src/restore.js');
    const { repository } = await import('/src/repository.js');
    const existing = repository.liveItems().find(i => i.id === 'old0');
    // Carry the taxonomy through, so this isolates what happens to items.
    const data = {
      items: [{ ...existing, name: 'ساعة جيب (محدّثة)' }],
      folders: repository.state.folders,
      categories: repository.state.categories,
      locations: repository.state.locations,
    };
    const result = await restoreFromBackup(data, { sourceFingerprint: (await (await import('/src/exporting.js')).readBackupFile(new File([JSON.stringify(data)], 'b.json'))).sourceFingerprint,  saveBackup: () => {} });
    return { result, names: repository.liveItems().map(i => i.name).sort(),
             categories: repository.state.categories.length };
  });
  check('R13 only the records missing from the backup are removed',
    kept.result.removed === 3 && kept.names.length === 1 && kept.names[0] === 'ساعة جيب (محدّثة)',
    JSON.stringify(kept));
  check('R14 a taxonomy present in the backup survives the restore',
    kept.categories > 0, String(kept.categories));
  await context.close();
}

await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
