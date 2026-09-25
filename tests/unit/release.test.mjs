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
