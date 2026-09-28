# Billing

How money becomes entitlement, and why the browser is never part of that chain.

## The chain

```
payment provider
      │  signed webhook
      ▼
backend verifies signature, claims the event id, applies it
      │
      ▼
subscriptions/{id}  +  workspaces/{id}.plan, .limits, .subscriptionId
      │
      ▼
entitlement engine (shared/plans.json → both sides)
      │
      ▼
Security Rules and Cloud Functions enforce · the UI explains
```

A paid plan is never activated because a checkout redirect came back. The only
writer of entitlement is a verified webhook, applied through the Admin SDK.
Security Rules reject a client write to `plan`, `limits`, `subscriptionId` or
`readOnly` from any account, including the workspace owner — and an emulator
test proves it.

## Current state

**No payment provider is connected.** This is deliberate and visible: choosing
a plan in the app says *الدفع الإلكتروني قيد التفعيل — راسلنا لتفعيل خطتك يدوياً*.
Nothing anywhere pretends a subscription started.

What exists and is testable:

| Piece | State |
|---|---|
| Provider abstraction (`functions/src/billing.js`) | done — `providers = { none: noProvider }` |
| Webhook handler: signature check, idempotency, replay safety | done |
| Applying a subscription to a workspace's plan **and** limits | done |
| Downgrade without data loss | done |
| Entitlement engine driving every gate | done |
| A live provider adapter | **not done** — see below |
| Hosted checkout and the customer portal | **not done** |

## Adding a provider

1. Implement the `BillingProvider` interface in `functions/src/billing.js`:

   ```js
   {
     id: 'moyasar',
     createCheckout({ workspaceId, planId, interval, uid }) → { url },
     verifyWebhook(rawBody, headers) → event | null,
     parseEvent(event) → { providerSubscriptionId, workspaceId, planId,
                           status, interval, currentPeriodEnd, eventId, seq },
     cancel(subscriptionId) → void,
   }
   ```

2. Register it and set `BILLING_PROVIDER` to its id.
3. Put the signing secret in Secret Manager. **[YOU]**
4. Point the provider's webhook at the deployed `billingWebhook`. **[YOU]**
5. Map the provider's price ids to plan ids and intervals. **[YOU]**

The webhook must stay idempotent: each event id is claimed in `billingEvents`
before it is applied, and an out-of-order event for a subscription is ignored by
sequence number. Replaying a month of webhooks must change nothing.

## Prices

`shared/plans.json` is the only price list. Annual figures are published
numbers, not a computed discount — a test asserts the "two months free"
promise holds exactly, which it does because the numbers say so, not because
of a formula.

| Plan | Monthly | Annual | Records | Users | Storage |
|---|---|---|---|---|---|
| مجاني | 0 | — | 50 | 1 | 1 GB |
| شخصي | 69 | 690 | 1,000 | 1 | 5 GB |
| احترافي | 159 | 1,590 | 5,000 | 3 | 25 GB |
| أعمال | 279 | 2,790 | 20,000 | 10 | 100 GB |
| مؤسسات | حسب الاتفاق | حسب الاتفاق | حدود مخصصة | حدود مخصصة | حدود مخصصة |

All amounts are SAR.

## Grandfathering

Every plan carries a `priceVersion`, and a subscription records the version it
was sold under. A future price change edits `shared/plans.json` and bumps the
version; existing subscribers keep the terms attached to their subscription
record. What a subscriber pays is never derived from the current public table.

The same applies to entitlements: `entitlementsVersion` exists so a plan's
limits can change for new customers without silently changing for old ones.

## What happens when a subscription ends

Nothing is deleted. Ever.

| Event | Effect |
|---|---|
| `past_due` | the plan stays live through the grace window |
| `canceled` / `unpaid` | entitlement drops to the free tier |
| Over the new limit | the workspace is marked *فوق حد الخطة* |

Over the limit, the customer keeps: viewing, searching, exporting, deleting,
and editing existing records. What stops: new records, uploads that would push
storage further past the quota, and members above the seat count. A workspace
is never frozen for being over a limit — only `readOnly`, which is a separate
state a human sets, does that.

## Refunds and disputes

Handled with the provider, outside the app. A refund that cancels a
subscription arrives as a normal webhook and takes the normal path.

## Analytics

Commercial events only, and never inventory content:

```
pricing_viewed · plan_selected · checkout_started · checkout_completed
subscription_started · upgrade_started · upgrade_completed
downgrade_started · subscription_cancelled
free_limit_70 · free_limit_90 · free_limit_reached
```

Each carries the plan id, the interval and the workspace id — no names, no
photos, no values.
