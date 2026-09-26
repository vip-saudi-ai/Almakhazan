// The release configuration, the legal documents and the export's formula
// safety — what the 1.0.0 build promises, checked without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);

/** Evaluates nazm.config.js the way the page does, into a fresh global. */
function shippedConfig() {
  const scope = {};
  new Function('window', readFileSync(new URL('nazm.config.js', root), 'utf8'))(scope);
  return scope.NAZM_CONFIG;
}

test('the shipped configuration switches every backend-dependent feature off', () => {
  const config = shippedConfig();
  assert.equal(config.environment, 'production');
  assert.deepEqual(config.features, { cloud: false, team: false, billing: false, cloudAi: false });
  assert.equal(config.auth.providers.apple, config.auth.providers.google, 'Apple and Google are enabled together or not at all');
  assert.equal(config.appCheck.siteKey, null);
  assert.equal(config.appCheck.debug, false, 'the App Check debug provider never ships on');
  for (const [key, value] of Object.entries(config.contact)) {
    assert.equal(value, null, `contact.${key} ships unset — no placeholder addresses`);
  }
});

test('no App Check debug token string exists in the client source', () => {
  for (const file of ['nazm.config.js', 'src/firebase.js', 'src/config.js', 'src/environment.js']) {
    const text = readFileSync(new URL(file, root), 'utf8');
    assert.doesNotMatch(text, /FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*['"][0-9a-f-]{8,}/i, file);
  }
});

test('the configuration layer only switches things off when a value is missing or malformed', async () => {
  globalThis.NAZM_CONFIG = { features: { cloud: 'yes', billing: 1, extra: true }, contact: { supportEmail: '  ' }, bogus: { x: 1 } };
  const { ENV } = await import(`../../src/environment.js?case=${Date.now()}`);
  assert.deepEqual(ENV.features, { cloud: false, team: false, billing: false, cloudAi: false }, 'only true switches a flag on');
  assert.equal(ENV.contact.supportEmail, null, 'a blank address is no address');
  assert.equal(ENV.bogus, undefined, 'undeclared keys are ignored');
  assert.ok(Object.isFrozen(ENV) && Object.isFrozen(ENV.features));
  delete globalThis.NAZM_CONFIG;
});

test('version 1.0.0 everywhere, with no pre-release suffix', async () => {
  const { APP_VERSION } = await import('../../src/config.js');
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(APP_VERSION, '1.0.0');
  assert.equal(pkg.version, '1.0.0');
  assert.doesNotMatch(readFileSync(new URL('src/config.js', root), 'utf8'), /beta|pre-1\.0/i);
});

test('every legal section exists in Arabic and English, with the same structure', async () => {
  const { LEGAL_DOCUMENTS, LEGAL_ENTITY } = await import('../../src/locales/legal-documents.js');
  assert.match(LEGAL_ENTITY.ar, /شركة مزايدة، المالكة والمشغلة لتطبيق نَظْم \(NAZM\)/);
  assert.match(LEGAL_ENTITY.en, /Mazayda Company, owner and operator of the NAZM application/);
  for (const [kind, doc] of Object.entries(LEGAL_DOCUMENTS)) {
    assert.ok(doc.title.ar && doc.title.en, `${kind} title`);
    const ids = new Set();
    for (const section of doc.sections) {
      assert.ok(!ids.has(section.id), `${kind}: duplicate section ${section.id}`);
      ids.add(section.id);
      assert.ok(section.title.ar && section.title.en, `${kind}/${section.id} title`);
      const { ar, en } = section.body;
      assert.equal(ar.length, en.length, `${kind}/${section.id}: paragraph count differs`);
      ar.forEach((entry, i) => {
        assert.equal(typeof entry, typeof en[i], `${kind}/${section.id}[${i}] kind differs`);
        if (typeof entry === 'object') assert.equal(entry.list.length, en[i].list.length, `${kind}/${section.id}[${i}] list length`);
      });
      const arText = JSON.stringify(ar);
      const enText = JSON.stringify(en);
      assert.doesNotMatch(enText, /[؀-ۿ]/, `${kind}/${section.id}: Arabic in the English text`);
      for (const token of ['{entity}', '{contact}']) {
        assert.equal(arText.includes(token), enText.includes(token), `${kind}/${section.id}: ${token} in one language only`);
      }
    }
  }
});

test('the legal documents describe unlaunched services conditionally and name no unconfirmed provider', async () => {
  const { LEGAL_DOCUMENTS } = await import('../../src/locales/legal-documents.js');
  const all = JSON.stringify(LEGAL_DOCUMENTS);
  assert.doesNotMatch(all, /Anthropic|Claude|OpenAI|Stripe|Moyasar|Tap Payments/i);
  assert.doesNotMatch(all, /@[a-z0-9-]+\.[a-z]{2,}/i, 'no email address is written into the documents');
  assert.doesNotMatch(all, /\b\d+\s*(days|يوم|يوماً)\b/i, 'no retention period is promised');
  const privacyEn = JSON.stringify(LEGAL_DOCUMENTS.privacy.sections.map((s) => s.body.en));
  for (const phrase of ['When cloud services are enabled', 'When AI photo analysis is offered', 'when paid plans are offered']) {
    assert.ok(privacyEn.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
  const termsEn = JSON.stringify(LEGAL_DOCUMENTS.terms.sections.map((s) => s.body.en));
  assert.match(termsEn, /laws of the Kingdom of Saudi Arabia/);
  assert.match(termsEn, /Nothing in these terms is intended to reduce your rights as a consumer/);
});

test('the Excel export never writes a formula: text that looks like one stays text', async () => {
  const { sheetXmlForTest } = await import('../../src/xlsx-writer.js');
  const xml = sheetXmlForTest({ name: 'x', rows: [['name'], ['=HYPERLINK("http://x","y")'], ['+1'], ['-5% lot'], ['@SUM(A1)']] });
  assert.doesNotMatch(xml, /<f>/);
  for (const value of ['=HYPERLINK(&quot;http://x&quot;,&quot;y&quot;)', '+1', '-5% lot', '@SUM(A1)']) {
    assert.ok(xml.includes(`<t xml:space="preserve">${value}</t>`), `${value} kept verbatim as an inline string`);
  }
});

test('the local-only release configures no Firebase project', () => {
  const config = shippedConfig();
  assert.ok(Object.values(config.firebase.project).every((value) => value === null));
  assert.equal(config.legal.entityNameAr, 'شركة مزايدة، المالكة والمشغلة لتطبيق نَظْم (NAZM)');
  assert.equal(config.legal.commercialRegistration, null, 'no registration number is invented');
});

test('the validator switches inconsistent or unsafe values off', async () => {
  globalThis.NAZM_CONFIG = {
    features: { cloud: false, team: true, cloudAi: true },
    contact: { supportUrl: 'http://example.org', privacyPolicyUrl: 'javascript:alert(1)', termsUrl: 'https://example.org/terms', supportEmail: 'a@example.org?cc=b@example.org', privacyEmail: 'privacy@example.org' },
  };
  const { ENV, CONFIG_DIAGNOSTICS } = await import(`../../src/environment.js?validator=${Date.now()}`);
  assert.equal(ENV.features.team, false, 'team needs cloud');
  assert.equal(ENV.features.cloudAi, false, 'cloud AI needs cloud');
  assert.equal(ENV.contact.supportUrl, null, 'plain http is refused');
  assert.equal(ENV.contact.privacyPolicyUrl, null, 'javascript: is refused');
  assert.equal(ENV.contact.termsUrl, 'https://example.org/terms');
  assert.equal(ENV.contact.supportEmail, null, 'an address that could inject headers is refused');
  assert.equal(ENV.contact.privacyEmail, 'privacy@example.org');
  assert.ok(CONFIG_DIAGNOSTICS.length >= 5);
  delete globalThis.NAZM_CONFIG;
});

test('the security policy follows the feature flags', async () => {
  const { contentSecurityPolicy, securityHeaders } = await import('../../tools/security-policy.mjs');
  const local = shippedConfig();
  const header = securityHeaders(local)['Content-Security-Policy'];
  assert.doesNotMatch(header, /https?:\/\//, 'local-only: no external origin');
  assert.match(header, /script-src 'self';/);
  assert.match(header, /frame-ancestors 'none'/);
  assert.doesNotMatch(header, /unsafe-eval/);
  assert.doesNotMatch(header, /script-src[^;]*unsafe-inline/);

  const cloud = {
    ...local,
    features: { ...local.features, cloud: true },
    auth: { providers: { email: true, apple: true, google: true } },
    firebase: { ...local.firebase, project: { ...local.firebase.project, projectId: 'demo-nazm', authDomain: 'demo-nazm.firebaseapp.com' } },
  };
  const cloudPolicy = contentSecurityPolicy(cloud, { target: 'header' });
  assert.match(cloudPolicy, /https:\/\/firestore\.googleapis\.com/);
  assert.match(cloudPolicy, /https:\/\/us-central1-demo-nazm\.cloudfunctions\.net/);
  assert.match(cloudPolicy, /frame-src https:\/\/demo-nazm\.firebaseapp\.com https:\/\/accounts\.google\.com https:\/\/appleid\.apple\.com/);
  assert.doesNotMatch(cloudPolicy, /anthropic|openai/i, 'never an AI provider, even with cloud on');
  assert.doesNotMatch(cloudPolicy, /recaptcha/, 'reCAPTCHA only once App Check has a site key');
});

test('index.html and firebase.json carry the policy generated from the shipped configuration', async () => {
  const { metaBlock, securityHeaders } = await import('../../tools/security-policy.mjs');
  const config = shippedConfig();
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.ok(html.includes(metaBlock(config)), 'run npm run security:apply');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'index.html has no inline script');
  const firebase = JSON.parse(readFileSync(new URL('firebase.json', root), 'utf8'));
  const sent = Object.fromEntries(firebase.hosting.headers.find((rule) => rule.source === '**').headers.map((h) => [h.key, h.value]));
  assert.deepEqual(sent, securityHeaders(config));
});
