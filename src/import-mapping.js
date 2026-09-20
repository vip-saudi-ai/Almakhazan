// Turning a spreadsheet into records: which column means what, and what will
// actually be written.
//
// Deliberately pure — no DOM, no repository, no network — so the thing that
// decides what a customer's file becomes can be tested directly, and so the
// screen in front of it can show the same answer it is about to commit.
//
// Two rules run through all of it:
//
//   * Nothing is guessed silently. A column is auto-matched only when its
//     header is one of the names below, and the customer sees and can change
//     every match before anything is written.
//   * Nothing is coerced. A quantity that is not a number, or a condition
//     that is not one of ours, is reported as a problem on that row rather
//     than quietly replaced with a default that looks deliberate.

import { CONDITIONS, UNCATEGORIZED_ID } from './config.js';
import { normalizeArabic } from './search.js';
import { parseNumber } from './utils.js';

/**
 * The fields a spreadsheet can fill. Images are absent on purpose: a cell can
 * hold a path this app has no right to read, and a URL it cannot vouch for.
 */
export const FIELDS = [
  { key: 'name', label: 'الاسم', required: true, aliases: ['الاسم', 'اسم القطعة', 'القطعة', 'البيان', 'الصنف', 'name', 'item', 'title', 'product'] },
  { key: 'quantity', label: 'الكمية', aliases: ['الكمية', 'العدد', 'كمية', 'qty', 'quantity', 'count'] },
  { key: 'unit', label: 'الوحدة', aliases: ['الوحدة', 'وحدة', 'unit', 'uom'] },
  { key: 'category', label: 'التصنيف', taxonomy: 'categories', aliases: ['التصنيف', 'الفئة', 'القسم', 'النوع', 'category', 'type', 'group'] },
  { key: 'location', label: 'الموقع', taxonomy: 'locations', aliases: ['الموقع', 'المكان', 'الرف', 'المخزن', 'location', 'place', 'shelf', 'room'] },
  { key: 'folder', label: 'المجلد', taxonomy: 'folders', aliases: ['المجلد', 'المجموعة', 'folder', 'collection'] },
  { key: 'condition', label: 'الحالة', aliases: ['الحالة', 'حالة القطعة', 'condition', 'state'] },
  { key: 'brand', label: 'البراند', aliases: ['البراند', 'الماركة', 'الشركة', 'brand', 'maker', 'manufacturer'] },
  { key: 'sku', label: 'الرمز', aliases: ['الرمز', 'رقم الصنف', 'كود', 'sku', 'code', 'ref'] },
  { key: 'barcode', label: 'الباركود', aliases: ['الباركود', 'باركود', 'barcode', 'ean', 'upc'] },
  { key: 'description', label: 'الوصف', aliases: ['الوصف', 'ملاحظات', 'ملاحظة', 'تفاصيل', 'description', 'notes', 'note', 'details'] },
  { key: 'valuationMin', label: 'أدنى قيمة', aliases: ['أدنى قيمة', 'السعر', 'القيمة', 'التكلفة', 'price', 'value', 'cost', 'min'] },
  { key: 'valuationMax', label: 'أعلى قيمة', aliases: ['أعلى قيمة', 'أعلى سعر', 'max', 'max price'] },
  { key: 'currency', label: 'العملة', aliases: ['العملة', 'currency'] },
];

const CONDITION_SET = new Set(CONDITIONS.map(normalizeArabic));
const CONDITION_BY_KEY = new Map(CONDITIONS.map((c) => [normalizeArabic(c), c]));

/**
 * A first guess at the mapping, from the header row. Only exact matches after
 * Arabic normalisation — a fuzzy match that lands a price column on "quantity"
 * costs more than leaving it unmapped.
 *
 * @returns {Record<string, number>} field key → column index
 */
export function guessMapping(headers) {
  const normalized = headers.map((h) => normalizeArabic(h));
  const taken = new Set();
  const mapping = {};

  for (const field of FIELDS) {
    const aliases = field.aliases.map(normalizeArabic);
    const index = normalized.findIndex((h, i) => !taken.has(i) && h && aliases.includes(h));
    if (index >= 0) { mapping[field.key] = index; taken.add(index); }
  }
  return mapping;
}

const cell = (row, index) => (index == null || index < 0 ? '' : String(row[index] ?? '').trim());

/**
 * What the file would become. Nothing is written here; this is the answer the
 * preview shows and the answer the import then commits, from the same code.
 *
 * @param {{rows: string[][], lines?: number[], mapping: Record<string, number>, existing: {categories, locations, folders}, currency?: string}} input
 *   `lines[i]` is the row number `rows[i]` had in the file. Without it the
 *   numbering falls back to position, which is wrong the moment the file has
 *   a blank row in the middle — and every warning after it points elsewhere.
 * @returns {{records: object[], problems: object[], newTaxonomy: {categories: string[], locations: string[], folders: string[]}}}
 */
export function planImport({ rows, lines, mapping, existing, currency = 'SAR' }) {
  const lookup = {
    categories: byName(existing?.categories),
    locations: byName(existing?.locations),
    folders: byName(existing?.folders),
  };
  const fresh = { categories: new Map(), locations: new Map(), folders: new Map() };

  const records = [];
  const problems = [];

  rows.forEach((row, index) => {
    // +1 for the header, +1 because people count from 1.
    const line = lines?.[index] ?? index + 2;
    const name = cell(row, mapping.name);

    if (!name) {
      // A row with no name is not an error to argue with — spreadsheets are
      // full of blank separators and totals. It is reported and skipped.
      if (row.some((c) => String(c ?? '').trim())) {
        problems.push({ line, field: 'name', reason: 'بلا اسم — تُخطّى' });
      }
      return;
    }

    const record = { name, quantity: 1, unit: 'قطعة' };

    const rawQuantity = cell(row, mapping.quantity);
    if (rawQuantity) {
      const parsed = parseNumber(rawQuantity);
      if (parsed == null || parsed < 0) {
        problems.push({ line, field: 'quantity', reason: `كمية غير مفهومة: «${rawQuantity}»`, value: rawQuantity });
      } else {
        record.quantity = parsed;
      }
    }

    const unit = cell(row, mapping.unit);
    if (unit) record.unit = unit;

    const rawCondition = cell(row, mapping.condition);
    if (rawCondition) {
      const key = normalizeArabic(rawCondition);
      if (CONDITION_SET.has(key)) record.condition = CONDITION_BY_KEY.get(key);
      else problems.push({ line, field: 'condition', reason: `حالة غير معروفة: «${rawCondition}»`, value: rawCondition });
    }

    for (const key of ['brand', 'sku', 'barcode', 'description']) {
      const value = cell(row, mapping[key]);
      if (value) record[key] = value;
    }

    const min = parseNumber(cell(row, mapping.valuationMin));
    const max = parseNumber(cell(row, mapping.valuationMax));
    const rawMin = cell(row, mapping.valuationMin);
    if (rawMin && min == null) {
      problems.push({ line, field: 'valuationMin', reason: `قيمة غير مفهومة: «${rawMin}»`, value: rawMin });
    }
    if (min != null || max != null) {
      record.valuation = {
        min: min ?? max,
        max: max ?? min,
        currency: cell(row, mapping.currency) || currency,
        source: 'import',
      };
    }

    // Taxonomies arrive as names. An existing name is reused; a new one is
    // collected so the screen can say how many will be created, rather than
    // creating them as a side effect nobody was told about.
    for (const [key, collection] of [['category', 'categories'], ['location', 'locations'], ['folder', 'folders']]) {
      const value = cell(row, mapping[key]);
      if (!value) continue;
      const normal = normalizeArabic(value);
      const existingId = lookup[collection].get(normal);
      if (existingId) {
        record[`${key}Id`] = existingId;
      } else {
        if (!fresh[collection].has(normal)) fresh[collection].set(normal, value);
        record[`${key}Name`] = value;
      }
    }
    if (!record.categoryId && !record.categoryName) record.categoryId = UNCATEGORIZED_ID;

    records.push(record);
  });

  return {
    records,
    problems,
    newTaxonomy: {
      categories: [...fresh.categories.values()],
      locations: [...fresh.locations.values()],
      folders: [...fresh.folders.values()],
    },
  };
}

function byName(list) {
  const map = new Map();
  for (const entry of list || []) {
    const key = normalizeArabic(entry?.name);
    if (key && !map.has(key)) map.set(key, entry.id);
  }
  return map;
}

/** Resolves the names collected above once their records have real ids. */
export function attachTaxonomy(records, created) {
  return records.map((record) => {
    const out = { ...record };
    for (const [key, collection] of [['category', 'categories'], ['location', 'locations'], ['folder', 'folders']]) {
      const name = out[`${key}Name`];
      if (name) {
        const id = created[collection]?.[normalizeArabic(name)];
        if (id) out[`${key}Id`] = id;
        delete out[`${key}Name`];
      }
    }
    return out;
  });
}
