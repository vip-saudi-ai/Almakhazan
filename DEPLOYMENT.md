# Deployment

Everything here is exact. Where a step needs a credential or a business
decision that cannot be invented, it is marked **[YOU]** and listed again in
`PRODUCTION-CHECKLIST.md`.

## 0. Prerequisites

- Node.js 20
- `npm install -g firebase-tools`
- A Firebase project on the **Blaze** plan (Cloud Functions require it)
- An Anthropic API key — <https://console.anthropic.com>

```bash
npm install
cd functions && npm install && cd ..
firebase login
firebase use <your-project-id>
```

The repository is currently pinned to `almakhzan-3d808` in `src/config.js`.
**[YOU]** If you deploy to a different project, replace `FIREBASE_CONFIG` there
with the config from *Project settings → General → Your apps → Web app*. The
`apiKey` in that block is a public project identifier, not a secret; access is
controlled by Security Rules and App Check.

## 1. Enable Firebase services

In the Firebase console:

| Service | Action |
|---|---|
| Authentication | Enable **Email/Password**. Enable **Google** if you want it. |
| Authentication → Templates | Enable the verification email. Rules require `email_verified` before a user can create a workspace. |
| Firestore | Create the database in **Production mode**, in your preferred region. |
| Storage | Create the default bucket. |
| Functions | Enabled automatically on first deploy. |
| App Check | See §5. |

## 2. Secrets and configuration

No secret is ever present in the browser bundle.

```bash
# Required for AI analysis
firebase functions:secrets:set ANTHROPIC_API_KEY

# Required only once a payment provider is wired up (§6)
firebase functions:secrets:set BILLING_API_KEY
firebase functions:secrets:set BILLING_WEBHOOK_SECRET
```

| Name | Where | Required | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Secret Manager | for AI | Server-side Claude access |
| `BILLING_API_KEY` | Secret Manager | for billing | Payment provider API key |
| `BILLING_WEBHOOK_SECRET` | Secret Manager | for billing | Webhook signature verification |
| `ANALYSIS_MODEL` | Function env | no | Defaults to `claude-opus-5` |
| `BILLING_PROVIDER` | Function env | no | Defaults to `none` |
| `APP_URL` | Function env | no | Checkout return URL |

Set non-secret parameters at deploy time:

```bash
firebase deploy --only functions \
  --set-env-vars BILLING_PROVIDER=none,APP_URL=https://<your-domain>
```

## 3. Plans and pricing

`shared/plans.json` is the single source for limits, features and prices.

```bash
# after any edit
npm run sync:plans
npm run test:unit      # fails if the generated copies drift
```

**[YOU]** The prices in that file are placeholders. Set real ones before
launch, and keep them consistent with whatever you configure at the payment
provider — the plan table drives limits, the provider drives money, and the
webhook maps one to the other by `planId`.

## 4. Deploy

```bash
# 1. Rules and indexes first — never leave a window where data is open
firebase deploy --only firestore:rules,firestore:indexes,storage

# 2. Backend
firebase deploy --only functions

# 3. Frontend
firebase deploy --only hosting
```

Hosting serves the repository root. `dist/`, `tests/`, `tools/`, `shared/` and
`functions/` are excluded by `firebase.json` — the demo build is never
published.

Verify after deploying:

```bash
firebase functions:list          # expect 20 functions
firebase firestore:indexes       # expect the 4 composite indexes
```

## 5. App Check

App Check is implemented but **disabled**, because enabling it requires a key
only you can create.

**[YOU]** To enable, in this order. The order matters: enforcing before the
client sends tokens locks every customer out.

1. Firebase console → App Check → register the web app with **reCAPTCHA v3**.
2. Put the site key in `APP_CHECK_SITE_KEY` in `src/config.js` and deploy.
   The client now sends tokens; nothing is rejected yet.
3. For local work, create a debug token (App Check → Apps → Manage debug
   tokens) and put it in `APP_CHECK_DEBUG_TOKEN`. It is honoured **only on
   localhost** — the code checks the hostname, not a build flag, so a token
   left in the file cannot weaken a deployed origin. Still: do not commit one.
4. Watch the console's App Check metrics for a few days. Verified vs
   unverified requests tells you whether step 2 actually reached everyone —
   old cached bundles, embedded webviews and PWA installs are the usual
   stragglers.
5. Deploy the functions with enforcement on:

   ```bash
   firebase deploy --only functions --set-env-vars ENFORCE_APP_CHECK=true
   ```

   Every callable reads that one variable through `callable()` in
   `functions/src/lib.js`, so there is no per-function flag to forget. The
   billing webhook is deliberately exempt: it is called by the payment
   provider, not by a browser, and its authenticity comes from its signature.

6. Only then turn on enforcement for Firestore and Storage in the console, and
   start in *monitor* mode for a day.

Until step 5, App Check is registered but not enforced — treat it as not yet
providing protection.

## 6. Billing

**[YOU] — this needs a business decision before any code runs.**

`functions/src/billing.js` defines the `BillingProvider` interface and wires the
webhook, idempotency ledger and entitlement application. No provider adapter is
included, and `BILLING_PROVIDER` defaults to `none`, which makes checkout fail
with a clear message rather than pretending to work.

To go live:

1. **Choose a provider.** This depends on the jurisdiction you bill from. Do
   not assume a given provider supports Saudi entities — verify current
   availability directly with the provider before building against it.
2. Implement an adapter satisfying the interface at the top of
   `functions/src/billing.js` (`createCheckout`, `createPortalSession`,
   `cancelSubscription`, `getSubscription`, `verifyWebhook`,
   `toSubscriptionUpdate`), and register it in the `providers` map.
3. Create the products/prices at the provider to match `shared/plans.json`, and
   make `toSubscriptionUpdate` map the provider's price id to a `planId`.
4. Point the provider's webhook at:
   `https://us-central1-<project>.cloudfunctions.net/billingWebhook`
5. Set `BILLING_PROVIDER`, `BILLING_API_KEY`, `BILLING_WEBHOOK_SECRET`.
6. Test with the provider's test mode, including: a successful subscribe, a
   replayed webhook (must be a no-op), an out-of-order webhook (must not
   regress state), a cancellation, and a failed payment.

`verifyWebhook` **must** verify the signature. The handler treats a verification
failure as hostile and applies nothing.

## 7. Local development

```bash
npm run dev            # http://localhost:8080 — ES modules need a server
```

With emulators:

```bash
firebase emulators:start
```

The demo build, for opening from a file with no server:

```bash
npm run build:demo     # → dist/almakhzan.html (local only, never deploy)
```

## 8. Tests

```bash
npm run test:unit      # entitlements, plan-drift  (19)
npm run test:rules     # isolation + media         (70, needs the emulator)
npm test               # both
```

`test:rules` starts the Firestore emulator itself. The first run downloads the
emulator JAR and needs Java 17+.

What these actually prove:

- `tests/rules/isolation.test.mjs` — two unrelated accounts; every
  cross-workspace read and write is denied; roles are enforced; a client cannot
  grant itself a plan, write a subscription, or touch usage counters.
- `tests/rules/media-refcount.test.mjs` — the duplicate-then-delete scenario;
  a shared file survives until the last reference goes.
- `tests/unit/entitlements.test.mjs` — every limit, the trial, downgrade
  behaviour, and that the plan copies have not drifted.

## 9. Migration

Three sources migrate into the current schema. All are idempotent and
resumable, and none deletes its source.

| From | Trigger | What happens |
|---|---|---|
| v7 LocalStorage (`makhzan7`) or the old `almakhzan/data` document | Settings → “بيانات من الإصدار السابق” | Backs up the source, migrates taxonomy then items one at a time with a checkpoint each, uploads embedded Base64 images to Storage, compares counts before declaring success. |
| This device's local (IndexedDB) inventory | Offered automatically on first sign-in into an empty workspace | Uploads every `local:*` image to Storage and rewrites the reference **before** writing the item, checkpointed per item, then verifies no local reference remains. |
| A JSON backup file | Settings → Import | Validated in full before anything is applied; merge and restore are separate actions and restore takes a backup first. |

After any bulk migration, recompute counters:

```
callable: recalculateUsage({ workspaceId })   # admin only
callable: reconcileMedia({ workspaceId })     # admin only
```

## 10. Backups

Application exports are a convenience for the customer, not your backup
strategy.

```bash
# scheduled Firestore export
gcloud firestore export gs://<backup-bucket>/$(date +%F) --project <project>

# Storage
gsutil -m rsync -r gs://<project>.firebasestorage.app gs://<backup-bucket>/media
```

**[YOU]** Create the backup bucket, set a lifecycle policy, and schedule the
export (Cloud Scheduler → the Firestore export API). Billing state is
reconstructable from the provider: re-send recent webhook events, or reconcile
with `getSubscription` per customer.

## 11. Disaster recovery

| Failure | Recovery |
|---|---|
| Firestore data loss | Restore the most recent export with `gcloud firestore import`, then run `recalculateUsage` and `reconcileMedia` per affected workspace. |
| Storage loss | Restore from the rsync'd backup bucket. Items keep working with missing thumbnails until then. |
| Billing state divergence | Replay provider webhooks, or reconcile per customer. `billingEvents/` shows exactly what was applied and when. |
| Interrupted migration | Re-run it. Checkpoints resume; records are never migrated twice. |
| Bad deploy | `firebase hosting:rollback`, and redeploy the previous functions revision. |
