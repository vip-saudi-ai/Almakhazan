import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyQuery, isNarrowed, plan } from '../../src/query.js';

// The property under test is not "queries return the right rows" — the search
// suite covers that. It is that a query *describes itself* well enough for a
// runner to decide what it needs, which is what stops the UI from reaching
// into a full array of records.

test('the default query asks for nothing beyond page one of the newest', () => {
  const q = emptyQuery();
  assert.equal(isNarrowed(q), false);
  assert.equal(plan(q).needsWholeInventory, false);
});

test('a search is not answerable from a window, and the plan says so', () => {
  const q = { ...emptyQuery(), search: 'ساعة' };
  assert.equal(isNarrowed(q), true);
  assert.equal(plan(q).needsWholeInventory, true);
  assert.ok(plan(q).needsRecords.includes('search'));
});

test('equality filters are index-shaped; derived ones are not', () => {
  const indexed = plan({ ...emptyQuery(), filters: { ...emptyQuery().filters, condition: 'ممتازة' } });
  assert.ok(indexed.indexable.includes('condition'));
  assert.equal(indexed.needsRecords.includes('condition'), false);

  // "has no image" is not a stored field, so no index answers it today.
  const derived = plan({ ...emptyQuery(), filters: { ...emptyQuery().filters, ai: 'missing' } });
  assert.ok(derived.needsRecords.includes('ai'));
});

test('a sort is always index-shaped — sorting is what an index is for', () => {
  const q = { ...emptyQuery(), sort: 'valuation' };
  assert.ok(plan(q).indexable.includes('sort:valuation'));
});

test('a folder scope is index-shaped, and still needs the whole set today', () => {
  const q = { ...emptyQuery(), folderId: 'f1' };
  assert.ok(plan(q).indexable.includes('folderId'));
  // Honest: the *plan* is index-shaped, the current runner is not backed by
  // one. The two facts are reported separately rather than conflated.
  assert.equal(plan(q).needsWholeInventory, true);
});

test('an explicit id set — an assistant hand-over — needs the records', () => {
  const q = { ...emptyQuery(), ids: new Set(['a', 'b']) };
  assert.equal(isNarrowed(q), true);
  assert.ok(plan(q).needsRecords.includes('ids'));
});

test('free-text search is named as the part no index can answer', () => {
  // This is the documented limitation, asserted so it cannot quietly become a
  // claim that search is server-backed.
  const q = { ...emptyQuery(), search: 'خاتم', filters: { ...emptyQuery().filters, condition: 'جيدة' } };
  const p = plan(q);
  assert.ok(p.indexable.includes('condition'));
  assert.deepEqual(p.needsRecords, ['search']);
});

// ── the seam is on the path, not beside it ─────────────────────────────────

test('the adapter answers the query the screens actually run', async () => {
  // runQuery used to call the local implementation directly, so swapping the
  // adapter changed what the app loaded and what it counted but not what it
  // listed. A seam every screen goes around is not a seam.
  const { runQuery, useQueryAdapter, currentAdapter, queryInventory } = await import('../../src/query.js');

  const seen = [];
  const stub = {
    name: 'stub',
    needsEverything: () => false,
    run: (query) => {
      seen.push(query.search);
      return {
        rows: [{ id: 'from-adapter' }], total: 1, page: 1, totalPages: 1,
        searching: false, scopeItems: [], valueCurrencies: [], groupedByCurrency: false,
      };
    },
    counts: () => ({ categories: new Map(), folders: new Map(), locations: new Map(), live: 1, trashed: 0, complete: true }),
  };

  useQueryAdapter(stub);
  try {
    assert.equal(currentAdapter(), 'stub');

    const sync = runQuery({ search: 'خاتم' });
    assert.deepEqual(sync.rows.map((r) => r.id), ['from-adapter']);

    const async_ = await queryInventory({ search: 'ساعة' });
    assert.deepEqual(async_.rows.map((r) => r.id), ['from-adapter']);
    // The asynchronous entry point returns the same shape, plus what it
    // learned on the way.
    assert.equal(async_.answerable, true);
    assert.equal(async_.nextCursor, null);
    assert.equal(typeof async_.summary, 'object');

    assert.deepEqual(seen, ['خاتم', 'ساعة']);
  } finally {
    useQueryAdapter(null);
  }
});

test('a query that could not be answered is marked unanswerable, not answered', async () => {
  const { queryInventory, useQueryAdapter } = await import('../../src/query.js');
  useQueryAdapter({
    name: 'needy',
    needsEverything: () => true,
    run: () => ({ rows: [], total: 0, page: 1, totalPages: 1, searching: true, scopeItems: [] }),
    counts: () => ({ categories: new Map(), folders: new Map(), locations: new Map(), live: 0, trashed: 0, complete: false }),
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
