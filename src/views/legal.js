// The in-app reader for the Privacy Policy, the Terms & Conditions, the Data &
// AI Privacy summary and the Support page.
//
// Legal text opens inside NAZM, in the language on screen, from anywhere —
// the sign-up screen, Settings, a consent screen — signed in or not, online
// or not: it is part of the bundle, never fetched. Everything is built with
// text nodes; nothing here is parsed as HTML.

import { LEGAL_DOCUMENTS, LEGAL_VERSION } from '../locales/legal-documents.js';
import { ENV } from '../environment.js';
import {
  contactChannels, contactSupport, diagnosticsLine, legalContactText, openPrivacyRequest,
  openPublicLegal, openSupportWebsite, reportProblem,
} from '../contact.js';
import { getLanguage, onLanguageChange, t } from '../i18n.js';
import { $, el, render } from '../utils.js';
import { isSheetOpen, openSheet } from '../ui.js';

/** What the sheet is showing, so a language switch can redraw it in place. */
let showing = null;

/** LEGAL_VERSION is the one date both documents carry, in the Gregorian calendar. */
export function legalLastUpdated() {
  const [y, m, d] = LEGAL_VERSION.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(date);
}

/** The controller's name in the document's language (nazm.config.js → legal). */
function entityName(lang) {
  return lang === 'en' ? ENV.legal.entityNameEn : ENV.legal.entityNameAr;
}

function fill(text, lang) {
  return text.replaceAll('{entity}', entityName(lang)).replaceAll('{contact}', legalContactText());
}

function bodyNodes(entries, lang) {
  return entries.map((entry) => (typeof entry === 'string'
    ? el('p', { text: fill(entry, lang) })
    : el('ul', {}, entry.list.map((item) => el('li', { text: fill(item, lang) })))));
}

/**
 * The controller, and whichever of its registration details are configured —
 * a label is printed only with a value beside it.
 */
function entityBlock(lang) {
  const { legal, contact } = ENV;
  const lines = [
    [null, entityName(lang)],
    [t('legal.commercialRegistration'), legal.commercialRegistration],
    [t('legal.address'), lang === 'en' ? legal.addressEn : legal.addressAr],
    [t('legal.website'), contact.websiteUrl],
    [t('legal.email'), contact.privacyEmail || contact.supportEmail],
  ].filter(([, value]) => value);
  return el('div', { class: 'legal-entity' }, lines.map(([label, value]) => el('p', {}, [
    label ? el('span', { text: `${label}: ` }) : null,
    el('span', { dir: label ? 'auto' : null, text: value }),
  ])));
}

/** The actions a document offers at its end — only those that can act. */
function documentActions(kind) {
  const channels = contactChannels();
  const actions = [];
  if (kind === 'privacy') {
    actions.push(el('button', { class: 'btn btn-s', type: 'button', text: t('support.privacyRequestSend'), onClick: openPrivacyRequest }));
    if (channels.privacyPolicyUrl) actions.push(el('button', { class: 'btn btn-s', type: 'button', text: t('legal.webVersion'), onClick: () => openPublicLegal('privacy') }));
  }
  if (kind === 'terms' && channels.termsUrl) {
    actions.push(el('button', { class: 'btn btn-s', type: 'button', text: t('legal.webVersion'), onClick: () => openPublicLegal('terms') }));
  }
  if (kind === 'dataAi') {
    actions.push(el('button', { class: 'btn btn-s', type: 'button', text: t('legal.privacyPolicy'), onClick: () => openLegalDocument('privacy') }));
  }
  return actions.length ? el('div', { class: 'legal-links' }, actions) : null;
}

function renderDocument(kind) {
  const doc = LEGAL_DOCUMENTS[kind];
  const lang = getLanguage() === 'en' ? 'en' : 'ar';
  $('legal-body').dataset.kind = kind;
  $('legal-title').textContent = doc.title[lang];
  render($('legal-body'), [
    el('p', { class: 'legal-updated', text: t('legal.lastUpdated', { date: legalLastUpdated() }) }),
    kind === 'dataAi' ? null : entityBlock(lang),
    ...doc.sections.map((section) => el('section', { class: 'legal-section', 'aria-labelledby': `legal-${kind}-${section.id}` }, [
      el('h3', { id: `legal-${kind}-${section.id}`, text: section.title[lang] }),
      ...bodyNodes(section.body[lang], lang),
    ])),
    documentActions(kind),
  ]);
}

/**
 * Opens a document: 'privacy' | 'terms' | 'dataAi' — always the copy bundled
 * with the app, so it reads offline and before any account exists. Opening
 * another one while the sheet is up replaces what it shows.
 */
export function openLegalDocument(kind) {
  if (!LEGAL_DOCUMENTS[kind]) return;
  showing = { kind };
  renderDocument(kind);
  $('legal-body')?.closest('.shscroll')?.scrollTo?.(0, 0);
  openSheet('legal', { focus: '.shclose' });
}

// ── Support ────────────────────────────────────────────────────────────────

function supportRow({ title, subtitle, onClick, id }) {
  return el('button', { class: 'srow srow-btn', type: 'button', onClick, id }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'srowl', text: title }),
      subtitle ? el('div', { class: 'srowd', dir: 'auto', text: subtitle }) : null,
    ]),
  ]);
}

/**
 * Help, contact and privacy requests. Every row that appears can act; a
 * channel that is not configured has no row, and when none is, the page says
 * so plainly instead of offering a button that goes nowhere.
 */
function renderSupport() {
  const { supportEmail, supportUrl } = ENV.contact;
  const channels = contactChannels();
  $('legal-title').textContent = t('support.title');
  $('legal-body').dataset.kind = 'support';

  const contact = [];
  if (supportUrl) {
    contact.push(supportRow({ id: 'support-website', title: t('support.helpCenter'), subtitle: t('support.helpCenterSub'), onClick: openSupportWebsite }));
  }
  if (supportEmail) {
    contact.push(supportRow({ id: 'support-email', title: t('support.contact'), subtitle: supportEmail, onClick: contactSupport }));
    contact.push(supportRow({ id: 'support-report', title: t('support.report'), subtitle: t('support.reportSub'), onClick: reportProblem }));
  }

  render($('legal-body'), [
    el('section', { class: 'legal-section', 'aria-labelledby': 'support-help' }, [
      el('h3', { id: 'support-help', text: t('support.help') }),
      el('ul', {}, ['support.tipAdd', 'support.tipScan', 'support.tipBackup', 'support.tipSearch'].map((key) => el('li', { text: t(key) }))),
    ]),
    el('section', { class: 'legal-section', 'aria-labelledby': 'support-contact' }, [
      el('h3', { id: 'support-contact', text: t('support.contactHeading') }),
      contact.length
        ? el('div', { class: 'sgroup' }, contact)
        : el('p', { id: 'support-no-channel', text: t('support.noChannel') }),
    ]),
    el('section', { class: 'legal-section', 'aria-labelledby': 'support-privacy' }, [
      el('h3', { id: 'support-privacy', text: t('support.privacyRequest') }),
      el('p', { text: t('support.privacyRequestSub') }),
      channels.privacyRequest ? el('div', { class: 'sgroup' }, [supportRow({
        id: 'support-privacy-request', title: t('support.privacyRequestSend'),
        subtitle: ENV.contact.privacyRequestUrl ? t('support.helpCenterSub') : ENV.contact.privacyEmail,
        onClick: openPrivacyRequest,
      })]) : null,
      el('div', { class: 'legal-links' }, [
        el('button', { class: 'btn btn-s', type: 'button', text: t('legal.privacyPolicy'), onClick: () => openLegalDocument('privacy') }),
      ]),
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
