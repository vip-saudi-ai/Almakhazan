// NAZM runtime configuration — the one file a deployment edits.
//
// Loaded as a classic script before the application, so every module reads
// the same frozen values through src/environment.js. Nothing in here is a
// secret: a browser or a WebView ships every byte of it to every customer.
// Server credentials (the Anthropic key, service accounts, webhook secrets)
// live in Cloud Functions configuration and never in this file.
//
// The shipped values are the App Store 1.0.0 release: a complete device-only
// inventory, with every capability that depends on a backend switched off
// until that backend is deployed and verified. Switching one on is a change
// here, not in application code — see IOS-RELEASE.md for what each flag
// requires first.
//
// A native build (Capacitor) ships its own copy of this file inside the app
// bundle; the web deployment serves this one. Tests replace it per context.

window.NAZM_CONFIG = {
  /** 'production' | 'development'. Development enables diagnostics and the
   *  App Check debug provider on localhost only; never ship 'development'. */
  environment: 'production',

  features: {
    /** Firebase: accounts, sync, cloud images, team workspaces, cloud restore,
     *  server import jobs. Requires the production Firebase project deployed
     *  (rules, indexes, functions) and, in the native app, the Firebase SDK
     *  bundled locally (firebase.sdkBaseUrl) instead of loaded from a CDN. */
    cloud: false,
    /** Team workspaces, invitations and roles. Requires cloud. */
    team: false,
    /** Paid plans. Requires StoreKit (native) or a web checkout provider wired
     *  into src/billing.js, Restore Purchases and a Manage Subscription path. */
    billing: false,
    /** Photo analysis by an external AI provider through Cloud Functions.
     *  Requires cloud, the backend function deployed and the consent flow. */
    cloudAi: false,
  },

  auth: {
    /** Which sign-in methods are configured in the Firebase project. Apple is
     *  mandatory on iOS whenever Google (or any third-party sign-in) is
     *  offered — enable both or neither. Ignored while features.cloud is off. */
    providers: { email: true, apple: false, google: false },
  },

  firebase: {
    /** The Firebase web app's public identifiers (Firebase console → Project
     *  settings → Your apps). Not secrets: access is enforced by Security
     *  Rules and App Check. A staging deployment points at its own project. */
    project: {
      apiKey: 'AIzaSyD_dYt4pKDpu0YWg9PovvsWMOl99U3dlIQ',
      authDomain: 'almakhzan-3d808.firebaseapp.com',
      projectId: 'almakhzan-3d808',
      storageBucket: 'almakhzan-3d808.firebasestorage.app',
      messagingSenderId: '356609664014',
      appId: '1:356609664014:web:6ec089c2102b9ba22ec85f',
    },
    /** Where the Firebase JS SDK is loaded from. A native App Store build must
     *  point at a copy bundled with the app (for example './vendor/firebase'),
     *  never at a CDN: executable code is not downloaded at run time there. */
    sdkBaseUrl: 'https://www.gstatic.com/firebasejs/10.12.0',
  },

  appCheck: {
    /** reCAPTCHA v3 / Enterprise site key for the web origin. null = off.
     *  Enable here BEFORE setting ENFORCE_APP_CHECK on the backend
     *  (DEPLOYMENT.md §5). In the native app, App Attest is configured by the
     *  native Firebase SDK instead and this stays null. */
    siteKey: null,
    provider: 'recaptcha-v3',
    /** Development only: ask Firebase to print a debug token to the console
     *  (register it in the Firebase console). Honoured only when environment
     *  is 'development' AND the page is served from localhost. Never commit a
     *  token string anywhere. */
    debug: false,
  },

  contact: {
    /** Shown on the Support screen only when set. Do not ship placeholders. */
    supportEmail: null,
    privacyEmail: null,
    /** Enterprise plan enquiries; the Enterprise card offers contact only when set. */
    salesEmail: null,
    supportUrl: null,
    /** Public web copies of the legal documents (App Store Connect needs a
     *  Privacy Policy URL). The app always shows its own in-app copy. */
    privacyPolicyUrl: null,
    termsUrl: null,
  },
};
