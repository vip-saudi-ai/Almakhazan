'use strict';

// Subscription billing.
//
// Entitlements are activated by verified backend state only. A successful
// checkout redirect grants nothing; the webhook does. Every webhook is
// signature-verified and recorded in an idempotency ledger, so a replayed or
// duplicated delivery cannot double-apply.
//
// The provider is behind an interface. Almakhzan's entitlement logic never
// imports a payment SDK — swapping providers means writing one adapter.
//
// NOTE: no provider is wired up. `BILLING_PROVIDER` defaults to "none", which
// makes checkout return a clear "not configured" error rather than pretending
// to work. See DEPLOYMENT.md § Billing for what must be supplied.

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { admin, db, callable, logger, requireAuth, requireMember, PLANS, PLAN_CONFIG } = require('./lib');

const BILLING_PROVIDER = defineString('BILLING_PROVIDER', { default: 'none' });
const BILLING_WEBHOOK_SECRET = defineSecret('BILLING_WEBHOOK_SECRET');
const BILLING_API_KEY = defineSecret('BILLING_API_KEY');
const APP_URL = defineString('APP_URL', { default: 'https://almakhzan-3d808.web.app' });

const FieldValue = admin.firestore.FieldValue;

/**
 * The contract every provider adapter implements.
 *
 * @typedef {object} BillingProvider
 * @property {(ctx: {userId: string, workspaceId: string, planId: string, interval: 'monthly'|'yearly', customerId: string|null, email: string|null}) => Promise<{url: string, providerCustomerId?: string}>} createCheckout
 * @property {(ctx: {providerCustomerId: string, returnUrl: string}) => Promise<{url: string}>} createPortalSession
 * @property {(ctx: {providerSubscriptionId: string, atPeriodEnd: boolean}) => Promise<void>} cancelSubscription
 * @property {(ctx: {providerSubscriptionId: string}) => Promise<object|null>} getSubscription
 * @property {(rawBody: Buffer, headers: object, secret: string) => {id: string, type: string, data: object}} verifyWebhook
 * @property {(event: object) => SubscriptionUpdate|null} toSubscriptionUpdate
 */

/**
 * @typedef {object} SubscriptionUpdate
 * @property {string} providerSubscriptionId
 * @property {string} providerCustomerId
 * @property {string} planId
 * @property {string} status
 * @property {number|null} currentPeriodStart
 * @property {number|null} currentPeriodEnd
 * @property {boolean} cancelAtPeriodEnd
 * @property {string|null} workspaceId
 * @property {string|null} userId
 */

/** Placeholder adapter. Every call fails loudly instead of faking success. */
const noProvider = {
  name: 'none',
  async createCheckout() {
    throw new HttpsError('failed-precondition',
      'الاشتراكات غير مفعّلة بعد — لم تتم تهيئة مزوّد الدفع.');
  },
  async createPortalSession() {
    throw new HttpsError('failed-precondition', 'بوابة الفوترة غير مهيأة.');
  },
  async cancelSubscription() {
    throw new HttpsError('failed-precondition', 'الاشتراكات غير مفعّلة بعد.');
  },
  async getSubscription() {
    return null;
  },
  verifyWebhook() {
    throw new Error('no billing provider configured');
  },
  toSubscriptionUpdate() {
    return null;
  },
};

/**
 * Adapters register here. Implementing one means satisfying BillingProvider
 * above; nothing else in the codebase changes.
 *
 * Provider choice is a business decision tied to the jurisdiction the company
 * bills from — see DEPLOYMENT.md § Billing. Do not assume a given provider is
 * available in Saudi Arabia without verifying it.
 */
const providers = {
  none: noProvider,
  // stripe: require('./providers/stripe'),
  // paddle: require('./providers/paddle'),
  // moyasar: require('./providers/moyasar'),
};

function provider() {
  const name = BILLING_PROVIDER.value();
  const adapter = providers[name];
  if (!adapter) {
    logger.error('billing: unknown provider configured', { name });
    return noProvider;
  }
  return adapter;
}

// ── callable API ───────────────────────────────────────────────────────────

exports.createCheckoutSession = onCall(
  callable({ secrets: [BILLING_API_KEY] }),
  async (request) => {
    const uid = requireAuth(request);
    const workspaceId = String(request.data?.workspaceId || '');
    const planId = String(request.data?.planId || '');
    const interval = request.data?.interval === 'yearly' ? 'yearly' : 'monthly';

    await requireMember(uid, workspaceId, 'owner');

    const plan = PLANS[planId];
    if (!plan || !plan.purchasable) {
      throw new HttpsError('invalid-argument', 'خطة غير صالحة');
    }

    const customerSnap = await db.doc(`customers/${uid}`).get();
    const session = await provider().createCheckout({
      userId: uid,
      workspaceId,
      planId,
      interval,
      customerId: customerSnap.exists ? customerSnap.data().providerCustomerId : null,
      email: request.auth.token.email || null,
      successUrl: `${APP_URL.value()}/?checkout=success`,
      cancelUrl: `${APP_URL.value()}/?checkout=cancelled`,
    });

    if (session.providerCustomerId) {
      await db.doc(`customers/${uid}`).set({
        providerCustomerId: session.providerCustomerId,
        provider: provider().name,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    logger.info('billing: checkout created', { uid, workspaceId, planId, interval });
    return { ok: true, url: session.url };
  },
);

exports.createPortalSession = onCall(
  callable({ secrets: [BILLING_API_KEY] }),
  async (request) => {
    const uid = requireAuth(request);
    const workspaceId = String(request.data?.workspaceId || '');
    await requireMember(uid, workspaceId, 'owner');

    const customerSnap = await db.doc(`customers/${uid}`).get();
    if (!customerSnap.exists) {
      throw new HttpsError('failed-precondition', 'لا يوجد اشتراك لإدارته');
    }
    const session = await provider().createPortalSession({
      providerCustomerId: customerSnap.data().providerCustomerId,
      returnUrl: APP_URL.value(),
    });
    return { ok: true, url: session.url };
  },
);

exports.cancelSubscription = onCall(
  callable({ secrets: [BILLING_API_KEY] }),
  async (request) => {
    const uid = requireAuth(request);
    const workspaceId = String(request.data?.workspaceId || '');
    await requireMember(uid, workspaceId, 'owner');

    const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
    const subscriptionId = wsSnap.data()?.subscriptionId;
    if (!subscriptionId) throw new HttpsError('failed-precondition', 'لا يوجد اشتراك نشط');

    const subSnap = await db.doc(`subscriptions/${subscriptionId}`).get();
    await provider().cancelSubscription({
      providerSubscriptionId: subSnap.data().providerSubscriptionId,
      // Cancelling never cuts service mid-period, and never deletes data.
      atPeriodEnd: true,
    });

    logger.info('billing: cancellation requested', { uid, workspaceId, subscriptionId });
    return { ok: true };
  },
);

// ── webhook ────────────────────────────────────────────────────────────────

/**
 * The only writer of entitlement state.
 *
 * Idempotency: each provider event id is claimed in a transaction before it is
 * applied, so a replay is a no-op. Ordering: an event older than the record it
 * would overwrite is ignored.
 */
exports.billingWebhook = onRequest(
  { region: 'us-central1', secrets: [BILLING_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed');
      return;
    }

    let event;
    try {
      event = provider().verifyWebhook(req.rawBody, req.headers, BILLING_WEBHOOK_SECRET.value());
    } catch (error) {
      // A signature failure is an attack or a misconfiguration; never apply it.
      logger.error('billing: webhook signature rejected', { error: error.message });
      res.status(400).send('invalid signature');
      return;
    }

    const claimed = await claimEvent(event.id, event.type);
    if (!claimed) {
      logger.info('billing: duplicate webhook ignored', { eventId: event.id });
      res.status(200).send('duplicate');
      return;
    }

    try {
      const update = provider().toSubscriptionUpdate(event);
      if (update) await applySubscriptionUpdate(update, event.id);
      await db.doc(`billingEvents/${event.id}`).set({ status: 'applied', appliedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).send('ok');
    } catch (error) {
      logger.error('billing: webhook handling failed', { eventId: event.id, error: error.message });
      await db.doc(`billingEvents/${event.id}`).set({ status: 'failed', error: error.message }, { merge: true });
      // 500 asks the provider to retry; the idempotency claim is released.
      await db.doc(`billingEvents/${event.id}`).set({ claimed: false }, { merge: true });
      res.status(500).send('handler error');
    }
  },
);

/** Returns false when this event id has already been claimed. */
async function claimEvent(eventId, type) {
  const ref = db.doc(`billingEvents/${eventId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().claimed === true) return false;
    tx.set(ref, {
      claimed: true, type, receivedAt: FieldValue.serverTimestamp(), status: 'processing',
    }, { merge: true });
    return true;
  });
}

/**
 * Writes the subscription record and the workspace's entitlement fields — the
 * two things Security Rules forbid any client from touching.
 */
async function applySubscriptionUpdate(update, eventId) {
  const subscriptionId = update.providerSubscriptionId;
  const subRef = db.doc(`subscriptions/${subscriptionId}`);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(subRef);
    const previous = existing.exists ? existing.data() : null;

    // Out-of-order delivery: never let an older event overwrite newer state.
    if (previous?.eventTimestamp && update.eventTimestamp
        && update.eventTimestamp < previous.eventTimestamp) {
      logger.info('billing: stale event ignored', { subscriptionId, eventId });
      return;
    }

    tx.set(subRef, {
      userId: update.userId ?? previous?.userId ?? null,
      workspaceId: update.workspaceId ?? previous?.workspaceId ?? null,
      providerCustomerId: update.providerCustomerId,
      providerSubscriptionId: subscriptionId,
      provider: provider().name,
      plan: update.planId,
      status: update.status,
      currentPeriodStart: update.currentPeriodStart ?? null,
      currentPeriodEnd: update.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: update.cancelAtPeriodEnd === true,
      eventTimestamp: update.eventTimestamp ?? Date.now(),
      lastEventId: eventId,
      createdAt: previous?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const workspaceId = update.workspaceId ?? previous?.workspaceId;
    if (workspaceId) {
      const live = ['active', 'trialing', 'past_due'].includes(update.status);
      const effectivePlanId = live ? update.planId : PLAN_CONFIG.defaultPlan;
      const effectivePlan = PLANS[effectivePlanId] || PLANS[PLAN_CONFIG.defaultPlan];

      tx.set(db.doc(`workspaces/${workspaceId}`), {
        plan: effectivePlanId,
        // Kept in step with the plan so Security Rules enforce the right
        // ceiling the moment a subscription starts or lapses.
        limits: effectivePlan.limits,
        planSource: 'subscription',
        subscriptionId,
        // Losing a subscription tightens limits; it never freezes or deletes
        // immediately. The retention sweeper handles that, with warning.
        readOnly: false,
        retentionUntil: live
          ? null
          : Date.now() + PLAN_CONFIG.retention.deleteAfterDays * 86_400_000,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  logger.info('billing: subscription applied', {
    subscriptionId, plan: update.planId, status: update.status,
  });
}

exports._internal = { applySubscriptionUpdate, claimEvent, providers, noProvider };
