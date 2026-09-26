// Browser test: the app running under its production security policy.
//
//   npx http-server -p 8123 -c-1 &      (the other suites' server)
//   node tests/browser/security.test.mjs  (starts its own header-sending server on 8124)
//
// The headers come from tools/security-policy.mjs, generated from the shipped
// nazm.config.js — the same values firebase.json sends. Every CSP violation
// is recorded; required functionality must work with none.

import { autoChooseLanguage } from './language-gate.mjs';
import { startSecureServer } from './secure-server.mjs';
import { dataUrlFile, drawQr } from './barcode-fixtures.mjs';
import { writeQrY4m } from './camera-fixture.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const SECURE = 'http://127.0.0.1:8124';
const PLAIN = 'http://127.0.0.1:8123';
const TMP = mkdtempSync(join(tmpdir(), 'nazm-security-'));
const pass = [], fail = [];
const check = (n, ok, d = '') => {
  (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
  if (process.env.VERBOSE) console.error(ok ? '✓' : '✗', n, ok ? '' : d);
};
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const server = await startSecureServer(8124);

/** A page that records CSP violations, errors and every off-origin request. */
async function open(ctx, url) {
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber || ''}`));
  });
  const page = await ctx.newPage();
  const errs = [];
  const external = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  page.on('request', (r) => { if (!/^(http:\/\/127\.0\.0\.1:812[34]|data:|blob:)/.test(r.url())) external.push(r.url()); });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  return { page, errs, external, response };
}

const violations = (page) => page.evaluate(() => window.__csp);

// ── 1. the app under the production headers ────────────────────────────────
{
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'en');
  const ctx = await browser.newContext({ ...PHONE, release: true, acceptDownloads: true });
  const { page, errs, external, response } = await open(ctx, `${SECURE}/index.html`);
  const headers = response.headers();
  check('S1 the server sends the generated policy: CSP with frame-ancestors, nosniff, DENY, no-referrer, Permissions-Policy, COOP, CORP',
    /script-src 'self';/.test(headers['content-security-policy']) && /frame-ancestors 'none'/.test(headers['content-security-policy'])
    && headers['x-content-type-options'] === 'nosniff' && headers['x-frame-options'] === 'DENY' && headers['referrer-policy'] === 'no-referrer'
    && /camera=\(self\)/.test(headers['permissions-policy']) && /microphone=\(\)/.test(headers['permissions-policy'])
    && headers['cross-origin-opener-policy'] === 'same-origin' && headers['cross-origin-resource-policy'] === 'same-origin',
    JSON.stringify(headers).slice(0, 200));
  check('S2 the CSP allows no external origin at all in the local-only release',
    !/https?:\/\//.test(headers['content-security-policy']) && !/unsafe-eval/.test(headers['content-security-policy'])
    && !/script-src[^;]*unsafe-inline/.test(headers['content-security-policy']), headers['content-security-policy']);

  // A record with a photo, through the form.
  await page.evaluate(async () => (await import('/src/views/item-form.js')).openItemForm({}));
  await page.waitForTimeout(400);
  await page.setInputFiles('#imgInput', { name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(900);
  await page.fill('#f-name', 'Lantern');
  await page.evaluate(() => document.getElementById('savebtn')?.click() ?? document.querySelector('#sh-add .btn-p')?.click());
  await page.waitForTimeout(900);
  const saved = await page.evaluate(async () => {
    const { repository } = await import('/src/repository.js');
    const item = repository.liveItems().find((i) => i.name === 'Lantern');
    const img = document.querySelector('.icard img, .item img, img[src^="blob:"]');
    return { saved: Boolean(item), images: item?.images?.length || 0, blob: Boolean(img?.src?.startsWith('blob:')), loaded: (img?.naturalWidth || 0) > 0 };
  });
  check('S3 a record with a photo saves, and its local blob: image displays under the policy', saved.saved && saved.images === 1 && saved.blob && saved.loaded, JSON.stringify(saved));

  await page.evaluate(async () => (await import('/src/i18n.js')).setLanguage('ar'));
  await page.waitForTimeout(300);
  const dir = await page.evaluate(() => document.documentElement.dir);
  check('S4 switching language works under the policy', dir === 'rtl', dir);

  const download = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await page.evaluate(async () => (await import('/src/views/manage.js')).runFullJsonExport());
  const file = await download;
  check('S5 export produces a file (blob download) under the policy', Boolean(file) && /\.json$/.test(file?.suggestedFilename() || ''), file?.suggestedFilename());

  const merged = await page.evaluate(async () => {
    const { readBackupFile, applyMerge } = await import('/src/exporting.js');
    const text = JSON.stringify({ schemaVersion: 2, items: [{ id: 'imp-1', name: 'Imported clock', quantity: 1 }], folders: [], categories: [], locations: [] });
    const { data } = await readBackupFile(new File([text], 'nazm_backup.json', { type: 'application/json' }));
    await applyMerge(data);
    const { repository } = await import('/src/repository.js');
    return Boolean(await repository.getItem('imp-1'));
  });
  check('S6 import (JSON merge) works under the policy', merged === true);

  // The Safari decoder loads from this origin as a script file.
  const png = await dataUrlFile(await page.evaluate(drawQr, 'NAZM-CSP-1'), join(TMP, 'qr.png'));
  await page.click('#scan-btn');
  await page.waitForTimeout(500);
  await page.setInputFiles('#scan-photo-input', png);
  await page.waitForTimeout(2500);
  const scanned = await page.evaluate(() => document.getElementById('hsearch').value);
  check('S7 barcode scanning from a photo works — the decoder script is allowed from this origin', scanned === 'NAZM-CSP-1', scanned);

  await page.evaluate(async () => (await import('/src/navigation.js')).goTab('set'));
  await page.waitForTimeout(300);
  await page.click('#legal-privacy');
  await page.waitForTimeout(300);
  const legal = await page.evaluate(() => document.querySelectorAll('#legal-body h3').length);
  check('S8 legal pages render under the policy', legal > 20, String(legal));

  const stored = await page.evaluate(async () => {
    localStorage.setItem('csp-probe', '1');
    const local = await import('/src/local-store.js');
    return localStorage.getItem('csp-probe') === '1' && (await local.count('items')) >= 2;
  });
  check('S9 local storage and IndexedDB work under the policy', stored === true);

  check('S10 no CSP violation anywhere in the flows above', (await violations(page)).length === 0, JSON.stringify(await violations(page)));
  check('S11 no request left this origin (no Firebase SDK, no fonts, no analytics)', external.length === 0, JSON.stringify(external.slice(0, 3)));
  check('S12 no errors under the policy', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();

  // The installed web app: the service worker registers under the headers.
  const swCtx = await browser.newContext({ ...PHONE, release: true });
  const sw = await open(swCtx, `${SECURE}/index.html?sw-test`);
  const controlled = await sw.page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).then(() => true).catch(() => false);
  check('S13 the service worker installs and controls the page under the policy', controlled && (await violations(sw.page)).length === 0, JSON.stringify(await violations(sw.page)));
  await swCtx.close();
  await browser.close();
}

// ── 2. the camera under Permissions-Policy camera=(self) ───────────────────
{
  const video = join(TMP, 'qr.y4m');
  writeQrY4m('NAZM-CAM-7', video);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] });
  autoChooseLanguage(browser, 'en');
  const ctx = await browser.newContext({ ...PHONE, release: true });
  const { page, errs } = await open(ctx, `${SECURE}/index.html`);
  await page.click('#scan-btn');
  const read = await page.waitForFunction(() => document.getElementById('hsearch').value === 'NAZM-CAM-7', null, { timeout: 20000 }).then(() => true).catch(() => false);
  const tracks = await page.evaluate(() => (document.getElementById('scan-video').srcObject?.getTracks?.() || []).filter((t) => t.readyState === 'live').length);
  check('S14 the camera initialises and reads a live code under the policy; the stream is released afterwards',
    read && tracks === 0 && (await violations(page)).length === 0, JSON.stringify({ read, tracks, csp: await violations(page) }));
  check('S15 no errors in the camera flow', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

// ── 3. native mode: no service worker survives, no update prompt ───────────
{
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'en');
  const ctx = await browser.newContext({ ...PHONE, release: true });
  const web = await open(ctx, `${PLAIN}/index.html?sw-test`);
  const webControlled = await web.page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).then(() => true).catch(() => false);
  // The same origin, now inside the native container.
  await ctx.addInitScript(() => { window.NazmNative = { platform: 'ios', appVersion: '1.0.0', buildNumber: '1' }; });
  await web.page.goto(`${PLAIN}/index.html?sw-test`, { waitUntil: 'domcontentloaded' });
  await web.page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
  await web.page.waitForTimeout(1500);
  const native = await web.page.evaluate(async () => ({
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    banner: Boolean(document.getElementById('update-banner')),
    native: (await import('/src/platform.js')).isNative(),
  }));
  check('S16 a service worker left by the web app is unregistered inside the native app, and no update prompt appears',
    webControlled && native.native && native.registrations === 0 && !native.banner, JSON.stringify({ webControlled, ...native }));
  const detection = await web.page.evaluate(async () => {
    const platform = await import('/src/platform.js');
    const before = platform.isNative();
    const saved = window.NazmNative; delete window.NazmNative;
    const after = platform.isNative();
    window.NazmNative = saved;
    return { before, after, ua: navigator.userAgent.includes('iPhone') };
  });
  check('S17 native detection follows the bridge, not the user agent', detection.before === true && detection.after === false, JSON.stringify(detection));
  await browser.close();
}

// ── 4. contact configuration: every row acts, invalid values never appear ──
async function contactPage(contact) {
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'en');
  const ctx = await browser.newContext({ ...PHONE, release: true });
  await ctx.route('**/nazm.config.js', async (route) => {
    const response = await route.fetch();
    const body = `${await response.text()}\nObject.assign(window.NAZM_CONFIG.contact, ${JSON.stringify(contact)});`;
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  await ctx.addInitScript(() => {
    window.__opened = [];
    window.__mail = [];
    window.open = (url) => { window.__opened.push(url); return {}; };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched() { if (this.href.startsWith('mailto:')) { window.__mail.push(this.href); return; } click.call(this); };
  });
  const { page, errs } = await open(ctx, `${PLAIN}/index.html`);
  await page.evaluate(async () => (await import('/src/navigation.js')).goTab('set'));
  await page.waitForTimeout(300);
  await page.click('#legal-support');
  await page.waitForTimeout(300);
  return { browser, page, errs };
}

{
  const { browser, page, errs } = await contactPage({});
  const state = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('#legal-body .srow-btn')].map((b) => b.id),
    info: document.getElementById('support-no-channel')?.textContent || '',
    text: document.getElementById('legal-body').innerText,
  }));
  check('C1 with no contact configured, Support shows no contact rows, says so plainly, and prints no null or placeholder',
    state.rows.length === 0 && state.info.includes('No direct contact option') && !/null|undefined|example\.|@/.test(state.text), JSON.stringify(state.rows));
  await page.evaluate(async () => (await import('/src/contact.js')).openPrivacyRequest());
  await page.waitForTimeout(250);
  const notice = await page.evaluate(() => ({ open: document.getElementById('del-confirm').classList.contains('open'), text: document.getElementById('del-sub').textContent, mail: window.__mail.length }));
  check('C2 a privacy request with no channel explains the in-app tools — no dead button, no mail app', notice.open && notice.text.includes('Export My Data') && notice.mail === 0, notice.text.slice(0, 80));
  check('C3 no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

{
  const { browser, page, errs } = await contactPage({
    supportEmail: 'support@example.org', supportUrl: 'https://example.org/support',
    privacyEmail: 'privacy@example.org', privacyPolicyUrl: 'https://example.org/privacy', termsUrl: 'https://example.org/terms',
  });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#legal-body .srow-btn')].map((b) => b.id));
  await page.click('#support-website');
  await page.click('#support-email');
  await page.click('#support-privacy-request');
  const acted = await page.evaluate(() => ({ opened: window.__opened, mail: window.__mail }));
  check('C4 configured channels appear, and each acts: website in the browser, email in the mail app',
    JSON.stringify(rows) === JSON.stringify(['support-website', 'support-email', 'support-report', 'support-privacy-request'])
    && acted.opened[0] === 'https://example.org/support'
    && acted.mail[0].startsWith('mailto:support@example.org?subject=NAZM%20support')
    && acted.mail[1].startsWith('mailto:privacy@example.org?subject='), JSON.stringify(acted));
  await page.keyboard.press('Escape');
  await page.click('#legal-privacy');
  await page.waitForTimeout(300);
  const privacy = await page.evaluate(() => ({
    web: [...document.querySelectorAll('#legal-body .legal-links button')].map((b) => b.textContent),
    entity: document.querySelector('#legal-body .legal-entity')?.innerText || '',
    contact: document.getElementById('legal-body').innerText.includes('privacy@example.org'),
  }));
  check('C5 the bundled policy stays the default; a web version is offered only because privacyPolicyUrl is set; the policy names the configured privacy address',
    privacy.web.includes('Open the published web version') && privacy.web.includes('Send a privacy request') && privacy.contact
    && privacy.entity.startsWith('Mazayda Company') && !/Commercial Registration|Address/.test(privacy.entity), JSON.stringify(privacy));
  check('C6 no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
}

{
  const { browser, page } = await contactPage({ supportEmail: 'not-an-address', supportUrl: 'http://example.org/support', privacyPolicyUrl: 'javascript:alert(1)' });
  const state = await page.evaluate(async () => {
    const { ENV, CONFIG_DIAGNOSTICS } = await import('/src/environment.js');
    const platform = await import('/src/platform.js');
    return {
      rows: document.querySelectorAll('#legal-body .srow-btn').length,
      contact: { email: ENV.contact.supportEmail, url: ENV.contact.supportUrl, policy: ENV.contact.privacyPolicyUrl },
      notes: CONFIG_DIAGNOSTICS.length,
      js: platform.openExternalUrl('javascript:alert(1)'),
      http: platform.openExternalUrl('http://example.org'),
      data: platform.openExternalUrl('data:text/html,x'),
      injected: platform.composeEmail('a@example.org?cc=b@example.org'),
      opened: window.__opened.length,
    };
  });
  check('C7 an invalid email, a plain-http URL and a javascript: URL in the configuration are dropped and never rendered',
    state.rows === 0 && Object.values(state.contact).every((v) => v === null) && state.notes === 3, JSON.stringify(state));
  check('C8 the platform refuses javascript:, http:, data: and header-injecting mail addresses',
    state.js === false && state.http === false && state.data === false && state.injected === false && state.opened === 0, JSON.stringify(state));
  await browser.close();
}

// ── 5. the JSON import limit follows the platform ──────────────────────────
{
  const browser = await chromium.launch();
  autoChooseLanguage(browser, 'en');
  for (const native of [false, true]) {
    const ctx = await browser.newContext({ ...PHONE, release: true });
    if (native) await ctx.addInitScript(() => { window.NazmNative = { platform: 'ios' }; });
    const { page } = await open(ctx, `${PLAIN}/index.html`);
    const result = await page.evaluate(async () => {
      const { validateBackupFileMetadata, maxBackupFileBytes } = await import('/src/exporting.js');
      const fake = { name: 'nazm_backup.json', size: 100 * 1024 * 1024 };
      try { validateBackupFileMetadata(fake); return { max: maxBackupFileBytes(), ok: true }; }
      catch (error) { return { max: maxBackupFileBytes(), ok: false, code: error.code, message: error.message }; }
    });
    if (native) {
      check('I1 in the native app a 100 MB backup is refused before it is read, with the limit named',
        result.max === 64 * 1024 * 1024 && !result.ok && result.code === 'backup/file-too-large' && result.message.includes('64 MB'), JSON.stringify(result));
    } else {
      check('I2 in a browser the same file is within the web limit', result.max === 256 * 1024 * 1024 && result.ok, JSON.stringify(result));
    }
    await ctx.close();
  }
  await browser.close();
}

server.close();
for (const line of pass) console.log(`  ✓ ${line}`);
for (const line of fail) console.log(`  ✗ ${line}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
