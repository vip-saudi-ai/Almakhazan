'use strict';

// Shared backend helpers: admin init, authorization, and the server-side copy
// of the entitlement rules.
//
// Everything a paying customer's limits depend on is decided here, from data
// the client cannot write. A modified frontend changes nothing.

const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const PLAN_CONFIG = require('../plans.json');

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const bucket = () => admin.storage().bucket();

const EDITOR_ROLES = new Set(['editor', 'admin', 'owner']);
const ADMIN_ROLES = new Set(['admin', 'owner']);
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

const PLANS = PLAN_CONFIG.plans;
const UNLIMITED = -1;

function planById(planId) {
  return PLANS[planId] || PLANS[PLAN_CONFIG.defaultPlan];
}

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'سجّل الدخول أولاً');
  }
  return request.auth.uid;
}

function requireString(value, field, maxLength = 256) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `الحقل ${field} مطلوب`);
  }
  if (value.length > maxLength) {
    throw new HttpsError('invalid-argument', `الحقل ${field} أطول من المسموح`);
  }
  return value.trim();
}

/** Reads the caller's role from Firestore. Never trusts a client-sent role. */
async function requireMember(uid, workspaceId, minimum = 'viewer') {
  const snap = await db.doc(`workspaces/${workspaceId}/members/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'لست عضواً في هذا المخزن');
  }
  const role = snap.data().role;
  if (minimum === 'editor' && !EDITOR_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'صلاحيتك للعرض فقط');
  }
  if (minimum === 'admin' && !ADMIN_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'هذا الإجراء يتطلب صلاحية مدير');
  }
  if (minimum === 'owner' && role !== 'owner') {
    throw new HttpsError('permission-denied', 'هذا الإجراء لمالك المخزن فقط');
  }
  return role;
}

/**
 * Resolves the workspace's effective plan from the workspace document and its
 * subscription record — both backend-written. Mirrors src/entitlements.js.
 */
async function resolveEntitlement(workspaceId) {
  const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
  if (!wsSnap.exists) {
    throw new HttpsError('not-found', 'المخزن غير موجود');
  }
  const workspace = wsSnap.data();

  let subscription = null;
  if (workspace.subscriptionId) {
    const subSnap = await db.doc(`subscriptions/${workspace.subscriptionId}`).get();
    if (subSnap.exists) subscription = subSnap.data();
  }

  const now = Date.now();
  const trialEndsAt = toMillis(workspace.trialEndsAt);
  const inTrial = trialEndsAt != null && trialEndsAt > now;

  let planId = workspace.plan || PLAN_CONFIG.defaultPlan;
  let status = 'free';

  if (subscription && LIVE_STATUSES.has(subscription.status)) {
    planId = subscription.plan || planId;
    status = subscription.status;
  } else if (inTrial) {
    planId = PLAN_CONFIG.trialPlan || planId;
    status = 'trialing';
  } else if (subscription) {
    planId = PLAN_CONFIG.defaultPlan;
    status = subscription.status || 'inactive';
  }

  return {
    workspace,
    planId: planById(planId).id,
    plan: planById(planId),
    status,
    inTrial,
    readOnly: workspace.readOnly === true,
  };
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

/** The current usage counters, or zeros when the document has not been created. */
async function readUsage(workspaceId) {
  const snap = await db.doc(`workspaces/${workspaceId}/usage/current`).get();
  const data = snap.exists ? snap.data() : {};
  return {
    items: data.items ?? 0,
    storageBytes: data.storageBytes ?? 0,
    members: data.members ?? 1,
    aiCreditsUsed: currentPeriodCredits(data),
    aiPeriod: data.aiPeriod ?? null,
  };
}

/** AI credits reset monthly; a stale period counts as zero used. */
function currentPeriodCredits(usage) {
  const period = monthKey();
  return usage?.aiPeriod === period ? (usage.aiCreditsUsed ?? 0) : 0;
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function withinLimit(used, limit) {
  return limit === UNLIMITED || used < limit;
}

/**
 * The server-side gate. Throws an HttpsError the client can render directly.
 * @param {'items'|'storageBytes'|'members'|'ai'} dimension
 */
async function assertWithinLimits(workspaceId, dimension, amount = 1) {
  const entitlement = await resolveEntitlement(workspaceId);
  if (entitlement.readOnly) {
    throw new HttpsError('failed-precondition', 'المخزن للقراءة فقط — جدّد الاشتراك لاستئناف التعديل.');
  }

  const usage = await readUsage(workspaceId);
  const limits = entitlement.plan.limits;

  if (dimension === 'items' && !withinLimit(usage.items, limits.items)) {
    throw new HttpsError('resource-exhausted',
      `وصلت إلى حد خطة ${entitlement.plan.name.ar}: ${usage.items} من ${limits.items} قطعة.`);
  }
  if (dimension === 'storageBytes'
      && limits.storageBytes !== UNLIMITED
      && usage.storageBytes + amount > limits.storageBytes) {
    throw new HttpsError('resource-exhausted', 'لا توجد مساحة تخزين كافية في خطتك.');
  }
  if (dimension === 'members' && !withinLimit(usage.members, limits.members)) {
    throw new HttpsError('resource-exhausted',
      `خطة ${entitlement.plan.name.ar} تسمح بـ ${limits.members} عضو.`);
  }
  if (dimension === 'ai') {
    if (limits.aiCreditsMonthly === 0) {
      throw new HttpsError('permission-denied',
        `التحليل البصري غير متاح في خطة ${entitlement.plan.name.ar}.`);
    }
    if (!withinLimit(usage.aiCreditsUsed, limits.aiCreditsMonthly)) {
      throw new HttpsError('resource-exhausted',
        `استهلكت رصيد التحليل لهذا الشهر: ${usage.aiCreditsUsed} من ${limits.aiCreditsMonthly}.`);
    }
  }

  return { entitlement, usage };
}

module.exports = {
  admin,
  db,
  bucket,
  logger,
  HttpsError,
  PLAN_CONFIG,
  PLANS,
  UNLIMITED,
  planById,
  requireAuth,
  requireString,
  requireMember,
  resolveEntitlement,
  readUsage,
  assertWithinLimits,
  monthKey,
  toMillis,
  EDITOR_ROLES,
  ADMIN_ROLES,
  LIVE_STATUSES,
};
