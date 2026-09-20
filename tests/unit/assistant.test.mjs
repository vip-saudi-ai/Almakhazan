import test from 'node:test';
import assert from 'node:assert/strict';

import { WEIGHTS, cleanupTasks, inventoryHealth } from '../../src/health.js';
import { findDuplicateGroups } from '../../src/duplicates.js';
import { askInventory } from '../../src/ask.js';

const YEAR = 365 * 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 19);

const item = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  name: 'قطعة',
  quantity: 1,
  unit: 'قطعة',
  categoryId: 'c1',
  locationId: 'l1',
  condition: 'جيدة',
  images: [{ id: 'i1' }],
  valuation: { min: 100, max: 100, currency: 'SAR' },
  updatedAt: NOW,
  ...over,
});

const lookups = {
  categories: [{ id: 'c1', name: 'ساعات' }, { id: 'c2', name: 'فنون' }],
  locations: [{ id: 'l1', name: 'مستودع الرياض' }, { id: 'l2', name: 'الخزنة' }],
  folders: [],
};

// ── the score ──

test('the weights are the published ones and add up to one', () => {
  assert.deepEqual(WEIGHTS, {
    images: 0.30, location: 0.20, category: 0.15, condition: 0.15, recency: 0.10, integrity: 0.10,
  });
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights total ${total}`);
});

test('a fully documented inventory scores 100', () => {
  const health = inventoryHealth([item(), item(), item()], { now: NOW });
  assert.equal(health.score, 100);
  assert.equal(health.band.key, 'excellent');
});

test('an undocumented inventory scores 0 without crashing', () => {
  const bare = item({
    images: [], locationId: null, categoryId: 'uncategorized', condition: '',
    valuation: null, sku: '', barcode: '', description: '', updatedAt: NOW - 2 * YEAR,
  });
  assert.equal(inventoryHealth([bare], { now: NOW }).score, 0);
});

test('each signal moves the score by exactly its weight', () => {
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const missing = {
      images: { images: [] },
      location: { locationId: null },
      category: { categoryId: 'uncategorized' },
      condition: { condition: '' },
      recency: { updatedAt: NOW - 2 * YEAR },
      integrity: { valuation: null, sku: '', barcode: '', description: '' },
    }[key];
    const health = inventoryHealth([item(missing)], { now: NOW });
    assert.equal(health.score, Math.round((1 - weight) * 100), `${key} costs ${weight}`);
  }
});

test('an empty inventory says so instead of scoring zero out of nowhere', () => {
  const health = inventoryHealth([], { now: NOW });
  assert.equal(health.empty, true);
  assert.equal(health.counts.total, 0);
});

test('the score is arithmetic: half the records missing images costs half the weight', () => {
  const health = inventoryHealth([item(), item({ images: [] })], { now: NOW });
  assert.equal(health.score, 100 - Math.round(WEIGHTS.images * 50));
});

// ── cleanup ──

test('cleanup tasks are ordered by the points they would add', () => {
  const items = [
    ...Array.from({ length: 6 }, () => item({ images: [] })),
    ...Array.from({ length: 2 }, () => item({ locationId: null })),
  ];
  const tasks = cleanupTasks(inventoryHealth(items, { now: NOW }));
  assert.equal(tasks[0].id, 'images');
  assert.ok(tasks[0].gain > tasks[1].gain, JSON.stringify(tasks.map((t) => [t.id, t.gain])));
});

test('a healthy inventory is given nothing to do', () => {
  const items = [item({ name: 'ساعة' }), item({ name: 'خاتم' })];
  assert.deepEqual(cleanupTasks(inventoryHealth(items, { now: NOW })), []);
});

test('two identical records in a healthy inventory still surface as duplicates', () => {
  const tasks = cleanupTasks(inventoryHealth([item(), item()], { now: NOW }));
  assert.deepEqual(tasks.map((t) => t.id), ['duplicates']);
});

// ── duplicates ──

test('records sharing a barcode are grouped, and the reason is named', () => {
  const groups = findDuplicateGroups([
    item({ id: 'a', barcode: 'BC-1' }),
    item({ id: 'b', barcode: 'BC-1' }),
    item({ id: 'c', barcode: 'BC-2' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reason, 'نفس الباركود');
  assert.deepEqual(groups[0].items.map((i) => i.id), ['a', 'b']);
});

test('the same name in the same category is a candidate; in another category it is not', () => {
  const same = findDuplicateGroups([
    item({ id: 'a', name: 'ساعة جيب فضية' }),
    item({ id: 'b', name: 'ساعة جيب فضيه' }),
  ]);
  assert.equal(same.length, 1, 'Arabic spelling variants are the same name');

  const different = findDuplicateGroups([
    item({ id: 'a', name: 'ساعة جيب فضية' }),
    item({ id: 'b', name: 'ساعة جيب فضية', categoryId: 'c2' }),
  ]);
  assert.equal(different.length, 0);
});

test('a record is reported once, in its strongest group', () => {
  const groups = findDuplicateGroups([
    item({ id: 'a', name: 'خاتم', barcode: 'BC-9' }),
    item({ id: 'b', name: 'خاتم', barcode: 'BC-9' }),
    item({ id: 'c', name: 'خاتم' }),
  ]);
  const seen = groups.flatMap((g) => g.items.map((i) => i.id));
  assert.equal(new Set(seen).size, seen.length, JSON.stringify(seen));
  assert.equal(groups[0].kind, 'barcode');
});

test('duplicate detection never merges anything', () => {
  const items = [item({ id: 'a', barcode: 'X' }), item({ id: 'b', barcode: 'X' })];
  const before = JSON.stringify(items);
  findDuplicateGroups(items);
  assert.equal(JSON.stringify(items), before);
});

// ── ask ──

const ask = (q, items) => askInventory(q, { items, lookups, now: NOW });

test('it finds records with no photo', () => {
  const result = ask('وش القطع اللي ما لها صور؟', [item({ id: 'a', images: [] }), item({ id: 'b' })]);
  assert.equal(result.understood, true);
  assert.deepEqual(result.items.map((i) => i.id), ['a']);
});

test('it answers a value threshold, in Arabic or Latin digits', () => {
  const items = [
    item({ id: 'cheap', valuation: { min: 500, max: 500, currency: 'SAR' } }),
    item({ id: 'dear', valuation: { min: 90000, max: 110000, currency: 'SAR' } }),
  ];
  for (const question of ['وش الأشياء اللي قيمتها فوق 10000؟', 'وش الأشياء اللي قيمتها فوق ١٠٠٠٠؟']) {
    assert.deepEqual(ask(question, items).items.map((i) => i.id), ['dear'], question);
  }
});

test('it totals value and says how much of the inventory the total covers', () => {
  const result = ask('كم إجمالي قيمة مخزوني؟', [
    item({ valuation: { min: 1000, max: 3000, currency: 'SAR' } }),
    item({ valuation: null }),
  ]);
  assert.equal(result.kind, 'sum');
  // A total is a list of totals, one per currency, even when there is one
  // currency — so no caller can ever read a single number and assume it
  // covers everything. See tests/unit/money.test.mjs for the mixed case.
  assert.deepEqual(result.totals.map((t) => [t.currency, t.total]), [['SAR', 2000]]);
  assert.match(result.note, /1/);
});

test('it locates a record by name and reports where it is', () => {
  const result = ask('وين ساعة جدي؟', [item({ name: 'ساعة جدي', locationId: 'l2' })]);
  assert.equal(result.kind, 'where');
  assert.match(result.answer, /الخزنة/);
});

test('it says plainly when it cannot find the thing', () => {
  const result = ask('وين لوحة أحمد مصطفى؟', [item({ name: 'خاتم' })]);
  assert.equal(result.understood, true);
  assert.equal(result.items.length, 0);
  assert.match(result.answer, /لم أجد/);
});

test('a category and a location in the question narrow the answer', () => {
  const items = [
    item({ id: 'a', categoryId: 'c1', locationId: 'l1' }),
    item({ id: 'b', categoryId: 'c1', locationId: 'l2' }),
    item({ id: 'c', categoryId: 'c2', locationId: 'l1' }),
  ];
  const result = ask('اعرض الساعات الموجودة في مستودع الرياض', items);
  assert.deepEqual(result.items.map((i) => i.id), ['a']);
});

test('stale records are found by age, not by wording luck', () => {
  const result = ask('وش القطع اللي ما تم تحديثها من سنة؟', [
    item({ id: 'old', updatedAt: NOW - 2 * YEAR }),
    item({ id: 'fresh' }),
  ]);
  assert.deepEqual(result.items.map((i) => i.id), ['old']);
});

test('a question it cannot parse is answered honestly, with examples', () => {
  const result = ask('ما رأيك في السوق العقاري؟', [item()]);
  assert.equal(result.understood, false);
  assert.ok(result.suggestions.length > 0);
  assert.equal(result.items.length, 0);
});

test('an empty question asks for one rather than answering nothing', () => {
  const result = ask('   ', [item()]);
  assert.equal(result.understood, false);
  assert.equal(result.kind, 'empty');
});
