// Shared UI mechanics: toasts, sheets, dialogs, focus handling.
//
// Sheets are real dialogs: they announce themselves, trap focus, close on
// Escape, and hand focus back to whatever opened them.

import { handleViewerKey } from './views/image-viewer.js';
import { onLanguageChange, t } from './i18n.js';
import { $, appendChildren, describeError, el } from './utils.js';

// ── toasts ──
export function toast(message, icon = '✓', { assertive = false } = {}) {
  const stack = $('tstack');
  if (!stack) return;
  stack.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  const node = el('div', { class: 'toast', role: 'status' }, [
    el('span', { text: icon, 'aria-hidden': 'true' }),
    message,
  ]);
  stack.append(node);
  setTimeout(() => node.remove(), 2600);
}

/**
 * An error, told to the customer in the current language. `fallback` is a
 * message key for when the error carries nothing the customer can use — a
 * browser exception, say — so its internals are never what they read.
 */
export function toastError(error, fallback = 'common.unknownError') {
  console.error(error);
  toast(describeError(error, fallback), '✕', { assertive: true });
}

// ── sheets ──
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack = [];

function trapFocus(event) {
  const top = stack[stack.length - 1];
  if (!top || event.key !== 'Tab') return;
  const focusable = [...top.panel.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener('keydown', (event) => {
  // The image viewer sits above every sheet, so it answers first — and when
  // it answers, nothing else does. Escape must close the viewer, not the
  // sheet underneath it that is still open.
  if (handleViewerKey(event)) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && stack.length) {
    event.preventDefault();
    closeTop();
    return;
  }
  trapFocus(event);
});

export function openSheet(name, { focus } = {}) {
  const overlay = $(`ov-${name}`);
  const panel = $(`sh-${name}`);
  if (!panel) return;

  if (stack.some((entry) => entry.name === name)) return;

  const entry = { name, overlay, panel, opener: document.activeElement };
  stack.push(entry);

  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  overlay?.classList.add('open');
  panel.classList.add('open');

  // Let the open transition start before moving focus, so iOS does not jump.
  requestAnimationFrame(() => {
    const target = focus ? panel.querySelector(focus) : panel.querySelector(FOCUSABLE);
    (target || panel).focus?.({ preventScroll: true });
  });
}

/**
 * Things to do when a sheet goes away, however it goes away.
 *
 * A sheet can be dismissed by its close button, the overlay, Escape, the back
 * gesture or another sheet closing everything — and work started inside it
 * (an uploaded photograph that was never saved onto a record) has to be
 * cleaned up on all of those paths, not just the one with a button on it.
 */
const closers = new Map();

export function onSheetClose(name, handler) {
  closers.set(name, handler);
}

export function closeSheet(name) {
  const index = stack.findIndex((entry) => entry.name === name);
  const entry = index >= 0 ? stack.splice(index, 1)[0] : null;
  const overlay = $(`ov-${name}`);
  const panel = $(`sh-${name}`);
  overlay?.classList.remove('open');
  panel?.classList.remove('open');
  entry?.opener?.focus?.({ preventScroll: true });
  if (entry) {
    try { closers.get(name)?.(); } catch (error) { console.error(`[ui] close handler for ${name} failed`, error); }
  }
}

export function closeTop() {
  const entry = stack[stack.length - 1];
  if (entry) closeSheet(entry.name);
}

export function closeAllSheets() {
  while (stack.length) closeTop();
}

export function isSheetOpen(name) {
  return stack.some((entry) => entry.name === name);
}

/** Wires an overlay so clicking the backdrop closes its sheet. */
export function bindSheetDismiss(name) {
  $(`ov-${name}`)?.addEventListener('click', () => closeSheet(name));
  document.querySelectorAll(`#sh-${name} [data-close]`).forEach((button) => {
    button.addEventListener('click', () => closeSheet(name));
  });
}

// ── destructive confirmation ──
let confirmResolve = null;
/** The open confirmation's descriptor, so a language switch can redraw it. */
let currentConfirmation = null;

/**
 * @param {{title: string, message: string, icon?: string, confirmLabel?: string,
 *          requirePhrase?: string}} options
 * @returns {Promise<boolean>}
 */
export function confirmAction(options) {
  const dialog = $('del-confirm');
  const input = $('del-phrase');
  const wrap = $('del-phrase-wrap');
  const button = $('del-confirm-btn');
  if (!dialog) return Promise.resolve(false);

  // The phrase is fixed for as long as this dialog is open: a language
  // switch half way through typing it must not move the goalposts. Only the
  // instruction around it is re-translated.
  const phrase = options.requirePhrase || '';
  currentConfirmation = { options, phrase };
  paintConfirmation();

  $('del-ico').textContent = options.icon || '🗑';
  wrap.style.display = phrase ? '' : 'none';
  input.value = '';
  button.disabled = Boolean(phrase);

  const onInput = () => { button.disabled = input.value.trim() !== phrase; };
  input.addEventListener('input', onInput);

  dialog.classList.add('open');
  dialog.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => (phrase ? input : button).focus({ preventScroll: true }));

  return new Promise((resolve) => {
    confirmResolve = (result) => {
      input.removeEventListener('input', onInput);
      dialog.classList.remove('open');
      dialog.setAttribute('aria-hidden', 'true');
      confirmResolve = null;
      currentConfirmation = null;
      resolve(result);
    };
  });
}

/**
 * The dialog's words, from its descriptor. Each of title, message and
 * confirmLabel may be given as
 *   - a key and params  (`titleKey`, `titleParams`)  — re-translated on a switch
 *   - a function        (`title: () => …`)           — re-run on a switch
 *   - a plain string    (`title: '…'`)               — shown as given
 * Customer text belongs in params, where it is inserted as it is.
 */
function confirmText(options, name) {
  const value = options[name];
  if (typeof value === 'function') return value();
  const key = options[`${name}Key`];
  if (key) return t(key, options[`${name}Params`]);
  return value ?? '';
}

function paintConfirmation() {
  if (!currentConfirmation) return;
  const { options, phrase } = currentConfirmation;
  $('del-title').textContent = confirmText(options, 'title');
  $('del-sub').textContent = confirmText(options, 'message');
  $('del-confirm-btn').textContent = confirmText(options, 'confirmLabel') || t('common.delete');
  $('del-phrase-label').textContent = phrase ? t('confirm.typeToConfirm', { phrase }) : '';
}

// Registered once, for whichever confirmation is open: a switch redraws it in
// place — the promise, the typed phrase and the focus are left alone.
onLanguageChange(() => paintConfirmation());

export function resolveConfirm(result) {
  confirmResolve?.(result);
}

export function flashSuccess() {
  const node = $('del-success');
  if (!node) return;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 1200);
}

// ── small builders shared across views ──
export function detailRow(label, value) {
  if (value == null || value === '' || value === '—') return null;
  return el('div', { class: 'dfrow' }, [
    el('div', { class: 'dflbl', text: label }),
    el('div', { class: 'dfval', dir: 'auto', text: value }),
  ]);
}

/**
 * A detail row holding a machine identifier — a serial, a model, a reference.
 *
 * These are printed on the object and have to read back exactly as they are
 * printed. In an Arabic (right-to-left) paragraph the bidirectional algorithm
 * reorders a mixed string like "A-1234/B" on screen, so the value is isolated
 * and given its own left-to-right direction. Nothing about the stored text
 * changes; only how it is laid out.
 */
export function identifierRow(label, value) {
  if (value == null || value === '' || value === '—') return null;
  return el('div', { class: 'dfrow' }, [
    el('div', { class: 'dflbl', text: label }),
    el('div', { class: 'dfval dfval-id', dir: 'ltr', text: value }),
  ]);
}

export function section(titleText, children, extra = {}) {
  return el('div', { class: 'ov-section', ...extra }, [
    titleText ? el('div', { class: 'ov-sec-title', text: titleText }) : null,
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

export function emptyState(icon, title, subtitle) {
  return el('div', { class: 'ov-empty' }, [
    el('div', { style: { fontSize: '52px', opacity: '.2' }, text: icon, 'aria-hidden': 'true' }),
    el('div', { style: { marginTop: '12px', fontSize: '16px', fontWeight: '600', color: 'var(--ts)' }, text: title }),
    subtitle ? el('div', { style: { fontSize: '13px', color: 'var(--tt)', marginTop: '6px' }, text: subtitle }) : null,
  ]);
}

export function optionList(select, options, selectedValue) {
  select.replaceChildren();
  appendChildren(select, options.map((option) => el('option', {
    value: option.value,
    text: option.label,
    selected: option.value === selectedValue || undefined,
  })));
  if (selectedValue != null) select.value = selectedValue;
}

/** Disables a control for the duration of an async action. */
export async function withBusy(button, busyLabel, action) {
  if (!button) return action();
  // The nodes, not the text: a button's icon comes back with its label.
  const original = [...button.childNodes];
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (busyLabel) button.textContent = busyLabel;
  try {
    return await action();
  } finally {
    button.disabled = wasDisabled;
    button.removeAttribute('aria-busy');
    if (busyLabel) button.replaceChildren(...original);
  }
}
