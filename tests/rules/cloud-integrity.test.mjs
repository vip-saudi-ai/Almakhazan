/**
 * The cloud paths of the data-integrity pass, run against the Firestore
 * emulator with the real rules and the app's own code — `FirestoreBackend`
 * and the repository's SKU reservation — rather than an in-memory stand-in.
 *
 *   npm run test:rules
 *
 * Two "devices" are two authenticated Firestore clients of the same member,
 * so their transactions contend on the emulator exactly as two phones would.
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as firestore from 'firebase/firestore';
import { readFileSync } from 'node:fs';

import { firebaseContext } from '../../src/firebase.js';
import { FirestoreBackend, repository } from '../../src/repository.js';
import { normalizeItem } from '../../src/validation.js';

const { doc, getDoc, setDoc, setLogLevel } = firestore;
const PROJECT_ID = 'demo-almakhzan';
const OWNER = 'owner-sku';
const YEAR = new Date().getFullYear();

let env;
const results = { passed: 0, failed: [] };

async function check(name, fn) {
  try {
    await fn();
    results.passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed.push(name);
    console.log(`  ✗ ${name}\n      ${String(error?.message || error).split('\n')[0]}`);
  }
}
const assert = (ok, message) => { if (!ok) throw new Error(message); };

function device() {
  return env.authenticatedContext(OWNER, { email_verified: true, email: `${OWNER}@example.com` }).firestore();
}

async function seed(workspaceId, extra = async () => {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'workspaces', workspaceId), {
      name: workspaceId, ownerId: OWNER, plan: 'business', schemaVersion: 2,
      limits: { items: -1, storageBytes: -1, members: 5 },
    });
    await setDoc(doc(d, 'workspaces', workspaceId, 'members', OWNER), { role: 'owner', email: `${OWNER}@example.com` });
    await setDoc(doc(d, 'workspaces', workspaceId, 'usage', 'current'), { items: 0, storageBytes: 0 });
    await extra(d);
  });
}

const item = (id, sku, extra = {}) => normalizeItem({ id, name: `قطعة ${id}`, sku, quantity: 1, ...extra }, { userId: OWNER });

// The repository's methods, run as a given device. The reservation reads
// `firebaseContext()` synchronously when it starts, so pointing the context at
// a device just before each call is enough for the calls to run concurrently.
const Repo = Object.getPrototypeOf(repository);
function as(db, workspaceId) {
  const ctx = firebaseContext();
  ctx.db = db;
  ctx.sdk = { firestore };
  const backend = new FirestoreBackend(workspaceId);
  return {
    session: { mode: 'cloud', workspaceId, userId: OWNER, role: 'owner' },
    backend,
    _legacySkuEvidence: Repo._legacySkuEvidence,
    reserve(year, floor) { ctx.db = db; return Repo._reserveCloudSkuSequence.call(this, year, floor); },
    findSkuConflicts(entries) { return Repo.findSkuConflicts.call(this, entries); },
  };
}

async function main() {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  await env.clearFirestore();

  console.log('\nSKU reservation under contention');
  await seed('ws-contend');
  {
    const a = as(device(), 'ws-contend');
    const b = as(device(), 'ws-contend');
    const calls = [];
    for (let i = 0; i < 10; i += 1) calls.push(a.reserve(YEAR, 0), b.reserve(YEAR, 0));
    const values = await Promise.all(calls);
    await check('20 reservations from two devices at once get 20 different numbers', () => {
      assert(new Set(values).size === 20, JSON.stringify(values.sort((x, y) => x - y)));
    });
    await check('exactly 1…20, with the counter at the last one handed out', async () => {
      const sorted = [...values].sort((x, y) => x - y);
      assert(sorted.every((v, i) => v === i + 1), JSON.stringify(sorted));
      const counter = (await getDoc(doc(device(), 'workspaces', 'ws-contend', 'counters', `sku-${YEAR}`))).data();
      assert(counter.value === 20, JSON.stringify(counter));
    });
  }

  console.log('\nThe year-less legacy counter, once');
  await seed('ws-legacy-new-year', async (d) => {
    await setDoc(doc(d, 'workspaces', 'ws-legacy-new-year', 'counters', 'sku'), { value: 850 });
    for (let n = 1; n <= 10; n += 1) {
      const row = item(`g${n}`, `INV-${YEAR}-${String(n).padStart(6, '0')}`);
      await setDoc(doc(d, 'workspaces', 'ws-legacy-new-year', 'items', row.id), row);
    }
  });
  {
    const a = as(device(), 'ws-legacy-new-year');
    const floor = await a.backend.maxGeneratedSkuSequence(YEAR);
    const first = await a.reserve(YEAR, floor);
    await check('legacy 850 without evidence, this year at 10 → 11 (floor read from the index)', () => {
      assert(floor === 10 && first === 11, JSON.stringify({ floor, first }));
    });
    await check('the marker is written, recording that it was not applied', async () => {
      const marker = (await getDoc(doc(device(), 'workspaces', 'ws-legacy-new-year', 'counters', 'sku-legacy-migration'))).data();
      assert(marker?.value === 850 && marker.applied === false && marker.year === YEAR, JSON.stringify(marker));
    });
  }

  await seed('ws-legacy-race', async (d) => {
    await setDoc(doc(d, 'workspaces', 'ws-legacy-race', 'counters', 'sku'), { value: 850 });
    const row = item('g850', `INV-${YEAR}-000850`);
    await setDoc(doc(d, 'workspaces', 'ws-legacy-race', 'items', row.id), row);
  });
  {
    const a = as(device(), 'ws-legacy-race');
    const b = as(device(), 'ws-legacy-race');
    // Both devices make their first reservation at the same moment, with a
    // floor of 0 so only the old counter could lift them past 850.
    const [x, y] = await Promise.all([a.reserve(YEAR, 0), b.reserve(YEAR, 0)]);
    await check('two devices racing the first reservation of an old workspace: 851 and 852, no duplicate', () => {
      assert([x, y].sort().join() === '851,852', JSON.stringify([x, y]));
    });
    await check('one marker, applied once', async () => {
      const marker = (await getDoc(doc(device(), 'workspaces', 'ws-legacy-race', 'counters', 'sku-legacy-migration'))).data();
      assert(marker?.applied === true && marker.value === 850, JSON.stringify(marker));
    });
    const nextYear = await a.reserve(YEAR + 1, 0);
    await check('a later year then starts at 1', () => assert(nextYear === 1, String(nextYear)));
  }

  console.log('\nifAbsent at the commit, and SKU lookups by index');
  await seed('ws-absent', async (d) => {
    const row = item('X', 'CLOUD-X', { name: 'Cloud Version' });
    await setDoc(doc(d, 'workspaces', 'ws-absent', 'items', 'X'), row);
  });
  {
    const a = as(device(), 'ws-absent');
    const b = as(device(), 'ws-absent');
    const skipped = await a.backend.runBatch([{ type: 'set', collection: 'items', id: 'X', data: item('X', 'LOCAL-X', { name: 'Local Version' }), merge: false, ifAbsent: true }]);
    await check('an existing cloud record is skipped, not replaced', async () => {
      const row = (await getDoc(doc(device(), 'workspaces', 'ws-absent', 'items', 'X'))).data();
      assert(skipped.skippedExisting.includes('X') && row.name === 'Cloud Version', JSON.stringify({ skipped, name: row.name }));
    });
    const [ra, rb] = await Promise.all([
      a.backend.runBatch([{ type: 'set', collection: 'items', id: 'Y', data: item('Y', 'Y-A', { name: 'من أ' }), merge: false, ifAbsent: true }]),
      b.backend.runBatch([{ type: 'set', collection: 'items', id: 'Y', data: item('Y', 'Y-B', { name: 'من ب' }), merge: false, ifAbsent: true }]),
    ]);
    await check('two devices creating the same id at once: exactly one lands, the other is told it was skipped', async () => {
      const row = (await getDoc(doc(device(), 'workspaces', 'ws-absent', 'items', 'Y'))).data();
      const winner = ra.applied === 1 ? 'من أ' : 'من ب';
      assert(ra.applied + rb.applied === 1 && ra.skippedExisting.length + rb.skippedExisting.length === 1 && row.name === winner,
        JSON.stringify({ ra, rb, name: row.name }));
    });

    // 70 SKUs: three `in` groups. One live, one trashed, the rest absent.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      await setDoc(doc(d, 'workspaces', 'ws-absent', 'items', 'L'), item('L', 'SKU-40', { name: 'حية' }));
      await setDoc(doc(d, 'workspaces', 'ws-absent', 'items', 'T'), item('T', 'SKU-65', { name: 'محذوفة', deletedAt: Date.now() }));
    });
    const entries = Array.from({ length: 70 }, (_, i) => ({ key: i, id: null, sku: `SKU-${i}` }));
    entries.push({ key: 'self', id: 'L', sku: 'SKU-40' });
    const conflicts = await a.findSkuConflicts(entries);
    await check('batched lookup over 3 Firestore `in` groups finds the live SKU, ignores the trashed one and the record itself', () => {
      const existing = conflicts.filter((c) => c.type === 'existing');
      const dup = conflicts.filter((c) => c.type === 'incoming-duplicate');
      assert(existing.length === 1 && existing[0].key === 40 && existing[0].existingId === 'L'
        && dup.length === 2 && dup.every((c) => c.sku === 'SKU-40'), JSON.stringify(conflicts));
    });
  }

  await env.cleanup();
  console.log(`\n${results.passed} passed, ${results.failed.length} failed`);
  if (results.failed.length) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await env?.cleanup().catch(() => {});
  process.exit(1);
});
