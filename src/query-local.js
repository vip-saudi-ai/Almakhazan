// The query contract (query-spec.js) answered from IndexedDB.
//
// Two strategies, chosen per query, and neither ever holds more than a page:
//
//   ordered walk   the index of the requested order (createdAt, updatedAt,
//                  nameSortKey, [currency, midpoint]) is walked in that order
//                  and each record tested against the query; the walk stops as
//                  soon as the page is full. Right when the filters are broad.
//
//   top-K scan     the most selective source the filters offer (an equality
//                  index, a token prefix, a time range, the Trash) is walked
//                  completely, and only the best `limit` records after the
//                  cursor are kept. Right when a filter narrows the answer to a
//                  small set, and the fallback when no order index can be used.
//
// Counts come from index sizes or the persisted aggregate where the query
// allows it, and otherwise from a bounded walk of the most selective source.
// Every answer carries `meta` — the source, the strategy, how many records
// were examined and returned — for tests and diagnostics; no screen shows it.

import * as local from './local-store.js';
import { normalizeItem, valuationMidpoint } from './validation.js';
import { searchTokensOf } from './item-index.js';
import {
  compareForSort, decodeSpecCursor, encodeSpecCursor, matchesSpec, project, textTerms,
} from './query-spec.js';

/** A source this small is scanned whole and sorted with a bounded top-K. */
const SMALL_SOURCE = 2000;
const WALK_BATCH = 400;

/** Fields answered by an equality index. */
const EQ_INDEX = {
  mainCategoryId: 'mainCategoryId', categoryId: 'categoryId', subcategoryId: 'subcategoryId',
  locationId: 'locationId', folderId: 'folderId', condition: 'condition',
  sku: 'sku', barcode: 'barcode', serialNumber: 'serialNumber', valuationCurrency: 'valuationCurrency',
};
/** Their Trash twins, so a live count is a subtraction (local-store.js). */
const TRASH_INDEX = {
  folderId: 'folderDeleted', categoryId: 'categoryDeleted', mainCategoryId: 'mainCategoryDeleted',
  subcategoryId: 'subcategoryDeleted', locationId: 'locationDeleted', valuationCurrency: 'currencyDeleted',
};

const tokensOf = (item) => item.searchTokens || searchTokensOf(item);
const present = (item, projection) => project(normalizeItem(item), projection);

function rangeOf(filters, field) {
  let lower;
  let upper;
  let lowerOpen = false;
  let upperOpen = false;
  for (const f of filters) {
    if (f.field !== field) continue;
    if (f.op === 'gt' || f.op === 'gte') { lower = f.value; lowerOpen = f.op === 'gt'; }
    if (f.op === 'lt' || f.op === 'lte') { upper = f.value; upperOpen = f.op === 'lt'; }
  }
  if (lower === undefined && upper === undefined) return null;
  if (lower === undefined) return IDBKeyRange.upperBound(upper, upperOpen);
  if (upper === undefined) return IDBKeyRange.lowerBound(lower, lowerOpen);
  return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
}

/** Every narrowing source the query offers, with its size. */
async function sources(spec, { indexReady = false } = {}) {
  const out = [];
  for (const f of spec.filters) {
    if (f.field === 'id' && (f.op === 'eq' || f.op === 'in')) {
      const ids = f.op === 'eq' ? [f.value] : f.value;
      out.push({ kind: 'keys', ids, size: ids.length, name: 'id' });
    } else if (EQ_INDEX[f.field] && f.op === 'eq') {
      const range = IDBKeyRange.only(f.value);
      out.push({ kind: 'index', index: EQ_INDEX[f.field], ranges: [range], size: await local.countRange('items', EQ_INDEX[f.field], range), name: f.field });
    } else if (EQ_INDEX[f.field] && f.op === 'in') {
      const ranges = f.value.map((v) => IDBKeyRange.only(v));
      let size = 0;
      for (const range of ranges) size += await local.countRange('items', EQ_INDEX[f.field], range);
      out.push({ kind: 'index', index: EQ_INDEX[f.field], ranges, size, name: f.field });
    } else if (f.field === 'deleted' && f.value === true) {
      out.push({ kind: 'index', index: 'deletedAt', ranges: [null], size: await local.countRange('items', 'deletedAt', null), name: 'deleted' });
    }
  }
  for (const field of ['createdAt', 'updatedAt']) {
    const range = rangeOf(spec.filters, field);
    if (range) out.push({ kind: 'index', index: field, ranges: [range], size: await local.countRange('items', field, range), name: field });
  }
  const terms = textTerms(spec.text);
  // Until every record carries its tokens (the backfill, repository.js), the
  // token index does not hold them all; the text is then tested on the walk.
  if (terms.length && indexReady) {
    // The longest term is the most selective prefix.
    const term = [...terms].sort((a, b) => b.length - a.length)[0];
    const range = IDBKeyRange.bound(term, `${term}￿`);
    out.push({ kind: 'index', index: 'searchTokens', ranges: [range], size: await local.countRange('items', 'searchTokens', range), name: 'text', dedupe: true });
  }
  return out.sort((a, b) => a.size - b.size);
}

/** Hands every record of a source to `visit`, a batch at a time. */
async function walkSource(source, visit) {
  if (!source) {
    await local.walk('items', { batchSize: WALK_BATCH, onBatch: (rows) => { for (const r of rows) visit(r); return true; } });
    return;
  }
  if (source.kind === 'keys') {
    for (let i = 0; i < source.ids.length; i += WALK_BATCH) {
      for (const row of await local.getMany('items', source.ids.slice(i, i + WALK_BATCH))) visit(row);
    }
    return;
  }
  const seen = source.dedupe ? new Set() : null;
  for (const range of source.ranges) {
    await local.walk('items', {
      index: source.index, range, batchSize: WALK_BATCH,
      onBatch: (rows) => {
        for (const row of rows) {
          if (seen) { if (seen.has(row.id)) continue; seen.add(row.id); }
          visit(row);
        }
        return true;
      },
    });
  }
}

/** The order index for a sort, its range, and a record's key in it. */
function orderIndex(spec, indexReady) {
  const { field, direction } = spec.sort;
  const idbDirection = direction === 'asc' ? 'next' : 'prev';
  if (field === 'createdAt' || field === 'updatedAt') {
    return { index: field, range: rangeOf(spec.filters, field), direction: idbDirection, keyOf: (i) => i[field] };
  }
  if (!indexReady) return null;
  if (field === 'name') return { index: 'nameSortKey', range: null, direction: idbDirection, keyOf: (i) => i.nameSortKey };
  if (field === 'valuation') {
    const currency = spec.filters.find((f) => f.field === 'valuationCurrency' && f.op === 'eq').value;
    return {
      index: 'valueSort', range: IDBKeyRange.bound([currency], [currency, []]), direction: idbDirection,
      keyOf: (i) => [i.valuation.currency, i.valuationMidpoint],
    };
  }
  return null;
}

/**
 * One page of the answer.
 *
 * @param {object} spec a validated spec
 * @param {{indexReady: boolean}} context whether the derived ordering fields
 *   are present on every record (repository.indexFieldsReady)
 */
export async function queryItemsLocal(spec, { indexReady = false } = {}) {
  const started = performance.now();
  const position = decodeSpecCursor(spec);
  const compare = compareForSort(spec.sort);
  const candidates = await sources(spec, { indexReady });
  const smallest = candidates[0] || null;
  const order = orderIndex(spec, indexReady);
  // A cursor carries the strategy that issued it. An ordered cursor is only
  // resumed as an ordered walk; a top-K cursor — or an ordered one whose index
  // can no longer be used — resumes as a top-K scan from the record it ended
  // on, which every cursor carries. So a strategy that changes between pages
  // (the back-fill finishing mid-list) never restarts or repeats the list.
  const useOrdered = order && (!smallest || smallest.size > SMALL_SOURCE) && (!position || position.m === 'o');
  const test = (item) => matchesSpec(item, spec, tokensOf);

  let scanned = 0;
  let page = [];
  let more = false;

  if (useOrdered) {
    await local.walk('items', {
      index: order.index,
      range: order.range,
      direction: order.direction,
      after: position?.k,
      afterPrimary: position?.p,
      batchSize: WALK_BATCH,
      onBatch: (rows) => {
        for (const row of rows) {
          scanned += 1;
          if (!test(row)) continue;
          if (page.length < spec.limit) { page.push(row); continue; }
          more = true;
          return false;
        }
        return true;
      },
    });
  } else {
    // Keep the best `limit + 1` records after the cursor, in order.
    const after = position?.r ? { ...position.r } : null;
    const keep = spec.limit + 1;
    await walkSource(smallest, (row) => {
      scanned += 1;
      if (!test(row)) return;
      if (after && compare(row, after) <= 0) return;
      if (page.length === keep && compare(row, page[keep - 1]) >= 0) return;
      let at = page.length;
      while (at > 0 && compare(row, page[at - 1]) < 0) at -= 1;
      page.splice(at, 0, row);
      if (page.length > keep) page.pop();
    });
    more = page.length > spec.limit;
    page = page.slice(0, spec.limit);
  }

  const last = page[page.length - 1];
  let nextCursor = null;
  if (more && last) {
    nextCursor = useOrdered
      ? encodeSpecCursor(spec, { m: 'o', k: order.keyOf(last), p: last.id, r: sortPosition(spec, last) })
      : encodeSpecCursor(spec, { m: 't', r: sortPosition(spec, last) });
  }
  const total = await cheapCount(spec);
  return {
    items: page.map((row) => present(row, spec.projection)),
    nextCursor,
    hasMore: more,
    total,
    meta: {
      source: 'local',
      strategy: useOrdered ? `ordered:${order.index}` : `top-k:${smallest ? `${smallest.name}` : 'store'}`,
      scanned,
      returned: page.length,
      elapsedMs: Math.round(performance.now() - started),
    },
  };
}

/** The fields the comparator reads, for a top-K cursor. */
function sortPosition(spec, row) {
  return {
    id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, name: row.name,
    nameSortKey: row.nameSortKey, valuation: row.valuation,
  };
}

/**
 * The exact count when index sizes give it without a walk: no filter but
 * "live", or one equality whose index has a Trash twin. Null otherwise.
 */
async function cheapCount(spec) {
  if (spec.text) return null;
  const others = spec.filters.filter((f) => !(f.field === 'deleted' && f.value === false));
  const live = others.length === spec.filters.length - 1;
  if (!live) return null;
  if (!others.length) {
    const [total, trashed] = await Promise.all([local.countFresh('items'), local.countRange('items', 'deletedAt', null)]);
    return total - trashed;
  }
  if (others.length === 1 && others[0].op === 'eq' && TRASH_INDEX[others[0].field]) {
    const { field, value } = others[0];
    const [all, trashed] = await Promise.all([
      local.countRange('items', EQ_INDEX[field], IDBKeyRange.only(value)),
      local.countRange('items', TRASH_INDEX[field], IDBKeyRange.bound([value], [value, []])),
    ]);
    return all - trashed;
  }
  return null;
}

/** Exactly how many records match — from index sizes, or a bounded walk. */
export async function countItemsLocal(spec, { indexReady = false } = {}) {
  const cheap = await cheapCount(spec);
  if (cheap != null) return { count: cheap, meta: { source: 'local', strategy: 'index-count', scanned: 0 } };
  const smallest = (await sources(spec, { indexReady }))[0] || null;
  let count = 0;
  let scanned = 0;
  await walkSource(smallest, (row) => {
    scanned += 1;
    if (matchesSpec(row, spec, tokensOf)) count += 1;
  });
  return { count, meta: { source: 'local', strategy: `walk:${smallest?.name || 'store'}`, scanned } };
}

/**
 * Sums over the matching records: count, quantity, and valuation per currency
 * — never one total across currencies. A bounded walk; the caller uses the
 * persisted aggregate instead when the query is the whole live inventory.
 */
export async function aggregateItemsLocal(spec, { indexReady = false } = {}) {
  const smallest = (await sources(spec, { indexReady }))[0] || null;
  const result = { count: 0, quantity: 0, byCurrency: {} };
  let scanned = 0;
  await walkSource(smallest, (row) => {
    scanned += 1;
    if (!matchesSpec(row, spec, tokensOf)) return;
    result.count += 1;
    result.quantity += Number(row.quantity) || 0;
    const currency = row.valuation?.currency;
    const mid = valuationMidpoint(row.valuation);
    if (currency && mid != null) {
      const entry = result.byCurrency[currency] || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += mid;
      result.byCurrency[currency] = entry;
    }
  });
  return { ...result, meta: { source: 'local', strategy: `walk:${smallest?.name || 'store'}`, scanned } };
}
