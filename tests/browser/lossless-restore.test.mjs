// Browser test: Full Restore is lossless or refuses.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/lossless-restore.test.mjs
//
//   round trip     every authoritative field of every record survives
//   refusal        an invalid item, folder, location, field definition or
//                  category refuses the whole backup before anything changes —
//                  never a skipped record
//   missing media  the set of missing images is verified exactly, not by
//                  count or sample, at more than 1,000 ids
//   safety backup  the original safety backup survives a resume unchanged,
//                  and a resume does not require a new one

import { autoChooseLanguage } from './language-gate.mjs';
const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
autoChooseLanguage(browser);
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const allErrors = [];

async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
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

const H = "const h = await import('/tests/browser/backup-helpers.mjs'); const fb = await import('/src/full-backup.js'); const local = await import('/src/local-store.js'); const { repository } = await import('/src/repository.js');";
const run = (page, body, arg) => page.evaluate(new Function('arg', `return (async () => { ${H} ${body} })();`), arg);

const JPEG = [0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 2000 }, (_, i) => (i * 7) % 256), 0xff, 0xd9];

// ── the source inventory ──────────────────────────────────────────────────
const A = await device();
const source = await run(A.page, `
  await h.putImage('med_a', arg.jpeg);
  await h.putImage('med_b', arg.jpeg.map((b, i) => (b + i) % 256));
  const main = await repository.createTaxonomyNode({ level: 'main', name: 'معدات القياس' });
  const cat = await repository.createTaxonomyNode({ level: 'category', parentId: main, name: 'موازين' });
  await repository.saveTaxonomyNodeFields(cat, [{ id: 'custom_f_cap', type: 'number', label: 'السعة', unit: 'kg' }]);
  const folder = await repository.saveFolder({ name: 'المختبر', icon: '🧪', color: '#2563FF' });
  const location = await repository.saveLocation({ name: 'الرف الثالث' });
  const made = [];
  for (let i = 0; i < 40; i += 1) {
    const item = await repository.createItem({
      name: 'ميزان دقيق ' + i, sku: 'LS-' + String(i).padStart(4, '0'), barcode: String(6281000200000 + i),
      serialNumber: 'SER-' + i, modelNumber: 'M' + i, referenceNumber: 'R' + i, brand: 'Ohaus',
      mainCategoryId: main, categoryId: cat, folderId: i % 2 ? folder.id : null, locationId: i % 3 ? location.id : null,
      quantity: i + 1, unit: 'قطعة', condition: i % 2 ? 'ممتازة' : 'جيدة',
      valuation: { min: 100 * i, max: 150 * i + 1, currency: i % 5 ? 'SAR' : 'USD', source: 'manual' },
      description: 'وصف ' + i, customFields: { custom_f_cap: 10 + i },
      images: i < 2 ? [h.imageRef(i ? 'med_b' : 'med_a')] : [],
    });
    made.push(item.id);
  }
  const b = await h.backupToFile();
  const rows = [];
  for (const id of made) rows.push(await local.get('items', id));
  return { base64: await h.fileToBase64(b.file), rows };
`, { jpeg: JPEG });
await A.context.close();

// Only authoritative fields are compared: derived index fields are recomputed.
const AUTHORITATIVE = ['id', 'name', 'sku', 'barcode', 'serialNumber', 'modelNumber', 'referenceNumber', 'brand', 'mainCategoryId', 'categoryId',
  'subcategoryId', 'folderId', 'locationId', 'quantity', 'unit', 'condition', 'valuation', 'description', 'customFields', 'images', 'primaryImageId',
  'createdAt', 'updatedAt', 'deletedAt', 'version'];
const pick = (row) => Object.fromEntries(AUTHORITATIVE.map((k) => [k, row[k] ?? null]));

// ── round trip ─────────────────────────────────────────────────────────────
{
  const B = await device();
  const out = await run(B.page, `
    const result = await h.restoreFile(h.base64ToFile(arg.base64));
    const rows = [];
    for (const r of arg.rows) rows.push(await local.get('items', r.id));
    return { result, rows };
  `, source);
  const same = out.rows.every((row, i) => JSON.stringify(pick(row)) === JSON.stringify(pick(source.rows[i])));
  const firstDiff = out.rows.findIndex((row, i) => JSON.stringify(pick(row)) !== JSON.stringify(pick(source.rows[i])));
  check('L1 every authoritative field of every record survives a Full Backup and Restore', same && out.rows.length === 40,
    firstDiff < 0 ? '' : JSON.stringify([pick(out.rows[firstDiff]), pick(source.rows[firstDiff])]).slice(0, 600));
  check('L2 nothing is reported skipped', out.result.restored === 40, JSON.stringify(out.result).slice(0, 300));
  await B.context.close();
}

// ── refusal: an invalid record refuses the whole backup ────────────────────
{
  const B = await device();
  await run(B.page, `for (let i = 0; i < 5; i += 1) await repository.createItem({ id: 'keep' + i, name: 'باقٍ ' + i });`);
  const cases = await run(B.page, `
    const file = h.base64ToFile(arg.base64);
    const entries = new Map(await h.entriesOf(file));
    const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
    const chunkPath = manifest.itemChunks[0].path;
    const lines = new TextDecoder().decode(entries.get(chunkPath)).split('\\n').filter(Boolean).map((l) => JSON.parse(l));
    const metadataPath = [...entries.keys()].find((n) => /metadata\\.json$/.test(n));
    const metadata = JSON.parse(new TextDecoder().decode(entries.get(metadataPath)));

    const withItem = async (change) => {
      const edited = lines.map((l, i) => (i === 7 ? change({ ...l }) : l));
      const bytes = h.enc.encode(edited.map((l) => JSON.stringify(l)).join('\\n') + '\\n');
      return h.withManifest(file, () => {}, { replace: { [chunkPath]: bytes }, recount: true });
    };
    const withMetadata = async (change) => {
      const next = change(structuredClone(metadata));
      const bytes = h.enc.encode(JSON.stringify(next));
      const hash = await h.sha(bytes);
      return h.withManifest(file, (m) => { m.metadata.size = bytes.length; m.metadata.sha256 = hash; for (const k of ['categories', 'fieldDefinitions', 'folders', 'locations']) m.counts[k] = next[k].length; }, { replace: { [metadataPath]: bytes } });
    };
    const attempt = async (forged) => {
      try { await h.restoreFile(forged); return { code: 'ok' }; } catch (e) { return { code: e.code, reason: e.detail?.reason || null, collection: e.detail?.collection || null }; }
    };
    const out = {};
    out.folder = await attempt(await withItem((l) => ({ ...l, folderId: 'fld_nowhere' })));
    out.location = await attempt(await withItem((l) => ({ ...l, locationId: 'loc_nowhere' })));
    out.category = await attempt(await withItem((l) => ({ ...l, categoryId: 'cat_nowhere' })));
    out.image = await attempt(await withItem((l) => ({ ...l, images: [{ id: 'bad' }] })));
    out.condition = await attempt(await withItem((l) => ({ ...l, condition: 'broken-ish' })));
    out.nameless = await attempt(await withItem((l) => ({ ...l, name: '   ' })));
    out.valuation = await attempt(await withItem((l) => ({ ...l, valuation: { currency: 'SAR' } })));
    out.field = await attempt(await withItem((l) => ({ ...l, customFields: { custom_f_cap: { nested: true } } })));
    out.metaFolder = await attempt(await withMetadata((m) => { m.folders.push({ id: 'fld_x', name: '' }); return m; }));
    out.metaLocation = await attempt(await withMetadata((m) => { m.locations.push({ id: 'loc_x', name: '' }); return m; }));
    out.metaField = await attempt(await withMetadata((m) => { m.fieldDefinitions.push({ id: 'not a field id', type: 'text', label: 'x' }); return m; }));
    out.metaCategory = await attempt(await withMetadata((m) => { m.categories.push({ id: 'cat_x', name: '', level: 'category' }); return m; }));
    const ids = await h.allIds('items');
    return { out, ids, job: await local.getMeta('restoreJob'), index: await local.countFresh('restoreIndex') };
  `, source);
  const expectItem = { folder: 'folder', location: 'location', category: 'category', image: 'images', condition: 'condition', nameless: 'name', valuation: 'valuation', field: 'customFields' };
  for (const [key, reason] of Object.entries(expectItem)) {
    const r = cases.out[key];
    check(`R ${key}: an invalid item refuses the backup, naming why`, r.code === 'backup/invalid-record' && r.reason === reason, JSON.stringify(r));
  }
  for (const key of ['metaFolder', 'metaLocation', 'metaField', 'metaCategory']) {
    const r = cases.out[key];
    check(`R ${key}: invalid metadata refuses the backup`, r.code === 'backup/invalid-record', JSON.stringify(r));
  }
  check('R the inventory is untouched and no restore was started', cases.ids.length === 5 && cases.ids.every((id) => id.startsWith('keep')) && !cases.job && cases.index === 0,
    JSON.stringify({ ids: cases.ids.length, job: cases.job?.status, index: cases.index }));
  await B.context.close();
}

// ── missing media, exactly, past 1,000 ids ─────────────────────────────────
{
  const M = await device();
  const made = await run(M.page, `
    await h.putImage('zz_carried', arg.jpeg);
    const rows = [];
    for (let i = 0; i < 1200; i += 1) {
      rows.push({ id: 'mm' + String(i).padStart(5, '0'), name: 'قطعة ' + i, quantity: 1, unit: 'قطعة', categoryId: 'uncategorized',
        images: [h.imageRef('miss' + String(i).padStart(5, '0'))], createdAt: Date.now() - i, updatedAt: Date.now() - i, version: 1, deletedAt: null });
    }
    rows.push({ id: 'mm_carrier', name: 'حاملة الصورة', quantity: 1, unit: 'قطعة', categoryId: 'uncategorized', images: [h.imageRef('zz_carried')], createdAt: Date.now(), updatedAt: Date.now(), version: 1, deletedAt: null });
    await local.putMany('items', rows);
    const b = await h.backupToFile();
    return { base64: await h.fileToBase64(b.file), missing: b.summary.missingCount };
  `, { jpeg: JPEG });
  check('M0 a backup of 1,201 records declares 1,200 missing images', made.missing === 1200, String(made.missing));

  const honest = await run(M.page, `
    const r = await h.restoreFile(h.base64ToFile(arg.base64));
    return { restored: r.restored, missing: r.missingMedia, declared: r.declaredMissing };
  `, made);
  check('M1 restoring it verifies all 1,200 missing ids as declared', honest.restored === 1201 && honest.missing === 1200 && honest.declared === 1200, JSON.stringify(honest));

  // Same count, different set: one declared-missing image is present here,
  // and one record picks up a reference to an image nobody declared, just
  // before the final check. The missing count still equals the declared
  // count and the first ids in order are all declared — a count or a sample
  // would pass; only the exact set fails it.
  const exact = await run(M.page, `
    await h.putImage('miss00000', arg.jpeg);
    const engine = await import('/src/restore-engine.js');
    engine.__setRestoreFaultForTest(async (name) => {
      if (name === 'reconcile') {
        const row = await local.get('items', 'mm00005');
        await local.put('items', { ...row, images: [...row.images, h.imageRef('zz_undeclared')] });
      }
    });
    try {
      await h.restoreFile(h.base64ToFile(arg.base64));
      return { code: 'ok' };
    } catch (e) {
      return { code: e.code, detail: e.detail };
    } finally {
      engine.__setRestoreFaultForTest(null);
    }
  `, { ...made, jpeg: JPEG });
  check('M2 one undeclared missing image among 1,200 fails the final verification', exact.code === 'restore/final-verification' && /undeclared missing media 1 \(zz_undeclared\)/.test(exact.detail || ''), JSON.stringify(exact));
  await M.context.close();
}

// ── the original safety backup survives a resume ──────────────────────────
{
  const S = await device();
  const out = await run(S.page, `
    for (let i = 0; i < 3; i += 1) await repository.createItem({ id: 'old' + i, name: 'قديم ' + i });
    const engine = await import('/src/restore-engine.js');
    const phases = [];
    engine.__setRestoreFaultForTest(async (name) => { if (name === 'metadata') throw new Error('interrupted'); });
    let first;
    try { await h.restoreFile(h.base64ToFile(arg.base64), { onProgress: (p) => phases.push(p.phase) }); } catch (e) { first = e.message; }
    engine.__setRestoreFaultForTest(null);
    const interrupted = await local.getMeta('restoreJob');
    const firstSafetyPhases = phases.filter((p) => p === 'safety').length;

    phases.length = 0;
    const resumed = await h.restoreFile(h.base64ToFile(arg.base64), { onProgress: (p) => phases.push(p.phase) });
    const done = await local.getMeta('restoreJob');
    return {
      first, firstSafetyPhases, resumeSafetyPhases: phases.filter((p) => p === 'safety').length,
      before: interrupted.originalSafetyBackup, after: done.originalSafetyBackup, alias: done.safetyBackup,
      checkpoint: done.recoveryCheckpointBackup || null, resumed: resumed.resumed, status: done.status,
      resultOriginal: resumed.originalSafetyBackup,
    };
  `, source);
  check('P1 the first run takes the original safety backup before any write', out.firstSafetyPhases > 0 && out.before?.filename && out.before.items === 3, JSON.stringify(out.before));
  check('P2 the resume completes without taking another safety backup', out.resumed === true && out.status === 'completed' && out.resumeSafetyPhases === 0, JSON.stringify(out));
  check('P3 and the original safety backup is exactly the one first recorded', JSON.stringify(out.after) === JSON.stringify(out.before) && JSON.stringify(out.alias) === JSON.stringify(out.before)
    && JSON.stringify(out.resultOriginal) === JSON.stringify(out.before) && out.checkpoint === null, JSON.stringify([out.before, out.after]));

  const withCheckpoint = await run(S.page, `
    for (let i = 0; i < 3; i += 1) await repository.createItem({ id: 'again' + i, name: 'مرة أخرى ' + i });
    const engine = await import('/src/restore-engine.js');
    engine.__setRestoreFaultForTest(async (name) => { if (name === 'metadata') throw new Error('interrupted'); });
    try { await h.restoreFile(h.base64ToFile(arg.base64)); } catch {}
    engine.__setRestoreFaultForTest(null);
    const before = (await local.getMeta('restoreJob')).originalSafetyBackup;
    const r = await h.restoreFile(h.base64ToFile(arg.base64), { recoveryCheckpoint: true });
    const job = await local.getMeta('restoreJob');
    return { before, after: job.originalSafetyBackup, checkpoint: job.recoveryCheckpointBackup, completed: job.status, r: r.recoveryCheckpointBackup };
  `, source);
  check('P4 a resume may add a recovery checkpoint, recorded separately, the original unchanged',
    withCheckpoint.completed === 'completed' && withCheckpoint.checkpoint?.purpose === 'recovery-checkpoint' && withCheckpoint.checkpoint.filename
    && JSON.stringify(withCheckpoint.after) === JSON.stringify(withCheckpoint.before), JSON.stringify(withCheckpoint));
  await S.context.close();
}

check('Z no JS errors', allErrors.length === 0, allErrors.slice(0, 3).join(' / '));
await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
