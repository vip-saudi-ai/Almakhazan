// One-time migration from the v7 schema to v2 documents.
//
// Sources: the `makhzan7` / `makhzan5` LocalStorage blob and the single
// `almakhzan/data` Firestore document. Both stored every record — and every
// image, as Base64 — in one place.
//
// Guarantees:
//  - a JSON backup of the source is written before anything is converted;
//  - progress is checkpointed after every item, so a failure resumes instead
//    of restarting or duplicating;
//  - counts are compared before the migration is marked complete;
//  - the source data is left untouched.

import { SCHEMA_VERSION, ACTIONS } from './config.js';
import { firebaseContext, isCloudEnabled } from './firebase.js';
import * as local from './local-store.js';
import { repository } from './repository.js';
import { AppError, sha256Hex, uid } from './utils.js';
import {
  normalizeCategory, normalizeFolder, normalizeItem, normalizeLocation, parseValuationText,
} from './validation.js';

const LEGACY_KEYS = ['makhzan7', 'makhzan5'];
const STATE_KEY = 'migration.v2';
const BACKUP_KEY = 'migration.v2.backup';

export const MigrationState = {
  NOT_NEEDED: 'not-needed',
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

function readLegacyLocal() {
  for (const key of LEGACY_KEYS) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      console.error('[migration] LocalStorage unreadable', error);
      return null;
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { source: key, data: parsed };
    } catch (error) {
      console.error(`[migration] legacy key ${key} is not valid JSON`, error);
    }
  }
  return null;
}

async function readLegacyCloud() {
  if (!isCloudEnabled()) return null;
  const { db, sdk } = firebaseContext();
  if (!db) return null;
  try {
    const snap = await sdk.firestore.getDoc(sdk.firestore.doc(db, 'almakhzan', 'data'));
    if (!snap.exists()) return null;
    return { source: 'almakhzan/data', data: snap.data() };
  } catch (error) {
    // A permission error here just means the legacy document is not reachable.
    console.error('[migration] legacy Firestore document unreadable', error);
    return null;
  }
}

function countRecords(data) {
  return {
    items: Array.isArray(data?.items) ? data.items.length : 0,
    folders: Array.isArray(data?.folders) ? data.folders.length : 0,
    categories: Array.isArray(data?.categories) ? data.categories.length : 0,
    locations: Array.isArray(data?.locations) ? data.locations.length : 0,
  };
}

/** Picks the richer of the two legacy sources. */
export async function detectLegacyData() {
  const [fromLocal, fromCloud] = await Promise.all([
    Promise.resolve(readLegacyLocal()),
    readLegacyCloud(),
  ]);
  const candidates = [fromLocal, fromCloud].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => countRecords(b.data).items - countRecords(a.data).items)[0];
}

export async function migrationStatus() {
  const state = await local.getMeta(STATE_KEY);
  if (state?.status === MigrationState.COMPLETED) return state;
  const legacy = await detectLegacyData();
  if (!legacy) return { status: MigrationState.NOT_NEEDED };
  const counts = countRecords(legacy.data);
  if (!counts.items && !counts.folders) return { status: MigrationState.NOT_NEEDED };
  return { ...(state || {}), status: state?.status || MigrationState.PENDING, source: legacy.source, counts };
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  const body = dataUrl.slice(match[0].length);
  try {
    if (match[2]) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(body)], { type: mime });
  } catch (error) {
    console.error('[migration] could not decode embedded image', error);
    return null;
  }
}

async function migrateEmbeddedImage(dataUrl, ctx) {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return null;

  const imageId = uid('img');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const meta = {
    id: imageId,
    originalFilename: null,
    mimeType: blob.type || 'image/jpeg',
    width: null,
    height: null,
    fileSize: blob.size,
    hash,
    uploadedAt: Date.now(),
    uploadedBy: ctx.userId || null,
  };

  if (ctx.mode !== 'cloud') {
    // ArrayBuffers, not Blobs — see the note in storage.js.
    await local.put('images', {
      id: imageId,
      itemId: ctx.itemId,
      original: bytes.buffer,
      originalType: meta.mimeType,
      thumbnail: bytes.buffer,
      thumbnailType: meta.mimeType,
      meta,
    });
    return { ...meta, storagePath: `local:${imageId}`, thumbnailPath: `local:${imageId}`, url: null, thumbnailUrl: null };
  }

  const { storage, sdk } = firebaseContext();
  const extension = { 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'jpg';
  const prefix = `workspaces/${ctx.workspaceId}/items/${ctx.itemId}`;
  const storagePath = `${prefix}/original/${imageId}.${extension}`;
  const thumbnailPath = `${prefix}/thumbnails/${imageId}.jpg`;

  const originalRef = sdk.storage.ref(storage, storagePath);
  await sdk.storage.uploadBytes(originalRef, blob, {
    contentType: blob.type || 'image/jpeg',
    customMetadata: { migratedFrom: 'v7-base64', hash },
  });
  // The legacy blob was already capped at 800px, so it doubles as the thumbnail.
  const thumbRef = sdk.storage.ref(storage, thumbnailPath);
  await sdk.storage.uploadBytes(thumbRef, blob, { contentType: blob.type || 'image/jpeg' });

  const [url, thumbnailUrl] = await Promise.all([
    sdk.storage.getDownloadURL(originalRef),
    sdk.storage.getDownloadURL(thumbRef),
  ]);
  return { ...meta, storagePath, thumbnailPath, url, thumbnailUrl };
}

/** Converts one legacy item record into the new schema. */
function convertItem(legacy, userId) {
  return normalizeItem({
    id: legacy.id,
    name: legacy.name,
    sku: legacy.sku,
    barcode: legacy.barcode,
    categoryId: legacy.cat,
    folderId: legacy.folderId,
    locationId: legacy.loc,
    // Legacy `qty` used `|| 1`, so a stored 0 was already lost upstream; what is
    // present is carried across exactly, including a genuine 0.
    quantity: legacy.qty,
    unit: legacy.unit,
    condition: legacy.cond,
    brand: legacy.brand,
    valuation: parseValuationText(legacy.price),
    description: legacy.desc,
    images: [],
    aiData: legacy.aiData ? {
      ...legacy.aiData,
      suggestedValuation: parseValuationText(legacy.aiData.suggestedPrice, { source: 'ai' }),
      model: legacy.aiData.model || 'legacy',
    } : null,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    createdBy: userId,
    updatedBy: userId,
  }, { userId });
}

/**
 * Runs the migration.
 * @param {(progress: {phase: string, done: number, total: number, message: string}) => void} onProgress
 */
export async function runMigration({ onProgress } = {}) {
  const legacy = await detectLegacyData();
  if (!legacy) return { status: MigrationState.NOT_NEEDED };

  const { mode, workspaceId, userId } = repository.session;
  const report = (phase, done, total, message) => onProgress?.({ phase, done, total, message });

  let state = (await local.getMeta(STATE_KEY)) || {};
  const migratedIds = new Set(state.migratedItemIds || []);

  try {
    await local.setMeta(STATE_KEY, { ...state, status: MigrationState.IN_PROGRESS, startedAt: state.startedAt || Date.now() });

    // 1 — back up the source before touching anything.
    if (!state.backedUp) {
      report('backup', 0, 1, 'إنشاء نسخة احتياطية…');
      await local.setMeta(BACKUP_KEY, {
        source: legacy.source,
        capturedAt: Date.now(),
        payload: JSON.parse(JSON.stringify(legacy.data)),
      });
      state = { ...state, backedUp: true };
      await local.setMeta(STATE_KEY, { ...state, status: MigrationState.IN_PROGRESS });
    }

    const source = legacy.data;
    const sourceCounts = countRecords(source);

    // 2 — taxonomy first, so item references resolve.
    report('taxonomy', 0, 1, 'ترحيل التصنيفات والمجلدات…');
    const taxonomyOps = [
      ...(source.categories || []).map((c) => {
        const record = normalizeCategory(c);
        return { type: 'set', collection: 'categories', id: record.id, data: record };
      }),
      ...(source.locations || []).map((l) => {
        const record = normalizeLocation(l);
        return { type: 'set', collection: 'locations', id: record.id, data: record };
      }),
      ...(source.folders || []).map((f) => {
        const record = normalizeFolder({ ...f, description: f.desc }, { userId });
        return { type: 'set', collection: 'folders', id: record.id, data: record };
      }),
    ];
    if (taxonomyOps.length) await repository.bulkWrite(taxonomyOps);

    // 3 — items, one at a time, checkpointed.
    const legacyItems = Array.isArray(source.items) ? source.items : [];
    let done = migratedIds.size;
    for (const legacyItem of legacyItems) {
      if (!legacyItem?.id || migratedIds.has(legacyItem.id)) continue;
      report('items', done, legacyItems.length, `ترحيل القطع… ${done}/${legacyItems.length}`);

      const item = convertItem(legacyItem, userId);

      if (typeof legacyItem.img === 'string' && legacyItem.img.startsWith('data:')) {
        try {
          const image = await migrateEmbeddedImage(legacyItem.img, { mode, workspaceId, userId, itemId: item.id });
          if (image) {
            item.images = [image];
            item.primaryImageId = image.id;
            if (item.aiData) item.aiData.imageHash = image.hash;
          }
        } catch (error) {
          // A failed image must not cost us the record it belongs to.
          console.error(`[migration] image failed for item ${item.id}`, error);
          state.imageFailures = [...(state.imageFailures || []), item.id];
        }
      }

      await repository.bulkWrite([{ type: 'set', collection: 'items', id: item.id, data: item }]);
      migratedIds.add(legacyItem.id);
      done += 1;
      await local.setMeta(STATE_KEY, {
        ...state,
        status: MigrationState.IN_PROGRESS,
        migratedItemIds: [...migratedIds],
      });
    }

    // 4 — verify before declaring success.
    report('verify', legacyItems.length, legacyItems.length, 'التحقق من اكتمال الترحيل…');
    const expected = sourceCounts.items;
    const actual = migratedIds.size;
    if (actual < expected) {
      throw new AppError(`اكتمل ترحيل ${actual} من ${expected} قطعة فقط`, { code: 'migration/incomplete' });
    }

    const result = {
      status: MigrationState.COMPLETED,
      completedAt: Date.now(),
      source: legacy.source,
      schemaVersion: SCHEMA_VERSION,
      counts: { expected, actual, imageFailures: (state.imageFailures || []).length },
      migratedItemIds: [...migratedIds],
      backedUp: true,
    };
    await local.setMeta(STATE_KEY, result);
    await repository.log(ACTIONS.MIGRATION_COMPLETED, {
      source: legacy.source, items: actual, imageFailures: result.counts.imageFailures,
    });
    report('done', expected, expected, 'اكتمل الترحيل');
    return result;
  } catch (error) {
    console.error('[migration] failed', error);
    await local.setMeta(STATE_KEY, {
      ...state,
      status: MigrationState.FAILED,
      migratedItemIds: [...migratedIds],
      failedAt: Date.now(),
      error: error.message,
    });
    throw error instanceof AppError ? error : new AppError('فشل الترحيل', { cause: error });
  }
}

/** The pre-migration snapshot, for manual recovery. */
export function getMigrationBackup() {
  return local.getMeta(BACKUP_KEY);
}
