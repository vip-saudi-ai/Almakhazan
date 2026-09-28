#!/usr/bin/env node
// The Content Security Policy and HTTP security headers, generated from the
// release configuration (nazm.config.js) — so the policy allows exactly the
// services the enabled features use, and nothing for the ones switched off.
//
//   node tools/security-policy.mjs --apply   write index.html's meta CSP and
//                                            firebase.json's hosting headers
//   node tools/security-policy.mjs --check   exit 1 if either is out of date
//   node tools/security-policy.mjs --print   show the header set
//
// Used by tools/build-single-file.mjs (the standalone file's hashed policy)
// and by tests/browser/secure-server.mjs (the app tested under the headers).
//
// Three targets:
//   header      the policy a web server sends (firebase.json) — may carry
//               frame-ancestors and upgrade-insecure-requests;
//   meta        the same policy in index.html, minus what a meta tag cannot
//               express. Applies where no header is sent: the native app's
//               bundled files, a plain static server, a local preview;
//   standalone  the single-file build: no external files at all, so scripts
//               are allowed by their SHA-256 hashes and fonts by data: URI.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGION = 'us-central1';

/** Evaluates nazm.config.js the way the page does and returns NAZM_CONFIG. */
export function loadConfig(path = `${ROOT}nazm.config.js`) {
  const scope = {};
  new Function('window', readFileSync(path, 'utf8'))(scope);
  return scope.NAZM_CONFIG;
}

export function sha256(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

function originOf(url) {
  try { return /^https:/.test(url) ? new URL(url).origin : null; } catch { return null; }
}

/** The directives, as a map of name → sources, for a configuration and target. */
export function directives(config, { target = 'meta', scriptHashes = [] } = {}) {
  const features = config.features || {};
  const project = config.firebase?.project || {};
  const cloud = features.cloud === true && Boolean(project.projectId);
  const appCheck = cloud && Boolean(config.appCheck?.siteKey);
  const providers = config.auth?.providers || {};

  const d = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    // Style attributes set by the views and in index.html; no script can use it.
    'style-src': ["'self'", "'unsafe-inline'"],
    'font-src': ["'self'"],
    // Local photos are blob: URLs; the QR labels and brand marks use data:.
    'img-src': ["'self'", 'data:', 'blob:'],
    // The camera preview is a MediaStream (srcObject), not a URL; blob: covers
    // any recorded or decoded media shown by URL.
    'media-src': ["'self'", 'blob:'],
    'connect-src': ["'self'"],
    'frame-src': ["'none'"],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
  };

  if (cloud) {
    const sdk = originOf(config.firebase?.sdkBaseUrl);
    if (sdk) { d['script-src'].push(sdk); d['connect-src'].push(sdk); }
    d['connect-src'].push(
      'https://firestore.googleapis.com',
      'https://firebasestorage.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://firebaseinstallations.googleapis.com',
      `https://${REGION}-${project.projectId}.cloudfunctions.net`,
    );
    d['img-src'].push('https://firebasestorage.googleapis.com', 'https://lh3.googleusercontent.com');
    d['frame-src'] = [];
    if (project.authDomain) d['frame-src'].push(`https://${project.authDomain}`);
    if (providers.google) d['frame-src'].push('https://accounts.google.com');
    if (providers.apple) d['frame-src'].push('https://appleid.apple.com');
  }
  if (appCheck) {
    d['script-src'].push('https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/');
    d['connect-src'].push('https://content-firebaseappcheck.googleapis.com', 'https://www.google.com/recaptcha/');
    d['frame-src'].push('https://www.google.com/recaptcha/');
  }
  if (d['frame-src'].length === 0) d['frame-src'] = ["'none'"];

  if (target === 'standalone') {
    // One HTML file opened from disk: scripts only by hash, fonts inline.
    d['script-src'] = ["'self'", ...scriptHashes];
    d['font-src'] = ["'self'", 'data:'];
    delete d['manifest-src'];
    delete d['worker-src'];
  }
  if (target === 'header') {
    d['frame-ancestors'] = ["'none'"];
    d['upgrade-insecure-requests'] = [];
  }
  return d;
}

export function serialize(map) {
  return Object.entries(map).map(([name, sources]) => [name, ...sources].join(' ')).join('; ');
}

export function contentSecurityPolicy(config, options) {
  return serialize(directives(config, options));
}

/**
 * Permissions-Policy: the camera for this page only (scanner and photos);
 * everything NAZM does not use is denied. Only features Chromium and WebKit
 * recognise are listed, so the header produces no console errors.
 */
export const PERMISSIONS_POLICY = [
  'camera=(self)', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'serial=()',
  'bluetooth=()', 'hid=()', 'midi=()', 'accelerometer=()', 'gyroscope=()', 'magnetometer=()',
  'display-capture=()', 'browsing-topics=()', 'fullscreen=(self)',
].join(', ');

/** Every header the web deployment sends, generated from the configuration. */
export function securityHeaders(config) {
  const cloud = config.features?.cloud === true && Boolean(config.firebase?.project?.projectId);
  return {
    'Content-Security-Policy': contentSecurityPolicy(config, { target: 'header' }),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': PERMISSIONS_POLICY,
    // Sign-in popups (cloud only) need to talk back to this window.
    'Cross-Origin-Opener-Policy': cloud ? 'same-origin-allow-popups' : 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

// ── writing the policy into the project ────────────────────────────────────

const META_BEGIN = '<!-- security-policy:begin';
const META_END = '<!-- security-policy:end -->';

export function metaBlock(config) {
  const cloud = config.features?.cloud === true && Boolean(config.firebase?.project?.projectId);
  const csp = directives(config, { target: 'meta' });
  const pretty = Object.entries(csp).map(([name, sources]) => `  ${[name, ...sources].join(' ')};`).join('\n');
  const lines = [
    'Enforced Content Security Policy.',
    cloud
      ? 'Scripts run only from this origin\'s own files and the Firebase SDK origin.'
      : 'Scripts run only from this origin\'s own files.',
    'There is no inline script in this page and no eval.',
    cloud
      ? 'Cloud services are on, so their Firebase endpoints are allowed.'
      : 'Cloud services are off in this release: no Firebase or other external origin is allowed.',
    'No AI provider\'s domain is allowed; AI requests, when enabled, go to NAZM\'s own Cloud Functions.',
    '\'unsafe-inline\' applies to styles only (style attributes in this page and set by the views).',
    'frame-ancestors and upgrade-insecure-requests cannot be set by a meta tag;',
    'the web server sends them as headers (firebase.json, DEPLOYMENT.md § Security headers).',
  ];
  return `${META_BEGIN} (generated by tools/security-policy.mjs from nazm.config.js — do not edit by hand) -->
<!-- ${lines.join('\n     ')} -->
<meta http-equiv="Content-Security-Policy" content="
${pretty}
">
${META_END}`;
}

function applyIndex(config, write) {
  const path = `${ROOT}index.html`;
  const html = readFileSync(path, 'utf8');
  const start = html.indexOf(META_BEGIN);
  const end = html.indexOf(META_END);
  if (start < 0 || end < 0) throw new Error('index.html has no security-policy markers');
  const next = html.slice(0, start) + metaBlock(config) + html.slice(end + META_END.length);
  if (write && next !== html) writeFileSync(path, next);
  return next === html;
}

function applyFirebase(config, write) {
  const path = `${ROOT}firebase.json`;
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const wanted = Object.entries(securityHeaders(config)).map(([key, value]) => ({ key, value }));
  const rules = json.hosting.headers.filter((rule) => rule.source !== '**');
  rules.push({ source: '**', headers: wanted });
  const before = JSON.stringify(json.hosting.headers);
  json.hosting.headers = rules;
  const same = before === JSON.stringify(rules);
  if (write && !same) writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  return same;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = loadConfig();
  const mode = process.argv[2] || '--check';
  if (mode === '--print') {
    for (const [key, value] of Object.entries(securityHeaders(config))) console.log(`${key}: ${value}`);
  } else {
    const write = mode === '--apply';
    const index = applyIndex(config, write);
    const firebase = applyFirebase(config, write);
    if (write) console.log('security policy applied to index.html and firebase.json');
    else if (!index || !firebase) {
      console.error(`security policy out of date: ${!index ? 'index.html ' : ''}${!firebase ? 'firebase.json' : ''} — run npm run security:apply`);
      process.exit(1);
    } else console.log('security policy up to date');
  }
}
