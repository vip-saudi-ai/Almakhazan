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
| 18 | App Check | 🟡 **[YOU]** | client and backend both wired; enforcement is one environment variable read by every callable, and the debug token is honoured on localhost only. Needs a site key — `DEPLOYMENT.md` §5 |
| 19 | v7 → v8 migration, idempotent and resumable | 🟡 | `src/migration.js` — backs up first, checkpoints per item, verifies counts. Logic reviewed; **not run against production data** |
| 20 | Restore integrity for large datasets | ✅ | Staged: a verified safety backup, then the incoming records, then only the removals the backup implies. A failed backup aborts everything; an interruption leaves a superset, never an empty workspace — `tests/browser/restore.test.mjs` R1–R14 breaks the run at each point |
| 21 | SKU uniqueness under concurrency | ✅ | workspace counter transaction; rules permit only `+1`, verified in the isolation suite |
| 22 | Soft delete / Trash | ✅ | browser suite: delete → trash → restore |
| 23 | Audit log, append-only | ✅ | rules deny update and delete on `activityLogs` |

## P1 — strong launch requirements

| # | Item | Status | Note |
|---|---|---|---|
| 24 | Usage counters without full-collection reads | ✅ | trigger-maintained; `recalculateUsage` for repair |
| 25 | Plan/usage screen in Settings | ✅ | plan, record count, storage, assistant and seats, laid out as the UI reference has it — `tests/browser/quota.test.mjs` Q12–Q14c |
| 26 | Upgrade prompt on hitting a limit | ✅ | 70 / 90 / 100 warnings, and the ceiling opens the plans sheet with the reason — Q3–Q10 |
| 27 | Onboarding flow (signup → verify → workspace → use case) | ✅ | welcome, Apple/Google/email, verification, three steps — `tests/browser/gate.test.mjs` G1–G20 |
| 28 | Invitations | 🟡 | backend complete (hashed single-use token, expiry, seat check) and the UI is built: members, roles, revoking, and the invite link handed to the admin to send — `team.test.mjs` T1–T21. **Still no email delivery**, which the screen states rather than fakes |
| 28b | Workspace switching | ✅ | every workspace the account belongs to, with its role; choosing one reopens the session rather than swapping collections under a rendered inventory — `team.test.mjs` T22–T24 |
| 29 | Barcode / QR scanning | 🟡 | `BarcodeDetector` where the platform has it, and a clear refusal where it does not — `labels.test.mjs` L9–L10. Not yet exercised on a real camera |
| 30 | QR labels | ✅ | dependency-free encoder, colour and thermal finishes, print stylesheet — `qr.test.mjs`, `labels.test.mjs`, and a decode round trip via `tools/verify-qr.py` |
| 31 | Bulk actions | ✅ | select, move, edit, export, delete — plan-gated, allow-listed, reversible — `bulk.test.mjs` B1–B13 |
| 31b | Assistant tab: اسأل نَظْم | ✅ | answered on the device; a test watches the network and fails on any backend call — `assistant.test.mjs` A5–A9 |
| 31c | Inventory health score | ✅ | deterministic, published weights — `assistant.test.mjs` A1–A4, `assistant.test.mjs` (unit) |
| 31d | Duplicate detection | ✅ | grouped and explained, never merged — A10–A13 |
| 31e | Guided cleanup | ✅ | ordered by the points each task adds — A14–A15 |
| 31f | Smart photo capture and review | ✅ | camera-first, suggestions applied only on a tap — `suggest.test.mjs` |
| 32 | CSV / XLSX import with column mapping | ⬜ | JSON import is complete and validated; spreadsheet import is not implemented |
| 33 | Excel export with typed cells | ✅ | dependency-free writer; verified by reading the output back with a real spreadsheet library |
| 34 | Global search across folders, Arabic-normalised | ✅ | browser suite |
| 34b | Browsing bounded to a window, not the collection | 🟡 | a live window of the newest 200, the rest by cursor pages on demand, and `repo/partial` rather than an answer from a fraction — `window.test.mjs` W1–W22 against the device backend. **The Firestore cursor query itself has not been run against a deployed project** |
| 35 | English / i18n | ⬜ | strings are still inline Arabic; no i18n layer |
| 36 | PWA (manifest, icons, service worker) | 🟡 | all three exist; the service worker caches only the static shell and never authenticated data. Installability not verified on a device |
| 37 | Landing / marketing page | 🟡 | the public welcome and pricing screens are built and tested; a separate marketing site is not |
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

**Global text search has no server-side answer.** Firestore has no free-text
search, so searching loads the inventory once and runs on the device. The app
is exact about this: the search waits for the load and says so while it
happens. For a workspace with tens of thousands of records that is one
expensive read per session in which someone searches. A search index is the
fix and it is not built. **This, not browsing, is now the reason to think
twice before onboarding a customer with tens of thousands of items.**

**Two home-screen aggregates are blank on a large workspace.** "% documented"
and total quantity are proportions of the whole inventory, and the trigger
keeps only the record count, so they stay blank until the inventory loads.
Extending `functions/src/usage.js` to maintain them would close the gap.

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
quantity correctness, and boot resilience. On top of those: the public gate and
onboarding, the commercial surfaces and their limits, photo auto-fill and the
rule that nothing it suggests is written unasked, the assistant tab and the
promise that answering a question costs nothing and sends nothing, and the QR
encoder — verified both against an independent implementation and by decoding
its output with a third-party decoder.

167 automated checks: 72 unit, 95 browser, plus the rules suite in the
emulator. `TESTING.md` says what each one proves.

## What is not

Anything touching money, anything requiring a deployed project, and every item
still marked ⬜ above. The gap between "the security model is proven" and
"ready to onboard paying customers" is four things: a billing provider,
App Check, Storage-rule tests, and one real end-to-end run against a live
project.

Separately, and independent of billing: **a search index**. Browsing a large
workspace is now bounded (a 200-record window, `window.test.mjs`), so the
Business plan is no longer gated on that. Searching one is not bounded — it
loads the inventory. See `COSTS.md`.
