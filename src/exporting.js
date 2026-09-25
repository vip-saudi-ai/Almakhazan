// Export, backup, import and restore.
//
// The JSON file is a *metadata* backup: with images held in Storage, it carries
// their paths and URLs, not their bytes. That distinction is stated in the file
// itself and in the UI, so nobody mistakes it for a full media backup.

import { ACTIONS, APP_VERSION, SCHEMA_VERSION } from './config.js';
import { assertNoUnfinishedRestore } from './restore.js';
import { repository } from './repository.js';
import { AppError, toDate } from './utils.js';
import { t } from './i18n.js';
import { actionLabel } from './labels.js';
import { formatValuation, valuationMidpoint } from './validation.js';
import { buildWorkbook } from './xlsx-writer.js';
import { saveFile } from './platform.js';

// A download in a browser, the share sheet (Files, Mail, AirDrop) in the
// native app: src/platform.js decides, and throws if the file cannot be handed
// over — which the restore path depends on.
const download = (blob, filename) => saveFile(blob, filename);

/** Never carried from an imported file into a record. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Hands a backup file to the customer, and throws if the browser refuses.
 * The restore path depends on this throwing: a silent failure here would mean
 * the safety net was never actually there.
 */
export async function saveBackupFile(text, prefix = 'nazm_backup') {
  if (typeof text !== 'string' || text.length < 2) {
    throw new AppError('error.export/empty', { code: 'export/empty' });
  }
  const blob = new Blob([text], { type: 'application/json' });
  await download(blob, `${prefix}_${stamp()}.json`);
}

export async function exportExcel() {
  const repo = repository;
  // An export is a statement about the whole inventory. If only a window is
  // loaded this refuses loudly rather than writing a short file that looks
  // complete. Callers load first — see `withFullInventory`.
  repo.assertItemsComplete('partial.export');
  const items = repo.liveItems();

  const itemRows = [[
    // Headings in the language on screen; the values are the records' own.
    // The spreadsheet import recognises both languages' headings.
    ...[
      'field.sku', 'field.barcode', 'field.name', 'field.category', 'field.folder', 'field.location',
      'field.quantity', 'field.unit', 'field.condition', 'field.brand',
      'field.serialNumber', 'field.modelNumber', 'field.referenceNumber',
      'export.minValuation', 'export.maxValuation', 'field.currency', 'export.valuationSource',
      'export.aiLocalScore', 'export.aiGlobalScore',
      'export.aiMinEstimate', 'export.aiMaxEstimate',
      'export.aiDescription', 'field.description', 'export.createdAt', 'export.updatedAt',
    ].map((key) => t(key)),
  ]];

  for (const item of items) {
    const ai = item.aiData;
    itemRows.push([
      item.sku || '',
      item.barcode || '',
      item.name || '',
      repo.category(item.categoryId).name,
      repo.folder(item.folderId)?.name || '',
      repo.location(item.locationId)?.name || '',
      item.quantity,
      item.unit || '',
      item.condition || '',
      item.brand || '',
      item.serialNumber || '',
      item.modelNumber || '',
      item.referenceNumber || '',
      item.valuation?.min ?? null,
      item.valuation?.max ?? null,
      item.valuation?.currency || '',
      item.valuation?.source || '',
      ai?.localScore ?? null,
      ai?.globalScore ?? null,
      ai?.suggestedValuation?.min ?? null,
      ai?.suggestedValuation?.max ?? null,
      ai?.description || '',
      item.description || '',
      toDate(item.createdAt),
      toDate(item.updatedAt),
    ]);
  }

  const sheets = [{ name: t('export.sheetInventory'), rows: itemRows }];

  if (repo.state.folders.length) {
    sheets.push({
      name: t('export.sheetFolders'),
      rows: [
        ['field.folder', 'field.description', 'export.itemCount', 'home.statQuantity', 'export.folderCreated'].map((key) => t(key)),
        ...repo.state.folders.map((folder) => {
          const inFolder = items.filter((i) => i.folderId === folder.id);
          return [
            folder.name,
            folder.description || '',
            inFolder.length,
            inFolder.reduce((sum, i) => sum + (i.quantity || 0), 0),
            toDate(folder.createdAt),
          ];
        }),
      ],
    });
  }

  if (repo.state.categories.length) {
    sheets.push({
      name: t('export.sheetCategories'),
      rows: [
        ['field.category', 'export.itemCount', 'home.statQuantity'].map((key) => t(key)),
        ...repo.state.categories.map((category) => {
          const inCategory = items.filter((i) => i.categoryId === category.id);
          return [
            category.name,
            inCategory.length,
            inCategory.reduce((sum, i) => sum + (i.quantity || 0), 0),
          ];
        }),
      ],
    });
  }

  if (repo.state.activity.length) {
    sheets.push({
      name: t('export.sheetActivity'),
      rows: [
        ['export.date', 'export.action', 'common.item', 'export.user'].map((key) => t(key)),
        ...repo.state.activity.map((entry) => [
          toDate(entry.timestamp),
          actionLabel(entry.action),
          entry.itemName || entry.folderName || entry.categoryName || '',
          entry.userName || entry.userId || '',
        ]),
      ],
    });
  }

  try {
    await download(buildWorkbook(sheets), `${t('export.filePrefix')}_${stamp()}.xlsx`);
  } catch (error) {
    console.error('[export] Excel export failed', error);
    throw new AppError('error.export/excel', { code: 'export/excel', cause: error });
  }
}

/**
 * Writes the JSON backup.
 *
 * @returns {{bytes: number, restorable: boolean}} `restorable` is false when
 *   the file is past `MAX_BACKUP_FILE_BYTES` — NAZM's own restore would refuse
 *   it — so the caller tells the customer now rather than on the day they
 *   need it. The file is still delivered: it is their data, readable as JSON.
 */
export async function exportJSON() {
  const repo = repository;
  repo.assertItemsComplete('partial.backup');
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    backupType: 'metadata-only',
    imagesIncluded: false,
    // What this file is not, said in the file itself.
    note: repo.session.mode === 'cloud'
      ? t('export.noteCloud')
      : t('export.noteDevice'),
    workspaceId: repo.session.workspaceId,
    items: repo.state.items,
    folders: repo.state.folders,
    categories: repo.state.categories,
    locations: repo.state.locations,
  };
  let blob;
  try {
    blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  } catch (error) {
    console.error('[export] JSON export failed', error);
    // Past what the browser can hold as one text: said as that, not as a
    // generic failure.
    throw new AppError(error instanceof RangeError ? 'error.export/too-large' : 'error.export/failed',
      { code: error instanceof RangeError ? 'export/too-large' : 'export/failed', cause: error });
  }
  try {
    await download(blob, `nazm_backup_${stamp()}.json`);
  } catch (error) {
    console.error('[export] JSON export failed', error);
    throw new AppError('error.export/failed', { code: 'export/failed', cause: error });
  }
  return { bytes: blob.size, restorable: blob.size <= MAX_BACKUP_FILE_BYTES };
}

/**
 * The largest JSON backup NAZM reads — and the size its own export is checked
 * against, so the two can never disagree.
 *
 * Chosen from measurement, not taste (tools/measure-backup-size.mjs, which
 * builds records the way the export writes them, `JSON.stringify(…, null, 2)`,
 * UTF-8): a realistic record — an Arabic name and paragraph of description,
 * identifiers, a valuation, three cloud images, an AI analysis — is about
 * 7.4 KB, so a 20,000-record Business backup is about 141 MB. The old 50 MB
 * ceiling refused that; 256 MB accepts it with ~1.8× headroom for longer
 * descriptions and more photographs. A backup is metadata only: image files
 * are never inside it, so they are not part of this budget.
 *
 * Every text field at its limit on every record (~40 KB each) is larger:
 * 5,000 such records are ~192 MB and fit; 20,000 would be ~768 MB, which no
 * browser can hold as one string to write or read. That case is not silent —
 * `exportJSON` measures what it wrote and says so (see there).
 *
 * The ceiling still exists because reading is not free: the bytes, the
 * decoded text and the parsed records are all in memory at once, so a file
 * past this is refused from its metadata before any of that happens.
 */
export const MAX_BACKUP_FILE_BYTES = 256 * 1024 * 1024;

/**
 * Checked from the file's metadata alone, before a byte of it is read. The
 * extension is the rule; the MIME type is only a hint (systems report
 * `application/json`, `text/plain` or nothing for the same file), so it is
 * never the reason to refuse.
 * @throws {AppError} `backup/no-file`, `backup/empty-file`,
 *   `backup/file-too-large` or `backup/not-json`
 */
export function validateBackupFileMetadata(file) {
  if (!file || typeof file.size !== 'number') {
    throw new AppError('error.backup/no-file', { code: 'backup/no-file' });
  }
  if (!(file.size > 0)) {
    throw new AppError('error.backup/empty-file', { code: 'backup/empty-file' });
  }
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    throw new AppError('error.backup/file-too-large', {
      code: 'backup/file-too-large', size: file.size, max: MAX_BACKUP_FILE_BYTES,
    });
  }
  if (!/\.json$/i.test(String(file.name || ''))) {
    throw new AppError('error.backup/not-json', { code: 'backup/not-json' });
  }
}

/**
 * Reads a JSON backup once, and says exactly which backup it is.
 *
 * Its metadata is checked first ({@link validateBackupFileMetadata}), so an
 * oversized or wrong file is refused before a byte is read. Then the bytes
 * are read one time. Their SHA-256 is the backup's identity — the
 * same principle as a spreadsheet's: same bytes, same backup; any difference,
 * a different one. That identity is what lets an interrupted restore be
 * finished only by the file that started it. It used to be a hash of the
 * record ids, and two backups of the same inventory taken a week apart share
 * every id while differing in every value.
 *
 * The bytes are dropped as soon as they are decoded.
 *
 * @returns {Promise<{data: object, sourceFingerprint: string}>}
 * @throws {AppError} `backup/fingerprint-unavailable` when the file cannot be
 *   identified — nothing proceeds on a weaker identity — or `import/parse`
 */
export async function readBackupFile(file) {
  validateBackupFileMetadata(file);
  let bytes;
  try {
    bytes = await file.arrayBuffer();
  } catch (error) {
    throw new AppError('error.import/read', { code: 'import/read', cause: error });
  }
  let sourceFingerprint;
  try {
    if (!globalThis.crypto?.subtle?.digest) throw new Error('SubtleCrypto unavailable');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    sourceFingerprint = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('[backup] fingerprint could not be computed', error);
    throw new AppError('error.backup/fingerprint-unavailable', {
      code: 'backup/fingerprint-unavailable', cause: error,
    });
  }
  let data;
  try {
    // Keys that name an object's prototype machinery are dropped as the file
    // is read: a backup is data, and "__proto__" in it must never become a
    // prototype when a record is later copied or merged.
    data = JSON.parse(new TextDecoder().decode(bytes), (key, value) => (UNSAFE_KEYS.has(key) ? undefined : value));
  } catch (error) {
    throw new AppError('error.import/parse', { code: 'import/parse', cause: error });
  }
  // The decoded object is what continues; the raw bytes go now.
  bytes = null;
  return { data, sourceFingerprint };
}

/**
 * Adds the imported records alongside the existing ones. An incoming record
 * whose id already exists is skipped, so a merge never overwrites local edits.
 *
 * "Already exists" is asked of the store, by key, for every incoming id. It
 * used to be asked of the records in memory — which, for items, is the newest
 * few hundred — so an old record's id looked new, and the `merge: false`
 * write that followed replaced the customer's record with the backup's copy.
 * The write itself also refuses to replace anything (`ifAbsent`), so a record
 * created between the check and the write is not overwritten either.
 */
export async function applyMerge(data) {
  const repo = repository;
  // A restore left half done is a workspace holding parts of two
  // inventories; merging a third into it would make that unrecoverable.
  await assertNoUnfinishedRestore();
  const operations = [];
  const skipped = { items: 0, folders: 0, categories: 0, locations: 0 };

  for (const name of ['categories', 'locations', 'folders', 'items']) {
    const incoming = (data[name] || []).filter((record) => record?.id);
    const existing = await repo.backend.existingIds(name, incoming.map((record) => record.id));
    for (const record of incoming) {
      if (existing.has(record.id)) { skipped[name] += 1; continue; }
      operations.push({
        type: 'set', collection: name, id: record.id, data: record, merge: false, ifAbsent: true,
      });
    }
  }

  // Live SKUs stay unique. Checked for the records that will actually be
  // added — a record skipped by id is not new, so its own SKU is no conflict —
  // against each other and against the live inventory, and before anything
  // is written: a merge with a conflict writes nothing at all, not the
  // categories first and some of the items. Trashed records do not block.
  const newItems = operations.filter((op) => op.collection === 'items' && !op.data.deletedAt);
  const conflicts = await repo.findSkuConflicts(newItems.map((op) => ({ key: op.id, id: op.id, sku: op.data.sku })));
  if (conflicts.length) {
    const names = new Map(newItems.map((op) => [op.id, op.data.name || '']));
    throw new AppError('error.import/sku-conflict', {
      code: 'import/sku-conflict',
      conflicts: conflicts.map((c) => ({
        sku: c.sku,
        incomingId: c.id,
        incomingName: names.get(c.id) || '',
        type: c.type,
        ...(c.type === 'existing' ? { existingId: c.existingId, existingName: c.existingName } : { duplicateIds: firstOthers(c) }),
      })),
    });
  }

  // Capacity for what will actually be added: the new live records, not the
  // ones skipped as already present. The whole merge is refused rather than
  // trimmed to fit — a merge that silently adds two of three is one the
  // customer believes finished. The write checks again, atomically.
  await repo.assertItemCapacity(newItems.length);

  // What the write actually did. A record another device created between the
  // check above and the commit is skipped there too — never overwritten — and
  // counted here as skipped, not as added.
  let added = 0;
  if (operations.length) {
    const result = await repo.bulkWrite(operations, { liveLimit: repo._liveLimit() });
    const raced = new Set(result.skippedExisting || []);
    for (const op of operations) {
      if (raced.has(op.id)) skipped[op.collection] += 1;
      else added += 1;
    }
  }
  await repo.log(ACTIONS.IMPORT_MERGED, {
    added,
    skipped: Object.values(skipped).reduce((a, b) => a + b, 0),
  });
  return { added, skipped };
}

/**
 * Exports a chosen subset rather than the whole inventory. Same columns as the
 * full export, so a selection and a backup open the same way.
 */
export async function exportSelection(items) {
  if (!items?.length) throw new AppError('error.export/empty-selection', { code: 'export/empty-selection' });
  const repo = repository;

  const rows = [[
    ...[
      'field.sku', 'field.barcode', 'field.name', 'field.category', 'field.folder', 'field.location',
      'field.quantity', 'field.unit', 'field.condition', 'field.brand',
      'field.serialNumber', 'field.modelNumber', 'field.referenceNumber',
      'export.minValuation', 'export.maxValuation', 'field.currency', 'field.description', 'export.updatedAt',
    ].map((key) => t(key)),
  ]];
  for (const item of items) {
    rows.push([
      item.sku || '',
      item.barcode || '',
      item.name || '',
      repo.category(item.categoryId).name,
      repo.folder(item.folderId)?.name || '',
      repo.location(item.locationId)?.name || '',
      item.quantity,
      item.unit || '',
      item.condition || '',
      item.brand || '',
      item.serialNumber || '',
      item.modelNumber || '',
      item.referenceNumber || '',
      item.valuation?.min ?? null,
      item.valuation?.max ?? null,
      item.valuation?.currency || '',
      item.description || '',
      toDate(item.updatedAt),
    ]);
  }

  try {
    await download(buildWorkbook([{ name: t('export.sheetSelection'), rows }]), `${t('export.filePrefix')}_${t('export.selectionSuffix')}_${stamp()}.xlsx`);
  } catch (error) {
    console.error('[export] selection export failed', error);
    throw new AppError('error.export/selection', { code: 'export/selection', cause: error });
  }
}

/** Summary line used in the import confirmation sheet. */
export function describeValuation(item) {
  if (!item.valuation) return '—';
  return t('export.valuationWithMid', { valuation: formatValuation(item.valuation), mid: String(valuationMidpoint(item.valuation)) });
}

/** Up to five other records carrying the same SKU — enough to find them,
 *  without a list per record when thousands share one. */
function firstOthers(conflict) {
  const out = [];
  for (const key of conflict.groupKeys) {
    if (key !== conflict.key) out.push(key);
    if (out.length === 5) break;
  }
  return out;
}
