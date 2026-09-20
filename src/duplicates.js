// Duplicate detection.
//
// Deterministic and explainable: a barcode is a barcode, a SKU is a SKU, and
// two records with the same normalised name in the same category are worth a
// second look. Nothing here merges anything — it groups records and says why,
// and a person decides. A wrong automatic merge loses an owner's record of
// something they own, which is the one mistake this product cannot make.

import { normalizeArabic } from './search.js';
import { UNCATEGORIZED_ID } from './config.js';

/**
 * What each signal is, and how much it is worth claiming.
 *
 * The confidence label is tied to the evidence rather than chosen for effect.
 * A barcode is an identifier a manufacturer assigned to one product, so two
 * records carrying the same one are a confirmed match. A serial number is
 * stronger still — it identifies one *object*, not one product line. A name
 * is a person's description, and two people (or the same person twice) can
 * describe two different objects identically, so it is a resemblance and is
 * labelled as one.
 *
 * Nothing here says "certain" about a name match, and nothing merges.
 */
const SIGNALS = {
  serial:  { strength: 4, confidence: 'certain', label: 'تطابق مؤكد', reason: 'نفس الرقم التسلسلي' },
  barcode: { strength: 3, confidence: 'certain', label: 'تطابق مؤكد', reason: 'نفس الباركود' },
  sku:     { strength: 2, confidence: 'high',    label: 'تشابه مرتفع', reason: 'نفس الرمز' },
  name:    { strength: 1, confidence: 'likely',  label: 'تشابه محتمل', reason: 'اسم متطابق في نفس التصنيف' },
};

const KINDS = ['serial', 'barcode', 'sku', 'name'];
const STRENGTH = Object.fromEntries(Object.entries(SIGNALS).map(([k, v]) => [k, v.strength]));

export { SIGNALS };

/** A serial number, wherever the record happens to carry it. */
function serialOf(item) {
  return item.serial || item.serialNumber || item.aiData?.serial || '';
}

function keyFor(item, kind) {
  if (kind === 'serial') {
    const serial = String(serialOf(item)).trim().toLowerCase();
    return serial.length >= 4 ? `x:${serial}` : null;
  }
  if (kind === 'barcode') return item.barcode ? `b:${item.barcode.trim().toLowerCase()}` : null;
  if (kind === 'sku') return item.sku ? `s:${item.sku.trim().toLowerCase()}` : null;
  const name = normalizeArabic(item.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 3) return null;
  const category = item.categoryId || UNCATEGORIZED_ID;
  return `n:${category}:${name}`;
}

/**
 * @param {Array} items live records
 * @returns {Array<{key, kind, reason, label, confidence, strength, items}>}
 *   `confidence` is 'certain' | 'high' | 'likely', and it is a statement about
 *   the evidence, never about how sure the feature would like to sound.
 */
export function findDuplicateGroups(items) {
  const buckets = new Map();

  for (const kind of KINDS) {
    for (const item of items) {
      const key = keyFor(item, kind);
      if (!key) continue;
      if (!buckets.has(key)) buckets.set(key, { key, kind, items: [] });
      buckets.get(key).items.push(item);
    }
  }

  const groups = [...buckets.values()]
    .filter((group) => group.items.length > 1)
    .map((group) => ({ ...group, ...SIGNALS[group.kind] }));

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
