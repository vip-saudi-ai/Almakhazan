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

import { CONDITIONS, UNCATEGORIZED_ID, isCurrencyCode, normalizeCurrencyCode } from './config.js';
import { normalizeArabic } from './search.js';
import { parseNumber } from './utils.js';
import { t } from './i18n.js';
import { LEVELS, OTHER_MAIN_ID, buildTaxonomy } from './taxonomy.js';

/**
 * The id a given row of a given import becomes.
 *
 * Derived from the job and the row rather than generated, so running the same
 * import twice writes the same documents twice instead of two copies of them.
 * That is what makes a failed import resumable: chunk 3 of 10 fails, the first
 * two are already written, and pressing "import" again rewrites those two
 * identically and carries on — where before it added 400 duplicates and then
 * the rest.
 */
export function importItemId(importId, sourceLine) {
  return `imp-${importId}-${String(sourceLine).padStart(6, '0')}`;
}

/**
 * The fields a spreadsheet can fill. Images are absent on purpose: a cell can
 * hold a path this app has no right to read, and a URL it cannot vouch for.
 */
export const FIELDS = [
  { key: 'name', get label() { return t('importField.name'); }, required: true, aliases: ['الاسم', 'اسم القطعة', 'القطعة', 'البيان', 'name', 'item', 'title', 'product', 'item name'] },
  { key: 'quantity', get label() { return t('importField.quantity'); }, aliases: ['الكمية', 'العدد', 'كمية', 'qty', 'quantity', 'count'] },
  { key: 'unit', get label() { return t('importField.unit'); }, aliases: ['الوحدة', 'وحدة', 'unit', 'uom'] },
  // The three levels of the classification. A file with only the old single
  // «التصنيف» column still maps to Category, and is placed safely below.
  { key: 'mainCategory', get label() { return t('importField.mainCategory'); }, taxonomy: 'categories', aliases: ['الفئة الرئيسية', 'الفئه الرئيسيه', 'main category', 'main'] },
  { key: 'category', get label() { return t('importField.category'); }, taxonomy: 'categories', aliases: ['الصنف', 'التصنيف', 'الفئة', 'القسم', 'النوع', 'category', 'type', 'group'] },
  { key: 'subcategory', get label() { return t('importField.subcategory'); }, taxonomy: 'categories', aliases: ['الصنف الفرعي', 'التصنيف الفرعي', 'subcategory', 'sub category', 'sub-category'] },
  { key: 'location', get label() { return t('importField.location'); }, taxonomy: 'locations', aliases: ['الموقع', 'المكان', 'الرف', 'المخزن', 'location', 'place', 'shelf', 'room'] },
  { key: 'folder', get label() { return t('importField.folder'); }, taxonomy: 'folders', aliases: ['المجلد', 'المجموعة', 'folder', 'collection'] },
  { key: 'condition', get label() { return t('importField.condition'); }, aliases: ['الحالة', 'حالة القطعة', 'condition', 'state'] },
  { key: 'brand', get label() { return t('importField.brand'); }, aliases: ['البراند', 'الماركة', 'الشركة', 'brand', 'maker', 'manufacturer'] },
  // A bare 'ref' is deliberately absent from every alias list below: it means a
  // serial number to a watch dealer, a SKU to a retailer and an internal
  // reference to everyone else. It is asked about (see AMBIGUOUS), never
  // guessed. The unambiguous spellings are claimed here.
  { key: 'sku', get label() { return t('importField.sku'); }, aliases: ['الرمز', 'الرمز SKU', 'رمز SKU', 'رقم الصنف', 'كود', 'sku', 'code'] },
  { key: 'barcode', get label() { return t('importField.barcode'); }, aliases: ['الباركود', 'باركود', 'barcode', 'ean', 'upc', 'gtin'] },
  { key: 'serialNumber', get label() { return t('importField.serialNumber'); }, aliases: ['الرقم التسلسلي', 'رقم تسلسلي', 'التسلسلي', 'serial', 'serial no', 'serial number', 's/n', 'sn'] },
  { key: 'modelNumber', get label() { return t('importField.modelNumber'); }, aliases: ['رقم الموديل', 'الموديل', 'موديل', 'الطراز', 'model', 'model no', 'model number'] },
  { key: 'referenceNumber', get label() { return t('importField.referenceNumber'); }, aliases: ['الرقم المرجعي', 'رقم مرجعي', 'رقم البوليصة', 'reference number', 'ref no'] },
  { key: 'description', get label() { return t('importField.description'); }, aliases: ['الوصف', 'ملاحظات', 'ملاحظة', 'تفاصيل', 'description', 'notes', 'note', 'details'] },
  { key: 'valuationMin', get label() { return t('importField.valuationMin'); }, aliases: ['أدنى قيمة', 'أدنى تقييم', 'السعر', 'القيمة', 'التكلفة', 'price', 'value', 'cost', 'min', 'min value', 'minimum value', 'min valuation', 'valuation', 'estimated value'] },
  { key: 'valuationMax', get label() { return t('importField.valuationMax'); }, aliases: ['أعلى قيمة', 'أعلى تقييم', 'أعلى سعر', 'max', 'max price', 'max value', 'maximum value', 'max valuation'] },
  { key: 'currency', get label() { return t('importField.currency'); }, aliases: ['العملة', 'currency'] },
];

const CONDITION_SET = new Set(CONDITIONS.map(normalizeArabic));
const CONDITION_BY_KEY = new Map(CONDITIONS.map((c) => [normalizeArabic(c), c]));
// A condition written in English maps to the stored value it names. The
// stored value never changes with the language; this only reads a file.
const ENGLISH_CONDITIONS = ['excellent', 'very good', 'good', 'fair', 'poor', 'for disposal'];
ENGLISH_CONDITIONS.forEach((word, index) => {
  CONDITION_SET.add(word);
  CONDITION_BY_KEY.set(word, CONDITIONS[index]);
});

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
    locations: byName(existing?.locations),
    folders: byName(existing?.folders),
  };
  const fresh = { categories: new Map(), locations: new Map(), folders: new Map() };
  const taxonomy = existing?.taxonomy || buildTaxonomy(existing?.categories || []);
  /** Classification nodes this file would create, in creation order (parents first). */
  const freshNodes = new Map();

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
        problems.push({ line, field: 'name', reason: t('importProblem.noName') });
      }
      return;
    }

    const record = { name, quantity: 1, unit: 'قطعة' };

    const rawQuantity = cell(row, mapping.quantity);
    if (rawQuantity) {
      const parsed = parseNumber(rawQuantity);
      if (parsed == null || parsed < 0) {
        problems.push({ line, field: 'quantity', reason: t('importProblem.quantity', { value: rawQuantity }), value: rawQuantity });
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
      else problems.push({ line, field: 'condition', reason: t('importProblem.condition', { value: rawCondition }), value: rawCondition });
    }

    for (const key of ['brand', 'sku', 'barcode', 'description',
      'serialNumber', 'modelNumber', 'referenceNumber']) {
      const value = cell(row, mapping[key]);
      if (value) record[key] = value;
    }

    // ── money ──
    //
    // A valuation is financial data, and the rule for financial data is that
    // it is imported as given or not imported at all. Nothing here repairs a
    // number, swaps a pair of them, or decides what an unrecognised currency
    // probably meant. Every one of those is a guess about money, and a guess
    // about money is wrong in a way nobody notices until it matters.
    const rawMin = cell(row, mapping.valuationMin);
    const rawMax = cell(row, mapping.valuationMax);
    const rawCurrency = cell(row, mapping.currency);
    const min = parseNumber(rawMin);
    const max = parseNumber(rawMax);
    let valuationFault = null;

    if (rawMin && min == null) {
      valuationFault = { field: 'valuationMin', reason: t('importProblem.value', { value: rawMin }), value: rawMin };
    } else if (rawMax && max == null) {
      // Read independently. An unreadable upper bound used to be dropped, and
      // "5,000 to unreadable" became a flat 5,000 — a narrower claim about the
      // object's worth than the file made, presented as the file's own.
      valuationFault = { field: 'valuationMax', reason: t('importProblem.value', { value: rawMax }), value: rawMax };
    } else if (min != null && max != null && max < min) {
      // Could be columns mapped the wrong way round, could be a typo, could be
      // the truth badly entered. Swapping them picks one of those readings and
      // writes it down as fact.
      valuationFault = {
        field: 'valuationMax',
        reason: t('importProblem.inverted', { max: String(max), min: String(min) }),
        value: rawMax,
      };
    } else if (rawCurrency && !isCurrencyCode(rawCurrency)) {
      // An explicit currency that is not a currency. Falling back to the
      // workspace default would turn one unreadable cell into a confidently
      // wrong number on every row of the file.
      valuationFault = {
        field: 'currency',
        reason: t('importProblem.currency', { value: rawCurrency }),
        value: rawCurrency,
      };
    }

    if (valuationFault) {
      // A row whose money cannot be read is not imported with the money left
      // out — that would be a record quietly worth nothing. It is held back
      // until the file is corrected.
      problems.push({ line, fatal: true, ...valuationFault });
      return;
    }

    if (min != null || max != null) {
      record.valuation = {
        min: min ?? max,
        max: max ?? min,
        // An empty cell is not a claim, so the workspace default applies. A
        // filled one is a claim, and by now it is known to be a real code.
        currency: rawCurrency ? normalizeCurrencyCode(rawCurrency, currency) : currency,
        source: 'import',
      };
    }

    // Taxonomies arrive as names. An existing name is reused; a new one is
    // collected so the screen can say how many will be created, rather than
    // creating them as a side effect nobody was told about.
    for (const [key, collection] of [['location', 'locations'], ['folder', 'folders']]) {
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
    classifyRow(record, {
      main: cell(row, mapping.mainCategory),
      category: cell(row, mapping.category),
      sub: cell(row, mapping.subcategory),
    }, { taxonomy, freshNodes, fresh });
    if (!record.categoryId && !record.categoryKey && !record.mainCategoryId && !record.mainCategoryKey) {
      record.categoryId = UNCATEGORIZED_ID;
    }

    // The row this record came from. It is what makes a retry write the same
    // documents instead of a second copy of them — see `importItemId`.
    record.sourceLine = line;
    records.push(record);
  });

  // Rows are classified rather than sorted into "worked" and "did not".
  // A single malformed cell is not a reason to reject a row, and it is not a
  // reason to import it silently either — it is a reason to say which rows
  // came through clean, which came through with something dropped, and which
  // could not come through at all.
  const byLine = new Map();
  for (const problem of problems) {
    const entry = byLine.get(problem.line) || { line: problem.line, reasons: [], fatal: false };
    entry.reasons.push(problem.reason);
    // A row is held back when it has no name, and when its money could not be
    // read. Those are the two things that cannot be imported "partly": a
    // nameless record is not a record, and a record whose valuation was
    // dropped is one that quietly says it is worth nothing.
    if (problem.field === 'name' || problem.fatal) entry.fatal = true;
    byLine.set(problem.line, entry);
  }

  const rowStatus = {
    ready: records.length - [...byLine.values()].filter((e) => !e.fatal).length,
    warning: [...byLine.values()].filter((e) => !e.fatal),
    error: [...byLine.values()].filter((e) => e.fatal),
  };

  return {
    records,
    problems,
    rowStatus,
    newTaxonomy: {
      categories: [...fresh.categories.values()],
      locations: [...fresh.locations.values()],
      folders: [...fresh.folders.values()],
      // What the category names above are: level, parent, and the key a record
      // carries until the node has an id. Mains come before their Categories,
      // Categories before their Subcategories.
      nodes: [...freshNodes.values()],
    },
  };
}

/** The key a node this file creates is known by until it has an id. */
function nodeKey(level, parentRef, name) {
  return `${level}:${parentRef || ''}:${normalizeArabic(name)}`;
}

function planNode(freshNodes, fresh, { level, name, parentId = null, parentKey = null }) {
  const key = nodeKey(level, parentId || parentKey, name);
  if (!freshNodes.has(key)) {
    freshNodes.set(key, { key, level, name, parentId, parentKey });
    if (!fresh.categories.has(key)) fresh.categories.set(key, name);
  }
  return key;
}

/**
 * A row's classification, from up to three names.
 *
 * Only an exact name — a label in Arabic or English, or an alias — reuses an
 * existing node, and only when exactly one node answers to it. With a Main
 * Category column the Category is looked for under it. With only the old
 * single «التصنيف» column, a name that is exactly one Category anywhere is
 * placed there (its Main Category derived); a name that is none, or more than
 * one («أخرى», «إكسسوارات»), becomes the customer's own Category under
 * «أخرى» — never a guess, and never a rejected row.
 */
function classifyRow(record, names, { taxonomy, freshNodes, fresh }) {
  const one = (list) => (list.length === 1 ? list[0] : null);
  let mainId = null;
  let mainKey = null;
  if (names.main) {
    const found = one(taxonomy.findByName(names.main, { level: LEVELS.MAIN }));
    if (found) mainId = found.id;
    else mainKey = planNode(freshNodes, fresh, { level: LEVELS.MAIN, name: names.main });
  }

  let categoryId = null;
  let categoryKey = null;
  if (names.category) {
    if (mainId) {
      const found = one(taxonomy.findByName(names.category, { level: LEVELS.CATEGORY, parentId: mainId }));
      if (found) categoryId = found.id;
      else categoryKey = planNode(freshNodes, fresh, { level: LEVELS.CATEGORY, name: names.category, parentId: mainId });
    } else if (mainKey) {
      categoryKey = planNode(freshNodes, fresh, { level: LEVELS.CATEGORY, name: names.category, parentKey: mainKey });
    } else {
      const found = one(taxonomy.findByName(names.category, { level: LEVELS.CATEGORY }));
      if (found) {
        categoryId = found.id;
        mainId = taxonomy.mainOf(found)?.id || null;
      } else {
        mainId = OTHER_MAIN_ID;
        const existingUnderOther = one(taxonomy.findByName(names.category, { level: LEVELS.CATEGORY, parentId: OTHER_MAIN_ID }));
        if (existingUnderOther) categoryId = existingUnderOther.id;
        else categoryKey = planNode(freshNodes, fresh, { level: LEVELS.CATEGORY, name: names.category, parentId: OTHER_MAIN_ID });
      }
    }
  }

  let subId = null;
  let subKey = null;
  if (names.sub && (categoryId || categoryKey)) {
    const found = categoryId ? one(taxonomy.findByName(names.sub, { level: LEVELS.SUB, parentId: categoryId })) : null;
    if (found) subId = found.id;
    else subKey = planNode(freshNodes, fresh, { level: LEVELS.SUB, name: names.sub, parentId: categoryId, parentKey: categoryKey });
  }

  if (mainId) record.mainCategoryId = mainId;
  if (mainKey) record.mainCategoryKey = mainKey;
  if (categoryId) record.categoryId = categoryId;
  if (categoryKey) { record.categoryKey = categoryKey; record.categoryName = names.category; }
  if (subId) record.subcategoryId = subId;
  if (subKey) record.subcategoryKey = subKey;
}

/**
 * Columns whose header could mean more than one field.
 *
 * "Ref" is a serial number to a watch dealer, a SKU to a retailer and an
 * internal reference to everyone else, and those go to three different places.
 * Guessing is worse than asking — a serial number silently filed as a SKU is
 * wrong in a way nobody notices until they need it.
 *
 * @returns {Array<{index: number, header: string, options: Array<{key, label}>}>}
 */
export function ambiguousColumns(headers, mapping) {
  const taken = new Set(Object.values(mapping || {}));
  const out = [];
  headers.forEach((header, index) => {
    if (taken.has(index)) return;
    const normal = normalizeArabic(header);
    const match = AMBIGUOUS.find((entry) => entry.match.some((alias) => normalizeArabic(alias) === normal));
    if (match) out.push({ index, header, options: match.options });
  });
  return out;
}

/** One answer to "what is this column?", labelled in the current language. */
function option(key) {
  return { key, get label() { return key ? t(`importField.${key}`) : t('importField.ignore'); } };
}

const AMBIGUOUS = [
  {
    match: ['ref', 'reference', 'مرجع'],
    options: [
      option('referenceNumber'),
      option('sku'),
      option('serialNumber'),
      option('barcode'),
      option(''),
    ],
  },
  {
    match: ['value', 'amount', 'القيمة', 'المبلغ'],
    options: [
      option('valuationMin'),
      option('valuationMax'),
      option(''),
    ],
  },
  {
    match: ['no', 'number', 'رقم', 'الرقم'],
    options: [
      option('sku'),
      option('barcode'),
      option('serialNumber'),
      option('quantity'),
      option(''),
    ],
  },
];

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
    for (const [field, keyField] of [['mainCategoryId', 'mainCategoryKey'], ['categoryId', 'categoryKey'], ['subcategoryId', 'subcategoryKey']]) {
      const key = out[keyField];
      if (!key) continue;
      const id = created.categories?.[key]
        // Resuming a job planned before the hierarchy, keyed by name alone.
        ?? (field === 'categoryId' && out.categoryName ? created.categories?.[normalizeArabic(out.categoryName)] : undefined);
      if (id) out[field] = id;
      delete out[keyField];
    }
    if (out.categoryName && !out.categoryId) {
      const id = created.categories?.[normalizeArabic(out.categoryName)];
      if (id) out.categoryId = id;
    }
    delete out.categoryName;
    for (const [key, collection] of [['location', 'locations'], ['folder', 'folders']]) {
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
