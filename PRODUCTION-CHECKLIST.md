# Production readiness

The rule for this file: **nothing is ticked unless it is implemented and there
is a way to check it.** Where a claim rests on a test, the test is named. Where
something is written but unproven, it says so.

Status key — ✅ done and verifiable · 🟡 implemented, not yet proven end to end ·
⬜ not implemented · **[YOU]** needs your credentials or a business decision.

---

## P0 — cannot launch without

| # | Item | Status | How to check |
|---|---|---|---|
| 1 | Real Firebase production build (no cloud stub) | ✅ | `index.html` loads `src/app.js`; `__noImport` exists only in `tools/build-single-file.mjs`. `grep -r __noImport src/` returns nothing. |
| 2 | Multi-tenant workspace model | ✅ | `ARCHITECTURE.md` § Data model |
| 3 | Cross-tenant isolation enforced by rules | ✅ | `npm run test:rules` — 52 assertions, two unrelated accounts |
| 4 | Role enforcement (owner/admin/editor/viewer) | ✅ | same suite: viewer cannot write, editor cannot purge or change roles, admin cannot demote the owner |
| 5 | Entitlements unforgeable from the client | ✅ | same suite: plan, subscriptionId, readOnly, usage counters and subscription docs all reject client writes |
| 6 | Firestore Security Rules deployed as a file | ✅ | `firestore.rules`, deployed in `DEPLOYMENT.md` §4 |
| 7 | Storage Security Rules as a file | 🟡 | `storage.rules` is written and reviewed, but has **no automated test** — see `SECURITY.md` § Known gaps #2 |
| 8 | Duplicate-image ownership fix | ✅ | `npm run test:rules` — 18 assertions walking duplicate → delete → purge |
| 9 | Safe permanent deletion of media | ✅ | backend sweeper re-verifies against items before deleting; covered by the same suite |
| 10 | Local → cloud image migration | 🟡 | `src/device-upload.js` uploads bytes, rewrites refs, verifies no `local:` remains, checkpoints per item. **Not yet run against a real Storage bucket** |
| 11 | Plan/entitlement engine | ✅ | `npm run test:unit` — 19 assertions |
| 12 | Server-side limit enforcement | 🟡 | `functions/src/lib.js#assertWithinLimits` is called by every write path. Loads and syntax-checks; **not yet executed against a deployed project** |
| 13 | AI backend with metering and authorization | 🟡 | `functions/src/ai.js` — auth, membership, entitlement, burst limit, workspace-scoped image resolution, schema-validated output. **Never executed with a real key** |
| 14 | Anthropic key never client-side | ✅ | browser test asserts no `sk-ant-`, no API-key field, no `api.anthropic.com` call |
| 15 | Billing architecture (provider-agnostic) | 🟡 | interface, webhook, idempotency ledger and entitlement application are written. **No provider adapter exists** |
| 16 | Webhook is the only entitlement writer | ✅ | rules deny all client writes to `subscriptions/`, `customers/`, and the workspace plan fields |
| 17 | Webhook idempotent and replay-safe | 🟡 | event id claimed in a transaction before applying; stale events ignored. **Untested without a provider** |
| 18 | App Check | ⬜ **[YOU]** | integration written, disabled behind a null site key — `DEPLOYMENT.md` §5 |
| 19 | v7 → v8 migration, idempotent and resumable | 🟡 | `src/migration.js` — backs up first, checkpoints per item, verifies counts. Logic reviewed; **not run against production data** |
| 20 | Restore integrity for large datasets | ⬜ | Import validates fully before applying and takes a backup first, but restore is still batched writes. The staged `restoreJobs/` namespace is in the rules; the commit path is **not implemented** |
| 21 | SKU uniqueness under concurrency | ✅ | workspace counter transaction; rules permit only `+1`, verified in the isolation suite |
| 22 | Soft delete / Trash | ✅ | browser suite: delete → trash → restore |
| 23 | Audit log, append-only | ✅ | rules deny update and delete on `activityLogs` |

## P1 — strong launch requirements

| # | Item | Status | Note |
|---|---|---|---|
| 24 | Usage counters without full-collection reads | ✅ | trigger-maintained; `recalculateUsage` for repair |
| 25 | Plan/usage screen in Settings | ⬜ | `usageSummary()` exists and is tested; the Settings card is not built |
| 26 | Upgrade prompt on hitting a limit | 🟡 | every `check*` returns a user-facing message; the prompt UI is not built |
| 27 | Onboarding flow (signup → verify → workspace → use case) | 🟡 | `createWorkspace` seeds a taxonomy per use case; the first-run screen is not built |
| 28 | Invitations | 🟡 | backend complete (hashed single-use token, expiry, seat check). **No email delivery and no UI** |
| 29 | Barcode / QR scanning | ⬜ | not implemented |
| 30 | QR labels | ⬜ | not implemented |
| 31 | Bulk actions | ⬜ | not implemented |
| 32 | CSV / XLSX import with column mapping | ⬜ | JSON import is complete and validated; spreadsheet import is not implemented |
| 33 | Excel export with typed cells | ✅ | dependency-free writer; verified by reading the output back with a real spreadsheet library |
| 34 | Global search across folders, Arabic-normalised | ✅ | browser suite |
| 35 | English / i18n | ⬜ | strings are still inline Arabic; no i18n layer |
| 36 | PWA (manifest, icons, service worker) | 🟡 | all three exist; the service worker caches only the static shell and never authenticated data. Installability not verified on a device |
| 37 | Landing / marketing page | ⬜ | not implemented |
| 38 | Error monitoring | ⬜ | `console.error` and Cloud Logging only; no alerting |
| 39 | Product analytics | ⬜ | not implemented |
| 40 | Server-side backups | ⬜ **[YOU]** | commands documented; bucket and schedule not created |

## P2 — after launch

| # | Item | Status |
|---|---|---|
| 41 | Revocable share links | ⬜ |
| 42 | Custom fields | ⬜ (schema does not preclude it) |
| 43 | Hierarchical locations | ⬜ (schema does not preclude it) |
| 44 | Dedicated search service | ⬜ |
| 45 | Richer team collaboration | ⬜ |

---

## Known limits

**Browsing does not paginate server-side yet.** The repository subscribes to
whole collections with `onSnapshot` and filters in the browser. This is correct
and cheap into the low thousands of items per workspace, and wrong above that —
both for cost and for first-paint time. The indexes needed for
`where`/`orderBy`/`startAfter` pagination are already deployed
(`firestore.indexes.json`), and `src/search.js` isolates the query logic behind
one function, so the change is contained. **Do not onboard a customer with tens
of thousands of items before this is done.**

**Global text search cannot move to Firestore queries.** Firestore has no
free-text search. Today's client-side search is exact about that trade-off: it
works because the whole collection is already loaded. When pagination lands,
search needs an index service. Plan for it; do not discover it.

**Counters can drift.** Trigger-maintained counters can miss a write if a
trigger fails. `recalculateUsage` and `reconcileMedia` are the repair path.
Consider running the media reconciler on a schedule once real traffic exists.

---

## Before you accept the first payment

1. Complete `DEPLOYMENT.md` §6 and test the full billing chain in the
   provider's test mode, including a replayed webhook.
2. Enable App Check (§5), starting in monitor mode.
3. Add Storage rules tests (`SECURITY.md` gap #2).
4. Create the backup bucket and schedule exports (§10).
5. Run the local→cloud migration against a real bucket with a throwaway
   account, on two devices, and confirm every image appears on the second one.
6. Fill an account exactly to the free-plan item limit, then call
   `createItem` directly from the console with a patched frontend — the backend
   must still refuse.
7. Decide and publish: prices, refund policy, retention period, and a security
   contact.

## What is genuinely solid today

Multi-tenant isolation, role enforcement, entitlement forgery resistance, media
ownership under duplication, SKU concurrency, XSS resistance, valuation and
quantity correctness, and boot resilience — all covered by 89 automated
assertions that run in about a minute (`npm test`).

## What is not

Anything touching money, anything requiring a deployed project, and every P1
feature marked ⬜ above. The gap between "the security model is proven" and
"ready to onboard paying customers" is billing, App Check, Storage-rule tests,
and one real end-to-end run against a live project.
