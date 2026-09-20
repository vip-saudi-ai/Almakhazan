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
