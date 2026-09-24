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

/**
 * The largest batch a scan reads at once.
 *
 * A scan starts much smaller than this and grows. Filling a 24-row page out of
 * an inventory where almost everything matches needs about 24 records, and
 * reading 400 to find them is sixteen times the deserialisation for the same
 * answer — which showed up as a 30ms first page at 20,000 records where the
 * work itself was a millisecond. The batch grows when the predicate turns out
 * to be selective, so a rare match still gets read in useful chunks.
 */
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

  // Chronological orders come out of an index. Anything else is decided by
  // comparing records, which no index here can do.
  const chronological = query.sort === 'newest' || query.sort === 'oldest';
  const direction = query.sort === 'oldest' ? 'next' : 'prev';

  // The narrowest equality this query asks for, in order of selectivity. Only
  // one can be the base; the rest become tests applied to what it returns.
  const candidates = [
    ['folderId', filters.folderId === '__root__' ? null : filters.folderId, 'filters.folderId'],
    ['folderId', browsingFolder, 'scope.folderId'],
    ['locationId', filters.locationId, 'filters.locationId'],
    ['categoryId', filters.categoryId, 'filters.categoryId'],
    ['categoryId', query.categoryId !== 'all' ? query.categoryId : null, 'pill.categoryId'],
    ['condition', filters.condition, 'filters.condition'],
  ];
  const scope = candidates.find(([, value]) => value != null && value !== '') || null;

  let baseIndex = null;
  let baseValue;
  let baseKind = 'only';
  let sortStrategy = 'memory';

  if (query.trashed) {
    // The Trash is its own scope and its own index: a trashed record carries a
    // numeric `deletedAt` and a live one carries null, and IndexedDB leaves
    // null out of an index — so the index *is* the trash. It is also already
    // in the order the screen means by "newest": most recently deleted first.
    baseIndex = 'deletedAt';
    baseValue = undefined;
    indexedPredicates.push('trashed');
    if (chronological) {
      sortStrategy = 'index';
      indexedPredicates.push(`sort:${query.sort}:deletedAt`);
    }
  } else if (scope && chronological && SCOPE_TIME_INDEX[scope[0]]) {
    // Scope and order in one index, so the cursor produces the answer in the
    // order that was asked for — globally, not within a page.
    baseIndex = SCOPE_TIME_INDEX[scope[0]];
    baseValue = scope[1];
    baseKind = 'prefix';
    sortStrategy = 'index';
    indexedPredicates.push(scope[2], `sort:${query.sort}`);
  } else if (scope && !chronological) {
    // Name or value order has no index at all, so the base is chosen purely
    // for selectivity and the order is decided over what it returns.
    baseIndex = scope[0];
    baseValue = scope[1];
    indexedPredicates.push(scope[2]);
  } else if (chronological) {
    // Either no scope, or a scope with no compound index behind it (today,
    // `condition`). The order is what must be right, so the time index is the
    // base and the scope becomes a test — correct, and bounded by how common
    // the scope's value is.
    baseIndex = 'createdAt';
    baseValue = undefined;
    sortStrategy = 'index';
    indexedPredicates.push(`sort:${query.sort}`);
  }

  // Whatever the base did not claim is tested per record.
  const claimed = new Set(indexedPredicates);
  // "No folder" can mean two different things, and they are kept as two
  // predicates because a search treats them differently:
  //
  //   scope.root    the customer is browsing the top of the inventory. That is
  //                 where they are, not a restriction they asked for, and a
  //                 search is meant to reach past it into folders.
  //   filters.root  the customer chose «المخزون الرئيسي» in the filter sheet.
  //                 That is a restriction, and it holds during a search too.
  //
  // Both test the same thing. What differs is whether a search may drop it,
  // and that is decided by the name alone — see `exactPredicate`.
  if (filters.folderId === '__root__') residualPredicates.push('filters.root');
  else if (scopeRoot) residualPredicates.push('scope.root');
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    if (claimed.has(`filters.${key}`)) continue;
    if (key === 'folderId' && value === '__root__') continue;
    residualPredicates.push(`filters.${key}`);
  }
  if (query.categoryId && query.categoryId !== 'all' && !claimed.has('pill.categoryId')) {
    residualPredicates.push('pill.categoryId');
  }
  if (browsingFolder && !claimed.has('scope.folderId')) residualPredicates.push('scope.folderId');
  if (searching) residualPredicates.push('search');
  // Trash and browsing are opposites: everywhere but Trash, deleted records
  // are excluded, and `deletedAt` being absent from its index is what makes
  // that a cheap test rather than another index.
  if (!query.trashed) residualPredicates.push('live');

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
    baseKind,
    direction: sortStrategy === 'index' ? direction : 'next',
    indexedPredicates,
    residualPredicates,
    requiresScan,
    sortStrategy,
    paginationStrategy,
    searching,
    terms,
  };
}

/** The scopes that carry their own chronological index. */
const SCOPE_TIME_INDEX = {
  folderId: 'folderCreatedAt',
  categoryId: 'categoryCreatedAt',
  locationId: 'locationCreatedAt',
};

/** And back: which record field a base index is an equality on. */
const SCOPE_FIELD = {
  folderCreatedAt: 'folderId',
  categoryCreatedAt: 'categoryId',
  locationCreatedAt: 'locationId',
};

/**
 * The key a record has in an index — the value a cursor would be positioned
 * on. A compound index's key is the array of its components, which is what a
 * cursor resumed from this record has to be given.
 */
function indexKeyOf(item, indexName) {
  const scopeField = SCOPE_FIELD[indexName];
  if (scopeField) return [item[scopeField], item.createdAt];
  return item[indexName];
}

// ── predicates ─────────────────────────────────────────────────────────────

/**
 * The key range a plan's base index is read through.
 *
 * A compound `[scope, createdAt]` index is read as a prefix: every key that
 * starts with the scope value, whatever time follows it. `[value]` sorts
 * before `[value, anything]`, and an array sorts after any number, so
 * `[value, []]` is above every `[value, someTime]` — which is how a prefix
 * range is spelled in IndexedDB.
 */
function rangeFor(queryPlan) {
  if (queryPlan.baseValue === undefined) return null;
  if (queryPlan.baseKind === 'prefix') {
    return IDBKeyRange.bound([queryPlan.baseValue], [queryPlan.baseValue, []]);
  }
  return IDBKeyRange.only(queryPlan.baseValue);
}

/**
 * The predicate an exact-identifier result has to survive.
 *
 * The fast path is an optimisation, and an optimisation that changes the
 * answer is a bug wearing a performance badge. Scanning a SKU while a location
 * filter is on must not produce a record from the other warehouse.
 *
 * So the same predicate is built, from the same plan, minus the two things the
 * lookup has already decided: the identifier itself (the index matched it) and
 * the browsing scope (a search deliberately reaches across folders — a record
 * filed away must be findable from the root, which is the established
 * behaviour and is not changed here). Every *explicit* restriction stays:
 * location, category, condition, the analysis and valuation filters, currency,
 * and the category pill.
 */
export function exactPredicate(query) {
  const full = { ...query, search: '' };
  const queryPlan = plan(full);
  // The base index took one of the restrictions; put it back as a test, since
  // here there is no cursor to have applied it.
  const residual = [...queryPlan.residualPredicates];
  for (const claimed of queryPlan.indexedPredicates) {
    if (claimed.startsWith('filters.') || claimed === 'pill.categoryId') residual.push(claimed);
  }
  // The browsing scope is not an explicit restriction, and a search is meant
  // to cross it. Everything under `filters.` was chosen, and stays.
  const explicit = residual.filter((name) => !name.startsWith('scope.'));
  return predicateFor(full, { ...queryPlan, residualPredicates: explicit });
}

/** One function that answers "does this record belong in this result?". */
function predicateFor(query, queryPlan) {
  const filters = query.filters || {};
  const lookups = repository.lookups();
  const checks = [];

  for (const name of queryPlan.residualPredicates) {
    switch (name) {
      case 'live': checks.push((item) => !item.deletedAt); break;
      case 'scope.root':
      case 'filters.root': checks.push((item) => !item.folderId); break;
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
    // No re-sorting here, ever. This branch runs only when the base index
    // already produced the requested order — that is what `paginationStrategy:
    // 'offset'` means. Sorting a page would be sorting 24 records out of 740
    // and calling the result "the newest": internally ordered, globally wrong.
    rows: present(rows),
    total,
    page: pageNumber,
    totalPages,
    searching: queryPlan.searching,
    cursor: done ? null : { key: nextKey, primaryKey: nextPrimaryKey },
    plan: queryPlan,
    exhausted: true,
    // An offset page reads exactly the page: `advance` skips inside the engine.
    examined: rows.length,
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
  // Either kind of "no folder" is the same count; which one it was only
  // matters to a search.
  const rootOnly = [residual.delete('scope.root'), residual.delete('filters.root')].some(Boolean);
  if (residual.size) return null;
  // Ordering by name or value needs every match in hand anyway, so the walk
  // that produces the page counts them and this is not needed.
  if (queryPlan.sortStrategy === 'memory') return null;

  const scopeIndex = queryPlan.baseValue === undefined ? null : queryPlan.baseIndex;
  const scopeRange = rangeFor(queryPlan);
  const scopeSize = await local.countRange('items', scopeIndex, scopeRange);

  if (scopeIndex) {
    // A bounded scope — one folder, one category, one location, one condition.
    // Counting what is deleted or unfiled *within* it cannot be done by
    // subtracting whole-index sizes: the `folderId` index counts every filed
    // record in the workspace, not the filed ones inside this category, and
    // subtracting it produced a negative that clamped to nought.
    //
    // So the scope is walked, and only while walking it is cheaper than the
    // thing this module exists to avoid.
    if (!rootOnly) {
      const trashed = await countTrashedIn(queryPlan, false);
      return Math.max(0, scopeSize - trashed);
    }
    if (scopeSize > COUNTABLE_SCAN) return null;
    let n = 0;
    await local.walk('items', {
      index: scopeIndex, range: scopeRange, batchSize: SCAN_BATCH,
      onBatch: (batch) => {
        for (const item of batch) if (!item.deletedAt && !item.folderId) n += 1;
        return true;
      },
    });
    return n;
  }

  // The whole store. Here the complements really are whole indexes: filed
  // records are exactly the `folderId` index, deleted records are exactly the
  // `deletedAt` index, so both are subtractions and neither is a walk.
  let total = scopeSize;
  if (rootOnly) total -= await local.countRange('items', 'folderId', null);
  total -= await countTrashedIn(queryPlan, rootOnly);
  return Math.max(0, total);
}

/**
 * How many deleted records fall inside a scope.
 *
 * Read from the index that holds only deleted records, so the walk is bounded
 * by the Trash — the small pile a customer clears out — rather than by the
 * inventory.
 */
async function countTrashedIn(queryPlan, rootOnly) {
  const trashed = await local.countRange('items', 'deletedAt', null);
  if (trashed === 0) return 0;
  const field = queryPlan.baseValue === undefined
    ? null
    : (SCOPE_FIELD[queryPlan.baseIndex] || queryPlan.baseIndex);
  if (!field && !rootOnly) return trashed;

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
  return inScope;
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
  // A cursor means "carry on from here", so the walk starts there and this is
  // the next page rather than the nth. Without one the walk starts at the
  // beginning and skips forward, which is what a jump to a numbered page is.
  const resuming = Boolean(query.cursor) && !needsFullOrder(queryPlan);
  const pageNumber = Math.max(1, query.page || 1);
  const wantedThrough = resuming ? perPage : pageNumber * perPage;
  const needsMemorySort = queryPlan.sortStrategy === 'memory';

  const kept = [];
  let matched = 0;
  let examined = 0;
  let exhausted = true;
  // Enough for the page if most records match, and growing when they do not.
  let batchSize = needsMemorySort ? SCAN_BATCH : Math.min(SCAN_BATCH, Math.max(64, wantedThrough + 8));
  let sinceYield = 0;

  await local.walk('items', {
    index: queryPlan.baseIndex,
    range: rangeFor(queryPlan),
    direction: queryPlan.direction,
    after: resuming ? query.cursor.key : undefined,
    afterPrimary: resuming ? query.cursor.primaryKey : undefined,
    batchSize: () => batchSize,
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
      // Few matches in that batch means the predicate is selective, so read
      // more per turn rather than paying transaction overhead per handful.
      batchSize = Math.min(SCAN_BATCH, batchSize * 4);
      // A long walk gives the tab a turn: a search over an inventory must not
      // be a frozen keyboard.
      sinceYield += batch.length;
      if (sinceYield >= YIELD_EVERY) { sinceYield = 0; await yieldToTab(); }
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
  const page = resuming
    ? pageNumber
    : (totalPages ? Math.min(pageNumber, totalPages) : pageNumber);
  const start = resuming ? 0 : (page - 1) * perPage;
  const window = ordered.slice(start, start + perPage);
  const rows = present(window);

  // Where this page ended, so the next one can start after it rather than
  // walking from the beginning again. Taken from the last row's own fields,
  // which is exactly what the index key and the primary key are.
  const last = window[window.length - 1];
  const cursor = last && queryPlan.baseIndex && !needsMemorySort
    ? { key: indexKeyOf(last, queryPlan.baseIndex), primaryKey: last.id }
    : null;

  return {
    rows,
    total,
    page,
    totalPages,
    searching: queryPlan.searching,
    hasMore: total == null
      ? (resuming ? !exhausted || matched > window.length : matched > page * perPage)
      : page < totalPages,
    cursor,
    plan: queryPlan,
    exhausted,
    examined,
    valueCurrencies,
    groupedByCurrency,
  };
}

/** Orders that cannot be produced by walking an index, so a cursor into that
 *  index would not describe a position in the answer. */
function needsFullOrder(queryPlan) {
  return queryPlan.sortStrategy === 'memory';
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
export async function findByIdentifier(term, query = null) {
  const value = String(term || '').trim();
  if (!IDENTIFIER_SHAPE.test(value)) return null;

  // The restrictions the customer has explicitly set. Built from the same plan
  // the ordinary path would use, so the two cannot drift apart — see
  // `exactPredicate`.
  const survives = query ? exactPredicate(query) : null;

  for (const index of ['barcode', 'sku', 'serialNumber']) {
    const rows = await local.getAllByIndex('items', index, value);
    // A deleted record is never an exact match outside the Trash: the customer
    // threw it away, and handing it back because its barcode still exists is
    // the opposite of what they asked for.
    const live = rows.filter((row) => !row.deletedAt && (!survives || survives(row)));
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

  // Two counts, not three: the un-scoped count *is* the store count.
  const [storeTotal, trashed] = await Promise.all([
    local.countRange('items', null, null),
    local.countRange('items', 'deletedAt', null),
  ]);
  const inScope = scopeIndex ? await local.countRange('items', scopeIndex, scopeRange) : storeTotal;
  const liveTotal = Math.max(0, storeTotal - trashed);

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
