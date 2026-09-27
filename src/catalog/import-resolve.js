// Spreadsheet cells → catalog selections.
//
// A file says "Rolex" or "126500LN" as text. Once a row's classification is
// known, its template names the catalog fields that text belongs to, and the
// text is matched against the catalog:
//
//   one exact match   → the catalog id, with the official name as the label
//   several matches   → a warning on the row, and the text kept as typed
//   no match          → the text kept as typed (a one-off manual value)
//
// The source cell is never discarded: `brand`, `modelNumber` and
// `referenceNumber` stay on the record exactly as the file had them, and a
// value that did not resolve is stored with `ref: null` and the file's text.
// Nothing here creates catalog entries — a spreadsheet is not a reason to
// grow the customer's catalog behind their back.

import { t } from '../i18n.js';
import { normalizeDigits } from '../utils.js';
import { catalogService } from './service.js';

const ROOT_TYPES = new Set(['brand', 'manufacturer', 'maker']);

function snapshot(entity) {
  return { ref: entity.id, label: entity.nameEn || entity.nameAr };
}

function manual(text) {
  return { ref: null, label: String(text).slice(0, 160) };
}

/**
 * @param {object} record the planned record (brand, modelNumber, referenceNumber)
 * @param {{taxonomy: object, year?: string}} context
 * @returns {{customFields: Record<string, any>, warnings: {field: string, reason: string, value: string}[]}}
 */
export function resolveImportCatalog(record, { taxonomy, year = '' }) {
  const customFields = {};
  const warnings = [];
  if (!taxonomy) return { customFields, warnings };
  const fields = taxonomy.fieldsFor({
    mainCategoryId: record.mainCategoryId || null,
    categoryId: record.categoryId || null,
    subcategoryId: record.subcategoryId || null,
  });
  const catalogFields = fields.filter((def) => def.type === 'catalog' && def.catalog);
  const root = catalogFields.find((def) => def.mirrors === 'brand')
    || catalogFields.find((def) => !def.catalog.parent && ROOT_TYPES.has(def.catalog.entityType));
  const byType = (type) => catalogFields.find((def) => def.catalog.entityType === type
    && def.catalog.domain === root?.catalog.domain);

  let anchor = null;
  const resolve = (def, text, ancestorId) => {
    if (!def || !text) return null;
    const result = catalogService.resolveText({
      domain: def.catalog.domain, entityType: def.catalog.entityType, ancestorId, text,
    });
    if (result.status === 'unique') {
      customFields[def.id] = snapshot(result.entity);
      return result.entity;
    }
    if (result.status === 'ambiguous') {
      warnings.push({
        field: def.id, value: text,
        reason: t('importProblem.catalogAmbiguous', { value: text, count: result.candidates.length }),
      });
    }
    customFields[def.id] = manual(text);
    return null;
  };

  if (root) {
    anchor = resolve(root, record.brand, null);
    const model = byType('model');
    const reference = byType('reference');
    const within = anchor?.id || null;
    // A reference is the more specific of the two, so it goes first: when it
    // resolves, its path fills the collection and model the file left out.
    const refEntity = reference ? resolve(reference, record.referenceNumber, within) : null;
    const modelEntity = !refEntity && model ? resolve(model, record.modelNumber, within) : null;
    const found = refEntity || modelEntity;
    if (found) {
      for (const entity of catalogService.path(found.id)) {
        const def = catalogFields.find((d) => d.catalog.entityType === entity.entityType
          && d.catalog.domain === root.catalog.domain);
        // Only levels the file left empty: what it did say is kept as said.
        if (def && !customFields[def.id]) customFields[def.id] = snapshot(entity);
      }
    }
  }

  const text = normalizeDigits(String(year || '')).trim();
  if (text) {
    const def = fields.find((d) => d.type === 'year');
    const value = Number(text);
    const min = def?.validation?.min ?? 1000;
    const max = new Date().getFullYear() + 2;
    if (!def) {
      // The classification has no year field: the cell has nowhere to go.
      warnings.push({ field: 'year', value: text, reason: t('importProblem.yearUnused', { value: text }) });
    } else if (Number.isInteger(value) && value >= min && value <= max) {
      customFields[def.id] = value;
    } else {
      warnings.push({ field: 'year', value: text, reason: t('importProblem.year', { value: text }) });
    }
  }
  return { customFields, warnings };
}
