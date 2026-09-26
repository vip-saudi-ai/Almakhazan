// NAZM runtime configuration — production, local-only (release 1.0.0).
//
// Loaded as a classic script before the application, so every module reads
// the same frozen values through src/environment.js, which also validates
// them (unknown keys ignored, malformed addresses and non-HTTPS URLs dropped,
// inconsistent flags switched off). Nothing in here is a secret: a browser or
// a WebView ships every byte of it to every customer. Server credentials live
// in Cloud Functions configuration and never in this file.
//
// This is the local-first 1.0.0 release: a complete device inventory with
// every capability that depends on a backend switched off, and no Firebase
// project configured at all. The cloud configuration for a later release is
// config/nazm.config.cloud.example.js — see IOS-RELEASE.md §1 for what each
// flag requires first.
//
// After changing `features` or `firebase`, run `npm run security:apply`: the
// Content Security Policy and HTTP headers are generated from this file, so
// the policy allows exactly the services the configuration enables.
//
// A native build ships its own copy of this file inside the app bundle; the
// web deployment serves this one. Tests replace it per context.

window.NAZM_CONFIG = {
  /** 'production' | 'development'. Development enables configuration
   *  diagnostics in the console and the App Check debug provider on
   *  localhost; never ship 'development'. */
  environment: 'production',

  features: {
    /** Firebase: accounts, sync, cloud images, team workspaces, cloud restore,
     *  server import jobs. Off: the Firebase SDK is never loaded. */
    cloud: false,
    /** Team workspaces, invitations and roles. Requires cloud. */
    team: false,
    /** Paid plans. Also requires a purchase provider (StoreKit through the
     *  native bridge, or a web checkout): without one it stays hidden. */
    billing: false,
    /** Photo analysis by an external AI provider through NAZM's Cloud
     *  Functions — never called from the client directly. Requires cloud. */
    cloudAi: false,
  },

  auth: {
    /** Sign-in methods configured in the Firebase project. On iOS, Google is
     *  offered only together with Sign in with Apple. Ignored while cloud is
     *  off. */
    providers: { email: true, apple: false, google: false },
  },

  firebase: {
    /** No Firebase project in the local-only release. The cloud release sets
     *  these from Firebase console → Project settings → Your apps (public
     *  identifiers, not secrets). */
    project: {
      apiKey: null,
      authDomain: null,
      projectId: null,
      storageBucket: null,
      messagingSenderId: null,
      appId: null,
    },
    /** Where the Firebase JS SDK is loaded from when cloud is on. A native
     *  build must point at a copy bundled with the app, never a CDN. */
    sdkBaseUrl: 'https://www.gstatic.com/firebasejs/10.12.0',
  },

  appCheck: {
    /** Off in the local-only release. See IOS-RELEASE.md §6 before the cloud
     *  launch. Never commit a debug token. */
    siteKey: null,
    provider: 'recaptcha-v3',
    debug: false,
  },

  contact: {
    /** Every value here is shown to customers exactly where it applies and
     *  nowhere when null. Only real, confirmed Mazayda/NAZM values — never a
     *  placeholder. URLs must be https. The App Store release needs at least
     *  supportUrl and privacyPolicyUrl (IOS-RELEASE.md §16). */
    supportEmail: null,
    supportUrl: null,
    privacyEmail: null,
    /** A web form for privacy (data subject) requests, if one exists. */
    privacyRequestUrl: null,
    privacyPolicyUrl: null,
    termsUrl: null,
    websiteUrl: null,
    /** Enterprise enquiries; optional. */
    salesEmail: null,
  },

  legal: {
    /** The controller named in the Privacy Policy and Terms. The wording below
     *  is the approved one; the other fields are printed only when set. */
    entityNameAr: 'شركة مزايدة، المالكة والمشغلة لتطبيق نَظْم (NAZM)',
    entityNameEn: 'Mazayda Company, owner and operator of the NAZM application',
    commercialRegistration: null,
    addressAr: null,
    addressEn: null,
  },
};
