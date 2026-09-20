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
  if (!plan(query).needsWholeInventory) return true;
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
  let { results, searching } = queryItems({
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

/** The terms a search would look for; exported so callers need not re-parse. */
export function searchTerms(query) {
  return parseQuery(query.search || '');
}
