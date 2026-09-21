// The local query engine: one page of an answer, read from IndexedDB.
//
// This is what sits under `queryInventory` when the records are on the device.
// It exists because the previous local adapter was honest about being a filter
// over an array — and an array of every record is exactly what a 20,000-record
// workspace cannot afford to hold. The indexes were built in an earlier pass
// and then not used by browsing, which meant the app still loaded everything
// and merely paid for the indexes as well.
//
// The shape of it:
//
//   plan(query)      decide which index to start from, what that index already
//                    answers, and what is left to test per record
//   execute(plan)    walk that index with a cursor, keep a page, stop
//
// Nothing here knows about the DOM, and nothing above here knows about
// cursors. What a screen gets back is the canonical query result.

import { PAGE_SIZE, UNCATEGORIZED_ID } from './config.js';
import * as local from './local-store.js';
import { repository } from './repository.js';
import { matchesQuery, parseQuery, sortItems, sortByValuation } from './search.js';
import { normalizeItem } from './validation.js';

/** How many records one cursor batch hands over while scanning. */
const SCAN_BATCH = 400;
/** After this many records examined without filling a page, yield to the tab. */
const YIELD_EVERY = 1200;
/**
 * A residual-filtered query counts its own total only while the base range is
 * this size or smaller. Beyond it the count would cost a full walk to print a
 * number, so the result says "not known" instead and the screen pages with
 * next/previous rather than numbered pages.
 */
const COUNTABLE_SCAN = 4000;

const yieldToTab = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Records leave this module in the shape the rest of the app expects.
 *
 * What comes out of the database is what was put in, which for a record
 * written by an older version of the app is missing whatever the schema has
 * gained since. The repository normalised rows on their way out of a listener;
 * reading them here bypassed that, and the screens started seeing raw storage.
 *
 * Only the rows actually returned are normalised — a scan examines many more
 * than it keeps, and the predicates read fields that raw rows already carry.
 */
const present = (rows) => rows.map((row) => normalizeItem(row));

// ── planning ───────────────────────────────────────────────────────────────

/**
 * Which index to start from, and what is left over.
 *
 * The rule is "most selective first": an equality on a taxonomy narrows to a
 * folder's 740 records, where the sort index narrows to nothing. Whatever the
 * base index cannot answer becomes a predicate tested against the records that
 * survive it — over 740 candidates, not over 20,000.
 *
 * `baseValue` is undefined when the base index is walked whole — a sort index,
 * or the trash. The key range is built at execution time rather than here, so
 * that planning stays a pure function of the query and can be reasoned about
 * (and tested) without a database.
 *
 * @returns {{baseIndex, baseValue, direction, indexedPredicates,
 *            residualPredicates, requiresScan, sortStrategy,
 *            paginationStrategy, searching, terms}}
 */
export function plan(query) {
  const filters = query.filters || {};
  const terms = parseQuery(query.search || '');
  const searching = terms.length > 0;

  const indexedPredicates = [];
  const residualPredicates = [];

  // A search runs across the whole inventory by design — a record inside a
  // folder must be findable from the root — so it cancels the browsing scope.
  // The Trash cancels it too: it is not a place in the inventory, it is the
  // set of records that have been taken out of it.
  const browsing = !searching && !query.trashed && !filters.folderId;
  const browsingFolder = browsing ? query.folderId : null;
  const scopeRoot = browsing && !query.folderId;

  let baseIndex = null;
  let baseValue;

  const claim = (index, value, name) => {
    if (baseIndex || value == null || value === '') return false;
    baseIndex = index;
    baseValue = value;
    indexedPredicates.push(name);
    return true;
  };

  // Trash is its own scope and its own index: a trashed record carries a
  // numeric `deletedAt` and a live one carries null, and IndexedDB leaves null
  // out of an index — so the index *is* the trash.
  if (query.trashed) {
    baseIndex = 'deletedAt';
    baseValue = undefined;
    indexedPredicates.push('trashed');
  }

  claim('folderId', filters.folderId === '__root__' ? null : filters.folderId, 'filters.folderId');
  claim('folderId', browsingFolder, 'scope.folderId');
  claim('locationId', filters.locationId, 'filters.locationId');
  claim('categoryId', filters.categoryId, 'filters.categoryId');
  claim('categoryId', query.categoryId !== 'all' ? query.categoryId : null, 'pill.categoryId');
  claim('condition', filters.condition, 'filters.condition');

  // Whatever the base did not claim is tested per record.
  if (filters.folderId === '__root__' && baseIndex !== 'folderId') residualPredicates.push('rootOnly');
  if (scopeRoot) residualPredicates.push('rootOnly');
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    if (indexedPredicates.includes(`filters.${key}`)) continue;
    if (key === 'folderId' && value === '__root__') continue;
    residualPredicates.push(`filters.${key}`);
  }
  if (query.categoryId && query.categoryId !== 'all' && !indexedPredicates.includes('pill.categoryId')) {
    residualPredicates.push('pill.categoryId');
  }
  if (browsingFolder && baseIndex !== 'folderId') residualPredicates.push('scope.folderId');
  if (searching) residualPredicates.push('search');
  // Trash and browsing are opposites: everywhere but Trash, deleted records
  // are excluded, and `deletedAt` being absent from its index is what makes
  // that a cheap test rather than another index.
  if (!query.trashed) residualPredicates.push('live');

  // Sorting. `updatedAt` and `createdAt` are indexed, so those two orders come
  // out of the cursor already sorted. Name and value are not: they are sorted
  // in memory over whatever the base index returned, which is why a value sort
  // over an un-narrowed inventory is the one query here that reads all of it.
  const sortIndex = { newest: 'createdAt', oldest: 'createdAt' }[query.sort] || null;
  let sortStrategy = 'memory';
  let direction = 'next';
  if (sortIndex && !baseIndex) {
    baseIndex = sortIndex;
    baseValue = undefined;
    direction = query.sort === 'newest' ? 'prev' : 'next';
    sortStrategy = 'index';
    indexedPredicates.push(`sort:${query.sort}`);
  } else if (sortIndex && baseIndex) {
    // An equality index orders by its own key; within one folder every key is
    // identical, so the order inside it is by primary key. Ids are generated
    // with a time prefix, so that is close to creation order but not promised
    // to be it — the page is re-sorted in memory, which is cheap over a page.
    sortStrategy = 'page';
  }

  const requiresScan = !baseIndex;
  // An offset is only meaningful when every record the cursor passes belongs
  // in the answer: `advance(480)` skips records, it does not skip *matching*
  // records. So a query with nothing left to test pages by offset, and
  // everything else pages by walking — which is still bounded by the base
  // index, and still stops as soon as the page is full.
  //
  // Paging by walking does not mean giving up the total. See `cheapTotal`:
  // the common residuals — "not deleted", "not in a folder" — are countable
  // from index sizes, so the numbered pager survives them.
  const paginationStrategy = (residualPredicates.length || sortStrategy === 'memory')
    ? 'scan'
    : 'offset';

  return {
    baseIndex,
    baseValue,
    direction,
    indexedPredicates,
    residualPredicates,
    requiresScan,
    sortStrategy,
    paginationStrategy,
    searching,
    terms,
  };
}

// ── predicates ─────────────────────────────────────────────────────────────

/** The key range a plan's base index is read through. */
function rangeFor(queryPlan) {
  return queryPlan.baseValue === undefined ? null : IDBKeyRange.only(queryPlan.baseValue);
}

/** One function that answers "does this record belong in this result?". */
function predicateFor(query, queryPlan) {
  const filters = query.filters || {};
  const lookups = repository.lookups();
  const checks = [];

  for (const name of queryPlan.residualPredicates) {
    switch (name) {
      case 'live': checks.push((item) => !item.deletedAt); break;
      case 'rootOnly': checks.push((item) => !item.folderId); break;
      case 'search': checks.push((item) => matchesQuery(item, queryPlan.terms, lookups)); break;
      case 'scope.folderId': checks.push((item) => item.folderId === query.folderId); break;
      case 'pill.categoryId':
        checks.push((item) => (item.categoryId || UNCATEGORIZED_ID) === query.categoryId);
        break;
      case 'filters.condition': checks.push((item) => item.condition === filters.condition); break;
      case 'filters.folderId': checks.push((item) => item.folderId === filters.folderId); break;
      case 'filters.locationId': checks.push((item) => item.locationId === filters.locationId); break;
      case 'filters.categoryId': checks.push((item) => item.categoryId === filters.categoryId); break;
      case 'filters.ai':
        checks.push(filters.ai === 'yes' ? (item) => Boolean(item.aiData) : (item) => !item.aiData);
        break;
      case 'filters.valuation':
        checks.push(filters.valuation === 'yes' ? (item) => Boolean(item.valuation) : (item) => !item.valuation);
        break;
      case 'filters.currency':
        checks.push((item) => item.valuation?.currency === filters.currency);
        break;
      default: break;
    }
  }

  if (!checks.length) return null;
  return (item) => checks.every((check) => check(item));
}

// ── execution ──────────────────────────────────────────────────────────────

/**
 * One page of the answer.
 *
 * @param {object} query the canonical query
 * @param {{signal?: {aborted: boolean}}} [context] lets a superseded query stop
 *   walking instead of finishing work nobody will look at.
 */
export async function execute(query, context = {}) {
  const queryPlan = plan(query);
  const perPage = query.perPage || PAGE_SIZE;

  if (query.ids) return byIds(query, queryPlan, perPage);

  const predicate = predicateFor(query, queryPlan);

  if (queryPlan.paginationStrategy === 'offset') {
    return byOffset(query, queryPlan, perPage);
  }
  return byScan(query, queryPlan, predicate, perPage, context);
}

/**
 * An explicit set of ids — the assistant handing over an answer. Read by key,
 * which is the one lookup that never touches an index or a cursor.
 */
async function byIds(query, queryPlan, perPage) {
  const wanted = query.ids instanceof Set ? [...query.ids] : [...new Set(query.ids)];
  const found = (await local.getMany('items', wanted)).filter((item) => !item.deletedAt);
  const sorted = sortItems(found, query.sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, query.page || 1), totalPages);
  return {
    rows: present(sorted.slice((page - 1) * perPage, page * perPage)),
    total, page, totalPages, searching: true,
    plan: queryPlan, exhausted: true,
  };
}

/**
 * Everything this query asks for is answered by the base index, so the page is
 * an offset into it: the total is a range count, and the cursor skips to the
 * page without handing over the records it passes.
 */
async function byOffset(query, queryPlan, perPage) {
  const total = await local.countRange('items', queryPlan.baseIndex, rangeFor(queryPlan));
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageNumber = Math.min(Math.max(1, query.page || 1), totalPages);

  const { rows, nextKey, nextPrimaryKey, done } = await local.page('items', {
    index: queryPlan.baseIndex,
    range: rangeFor(queryPlan),
    direction: queryPlan.direction,
    offset: (pageNumber - 1) * perPage,
    limit: perPage,
  });

  return {
    rows: present(queryPlan.sortStrategy === 'page' ? sortItems(rows, query.sort) : rows),
    total,
    page: pageNumber,
    totalPages,
    searching: queryPlan.searching,
    cursor: done ? null : { key: nextKey, primaryKey: nextPrimaryKey },
    plan: queryPlan,
    exhausted: true,
  };
}

/**
 * The size of the answer, when it can be had from index sizes rather than by
 * reading the answer.
 *
 * Two predicates account for almost every browse: "not deleted", and — at the
 * root — "not in a folder". Neither has an index of its own, but both are
 * exactly the complement of one that does. Deleted records are precisely the
 * contents of the `deletedAt` index; filed records are precisely the contents
 * of the `folderId` index. So both are subtractions.
 *
 * The one part that has to be walked is which deleted records fall inside the
 * scope, and that walk is bounded by the Trash rather than by the inventory —
 * the Trash being, by design, the small pile a customer clears out.
 *
 * @returns {Promise<number|null>} null when the answer cannot be sized without
 *   reading it, which the result reports rather than guessing at.
 */
async function cheapTotal(query, queryPlan) {
  const residual = new Set(queryPlan.residualPredicates);
  residual.delete('live');
  const rootOnly = residual.delete('rootOnly');
  if (residual.size) return null;
  if (queryPlan.sortStrategy === 'memory') {
    // The order needs every match in hand anyway, so the walk counts them.
    return null;
  }

  const scopeIndex = queryPlan.baseValue === undefined ? null : queryPlan.baseIndex;
  const scopeRange = rangeFor(queryPlan);
  const field = scopeIndex;

  let total = await local.countRange('items', scopeIndex, scopeRange);
  if (rootOnly) {
    // Filed records are exactly the folderId index; the rest are at the root.
    total -= await local.countRange('items', 'folderId', null);
  }

  // Subtract the deleted records that fall in this scope, read from the index
  // that holds only deleted records.
  const trashed = await local.countRange('items', 'deletedAt', null);
  if (trashed > 0) {
    let inScope = 0;
    await local.walk('items', {
      index: 'deletedAt', batchSize: SCAN_BATCH,
      onBatch: (batch) => {
        for (const item of batch) {
          if (rootOnly && item.folderId) continue;
          if (field && item[field] !== queryPlan.baseValue) continue;
          inScope += 1;
        }
        return true;
      },
    });
    total -= inScope;
  }

  return Math.max(0, total);
}

/**
 * Something here the index cannot see — a search term, "has no photograph", a
 * currency — so the records that survive the base index are examined one batch
 * at a time until the page is full.
 *
 * Two things keep this honest at 20,000 records. The base index is chosen to
 * be the narrowest available, so a folder's 740 records are what gets examined
 * rather than the inventory. And the walk stops the moment the page is full:
 * it is not a filter over everything that then takes a slice.
 */
async function byScan(query, queryPlan, predicate, perPage, context) {
  const pageNumber = Math.max(1, query.page || 1);
  const wantedThrough = pageNumber * perPage;
  const needsMemorySort = queryPlan.sortStrategy === 'memory';

  const kept = [];
  let matched = 0;
  let examined = 0;
  let exhausted = true;

  await local.walk('items', {
    index: queryPlan.baseIndex,
    range: rangeFor(queryPlan),
    direction: queryPlan.direction,
    batchSize: SCAN_BATCH,
    onBatch: async (batch) => {
      if (context.signal?.aborted) { exhausted = false; return false; }
      for (const item of batch) {
        examined += 1;
        if (predicate && !predicate(item)) continue;
        matched += 1;
        // Ordering by name or by value cannot be decided one record at a time,
        // so those collect every match. Every other order comes off the index
        // already sorted, so only the requested page is held.
        if (needsMemorySort || matched <= wantedThrough) kept.push(item);
      }
      if (!needsMemorySort && matched > wantedThrough) { exhausted = false; return false; }
      // A long walk gives the tab a turn: a search over an inventory must not
      // be a frozen keyboard.
      if (examined % YIELD_EVERY < SCAN_BATCH) await yieldToTab();
      return true;
    },
  });

  if (context.signal?.aborted) return null;

  let ordered = kept;
  let valueCurrencies = [];
  let groupedByCurrency = false;
  if (needsMemorySort) {
    if (query.sort === 'value-high' || query.sort === 'value-low') {
      const sorted = sortByValuation(kept, query.sort === 'value-high' ? 1 : -1);
      ordered = sorted.rows;
      valueCurrencies = sorted.currencies;
      groupedByCurrency = sorted.mixed;
    } else {
      ordered = sortItems(kept, query.sort);
    }
  }

  // The total is exact when the walk covered the whole base range. When it
  // stopped early, the index sizes may still know it — and when they do not,
  // it is reported as unknown rather than as the number of records that
  // happen to have been examined.
  const total = exhausted ? matched : await cheapTotal(query, queryPlan);
  const totalPages = total == null ? null : Math.max(1, Math.ceil(total / perPage));
  const page = totalPages ? Math.min(pageNumber, totalPages) : pageNumber;
  const start = (page - 1) * perPage;
  const rows = present(ordered.slice(start, start + perPage));

  return {
    rows,
    total,
    page,
    totalPages,
    searching: queryPlan.searching,
    hasMore: total == null ? matched > page * perPage : page < totalPages,
    plan: queryPlan,
    exhausted,
    examined,
    valueCurrencies,
    groupedByCurrency,
  };
}

/**
 * Which categories the pill row may offer: the ones actually present in what
 * the customer is looking at.
 *
 * Scoped to a folder, this walks that folder — bounded by the folder, which is
 * the unit people organise by and is small by construction. Un-scoped, the
 * answer is every category that has any record, which is what the row showed
 * anyway. A folder large enough that walking it would be the cost this module
 * exists to avoid falls back to the same global answer rather than freezing
 * the tab to draw a row of chips.
 */
export async function scopeCategories(query) {
  const folderId = !query.search && !query.filters?.folderId ? query.folderId : null;
  if (!folderId) return null;

  const range = IDBKeyRange.only(folderId);
  const size = await local.countRange('items', 'folderId', range);
  if (size > COUNTABLE_SCAN) return null;

  const present = new Set();
  await local.walk('items', {
    index: 'folderId', range, batchSize: SCAN_BATCH,
    onBatch: (batch) => {
      for (const item of batch) if (!item.deletedAt) present.add(item.categoryId || UNCATEGORIZED_ID);
      return true;
    },
  });
  return present;
}

// ── exact identifier lookup ────────────────────────────────────────────────

/** Does this look like something stamped on an object rather than words? */
const IDENTIFIER_SHAPE = /^[0-9A-Za-z][0-9A-Za-z._/-]{3,}$/;

/**
 * A search term that is an identifier, answered by index rather than by
 * reading the inventory.
 *
 * This is the scanner's path: a barcode is scanned, and the record it belongs
 * to is one index lookup away whether it is the newest record or the ten
 * thousandth. It used to load the whole inventory first.
 *
 * @returns {Promise<Array|null>} null when the term is not identifier-shaped or
 *   nothing carries it, so the caller falls back to ordinary text search.
 */
export async function findByIdentifier(term) {
  const value = String(term || '').trim();
  if (!IDENTIFIER_SHAPE.test(value)) return null;

  for (const index of ['barcode', 'sku', 'serialNumber']) {
    const rows = await local.getAllByIndex('items', index, value);
    const live = rows.filter((row) => !row.deletedAt);
    if (live.length) return present(live);
  }
  return null;
}

// ── counts ─────────────────────────────────────────────────────────────────

/**
 * The counts the screens draw beside a folder, a category and a location.
 *
 * Counted by index range rather than by walking the records: twenty counts of
 * a few hundred each, instead of one pass over twenty thousand. `complete` is
 * true because these numbers describe the database, not a window of it.
 */
export async function counts() {
  const [categories, folders, locations, total, trashed] = await Promise.all([
    countBy('categoryId', repository.state.categories.map((c) => c.id).concat(UNCATEGORIZED_ID)),
    countBy('folderId', repository.state.folders.map((f) => f.id)),
    countBy('locationId', repository.state.locations.map((l) => l.id)),
    local.count('items'),
    local.countRange('items', 'deletedAt', null),
  ]);
  return { categories, folders, locations, live: total - trashed, trashed, complete: true };
}

async function countBy(index, ids) {
  const entries = await Promise.all(ids.map(async (id) => [
    id, await local.countRange('items', index, IDBKeyRange.only(id)),
  ]));
  return new Map(entries.filter(([, n]) => n > 0));
}

/**
 * Summary numbers for a scope.
 *
 * The record count is an index range count, so it is exact and costs nothing
 * whatever the inventory holds. The other three — total quantity, the
 * proportion photographed, how many categories are in use — have no index
 * behind them: "has at least one image" is not a stored field. So they are
 * computed by reading the scope, and only while the scope is small enough that
 * reading it is not the thing this module exists to avoid.
 *
 * Past that size they come back null, which the screens already treat as "not
 * knowable" rather than as zero — the same contract the windowed load
 * introduced, kept rather than quietly broken by a number that is cheap to
 * print and expensive to be sure of.
 */
export async function summarize(query) {
  const scopeIndex = query.folderId ? 'folderId' : null;
  const scopeRange = query.folderId ? IDBKeyRange.only(query.folderId) : null;

  const [inScope, trashed] = await Promise.all([
    local.countRange('items', scopeIndex, scopeRange),
    local.countRange('items', 'deletedAt', null),
  ]);
  const liveTotal = Math.max(0, await local.count('items') - trashed);

  const base = {
    complete: true,
    records: query.folderId ? inScope : liveTotal,
    quantity: null,
    documentedRatio: null,
    categories: null,
    folders: repository.state.folders.length,
    liveTotal,
  };
  if (inScope > COUNTABLE_SCAN) return base;

  let records = 0;
  let quantity = 0;
  let documented = 0;
  const categories = new Set();
  await local.walk('items', {
    index: scopeIndex, range: scopeRange, batchSize: SCAN_BATCH,
    onBatch: (batch) => {
      for (const item of batch) {
        if (item.deletedAt) continue;
        records += 1;
        quantity += item.quantity || 0;
        if (item.images?.length) documented += 1;
        categories.add(item.categoryId || UNCATEGORIZED_ID);
      }
      return true;
    },
  });

  return {
    ...base,
    records,
    quantity,
    documentedRatio: records ? documented / records : null,
    categories: categories.size,
  };
}
