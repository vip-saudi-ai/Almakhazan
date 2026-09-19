import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PLANS, UNLIMITED, checkCreateItem, checkCreateWorkspace, checkFeature,
  checkImagesPerItem, checkInviteMember, checkUploadBytes, checkUseAI,
  overagesFor, resolveEntitlement, usageSummary,
} from '../../src/entitlements.js';
import { PLAN_CONFIG } from '../../src/plans.generated.js';

const url = (p) => new URL(p, import.meta.url);

test('generated plan copies stay in sync with shared/plans.json', () => {
  const canonical = JSON.parse(readFileSync(url('../../shared/plans.json'), 'utf8'));
  assert.deepEqual(PLAN_CONFIG, canonical, 'run `npm run sync:plans`');
  const functionsCopy = JSON.parse(readFileSync(url('../../functions/plans.json'), 'utf8'));
  assert.deepEqual(functionsCopy, canonical, 'run `npm run sync:plans`');
});

test('every plan declares the limits the entitlement layer reads', () => {
  const required = ['items', 'storageBytes', 'members', 'workspaces', 'imagesPerItem', 'aiCreditsMonthly'];
  for (const [id, plan] of Object.entries(PLANS)) {
    assert.equal(plan.id, id);
    for (const key of required) {
      assert.equal(typeof plan.limits[key], 'number', `${id}.limits.${key}`);
    }
  }
});

const ctx = (planId, usage = {}, workspace = {}, subscription = null) => ({
  entitlement: resolveEntitlement({ plan: planId, ...workspace }, subscription),
  usage,
});

test('a workspace with no subscription is on the free plan', () => {
  const e = resolveEntitlement({}, null);
  assert.equal(e.planId, 'free');
  assert.equal(e.status, 'free');
});

test('an active subscription grants its plan', () => {
  const e = resolveEntitlement({ plan: 'free' }, { status: 'active', plan: 'pro' });
  assert.equal(e.planId, 'pro');
  assert.equal(e.status, 'active');
});

test('a cancelled subscription drops to free without deleting anything', () => {
  const e = resolveEntitlement({ plan: 'pro' }, { status: 'canceled', plan: 'pro' });
  assert.equal(e.planId, 'free');
  // Reading stays possible; only the limits tighten.
  assert.equal(e.readOnly, false);
});

test('past_due keeps the plan alive during the grace window', () => {
  const e = resolveEntitlement({ plan: 'free' }, { status: 'past_due', plan: 'personal' });
  assert.equal(e.planId, 'personal');
});

test('a live trial grants the trial plan', () => {
  const e = resolveEntitlement({ trialEndsAt: Date.now() + 86_400_000 }, null);
  assert.equal(e.planId, PLAN_CONFIG.trialPlan);
  assert.equal(e.inTrial, true);
});

test('an expired trial does not', () => {
  const e = resolveEntitlement({ trialEndsAt: Date.now() - 1000 }, null);
  assert.equal(e.planId, 'free');
  assert.equal(e.inTrial, false);
});

test('item creation is blocked exactly at the limit', () => {
  const limit = PLANS.free.limits.items;
  assert.equal(checkCreateItem(ctx('free', { items: limit - 1 })).allowed, true);

  const denied = checkCreateItem(ctx('free', { items: limit }));
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'limit/items');
  assert.equal(denied.limit, limit);
  assert.match(denied.message, /\d/);
});

test('upload is rejected when the file would cross the quota', () => {
  const limit = PLANS.free.limits.storageBytes;
  assert.equal(checkUploadBytes(ctx('free', { storageBytes: limit - 1000 }), 999).allowed, true);
  const denied = checkUploadBytes(ctx('free', { storageBytes: limit - 1000 }), 5000);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'limit/storage');
});

test('images per item are capped per plan', () => {
  assert.equal(checkImagesPerItem(ctx('free'), PLANS.free.limits.imagesPerItem - 1).allowed, true);
  assert.equal(checkImagesPerItem(ctx('free'), PLANS.free.limits.imagesPerItem).allowed, false);
});

test('single-seat plans refuse invitations with a plan-specific message', () => {
  const denied = checkInviteMember(ctx('personal', { members: 1 }));
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'limit/members');
  assert.equal(checkInviteMember(ctx('team', { members: 3 })).allowed, true);
});

test('AI is metered per plan and per month', () => {
  const limit = PLANS.free.limits.aiCreditsMonthly;
  assert.equal(checkUseAI(ctx('free', { aiCreditsUsed: limit - 1 })).allowed, true);
  const denied = checkUseAI(ctx('free', { aiCreditsUsed: limit }));
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'limit/ai');
});

test('a frozen workspace blocks every write path with one message', () => {
  const frozen = { entitlement: resolveEntitlement({ plan: 'pro', readOnly: true }, null), usage: {} };
  for (const check of [checkCreateItem, checkInviteMember, checkUseAI]) {
    const d = check(frozen);
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'workspace/read-only');
  }
  assert.equal(checkUploadBytes(frozen, 1).reason, 'workspace/read-only');
});

test('feature gates follow the plan table', () => {
  assert.equal(checkFeature(ctx('free'), 'exportExcel').allowed, PLANS.free.features.exportExcel);
  assert.equal(checkFeature(ctx('pro'), 'sharing').allowed, true);
  assert.equal(checkFeature(ctx('free'), 'sharing').allowed, false);
});

test('workspace creation respects the plan allowance', () => {
  assert.equal(checkCreateWorkspace(ctx('free', { workspaces: 1 })).allowed, false);
  assert.equal(checkCreateWorkspace(ctx('pro', { workspaces: 1 })).allowed, true);
});

test('a downgrade reports overages instead of deleting data', () => {
  const over = overagesFor(ctx('free', { items: 900, storageBytes: 0, members: 1 }));
  assert.equal(over.length, 1);
  assert.equal(over[0].key, 'items');
  assert.equal(over[0].used, 900);
  assert.equal(over[0].limit, PLANS.free.limits.items);
});

test('unlimited limits never block', () => {
  const unlimited = {
    entitlement: { plan: { limits: { items: UNLIMITED, storageBytes: UNLIMITED, aiCreditsMonthly: UNLIMITED, members: UNLIMITED, workspaces: UNLIMITED }, name: { ar: 'x' } }, planId: 'x', readOnly: false },
    usage: { items: 10 ** 9, storageBytes: 10 ** 15, aiCreditsUsed: 10 ** 6 },
  };
  assert.equal(checkCreateItem(unlimited).allowed, true);
  assert.equal(checkUploadBytes(unlimited, 10 ** 12).allowed, true);
  assert.equal(checkUseAI(unlimited).allowed, true);
});

test('usage summary renders every metered dimension', () => {
  const rows = usageSummary(ctx('personal', { items: 312, storageBytes: 1.4 * 1024 ** 3, aiCreditsUsed: 8, members: 1 }));
  assert.equal(rows.length, 4);
  assert.equal(rows[0].used, 312);
  assert.equal(rows[1].format(rows[1].used), '1.4 GB');
});
