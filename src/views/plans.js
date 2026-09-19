// The upgrade sheet: every plan, what the customer has now, and what changes.
//
// Kept apart from Settings so both the quota banner and the Settings card can
// open it without importing each other.

import { UNLIMITED, formatBytes, orderedPlans } from '../entitlements.js';
import { currentPlan } from '../subscription.js';
import { el, render, $ } from '../utils.js';
import { openSheet, toast } from '../ui.js';

/** Arabic counts its members differently at 1, 2, 3–10 and beyond. */
function membersLabel(count) {
  if (count === UNLIMITED) return 'أعضاء بلا حد';
  if (count === 1) return 'عضو واحد';
  if (count === 2) return 'عضوان';
  if (count <= 10) return `${count} أعضاء`;
  return `${count} عضواً`;
}

/**
 * The upgrade sheet. Checkout is not wired to a payment provider yet, so the
 * button says what actually happens instead of pretending a plan was bought.
 */
export function openPlansSheet(reason = null) {
  const current = currentPlan();
  const list = el('div', { class: 'plan-list' }, orderedPlans().map((plan) => el('div', {
    class: `plan-card${plan.badge ? ' featured' : ''}${plan.id === current.id ? ' current' : ''}`,
  }, [
    plan.badge ? el('div', { class: 'plan-badge', text: plan.badge.ar }) : null,
    el('div', { class: 'plan-name', text: plan.name.ar }),
    el('div', { class: 'plan-cost' }, plan.price.custom
      ? [el('span', { class: 'plan-custom', text: plan.price.custom.ar })]
      : [
        el('span', { class: 'plan-amount', text: String(plan.price.monthly) }),
        el('span', { class: 'plan-unit', text: 'ريال / شهر' }),
      ]),
    el('ul', { class: 'plan-features' }, [
      el('li', { text: plan.limits.items === UNLIMITED ? 'قطع بلا حد' : `${plan.limits.items.toLocaleString('en-US')} قطعة` }),
      el('li', { text: plan.limits.storageBytes === UNLIMITED ? 'تخزين بلا حد' : `${formatBytes(plan.limits.storageBytes)} للصور` }),
      el('li', { text: membersLabel(plan.limits.members) }),
      el('li', { text: `مساعد المخزن: ${plan.assistant.label.ar}` }),
    ]),
    plan.id === current.id
      ? el('div', { class: 'plan-current-tag', text: 'خطتك الحالية' })
      : el('button', {
        class: 'btn btn-s', type: 'button',
        text: plan.price.custom ? 'تواصل معنا' : 'اختر هذه الخطة',
        onClick: () => requestPlan(plan),
      }),
  ])));

  render($('plans-body'), [
    reason ? el('div', { class: 'plan-alert full', role: 'status', text: reason }) : null,
    el('p', { class: 'plan-note', text: 'بياناتك تبقى كما هي في كل الأحوال — تغيير الخطة لا يحذف أي قطعة.' }),
    list,
  ]);
  openSheet('plans');
}

function requestPlan(plan) {
  if (plan.price.custom) {
    toast('راسلنا على sales@almakhzan.app لترتيب خطة المؤسسات', '✉');
    return;
  }
  // Honest until a provider is connected: no checkout, no fake activation.
  toast('الدفع الإلكتروني قيد التفعيل — راسلنا لتفعيل خطتك يدوياً', '⏳');
}
