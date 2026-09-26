// The installed app: service worker registration and updates.
//
// The service worker (sw.js) caches only this origin's static shell and never
// takes over a running page by itself. When a new version is installed and
// waiting, this offers a small "Update available" prompt; pressing it reloads
// into the new version — but only when nothing would be lost: no sheet open
// (a form being filled, an import mapping, a restore), no import or restore
// writing, no dialog waiting for an answer, no image being inspected. If the
// customer ignores it, the new version simply starts the next time the app is
// opened. A failure anywhere here is logged and the app carries on: the
// service worker is an optimisation, never a dependency.

import { el } from './utils.js';
import { onLanguageChange, t } from './i18n.js';
import { toast } from './ui.js';
import { isRestoreRunning } from './restore.js';
import { isImportRunning } from './views/sheet-import.js';
import { isImageViewerOpen } from './views/image-viewer.js';
import { Feature, isFeatureEnabled } from './features.js';

let waiting = null;
let banner = null;
let reloading = false;

/** Nothing half done that a reload would throw away. */
export function safeToReload() {
  if (isImportRunning() || isRestoreRunning()) return false;
  if (isImageViewerOpen()) return false;
  // Any open sheet, dialog, action sheet or the welcome gate is work in
  // progress by definition: it is where forms, mappings and confirmations live.
  return !document.querySelector('.sh.open, .del-confirm.open, .ctx-as.open, .asht.open, .gate.open, .loadwrap.open');
}

function renderBanner() {
  if (!waiting) { banner?.remove(); banner = null; return; }
  if (!banner) {
    banner = el('div', { class: 'update-banner', id: 'update-banner', role: 'status' });
    document.body.appendChild(banner);
  }
  banner.replaceChildren(
    el('span', { class: 'update-banner-text', text: t('update.available') }),
    el('button', { class: 'update-banner-go', type: 'button', text: t('update.apply'), onClick: applyUpdate }),
    el('button', {
      class: 'update-banner-later', type: 'button', text: t('update.later'),
      onClick: () => { banner?.remove(); banner = null; },
    }),
  );
}

function applyUpdate() {
  if (!waiting) return;
  if (!safeToReload()) {
    toast(t('update.finishFirst'), 'ℹ');
    return;
  }
  reloading = true;
  waiting.postMessage('skip-waiting');
}

function watchRegistration(registration) {
  const offer = (worker) => {
    // Only an *update*: the very first install has nothing to replace.
    if (!worker || !navigator.serviceWorker.controller) return;
    waiting = worker;
    renderBanner();
  };
  if (registration.waiting) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer(worker);
    });
  });
}

/**
 * Registers the service worker on HTTPS (and, for the automated tests, on a
 * local page opened with `?sw-test`). Never throws, never blocks startup.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // The native app ships its code inside the bundle and is updated through the
  // App Store: no service worker, no "Update available", no code arriving
  // from the network. One left behind by an earlier build is removed.
  if (!isFeatureEnabled(Feature.WEB_UPDATES)) {
    navigator.serviceWorker.getRegistrations?.()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {});
    return;
  }
  const allowed = location.protocol === 'https:' || new URLSearchParams(location.search).has('sw-test');
  if (!allowed) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The new version took over because the customer asked for it: reload
    // into it. (A takeover nobody asked for — the first install claiming the
    // page — changes nothing on screen and needs no reload.)
    if (reloading) window.location.reload();
  });
  onLanguageChange(() => { if (banner) renderBanner(); });

  const register = () => navigator.serviceWorker.register('sw.js')
    .then((registration) => {
      watchRegistration(registration);
      // Look for an update whenever the app comes back to the foreground; an
      // installed iPhone app can stay "open" for days.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    })
    .catch((error) => console.error('[pwa] service worker registration failed', error));

  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => { void register(); }, { once: true });
}
