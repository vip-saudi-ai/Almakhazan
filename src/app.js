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
import { $, el, formatNumber, render } from './utils.js';
import { goTab, registerTab } from './navigation.js';
import { bindSheetDismiss, closeAllSheets, confirmAction, resolveConfirm, toast, toastError } from './ui.js';
import {
  applyFilterControls, bindContextActions, bindLongPress, bindSearch, closeContextMenu,
  enterFolder, exitFolder, focusSearch, openFilterSheet, openSortSheet, renderHome,
  resetAllFilters, setGridMode, syncFilterControls, view as homeView,
} from './views/home.js';
import { bindItemForm, openItemForm } from './views/item-form.js';
import { renderOverview } from './views/overview.js';
import { bindManageViews, openFolderSheet, renderCategories, renderSettings } from './views/manage.js';

const SHEETS = ['add', 'det', 'qp', 'fld', 'mv', 'cat', 'filter', 'sort', 'as', 'trash', 'loc', 'import', 'reassign'];

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

  // Asked only once the UI is up: it waits on a dialog, and the boot overlay
  // would sit on top of it.
  await offerLocalUpload();

  onSessionChange(async (next) => {
    const wanted = next.user ? 'cloud' : 'local';
    if (repository.session.mode === wanted && repository.session.workspaceId === next.workspaceId) return;
    await loadApplicationData(firebaseContext(), next);
    renderAll();
    await offerLocalUpload();
  });

  watchConnectivity((status) => {
    if (repository.session.mode !== 'cloud') return;
    repository.setSync(status === FirebaseStatus.OFFLINE ? SyncState.OFFLINE : SyncState.SYNCED);
  });
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
  } catch (error) {
    console.error('[app] data load failed', error);
    toastError(error, 'تعذّر تحميل البيانات');
  }
}

/**
 * When a signed-in user has records sitting in this device's local store and a
 * still-empty cloud workspace, the upload is offered — never performed silently,
 * so nothing can overwrite a newer cloud state on its own.
 */
async function offerLocalUpload() {
  if (repository.session.mode !== 'cloud') return;

  let localItems = [];
  try {
    localItems = await local.getAll('items');
  } catch (error) {
    console.error('[app] local store unreadable', error);
    return;
  }
  if (!localItems.length || repository.state.items.length) return;

  const confirmed = await confirmAction({
    title: 'رفع بيانات هذا الجهاز؟',
    message: `يوجد ${formatNumber(localItems.length)} قطعة محفوظة محلياً، والمخزن السحابي فارغ. هل تريد رفعها؟ لن تُحذف النسخة المحلية.`,
    icon: '☁️',
    confirmLabel: 'رفع البيانات',
  });
  if (!confirmed) return;

  try {
    const [folders, categories, locations] = await Promise.all([
      local.getAll('folders'), local.getAll('categories'), local.getAll('locations'),
    ]);
    await repository.bulkWrite([
      ...categories.map((r) => ({ type: 'set', collection: 'categories', id: r.id, data: r, merge: false })),
      ...locations.map((r) => ({ type: 'set', collection: 'locations', id: r.id, data: r, merge: false })),
      ...folders.map((r) => ({ type: 'set', collection: 'folders', id: r.id, data: r, merge: false })),
      ...localItems.map((r) => ({ type: 'set', collection: 'items', id: r.id, data: r, merge: false })),
    ]);
    toast(`رُفعت ${formatNumber(localItems.length)} قطعة`, '☁');
  } catch (error) {
    toastError(error, 'تعذّر رفع البيانات المحلية');
  }
}

// ── UI wiring ──
function initializeUI() {
  const prefs = local.loadPrefs();
  homeView.grid = prefs.grid ?? true;
  homeView.sortMode = prefs.sortMode || 'newest';

  registerTab('home', renderHome);
  registerTab('ov', renderOverview);
  registerTab('cats', renderCategories);
  registerTab('set', renderSettings);

  for (const name of SHEETS) bindSheetDismiss(name);

  bindSearch();
  bindLongPress();
  bindContextActions();
  bindItemForm();
  bindManageViews();
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
    if (active === 'v-cats') renderCategories();
    if (active === 'v-set') renderSettings();
    persistPrefs();
  });
}

function persistPrefs() {
  local.savePrefs({ grid: homeView.grid, sortMode: homeView.sortMode });
}

function bindToolbar() {
  for (const tab of ['home', 'ov', 'cats', 'set']) {
    $(`t-${tab}`)?.addEventListener('click', () => goTab(tab));
  }
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
