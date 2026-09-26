# Architecture

Almakhzan is a mobile-first inventory application with a Firebase backend. The
browser holds no secrets and no authority: it renders, and it asks. Every
decision that money or privacy depends on is made server-side.

## Shape

```
browser (ES modules, no framework, no build step)
   │
   ├── Firestore ──── per-document reads/writes, guarded by firestore.rules
   ├── Storage ────── image objects, guarded by storage.rules
   └── Callables ──── Cloud Functions for anything the client must not decide
                        AI, billing, invitations, workspace lifecycle
```

There is no bundler in production. `index.html` loads `src/app.js` as a module
and the browser resolves the graph. `tools/build-single-file.mjs` produces a
**local demo** build only — see “Two builds” below.

## Directory map

```
index.html                 app shell, CSP, no inline handlers
styles/main.css            all styling
src/
  app.js                   deterministic boot, wiring
  config.js                Firebase config, app constants
  firebase.js              time-boxed SDK bootstrap; explicit status
  auth.js                  sign-in, session, workspace resolution
  repository.js            data facade: Firestore or IndexedDB behind one API
  local-store.js           IndexedDB + UI preferences
  media.js                 media assets and reference counting
  storage.js               image decode/resize/upload pipeline
  device-upload.js         local → cloud migration, including image bytes
  migration.js             v7 → v8 migration
  entitlements.js          the single plan/limit decision layer
  plans.generated.js       generated from shared/plans.json
  ai.js                    callable wrapper + stale-analysis detection
  search.js                Arabic-aware query, filter, sort, pagination
  validation.js            normalization and validation of everything inbound
  exporting.js             Excel / JSON export, import merge & restore
  xlsx-writer.js           dependency-free XLSX writer
  ui.js, navigation.js     sheets, dialogs, focus, tabs
  views/                   home, detail, item-form, overview, manage
functions/
  index.js                 exports
  src/lib.js               admin init, authorization, server entitlements
  src/ai.js                analyzeInventoryItem, aiHealth
  src/usage.js             usage counters (triggers) + status callable
  src/media.js             orphan sweeper, reference reconciler
  src/workspaces.js        onboarding, invitations, deletion
  src/billing.js           provider abstraction + webhook
  plans.json               generated from shared/plans.json
shared/plans.json          canonical plan/limit/price configuration
firestore.rules            multi-tenant authorization
storage.rules              media authorization
tests/rules/               emulator tests (isolation, media)
tests/unit/                pure-logic tests (entitlements)
```

## Data model

```
users/{userId}                                  defaultWorkspaceId, workspaceIds
customers/{userId}                              provider customer id         (backend-only)
subscriptions/{subscriptionId}                  plan, status, period         (backend-only)
billingEvents/{eventId}                         webhook idempotency ledger   (backend-only)
invitations/{inviteId}                          hashed token, role, expiry

workspaces/{workspaceId}                        name, ownerId, plan, readOnly
  members/{userId}                              role
  items/{itemId}                                one document per item
  folders/{folderId}
  categories/{categoryId}
  locations/{locationId}
  media/{mediaId}                               owns a Storage object, refCount
  usage/current                                 counters                     (backend-only)
  counters/sku                                  monotonic sequence
  settings/{document}                           locale, currency, timezone
  activityLogs/{logId}                          append-only audit
  aiUsage/{logId}                               per-call AI record           (backend-only)
```

Storage:

```
workspaces/{workspaceId}/items/{itemId}/original/{mediaId}.{ext}
workspaces/{workspaceId}/items/{itemId}/thumbnails/{mediaId}.jpg
```

## Four invariants worth stating plainly

**Tenancy is derived, never supplied.** A `workspaceId` in a request is only a
lookup key. Both Firestore and Storage rules resolve
`workspaces/{id}/members/{uid}` before permitting anything, so changing the id
in DevTools reaches a different membership check, not different data.
`tests/rules/isolation.test.mjs` proves this with two real accounts.

**Entitlements come from backend state.** `plan`, `subscriptionId`, `readOnly`
and usage counters are unwritable by any client at any role. The only writer is
the billing webhook, which verifies a signature and claims each event id before
applying it. A successful checkout redirect grants nothing.

**Live SKUs are unique at commit time.** On the device, every write that
touches items — create, update, restore, batch, atomic batch — validates the
final SKU of each affected record inside the same IndexedDB transaction that
writes it (`assertLiveSkusInStore` in `src/repository.js`). The index stays
non-unique because trashed records keep their SKUs. The screen's precheck is UX
only. In the cloud, the recommended equivalent is a `skuClaims/{hash}`
document written in the same Firestore transaction (see
PRODUCTION-CHECKLIST.md).

**Files are owned by media assets, not by items.** An item holds a `mediaId`.
Duplicating an item raises that asset's reference count; removing an image or
purging an item lowers it. Bytes are deleted only by the backend sweeper, only
at zero, and only after re-verifying against the items collection.
`tests/rules/media-refcount.test.mjs` walks the duplicate-then-delete case.

## Language

Arabic (`ar`, RTL, the default) and English (`en`, LTR). `src/i18n.js` holds
the current language, `t(key, params)`, `pick({ar, en})`, and the `Intl`
number/date/relative formatters; the messages live in `src/locales/*.js`, one
entry per key with both languages side by side, plural forms chosen by
`Intl.PluralRules`. Static markup declares its text with `data-i18n` and
`data-i18n-attr`; `data-i18n-js` marks a placeholder its view overwrites.

Language is presentation. Nothing stored changes with it: conditions, units and
seeded categories are stored as stable values and labelled by `src/labels.js`;
activity entries keep facts (counts, file names), never sentences; errors carry
a code and a message key, translated when shown (`describeError`). A switch
calls every `onLanguageChange` listener, and each view redraws from the state
it already holds — no reload, no refetch, no lost input. The early `lang`/`dir`
is set by `src/boot-guard.js`, since the CSP forbids inline scripts.

`npm run audit:i18n` checks key parity, plural completeness and placeholders,
and classifies every line of Arabic outside the catalogue.

## Entitlements

`shared/plans.json` is the only place limits and prices are written.
`npm run sync:plans` regenerates `src/plans.generated.js` and
`functions/plans.json`; a unit test fails if either drifts.

Enforcement is two-layer and deliberately asymmetric:

- `src/entitlements.js` shapes the *experience* — it stops a user beginning
  work they cannot finish, and explains why in their language.
- `functions/src/lib.js#assertWithinLimits` is the *enforcement*. A modified
  frontend changes nothing: item creation, uploads, invitations and AI all pass
  through it.

A downgrade never deletes. `overagesFor()` reports which dimensions are over
the new limit so the UI can explain the restriction; existing records stay
readable.

## Boot sequence

```
language gate             → العربية | English   (every launch; nothing else is shown)
  initializeFirebase()    → started in the background while the gate waits
setLanguage(choice)       → lang, dir, title, static text
initializeAuthentication()→ session (or signed-out)
loadApplicationData()     → repository.start(cloud | local)
initializeUI()            → home, or the welcome screen for a new cloud visitor
```

The language gate (`#lang-gate` in index.html) is the first screen of every
launch. It is static markup handled by the classic `src/boot-guard.js`, so it
paints on the first frame and a choice works even before the modules load;
`html.lang-pending` keeps the app shell, boot overlay and welcome screen out of
sight (and out of the accessibility tree) until then. The stored choice
(`nazm.language`) is only highlighted, never used to skip the gate. Nothing
that speaks to the customer — the welcome screen, a restore warning, the
upload offer, an error — is shown before the choice, so all of it appears in
the chosen language. Switching later in Settings never brings the gate back.

Every step is time-boxed. A slow CDN, a captive portal or an origin where
Firebase cannot run (`file://`) resolves to local mode rather than a spinner
that never stops. `src/boot-guard.js` is a classic script that reports a boot
failure in plain language if module code never runs at all.

## Cost posture

Subscriptions are meant to be cheap, so the backend is built not to be:

- usage counters are maintained by triggers, never by counting a collection;
- thumbnails are generated once at upload and served immutable with a long
  cache header;
- a duplicated item shares bytes rather than copying them;
- AI is metered per workspace per month and rate-limited per user;
- the demo build performs no cloud reads at all.

Browsing works the same way. The repository does **not** subscribe to the
whole `items` collection: it holds a live window of the newest
`ITEM_WINDOW` (200) records, which is what the first screen costs. The rest of
the inventory is fetched once, by cursor pages ordered by document id, and
only when something actually needs all of it — a search, a filter, a total, a
score, an export, a restore.

The rule that keeps this honest is `repository.itemsComplete`. Anything that
makes a statement about the whole inventory either waits for it
(`withFullInventory` in `src/inventory-load.js`) or refuses
(`assertItemsComplete`, which throws `repo/partial`). Nothing computes a
percentage, a count or a "not found" from a window and presents it as a fact:
the home screen shows the server's record count and leaves its proportions
blank until the inventory is whole, and folder cards carry no number at all
until they can carry the right one.

Completeness is recomputed, never latched. A window that comes back shorter
than its limit proves it; a full scan proves it; and the server's own record
counter overrules both, so records added from another device after a scan put
the app back into a window rather than into a confident lie.

Free-text search still has no server-side answer — Firestore has none — so a
search loads the inventory and runs locally. That is a deliberate trade, not
an oversight: see `PRODUCTION-CHECKLIST.md` → “Known limits”.

## Release configuration and the platform

- **`nazm.config.js`** (classic script, loaded first) is the one file a
  deployment edits: environment, feature flags, auth providers, the Firebase
  project and SDK location, App Check, contact details. `src/environment.js`
  reads it once into a frozen `ENV`; a missing or malformed value can only
  switch something off.
- **`src/features.js`** answers two questions for every view:
  `isFeatureEnabled(name)` (part of this release?) and
  `isFeatureAvailable(name)` (usable now: enabled, and the cloud up when it
  needs it). `isAuthProviderAvailable()` decides sign-in buttons. Static
  markup is tagged `data-feature="…"` and hidden by `applyFeatureVisibility()`.
  Hidden UI is never access control.
- **`src/platform.js`** is the only place that knows whether the app runs in a
  browser or the native container (`window.NazmNative`, installed by the iOS
  host — IOS-RELEASE.md §3): external URLs, file export through the share
  sheet, Open Settings, printing, status bar, native sign-in, and whether a
  service worker is used.
- **`src/billing.js`** hands purchases to the store; **`src/account.js`**
  holds every account and data lifecycle operation (erase this device, delete
  the account, leave / transfer / delete a workspace); **`src/ai-consent.js`**
  gates every external AI request. The backend side of account deletion is
  `functions/src/account.js`.
- Legal documents live in `src/locales/legal-documents.js` (both languages,
  section by section) and open in `src/views/legal.js`.

## The phone

Four rules, each with one owner:

- **One shell owns the screen.** `.app` is the only viewport-fixed layer
  (`inset: 0`); the tab bar and the selection bar are positioned inside it,
  so the browser's toolbar and the keyboard move one box, not three. Safe
  areas come from `--sat/--sab/--sal/--sar` (tokens over `env()`); the side
  insets are `max(gutter, inset)` on physical left and right, the bottom inset
  is applied once, by the tab bar.
- **The keyboard is a focused field, not a smaller viewport**
  (`src/viewport.js`). A VisualViewport shrink counts only while an editable
  element has focus and the page is at scale 1; otherwise it is pinch-zoom or
  the toolbar. It sets `--kb` and `body.kb-open`, and keeps the focused field
  in view once the keyboard has settled.
- **Lifecycle** (`src/lifecycle.js`): `onBackground` (hidden, `pagehide`) and
  `onResume` (`pageshow` from the back-forward cache). The camera stops and
  image gestures reset on background; the viewport re-measures on resume.
- **The service worker is an optimisation** (`sw.js`, `src/pwa.js`). It
  caches this origin's static files only — never Firestore, Storage,
  Functions, auth, blobs or anything with a query string — network-first,
  with the cache as the offline answer. A new version waits; "Update
  available" activates it only when `safeToReload()` finds nothing half done
  (a sheet, a confirmation, the viewer, an import or restore running).

**The scanner** (`src/scanner.js`, `src/views/scan.js`) uses the native
`BarcodeDetector` where it supports the formats, and otherwise ZXing
(`@zxing/library`, Apache-2.0), self-hosted at `public/vendor/zxing/` by
`tools/vendor-zxing.mjs`, loaded only when scanning starts, and inlined as
text into the demo build. The live loop decodes a throttled centre region;
1D codes must read the same twice. Choose Photo and Enter manually are always
offered, and every way out stops the camera.

## Two builds

| | Production | Demo |
|---|---|---|
| Entry | `index.html` + `src/` | `dist/nazm.html` |
| Built by | nothing — served as-is | `npm run build:demo` |
| Firebase | loads normally over HTTPS | stubbed out; no cloud, no auth, no AI |
| Storage | Firestore + Cloud Storage | IndexedDB only |
| Purpose | the product | opening from a file to look at the UI |

The demo build replaces the Firebase dynamic imports with a rejecting stub so
it can run as a classic script from `file://`. **It is not the product and must
never be deployed.** `firebase.json` serves the repository root and excludes
`dist/`.
