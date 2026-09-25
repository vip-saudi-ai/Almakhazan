// The runtime configuration, read once and frozen.
//
// nazm.config.js (a classic script loaded before the modules) sets
// window.NAZM_CONFIG. Every value has a production-safe default here, so a
// missing or partial file can only switch things off, never on.

const DEFAULTS = {
  environment: 'production',
  features: { cloud: false, team: false, billing: false, cloudAi: false },
  auth: { providers: { email: true, apple: false, google: false } },
  firebase: {
    project: { apiKey: null, authDomain: null, projectId: null, storageBucket: null, messagingSenderId: null, appId: null },
    sdkBaseUrl: 'https://www.gstatic.com/firebasejs/10.12.0',
  },
  appCheck: { siteKey: null, provider: 'recaptcha-v3', debug: false },
  contact: {
    supportEmail: null, privacyEmail: null, salesEmail: null, supportUrl: null, privacyPolicyUrl: null, termsUrl: null,
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Only keys the defaults declare are taken, with the defaults' types. */
function merge(defaults, provided) {
  const out = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = isPlainObject(provided) && Object.prototype.hasOwnProperty.call(provided, key)
      ? provided[key]
      : undefined;
    if (isPlainObject(fallback)) out[key] = merge(fallback, value);
    else if (value === undefined) out[key] = fallback;
    else if (typeof fallback === 'boolean') out[key] = value === true;
    else if (fallback === null || typeof fallback === 'string') out[key] = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    else out[key] = fallback;
  }
  return Object.freeze(out);
}

export const ENV = merge(DEFAULTS, globalThis.NAZM_CONFIG);

export const isProduction = () => ENV.environment !== 'development';

/** A developer machine: the only place development diagnostics may run. */
export function isLocalHost(where = globalThis.location) {
  const host = where?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
}
