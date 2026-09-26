// Delete Account — a deliberate, four-step flow in its own sheet.
//
//   1. What deletion means.
//   2. What it does to workspaces — and, if the customer owns a workspace other
//      people use, why it is blocked until ownership is resolved.
//   3. A fresh sign-in (password, Apple or Google — whichever the account has).
//   4. Typing the confirmation word, then the backend deletes.
//
// The sheet never says "deleted" before the backend has confirmed it, the
// button cannot be pressed twice, and every failure leaves the sheet usable
// with a message in the customer's language. The work itself is in
// src/account.js; this file only asks.

import {
  accountDeletionStatus, accountSignInMethods, deleteAccount, reauthenticate,
} from '../account.js';
import { Feature, isFeatureAvailable, isFeatureEnabled } from '../features.js';
import { getLanguage, onLanguageChange, t } from '../i18n.js';
import { $, el, render } from '../utils.js';
import { closeSheet, isSheetOpen, onSheetClose, openSheet, toastError, withBusy } from '../ui.js';
import { openLegalDocument } from './legal.js';

const state = { step: 'explain', status: null, error: null, reauthed: false };

/** The confirmation word, in the language the flow started in. */
function confirmWord() {
  return t('account.confirmWord');
}

function paragraph(key, params) {
  return el('p', { class: 'account-text', text: t(key, params) });
}

function actions(...buttons) {
  return el('div', { class: 'account-actions' }, buttons.filter(Boolean));
}

function cancelButton() {
  return el('button', { class: 'btn btn-s', type: 'button', text: t('common.cancel'), onClick: () => closeSheet('account') });
}

function explainStep() {
  return [
    el('div', { class: 'account-icon', 'aria-hidden': 'true', text: '⚠️' }),
    paragraph('account.deleteExplain'),
    el('ul', { class: 'account-list' }, [
      el('li', { text: t('account.deletePoint.access') }),
      el('li', { text: t('account.deletePoint.data') }),
      el('li', { text: t('account.deletePoint.device') }),
      el('li', { text: t('account.deletePoint.app') }),
      isFeatureEnabled(Feature.BILLING) ? el('li', { text: t('account.deletePoint.subscription') }) : null,
    ]),
    el('button', {
      class: 'auth-link', type: 'button', text: t('legal.privacyPolicy'),
      onClick: () => openLegalDocument('privacy'),
    }),
    actions(
      cancelButton(),
      el('button', {
        class: 'btn btn-d', type: 'button', text: t('common.continue'),
        onClick: (event) => withBusy(event.currentTarget, '…', loadStatus),
      }),
    ),
  ];
}

async function loadStatus() {
  try {
    state.status = await accountDeletionStatus();
    state.step = state.status.blocked ? 'blocked' : 'reauth';
  } catch (error) {
    toastError(error, 'error.account/failed');
    return;
  }
  paint();
}

function blockedStep() {
  const names = state.status.blocking.map((ws) => ws.name || '—');
  return [
    el('div', { class: 'account-icon', 'aria-hidden': 'true', text: '👥' }),
    el('p', { class: 'account-text', role: 'alert', text: t('account.blocked') }),
    el('ul', { class: 'account-list' }, names.map((name) => el('li', { dir: 'auto', text: name }))),
    paragraph('account.blockedHow'),
    actions(
      el('button', { class: 'btn btn-p', type: 'button', text: t('common.ok'), onClick: () => closeSheet('account') }),
    ),
  ];
}

function reauthStep() {
  const methods = accountSignInMethods();
  const { status } = state;
  const run = (method, secret) => async (event) => withBusy(event.currentTarget, '…', async () => {
    try {
      await reauthenticate(method, typeof secret === 'function' ? secret() : secret);
      state.reauthed = true;
      state.step = 'confirm';
      paint();
    } catch (error) {
      toastError(error, 'error.account/reauth-failed');
    }
  });

  return [
    status.ownedAlone || status.memberOf ? el('div', { class: 'account-note', role: 'note' }, [
      status.ownedAlone ? el('p', { text: t('account.willDeleteOwned', { count: status.ownedAlone }) }) : null,
      status.memberOf ? el('p', { text: t('account.willLeave', { count: status.memberOf }) }) : null,
    ]) : null,
    paragraph('account.reauthExplain'),
    methods.password ? el('div', { class: 'frow' }, [
      el('label', { for: 'account-password', text: t('auth.password') }),
      el('input', {
        id: 'account-password', type: 'password', dir: 'ltr', autocomplete: 'current-password',
        enterkeyhint: 'go',
      }),
    ]) : null,
    methods.password ? el('button', {
      class: 'btn btn-p account-wide', type: 'button', text: t('account.reauthPassword'),
      onClick: run('password', () => $('account-password')?.value || ''),
    }) : null,
    methods.apple ? el('button', {
      class: 'btn btn-s account-wide', type: 'button', text: t('account.reauthApple'), onClick: run('apple'),
    }) : null,
    methods.google ? el('button', {
      class: 'btn btn-s account-wide', type: 'button', text: t('account.reauthGoogle'), onClick: run('google'),
    }) : null,
    actions(cancelButton()),
  ];
}

function confirmStep() {
  const word = confirmWord();
  const input = el('input', {
    id: 'account-confirm', class: 'del-phrase', type: 'text', dir: 'auto',
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'done',
    'aria-describedby': 'account-confirm-hint',
  });
  const go = el('button', {
    class: 'btn btn-d', type: 'button', text: t('account.deleteNow'), disabled: true,
    onClick: (event) => withBusy(event.currentTarget, t('account.deleting'), finish),
  });
  input.addEventListener('input', () => { go.disabled = input.value.trim() !== word; });
  return [
    paragraph('account.finalWarning'),
    el('label', { class: 'del-phrase-label', for: 'account-confirm', id: 'account-confirm-hint', text: t('account.typeToConfirm', { word }) }),
    input,
    actions(cancelButton(), go),
  ];
}

async function finish() {
  try {
    await deleteAccount();
  } catch (error) {
    if (error?.code === 'account/requires-recent-login') { state.step = 'reauth'; paint(); }
    if (error?.code === 'account/owns-shared-workspace') {
      state.status = { ...state.status, blocked: true, blocking: error.details?.blocking || [] };
      state.step = 'blocked';
      paint();
    }
    toastError(error, 'error.account/failed');
    return;
  }
  state.step = 'done';
  paint();
}

function doneStep() {
  return [
    el('div', { class: 'account-icon', 'aria-hidden': 'true', text: '✓' }),
    el('p', { class: 'account-text', role: 'status', text: t('account.deleted') }),
    actions(el('button', {
      class: 'btn btn-p', type: 'button', text: t('common.ok'),
      // A clean start: the deleted account's session and cache are gone.
      onClick: () => window.location.reload(),
    })),
  ];
}

const STEPS = { explain: explainStep, blocked: blockedStep, reauth: reauthStep, confirm: confirmStep, done: doneStep };

function paint() {
  const body = $('account-body');
  if (!body) return;
  render(body, STEPS[state.step]());
  body.closest('.shscroll')?.scrollTo?.(0, 0);
  const first = body.querySelector('input, button:not([disabled])');
  requestAnimationFrame(() => first?.focus({ preventScroll: true }));
}

/** Settings → Legal & Privacy → Delete Account. */
export function openDeleteAccount() {
  if (!isFeatureAvailable(Feature.ACCOUNTS)) return;
  Object.assign(state, { step: 'explain', status: null, error: null, reauthed: false, lang: getLanguage() });
  paint();
  openSheet('account');
}

// The deletion is final only once 'done' is shown; closing earlier simply
// abandons the flow — nothing has been deleted.
onSheetClose('account', () => {
  if (state.step === 'done') window.location.reload();
});

// Redrawn in place in the new language. The typed confirmation is cleared: the
// word it must match is now the other language's.
onLanguageChange(() => { if (isSheetOpen('account')) paint(); });
