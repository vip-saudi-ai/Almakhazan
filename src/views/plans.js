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
import { openSheet, toast } from '../ui.js';

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
      : el('button', {
        class: `btn ${plan.badge ? 'btn-p' : 'btn-s'}`, type: 'button',
        text: custom ? t('planUi.contact') : t('planUi.choose', { name: pick(plan.name) }),
        onClick: () => requestPlan(plan),
      }),
  ]);
}

function renderPlans() {
  const current = currentPlan();
  render($('plans-body'), [
    lastReason ? el('div', { class: 'plan-alert full', role: 'status', text: lastReason }) : null,
    el('p', { class: 'plan-note', text: t('planUi.dataSafe') }),
    billingToggle(),
    el('div', { class: 'plan-list' }, orderedPlans().map((plan) => planCard(plan, current))),
  ]);
}

/**
 * The upgrade sheet. Checkout is not wired to a payment provider yet, so the
 * button says what actually happens instead of pretending a plan was bought.
 */
export function openPlansSheet(reason = null) {
  lastReason = reason;
  renderPlans();
  openSheet('plans');
}

function requestPlan(plan) {
  if (plan.price.custom) {
    toast(t('planUi.enterpriseContact', { email: BRAND.salesEmail }), '✉');
    return;
  }
  // Honest until a provider is connected: no checkout, no fake activation.
  toast(t('planUi.paymentPending'), '⏳');
}

onLanguageChange(() => { if ($('sh-plans')?.classList.contains('open')) renderPlans(); });
