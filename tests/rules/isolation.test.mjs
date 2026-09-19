/**
 * Multi-tenant isolation, proven against the Firestore emulator rather than
 * through the UI. Section 70 of the SaaS brief: two unrelated accounts, and
 * every cross-workspace request must be denied.
 *
 *   npm run test:rules
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, setLogLevel,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const PROJECT_ID = 'demo-almakhzan';
const A = 'user-a';
const B = 'user-b';

let env;
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

function db(uid, claims = {}) {
  return env.authenticatedContext(uid, { email_verified: true, email: `${uid}@example.com`, ...claims }).firestore();
}

/** Seeds a workspace bypassing rules, the way a real signup would leave it. */
async function seedWorkspace(uid) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'workspaces', uid), {
      name: `workspace-${uid}`, ownerId: uid, plan: 'free', schemaVersion: 2,
    });
    await setDoc(doc(d, 'workspaces', uid, 'members', uid), { role: 'owner', email: `${uid}@example.com` });
    await setDoc(doc(d, 'workspaces', uid, 'items', 'secret-item'), {
      name: `${uid} secret`, quantity: 1, unit: 'قطعة', images: [], version: 1,
    });
    await setDoc(doc(d, 'workspaces', uid, 'folders', 'f1'), { name: 'folder' });
    await setDoc(doc(d, 'workspaces', uid, 'categories', 'c1'), { name: 'cat' });
    await setDoc(doc(d, 'workspaces', uid, 'locations', 'l1'), { name: 'loc' });
    await setDoc(doc(d, 'workspaces', uid, 'media', 'm1'), {
      storagePath: `workspaces/${uid}/media/m1.jpg`, refCount: 1,
    });
    await setDoc(doc(d, 'workspaces', uid, 'usage', 'current'), { items: 1, storageBytes: 100 });
    await setDoc(doc(d, 'workspaces', uid, 'activityLogs', 'log1'), { action: 'ITEM_CREATED', userId: uid });
    await setDoc(doc(d, 'workspaces', uid, 'settings', 'general'), { locale: 'ar' });
    await setDoc(doc(d, 'subscriptions', `sub-${uid}`), {
      userId: uid, workspaceId: uid, plan: 'pro', status: 'active',
    });
    await setDoc(doc(d, 'customers', uid), { providerCustomerId: 'cus_x' });
  });
}

async function main() {
  // Expected permission denials would otherwise flood the output.
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
  await seedWorkspace(A);
  await seedWorkspace(B);

  const a = db(A);

  console.log('\nCross-tenant reads by user A into workspace B — all must be denied');
  await check('B item is not readable', () => assertFails(getDoc(doc(a, 'workspaces', B, 'items', 'secret-item'))));
  await check('B item list is not readable', () => assertFails(getDocs(collection(a, 'workspaces', B, 'items'))));
  await check('B folder is not readable', () => assertFails(getDoc(doc(a, 'workspaces', B, 'folders', 'f1'))));
  await check('B category is not readable', () => assertFails(getDoc(doc(a, 'workspaces', B, 'categories', 'c1'))));
  await check('B location is not readable', () => assertFails(getDoc(doc(a, 'workspaces', B, 'locations', 'l1'))));
  await check('B media metadata is not readable', () => assertFails(getDoc(doc(a, 'workspaces', B, 'media', 'm1'))));
  await check('B activity log is not readable', () => assertFails(getDocs(collection(a, 'workspaces', B, 'activityLogs'))));
  await check('B member list is not readable', () => assertFails(getDocs(collection(a, 'workspaces', B, 'members'))));
  await check('B workspace doc is not readable', () => assertFails(getDoc(doc(a, 'workspaces', B))));
  await check('B usage is not readable', () => assertFails(getDoc(doc(a, 'workspaces', B, 'usage', 'current'))));
  await check('B settings are not readable', () => assertFails(getDoc(doc(a, 'workspaces', B, 'settings', 'general'))));
  await check("B's subscription is not readable", () => assertFails(getDoc(doc(a, 'subscriptions', `sub-${B}`))));
  await check("B's customer record is not readable", () => assertFails(getDoc(doc(a, 'customers', B))));

  console.log('\nCross-tenant writes by user A into workspace B — all must be denied');
  await check('cannot create an item in B', () => assertFails(setDoc(doc(a, 'workspaces', B, 'items', 'injected'), {
    name: 'injected', quantity: 1, unit: 'قطعة', images: [], version: 1,
  })));
  await check('cannot modify a B item', () => assertFails(updateDoc(doc(a, 'workspaces', B, 'items', 'secret-item'), { name: 'hacked', version: 2 })));
  await check('cannot delete a B item', () => assertFails(deleteDoc(doc(a, 'workspaces', B, 'items', 'secret-item'))));
  await check('cannot add itself to B as a member', () => assertFails(setDoc(doc(a, 'workspaces', B, 'members', A), { role: 'owner' })));
  await check('cannot write a B activity log', () => assertFails(addDoc(collection(a, 'workspaces', B, 'activityLogs'), { action: 'X', userId: A })));
  await check('cannot rename workspace B', () => assertFails(updateDoc(doc(a, 'workspaces', B), { name: 'taken over' })));

  console.log('\nEntitlements cannot be granted from the client');
  await check('owner cannot set their own plan', () => assertFails(updateDoc(doc(a, 'workspaces', A), { plan: 'pro' })));
  await check('owner cannot attach a subscription id', () => assertFails(updateDoc(doc(a, 'workspaces', A), { subscriptionId: 'sub_forged' })));
  await check('owner cannot write a subscription record', () => assertFails(setDoc(doc(a, 'subscriptions', 'sub-forged'), {
    userId: A, workspaceId: A, plan: 'team', status: 'active',
  })));
  await check('owner cannot write usage counters', () => assertFails(setDoc(doc(a, 'workspaces', A, 'usage', 'current'), { items: 0 })));
  await check('owner cannot create a workspace for someone else', () => assertFails(setDoc(doc(a, 'workspaces', 'other-ws'), {
    ownerId: A, plan: 'free',
  })));
  await check('owner cannot self-provision a paid workspace', () => assertFails(setDoc(doc(a, 'workspaces', A + '-2'), {
    ownerId: A, plan: 'pro',
  })));

  console.log('\nOwner can still work inside their own workspace');
  await check('reads own item', () => assertSucceeds(getDoc(doc(a, 'workspaces', A, 'items', 'secret-item'))));
  await check('creates own item', () => assertSucceeds(setDoc(doc(a, 'workspaces', A, 'items', 'mine'), {
    name: 'قطعة', quantity: 0, unit: 'قطعة', images: [], version: 1,
  })));
  await check('reads own usage', () => assertSucceeds(getDoc(doc(a, 'workspaces', A, 'usage', 'current'))));
  await check('reads own subscription', () => assertSucceeds(getDoc(doc(a, 'subscriptions', `sub-${A}`))));
  await check('renames own workspace', () => assertSucceeds(updateDoc(doc(a, 'workspaces', A), { name: 'مخزني' })));

  console.log('\nInvalid item shapes are rejected');
  await check('negative quantity rejected', () => assertFails(setDoc(doc(a, 'workspaces', A, 'items', 'bad1'), {
    name: 'x', quantity: -5, unit: 'قطعة', images: [], version: 1,
  })));
  await check('empty name rejected', () => assertFails(setDoc(doc(a, 'workspaces', A, 'items', 'bad2'), {
    name: '', quantity: 1, unit: 'قطعة', images: [], version: 1,
  })));
  await check('version must start at 1', () => assertFails(setDoc(doc(a, 'workspaces', A, 'items', 'bad3'), {
    name: 'x', quantity: 1, unit: 'قطعة', images: [], version: 7,
  })));
  await check('version must advance by exactly one', () => assertFails(updateDoc(doc(a, 'workspaces', A, 'items', 'secret-item'), {
    name: 'x', quantity: 1, unit: 'قطعة', images: [], version: 9,
  })));
  await check('valuation with max below min rejected', () => assertFails(setDoc(doc(a, 'workspaces', A, 'items', 'bad4'), {
    name: 'x', quantity: 1, unit: 'قطعة', images: [], version: 1,
    valuation: { min: 900, max: 100, currency: 'SAR' },
  })));

  console.log('\nRole enforcement inside one workspace');
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'workspaces', A, 'members', 'viewer-u'), { role: 'viewer' });
    await setDoc(doc(d, 'workspaces', A, 'members', 'editor-u'), { role: 'editor' });
  });
  const viewer = db('viewer-u');
  const editor = db('editor-u');

  await check('viewer reads', () => assertSucceeds(getDoc(doc(viewer, 'workspaces', A, 'items', 'secret-item'))));
  await check('viewer cannot create an item', () => assertFails(setDoc(doc(viewer, 'workspaces', A, 'items', 'v1'), {
    name: 'x', quantity: 1, unit: 'قطعة', images: [], version: 1,
  })));
  await check('viewer cannot edit an item', () => assertFails(updateDoc(doc(viewer, 'workspaces', A, 'items', 'secret-item'), {
    name: 'x', quantity: 1, unit: 'قطعة', images: [], version: 2,
  })));
  await check('viewer cannot invite', () => assertFails(setDoc(doc(viewer, 'workspaces', A, 'members', 'new-u'), { role: 'editor' })));
  await check('editor creates an item', () => assertSucceeds(setDoc(doc(editor, 'workspaces', A, 'items', 'e1'), {
    name: 'قطعة', quantity: 2, unit: 'قطعة', images: [], version: 1,
  })));
  await check('editor cannot permanently delete', () => assertFails(deleteDoc(doc(editor, 'workspaces', A, 'items', 'e1'))));
  await check('editor cannot change roles', () => assertFails(updateDoc(doc(editor, 'workspaces', A, 'members', 'viewer-u'), { role: 'admin' })));
  await check('admin cannot demote the owner', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'workspaces', A, 'members', 'admin-u'), { role: 'admin' });
    });
    await assertFails(updateDoc(doc(db('admin-u'), 'workspaces', A, 'members', A), { role: 'viewer' }));
  });

  console.log('\nSKU counter can only be incremented');
  await check('editor takes the next SKU', async () => {
    await assertSucceeds(setDoc(doc(editor, 'workspaces', A, 'counters', 'sku'), { value: 0 }));
    await assertSucceeds(updateDoc(doc(editor, 'workspaces', A, 'counters', 'sku'), { value: 1 }));
  });
  await check('counter cannot jump', () => assertFails(updateDoc(doc(editor, 'workspaces', A, 'counters', 'sku'), { value: 500 })));
  await check('counter cannot rewind', () => assertFails(updateDoc(doc(editor, 'workspaces', A, 'counters', 'sku'), { value: 0 })));

  console.log('\nA frozen workspace is readable but not writable');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'workspaces', B), {
      name: 'frozen', ownerId: B, plan: 'free', readOnly: true,
    });
  });
  const b = db(B);
  await check('owner of a frozen workspace still reads', () => assertSucceeds(getDoc(doc(b, 'workspaces', B, 'items', 'secret-item'))));
  await check('owner of a frozen workspace cannot write', () => assertFails(setDoc(doc(b, 'workspaces', B, 'items', 'new'), {
    name: 'x', quantity: 1, unit: 'قطعة', images: [], version: 1,
  })));
  await check('owner cannot lift the freeze themselves', () => assertFails(
    updateDoc(doc(b, 'workspaces', B), { readOnly: false }),
  ));
  await check('owner cannot upgrade their own plan while frozen', () => assertFails(
    updateDoc(doc(b, 'workspaces', B), { plan: 'team' }),
  ));

  console.log('\nUnauthenticated access is denied outright');
  const anon = env.unauthenticatedContext().firestore();
  await check('anonymous cannot read an item', () => assertFails(getDoc(doc(anon, 'workspaces', A, 'items', 'secret-item'))));
  await check('anonymous cannot write an item', () => assertFails(setDoc(doc(anon, 'workspaces', A, 'items', 'x'), {
    name: 'x', quantity: 1, unit: 'قطعة', images: [], version: 1,
  })));

  await env.cleanup();

  console.log(`\n${results.passed} passed, ${results.failed.length} failed`);
  if (results.failed.length) {
    console.log('FAILED:');
    results.failed.forEach((name) => console.log('  - ' + name));
  }
  assert.equal(results.failed.length, 0, 'security rule tests failed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
