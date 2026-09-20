import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELDS, ambiguousColumns, attachTaxonomy, guessMapping, planImport } from '../../src/import-mapping.js';
import { parseDelimited } from '../../src/spreadsheet.js';

const EXISTING = {
  categories: [{ id: 'c-art', name: 'الفنون' }, { id: 'c-jewel', name: 'مجوهرات' }],
  locations: [{ id: 'l-safe', name: 'الخزنة' }],
  folders: [{ id: 'f-main', name: 'المجموعة الأولى' }],
};

const plan = (rows, mapping, extra = {}) =>
  planImport({ rows, mapping, existing: EXISTING, ...extra });

// ── the mapping guess ──────────────────────────────────────────────────────

test('headers in Arabic are matched, with spelling folded', () => {
  const mapping = guessMapping(['الأسم', 'الكميه', 'التصنيف', 'الملاحظات']);
  assert.equal(mapping.name, 0);
  assert.equal(mapping.quantity, 1);
  assert.equal(mapping.category, 2);
});

test('headers in English are matched too', () => {
  const mapping = guessMapping(['Item', 'Qty', 'Category', 'Location', 'Barcode']);
  assert.deepEqual(
    { name: mapping.name, quantity: mapping.quantity, category: mapping.category, location: mapping.location, barcode: mapping.barcode },
    { name: 0, quantity: 1, category: 2, location: 3, barcode: 4 },
  );
});

test('a header nobody recognises is left unmapped rather than guessed at', () => {
  const mapping = guessMapping(['الاسم', 'رقم الفاتورة', 'اسم المورّد']);
  assert.equal(mapping.name, 0);
  assert.equal(Object.values(mapping).includes(1), false);
  assert.equal(Object.values(mapping).includes(2), false);
});

test('one column is never claimed by two fields', () => {
  const mapping = guessMapping(['السعر', 'القيمة']);
  const used = Object.values(mapping);
  assert.equal(new Set(used).size, used.length);
});

// ── what gets written ──────────────────────────────────────────────────────

test('a row becomes a record, with the defaults the app uses', () => {
  const { records } = plan([['ساعة جيب']], { name: 0 });
  assert.equal(records.length, 1);
  assert.equal(records[0].name, 'ساعة جيب');
  assert.equal(records[0].quantity, 1);
  assert.equal(records[0].unit, 'قطعة');
});

test('a row with no name is skipped and reported, never invented', () => {
  const { records, problems } = plan([['', '5'], ['ساعة', '2']], { name: 0, quantity: 1 });
  assert.equal(records.length, 1);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].field, 'name');
  assert.equal(problems[0].line, 2);
});

test('a warning names the row the file has, not the row after blanks were dropped', () => {
  // rows[1] came from line 9 of the file; without that, it would be called 3.
  const { problems } = planImport({
    rows: [['ساعة', '2'], ['خاتم', 'ثلاثة']],
    lines: [2, 9],
    mapping: { name: 0, quantity: 1 },
    existing: EXISTING,
  });
  assert.equal(problems[0].line, 9);
});

test('a wholly empty row is not even a problem', () => {
  const { records, problems } = plan([['', ''], ['ساعة', '2']], { name: 0, quantity: 1 });
  assert.equal(records.length, 1);
  assert.equal(problems.length, 0);
});

test('a quantity that is not a number is reported, not silently defaulted', () => {
  const { records, problems } = plan([['ساعة', 'ثلاثة']], { name: 0, quantity: 1 });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].field, 'quantity');
  assert.match(problems[0].reason, /ثلاثة/);
  // The record still exists — one bad cell does not throw away a row — but
  // the number on it is the default, and the customer was told.
  assert.equal(records[0].quantity, 1);
});

test('Arabic-Indic digits are read as the numbers they are', () => {
  const { records, problems } = plan([['ساعة', '٧']], { name: 0, quantity: 1 });
  assert.equal(problems.length, 0);
  assert.equal(records[0].quantity, 7);
});

test('a condition outside the published list is reported, not coerced', () => {
  const { records, problems } = plan([['ساعة', 'رائعة'], ['لوحة', 'جيده']], { name: 0, condition: 1 });
  assert.equal(problems.length, 1);
  assert.match(problems[0].reason, /رائعة/);
  assert.equal(records[0].condition, undefined);
  // 'جيده' is 'جيدة' with the spelling folded — a real value, accepted.
  assert.equal(records[1].condition, 'جيدة');
});

test('a valuation carries its currency and is attributed to the import', () => {
  const { records } = plan([['ساعة', '100', '250']], { name: 0, valuationMin: 1, valuationMax: 2 });
  assert.deepEqual(records[0].valuation, { min: 100, max: 250, currency: 'SAR', source: 'import' });
});

test('one price fills both ends rather than leaving half a range', () => {
  const { records } = plan([['ساعة', '100']], { name: 0, valuationMin: 1 });
  assert.equal(records[0].valuation.min, 100);
  assert.equal(records[0].valuation.max, 100);
});

test('an unreadable price is reported', () => {
  const { problems } = plan([['ساعة', 'حسب السوق']], { name: 0, valuationMin: 1 });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].field, 'valuationMin');
});

// ── taxonomies ─────────────────────────────────────────────────────────────

test('an existing category is reused, whatever its spelling in the file', () => {
  const { records, newTaxonomy } = plan([['لوحة', 'الفنون'], ['خاتم', 'مجوهرات']], { name: 0, category: 1 });
  assert.equal(records[0].categoryId, 'c-art');
  assert.equal(records[1].categoryId, 'c-jewel');
  assert.deepEqual(newTaxonomy.categories, []);
});

test('a new category is collected and counted, not created as a side effect', () => {
  const { records, newTaxonomy } = plan([['سيف', 'أسلحة'], ['رمح', 'أسلحة']], { name: 0, category: 1 });
  assert.deepEqual(newTaxonomy.categories, ['أسلحة']);
  assert.equal(records[0].categoryId, undefined);
  assert.equal(records[0].categoryName, 'أسلحة');
});

test('a record with no category lands in the uncategorised bucket', () => {
  const { records } = plan([['ساعة']], { name: 0 });
  assert.equal(records[0].categoryId, 'uncategorized');
});

test('names become ids once the taxonomy exists', () => {
  const { records } = plan([['سيف', 'أسلحة', 'المستودع']], { name: 0, category: 1, location: 2 });
  const resolved = attachTaxonomy(records, {
    categories: { 'اسلحه': 'c-new' },
    locations: { 'المستودع': 'l-new' },
  });
  assert.equal(resolved[0].categoryId, 'c-new');
  assert.equal(resolved[0].locationId, 'l-new');
  assert.equal(resolved[0].categoryName, undefined);
});

// ── CSV ────────────────────────────────────────────────────────────────────

test('quoted fields keep their commas, quotes and newlines', () => {
  const rows = parseDelimited('name,note\n"ساعة, جيب","قال ""نعم""\nثم غادر"\n');
  assert.deepEqual(rows[1], ['ساعة, جيب', 'قال "نعم"\nثم غادر']);
});

test('a semicolon file — what Excel writes in much of the world — is read', () => {
  const rows = parseDelimited('الاسم;الكمية\nساعة;2\n');
  assert.deepEqual(rows, [['الاسم', 'الكمية'], ['ساعة', '2']]);
});

test('a byte order mark does not become part of the first header', () => {
  const rows = parseDelimited('﻿name,qty\nwatch,2\n');
  assert.equal(rows[0][0], 'name');
});

test('a tab-separated file is read as one', () => {
  assert.deepEqual(parseDelimited('a\tb\n1\t2\n'), [['a', 'b'], ['1', '2']]);
});

test('a single column with commas inside quotes is not split by the guess', () => {
  const rows = parseDelimited('name\n"ساعة, جيب"\n');
  assert.deepEqual(rows, [['name'], ['ساعة, جيب']]);
});

// ── the field list is the contract ─────────────────────────────────────────

test('images are not importable from a spreadsheet', () => {
  assert.equal(FIELDS.some((f) => /image|صور/i.test(f.key)), false);
});

test('exactly one field is required, and it is the name', () => {
  const required = FIELDS.filter((f) => f.required).map((f) => f.key);
  assert.deepEqual(required, ['name']);
});

// ── rows are classified, not merely accepted or rejected ───────────────────

test('a row is ready, needs review, or cannot be imported — and the counts say which', () => {
  const result = plan([
    ['ساعة', '2'],           // clean
    ['لوحة', 'ثلاثة'],        // imports, with the quantity dropped
    ['', '5'],               // no name: cannot be imported at all
  ], { name: 0, quantity: 1 });

  assert.equal(result.rowStatus.ready, 1);
  assert.equal(result.rowStatus.warning.length, 1);
  assert.equal(result.rowStatus.error.length, 1);
  // The warning row still becomes a record — one bad cell does not throw away
  // the other five.
  assert.deepEqual(result.records.map((r) => r.name), ['ساعة', 'لوحة']);
});

test('the error rows name their line, so they can be found in the file', () => {
  const result = plan([['ساعة', '1'], ['', '9']], { name: 0, quantity: 1 });
  assert.equal(result.rowStatus.error[0].line, 3);
});

// ── ambiguous columns are asked about, not guessed ─────────────────────────

test('"Ref" is not silently filed as a SKU', () => {
  const headers = ['الاسم', 'Ref'];
  const mapping = guessMapping(headers);
  assert.equal(mapping.sku, undefined, 'the guess leaves it alone');

  const asked = ambiguousColumns(headers, mapping);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].header, 'Ref');
  const keys = asked[0].options.map((o) => o.key);
  assert.ok(keys.includes('sku') && keys.includes('barcode') && keys.includes(''));
});

test('a column already mapped is not asked about', () => {
  const headers = ['الاسم', 'Ref'];
  assert.deepEqual(ambiguousColumns(headers, { name: 0, sku: 1 }), []);
});

test('an unambiguous header is never turned into a question', () => {
  const headers = ['الاسم', 'الكمية', 'التصنيف'];
  assert.deepEqual(ambiguousColumns(headers, guessMapping(headers)), []);
});
