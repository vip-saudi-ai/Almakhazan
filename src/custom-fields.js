// Category-specific and customer-defined fields: their definitions, and the
// values a record keeps under them.
//
// The two are kept apart on purpose. A definition — its label, type, options —
// lives in the built-in catalog (src/locales/taxonomy-catalog.js), on a
// Category the customer saved it to, or on the one record it belongs to. A
// record's `customFields` holds values only, keyed by the definition's stable
// id: `{ manufacturer: 'Caterpillar', operating_hours: { value: 1200, unit: 'h' } }`.
// Renaming a field, or switching the language, never touches a value.
//
// Pure: no DOM, no storage, no taxonomy. validation.js sanitises every record
// through here; the form and the spreadsheet import validate against a
// definition through here.

import { TAXONOMY_LIMITS, isCurrencyCode, normalizeCurrencyCode } from './config.js';
import { normalizeDigits, parseNumber, uid } from './utils.js';

/** Every type a field can have. */
export const FIELD_TYPES = [
  'text', 'multiline', 'number', 'decimal', 'currency', 'date', 'boolean',
  'select', 'multiselect', 'url', 'identifier', 'measurement',
];

/** The types a customer can pick for a field of their own. */
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'currency', 'date', 'boolean', 'select', 'multiselect', 'url'];

const FIELD_ID = /^[a-z][a-z0-9_]{0,63}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CUSTOM_PREFIX = 'custom_f_';

export function isFieldId(id) {
  return typeof id === 'string' && FIELD_ID.test(id);
}

export function isCustomFieldId(id) {
  return isFieldId(id) && id.startsWith(CUSTOM_PREFIX);
}

/** A new, stable id for a field the customer creates. Never the label. */
export function newCustomFieldId() {
  return uid(CUSTOM_PREFIX).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, TAXONOMY_LIMITS.fieldId);
}

function cleanString(value, max) {
  if (value == null) return '';
  // Control characters have no place in a label or a value, and stripping them
  // is what keeps an imported cell from carrying anything but text.
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

/**
 * A customer's field definition, as it may be stored: on a record, or saved to
 * a Category. Anything malformed comes back null and is dropped.
 */
export function normalizeCustomFieldDef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = isCustomFieldId(raw.id) ? raw.id : null;
  const type = CUSTOM_FIELD_TYPES.includes(raw.type) ? raw.type : null;
  const label = cleanString(raw.label, TAXONOMY_LIMITS.fieldLabel);
  if (!id || !type || !label) return null;
  const def = { id, type, label, required: false, defaultVisible: true, source: 'custom' };
  if (type === 'select' || type === 'multiselect') {
    const seen = new Set();
    def.options = (Array.isArray(raw.options) ? raw.options : [])
      .map((option) => cleanString(typeof option === 'object' ? option?.label : option, TAXONOMY_LIMITS.optionLabel))
      .filter((option) => option && !seen.has(option) && seen.add(option))
      .slice(0, TAXONOMY_LIMITS.options);
    if (!def.options.length) return null;
  }
  return def;
}

export function normalizeCustomFieldDefs(list, max) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const def = normalizeCustomFieldDef(raw);
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    out.push(def);
    if (out.length >= max) break;
  }
  return out;
}

/** The option ids a select accepts: a built-in option's id, or a custom option's own text. */
function optionIds(def) {
  return (def.options || []).map((option) => (typeof option === 'string' ? option : option.id));
}

/**
 * Structural sanitising, with no definition to hand: what `normalizeItem` does
 * to every record, whatever wrote it. Keys must be field ids; values must be
 * one of the shapes a field can produce. Everything else is dropped.
 */
export function sanitizeFieldValues(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let count = 0;
  for (const key of Object.keys(raw)) {
    if (!isFieldId(key)) continue;
    const value = sanitizeValue(raw[key]);
    if (value === undefined) continue;
    out[key] = value;
    count += 1;
    if (count >= TAXONOMY_LIMITS.valuesPerItem) break;
  }
  return out;
}

function sanitizeValue(value) {
  if (typeof value === 'string') {
    const text = cleanString(value, TAXONOMY_LIMITS.multiline);
    return text || undefined;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const list = [...new Set(value
      .filter((entry) => typeof entry === 'string')
      .map((entry) => cleanString(entry, TAXONOMY_LIMITS.optionLabel))
      .filter(Boolean))].slice(0, TAXONOMY_LIMITS.options);
    return list.length ? list : undefined;
  }
  if (value && typeof value === 'object') {
    if ('amount' in value) {
      const amount = typeof value.amount === 'number' && Number.isFinite(value.amount) ? value.amount : null;
      if (amount == null || !isCurrencyCode(value.currency)) return undefined;
      return { amount, currency: normalizeCurrencyCode(value.currency) };
    }
    if ('value' in value) {
      const number = typeof value.value === 'number' && Number.isFinite(value.value) ? value.value : null;
      if (number == null) return undefined;
      return { value: number, unit: cleanString(value.unit, 16) };
    }
  }
  return undefined;
}

function isRealDate(text) {
  const match = DATE.exec(text);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * One value checked against its definition.
 *
 * @param {object} def a field definition (built-in or custom)
 * @param {*} input what the form or the spreadsheet holds
 * @param {{currency?: string}} [options] the currency a bare amount is in
 * @returns {{value: *} | {error: string}} `value` undefined means "empty"; the
 *   error is a message key under `field.error.`.
 */
export function normalizeFieldValue(def, input, { currency = 'SAR' } = {}) {
  const empty = input == null || input === '' || (Array.isArray(input) && !input.length);
  if (empty) return { value: undefined };
  const rules = def.validation || {};

  switch (def.type) {
    case 'text':
    case 'identifier': {
      const text = cleanString(input, TAXONOMY_LIMITS.text);
      if (!text) return { value: undefined };
      if (rules.pattern && !new RegExp(rules.pattern).test(text)) return { error: 'field.error.format' };
      return { value: text };
    }
    case 'multiline': {
      const text = cleanString(input, TAXONOMY_LIMITS.multiline);
      return { value: text || undefined };
    }
    case 'number':
    case 'decimal':
    case 'measurement': {
      const raw = typeof input === 'object' && input !== null && 'value' in input ? input.value : input;
      const number = parseNumber(raw);
      if (number == null) return { error: 'field.error.number' };
      if (rules.integer && !Number.isInteger(number)) {
        return { error: 'field.error.integer' };
      }
      if (rules.min != null && number < rules.min) return { error: 'field.error.min' };
      if (rules.max != null && number > rules.max) return { error: 'field.error.max' };
      if (def.type === 'measurement') return { value: { value: number, unit: def.unit || '' } };
      return { value: number };
    }
    case 'currency': {
      const object = typeof input === 'object' && input !== null;
      const amount = parseNumber(object ? input.amount : input);
      if (amount == null) return { error: 'field.error.number' };
      if (amount < 0) return { error: 'field.error.min' };
      const code = object ? input.currency : currency;
      return { value: { amount, currency: normalizeCurrencyCode(code, normalizeCurrencyCode(currency)) } };
    }
    case 'date': {
      const text = normalizeDigits(String(input)).trim();
      if (!isRealDate(text)) return { error: 'field.error.date' };
      return { value: text };
    }
    case 'boolean': {
      if (typeof input === 'boolean') return { value: input };
      const text = String(input).trim().toLowerCase();
      if (['true', 'yes', 'y', '1', 'نعم', 'صح'].includes(text)) return { value: true };
      if (['false', 'no', 'n', '0', 'لا', 'خطأ'].includes(text)) return { value: false };
      return { error: 'field.error.boolean' };
    }
    case 'select': {
      const text = cleanString(input, TAXONOMY_LIMITS.optionLabel);
      return optionIds(def).includes(text) ? { value: text } : { error: 'field.error.option' };
    }
    case 'multiselect': {
      const list = (Array.isArray(input) ? input : String(input).split(/[,،;|]/))
        .map((entry) => cleanString(entry, TAXONOMY_LIMITS.optionLabel)).filter(Boolean);
      const allowed = new Set(optionIds(def));
      if (list.some((entry) => !allowed.has(entry))) return { error: 'field.error.option' };
      const unique = [...new Set(list)];
      return { value: unique.length ? unique : undefined };
    }
    case 'url': {
      const text = cleanString(input, TAXONOMY_LIMITS.url);
      try {
        const url = new URL(text);
        if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname && !url.username && !url.password) {
          return { value: url.href };
        }
      } catch { /* falls through */ }
      return { error: 'field.error.url' };
    }
    default:
      return { error: 'field.error.format' };
  }
}

/** True when a stored value has something in it worth showing. */
export function hasFieldValue(value) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
