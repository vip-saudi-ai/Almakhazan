# NAZM 1.0.0 — iOS release readiness

For the native (iOS) developer, the backend developer and whoever submits to
App Store Connect. **Developer documentation — never shown to customers.**

This repository is the web application and its Cloud Functions. It is not an
iOS app by itself: an HTML page cannot be submitted to the App Store. The app
is packaged in a native container (Capacitor is assumed below); everything the
container must provide is described here, and the web code already talks to it
through one adapter (`src/platform.js`) instead of assuming a browser.

Nothing in this document is marked done unless it is done in this repository.
Items that need Xcode, an Apple Developer account, App Store Connect, StoreKit,
a Firebase deployment or production credentials are listed as external work.

---

## 1. What ships in 1.0.0

`nazm.config.js` is the one file that decides the release. As shipped:

| Flag | Value | What it switches on | Before switching it on |
|---|---|---|---|
| `features.cloud` | `false` | Firebase: accounts, sync, cloud images, cloud restore, server import jobs | Production Firebase project deployed (rules, indexes, functions); App Check (§6); the Firebase SDK **bundled in the app** via `firebase.sdkBaseUrl` (no code downloaded at run time on iOS); privacy labels updated (§10) |
| `features.team` | `false` | Members, invitations, workspace switching | `cloud`; invitation delivery (mail provider) configured |
| `features.billing` | `false` | Paid plans, purchase, Restore Purchases, Manage Subscription | StoreKit connected through the bridge (§7); App Store server notifications reaching `functions/src/billing.js` |
| `features.cloudAi` | `false` | Photo analysis by an external AI provider | `cloud`; `analyzeInventoryItem` deployed with its secret; provider named in the privacy labels |
| `auth.providers.apple / google` | `false` | Sign in with Apple / Google | Both configured together (Guideline 4.8); native sign-in bridge (§5) |

With these values the app is a **complete device-only inventory**: items,
photos (HEIC included where the device decodes it), categories, locations,
folders, search and filters, barcode/QR scanning (camera and photo), CSV/XLSX
import, Excel and JSON export, JSON restore, trash, bulk actions, the on-device
assistant and data-quality score, Arabic and English. No request leaves the
device: the Firebase SDK is never fetched (verified by
`tests/browser/release.test.mjs`).

Hidden, not broken: no plan or price appears, no purchase button, no "coming
soon", no AI button, no team screen, no sign-in screen. Plan limits do not
apply on the device while nothing is sold (`LocalModePolicy.STANDALONE`,
`src/config.js`); the plan table and entitlement engine are intact for when
billing is switched on.

## 2. The native container

1. Create the Capacitor project (`npm i @capacitor/core @capacitor/ios`,
   `npx cap init`), app name **نَظْم** (Arabic) / **NAZM**, with the
   **bundle identifier chosen by Mazayda** — none is assumed here.
2. `webDir`: a copy of `index.html`, `nazm.config.js`, `manifest.webmanifest`,
   `src/`, `styles/`, `public/`. Not `sw.js` (unused in the app), not `dist/`,
   `tests/`, `tools/`, `functions/`, `node_modules/`.
3. Load `native/nazm-native-bridge.js` (bundled with its plugins) before
   `nazm.config.js`. It installs `window.NazmNative`; see §3.
4. Info.plist: `native/ios/*.lproj/InfoPlist.strings` hold the purpose
   strings (§8). `CFBundleShortVersionString` = `1.0.0` (= `APP_VERSION` in
   `src/config.js` and `package.json`); `CFBundleVersion` = your build number.
5. Supported orientations: portrait and landscape (the layout handles both,
   including the notch in landscape). Minimum iOS: choose ≥ 16.4 — the scanner,
   `inert`, `dvh` units and the VisualViewport handling are tested against
   current WebKit; confirm on the oldest device you support.
6. Status bar: the bridge's `setStatusBarStyle` is driven by the app's theme.
7. `WKWebView` settings: allow inline media playback (the scanner's video is
   `playsinline`) and camera capture for `getUserMedia`
   (`WKUIDelegate` media capture permission → grant for the app's own origin).

## 3. The platform bridge (`window.NazmNative`)

| Method | Used for | Without it |
|---|---|---|
| `platform`, `appVersion`, `buildNumber` | Settings → About; problem reports | web values |
| `openUrl(url)` | Support links, mail, enterprise contact | `window.open` (web only) |
| `shareFile({ filename, mimeType, base64 })` | Excel/JSON export, restore safety backup | exports refuse with a message (a WKWebView cannot follow a blob download) |
| `openSettings()` | "Open Settings" after the camera was refused | button hidden; the message says where |
| `print()` | QR labels | label buttons hidden in the native app |
| `setStatusBarStyle(theme)` | status bar follows light/dark | — |
| `signIn(provider)` | Apple / Google in the app | those providers hidden in the app |
| `purchase`, `restorePurchases`, `manageSubscriptions` | StoreKit (§7) | billing must stay off |

`native/nazm-native-bridge.js` is a reference implementation with Capacitor
plugins; adapt it to the versions you install.

## 4. Service worker and updates

The service worker is a web mechanism. In the native app (`isNative()`), it is
not registered and any earlier registration is removed (`src/pwa.js`): the
bundled code is the code that runs, and it changes only through an App Store
update. No remote code replaces the app. The "Update available" prompt exists
only on the web.

## 5. Authentication (when `features.cloud` is on)

- **Sign in with Apple**: enable the Apple provider in Firebase; Services ID,
  key and team in the Apple Developer account; the *Sign in with Apple*
  capability in Xcode. In the app, the bridge's `signIn('apple')` uses the
  native sheet (AuthenticationServices) and returns `{ idToken, rawNonce }`;
  `src/auth.js` exchanges it for a Firebase credential. The web popup flow is
  used only on the web.
- **Google**: `GoogleService-Info.plist`; URL scheme = `REVERSED_CLIENT_ID`;
  bridge `signIn('google')` returns `{ idToken, accessToken }`.
- **Provider availability** is one function, `isAuthProviderAvailable()`
  (`src/features.js`): configured in `nazm.config.js`, cloud reachable, and in
  the app the native bridge present. Google is never offered on iOS without
  Apple. Missing configuration hides the button and logs a development warning;
  it never shows a button that fails.
- **Callbacks / deep links**: Firebase authorised domains must include the web
  origin; the app itself needs no custom URL scheme beyond Google's
  `REVERSED_CLIENT_ID`. Associated domains are needed only if universal links
  (for example invitation links opening the app) are added later.
- Email/password: the password rule is shown before the first attempt; a
  password reset never reveals whether an address has an account.
- Signing out drops the cloud session and its in-memory data; the device
  inventory is a separate store and is kept. A different account signing in on
  the same device starts from a clean screen (no open record, search or
  selection carries over).

## 6. App Check (enable before the cloud launch)

- Web: `appCheck.siteKey` in `nazm.config.js` (reCAPTCHA v3 or Enterprise).
- iOS: configure App Attest in the native Firebase SDK; `siteKey` stays `null`
  in the bundled config.
- Then deploy functions with `ENFORCE_APP_CHECK=true` (DEPLOYMENT.md §5) —
  never before clients send tokens.
- Debug provider: only with `environment: 'development'`, on localhost, with
  `appCheck.debug: true`; Firebase generates the token on that machine. No
  token string exists in the source.
- An App Check failure is logged and never blocks startup.

## 7. Billing (StoreKit) — before `features.billing` is switched on

1. Products in App Store Connect matching `shared/plans.json` (paid plans).
2. Bridge `purchase({ planId, cycle })`, `restorePurchases()`,
   `manageSubscriptions()` (`src/billing.js`). The app never marks a plan as
   bought: the plan changes on screen only when the backend records it.
3. App Store Server Notifications V2 → backend → `subscriptions/{id}` (extend
   `functions/src/billing.js`, which today targets a web provider).
4. Restore Purchases and Manage Subscription visible in the plans sheet (they
   appear automatically once the bridge provides them).
5. No link to an external purchase of digital features from inside the app.

## 8. Permissions

| Permission | Why | Purpose string |
|---|---|---|
| Camera (`NSCameraUsageDescription`) | photographing items, live barcode/QR scanning | AR: يستخدم نَظْم الكاميرا لتصوير مقتنياتك ومسح الباركود ورموز QR عند طلبك. · EN: NAZM uses the camera to photograph your items and scan barcodes or QR codes when you choose to do so. |
| Photo library | **not needed**: `<input type="file">` uses the system picker (PHPicker), which grants only the photos chosen | only if a plugin reads the library directly — string provided in `native/ios/*.lproj` |

Not requested, and must not be: microphone (the scanner asks for
`audio: false`), contacts, location, Bluetooth, tracking (ATT).

Camera behaviour: the camera is requested only when the scanner opens; a
refusal is remembered for the session and the permission state is read without
prompting where WebKit supports it, so a refused camera is not asked for again;
the stream stops on cancel, sheet close, Escape, background, `pagehide`.

## 9. Privacy manifest (`PrivacyInfo.xcprivacy`)

Derive it from the **actual** native project: Capacitor and each plugin ship
their own manifests, and the required-reason APIs they use (for example
`UserDefaults`, file timestamps) are declared there. The web code in this
repository calls no native API directly. Do not add reasons that no included
library uses.

- `NSPrivacyTracking`: **false**. No tracking domains.
- Collected data types: mirror §10 for the features you enable.

## 10. App Store privacy labels (verify against the production build)

**1.0.0 as configured (cloud, AI, billing off, no analytics, no crash
reporting): nothing leaves the device → "Data Not Collected".** Verify against
the actual production build — including any analytics or crash SDK the native
project adds — before submitting.

When features are switched on, review these categories:

| Category | When | Linked to identity | Tracking |
|---|---|---|---|
| Contact Info → Email Address | accounts (`cloud`) | yes | no |
| Contact Info → Name | accounts (display name) | yes | no |
| Identifiers → User ID | accounts | yes | no |
| User Content → Photos or Videos | cloud images; AI analysis | yes | no |
| User Content → Other User Content | inventory records in the cloud | yes | no |
| Purchases → Purchase History | billing | yes | no |
| Usage Data → Product Interaction | only if analytics is added | decide | no |
| Diagnostics → Crash Data / Performance | only if crash reporting is added | decide | no |

Do not declare Tracking: NAZM has no advertising or cross-app tracking.

## 11. Account deletion (Guideline 5.1.1(v))

Only relevant once accounts exist (`cloud` on). In the app: Settings → Legal &
Privacy → Delete Account (`src/views/account.js`, one service:
`src/account.js`). Steps: explanation → workspace check → fresh sign-in →
typed confirmation → backend deletion → confirmation. It never reports success
before the backend confirms.

Backend (`functions/src/account.js`, in this repository):
`accountDeletionStatus`, `deleteAccount`, `leaveWorkspace`,
`transferWorkspaceOwnership`. `deleteAccount` requires a sign-in within the
last 5 minutes (checked on the token's `auth_time`), refuses while the user
owns a workspace other people use, purges workspaces they own alone (records,
media, activity, usage, AI usage), removes their memberships and invitations,
profile and billing link, then deletes the Authentication user last.

External tasks: deploy the functions; web subscriptions must be cancelled
before deletion (wire `cancelSubscription` into `deleteAccount` if web billing
is used); App Store subscriptions are Apple's to cancel — the flow says so.
Server logs follow the retention configured in Google Cloud Logging.

Device-only users have **Erase Data on This Device** (Settings → Danger zone),
which empties every local store and restarts; it states that it does not
delete a cloud account.

## 12. AI (when `features.cloudAi` is on)

- Consent screen before the first transmission (`src/ai-consent.js`), version
  `AI_CONSENT_VERSION`; withdrawable in Settings. Automatic analysis runs only
  after consent.
- The backend rejects a request without a current consent version
  (`AI_CONSENT_MIN_VERSION`, `functions/src/ai.js`) and records it on the user.
- Raise both versions when the provider or processing terms change materially.
- The browser never calls an AI provider: CSP allows no such domain; the key
  lives in Cloud Functions secrets.

## 13. Security notes for the backend developer

Hidden buttons are not access control. Every callable and every Security Rule
must check, independently of the client: the authenticated user, workspace
membership, role, resource ownership, and the allowed action. The existing
rules and functions do; new ones must too.

Rate limits (server-side; client throttling is not protection):

| Operation | Where | Status |
|---|---|---|
| Login, registration, password reset | Firebase Authentication (built-in abuse protection; enable email enumeration protection) | configure in the console |
| Invitation creation | `enforceInviteRate` — 20/hour/user | implemented |
| AI analysis | `enforceBurstLimit` + monthly credits | implemented |
| Import jobs | plan row limits; add a per-user job rate if server-side jobs are enabled | partial |
| Account deletion attempts | `enforceRate` — 5/hour/user | implemented |

Content Security Policy: `index.html` meta tag. Firebase, Google sign-in,
Apple sign-in and reCAPTCHA only; no `unsafe-eval`; `unsafe-inline` for style
attributes only. A native build that bundles the Firebase SDK can remove
`https://www.gstatic.com` from `script-src`.

## 14. App Review

- 1.0.0 as configured needs **no login**: every feature is reachable without
  an account. Say so in the review notes.
- If a later release requires login: provide a working review account in App
  Store Connect (never a password in the client), make sure it is verified, not
  region-locked, and that the backend is live during review.
- Review notes should mention: camera is used for item photos and barcode
  scanning; data stays on the device; Arabic and English (language chosen at
  launch).

## 15. Assets

- AppIcon set: generate from `public/brand/` (the 1024×1024 master and all
  sizes); no transparency in the App Store icon.
- Launch screen: storyboard with the NAZM mark on the app background colour
  (`#FFFFFF` light / `#060E22` dark).
- Display name: نَظْم (ar) / NAZM (en) — `InfoPlist.strings`.

## 16. Release gate

Legend: ✅ done in this repository · ⬜ external task, not done.

- ⬜ Production iOS wrapper created
- ⬜ Production Bundle ID configured
- ⬜ Apple Developer signing configured (certificate, provisioning)
- ⬜ App icons configured
- ⬜ Launch screen configured
- ⬜ Camera usage description configured (strings ready: `native/ios/`)
- ✅ Photo library permission not needed (system picker) — strings ready if a plugin changes that
- ⬜ Privacy manifest reviewed (§9)
- ⬜ App Store privacy labels completed (§10)
- ⬜ Privacy Policy public URL configured (`contact.privacyPolicyUrl`; the in-app copy is done)
- ⬜ Terms public URL configured if desired (in-app copy done)
- ✅ Delete Account flow and backend functions written — ⬜ deployed (needed only when accounts are enabled)
- ⬜ Sign in with Apple production configuration (only when accounts are enabled)
- ⬜ Google auth native configuration (only if enabled)
- ⬜ Firebase production rules/functions deployed (only if cloud enabled)
- ⬜ App Check enabled before production cloud enforcement
- ✅ AI consent implemented (client and backend) — AI stays hidden until validated
- ⬜ StoreKit connected before paid plans are shown — paid plans hidden ✅
- ⬜ Restore Purchases implemented before subscriptions launch (UI ready, needs StoreKit)
- ⬜ Manage Subscription path available before subscriptions launch (UI ready, needs StoreKit)
- ✅ Review account not needed for 1.0.0 as configured (no login)
- ✅ Backend not needed for 1.0.0 as configured
- ⬜ Real iPhone regression testing (TESTING.md § iPhone)
- ⬜ TestFlight test
- ⬜ Crash-free smoke test
- ✅ No placeholder/beta/debug UI in the shipped configuration (`release.test.mjs`)
- ⬜ Support and privacy contact details configured (`contact.*`; hidden until set)

**Status: the web application is release-ready for a device-only 1.0.0; the
App Store submission is not ready until the external items above are done.**
