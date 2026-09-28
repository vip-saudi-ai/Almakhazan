// The catalog layer without a browser: bundled data integrity, search ranking
// in Arabic and English, cascading scope, ids, and spreadsheet resolution.

import test from 'node:test';
import assert from 'node:assert/strict';

import { DOMAINS, isCatalogId, isCustomCatalogId, newCustomCatalogId, normalizeCatalogEntity } from '../../src/catalog/model.js';
import { builtinRows, BUILTIN_ID_PREFIXES } from '../../src/catalog/builtin.js';
import { validateCatalogData } from '../../src/catalog/validate.js';
import { catalogService } from '../../src/catalog/service.js';
import { buildTaxonomy, validateCatalog, fieldApplies } from '../../src/taxonomy.js';
import { FIELD_DEFINITIONS } from '../../src/locales/taxonomy-catalog.js';
import { planImport, guessMapping } from '../../src/import-mapping.js';
import { normalizeFieldValue } from '../../src/custom-fields.js';

const top = async (spec) => (await catalogService.search({ limit: 5, ...spec })).items.map((r) => r.entity.id);

test('bundled catalog data validates: unique ids, parents, domains, no cycles', () => {
  const rows = builtinRows();
  const result = validateCatalogData(rows);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.ok(rows.length > 1500, `catalog size ${rows.length}`);
  for (const row of rows) {
    assert.ok(isCatalogId(row.id), row.id);
    assert.ok(!isCustomCatalogId(row.id), `builtin id looks custom: ${row.id}`);
    assert.ok(BUILTIN_ID_PREFIXES.some((p) => row.id.startsWith(p)), `id without a known prefix: ${row.id}`);
  }
});

test('watch brands: about two hundred, all top-level', () => {
  const brands = builtinRows().filter((r) => r.entityType === 'brand' && r.domains.includes('watch'));
  assert.ok(brands.length >= 190 && brands.length <= 210, `watch brands ${brands.length}`);
  assert.ok(brands.every((b) => !b.parentId));
});

test('every specialist field is optional and every catalog field is well formed', () => {
  assert.deepEqual(validateCatalog(), []);
  for (const def of FIELD_DEFINITIONS) {
    assert.notEqual(def.required, true, `${def.id} must not be required`);
    if (def.type === 'catalog') assert.ok(DOMAINS[def.catalog.domain]?.types.includes(def.catalog.entityType), def.id);
  }
});

test('Arabic and English queries rank the exact brand first', async () => {
  assert.equal((await top({ domain: 'watch', entityType: 'brand', query: 'رولكس' }))[0], 'watch_brand_rolex');
  assert.equal((await top({ domain: 'watch', entityType: 'brand', query: 'Rolex' }))[0], 'watch_brand_rolex');
  assert.equal((await top({ domain: 'watch', entityType: 'brand', query: 'rolex' }))[0], 'watch_brand_rolex');
  assert.equal((await top({ domain: 'vehicle', entityType: 'manufacturer', query: 'تويوتا' }))[0], 'vehicle_make_toyota');
  assert.equal((await top({ domain: 'machinery', entityType: 'manufacturer', query: 'كاتربيلر' }))[0], 'mfr_caterpillar');
  assert.equal((await top({ domain: 'machinery', entityType: 'manufacturer', query: 'CAT' }))[0], 'mfr_caterpillar');
  assert.ok((await top({ domain: 'lab', entityType: 'manufacturer', query: 'Thermo' }))[0].startsWith('lab_manufacturer_thermo'));
});

test('references and models are found directly, by code and by alias', async () => {
  const daytona = await top({ domain: 'watch', entityType: 'reference', query: '126500' });
  assert.ok(daytona[0].startsWith('watch_ref_rolex_126500'), daytona[0]);
  const nautilus = await top({ domain: 'watch', entityType: 'reference', query: '5711/1A' });
  assert.ok(nautilus[0].startsWith('watch_ref_patek'), nautilus[0]);
  const collections = await top({ domain: 'watch', entityType: 'collection', query: 'daytona' });
  assert.ok(collections[0].includes('daytona'), collections[0]);
  const gx = await top({ domain: 'machinery', entityType: 'model', query: '320 gx' });
  assert.ok(gx[0].startsWith('mfr_model_caterpillar_320'), gx[0]);
  const lc = await top({ domain: 'vehicle', entityType: 'model', query: 'Land Cruiser' });
  assert.ok(lc[0].startsWith('vehicle_model_toyota_land'), lc[0]);
  const i50 = await top({ domain: 'lab', entityType: 'model', query: 'i50' });
  assert.ok(i50[0].includes('is50'), i50[0]);
});

test('short queries do not match inside words; a scoped search stays under its parent', async () => {
  const ap = await top({ domain: 'watch', entityType: 'brand', query: 'AP' });
  assert.ok(!ap.includes('watch_brand_czapek'));
  const rolexRefs = (await catalogService.search({ domain: 'watch', entityType: 'reference', ancestorId: 'watch_brand_rolex', limit: 100 })).items;
  assert.ok(rolexRefs.length > 5);
  assert.ok(rolexRefs.every((r) => catalogService.isWithin(r.entity.id, 'watch_brand_rolex')));
});

test('pagination is stable and bounded', async () => {
  const first = await catalogService.search({ domain: 'watch', entityType: 'brand', limit: 30 });
  assert.equal(first.items.length, 30);
  assert.ok(first.nextCursor);
  const second = await catalogService.search({ domain: 'watch', entityType: 'brand', limit: 30, cursor: first.nextCursor });
  const ids = new Set(first.items.map((r) => r.entity.id));
  assert.ok(second.items.every((r) => !ids.has(r.entity.id)));
  const huge = await catalogService.search({ domain: 'watch', entityType: 'brand', limit: 10_000 });
  assert.ok(huge.items.length <= 100);
});

test('custom ids never collide with built-in ids and normalise safely', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newCustomCatalogId()));
  assert.equal(ids.size, 500);
  for (const id of ids) { assert.ok(isCustomCatalogId(id)); assert.ok(/^cust_[a-z0-9]{1,60}$/.test(id), id); }
  const entity = normalizeCatalogEntity({ id: [...ids][0], domains: ['watch'], entityType: 'brand', nameAr: 'ماركتي', source: 'custom' });
  assert.equal(entity.source, 'custom');
  assert.equal(entity.status, 'active');
});

test('catalog and year values: optional, validated, never blocking', () => {
  const brand = FIELD_DEFINITIONS.find((d) => d.id === 'watch_brand');
  assert.deepEqual(normalizeFieldValue(brand, { ref: 'watch_brand_rolex', label: 'Rolex' }).value, { ref: 'watch_brand_rolex', label: 'Rolex' });
  assert.deepEqual(normalizeFieldValue(brand, { ref: null, label: 'Local maker' }).value, { ref: null, label: 'Local maker' });
  const year = FIELD_DEFINITIONS.find((d) => d.id === 'manufacture_year');
  assert.equal(normalizeFieldValue(year, '2019').value, 2019);
  assert.ok(normalizeFieldValue(year, '3100').error);
});

test('diamond grades appear only for a diamond', () => {
  const grade = FIELD_DEFINITIONS.find((d) => d.showWhen?.refIn?.includes('gem_diamond'));
  assert.ok(grade, 'a diamond-only field exists');
  const templateIds = new Set(['gem_type', grade.id]);
  assert.equal(fieldApplies(grade, { templateIds, values: { gem_type: { ref: 'gem_diamond', label: 'Diamond' } } }), true);
  assert.equal(fieldApplies(grade, { templateIds, values: { gem_type: { ref: 'gem_sapphire', label: 'Sapphire' } } }), false);
  assert.equal(fieldApplies(grade, { templateIds, values: {} }), false, 'hidden until the stone is a diamond');
});

test('spreadsheet import resolves unique matches, keeps unknown text, and never drops the cell', () => {
  const taxonomy = buildTaxonomy([]);
  const header = ['Name', 'Category', 'Brand', 'Model', 'Reference number', 'Year'];
  const mapping = guessMapping(header);
  assert.equal(mapping.year, 5);
  const { records, problems } = planImport({
    rows: [
      ['Daytona', 'Watches', 'Rolex', '', '126500LN', '2023'],
      ['My watch', 'Watches', 'Unknown Maker', '', 'X-1', ''],
      ['Car', 'Cars', 'تويوتا', 'Land Cruiser', '', '٢٠١٩'],
      ['Plain', '', 'Rolex', '', '', ''],
    ],
    mapping, existing: { taxonomy, locations: [], folders: [] },
  });
  assert.equal(records.length, 4);
  const [watch, unknown, car, plain] = records;
  assert.equal(watch.customFields.watch_brand.ref, 'watch_brand_rolex');
  assert.ok(watch.customFields.watch_reference.ref.startsWith('watch_ref_rolex_126500'));
  assert.ok(watch.customFields.watch_collection?.ref, 'the reference path fills the collection');
  assert.equal(watch.customFields.manufacture_year, 2023);
  assert.equal(watch.brand, 'Rolex');
  assert.equal(watch.referenceNumber, '126500LN');
  assert.deepEqual(unknown.customFields.watch_brand, { ref: null, label: 'Unknown Maker' });
  assert.deepEqual(unknown.customFields.watch_reference, { ref: null, label: 'X-1' });
  assert.equal(car.customFields.vehicle_manufacturer.ref, 'vehicle_make_toyota');
  assert.ok(car.customFields.vehicle_model.ref.startsWith('vehicle_model_toyota_land'));
  assert.equal(car.customFields.manufacture_year, 2019);
  assert.equal(plain.customFields, undefined, 'no template, no catalog fields');
  assert.equal(plain.brand, 'Rolex');
  assert.ok(problems.every((p) => !p.fatal));
});

test('an untouched currency field is empty, not an invalid number', () => {
  const price = FIELD_DEFINITIONS.find((d) => d.id === 'purchase_price');
  assert.equal(normalizeFieldValue(price, { amount: '', currency: 'SAR' }).value, undefined);
  assert.equal(normalizeFieldValue(price, { amount: '', currency: 'SAR' }).error, undefined);
  assert.deepEqual(normalizeFieldValue(price, { amount: '1500', currency: 'USD' }).value, { amount: 1500, currency: 'USD' });
});

// ── import: a child is linked only where its parent agrees ────────────────

import { repository } from '../../src/repository.js';

function withCustom(entities, fn) {
  const before = repository.state.catalogEntities;
  repository.state.catalogEntities = entities.map(normalizeCatalogEntity);
  try { return fn(); } finally { repository.state.catalogEntities = before; }
}

function importRows(rows) {
  const taxonomy = buildTaxonomy([]);
  const mapping = guessMapping(['Name', 'Category', 'Brand', 'Model', 'Reference number']);
  return planImport({ rows, mapping, existing: { taxonomy, locations: [], folders: [] } });
}

test('import matrix: resolved, unresolved, omitted and conflicting parents', () => {
  const { records, problems } = importRows([
    ['a', 'Cars', 'Toyota', 'Land Cruiser', ''],
    ['b', 'Cars', 'ABC', 'Land Cruiser', ''],
    ['c', 'Cars', '', 'Land Cruiser', ''],
    ['d', 'Cars', 'Mercedes-Benz', 'Land Cruiser', ''],
    ['e', 'Watches', 'Rolex', '', '126500LN'],
    ['f', 'Watches', 'Omega', '', '126500LN'],
    ['g', 'Watches', 'ABC Watches', '', '126500LN'],
    ['h', 'Watches', 'Patek Philippe', '', '5711/1A-010'],
    ['i', 'Watches', 'ABC', '', '5711/1A-010'],
  ]);
  const by = Object.fromEntries(records.map((r) => [r.name, r]));
  const warn = (line) => problems.filter((p) => p.line === line && !p.fatal).map((p) => p.reason).join(' | ');

  assert.equal(by.a.customFields.vehicle_manufacturer.ref, 'vehicle_make_toyota');
  assert.ok(by.a.customFields.vehicle_model.ref.startsWith('vehicle_model_toyota_land'));

  assert.deepEqual(by.b.customFields.vehicle_manufacturer, { ref: null, label: 'ABC' });
  assert.deepEqual(by.b.customFields.vehicle_model, { ref: null, label: 'Land Cruiser' }, 'no Toyota model under ABC');
  assert.match(warn(3), /Land Cruiser/);

  assert.equal(by.c.customFields.vehicle_manufacturer.ref, 'vehicle_make_toyota', 'an omitted parent comes from the path');
  assert.ok(by.c.customFields.vehicle_model.ref.startsWith('vehicle_model_toyota_land'));
  assert.equal(by.c.brand, 'Toyota');

  assert.equal(by.d.customFields.vehicle_manufacturer.ref, 'vehicle_make_mercedes_benz');
  assert.deepEqual(by.d.customFields.vehicle_model, { ref: null, label: 'Land Cruiser' }, 'not linked across makes');
  assert.match(warn(5), /Land Cruiser/);

  assert.equal(by.e.customFields.watch_brand.ref, 'watch_brand_rolex');
  assert.ok(by.e.customFields.watch_reference.ref.startsWith('watch_ref_rolex_126500'));
  assert.ok(by.e.customFields.watch_collection?.ref, 'the missing levels come from the path under a resolved brand');

  assert.equal(by.f.customFields.watch_brand.ref, 'watch_brand_omega');
  assert.deepEqual(by.f.customFields.watch_reference, { ref: null, label: '126500LN' });
  assert.equal(by.f.customFields.watch_collection, undefined, 'no Rolex path under Omega');
  assert.match(warn(7), /126500LN/);

  assert.deepEqual(by.g.customFields.watch_brand, { ref: null, label: 'ABC Watches' });
  assert.deepEqual(by.g.customFields.watch_reference, { ref: null, label: '126500LN' });

  assert.equal(by.h.customFields.watch_brand.ref, 'watch_brand_patek_philippe');
  assert.ok(by.h.customFields.watch_reference.ref.startsWith('watch_ref_patek'));

  assert.deepEqual(by.i.customFields.watch_reference, { ref: null, label: '5711/1A-010' });
  assert.equal(by.i.customFields.watch_collection, undefined);

  for (const r of records) {
    assert.equal(r.referenceNumber || '', { e: '126500LN', f: '126500LN', g: '126500LN', h: '5711/1A-010', i: '5711/1A-010' }[r.name] || '', 'the source cell is kept');
  }
  assert.ok(problems.every((p) => !p.fatal));
});

test('import: an ambiguous child is kept as written with a warning', () => {
  withCustom([
    { id: 'cust_amb1', domains: ['vehicle'], entityType: 'model', parentId: 'vehicle_make_toyota', nameEn: 'Zeta', source: 'custom' },
    { id: 'cust_amb2', domains: ['vehicle'], entityType: 'model', parentId: 'vehicle_make_nissan', nameEn: 'Zeta', source: 'custom' },
  ], () => {
    const { records, problems } = importRows([['z', 'Cars', '', 'Zeta', '']]);
    assert.deepEqual(records[0].customFields.vehicle_model, { ref: null, label: 'Zeta' });
    assert.equal(records[0].customFields.vehicle_manufacturer, undefined, 'no parent guessed');
    assert.ok(problems.some((p) => /Zeta/.test(p.reason) && !p.fatal));
    const scoped = importRows([['z2', 'Cars', 'Toyota', 'Zeta', '']]);
    assert.equal(scoped.records[0].customFields.vehicle_model.ref, 'cust_amb1', 'unique once the parent is known');
  });
});

test('import: a model and a reference that disagree are never both linked', () => {
  const taxonomy = buildTaxonomy([]);
  const mapping = guessMapping(['Name', 'Category', 'Brand', 'Model', 'Reference number']);
  const run = (model, ref) => planImport({ rows: [['x', 'Watches', 'Rolex', model, ref]], mapping, existing: { taxonomy, locations: [], folders: [] } }).records[0].customFields;
  // A model name the catalog does not know beside a known reference: the
  // reference is linked, the model kept as written, and nothing guessed between.
  const unknown = run('Submariner', '126500LN');
  assert.equal(unknown.watch_reference.ref, 'watch_ref_rolex_126500ln');
  assert.deepEqual(unknown.watch_model, { ref: null, label: 'Submariner' });
  assert.equal(unknown.watch_collection, undefined);
  // The model on the reference's own path: both linked.
  const agree = run('Cosmograph Daytona', '126500LN');
  assert.equal(agree.watch_model.ref, 'watch_model_rolex_cosmograph_daytona');
  assert.equal(agree.watch_reference.ref, 'watch_ref_rolex_126500ln');
  // A known model from another line of the same brand: both kept as written.
  const clashRows = planImport({ rows: [['y', 'Watches', 'Omega', 'Moonwatch', '2254.50.00']], mapping, existing: { taxonomy, locations: [], folders: [] } });
  const clash = clashRows.records[0].customFields;
  assert.deepEqual(clash.watch_model, { ref: null, label: 'Moonwatch' });
  assert.deepEqual(clash.watch_reference, { ref: null, label: '2254.50.00' });
  assert.equal(clash.watch_brand.ref, 'watch_brand_omega');
  assert.ok(clashRows.problems.some((p) => /2254\.50\.00/.test(p.reason) && !p.fatal));
  assert.deepEqual(run('Moonwatch', '').watch_model, { ref: null, label: 'Moonwatch' }, 'Rolex has no Moonwatch: kept as written');
});

// ── duplicates: the same rule for creating and renaming ───────────────────

test('duplicate checks: built-in wins, self is excluded, parents scope names, retired entries block', () => withCustom([
  { id: 'cust_abc', domains: ['watch'], entityType: 'brand', nameEn: 'ABC Watches', source: 'custom' },
  { id: 'cust_xyz', domains: ['watch'], entityType: 'brand', nameEn: 'XYZ Watches', source: 'custom' },
  { id: 'cust_old', domains: ['watch'], entityType: 'brand', nameEn: 'Old House', source: 'custom', status: 'retired' },
  { id: 'cust_mx_a', domains: ['vehicle'], entityType: 'model', parentId: 'vehicle_make_toyota', nameEn: 'Model X9', source: 'custom' },
], () => {
  const spec = { domain: 'watch', entityType: 'brand' };
  assert.equal(catalogService.findDuplicates({ ...spec, label: 'rolex', exceptId: 'cust_abc' }).exact?.id, 'watch_brand_rolex');
  assert.equal(catalogService.findDuplicates({ ...spec, label: 'رولكس', exceptId: 'cust_abc' }).exact?.id, 'watch_brand_rolex', 'Arabic name');
  assert.equal(catalogService.findDuplicates({ ...spec, label: '  abc   WATCHES ', exceptId: 'cust_xyz' }).exact?.id, 'cust_abc', 'case and spaces');
  assert.equal(catalogService.findDuplicates({ ...spec, label: 'ABC Watches', exceptId: 'cust_abc' }).exact, null, 'itself excluded');
  assert.equal(catalogService.findDuplicates({ ...spec, label: 'old house' }).retired?.id, 'cust_old');
  const vehicle = { domain: 'vehicle', entityType: 'model' };
  assert.equal(catalogService.findDuplicates({ ...vehicle, parentId: 'vehicle_make_nissan', label: 'Model X9' }).exact, null, 'another make may use the name');
  assert.equal(catalogService.findDuplicates({ ...vehicle, parentId: 'vehicle_make_toyota', label: 'model x9' }).exact?.id, 'cust_mx_a');
}));
