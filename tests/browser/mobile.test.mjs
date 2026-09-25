// Browser test: the phone. Keyboard versus pinch-zoom, the shell that owns
// the screen, safe areas in landscape, the barcode scanner without
// BarcodeDetector, touch targets and field sizes, the installed app.
//
//   DO NOT FIGHT THE MOBILE VIEWPORT. LET ONE SHELL OWN THE SCREEN.
//   FEATURE-DETECT BROWSER CAPABILITIES.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/mobile.test.mjs
//
// What this cannot do is be an iPhone: WebKit's toolbar, its keyboard and its
// status bar are not in Chromium. It checks the logic and the layout those
// depend on — see TESTING.md for the device checklist.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planStub } from './plan-stub.mjs';
import { autoChooseLanguage } from './language-gate.mjs';
import { dataUrlFile, drawEan13, drawQr } from './barcode-fixtures.mjs';
import { writeQrY4m } from './camera-fixture.mjs';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const TMP = mkdtempSync(join(tmpdir(), 'nazm-mobile-'));
const pass = [], fail = [];
const check = (n, ok, d = '') => {
  (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
  if (process.env.VERBOSE) console.error(ok ? '✓' : '✗', n, ok ? '' : d);
};
const section = (name) => { if (process.env.VERBOSE) console.error('──', name); };
const QUIET = /gstatic|ERR_|net::|firebase|camera refused|live scan ended|photo not read|fallback decoder/;

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };

async function context(browser, options = {}, lang = 'en') {
  const ctx = await browser.newContext({ ...PHONE, ...options });
  await ctx.route('**/src/subscription.js', (r) => r.fulfill({ contentType: 'text/javascript', body: planStub({ planId: 'business' }) }));
  if (lang !== 'en') await ctx.addInitScript((l) => { window.__NAZM_TEST_LANGUAGE__ = l; }, lang);
  return ctx;
}

async function open(ctx, path = '/index.html') {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !QUIET.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  return { page, errs };
}

// ── 1. keyboard needs a focused field; pinch-zoom is not a keyboard (§3–§10) ─
{
  section('1');
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'en');
  const ctx = await context(browser);
  // A controllable visualViewport, installed before the app reads it.
  await ctx.addInitScript(() => {
    const target = new EventTarget();
    const fake = Object.assign(target, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    window.__vv = (patch) => { Object.assign(fake, patch); fake.dispatchEvent(new Event('resize')); };
  });
  const { page, errs } = await open(ctx);
  const kb = () => page.evaluate(() => ({
    open: document.body.classList.contains('kb-open'),
    kb: getComputedStyle(document.documentElement).getPropertyValue('--kb').trim(),
    nav: getComputedStyle(document.querySelector('.tbar')).transform,
  }));
  const settle = () => page.waitForTimeout(450);

  await page.evaluate(() => window.__vv({ height: 422, scale: 2 }));
  await settle();
  const zoomed = await kb();
  check('M1 a pinch-zoomed page with nothing focused is not a keyboard', !zoomed.open && zoomed.kb === '0px' && zoomed.nav === 'none', JSON.stringify(zoomed));

  await page.evaluate(() => window.__vv({ height: 544, scale: 1 }));
  await settle();
  const toolbar = await kb();
  check('M2 a shorter visual viewport with nothing focused (toolbar, rotation) is not a keyboard', !toolbar.open, JSON.stringify(toolbar));

  await page.evaluate(() => window.__vv({ height: 844, scale: 1 }));
  await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({}));
  await page.waitForTimeout(400);
  await page.focus('#f-name');
  await page.evaluate(() => window.__vv({ height: 508 }));
  await settle();
  const typing = await kb();
  check('M3 a focused text field with 336px hidden below is a keyboard: --kb 336px, nav hidden',
    typing.open && typing.kb === '336px' && typing.nav !== 'none', JSON.stringify(typing));
  const sheet = await page.evaluate(() => getComputedStyle(document.getElementById('sh-add')).bottom);
  check('M4 the open sheet lifts by exactly the keyboard', sheet === '336px', sheet);

  await page.evaluate(() => window.__vv({ height: 254, scale: 2 }));
  await settle();
  const zoomTyping = await kb();
  check('M5 zooming while a field is focused is still not read as a bigger keyboard', !zoomTyping.open && zoomTyping.kb === '0px', JSON.stringify(zoomTyping));

  await page.evaluate(() => window.__vv({ height: 508, scale: 1 }));
  await settle();
  await page.evaluate(() => document.activeElement.blur());
  // Safari takes a moment to lower the keyboard after the blur.
  await page.waitForTimeout(80);
  await page.evaluate(() => window.__vv({ height: 844 }));
  await settle();
  const closed = await kb();
  check('M6 closing the keyboard resets --kb to 0 and brings the nav back', !closed.open && closed.kb === '0px' && closed.nav === 'none', JSON.stringify(closed));

  await page.evaluate(() => { const box = document.createElement('input'); box.type = 'checkbox'; box.id = 'cbx'; document.getElementById('sh-add').appendChild(box); box.focus(); });
  await page.evaluate(() => window.__vv({ height: 508 }));
  await settle();
  const checkbox = await kb();
  check('M7 a focused checkbox brings no keyboard', !checkbox.open, JSON.stringify(checkbox));
  await page.evaluate(() => { document.getElementById('cbx').remove(); window.__vv({ height: 844 }); });

  const helper = await page.evaluate(async () => {
    const { isEditableElement } = await import('/src/viewport.js');
    const make = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
    return {
      text: isEditableElement(make('<input>')), search: isEditableElement(make('<input type="search">')),
      email: isEditableElement(make('<input type="email">')), area: isEditableElement(make('<textarea></textarea>')),
      editable: isEditableElement(Object.assign(make('<div contenteditable="true"></div>'), {})),
      checkbox: isEditableElement(make('<input type="checkbox">')), button: isEditableElement(make('<button></button>')),
      select: isEditableElement(make('<select></select>')), readonly: isEditableElement(make('<input readonly>')),
      disabled: isEditableElement(make('<input disabled>')),
    };
  });
  check('M8 isEditableElement: text-like fields yes; checkbox, button, select, read-only and disabled no',
    helper.text && helper.search && helper.email && helper.area && !helper.checkbox && !helper.button
    && !helper.select && !helper.readonly && !helper.disabled, JSON.stringify(helper));
  check('M9 no errors in the keyboard checks', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

// ── 2. real pinch-zoom (Chromium page scale), and the shell (§11–§14) ───────
{
  section('2');
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'ar');
  const ctx = await context(browser, {}, 'ar');
  const { page, errs } = await open(ctx);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.waitForTimeout(500);
  const zoom = await page.evaluate(() => ({
    scale: window.visualViewport.scale, open: document.body.classList.contains('kb-open'),
    kb: getComputedStyle(document.documentElement).getPropertyValue('--kb').trim(),
  }));
  check('M10 a real page zoom (scale 2) leaves keyboard mode off', zoom.scale > 1.5 && !zoom.open && zoom.kb === '0px', JSON.stringify(zoom));
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

  const meta = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
  check('M11 page zoom stays allowed: no user-scalable=no, no maximum-scale', !/user-scalable\s*=\s*no|maximum-scale/i.test(meta) && /viewport-fit=cover/.test(meta), meta);
  const touch = await page.evaluate(() => ({
    vscroll: getComputedStyle(document.querySelector('.vscroll')).touchAction,
    shscroll: getComputedStyle(document.querySelector('.shscroll')).touchAction,
    body: getComputedStyle(document.body).touchAction,
  }));
  check('M12 scroll regions keep pinch-zoom (pan-y pinch-zoom), nothing global is touch-action:none',
    /pinch-zoom/.test(touch.vscroll) && /pinch-zoom/.test(touch.shscroll) && touch.body !== 'none', JSON.stringify(touch));

  const shell = await page.evaluate(() => {
    const app = document.querySelector('.app');
    const tbar = document.querySelector('.tbar');
    const select = document.getElementById('select-bar');
    const fixed = [...document.querySelectorAll('body *')].filter((n) => getComputedStyle(n).position === 'fixed' && n.closest('.app') && n !== app);
    return {
      tbarInside: app.contains(tbar), selectInside: app.contains(select),
      tbarPos: getComputedStyle(tbar).position, selectPos: getComputedStyle(select).position,
      appPos: getComputedStyle(app).position,
      tbarBottom: Math.round(tbar.getBoundingClientRect().bottom), vh: innerHeight,
      fixedInsideApp: fixed.length,
    };
  });
  check('M13 one shell owns the screen: .app is the only fixed layer; tab bar and selection bar are anchored inside it',
    shell.tbarInside && shell.selectInside && shell.tbarPos === 'absolute' && shell.selectPos === 'absolute'
    && shell.appPos === 'fixed' && shell.fixedInsideApp === 0, JSON.stringify(shell));
  check('M14 the tab bar still sits on the bottom edge', shell.tbarBottom === shell.vh, JSON.stringify(shell));

  // Selection bar above the tab bar.
  await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    await repository.createItem({ name: 'Lamp', quantity: 1 });
  });
  await page.waitForTimeout(500);
  await page.evaluate(async () => (await import('/src/views/home.js')).startSelection());
  await page.waitForTimeout(400);
  const selecting = await page.evaluate(() => {
    const bar = document.getElementById('select-bar').getBoundingClientRect();
    const tab = document.querySelector('.tbar').getBoundingClientRect();
    return { barBottom: Math.round(bar.bottom), tabTop: Math.round(tab.top), visible: bar.height > 0 };
  });
  check('M15 the selection bar sits exactly on top of the tab bar', selecting.visible && Math.abs(selecting.barBottom - selecting.tabTop) <= 1, JSON.stringify(selecting));
  await page.evaluate(async () => (await import('/src/views/home.js')).endSelection());

  // Desktop still gets the rail.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  const rail = await page.evaluate(() => {
    const r = document.querySelector('.tbar').getBoundingClientRect();
    return { height: Math.round(r.height), vh: innerHeight, width: Math.round(r.width), right: Math.round(r.right), vw: innerWidth };
  });
  check('M16 desktop keeps the full-height rail on the inline-start (right in Arabic)', rail.height === rail.vh && rail.width < 140 && rail.right === rail.vw, JSON.stringify(rail));
  check('M17 no errors in the shell checks', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

// ── 3. landscape notch: every edge clears the inset once (§16–§20, §55) ────
{
  section('3');
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'en');
  for (const lang of ['en', 'ar']) {
    const ctx = await context(browser, { viewport: { width: 844, height: 390 } }, lang);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 47, right: 47, top: 0, bottom: 21 } });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const edges = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const tbar = r('.tbar');
      const pad = (sel) => { const s = getComputedStyle(document.querySelector(sel)); return [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)]; };
      const tbarStyle = getComputedStyle(document.querySelector('.tbar'));
      return {
        tbar: [Math.round(tbar.left), Math.round(innerWidth - tbar.right)],
        tbarPadBottom: parseFloat(tbarStyle.paddingBottom),
        vscroll: pad('#v-home .vscroll'),
        nbar: pad('#v-home .nbar'),
        appTop: parseFloat(getComputedStyle(document.querySelector('.app')).paddingTop),
      };
    });
    check(`M18 ${lang} landscape: tab bar, list and header clear a 47px notch on both sides`,
      edges.tbar[0] >= 47 && edges.tbar[1] >= 47 && edges.vscroll[0] >= 47 && edges.vscroll[1] >= 47
      && edges.nbar[0] >= 47 && edges.nbar[1] >= 47, JSON.stringify(edges));
    check(`M19 ${lang} landscape: the bottom inset is applied once, by the tab bar`, edges.tbarPadBottom === 21, JSON.stringify(edges));

    // The image viewer: close button, count and menu clear the notch; no
    // double top gap.
    await page.evaluate(() => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 40, height: 30 });
      canvas.getContext('2d').fillRect(0, 0, 40, 30);
      return import('/src/views/image-viewer.js').then(({ openImageViewer }) => openImageViewer({
        images: [{ id: 'a', url: canvas.toDataURL() }, { id: 'b', url: canvas.toDataURL() }], index: 0, title: 'x',
        actions: [{ label: 'Make primary', onSelect: () => {} }],
      }));
    });
    await page.waitForTimeout(400);
    const viewer = await page.evaluate(() => {
      const close = document.getElementById('viewer-close').getBoundingClientRect();
      const end = document.getElementById('viewer-actions').getBoundingClientRect();
      const s = getComputedStyle(document.getElementById('viewer'));
      return { closeLeft: Math.round(Math.min(close.left, end.left)), closeRight: Math.round(innerWidth - Math.max(close.right, end.right)), padTop: parseFloat(s.paddingTop), padBottom: parseFloat(s.paddingBottom) };
    });
    check(`M20 ${lang} landscape viewer: controls clear the notch, the viewer box itself adds no inset`,
      viewer.closeLeft >= 47 && viewer.closeRight >= 47 && viewer.padTop === 0 && viewer.padBottom === 0, JSON.stringify(viewer));
    await page.keyboard.press('Escape');
    await ctx.close();
  }
  // The language gate in landscape with a notch.
  const gctx = await browser.newContext({ ...PHONE, viewport: { width: 844, height: 390 }, languageGate: 'show' });
  const gpage = await gctx.newPage();
  const gcdp = await gctx.newCDPSession(gpage);
  await gcdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 47, right: 47, top: 0, bottom: 21 } });
  await gpage.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await gpage.setViewportSize({ width: 844, height: 390 });
  const gate = await gpage.evaluate(() => {
    const s = getComputedStyle(document.getElementById('lang-gate'));
    const options = [...document.querySelectorAll('.lg-option')].map((b) => b.getBoundingClientRect());
    return {
      pad: [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)],
      options: options.every((r) => r.left >= 47 && innerWidth - r.right >= 47 && r.height >= 44),
      reachable: options.every((r) => { const el = document.elementFromPoint((r.left + r.right) / 2, Math.min(innerHeight - 2, (r.top + r.bottom) / 2)); return el?.closest('.lg-option'); }),
    };
  });
  check('M21 landscape language gate: both options clear the notch and are tappable', gate.pad[0] >= 47 && gate.pad[1] >= 47 && gate.options, JSON.stringify(gate));
  await browser.close();
}

// ── 4. the scanner without BarcodeDetector (§21–§30) ───────────────────────
{
  section('4');
  const qrVideo = join(TMP, 'qr.y4m');
  writeQrY4m('INV-2026-000777', qrVideo);
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${qrVideo}`],
  });
  autoChooseLanguage(browser, 'en');
  const ctx = await context(browser);
  const { page, errs } = await open(ctx);
  const native = await page.evaluate(() => 'BarcodeDetector' in window);
  check('M22 this browser has no BarcodeDetector — the Safari situation the fallback exists for', native === false, String(native));

  const vendorRequests = [];
  page.on('request', (r) => { if (r.url().includes('/public/vendor/zxing/')) vendorRequests.push(r.url()); });
  const scriptsAtBoot = await page.evaluate(() => [...document.scripts].some((s) => /zxing/.test(s.src)) || Boolean(window.ZXing));
  check('M23 the decoder is not part of startup', scriptsAtBoot === false && vendorRequests.length === 0, JSON.stringify({ scriptsAtBoot, vendorRequests }));

  // Live camera → ZXing → the barcode field.
  await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({}));
  await page.waitForTimeout(400);
  await page.click('#f-barcode-scan');
  const live = await page.waitForFunction(() => document.getElementById('f-barcode').value, null, { timeout: 20000 }).then(() => true).catch(() => false);
  const afterLive = await page.evaluate(() => ({
    value: document.getElementById('f-barcode').value,
    sheet: document.getElementById('sh-scan').classList.contains('open'),
    tracks: (document.getElementById('scan-video').srcObject?.getTracks?.() || []).filter((t) => t.readyState === 'live').length,
    video: document.getElementById('scan-video').getAttribute('playsinline') !== null && document.getElementById('scan-video').muted,
  }));
  check('M24 the live camera reads a QR code through the self-hosted ZXing and fills the field',
    live && afterLive.value === 'INV-2026-000777', JSON.stringify(afterLive));
  check('M25 …then the sheet closes and no camera track is left running', !afterLive.sheet && afterLive.tracks === 0, JSON.stringify(afterLive));
  check('M26 the preview is inline and muted (no native fullscreen on iPhone)', afterLive.video, JSON.stringify(afterLive));
  check('M27 the decoder was fetched once, from this origin, only when scanning began',
    vendorRequests.length === 1 && vendorRequests[0].startsWith(BASE), JSON.stringify(vendorRequests));

  // Camera stops on every way out.
  const liveTracks = () => page.evaluate(() => (document.getElementById('scan-video').srcObject?.getTracks?.() || []).filter((t) => t.readyState === 'live').length);
  const opened = async () => {
    await page.evaluate(async () => { void (await import('/src/views/scan.js')).openScanner({ onCode: () => {} }); });
    await page.waitForFunction(() => (document.getElementById('scan-video').srcObject?.getTracks?.() || []).some((t) => t.readyState === 'live'), null, { timeout: 10000 });
  };
  // Hold the fake camera on a blank frame so nothing is read while we test.
  await page.evaluate(async () => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
      const ctx2 = canvas.getContext('2d'); ctx2.fillStyle = '#888'; ctx2.fillRect(0, 0, 320, 240);
      window.__blankTimer = setInterval(() => ctx2.fillRect(0, 0, 320, 240), 100);
      return canvas.captureStream(10);
    };
    window.__realGUM = real;
  });
  await opened();
  await page.click('#sh-scan .shfoot [data-close]');
  await page.waitForTimeout(200);
  check('M28 Cancel stops the camera', (await liveTracks()) === 0 && !(await page.evaluate(() => document.getElementById('sh-scan').classList.contains('open'))));
  await opened();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('M29 Escape stops the camera', (await liveTracks()) === 0);
  await opened();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  check('M30 the app leaving the screen stops the camera', (await liveTracks()) === 0);
  await page.evaluate(() => { delete document.visibilityState; });
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('scan'));
  await opened();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await page.waitForTimeout(200);
  check('M31 pagehide (back-forward cache) stops the camera', (await liveTracks()) === 0);
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('scan'));

  // Errors say what happened, in the sheet, with the other ways still there.
  const errorFor = async (name) => {
    await page.evaluate((name) => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('x', name); }; }, name);
    await page.evaluate(async () => { void (await import('/src/views/scan.js')).openScanner({ onCode: () => {} }); });
    await page.waitForFunction(() => document.getElementById('scan-state').textContent.length > 20, null, { timeout: 10000 }).catch(() => {});
    const state = await page.evaluate(() => ({
      text: document.getElementById('scan-state').textContent,
      open: document.getElementById('sh-scan').classList.contains('open'),
      photo: document.getElementById('scan-photo').offsetParent !== null,
      manual: document.getElementById('scan-manual').offsetParent !== null,
    }));
    await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('scan'));
    return state;
  };
  const denied = await errorFor('NotAllowedError');
  const none = await errorFor('NotFoundError');
  const busy = await errorFor('NotReadableError');
  check('M32 camera denied, missing and busy each say so — and keep Choose Photo and Enter manually',
    /Settings/.test(denied.text) && /No camera/.test(none.text) && /in use/.test(busy.text)
    && [denied, none, busy].every((s) => s.open && s.photo && s.manual), JSON.stringify({ denied, none, busy }));

  // Photo fallback: QR and EAN-13.
  const qrFile = await dataUrlFile(await page.evaluate(`(${drawQr})('INV-2026-000888')`), join(TMP, 'qr.png'));
  const eanFile = await dataUrlFile(await page.evaluate(`(${drawEan13})('4006381333931')`), join(TMP, 'ean.png'));
  const blankFile = await dataUrlFile(await page.evaluate(() => { const c = Object.assign(document.createElement('canvas'), { width: 200, height: 200 }); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 200); return c.toDataURL(); }), join(TMP, 'blank.png'));
  const photo = async (file) => {
    const got = await page.evaluate(() => new Promise((resolve) => {
      window.__got = null;
      import('/src/views/scan.js').then(({ openScanner }) => openScanner({ onCode: (code) => { window.__got = code; } }));
      setTimeout(resolve, 300);
    }));
    await page.setInputFiles('#scan-photo-input', file);
    await page.waitForFunction(() => window.__got || document.getElementById('scan-state').textContent.includes('photo'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    const out = await page.evaluate(() => ({ code: window.__got, state: document.getElementById('scan-state').textContent }));
    await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('scan'));
    return out;
  };
  const qr = await photo(qrFile);
  const ean = await photo(eanFile);
  const blank = await photo(blankFile);
  check('M33 Choose Photo reads a QR code', qr.code?.value === 'INV-2026-000888' && qr.code.format === 'qr_code', JSON.stringify(qr));
  check('M34 Choose Photo reads an EAN-13', ean.code?.value === '4006381333931' && ean.code.format === 'ean_13', JSON.stringify(ean));
  check('M35 a photo with no code says so, precisely', !blank.code && /No barcode or QR code was found/.test(blank.state), JSON.stringify(blank));

  const manual = await page.evaluate(async () => {
    const { openItemForm } = await import('/src/views/item-form.js');
    await openItemForm({});
    return true;
  });
  await page.waitForTimeout(300);
  await page.click('#f-barcode-scan');
  await page.waitForTimeout(300);
  await page.click('#scan-manual');
  await page.waitForTimeout(500);
  const focus = await page.evaluate(() => ({ active: document.activeElement?.id, open: document.getElementById('sh-scan').classList.contains('open') }));
  check('M36 Enter manually closes the scanner and puts the cursor in the barcode field', manual && focus.active === 'f-barcode' && !focus.open, JSON.stringify(focus));
  check('M37 no errors in the scanner checks', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

// ── 5. the decoder cannot be had: say which (§90) ─────────────────────────
{
  section('5');
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'ar');
  const ctx = await context(browser, {}, 'ar');
  await ctx.route('**/public/vendor/zxing/**', (r) => r.abort('internetdisconnected'));
  const { page } = await open(ctx);
  const file = await dataUrlFile(await page.evaluate(`(${drawQr})('X-1')`), join(TMP, 'x.png'));
  await page.evaluate(() => import('/src/views/scan.js').then(({ openScanner }) => { void openScanner({ onCode: () => {} }); }));
  await page.waitForTimeout(300);
  await page.setInputFiles('#scan-photo-input', file);
  await page.waitForFunction(() => /قارئ الرموز/.test(document.getElementById('scan-state').textContent), null, { timeout: 10000 }).catch(() => {});
  const text = await page.evaluate(() => document.getElementById('scan-state').textContent);
  check('M38 an unreachable decoder is named as such, in Arabic, not as "scanning failed"', /قارئ الرموز/.test(text), text);
  await browser.close();
}

// ── 6. fields and targets on a phone, in both languages (§31–§42) ──────────
{
  section('6');
  const browser = await chromium.launch();
  for (const lang of ['en', 'ar']) {
    autoChooseLanguage(browser, lang);
    const ctx = await context(browser, {}, lang);
    const { page } = await open(ctx);
    await page.evaluate(async () => {
      const { repository } = await import('/src/repository.js');
      const folder = await repository.saveFolder({ name: 'Archive' });
      const item = await repository.createItem({ name: 'Lamp', quantity: 1, folderId: folder.id, sku: 'INV-2026-000321', serialNumber: 'SN-9' });
      window.__item = item.id;
    });
    await page.waitForTimeout(500);
    const audit = () => page.evaluate(() => {
      const hit = (n) => {
        const r = n.getBoundingClientRect(); const s = getComputedStyle(n);
        if (!(r.width > 0 && r.height > 0) || s.visibility === 'hidden' || s.display === 'none' || r.bottom < 0 || r.top > innerHeight) return false;
        const e = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, (r.left + r.right) / 2)), Math.min(innerHeight - 1, Math.max(0, (r.top + r.bottom) / 2)));
        return Boolean(e && (e === n || n.contains(e)));
      };
      const fonts = [];
      for (const n of document.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea, select')) {
        if (hit(n) && parseFloat(getComputedStyle(n).fontSize) < 16) fonts.push(`${n.id || n.className} ${getComputedStyle(n).fontSize}`);
      }
      const boxes = [];
      const small = [];
      for (const n of document.querySelectorAll('button, [role=tab], select, input:not([type=hidden]):not([type=file]), textarea')) {
        if (!hit(n) || n.disabled) continue;
        const r = n.getBoundingClientRect();
        let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        const after = getComputedStyle(n, '::after');
        if (after.content !== 'none' && after.position === 'absolute') {
          const w = parseFloat(after.width), h = parseFloat(after.height);
          if (w && h) { const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2; box = { l: Math.min(box.l, cx - w / 2), r: Math.max(box.r, cx + w / 2), t: Math.min(box.t, cy - h / 2), b: Math.max(box.b, cy + h / 2) }; }
          else if (after.inset && after.inset !== 'auto') { const i = parseFloat(after.top); if (i < 0) { box.t += i; box.b -= i; } }
        }
        boxes.push({ n, box });
        if (!/^(INPUT|TEXTAREA)$/.test(n.tagName) && (box.r - box.l < 43.5 || box.b - box.t < 43.5)) small.push(`${n.id || n.className} ${Math.round(box.r - box.l)}×${Math.round(box.b - box.t)}`);
      }
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (a.n.contains(c.n) || c.n.contains(a.n)) continue;
        // The tab bar and selection bar float above the scrolling list: a row
        // passing under them is covered, not competing (the bar takes the tap).
        const layer = (n) => Boolean(n.closest('.tbar, .select-bar'));
        if (layer(a.n) !== layer(c.n)) continue;
        const ox = Math.min(a.box.r, c.box.r) - Math.max(a.box.l, c.box.l);
        const oy = Math.min(a.box.b, c.box.b) - Math.max(a.box.t, c.box.t);
        if (ox > 1 && oy > 1) overlaps.push(`${a.n.id || a.n.className} ⟷ ${c.n.id || c.n.className}`);
      }
      return { fonts, small, overlaps };
    });
    const screens = {};
    screens.home = await audit();
    await page.evaluate(async () => (await import('/src/views/home.js')).openFilterSheet()); await page.waitForTimeout(400);
    screens.filter = await audit(); await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('filter'));
    await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({})); await page.waitForTimeout(400);
    screens.form = await audit(); await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('add'));
    await page.evaluate(async (id) => (await import('/src/views/detail.js')).openDetail(id), await page.evaluate(() => window.__item)); await page.waitForTimeout(500);
    screens.detail = await audit(); await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('det'));
    await page.evaluate(async () => (await import('/src/navigation.js')).goTab('ai')); await page.waitForTimeout(400);
    screens.assistant = await audit();
    await page.evaluate(async () => (await import('/src/navigation.js')).goTab('cats')); await page.waitForTimeout(400);
    screens.categories = await audit();
    const clear = await page.evaluate(async () => {
      const list = document.getElementById('catgrid').closest('.vscroll');
      list.scrollTop = list.scrollHeight;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const controls = [...list.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height > 0);
      const last = controls.at(-1)?.getBoundingClientRect().bottom ?? 0;
      const bar = document.querySelector('.tbar').getBoundingClientRect().top;
      list.scrollTop = 0;
      return { last: Math.round(last), bar: Math.round(bar) };
    });
    check(`M41b ${lang} categories: the last row scrolls fully clear of the tab bar`, clear.last > 0 && clear.last <= clear.bar, JSON.stringify(clear));
    await page.evaluate(async () => (await import('/src/views/manage.js')).openFolderSheet()); await page.waitForTimeout(400);
    screens.folder = await audit(); await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('fld'));
    await page.evaluate(async () => (await import('/src/views/manage.js')).openCategorySheet()); await page.waitForTimeout(400);
    screens.category = await audit(); await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('cat'));
    await page.evaluate(async () => { void (await import('/src/views/scan.js')).openScanner({ onCode: () => {} }); }); await page.waitForTimeout(500);
    screens.scanner = await audit(); await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('scan'));
    await page.evaluate(async () => (await import('/src/navigation.js')).goTab('set')); await page.waitForTimeout(400);
    screens.settings = await audit();
    await page.evaluate(() => import('/src/ui.js').then(({ confirmAction }) => { void confirmAction({ titleKey: 'common.delete', messageKey: 'confirm.cannotUndo', requirePhrase: 'delete' }); }));
    await page.waitForTimeout(300);
    screens.confirm = await audit();
    await page.evaluate(async () => (await import('/src/ui.js')).resolveConfirm(false));
    for (const [name, r] of Object.entries(screens)) {
      check(`M39 ${lang} ${name}: every field ≥16px (no iOS zoom on focus)`, r.fonts.length === 0, r.fonts.join(', '));
      check(`M40 ${lang} ${name}: every control ≥44×44`, r.small.length === 0, r.small.slice(0, 6).join(', '));
      check(`M41 ${lang} ${name}: no two hit areas overlap`, r.overlaps.length === 0, r.overlaps.slice(0, 6).join(', '));
    }
    await ctx.close();
  }
  await browser.close();
}

// ── 7. modals are modal; identifiers copy (§67, §68, §79, §80) ─────────────
{
  section('7');
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'en');
  const ctx = await context(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  const { page, errs } = await open(ctx);
  const id = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    return (await repository.createItem({ name: 'Clock', quantity: 1, sku: 'INV-2026-000555', serialNumber: 'AB-1234/C' })).id;
  });
  await page.evaluate(async (id) => (await import('/src/views/detail.js')).openDetail(id), id);
  await page.waitForTimeout(500);
  const inertSheet = await page.evaluate(() => ({ app: document.querySelector('.app').inert, sheet: document.getElementById('sh-det').inert }));
  check('M42 an open sheet makes the app behind it inert, not just covered', inertSheet.app === true && inertSheet.sheet === false, JSON.stringify(inertSheet));

  const copies = await page.evaluate(() => [...document.querySelectorAll('#sh-det .dfcopy')].map((b) => b.getAttribute('aria-label')));
  const idRows = await page.evaluate(() => [...document.querySelectorAll('#sh-det .dfval-id')].map((n) => ({ text: n.textContent, dir: n.getAttribute('dir'), select: getComputedStyle(n).userSelect })));
  check('M43 SKU and serial show left to right, selectable, each with a labelled Copy button',
    copies.includes('Copy SKU') && copies.includes('Copy Serial number')
    && idRows.every((r) => r.dir === 'ltr' && r.select !== 'none'), JSON.stringify({ copies, idRows }));
  await page.click('#sh-det .dfcopy[aria-label="Copy SKU"]');
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('M44 Copy puts exactly the SKU on the clipboard', clip === 'INV-2026-000555', clip);

  // A confirmation over the sheet: the sheet goes inert too, focus returns.
  await page.focus('#sh-det .dfcopy');
  const pending = page.evaluate(() => import('/src/ui.js').then(({ confirmAction }) => confirmAction({ titleKey: 'common.delete', messageKey: 'confirm.cannotUndo' })));
  await page.waitForTimeout(300);
  const inertConfirm = await page.evaluate(() => ({ sheet: document.getElementById('sh-det').inert, app: document.querySelector('.app').inert }));
  await page.click('#del-cancel-btn');
  const result = await pending;
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ sheet: document.getElementById('sh-det').inert, focus: document.activeElement?.className }));
  check('M45 a confirmation over a sheet makes the sheet inert too; cancelling restores it and returns focus',
    inertConfirm.sheet && inertConfirm.app && result === false && after.sheet === false && /dfcopy/.test(after.focus), JSON.stringify({ inertConfirm, after }));
  await page.evaluate(async () => (await import('/src/ui.js')).closeSheet('det'));
  await page.waitForTimeout(200);
  const released = await page.evaluate(() => document.querySelector('.app').inert);
  check('M46 closing the last sheet releases the app', released === false);
  check('M47 no errors in the modal checks', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

// ── 8. the installed app (§43–§54) ───────────────────────────────────────
{
  section('8');
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'ar');
  const ctx = await context(browser, {}, 'ar');
  const { page, errs } = await open(ctx, '/index.html?sw-test');
  const head = await page.evaluate(async () => {
    const manifestHref = document.querySelector('link[rel=manifest]').href;
    const manifest = await (await fetch(manifestHref)).json();
    const icons = await Promise.all(manifest.icons.map(async (icon) => {
      const blob = await (await fetch(new URL(icon.src, manifestHref))).blob();
      const bitmap = await createImageBitmap(blob);
      return { ...icon, actual: `${bitmap.width}x${bitmap.height}` };
    }));
    const touch = document.querySelector('link[rel=apple-touch-icon]');
    const touchBitmap = await createImageBitmap(await (await fetch(touch.href)).blob());
    return {
      manifest: { name: manifest.name, short: manifest.short_name, start: manifest.start_url, scope: manifest.scope, display: manifest.display, bg: manifest.background_color, theme: manifest.theme_color, orientation: manifest.orientation },
      icons,
      touch: { sizes: touch.getAttribute('sizes'), actual: `${touchBitmap.width}x${touchBitmap.height}` },
      status: document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]').content,
      themes: [...document.querySelectorAll('meta[name=theme-color]')].map((m) => `${m.media}:${m.content}`),
    };
  });
  check('M48 the manifest has name, short name, start URL, scope, standalone, colours, and does not lock orientation',
    head.manifest.name && head.manifest.short === 'نَظْم' && head.manifest.start && head.manifest.scope && head.manifest.display === 'standalone'
    && head.manifest.bg && head.manifest.theme && head.manifest.orientation !== 'portrait', JSON.stringify(head.manifest));
  check('M49 every manifest icon exists at its declared size, 192, 512 and a maskable 512',
    head.icons.every((i) => i.sizes === i.actual) && head.icons.some((i) => i.sizes === '192x192')
    && head.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), JSON.stringify(head.icons));
  check('M50 the Home Screen icon is a real 180×180', head.touch.sizes === '180x180' && head.touch.actual === '180x180', JSON.stringify(head.touch));
  check('M51 the status bar is "default" (readable in light and dark), with light and dark theme colours',
    head.status === 'default' && head.themes.length === 2, JSON.stringify({ status: head.status, themes: head.themes }));

  const controlled = await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).then(() => true).catch(() => false);
  check('M52 the service worker installs and takes control', controlled);
  // Load a scanner decoder and a module so they are cached, then go offline.
  await page.evaluate(() => import('/src/scanner.js').then(({ scannerEngine }) => scannerEngine().catch(() => null)));
  await page.waitForTimeout(500);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    return { names, urls };
  });
  const foreign = cached.urls.filter((u) => !u.startsWith(BASE));
  const nonStatic = cached.urls.filter((u) => !/\.(html|js|css|woff2|png|svg|webmanifest)$|\/$/.test(new URL(u).pathname));
  check('M53 the cache holds only this origin\'s static shell — nothing cross-origin, nothing dynamic',
    cached.urls.length > 5 && foreign.length === 0 && nonStatic.length === 0, JSON.stringify({ foreign, nonStatic, count: cached.urls.length }));
  check('M54 the barcode decoder is cached for offline scanning', cached.urls.some((u) => u.includes('/public/vendor/zxing/zxing.min.js')));

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const offline = await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('M55 offline, a reload opens the app from the cached shell', offline);
  await ctx.setOffline(false);

  const safety = await page.evaluate(async () => {
    const { safeToReload } = await import('/src/pwa.js');
    const idle = safeToReload();
    const { openItemForm } = await import('/src/views/item-form.js');
    await openItemForm({});
    const withForm = safeToReload();
    (await import('/src/ui.js')).closeSheet('add');
    return { idle, withForm };
  });
  check('M56 an update never reloads over an open form (and is allowed when idle)', safety.idle === true && safety.withForm === false, JSON.stringify(safety));
  check('M57 no errors in the installed-app checks', errs.filter((e) => !/Failed to fetch|ERR_INTERNET/.test(e)).length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

for (const line of pass) console.log(`  ✓ ${line}`);
for (const line of fail) console.log(`  ✗ ${line}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
