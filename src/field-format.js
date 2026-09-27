// How a stored field value reads, in the current language — for the detail
// sheet, the export and the assistant. The value itself is never translated;
// only the words around it (an option's label, a unit, Yes/No) are.

import { formatDate, formatNumber, t } from './i18n.js';
import { currencySymbol } from './labels.js';
import { hasFieldValue } from './custom-fields.js';
import { definitionFor, fieldLabel, measurementUnitLabel, optionLabel } from './taxonomy.js';

/**
 * How a catalog selection reads now. The catalog service registers itself
 * here (catalog/service.js), so a label follows the language and a corrected
 * catalog name; without it — or for an id this app does not know — the
 * snapshot stored with the value is what is shown. Never the bare id.
 */
let catalogLabel = null;
export function registerCatalogLabels(resolver) {
  catalogLabel = typeof resolver === 'function' ? resolver : null;
}

export function catalogValueText(value, language) {
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  const live = value.ref && catalogLabel ? catalogLabel(value.ref, language) : '';
  return live || value.label || '';
}

/**
 * Any stored value as plain text, for a field whose type does not describe it
 * (a recovered or damaged one). Never "[object Object]", never markup.
 */
function plainValue(value) {
  if (Array.isArray(value)) return value.map((entry) => (typeof entry === 'object' ? '' : String(entry))).filter(Boolean).join(t('common.listSeparator'));
  if (value && typeof value === 'object') {
    if ('label' in value) return String(value.label || '');
    if ('amount' in value) return `${formatNumber(Number(value.amount) || 0)} ${currencySymbol(value.currency)}`.trim();
    if ('value' in value) return `${formatNumber(Number(value.value) || 0)} ${value.unit ? measurementUnitLabel(value.unit) : ''}`.trim();
    return '';
  }
  return String(value);
}

export function formatFieldValue(def, value, language) {
  if (!hasFieldValue(value)) return '';
  switch (def?.type) {
    case 'boolean': return typeof value === 'boolean' ? (value ? t('fields.yes') : t('fields.no')) : plainValue(value);
    case 'select': return optionLabel(def, value, language);
    case 'multiselect': return (Array.isArray(value) ? value : [value]).map((id) => optionLabel(def, id, language)).join(t('common.listSeparator'));
    case 'currency':
      return plainValue(value);
    case 'measurement': {
      const number = typeof value === 'object' ? value.value : value;
      const unit = typeof value === 'object' && value.unit ? value.unit : def.unit;
      return `${formatNumber(number)} ${measurementUnitLabel(unit, language)}`.trim();
    }
    case 'number':
    case 'decimal':
      return typeof value === 'number' ? formatNumber(value) : plainValue(value);
    case 'catalog': return catalogValueText(value, language);
    case 'year': return typeof value === 'number' ? String(value) : plainValue(value);
    case 'date': {
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime()) ? String(value) : formatDate(date);
    }
    default:
      return plainValue(value);
  }
}

/**
 * A record's field values as rows to show: the ones its classification
 * recommends first, in the template's order, then any others it carries.
 * Empty values are left out — no empty rows.
 *
 * @returns {{current: Array<{def, label, text}>, previous: Array<{def, label, text}>}}
 */
export function fieldRows(item, taxonomy) {
  const values = item?.customFields || {};
  const template = taxonomy.fieldsFor({
    mainCategoryId: item.mainCategoryId, categoryId: item.categoryId, subcategoryId: item.subcategoryId,
  });
  const own = item?.customFieldDefs || [];
  const current = [];
  const seen = new Set();
  for (const def of [...template, ...own]) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    let text = formatFieldValue(def, values[def.id]);
    // A value kept under the older field this one supersedes («الشركة
    // المصنعة» typed as text before the catalog) reads under the new label
    // until the record is next saved — never as a stray "previous" row.
    if (!text) {
      for (const old of def.supersedes || []) {
        if (seen.has(old) || !(old in values)) continue;
        text = plainValue(values[old]);
        if (text) { seen.add(old); break; }
      }
    }
    if (text) current.push({ def, label: fieldLabel(def), text });
  }
  const previous = [];
  for (const id of Object.keys(values)) {
    if (seen.has(id)) continue;
    // Never skipped: a value whose definition was lost still has a row, under
    // a definition inferred from the value («حقل محفوظ سابقاً»).
    const def = definitionFor(id, { taxonomy, item, value: values[id] });
    if (!def) continue;
    const text = formatFieldValue(def, values[id]);
    if (text) previous.push({ def, label: fieldLabel(def), text });
  }
  return { current, previous };
}
