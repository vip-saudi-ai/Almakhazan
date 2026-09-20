// Application entry point.
//
// The startup sequence is explicit and awaited end to end. Nothing reads or
// writes data before it knows whether the cloud is available and who the user
// is, so a stale local snapshot can never race a newer cloud state.

import { ROLES } from './config.js';
import { FirebaseStatus, firebaseContext, initializeFirebase, watchConnectivity } from './firebase.js';
import { currentSession, initializeAuthentication, onSessionChange } from './auth.js';
import { SYNC_LABELS, SyncState, repository } from './repository.js';
import * as local from './local-store.js';
import { UploadState, deviceUploadState, localDataSummary, uploadDeviceData } from './device-upload.js';
import { $, el, formatNumber, render } from './utils.js';
import { goTab, registerTab } from './navigation.js';
import { bindSheetDismiss, closeAllSheets, confirmAction, resolveConfirm, toast, toastError } from './ui.js';
import {
  applyFilterControls, bindContextActions, bindLongPress, bindSearch, closeContextMenu,
  enterFolder, exitFolder, focusSearch, openFilterSheet, openSortSheet, renderHome,
  resetAllFilters, scanIntoSearch, setGridMode, syncFilterControls, view as homeView,
} from './views/home.js';
import { bindItemForm, openItemForm } from './views/item-form.js';
import { renderOverview } from './views/overview.js';
import { bindManageViews, openFolderSheet, renderCategories, renderSettings } from './views/manage.js';
import { bindAssistant, renderAssistant } from './views/assistant.js';
import { stopScanner } from './views/scan.js';
import { closeGate, gateOnSession, isGateOpen, openGate } from './views/welcome.js';
import { onSubscriptionChange, startPlanWatch, subscriptionState } from './subscription.js';

const SHEETS = ['add', 'det', 'qp', 'fld', 'mv', 'cat', 'filter', 'sort', 'as', 'trash', 'loc', 'import', 'reassign', 'plans', 'labels', 'scan', 'bulk'];

// Tells the boot guard (a classic script) that module code is running, so it
// can distinguish "scripts never started" from "startup stalled".
window.__almakhzanStarted = true;

// ── boot ──
async function boot() {
  showBootState('جارٍ التشغيل…');

  // Each step can take a few seconds on a slow connection, so the boot screen
  // says what it is waiting for rather than showing a silent spinner.
  const slowNotice = setTimeout(
    () => showBootState('الاتصال بطيء — سيبدأ التطبيق محلياً إن تعذّر'),
    3000,
  );
  showBootState('جارٍ الاتصال بالخدمة السحابية…');
  const firebase = await initializeFirebase();
  clearTimeout(slowNotice);

  showBootState('جارٍ التحقق من الحساب…');
  const session = await initializeAuthentication();

  showBootState('جارٍ تحميل البيانات…');
  await loadApplicationData(firebase, session);

  initializeUI();

  // The public face. Shown only when the cloud is reachable and nobody is
  // signed in — a device-only user goes straight to their inventory rather
  // than being asked to create an account to see their own things.
  if (needsGate(firebase, session)) {
    openGate({ onComplete: (result) => afterOnboarding(result) });
  } else {
    // Asked only once the UI is up: it waits on a dialog, and the boot overlay
    // would sit on top of it.
    await offerLocalUpload();
  }

  onSessionChange(async (next) => {
    gateOnSession(next);
    const wanted = next.user ? 'cloud' : 'local';
    if (repository.session.mode === wanted && repository.session.workspaceId === next.workspaceId) return;
    await loadApplicationData(firebaseContext(), next);
    renderAll();
    if (!isGateOpen()) await offerLocalUpload();
  });

  // Plan and usage arrive from the server after boot and change while the app
  // is open (a record added on another device, an upgrade taking effect), so
  // the quota banner and the Settings card follow them.
  onSubscriptionChange(() => {
    // The server's record count is the only trustworthy total while the app is
    // browsing a window: it lets the screen say "the newest 200 of 6,400"
    // instead of counting what it happens to hold.
    repository.setKnownTotal(subscriptionState().usage?.items);
    renderAll();
  });

  watchConnectivity((status) => {
    if (repository.session.mode !== 'cloud') return;
    repository.setSync(status === FirebaseStatus.OFFLINE ? SyncState.OFFLINE : SyncState.SYNCED);
  });
}

/** The gate is for real cloud sign-up only, never for local or demo use. */
function needsGate(firebase, session) {
  const cloudReachable = firebase.status === FirebaseStatus.READY
    || firebase.status === FirebaseStatus.OFFLINE;
  return cloudReachable && !session.user;
}

async function afterOnboarding(result) {
  closeGate();
  await loadApplicationData(firebaseContext(), currentSession());
  renderAll();
  await offerLocalUpload();

  if (result?.intent === 'add-item') {
    setTimeout(() => openItemForm({}), 300);
  } else if (result?.intent === 'import') {
    setTimeout(() => window.dispatchEvent(new CustomEvent('almakhzan:start-import')), 300);
  }
}

function showBootState(message) {
  const label = $('boot-label');
  if (label) label.textContent = message;
}

async function loadApplicationData(firebase, session) {
  const cloudReady = (firebase.status === FirebaseStatus.READY || firebase.status === FirebaseStatus.OFFLINE)
    && Boolean(session.user) && Boolean(session.workspaceId);

  try {
    await repository.start(cloudReady
      ? { mode: 'cloud', workspaceId: session.workspaceId, userId: session.user.uid, role: session.role }
      : { mode: 'local', workspaceId: 'local', userId: 'local-device', role: ROLES.OWNER });
    startPlanWatch(cloudReady
      ? { mode: 'cloud', workspaceId: session.workspaceId }
      : { mode: 'local', workspaceId: null });
  } catch (error) {
    console.error('[app] data load failed', error);
    toastError(error, 'تعذّر تحميل البيانات');
  }
}

/**
 * When a signed-in user has records sitting in this device's local store and a
 * still-empty cloud workspace, the upload is offered — never performed silently,
 * so nothing can overwrite a newer cloud state on its own.
 *
 * The run uploads every locally stored image to Storage and rewrites its
 * reference, so no cloud document is left pointing at this device.
 */
async function offerLocalUpload() {
  if (repository.session.mode !== 'cloud') return;

  let summary;
  let state;
  try {
    [summary, state] = await Promise.all([localDataSummary(), deviceUploadState()]);
  } catch (error) {
    console.error('[app] local store unreadable', error);
    return;
  }

  if (state.status === UploadState.COMPLETED) return;
  if (!summary.items) return;
  // Only offered into an empty workspace; merging into a populated one is an
  // explicit import, not an automatic action.
  if (repository.state.items.length && state.status !== UploadState.FAILED) return;

  const resuming = state.status === UploadState.FAILED || state.status === UploadState.IN_PROGRESS;
  const confirmed = await confirmAction({
    title: resuming ? 'استئناف رفع بيانات هذا الجهاز؟' : 'رفع بيانات هذا الجهاز؟',
    message: `${formatNumber(summary.items)} قطعة و${formatNumber(summary.images)} صورة محفوظة على هذا الجهاز. سترفع الصور إلى حسابك، ولن تُحذف النسخة المحلية.`,
    icon: '☁️',
    confirmLabel: resuming ? 'استئناف' : 'رفع البيانات',
  });
  if (!confirmed) return;

  try {
    // The boot overlay is gone by now, so progress is surfaced periodically
    // rather than on every item — a long upload must not look frozen.
    let lastReport = 0;
    const result = await uploadDeviceData({
      onProgress: ({ done, total, message }) => {
        if (done - lastReport >= 20 || done === total) {
          lastReport = done;
          toast(message, '☁');
        }
      },
    });
    toast(`رُفعت ${formatNumber(result.items)} قطعة و${formatNumber(result.images)} صورة`, '☁');
    if (result.imageFailures.length) {
      toast(`${formatNumber(result.imageFailures.length)} صورة لم تُرفع — نسختها المحلية باقية`, '⚠');
    }
  } catch (error) {
    toastError(error, 'تعذّر رفع بيانات الجهاز');
  }
}

// ── UI wiring ──
function initializeUI() {
  const prefs = local.loadPrefs();
  homeView.grid = prefs.grid ?? true;
  homeView.sortMode = prefs.sortMode || 'newest';

  registerTab('home', renderHome);
  registerTab('ov', renderOverview);
  registerTab('ai', renderAssistant);
  registerTab('cats', renderCategories);
  registerTab('set', renderSettings);

  for (const name of SHEETS) bindSheetDismiss(name);
  // Whatever closes the scanner — the button, the overlay, Escape, the back
  // gesture — the camera has to go off with it.
  $('ov-scan')?.addEventListener('click', stopScanner);
  $('sh-scan')?.querySelector('[data-close]')?.addEventListener('click', stopScanner);

  bindSearch();
  bindLongPress();
  bindContextActions();
  bindItemForm();
  bindManageViews();
  bindAssistant();
  bindToolbar();
  bindConfirmDialog();
  bindKeyboard();

  repository.subscribe(() => {
    renderSyncIndicator();
    renderAll();
  });

  syncFilterControls();
  setGridMode(homeView.grid);
  $('sort-label').textContent = { newest: 'الأحدث', oldest: 'الأقدم', 'name-az': 'الاسم أ-ي', 'name-za': 'الاسم ي-أ', 'value-high': 'التقييم ↓', 'value-low': 'التقييم ↑' }[homeView.sortMode];

  $('boot')?.remove();
  document.body.classList.add('ready');
  renderAll();
}

let renderScheduled = false;
function renderAll() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderHome();
    const active = document.querySelector('.view.active')?.id;
    if (active === 'v-ov') renderOverview();
    if (active === 'v-ai') renderAssistant();
    if (active === 'v-cats') renderCategories();
    if (active === 'v-set') renderSettings();
    persistPrefs();
  });
}

function persistPrefs() {
  local.savePrefs({ grid: homeView.grid, sortMode: homeView.sortMode });
}

function bindToolbar() {
  // Every tab that has a button in the bar. 'cats' has a view but no button.
  for (const tab of ['home', 'ov', 'ai', 'set']) {
    $(`t-${tab}`)?.addEventListener('click', () => goTab(tab));
  }
  $('scan-btn')?.addEventListener('click', () => scanIntoSearch());
  $('tg')?.addEventListener('click', () => setGridMode(true));
  $('tl')?.addEventListener('click', () => setGridMode(false));
  $('filter-btn')?.addEventListener('click', openFilterSheet);
  $('sort-btn')?.addEventListener('click', openSortSheet);
  $('filter-apply')?.addEventListener('click', () => { applyFilterControls(); });
  $('filter-reset')?.addEventListener('click', resetAllFilters);
  $('new-folder-link')?.addEventListener('click', () => openFolderSheet());
  $('add-first-item')?.addEventListener('click', () => openItemForm({ folderId: homeView.folderId }));

  for (const id of ['fp-cond', 'fp-folder', 'fp-loc', 'fp-ai', 'fp-price']) {
    $(id)?.addEventListener('change', applyFilterControls);
  }
}

function bindConfirmDialog() {
  $('del-confirm-btn')?.addEventListener('click', () => resolveConfirm(true));
  $('del-cancel-btn')?.addEventListener('click', () => resolveConfirm(false));
  $('del-bg')?.addEventListener('click', () => resolveConfirm(false));
}

function bindKeyboard() {
  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      goTab('home');
      focusSearch();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
      event.preventDefault();
      openItemForm({ folderId: homeView.folderId });
    }
    if (event.key === 'Escape' && !typing) {
      if ($('ctx-as')?.classList.contains('open')) { closeContextMenu(); return; }
      if ($('del-confirm')?.classList.contains('open')) { resolveConfirm(false); return; }
      if (homeView.folderId) exitFolder();
    }
  });
}

function renderSyncIndicator() {
  const dot = $('syncDot');
  if (!dot) return;
  const colors = {
    loading: '#aaa', synced: '#34C759', saving: '#FF9500',
    offline: '#FF9500', local: '#8E8E93', error: '#FF3B30', conflict: '#FF3B30',
  };
  const { status, message } = repository.sync;
  dot.style.background = colors[status] || '#aaa';
  dot.title = message || SYNC_LABELS[status] || '';
  dot.setAttribute('aria-label', `حالة المزامنة: ${message || status}`);
}

window.addEventListener('almakhzan:sync-refresh', renderSyncIndicator);

// Surface failures that would otherwise vanish into the console.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[app] unhandled rejection', event.reason);
});

// The service worker caches only the static shell; data never goes through it.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.error('[app] service worker registration failed', error);
    });
  });
}

boot().catch((error) => {
  console.error('[app] boot failed', error);
  showBootState('تعذّر تشغيل التطبيق — حدّث الصفحة');
  const boot = $('boot');
  if (boot) {
    render(boot, [
      el('div', { class: 'boot-error' }, [
        el('div', { style: { fontSize: '40px' }, text: '⚠️' }),
        el('div', { class: 'boot-error-title', text: 'تعذّر تشغيل التطبيق' }),
        el('div', { class: 'boot-error-msg', text: error?.message || 'خطأ غير متوقع' }),
        el('button', {
          class: 'btn btn-p', type: 'button', text: 'إعادة المحاولة',
          onClick: () => window.location.reload(),
        }),
      ]),
    ]);
  }
});

export { closeAllSheets };
