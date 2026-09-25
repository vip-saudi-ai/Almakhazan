// Language: a presentation layer, never a property of the data.
//
// Two languages, Arabic (`ar`, right to left, the default) and English (`en`,
// left to right). Everything the customer reads that the app wrote is looked
// up here by a semantic key; everything the customer wrote — names,
// descriptions, SKUs, their own categories — is shown exactly as stored, in
// either language. Nothing here writes to the inventory, and switching
// language re-renders what is on screen; it does not reload, refetch or
// re-parse anything.
//
// The messages live in `locales/*.js`, one entry per key with both languages
// side by side, so a key cannot exist in one language and not the other
// without the audit (`tools/i18n-audit.mjs`) saying so.
//
//   t('import.validRows', { count: 12 })   → "12 valid items" / "12 قطعة صالحة"
//
// A message may be a plain string with `{name}` placeholders, or — for counts —
// an object of plural forms chosen by `Intl.PluralRules` for the language:
// `{ one: '{count} item', other: '{count} items' }`. Values are inserted as
// text; the result is always a plain string, never markup.

import { MESSAGES } from './locales/index.js';

export const LANGUAGES = ['ar', 'en'];
export const DEFAULT_LANGUAGE = 'ar';
const STORAGE_KEY = 'nazm.language';

/** Formatting locales. Arabic keeps what the app has always shown (Latin
 *  digits for numbers, the Saudi calendar for dates); English targets the
 *  Saudi market. */
const NUMBER_LOCALE = { ar: 'ar-SA-u-nu-latn', en: 'en-SA' };
const DATE_LOCALE = { ar: 'ar-SA', en: 'en-SA' };

const listeners = new Set();
let current = readSaved() || DEFAULT_LANGUAGE;
const missingReported = new Set();

function readSaved() {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    return LANGUAGES.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function getLanguage() {
  return current;
}

export function isRtl(lang = current) {
  return lang === 'ar';
}

/**
 * Changes the language: remembered on this device, the document's `lang` and
 * `dir` set, static text re-translated, and every screen told so it can draw
 * itself again from the state it already holds.
 */
export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang) || lang === current) return;
  current = lang;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, lang); } catch { /* private mode: this session only */ }
  numberFormats.clear();
  applyDocumentLocale();
  for (const listener of [...listeners]) {
    try { listener(lang); } catch (error) { console.error('[i18n] a language listener failed', error); }
  }
}

/** Runs `listener(lang)` after every language change. Returns an unsubscribe. */
export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(key, lang) {
  const entry = MESSAGES[key];
  if (!entry) return undefined;
  return entry[lang];
}

function reportMissing(key, lang) {
  const id = `${lang}:${key}`;
  if (missingReported.has(id)) return;
  missingReported.add(id);
  console.warn(`[i18n] missing ${lang} message: ${key}`);
}

const pluralRules = new Map();
function pluralForm(lang, count) {
  if (!pluralRules.has(lang)) pluralRules.set(lang, new Intl.PluralRules(lang));
  return pluralRules.get(lang).select(count);
}

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => {
    if (!(name in params)) return match;
    const value = params[name];
    if (typeof value === 'number') return formatNumber(value);
    return value == null ? '' : String(value);
  });
}

/**
 * The message for `key` in the current language.
 *
 * Missing in the current language: the Arabic message (and a console warning,
 * once). Missing everywhere: the key itself — never an empty string.
 */
export function t(key, params) {
  let value = lookup(key, current);
  if (value === undefined) {
    reportMissing(key, current);
    value = lookup(key, DEFAULT_LANGUAGE);
    if (value === undefined) return key;
  }
  if (value && typeof value === 'object') {
    const count = Number(params?.count ?? 0);
    const form = count === 0 && value.zero != null ? 'zero' : pluralForm(current, count);
    value = value[form] ?? value.other ?? '';
  }
  return interpolate(value, params);
}

/**
 * Data that carries its own translations — the plans, `{ ar, en }` — in the
 * current language, falling back to Arabic. Anything else is returned as is.
 */
export function pick(value) {
  if (value && typeof value === 'object' && ('ar' in value || 'en' in value)) {
    return value[current] ?? value[DEFAULT_LANGUAGE] ?? '';
  }
  return value;
}

/** True when a key exists — for error codes that may or may not have a message. */
export function hasMessage(key) {
  return Object.prototype.hasOwnProperty.call(MESSAGES, key);
}

// ── formatting ─────────────────────────────────────────────────────────────

const numberFormats = new Map();
function numberFormat(options) {
  const id = `${current}|${JSON.stringify(options || {})}`;
  if (!numberFormats.has(id)) numberFormats.set(id, new Intl.NumberFormat(NUMBER_LOCALE[current], options));
  return numberFormats.get(id);
}

export function formatNumber(value, options) {
  if (value == null || !Number.isFinite(value)) return '—';
  return numberFormat(options).format(value);
}

export function formatCompactNumber(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function numberLocale() {
  return NUMBER_LOCALE[current];
}

export function dateLocale() {
  return DATE_LOCALE[current];
}

export function formatDate(date, options = { year: 'numeric', month: 'long', day: 'numeric' }) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(DATE_LOCALE[current], options);
}

export function formatDateTime(date, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(DATE_LOCALE[current], options);
}

/** "today", "yesterday", "3 days ago" — Intl does the grammar in both languages. */
export function formatRelativeDays(days) {
  const rtf = new Intl.RelativeTimeFormat(DATE_LOCALE[current], { numeric: 'auto' });
  return rtf.format(-days, 'day');
}

// ── the document ──────────────────────────────────────────────────────────

/**
 * `lang`, `dir`, title and description for the current language, and every
 * `data-i18n*` element translated. Cheap: it touches only the static markup.
 */
export function applyDocumentLocale(root = globalThis.document) {
  if (!root) return;
  const html = root.documentElement;
  if (html) {
    html.lang = current;
    html.dir = isRtl() ? 'rtl' : 'ltr';
  }
  if (root.title !== undefined) root.title = t('app.documentTitle');
  root.querySelector?.('meta[name="description"]')?.setAttribute('content', t('app.metaDescription'));
  translateDom(root);
}

/**
 * Static markup declares its text by key:
 *   data-i18n="key"                     → textContent
 *   data-i18n-attr="placeholder:key; aria-label:key; title:key"
 */
export function translateDom(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((part) => part.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  }
}

/** Every key, for the dev audit and tests. */
export function messageKeys() {
  return Object.keys(MESSAGES);
}
