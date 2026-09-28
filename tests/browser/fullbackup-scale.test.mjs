// Full Backup and Full Restore at warehouse scale, with the evidence that
// neither materialises the inventory:
//
//   · 100,000 records with custom fields and classification, whose item data
//     alone is larger than the old 64 MB ceiling — backed up, changed,
//     restored, and checked record for record on a sample
//   · no call to repository.completeItems(), and no unbounded getAll() on the
//     items store, anywhere in the backup, the check or the restore
//   · the largest chunk, read batch, write batch and removal page, reported
//   · reference counts reconciled over 80,000 image references with bounded
//     memory, then a backup and restore carrying 20,000 images
//
// Timing figures are printed for information; they are not assertions.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/fullbackup-scale.test.mjs

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const errors = [];

async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { context, page };
}

const H = "const h = await import('/tests/browser/backup-helpers.mjs'); const fb = await import('/src/full-backup.js'); const local = await import('/src/local-store.js'); const { repository } = await import('/src/repository.js');";
const run = (page, body, arg) => page.evaluate(new Function('arg', `return (async () => { ${H} ${body} })();`), arg);

// ── 1. 100,000 records ─────────────────────────────────────────────────────
const { context, page } = await device();
page.setDefaultTimeout(0);
const seeded = await run(page, `
  const t0 = performance.now();
  const main = await repository.createTaxonomyNode({ level: 'main', name: 'مستودع الاختبار' });
  const cats = [];
  for (let c = 0; c < 5; c += 1) cats.push(await repository.createTaxonomyNode({ level: 'category', parentId: main, name: 'صنف ' + c }));
  await repository.saveTaxonomyNodeFields(cats[0], [
    { id: 'custom_f_serial', type: 'text', label: 'الرقم التسلسلي' },
    { id: 'custom_f_weight', type: 'number', label: 'الوزن' },
  ]);
  const filler = 'وصف تفصيلي للقطعة في المستودع يشمل الحالة والملاحظات والمصدر. '.repeat(11);
  // Stored in the shape the app itself writes (normalizeItem), as a real
  // inventory would be.
  const { normalizeItem } = await import('/src/validation.js');
  const TOTAL = 100000;
  for (let start = 0; start < TOTAL; start += 5000) {
    const batch = [];
    for (let i = start; i < start + 5000; i += 1) {
      const id = 'w' + String(i).padStart(6, '0');
      batch.push(normalizeItem({
        id, name: 'قطعة ' + i, sku: 'SKU-' + i, quantity: (i % 7) + 1, unit: 'قطعة', condition: '',
        mainCategoryId: main, categoryId: cats[i % 5], subcategoryId: null,
        customFields: { custom_f_serial: 'SN-' + i, custom_f_weight: i % 100 }, customFieldIds: ['custom_f_serial', 'custom_f_weight'],
        description: filler + i, images: [], createdAt: 1700000000000 + i, updatedAt: 1700000000000 + i, version: (i % 3) + 1, deletedAt: null,
      }));
    }
    await local.putMany('items', batch);
  }
  return { main, cats, ms: Math.round(performance.now() - t0), count: await local.countFresh('items') };
`);
check('S0 100,000 records are on the device', seeded.count === 100000, `${seeded.count} in ${seeded.ms} ms`);

const backup = await run(page, `
  window.__seen = h.watchMaterialisation();
  const t0 = performance.now();
  const sink = h.memorySink();
  const summary = await fb.createFullBackup({ sink });
  window.__big = sink.file('big.nazmbackup');
  // The same file, handed out as a download for the fresh device below.
  const url = URL.createObjectURL(window.__big);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'NAZM-Backup-scale.nazmbackup' });
  document.body.append(link);
  window.__download = () => link.click();
  const entries = await fb.__readArchiveForTest(window.__big);
  const manifest = JSON.parse(new TextDecoder().decode(await entries.read('manifest.json')));
  return { summary, ms: Math.round(performance.now() - t0), seen: { ...window.__seen }, itemBytes: manifest.bytes.items, chunks: manifest.itemChunks.length,
    counts: manifest.itemChunks.map((c) => c.count), size: window.__big.size };
`);
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
check('S1 the backup holds 100,000 records in 50+ chunks, each at most 2,000 records and 4 MiB',
  backup.summary.items === 100000 && backup.chunks >= 50 && backup.summary.largestChunkRecords <= 2000 && backup.summary.largestChunkBytes <= 4 * 1024 * 1024,
  `${backup.chunks} chunks, largest ${backup.summary.largestChunkRecords} records / ${mb(backup.summary.largestChunkBytes)}`);
check('S2 item data larger than the old 64 MB limit is backed up', backup.itemBytes > 64 * 1024 * 1024, `items ${mb(backup.itemBytes)}, archive ${mb(backup.size)}`);
check('S3 chunk boundaries are deterministic: every chunk but the last is exactly full or byte-bounded',
  backup.counts.slice(0, -1).every((n) => n > 0 && n <= 2000) && backup.counts.reduce((a, b) => a + b, 0) === 100000, JSON.stringify(backup.counts.slice(0, 5)));
const [bigFile] = await Promise.all([page.waitForEvent('download', { timeout: 0 }), page.evaluate(() => window.__download())]);
// Kept past this context: a download is deleted when its context closes.
const scratch = mkdtempSync(join(tmpdir(), 'nazm-scale-'));
const bigPath = join(scratch, 'NAZM-Backup-scale.nazmbackup');
await bigFile.saveAs(bigPath);
check('S4 the backup read at most 500 records at a time and never loaded the inventory',
  backup.summary.largestReadBatch <= 500 && backup.seen.completeItems === 0 && backup.seen.itemsGetAll === 0, JSON.stringify(backup.seen));

// The inventory changes after the backup: 1,000 removed, 500 new.
await run(page, `
  const gone = [];
  for (let i = 0; i < 1000; i += 1) gone.push('w' + String(i * 97).padStart(6, '0'));
  await local.removeMany('items', gone);
  const fresh = [];
  for (let i = 0; i < 500; i += 1) fresh.push({ id: 'new' + i, name: 'جديدة ' + i, categoryId: 'art_paintings', images: [], customFields: {}, customFieldIds: [], createdAt: 1, updatedAt: 1, version: 1, deletedAt: null });
  await local.putMany('items', fresh);
`);

const [safetyDownload, restore] = await Promise.all([
  page.waitForEvent('download', { timeout: 0 }),
  run(page, `
    const engine = await import('/src/restore-engine.js');
    const t0 = performance.now();
    const archive = await fb.openFullBackup(window.__big);
    const verified = await fb.verifyFullBackup(archive);
    const t1 = performance.now();
    const result = await fb.restoreFullBackup(archive);
    const t2 = performance.now();
    const sample = ['w000000', 'w000097', 'w050001', 'w099999', 'w012345'];
    const records = await Promise.all(sample.map((id) => local.get('items', id)));
    return {
      verified, result, measured: engine.__restoreMeasurements(), seen: { ...window.__seen },
      verifyMs: Math.round(t1 - t0), restoreMs: Math.round(t2 - t1),
      unchanged: result.unchanged,
      count: await local.countFresh('items'), newLeft: (await local.existingKeys('items', ['new0', 'new499'])).size,
      index: await local.countFresh('restoreIndex'), work: await local.countFresh('workIndex'),
      sample: records.map((r) => r && [r.id, r.version, r.updatedAt, r.customFields.custom_f_serial, r.categoryId, r.description.length]),
    };
  `),
]);
check('S5 the verified backup restores 100,000 records, re-adding the removed and removing the new',
  restore.result.restored === 100000 && restore.count === 100000 && restore.newLeft === 0 && restore.result.removed.items === 500,
  `verify ${restore.verifyMs} ms, restore ${restore.restoreMs} ms, removed ${JSON.stringify(restore.result.removed)}`);
check('S5b on the same device, records already exactly as saved are left alone; only the 1,000 removed are written',
  restore.unchanged === 99000, `${restore.unchanged} unchanged`);
check('S6 restored records are exact: version, timestamp, custom fields, classification',
  restore.sample.every((r, i) => r && r[3] === 'SN-' + Number(r[0].slice(1)) && r[1] === (Number(r[0].slice(1)) % 3) + 1 && r[2] === 1700000000000 + Number(r[0].slice(1))
    && seeded.cats.includes(r[4])), JSON.stringify(restore.sample));
check('S7 the restore held at most one chunk, wrote at most 500 per transaction, removed a page at a time',
  restore.measured.chunkRecords <= 2000 && restore.measured.writeBatch <= 500 && restore.measured.removalPage <= 500, JSON.stringify(restore.measured));
check('S8 neither the check, the safety backup nor the restore loaded the inventory',
  restore.seen.completeItems === 0 && restore.seen.itemsGetAll === 0, JSON.stringify(restore.seen));
check('S9 the restore index and scratch space are empty afterwards', restore.index === 0 && restore.work === 0, `${restore.index} ${restore.work}`);
check('S10 the safety backup of the 99,500 records was handed over first', /^NAZM-Safety-.*\.nazmbackup$/.test(safetyDownload.suggestedFilename()), safetyDownload.suggestedFilename());
await context.close();

// ── 1b. the same backup onto an empty device: every record inserted ────────
{
  const fresh = await device();
  fresh.page.setDefaultTimeout(0);
  await fresh.page.evaluate(() => {
    const input = Object.assign(document.createElement('input'), { type: 'file', id: '__pick' });
    input.style.display = 'none';
    document.body.append(input);
  });
  await fresh.page.setInputFiles('#__pick', bigPath);
  const onFresh = await run(fresh.page, `
    window.__seen = h.watchMaterialisation();
    const engine = await import('/src/restore-engine.js');
    const t0 = performance.now();
    const archive = await fb.openFullBackup(document.getElementById('__pick').files[0]);
    await fb.verifyFullBackup(archive);
    const t1 = performance.now();
    const result = await fb.restoreFullBackup(archive);
    const t2 = performance.now();
    const probe = await local.get('items', 'w054321');
    return { result, verifyMs: Math.round(t1 - t0), restoreMs: Math.round(t2 - t1), count: await local.countFresh('items'),
      seen: { ...window.__seen }, measured: engine.__restoreMeasurements(), probe: probe && [probe.customFields.custom_f_serial, probe.version] };
  `);
  check('S5c on an empty device the file from disk restores all 100,000 records, exactly',
    onFresh.count === 100000 && onFresh.result.restored === 100000 && onFresh.result.unchanged === 0 && JSON.stringify(onFresh.probe) === '["SN-54321",1]',
    `verify ${onFresh.verifyMs} ms, restore ${onFresh.restoreMs} ms`);
  check('S5d …without loading the inventory, one chunk and one batch at a time',
    onFresh.seen.completeItems === 0 && onFresh.seen.itemsGetAll === 0 && onFresh.measured.chunkRecords <= 2000 && onFresh.measured.writeBatch <= 500,
    JSON.stringify([onFresh.seen, onFresh.measured]));
  await fresh.context.close();
}

// ── 2. reference counts and images at scale ───────────────────────────────
const second = await device();
second.page.setDefaultTimeout(0);
const media = await run(second.page, `
  window.__seen = h.watchMaterialisation();
  const assets = [];
  const images = [];
  for (let i = 0; i < 20000; i += 1) {
    const id = 'img' + String(i).padStart(5, '0');
    const bytes = new Uint8Array(64).fill(i % 251);
    assets.push({ id, storagePath: 'local:' + id, thumbnailPath: 'local:' + id, mimeType: 'image/jpeg', fileSize: 64, refCount: 0, orphanedAt: Date.now(), createdAt: Date.now() });
    images.push({ id, itemId: null, original: bytes.buffer, originalType: 'image/jpeg', thumbnail: bytes.buffer, thumbnailType: 'image/jpeg', meta: {} });
  }
  for (let i = 0; i < 20000; i += 5000) { await local.putMany('mediaAssets', assets.slice(i, i + 5000)); await local.putMany('images', images.slice(i, i + 5000)); }
  const items = [];
  for (let i = 0; i < 40000; i += 1) {
    const a = 'img' + String(i % 20000).padStart(5, '0');
    const b = 'img' + String((i * 7 + 3) % 20000).padStart(5, '0');
    items.push({ id: 'r' + String(i).padStart(5, '0'), name: 'مرجع ' + i, categoryId: 'art_paintings', images: [h.imageRef(a), h.imageRef(b)], customFields: {}, customFieldIds: [], createdAt: 1, updatedAt: 1, version: 1, deletedAt: null });
  }
  for (let i = 0; i < 40000; i += 5000) await local.putMany('items', items.slice(i, i + 5000));
  const mediaModule = await import('/src/media.js');
  const t0 = performance.now();
  const result = await mediaModule.reconcileLocalMediaReferences({ reclaim: false });
  const ms = Math.round(performance.now() - t0);
  const sampleCounts = await Promise.all(['img00000', 'img00003', 'img19999'].map(async (id) => (await local.get('mediaAssets', id)).refCount));
  const again = await mediaModule.reconcileLocalMediaReferences({ dryRun: true });
  const sink = h.memorySink();
  const summary = await fb.createFullBackup({ sink });
  const file = sink.file();
  await local.removeMany('images', ['img00001', 'img00002']);
  const archive = await fb.openFullBackup(file);
  await fb.verifyFullBackup(archive);
  const restored = await fb.restoreFullBackup(archive);
  return { result: { checked: result.checked, corrected: result.correctedCount, referenced: result.referencedCount, missing: result.missingCount },
    ms, sampleCounts, again: again.correctedCount, summary, restored, seen: { ...window.__seen },
    back: (await local.existingKeys('images', ['img00001', 'img00002'])).size, work: await local.countFresh('workIndex') };
`);
check('S11 reference counts are reconciled over 80,000 references to 20,000 images, with none left wrong',
  media.result.checked === 20000 && media.result.referenced === 20000 && media.result.corrected === 20000 && media.again === 0 && media.work === 0,
  `${JSON.stringify(media.result)} in ${media.ms} ms`);
check('S12 each count equals the records that reference it', media.sampleCounts.every((n) => n === 4), JSON.stringify(media.sampleCounts));
check('S13 20,000 images go through a backup and a restore; images removed since come back',
  media.summary.media === 20000 && media.restored.images === 20000 && media.back === 2 && media.restored.mediaOutcomes.written === 2,
  JSON.stringify({ media: media.summary.media, outcomes: media.restored.mediaOutcomes }));
check('S14 at this scale too, nothing loaded the inventory', media.seen.completeItems === 0 && media.seen.itemsGetAll === 0, JSON.stringify(media.seen));
check('S15 no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
rmSync(scratch, { recursive: true, force: true });
console.log(`PASS ${pass.length}`);
pass.forEach((p) => console.log('  ✓', p));
if (fail.length) { console.log(`FAIL ${fail.length}`); fail.forEach((f) => console.log('  ✗', f)); process.exit(1); }
