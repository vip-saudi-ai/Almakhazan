// The query model.
//
// Everything that shows a list of records — the inventory grid, a folder, a
// category, a search, the assistant's hand-off — asks the same question:
//
//   "give me page N of the records matching this, sorted like this"
//
// This module is that question as a value, the one entry point that answers
// it, and the seam between the two. The UI builds a query and renders a
// result. It never reaches into an array of every record and filters it, which
// is the pattern that makes a 20,000-record workspace impossible to open.
//
// Answering is asynchronous, because on a device the answer comes out of
// IndexedDB through an index and a cursor — see `query-idb.js`, which is where
// the decisions about *which* index live. Nothing above this module knows that
// a cursor exists, and nothing below it knows that a screen does.

import { PAGE_SIZE, UNCATEGORIZED_ID } from './config.js';
import { repository } from './repository.js';
import * as idb from './query-idb.js';
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
    /** The Trash is a scope, not a filter: it inverts what "a record" means. */
    trashed: false,
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
    || query.trashed
    || query.ids,
  );
}

/**
 * How this query will be answered: which index it starts from, what that index
 * already decides, and what is left to test record by record.
 *
 * Re-exported from the engine rather than duplicated. There was a second
 * planner here that described what an index *could* do while the runner
 * ignored it entirely — two descriptions of one thing, one of them fiction.
 */
export const plan = idb.plan;

// ── the canonical result ────────────────────────────────────────────────────

/**
 * What every screen reads, whichever adapter answered.
 *
 *   rows                the page
 *   total               exact when the answer could be counted, else null —
 *                       null means "more than what is loaded", never zero
 *   page / totalPages   display fields; `totalPages` is null when the total is
 *   nextCursor          an opaque token for the page after this one, or null
 *   previousCursor      likewise backwards, or null on the first page
 *   hasMore             whether anything follows this page
 *   searching           whether a text search produced this
 *   complete            whether the answer covers the whole inventory
 *   answerable          false when the adapter could not get what it needed;
 *                       such a result is not an answer and must not be shown
 *   summary             scope totals (see `summarize`)
 *   scopeItems          the records the pill row is drawn from, when the
 *                       adapter holds them
 *   scopeCategories     the category ids present in this scope, when the
 *                       adapter counted them instead
 *   valueCurrencies     the currencies a value sort had to group by
 *   groupedByCurrency   whether it grouped
 *   queryKey            identity of the question this answers
 *   plan / examined     which index answered it and how many records it read
 */
function canonical(result, { query, queryKey, answerable, complete, summary }) {
  const total = result.total ?? null;
  const totalPages = result.totalPages ?? (total == null ? null : Math.max(1, Math.ceil(total / (query.perPage || PAGE_SIZE))));
  const page = result.page || 1;
  return {
    rows: result.rows || [],
    total,
    page,
    totalPages,
    nextCursor: result.nextCursor ?? encodeCursor(result.cursor, queryKey, 'next'),
    previousCursor: result.previousCursor ?? null,
    hasMore: result.hasMore ?? (totalPages == null ? Boolean(result.cursor) : page < totalPages),
    searching: Boolean(result.searching),
    complete: Boolean(complete),
    answerable: Boolean(answerable),
    summary: summary || null,
    // Either the records the pill row is drawn from (the memory adapter holds
    // them) or the set of category ids present in this scope (the device
    // engine counts them). A screen reads whichever it was given.
    scopeItems: result.scopeItems ?? [],
    scopeCategories: result.scopeCategories ?? null,
    valueCurrencies: result.valueCurrencies || [],
    groupedByCurrency: Boolean(result.groupedByCurrency),
    queryKey,
    // How the answer was reached. Not for the interface — for the tests that
    // assert a folder query reads the folder rather than the inventory, and
    // for anyone debugging why a screen is slow.
    plan: result.plan || null,
    examined: result.examined ?? null,
  };
}

/**
 * The identity of a question.
 *
 * Every property that can change the answer goes in, and nothing that cannot.
 * It is what tells a late reply that it is late, and what stops a cursor made
 * for one question being spent on another.
 */
export function queryKeyOf(query) {
  const full = { ...emptyQuery(), ...query };
  const filters = full.filters || {};
  return JSON.stringify([
    full.search || '',
    full.folderId || '',
    full.categoryId || 'all',
    full.sort || 'newest',
    full.trashed ? 1 : 0,
    full.perPage || PAGE_SIZE,
    Object.keys(filters).sort().map((key) => [key, filters[key] || '']),
    full.ids ? [...(full.ids instanceof Set ? full.ids : full.ids)].slice().sort() : null,
  ]);
}

/**
 * A cursor the UI cannot misread, because it cannot read it.
 *
 * It carries the index key and the primary key — the tiebreaker, without which
 * a bulk write's identical timestamps make resumption either repeat a page or
 * skip one — plus the question it belongs to. Spending it on a different
 * question is refused rather than answered with records from the wrong query.
 */
export function encodeCursor(position, queryKey, direction) {
  if (!position) return null;
  return btoa(unescape(encodeURIComponent(JSON.stringify({
    k: position.key ?? null, p: position.primaryKey ?? null, d: direction, q: queryKey,
  }))));
}

export function decodeCursor(token, queryKey) {
  if (!token) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(token))));
    if (queryKey && parsed.q !== queryKey) return null;
    return { key: parsed.k, primaryKey: parsed.p, direction: parsed.d };
  } catch {
    return null;
  }
}

// ── the adapter seam ────────────────────────────────────────────────────────
//
// Everything below this line answers queries. *How* one is answered is one
// object, and that object is swappable.
//
// Two ship today. `IndexedDbQueryAdapter` is the device engine: it reads the
// records it needs through an index and a cursor, and it is what makes a
// 20,000-record workspace behave like a 20,000-record workspace rather than
// like a demo that happens to still open. `MemoryQueryAdapter` answers from
// records already held, and is what the cloud backend uses until a Firestore
// adapter issues the same query server-side — the result shape is the same, so
// no screen changes when that lands.

/**
 * @typedef {object} QueryAdapter
 * @property {string} name
 * @property {(query: object) => boolean} needsEverything  must the whole
 *   inventory be in hand before this query can be answered?
 * @property {(query: object, context: object) => Promise<object>} execute
 * @property {(query: object) => Promise<object>} summarize
 * @property {() => Promise<object>} counts
 */

/** The device engine: indexes and cursors, nothing held that is not shown. */
const IndexedDbQueryAdapter = {
  name: 'indexeddb',
  // Nothing. Every query it can be asked is answered from the database, which
  // is the whole point of it.
  needsEverything: () => false,
  execute: (query, context) => idb.execute(query, context),
  summarize: (query) => idb.summarize(query),
  counts: () => idb.counts(),
  scopeCategories: (query) => idb.scopeCategories(query),
};

/**
 * Answers from records already loaded. Used by the cloud backend, where the
 * records live on a server and the device holds a window of them — so a
 * narrowed question still has to fetch the rest before it can be answered
 * honestly, and says so when it cannot.
 */
const MemoryQueryAdapter = {
  name: 'memory',
  needsEverything: (query) => isNarrowed(query),
  execute: async (query) => runInMemory(query),
  summarize: async (query) => summarizeInMemory(query),
  counts: async () => countsInMemory(),
  // The records are in hand, so the scope is derived from them directly.
  scopeCategories: async () => null,
};

let adapter = MemoryQueryAdapter;

/**
 * Swaps the adapter. Called once when a session starts, with the engine that
 * matches where the records actually are.
 */
export function useQueryAdapter(next) {
  if (next === 'indexeddb') { adapter = IndexedDbQueryAdapter; return; }
  if (next === 'memory' || !next) { adapter = MemoryQueryAdapter; return; }
  adapter = next;
}

export function currentAdapter() {
  return adapter.name;
}

/**
 * The one entry point. Every list in the app comes through here.
 *
 * @param {object} query
 * @param {{ensure?: Function, signal?: {aborted: boolean}, cursor?: string}} [options]
 *   `ensure` loads whatever an adapter says it needs and returns whether it
 *   could. `signal` lets a superseded query stop early.
 * @returns {Promise<object>} the canonical result, or null when the query was
 *   aborted before it finished.
 */
export async function queryInventory(query, options = {}) {
  const full = { ...emptyQuery(), ...query };
  const queryKey = queryKeyOf(full);
  const answerable = await ensureFor(full, options.ensure);
  if (options.signal?.aborted) return null;

  // A search term that is an identifier is answered by the index that holds
  // it, before anything is read. This is the scanner's path and the path of
  // anyone who types a serial number: the record is one lookup away whether it
  // is the newest or the ten thousandth.
  const exact = full.search && !full.ids ? await findByIdentifier(full.search) : null;
  if (options.signal?.aborted) return null;
  if (exact?.length) {
    return canonical(
      { rows: exact, total: exact.length, page: 1, totalPages: 1, searching: true, exact: true },
      { query: full, queryKey, answerable: true, complete: true, summary: await adapter.summarize(full) },
    );
  }

  const position = decodeCursor(options.cursor, queryKey);
  const result = await adapter.execute(position ? { ...full, cursor: position } : full, options);
  if (!result || options.signal?.aborted) return null;

  const [summary, scopeCategories] = await Promise.all([
    adapter.summarize(full),
    adapter.scopeCategories?.(full) ?? null,
  ]);
  if (options.signal?.aborted) return null;

  return canonical({ ...result, scopeCategories }, {
    query: full,
    queryKey,
    answerable,
    complete: answerable && (adapter.name === 'indexeddb' || repository.itemsComplete),
    summary,
  });
}

/**
 * Loads whatever this adapter needs before the query can be answered.
 *
 * The device engine needs nothing — it reads what it needs. The memory adapter
 * needs the records, and when it cannot get them the result comes back
 * unanswerable rather than computed from a fraction, because a filter applied
 * to part of an inventory answers confidently and wrongly.
 */
async function ensureFor(query, ensure) {
  if (!adapter.needsEverything(query)) return true;
  if (repository.itemsComplete) return true;
  return ensure ? ensure() : false;
}

/**
 * An identifier typed or scanned, answered by index.
 *
 * Returns null when the term is not identifier-shaped or nothing carries it,
 * which is the caller's signal to run an ordinary search instead.
 */
export async function findByIdentifier(term) {
  if (adapter.name !== 'indexeddb') {
    // The memory adapter can only look at what it holds, so an exact lookup is
    // no cheaper than a search and is left to the search path.
    return null;
  }
  return idb.findByIdentifier(term);
}

// ── the in-memory implementation ────────────────────────────────────────────

function runInMemory(query) {
  let { results, searching, valueCurrencies, groupedByCurrency } = queryItems({
    items: repository.state.items,
    query: query.search,
    filters: query.filters,
    sortMode: query.sort,
    scope: { folderId: query.folderId },
    categoryPill: query.categoryId,
    lookups: repository.lookups(),
  });

  if (query.trashed) results = repository.trashedItems();

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

function summarizeInMemory(query = emptyQuery()) {
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
    liveTotal: complete ? live.length : total,
  };
}

function countsInMemory() {
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

/**
 * Category, folder and location counts for the screens that draw them beside a
 * name. Asynchronous because the device engine counts by index range rather
 * than by walking records.
 */
export function inventoryCounts() {
  return adapter.counts();
}

/** The terms a search would look for; exported so callers need not re-parse. */
export function searchTerms(query) {
  return parseQuery(query.search || '');
}
