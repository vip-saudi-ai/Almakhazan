// The upgrade sheet: every plan, what the customer has now, and what changes.
//
// Kept apart from Settings so both the quota banner and the Settings card can
// open it without importing each other.

import { UNLIMITED, formatBytes, orderedPlans } from '../entitlements.js';
import { PLAN_CONFIG } from '../plans.generated.js';
import { currentPlan } from '../subscription.js';
import { BRAND } from '../brand.js';
import { onLanguageChange, pick, t } from '../i18n.js';
import { el, formatNumber, render, $ } from '../utils.js';
import { confirmAction, openSheet, toast, toastError, withBusy } from '../ui.js';
import { ENV } from '../environment.js';
import { Feature, isFeatureEnabled } from '../features.js';
import { contactSales } from '../contact.js';
import {
  canManageSubscription, canRestorePurchases, manageSubscription, restorePurchases, startPurchase,
} from '../billing.js';

/** Remembered while the sheet is open, so switching cycles re-renders in place. */
let billing = 'monthly';
let lastReason = null;

/** Arabic counts its members differently at 1, 2, 3–10 and beyond — the
 *  plural forms in the message say so; `t` picks the right one. */
export function membersLabel(count) {
  if (count === UNLIMITED) return t('planUi.membersCustom');
  return t('planUi.members', { count });
}

export function itemsLabel(plan) {
  if (plan.limitsLabel) return pick(plan.limitsLabel);
  if (plan.limits.items === UNLIMITED) return t('planUi.customLimits');
  return t('count.items', { count: plan.limits.items });
}

function billingToggle() {
  const annual = billing === 'yearly';
  const option = (value, label) => el('button', {
    class: `gate-billing-opt${billing === value ? ' on' : ''}`,
    type: 'button', text: label, 'aria-pressed': String(billing === value),
    onClick: () => { billing = value; renderPlans(); },
  });
  return el('div', { class: 'plan-billing' }, [
    el('div', { class: 'gate-billing', role: 'group', 'aria-label': t('planUi.billingCycle') }, [
      option('monthly', t('planUi.monthly')),
      option('yearly', t('planUi.yearly')),
    ]),
    annual ? el('p', { class: 'gate-annual-note', text: pick(PLAN_CONFIG.annualNote) }) : null,
  ]);
}

function planCard(plan, current) {
  const annual = billing === 'yearly';
  const custom = Boolean(plan.price.custom);
  const free = !custom && plan.price.monthly === 0;
  const amount = annual ? plan.price.yearly : plan.price.monthly;
  const isCurrent = plan.id === current.id;

  let cost;
  if (custom) cost = [el('span', { class: 'plan-custom', text: pick(plan.price.custom) })];
  else if (free) cost = [el('span', { class: 'plan-custom', text: t('planUi.free') })];
  else cost = [
    el('span', { class: 'plan-amount', text: formatNumber(amount) }),
    el('span', { class: 'plan-unit', text: annual ? t('planUi.perYear') : t('planUi.perMonth') }),
  ];

  return el('div', {
    class: `plan-card${plan.badge ? ' featured' : ''}${isCurrent ? ' current' : ''}`,
  }, [
    plan.badge ? el('div', { class: 'plan-badge', text: pick(plan.badge) }) : null,
    el('div', { class: 'plan-name', text: pick(plan.name) }),
    el('div', { class: 'plan-cost' }, cost),
    el('ul', { class: 'plan-features' }, [
      el('li', { text: itemsLabel(plan) }),
      el('li', { text: plan.limits.storageBytes === UNLIMITED ? t('planUi.storageCustom') : t('planUi.storageFor', { size: formatBytes(plan.limits.storageBytes) }) }),
      el('li', { text: membersLabel(plan.limits.members) }),
      el('li', { text: `${BRAND.assistant}: ${pick(plan.assistant.label)}` }),
    ]),
    isCurrent
      ? el('div', { class: 'plan-current-tag', text: t('planUi.current') })
      : planAction(plan, custom),
  ]);
}

/** A plan's button — or none, when there is nothing it could honestly do. */
function planAction(plan, custom) {
  if (custom) {
    if (!ENV.contact.salesEmail) return null;
    return el('button', {
      class: 'btn btn-s', type: 'button', text: t('planUi.contact'),
      onClick: contactSales,
    });
  }
  if (plan.price.monthly === 0) return null;
  return el('button', {
    class: `btn ${plan.badge ? 'btn-p' : 'btn-s'}`, type: 'button',
    text: t('planUi.choose', { name: pick(plan.name) }),
    onClick: (event) => requestPlan(event.currentTarget, plan),
  });
}

function renderPlans() {
  const current = currentPlan();
  render($('plans-body'), [
    lastReason ? el('div', { class: 'plan-alert full', role: 'status', text: lastReason }) : null,
    el('p', { class: 'plan-note', text: t('planUi.dataSafe') }),
    billingToggle(),
    el('div', { class: 'plan-list' }, orderedPlans().map((plan) => planCard(plan, current))),
    el('div', { class: 'plan-store-actions' }, [
      canRestorePurchases() ? el('button', {
        class: 'btn btn-s', type: 'button', text: t('planUi.restorePurchases'),
        onClick: (event) => withBusy(event.currentTarget, '…', async () => {
          try { await restorePurchases(); toast(t('planUi.restoreRequested'), '✓'); } catch (error) { toastError(error); }
        }),
      }) : null,
      canManageSubscription() ? el('button', {
        class: 'btn btn-s', type: 'button', text: t('planUi.manageSubscription'),
        onClick: () => { manageSubscription().catch(toastError); },
      }) : null,
    ]),
  ]);
}

/**
 * The upgrade sheet — when this release sells plans. When it does not
 * (features.billing off), a limit is explained and nothing is offered for
 * sale: no prices, no button that could not complete.
 */
export function openPlansSheet(reason = null) {
  if (!isFeatureEnabled(Feature.BILLING)) {
    void confirmAction({
      titleKey: 'planUi.limitTitle',
      message: () => reason || t('planUi.limitReached'),
      icon: 'ℹ️',
      confirmLabelKey: 'common.ok',
      hideCancel: true,
    });
    return;
  }
  lastReason = reason;
  renderPlans();
  openSheet('plans');
}

/**
 * Hands the choice to the store. The plan changes on screen only when the
 * backend records the purchase (the subscription watch), never here.
 */
async function requestPlan(button, plan) {
  await withBusy(button, '…', async () => {
    try {
      const status = await startPurchase(plan.id, billing);
      if (status === 'purchased' || status === 'pending') toast(t('planUi.purchaseProcessing'), '⏳');
    } catch (error) {
      toastError(error, 'error.billing/failed');
    }
  });
}

onLanguageChange(() => { if ($('sh-plans')?.classList.contains('open')) renderPlans(); });
