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
 * @returns {{customFields: Record<string, any>, warnings: {field: string, reason: string, value: string}[], brand: string}}
 *   `brand` is the brand a child's path supplied when the file named none.
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

  const lookup = (def, text, ancestorId) => catalogService.resolveText({
    domain: def.catalog.domain, entityType: def.catalog.entityType, ancestorId, text,
  });
  const ambiguous = (def, text, count) => warnings.push({
    field: def.id, value: text, reason: t('importProblem.catalogAmbiguous', { value: text, count }),
  });
  const mismatch = (def, text, parent) => warnings.push({
    field: def.id, value: text, reason: t('importProblem.catalogParentMismatch', { value: text, parent }),
  });

  let brandLabel = '';
  if (root) {
    const domain = root.catalog.domain;
    const brandText = String(record.brand || '').trim();
    // The parent the file names decides where its children may be found:
    //   named and found once  → children are looked up under it only;
    //   named and not found   → children are kept as written, never linked to
    //                           some other parent's entry;
    //   not named             → a child found once anywhere may bring its
    //                           path (Land Cruiser → Toyota).
    let anchor = null;
    let trusted = true;
    if (brandText) {
      const result = lookup(root, brandText, null);
      if (result.status === 'unique') {
        anchor = result.entity;
        customFields[root.id] = snapshot(anchor);
      } else {
        if (result.status === 'ambiguous') ambiguous(root, brandText, result.candidates.length);
        customFields[root.id] = manual(brandText);
        trusted = false;
      }
    }

    const child = (def, text) => {
      if (!def || !text) return null;
      if (!trusted) {
        customFields[def.id] = manual(text);
        if (lookup(def, text, null).status !== 'none') mismatch(def, text, brandText);
        return null;
      }
      const result = lookup(def, text, anchor?.id || null);
      if (result.status === 'unique') {
        customFields[def.id] = snapshot(result.entity);
        return result.entity;
      }
      customFields[def.id] = manual(text);
      if (result.status === 'ambiguous') ambiguous(def, text, result.candidates.length);
      else if (anchor && lookup(def, text, null).status !== 'none') mismatch(def, text, brandText);
      return null;
    };

    const reference = byType('reference');
    const model = byType('model');
    const refText = String(record.referenceNumber || '').trim();
    const modelText = String(record.modelNumber || '').trim();
    const refEntity = child(reference, refText);
    const modelEntity = child(model, modelText);

    // Two catalog answers from the same row must describe one object: a model
    // that is not on the reference's path contradicts it, and neither is
    // trusted over the other.
    if (refEntity && modelEntity && !catalogService.isWithin(refEntity.id, modelEntity.id)) {
      customFields[reference.id] = manual(refText);
      customFields[model.id] = manual(modelText);
      mismatch(reference, refText, modelText);
    } else {
      const found = customFields[reference?.id]?.ref ? refEntity : modelEntity;
      // A model the file gave that is not in the catalog says nothing about
      // which collection the reference is in: the levels between are left
      // empty rather than filled with the catalog's guess beside it.
      const modelUnlinked = found === refEntity && modelText && !modelEntity;
      if (found && !modelUnlinked) {
        // Only levels the file left empty are filled from the path: what it
        // did say is kept as said.
        for (const entity of catalogService.path(found.id)) {
          const def = catalogFields.find((d) => d.catalog.entityType === entity.entityType && d.catalog.domain === domain);
          if (def && !customFields[def.id]) customFields[def.id] = snapshot(entity);
        }
        if (!brandText && customFields[root.id]?.ref) brandLabel = customFields[root.id].label;
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
  return { customFields, warnings, brand: brandLabel };
}
