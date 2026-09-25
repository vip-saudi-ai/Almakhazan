// The in-app reader for the Privacy Policy, the Terms & Conditions, the Data &
// AI Privacy summary and the Support page.
//
// Legal text opens inside NAZM, in the language on screen, from anywhere —
// the sign-up screen, Settings, a consent screen — signed in or not, online
// or not: it is part of the bundle, never fetched. Everything is built with
// text nodes; nothing here is parsed as HTML.

import { LEGAL_DOCUMENTS, LEGAL_ENTITY, LEGAL_VERSION } from '../locales/legal-documents.js';
import { ENV } from '../environment.js';
import { getAppVersion, isNative, openExternalUrl, platformName } from '../platform.js';
import { getLanguage, onLanguageChange, t } from '../i18n.js';
import { $, el, render } from '../utils.js';
import { isSheetOpen, openSheet } from '../ui.js';

/** What the sheet is showing, so a language switch can redraw it in place. */
let showing = null;

export function legalLastUpdated() {
  const [y, m, d] = LEGAL_VERSION.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(date);
}

/** The channel a customer is told to use: a configured address, or the Support page. */
function contactChannel() {
  const email = ENV.contact.privacyEmail || ENV.contact.supportEmail;
  return email || t('legal.contactInApp');
}

function fill(text, lang) {
  return text.replaceAll('{entity}', LEGAL_ENTITY[lang]).replaceAll('{contact}', contactChannel());
}

function bodyNodes(entries, lang) {
  return entries.map((entry) => (typeof entry === 'string'
    ? el('p', { text: fill(entry, lang) })
    : el('ul', {}, entry.list.map((item) => el('li', { text: fill(item, lang) })))));
}

function renderDocument(kind) {
  const doc = LEGAL_DOCUMENTS[kind];
  const lang = getLanguage() === 'en' ? 'en' : 'ar';
  $('legal-body').dataset.kind = kind;
  $('legal-title').textContent = doc.title[lang];
  render($('legal-body'), [
    el('p', { class: 'legal-updated', text: t('legal.lastUpdated', { date: legalLastUpdated() }) }),
    kind === 'dataAi' ? null : el('p', { class: 'legal-entity', text: LEGAL_ENTITY[lang] }),
    ...doc.sections.map((section) => el('section', { class: 'legal-section', 'aria-labelledby': `legal-${kind}-${section.id}` }, [
      el('h3', { id: `legal-${kind}-${section.id}`, text: section.title[lang] }),
      ...bodyNodes(section.body[lang], lang),
    ])),
    kind === 'dataAi' ? el('div', { class: 'legal-links' }, [
      el('button', { class: 'btn btn-s', type: 'button', text: t('legal.privacyPolicy'), onClick: () => openLegalDocument('privacy') }),
    ]) : null,
  ]);
}

/**
 * Opens a document: 'privacy' | 'terms' | 'dataAi'. Opening another one
 * while the sheet is up replaces what it shows and returns to the top.
 */
export function openLegalDocument(kind) {
  if (!LEGAL_DOCUMENTS[kind]) return;
  showing = { kind };
  renderDocument(kind);
  $('legal-body')?.closest('.shscroll')?.scrollTo?.(0, 0);
  openSheet('legal', { focus: '.shclose' });
}

// ── Support ────────────────────────────────────────────────────────────────

/** What a problem report carries: the app and platform, nothing personal. */
function diagnosticsLine() {
  const { version, build } = getAppVersion();
  return `NAZM ${version}${build ? ` (${build})` : ''} · ${isNative() ? platformName() : 'web'} · ${getLanguage()}`;
}

function mailto(address, subject, body = '') {
  const query = new URLSearchParams({ subject, ...(body ? { body } : {}) }).toString().replaceAll('+', '%20');
  return `mailto:${address}?${query}`;
}

function supportRow({ title, subtitle, onClick }) {
  return el('button', { class: 'srow srow-btn', type: 'button', onClick }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'srowl', text: title }),
      subtitle ? el('div', { class: 'srowd', text: subtitle }) : null,
    ]),
  ]);
}

function renderSupport() {
  const { supportEmail, privacyEmail, supportUrl } = ENV.contact;
  $('legal-title').textContent = t('support.title');

  const contact = [];
  if (supportUrl) {
    contact.push(supportRow({ title: t('support.helpCenter'), subtitle: t('support.helpCenterSub'), onClick: () => openExternalUrl(supportUrl) }));
  }
  if (supportEmail) {
    contact.push(supportRow({
      title: t('support.contact'), subtitle: supportEmail,
      onClick: () => openExternalUrl(mailto(supportEmail, t('support.contactSubject'))),
    }));
    contact.push(supportRow({
      title: t('support.report'), subtitle: t('support.reportSub'),
      onClick: () => openExternalUrl(mailto(supportEmail, t('support.reportSubject'), `\n\n—\n${diagnosticsLine()}`)),
    }));
  }
  const privacyAddress = privacyEmail || supportEmail;
  $('legal-body').dataset.kind = 'support';

  render($('legal-body'), [
    el('section', { class: 'legal-section', 'aria-labelledby': 'support-help' }, [
      el('h3', { id: 'support-help', text: t('support.help') }),
      el('ul', {}, ['support.tipAdd', 'support.tipScan', 'support.tipBackup', 'support.tipSearch'].map((key) => el('li', { text: t(key) }))),
    ]),
    contact.length ? el('section', { class: 'legal-section', 'aria-labelledby': 'support-contact' }, [
      el('h3', { id: 'support-contact', text: t('support.contactHeading') }),
      el('div', { class: 'sgroup' }, contact),
    ]) : null,
    el('section', { class: 'legal-section', 'aria-labelledby': 'support-privacy' }, [
      el('h3', { id: 'support-privacy', text: t('support.privacyRequest') }),
      el('p', { text: t('support.privacyRequestSub') }),
      privacyAddress ? el('div', { class: 'sgroup' }, [supportRow({
        title: t('support.privacyRequestSend'), subtitle: privacyAddress,
        onClick: () => openExternalUrl(mailto(privacyAddress, t('support.privacySubject'))),
      })]) : null,
    ]),
    el('p', { class: 'legal-updated', text: diagnosticsLine() }),
  ]);
}

export function openSupport() {
  showing = { kind: 'support' };
  renderSupport();
  $('legal-body')?.closest('.shscroll')?.scrollTo?.(0, 0);
  openSheet('legal', { focus: '.shclose' });
}

onLanguageChange(() => {
  // Only what this module drew: the AI consent screen redraws itself.
  if (!showing || !isSheetOpen('legal') || $('legal-body')?.dataset.kind !== showing.kind) return;
  if (showing.kind === 'support') renderSupport();
  else renderDocument(showing.kind);
});

/**
 * "By creating an account, you agree to the Terms & Conditions and
 * acknowledge the Privacy Policy." — with both names as buttons that open the
 * documents in the app. Shown before any account is created. It is notice and
 * agreement to the Terms, not a blanket consent: processing that needs
 * consent (AI analysis) asks for it separately, at the time.
 */
export function legalConsentLine() {
  const parts = t('gate.consent').split(/(\{terms\}|\{privacy\})/);
  return el('p', { class: 'legal-consent' }, parts.filter(Boolean).map((part) => {
    if (part === '{terms}') {
      return el('button', { class: 'legal-inline', type: 'button', text: t('legal.terms'), onClick: () => openLegalDocument('terms') });
    }
    if (part === '{privacy}') {
      return el('button', { class: 'legal-inline', type: 'button', text: t('legal.privacyPolicy'), onClick: () => openLegalDocument('privacy') });
    }
    return part;
  }));
}

/** The two documents as a quiet pair of links, for screens before sign-in. */
export function legalLinks() {
  return el('div', { class: 'legal-footer' }, [
    el('button', { class: 'legal-inline', type: 'button', text: t('legal.privacyPolicy'), onClick: () => openLegalDocument('privacy') }),
    el('span', { 'aria-hidden': 'true', text: '·' }),
    el('button', { class: 'legal-inline', type: 'button', text: t('legal.terms'), onClick: () => openLegalDocument('terms') }),
  ]);
}
