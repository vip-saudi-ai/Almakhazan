// Query engine: Arabic-aware normalization, global search, filtering and sorting.
// Browsing scope and search scope are deliberately separate — a search always runs
// against every item, including the ones sitting inside folders.

import { UNCATEGORIZED_ID } from './config.js';
import { normalizeDigits, toMillis } from './utils.js';
import { valuationMidpoint } from './validation.js';

const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/** Folds Arabic orthographic variants so "أثر" and "اثر" match each other. */
export function normalizeArabic(input) {
  if (input == null) return '';
  return normalizeDigits(String(input))
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Precomputes the searchable text for an item. Cached on a WeakMap keyed by the
 * item object, so re-rendering the same list does not rebuild the haystack.
 */
const haystackCache = new WeakMap();

export function buildHaystack(item, lookups) {
  const cached = haystackCache.get(item);
  if (cached && cached.updatedAt === item.updatedAt) return cached.text;

  const category = lookups.category(item.categoryId);
  const folder = lookups.folder(item.folderId);
  const location = lookups.location(item.locationId);

  const text = normalizeArabic([
    item.name, item.sku, item.barcode, item.brand, item.description,
    // The numbers stamped on the object are often the only thing an owner
    // remembers when they go looking for it.
    item.serialNumber, item.modelNumber, item.referenceNumber,
    category?.name, folder?.name, location?.name,
    item.condition, item.aiData?.description,
  ].filter(Boolean).join(' '));

  haystackCache.set(item, { updatedAt: item.updatedAt, text });
  return text;
}

/** Every term must appear, in any field. */
export function matchesQuery(item, terms, lookups) {
  if (!terms.length) return true;
  const hay = buildHaystack(item, lookups);
  return terms.every((term) => hay.includes(term));
}

export function parseQuery(query) {
  const normalized = normalizeArabic(query);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

export const EMPTY_FILTERS = Object.freeze({
  condition: '', folderId: '', locationId: '', categoryId: '', ai: '', valuation: '',
});

export function activeFilterCount(filters) {
  return Object.values(filters).filter(Boolean).length;
}

export function applyFilters(items, filters) {
  let out = items;
  if (filters.condition) out = out.filter((i) => i.condition === filters.condition);
  if (filters.folderId) {
    out = filters.folderId === '__root__'
      ? out.filter((i) => !i.folderId)
      : out.filter((i) => i.folderId === filters.folderId);
  }
  if (filters.locationId) out = out.filter((i) => i.locationId === filters.locationId);
  if (filters.categoryId) out = out.filter((i) => i.categoryId === filters.categoryId);
  if (filters.ai === 'yes') out = out.filter((i) => i.aiData);
  if (filters.ai === 'no') out = out.filter((i) => !i.aiData);
  if (filters.valuation === 'yes') out = out.filter((i) => i.valuation);
  if (filters.valuation === 'no') out = out.filter((i) => !i.valuation);
  return out;
}

export const SORT_MODES = {
  newest: 'الأحدث',
  oldest: 'الأقدم',
  'name-az': 'الاسم أ-ي',
  'name-za': 'الاسم ي-أ',
  'value-high': 'التقييم ↓',
  'value-low': 'التقييم ↑',
};

const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

/**
 * A valuation range is reduced to its midpoint for ordering, so a 5k–8k item
 * sorts between a flat 6k and a flat 7k rather than by an arbitrary bound.
 * Items without a valuation always sort after valued ones, in both directions.
 */
export function sortItems(items, mode) {
  const sorted = [...items];
  const byValue = (dir) => (a, b) => {
    const va = valuationMidpoint(a.valuation);
    const vb = valuationMidpoint(b.valuation);
    if (va === null && vb === null) return toMillis(b.createdAt) - toMillis(a.createdAt);
    if (va === null) return 1;
    if (vb === null) return -1;
    return dir * (vb - va);
  };

  switch (mode) {
    case 'oldest': return sorted.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    case 'name-az': return sorted.sort((a, b) => collator.compare(a.name || '', b.name || ''));
    case 'name-za': return sorted.sort((a, b) => collator.compare(b.name || '', a.name || ''));
    case 'value-high': return sorted.sort(byValue(1));
    case 'value-low': return sorted.sort(byValue(-1));
    case 'newest':
    default: return sorted.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }
}

/**
 * Resolves the full query for a view.
 *
 * `scope` describes what the user is browsing (root or a folder). A non-empty
 * search query overrides it and runs across every live item, so a result inside
 * a folder is still reachable from the root search.
 */
export function queryItems({ items, query, filters, sortMode, scope, categoryPill, lookups }) {
  const terms = parseQuery(query);
  const searching = terms.length > 0;

  let base = items.filter((i) => !i.deletedAt);

  // The browsing scope (root shows unfoldered items, a folder shows its own)
  // is a navigation concept. It must not pre-filter the dataset a search or an
  // explicit folder filter runs against, or those would search a subset that
  // can never contain what the user asked for.
  const browsing = !searching && !filters.folderId;
  if (browsing) {
    base = scope?.folderId
      ? base.filter((i) => i.folderId === scope.folderId)
      : base.filter((i) => !i.folderId);
  }

  if (categoryPill && categoryPill !== 'all') {
    base = base.filter((i) => (i.categoryId || UNCATEGORIZED_ID) === categoryPill);
  }

  const filtered = applyFilters(base, filters);
  const matched = searching
    ? filtered.filter((i) => matchesQuery(i, terms, lookups))
    : filtered;

  return { results: sortItems(matched, sortMode), searching };
}

/** Clamps a page index so a stale page never produces a false empty state. */
export function clampPage(page, total, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return Math.min(Math.max(1, page), pages);
}

/**
 * Builds a compact page list with ellipses: 1 … 7 [8] 9 … 25
 * Returns entries of { type: 'page' | 'gap', value }.
 */
export function paginationModel(current, totalPages, window = 1) {
  if (totalPages <= 1) return [];
  const pages = new Set([1, totalPages]);
  for (let p = current - window; p <= current + window; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const ordered = [...pages].sort((a, b) => a - b);
  const model = [];
  let previous = 0;
  for (const page of ordered) {
    if (previous && page - previous > 1) model.push({ type: 'gap' });
    model.push({ type: 'page', value: page });
    previous = page;
  }
  return model;
}
