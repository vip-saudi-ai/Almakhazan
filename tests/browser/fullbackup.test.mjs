// Full Backup (.nazmbackup): the archive really holds the images' bytes, a
// restore on another device brings back records, classification, field
// definitions (retired ones included) and images byte for byte, and a damaged,
// newer or interrupted backup never leaves the inventory half-replaced.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/fullbackup.test.mjs

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function openApp(context) {
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase|\[restore\]|\[media\]/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { page, errs };
}

/** Distinct image bytes: a tiny PNG and a JPEG-labelled payload. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNkYGD4z8DAwMDEwMDAAAAO/AEBa3kWSQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('صورة لوحة الصحراء — NAZM test image '.repeat(200)), Buffer.from([0xff, 0xd9])]);

// ── 1. an inventory worth backing up ───────────────────────────────────────
const source = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const { page, errs } = await openApp(source);
const seeded = await page.evaluate(async ({ png, jpeg }) => {
  const local = await import('/src/local-store.js');
  const { repository } = await import('/src/repository.js');
  const put = async (id, bytes, type) => {
    const buffer = new Uint8Array(bytes).buffer;
    await local.put('images', { id, itemId: null, original: buffer, originalType: type, thumbnail: buffer, thumbnailType: type, meta: {} });
    await local.put('mediaAssets', { id, storagePath: `local:${id}`, thumbnailPath: `local:${id}`, mimeType: type, fileSize: bytes.length, originalFilename: `${id} (1).${type.split('/')[1]}`, refCount: 0, orphanedAt: Date.now(), createdAt: Date.now() });
  };
  await put('med_desert', jpeg, 'image/jpeg');
  await put('med_badge', png, 'image/png');
  const ref = (id, type) => ({ id, mediaId: id, storagePath: `local:${id}`, thumbnailPath: `local:${id}`, mimeType: type });
  const lab = await repository.createTaxonomyNode({ level: 'main', name: 'معدات مختبر الأحجار' });
  const raman = await repository.createTaxonomyNode({ level: 'category', parentId: lab, name: 'Raman' });
  await repository.saveTaxonomyNodeFields(raman, [
    { id: 'custom_f_laser', type: 'select', label: 'طول الموجة', options: ['532 nm', '785 nm'] },
    { id: 'custom_f_calib', type: 'text', label: 'آخر معايرة' },
  ]);
  await repository.createItem({ id: 'it1', name: 'لوحة الصحراء', categoryId: 'art_paintings', images: [ref('med_desert', 'image/jpeg')], primaryImageId: 'med_desert', customFields: { artist: 'رضوي' } });
  await repository.createItem({ id: 'it2', name: 'Desert painting (copy)', categoryId: 'art_paintings', images: [ref('med_desert', 'image/jpeg')], primaryImageId: 'med_desert' });
  await repository.createItem({ id: 'it3', name: 'جهاز رامان Raman 785', categoryId: raman, images: [ref('med_badge', 'image/png')], customFields: { custom_f_laser: '785 nm', custom_f_calib: '2026-01' } });
  await repository.createItem({ id: 'it4', name: 'Pump without photo', categoryId: 'equipment_pumps' });
  // Retire one field while a record still uses it.
  const result = await repository.saveTaxonomyNodeFields(raman, [{ id: 'custom_f_laser', type: 'select', label: 'طول الموجة', options: ['532 nm', '785 nm'] }]);
  const assets = await local.getAll('mediaAssets');
  return { lab, raman, retired: result.retired, counts: Object.fromEntries(assets.map((a) => [a.id, a.refCount])) };
}, { png: [...PNG], jpeg: [...JPEG] });
check('F1 a Category field in use is retired, not deleted', seeded.retired.length === 1 && seeded.retired[0].id === 'custom_f_calib' && seeded.retired[0].usage === 1, JSON.stringify(seeded.retired));
check('F2 shared images are counted once per record', seeded.counts.med_desert === 2 && seeded.counts.med_badge === 1, JSON.stringify(seeded.counts));

const retiredShown = await page.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  const { fieldRows } = await import('/src/field-format.js');
  const item = await repository.getItem('it3', { fresh: true });
  const { previous } = fieldRows(item, repository.taxonomy());
  return previous.map((row) => `${row.label}=${row.text}`);
});
check('F3 the retired field’s value stays visible under «حقول سابقة»', retiredShown.includes('آخر معايرة=2026-01'), JSON.stringify(retiredShown));

// ── 2. the backup itself ───────────────────────────────────────────────────
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.evaluate(async () => (await import('/src/full-backup.js')).createFullBackup()),
]);
const archivePath = await download.path();
const archive = readFileSync(archivePath);
check('B1 the file is a .nazmbackup named for the day', /^NAZM-Backup-\d{4}-\d{2}-\d{2}\.nazmbackup$/.test(download.suggestedFilename()), download.suggestedFilename());
const listing = await page.evaluate(async (bytes) => {
  const { __readArchiveForTest } = await import('/src/full-backup.js');
  const { names, read } = await __readArchiveForTest(new File([new Uint8Array(bytes)], 'b.nazmbackup'));
  const manifest = JSON.parse(new TextDecoder().decode(await read('manifest.json')));
  const media = {};
  for (const entry of manifest.media) media[entry.path] = [...await read(entry.path)];
  const data = JSON.parse(new TextDecoder().decode(await read('data.json')));
  return { names, manifest, media, dataHasBase64: JSON.stringify(data).includes('base64'), fieldIds: data.fieldDefinitions.map((f) => f.id) };
}, [...archive]);
const jpegEntry = listing.manifest.media.find((m) => m.id === 'med_desert');
check('B2 the archive holds manifest, data and each image once', listing.names.includes('manifest.json') && listing.names.includes('data.json')
  && listing.manifest.media.length === 2 && listing.names.includes('media/med_desert.jpg') && listing.names.includes('media/med_badge.png'), listing.names.join(', '));
check('B3 the image bytes are the originals, and their checksums match', Buffer.from(listing.media['media/med_desert.jpg']).equals(JPEG)
  && jpegEntry.sha256 === sha(JPEG) && jpegEntry.size === JPEG.length);
check('B4 no image is embedded in the JSON', !listing.dataHasBase64);
check('B5 the manifest carries versions and counts', listing.manifest.backupFormatVersion === 1 && listing.manifest.taxonomySchemaVersion === 1
  && listing.manifest.databaseVersion >= 10 && listing.manifest.counts.items === 4 && listing.manifest.appVersion === '1.0.0');
check('B6 field definitions travel, the retired one included', listing.fieldIds.includes('custom_f_calib') && listing.fieldIds.includes('custom_f_laser'), listing.fieldIds.join());
const last = await page.evaluate(async () => (await import('/src/full-backup.js')).lastBackupInfo());
check('B7 «آخر نسخة احتياطية» is recorded after the handoff', last?.type === 'full' && last.items === 4 && last.media === 2, JSON.stringify(last));

// ── 3. restoring on another device ────────────────────────────────────────
const target = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const { page: fresh, errs: freshErrs } = await openApp(target);
const restored = await fresh.evaluate(async (bytes) => {
  const fb = await import('/src/full-backup.js');
  const { repository } = await import('/src/repository.js');
  const local = await import('/src/local-store.js');
  const { fieldRows } = await import('/src/field-format.js');
  const file = new File([new Uint8Array(bytes)], 'NAZM-Backup.nazmbackup');
  const archive = await fb.openFullBackup(file);
  await fb.verifyFullBackupMedia(archive);
  const result = await fb.restoreFullBackup(archive, { saveBackup: async () => {} });
  const images = await local.getAll('images');
  const assets = await local.getAll('mediaAssets');
  const it3 = await repository.getItem('it3', { fresh: true });
  const hash = async (buffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return {
    result,
    items: (await local.getAll('items')).length,
    images: await Promise.all(images.map(async (img) => [img.id, await hash(img.original)])),
    counts: Object.fromEntries(assets.map((a) => [a.id, a.refCount])),
    labLabel: repository.taxonomy().breadcrumb(it3),
    previous: fieldRows(it3, repository.taxonomy()).previous.map((row) => `${row.label}=${row.text}`),
    current: fieldRows(it3, repository.taxonomy()).current.map((row) => `${row.label}=${row.text}`),
  };
}, [...archive]);
const hashes = Object.fromEntries(restored.images);
check('R1 every record comes back', restored.items === 4 && restored.result.restored === 4, JSON.stringify(restored.result));
check('R2 every image comes back byte for byte', hashes.med_desert === sha(JPEG) && hashes.med_badge === sha(PNG), JSON.stringify(hashes));
check('R3 image reference counts are right immediately after the restore', restored.counts.med_desert === 2 && restored.counts.med_badge === 1, JSON.stringify(restored.counts));
check('R4 the customer’s own classification comes back', restored.labLabel === 'معدات مختبر الأحجار › Raman', restored.labLabel);
check('R5 active and retired field values both come back readable', restored.current.includes('طول الموجة=785 nm') && restored.previous.includes('آخر معايرة=2026-01'),
  JSON.stringify([restored.current, restored.previous]));

// ── 4. damaged, newer and wrong files are refused before anything changes ──
const refusal = async (mutate) => fresh.evaluate(async (bytes) => {
  const fb = await import('/src/full-backup.js');
  try {
    const archive = await fb.openFullBackup(new File([new Uint8Array(bytes)], 'x.nazmbackup'));
    await fb.verifyFullBackupMedia(archive);
    return 'accepted';
  } catch (error) {
    return error.code || error.message;
  }
}, [...mutate(Buffer.from(archive))]);
const at = (needle) => archive.indexOf(Buffer.from(needle));
check('C1 a damaged image is caught by its checksum', await refusal((b) => { const i = at('NAZM test image'); b[i] ^= 0xff; return b; }) === 'backup/image-checksum');
check('C2 damaged data is caught by its checksum', await refusal((b) => { const i = at('"it1"'); b[i + 2] = 'j'.charCodeAt(0); return b; }) === 'backup/data-checksum');
check('C3 a backup from a newer NAZM is refused', await refusal((b) => { const i = at('"backupFormatVersion": 1'); b[i + 23] = '9'.charCodeAt(0); return b; }) === 'backup/newer');
check('C4 a truncated file is refused', (await refusal((b) => b.subarray(0, b.length - 30))).startsWith('backup/'));
check('C5 a JSON file is not mistaken for a Full Backup', await fresh.evaluate(async () => (await import('/src/full-backup.js')).looksLikeFullBackup(new File(['{"items":[]}'], 'a.json'))) === false);

// ── 5. an interrupted full restore resumes from the same file ───────────────
const interrupted = await fresh.evaluate(async (bytes) => {
  const fb = await import('/src/full-backup.js');
  const { repository } = await import('/src/repository.js');
  const restore = await import('/src/restore.js');
  await repository.createItem({ id: 'extra', name: 'قطعة أضيفت بعد الاستعادة' });
  const file = new File([new Uint8Array(bytes)], 'NAZM-Backup.nazmbackup');
  const archive = await fb.openFullBackup(file);
  const real = repository.bulkWrite.bind(repository);
  let calls = 0;
  repository.bulkWrite = async (ops, options) => {
    calls += 1;
    if (calls === 2) throw new Error('simulated termination');
    return real(ops, options);
  };
  let failed = false;
  try { await fb.restoreFullBackup(archive, { saveBackup: async () => {} }); } catch { failed = true; }
  repository.bulkWrite = real;
  const pending = await restore.unfinishedRestore();
  const again = await fb.restoreFullBackup(await fb.openFullBackup(file), { saveBackup: async () => {} });
  const after = await restore.unfinishedRestore();
  const ids = repository.liveItems().map((i) => i.id).sort();
  return { failed, pending: Boolean(pending), resumed: again.restored, after: Boolean(after), ids };
}, [...archive]);
check('I1 an interruption leaves a recorded, recoverable restore', interrupted.failed && interrupted.pending, JSON.stringify(interrupted));
check('I2 the same backup finishes it, and the inventory is exactly the backup', interrupted.resumed === 4 && !interrupted.after
  && interrupted.ids.join() === 'it1,it2,it3,it4', JSON.stringify(interrupted));

// ── 6. clearing the inventory reclaims the images it held ──────────────────
const cleared = await fresh.evaluate(async () => {
  const { repository } = await import('/src/repository.js');
  const local = await import('/src/local-store.js');
  await repository.clearInventory();
  return { images: (await local.getAll('images')).length, assets: (await local.getAll('mediaAssets')).length };
});
check('M1 clearing the inventory reclaims its images at once', cleared.images === 0 && cleared.assets === 0, JSON.stringify(cleared));

check('Z1 no JS errors', errs.length === 0 && freshErrs.length === 0, [...errs, ...freshErrs].join(' | ').slice(0, 300));
await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
for (const line of pass) console.log('  ✓', line);
for (const line of fail) console.log('  ✗', line);
process.exit(fail.length ? 1 : 0);
