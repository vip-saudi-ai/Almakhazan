// Shared primitives: numerals, DOM construction, formatting, hashing.

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_INDIC = '۰۱۲۳۴۵۶۷۸۹';

const DIGIT_MAP = (() => {
  const map = new Map();
  for (let i = 0; i < 10; i++) {
    map.set(ARABIC_INDIC[i], String(i));
    map.set(PERSIAN_INDIC[i], String(i));
  }
  return map;
})();

/** Converts Arabic-Indic and Persian digits to ASCII, and Arabic separators to ASCII. */
export function normalizeDigits(input) {
  if (input == null) return '';
  let out = '';
  for (const ch of String(input)) {
    const mapped = DIGIT_MAP.get(ch);
    if (mapped !== undefined) out += mapped;
    else if (ch === '٫') out += '.';
    else if (ch === '٬') out += ',';
    else out += ch;
  }
  return out;
}

/**
 * Parses a number written with any supported digit set.
 * Returns null rather than a fallback so callers can tell "absent" from "zero".
 */
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const raw = normalizeDigits(input).replace(/[\s, ]/g, '').trim();
  if (!raw) return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function uid(prefix = 'x') {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36)}`;
}

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── DOM ──
export const $ = (id) => document.getElementById(id);

/**
 * Builds an element. Text is always assigned via textContent, so no caller can
 * inject markup through a data value.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  // Allow el(tag, children) — an array or a single node in the props slot is
  // children, not attributes.
  if (Array.isArray(props) || props instanceof Node || typeof props === 'string') {
    appendChildren(node, props);
    return node;
  }

  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) {
  if (node) node.replaceChildren();
}

export function setText(idOrNode, value) {
  const node = typeof idOrNode === 'string' ? $(idOrNode) : idOrNode;
  if (node) node.textContent = value == null ? '' : String(value);
}

export function render(node, children) {
  if (!node) return;
  node.replaceChildren();
  appendChildren(node, children);
}

// ── formatting ──
const AR_NUM = new Intl.NumberFormat('ar-SA-u-nu-latn');

export function formatNumber(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return AR_NUM.format(n);
}

export function formatCompact(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}ألف`;
  return AR_NUM.format(Math.round(n));
}

/** Accepts a Date, epoch millis, or a Firestore Timestamp-like object. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toMillis(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function timeAgo(value) {
  const date = toDate(value);
  if (!date) return '—';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days < 7) return `منذ ${days} أيام`;
  return date.toLocaleDateString('ar-SA');
}

export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Errors that carry an Arabic message safe to show the user. */
export class AppError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code || 'app/unknown';
    // Anything else the thrower knows — how many records a bulk write reached
    // before it stopped, say — travels as a field, so the caller reads a
    // number instead of parsing one out of an Arabic sentence.
    const { cause, code, ...details } = options;
    Object.assign(this, details);
  }
}
