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
