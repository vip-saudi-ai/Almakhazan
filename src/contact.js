// Every way a customer can reach Mazayda / NAZM, from one configuration.
//
// Views never build a mailto or open a URL themselves: they ask this module
// what is available and call its actions, which go through the platform
// adapter (src/platform.js). Each channel exists only when nazm.config.js
// → contact configures it with a valid value (src/environment.js); an
// unconfigured channel has no button, and nothing here invents an address.

import { ENV } from './environment.js';
import { getAppVersion, isNative, composeEmail, openExternalUrl, platformName } from './platform.js';
import { getLanguage, t } from './i18n.js';
import { confirmAction } from './ui.js';

const contact = () => ENV.contact;

/** What is configured, as booleans — for deciding which rows to draw. */
export function contactChannels() {
  const c = contact();
  return {
    supportEmail: Boolean(c.supportEmail),
    supportUrl: Boolean(c.supportUrl),
    privacyRequest: Boolean(c.privacyRequestUrl || c.privacyEmail),
    privacyPolicyUrl: Boolean(c.privacyPolicyUrl),
    termsUrl: Boolean(c.termsUrl),
    website: Boolean(c.websiteUrl),
    any: Boolean(c.supportEmail || c.supportUrl),
  };
}

/** What a problem report carries: the app and platform — nothing personal. */
export function diagnosticsLine() {
  const { version, build } = getAppVersion();
  return `NAZM ${version}${build ? ` (${build})` : ''} · ${isNative() ? platformName() : 'web'} · ${getLanguage()}`;
}

export function openSupportWebsite() {
  return contact().supportUrl ? openExternalUrl(contact().supportUrl) : false;
}

export function contactSupport() {
  return contact().supportEmail
    ? composeEmail(contact().supportEmail, { subject: t('support.contactSubject') })
    : false;
}

export function reportProblem() {
  return contact().supportEmail
    ? composeEmail(contact().supportEmail, { subject: t('support.reportSubject'), body: `\n\n—\n${diagnosticsLine()}` })
    : false;
}

export function contactSales() {
  return contact().salesEmail ? composeEmail(contact().salesEmail, { subject: t('planUi.contact') }) : false;
}

/**
 * A privacy (data subject) request: the privacy request form if one is
 * configured, otherwise an email to the privacy address. With neither, the
 * customer is told plainly what they can do in the app — never a dead button.
 */
export function openPrivacyRequest() {
  const c = contact();
  if (c.privacyRequestUrl) return openExternalUrl(c.privacyRequestUrl);
  if (c.privacyEmail) {
    return composeEmail(c.privacyEmail, { subject: t('support.privacySubject'), body: `\n\n—\n${diagnosticsLine()}` });
  }
  void confirmAction({
    titleKey: 'support.privacyRequest',
    messageKey: 'support.privacyNoChannel',
    icon: 'ℹ️',
    confirmLabelKey: 'common.ok',
    hideCancel: true,
  });
  return false;
}

/** The public web copy of a legal document, when one is configured. */
export function openPublicLegal(kind) {
  const url = kind === 'terms' ? contact().termsUrl : contact().privacyPolicyUrl;
  return url ? openExternalUrl(url) : false;
}

/**
 * The channel a legal document names for questions and requests: a
 * configured address, or the in-app Support page — which always exists.
 */
export function legalContactText() {
  const c = contact();
  return c.privacyEmail || c.supportEmail || c.privacyRequestUrl || c.supportUrl || t('legal.contactInApp');
}
