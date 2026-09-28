// The query contract: what a screen, the assistant or an export may ask the
// repository for, as plain serializable data — the same object whether the
// device answers it from IndexedDB or a server answers it later.
//
//   {
//     filters: { mainCategoryId: 'equipment_tools',          // shorthand: eq
//                updatedAt: { lt: 1700000000000 },           // operators
//                locationId: { in: ['loc_a', 'loc_b'] },
//                hasImages: false },
//     text:    'مولد',          // words of the name, or an identifier
//     sort:    { field: 'updatedAt', direction: 'desc' },
//     limit:   50,              // at most MAX_LIMIT
//     cursor:  '…',             // opaque: only the backend that issued it reads it
//     projection: 'list' | 'full',
//   }
//
// Nothing here is a function, and nothing a caller writes becomes a database
// path: every field and operator is from the tables below, and anything else
// is refused before a backend sees it. That is what lets the same query be
// sent to a server, and what keeps a user-typed word from becoming a field
// name.
//
// Semantics are defined once, by `matchesSpec` and `compareForSort`: a backend
// may use indexes, a search service or a server-side aggregation to produce
// the answer, but the answer must be the one those two functions describe.
// The contract tests hold every backend to them.

import { AppError } from './utils.js';
import { nameSortKey, normalizeArabic } from './search.js';
import { valuationMidpoint } from './validation.js';

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;
const MAX_IN = 30;
const MAX_TEXT = 200;

const EQ_IN_EXISTS = ['eq', 'in', 'exists'];
const RANGE = ['gt', 'gte', 'lt', 'lte'];

/**
 * The fields a query may name, their type, and what may be asked of them.
 * Only structural fields: custom fields are not queryable here (and are not
 * indexed server-side by default — see CLOUD-ARCHITECTURE.md).
 */
export const QUERY_FIELDS = Object.freeze({
  id: { type: 'string', ops: ['eq', 'in'], read: (i) => i.id },
  mainCategoryId: { type: 'string', ops: EQ_IN_EXISTS, read: (i) => i.mainCategoryId || null },
  categoryId: { type: 'string', ops: EQ_IN_EXISTS, read: (i) => i.categoryId || null },
  subcategoryId: { type: 'string', ops: EQ_IN_EXISTS, read: (i) => i.subcategoryId || null },
  locationId: { type: 'string', ops: EQ_IN_EXISTS, read: (i) => i.locationId || null },
  folderId: { type: 'string', ops: EQ_IN_EXISTS, read: (i) => i.folderId || null },
  condition: { type: 'string', ops: EQ_IN_EXISTS, read: (i) => i.condition || null },
  sku: { type: 'string', ops: ['eq'], read: (i) => i.sku || null },
  barcode: { type: 'string', ops: ['eq'], read: (i) => i.barcode || null },
  serialNumber: { type: 'string', ops: ['eq'], read: (i) => i.serialNumber || null },
  modelNumber: { type: 'string', ops: ['eq'], read: (i) => i.modelNumber || null },
  referenceNumber: { type: 'string', ops: ['eq'], read: (i) => i.referenceNumber || null },
  hasImages: { type: 'boolean', ops: ['eq'], read: (i) => Boolean(i.images?.length) },
  valued: { type: 'boolean', ops: ['eq'], read: (i) => Boolean(i.valuation) },
  analyzed: { type: 'boolean', ops: ['eq'], read: (i) => Boolean(i.aiData) },
  valuationCurrency: { type: 'string', ops: ['eq', 'in'], read: (i) => i.valuation?.currency || null },
  // Compared only within one currency: a range on it requires a
  // valuationCurrency equality in the same query.
  valuationMidpoint: { type: 'number', ops: RANGE, read: (i) => valuationMidpoint(i.valuation) },
  quantity: { type: 'number', ops: ['eq', ...RANGE], read: (i) => (Number.isFinite(Number(i.quantity)) ? Number(i.quantity) : null) },
  createdAt: { type: 'number', ops: RANGE, read: (i) => i.createdAt ?? null },
  updatedAt: { type: 'number', ops: RANGE, read: (i) => i.updatedAt ?? null },
  // Live records unless asked otherwise: `deleted: true` is the Trash.
  deleted: { type: 'boolean', ops: ['eq'], read: (i) => Boolean(i.deletedAt) },
});

/** The orders a backend must be able to produce, and what each compares. */
export const QUERY_SORTS = Object.freeze({
  createdAt: (i) => i.createdAt ?? 0,
  updatedAt: (i) => i.updatedAt ?? 0,
  name: (i) => i.nameSortKey ?? nameSortKey(i.name),
  // Within one currency only (validated).
  valuation: (i) => valuationMidpoint(i.valuation) ?? -Infinity,
});

export const PROJECTIONS = Object.freeze({
  full: null,
  // What a list row draws. A backend may return more; a screen asking for
  // 'list' must not rely on anything else.
  list: Object.freeze(['id', 'name', 'sku', 'images', 'primaryImageId', 'mainCategoryId', 'categoryId', 'subcategoryId',
    'locationId', 'folderId', 'condition', 'quantity', 'unit', 'valuation', 'updatedAt', 'createdAt', 'deletedAt', 'version']),
});

function invalid(detail) {
  return new AppError('query.invalid', { code: 'query/invalid', detail });
}

function checkValue(field, def, op, value) {
  if (op === 'exists') {
    if (typeof value !== 'boolean') throw invalid(`${field}.exists`);
    return value;
  }
  if (op === 'in') {
    if (!Array.isArray(value) || !value.length || value.length > MAX_IN) throw invalid(`${field}.in`);
    return value.map((v) => checkValue(field, def, 'eq', v));
  }
  if (def.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(`${field}.${op}`);
    return value;
  }
  if (def.type === 'boolean') {
    if (typeof value !== 'boolean') throw invalid(`${field}.${op}`);
    return value;
  }
  if (typeof value !== 'string' || !value || value.length > 256) throw invalid(`${field}.${op}`);
  return value;
}

/**
 * Validates and normalizes a query. Throws `query/invalid` for an unknown
 * field, an operator a field does not support, a value of the wrong type, a
 * value comparison without its currency, or a page larger than MAX_LIMIT.
 *
 * @returns {{filters: Array<{field, op, value}>, text: string|null,
 *   sort: {field, direction}, limit: number, cursor: string|null,
 *   projection: string}}
 */
export function validateQuerySpec(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('spec');
  const allowed = new Set(['filters', 'text', 'sort', 'limit', 'cursor', 'projection']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw invalid(key);

  const filters = [];
  const raw = input.filters || {};
  const entries = Array.isArray(raw) ? raw.map((f) => [f?.field, { [f?.op]: f?.value }]) : Object.entries(raw);
  for (const [field, condition] of entries) {
    const def = Object.prototype.hasOwnProperty.call(QUERY_FIELDS, field) ? QUERY_FIELDS[field] : null;
    if (!def) throw invalid(`field:${field}`);
    const ops = condition !== null && typeof condition === 'object' && !Array.isArray(condition) ? condition : { eq: condition };
    for (const [op, value] of Object.entries(ops)) {
      if (!def.ops.includes(op)) throw invalid(`op:${field}.${op}`);
      filters.push({ field, op, value: checkValue(field, def, op, value) });
    }
  }
  if (!filters.some((f) => f.field === 'deleted')) filters.push({ field: 'deleted', op: 'eq', value: false });

  const currencyEq = filters.find((f) => f.field === 'valuationCurrency' && f.op === 'eq');
  if (filters.some((f) => f.field === 'valuationMidpoint') && !currencyEq) throw invalid('valuationMidpoint needs valuationCurrency');

  let text = null;
  if (input.text != null) {
    if (typeof input.text !== 'string' || input.text.length > MAX_TEXT) throw invalid('text');
    text = normalizeArabic(input.text) || null;
  }

  const sort = { field: 'createdAt', direction: 'desc', ...(input.sort || {}) };
  if (!Object.prototype.hasOwnProperty.call(QUERY_SORTS, sort.field)) throw invalid(`sort:${sort.field}`);
  if (sort.direction !== 'asc' && sort.direction !== 'desc') throw invalid('sort.direction');
  if (sort.field === 'valuation' && !currencyEq) throw invalid('valuation sort needs valuationCurrency');

  const limit = input.limit == null ? DEFAULT_LIMIT : input.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw invalid('limit');
  if (input.cursor != null && typeof input.cursor !== 'string') throw invalid('cursor');
  const projection = input.projection || 'full';
  if (!Object.prototype.hasOwnProperty.call(PROJECTIONS, projection)) throw invalid('projection');

  return { filters, text, sort: { field: sort.field, direction: sort.direction }, limit, cursor: input.cursor || null, projection };
}

/** The identity of a query's answer: everything except the page position. */
export function specKey(spec) {
  const filters = [...spec.filters].sort((a, b) => (a.field + a.op).localeCompare(b.field + b.op));
  return JSON.stringify([filters, spec.text, spec.sort]);
}

// ── the reference semantics ────────────────────────────────────────────────

/** The words of a text query. */
export function textTerms(text) {
  return (text || '').split(/\s+/).filter((word) => word.length >= 2);
}

/**
 * Text matching as the contract defines it: every term is a prefix of one of
 * the record's search tokens — words of its name and brand, and its
 * identifiers (item-index.js `searchTokensOf`). Descriptions are not part of
 * this search; that is a full-text feature for a search service.
 */
export function matchesText(tokens, terms) {
  return terms.every((term) => tokens.some((token) => token.startsWith(term)));
}

export function matchesFilter(item, { field, op, value }) {
  const actual = QUERY_FIELDS[field].read(item);
  switch (op) {
    case 'eq': return actual === value;
    case 'in': return value.includes(actual);
    case 'exists': return (actual != null && actual !== '') === value;
    case 'gt': return actual != null && actual > value;
    case 'gte': return actual != null && actual >= value;
    case 'lt': return actual != null && actual < value;
    case 'lte': return actual != null && actual <= value;
    default: return false;
  }
}

/** Does this record belong in this query's answer? */
export function matchesSpec(item, spec, tokensOf) {
  if (!spec.filters.every((filter) => matchesFilter(item, filter))) return false;
  if (!spec.text) return true;
  return matchesText(tokensOf(item), textTerms(spec.text));
}

/** The order of the answer; ties are broken by id, the same direction. */
export function compareForSort(sort) {
  const read = QUERY_SORTS[sort.field];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return (a, b) => {
    const x = read(a);
    const y = read(b);
    if (x < y) return -sign;
    if (x > y) return sign;
    return a.id < b.id ? -sign : a.id > b.id ? sign : 0;
  };
}

/** A record narrowed to a projection. */
export function project(item, projection) {
  const fields = PROJECTIONS[projection];
  if (!fields) return item;
  const out = {};
  for (const field of fields) if (item[field] !== undefined) out[field] = item[field];
  return out;
}

// ── cursors ────────────────────────────────────────────────────────────────

/**
 * Cursors are opaque to callers. Each backend puts what it needs inside
 * (an index position, a document's sort values…) together with the query's
 * identity, so a cursor spent on another query is refused, not misread.
 */
export function encodeSpecCursor(spec, state) {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ q: specKey(spec), s: state }))));
}

export function decodeSpecCursor(spec) {
  if (!spec.cursor) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(spec.cursor))));
    if (parsed.q !== specKey(spec)) throw new Error('other query');
    return parsed.s;
  } catch {
    throw invalid('cursor');
  }
}
