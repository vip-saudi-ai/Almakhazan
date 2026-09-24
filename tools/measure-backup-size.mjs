// Measures the size of a JSON backup exactly as `exportJSON` writes it
// (same payload shape, `JSON.stringify(payload, null, 2)`, UTF-8), for the
// plan sizes NAZM sells, with two record profiles:
//
//   realistic — an Arabic name and a paragraph of description, identifiers,
//               a valuation, three cloud images, an AI analysis;
//   maximum   — every text field at its limit (TEXT_LIMITS), twelve images,
//               a full AI analysis. No record can be larger in practice.
//
//   node tools/measure-backup-size.mjs
//
// It is what `MAX_BACKUP_FILE_BYTES` is chosen from: the limit must accept
// the largest backup the largest plan can produce.

import { normalizeCategory, normalizeItem } from '../src/validation.js';
import { SCHEMA_VERSION, TEXT_LIMITS } from '../src/config.js';

const arabic = (length, seed = 0) => {
  const words = ['ساعة', 'ذهب', 'أصلية', 'بحالة', 'ممتازة', 'مع', 'العلبة', 'والضمان', 'إصدار', 'محدود', 'سويسرية', 'فولاذ'];
  let out = '';
  for (let i = seed; out.length < length; i += 1) out += (out ? ' ' : '') + words[i % words.length];
  return out.slice(0, length);
};
const hex = (n, i) => (i.toString(16).padStart(8, '0').repeat(Math.ceil(n / 8))).slice(0, n);

function image(workspace, itemId, k) {
  const media = `med_${hex(20, k)}`;
  const path = `workspaces/${workspace}/items/${itemId}/original/${media}.jpg`;
  const thumb = `workspaces/${workspace}/items/${itemId}/thumbnails/${media}.jpg`;
  const url = (p) => `https://firebasestorage.googleapis.com/v0/b/nazm-app.appspot.com/o/${encodeURIComponent(p)}?alt=media&token=${hex(36, k)}`;
  return {
    id: media, mediaId: media, storagePath: path, thumbnailPath: thumb, url: url(path), thumbnailUrl: url(thumb),
    originalFilename: `IMG_${String(k).padStart(4, '0')}.HEIC`, mimeType: 'image/jpeg',
    width: 2560, height: 1920, fileSize: 2_400_000 + k, hash: hex(64, k), uploadedAt: 1_760_000_000_000, uploadedBy: `usr_${hex(28, 1)}`,
  };
}

export function item(i, profile) {
  const id = `itm_${hex(20, i)}`;
  const heavy = profile === 'maximum';
  const imageCount = heavy ? 12 : 3;
  const images = Array.from({ length: imageCount }, (_, k) => image('ws_demo_workspace_01', id, i * 16 + k));
  return normalizeItem({
    id,
    name: arabic(heavy ? TEXT_LIMITS.name : 40, i),
    sku: `INV-2026-${String(i + 1).padStart(6, '0')}`,
    barcode: heavy ? '9'.repeat(TEXT_LIMITS.barcode) : `6281234${String(i).padStart(6, '0')}`,
    serialNumber: heavy ? 'S'.repeat(TEXT_LIMITS.serialNumber) : `SN-${hex(10, i)}`,
    modelNumber: heavy ? 'M'.repeat(TEXT_LIMITS.modelNumber) : `REF-${1000 + (i % 900)}`,
    referenceNumber: heavy ? 'R'.repeat(TEXT_LIMITS.referenceNumber) : '',
    brand: heavy ? arabic(TEXT_LIMITS.brand, i + 3) : 'رولكس',
    categoryId: `cat_${i % 12}`, folderId: `fld_${i % 40}`, locationId: `loc_${i % 6}`,
    quantity: 1 + (i % 7), unit: 'قطعة', condition: 'ممتاز',
    valuation: { min: 12000 + i, max: 15000 + i, currency: 'SAR', source: 'manual' },
    description: arabic(heavy ? TEXT_LIMITS.description : 400, i + 1),
    images,
    aiData: {
      description: arabic(heavy ? TEXT_LIMITS.description : 300, i + 2),
      evaluation: arabic(heavy ? TEXT_LIMITS.description : 300, i + 5),
      condition: 'ممتاز', localScore: 8.5, globalScore: 7.9,
      suggestedValuation: { min: 11000, max: 16000, currency: 'SAR', source: 'ai' },
      model: 'claude', analyzedAt: 1_760_000_000_000, imageHash: hex(64, i),
      suggestedName: arabic(heavy ? TEXT_LIMITS.name : 40, i + 7),
      suggestedCategory: 'ساعات', brand: 'رولكس', visibleText: heavy ? 'X'.repeat(500) : 'ROLEX OYSTER',
    },
    createdAt: 1_760_000_000_000 + i, updatedAt: 1_760_000_500_000 + i,
    createdBy: `usr_${hex(28, 1)}`, updatedBy: `usr_${hex(28, 1)}`, version: 3,
  }, { userId: `usr_${hex(28, 1)}` });
}

const encoder = new TextEncoder();
const utf8Bytes = (text) => encoder.encode(text).length;

function envelope(profile) {
  return {
    schemaVersion: SCHEMA_VERSION, appVersion: 'measure', exportedAt: new Date().toISOString(),
    backupType: 'metadata-only', imagesIncluded: false, note: 'بيانات القطع فقط',
    workspaceId: 'ws_demo_workspace_01',
    items: [],
    folders: Array.from({ length: 40 }, (_, i) => ({ id: `fld_${i}`, name: arabic(30, i), description: arabic(120, i) })),
    categories: Array.from({ length: 12 }, (_, i) => normalizeCategory({ id: `cat_${i}`, name: arabic(20, i) })),
    locations: Array.from({ length: 6 }, (_, i) => ({ id: `loc_${i}`, name: arabic(20, i) })),
  };
}

/** The exact byte size of `JSON.stringify(payload, null, indent)`, computed
 *  record by record so a size past what one string can hold is still known. */
export function backupBytes(count, profile, { indent = 2 } = {}) {
  const base = envelope(profile);
  // `"items": []` is where the records go; its size in the empty envelope is
  // replaced by the size of the populated array.
  let total = utf8Bytes(JSON.stringify(base, null, indent)) - 2;
  const pad = indent ? ' '.repeat(indent * 2) : '';
  const newline = indent ? 1 : 0;
  total += 2; // [ ]
  for (let i = 0; i < count; i += 1) {
    const text = JSON.stringify(item(i, profile), null, indent);
    const lines = indent ? text.split('\n').length : 1;
    total += utf8Bytes(text) + lines * pad.length + newline + (i ? 1 : 0);
  }
  if (count && indent) total += newline + indent; // closing bracket on its own line, indented
  return total;
}

/** The same, the direct way — for checking the computation at small sizes. */
export function backupBytesDirect(count, profile, { indent = 2 } = {}) {
  const payload = envelope(profile);
  payload.items = Array.from({ length: count }, (_, i) => item(i, profile));
  return utf8Bytes(JSON.stringify(payload, null, indent));
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  for (const indent of [2, 0]) {
    for (const profile of ['realistic', 'maximum']) {
      const check = backupBytesDirect(50, profile, { indent });
      const computed = backupBytes(50, profile, { indent });
      if (check !== computed) console.log(`  (computation off by ${computed - check} bytes at 50 ${profile}/${indent})`);
      for (const count of [50, 1000, 5000, 20000]) {
        const bytes = backupBytes(count, profile, { indent });
        console.log(`${indent ? 'pretty ' : 'compact'} ${profile.padEnd(9)} ${String(count).padStart(6)} items  ${mb(bytes).padStart(9)}  (${Math.round(bytes / count)} B/item)`);
      }
    }
  }
}
