/**
 * Section 71 of the SaaS brief, run against the Firestore emulator.
 *
 * Item A has an image. It is duplicated to Item B. Removing the image from B,
 * and then purging B entirely, must leave A's file intact. The physical file is
 * only ever reclaimed once nothing references it.
 *
 * The reference-count arithmetic is the real subject here, so Storage is a
 * recording stub: the assertion is about *when* a delete would be issued.
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, runTransaction, setLogLevel } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import { referenceDelta, mediaIdsOf, mediaReference } from '../../src/media.js';

const PROJECT_ID = 'demo-almakhzan-media';
const OWNER = 'owner-1';
const WS = OWNER;

const results = { passed: 0, failed: [] };
async function check(name, fn) {
  try {
    await fn();
    results.passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed.push(name);
    console.log(`  ✗ ${name}\n      ${error.message.split('\n')[0]}`);
  }
}

/** Mirrors CloudMediaStore.adjust, against whichever Firestore instance is given. */
async function adjust(db, mediaId, delta) {
  const ref = doc(db, 'workspaces', WS, 'media', mediaId);
  const step = delta > 0 ? 1 : -1;
  let value = null;
  for (let i = 0; i < Math.abs(delta); i++) {
    value = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return null;
      const next = Math.max(0, (snap.data().refCount ?? 0) + step);
      tx.update(ref, { refCount: next, orphanedAt: next === 0 ? Date.now() : null });
      return next;
    });
  }
  return value;
}

async function refCount(db, mediaId) {
  const snap = await getDoc(doc(db, 'workspaces', WS, 'media', mediaId));
  return snap.exists() ? snap.data().refCount : null;
}

/** Stands in for the backend sweeper: deletes only what is truly unreferenced. */
function sweeper() {
  const deleted = [];
  return {
    deleted,
    async sweep(db, mediaIds) {
      for (const id of mediaIds) {
        const count = await refCount(db, id);
        if (count === 0) deleted.push(id);
      }
    },
  };
}

async function main() {
  setLogLevel('silent');
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  await env.clearFirestore();

  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'workspaces', WS), { name: 'ws', ownerId: OWNER, plan: 'free' });
    await setDoc(doc(d, 'workspaces', WS, 'members', OWNER), { role: 'owner' });
  });

  const db = env.authenticatedContext(OWNER, { email_verified: true }).firestore();
  const storage = sweeper();

  console.log('\nPure reference arithmetic');
  await check('adding an image is +1', () => {
    const delta = referenceDelta(null, { images: [{ mediaId: 'm1' }] });
    assert.deepEqual([...delta], [['m1', 1]]);
  });
  await check('removing an image is -1', () => {
    const delta = referenceDelta({ images: [{ mediaId: 'm1' }] }, { images: [] });
    assert.deepEqual([...delta], [['m1', -1]]);
  });
  await check('an unchanged image produces no write', () => {
    const delta = referenceDelta({ images: [{ mediaId: 'm1' }] }, { images: [{ mediaId: 'm1' }] });
    assert.equal(delta.size, 0);
  });
  await check('swapping images moves both counts', () => {
    const delta = referenceDelta({ images: [{ mediaId: 'm1' }] }, { images: [{ mediaId: 'm2' }] });
    assert.deepEqual(new Map([...delta].sort()), new Map([['m1', -1], ['m2', 1]]));
  });
  await check('legacy images without mediaId fall back to their own id', () => {
    assert.deepEqual(mediaIdsOf({ images: [{ id: 'legacy-1' }] }), ['legacy-1']);
  });
  await check('a media reference carries the pointer plus display cache', () => {
    const ref = mediaReference({ id: 'm9', storagePath: 'p', url: 'https://x/u', width: 10 });
    assert.equal(ref.mediaId, 'm9');
    assert.equal(ref.storagePath, 'p');
    assert.equal(ref.width, 10);
  });

  console.log('\nThe duplicate-and-delete scenario');
  const MEDIA = 'media-shared';

  await check('upload creates the asset with one reference', async () => {
    await setDoc(doc(db, 'workspaces', WS, 'media', MEDIA), {
      storagePath: `workspaces/${WS}/items/a/original/x.jpg`, refCount: 1,
    });
    assert.equal(await refCount(db, MEDIA), 1);
  });

  const itemA = { id: 'item-a', images: [{ mediaId: MEDIA }] };
  const itemB = { id: 'item-b', images: [{ mediaId: MEDIA }] };

  await check('duplicating item A to B raises the count to 2', async () => {
    for (const [id, delta] of referenceDelta(null, itemB)) await adjust(db, id, delta);
    assert.equal(await refCount(db, MEDIA), 2);
  });

  await check('removing the image from B drops to 1, not 0', async () => {
    for (const [id, delta] of referenceDelta(itemB, { ...itemB, images: [] })) await adjust(db, id, delta);
    assert.equal(await refCount(db, MEDIA), 1);
  });

  await check("the sweeper leaves A's file alone", async () => {
    await storage.sweep(db, [MEDIA]);
    assert.deepEqual(storage.deleted, [], 'a referenced file must never be deleted');
  });

  await check('purging B entirely still leaves A referencing the file', async () => {
    // B no longer holds the image, so purging it releases nothing further.
    for (const [id, delta] of referenceDelta({ ...itemB, images: [] }, null)) await adjust(db, id, delta);
    assert.equal(await refCount(db, MEDIA), 1);
    await storage.sweep(db, [MEDIA]);
    assert.deepEqual(storage.deleted, []);
  });

  await check('only when A releases it does the count reach zero', async () => {
    for (const [id, delta] of referenceDelta(itemA, null)) await adjust(db, id, delta);
    assert.equal(await refCount(db, MEDIA), 0);
  });

  await check('the sweeper then reclaims the file exactly once', async () => {
    await storage.sweep(db, [MEDIA]);
    assert.deepEqual(storage.deleted, [MEDIA]);
  });

  await check('the count never goes negative', async () => {
    await adjust(db, MEDIA, -3);
    assert.equal(await refCount(db, MEDIA), 0);
  });

  console.log('\nRules still guard the media collection');
  const outsider = env.authenticatedContext('outsider', { email_verified: true }).firestore();
  await check('a non-member cannot read media metadata', async () => {
    await assert.rejects(() => getDoc(doc(outsider, 'workspaces', WS, 'media', MEDIA)));
  });
  await check('a client cannot delete a media document', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await assert.rejects(() => deleteDoc(doc(db, 'workspaces', WS, 'media', MEDIA)));
  });
  await check('a client cannot inflate refCount by more than one per write', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await assert.rejects(() => updateDoc(doc(db, 'workspaces', WS, 'media', MEDIA), { refCount: 99 }));
  });

  await env.cleanup();
  console.log(`\n${results.passed} passed, ${results.failed.length} failed`);
  if (results.failed.length) results.failed.forEach((n) => console.log('  - ' + n));
  assert.equal(results.failed.length, 0, 'media reference tests failed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
