// Two small cards at the top of the inventory, never a blocking screen:
//
//   • a new, empty inventory is asked «ما أنواع الأشياء التي تديرها عادة؟» —
//     several answers allowed, «تخطي» always there. The answer only decides
//     which Main Categories the picker shows first; nothing is deleted, and
//     every hidden one is a tap away in the picker and in Settings. It is not
//     an "industry" and not a permanent type.
//   • an existing inventory whose categories were just upgraded is told so,
//     once, with a way to review them. It never sees the question.

import { loadPrefs, savePrefs } from '../local-store.js';
import { t } from '../i18n.js';
import { repository } from '../repository.js';
import { ONBOARDING_CHOICES } from '../taxonomy.js';
import { $, el, render } from '../utils.js';
import { toast, toastError } from '../ui.js';

const DONE_KEY = 'taxonomyOnboarded';

let chosen = new Set();
let notice = false;

function onboarded() {
  return Boolean(loadPrefs()[DONE_KEY]);
}

function markOnboarded() {
  savePrefs({ ...loadPrefs(), [DONE_KEY]: true });
}

/** A brand-new inventory: nothing stored, nothing classified, never asked. */
function shouldAsk() {
  if (onboarded() || !repository.ready || !repository.canWrite()) return false;
  if (repository.state.categories.length) return false;
  const total = repository.itemsTotal ?? repository.state.items.length;
  return total === 0 && repository.state.items.length === 0;
}

export async function refreshTaxonomyNotice() {
  try {
    notice = await repository.taxonomyNotice();
  } catch {
    notice = false;
  }
  renderTaxonomyCard();
}

export function renderTaxonomyCard() {
  const host = $('tax-card');
  if (!host) return;
  if (notice) { render(host, [noticeCard()]); return; }
  if (shouldAsk()) { render(host, [questionCard()]); return; }
  render(host, []);
}

function noticeCard() {
  return el('section', { class: 'tx-banner', role: 'status' }, [
    el('p', { text: t('taxonomy.noticeText') }),
    el('div', { class: 'tx-banner-acts' }, [
      el('button', {
        type: 'button', class: 'btn btn-s', text: t('taxonomy.noticeReview'),
        onClick: async () => { await dismissNotice(); window.dispatchEvent(new CustomEvent('almakhzan:open-classification')); },
      }),
      el('button', { type: 'button', class: 'btn btn-g', text: t('taxonomy.noticeDismiss'), onClick: dismissNotice }),
    ]),
  ]);
}

async function dismissNotice() {
  notice = false;
  renderTaxonomyCard();
  try { await repository.dismissTaxonomyNotice(); } catch (error) { console.error('[taxonomy] notice not dismissed', error); }
}

function questionCard() {
  const taxonomy = repository.taxonomy();
  return el('section', { class: 'tx-banner', 'aria-labelledby': 'tx-onboard-title' }, [
    el('h2', { class: 'shtitle', id: 'tx-onboard-title', text: t('taxonomy.onboardTitle') }),
    el('p', { text: t('taxonomy.onboardHint') }),
    el('div', { class: 'tx-chips', role: 'group', 'aria-labelledby': 'tx-onboard-title' }, ONBOARDING_CHOICES.map((id) => {
      const node = taxonomy.node(id);
      if (!node) return null;
      return el('button', {
        type: 'button', class: 'tx-chip', 'aria-pressed': String(chosen.has(id)), dataset: { main: id },
        onClick: (event) => {
          if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
          event.currentTarget.setAttribute('aria-pressed', String(chosen.has(id)));
        },
      }, [el('span', { 'aria-hidden': 'true', text: taxonomy.icon(node) }), taxonomy.label(node)]);
    })),
    el('p', { class: 'tx-sub', text: t('taxonomy.onboardLater') }),
    el('div', { class: 'tx-banner-acts' }, [
      el('button', { type: 'button', class: 'btn btn-g', id: 'tx-onboard-skip', text: t('taxonomy.onboardSkip'), onClick: skip }),
      el('button', { type: 'button', class: 'btn btn-p', id: 'tx-onboard-continue', text: t('taxonomy.onboardContinue'), onClick: confirmChoice }),
    ]),
  ]);
}

function skip() {
  // Skipping keeps the whole library visible — a sensible default, and the
  // customer can hide what they never use later.
  markOnboarded();
  chosen = new Set();
  renderTaxonomyCard();
}

async function confirmChoice() {
  if (!chosen.size) { skip(); return; }
  try {
    await repository.applyMainCategoryChoice([...chosen]);
    markOnboarded();
    chosen = new Set();
    renderTaxonomyCard();
    toast(t('taxonomy.onboardDone'), '✓');
  } catch (error) {
    toastError(error);
  }
}
