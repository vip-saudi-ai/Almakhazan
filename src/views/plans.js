// The upgrade sheet: every plan, what the customer has now, and what changes.
//
// Kept apart from Settings so both the quota banner and the Settings card can
// open it without importing each other.

import { UNLIMITED, formatBytes, orderedPlans } from '../entitlements.js';
import { PLAN_CONFIG } from '../plans.generated.js';
import { currentPlan } from '../subscription.js';
import { BRAND } from '../brand.js';
import { el, render, $ } from '../utils.js';
import { openSheet, toast } from '../ui.js';

/** Remembered while the sheet is open, so switching cycles re-renders in place. */
let billing = 'monthly';
let lastReason = null;

/** Arabic counts its members differently at 1, 2, 3–10 and beyond. */
function membersLabel(count) {
  if (count === UNLIMITED) return 'أعضاء حسب الاتفاق';
  if (count === 1) return 'عضو واحد';
  if (count === 2) return 'عضوان';
  if (count <= 10) return `${count} أعضاء`;
  return `${count} عضواً`;
}

function itemsLabel(plan) {
  if (plan.limitsLabel) return plan.limitsLabel.ar;
  if (plan.limits.items === UNLIMITED) return 'حدود مخصصة';
  return `${plan.limits.items.toLocaleString('en-US')} قطعة`;
}

function billingToggle() {
  const annual = billing === 'yearly';
  const option = (value, label) => el('button', {
    class: `gate-billing-opt${billing === value ? ' on' : ''}`,
    type: 'button', text: label, 'aria-pressed': String(billing === value),
    onClick: () => { billing = value; renderPlans(); },
  });
  return el('div', { class: 'plan-billing' }, [
    el('div', { class: 'gate-billing', role: 'group', 'aria-label': 'دورة الفوترة' }, [
      option('monthly', 'شهري'),
      option('yearly', 'سنوي'),
    ]),
    annual ? el('p', { class: 'gate-annual-note', text: PLAN_CONFIG.annualNote.ar }) : null,
  ]);
}

function planCard(plan, current) {
  const annual = billing === 'yearly';
  const custom = Boolean(plan.price.custom);
  const free = !custom && plan.price.monthly === 0;
  const amount = annual ? plan.price.yearly : plan.price.monthly;
  const isCurrent = plan.id === current.id;

  let cost;
  if (custom) cost = [el('span', { class: 'plan-custom', text: plan.price.custom.ar })];
  else if (free) cost = [el('span', { class: 'plan-custom', text: 'مجاناً' })];
  else cost = [
    el('span', { class: 'plan-amount', text: amount.toLocaleString('en-US') }),
    el('span', { class: 'plan-unit', text: annual ? 'ريال / سنة' : 'ريال / شهر' }),
  ];

  return el('div', {
    class: `plan-card${plan.badge ? ' featured' : ''}${isCurrent ? ' current' : ''}`,
  }, [
    plan.badge ? el('div', { class: 'plan-badge', text: plan.badge.ar }) : null,
    el('div', { class: 'plan-name', text: plan.name.ar }),
    el('div', { class: 'plan-cost' }, cost),
    el('ul', { class: 'plan-features' }, [
      el('li', { text: itemsLabel(plan) }),
      el('li', { text: plan.limits.storageBytes === UNLIMITED ? 'تخزين حسب الاتفاق' : `${formatBytes(plan.limits.storageBytes)} للصور` }),
      el('li', { text: membersLabel(plan.limits.members) }),
      el('li', { text: `${BRAND.assistant}: ${plan.assistant.label.ar}` }),
    ]),
    isCurrent
      ? el('div', { class: 'plan-current-tag', text: 'خطتك الحالية' })
      : el('button', {
        class: `btn ${plan.badge ? 'btn-p' : 'btn-s'}`, type: 'button',
        text: custom ? 'تواصل معنا' : `اختر ${plan.name.ar}`,
        onClick: () => requestPlan(plan),
      }),
  ]);
}

function renderPlans() {
  const current = currentPlan();
  render($('plans-body'), [
    lastReason ? el('div', { class: 'plan-alert full', role: 'status', text: lastReason }) : null,
    el('p', { class: 'plan-note', text: 'بياناتك تبقى كما هي في كل الأحوال — تغيير الخطة لا يحذف أي قطعة.' }),
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
    toast(`راسلنا على ${BRAND.salesEmail} لترتيب خطة المؤسسات`, '✉');
    return;
  }
  // Honest until a provider is connected: no checkout, no fake activation.
  toast('الدفع الإلكتروني قيد التفعيل — راسلنا لتفعيل خطتك يدوياً', '⏳');
}
