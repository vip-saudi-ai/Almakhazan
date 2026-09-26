// The runtime configuration, read once, validated and frozen.
//
// nazm.config.js (a classic script loaded before the modules) sets
// window.NAZM_CONFIG. Every value has a production-safe default here, and
// validation can only switch things off, never on:
//
//   · keys the defaults do not declare are ignored;
//   · a flag is on only when it is literally `true`;
//   · team and cloudAi need cloud — otherwise they are off;
//   · an email address must look like one, a URL must be https — otherwise
//     the value is dropped and nothing is shown for it;
//   · blank strings are no value.
//
// What was corrected is recorded in CONFIG_DIAGNOSTICS, which src/app.js
// reports to the console in development and as one sanitised line otherwise.
// Customers never see a diagnostic: they see the safe behaviour.

import { LEGAL_ENTITY } from './locales/legal-documents.js';

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
    supportEmail: null,
    supportUrl: null,
    privacyEmail: null,
    privacyRequestUrl: null,
    privacyPolicyUrl: null,
    termsUrl: null,
    websiteUrl: null,
    salesEmail: null,
  },
  legal: {
    // The approved wording is the default; nazm.config.js may only restate it
    // or, once the entity's details change, replace it.
    entityNameAr: LEGAL_ENTITY.ar,
    entityNameEn: LEGAL_ENTITY.en,
    commercialRegistration: null,
    addressAr: null,
    addressEn: null,
  },
};

/** Fields that hold an address or a link, and what each must be. */
const EMAIL_FIELDS = new Set(['contact.supportEmail', 'contact.privacyEmail', 'contact.salesEmail']);
const HTTPS_FIELDS = new Set([
  'contact.supportUrl', 'contact.privacyRequestUrl', 'contact.privacyPolicyUrl', 'contact.termsUrl', 'contact.websiteUrl',
  'firebase.sdkBaseUrl',
]);

export const CONFIG_DIAGNOSTICS = [];

const EMAIL = /^[^\s@<>()"',;:\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** A plausible single email address — nothing that could smuggle headers into a mailto. */
export function isEmailAddress(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL.test(value);
}

/** An absolute https URL with a host, and no credentials in it. */
export function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkValue(path, value, fallback) {
  if (EMAIL_FIELDS.has(path) && value !== null && !isEmailAddress(value)) {
    CONFIG_DIAGNOSTICS.push(`${path} is not a valid email address; ignored`);
    return fallback;
  }
  if (HTTPS_FIELDS.has(path) && value !== null && !isHttpsUrl(value)) {
    // The bundled SDK path of a native build is relative, and allowed.
    if (path === 'firebase.sdkBaseUrl' && /^\.{0,2}\/[\w./-]+$/.test(value)) return value;
    CONFIG_DIAGNOSTICS.push(`${path} must be an https URL; ignored`);
    return fallback;
  }
  return value;
}

/** Only keys the defaults declare are taken, with the defaults' types. */
function merge(defaults, provided, prefix = '') {
  const out = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = isPlainObject(provided) && Object.prototype.hasOwnProperty.call(provided, key)
      ? provided[key]
      : undefined;
    if (isPlainObject(fallback)) out[key] = merge(fallback, value, path);
    else if (value === undefined || value === null) out[key] = fallback;
    else if (typeof fallback === 'boolean') out[key] = value === true;
    else if (fallback === null || typeof fallback === 'string') {
      out[key] = typeof value === 'string' && value.trim() ? checkValue(path, value.trim(), fallback) : fallback;
    } else out[key] = fallback;
  }
  return out;
}

function consistent(config) {
  const { features } = config;
  for (const dependent of ['team', 'cloudAi']) {
    if (features[dependent] && !features.cloud) {
      CONFIG_DIAGNOSTICS.push(`features.${dependent} requires features.cloud; switched off`);
      features[dependent] = false;
    }
  }
  if (features.cloud && !config.firebase.project.projectId) {
    CONFIG_DIAGNOSTICS.push('features.cloud is on but firebase.project is not configured; the app runs on the device');
  }
  if (config.environment !== 'production' && config.environment !== 'development') {
    CONFIG_DIAGNOSTICS.push(`environment "${config.environment}" is unknown; treated as production`);
    config.environment = 'production';
  }
  return config;
}

function deepFreeze(value) {
  if (isPlainObject(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const ENV = deepFreeze(consistent(merge(DEFAULTS, globalThis.NAZM_CONFIG)));

export const isProduction = () => ENV.environment !== 'development';

/** A developer machine: the only place development diagnostics may run. */
export function isLocalHost(where = globalThis.location) {
  const host = where?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
}
