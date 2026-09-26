// Duplicate detection.
//
// Deterministic and explainable: nothing here merges anything. It groups
// records, says what evidence connected them and how strong that evidence is,
// and a person decides. A wrong automatic merge loses an owner's record of
// something they own, which is the one mistake this product cannot make.

import { normalizeArabic } from './search.js';
import { UNCATEGORIZED_ID } from './config.js';
import { t } from './i18n.js';

/**
 * What each signal is, and how much it is worth claiming.
 *
 * The confidence label is tied to what the identifier actually identifies.
 *
 *   serial   names one physical object. Two records carrying the same serial
 *            are the same object recorded twice — a confirmed match.
 *   barcode  names a PRODUCT, not an object. A GTIN is printed identically on
 *            every unit the manufacturer ever made, so two records sharing one
 *            may equally be two units the owner genuinely owns: two of the same
 *            camera lens, two sealed boxes of the same thing. This used to be
 *            labelled "confirmed", which invited an owner to fold two real
 *            possessions into one record and lose one of them. It is strong
 *            evidence of the same product and is labelled as exactly that.
 *   sku      is the owner's own code, so a collision is usually a mistake in
 *            their numbering — strong, but theirs to interpret.
 *   name     is a description, and two people (or the same person twice) can
 *            describe two different objects identically. A resemblance.
 */
const SIGNALS = {
  serial: {
    strength: 4,
    confidence: 'certain',
    get label() { return t('dup.serial.label'); },
    get reason() { return t('dup.serial.reason'); },
  },
  barcode: {
    strength: 3,
    confidence: 'high',
    get label() { return t('dup.barcode.label'); },
    get reason() { return t('dup.barcode.reason'); },
  },
  sku: {
    strength: 2,
    confidence: 'high',
    get label() { return t('dup.sku.label'); },
    get reason() { return t('dup.sku.reason'); },
  },
  name: {
    strength: 1,
    confidence: 'likely',
    get label() { return t('dup.name.label'); },
    get reason() { return t('dup.name.reason'); },
  },
};

const KINDS = ['serial', 'barcode', 'sku', 'name'];
const STRENGTH = Object.fromEntries(Object.entries(SIGNALS).map(([k, v]) => [k, v.strength]));

export { SIGNALS };

/** A serial number, wherever the record happens to carry it. */
function serialOf(item) {
  return item.serialNumber || item.serial || item.aiData?.serial || '';
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
 * Disjoint sets over record ids, with path compression.
 *
 * Grouping is a connected-components problem, not a bucketing one. Consider
 * three records: A and B share a barcode, B and C share a serial. All three
 * are one question — "are these the same object?" — and an owner has to see
 * them together to answer it. The previous pass walked the buckets strongest
 * first and let each one claim whatever records were still unclaimed, so B was
 * consumed by its serial group and A was left in a barcode group of one, which
 * then fell below the two-record threshold and vanished. The duplicate the
 * owner most needed to see was the one the algorithm dropped.
 */
function unionFind(ids) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression: walk it again and point everything straight at the root.
    let step = id;
    while (parent.get(step) !== root) {
      const next = parent.get(step);
      parent.set(step, root);
      step = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  return { find, union };
}

/**
 * @param {Array} items live records
 * @returns {Array<{key, kind, reason, label, confidence, strength, evidence, items}>}
 *   `confidence` is 'certain' | 'high' | 'likely', and it is a statement about
 *   what the evidence supports, never about how sure the feature would like to
 *   sound. `evidence` lists every signal that connected the group, strongest
 *   first, so the interface can say "same serial, and the same name" rather
 *   than picking one and hiding the rest.
 */
export function findDuplicateGroups(items) {
  if (!items?.length) return [];

  // 1. Bucket by each signal.
  const buckets = new Map();
  for (const kind of KINDS) {
    for (const item of items) {
      const key = keyFor(item, kind);
      if (!key) continue;
      if (!buckets.has(key)) buckets.set(key, { key, kind, items: [] });
      buckets.get(key).items.push(item);
    }
  }

  // 2. Every bucket holding more than one record is an edge between them.
  const { find, union } = unionFind(items.map((i) => i.id));
  const linking = [];
  for (const bucket of buckets.values()) {
    if (bucket.items.length < 2) continue;
    linking.push(bucket);
    for (let i = 1; i < bucket.items.length; i += 1) {
      union(bucket.items[0].id, bucket.items[i].id);
    }
  }
  if (!linking.length) return [];

  // 3. Collect the connected components, and the evidence that formed each.
  const byRoot = new Map();
  for (const item of items) {
    const root = find(item.id);
    if (!byRoot.has(root)) byRoot.set(root, { root, items: [], evidence: new Map() });
    byRoot.get(root).items.push(item);
  }
  for (const bucket of linking) {
    const group = byRoot.get(find(bucket.items[0].id));
    if (!group) continue;
    if (!group.evidence.has(bucket.kind)) group.evidence.set(bucket.kind, []);
    group.evidence.get(bucket.kind).push(bucket.key);
  }

  return [...byRoot.values()]
    .filter((group) => group.items.length > 1)
    .map((group) => {
      const kinds = [...group.evidence.keys()].sort((a, b) => STRENGTH[b] - STRENGTH[a]);
      // The group is described by its strongest evidence, and carries the rest.
      const kind = kinds[0];
      return {
        key: group.evidence.get(kind)[0],
        kind,
        evidence: kinds.map((k) => ({ kind: k, ...SIGNALS[k] })),
        items: group.items,
        ...SIGNALS[kind],
        reason: kinds.length > 1
          ? t('dup.twoReasons', { first: SIGNALS[kind].reason, second: SIGNALS[kinds[1]].reason })
          : SIGNALS[kind].reason,
      };
    })
    .sort((a, b) => STRENGTH[b.kind] - STRENGTH[a.kind] || b.items.length - a.items.length)
    // A stable order within each group, so the same inventory always produces
    // the same list and "the first one" means the same record every time.
    .map((group) => ({ ...group, items: [...group.items].sort((a, b) => String(a.id).localeCompare(String(b.id))) }));
}
