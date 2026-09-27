// Inventory aggregates: the numbers the Overview, the assistant and the health
// score show, kept as one small persisted record instead of being recomputed
// by reading every item.
//
// Each item contributes a fixed vector — one live record, its quantity, its
// Main Category, Category, location, folder, condition, whether it has
// photographs, a valuation (by currency, never summed across currencies), an
// analysis — and the aggregate is the sum of those vectors. A write changes
// the aggregate by (after − before), applied in the same database transaction
// as the write itself, so the numbers cannot disagree with the records they
// count unless a write bypassed the repository. For that case — a bug, an
// older version, a crash between two stores — `rebuild` walks the records a
// page at a time and writes the exact aggregate again. It is idempotent and is
// never run on every start: only when the record is missing, from an older
// schema, or asked for.
//
// Only structural fields are aggregated. Custom fields are not: aggregating
// every field a customer invents would grow without bound.
//
// The cloud backend will source the same shape from server-side aggregation;
// screens read it through repository.getInventoryOverview() and do not know
// which one answered.

import { valuationMidpoint } from './validation.js';

export const AGGREGATE_KEY = 'inventory';
/** Bumped when the shape changes: an older record is rebuilt, not trusted. */
export const AGGREGATE_SCHEMA = 2;
/** The bucket for "none" in a breakdown (no location, no folder…). */
export const NONE = '__none__';

// `byClass` counts records per (Main Category, Category) reference pair, so a
// question about classification — "how many are classified?" — is answered by
// resolving each pair once against the taxonomy (taxonomy.path reads only
// those two references), never by reading the records. It is bounded by the
// pairs actually in use.
const MAPS = ['byMain', 'byCategory', 'bySub', 'byLocation', 'byFolder', 'byCondition', 'byClass'];

/** The `byClass` key of a record, and back. */
export function classKey(item) { return `${item.mainCategoryId || ''}|${item.categoryId || ''}`; }
export function classRefs(key) {
  const [mainCategoryId, categoryId] = key.split('|');
  return { mainCategoryId: mainCategoryId || null, categoryId: categoryId || null };
}

/**
 * A record is "sound" when it can be found and counted: a name, a usable
 * quantity, and one way to identify it beyond the name (health.js).
 */
export function isSound(item) {
  return Boolean(item.name) && Number.isFinite(item.quantity) && item.quantity >= 0
    && Boolean(item.valuation || item.sku || item.barcode || item.description);
}

export function emptyAggregate() {
  return {
    key: AGGREGATE_KEY,
    schema: AGGREGATE_SCHEMA,
    live: 0,
    trashed: 0,
    quantity: 0,
    withImages: 0,
    valued: 0,
    analyzed: 0,
    sound: 0,
    byMain: {}, byCategory: {}, bySub: {}, byLocation: {}, byFolder: {}, byCondition: {}, byClass: {},
    // currency → { count, total } — one total per currency.
    currency: {},
    aiLocal: { count: 0, sum: 0 },
    aiGlobal: { count: 0, sum: 0 },
  };
}

/** What one record adds to the aggregate; null for no record. */
export function contribution(item) {
  if (!item) return null;
  if (item.deletedAt) return { trashed: 1 };
  const mid = valuationMidpoint(item.valuation);
  return {
    live: 1,
    quantity: Number(item.quantity) || 0,
    withImages: item.images?.length ? 1 : 0,
    valued: item.valuation ? 1 : 0,
    analyzed: item.aiData ? 1 : 0,
    sound: isSound(item) ? 1 : 0,
    byMain: item.mainCategoryId || NONE,
    byCategory: item.categoryId || NONE,
    bySub: item.subcategoryId || NONE,
    byLocation: item.locationId || NONE,
    byFolder: item.folderId || NONE,
    byCondition: item.condition || NONE,
    byClass: classKey(item),
    currency: mid != null && item.valuation?.currency ? { code: item.valuation.currency, total: mid } : null,
    aiLocal: item.aiData?.localScore != null ? Number(item.aiData.localScore) : null,
    aiGlobal: item.aiData?.globalScore != null ? Number(item.aiData.globalScore) : null,
  };
}

/** Adds one contribution to an aggregate, `sign` times (1 or −1). */
function add(target, c, sign) {
  if (!c) return;
  if (c.trashed) { target.trashed += sign; return; }
  target.live += sign;
  target.quantity += sign * c.quantity;
  target.withImages += sign * c.withImages;
  target.valued += sign * c.valued;
  target.analyzed += sign * c.analyzed;
  target.sound += sign * c.sound;
  for (const map of MAPS) {
    const key = c[map];
    const next = (target[map][key] || 0) + sign;
    if (next) target[map][key] = next; else delete target[map][key];
  }
  if (c.currency) {
    const entry = target.currency[c.currency.code] || { count: 0, total: 0 };
    entry.count += sign;
    entry.total += sign * c.currency.total;
    if (entry.count) target.currency[c.currency.code] = entry;
    else delete target.currency[c.currency.code];
  }
  for (const [field, value] of [['aiLocal', c.aiLocal], ['aiGlobal', c.aiGlobal]]) {
    if (value == null || !Number.isFinite(value)) continue;
    target[field].count += sign;
    target[field].sum += sign * value;
  }
}

/** A running change: what a batch of writes does to the aggregate. */
export class AggregateDelta {
  constructor() {
    this.plus = emptyAggregate();
    this.minus = emptyAggregate();
    this.changed = false;
  }

  /** One record went from `before` to `after` (either may be null). */
  change(before, after) {
    add(this.minus, contribution(before), 1);
    add(this.plus, contribution(after), 1);
    this.changed = true;
  }

  /** The aggregate after this change. */
  applyTo(current) {
    const out = structuredClone(current || emptyAggregate());
    const apply = (source, sign) => {
      for (const field of ['live', 'trashed', 'quantity', 'withImages', 'valued', 'analyzed', 'sound']) out[field] += sign * source[field];
      for (const map of MAPS) {
        for (const [key, n] of Object.entries(source[map])) {
          const next = (out[map][key] || 0) + sign * n;
          if (next) out[map][key] = next; else delete out[map][key];
        }
      }
      for (const [code, entry] of Object.entries(source.currency)) {
        const target = out.currency[code] || { count: 0, total: 0 };
        target.count += sign * entry.count;
        target.total += sign * entry.total;
        if (target.count) out.currency[code] = target; else delete out.currency[code];
      }
      for (const field of ['aiLocal', 'aiGlobal']) {
        out[field].count += sign * source[field].count;
        out[field].sum += sign * source[field].sum;
      }
    };
    apply(this.plus, 1);
    apply(this.minus, -1);
    // A currency whose records are all gone leaves no floating-point dust.
    for (const entry of Object.values(out.currency)) if (Math.abs(entry.total) < 1e-9) entry.total = 0;
    return out;
  }
}

/** An aggregate built from records handed over a page at a time. */
export class AggregateBuilder {
  constructor() { this.value = emptyAggregate(); }
  add(item) { add(this.value, contribution(item), 1); }
  result(extra = {}) { return { ...this.value, ...extra }; }
}

/** Whether a stored aggregate can be trusted as the current shape. */
export function isCurrentAggregate(record) {
  return Boolean(record && record.key === AGGREGATE_KEY && record.schema === AGGREGATE_SCHEMA && record.complete === true);
}

/**
 * The Overview's shape, from an aggregate: what the screens read, the same
 * whichever backend kept the aggregate. Breakdowns keep "none" as the key
 * `NONE`; currencies stay separate, ordered by how many records each prices.
 */
export function overviewFromAggregate(aggregate) {
  const a = aggregate;
  const average = (entry) => (entry.count ? { count: entry.count, average: entry.sum / entry.count } : { count: 0, average: null });
  return {
    totalItems: a.live,
    trashedItems: a.trashed,
    totalQuantity: a.quantity,
    itemsWithImages: a.withImages,
    itemsWithoutImages: a.live - a.withImages,
    valuedCount: a.valued,
    unvaluedCount: a.live - a.valued,
    analyzedCount: a.analyzed,
    soundCount: a.sound,
    withoutConditionCount: a.byCondition[NONE] || 0,
    byClassification: { ...a.byClass },
    byMainCategory: { ...a.byMain },
    byCategory: { ...a.byCategory },
    bySubcategory: { ...a.bySub },
    byLocation: { ...a.byLocation },
    byFolder: { ...a.byFolder },
    byCondition: { ...a.byCondition },
    withoutLocationCount: a.byLocation[NONE] || 0,
    valuationByCurrency: Object.entries(a.currency)
      .map(([currency, entry]) => ({ currency, count: entry.count, total: entry.total }))
      .sort((x, y) => y.count - x.count || y.total - x.total),
    aiLocal: average(a.aiLocal),
    aiGlobal: average(a.aiGlobal),
    builtAt: a.builtAt || null,
  };
}
