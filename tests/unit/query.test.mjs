import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyQuery, isNarrowed, plan, queryKeyOf, encodeCursor, decodeCursor } from '../../src/query.js';

// The property under test is not "queries return the right rows" — the search
// and integrity suites cover that. It is that the planner makes predictable,
// inspectable choices: which index it starts from, what that index already
// decides, and what is left to test record by record. A plan that claims an
// index it does not use is worse than no plan, because it reads as a promise.

// ── choosing a base index ──────────────────────────────────────────────────

test('the default browse starts from the createdAt index, newest first', () => {
  const p = plan(emptyQuery());
  assert.equal(p.baseIndex, 'createdAt');
  assert.equal(p.direction, 'prev');
  assert.equal(p.sortStrategy, 'index');
  assert.equal(p.requiresScan, false);
});

test('a folder scope starts from the folderId index, not from the sort', () => {
  // Selectivity decides: a folder narrows to its own records, where the sort
  // index narrows to nothing at all.
  const p = plan({ ...emptyQuery(), folderId: 'f1' });
  assert.equal(p.baseIndex, 'folderId');
  assert.equal(p.baseValue, 'f1');
  assert.ok(p.indexedPredicates.includes('scope.folderId'));
  assert.equal(p.residualPredicates.includes('scope.folderId'), false);
});

test('a category pill starts from the categoryId index', () => {
  const p = plan({ ...emptyQuery(), categoryId: 'c9' });
  assert.equal(p.baseIndex, 'categoryId');
  assert.equal(p.baseValue, 'c9');
});

test('a location filter starts from the locationId index', () => {
  const p = plan({ ...emptyQuery(), filters: { ...emptyQuery().filters, locationId: 'l3' } });
  assert.equal(p.baseIndex, 'locationId');
  assert.equal(p.baseValue, 'l3');
});

test('a condition filter starts from the condition index', () => {
  const p = plan({ ...emptyQuery(), filters: { ...emptyQuery().filters, condition: 'ممتازة' } });
  assert.equal(p.baseIndex, 'condition');
  assert.equal(p.baseValue, 'ممتازة');
});

test('the Trash is the deletedAt index, which holds exactly the deleted records', () => {
  const p = plan({ ...emptyQuery(), trashed: true });
  assert.equal(p.baseIndex, 'deletedAt');
  assert.equal(p.baseValue, undefined);
  // And "not deleted" is not tested, because in this scope it would be wrong.
  assert.equal(p.residualPredicates.includes('live'), false);
});

test('everywhere but the Trash, deleted records are excluded', () => {
  assert.ok(plan(emptyQuery()).residualPredicates.includes('live'));
  assert.ok(plan({ ...emptyQuery(), folderId: 'f1' }).residualPredicates.includes('live'));
});

// ── what the index cannot decide ───────────────────────────────────────────

test('a folder plus a condition uses the folder index and tests the condition', () => {
  // Only one of them can be the base. The narrower one is, and the other
  // becomes a test applied to the folder's records rather than to all of them.
  const p = plan({
    ...emptyQuery(), folderId: 'f1',
    filters: { ...emptyQuery().filters, condition: 'ممتازة' },
  });
  assert.equal(p.baseIndex, 'folderId');
  assert.ok(p.residualPredicates.includes('filters.condition'));
});

test('free-text search is named as the part no index can answer', () => {
  const p = plan({ ...emptyQuery(), search: 'خاتم' });
  assert.ok(p.residualPredicates.includes('search'));
  assert.equal(p.searching, true);
  assert.deepEqual(p.terms, ['خاتم']);
});

test('a search runs across the whole inventory, so it cancels the browsing scope', () => {
  // A record inside a folder has to be findable from the root, which means the
  // folder cannot be the base index while a search is running.
  const p = plan({ ...emptyQuery(), folderId: 'f1', search: 'ساعة' });
  assert.notEqual(p.baseIndex, 'folderId');
  assert.equal(p.residualPredicates.includes('scope.folderId'), false);
});

test('derived filters have no index and are named as tests', () => {
  for (const [key, value] of [['ai', 'yes'], ['valuation', 'no'], ['currency', 'AED']]) {
    const p = plan({ ...emptyQuery(), filters: { ...emptyQuery().filters, [key]: value } });
    assert.ok(p.residualPredicates.includes(`filters.${key}`), key);
  }
});

test('browsing the root is a test, because null is not in an index', () => {
  // IndexedDB leaves a null key out of its index entirely, which is what makes
  // the folderId index exactly the filed records — and what stops it from
  // answering "the unfiled ones".
  assert.ok(plan(emptyQuery()).residualPredicates.includes('rootOnly'));
});

// ── pagination strategy ────────────────────────────────────────────────────

test('an answer the base index defines completely can be paged by offset', () => {
  // The Trash is the one scope where the index holds exactly the answer and
  // nothing has to be tested, so an offset into it means what it says.
  assert.equal(plan({ ...emptyQuery(), trashed: true }).paginationStrategy, 'offset');
  // Everywhere else "not deleted" still has to be tested, and `advance` skips
  // records rather than skipping matches — so those page by walking.
  assert.equal(plan({ ...emptyQuery(), folderId: 'f1' }).paginationStrategy, 'scan');
});

test('anything the index cannot see pages by walking instead', () => {
  const p = plan({ ...emptyQuery(), search: 'ساعة' });
  assert.equal(p.paginationStrategy, 'scan');
});

test('sorting by value has no index, and the plan says so rather than pretending', () => {
  const p = plan({ ...emptyQuery(), folderId: 'f1', sort: 'value-high' });
  assert.equal(p.sortStrategy, 'memory');
  assert.equal(p.paginationStrategy, 'scan');
});

// ── the query key ──────────────────────────────────────────────────────────

test('the same question produces the same key, whatever order it was built in', () => {
  const a = queryKeyOf({ ...emptyQuery(), search: 'ساعة', folderId: 'f1' });
  const b = queryKeyOf({ folderId: 'f1', search: 'ساعة' });
  assert.equal(a, b);
});

test('a different question produces a different key', () => {
  const base = queryKeyOf(emptyQuery());
  assert.notEqual(base, queryKeyOf({ ...emptyQuery(), search: 'ساعة' }));
  assert.notEqual(base, queryKeyOf({ ...emptyQuery(), sort: 'oldest' }));
  assert.notEqual(base, queryKeyOf({ ...emptyQuery(), trashed: true }));
  assert.notEqual(base, queryKeyOf({ ...emptyQuery(), filters: { ...emptyQuery().filters, ai: 'yes' } }));
});

test('the page number is not part of the question', () => {
  // Page two of a question is the same question. The key identifies the
  // question so a cursor can be checked against it; the page is where in the
  // answer you are.
  assert.equal(
    queryKeyOf({ ...emptyQuery(), page: 1 }),
    queryKeyOf({ ...emptyQuery(), page: 7 }),
  );
});

// ── cursors ────────────────────────────────────────────────────────────────

test('a cursor carries the sort key and the primary key that breaks its ties', () => {
  const key = queryKeyOf(emptyQuery());
  const token = encodeCursor({ key: 1726901023000, primaryKey: 'itm_x' }, key, 'next');
  const back = decodeCursor(token, key);
  assert.deepEqual(back, { key: 1726901023000, primaryKey: 'itm_x', direction: 'next' });
});

test('a cursor made for one question is refused by another', () => {
  // Otherwise a stale token from the previous search resumes the new one in
  // the middle of somebody else's answer.
  const token = encodeCursor({ key: 1, primaryKey: 'a' }, queryKeyOf(emptyQuery()), 'next');
  assert.equal(decodeCursor(token, queryKeyOf({ ...emptyQuery(), search: 'ساعة' })), null);
});

test('a token that is not a cursor is refused rather than thrown', () => {
  assert.equal(decodeCursor('not-a-cursor', 'k'), null);
  assert.equal(decodeCursor(null, 'k'), null);
});

// ── narrowing ──────────────────────────────────────────────────────────────

test('the default query asks for nothing beyond page one of the newest', () => {
  assert.equal(isNarrowed(emptyQuery()), false);
});

test('every way of narrowing is recognised as one', () => {
  const q = emptyQuery();
  assert.equal(isNarrowed({ ...q, search: 'ساعة' }), true);
  assert.equal(isNarrowed({ ...q, folderId: 'f1' }), true);
  assert.equal(isNarrowed({ ...q, categoryId: 'c1' }), true);
  assert.equal(isNarrowed({ ...q, sort: 'value-high' }), true);
  assert.equal(isNarrowed({ ...q, trashed: true }), true);
  assert.equal(isNarrowed({ ...q, ids: new Set(['a']) }), true);
  assert.equal(isNarrowed({ ...q, filters: { ...q.filters, ai: 'yes' } }), true);
});

// ── the seam ───────────────────────────────────────────────────────────────

test('the adapter answers the query the screens actually run', async () => {
  const { useQueryAdapter, currentAdapter, queryInventory } = await import('../../src/query.js');

  const seen = [];
  useQueryAdapter({
    name: 'stub',
    needsEverything: () => false,
    execute: async (query) => {
      seen.push(query.search);
      return { rows: [{ id: 'from-adapter' }], total: 1, page: 1, totalPages: 1, searching: false };
    },
    summarize: async () => ({ complete: true, records: 1, folders: 0 }),
    counts: async () => ({ categories: new Map(), folders: new Map(), locations: new Map(), live: 1, trashed: 0, complete: true }),
  });

  try {
    assert.equal(currentAdapter(), 'stub');
    const result = await queryInventory({ search: 'ساعة' });
    assert.deepEqual(result.rows.map((r) => r.id), ['from-adapter']);
    assert.equal(result.answerable, true);
    assert.equal(typeof result.queryKey, 'string');
    assert.equal(result.summary.records, 1);
    assert.deepEqual(seen, ['ساعة']);
  } finally {
    useQueryAdapter(null);
  }
});

test('a query that could not be answered is marked unanswerable, not answered', async () => {
  const { queryInventory, useQueryAdapter } = await import('../../src/query.js');
  useQueryAdapter({
    name: 'needy',
    needsEverything: () => true,
    execute: async () => ({ rows: [], total: 0, page: 1, totalPages: 1, searching: true }),
    summarize: async () => ({ complete: false, records: 0, folders: 0 }),
    counts: async () => ({ categories: new Map(), folders: new Map(), locations: new Map(), live: 0, trashed: 0, complete: false }),
  });
  try {
    // No `ensure` to call, and the records are not held: the honest answer is
    // "this question could not be asked", never an empty result set that reads
    // as "there is nothing matching".
    const result = await queryInventory({ search: 'خاتم' });
    assert.equal(result.answerable, false);
    assert.equal(result.complete, false);
  } finally {
    useQueryAdapter(null);
  }
});

test('an aborted query paints nothing rather than painting late', async () => {
  const { queryInventory, useQueryAdapter } = await import('../../src/query.js');
  useQueryAdapter({
    name: 'slow',
    needsEverything: () => false,
    execute: async () => ({ rows: [{ id: 'stale' }], total: 1, page: 1, totalPages: 1 }),
    summarize: async () => ({ complete: true, records: 1, folders: 0 }),
    counts: async () => ({ categories: new Map(), folders: new Map(), locations: new Map(), live: 1, trashed: 0, complete: true }),
  });
  try {
    const signal = { aborted: true };
    assert.equal(await queryInventory({ search: 'سا' }, { signal }), null);
  } finally {
    useQueryAdapter(null);
  }
});
