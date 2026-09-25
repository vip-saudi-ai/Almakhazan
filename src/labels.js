// How system values are shown, in the current language.
//
// Conditions, units, roles and activity actions are stored as stable values
// (the condition as its Arabic word, the unit as its Arabic abbreviation, the
// action as a code); these functions give their display label. Anything they
// do not recognise — a unit the customer typed, a category they created — is
// customer data, and is returned exactly as stored.

import {
  CONDITIONS, DEFAULT_CATEGORIES, DEFAULT_LOCATIONS, UNCATEGORIZED_ID, UNITS,
} from './config.js';
import { hasMessage, t } from './i18n.js';

const CONDITION_KEYS = ['excellent', 'veryGood', 'good', 'fair', 'poor', 'disposal'];
const CONDITION_KEY = new Map(CONDITIONS.map((value, index) => [value, `condition.${CONDITION_KEYS[index]}`]));

const UNIT_GROUP_KEYS = ['count', 'weight', 'volume', 'length', 'other'];
const UNIT_KEYS = [
  ['piece', 'box', 'carton', 'dozen', 'set', 'kit'],
  ['kg', 'g', 'ton', 'lb'],
  ['liter', 'ml', 'm3', 'gallon'],
  ['m', 'cm', 'mm', 'inch', 'foot'],
  ['unit', 'pack', 'roll', 'bundle'],
];
const UNIT_GROUP_KEY = new Map(Object.keys(UNITS).map((group, index) => [group, `unitGroup.${UNIT_GROUP_KEYS[index]}`]));
const UNIT_KEY = new Map(Object.values(UNITS).flatMap((units, g) => units.map((unit, u) => [unit, `unit.${UNIT_KEYS[g][u]}`])));

const DEFAULT_CATEGORY_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));
const DEFAULT_LOCATION_NAME = new Map(DEFAULT_LOCATIONS.map((l) => [l.id, l.name]));

export function conditionLabel(value) {
  const key = CONDITION_KEY.get(value);
  return key ? t(key) : (value || '');
}

export function unitLabel(value) {
  const key = UNIT_KEY.get(value);
  return key ? t(key) : (value || '');
}

export function unitGroupLabel(group) {
  const key = UNIT_GROUP_KEY.get(group);
  return key ? t(key) : group;
}

export function roleLabel(role) {
  return hasMessage(`role.${role}`) ? t(`role.${role}`) : (role || '');
}

export function actionLabel(action) {
  return hasMessage(`action.${action}`) ? t(`action.${action}`) : (action || '');
}

/** The short symbol for a currency: ر.س / SAR, $, €, £ — or the code itself. */
export function currencySymbol(code) {
  return hasMessage(`currency.${code}`) ? t(`currency.${code}`) : (code || '');
}

/** A category's name: the system and seeded ones in the language, as long as
 *  the customer has not renamed them; everything else exactly as written. */
export function categoryName(category) {
  if (!category) return '';
  if (category.id === UNCATEGORIZED_ID) return t('category.uncategorized');
  if (DEFAULT_CATEGORY_NAME.get(category.id) === category.name) return t(`category.${category.id}`);
  return category.name || '';
}

export function locationName(location) {
  if (!location) return '';
  if (DEFAULT_LOCATION_NAME.get(location.id) === location.name) return t(`location.${location.id}`);
  return location.name || '';
}
