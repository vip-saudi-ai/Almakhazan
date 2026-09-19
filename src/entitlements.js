// The single place that answers "is this allowed on this plan?".
//
// No view may branch on a plan id. Every limit check goes through a `check*`
// function here and gets back a uniform decision the UI can render directly.
//
// This layer exists for the *experience*: it keeps the user from starting work
// they cannot finish. It is not the enforcement boundary — Security Rules and
// the Cloud Functions in /functions are. Both read the same shared/plans.json.

import { PLAN_CONFIG } from './plans.generated.js';

export const PLANS = PLAN_CONFIG.plans;
export const DEFAULT_PLAN = PLAN_CONFIG.defaultPlan;
export const TRIAL_DAYS = PLAN_CONFIG.trialDays;
export const RETENTION = PLAN_CONFIG.retention;

export const UNLIMITED = -1;

/** Subscription states that keep a paid plan active. */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function planById(planId) {
  return PLANS[planId] || PLANS[DEFAULT_PLAN];
}

export function orderedPlans() {
  return Object.values(PLANS).sort((a, b) => a.order - b.order);
}

/**
 * Resolves the effective plan for a workspace.
 *
 * The workspace document carries `plan`, which only a verified backend write
 * can set (see firestore.rules). A lapsed subscription falls back to free
 * rather than keeping paid limits.
 *
 * @param {{plan?: string, trialEndsAt?: number, readOnly?: boolean}} workspace
 * @param {{status?: string, plan?: string, currentPeriodEnd?: number, cancelAtPeriodEnd?: boolean}|null} subscription
 */
export function resolveEntitlement(workspace, subscription = null, now = Date.now()) {
  const trialEndsAt = workspace?.trialEndsAt ?? null;
  const inTrial = trialEndsAt != null && trialEndsAt > now;

  let planId = workspace?.plan || DEFAULT_PLAN;
  let status = 'free';

  if (subscription && LIVE_STATUSES.has(subscription.status)) {
    planId = subscription.plan || planId;
    status = subscription.status;
  } else if (inTrial) {
    planId = PLAN_CONFIG.trialPlan || planId;
    status = 'trialing';
  } else if (subscription) {
    // Cancelled, unpaid or expired: entitlements drop to the free tier, but
    // nothing is ever deleted for it.
    planId = DEFAULT_PLAN;
    status = subscription.status || 'inactive';
  }

  const plan = planById(planId);
  return {
    planId: plan.id,
    plan,
    status,
    inTrial,
    trialEndsAt,
    readOnly: workspace?.readOnly === true,
    renewsAt: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd === true,
  };
}

function decision(allowed, options = {}) {
  return {
    allowed,
    reason: options.reason || null,
    message: options.message || null,
    detail: options.detail || null,
    used: options.used ?? null,
    limit: options.limit ?? null,
    planId: options.planId ?? null,
  };
}

const ALLOWED = decision(true);

function withinLimit(used, limit) {
  return limit === UNLIMITED || used < limit;
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * @typedef {object} EntitlementContext
 * @property {ReturnType<typeof resolveEntitlement>} entitlement
 * @property {{items?: number, storageBytes?: number, members?: number, aiCreditsUsed?: number, workspaces?: number}} usage
 */

/**
 * Arabic counts in four shapes: one, two, a few (3–10) and many. A message
 * that says "بقي لك 2 قطع" reads like a machine wrote it.
 */
function pieces(n) {
  if (n === 1) return 'قطعة واحدة';
  if (n === 2) return 'قطعتان';
  if (n <= 10) return `${n} قطع`;
  return `${n} قطعة`;
}

/** "الخطة المجانية" reads better than "خطة مجاني". */
function planPhrase(plan) {
  return plan.id === 'free' ? 'الخطة المجانية' : `خطة ${plan.name.ar}`;
}

export function checkFrozen({ entitlement }) {
  if (entitlement.readOnly) {
    return decision(false, {
      reason: 'workspace/read-only',
      message: 'مساحتك للقراءة فقط حالياً — جدّد الاشتراك لاستئناف التعديل.',
      planId: entitlement.planId,
    });
  }
  return ALLOWED;
}

export function checkCreateItem({ entitlement, usage }) {
  const frozen = checkFrozen({ entitlement });
  if (!frozen.allowed) return frozen;

  const limit = entitlement.plan.limits.items;
  const used = usage.items ?? 0;
  if (withinLimit(used, limit)) return ALLOWED;

  return decision(false, {
    reason: 'limit/items',
    message: entitlement.planId === 'free'
      ? `اكتمل الحد المجاني — ${used} من ${limit} قطعة.`
      : `اكتمل حد ${planPhrase(entitlement.plan)} — ${used} من ${limit} قطعة.`,
    detail: 'جميع بياناتك ستبقى محفوظة ويمكنك الوصول إليها دائماً. للمتابعة وإضافة المزيد، اختر الخطة المناسبة لك.',
    used,
    limit,
    planId: entitlement.planId,
  });
}

/**
 * Warns before the wall, not at it. A customer should learn they are running
 * out at 70% and again at 90%, never be surprised at record 51.
 *
 * @returns {{level: 'none'|'notice'|'warn'|'full', message: string|null, used: number, limit: number, ratio: number}}
 */
export function itemQuotaStatus({ entitlement, usage }) {
  const limit = entitlement.plan.limits.items;
  const used = usage.items ?? 0;
  if (limit === UNLIMITED) return { level: 'none', message: null, used, limit, ratio: 0 };

  const ratio = limit > 0 ? used / limit : 1;
  const { noticeAt, warnAt } = PLAN_CONFIG.usageWarnings;

  if (used >= limit) {
    return {
      level: 'full',
      message: entitlement.planId === 'free'
        ? `اكتمل الحد المجاني — ${used} من ${limit} قطعة`
        : `اكتمل حد ${planPhrase(entitlement.plan)} — ${used} من ${limit} قطعة`,
      used, limit, ratio,
    };
  }
  if (ratio >= warnAt) {
    return {
      level: 'warn',
      message: `بقي لك ${pieces(limit - used)} في ${planPhrase(entitlement.plan)}.`,
      used, limit, ratio,
    };
  }
  if (ratio >= noticeAt) {
    return {
      level: 'notice',
      message: entitlement.planId === 'free'
        ? `استخدمت ${Math.round(ratio * 100)}% من المساحة المجانية.`
        : `استخدمت ${Math.round(ratio * 100)}% من مساحة ${planPhrase(entitlement.plan)}.`,
      used, limit, ratio,
    };
  }
  return { level: 'none', message: null, used, limit, ratio };
}

export function checkUploadBytes({ entitlement, usage }, bytes) {
  const frozen = checkFrozen({ entitlement });
  if (!frozen.allowed) return frozen;

  const limit = entitlement.plan.limits.storageBytes;
  const used = usage.storageBytes ?? 0;
  if (limit === UNLIMITED || used + bytes <= limit) return ALLOWED;

  return decision(false, {
    reason: 'limit/storage',
    message: `لا توجد مساحة كافية: ${formatBytes(used)} من ${formatBytes(limit)} مستخدمة.`,
    used,
    limit,
    planId: entitlement.planId,
  });
}

export function checkImagesPerItem({ entitlement }, currentCount) {
  const limit = entitlement.plan.limits.imagesPerItem;
  if (withinLimit(currentCount, limit)) return ALLOWED;
  return decision(false, {
    reason: 'limit/images-per-item',
    message: `الحد ${limit} صور لكل قطعة في خطة ${entitlement.plan.name.ar}.`,
    used: currentCount,
    limit,
    planId: entitlement.planId,
  });
}

export function checkInviteMember({ entitlement, usage }) {
  const frozen = checkFrozen({ entitlement });
  if (!frozen.allowed) return frozen;

  const limit = entitlement.plan.limits.members;
  const used = usage.members ?? 1;
  if (withinLimit(used, limit)) return ALLOWED;

  return decision(false, {
    reason: 'limit/members',
    message: limit <= 1
      ? `خطة ${entitlement.plan.name.ar} لمستخدم واحد. رقِّ الخطة لإضافة أعضاء.`
      : `وصلت إلى حد الأعضاء: ${used} من ${limit}.`,
    used,
    limit,
    planId: entitlement.planId,
  });
}

export function checkUseAI({ entitlement, usage }) {
  const frozen = checkFrozen({ entitlement });
  if (!frozen.allowed) return frozen;

  const limit = entitlement.plan.limits.aiCreditsMonthly;
  const used = usage.aiCreditsUsed ?? 0;
  if (limit === 0) {
    return decision(false, {
      reason: 'feature/ai',
      message: `مساعد نَظْم غير متاح في ${planPhrase(entitlement.plan)}.`,
      used, limit, planId: entitlement.planId,
    });
  }
  if (withinLimit(used, limit)) return ALLOWED;

  return decision(false, {
    reason: 'limit/ai',
    message: `استهلكت رصيد التحليل لهذا الشهر: ${used} من ${limit}.`,
    used,
    limit,
    planId: entitlement.planId,
  });
}

export function checkCreateWorkspace({ entitlement, usage }) {
  const limit = entitlement.plan.limits.workspaces;
  const used = usage.workspaces ?? 1;
  if (withinLimit(used, limit)) return ALLOWED;
  return decision(false, {
    reason: 'limit/workspaces',
    message: `خطة ${entitlement.plan.name.ar} تسمح بـ ${limit} مخزن.`,
    used,
    limit,
    planId: entitlement.planId,
  });
}

/**
 * How the Assistant allowance should be presented. Paid plans say "included"
 * rather than advertising a credit number; the meter still runs server-side.
 */
export function assistantPresentation({ entitlement }) {
  const assistant = entitlement.plan.assistant || { display: 'counted' };
  return {
    included: assistant.display === 'included',
    label: assistant.label?.ar || 'غير متاح',
  };
}

export function checkFeature({ entitlement }, feature) {
  if (entitlement.plan.features?.[feature]) return ALLOWED;
  return decision(false, {
    reason: `feature/${feature}`,
    message: `هذه الميزة غير متاحة في خطة ${entitlement.plan.name.ar}.`,
    planId: entitlement.planId,
  });
}

/**
 * A downgrade never deletes anything. This reports which limits the workspace
 * currently sits above, so the UI can explain what is restricted and why.
 */
export function overagesFor({ entitlement, usage }) {
  const limits = entitlement.plan.limits;
  const over = [];
  const compare = (key, used, limit, label) => {
    if (limit !== UNLIMITED && used > limit) over.push({ key, used, limit, label });
  };
  compare('items', usage.items ?? 0, limits.items, 'القطع');
  compare('storageBytes', usage.storageBytes ?? 0, limits.storageBytes, 'مساحة الصور');
  compare('members', usage.members ?? 1, limits.members, 'الأعضاء');
  return over;
}

/** Shape used by the subscription card in Settings. */
export function usageSummary({ entitlement, usage }) {
  const limits = entitlement.plan.limits;
  return [
    { key: 'items', label: 'القطع', used: usage.items ?? 0, limit: limits.items, format: (n) => String(n) },
    { key: 'storage', label: 'الصور', used: usage.storageBytes ?? 0, limit: limits.storageBytes, format: formatBytes },
    { key: 'ai', label: 'مساعد نَظْم', used: usage.aiCreditsUsed ?? 0, limit: limits.aiCreditsMonthly, format: (n) => String(n) },
    { key: 'members', label: 'الأعضاء', used: usage.members ?? 1, limit: limits.members, format: (n) => String(n) },
  ];
}

export { formatBytes };
