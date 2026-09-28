import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PLANS, UNLIMITED, assistantPresentation, checkCreateItem, checkCreateWorkspace,
  checkFeature, checkImagesPerItem, checkInviteMember, checkUploadBytes, checkUseAI,
  itemQuotaStatus, overagesFor, resolveEntitlement, usageSummary,
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
  assert.equal(checkInviteMember(ctx('pro', { members: 2 })).allowed, true);
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


// ── launch pricing, exactly as specified ──

test('the five launch plans carry the agreed prices and record limits', () => {
  const expected = {
    free:       { monthly: 0,   yearly: 0,    items: 50,    members: 1,  workspaces: 1,  gb: 1 },
    personal:   { monthly: 69,  yearly: 690,  items: 1000,  members: 1,  workspaces: 1,  gb: 5 },
    pro:        { monthly: 159, yearly: 1590, items: 5000,  members: 3,  workspaces: 3,  gb: 25 },
    business:   { monthly: 279, yearly: 2790, items: 20000, members: 10, workspaces: 10, gb: 100 },
  };
  for (const [id, want] of Object.entries(expected)) {
    const plan = PLANS[id];
    assert.ok(plan, `plan ${id} is missing`);
    assert.equal(plan.price.monthly, want.monthly, `${id} monthly price`);
    assert.equal(plan.price.yearly, want.yearly, `${id} yearly price`);
    assert.equal(plan.price.currency, 'SAR');
    assert.equal(plan.limits.items, want.items, `${id} item limit`);
    assert.equal(plan.limits.members, want.members, `${id} member limit`);
    assert.equal(plan.limits.workspaces, want.workspaces, `${id} workspace limit`);
    assert.equal(plan.limits.storageBytes, want.gb * 1024 ** 3, `${id} storage`);
  }
  assert.equal(PLANS.enterprise.contactOnly, true);
  assert.equal(PLANS.enterprise.limits.items, UNLIMITED);
  assert.equal(PLANS.pro.badge.ar, 'الأكثر شعبية');
});

test('annual prices are explicit figures, not twelve months minus a discount', () => {
  // Ten months' worth: the "two months free" promise has to hold exactly.
  for (const id of ['personal', 'pro', 'business']) {
    assert.equal(PLANS[id].price.yearly, PLANS[id].price.monthly * 10, `${id} annual price`);
  }
});

test('every plan records which price list it was sold under', () => {
  for (const plan of Object.values(PLANS)) {
    assert.match(plan.priceVersion, /^\d{4}-\d{2}-/, `${plan.id} priceVersion`);
  }
});

test('enterprise is described as custom limits, never as unlimited', () => {
  assert.equal(PLANS.enterprise.limitsLabel.ar, 'حدود مخصصة');
});

test('the free plan allows 10 assistant actions a month and shows the number', () => {
  assert.equal(PLANS.free.limits.aiCreditsMonthly, 10);
  const shown = assistantPresentation(ctx('free'));
  assert.equal(shown.included, false);
  assert.match(shown.label, /10/);
});

test('paid plans present the assistant as included, not as a credit count', () => {
  for (const id of ['personal', 'pro', 'business', 'enterprise']) {
    const shown = assistantPresentation(ctx(id));
    assert.equal(shown.included, true, `${id} should read as included`);
    assert.equal(shown.label, 'مشمول');
    // Metering still exists behind the label.
    assert.ok(PLANS[id].limits.aiCreditsMonthly !== 0, `${id} must still be metered`);
  }
});

// ── the item limit counts records, never quantities ──

test('a record holding 500 units still costs exactly one record', () => {
  // Usage counts documents. Quantity lives inside a document and is irrelevant
  // to the plan limit, which is what the pricing promises.
  const atLimit = ctx('free', { items: PLANS.free.limits.items });
  assert.equal(checkCreateItem(atLimit).allowed, false);

  const oneBelow = ctx('free', { items: PLANS.free.limits.items - 1 });
  assert.equal(checkCreateItem(oneBelow).allowed, true);

  // Nothing in the decision path reads a quantity at all.
  const withHugeQuantities = { ...oneBelow, usage: { ...oneBelow.usage, totalQuantity: 500000 } };
  assert.equal(checkCreateItem(withHugeQuantities).allowed, true);
});

// ── warning before the wall ──

test('quota warnings fire at 70%, then 90%, then full', () => {
  const limit = PLANS.free.limits.items;            // 50
  const at = (n) => itemQuotaStatus(ctx('free', { items: n }));

  assert.equal(at(0).level, 'none');
  assert.equal(at(34).level, 'none');
  assert.equal(at(35).level, 'notice');             // 70%
  assert.match(at(35).message, /70%/);
  assert.equal(at(44).level, 'notice');
  assert.equal(at(45).level, 'warn');               // 90%
  assert.match(at(45).message, /5/);
  assert.equal(at(limit).level, 'full');
  assert.match(at(limit).message, /50/);
});

test('an unlimited plan never warns', () => {
  assert.equal(itemQuotaStatus(ctx('enterprise', { items: 10 ** 6 })).level, 'none');
});

test('being full explains that nothing is lost', () => {
  const denied = checkCreateItem(ctx('free', { items: 50 }));
  assert.equal(denied.allowed, false);
  assert.match(denied.detail, /ستبقى محفوظة/);
});

// ── the free tier must not feel broken ──

test('the free plan keeps the core product usable', () => {
  for (const feature of ['exportJson', 'exportExcel', 'import', 'qrLabels']) {
    assert.equal(checkFeature(ctx('free'), feature).allowed, true, `free should include ${feature}`);
  }
});

test('scale features are what the paid tiers actually sell', () => {
  assert.equal(checkFeature(ctx('free'), 'bulkAi').allowed, false);
  assert.equal(checkFeature(ctx('personal'), 'bulkAi').allowed, false);
  assert.equal(checkFeature(ctx('pro'), 'bulkAi').allowed, true);
  assert.equal(checkFeature(ctx('pro'), 'teamFeatures').allowed, true);
  assert.equal(checkFeature(ctx('business'), 'advancedReports').allowed, true);
});

// ── section 60: the subscription scenarios, end to end ──

test('a free user at 49 can add one more, at 50 cannot', () => {
  assert.equal(checkCreateItem(ctx('free', { items: 49 })).allowed, true);
  assert.equal(checkCreateItem(ctx('free', { items: 50 })).allowed, false);
});

test('upgrading to Personal immediately unblocks record 51', () => {
  const upgraded = {
    entitlement: resolveEntitlement({ plan: 'free' }, { status: 'active', plan: 'personal' }),
    usage: { items: 50 },
  };
  assert.equal(upgraded.entitlement.planId, 'personal');
  assert.equal(checkCreateItem(upgraded).allowed, true);
});

test('downgrading while over the limit loses nothing and blocks only creation', () => {
  const over = ctx('free', { items: 800, storageBytes: 0, members: 1 });
  const overages = overagesFor(over);
  assert.equal(overages.length, 1);
  assert.equal(overages[0].key, 'items');
  assert.equal(overages[0].used, 800);
  // Creation is refused...
  assert.equal(checkCreateItem(over).allowed, false);
  // ...but nothing in this layer deletes, hides, or restricts reading.
  assert.equal(over.entitlement.readOnly, false);
});
