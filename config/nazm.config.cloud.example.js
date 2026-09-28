// Example configuration for a future cloud release — NOT loaded by the app.
//
// Copy over nazm.config.js only when every prerequisite in IOS-RELEASE.md §1
// is met, then run `npm run security:apply` so the Content Security Policy
// and headers allow the Firebase services this configuration enables.
// Contact values must be real; they are left null here on purpose.

window.NAZM_CONFIG = {
  environment: 'production',
  features: { cloud: true, team: false, billing: false, cloudAi: false },
  auth: { providers: { email: true, apple: false, google: false } },
  firebase: {
    // The project the backend in functions/ is deployed to (public identifiers).
    project: {
      apiKey: 'AIzaSyD_dYt4pKDpu0YWg9PovvsWMOl99U3dlIQ',
      authDomain: 'almakhzan-3d808.firebaseapp.com',
      projectId: 'almakhzan-3d808',
      storageBucket: 'almakhzan-3d808.firebasestorage.app',
      messagingSenderId: '356609664014',
      appId: '1:356609664014:web:6ec089c2102b9ba22ec85f',
    },
    // Native builds: a copy bundled with the app, for example './vendor/firebase'.
    sdkBaseUrl: 'https://www.gstatic.com/firebasejs/10.12.0',
  },
  appCheck: { siteKey: null, provider: 'recaptcha-v3', debug: false },
  contact: {
    supportEmail: null, supportUrl: null, privacyEmail: null, privacyRequestUrl: null,
    privacyPolicyUrl: null, termsUrl: null, websiteUrl: null, salesEmail: null,
  },
  legal: {
    entityNameAr: 'شركة مزايدة، المالكة والمشغلة لتطبيق نَظْم (NAZM)',
    entityNameEn: 'Mazayda Company, owner and operator of the NAZM application',
    commercialRegistration: null, addressAr: null, addressEn: null,
  },
};
