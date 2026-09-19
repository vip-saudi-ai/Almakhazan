// Accessibility and theme invariants.
//
// These are the things that quietly rot: a control that loses its label, a
// focus ring someone removes to "clean up", a hardcoded light colour that
// blinds a dark-mode user, a viewport tag that blocks zoom. Each is cheap to
// check and expensive to notice late.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/a11y.test.mjs

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

async function open(colorScheme) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.createItem({ name: 'ساعة جيب فضية', quantity: 1, unit: 'قطعة', categoryId: 'c1' });
  });
  await page.waitForTimeout(400);
  return { page, context };
}

// ── labels, zoom, language ────────────────────────────────────────────────
{
  const { page, context } = await open('light');
  const report = await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const controls = [...document.querySelectorAll('button, [role="tab"], a[href], input, select')];
    const named = (el) => Boolean(
      el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
      || el.title || el.labels?.length,
    );
    return {
      unlabelled: controls.filter(visible).filter(el => !named(el)).map(el => el.id || el.className.toString().slice(0, 24)),
      hiddenUnlabelled: controls.filter(el => !visible(el) && el.tagName === 'INPUT' && el.type === 'file')
        .filter(el => !named(el)).map(el => el.id),
      viewport: document.querySelector('meta[name=viewport]')?.content || '',
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      tabs: [...document.querySelectorAll('[role="tab"]')].map(t => t.getAttribute('aria-selected')),
    };
  });

  check('X1 every visible control has an accessible name',
    report.unlabelled.length === 0, JSON.stringify(report.unlabelled));
  check('X2 the hidden file inputs are named too', report.hiddenUnlabelled.length === 0, JSON.stringify(report.hiddenUnlabelled));
  check('X3 zoom is not blocked',
    !/user-scalable\s*=\s*no/.test(report.viewport) && !/maximum-scale/.test(report.viewport), report.viewport);
  check('X4 the document declares Arabic and RTL', report.lang === 'ar' && report.dir === 'rtl', `${report.lang}/${report.dir}`);
  check('X5 exactly one tab is selected',
    report.tabs.filter(v => v === 'true').length === 1, JSON.stringify(report.tabs));

  // Focus must stay visible.
  const focus = await page.evaluate(() => {
    const button = document.getElementById('scan-btn');
    button.focus();
    const style = getComputedStyle(button);
    return { shadow: style.boxShadow, outline: style.outlineStyle, matches: button.matches(':focus-visible') };
  });
  check('X6 a focused control shows a ring', focus.shadow !== 'none' || focus.outline !== 'none', JSON.stringify(focus));

  // Small controls must still be reachable by a thumb.
  const hits = await page.evaluate(() => {
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const inside = (x, y) => { const t = document.elementFromPoint(x, y); return t === el || el.contains(t); };
      // Four pixels above and below the visual box must still hit the control.
      return { sel, vertical: inside(r.left + r.width / 2, r.top - 4) && inside(r.left + r.width / 2, r.bottom + 4) };
    };
    return ['#scan-btn', '#sclear', '#new-folder-link', '#tl'].map(probe).filter(Boolean);
  });
  check('X7 small controls carry an extended hit area',
    hits.every(h => h.vertical), JSON.stringify(hits));

  await context.close();
}

// ── dark mode is a real theme, not an inversion ───────────────────────────
{
  const { page, context } = await open('dark');
  const theme = await page.evaluate(() => {
    const value = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const luminance = (rgb) => {
      const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const cardBg = getComputedStyle(document.querySelector('.sc')).backgroundColor;
    const title = getComputedStyle(document.querySelector('.ntitle')).color;
    return {
      surface: value('--surface'),
      brand: value('--brand'),
      cardLuma: luminance(cardBg),
      titleLuma: luminance(title),
      thumb: value('--thumb-bg'),
      track: value('--track'),
    };
  });

  check('X8 dark mode swaps the whole surface set, not just text',
    theme.surface === '#060E22' && theme.brand === '#5B8CFF', JSON.stringify(theme.surface + ' ' + theme.brand));
  check('X9 cards are dark and text is light', theme.cardLuma < 0.35 && theme.titleLuma > 0.6,
    `card ${theme.cardLuma.toFixed(2)}, text ${theme.titleLuma.toFixed(2)}`);
  check('X10 the empty-photo plate follows the theme', theme.thumb.includes('30, 47, 88'), theme.thumb.slice(0, 60));
  check('X11 progress tracks follow the theme', theme.track.includes('255, 255, 255'), theme.track);

  // Nothing may stay pale: sample every visible surface for a light background
  // paired with light text, which is the signature of a missed token.
  const contrastProblems = await page.evaluate(() => {
    const luminance = (rgb) => {
      const parts = rgb.match(/[\d.]+/g);
      if (!parts) return null;
      const [r, g, b, a = 1] = parts.map(Number);
      if (a < 0.4) return null;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const problems = [];
    for (const el of document.querySelectorAll('.app *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 12) continue;
      const style = getComputedStyle(el);
      const bg = luminance(style.backgroundColor);
      const fg = luminance(style.color);
      if (bg === null || fg === null) continue;
      if (bg > 0.75 && fg > 0.6) problems.push(el.className.toString().slice(0, 30) || el.tagName);
    }
    return [...new Set(problems)];
  });
  check('X12 no light-on-light surface survives in dark mode',
    contrastProblems.length === 0, JSON.stringify(contrastProblems).slice(0, 160));

  await context.close();
}

// ── reduced motion ────────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  const motion = await page.evaluate(() => ({
    fast: getComputedStyle(document.documentElement).getPropertyValue('--motion-fast').trim(),
    normal: getComputedStyle(document.documentElement).getPropertyValue('--motion').trim(),
  }));
  check('X13 reduced motion collapses the durations at the token level',
    motion.fast === '0ms' && motion.normal === '0ms', JSON.stringify(motion));
  await context.close();
}

await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach(p => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach(f => console.log('  ✗', f)); process.exit(1); }
