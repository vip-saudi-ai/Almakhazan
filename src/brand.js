// The brand, in one place.
//
// Customer-facing names live here so a rename is one edit, not a search. What
// is NOT here on purpose: Firebase project ids, Firestore collection names,
// Storage paths, IndexedDB names and internal event names. Those are
// infrastructure. Renaming them would migrate live customer data for a
// cosmetic gain, so they keep their original spelling.

import { t } from './i18n.js';

// The customer-facing names read in the current language: نَظْم / NAZM.
export const BRAND = {
  get name() { return t('app.brand'); },
  nameAr: 'نَظْم',
  nameLatin: 'NAZM',
  get tagline() { return t('brand.tagline'); },
  get descriptor() { return t('app.tagline'); },
  get assistant() { return t('ai.assistantName'); },
  assistantMark: '✦',
  // Contact addresses are deployment configuration (nazm.config.js →
  // contact), not brand constants: an address that is not confirmed is never
  // shown to a customer.
};

/** "✦ NAZM Assistant" — the assistant is always introduced this way. */
export function assistantTitle() {
  return `${BRAND.assistantMark} ${BRAND.assistant}`;
}

/** Symbol paths, so no view hard-codes an asset location. */
export const BRAND_ASSETS = {
  symbol: 'public/brand/nazm-symbol.svg',
  symbolGradient: 'public/brand/nazm-symbol-gradient.svg',
  logoAr: 'public/brand/nazm-logo-ar.svg',
  logoEn: 'public/brand/nazm-logo-en.svg',
  logoBilingual: 'public/brand/nazm-logo-bilingual.svg',
  wordmarkAr: 'public/brand/nazm-wordmark-ar.svg',
};
