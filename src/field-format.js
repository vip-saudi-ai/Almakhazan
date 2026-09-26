// How a stored field value reads, in the current language — for the detail
// sheet, the export and the assistant. The value itself is never translated;
// only the words around it (an option's label, a unit, Yes/No) are.

import { formatDate, formatNumber, t } from './i18n.js';
import { currencySymbol } from './labels.js';
import { hasFieldValue } from './custom-fields.js';
import { definitionFor, fieldLabel, measurementUnitLabel, optionLabel } from './taxonomy.js';

export function formatFieldValue(def, value, language) {
  if (!hasFieldValue(value)) return '';
  switch (def?.type) {
    case 'boolean': return value ? t('fields.yes') : t('fields.no');
    case 'select': return optionLabel(def, value, language);
    case 'multiselect': return (Array.isArray(value) ? value : [value]).map((id) => optionLabel(def, id, language)).join(t('common.listSeparator'));
    case 'currency':
      return value && typeof value === 'object'
        ? `${formatNumber(value.amount)} ${currencySymbol(value.currency)}`
        : String(value);
    case 'measurement': {
      const number = typeof value === 'object' ? value.value : value;
      const unit = typeof value === 'object' && value.unit ? value.unit : def.unit;
      return `${formatNumber(number)} ${measurementUnitLabel(unit, language)}`.trim();
    }
    case 'number':
    case 'decimal':
      return typeof value === 'number' ? formatNumber(value) : String(value);
    case 'date': {
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime()) ? String(value) : formatDate(date);
    }
    default:
      if (Array.isArray(value)) return value.join(t('common.listSeparator'));
      if (value && typeof value === 'object') return '';
      return String(value);
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
    const text = formatFieldValue(def, values[def.id]);
    if (text) current.push({ def, label: fieldLabel(def), text });
  }
  const previous = [];
  for (const id of Object.keys(values)) {
    if (seen.has(id)) continue;
    const def = definitionFor(id, { taxonomy, item });
    if (!def) continue;
    const text = formatFieldValue(def, values[id]);
    if (text) previous.push({ def, label: fieldLabel(def), text });
  }
  return { current, previous };
}
