import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currenciesPresent, currencyInText, describeTotals, formatAmount,
  resolveCurrency, totalsByCurrency,
} from '../../src/money.js';
import { EMPTY_FILTERS, applyFilters, sortByValuation } from '../../src/search.js';
import { normalizeValuation } from '../../src/validation.js';
import { askInventory } from '../../src/ask.js';

const priced = (name, min, max, currency) => ({
  id: name, name, quantity: 1, unit: 'قطعة', categoryId: 'c1', images: [{ id: 'i' }],
  locationId: 'l1', condition: 'جيدة', updatedAt: Date.now(),
  valuation: { min, max, currency, source: 'manual' },
});

// The inventory from the brief: three currencies, deliberately equal-looking.
const MIXED = [
  priced('لوحة', 100_000, 100_000, 'SAR'),
  priced('ساعة', 100_000, 100_000, 'USD'),
  priced('خاتم', 50_000, 50_000, 'EUR'),
];

const lookups = { categories: [{ id: 'c1', name: 'مقتنيات', icon: '📦' }], locations: [{ id: 'l1', name: 'الخزنة' }], folders: [] };

// ── the rule ───────────────────────────────────────────────────────────────

test('three currencies produce three totals, never one', () => {
  const totals = totalsByCurrency(MIXED);
  assert.equal(totals.length, 3);
  const byCode = Object.fromEntries(totals.map((t) => [t.currency, t.total]));
  assert.deepEqual(byCode, { SAR: 100_000, USD: 100_000, EUR: 50_000 });
});

test('the combined figure that must never appear is not produced anywhere', () => {
  const totals = totalsByCurrency(MIXED);
  const sum = totals.reduce((n, t) => n + t.total, 0);
  // 250,000 is what adding them would give. Nothing returns it as a total.
  assert.equal(totals.some((t) => t.total === 250_000), false);
  assert.equal(sum, 250_000);           // the arithmetic exists
  assert.equal(describeTotals(totals).includes('250,000'), false);  // the claim does not
});

test('each total is labelled with its own currency', () => {
  const text = describeTotals(totalsByCurrency(MIXED));
  assert.match(text, /100,000 ر\.س/);
  assert.match(text, /100,000 \$/);
  assert.match(text, /50,000 €/);
});

test('one currency still reads as one total', () => {
  const totals = totalsByCurrency([priced('a', 10, 20, 'SAR'), priced('b', 30, 30, 'SAR')]);
  assert.equal(totals.length, 1);
  assert.equal(totals[0].total, 45);    // midpoints: 15 + 30
});

test('records without a valuation are counted out, not counted as zero', () => {
  const totals = totalsByCurrency([priced('a', 100, 100, 'SAR'), { id: 'b', name: 'b' }]);
  assert.equal(totals[0].count, 1);
});

test('formatting never invents a currency', () => {
  assert.equal(formatAmount(1500, 'JPY'), '1,500 JPY');
});

// ── reading a currency out of a question ───────────────────────────────────

test('a question that names a currency is understood to have named it', () => {
  assert.equal(currencyInText('القطع فوق 100000 دولار'), 'USD');
  assert.equal(currencyInText('القطع فوق 100000 ريال'), 'SAR');
  assert.equal(currencyInText('worth over 5000 EUR'), 'EUR');
  assert.equal(currencyInText('القطع فوق 100000'), null);
});

test('with one currency in the inventory, an unqualified question is unambiguous', () => {
  const single = [priced('a', 100, 100, 'SAR')];
  assert.deepEqual(resolveCurrency('فوق 50', single), { ok: true, currency: 'SAR' });
});

test('with several, an unqualified question is refused rather than guessed', () => {
  const answer = resolveCurrency('فوق 50', MIXED);
  assert.equal(answer.ok, false);
  assert.deepEqual(answer.options.sort(), ['EUR', 'SAR', 'USD']);
});

test('naming the currency resolves it even when several are present', () => {
  assert.deepEqual(resolveCurrency('فوق 50 دولار', MIXED), { ok: true, currency: 'USD' });
});

test('currenciesPresent reports only currencies that actually carry a value', () => {
  assert.deepEqual(currenciesPresent([...MIXED, { id: 'x', name: 'x' }]).sort(), ['EUR', 'SAR', 'USD']);
});

// ── the same rule, through Ask NAZM ────────────────────────────────────────

test('"total value" answers per currency and never sums across them', () => {
  const result = askInventory('كم إجمالي قيمة مخزوني؟', { items: MIXED, lookups });
  assert.equal(result.kind, 'sum');
  assert.equal(result.totals.length, 3);
  assert.equal(/250,000/.test(result.answer), false);
  assert.match(result.answer, /100,000 ر\.س/);
});

test('"worth more than 100,000" asks which currency instead of answering wrongly', () => {
  const result = askInventory('وش الأشياء اللي قيمتها فوق 100000؟', { items: MIXED, lookups });
  assert.equal(result.kind, 'currency-choice');
  assert.deepEqual(result.options.sort(), ['EUR', 'SAR', 'USD']);
  assert.equal(result.items.length, 0);
});

test('once the currency is named, the threshold compares like with like', () => {
  const items = [
    priced('غالية', 150_000, 150_000, 'SAR'),
    priced('رخيصة', 50_000, 50_000, 'SAR'),
    // Worth far more than the threshold in its own currency, and irrelevant
    // to a question asked in riyals.
    priced('دولارية', 150_000, 150_000, 'USD'),
  ];
  const result = askInventory('وش الأشياء اللي قيمتها فوق 100000 ريال؟', { items, lookups });
  assert.equal(result.kind, 'list');
  assert.deepEqual(result.items.map((i) => i.name), ['غالية']);
});

test('a single-currency inventory needs no disambiguation', () => {
  const items = [priced('غالية', 150_000, 150_000, 'SAR'), priced('رخيصة', 50_000, 50_000, 'SAR')];
  const result = askInventory('وش الأشياء اللي قيمتها فوق 100000؟', { items, lookups });
  assert.equal(result.kind, 'list');
  assert.deepEqual(result.items.map((i) => i.name), ['غالية']);
});

test('an unanswerable question says what it can answer', () => {
  const result = askInventory('ما رأيك في السوق؟', { items: MIXED, lookups });
  assert.equal(result.understood, false);
  assert.ok(result.capabilities.length >= 4);
  assert.ok(result.capabilities.every((c) => c.label && c.example));
});

// ── currencies the app does not have in its picker ─────────────────────────

test('a valuation in any ISO currency keeps that currency', () => {
  // The picker offers four. The standard has about a hundred and eighty, and a
  // spreadsheet imported from Dubai is priced in one of the other ones.
  for (const code of ['AED', 'CHF', 'JPY', 'KWD', 'TRY']) {
    const v = normalizeValuation({ min: 10000, max: 10000, currency: code });
    assert.equal(v.currency, code, code);
  }
});

test('a currency that is not a currency falls back rather than being stored', () => {
  assert.equal(normalizeValuation({ min: 1, max: 1, currency: 'PCS' }).currency, 'SAR');
  assert.equal(normalizeValuation({ min: 1, max: 1, currency: '' }).currency, 'SAR');
  assert.equal(normalizeValuation({ min: 1, max: 1 }).currency, 'SAR');
});

test('a lowercase code is the same currency', () => {
  assert.equal(normalizeValuation({ min: 1, max: 1, currency: 'aed' }).currency, 'AED');
});

// ── sorting by value, across currencies ────────────────────────────────────

const valued = (id, amount, currency) => ({
  id, name: id, createdAt: 1, valuation: { min: amount, max: amount, currency },
});

test('within one currency, sorting by value is ordinary sorting', () => {
  const { rows, mixed } = sortByValuation([
    valued('a', 100, 'SAR'), valued('c', 300, 'SAR'), valued('b', 200, 'SAR'),
  ], 1);
  assert.equal(mixed, false);
  assert.deepEqual(rows.map((r) => r.id), ['c', 'b', 'a']);
});

test('across currencies, nothing is ordered against something it cannot be compared to', () => {
  // 400 USD and 500 SAR have no order without an exchange rate. The old sort
  // compared the bare numbers and put the plate above the watch as if it knew.
  const { rows, mixed, currencies } = sortByValuation([
    valued('plate', 500, 'SAR'),
    valued('watch', 400, 'USD'),
    valued('ring', 900, 'SAR'),
    valued('lens', 800, 'USD'),
  ], 1);

  assert.equal(mixed, true);
  assert.deepEqual(currencies.length, 2);

  // Each currency is internally ordered…
  const bySar = rows.filter((r) => r.valuation.currency === 'SAR').map((r) => r.id);
  const byUsd = rows.filter((r) => r.valuation.currency === 'USD').map((r) => r.id);
  assert.deepEqual(bySar, ['ring', 'plate']);
  assert.deepEqual(byUsd, ['lens', 'watch']);

  // …and the currencies do not interleave, which is what would read as a
  // ranking across them.
  const codes = rows.map((r) => r.valuation.currency);
  assert.deepEqual(codes, [...codes].sort((a, b) => codes.indexOf(a) - codes.indexOf(b)));
  assert.equal(new Set(codes).size, 2);
  assert.equal(codes[0], codes[1]);
});

test('unpriced records sort last, in both directions', () => {
  const none = { id: 'none', name: 'none', createdAt: 1 };
  for (const dir of [1, -1]) {
    const { rows } = sortByValuation([none, valued('a', 5, 'SAR'), valued('b', 9, 'SAR')], dir);
    assert.equal(rows[rows.length - 1].id, 'none', `direction ${dir}`);
  }
});

test('a currency filter narrows without converting anything', () => {
  const items = [valued('a', 500, 'SAR'), valued('b', 400, 'USD'), valued('c', 100, 'SAR')];
  const only = applyFilters(items, { ...EMPTY_FILTERS, currency: 'USD' });
  assert.deepEqual(only.map((i) => i.id), ['b']);
  assert.equal(only[0].valuation.currency, 'USD');
  assert.equal(only[0].valuation.min, 400);
});
