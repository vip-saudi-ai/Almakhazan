// The brand, in one place.
//
// Customer-facing names live here so a rename is one edit, not a search. What
// is NOT here on purpose: Firebase project ids, Firestore collection names,
// Storage paths, IndexedDB names and internal event names. Those are
// infrastructure. Renaming them would migrate live customer data for a
// cosmetic gain, so they keep their original spelling.

export const BRAND = {
  name: 'نَظْم',
  nameLatin: 'NAZM',
  /** Without the diacritics, for places where marks would crowd small type. */
  namePlain: 'نظم',
  tagline: 'كل ما تملك، في مكانه.',
  taglineEn: 'Everything you own, in its place.',
  descriptor: 'الجرد الذكي للمقتنيات والأصول',
  descriptorLong: 'منصة ذكية لتوثيق وتنظيم المقتنيات والمخزون والأصول.',
  assistant: 'مساعد نَظْم',
  assistantMark: '✦',
  /** [YOU] Confirm the real address before launch — see DEPLOYMENT.md. */
  salesEmail: 'sales@nazm.app',
  supportEmail: 'support@nazm.app',
};

/** "✦ مساعد نَظْم" — the assistant is always introduced this way. */
export const ASSISTANT = `${BRAND.assistantMark} ${BRAND.assistant}`;

/** Symbol paths, so no view hard-codes an asset location. */
export const BRAND_ASSETS = {
  symbol: 'public/brand/nazm-symbol.svg',
  symbolGradient: 'public/brand/nazm-symbol-gradient.svg',
  logoAr: 'public/brand/nazm-logo-ar.svg',
  logoEn: 'public/brand/nazm-logo-en.svg',
  logoBilingual: 'public/brand/nazm-logo-bilingual.svg',
  wordmarkAr: 'public/brand/nazm-wordmark-ar.svg',
};
