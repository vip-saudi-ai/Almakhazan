// The query model.
//
// Everything that shows a list of records — the inventory grid, a folder, a
// category, a search, the assistant's hand-off — asks the same question:
//
//   "give me page N of the records matching this, sorted like this"
//
// This module is that question, as a value, plus the runner that answers it.
// The UI builds a query and renders a result. It does not reach into an array
// of every record and filter it, which is the pattern that makes a 20,000
// record workspace impossible to open.
//
// Today the runner answers locally, because the data is local. That is an
// implementation detail *of the runner*: a query carries everything a server
// would need (scope, equality filters, a sort key, a page), so replacing the
// body of `runQuery` with a Firestore query changes no caller.
//
// What a server could not answer is stated rather than hidden. `plan()` says,
// for any query, which parts are index-shaped and which need the records
// themselves — free-text search being the honest exception, because Firestore
// has no full-text index and pretending otherwise would be the fake feature
// this codebase keeps refusing to ship.

import { PAGE_SIZE, UNCATEGORIZED_ID } from './config.js';
import { repository } from './repository.js';
import {
  EMPTY_FILTERS, activeFilterCount, clampPage, parseQuery, queryItems,
} from './search.js';

export { EMPTY_FILTERS, activeFilterCount };

/** A query with nothing asked of it: page one of everything, newest first. */
export function emptyQuery() {
  return {
    search: '',
    folderId: null,       // browsing scope
    categoryId: 'all',    // the pill row
    filters: { ...EMPTY_FILTERS },
    sort: 'newest',
    page: 1,
    perPage: PAGE_SIZE,
    /** An explicit set of ids, when the assistant hands over an answer. */
    ids: null,
  };
}

/** True when the query asks for anything beyond "the newest, page one". */
export function isNarrowed(query) {
  // Boolean() wraps the whole expression, not just the first term: the last
  // operands are a folder id and an id set, so an un-narrowed query would
  // otherwise report `null` rather than `false` — truthy-correct, and wrong
  // for anything that compares it.
  return Boolean(
    query.search
    || query.categoryId !== 'all'
    || activeFilterCount(query.filters) > 0
    || query.sort !== 'newest'
    || query.folderId
    || query.ids,
  );
}

/**
 * What answering this query needs.
 *
 * @returns {{ indexable: string[], needsRecords: string[], needsWholeInventory: boolean }}
 *   `indexable` — parts a database index can answer on its own.
 *   `needsRecords` — parts that need the records in hand.
 *   `needsWholeInventory` — whether this query, today, cannot be answered from
 *   the live window alone. This is the honest signal the UI uses to decide
 *   whether to load the rest; it is not a guess.
 */
export function plan(query) {
  const indexable = [];
  const needsRecords = [];

  if (query.folderId) indexable.push('folderId');
  if (query.categoryId && query.categoryId !== 'all') indexable.push('categoryId');
  for (const [key, value] of Object.entries(query.filters || {})) {
    if (!value) continue;
    // Equality on a stored field is an index lookup. A derived condition —
    // "has no image", "valued above" — is not, unless the field is
    // denormalised for it, which it is not.
    if (['folderId', 'locationId', 'categoryId', 'condition'].includes(key)) indexable.push(key);
    else needsRecords.push(key);
  }
  if (query.sort) indexable.push(`sort:${query.sort}`);
  if (query.search) needsRecords.push('search');
  if (query.ids) needsRecords.push('ids');

  return {
    indexable,
    needsRecords,
    // Anything narrower than "newest, page one, this folder" is answered
    // against the whole set today.
    needsWholeInventory: isNarrowed(query),
  };
}

// ── the adapter seam ────────────────────────────────────────────────────────
//
// Everything below this line answers queries. *How* it answers them is one
// object, and that object is swappable.
//
// `LocalQueryAdapter` is what ships today: the records are on the device, so
// it answers from them. A `RemoteQueryAdapter` would issue a Firestore query
// with the same shape and return the same result model — `items`, `total`,
// `nextCursor`, `summary`, `complete` — and no screen would change, because
// no screen reaches past `queryInventory`.
//
// The adapter also declares what it can answer without holding every record.
// The local one is honest about the answer being "not much": it has the
// records or it does not. That is a property of *this* adapter, not of the
// UI, which is exactly the separation this seam exists to make.

/**
 * The interface an adapter implements.
 *
 * @typedef {object} QueryAdapter
 * @property {string} name
 * @property {(query: object) => boolean} needsEverything  can this query be
 *   answered from what is already held?
 * @property {(query: object) => object} run  one page of results
 * @property {() => object} counts  category/folder/location counts
 */

/** Answers from records already on the device. */
const LocalQueryAdapter = {
  name: 'local',
  // A local adapter has no index. Anything narrower than "the newest, first
  // page" is answered by walking the records, so it needs the records.
  needsEverything: (query) => isNarrowed(query),
  run: (query) => runLocal(query),
  counts: () => localCounts(),
};

let adapter = LocalQueryAdapter;

/** Swaps the adapter. The UI is not told, because the UI does not care. */
export function useQueryAdapter(next) {
  adapter = next || LocalQueryAdapter;
}

export function currentAdapter() {
  return adapter.name;
}

/**
 * The one entry point. Ensures what the adapter needs, then answers.
 *
 * @returns {Promise<{items: Array, total: number, nextCursor: ?string,
 *                    summary: object, complete: boolean}>}
 */
export async function queryInventory(query, { ensure } = {}) {
  const full = { ...emptyQuery(), ...query };
  const ready = await ensureFor(full, ensure);
  const page = adapter.run(full);
  return {
    items: page.rows,
    total: page.total,
    // Page numbers are what the local adapter has; a cursor is what a remote
    // one would return. Both travel under the same name so the UI's
    // "there is more" test does not change when the adapter does.
    nextCursor: page.page < page.totalPages ? String(page.page + 1) : null,
    summary: summarize(full),
    complete: ready && repository.itemsComplete,
    page: page.page,
    totalPages: page.totalPages,
    searching: page.searching,
    scopeItems: page.scopeItems,
    valueCurrencies: page.valueCurrencies || [],
    groupedByCurrency: Boolean(page.groupedByCurrency),
  };
}

/**
 * Makes sure this query *can* be answered, loading whatever it needs.
 *
 * Separate from running it, and asynchronous, because rendering is not: a
 * screen draws from data it already has. This is the step that happens when
 * the customer narrows — taps a filter, types a search — and it is allowed to
 * take time and show a progress state. Running is then instant.
 *
 * @returns {Promise<boolean>} false when the data could not be loaded. The
 *   caller must not narrow on a partial set and present the result as whole.
 */
export async function ensureFor(query, ensure) {
  if (!adapter.needsEverything(query)) return true;
  if (repository.itemsComplete) return true;
  return ensure ? ensure() : false;
}

/**
 * Runs a query and returns one page. Synchronous by design — see `ensureFor`.
 *
 * @returns {{rows: Array, total: number, page: number, totalPages: number,
 *            searching: boolean, scopeItems: Array, complete: boolean}}
 *   `scopeItems` is the set the category pills are drawn from — what is
 *   reachable in this scope, which is not the same as what is on this page.
 *   `complete` says whether the answer covers the whole inventory.
 */
export function runQuery(query) {
  return { ...runLocal(query), complete: repository.itemsComplete };
}

/** The local implementation. One day this is the `else` branch of a fetch. */
function runLocal(query) {
  let { results, searching, valueCurrencies, groupedByCurrency } = queryItems({
    items: repository.state.items,
    query: query.search,
    filters: query.filters,
    sortMode: query.sort,
    scope: { folderId: query.folderId },
    categoryPill: query.categoryId,
    lookups: repository.lookups(),
  });

  if (query.ids) {
    const wanted = query.ids instanceof Set ? query.ids : new Set(query.ids);
    results = repository.liveItems().filter((item) => wanted.has(item.id));
    searching = true;
  }

  const total = results.length;
  const perPage = query.perPage || PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = clampPage(query.page, total, perPage);

  return {
    rows: results.slice((page - 1) * perPage, page * perPage),
    total,
    page,
    totalPages,
    searching,
    scopeItems: scopeFor(query, searching),
    // "Sorted by value" across several currencies is really "sorted by value
    // within each currency". The result says which, so the screen can too.
    valueCurrencies: valueCurrencies || [],
    groupedByCurrency: Boolean(groupedByCurrency),
  };
}

/** What the pill row may offer: everything reachable in this scope. */
function scopeFor(query, searching) {
  const live = repository.liveItems();
  if (searching || query.ids) return live;
  return query.folderId
    ? live.filter((i) => i.folderId === query.folderId)
    : live.filter((i) => !i.folderId);
}

/**
 * Summary numbers for a scope.
 *
 * Returned as a model rather than computed at the call site, so the day these
 * come from maintained counters instead of an array, only this function
 * changes. `complete` says whether the numbers describe the whole inventory —
 * a screen showing a proportion has to know.
 */
export function summarize(query = emptyQuery()) {
  const live = repository.liveItems();
  const scope = query.folderId ? live.filter((i) => i.folderId === query.folderId) : live;
  const { total, complete } = repository.loadState();

  const documented = scope.filter((i) => i.images?.length).length;
  const categories = new Set(scope.map((i) => i.categoryId || UNCATEGORIZED_ID)).size;

  return {
    complete,
    records: complete ? scope.length : total,
    quantity: complete ? scope.reduce((sum, i) => sum + (i.quantity || 0), 0) : null,
    documentedRatio: complete && scope.length ? documented / scope.length : null,
    categories: complete ? categories : null,
    folders: repository.state.folders.length,
  };
}

/**
 * Every count a screen needs, from one pass over the records.
 *
 * Categories, folders and locations were each counted by filtering the whole
 * array once per entry — `categories.map(c => items.filter(...))`, which is
 * categories × items. Twenty categories over five thousand records is a
 * hundred thousand comparisons to draw twenty numbers, repeated on every
 * render. This walks the records once and hands back three maps.
 *
 * `complete` travels with the counts, because a count taken from a window is
 * a fraction and the screen has to know not to print it as a total.
 *
 * @returns {{categories: Map, folders: Map, locations: Map,
 *            live: number, trashed: number, complete: boolean}}
 */
export function inventoryCounts() {
  return adapter.counts();
}

function localCounts() {
  const categories = new Map();
  const folders = new Map();
  const locations = new Map();
  let live = 0;
  let trashed = 0;

  for (const item of repository.state.items) {
    if (item.deletedAt) { trashed += 1; continue; }
    live += 1;
    const category = item.categoryId || UNCATEGORIZED_ID;
    categories.set(category, (categories.get(category) || 0) + 1);
    if (item.folderId) folders.set(item.folderId, (folders.get(item.folderId) || 0) + 1);
    if (item.locationId) locations.set(item.locationId, (locations.get(item.locationId) || 0) + 1);
  }

  return { categories, folders, locations, live, trashed, complete: repository.itemsComplete };
}

/** The terms a search would look for; exported so callers need not re-parse. */
export function searchTerms(query) {
  return parseQuery(query.search || '');
}
