// Consent to external AI processing — asked before the first photo leaves.
//
// The assistant's photo analysis sends the item's photo and a little context
// to our backend and from there to an external AI provider. That is a
// transmission to a third party, so it happens only after a dedicated screen
// has said what is sent, why, to whom, and what the result is (and is not),
// and the customer has pressed "Agree & Continue". Not buried in the Terms,
// not assumed from a sign-up.
//
// The consent is recorded on the device ({ version, at }) and travels with
// every analysis request, where the backend refuses a request without a
// current version and records it on the account (functions/src/ai.js).
// Raising AI_CONSENT_VERSION asks everyone again: do that when the provider
// or the processing terms change materially.

import { onLanguageChange, t } from './i18n.js';
import { $, el, render } from './utils.js';
import { closeSheet, onSheetClose, openSheet } from './ui.js';

export const AI_CONSENT_VERSION = '2026-09-25';
const STORAGE_KEY = 'nazm.aiConsent';

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return value && typeof value.version === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** A consent to the current disclosure, or null. */
export function aiConsent() {
  const value = read();
  return value && value.version >= AI_CONSENT_VERSION ? value : null;
}

export function hasAiConsent() {
  return Boolean(aiConsent());
}

export function withdrawAiConsent() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing stored */ }
}

function record() {
  const value = { version: AI_CONSENT_VERSION, at: new Date().toISOString() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* private mode: asked again next time */ }
  return value;
}

let pending = null;
let answer = null;

function paint() {
  const body = $('legal-body');
  body.dataset.kind = 'aiConsent';
  $('legal-title').textContent = t('aiConsent.title');
  render(body, [
    el('p', { class: 'account-text', text: t('aiConsent.intro') }),
    el('h3', { text: t('aiConsent.whatHeading') }),
    el('ul', {}, ['aiConsent.what.photo', 'aiConsent.what.context'].map((key) => el('li', { text: t(key) }))),
    el('h3', { text: t('aiConsent.whyHeading') }),
    el('p', { text: t('aiConsent.why') }),
    el('h3', { text: t('aiConsent.whoHeading') }),
    el('p', { text: t('aiConsent.who') }),
    el('h3', { text: t('aiConsent.limitsHeading') }),
    el('ul', {}, ['aiConsent.limit.control', 'aiConsent.limit.accuracy', 'aiConsent.limit.notAppraisal'].map((key) => el('li', { text: t(key) }))),
    el('div', { class: 'account-actions' }, [
      el('button', { class: 'btn btn-s', type: 'button', text: t('aiConsent.cancel'), onClick: () => { answer?.(false); closeSheet('legal'); } }),
      el('button', {
        class: 'btn btn-p', type: 'button', id: 'ai-consent-agree', text: t('aiConsent.agree'),
        onClick: () => { record(); answer?.(true); closeSheet('legal'); },
      }),
    ]),
  ]);
}

/**
 * Resolves true once consent exists — immediately if it already does, or
 * after the customer agrees on the disclosure screen. Resolves false if they
 * cancel or dismiss it; nothing is sent then.
 */
export function ensureAiConsent() {
  if (hasAiConsent()) return Promise.resolve(true);
  if (pending) return pending;
  pending = new Promise((resolve) => {
    answer = (value) => {
      answer = null;
      pending = null;
      onSheetClose('legal', () => {});
      resolve(value);
    };
    paint();
    // Dismissing the sheet any other way is a "no".
    onSheetClose('legal', () => answer?.(false));
    openSheet('legal', { focus: '#ai-consent-agree' });
  });
  return pending;
}

// The disclosure is redrawn in the new language while it waits for an answer.
onLanguageChange(() => { if (answer) paint(); });
