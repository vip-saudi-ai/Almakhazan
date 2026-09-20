# Testing

What is covered, how to run it, and what is deliberately not automated.

## Running everything

```bash
npm install
npm run test:unit                  # pure logic — no browser, no emulator
npx http-server -p 8123 -c-1 &     # the browser suites need the app served
npm run test:browser
npm run test:rules                 # Firestore rules, in the emulator
```

`npm test` runs the unit and rules suites. The browser suites are separate
because they need a server and a Chromium; `PLAYWRIGHT_BROWSERS_PATH` is
already set in this environment.

## What each suite proves

### Unit — `tests/unit/*.test.mjs`, 72 checks

| File | Proves |
|---|---|
| `entitlements.test.mjs` | the launch prices and limits are exactly the approved ones; annual is ten months; every plan records its `priceVersion`; Enterprise says *حدود مخصصة*, never "unlimited"; every gate blocks exactly at its limit; a cancelled subscription drops to free **without deleting anything**; the generated plan copies cannot drift from `shared/plans.json` |
| `assistant.test.mjs` | the health weights are the published ones and total 1; each signal moves the score by exactly its weight; cleanup tasks are ordered by the points they add; duplicates group by barcode, then SKU, then name within a category, with Arabic spelling folded; a record is reported once; **nothing is merged**; every Ask NAZM intent, including the ones it must refuse to guess at |
| `qr.test.mjs` | five matrices match segno module for module; the format information matches the published table; mode selection; no case folding; finder, timing and dark modules |

### Browser — `tests/browser/*.test.mjs`, 184 checks

| File | Proves |
|---|---|
| `gate.test.mjs` | the welcome gate never appears in device-only or demo mode; Apple, Google and email sign-in; verification; three-step onboarding creating the workspace through the backend; the five plans at the NAZM prices, monthly and annual; the assistant carries no other name |
| `quota.test.mjs` | the 70 / 90 / 100 warnings; the ceiling opens the plans sheet instead of the form, while editing still works; the subscription card; choosing a plan never activates it client-side; device-only mode is never blocked |
| `suggest.test.mjs` | photo auto-fill; **nothing is written until the customer taps**; a typed name is never second-guessed; no credit is spent when none is available; a failed reading leaves the form and the photo intact; an accepted estimate stays attributed to the assistant |
| `assistant.test.mjs` | the score shown is the score computed; **answering a question makes no backend call** (the test watches the network); duplicates change no record; a cleanup task opens the inventory filtered to it |
| `labels.test.mjs` | the drawn QR is the encoded QR module for module; the quiet zone survives; the thermal finish has no colour left; scanning support is read from the platform, not assumed |
| `a11y.test.mjs` | every visible control has an accessible name; zoom is not blocked; focus stays visible; small controls carry an extended hit area; dark mode swaps the whole surface set and no light-on-light surface survives it; reduced motion collapses the durations at the token level |
| `restore.test.mjs` | the property is not "restore works" but "restore cannot lose an inventory": a failed safety backup aborts everything and touches nothing; an interruption partway leaves a superset, never an empty workspace; only the records the backup omits are removed |
| `bulk.test.mjs` | selection is a plan gate that explains itself instead of a dead button; a tap picks instead of opens while selection is on; a move, an edit and an export carry the whole selection; a bulk edit cannot reach a field outside its allow-list; a bulk delete goes to Trash and comes back; an emptied page still offers the way out of selection mode |
| `window.test.mjs` | the property is not "pagination works" but "nothing states a total it does not have": opening a 600-record workspace loads 200; the screen says so and shows the server's count, not a count of what it holds; proportions and folder counts stay blank rather than wrong; a search finds a record outside the window because it loads the inventory first; an export throws `repo/partial`; "delete everything" deletes everything; a restore's safety backup holds all 600 |
| `team.test.mjs` | the four places a friendly team screen would lie: it never claims an email was sent (no mail provider exists, so the link is handed over instead); it never offers a control Security Rules refuse — the owner's role, your own role, removing yourself; it never offers a seat the plan does not have; and it never shows an invite link twice, because only its hash was stored. Plus roles, revoking, workspace switching, and device-only mode offering none of it |

### Rules — `tests/rules/*.test.mjs`, in the emulator

Two unrelated accounts, and every cross-workspace read and write refused:
items, media, folders, categories, locations, activity, members, billing.
Roles enforced server-side. Entitlement fields unwritable by any client. The
record limit enforced **in the rules**, so a browser that lies about its plan
still cannot create record 51. Media reference counting through
duplicate → delete → purge. SKU counter monotonicity.

## Verified by hand, on purpose

### The QR encoder

`node tools/verify-qr.mjs && python3 tools/verify-qr.py` encodes every shape of
payload the product prints — Arabic, a URL, digits, a SKU with a separator —
and decodes them back with OpenCV. Nine of nine at the last run.

It is not in CI because it needs `opencv-python-headless`. It is the test that
matters most for labels: matching another encoder proves conformance, but
decoding with somebody else's decoder proves the label scans.

### The demo build

`npm run build:demo` then open `dist/nazm.html` from the filesystem. It must
boot with no server, no network and no modules — the bundle is a classic
script because iOS Quick Look will not run `type="module"`.

### iPhone

The image pipeline (HEIC transcoding, the camera's empty MIME type,
ArrayBuffers in IndexedDB) is exercised by `suggest.test.mjs` in Chromium, but
the behaviours it works around are WebKit's. Re-check on a real iPhone before
a release: camera capture, gallery pick, save, reopen after a reload.

## What is not covered

| Gap | Why it matters |
|---|---|
| Storage rules have no emulator tests | the Firestore rules do; Storage is reviewed but unproven |
| The billing webhook is tested against no live provider | no provider is connected yet (BILLING.md) |
| The local-to-cloud image migration is reviewed, not run against a real bucket | it rewrites references; a bug loses photos |
| App Check is not enabled | `enforceAppCheck: false` until a site key exists |
| No load test | server-side pagination lands first; testing the current shape would only measure a design that is being replaced |

## Adding a test

Put pure logic in `tests/unit/` — it runs in a second and needs nothing.
Reach for a browser test when the thing being proved is a behaviour a customer
would notice: what a screen says, what a tap writes, whether a request goes
out. Assert the outcome, not the implementation: `A9` passes because no
network call happened, not because a particular function was not called.
