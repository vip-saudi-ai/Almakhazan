// Full Backup (format version 2) and Full Restore, end to end.
//
//   the archive       chunked NDJSON records, metadata, media and media
//                     manifests, a manifest with a SHA-256 for every piece
//   a restore         on another device: records exactly as saved (ids,
//                     versions, timestamps), classification ids, retired and
//                     recovered field definitions, images byte for byte
//   refusals          every kind of damage refused before one record changes
//   images            an image already on the device is kept only if its bytes
//                     match; a wrong original or thumbnail is repaired
//   degraded          a backup missing images says so, and restores every record
//   interruption      at media, first chunk, later chunk, removal — resumed
//                     with the same file, blocked for a different one
//   native            the streaming bridge in bounded slices; a cancelled or
//                     failed handoff records nothing and aborts a restore
//   final check       a restored state that does not match is never "completed"
//   version 1         an existing .nazmbackup still restores
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/fullbackup.test.mjs

import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const allErrors = [];

async function device({ native = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  if (native) await context.addInitScript(native);
  const page = await context.newPage();
  page.on('pageerror', (e) => allErrors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase|\[restore\]|\[media\]|\[backup\]|AppError|restore\/|backup\//.test(m.text())) allErrors.push('CONSOLE: ' + m.text());
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(250);
  return { context, page };
}

async function reload(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(250);
}

const H = "const h = await import('/tests/browser/backup-helpers.mjs'); const fb = await import('/src/full-backup.js'); const local = await import('/src/local-store.js'); const { repository } = await import('/src/repository.js');";
/** Runs `body` in the page with the helpers in scope. */
const run = (page, body, arg) => page.evaluate(new Function('arg', `return (async () => { ${H} ${body} })();`), arg);

const JPEG = [0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 3000 }, (_, i) => (i * 7) % 256), 0xff, 0xd9];
const PNG = [0x89, 0x50, 0x4e, 0x47, ...Array.from({ length: 900 }, (_, i) => (i * 13) % 256)];
const PNG_THUMB = [0xff, 0xd8, ...Array.from({ length: 200 }, (_, i) => (i * 3) % 256), 0xff, 0xd9];

// ── A. an inventory worth backing up ──────────────────────────────────────
const A = await device();
const seeded = await run(A.page, `
  await h.putImage('med_desert', arg.jpeg);
  await h.putImage('med_badge', arg.png, arg.thumb, 'image/png');
  const lab = await repository.createTaxonomyNode({ level: 'main', name: 'معدات مختبر الأحجار' });
  const raman = await repository.createTaxonomyNode({ level: 'category', parentId: lab, name: 'Raman' });
  const probes = await repository.createTaxonomyNode({ level: 'sub', parentId: raman, name: 'مجسات' });
  await repository.saveTaxonomyNodeFields(raman, [
    { id: 'custom_f_laser', type: 'select', label: 'طول الموجة', options: ['532 nm', '785 nm'] },
    { id: 'custom_f_calib', type: 'text', label: 'آخر معايرة' },
  ]);
  await repository.createItem({ id: 'it1', name: 'لوحة الصحراء', categoryId: 'art_paintings', images: [h.imageRef('med_desert')], primaryImageId: 'med_desert', customFields: { artist: 'رضوي' } });
  await repository.createItem({ id: 'it2', name: 'Desert painting (copy)', categoryId: 'art_paintings', images: [h.imageRef('med_desert')], primaryImageId: 'med_desert' });
  await repository.createItem({ id: 'it3', name: 'جهاز رامان Raman 785', mainCategoryId: lab, categoryId: raman, subcategoryId: probes, images: [h.imageRef('med_badge')], customFields: { custom_f_laser: '785 nm', custom_f_calib: '2026-01' } });
  await repository.createItem({ id: 'it4', name: 'Pump without photo', categoryId: 'equipment_pumps' });
  // A value no definition describes — the restore must keep it under a recovered one.
  await local.put('items', { ...(await local.get('items', 'it4')), customFields: { custom_f_ghost: 'قيمة بلا تعريف' }, customFieldIds: ['custom_f_ghost'] });
  const retired = await repository.saveTaxonomyNodeFields(raman, [{ id: 'custom_f_laser', type: 'select', label: 'طول الموجة', options: ['532 nm', '785 nm'] }]);
  const items = await Promise.all(['it1', 'it2', 'it3', 'it4'].map((id) => local.get('items', id)));
  return { lab, raman, probes, retired: retired.retired.map((r) => r.id), stamps: Object.fromEntries(items.map((i) => [i.id, [i.version, i.updatedAt, i.createdAt]])) };
`, { jpeg: JPEG, png: PNG, thumb: PNG_THUMB });
check('F1 a Category field in use is retired, not deleted', seeded.retired.includes('custom_f_calib'), JSON.stringify(seeded.retired));

const made = await run(A.page, `
  const { file, summary } = await h.backupToFile();
  const entries = await h.entriesOf(file);
  const names = entries.map(([n]) => n);
  const get = (n) => entries.find(([name]) => name === n)[1];
  const manifest = JSON.parse(new TextDecoder().decode(get('manifest.json')));
  const chunk = get('items/00000001.ndjson');
  const lines = new TextDecoder().decode(chunk).split('\\n').filter(Boolean).map((l) => JSON.parse(l));
  const media = new TextDecoder().decode(get('manifests/media-000001.ndjson')).split('\\n').filter(Boolean).map((l) => JSON.parse(l));
  const desert = media.find((m) => m.id === 'med_desert');
  const badge = media.find((m) => m.id === 'med_badge');
  return {
    summary, names, manifest,
    chunkHashOk: manifest.itemChunks[0].sha256 === await h.sha(chunk) && manifest.itemChunks[0].count === lines.length,
    metadataHashOk: manifest.metadata.sha256 === await h.sha(get('metadata.json')),
    desertBytes: [...get(desert.path)], badgeThumb: [...get(badge.thumbnailPath)],
    desertSha: desert.sha256, badgeAsset: badge.asset,
    chunkText: new TextDecoder().decode(chunk),
    last: await fb.lastBackupInfo(),
    base64: await h.fileToBase64(file),
  };
`);
const m = made.manifest;
check('B1 the archive is metadata, item chunks, media, media manifests and a manifest — no data.json',
  made.names[0] === 'metadata.json' && made.names.includes('items/00000001.ndjson') && made.names.some((n) => /^media\/0000000[12]\.jpg$/.test(n))
  && made.names.some((n) => /^media\/0000000[12]\.png$/.test(n)) && made.names.includes('media/00000002.thumb.jpg') && made.names.includes('manifests/media-000001.ndjson')
  && made.names[made.names.length - 1] === 'manifest.json' && !made.names.includes('data.json'), made.names.join(', '));
check('B2 the manifest describes the archive: versions, ids, counts, integrity, chunk and metadata hashes',
  m.backupFormatVersion === 2 && m.minReaderVersion === 2 && /^bkp/.test(m.backupId) && m.backupType === 'full'
  && m.schemaVersion >= 1 && m.databaseVersion === 13 && m.taxonomySchemaVersion === 1 && m.appVersion === '1.0.0'
  && m.counts.items === 4 && m.counts.itemChunks === 1 && m.counts.media === 2 && m.counts.missingMedia === 0
  && m.integrityStatus === 'complete' && made.chunkHashOk && made.metadataHashOk && m.itemChunks[0].path === 'items/00000001.ndjson',
  JSON.stringify({ counts: m.counts, integrity: m.integrityStatus, chunks: m.itemChunks }));
check('B3 image bytes are the originals and their checksums match', JSON.stringify(made.desertBytes) === JSON.stringify(JPEG)
  && JSON.stringify(made.badgeThumb) === JSON.stringify(PNG_THUMB) && made.badgeAsset?.originalFilename === 'med_badge.jpg');
check('B4 records are one JSON object per line, with no image embedded', made.chunkText.split('\n').filter(Boolean).length === 4
  && !/base64|data:image/.test(made.chunkText));
check('B5 «آخر نسخة احتياطية» records a complete backup after the handoff', made.last?.integrity === 'complete' && made.last.items === 4 && made.last.media === 2, JSON.stringify(made.last));
check('B6 the file name is dated and unique to the second', /^NAZM-Backup-\d{4}-\d{2}-\d{2}-\d{6}\.nazmbackup$/.test(made.summary.filename), made.summary.filename);

// The real web path: a download.
const [download] = await Promise.all([
  A.page.waitForEvent('download', { timeout: 20000 }),
  run(A.page, 'await fb.createFullBackup();'),
]);
check('B7 on the web the backup is downloaded as a .nazmbackup', /^NAZM-Backup-.*\.nazmbackup$/.test(download.suggestedFilename()), download.suggestedFilename());
const busy = await run(A.page, `
  const sink = h.memorySink();
  const first = fb.createFullBackup({ sink });
  const second = await h.codeOf(fb.createFullBackup({ sink: h.memorySink() }));
  await first;
  return second;
`);
check('B8 a second backup while one runs is refused, not queued', busy === 'backup/busy', busy);

// ── R. restoring on another device ────────────────────────────────────────
const B = await device();
const restored = await run(B.page, `
  await repository.createItem({ id: 'old1', name: 'قطعة قديمة على الجهاز الجديد', categoryId: 'art_paintings' });
  const before = (await local.getAll('activity')).length;
  const file = h.base64ToFile(arg);
  const result = await h.restoreFile(file);
  const items = await Promise.all(['it1', 'it2', 'it3', 'it4'].map((id) => local.get('items', id)));
  const images = await local.getAll('images');
  const assets = await local.getAll('mediaAssets');
  const defs = await local.getAll('fieldDefinitions');
  const activity = await local.getAll('activity');
  const job = await local.getMeta('restoreJob');
  const { fieldRows } = await import('/src/field-format.js');
  const it3 = await repository.getItem('it3', { fresh: true });
  const it4 = await repository.getItem('it4', { fresh: true });
  return {
    result,
    ids: await h.allIds('items'),
    stamps: Object.fromEntries(items.map((i) => [i.id, [i.version, i.updatedAt, i.createdAt]])),
    classification: [it3.mainCategoryId, it3.categoryId, it3.subcategoryId],
    images: await Promise.all(images.map(async (i) => [i.id, await h.sha(i.original), await h.sha(i.thumbnail)])),
    counts: Object.fromEntries(assets.map((a) => [a.id, a.refCount])),
    defs: Object.fromEntries(defs.map((d) => [d.id, { retired: d.retired, recovered: Boolean(d.recovered) }])),
    previous: fieldRows(it3, repository.taxonomy()).previous.map((r) => r.label + '=' + r.text),
    ghost: [...fieldRows(it4, repository.taxonomy()).current, ...fieldRows(it4, repository.taxonomy()).previous].map((r) => r.label + '=' + r.text),
    newEvents: activity.length - before,
    restoredEvents: activity.filter((a) => a.action === 'import_restored' || a.type === 'import_restored' || /restor/i.test(a.action || a.type || '')).length,
    job: job && { status: job.status, engine: job.engine },
    index: await local.countFresh('restoreIndex'),
    work: await local.countFresh('workIndex'),
  };
`, made.base64);
check('R1 exactly the backup\'s records remain — the device\'s own old record is removed',
  JSON.stringify(restored.ids.sort()) === JSON.stringify(['it1', 'it2', 'it3', 'it4']) && restored.result.restored === 4 && restored.result.removed.items === 1,
  JSON.stringify({ ids: restored.ids, result: restored.result }));
check('R2 records come back exactly as saved: version, updatedAt and createdAt unchanged',
  JSON.stringify(restored.stamps) === JSON.stringify(seeded.stamps), JSON.stringify([restored.stamps, seeded.stamps]));
check('R3 the customer\'s own classification ids come back exactly',
  JSON.stringify(restored.classification) === JSON.stringify([seeded.lab, seeded.raman, seeded.probes]), JSON.stringify(restored.classification));
const imgs = Object.fromEntries(restored.images.map(([id, o, t]) => [id, [o, t]]));
check('R4 every image comes back byte for byte, original and thumbnail', imgs.med_desert?.[0] === made.desertSha && imgs.med_badge && imgs.med_badge[0] !== imgs.med_badge[1], JSON.stringify(imgs));
check('R5 reference counts are right the moment the restore completes', restored.counts.med_desert === 2 && restored.counts.med_badge === 1, JSON.stringify(restored.counts));
check('R6 the retired definition comes back retired, and its value stays readable',
  restored.defs.custom_f_calib?.retired === true && restored.previous.includes('آخر معايرة=2026-01'), JSON.stringify([restored.defs, restored.previous]));
check('R7 a value no definition described is kept under a recovered definition',
  restored.defs.custom_f_ghost?.recovered === true && restored.ghost.some((r) => r.endsWith('=قيمة بلا تعريف')), JSON.stringify([restored.defs.custom_f_ghost, restored.ghost]));
check('R8 one activity event for the whole restore, not one per record', restored.newEvents === 1, `${restored.newEvents} new events`);
check('R9 the job is completed and the restore index and scratch space are empty',
  restored.job?.status === 'completed' && restored.job.engine === 'full' && restored.index === 0 && restored.work === 0, JSON.stringify(restored.job) + ` index ${restored.index} work ${restored.work}`);

const reuse = await run(B.page, `
  const file = h.base64ToFile(arg);
  const archive = await fb.openFullBackup(file);
  await fb.verifyFullBackup(archive);
  await fb.restoreFullBackup(archive);
  await repository.createItem({ id: 'after-restore', name: 'أضيفت بعد الاستعادة', categoryId: 'art_paintings' });
  const again = await h.codeOf(fb.restoreFullBackup(archive));
  const kept = (await h.allIds('items')).length;
  await local.remove('items', 'after-restore');
  return { again, kept };
`, made.base64);
check('R10 an opened backup whose restore completed cannot drive another without being checked again', reuse.again === 'backup/unverified' && reuse.kept === 5, JSON.stringify(reuse));

// ── C. damage is refused before anything changes ──────────────────────────
const refusals = await run(B.page, `
  const good = h.base64ToFile(arg);
  const entries = await h.entriesOf(good);
  const get = (n) => entries.find(([name]) => name === n)[1];
  const manifest = JSON.parse(new TextDecoder().decode(get('manifest.json')));
  const media = new TextDecoder().decode(get('manifests/media-000001.ndjson')).split('\\n').filter(Boolean).map((l) => JSON.parse(l));
  const flip = (bytes) => { const copy = bytes.slice(); copy[copy.length >> 1] ^= 0xff; return copy; };
  const snapshot = async () => JSON.stringify([(await h.allIds('items')).sort(), await local.countFresh('images'), (await local.getMeta('restoreJob'))?.id]);
  const before = await snapshot();
  const attempt = async (file) => h.codeOf(h.restoreFile(file));
  const out = {};
  out.chunk = await attempt(await h.rebuild(good, { replace: { 'items/00000001.ndjson': flip } }));
  out.metadata = await attempt(await h.rebuild(good, { replace: { 'metadata.json': flip } }));
  out.original = await attempt(await h.rebuild(good, { replace: { [media[0].path]: flip } }));
  out.thumbnail = await attempt(await h.rebuild(good, { replace: { [media.find((d) => d.thumbnailPath && d.id === 'med_badge').thumbnailPath]: flip } }));
  out.duplicatePath = await attempt(await h.rebuild(good, { add: [['items/00000001.ndjson', get('items/00000001.ndjson')]] }));
  out.duplicateMedia = await attempt(await h.rebuild(good, { add: [[media[0].path, get(media[0].path)]], before: 'manifests/media-000001.ndjson' }));
  out.extraEntry = await attempt(await h.rebuild(good, { add: [['notes/readme.txt', h.enc.encode('hi')]] }));
  out.extraMedia = await attempt(await h.rebuild(good, { add: [['media/00000099.jpg', h.enc.encode('x')]], before: 'manifests/media-000001.ndjson' }));
  // A path that walks up, patched into both headers of an otherwise valid archive.
  const placeholder = await h.rebuild(good, { add: [['aaaaaaaaaa', h.enc.encode('x')]] });
  const raw = new Uint8Array(await placeholder.arrayBuffer());
  const needle = h.enc.encode('aaaaaaaaaa');
  for (let i = 0; i < raw.length - needle.length; i += 1) if (needle.every((b, j) => raw[i + j] === b)) raw.set(h.enc.encode('../../evil'), i);
  out.traversal = await attempt(new File([raw], 't.nazmbackup'));
  // Deflate claimed for the first entry, in its directory record.
  const zipped = new Uint8Array(await good.arrayBuffer());
  const view = new DataView(zipped.buffer);
  let eocd = zipped.length - 22;
  while (view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  view.setUint16(view.getUint32(eocd + 16, true) + 10, 8, true);
  out.compressed = await attempt(new File([zipped], 'c.nazmbackup'));
  out.newer = await attempt(await h.withManifest(good, (m) => { m.backupFormatVersion = 3; }));
  out.newerReader = await attempt(await h.withManifest(good, (m) => { m.minReaderVersion = 3; }));
  out.chunkCount = await attempt(await h.withManifest(good, (m) => { m.counts.itemChunks = 2; }));
  // A record repeated inside a chunk whose descriptor was made to match.
  const chunk = get('items/00000001.ndjson');
  const firstLine = new TextDecoder().decode(chunk).split('\\n')[0];
  out.duplicateRecord = await attempt(await h.withManifest(good, () => {}, { recount: true, replace: { 'items/00000001.ndjson': h.enc.encode(new TextDecoder().decode(chunk) + firstLine + '\\n') } }));
  // Prototype pollution travels under __proto__ and is dropped.
  const polluted = new TextDecoder().decode(chunk).replace('"name":"لوحة الصحراء"', '"name":"لوحة الصحراء","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}');
  const pollutedFile = await h.withManifest(good, () => {}, { recount: true, replace: { 'items/00000001.ndjson': h.enc.encode(polluted) } });
  const archive = await fb.openFullBackup(pollutedFile);
  await fb.verifyFullBackup(archive);
  out.pollution = ({}).polluted === undefined && Object.prototype.polluted === undefined;
  out.truncated = await attempt(new File([(await good.arrayBuffer()).slice(0, good.size - 40)], 'short.nazmbackup'));
  out.json = await fb.looksLikeFullBackup(new File(['{"items":[]}'], 'a.json'));
  out.unchanged = (await snapshot()) === before;
  // A check never followed by a restore leaves its index until the next
  // start (or the next check) clears it.
  out.indexAfterCheck = await local.countFresh('restoreIndex');
  await fb.cleanupAbandonedRestoreState();
  out.index = await local.countFresh('restoreIndex');
  return out;
`, made.base64);
check('C1 a changed item chunk is refused by its checksum', refusals.chunk === 'backup/chunk-checksum', refusals.chunk);
check('C2 a changed metadata.json is refused', refusals.metadata === 'backup/metadata-checksum', refusals.metadata);
check('C3 a changed original image is refused', refusals.original === 'backup/image-checksum', refusals.original);
check('C4 a changed thumbnail is refused', refusals.thumbnail === 'backup/image-checksum', refusals.thumbnail);
check('C5 a repeated archive path is refused', refusals.duplicatePath === 'backup/duplicate-entry', refusals.duplicatePath);
check('C6 a repeated image entry is refused', /unexpected-entry|missing-image/.test(refusals.duplicateMedia), refusals.duplicateMedia);
check('C7 an entry the manifest does not name is refused', refusals.extraEntry === 'backup/unexpected-entry' && refusals.extraMedia === 'backup/unexpected-entry', `${refusals.extraEntry} ${refusals.extraMedia}`);
check('C8 a path that walks out of the archive is refused', refusals.traversal === 'backup/unsafe-path', refusals.traversal);
check('C9 an unsupported compression method is refused', refusals.compressed === 'backup/compressed', refusals.compressed);
check('C10 a newer format, or one needing a newer reader, is refused', refusals.newer === 'backup/newer' && refusals.newerReader === 'backup/newer', `${refusals.newer} ${refusals.newerReader}`);
check('C11 a manifest whose chunk count disagrees is refused', refusals.chunkCount === 'backup/chunk-count', refusals.chunkCount);
check('C12 a record repeated in the backup is refused', refusals.duplicateRecord === 'backup/duplicate-entry', refusals.duplicateRecord);
check('C13 __proto__ and constructor keys cannot pollute prototypes', refusals.pollution === true);
check('C14 a truncated file and a JSON file are not taken for backups', /not-archive|truncated/.test(refusals.truncated) && refusals.json === false, refusals.truncated);
check('C15 after every refusal the inventory is exactly as it was, with no job; an abandoned check\'s index is cleared at the next start',
  refusals.unchanged && refusals.indexAfterCheck > 0 && refusals.index === 0, JSON.stringify(refusals));

// ── M. images already on the device ───────────────────────────────────────
const collisions = await run(B.page, `
  const file = h.base64ToFile(arg.base64);
  const same = await h.restoreFile(file);
  const good = await local.get('images', 'med_desert');
  await local.put('images', { ...good, original: new Uint8Array([1, 2, 3]).buffer });
  const badge = await local.get('images', 'med_badge');
  await local.put('images', { ...badge, thumbnail: new Uint8Array([9, 9, 9]).buffer });
  const repaired = await h.restoreFile(file);
  const after = await local.get('images', 'med_desert');
  const badgeAfter = await local.get('images', 'med_badge');
  return {
    same: same.mediaOutcomes, repaired: repaired.mediaOutcomes,
    original: await h.sha(after.original), badgeThumb: [...new Uint8Array(badgeAfter.thumbnail)],
    counts: Object.fromEntries((await local.getAll('mediaAssets')).map((a) => [a.id, a.refCount])),
  };
`, { base64: made.base64 });
check('M1 an image whose bytes already match is not rewritten', collisions.same.kept === 2 && !collisions.same.repaired && !collisions.same.written, JSON.stringify(collisions.same));
check('M2 a local original with the same id but other bytes is replaced by the verified one', collisions.repaired.repaired === 2 && collisions.original === made.desertSha, JSON.stringify(collisions.repaired));
check('M3 a local thumbnail with the wrong bytes is replaced', JSON.stringify(collisions.badgeThumb) === JSON.stringify(PNG_THUMB));
check('M4 reference counts stay right after repair', collisions.counts.med_desert === 2 && collisions.counts.med_badge === 1, JSON.stringify(collisions.counts));

// ── D. a backup made while an image was already missing ────────────────────
const degraded = await run(A.page, `
  await repository.createItem({ id: 'it5', name: 'قطعة فقدت صورتها', categoryId: 'art_paintings', images: [h.imageRef('med_lost')] });
  const { file, summary } = await h.backupToFile();
  const manifest = JSON.parse(new TextDecoder().decode((await h.entriesOf(file)).find(([n]) => n === 'manifest.json')[1]));
  return { summary, manifest, last: await fb.lastBackupInfo(), base64: await h.fileToBase64(file) };
`);
check('D1 a backup with a missing image is marked degraded and names it', degraded.manifest.integrityStatus === 'degraded'
  && degraded.manifest.missingMedia.includes('med_lost') && degraded.manifest.counts.missingMedia === 1 && degraded.summary.missingCount === 1,
  JSON.stringify({ status: degraded.manifest.integrityStatus, missing: degraded.manifest.missingMedia }));
check('D2 «آخر نسخة احتياطية» records that it was degraded', degraded.last?.integrity === 'degraded', JSON.stringify(degraded.last));
const degradedRestore = await run(B.page, `
  const result = await h.restoreFile(h.base64ToFile(arg));
  const it5 = await local.get('items', 'it5');
  return { result, it5: it5 && it5.images.map((i) => i.mediaId) };
`, degraded.base64);
check('D3 restoring it keeps every record and reports the missing image', degradedRestore.result.restored === 5
  && JSON.stringify(degradedRestore.it5) === '["med_lost"]' && degradedRestore.result.missingMedia === 1 && degradedRestore.result.declaredMissing === 1,
  JSON.stringify(degradedRestore));

// ── I. interruption and resumption ─────────────────────────────────────────
const C1 = await device();
const big = await run(C1.page, `
  const records = [];
  for (let i = 0; i < 4500; i += 1) {
    records.push({ id: 'big' + String(i).padStart(5, '0'), name: 'سجل ' + i, categoryId: 'art_paintings', quantity: 1, unit: 'قطعة',
      images: i < 3 ? [h.imageRef('pic' + i)] : [], customFields: {}, customFieldIds: [], createdAt: 1700000000000 + i, updatedAt: 1700000000000 + i, version: 1, deletedAt: null });
  }
  for (let i = 0; i < 3; i += 1) await h.putImage('pic' + i, Array.from({ length: 500 + i }, (_, j) => (i + j) % 256));
  await local.putMany('items', records);
  const { file, summary } = await h.backupToFile();
  // A second, unrelated backup, for the "different file" refusal.
  await local.put('items', { ...records[10], id: 'other-only', name: 'نسخة أخرى' });
  const other = await h.backupToFile();
  return { summary, base64: await h.fileToBase64(file), other: await h.fileToBase64(other.file) };
`);
check('I0 4,500 records are cut into chunks of at most 2,000', big.summary.itemChunks === 3 && big.summary.largestChunkRecords === 2000, JSON.stringify(big.summary));
await C1.context.close();

const C2 = await device();
const faulted = (page, where, detail) => run(page, `
  const engine = await import('/src/restore-engine.js');
  const [where, detail] = arg.fault;
  engine.__setRestoreFaultForTest(async (name, info) => {
    if (name === where && Object.entries(detail).every(([k, v]) => info[k] === v)) throw new Error('interrupted at ' + name);
  });
  try {
    const result = await h.restoreFile(h.base64ToFile(arg.base64));
    return { completed: true, result };
  } catch (error) {
    return { error: error.message, code: error.code };
  } finally {
    engine.__setRestoreFaultForTest(null);
  }
`, { base64: big.base64, fault: [where, detail] });
const stateOf = (page) => run(page, `
  const job = await local.getMeta('restoreJob');
  const ids = await h.allIds('items');
  return {
    status: job?.status, interruptedAt: job?.interruptedAt, progress: job?.progress,
    items: ids.length, old: ids.filter((id) => id.startsWith('old')).length,
    index: await local.countFresh('restoreIndex'), images: await local.countFresh('images'),
  };
`);
await run(C2.page, `
  for (let i = 0; i < 10; i += 1) await repository.createItem({ id: 'old' + i, name: 'قديم ' + i, categoryId: 'art_paintings' });
`);
const i16 = await faulted(C2.page, 'media', { done: 1 });
const s16 = await stateOf(C2.page);
check('I1 interrupted while writing images: tracked, old inventory untouched', i16.code === undefined && s16.status === 'recovery-required' && s16.interruptedAt === 'writing-media'
  && s16.old === 10 && s16.items === 10, JSON.stringify([i16, s16]));
const i14 = await faulted(C2.page, 'items', { chunk: 1 });
const s14 = await stateOf(C2.page);
check('I2 interrupted after the first chunk: a tracked mixed state, index kept for recovery',
  s14.status === 'recovery-required' && s14.interruptedAt === 'writing-items' && s14.progress.chunk === 1 && s14.items === 2010 && s14.index > 4500,
  JSON.stringify(s14));
await reload(C2.page);
const blocked = await run(C2.page, `
  const job = await local.getMeta('restoreJob');
  const other = await h.codeOf(h.restoreFile(h.base64ToFile(arg)));
  const merge = await h.codeOf((await import('/src/restore.js')).assertNoUnfinishedRestore());
  return { status: job.status, other, merge, index: await local.countFresh('restoreIndex') };
`, big.other);
check('I3 after a restart the job still needs recovery, and a different backup is refused',
  blocked.status === 'recovery-required' && blocked.other === 'restore/recovery-required' && blocked.merge === 'restore/recovery-required' && blocked.index > 4500,
  JSON.stringify(blocked));
const i15 = await faulted(C2.page, 'items', { chunk: 2 });
const s15 = await stateOf(C2.page);
check('I4 resumed with the same file and interrupted again after several chunks', s15.progress.chunk === 2 && s15.status === 'recovery-required' && s15.items === 4010, JSON.stringify([i15, s15]));
const i17 = await faulted(C2.page, 'remove', { collection: 'items' });
const s17 = await stateOf(C2.page);
check('I5 interrupted while removing old records: still tracked', s17.status === 'recovery-required' && s17.interruptedAt === 'removing-old-records', JSON.stringify(s17));
const i18 = await faulted(C2.page, 'never', {});
const s18 = await stateOf(C2.page);
check('I6 resuming with the same backup completes: exactly its records, old ones removed, index cleared',
  i18.completed && s18.status === 'completed' && s18.items === 4500 && s18.old === 0 && s18.index === 0 && s18.images === 3 && i18.result.resumed === true,
  JSON.stringify([i18.result, s18]));
await C2.context.close();

// ── N. the native streaming bridge ─────────────────────────────────────────
const nativeBridge = () => {
  window.__native = { slices: [], largest: 0, finished: 0, aborted: 0, mode: 'ok', failAppendAfter: Infinity };
  const files = new Map();
  window.NazmNative = {
    platform: 'ios',
    beginFile: async ({ filename }) => { const handle = 'tmp/' + filename + '.partial'; files.set(handle, []); return handle; },
    appendFile: async ({ handle, base64 }) => {
      const n = window.__native;
      if (n.slices.length >= n.failAppendAfter) throw new Error('disk write failed');
      n.slices.push(base64.length);
      n.largest = Math.max(n.largest, base64.length);
      files.get(handle).push(base64);
    },
    finishFile: async ({ handle }) => {
      const n = window.__native;
      if (n.mode === 'cancel') { files.delete(handle); throw new Error('Share canceled'); }
      if (n.mode === 'fail') { files.delete(handle); throw new Error('could not move the file'); }
      n.finished += 1;
      n.lastFile = files.get(handle);
      files.delete(handle);
    },
    abortFile: async ({ handle }) => { window.__native.aborted += 1; files.delete(handle); },
  };
};
const N = await device({ native: nativeBridge });
const native = await run(N.page, `
  await h.putImage('big', Array.from({ length: 900000 }, (_, i) => i % 251));
  await repository.createItem({ id: 'n1', name: 'صورة كبيرة', categoryId: 'art_paintings', images: [h.imageRef('big')] });
  const summary = await fb.createFullBackup();
  const bytes = window.__native.lastFile.map((b64) => h.base64ToFile(b64)).reduce((all, f) => all.concat(f), []);
  const file = new File(bytes, 'native.nazmbackup');
  const archive = await fb.openFullBackup(file);
  const verified = await fb.verifyFullBackup(archive);
  const last = await fb.lastBackupInfo();
  window.__native.mode = 'cancel';
  const cancelled = await h.codeOf(fb.createFullBackup());
  const afterCancel = await fb.lastBackupInfo();
  window.__native.mode = 'fail';
  const failed = await h.codeOf(fb.createFullBackup());
  const afterFail = await fb.lastBackupInfo();
  return { summary, slices: window.__native.slices.length, largest: window.__native.largest, verified, last, cancelled, failed,
    unchangedAfterCancel: afterCancel.at === last.at, unchangedAfterFail: afterFail.at === last.at, aborted: window.__native.aborted };
`);
check('N1 the native path streams bounded slices (never the whole file encoded) and the result verifies',
  native.slices > 2 && native.largest <= 512 * 1024 && native.verified.media === 1 && native.verified.items === 1, JSON.stringify({ slices: native.slices, largest: native.largest }));
check('N2 a cancelled share sheet records no backup and deletes the temporary file', native.cancelled === 'backup/handoff-failed' && native.unchangedAfterCancel && native.aborted >= 1, JSON.stringify(native));
check('N3 a failed finish records no backup either', native.failed === 'backup/handoff-failed' && native.unchangedAfterFail, native.failed);

const safety = await run(N.page, `
  const before = JSON.stringify((await h.allIds('items')).sort());
  window.__native.mode = 'cancel';
  const cancelled = await h.codeOf(h.restoreFile(h.base64ToFile(arg)));
  const afterCancel = JSON.stringify((await h.allIds('items')).sort());
  window.__native.mode = 'ok';
  window.__native.failAppendAfter = window.__native.slices.length + 1;
  const failed = await h.codeOf(h.restoreFile(h.base64ToFile(arg)));
  window.__native.failAppendAfter = Infinity;
  return { cancelled, failed, unchanged: afterCancel === before && JSON.stringify((await h.allIds('items')).sort()) === before, job: await local.getMeta('restoreJob') };
`, made.base64);
check('N4 closing the share sheet for the safety backup stops the restore before any change', safety.cancelled === 'restore/aborted' && safety.unchanged && !safety.job, JSON.stringify(safety));
check('N5 a safety backup that fails to write stops the restore before any change', safety.failed === 'restore/aborted' && safety.unchanged && !safety.job, JSON.stringify(safety));
await N.context.close();

// ── V. a restored state that does not match is never completed ─────────────
const V = await device();
const verification = await run(V.page, `
  const engine = await import('/src/restore-engine.js');
  engine.__setRestoreFaultForTest(async (name) => { if (name === 'reconcile') await local.remove('items', 'it2'); });
  const code = await h.codeOf(h.restoreFile(h.base64ToFile(arg)));
  engine.__setRestoreFaultForTest(null);
  const job = await local.getMeta('restoreJob');
  const indexKept = await local.countFresh('restoreIndex');
  const resumed = await h.restoreFile(h.base64ToFile(arg));
  return { code, status: job.status, interruptedAt: job.interruptedAt, indexKept, resumed: resumed.resumed, final: (await local.getMeta('restoreJob')).status };
`, made.base64);
check('V1 a final verification failure leaves the job recovery-required, never completed', verification.code === 'restore/final-verification'
  && verification.status === 'recovery-required' && verification.interruptedAt === 'verifying' && verification.indexKept > 0, JSON.stringify(verification));
check('V2 running it again with the same file repairs and completes it', verification.resumed === true && verification.final === 'completed', JSON.stringify(verification));

// ── X. clean-up is idempotent ──────────────────────────────────────────────
const idempotent = await run(V.page, `
  const media = await import('/src/media.js');
  const first = await media.reconcileLocalMediaReferences({ reclaim: false });
  const second = await media.reconcileLocalMediaReferences({ reclaim: false });
  const dry = await media.reconcileLocalMediaReferences({ dryRun: true });
  await fb.cleanupAbandonedRestoreState();
  await fb.cleanupAbandonedRestoreState();
  return { second: second.correctedCount, dry: dry.correctedCount, work: await local.countFresh('workIndex'), index: await local.countFresh('restoreIndex') };
`);
check('X1 reconciliation and clean-up can run again and change nothing', idempotent.second === 0 && idempotent.dry === 0 && idempotent.work === 0 && idempotent.index === 0, JSON.stringify(idempotent));

// ── 1. a version 1 backup still restores ───────────────────────────────────
const v1 = await run(V.page, `
  const image = h.enc.encode('version one image bytes');
  const data = {
    format: 'nazm-data', schemaVersion: 1, taxonomy: { schemaVersion: 1 },
    items: [{ id: 'v1a', name: 'من الإصدار الأول', categoryId: 'art_paintings', images: [h.imageRef('v1img')], createdAt: 1, updatedAt: 2, version: 3 }],
    folders: [], locations: [], categories: [], fieldDefinitions: [{ id: 'custom_f_old', type: 'text', label: 'حقل قديم', retired: true }],
    mediaAssets: [{ id: 'v1img', mimeType: 'image/jpeg', fileSize: image.length, originalFilename: 'old.jpg' }],
  };
  const dataBytes = h.enc.encode(JSON.stringify(data));
  const manifest = {
    format: 'nazm-backup', backupFormatVersion: 1, minReaderVersion: 1, backupId: 'bkpv1', backupType: 'full',
    schemaVersion: 1, taxonomySchemaVersion: 1, counts: { items: 1, media: 1 },
    data: { path: 'data.json', size: dataBytes.length, sha256: await h.sha(dataBytes) },
    media: [{ id: 'v1img', path: 'media/v1img.jpg', mimeType: 'image/jpeg', size: image.length, sha256: await h.sha(image) }],
    missingMedia: [],
  };
  const file = await h.archiveOf([['data.json', dataBytes], ['media/v1img.jpg', image], ['manifest.json', JSON.stringify(manifest)]]);
  const result = await h.restoreFile(file);
  const item = await local.get('items', 'v1a');
  const img = await local.get('images', 'v1img');
  return { result, ids: await h.allIds('items'), version: item.version, bytes: new TextDecoder().decode(img.original), def: (await local.get('fieldDefinitions', 'custom_f_old'))?.retired };
`);
check('1V a version 1 .nazmbackup still opens, verifies and restores, image included', v1.result.restored === 1 && JSON.stringify(v1.ids) === '["v1a"]'
  && v1.version === 3 && v1.bytes === 'version one image bytes' && v1.def === true, JSON.stringify(v1));

// ── E. an empty inventory ──────────────────────────────────────────────────
const E = await device();
const empty = await run(E.page, `
  const { file, summary } = await h.backupToFile();
  const manifest = JSON.parse(new TextDecoder().decode((await h.entriesOf(file)).find(([n]) => n === 'manifest.json')[1]));
  const result = await h.restoreFile(file);
  return { summary, counts: manifest.counts, chunks: manifest.itemChunks.length, result, items: await local.countFresh('items'), job: (await local.getMeta('restoreJob')).status };
`);
check('E1 an empty inventory backs up to a valid archive with no chunks, and restores', empty.summary.items === 0 && empty.chunks === 0
  && empty.counts.items === 0 && empty.result.restored === 0 && empty.items === 0 && empty.job === 'completed', JSON.stringify(empty));
await E.context.close();

check('Z1 no unexpected JS errors', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`PASS ${pass.length}`);
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach((f) => console.log('  ✗', f)); process.exit(1); }
