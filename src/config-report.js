// What the configuration corrected, and what a release still lacks — for
// developers only.
//
// Reported once at startup: every note in development (console.warn), a
// single sanitised line otherwise (console.info, no values). Customers never
// see any of it; they see the safe behaviour the configuration fell back to.

import { CONFIG_DIAGNOSTICS, ENV } from './environment.js';
import { isNative } from './platform.js';
import { purchaseProvider } from './purchase-provider.js';

/** @returns {{ notes: string[], releaseGaps: string[] }} */
export function configurationReport() {
  const notes = [...CONFIG_DIAGNOSTICS];
  const { features, auth, contact } = ENV;
  if (features.billing && !purchaseProvider()) {
    notes.push('features.billing is on but no purchase provider (NazmNative.purchase / NazmBilling) exists; plans stay hidden');
  }
  if (features.cloud && isNative() && auth.providers.google && !auth.providers.apple) {
    notes.push('Google sign-in is configured without Sign in with Apple; Google is hidden on iOS');
  }
  // Not errors in the app — requirements of a public release.
  const releaseGaps = [];
  if (!contact.supportUrl) releaseGaps.push('contact.supportUrl (public HTTPS support page) is not configured');
  if (!contact.privacyPolicyUrl) releaseGaps.push('contact.privacyPolicyUrl (public HTTPS Privacy Policy) is not configured');
  if (!contact.supportEmail && !contact.supportUrl) releaseGaps.push('no customer support channel is configured');
  if (!contact.privacyEmail && !contact.privacyRequestUrl && !contact.supportEmail) {
    releaseGaps.push('no privacy request channel is configured');
  }
  return { notes, releaseGaps };
}

export function reportConfiguration() {
  const { notes, releaseGaps } = configurationReport();
  if (ENV.environment === 'development') {
    notes.forEach((note) => console.warn(`[config] ${note}`));
    releaseGaps.forEach((gap) => console.warn(`[config] release: ${gap}`));
  } else if (notes.length || releaseGaps.length) {
    console.info(`[config] ${notes.length} configuration note(s), ${releaseGaps.length} release requirement(s) open — see IOS-RELEASE.md §16`);
  }
}
