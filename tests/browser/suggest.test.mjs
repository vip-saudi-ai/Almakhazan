// Browser test for photo auto-fill: the assistant reads a new photo and
// proposes details, and nothing it proposes reaches the record on its own.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/suggest.test.mjs
//
// storage.js, ai.js and subscription.js are stubbed so the flow runs without
// Firebase; the form, the suggestion panel and the save path are the real ones.

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
import { planStub } from './plan-stub.mjs';

const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const ANALYSIS = {
  description: 'ساعة جيب فضية بغطاء منقوش وميناء أبيض.',
  evaluation: 'قطعة تبدو من أوائل القرن العشرين، واليقين متوسط.',
  condition: 'جيدة جداً',
  localScore: 7,
  globalScore: 8,
  suggestedValuation: { min: 1200, max: 1800, currency: 'SAR', source: 'ai', valuationType: 'estimate' },
  suggestedName: 'ساعة جيب فضية',
  suggestedCategory: 'الفنون الجميلة',
  brand: 'Elgin',
  visibleText: 'ELG-4471982',
  model: null,
  analyzedAt: Date.now(),
  imageHash: 'abc123ef',
};

async function formPage({ assistant = 'allowed', analysis = ANALYSIS, fails = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase\] SDK|automatic analysis/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

  await page.route('**/src/storage.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    // A cloud-shaped image, so the form treats it as analysable.
    export async function uploadImage(file, ctx, onProgress) {
      onProgress?.(100, 'save');
      return { id: 'img-' + Math.random().toString(36).slice(2, 8), mediaId: 'med1',
               storagePath: 'workspaces/w1/items/i1/photo.jpg', url: '', hash: 'abc123ef', fileSize: 2048 };
    }
    export async function deleteImage() {}
    export async function imageSrc() { return ''; }
    export function bindImageSrc(img) { if (img) img.alt = 'صورة'; }
    // The tier names and the "is there a bigger file" question the viewer asks.
    export const ImageTier = { THUMB: 'thumb', DISPLAY: 'display', FULL: 'full' };
    export async function hasDistinctOriginal() { return false; }
    // The repository releases cached object URLs when a workspace resets.
    export function releaseObjectUrls() {}
  ` }));

  await page.route('**/src/ai.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    export const AiAvailability = { READY: 'ready', OFFLINE: 'offline', UNAVAILABLE: 'unavailable' };
    export const AI_STATUS_LABELS = { ready: 'متصل', offline: 'غير متصل', unavailable: 'غير مهيأ' };
    export function aiAvailability() { return 'ready'; }
    window.__aiCalls = [];
    export async function analyzeItem(args) {
      window.__aiCalls.push({ name: args.name, categories: args.categories });
      if (${fails}) throw new Error('فشل التحليل');
      return ${JSON.stringify(analysis)};
    }
    export function isAnalysisStale() { return false; }
    export const AI_DISCLAIMER = 'تقدير أولي لا يُعد توثيقاً معتمداً.';
    export const ASSISTANT_NAME = 'مساعد المخزن';
    export const ASSISTANT_MARK = '✦';
    export const AI_TITLE = 'مساعد المخزن';
    export const AI_SUBTITLE = 'تقدير أولي';
  ` }));

  await page.route('**/src/subscription.js', r => r.fulfill({
    contentType: 'text/javascript',
    body: planStub({
      planId: 'pro',
      omit: ['canUseAssistant'],
      extra: `export function canUseAssistant(){ return ${assistant === 'allowed'}
        ? { allowed: true }
        : { allowed: false, message: 'لا رصيد' }; }`,
    }),
  }));

  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { page, errs };
}

async function addPhoto(page) {
  await page.click('.nacts button[aria-label="إضافة قطعة"]');
  await page.waitForTimeout(400);
  await page.setInputFiles('#imgInput', {
    name: 'watch.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  });
  await page.waitForTimeout(800);
}

// ── the magic moment ───────────────────────────────────────────────────────
{
  const { page, errs } = await formPage();
  await addPhoto(page);

  const panel = await page.evaluate(() => ({
    shown: document.getElementById('ai-suggest').style.display !== 'none',
    title: document.querySelector('.suggest-title')?.textContent,
    rows: [...document.querySelectorAll('.suggest-row')].map(r => ({
      label: r.querySelector('.suggest-label').textContent,
      value: r.querySelector('.suggest-value').textContent,
    })),
    note: document.querySelector('.suggest-note')?.textContent || '',
  }));
  check('S1 suggestions appear after the photo', panel.shown && panel.title === 'اقتراحات مساعد نَظْم', JSON.stringify(panel.shown));
  check('S2 name, category, brand, condition, price and the read text',
    panel.rows.length === 6
    && panel.rows[0].value === 'ساعة جيب فضية'
    && panel.rows[1].value.includes('الفنون الجميلة')
    && panel.rows[2].value === 'Elgin'
    && panel.rows[3].value === 'جيدة جداً'
    && panel.rows[5].value === 'ELG-4471982',
    JSON.stringify(panel.rows));
  check('S3 the panel says these are estimates', panel.note.includes('ليست توثيقاً معتمداً'), panel.note.slice(0, 60));

  // The reference number was read here, so there is nothing left to ask for.
  const asked = await page.evaluate(() => document.querySelector('.suggest-ask')?.textContent || '');
  check('S3b nothing is asked for when the object identified itself', asked === '', asked.slice(0, 60));

  const before = await page.evaluate(() => ({
    name: document.getElementById('f-name').value,
    brand: document.getElementById('f-brand').value,
    cond: document.getElementById('f-cond').value,
    val: document.getElementById('f-valuation').value,
    barcode: document.getElementById('f-barcode').value,
  }));
  check('S4 nothing is filled in until the customer asks',
    Object.values(before).every(v => v === ''), JSON.stringify(before));

  // one row
  await page.click('.suggest-row');
  const oneApplied = await page.evaluate(() => ({
    name: document.getElementById('f-name').value,
    brand: document.getElementById('f-brand').value,
    marked: document.querySelector('.suggest-row').classList.contains('applied'),
  }));
  check('S5 tapping one suggestion applies only that one',
    oneApplied.name === 'ساعة جيب فضية' && oneApplied.brand === '' && oneApplied.marked,
    JSON.stringify(oneApplied));

  // the rest
  await page.click('.suggest-all');
  const applied = await page.evaluate(() => ({
    name: document.getElementById('f-name').value,
    category: document.getElementById('f-cat').selectedOptions[0].textContent,
    brand: document.getElementById('f-brand').value,
    cond: document.getElementById('f-cond').value,
    val: document.getElementById('f-valuation').value,
    currency: document.getElementById('f-currency').value,
    barcode: document.getElementById('f-barcode').value,
  }));
  check('S6 apply-all fills every field it offered',
    applied.name === 'ساعة جيب فضية' && applied.category.includes('الفنون الجميلة')
    && applied.brand === 'Elgin' && applied.cond === 'جيدة جداً'
    && applied.val === '1200-1800' && applied.currency === 'SAR'
    && applied.barcode === 'ELG-4471982',
    JSON.stringify(applied));

  // the record that is actually saved
  await page.fill('#f-qty', '1');
  await page.click('#save-item-btn');
  await page.waitForTimeout(700);
  const saved = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const item = repository.liveItems()[0];
    return {
      name: item?.name, brand: item?.brand, barcode: item?.barcode,
      condition: item?.condition, valuation: item?.valuation,
      aiName: item?.aiData?.suggestedName || null,
    };
  });
  check('S7 the saved record carries what was accepted',
    saved.name === 'ساعة جيب فضية' && saved.brand === 'Elgin' && saved.barcode === 'ELG-4471982'
    && saved.valuation?.min === 1200 && saved.valuation?.max === 1800,
    JSON.stringify(saved));
  check('S7b an accepted estimate stays attributed to the assistant',
    saved.valuation?.source === 'ai', String(saved.valuation?.source));

  const call = await page.evaluate(() => window.__aiCalls[0]);
  check('S8 the workspace taxonomy is what the assistant chooses from',
    Array.isArray(call.categories) && call.categories.includes('الفنون الجميلة') && call.categories.length > 3,
    JSON.stringify(call.categories).slice(0, 100));
  check('S9 no JS errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  await page.close();
}

// ── when the evidence is thin, it asks instead of inventing ────────────────
{
  const thin = { ...ANALYSIS, visibleText: '', suggestedCategory: '', suggestedName: 'ساعة جيب' };
  const { page } = await formPage({ analysis: thin });
  await addPhoto(page);
  const ask = await page.evaluate(() => document.querySelector('.suggest-ask')?.textContent || '');
  check('S3c it asks for the photo that would settle it',
    ask.includes('الرقم المرجعي') || ask.includes('زاوية مختلفة'), ask.slice(0, 80));
  await page.close();
}

// ── the capture prompt ─────────────────────────────────────────────────────
{
  const { page } = await formPage();
  await page.click('.nacts button[aria-label="إضافة قطعة"]');
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => ({
    shown: document.getElementById('capture-prompt')?.style.display !== 'none',
    label: document.querySelector('.capture-label')?.textContent,
    alt: [...document.querySelectorAll('.capture-link')].map(b => b.textContent),
  }));
  check('S3d a new record opens at the camera',
    before.shown && before.label === 'صوّر القطعة' && before.alt.includes('إدخال يدوي'), JSON.stringify(before));

  await page.setInputFiles('#imgInput', {
    name: 'w.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => document.getElementById('capture-prompt')?.style.display);
  check('S3e it steps aside once there is a photo', after === 'none', String(after));
  await page.close();
}

// ── a named record is the customer's, not the assistant's ──────────────────
{
  const { page } = await formPage();
  await page.click('.nacts button[aria-label="إضافة قطعة"]');
  await page.waitForTimeout(400);
  await page.fill('#f-name', 'ساعة جدي');
  await page.setInputFiles('#imgInput', {
    name: 'w.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  });
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => ({
    calls: window.__aiCalls.length,
    shown: document.getElementById('ai-suggest').style.display !== 'none',
    name: document.getElementById('f-name').value,
  }));
  check('S10 a typed name is never second-guessed',
    state.calls === 0 && !state.shown && state.name === 'ساعة جدي', JSON.stringify(state));
  await page.close();
}

// ── no credit: the form still works ────────────────────────────────────────
{
  const { page, errs } = await formPage({ assistant: 'denied' });
  await addPhoto(page);
  const state = await page.evaluate(() => ({
    calls: window.__aiCalls.length,
    shown: document.getElementById('ai-suggest').style.display !== 'none',
    images: document.querySelectorAll('.img-cell img').length,
  }));
  check('S11 without credit nothing is spent and the photo is still added',
    state.calls === 0 && !state.shown && state.images === 1, JSON.stringify(state));
  check('S12 no errors without credit', errs.length === 0, errs.join(' | ').slice(0, 200));
  await page.close();
}

// ── the assistant failing must not cost the customer their form ────────────
{
  const { page } = await formPage({ fails: true });
  await addPhoto(page);
  await page.fill('#f-name', 'قطعة مكتوبة يدوياً');
  await page.fill('#f-qty', '2');
  await page.click('#save-item-btn');
  await page.waitForTimeout(700);
  const saved = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const item = repository.liveItems()[0];
    return { name: item?.name, quantity: item?.quantity, images: item?.images?.length };
  });
  check('S13 a failed reading leaves the form and the photo intact',
    saved.name === 'قطعة مكتوبة يدوياً' && saved.quantity === 2 && saved.images === 1, JSON.stringify(saved));
  await page.close();
}

await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
