// A development-only integrity check over the device database.
//
// Not a customer feature, and deliberately not reachable from the interface.
// It exists so a test — or a developer with a suspicious workspace — can ask
// one question: does what is stored still make sense as a whole?
//
// It REPORTS. It does not repair. Most of what it can find has more than one
// plausible fix, and picking one silently is how a checker turns a detectable
// problem into an undetectable one. A record pointing at a folder that no
// longer exists might want the reference cleared, or might mean the folder was
// deleted by mistake and should come back — and this module has no way to know
// which, so it says what it found and stops.
//
// Reading is done in cursor batches, so checking a 20,000-record workspace
// costs a walk rather than a copy of it.

import { UNCATEGORIZED_ID } from './config.js';
import { isCurrencyCode } from './config.js';
import * as local from './local-store.js';

const BATCH = 500;

/** A finding, with enough context to act on it. */
const finding = (severity, kind, message, context = {}) => ({ severity, kind, message, ...context });

/**
 * Walk the database and report what does not add up.
 *
 * @param {{onProgress?: (n: number) => void}} [options]
 * @returns {Promise<{findings: Array, checked: object, ok: boolean}>}
 */
export async function checkIntegrity({ onProgress } = {}) {
  const findings = [];

  const [folders, categories, locations, mediaAssets] = await Promise.all([
    local.getAll('folders'),
    local.getAll('categories'),
    local.getAll('locations'),
    local.getAll('mediaAssets').catch(() => []),
  ]);

  const folderIds = new Set(folders.map((f) => f.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const locationIds = new Set(locations.map((l) => l.id));
  const assetById = new Map(mediaAssets.map((a) => [a.id, a]));
  const referencedMedia = new Map();

  const skus = new Map();
  const serials = new Map();
  let items = 0;

  await local.walk('items', {
    batchSize: BATCH,
    onBatch: (batch) => {
      for (const item of batch) {
        items += 1;

        // ── references point at something that exists ──
        if (item.folderId && !folderIds.has(item.folderId)) {
          findings.push(finding('error', 'dangling-folder',
            'سجل يشير إلى مجلد غير موجود', { itemId: item.id, folderId: item.folderId }));
        }
        if (item.locationId && !locationIds.has(item.locationId)) {
          findings.push(finding('error', 'dangling-location',
            'سجل يشير إلى موقع غير موجود', { itemId: item.id, locationId: item.locationId }));
        }
        if (item.categoryId && item.categoryId !== UNCATEGORIZED_ID && !categoryIds.has(item.categoryId)) {
          findings.push(finding('error', 'dangling-category',
            'سجل يشير إلى تصنيف غير موجود', { itemId: item.id, categoryId: item.categoryId }));
        }

        // ── images ──
        const imageIds = new Set((item.images || []).map((image) => image.id));
        if (item.primaryImageId && !imageIds.has(item.primaryImageId)) {
          findings.push(finding('error', 'primary-image-missing',
            'الصورة الرئيسية ليست من صور السجل', { itemId: item.id, primaryImageId: item.primaryImageId }));
        }
        for (const image of item.images || []) {
          const mediaId = image.mediaId || image.id;
          if (!mediaId) continue;
          referencedMedia.set(mediaId, (referencedMedia.get(mediaId) || 0) + 1);
          if (mediaAssets.length && !assetById.has(mediaId)) {
            findings.push(finding('error', 'media-missing',
              'صورة تشير إلى ملف غير موجود', { itemId: item.id, mediaId }));
          }
        }

        // ── the shape of the record itself ──
        if (!Number.isInteger(item.version) || item.version < 1) {
          findings.push(finding('error', 'bad-version',
            'رقم إصدار غير صالح', { itemId: item.id, version: item.version }));
        }
        if (!Number.isFinite(item.quantity) || item.quantity < 0) {
          findings.push(finding('error', 'bad-quantity',
            'كمية غير صالحة', { itemId: item.id, quantity: item.quantity }));
        }
        for (const field of ['createdAt', 'updatedAt']) {
          if (!Number.isFinite(item[field]) || item[field] <= 0) {
            findings.push(finding('warning', 'bad-timestamp',
              'تاريخ غير صالح', { itemId: item.id, field, value: item[field] }));
          }
        }
        if (item.deletedAt != null && !Number.isFinite(item.deletedAt)) {
          // Not pedantry: IndexedDB leaves a non-key value out of its index,
          // so such a record is invisible to the Trash and to every count that
          // subtracts the trash from the total.
          findings.push(finding('error', 'bad-deleted-at',
            'تاريخ حذف غير صالح — لن يظهر السجل في سلة المحذوفات',
            { itemId: item.id, deletedAt: item.deletedAt }));
        }

        // ── money ──
        if (item.valuation) {
          const { min, max, currency } = item.valuation;
          if (!Number.isFinite(min) || !Number.isFinite(max)) {
            findings.push(finding('error', 'bad-valuation',
              'تقييم غير صالح', { itemId: item.id, min, max }));
          } else if (max < min) {
            findings.push(finding('error', 'inverted-valuation',
              'أعلى قيمة أقل من أدنى قيمة', { itemId: item.id, min, max }));
          }
          if (!isCurrencyCode(currency)) {
            findings.push(finding('error', 'bad-currency',
              'عملة غير معروفة', { itemId: item.id, currency }));
          }
        }

        // ── identifiers that are meant to be unique ──
        if (!item.deletedAt) {
          if (item.sku) {
            const seen = skus.get(item.sku);
            if (seen) {
              findings.push(finding('error', 'duplicate-sku',
                'رمز مستخدم على أكثر من سجل', { sku: item.sku, itemIds: [seen, item.id] }));
            } else skus.set(item.sku, item.id);
          }
          if (item.serialNumber) {
            const seen = serials.get(item.serialNumber);
            if (seen) {
              // A warning, not an error: two objects genuinely can carry the
              // same stamped number if one of them was stamped badly, and the
              // owner is the one who knows.
              findings.push(finding('warning', 'duplicate-serial',
                'رقم تسلسلي مكرّر', { serialNumber: item.serialNumber, itemIds: [seen, item.id] }));
            } else serials.set(item.serialNumber, item.id);
          }
        }
      }
      onProgress?.(items);
      return true;
    },
  });

  // ── media, from the other side ──
  //
  // The count must equal the number of references the records actually hold
  // — not merely be non-zero when referenced. An overstated count keeps a file
  // forever; an understated one deletes it one release early, under a record
  // that still shows it.
  const localBlobs = await local.existingKeys('images', mediaAssets
    .filter((asset) => String(asset.storagePath || '').startsWith('local:'))
    .map((asset) => asset.id)).catch(() => null);
  for (const asset of mediaAssets) {
    const stored = asset.refCount ?? 0;
    const actual = referencedMedia.get(asset.id) || 0;
    if (stored < 0) {
      findings.push(finding('error', 'negative-refcount',
        'عدّاد مراجع سالب', { mediaId: asset.id, refCount: stored }));
    }
    if (actual > 0 && stored < actual) {
      findings.push(finding('error', 'refcount-understated',
        'عدّاد الملف أقل من عدد السجلات التي تعرضه', { mediaId: asset.id, refCount: stored, actual }));
    }
    if (stored > actual) {
      findings.push(finding('warning', 'refcount-overstated',
        'عدّاد ملف أكبر مما يشير إليه', { mediaId: asset.id, refCount: stored, actual }));
    }
    if (actual === 0) {
      findings.push(finding('warning', 'orphan-media',
        'ملف لا يشير إليه أي سجل', { mediaId: asset.id, orphanedAt: asset.orphanedAt ?? null }));
    }
    if (localBlobs && String(asset.storagePath || '').startsWith('local:') && !localBlobs.has(asset.id)) {
      findings.push(finding('error', 'blob-missing',
        'بيانات الصورة غير موجودة على الجهاز', { mediaId: asset.id }));
    }
  }

  return {
    findings,
    checked: {
      items,
      folders: folders.length,
      categories: categories.length,
      locations: locations.length,
      mediaAssets: mediaAssets.length,
    },
    ok: findings.every((f) => f.severity !== 'error'),
  };
}

/**
 * An assertion for development builds, run after a write that is supposed to
 * leave the database consistent.
 *
 * It logs. It never throws, and it never reaches a customer's screen: a
 * developer's tripwire that takes the product down in front of someone's
 * inventory has traded one bug for a worse one.
 */
export async function assertIntegrity(what, { quiet = false } = {}) {
  try {
    const report = await checkIntegrity();
    const errors = report.findings.filter((f) => f.severity === 'error');
    if (errors.length) {
      console.error(`[integrity] ${what} left ${errors.length} problem(s)`, errors.slice(0, 20));
    } else if (!quiet) {
      console.info(`[integrity] ${what}: clean (${report.checked.items} records)`);
    }
    return report;
  } catch (error) {
    console.error(`[integrity] could not check after ${what}`, error);
    return null;
  }
}
