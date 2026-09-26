// Application entry point.
//
// The startup sequence is explicit and awaited end to end. Nothing reads or
// writes data before it knows whether the cloud is available and who the user
// is, so a stale local snapshot can never race a newer cloud state.

import { ROLES } from './config.js';
import { FirebaseStatus, firebaseContext, initializeFirebase, watchConnectivity } from './firebase.js';
import { currentSession, initializeAuthentication, onSessionChange, refreshWorkspace } from './auth.js';
import { SyncState, repository } from './repository.js';
import { useQueryAdapter } from './query.js';
import { runImportRecovery } from './import-jobs.js';
import { reconcileOccasionally } from './media.js';
import { markInterruptedRestore } from './restore.js';
import * as local from './local-store.js';
import { UploadState, deviceUploadState, localDataSummary, uploadDeviceData } from './device-upload.js';
import { $, el, formatNumber, render } from './utils.js';
import { registerServiceWorker } from './pwa.js';
import { applyFeatureVisibility } from './features.js';
import { reportConfiguration } from './config-report.js';
import { isNative, setStatusBarStyle } from './platform.js';
import { applyDocumentLocale, onLanguageChange, setLanguage, t } from './i18n.js';
import { goTab, registerTab, renderActiveTab } from './navigation.js';
import { watchViewport } from './viewport.js';
import { hydrateIcons } from './icons.js';
import { isImageViewerOpen, reflowViewer } from './views/image-viewer.js';
import { acceptInvitation, takeInvitationFromUrl } from './team.js';
import { bindSheetDismiss, closeAllSheets, confirmAction, resolveConfirm, toast, toastError } from './ui.js';
import {
  applyFilterControls, bindContextActions, bindLongPress, bindSearch, closeContextMenu,
  enterFolder, exitFolder, focusSearch, openFilterSheet, openSortSheet, renderHome,
  clearSearch, resetAllFilters, scanIntoSearch, setGridMode, syncFilterControls, view as homeView,
} from './views/home.js';
import { bindItemForm, openItemForm } from './views/item-form.js';
import { renderOverview } from './views/overview.js';
import { bindManageViews, openFolderSheet, renderCategories, renderSettings } from './views/manage.js';
import { bindAssistant, renderAssistant } from './views/assistant.js';
import { closeGate, gateOnSession, isGateOpen, openGate } from './views/welcome.js';
import {
  activityRetentionDays, onSubscriptionChange, scheduleLocalUsageRefresh, startPlanWatch, subscriptionState,
} from './subscription.js';

const SHEETS = ['add', 'det', 'qp', 'fld', 'mv', 'cat', 'filter', 'sort', 'as', 'trash', 'loc', 'import', 'simport', 'reassign', 'plans', 'labels', 'scan', 'bulk', 'team', 'ws', 'legal', 'account'];

// Tells the boot guard (a classic script) that module code is running, so it
// can distinguish "scripts never started" from "startup stalled".
window.__almakhzanStarted = true;

/**
 * The language the customer picked on the language gate — the first screen of
 * every launch (index.html #lang-gate, handled by src/boot-guard.js so it works
 * before this module has even loaded). Resolves at once if the choice was made
 * while the modules were still loading.
 */
function languageChosen() {
  if (window.__nazmLanguageChoice) return Promise.resolve(window.__nazmLanguageChoice);
  return new Promise((resolve) => {
    window.addEventListener('nazm:language-chosen', (event) => resolve(event.detail), { once: true });
  });
}

// ── boot ──
async function boot() {
  // Connecting to the cloud shows nothing, so it starts while the customer is
  // still choosing. Everything that shows something — the boot screen, the
  // welcome gate, a restore warning, the upload offer — waits for the choice,
  // so it appears in the chosen language and direction.
  const firebaseReady = initializeFirebase();
  reportConfiguration();

  const lang = await languageChosen();
  setLanguage(lang);
  // setLanguage() does nothing when the language is unchanged; the document
  // still needs its translated title, description and static text.
  applyDocumentLocale();
  showBootState(t('boot.starting'));

  // Each step can take a few seconds on a slow connection, so the boot screen
  // says what it is waiting for rather than showing a silent spinner.
  const slowNotice = setTimeout(
    () => showBootState(t('boot.slow')),
    3000,
  );
  showBootState(t('boot.connecting'));
  const firebase = await firebaseReady;
  clearTimeout(slowNotice);

  showBootState(t('boot.account'));
  const session = await initializeAuthentication();

  showBootState(t('boot.loading'));
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

  // An invitation carried in the address bar. Taken out of the URL at boot —
  // before anything can navigate — so a refresh cannot replay it and the token
  // does not sit in browser history.
  const invitation = takeInvitationFromUrl();
  if (invitation) await redeemInvitation(invitation);

  window.addEventListener('almakhzan:workspace-changed', () => { void reopenWorkspace(); });
  // An import writes through the backend, and the listener brings the records
  // back — but the folders, categories and locations it created belong on
  // screen immediately.
  window.addEventListener('almakhzan:data-imported', () => renderAll());

  let signedInAs = session.user?.uid || null;
  onSessionChange(async (next) => {
    // A different person on this device: nothing the last one had on screen
    // survives — an open record, a search, a selection. The repository
    // restart below drops their data and image URLs; the device inventory is
    // a separate store and is left alone.
    const uid = next.user?.uid || null;
    if (uid !== signedInAs) {
      signedInAs = uid;
      closeAllSheets();
      clearSearch();
    }
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

/**
 * Accepting an invitation. The token is verified by the backend against a
 * hash; nothing here can grant membership, and a link for someone else's
 * email is refused there rather than here.
 */
async function redeemInvitation({ inviteId, token }) {
  if (!currentSession().user) {
    // Signing in first is not optional: the membership is written for a
    // specific account. Holding the token in memory across a sign-in would
    // mean guessing which account it was meant for.
    toast(t('invite.signInFirst'), '✉️', { assertive: true });
    return;
  }
  try {
    await acceptInvitation(inviteId, token);
    await refreshWorkspace();
    toast(t('invite.joined'), '✓');
  } catch (error) {
    toastError(error, 'invite.acceptFailed');
  }
}

/** Reopens after the active workspace changed. */
async function reopenWorkspace() {
  try {
    await refreshWorkspace();
  } catch (error) {
    toastError(error, 'workspace.openFailed');
  }
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
    // The query engine follows the backend. On a device the records are in
    // IndexedDB, so questions are answered by index and cursor; on the cloud
    // backend they live on a server and this device holds a window of them, so
    // they are answered from what is held — and a narrowed question says when
    // it could not be. Same result shape either way; no screen knows which.
    //
    // Chosen here rather than inside the repository so the data layer does not
    // have to import the query layer that imports it.
    useQueryAdapter(cloudReady ? 'memory' : 'indexeddb');
    await repository.start(cloudReady
      ? { mode: 'cloud', workspaceId: session.workspaceId, userId: session.user.uid, role: session.role }
      : { mode: 'local', workspaceId: 'local', userId: 'local-device', role: ROLES.OWNER });
    startPlanWatch(cloudReady
      ? { mode: 'cloud', workspaceId: session.workspaceId }
      : { mode: 'local', workspaceId: null });

    // Before anything else reads the inventory: an import the last page
    // lifecycle left running is marked stopped (nothing can still be writing
    // it — that runtime is gone), and a cancellation it left half done is
    // finished. If one cannot be finished the app still opens and the
    // inventory can still be browsed; only new imports are refused, and the
    // import screen offers the retry. Never throws.
    const recovery = await runImportRecovery();
    if (!recovery.ready) {
      console.error('[app] import recovery is needed; new imports are blocked until it succeeds');
    }
    // Reference counts are kept incrementally, and a tab killed between a
    // record write and its count adjustment leaves them wrong. Once a day the
    // device's counts are re-derived from its records. Not awaited: it is
    // maintenance, and the inventory does not wait for it.
    void reconcileOccasionally(repository.session);
    // A restore the last page died in the middle of is made visible now, and
    // blocks the next restore or merge until the same backup finishes it.
    await markInterruptedRestore().catch((error) => console.error('[app] restore check failed', error));

    // Without a cloud copy, what is on this device is the only copy — and a
    // browser evicts unpersisted storage when the device needs room. Asking is
    // free; being refused is normal and changes nothing. Asked once there is
    // something to lose, because a browser weighs the request against whether
    // the app looks used.
    // Housekeeping, once the data is up: the activity log grows with every
    // edit, and the plan says how long an entry is kept. Trimmed through the
    // timestamp index so the entries being kept are never read.
    void repository.enforceActivityRetention(activityRetentionDays());

    if (!cloudReady && repository.state.items.length) {
      void local.requestPersistence().then((granted) => {
        if (!granted) console.info('[app] the browser did not grant persistent storage');
      });
    }
  } catch (error) {
    console.error('[app] data load failed', error);
    toastError(error, 'boot.loadFailed');
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
    titleKey: resuming ? 'upload.resumeTitle' : 'upload.title',
    message: () => t('upload.message', { items: t('count.items', { count: summary.items }), images: t('count.images', { count: summary.images }) }),
    icon: '☁️',
    confirmLabelKey: resuming ? 'upload.resume' : 'upload.confirm',
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
    toast(t('upload.done', { items: t('count.items', { count: result.items }), images: t('count.images', { count: result.images }) }), '☁');
    if (result.imageFailures.length) {
      toast(t('upload.imageFailures', { count: result.imageFailures.length }), '⚠');
    }
  } catch (error) {
    toastError(error, 'upload.failed');
  }
}

// ── UI wiring ──
function initializeUI() {
  // Before anything measures itself: the keyboard has to be known about
  // before the first sheet can open on top of it.
  watchViewport();
  // Static markup declares which icon it wants; this draws them all once.
  hydrateIcons();
  // Features this release does not offer have no UI at all.
  applyFeatureVisibility();
  document.documentElement.classList.toggle('native-app', isNative());
  // In the native app the host draws the status bar; it follows the theme the
  // page is in (theme-color does the same job on the web).
  const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  const followScheme = () => setStatusBarStyle(scheme?.matches ? 'dark' : 'light');
  followScheme();
  scheme?.addEventListener?.('change', followScheme);

  // A rotation changes the box the image is contained in. The zoom is kept —
  // losing it mid-inspection is worse than a moment's reflow — but a pan that
  // was inside the frame in portrait can be outside it in landscape.
  window.addEventListener('orientationchange', () => setTimeout(reflowViewer, 250));
  window.addEventListener('resize', () => { if (isImageViewerOpen()) reflowViewer(); });

  const prefs = local.loadPrefs();
  homeView.grid = prefs.grid ?? true;
  homeView.sortMode = prefs.sortMode || 'newest';

  registerTab('home', renderHome);
  registerTab('ov', renderOverview);
  registerTab('ai', renderAssistant);
  // Registered so opening them goes through the same path as the tabs — which
  // is also what applies the "this screen needs the whole inventory" rule to
  // Categories.
  registerTab('cats', renderCategories);
  registerTab('set', renderSettings);

  for (const name of SHEETS) bindSheetDismiss(name);
  // The scanner stops its own camera on every way out (src/views/scan.js
  // registers onSheetClose; src/scanner.js stops on background and pagehide).

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
    // Under the device free tier the record quota is counted from the store.
    scheduleLocalUsageRefresh();
  });

  syncFilterControls();
  setGridMode(homeView.grid);
  $('sort-label').textContent = t(`sort.${homeView.sortMode}`);

  // Language is presentation: switching it redraws what is on screen from
  // the state already held — no reload, no refetch, no re-parse. Each view
  // with an open sheet listens for the same change and redraws its own.
  onLanguageChange(() => {
    $('sort-label').textContent = t(`sort.${homeView.sortMode}`);
    renderSyncIndicator();
    // Not syncFilterControls(): that writes the *applied* filters back into
    // the sheet's controls, and a sheet open mid-edit would lose its draft.
    // The badge carries a number, which no language changes.
    renderActiveTab();
  });

  $('boot')?.remove();
  document.body.classList.add('ready');
  renderAll();
}

let renderScheduled = false;

/**
 * One frame, one screen: the one being looked at.
 *
 * This used to redraw the inventory list on every change regardless of which
 * screen was open — so an import writing 2,000 records rebuilt two hundred
 * cards per chunk into a hidden view, on the same thread as the screen the
 * customer was actually using. The other screens are marked stale instead and
 * redraw when they are opened.
 */
function renderAll() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderActiveTab();
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
  // The empty state's button does whatever that particular emptiness needs:
  // clear the search, clear the filters, or add the first record.
  $('add-first-item')?.addEventListener('click', (event) => {
    const action = event.currentTarget.dataset.emptyAction;
    if (action === 'search') { clearSearch(); return; }
    if (action === 'filters') { resetAllFilters(); return; }
    openItemForm({ folderId: homeView.folderId });
  });

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
  const { status, message, messageKey } = repository.sync;
  dot.style.background = colors[status] || '#aaa';
  const label = message || t(messageKey || `sync.${status}`);
  dot.title = label;
  dot.setAttribute('aria-label', t('sync.label', { status: label }));
}

window.addEventListener('almakhzan:sync-refresh', renderSyncIndicator);

// Surface failures that would otherwise vanish into the console.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[app] unhandled rejection', event.reason);
});

// The service worker caches only the static shell; data never goes through it.
// Updates wait for a moment when reloading loses nothing (src/pwa.js).
registerServiceWorker();

boot().catch((error) => {
  console.error('[app] boot failed', error);
  showBootState(t('boot.failedRefresh'));
  const boot = $('boot');
  if (boot) {
    render(boot, [
      el('div', { class: 'boot-error' }, [
        el('div', { style: { fontSize: '40px' }, text: '⚠️' }),
        el('div', { class: 'boot-error-title', text: t('boot.failed') }),
        el('div', { class: 'boot-error-msg', text: error?.message || t('common.unknownError') }),
        el('button', {
          class: 'btn btn-p', type: 'button', text: t('common.retry'),
          onClick: () => window.location.reload(),
        }),
      ]),
    ]);
  }
});

export { closeAllSheets };
