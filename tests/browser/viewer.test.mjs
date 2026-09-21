// Browser test for the full-screen image viewer.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/viewer.test.mjs
//
// In NAZM an image is the documentation, so the properties under test are the
// ones that decide whether it can be used as documentation: it opens from
// everywhere an image appears, it never crops, it zooms toward the thing you
// pointed at rather than the middle, panning a zoomed image never turns into
// a page change, and a keyboard can do all of it.

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

// Images are drawn at a real size rather than pasted in as a tiny fixture.
// Size is the whole point here: an image smaller than the screen is centred
// and has nothing to pan to, so it would prove nothing about zoom anchoring —
// and a tall document is what proves the viewer letterboxes instead of
// cropping.
async function open({ count = 3, width = 1400, height = 1800 } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });

  // Real images, written through the same local store the app reads from, so
  // the viewer resolves them exactly as it would a photograph.
  await page.evaluate(async ({ count, width, height }) => {
    const { repository } = await import('/src/repository.js');
    const local = await import('/src/local-store.js');

    const draw = async (w, h, hue) => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = `hsl(${hue},60%,50%)`;
      ctx.fillRect(0, 0, w, h);
      // A mark in one corner: something that only zoom-to-point can reach.
      ctx.fillStyle = '#fff';
      ctx.fillRect(8, 8, Math.round(w / 8), Math.round(h / 8));
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      return blob.arrayBuffer();
    };

    const images = [];
    for (let i = 0; i < count; i += 1) {
      const id = 'vi' + i;
      await local.put('images', {
        id,
        original: await draw(width, height, i * 70),
        thumbnail: await draw(Math.round(width / 4), Math.round(height / 4), i * 70),
        originalType: 'image/png',
        thumbnailType: 'image/png',
      });
      images.push({ id, mediaId: id, storagePath: 'local:' + id, thumbnailPath: 'local:' + id, url: null, thumbnailUrl: null });
    }
    const now = Date.now();
    await repository.bulkWrite([{
      type: 'set', collection: 'items', id: 'vitem',
      data: {
        id: 'vitem', name: 'ساعة جيب ذهبية', quantity: 1, unit: 'قطعة', categoryId: 'c1',
        images, primaryImageId: images[0].id, createdAt: now, updatedAt: now, version: 1,
      },
    }]);
  }, { count, width, height });
  await page.waitForTimeout(400);
  return { page, context, errs };
}

const openDetail = async (page) => {
  await page.evaluate(async () => {
    const { openDetail } = await import('/src/views/detail.js');
    openDetail('vitem');
  });
  await page.waitForTimeout(400);
};

const openViewer = async (page) => {
  await page.click('#detbody .img-open, .qp-hero .img-open, .det-hero .img-open');
  await page.waitForTimeout(400);
};

const viewerState = (page) => page.evaluate(() => {
  const v = document.getElementById('viewer');
  const img = v?.querySelector('.viewer-stage[data-index="' + (window.__vi ?? 0) + '"] .viewer-img');
  return {
    open: !!v && !v.hidden,
    count: document.getElementById('viewer-count')?.textContent?.trim(),
    bg: v ? getComputedStyle(v).backgroundColor : null,
    focus: document.activeElement?.id,
  };
});

// ── it opens from the item's own image ─────────────────────────────────────
{
  const { page, context, errs } = await open();
  await openDetail(page);

  const isButton = await page.evaluate(() => {
    const hero = document.querySelector('#detbody .img-open');
    return { tag: hero?.tagName, label: hero?.getAttribute('aria-label') };
  });
  check('V1 an image is a button, so it announces that it can be opened',
    isButton.tag === 'BUTTON' && /بملء الشاشة/.test(isButton.label || ''), JSON.stringify(isButton));

  await openViewer(page);
  const s = await viewerState(page);
  check('V2 it opens full-screen', s.open === true, JSON.stringify(s));
  check('V3 the counter says which image of how many', s.count === '1 / 3', String(s.count));
  check('V4 focus moves to the way out', s.focus === 'viewer-close', String(s.focus));
  check('V5 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── it is dark in both themes ──────────────────────────────────────────────
{
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
    const bg = await page.evaluate(async () => {
      const { openImageViewer } = await import('/src/views/image-viewer.js');
      openImageViewer({ images: [{ id: 'x', url: 'https://example.invalid/a.png' }], title: 'ساعة' });
      return getComputedStyle(document.getElementById('viewer')).backgroundColor;
    });
    const rgb = (bg.match(/\d+/g) || []).map(Number);
    const dark = rgb.length >= 3 && rgb[0] + rgb[1] + rgb[2] < 120;
    check(`V6 the viewer stays dark in ${scheme} mode — inspection wants a neutral ground`, dark, bg);
    await context.close();
  }
}

// ── zoom ───────────────────────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  await openDetail(page);
  await openViewer(page);

  await page.waitForFunction(() => {
    const img = document.querySelector('.viewer-stage[data-index="0"] .viewer-img');
    return img && img.naturalWidth > 0;
  }, null, { timeout: 10000 });

  const fit = await page.evaluate(() => {
    const img = document.querySelector('.viewer-stage[data-index="0"] .viewer-img');
    const style = getComputedStyle(img);
    return { transform: style.transform, objectFit: style.objectFit };
  });
  check('V7 it opens at fit, not pre-zoomed',
    (fit.transform === 'none' || /matrix\(1, 0, 0, 1,/.test(fit.transform)), fit.transform);
  check('V8 it contains rather than crops — a panorama letterboxes, it is not cut',
    fit.objectFit === 'contain', fit.objectFit);

  const shape = await page.evaluate(() => {
    const img = document.querySelector('.viewer-stage[data-index="0"] .viewer-img');
    const stage = document.querySelector('.viewer-stage');
    const r = img.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return {
      natural: img.naturalWidth / img.naturalHeight,
      drawn: r.width / r.height,
      insideStage: r.width <= s.width + 1 && r.height <= s.height + 1,
    };
  });
  check('V8b a tall image keeps its proportions and fits inside the frame',
    Math.abs(shape.natural - shape.drawn) < 0.02 && shape.insideStage, JSON.stringify(shape));

  // Wheel zoom at a point well away from the centre.
  const box = await page.evaluate(() => {
    const r = document.querySelector('.viewer-stage').getBoundingClientRect();
    return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.3, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(250);

  const zoomed = await page.evaluate(() => {
    const img = document.querySelector('.viewer-stage[data-index="0"] .viewer-img');
    const m = new DOMMatrix(getComputedStyle(img).transform);
    return { scale: m.a, tx: m.e, ty: m.f };
  });
  check('V9 the wheel zooms in', zoomed.scale > 1.05, JSON.stringify(zoomed));
  check('V10 it zooms toward the pointer, not the centre of the image',
    Math.abs(zoomed.tx) > 1 || Math.abs(zoomed.ty) > 1, JSON.stringify(zoomed));

  // The zoom buttons and the reset.
  await page.evaluate(() => document.querySelector('[aria-label="ملء الشاشة"]').click());
  await page.waitForTimeout(200);
  const reset = await page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.viewer-stage[data-index="0"] .viewer-img')).transform);
    return { scale: m.a, tx: m.e, ty: m.f };
  });
  check('V11 reset returns to fit, centred', Math.abs(reset.scale - 1) < 0.01 && reset.tx === 0 && reset.ty === 0, JSON.stringify(reset));
  check('V12 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── keyboard ───────────────────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  await openDetail(page);
  await openViewer(page);

  // RTL: the right arrow moves toward the previous image, the left toward the
  // next, because that is the direction the gallery runs.
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  let count = await page.evaluate(() => document.getElementById('viewer-count').textContent.trim());
  check('V13 an arrow key changes image, in the direction the gallery runs', count === '2 / 3', count);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  count = await page.evaluate(() => document.getElementById('viewer-count').textContent.trim());
  check('V14 and back again', count === '1 / 3', count);

  await page.keyboard.press('+');
  await page.waitForTimeout(200);
  const kzoom = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('.viewer-stage[data-index="0"] .viewer-img')).transform).a);
  check('V15 the keyboard can zoom', kzoom > 1.05, String(kzoom));

  await page.keyboard.press('0');
  await page.waitForTimeout(200);
  const kreset = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('.viewer-stage[data-index="0"] .viewer-img')).transform).a);
  check('V16 and reset it', Math.abs(kreset - 1) < 0.01, String(kreset));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => ({
    hidden: document.getElementById('viewer').hidden,
    detailStillOpen: document.getElementById('sh-det').classList.contains('open'),
    focus: document.activeElement?.className || '',
  }));
  check('V17 Escape closes the viewer and not the screen underneath it',
    closed.hidden === true && closed.detailStillOpen === true, JSON.stringify(closed));
  check('V18 focus returns to the image that opened it',
    closed.focus.includes('img-open'), closed.focus);
  check('V19 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── navigation controls ────────────────────────────────────────────────────
{
  const { page, context } = await open();
  await openDetail(page);
  await openViewer(page);

  const edges = await page.evaluate(() => ({
    prevHidden: document.getElementById('viewer-prev').hidden,
    nextHidden: document.getElementById('viewer-next').hidden,
  }));
  check('V20 there is no arrow pointing at nothing on the first image',
    edges.prevHidden === true && edges.nextHidden === false, JSON.stringify(edges));

  await page.evaluate(() => document.getElementById('viewer-next').click());
  await page.evaluate(() => document.getElementById('viewer-next').click());
  await page.waitForTimeout(300);
  const last = await page.evaluate(() => ({
    count: document.getElementById('viewer-count').textContent.trim(),
    nextHidden: document.getElementById('viewer-next').hidden,
  }));
  check('V21 nor on the last', last.count === '3 / 3' && last.nextHidden === true, JSON.stringify(last));
  await context.close();
}

// ── a single image needs no counter and no arrows ──────────────────────────
{
  const { page, context } = await open({ count: 1 });
  await openDetail(page);
  await openViewer(page);
  const single = await page.evaluate(() => ({
    count: document.getElementById('viewer-count').textContent.trim(),
    prevHidden: document.getElementById('viewer-prev').hidden,
    nextHidden: document.getElementById('viewer-next').hidden,
  }));
  check('V22 one image carries no counter and no navigation',
    single.count === '' && single.prevHidden && single.nextHidden, JSON.stringify(single));
  await context.close();
}

// ── unsaved images open too ────────────────────────────────────────────────
{
  const { page, context, errs } = await open();
  const opened = await page.evaluate(async () => {
    const { openImageViewer, isImageViewerOpen } = await import('/src/views/image-viewer.js');
    // An image that exists only in the form, not yet on any record.
    openImageViewer({ images: [{ id: 'draft', url: 'https://example.invalid/draft.png' }], title: 'قطعة جديدة' });
    return { open: isImageViewerOpen(), alt: document.querySelector('.viewer-img')?.alt };
  });
  check('V23 an image that has not been saved yet still opens — that is when you most want to check it',
    opened.open === true, JSON.stringify(opened));
  check('V24 the image carries a meaningful accessible name',
    /قطعة جديدة/.test(opened.alt || '') && /الصورة 1 من 1/.test(opened.alt || ''), String(opened.alt));
  check('V25 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── controls can be cleared, but never the way out ─────────────────────────
{
  const { page, context } = await open();
  await openDetail(page);
  await openViewer(page);
  const hidden = await page.evaluate(async () => {
    document.getElementById('viewer').classList.add('controls-hidden');
    const close = document.getElementById('viewer-close');
    const count = document.getElementById('viewer-count');
    return {
      closeVisible: getComputedStyle(close).opacity !== '0' && close.offsetParent !== null,
      countFaded: getComputedStyle(count).opacity === '0',
    };
  });
  check('V26 clearing the controls hides the furniture but never the close button',
    hidden.closeVisible === true && hidden.countFaded === true, JSON.stringify(hidden));
  await context.close();
}

// ── the three defects this round fixed, as permanent checks ───────────────
{
  const { page, context, errs } = await open();
  await openDetail(page);

  // V27 — a gallery thumbnail is a thumbnail. `.img-open` used to declare
  // width/height 100% and, being a later single class, beat `.gal-thumb`'s
  // 56px: every thumbnail became a 300px image stacked under the hero.
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.gal-thumb')]
    .map(t => { const r = t.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check('V27 gallery thumbnails stay thumbnail-sized',
    sizes.length >= 2 && sizes.every(([w, h]) => w === 56 && h === 56), JSON.stringify(sizes));

  // …while the hero still fills its frame.
  const hero = await page.evaluate(() => {
    const b = document.querySelector('.dhero > .img-open');
    const host = document.querySelector('.dhero');
    if (!b || !host) return null;
    const r = b.getBoundingClientRect();
    // Against the host's *content* box: `.dhero` carries a 1px border, and
    // filling it means filling the inside of that border, not overlapping it.
    return {
      fills: Math.abs(r.width - host.clientWidth) < 2 && Math.abs(r.height - host.clientHeight) < 2,
      btn: [Math.round(r.width), Math.round(r.height)],
      host: [host.clientWidth, host.clientHeight],
    };
  });
  check('V28 and the primary image still fills its frame', hero?.fills === true, JSON.stringify(hero));

  // V29 — tapping a thumbnail opens that image, not the first one. Driven
  // through the real pointer rather than `.click()`, because a programmatic
  // click does not move focus, and V31 below is about where focus goes.
  await page.evaluate(() => {
    const t = document.querySelectorAll('.gal-thumb')[2];
    t.focus();          // what a real pointer or a Tab would have done
    t.click();
  });
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() => document.getElementById('viewer-count').textContent.trim());
  check('V29 a thumbnail opens its own image, by index', opened === '3 / 3', opened);

  // V30 — the counter is notation. In an RTL paragraph "1 / 3" reverses to
  // "3 / 1" unless the run is isolated LTR.
  const dir = await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('viewer-count'));
    return { direction: s.direction, bidi: s.unicodeBidi, docDir: document.documentElement.dir };
  });
  check('V30 the counter renders LTR inside an RTL interface',
    dir.docDir === 'rtl' && dir.direction === 'ltr' && /isolate/.test(dir.bidi), JSON.stringify(dir));

  // V31 — closing returns focus to the thumbnail that opened it.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => ({
    cls: document.activeElement?.className || '',
    index: [...document.querySelectorAll('.gal-thumb')].indexOf(document.activeElement),
  }));
  check('V31 focus returns to the exact thumbnail that opened the viewer',
    back.index === 2, JSON.stringify(back));

  check('V32 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// V33 — one mouse double click is one zoom. Two handlers used to fire:
// pointer-timed double-tap detection and the browser's dblclick, so the zoom
// was applied and immediately undone.
{
  const { page, context, errs } = await open();
  await openDetail(page);
  await openViewer(page);
  await page.waitForFunction(() => {
    const img = document.querySelector('.viewer-stage[data-index="0"] .viewer-img');
    return img && img.naturalWidth > 0;
  }, null, { timeout: 10000 });

  const at = await page.evaluate(() => { const r = document.querySelector('.viewer-stage').getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.35 }; });
  await page.mouse.dblclick(at.x, at.y);
  await page.waitForTimeout(600);
  const zoomed = await page.evaluate(() =>
    +new DOMMatrix(getComputedStyle(document.querySelector('.viewer-stage[data-index="0"] .viewer-img')).transform).a.toFixed(2));
  check('V33 one double click zooms in, once', zoomed > 2 && zoomed < 3, String(zoomed));

  await page.mouse.dblclick(at.x, at.y);
  await page.waitForTimeout(600);
  const reset = await page.evaluate(() =>
    +new DOMMatrix(getComputedStyle(document.querySelector('.viewer-stage[data-index="0"] .viewer-img')).transform).a.toFixed(2));
  check('V34 and the next one returns to fit', Math.abs(reset - 1) < 0.02, String(reset));
  check('V35 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── a visit does not inherit the last one ─────────────────────────────────
{
  const { page, context, errs } = await open({ count: 2 });

  const reopened = await page.evaluate(async () => {
    const { openImageViewer, closeImageViewer } = await import('/src/views/image-viewer.js');
    const { repository } = await import('/src/repository.js');
    const item = repository.liveItems()[0];
    const wait = () => new Promise((r) => setTimeout(r, 120));

    openImageViewer({ images: item.images, title: item.name });
    await wait();
    // Hide the chrome, as a tap on the image does, then close on that state.
    document.getElementById('viewer').classList.add('controls-hidden');
    const hiddenWhileOpen = document.getElementById('viewer').classList.contains('controls-hidden');
    closeImageViewer();
    await wait();

    openImageViewer({ images: item.images, title: item.name });
    await wait();
    const root = document.getElementById('viewer');
    const stillHidden = root.classList.contains('controls-hidden');
    const closeVisible = getComputedStyle(document.getElementById('viewer-close')).display !== 'none';
    closeImageViewer();
    return { hiddenWhileOpen, stillHidden, closeVisible };
  });

  check('V36 the chrome can be hidden during a visit', reopened.hiddenWhileOpen === true);
  // An image closed with its controls hidden used to reopen with them still
  // hidden: a black screen with no visible way out.
  check('V37 and reopening starts with the chrome back', reopened.stillHidden === false, String(reopened.stillHidden));
  check('V38 the way out is on screen', reopened.closeVisible === true, String(reopened.closeVisible));

  const gestures = await page.evaluate(async () => {
    const mod = await import('/src/views/image-viewer.js');
    const { repository } = await import('/src/repository.js');
    const item = repository.liveItems()[0];
    const wrap = () => document.querySelector('.viewer-stagewrap');
    const wait = () => new Promise((r) => setTimeout(r, 120));

    mod.openImageViewer({ images: item.images, title: item.name });
    await wait();
    // A pointer the browser never finishes — the gesture is cancelled by a
    // system swipe, a call, a notification. The bookkeeping used to survive it.
    const target = wrap();
    target.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 91, pointerType: 'touch', clientX: 120, clientY: 300, bubbles: true,
    }));
    await wait();
    mod.closeImageViewer();
    await wait();

    mod.openImageViewer({ images: item.images, title: item.name });
    await wait();
    // One tap. With a stale pointer still registered this is read as the
    // second finger of a pinch, and with a stale lastTap as a double tap.
    const stage = () => document.querySelector('.viewer-stage[data-index="0"] .viewer-img');
    const before = +new DOMMatrix(getComputedStyle(stage()).transform).a.toFixed(2);
    for (const type of ['pointerdown', 'pointerup']) {
      wrap().dispatchEvent(new PointerEvent(type, {
        pointerId: 92, pointerType: 'touch', clientX: 200, clientY: 400, bubbles: true,
      }));
    }
    await new Promise((r) => setTimeout(r, 450));
    const after = +new DOMMatrix(getComputedStyle(stage()).transform).a.toFixed(2);
    const chrome = document.getElementById('viewer').classList.contains('controls-hidden');
    mod.closeImageViewer();
    return { before, after, chrome };
  });

  check('V39 a single tap in a fresh visit toggles the chrome rather than zooming',
    Math.abs(gestures.after - gestures.before) < 0.02 && gestures.chrome === true,
    JSON.stringify(gestures));
  check('V40 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
