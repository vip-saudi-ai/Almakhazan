// Golden parity fixtures: the reference implementation's answers to fixed
// inputs, written as JSON for the Dart tests to reproduce exactly.
//
//   node nazm_flutter/tool/export_fixtures.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const reference = join(app, '..', 'src');
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { normalizeArabic, nameSortKey } = await import(join(reference, 'search.js'));
const { normalizeDigits } = await import(join(reference, 'utils.js'));
const { validateQuerySpec } = await import(join(reference, 'query-spec.js'));
const { normalizeItem } = await import(join(reference, 'validation.js'));
const { AggregateBuilder } = await import(join(reference, 'aggregates.js'));
const { matchesSpec, compareForSort } = await import(join(reference, 'query-spec.js'));
const { searchTokensOf, catalogRefsOf } = await import(join(reference, 'item-index.js'));

const out = (name, data) => {
  const path = join(app, 'test', 'fixtures', name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`);
};

// ── text folding ───────────────────────────────────────────────────────────
const texts = [
  '', 'رولكس', 'أثر', 'إبريق', 'آلة', 'ٱسم', 'مكتبة', 'مستشفى', 'مؤسسة', 'رئيس', 'قطعةٌ ثمينةٌ',
  'كتـــاب', 'Rolex  Daytona', '  مسافة   بين  ', 'قطعة 2', 'قطعة 10', '١٢٣٤٥٦٧٨٩٠', '۱۲۳', '٣٫٥', '١٬٠٠٠',
  'Land Cruiser 200', 'iS50', '126500LN', 'Ω Omega', 'ÉCOLE', 'ﷲ', 'سُبْحَانَ', 'ۖقرآن', 'a'.repeat(300), '0042',
];
out('text_folding.json', texts.map((input) => ({
  input, normalizeArabic: normalizeArabic(input), nameSortKey: nameSortKey(input), normalizeDigits: normalizeDigits(input),
})));

// ── query contract ────────────────────────────────────────────────────────
const specs = [
  {},
  { filters: { mainCategoryId: 'equipment_tools' } },
  { filters: { updatedAt: { lt: 1700000000000 } }, sort: { field: 'updatedAt', direction: 'asc' } },
  { filters: { locationId: { in: ['loc_a', 'loc_b'] }, hasImages: false } },
  { filters: { locationId: { exists: false } } },
  { filters: [{ field: 'categoryId', op: 'eq', value: 'x' }] },
  { filters: { valuationCurrency: 'SAR', valuationMidpoint: { gt: 1500 } }, sort: { field: 'valuation', direction: 'desc' } },
  { filters: { deleted: true } },
  { text: '  مولدٌ  كهربائي ' },
  { text: '   ' },
  { limit: 200, projection: 'list' },
  // refused
  { filters: { secret: 'x' } },
  { filters: { sku: { in: ['a'] } } },
  { filters: { valuationMidpoint: { gt: 1 } } },
  { sort: { field: 'valuation' } },
  { sort: { field: 'price' } },
  { sort: { field: 'name', direction: 'up' } },
  { limit: 0 },
  { limit: 201 },
  { limit: 1.5 },
  { projection: 'everything' },
  { extra: 1 },
  { filters: { locationId: { in: [] } } },
  { filters: { locationId: { in: Array.from({ length: 31 }, (_, i) => `l${i}`) } } },
  { filters: { hasImages: 'yes' } },
  { filters: { quantity: { gte: '3' } } },
  { filters: { categoryId: '' } },
  { text: 'x'.repeat(201) },
];
out('query_specs.json', specs.map((input) => {
  try {
    const v = validateQuerySpec(input);
    return { input, ok: true, filters: v.filters, text: v.text, sort: v.sort, limit: v.limit, projection: v.projection };
  } catch (e) {
    return { input, ok: false, code: e.code, detail: e.detail };
  }
}));

// ── items and the aggregate they produce ──────────────────────────────────
const now = 1790000000000;
const raw = [
  { id: 'itm_1', name: 'ساعة رولكس', brand: 'Rolex', quantity: 1, categoryId: 'jewellery_watches', mainCategoryId: 'jewellery', valuation: { min: 150000, max: 180000, currency: 'SAR' }, condition: 'ممتازة', createdAt: now, updatedAt: now },
  { id: 'itm_2', name: 'مولد كهربائي 500', quantity: 2.5, unit: 'كغ', categoryId: 'equipment_generators', mainCategoryId: 'equipment_tools', locationId: 'loc_a', folderId: 'fld_a', sku: 'GEN-1', createdAt: now - 1, updatedAt: now - 1 },
  { id: 'itm_3', name: 'لوحة', categoryId: 'art_paintings', valuation: { min: 1500.5, max: 1500.5, currency: 'USD', source: 'manual' }, images: [{ id: 'img_1', mediaId: 'img_1', storagePath: 'local:img_1' }], createdAt: now - 2, updatedAt: now - 2 },
  { id: 'itm_4', name: 'قديم', categoryId: 'uncategorized', deletedAt: now - 3, createdAt: now - 3, updatedAt: now - 3 },
  { id: 'itm_5', name: 'Land Cruiser', categoryId: 'vehicles_cars', mainCategoryId: 'vehicles', customFields: { vehicle_manufacturer: { ref: 'vehicle_make_toyota', label: 'Toyota' }, manufacture_year: 2019 }, aiData: { localScore: 0.8 }, createdAt: now - 4, updatedAt: now - 4, version: 3 },
];
const items = raw.map((r) => normalizeItem(r));
const builder = new AggregateBuilder();
items.forEach((i) => builder.add(i));
out('items.json', items);
out('aggregate.json', builder.result());

// ── the query contract answered by the reference over a fixed dataset ─────
let seed = 20260928;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rand() * list.length)];
const words = ['مولد', 'كهربائي', 'ساعة', 'رولكس', 'لوحة', 'زيتية', 'سيارة', 'Land', 'Cruiser', 'Omega', 'المولد', 'جهاز', 'قطعة', 'iS50', 'Daytona'];
const dataset = [];
for (let i = 0; i < 300; i += 1) {
  const currency = pick(['SAR', 'SAR', 'USD', null]);
  const min = Math.round(rand() * 100000) / (rand() < 0.3 ? 4 : 1);
  dataset.push(normalizeItem({
    id: `ds_${String(i).padStart(4, '0')}_${Math.floor(rand() * 1000)}`,
    name: `${pick(words)} ${pick(words)} ${Math.floor(rand() * 50)}`,
    brand: rand() < 0.2 ? pick(['Rolex', 'Omega', 'Caterpillar']) : '',
    quantity: rand() < 0.1 ? 2.5 : Math.floor(rand() * 5) + 1,
    categoryId: pick(['uncategorized', 'art_paintings', 'equipment_generators', 'jewellery_watches']),
    mainCategoryId: pick([null, 'equipment_tools', 'jewellery']),
    locationId: pick([null, 'loc_a', 'loc_b']),
    folderId: pick([null, 'fld_a']),
    condition: pick(['', 'ممتازة', 'جيدة']),
    sku: rand() < 0.5 ? `SKU-${i}` : '',
    serialNumber: rand() < 0.2 ? `SN-${Math.floor(rand() * 40)}` : '',
    valuation: currency ? { min, max: min + Math.round(rand() * 1000), currency, source: 'manual', valuationDate: 1700000000000 } : null,
    images: rand() < 0.3 ? [{ id: `img_${i}`, mediaId: `img_${i}`, storagePath: `local:img_${i}` }] : [],
    aiData: null,
    customFields: rand() < 0.2 ? { watch_brand: { ref: 'watch_brand_rolex', label: 'Rolex' }, watch_reference: 'REF-126500' } : {},
    createdAt: 1700000000000 + Math.floor(rand() * 1000) * 1000,
    updatedAt: 1700000000000 + Math.floor(rand() * 5000) * 1000,
    deletedAt: rand() < 0.1 ? 1760000000000 : null,
  }));
}
const contractSpecs = [
  {},
  { sort: { field: 'name', direction: 'asc' } },
  { sort: { field: 'name', direction: 'desc' } },
  { sort: { field: 'updatedAt', direction: 'asc' } },
  { filters: { folderId: 'fld_a' } },
  { filters: { locationId: { exists: false } }, sort: { field: 'name', direction: 'asc' } },
  { filters: { hasImages: false, categoryId: 'art_paintings' } },
  { filters: { valuationCurrency: 'USD' }, sort: { field: 'valuation', direction: 'asc' } },
  { filters: { valuationCurrency: 'SAR', valuationMidpoint: { gt: 50000 } }, sort: { field: 'valuation', direction: 'desc' } },
  { filters: { deleted: true } },
  { filters: { condition: 'ممتازة', quantity: { gte: 3 } } },
  { filters: { condition: { exists: false } } },
  { filters: { valued: false } },
  { text: 'مولد' },
  { text: 'SKU-1' },
  { text: 'رولكس' },
  { text: 'ref-126500' },
  { text: 'land cru' },
  { filters: { updatedAt: { lt: 1700002000000 } } },
  { filters: { categoryId: { in: ['uncategorized', 'art_paintings'] } }, sort: { field: 'createdAt', direction: 'asc' } },
  { filters: { mainCategoryId: { exists: true }, locationId: 'loc_b' }, sort: { field: 'name', direction: 'asc' } },
];
out('contract.json', {
  items: dataset,
  tokens: Object.fromEntries(dataset.map((i) => [i.id, searchTokensOf(i)])),
  catalogRefs: Object.fromEntries(dataset.map((i) => [i.id, catalogRefsOf(i)])),
  specs: contractSpecs.map((input) => {
    const spec = validateQuerySpec(input);
    const ids = dataset.filter((i) => matchesSpec(i, spec, searchTokensOf)).sort(compareForSort(spec.sort)).map((i) => i.id);
    return { input, ids };
  }),
});

console.log(`fixtures: ${texts.length} texts, ${specs.length} query specs, ${items.length} items`);
