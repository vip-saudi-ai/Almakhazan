// Export, backup, import and restore.
//
// The JSON file is a *metadata* backup: with images held in Storage, it carries
// their paths and URLs, not their bytes. That distinction is stated in the file
// itself and in the UI, so nobody mistakes it for a full media backup.

import { ACTIONS, APP_VERSION, SCHEMA_VERSION } from './config.js';
import { assertNoUnfinishedRestore } from './restore.js';
import { repository } from './repository.js';
import { ACTION_LABELS } from './config.js';
import { AppError, toDate } from './utils.js';
import { formatValuation, valuationMidpoint } from './validation.js';
import { buildWorkbook } from './xlsx-writer.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Hands a backup file to the customer, and throws if the browser refuses.
 * The restore path depends on this throwing: a silent failure here would mean
 * the safety net was never actually there.
 */
export function saveBackupFile(text, prefix = 'nazm_backup') {
  if (typeof text !== 'string' || text.length < 2) {
    throw new AppError('نسخة الأمان فارغة', { code: 'export/empty' });
  }
  const blob = new Blob([text], { type: 'application/json' });
  download(blob, `${prefix}_${stamp()}.json`);
}

export function exportExcel() {
  const repo = repository;
  // An export is a statement about the whole inventory. If only a window is
  // loaded this refuses loudly rather than writing a short file that looks
  // complete. Callers load first — see `withFullInventory`.
  repo.assertItemsComplete('التصدير');
  const items = repo.liveItems();

  const itemRows = [[
    'الرمز', 'الباركود', 'الاسم', 'التصنيف', 'المجلد', 'الموقع',
    'الكمية', 'الوحدة', 'الحالة', 'البراند',
    'الرقم التسلسلي', 'رقم الموديل', 'الرقم المرجعي',
    'أدنى تقييم', 'أعلى تقييم', 'العملة', 'مصدر التقييم',
    'تقييم محلي (نَظْم)', 'تقييم عالمي (نَظْم)',
    'أدنى تقدير (نَظْم)', 'أعلى تقدير (نَظْم)',
    'وصف من نَظْم', 'الوصف', 'تاريخ الإضافة', 'آخر تحديث',
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

  const sheets = [{ name: 'الجرد', rows: itemRows }];

  if (repo.state.folders.length) {
    sheets.push({
      name: 'المجلدات',
      rows: [
        ['المجلد', 'الوصف', 'عدد القطع', 'إجمالي الكمية', 'تاريخ الإنشاء'],
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
      name: 'التصنيفات',
      rows: [
        ['التصنيف', 'عدد القطع', 'إجمالي الكمية'],
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
      name: 'سجل النشاط',
      rows: [
        ['التاريخ', 'الإجراء', 'القطعة', 'المستخدم'],
        ...repo.state.activity.map((entry) => [
          toDate(entry.timestamp),
          ACTION_LABELS[entry.action] || entry.action,
          entry.itemName || entry.folderName || entry.categoryName || '',
          entry.userName || entry.userId || '',
        ]),
      ],
    });
  }

  try {
    download(buildWorkbook(sheets), `نظم_${stamp()}.xlsx`);
  } catch (error) {
    console.error('[export] Excel export failed', error);
    throw new AppError('فشل تصدير Excel', { cause: error });
  }
}

export function exportJSON() {
  const repo = repository;
  repo.assertItemsComplete('النسخة الاحتياطية');
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    backupType: 'metadata-only',
    imagesIncluded: false,
    // What this file is not, said in the file itself.
    note: repo.session.mode === 'cloud'
      ? 'بيانات القطع فقط — ملفات الصور تبقى في التخزين السحابي ولا يتضمنها هذا الملف.'
      : 'بيانات القطع فقط — ملفات الصور محفوظة على الجهاز ولا يتضمنها هذا الملف.',
    workspaceId: repo.session.workspaceId,
    items: repo.state.items,
    folders: repo.state.folders,
    categories: repo.state.categories,
    locations: repo.state.locations,
  };
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    download(blob, `nazm_backup_${stamp()}.json`);
  } catch (error) {
    console.error('[export] JSON export failed', error);
    throw new AppError('فشل إنشاء النسخة الاحتياطية', { cause: error });
  }
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (error) {
        reject(new AppError('الملف ليس JSON صالحاً', { code: 'import/parse', cause: error }));
      }
    };
    reader.onerror = () => reject(new AppError('تعذّر قراءة الملف', { code: 'import/read' }));
    reader.readAsText(file);
  });
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

  if (operations.length) await repo.bulkWrite(operations);
  await repo.log(ACTIONS.IMPORT_MERGED, {
    added: operations.length,
    skipped: Object.values(skipped).reduce((a, b) => a + b, 0),
  });
  return { added: operations.length, skipped };
}

/**
 * Exports a chosen subset rather than the whole inventory. Same columns as the
 * full export, so a selection and a backup open the same way.
 */
export function exportSelection(items) {
  if (!items?.length) throw new AppError('لا توجد قطع مختارة', { code: 'export/empty-selection' });
  const repo = repository;

  const rows = [[
    'الرمز', 'الباركود', 'الاسم', 'التصنيف', 'المجلد', 'الموقع',
    'الكمية', 'الوحدة', 'الحالة', 'البراند',
    'الرقم التسلسلي', 'رقم الموديل', 'الرقم المرجعي',
    'أدنى تقييم', 'أعلى تقييم', 'العملة', 'الوصف', 'آخر تحديث',
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
    download(buildWorkbook([{ name: 'المحدد', rows }]), `نظم_محدد_${stamp()}.xlsx`);
  } catch (error) {
    console.error('[export] selection export failed', error);
    throw new AppError('فشل تصدير المحدد', { cause: error });
  }
}

/** Summary line used in the import confirmation sheet. */
export function describeValuation(item) {
  if (!item.valuation) return '—';
  return `${formatValuation(item.valuation)} (وسط ${valuationMidpoint(item.valuation)})`;
}
