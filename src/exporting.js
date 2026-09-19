// Export, backup, import and restore.
//
// The JSON file is a *metadata* backup: with images held in Storage, it carries
// their paths and URLs, not their bytes. That distinction is stated in the file
// itself and in the UI, so nobody mistakes it for a full media backup.

import { ACTIONS, APP_VERSION, SCHEMA_VERSION } from './config.js';
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
  const items = repo.liveItems();

  const itemRows = [[
    'الرمز', 'الباركود', 'الاسم', 'التصنيف', 'المجلد', 'الموقع',
    'الكمية', 'الوحدة', 'الحالة', 'البراند',
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
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    backupType: 'metadata-only',
    note: 'نسخة بيانات فقط — ملفات الصور محفوظة في Firebase Storage ولا يتضمنها هذا الملف.',
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
 */
export async function applyMerge(data) {
  const repo = repository;
  const existing = {
    items: new Set(repo.state.items.map((i) => i.id)),
    folders: new Set(repo.state.folders.map((f) => f.id)),
    categories: new Set(repo.state.categories.map((c) => c.id)),
    locations: new Set(repo.state.locations.map((l) => l.id)),
  };

  const operations = [];
  const skipped = { items: 0, folders: 0, categories: 0, locations: 0 };

  for (const name of ['categories', 'locations', 'folders', 'items']) {
    for (const record of data[name] || []) {
      if (existing[name].has(record.id)) { skipped[name] += 1; continue; }
      operations.push({ type: 'set', collection: name, id: record.id, data: record, merge: false });
    }
  }

  if (operations.length) await repo.bulkWrite(operations);
  await repo.log(ACTIONS.IMPORT_MERGED, {
    added: operations.length,
    skipped: Object.values(skipped).reduce((a, b) => a + b, 0),
  });
  return { added: operations.length, skipped };
}

/** Summary line used in the import confirmation sheet. */
export function describeValuation(item) {
  if (!item.valuation) return '—';
  return `${formatValuation(item.valuation)} (وسط ${valuationMidpoint(item.valuation)})`;
}
