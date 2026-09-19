// Duplicate detection.
//
// Deterministic and explainable: a barcode is a barcode, a SKU is a SKU, and
// two records with the same normalised name in the same category are worth a
// second look. Nothing here merges anything — it groups records and says why,
// and a person decides. A wrong automatic merge loses an owner's record of
// something they own, which is the one mistake this product cannot make.

import { normalizeArabic } from './search.js';
import { UNCATEGORIZED_ID } from './config.js';

const REASONS = {
  barcode: 'نفس الباركود',
  sku: 'نفس الرمز',
  name: 'اسم متطابق في نفس التصنيف',
};

/** Strength decides which group wins when a record matches on more than one. */
const STRENGTH = { barcode: 3, sku: 2, name: 1 };

function keyFor(item, kind) {
  if (kind === 'barcode') return item.barcode ? `b:${item.barcode.trim().toLowerCase()}` : null;
  if (kind === 'sku') return item.sku ? `s:${item.sku.trim().toLowerCase()}` : null;
  const name = normalizeArabic(item.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 3) return null;
  const category = item.categoryId || UNCATEGORIZED_ID;
  return `n:${category}:${name}`;
}

/**
 * @param {Array} items live records
 * @returns {Array<{key: string, kind: string, reason: string, items: Array}>}
 */
export function findDuplicateGroups(items) {
  const buckets = new Map();

  for (const kind of ['barcode', 'sku', 'name']) {
    for (const item of items) {
      const key = keyFor(item, kind);
      if (!key) continue;
      if (!buckets.has(key)) buckets.set(key, { key, kind, items: [] });
      buckets.get(key).items.push(item);
    }
  }

  const groups = [...buckets.values()]
    .filter((group) => group.items.length > 1)
    .map((group) => ({ ...group, reason: REASONS[group.kind] }));

  // A record reported twice is noise. Keep it in its strongest group only.
  const claimed = new Map();
  for (const group of groups.sort((a, b) => STRENGTH[b.kind] - STRENGTH[a.kind])) {
    group.items = group.items.filter((item) => {
      if (claimed.has(item.id)) return false;
      claimed.set(item.id, group.key);
      return true;
    });
  }

  return groups
    .filter((group) => group.items.length > 1)
    .sort((a, b) => STRENGTH[b.kind] - STRENGTH[a.kind] || b.items.length - a.items.length);
}
