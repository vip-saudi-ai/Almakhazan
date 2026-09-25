# Testing

What is covered, how to run it, and what is deliberately not automated.

## Running everything

```bash
npm install
npm run test:unit                  # pure logic — no browser, no emulator
npx http-server -p 8123 -c-1 &     # the browser suites need the app served
npm run test:browser
npm run test:rules                 # Firestore rules, in the emulator
npm run audit:i18n                 # translation key parity and hard-coded text
```

`npm test` runs the unit and rules suites. The browser suites are separate
because they need a server and a Chromium; `PLAYWRIGHT_BROWSERS_PATH` is
already set in this environment.

## What each suite proves

### Unit — `tests/unit/*.test.mjs`, 125 checks

| File | Proves |
|---|---|
| `entitlements.test.mjs` | the launch prices and limits are exactly the approved ones; annual is ten months; every plan records its `priceVersion`; Enterprise says *حدود مخصصة*, never "unlimited"; every gate blocks exactly at its limit; a cancelled subscription drops to free **without deleting anything**; the generated plan copies cannot drift from `shared/plans.json` |
| `assistant.test.mjs` | the health weights are the published ones and total 1; each signal moves the score by exactly its weight; cleanup tasks are ordered by the points they add; duplicates group by barcode, then SKU, then name within a category, with Arabic spelling folded; a record is reported once; **nothing is merged**; every Ask NAZM intent, including the ones it must refuse to guess at |
| `qr.test.mjs` | five matrices match segno module for module; the format information matches the published table; mode selection; no case folding; finder, timing and dark modules |
| `money.test.mjs` | the rule that cannot be got wrong: three currencies produce three totals, the combined figure (250,000) is produced by no total and stated in no answer, a threshold question with several currencies present asks which instead of comparing riyals to dollars, and naming the currency resolves it |
| `query.test.mjs` | a query describes itself well enough for a runner to decide what it needs: which parts an index could serve, which need the records, and free-text search named as the one no index answers |
| `import.test.mjs` | the mapping guess matches Arabic and English headers with spelling folded and never claims one column twice; an unrecognised header is left unmapped rather than guessed; a nameless row is skipped and reported; a bad quantity, price or condition is reported rather than coerced; an existing taxonomy is reused and a new one is only collected; and the CSV reader handles quotes, semicolons, tabs and a byte order mark |

### Browser — `tests/browser/*.test.mjs`, 441 checks

| File | Proves |
|---|---|
| `gate.test.mjs` | the welcome gate never appears in device-only or demo mode; Apple, Google and email sign-in; verification; three-step onboarding creating the workspace through the backend; the five plans at the NAZM prices, monthly and annual; the assistant carries no other name |
| `quota.test.mjs` | the 70 / 90 / 100 warnings; the ceiling opens the plans sheet instead of the form, while editing still works; the subscription card; choosing a plan never activates it client-side; device-only mode is never blocked |
| `suggest.test.mjs` | photo auto-fill; **nothing is written until the customer taps**; a typed name is never second-guessed; no credit is spent when none is available; a failed reading leaves the form and the photo intact; an accepted estimate stays attributed to the assistant |
| `assistant.test.mjs` | the score shown is the score computed; **answering a question makes no backend call** (the test watches the network); duplicates change no record; a cleanup task opens the inventory filtered to it |
| `labels.test.mjs` | the drawn QR is the encoded QR module for module; the quiet zone survives; the thermal finish has no colour left; scanning is offered without `BarcodeDetector` (the self-hosted decoder), and a device with no camera is told so inside the scanner with Choose Photo still there |
| `a11y.test.mjs` | every visible control has an accessible name; zoom is not blocked; focus stays visible; small controls are 44 points to a thumb in both directions, by their own box or an extended hit area; dark mode swaps the whole surface set and no light-on-light surface survives it; reduced motion collapses the durations at the token level |
| `restore.test.mjs` | the property is not "restore works" but "restore cannot lose an inventory": a failed safety backup aborts everything and touches nothing; an interruption partway leaves a superset, never an empty workspace; only the records the backup omits are removed |
| `bulk.test.mjs` | selection is a plan gate that explains itself instead of a dead button; a tap picks instead of opens while selection is on; a move, an edit and an export carry the whole selection; a bulk edit cannot reach a field outside its allow-list; a bulk delete goes to Trash and comes back; an emptied page still offers the way out of selection mode |
| `window.test.mjs` | the property is not "pagination works" but "nothing states a total it does not have": opening a 600-record workspace loads 200; the screen says so and shows the server's count, not a count of what it holds; proportions and folder counts stay blank rather than wrong; a search finds a record outside the window because it loads the inventory first; an export throws `repo/partial`; "delete everything" deletes everything; a restore's safety backup holds all 600 |
| `team.test.mjs` | the four places a friendly team screen would lie: it never claims an email was sent (no mail provider exists, so the link is handed over instead); it never offers a control Security Rules refuse — the owner's role, your own role, removing yourself; it never offers a seat the plan does not have; and it never shows an invite link twice, because only its hash was stored. Plus roles, revoking, workspace switching, and device-only mode offering none of it |
| `import.test.mjs` | one CSV carrying every mess a real export has — a semicolon separator, a blank row, a nameless row, Arabic-Indic digits, a quantity written as a word, a condition that is not one of ours, a quoted comma, two taxonomy names that do not exist — and the property that nothing is invented to make it look clean: every unreadable cell is named with its row number *in the file*, the new categories are declared before they are created, a file larger than the plan is refused before a single write, and a real `.xlsx` (shared strings, dates, gaps, entities) reads back correctly |
| `viewer.test.mjs` | an image is a button that says it opens; the viewer is dark in *both* themes, opens at fit, contains rather than crops, and zooms toward the pointer rather than the centre; arrows move in the direction the gallery runs in RTL; Escape closes the viewer and not the sheet beneath it; focus returns to the image that opened it; an unsaved image opens too; and clearing the controls never clears the way out |
| `responsive.test.mjs` | twelve viewports — 320, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920, a landscape phone and the 195px that browser zoom at 200% leaves of a phone — each asserting no horizontal overflow, a grid column count inside the range that class should produce, navigation as a bar or a rail as intended, and that no control has left the screen |
| `sku-race.test.mjs` | the property is not "the form warns about a duplicate SKU" but "two tabs cannot both commit one": create against create, edit against edit, restore against create and import against a manual save, each raced from two tabs past every precheck, with exactly one winner; a duplicate inside one batch is refused, a swap in one batch is allowed, a trashed record's SKU can be reused, an `ifAbsent`-skipped record reserves nothing, and the quota check and the SKU check share one transaction |
| `i18n.test.mjs` | Arabic by default, English persisted across a reload, `lang`/`dir` switched at run time; no Arabic left on the main screens, the form, the detail, the plans, the import and the gate in English (customer text aside); prices unchanged; a switch loses nothing — a half-filled form, the import mapping, the search and its results, a selection, an open detail; one SKU conflict code with the right message in each language; nothing stored changes; the Settings and gate switches are keyboard-operable radio groups; no overflow at 320 / 390 / 430 / tablet / desktop in either direction |
| `mobile.test.mjs` | the phone, 125 checks. **Keyboard:** a VisualViewport shrink is the keyboard only while an editable field has focus and the page is not pinch-zoomed; zoom, a focused select or button, and a field losing focus all leave it closed; the focused field is kept above it. **Shell:** `.app` is the only viewport-fixed layer and the tab bar and selection bar sit inside it, the selection bar exactly on the tab bar; the desktop rail is unchanged. **Landscape:** with a 47px notch overridden through CDP, the tab bar, list, header, viewer controls and language gate clear it on both sides in both languages, and the bottom inset is applied once. **Scanner** (this Chromium has no `BarcodeDetector` — Safari's situation): a fake camera playing a QR is read live through the self-hosted ZXing and fills the field; the decoder is not loaded at startup and is fetched once, from this origin; Cancel, Escape, the app going to the background and `pagehide` each stop the camera; denied, missing and busy cameras say so and keep Choose Photo and Enter manually; a photo of a QR and of an EAN-13 are read, a photo with no code says so; an unreachable decoder is named as such, in Arabic. **Fields and targets** on eleven screens in both languages: every field ≥16px, every control ≥44×44, no two hit areas overlap, the last list row scrolls clear of the tab bar. **Layers:** the shell is inert under a sheet, a sheet under a confirmation; identifiers copy. **Installed app:** manifest, icon sizes, `apple-touch-icon` 180×180, status bar style, the service worker takes control (`?sw-test`), the cache holds only this origin's static files, the decoder is cached, an offline reload opens the app, and an update never reloads over an open form |
| `language-gate.test.mjs` | the language gate is the first frame of every launch with nothing of the app under it, waits for a choice, and highlights (never skips to) the last one; a new cloud visitor meets it before the welcome screen; keyboard, headings, real buttons, both themes, 320 → desktop; switching later never reopens it; a filter draft survives a switch unapplied; an open confirmation is redrawn in the new language without resolving, its phrase fixed; human text is `dir="auto"`, identifiers stay left to right, mixed text is stored as typed |

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
the behaviours it works around are WebKit's. `mobile.test.mjs` checks the
logic and layout the phone depends on, but Chromium is not Safari: its
keyboard, toolbar, status bar and camera prompt are not WebKit's. Before a
release, on a real iPhone (current iOS, Safari and Home Screen app), portrait
and landscape, Arabic and English:

- **Keyboard:** focus the search, the item name, the SKU and the quantity; the
  field stays visible above the keyboard, the tab bar does not ride up with
  it, and after closing the keyboard nothing is left shifted. Pinch-zoom the
  list: the layout must not jump as if a keyboard opened.
- **Fields:** no field zooms the page when focused.
- **Safe areas:** in landscape nothing sits under the notch or the Dynamic
  Island; the tab bar clears the home indicator; the image viewer's controls
  and the language gate are reachable.
- **Scanner:** the camera prompt appears once; a QR and an EAN-13 are read
  live; deny the camera and check the message and Choose Photo; choose a photo
  from the library; background the app mid-scan — the camera light goes off.
- **Installed app:** Add to Home Screen; the icon, the name نَظْم and the
  status bar look right in light and dark; open it offline; deploy a new
  version and check "Update available" never reloads over an open form.
- **Images:** camera capture, gallery pick, save, reopen after a reload.

## What is not covered

| Gap | Why it matters |
|---|---|
| Storage rules have no emulator tests | the Firestore rules do; Storage is reviewed but unproven |
| The billing webhook is tested against no live provider | no provider is connected yet (BILLING.md) |
| The local-to-cloud image migration is reviewed, not run against a real bucket | it rewrites references; a bug loses photos |
| App Check is not enabled | `enforceAppCheck: false` until a site key exists |
| `recovery.test.mjs` stops at its continue-later step (`L3`) with "execution context was destroyed" although the page does not navigate | pre-existing — identical on the commit before the mobile pass; the steps before it pass |
| No load test | server-side pagination lands first; testing the current shape would only measure a design that is being replaced |

## Adding a test

Put pure logic in `tests/unit/` — it runs in a second and needs nothing.
Reach for a browser test when the thing being proved is a behaviour a customer
would notice: what a screen says, what a tap writes, whether a request goes
out. Assert the outcome, not the implementation: `A9` passes because no
network call happened, not because a particular function was not called.
