// What a Full Restore accepts from a backup: every record, exactly — or the
// backup is refused.
//
// An import may skip a line it cannot read and say so; a Full Restore may
// not. It replaces the inventory, so a record it skipped is a record the
// customer loses without being told which. Here each record is migrated from
// the shape its backup's schema gave it (`migrateBackupItem`) and then checked
// (`validateBackupItem`): if normalizing it would drop or change anything it
// carries — an image, a valuation, a condition, a field value, a reference to
// a folder, place or category the backup does not hold, text past a limit —
// the backup is refused, naming the record and the reason. Nothing is written
// until every record has passed (backup-reader.js verifyFullBackup).
//
// The small collections — classification, field definitions, places, folders
// — are held to the same rule by `validateBackupMetadata`.

import { AppError, toMillis } from './utils.js';
import {
  importItemContext, isKeptCategory, normalizeCategory, normalizeFolder, normalizeItem, normalizeLocation, validateQuantity,
} from './validation.js';
import { normalizeFieldRecord } from './custom-fields.js';
import { CONDITIONS, UNCATEGORIZED_ID } from './config.js';

/** A backup that cannot be restored whole, and why — never shown raw. */
export function invalidBackupRecord(collection, id, reason) {
  return new AppError('backup.invalidRecord', {
    code: 'backup/invalid-record',
    detail: { collection, id: typeof id === 'string' ? id.slice(0, 128) : null, reason },
  });
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Text fields whose value would be cut by normalization — cut is lost. */
const TEXT_FIELDS = ['name', 'sku', 'barcode', 'serialNumber', 'modelNumber', 'referenceNumber', 'brand', 'description', 'unit'];

/**
 * One record from a backup in today's shape. The only changes are the ones an
 * older schema needs — field names it used before they were renamed — so the
 * checks below compare like with like.
 */
export function migrateBackupItem(raw) {
  if (!isPlainObject(raw)) return raw;
  const out = { ...raw };
  const renames = [['cat', 'categoryId'], ['loc', 'locationId'], ['qty', 'quantity'], ['cond', 'condition'], ['desc', 'description'], ['price', 'valuation'], ['serial', 'serialNumber'], ['model', 'modelNumber'], ['reference', 'referenceNumber'], ['ref', 'referenceNumber']];
  for (const [from, to] of renames) {
    if (out[to] == null && out[from] != null) out[to] = out[from];
    delete out[from];
  }
  return out;
}

/**
 * The context records are checked against: the ids the backup itself holds,
 * plus the built-in classification every copy of the app carries.
 */
export function backupItemContext(metadata) {
  return importItemContext(metadata);
}

/**
 * One record, validated. Returns the record as it will be stored; throws
 * `backup/invalid-record` for anything that would not survive whole.
 */
export function validateBackupItem(input, context) {
  const raw = migrateBackupItem(input);
  if (!isPlainObject(raw)) throw invalidBackupRecord('items', null, 'not-a-record');
  if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 128) throw invalidBackupRecord('items', null, 'id');
  const id = raw.id;
  const item = normalizeItem(raw);
  if (item.id !== id.trim()) throw invalidBackupRecord('items', id, 'id');
  if (!item.name) throw invalidBackupRecord('items', id, 'name');

  for (const field of TEXT_FIELDS) {
    if (typeof raw[field] !== 'string') continue;
    const given = raw[field].trim();
    if (given && (item[field] || '').length < given.length) throw invalidBackupRecord('items', id, `text:${field}`);
  }
  if (raw.quantity != null && raw.quantity !== '' && !validateQuantity(raw.quantity, raw.unit).ok) throw invalidBackupRecord('items', id, 'quantity');
  if (raw.valuation != null && !item.valuation) throw invalidBackupRecord('items', id, 'valuation');
  if (typeof raw.condition === 'string' && raw.condition.trim() && !CONDITIONS.includes(raw.condition.trim())) throw invalidBackupRecord('items', id, 'condition');
  if (raw.images != null) {
    if (!Array.isArray(raw.images) || raw.images.length !== item.images.length) throw invalidBackupRecord('items', id, 'images');
  }
  if (raw.customFields != null) {
    if (!isPlainObject(raw.customFields)) throw invalidBackupRecord('items', id, 'customFields');
    const given = Object.entries(raw.customFields).filter(([, value]) => value != null && value !== '').length;
    if (Object.keys(item.customFields).length !== given) throw invalidBackupRecord('items', id, 'customFields');
  }
  if (raw.aiData != null && !item.aiData) throw invalidBackupRecord('items', id, 'aiData');
  for (const field of ['createdAt', 'updatedAt', 'deletedAt']) {
    if (raw[field] != null && !toMillis(raw[field])) throw invalidBackupRecord('items', id, `time:${field}`);
  }

  // Every reference resolves inside the backup (or to the built-in library).
  if (item.folderId && !context.folderIds.has(item.folderId)) throw invalidBackupRecord('items', id, 'folder');
  if (item.locationId && !context.locationIds.has(item.locationId)) throw invalidBackupRecord('items', id, 'location');
  if (item.categoryId !== UNCATEGORIZED_ID && !context.categoryIds.has(item.categoryId)) throw invalidBackupRecord('items', id, 'category');
  if (item.mainCategoryId && !context.categoryIds.has(item.mainCategoryId)) throw invalidBackupRecord('items', id, 'mainCategory');
  if (item.subcategoryId && !context.categoryIds.has(item.subcategoryId)) throw invalidBackupRecord('items', id, 'subcategory');
  return item;
}

/**
 * The small collections, validated whole: a record that would be dropped or
 * given a new id refuses the backup.
 *
 * @returns {{categories, fieldDefinitions, locations, folders}}
 */
export function validateBackupMetadata(raw) {
  const out = {};
  const rules = {
    categories: { normalize: normalizeCategory, keep: isKeptCategory },
    fieldDefinitions: { normalize: normalizeFieldRecord, keep: Boolean },
    locations: { normalize: normalizeLocation, keep: (record) => Boolean(record?.name) },
    folders: { normalize: (record) => normalizeFolder(record), keep: (record) => Boolean(record?.name) },
  };
  for (const [name, rule] of Object.entries(rules)) {
    const list = raw?.[name] == null ? [] : raw[name];
    if (!Array.isArray(list)) throw invalidBackupRecord(name, null, 'not-a-list');
    out[name] = list.map((record) => {
      if (!isPlainObject(record) || typeof record.id !== 'string' || !record.id.trim()) throw invalidBackupRecord(name, null, 'id');
      const normalized = rule.normalize(record);
      if (!normalized || !rule.keep(normalized) || normalized.id !== record.id.trim()) throw invalidBackupRecord(name, record.id, 'invalid');
      return normalized;
    });
  }
  return out;
}
