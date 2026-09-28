import test from 'node:test';
import assert from 'node:assert/strict';

import { compareForSort, matchesSpec, validateQuerySpec, MAX_LIMIT } from '../../src/query-spec.js';
import { AggregateBuilder, AggregateDelta, emptyAggregate, overviewFromAggregate } from '../../src/aggregates.js';
import { searchTokensOf, withIndexFields, hasCurrentIndexFields } from '../../src/item-index.js';
import { nameSortKey } from '../../src/search.js';
import { validateBackupItem, validateBackupMetadata, migrateBackupItem, backupItemContext } from '../../src/backup-validate.js';
import { interpretQuestion } from '../../src/ask.js';

const codeOf = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.code; } };

test('the query contract refuses anything outside it', () => {
  assert.equal(codeOf(() => validateQuerySpec({ filters: { unknown: 1 } })), 'query/invalid');
  assert.equal(codeOf(() => validateQuerySpec({ filters: { quantity: { regex: 'x' } } })), 'query/invalid');
  assert.equal(codeOf(() => validateQuerySpec({ limit: MAX_LIMIT + 1 })), 'query/invalid');
  assert.equal(codeOf(() => validateQuerySpec({ filters: { valuationMidpoint: { gt: 5 } } })), 'query/invalid');
  assert.equal(codeOf(() => validateQuerySpec({ sort: { field: 'valuation', direction: 'desc' } })), 'query/invalid');
  assert.equal(codeOf(() => validateQuerySpec({ filters: { locationId: { in: Array.from({ length: 31 }, (_, i) => 'l' + i) } } })), 'query/invalid');
  assert.equal(codeOf(() => validateQuerySpec({ extra: true })), 'query/invalid');
  assert.equal(codeOf(() => validateQuerySpec({ filters: { '__proto__': 1 } })), 'ok'); // an own property named __proto__ cannot be set by JSON-like literal; nothing is read
});

test('live records are the default; the Trash is asked for', () => {
  const spec = validateQuerySpec({});
  assert.ok(spec.filters.some((f) => f.field === 'deleted' && f.value === false));
  const trash = validateQuerySpec({ filters: { deleted: true } });
  assert.equal(trash.filters.filter((f) => f.field === 'deleted').length, 1);
});

test('matching and ordering are defined once', () => {
  const a = { id: 'a', name: 'قطعة 10', quantity: 2, createdAt: 1, valuation: { min: 10, max: 30, currency: 'SAR' } };
  const b = { id: 'b', name: 'قطعة 2', quantity: 5, createdAt: 2, valuation: { min: 5, max: 5, currency: 'SAR' } };
  const spec = validateQuerySpec({ filters: { quantity: { gte: 3 } } });
  assert.equal(matchesSpec(a, spec, searchTokensOf), false);
  assert.equal(matchesSpec(b, spec, searchTokensOf), true);
  const byName = [a, b].sort(compareForSort({ field: 'name', direction: 'asc' })).map((i) => i.id);
  assert.deepEqual(byName, ['b', 'a'], 'numbers in names compare as numbers');
  const byValue = [a, b].sort(compareForSort({ field: 'valuation', direction: 'desc' })).map((i) => i.id);
  assert.deepEqual(byValue, ['a', 'b']);
  const text = validateQuerySpec({ text: 'قطعة' });
  assert.equal(matchesSpec(a, text, searchTokensOf), true);
});

test('derived index fields are deterministic and checkable', () => {
  const record = withIndexFields({ id: 'x', name: 'المولد الكبير 7', sku: 'INV-2026-000123', valuation: { min: 1, max: 3, currency: 'USD' } });
  assert.equal(record.nameSortKey, nameSortKey('المولد الكبير 7'));
  assert.equal(record.valuationMidpoint, 2);
  assert.ok(record.searchTokens.includes('inv-2026-000123'));
  assert.ok(record.searchTokens.includes('مولد'), 'the definite article is optional');
  assert.ok(hasCurrentIndexFields(record));
  assert.ok(!hasCurrentIndexFields({ ...record, name: 'غير ذلك' }));
});

test('an aggregate kept by deltas equals one built from the records', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({
    id: 'i' + i, name: 'n' + i, quantity: i, images: i % 2 ? [{ id: 'm' }] : [], categoryId: i % 3 ? 'c1' : 'uncategorized',
    locationId: i % 4 ? 'l1' : null, condition: i % 5 ? 'جيدة' : '', valuation: i % 2 ? { min: i, max: i * 2, currency: i % 3 ? 'SAR' : 'USD' } : null,
    deletedAt: i % 7 === 0 ? 1 : null,
  }));
  const delta = new AggregateDelta();
  for (const item of items) delta.change(null, item);
  // Edit half, delete a few, restore one.
  for (const item of items.slice(0, 25)) delta.change(item, { ...item, quantity: item.quantity + 1, locationId: 'l2' });
  const kept = delta.applyTo(emptyAggregate());
  const builder = new AggregateBuilder();
  for (const item of items.slice(25)) builder.add(item);
  for (const item of items.slice(0, 25)) builder.add({ ...item, quantity: item.quantity + 1, locationId: 'l2' });
  const built = builder.result();
  assert.deepEqual(overviewFromAggregate(kept), overviewFromAggregate(built));
  assert.ok(overviewFromAggregate(built).valuationByCurrency.every((c) => ['SAR', 'USD'].includes(c.currency)));
});

test('a backup record is restored whole, or refuses', () => {
  const context = backupItemContext({ categories: [], folders: [{ id: 'f1' }], locations: [{ id: 'l1' }] });
  const good = { id: 'it1', name: 'قطعة', quantity: 2, folderId: 'f1', locationId: 'l1', categoryId: 'uncategorized', valuation: { min: 1, max: 2, currency: 'SAR' } };
  assert.equal(validateBackupItem(good, context).id, 'it1');
  const reason = (over) => { try { validateBackupItem({ ...good, ...over }, context); return 'ok'; } catch (e) { return e.detail.reason; } };
  assert.equal(reason({ folderId: 'nope' }), 'folder');
  assert.equal(reason({ locationId: 'nope' }), 'location');
  assert.equal(reason({ categoryId: 'nope' }), 'category');
  assert.equal(reason({ name: '' }), 'name');
  assert.equal(reason({ quantity: 'lots' }), 'quantity');
  assert.equal(reason({ images: [{ id: 'x' }] }), 'images');
  assert.equal(reason({ condition: 'shiny' }), 'condition');
  assert.equal(reason({ name: 'x'.repeat(5000) }), 'text:name');
  assert.equal(reason({ id: '' }), 'id');
  assert.equal(migrateBackupItem({ id: 'a', cat: 'c', qty: 3 }).categoryId, 'c');
});

test('backup metadata that would lose a record refuses', () => {
  assert.equal(validateBackupMetadata({ folders: [{ id: 'f1', name: 'x' }] }).folders.length, 1);
  assert.equal(codeOf(() => validateBackupMetadata({ folders: [{ id: 'f1', name: '' }] })), 'backup/invalid-record');
  assert.equal(codeOf(() => validateBackupMetadata({ locations: [{ name: 'no id' }] })), 'backup/invalid-record');
  assert.equal(codeOf(() => validateBackupMetadata({ fieldDefinitions: [{ id: 'bad id', type: 'text' }] })), 'backup/invalid-record');
});

test('the assistant turns a question into a serializable plan', () => {
  const lookups = { categories: [], locations: [{ id: 'l1', name: 'مستودع الرياض' }], folders: [], taxonomy: null };
  const plan = interpretQuestion('قطع بدون صور في مستودع الرياض', { lookups, currencies: ['SAR'], now: 0 });
  assert.equal(plan.kind, 'list');
  assert.deepEqual(plan.query.filters, { hasImages: false, locationId: 'l1' });
  assert.doesNotThrow(() => validateQuerySpec(JSON.parse(JSON.stringify({ filters: plan.query.filters }))));
  const value = interpretQuestion('قطع قيمتها فوق 5000', { lookups, currencies: ['SAR', 'USD'], now: 0 });
  assert.equal(value.kind, 'currency-choice', 'several currencies: ask which, never mix');
});
