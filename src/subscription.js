// The customer's plan, as the browser sees it.
//
// This is a mirror, never an authority. The plan, its limits and every usage
// counter are written server-side and read here only to decide what the UI
// offers and when to warn. A browser that lies to itself about its plan still
// loses at the Security Rules, so nothing here is a security control — it is
// the difference between "you have 8 records left" and an unexplained refusal.

import {
  assistantPresentation, checkCreateItem, checkFeature, checkImportRows, checkUseAI,
  importRowLimit, itemQuotaStatus, planById, resolveEntitlement, usageSummary,
  DEFAULT_PLAN, UNLIMITED,
} from './entitlements.js';
import { MAX_ROWS } from './spreadsheet.js';
import { firebaseContext } from './firebase.js';

const state = {
  mode: 'local',
  workspaceId: null,
  workspace: null,
  subscription: null,
  usage: {},
  entitlement: null,
  ready: false,
};

const listeners = new Set();
let unsubscribers = [];
let subscriptionUnsub = null;

export function subscriptionState() {
  return state;
}

export function onSubscriptionChange(listener) {
  listeners.add(listener);
  if (state.ready) listener(state);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener(state);
}

function recompute() {
  state.entitlement = state.mode === 'cloud'
    ? resolveEntitlement(state.workspace, state.subscription)
    : null;
  state.ready = true;
  emit();
}

/**
 * Watches the workspace document, its usage counters and — when one exists —
 * the subscription record. In local mode there is no workspace and no quota:
 * a device-only inventory is bounded by the device, not by a plan.
 */
export function startPlanWatch({ mode, workspaceId }) {
  stopPlanWatch();
  state.mode = mode;
  state.workspaceId = workspaceId || null;
  state.workspace = null;
  state.subscription = null;
  state.usage = {};

  if (mode !== 'cloud' || !workspaceId) {
    recompute();
    return;
  }

  const { db, sdk } = firebaseContext();
  if (!db) { recompute(); return; }
  const fs = sdk.firestore;

  unsubscribers.push(fs.onSnapshot(
    fs.doc(db, 'workspaces', workspaceId),
    (snap) => {
      state.workspace = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      watchSubscription(state.workspace?.subscriptionId || null);
      recompute();
    },
    (error) => console.error('[plan] workspace watch failed', error),
  ));

  unsubscribers.push(fs.onSnapshot(
    fs.doc(db, 'workspaces', workspaceId, 'usage', 'current'),
    (snap) => {
      state.usage = snap.exists() ? snap.data() : {};
      recompute();
    },
    // A missing counter document is not an error; it means nothing is used yet.
    (error) => console.error('[plan] usage watch failed', error),
  ));
}

function watchSubscription(subscriptionId) {
  if (!subscriptionId) {
    subscriptionUnsub?.();
    subscriptionUnsub = null;
    state.subscription = null;
    return;
  }
  if (subscriptionUnsub?.subscriptionId === subscriptionId) return;

  subscriptionUnsub?.();
  const { db, sdk } = firebaseContext();
  const fs = sdk.firestore;
  const stop = fs.onSnapshot(
    fs.doc(db, 'subscriptions', subscriptionId),
    (snap) => {
      state.subscription = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      recompute();
    },
    (error) => console.error('[plan] subscription watch failed', error),
  );
  stop.subscriptionId = subscriptionId;
  subscriptionUnsub = stop;
}

export function stopPlanWatch() {
  for (const stop of unsubscribers) {
    try { stop(); } catch (error) { console.error('[plan] unsubscribe failed', error); }
  }
  unsubscribers = [];
  subscriptionUnsub?.();
  subscriptionUnsub = null;
  state.ready = false;
}

// ── questions the UI asks ──────────────────────────────────────────────────

/** The plan in force, falling back to the free tier before the first snapshot. */
export function currentPlan() {
  return state.entitlement?.plan || planById(DEFAULT_PLAN);
}

export function planStatus() {
  return state.entitlement?.status || (state.mode === 'cloud' ? 'free' : 'local');
}

/** null in local mode, where no plan applies. */
export function quotaStatus() {
  if (!state.entitlement) return null;
  return itemQuotaStatus({ entitlement: state.entitlement, usage: state.usage });
}

export function canAddItem() {
  if (!state.entitlement) return { allowed: true };
  return checkCreateItem({ entitlement: state.entitlement, usage: state.usage });
}

/** Whether the assistant may run — credits, freeze and plan all considered. */
export function canUseAssistant() {
  if (!state.entitlement) return { allowed: false, reason: 'plan/local', message: 'مساعد نَظْم يتطلب حساباً' };
  return checkUseAI({ entitlement: state.entitlement, usage: state.usage });
}

/**
 * Whether a plan feature is available. In device-only mode everything local is
 * allowed — there is no plan to gate against and nothing is being sold.
 */
export function canUseFeature(feature) {
  if (!state.entitlement) return { allowed: true };
  return checkFeature({ entitlement: state.entitlement }, feature);
}

/**
 * How many rows the next import may take, and which limit decides.
 *
 * In device-only mode there is no plan to gate against, so only the technical
 * per-file ceiling applies — and it is described as what it is, a limit of the
 * file rather than of the plan.
 */
export function importLimit() {
  if (!state.entitlement) {
    return {
      plan: UNLIMITED, technical: MAX_ROWS, effective: MAX_ROWS,
      unlimitedPlan: true, boundBy: 'file',
    };
  }
  return importRowLimit({ entitlement: state.entitlement }, MAX_ROWS);
}

/** Whether this many rows may be written. Asked again before the commit. */
export function canImportRows(rows) {
  if (!state.entitlement) {
    return rows <= MAX_ROWS
      ? { allowed: true }
      : {
        allowed: false,
        message: `يمكن استيراد حتى ${MAX_ROWS.toLocaleString('en-US')} صفّاً في الملف الواحد. يمكنك استيراد ملفات إضافية.`,
      };
  }
  return checkImportRows({ entitlement: state.entitlement }, rows, MAX_ROWS);
}

/**
 * How long this plan keeps activity. Zero or less means "for as long as the
 * workspace exists", which is what an unlimited plan promises.
 */
export function activityRetentionDays() {
  const plan = state.entitlement?.plan || planById(DEFAULT_PLAN);
  const days = plan?.limits?.activityRetentionDays;
  return days === UNLIMITED ? 0 : (days ?? 0);
}

export function planUsage() {
  if (!state.entitlement) return [];
  return usageSummary({ entitlement: state.entitlement, usage: state.usage });
}

export function assistantLabel() {
  if (!state.entitlement) return { included: false, label: 'يتطلب حساباً' };
  return assistantPresentation({ entitlement: state.entitlement });
}
