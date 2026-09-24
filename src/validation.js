// Schema normalization and validation. Everything entering the app from a user,
// an import file, or the AI passes through here before it is stored or rendered.

import {
  CONDITIONS, CURRENCY_LABELS, INTEGER_UNITS, SCHEMA_VERSION, TEXT_LIMITS,
  UNCATEGORIZED_ID, VALUATION_SOURCES, VALUATION_TYPES, normalizeCurrencyCode,
} from './config.js';
import { normalizeDigits, parseNumber, toMillis, uid } from './utils.js';

export function cleanText(value, maxLength = 500) {
  if (value == null) return '';
  // Strip control characters; they have no legitimate use in these fields and
  // break both rendering and export.
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

const CURRENCY_PATTERNS = [
  [/ر\.?\s?س|ريال|\bsar\b|﷼/i, 'SAR'],
  [/\$|\busd\b|دولار/i, 'USD'],
  [/€|\beur\b|يورو/i, 'EUR'],
  [/£|\bgbp\b|استرليني|إسترليني|جنيه/i, 'GBP'],
];

export function detectCurrency(text, fallback = 'SAR') {
  const s = String(text || '');
  for (const [pattern, code] of CURRENCY_PATTERNS) {
    if (pattern.test(s)) return code;
  }
  return fallback;
}

const CURRENCY_TOKENS = /ر\.?\s?س|ريال|﷼|\bsar\b|\busd\b|\beur\b|\bgbp\b|دولار|يورو|جنيه|استرليني|إسترليني|\$|€|£/gi;

// A range separator only counts when it sits between two digits, so the thousands
// separators inside each bound are never mistaken for one.
const RANGE_MARKER = /(\d)\s*(?:-|–|—|~|إلى|الى|to)\s*(\d)/gi;

/** Removes grouping separators without ever merging the two bounds of a range. */
function parseBound(token) {
  let t = token.replace(/,/g, '');
  // "5.000" / "1.250.000" use the dot as a thousands separator.
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return parseNumber(t);
}

/**
 * Parses free-form valuation text into a structured range.
 * "5,000-8,000 ر.س" → { min: 5000, max: 8000, currency: 'SAR' }
 * A single number yields min === max. Returns null when no number is present.
 */
export function parseValuationText(text, options = {}) {
  if (text == null || text === '') return null;
  if (typeof text === 'object') return normalizeValuation(text);

  const raw = normalizeDigits(String(text));
  const currency = detectCurrency(raw, options.currency || 'SAR');

  // Drop currency markers first so they cannot sit between a range separator and
  // its second bound ("$1,200 to $1,500"), then mark ranges, then strip the rest.
  const withoutCurrency = raw.replace(CURRENCY_TOKENS, ' ');
  const marked = withoutCurrency.replace(RANGE_MARKER, '$1|$2');
  const numeric = marked.replace(/[^\d.,|]/g, ' ');

  const numbers = [];
  for (const chunk of numeric.split('|')) {
    for (const token of chunk.split(/\s+/)) {
      if (!token) continue;
      const n = parseBound(token);
      if (n !== null && n >= 0) {
        numbers.push(n);
        break; // one bound per side of the range
      }
    }
    if (numbers.length === 2) break;
  }
  if (!numbers.length) return null;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return {
    min,
    max,
    currency,
    source: options.source || VALUATION_SOURCES.MANUAL,
    valuationType: options.valuationType || VALUATION_TYPES.ESTIMATE,
    valuationDate: options.valuationDate ?? Date.now(),
  };
}

export function normalizeValuation(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number') return parseValuationText(value);
  if (typeof value !== 'object') return null;

  const min = parseNumber(value.min);
  const max = parseNumber(value.max);
  if (min === null && max === null) return null;

  const lo = min ?? max;
  const hi = max ?? min;
  // Any ISO 4217 code is kept as itself. This used to force anything outside a
  // four-entry list to SAR, so an imported spreadsheet valuing something at
  // 10,000 AED came out saying 10,000 ر.س — not a display quirk but the record
  // stating a number the owner never gave it.
  const currency = normalizeCurrencyCode(value.currency, 'SAR');
  const source = Object.values(VALUATION_SOURCES).includes(value.source)
    ? value.source : VALUATION_SOURCES.MANUAL;
  const valuationType = Object.values(VALUATION_TYPES).includes(value.valuationType)
    ? value.valuationType : VALUATION_TYPES.ESTIMATE;

  return {
    min: Math.max(0, Math.min(lo, hi)),
    max: Math.max(0, Math.max(lo, hi)),
    currency,
    source,
    valuationType,
    valuationDate: toMillis(value.valuationDate) || Date.now(),
  };
}

/** The single scalar used to sort and total a valuation range. */
export function valuationMidpoint(valuation) {
  if (!valuation) return null;
  const { min, max } = valuation;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return (min + max) / 2;
}

export function formatValuation(valuation, { compact = false } = {}) {
  if (!valuation) return '—';
  const fmt = (n) => (compact && n >= 1000
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    : new Intl.NumberFormat('en-US').format(n));
  const symbol = CURRENCY_LABELS[valuation.currency] || valuation.currency;
  const body = valuation.min === valuation.max
    ? fmt(valuation.min)
    : `${fmt(valuation.min)} – ${fmt(valuation.max)}`;
  return `${body} ${symbol}`;
}

/**
 * Validates a quantity. Zero is a legitimate value and must survive.
 * Returns { ok, value, error }.
 */
export function validateQuantity(input, unit) {
  if (input === '' || input == null) return { ok: true, value: 1 };
  const n = parseNumber(input);
  if (n === null) return { ok: false, error: 'الكمية يجب أن تكون رقماً' };
  if (!Number.isFinite(n)) return { ok: false, error: 'الكمية غير صالحة' };
  if (n < 0) return { ok: false, error: 'الكمية لا يمكن أن تكون سالبة' };
  if (unit && INTEGER_UNITS.has(unit) && !Number.isInteger(n)) {
    return { ok: false, error: `الوحدة "${unit}" لا تقبل كسوراً` };
  }
  return { ok: true, value: n };
}

const AI_CONDITIONS = new Set(CONDITIONS);

/** Validates an AI payload. Parsing succeeding does not make the content trustworthy. */
export function validateAiData(raw, context = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const score = (v) => {
    const n = parseNumber(v);
    if (n === null) return null;
    return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
  };

  const suggested = normalizeValuation(raw.suggestedValuation)
    || parseValuationText(raw.suggestedPrice, { source: VALUATION_SOURCES.AI });

  const condition = typeof raw.condition === 'string' && AI_CONDITIONS.has(raw.condition.trim())
    ? raw.condition.trim()
    : null;

  const result = {
    description: cleanText(raw.description, TEXT_LIMITS.description),
    evaluation: cleanText(raw.evaluation, TEXT_LIMITS.description),
    condition,
    localScore: score(raw.localScore),
    globalScore: score(raw.globalScore),
    suggestedValuation: suggested,
    model: cleanText(raw.model || context.model, 80) || null,
    analyzedAt: toMillis(raw.analyzedAt) || context.analyzedAt || Date.now(),
    imageHash: typeof raw.imageHash === 'string' && /^[a-f0-9]{8,64}$/i.test(raw.imageHash)
      ? raw.imageHash
      : (context.imageHash || null),
    // Suggestions for the form. They are proposals the customer applies, never
    // values written on their behalf, so they are cleaned but not required.
    suggestedName: cleanText(raw.suggestedName, TEXT_LIMITS.name) || '',
    suggestedCategory: cleanText(raw.suggestedCategory, 60) || '',
    brand: cleanText(raw.brand, TEXT_LIMITS.brand) || '',
    visibleText: cleanText(raw.visibleText, 500) || '',
  };

  const hasContent = result.description || result.evaluation || result.condition
    || result.localScore !== null || result.globalScore !== null || result.suggestedValuation;
  return hasContent ? result : null;
}

export function normalizeImage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const path = cleanText(raw.storagePath, 512);
  const url = cleanText(raw.url, 2048);
  if (!path && !url) return null;
  if (url && !/^https?:\/\//i.test(url)) return null;
  const id = cleanText(raw.id, 64) || uid('img');
  return {
    id,
    // Points at workspaces/{id}/media/{mediaId}, which owns the file and holds
    // the reference count. Older records predate media assets and fall back to
    // their own id.
    mediaId: cleanText(raw.mediaId, 64) || id,
    storagePath: path || null,
    thumbnailPath: cleanText(raw.thumbnailPath, 512) || null,
    url: url || null,
    thumbnailUrl: (() => {
      const t = cleanText(raw.thumbnailUrl, 2048);
      return t && /^https?:\/\//i.test(t) ? t : null;
    })(),
    originalFilename: cleanText(raw.originalFilename, 255) || null,
    mimeType: cleanText(raw.mimeType, 100) || null,
    width: parseNumber(raw.width) ?? null,
    height: parseNumber(raw.height) ?? null,
    fileSize: parseNumber(raw.fileSize) ?? null,
    hash: typeof raw.hash === 'string' && /^[a-f0-9]{8,64}$/i.test(raw.hash) ? raw.hash : null,
    uploadedAt: toMillis(raw.uploadedAt) || Date.now(),
    uploadedBy: cleanText(raw.uploadedBy, 128) || null,
  };
}

/**
 * Normalizes an arbitrary object into a valid item document.
 * Used for user input, imports, and migration alike.
 */
/**
 * The one definition of what a SKU is, for storing it and for comparing it:
 * control characters out, trimmed, bounded — and otherwise exactly as typed.
 * Case is kept and compared as is, leading zeros are kept, nothing is parsed
 * as a number. Every uniqueness check (add, edit, Trash restore, spreadsheet
 * import, JSON merge) compares values that went through this.
 */
export function normalizeSku(value) {
  return cleanText(value, TEXT_LIMITS.sku);
}

export function normalizeItem(raw, options = {}) {
  const now = Date.now();
  const src = raw && typeof raw === 'object' ? raw : {};

  const images = Array.isArray(src.images)
    ? src.images.map(normalizeImage).filter(Boolean)
    : [];

  const quantityCheck = validateQuantity(src.quantity ?? src.qty, src.unit);

  const item = {
    id: cleanText(src.id, 128) || uid('itm'),
    name: cleanText(src.name, TEXT_LIMITS.name),
    sku: normalizeSku(src.sku),
    barcode: cleanText(src.barcode, TEXT_LIMITS.barcode),
    // Kept as typed. A serial number is a string even when it looks like a
    // number: "0042" and "42" are different objects, and coercing either way
    // has made a record unfindable by the only identifier stamped on it.
    serialNumber: cleanText(src.serialNumber ?? src.serial ?? src.aiData?.serial, TEXT_LIMITS.serialNumber),
    modelNumber: cleanText(src.modelNumber ?? src.model, TEXT_LIMITS.modelNumber),
    referenceNumber: cleanText(src.referenceNumber ?? src.reference ?? src.ref, TEXT_LIMITS.referenceNumber),
    categoryId: cleanText(src.categoryId ?? src.cat, 128) || UNCATEGORIZED_ID,
    folderId: cleanText(src.folderId, 128) || null,
    locationId: cleanText(src.locationId ?? src.loc, 128) || null,
    quantity: quantityCheck.ok ? quantityCheck.value : 1,
    unit: cleanText(src.unit, 40) || 'قطعة',
    condition: AI_CONDITIONS.has(cleanText(src.condition ?? src.cond, 40))
      ? cleanText(src.condition ?? src.cond, 40)
      : '',
    brand: cleanText(src.brand, TEXT_LIMITS.brand),
    valuation: normalizeValuation(src.valuation ?? src.price),
    description: cleanText(src.description ?? src.desc, TEXT_LIMITS.description),
    images,
    primaryImageId: cleanText(src.primaryImageId, 64) || (images[0]?.id ?? null),
    aiData: validateAiData(src.aiData),
    // Where the record came from, when it came from a spreadsheet.
    //
    // First-class fields rather than something inferred from the id. Cancelling
    // a half-written import has to remove exactly the records that import
    // wrote and nothing else, and "the ids that happen to start with imp-" is
    // not a safe way to decide that — a customer can type an id, a restore can
    // carry one in, and an id is not a place to keep meaning. Both are null on
    // every record that was not imported.
    importJobId: cleanText(src.importJobId, 128) || null,
    sourceLine: Number.isInteger(src.sourceLine) && src.sourceLine > 0 ? src.sourceLine : null,
    createdAt: toMillis(src.createdAt) || now,
    createdBy: cleanText(src.createdBy, 128) || options.userId || null,
    updatedAt: toMillis(src.updatedAt) || now,
    updatedBy: cleanText(src.updatedBy, 128) || options.userId || null,
    deletedAt: toMillis(src.deletedAt) || null,
    deletedBy: cleanText(src.deletedBy, 128) || null,
    version: Number.isInteger(src.version) && src.version > 0 ? src.version : 1,
  };

  if (item.primaryImageId && !images.some((img) => img.id === item.primaryImageId)) {
    item.primaryImageId = images[0]?.id ?? null;
  }
  return item;
}

export function primaryImage(item) {
  if (!item?.images?.length) return null;
  return item.images.find((img) => img.id === item.primaryImageId) || item.images[0];
}

export function normalizeFolder(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    id: cleanText(src.id, 128) || uid('fld'),
    name: cleanText(src.name, TEXT_LIMITS.folderName),
    description: cleanText(src.description ?? src.desc, TEXT_LIMITS.folderDesc),
    icon: cleanText(src.icon, 8) || '🗂',
    color: /^#[0-9a-f]{6}$/i.test(String(src.color || '')) ? src.color : '#007AFF',
    createdAt: toMillis(src.createdAt) || Date.now(),
    createdBy: cleanText(src.createdBy, 128) || options.userId || null,
    updatedAt: toMillis(src.updatedAt) || Date.now(),
  };
}

export function normalizeCategory(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    id: cleanText(src.id, 128) || uid('cat'),
    name: cleanText(src.name, TEXT_LIMITS.categoryName),
    icon: cleanText(src.icon, 8) || '📦',
    createdAt: toMillis(src.createdAt) || Date.now(),
  };
}

export function normalizeLocation(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    id: cleanText(src.id, 128) || uid('loc'),
    name: cleanText(src.name, TEXT_LIMITS.locationName),
    createdAt: toMillis(src.createdAt) || Date.now(),
  };
}

/**
 * Validates an import payload before any of it is applied.
 * Returns { ok, errors, warnings, data, stats }.
 */
export function validateImport(parsed) {
  const errors = [];
  const warnings = [];

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['الملف لا يحتوي على بنية صحيحة'], warnings, data: null };
  }

  const version = parsed.schemaVersion ?? 1;
  if (!Number.isInteger(version) || version < 1) {
    errors.push('إصدار المخطط غير صالح');
  } else if (version > SCHEMA_VERSION) {
    errors.push(`الملف من إصدار أحدث (${version}) من إصدار التطبيق (${SCHEMA_VERSION})`);
  }

  const asArray = (value, label) => {
    if (value == null) return [];
    if (!Array.isArray(value)) {
      errors.push(`الحقل "${label}" يجب أن يكون قائمة`);
      return [];
    }
    return value;
  };

  const rawItems = asArray(parsed.items, 'items');
  const rawFolders = asArray(parsed.folders, 'folders');
  const rawCategories = asArray(parsed.categories, 'categories');
  const rawLocations = asArray(parsed.locations, 'locations');

  if (errors.length) return { ok: false, errors, warnings, data: null };
  if (!rawItems.length && !rawFolders.length && !rawCategories.length && !rawLocations.length) {
    return { ok: false, errors: ['الملف لا يحتوي على أي بيانات'], warnings, data: null };
  }

  const categories = rawCategories.map(normalizeCategory).filter((c) => c.name);
  const locations = rawLocations.map(normalizeLocation).filter((l) => l.name);
  const folders = rawFolders.map((f) => normalizeFolder(f)).filter((f) => f.name);

  const categoryIds = new Set([...categories.map((c) => c.id), UNCATEGORIZED_ID]);
  const folderIds = new Set(folders.map((f) => f.id));
  const locationIds = new Set(locations.map((l) => l.id));

  let droppedImages = 0;
  const items = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      warnings.push('تم تجاهل سجل غير صالح');
      continue;
    }
    const item = normalizeItem(raw);
    if (!item.name) {
      warnings.push('تم تجاهل قطعة بلا اسم');
      continue;
    }
    // Base64 payloads from old exports are not carried into the new model.
    if (typeof raw.img === 'string' && raw.img.startsWith('data:')) droppedImages += 1;

    if (item.folderId && !folderIds.has(item.folderId)) {
      warnings.push(`القطعة "${item.name}": المجلد غير موجود، أُعيدت للجرد الرئيسي`);
      item.folderId = null;
    }
    if (item.categoryId !== UNCATEGORIZED_ID && !categoryIds.has(item.categoryId)) {
      warnings.push(`القطعة "${item.name}": التصنيف غير موجود`);
      item.categoryId = UNCATEGORIZED_ID;
    }
    if (item.locationId && !locationIds.has(item.locationId)) {
      item.locationId = null;
    }
    items.push(item);
  }

  if (droppedImages) {
    warnings.push(`${droppedImages} صورة مضمّنة في الملف لم تُستورد — الصور تُخزَّن الآن في Firebase Storage`);
  }
  if (!items.length && !folders.length && !categories.length && !locations.length) {
    return { ok: false, errors: ['لم ينجح التحقق من أي سجل في الملف'], warnings, data: null };
  }

  return {
    ok: true,
    errors,
    warnings,
    data: { items, folders, categories, locations },
    stats: {
      items: items.length,
      folders: folders.length,
      categories: categories.length,
      locations: locations.length,
    },
  };
}
