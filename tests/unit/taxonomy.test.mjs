// The classification model without a browser: the built-in library, the
// merged hierarchy, validation, migration placement, search, field values,
// spreadsheet import and the local assistant.

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CATEGORIES, TAXONOMY_SCHEMA_VERSION } from '../../src/config.js';
import {
  FIELD_DEFINITIONS, FIELD_TEMPLATES, MAIN_CATEGORIES, PREVIOUS_MAIN,
} from '../../src/locales/taxonomy-catalog.js';
import {
  LEVELS, buildTaxonomy, builtinIds, legacyPlacement, reconcileClassification,
} from '../../src/taxonomy.js';
import {
  newCustomFieldId, normalizeCustomFieldDef, normalizeFieldValue, sanitizeFieldValues,
} from '../../src/custom-fields.js';
import { normalizeCategory, normalizeItem, validateImport } from '../../src/validation.js';
import { guessMapping, planImport, attachTaxonomy } from '../../src/import-mapping.js';
import { askInventory } from '../../src/ask.js';

// ── the library ────────────────────────────────────────────────────────────

test('every built-in id is unique, stable-looking, and labelled in both languages', () => {
  const ids = builtinIds();
  assert.equal(new Set(ids).size, ids.length, 'no id is used twice, across levels');
  assert.equal(MAIN_CATEGORIES.length, 14);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9_]*$/, id);
  const all = MAIN_CATEGORIES.concat([PREVIOUS_MAIN]).flatMap((m) => [m, ...m.categories, ...m.categories.flatMap((c) => c.subcategories || [])]);
  for (const node of all) {
    assert.ok(node.ar && node.en, `${node.id} has both labels`);
    assert.doesNotMatch(node.en, /[؀-ۿ]/, `${node.id}: no Arabic in the English label`);
  }
});

test('templates only name defined fields, and every field has both labels', () => {
  const defined = new Set(FIELD_DEFINITIONS.map((f) => f.id));
  assert.equal(defined.size, FIELD_DEFINITIONS.length);
  for (const [name, ids] of Object.entries(FIELD_TEMPLATES)) {
    for (const id of ids) assert.ok(defined.has(id), `${name}: ${id}`);
  }
  for (const field of FIELD_DEFINITIONS) {
    assert.ok(field.ar && field.en, field.id);
    for (const option of field.options || []) assert.ok(option.ar && option.en, `${field.id}/${option.id}`);
  }
});

test('the schema version of the classification is its own', () => {
  assert.equal(TAXONOMY_SCHEMA_VERSION, 1);
});

// ── the merged hierarchy ───────────────────────────────────────────────────

test('a Main Category offers only its own Categories', () => {
  const tax = buildTaxonomy([]);
  const equipment = tax.categories('equipment_tools').map((n) => n.id);
  assert.ok(equipment.includes('equipment_generators'));
  assert.ok(!equipment.includes('art_paintings'));
  assert.deepEqual(tax.subcategories('equipment_generators').map((n) => n.id).slice(0, 2), ['equipment_generators_diesel', 'equipment_generators_petrol']);
  assert.equal(tax.subcategories('art_paintings').length, 0, 'no Subcategory where none adds value');
  assert.equal(tax.mainCategories().some((n) => n.id === 'previous_categories'), false, '«تصنيفات سابقة» only when used');
});

test('labels come from the library in either language; ids never change', () => {
  const tax = buildTaxonomy([]);
  assert.equal(tax.label('equipment_tools', 'ar'), 'معدات وأدوات');
  assert.equal(tax.label('equipment_tools', 'en'), 'Equipment & Tools');
  assert.equal(tax.breadcrumb({ mainCategoryId: 'equipment_tools', categoryId: 'equipment_generators', subcategoryId: 'equipment_generators_diesel' }, 'ar'),
    'معدات وأدوات › مولدات › مولدات ديزل');
  assert.equal(tax.breadcrumb({ mainCategoryId: 'art_collectibles', categoryId: 'art_paintings' }, 'en'), 'Art & Collectibles › Paintings');
});

test('the check refuses a Category under the wrong Main Category, and a stray Subcategory', () => {
  const tax = buildTaxonomy([]);
  assert.deepEqual(tax.check({ categoryId: 'equipment_generators' }).value,
    { mainCategoryId: 'equipment_tools', categoryId: 'equipment_generators', subcategoryId: null }, 'the Main Category is derived');
  assert.equal(tax.check({ mainCategoryId: 'electronics_devices', categoryId: 'equipment_generators' }).error, 'taxonomy.error.categoryMismatch');
  assert.equal(tax.check({ categoryId: 'art_paintings', subcategoryId: 'equipment_generators_diesel' }).error, 'taxonomy.error.subMismatch');
  assert.equal(tax.check({ subcategoryId: 'equipment_generators_diesel' }).error, 'taxonomy.error.subWithoutCategory');
  assert.equal(tax.check({ mainCategoryId: 'art_collectibles' }).ok, true, 'a Main Category alone is a classification');
  assert.equal(tax.check({ categoryId: 'no-such' }).error, 'taxonomy.error.unknown');
  assert.equal(tax.isValidClassification('equipment_tools', 'equipment_generators', 'equipment_generators_gas'), true);
});

test('reconciling keeps as much of a classification as fits', () => {
  const tax = buildTaxonomy([]);
  assert.deepEqual(reconcileClassification(tax, { mainCategoryId: 'art_collectibles', categoryId: 'equipment_pumps' }).value,
    { mainCategoryId: 'equipment_tools', categoryId: 'equipment_pumps', subcategoryId: null });
  assert.deepEqual(reconcileClassification(tax, { mainCategoryId: 'art_collectibles', categoryId: 'gone' }).value,
    { mainCategoryId: 'art_collectibles', categoryId: 'uncategorized', subcategoryId: null });
});

test('the customer’s own nodes, hidden and reordered built-ins, merged into the library', () => {
  const tax = buildTaxonomy([
    { id: 'lab', name: 'معدات مختبر الأحجار', level: 'main', source: 'custom', createdAt: 1 },
    { id: 'raman', name: 'Raman', level: 'category', parentId: 'lab', source: 'custom', createdAt: 2 },
    { id: 'books_documents', name: '', source: 'builtin', hidden: true },
    { id: 'art_collectibles', name: 'مقتنياتي', source: 'builtin', order: -1 },
  ]);
  assert.equal(tax.mainCategories()[0].id, 'art_collectibles', 'order is by stored order, not by label');
  assert.equal(tax.label('art_collectibles'), 'مقتنياتي', 'a local display name');
  assert.equal(tax.defaultLabel(tax.node('art_collectibles'), 'ar'), 'فن ومقتنيات', 'the built-in label itself is untouched');
  assert.ok(!tax.mainCategories().some((n) => n.id === 'books_documents'), 'hidden, not deleted');
  assert.ok(tax.mainCategories({ includeHidden: true }).some((n) => n.id === 'books_documents'));
  assert.deepEqual(tax.categories('lab').map((n) => n.id), ['raman']);
  assert.equal(tax.check({ categoryId: 'raman' }).value.mainCategoryId, 'lab');
});

test('duplicate names are found whatever the spelling, per level and parent', () => {
  const tax = buildTaxonomy([{ id: 'x', name: 'Generators Plus', level: 'category', parentId: 'equipment_tools', source: 'custom' }]);
  assert.ok(tax.duplicateOf('مولدات', { level: LEVELS.CATEGORY, parentId: 'equipment_tools' }));
  assert.ok(tax.duplicateOf('  generators  ', { level: LEVELS.CATEGORY, parentId: 'equipment_tools' }), 'case and spacing folded');
  assert.ok(tax.duplicateOf('GENERATORS plus', { level: LEVELS.CATEGORY, parentId: 'equipment_tools' }));
  assert.equal(tax.duplicateOf('مولدات', { level: LEVELS.CATEGORY, parentId: 'art_collectibles' }), null, 'another parent is another place');
  assert.ok(tax.duplicateOf('أخرى', { level: LEVELS.CATEGORY, parentId: 'art_collectibles' }));
});

test('search finds by Arabic, English and aliases, never duplicating a node', () => {
  const tax = buildTaxonomy([]);
  const ids = (q, opts) => tax.search(q, opts).map((n) => n.id);
  assert.ok(ids('مولد', { level: LEVELS.CATEGORY }).includes('equipment_generators'));
  assert.ok(ids('genset', { level: LEVELS.CATEGORY }).includes('equipment_generators'));
  assert.ok(ids('generator', { parentId: 'equipment_tools' }).includes('equipment_generators'));
  assert.ok(ids('جينيريتر').includes('equipment_generators'));
  const found = ids('مولدات', { level: LEVELS.CATEGORY });
  assert.equal(found.filter((id) => id === 'equipment_generators').length, 1);
  assert.ok(tax.searchWords({ categoryId: 'equipment_generators' }).includes('genset'));
});

test('fields follow the Category, then its Main Category', () => {
  const tax = buildTaxonomy([{ id: 'equipment_generators', source: 'builtin', name: '', fields: [{ id: 'custom_f_x1', type: 'text', label: 'رقم الجرد الداخلي' }] }]);
  const gen = tax.fieldsFor({ categoryId: 'equipment_generators' }).map((f) => f.id);
  assert.ok(gen.includes('manufacturer') && gen.includes('operating_hours'));
  assert.ok(gen.includes('custom_f_x1'), 'a field saved to the Category joins its template');
  assert.deepEqual(tax.fieldsFor({ categoryId: 'jewellery_diamonds' }).map((f) => f.id).slice(0, 3), ['carat_weight', 'measurements', 'shape']);
  assert.ok(tax.fieldsFor({ categoryId: 'art_paintings' }).some((f) => f.id === 'artist'));
  assert.equal(tax.fieldsFor({ categoryId: 'vehicles_plates_keys' }).length, 0, 'a Category can opt out');
  const serial = tax.fieldsFor({ categoryId: 'electronics_computers' }).find((f) => f.id === 'serial_number');
  assert.equal(serial, undefined, 'core fields are never duplicated by a template');
});

// ── migration placement ────────────────────────────────────────────────────

test('seeded categories are placed only by the explicit table, and a rename opts out', () => {
  const seed = (id) => DEFAULT_CATEGORIES.find((c) => c.id === id);
  assert.deepEqual(legacyPlacement(seed('c2')), { parentId: 'art_collectibles', mergedInto: 'art_antiques' });
  assert.deepEqual(legacyPlacement(seed('c1')), { parentId: 'art_collectibles', mergedInto: null });
  assert.deepEqual(legacyPlacement(seed('c20')), { parentId: 'equipment_tools', mergedInto: 'equipment_tools' });
  assert.deepEqual(legacyPlacement(seed('c19')), { parentId: 'previous_categories', mergedInto: null });
  assert.deepEqual(legacyPlacement({ ...seed('c2'), name: 'تحفي الخاصة' }), { parentId: 'previous_categories', mergedInto: null });
  assert.deepEqual(legacyPlacement({ id: 'cat-x', name: 'قطع أبي' }), { parentId: 'previous_categories', mergedInto: null });
});

test('an unmigrated flat category still displays and classifies, the same way it will be migrated', () => {
  const tax = buildTaxonomy([
    { id: 'c1', name: 'الفنون الجميلة' }, { id: 'c2', name: 'التحف والأنتيكات' }, { id: 'cat-x', name: 'قطع أبي' },
  ]);
  assert.deepEqual(tax.path({ categoryId: 'c1' }).main.id, 'art_collectibles');
  assert.equal(tax.path({ categoryId: 'c2' }).category.id, 'art_antiques', 'a mapped seed resolves to the built-in');
  assert.equal(tax.path({ categoryId: 'cat-x' }).main.id, 'previous_categories');
  assert.equal(tax.label('cat-x'), 'قطع أبي', 'the name is never lost');
  assert.ok(tax.mainCategories().some((n) => n.id === 'previous_categories'), '«تصنيفات سابقة» appears once it holds something');
});

// ── records ────────────────────────────────────────────────────────────────

test('a record keeps classification ids and field values, never labels', () => {
  const item = normalizeItem({
    name: 'مولد', mainCategoryId: 'equipment_tools', categoryId: 'equipment_generators',
    customFields: {
      manufacturer: 'Caterpillar', operating_hours: { value: 1200, unit: 'h' }, bad_KEY: 'x', __proto__: 'x',
      price: { amount: 5, currency: 'SAR' }, tags: ['a', 'a', 3],
    },
    customFieldDefs: [{ id: 'custom_f_abc', type: 'text', label: 'رقم الجرد' }, { id: 'nope', type: 'text', label: 'x' }],
  });
  assert.equal(item.subcategoryId, null);
  assert.deepEqual(item.customFields, {
    manufacturer: 'Caterpillar', operating_hours: { value: 1200, unit: 'h' }, price: { amount: 5, currency: 'SAR' }, tags: ['a'],
  });
  assert.deepEqual(item.customFieldDefs.map((d) => d.id), ['custom_f_abc'], 'only well-formed custom definitions');
  const old = normalizeItem({ name: 'قديم', categoryId: 'c1' });
  assert.equal(old.mainCategoryId, null);
  assert.deepEqual(old.customFields, {});
});

test('a built-in node’s settings record needs no name; a custom node does', () => {
  assert.deepEqual(normalizeCategory({ id: 'books_documents', name: '', source: 'builtin', hidden: true }).hidden, true);
  const backup = validateImport({ schemaVersion: 2, categories: [
    { id: 'books_documents', name: '', source: 'builtin', hidden: true },
    { id: 'x', name: '', level: 'category', source: 'custom' },
  ], items: [{ name: 'a', categoryId: 'art_paintings', mainCategoryId: 'art_collectibles' }] });
  assert.equal(backup.ok, true);
  assert.deepEqual(backup.data.categories.map((c) => c.id), ['books_documents']);
  assert.equal(backup.data.items[0].categoryId, 'art_paintings', 'a built-in id needs no record in the backup');
  const newer = validateImport({ schemaVersion: 2, taxonomy: { schemaVersion: 99 }, items: [{ name: 'a' }] });
  assert.equal(newer.ok, false);
});

test('field values are checked against their definition', () => {
  const def = (id) => ({ ...FIELD_DEFINITIONS.find((f) => f.id === id), source: 'builtin', options: FIELD_DEFINITIONS.find((f) => f.id === id).options?.map((o) => ({ id: o.id })) });
  assert.deepEqual(normalizeFieldValue(def('manufacture_year'), '٢٠١٩'), { value: 2019 });
  assert.equal(normalizeFieldValue(def('manufacture_year'), '19.5').error, 'field.error.integer');
  assert.deepEqual(normalizeFieldValue(def('operating_hours'), '1,200'), { value: { value: 1200, unit: 'h' } });
  assert.equal(normalizeFieldValue(def('next_maintenance'), '2026-02-30').error, 'field.error.date');
  assert.deepEqual(normalizeFieldValue(def('fuel_type'), 'diesel'), { value: 'diesel' });
  assert.equal(normalizeFieldValue(def('fuel_type'), 'kerosene').error, 'field.error.option');
  assert.deepEqual(normalizeFieldValue(def('languages'), ['ar', 'fa', 'ar']), { value: ['ar', 'fa'] });
  assert.equal(normalizeFieldValue(def('mac_address'), 'zz').error, 'field.error.format');
  assert.deepEqual(normalizeFieldValue(def('purchase_price'), '500', { currency: 'USD' }), { value: { amount: 500, currency: 'USD' } });
  assert.deepEqual(normalizeFieldValue({ type: 'url' }, 'javascript:alert(1)'), { error: 'field.error.url' });
  assert.deepEqual(normalizeFieldValue({ type: 'boolean' }, 'نعم'), { value: true });
  assert.deepEqual(normalizeFieldValue({ type: 'text' }, '   '), { value: undefined });
});

test('a customer’s field has a generated id, never its label', () => {
  const id = newCustomFieldId();
  assert.match(id, /^custom_f_[a-z0-9_]+$/);
  const def = normalizeCustomFieldDef({ id, type: 'select', label: '<b>الجهة</b>', options: ['أ', 'أ', '', 'ب'] });
  assert.deepEqual(def.options, ['أ', 'ب']);
  assert.equal(def.label, '<b>الجهة</b>', 'kept as text — it is drawn with textContent, never as markup');
  assert.equal(normalizeCustomFieldDef({ id, type: 'select', label: 'x', options: [] }), null, 'a select needs options');
  assert.equal(normalizeCustomFieldDef({ id: 'label as id', type: 'text', label: 'x' }), null);
  assert.deepEqual(sanitizeFieldValues({ 'bad key': 1, ok: { weird: true } }), {});
});

// ── spreadsheet import ─────────────────────────────────────────────────────

test('hierarchy columns are recognised in both languages; the old single column still maps', () => {
  const m = guessMapping(['الاسم', 'الفئة الرئيسية', 'الصنف', 'الصنف الفرعي']);
  assert.deepEqual([m.name, m.mainCategory, m.category, m.subcategory], [0, 1, 2, 3]);
  const e = guessMapping(['Name', 'Main Category', 'Category', 'Subcategory']);
  assert.deepEqual([e.mainCategory, e.category, e.subcategory], [1, 2, 3]);
  assert.equal(guessMapping(['الاسم', 'التصنيف']).category, 1);
});

test('an import resolves names to built-in ids, creates what is new, and never rejects a row for its category', () => {
  const taxonomy = buildTaxonomy([]);
  const { records, newTaxonomy } = planImport({
    rows: [
      ['مولد 1', 'معدات وأدوات', 'مولدات', 'مولدات ديزل'],
      ['لوحة', 'Art & Collectibles', 'Paintings', ''],
      ['جهاز', 'معدات مختبر الأحجار', 'Raman', ''],
      ['قطعة', '', 'مولد', ''],
      ['قطعة 2', '', 'أخرى', ''],
      ['قطعة 3', '', 'قطع أبي', ''],
    ],
    mapping: { name: 0, mainCategory: 1, category: 2, subcategory: 3 },
    existing: { taxonomy, locations: [], folders: [] },
  });
  assert.deepEqual([records[0].mainCategoryId, records[0].categoryId, records[0].subcategoryId],
    ['equipment_tools', 'equipment_generators', 'equipment_generators_diesel']);
  assert.deepEqual([records[1].mainCategoryId, records[1].categoryId], ['art_collectibles', 'art_paintings']);
  assert.ok(records[2].mainCategoryKey && records[2].categoryKey, 'a new Main Category and its Category are planned');
  assert.deepEqual([records[3].mainCategoryId, records[3].categoryId], ['equipment_tools', 'equipment_generators'], 'the old column: an alias that names exactly one Category');
  assert.equal(records[4].mainCategoryId, 'other', '«أخرى» exists in every Main Category: ambiguous, so kept as the customer’s own');
  assert.ok(records[4].categoryKey);
  assert.equal(records[5].mainCategoryId, 'other');
  const levels = newTaxonomy.nodes.map((n) => n.level);
  assert.equal(levels.indexOf('main') < levels.indexOf('category'), true, 'parents are created first');
  const created = Object.fromEntries(newTaxonomy.nodes.map((n, i) => [n.key, `id${i}`]));
  const resolved = attachTaxonomy(records, { categories: created, locations: {}, folders: {} });
  assert.ok(resolved[2].mainCategoryId.startsWith('id') && resolved[2].categoryId.startsWith('id'));
  assert.equal(resolved[2].categoryKey, undefined);
});

// ── the assistant ──────────────────────────────────────────────────────────

test('the assistant understands the hierarchy in Arabic and English', () => {
  const taxonomy = buildTaxonomy([]);
  const items = [
    { id: '1', name: 'مولد كاتربلر', mainCategoryId: 'equipment_tools', categoryId: 'equipment_generators', quantity: 1 },
    { id: '2', name: 'مضخة', mainCategoryId: 'equipment_tools', categoryId: 'equipment_pumps', quantity: 1 },
    { id: '3', name: 'لابتوب', mainCategoryId: 'electronics_devices', categoryId: 'electronics_computers', quantity: 1, locationId: 'l1' },
    { id: '4', name: 'لوحة', mainCategoryId: 'art_collectibles', categoryId: 'art_paintings', quantity: 1 },
  ];
  const lookups = { categories: [], taxonomy, locations: [{ id: 'l1', name: 'المكتب' }], folders: [] };
  const ask = (q) => askInventory(q, { items, lookups });
  assert.equal(ask('كم عندي معدات؟').total, 2);
  assert.deepEqual(ask('اعرض المولدات').items.map((i) => i.id), ['1']);
  assert.deepEqual(ask('وين الأجهزة الإلكترونية؟').items.map((i) => i.id), ['3']);
  assert.equal(ask('how many generators').total, 1);
  assert.equal(ask('How many Art & Collectibles?').total, 1);
  assert.deepEqual(ask('وش القطع بدون صنف؟').items.map((i) => i.id), []);
});
