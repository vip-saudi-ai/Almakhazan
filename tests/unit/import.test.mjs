import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELDS, ambiguousColumns, attachTaxonomy, guessMapping, importItemId, planImport } from '../../src/import-mapping.js';
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

// ── what a failed import must not do ───────────────────────────────────────

test('a row always maps to the same record id within one import', () => {
  // An import that fails on chunk 3 of 10 has already written chunks 1 and 2.
  // Pressing the button again must rewrite those two, not add a second copy.
  const a = importItemId('j1', 2);
  const b = importItemId('j1', 2);
  assert.equal(a, b);
  assert.notEqual(importItemId('j1', 2), importItemId('j1', 3));
  assert.notEqual(importItemId('j1', 2), importItemId('j2', 2));
});

test('every record carries the row it came from', () => {
  const { records } = plan(
    [['ساعة', '2'], ['خاتم', '3']],
    { name: 0, quantity: 1 },
    { lines: [7, 9] },
  );
  assert.deepEqual(records.map((r) => r.sourceLine), [7, 9]);
  // Which is what makes the ids stable across a retry.
  const ids = records.map((r) => importItemId('job', r.sourceLine));
  assert.equal(new Set(ids).size, 2);
});

// ── valuations the file got wrong ──────────────────────────────────────────

test('an unreadable upper bound is reported, not dropped in silence', () => {
  const { problems } = plan([['ساعة', '5000', 'كثير']], { name: 0, valuationMin: 1, valuationMax: 2 });
  assert.ok(problems.some((p) => p.field === 'valuationMax'), JSON.stringify(problems));
});

test('bounds the wrong way round hold the row back rather than being swapped', () => {
  // 8,000 to 5,000 could be columns mapped backwards, a typo, or the truth
  // badly entered. Swapping them picks one of those readings and writes it
  // down as a fact about what the customer owns.
  const { records, problems, rowStatus } = plan(
    [['ساعة', '8000', '5000']], { name: 0, valuationMin: 1, valuationMax: 2 },
  );
  assert.ok(problems.some((p) => p.field === 'valuationMax' && /أقل من/.test(p.reason)), JSON.stringify(problems));
  assert.equal(records.length, 0);
  assert.equal(rowStatus.error.length, 1);
});

test('an unreadable upper bound does not become a flat lower one', () => {
  // "5,000 to unreadable" silently became a flat 5,000 — a narrower claim
  // about the object's worth than the file made, presented as the file's own.
  const { records, problems } = plan(
    [['ساعة', '5000', 'كثير']], { name: 0, valuationMin: 1, valuationMax: 2 },
  );
  assert.equal(records.length, 0);
  assert.ok(problems.some((p) => p.field === 'valuationMax'), JSON.stringify(problems));
});

// ── currencies ─────────────────────────────────────────────────────────────

test('a currency the file names is kept, whether or not the picker offers it', () => {
  const { records, problems } = plan([['ساعة', '5000', 'AED']], { name: 0, valuationMin: 1, currency: 2 });
  assert.equal(records[0].valuation.currency, 'AED');
  assert.equal(problems.filter((p) => p.field === 'currency').length, 0);
});

test('a currency that is not a currency holds the row back — it never becomes SAR', () => {
  // Falling back turns one unreadable cell into a confidently wrong number on
  // every row of the file. 10,000 AEDXX is not 10,000 ر.س.
  const { records, problems } = plan(
    [['ساعة', '10000', 'AEDXX']], { name: 0, valuationMin: 1, currency: 2 },
  );
  assert.ok(problems.some((p) => p.field === 'currency' && /AEDXX/.test(p.reason)), JSON.stringify(problems));
  assert.equal(records.length, 0);
});

test('an empty currency cell is not a claim, so the default applies', () => {
  // The distinction the rule turns on: nothing said versus something said that
  // cannot be read.
  const { records, problems } = plan([['ساعة', '5000', '']], { name: 0, valuationMin: 1, currency: 2 });
  assert.equal(records.length, 1);
  assert.equal(records[0].valuation.currency, 'SAR');
  assert.equal(problems.filter((p) => p.field === 'currency').length, 0);
});

test('a row whose money is unreadable is not imported with the money left out', () => {
  // The alternative is a record that quietly says it is worth nothing.
  const { records } = plan(
    [['ساعة جيب', '5000', 'AEDXX'], ['خاتم', '900', 'AED']],
    { name: 0, valuationMin: 1, currency: 2 },
  );
  assert.deepEqual(records.map((r) => r.name), ['خاتم']);
  assert.equal(records[0].valuation.currency, 'AED');
});

// ── the plan allowance and the technical ceiling are two different limits ───

test('every plan can actually process what it was sold', async () => {
  const { PLANS, importRowLimit } = await import('../../src/entitlements.js');
  const { MAX_ROWS } = await import('../../src/spreadsheet.js');

  // The parser used to stop at 5,000, which made Pro's 10,000 and Business's
  // 50,000 promises the product could not keep.
  const expected = { free: 200, personal: 2000, pro: 10000, business: 50000 };
  for (const [planId, rows] of Object.entries(expected)) {
    const entitlement = { plan: PLANS[planId], planId };
    const limit = importRowLimit({ entitlement }, MAX_ROWS);
    assert.equal(limit.plan, rows, planId);
    assert.equal(limit.effective, rows, `${planId} effective`);
    assert.ok(MAX_ROWS >= rows, `the parser must reach ${planId}'s allowance`);
  }
});

test('an unlimited plan still meets a per-file ceiling, and it is named as one', async () => {
  const { PLANS, importRowLimit } = await import('../../src/entitlements.js');
  const { MAX_ROWS } = await import('../../src/spreadsheet.js');
  const limit = importRowLimit({ entitlement: { plan: PLANS.enterprise, planId: 'enterprise' } }, MAX_ROWS);
  assert.equal(limit.unlimitedPlan, true);
  assert.equal(limit.effective, MAX_ROWS);
  // Which matters for the message: this is not something a bigger plan fixes.
  assert.equal(limit.boundBy, 'file');
});

test('a file at the limit is accepted and a file past it is not', async () => {
  const { PLANS, checkImportRows } = await import('../../src/entitlements.js');
  const { MAX_ROWS } = await import('../../src/spreadsheet.js');
  const personal = { entitlement: { plan: PLANS.personal, planId: 'personal', name: PLANS.personal.name } };

  assert.equal(checkImportRows(personal, 2000, MAX_ROWS).allowed, true);
  const refused = checkImportRows(personal, 2001, MAX_ROWS);
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, 'limit/import-rows');
});

test('the message says which limit was met — the plan, or the file', async () => {
  const { PLANS, checkImportRows } = await import('../../src/entitlements.js');
  const { MAX_ROWS } = await import('../../src/spreadsheet.js');

  const onPlan = checkImportRows({ entitlement: { plan: PLANS.free, planId: 'free' } }, 201, MAX_ROWS);
  assert.match(onPlan.message, /خطة/);

  // Enterprise has no plan limit, so the only thing it can meet is the file
  // ceiling — and telling that customer to upgrade would be nonsense.
  const onFile = checkImportRows(
    { entitlement: { plan: PLANS.enterprise, planId: 'enterprise' } }, MAX_ROWS + 1, MAX_ROWS,
  );
  assert.equal(onFile.reason, 'limit/import-file');
  assert.match(onFile.message, /ملفات إضافية/);
});

// ── the parser stops reading rather than reading and slicing ───────────────

test('a CSV stops at the row limit instead of parsing the whole file', async () => {
  const { parseDelimited } = await import('../../src/spreadsheet.js');
  const text = Array.from({ length: 5000 }, (_, i) => `row${i},1`).join('\n');
  const rows = parseDelimited(text, null, { rowLimit: 10 });
  // Ten, plus the one extra that is how truncation is detected.
  assert.equal(rows.length, 11);
  assert.equal(rows.truncated, true);
  assert.deepEqual(rows[0], ['row0', '1']);
});

test('a CSV inside the limit reports that it was read whole', async () => {
  const { parseDelimited } = await import('../../src/spreadsheet.js');
  const rows = parseDelimited('a,1\nb,2\n', null, { rowLimit: 10 });
  assert.equal(rows.length, 2);
  assert.equal(rows.truncated, false);
});

test('a pathological file is refused rather than turned into a giant string', async () => {
  const { parseDelimited, MAX_COLUMNS, MAX_CELL_CHARS } = await import('../../src/spreadsheet.js');

  const wide = Array.from({ length: MAX_COLUMNS + 5 }, (_, i) => `c${i}`).join(',');
  assert.throws(() => parseDelimited(wide), /عموداً/);

  const huge = `"${'x'.repeat(MAX_CELL_CHARS + 100)}"`;
  assert.throws(() => parseDelimited(huge), /خلية/);
});
