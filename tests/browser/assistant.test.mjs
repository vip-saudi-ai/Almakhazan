// Browser test for the assistant tab: Ask NAZM, the health score, guided
// cleanup and the hand-off back to the inventory screen.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/assistant.test.mjs

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });

// A deliberately uneven inventory: half undocumented, one clear duplicate pair.
await page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  const now = Date.now();
  const year = 400 * 24 * 3600 * 1000;
  const rows = [
    ['ساعة جيب فضية', true,  true,  now,        'BC-1'],
    ['ساعة جيب فضية', true,  true,  now,        'BC-1'],
    ['لوحة زيتية',    false, false, now,        ''],
    ['خاتم ذهب',      false, true,  now,        ''],
    ['سيف عثماني',    true,  false, now - year, ''],
    ['عدسة Leica',    false, false, now - year, ''],
  ];
  await repository.bulkWrite(rows.map(([name, img, loc, updated, barcode], i) => ({
    type: 'set', collection: 'items', id: 'a' + i,
    data: {
      id: 'a' + i, name, quantity: 1, unit: 'قطعة', categoryId: 'c1',
      locationId: loc ? 'l1' : null, condition: 'جيدة', barcode,
      valuation: { min: 5000 * (i + 1), max: 7000 * (i + 1), currency: 'SAR', source: 'manual', valuationType: 'estimate' },
      images: img ? [{ id: 'm' + i, storagePath: 'local:x', url: '' }] : [],
      createdAt: now - i * 1000, updatedAt: updated, version: 1,
    },
  })));
  const { repository: repo } = await import('/src/repository.js');
  await repo.saveLocation?.({ id: 'l1', name: 'مستودع الرياض' });
});
await page.waitForTimeout(500);

await page.click('#t-ai');
await page.waitForTimeout(600);

// ── the score ────────────────────────────────────────────────────────────
const health = await page.evaluate(() => ({
  score: document.querySelector('.health-number')?.textContent,
  band: document.querySelector('.health-band')?.textContent,
  rows: [...document.querySelectorAll('.health-row')].map(r => r.innerText.replace(/\n/g, ' ')),
}));
const expected = await page.evaluate(async () => {
  const { inventoryHealth } = await import('/src/health.js');
  const { repository } = await import('/src/repository.js');
  return inventoryHealth(repository.liveItems()).score;
});
check('A1 the score shown is the score computed', Number(health.score) === expected, `${health.score} vs ${expected}`);
check('A2 the score is explained, not just asserted', health.rows.length >= 2 && health.rows.some(r => r.includes('%')), JSON.stringify(health.rows));
check('A3 the band says what the number means', Boolean(health.band), health.band);

const weights = await page.evaluate(async () => {
  const { WEIGHTS } = await import('/src/health.js');
  return Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
});
check('A4 the published weights are the ones in force', Math.abs(weights - 1) < 1e-9, String(weights));

// ── ask ──────────────────────────────────────────────────────────────────
await page.fill('#ask-input', 'وش القطع اللي ما لها صور؟');
await page.press('#ask-input', 'Enter');
await page.waitForTimeout(400);
const answer = await page.evaluate(() => ({
  title: document.querySelector('.ask-title')?.textContent,
  text: document.querySelector('.ask-text')?.textContent,
  results: [...document.querySelectorAll('.ask-result-name')].map(n => n.textContent),
}));
check('A5 a question is answered from the inventory',
  answer.text.startsWith('3') && answer.results.includes('لوحة زيتية'), JSON.stringify(answer));

await page.fill('#ask-input', 'كم إجمالي قيمة مخزوني؟');
await page.press('#ask-input', 'Enter');
await page.waitForTimeout(400);
const total = await page.evaluate(() => document.querySelector('.ask-text')?.textContent);
check('A6 it totals value and names the currency', /ر\.س/.test(total) && /\d/.test(total), total);

await page.fill('#ask-input', 'وين سيف عثماني؟');
await page.press('#ask-input', 'Enter');
await page.waitForTimeout(400);
const where = await page.evaluate(() => document.querySelector('.ask-text')?.textContent);
check('A7 it answers where something is', where.includes('سيف عثماني'), where);

await page.fill('#ask-input', 'ما رأيك في السوق؟');
await page.press('#ask-input', 'Enter');
await page.waitForTimeout(400);
const unknown = await page.evaluate(() => ({
  text: document.querySelector('.ask-text')?.textContent,
  chips: document.querySelectorAll('.ask-chip').length,
}));
check('A8 an unparsed question is answered honestly, with examples',
  unknown.text.includes('لم أفهم') && unknown.chips > 0, JSON.stringify(unknown));

// ── the inventory never leaves the device to answer ───────────────────────
const requests = [];
page.on('request', r => { if (/cloudfunctions|anthropic|googleapis/.test(r.url())) requests.push(r.url()); });
await page.fill('#ask-input', 'وش القطع اللي ما لها صور؟');
await page.press('#ask-input', 'Enter');
await page.waitForTimeout(600);
check('A9 answering asks no backend and spends no credit', requests.length === 0, JSON.stringify(requests).slice(0, 120));

// ── duplicates ───────────────────────────────────────────────────────────
await page.evaluate(() => [...document.querySelectorAll('.qa')].find(b => b.textContent.includes('التكرارات'))?.click());
await page.waitForTimeout(400);
const dup = await page.evaluate(() => ({
  reasons: [...document.querySelectorAll('.dup-reason')].map(n => n.textContent),
  names: [...document.querySelectorAll('.dup-items .ask-result-name')].map(n => n.textContent),
  note: document.querySelector('.asec-sub')?.textContent || '',
}));
check('A10 duplicates are grouped with the reason', dup.reasons.includes('نفس الباركود'), JSON.stringify(dup.reasons));
check('A11 both sides of the pair are shown', dup.names.filter(n => n === 'ساعة جيب فضية').length === 2, JSON.stringify(dup.names));
check('A12 the screen says nothing is merged automatically', dup.note.includes('لا يُدمج'), dup.note);

const beforeIds = await page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  return repository.liveItems().map(i => i.id).sort().join(',');
});
await page.click('.nback');
await page.waitForTimeout(300);
const afterIds = await page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  return repository.liveItems().map(i => i.id).sort().join(',');
});
check('A13 looking at duplicates changes no record', beforeIds === afterIds);

// ── guided cleanup hands the list to the inventory screen ─────────────────
await page.evaluate(() => [...document.querySelectorAll('.task-cta')][0]?.click());
await page.waitForTimeout(600);
const handoff = await page.evaluate(() => ({
  tab: document.querySelector('.ti.on .tilbl')?.textContent,
  banner: document.getElementById('assistant-banner')?.innerText.replace(/\n/g, ' '),
  cards: document.querySelectorAll('#hgrid .icname').length,
}));
check('A14 a cleanup task opens the inventory filtered to it',
  handoff.tab === 'المخزون' && handoff.banner.includes('بدون صور') && handoff.cards === 3,
  JSON.stringify(handoff));

await page.click('.ab-clear');
await page.waitForTimeout(400);
const cleared = await page.evaluate(() => ({
  banner: document.getElementById('assistant-banner')?.style.display,
  cards: document.querySelectorAll('#hgrid .icname').length,
}));
check('A15 the filter can be dismissed and the full inventory returns',
  cleared.banner === 'none' && cleared.cards === 6, JSON.stringify(cleared));

check('A16 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 250));

await page.close();
await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
