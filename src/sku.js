// The generated SKU format, in one place.
//
// NAZM generates `INV-<year>-<sequence>` with the sequence exactly six digits:
// INV-2026-000001 … INV-2026-999999. Exactly six, because the highest one on
// record is found by walking the SKU index backwards, and for strings of one
// length text order is numeric order. A longer sequence would sort among the
// six-digit ones as text and quietly break that; so it is simply not a
// generated SKU. The ceiling is a million a year, far past any plan.
//
// Anything else — WATCH-001, A-7732, INV-OLD-45, 123456, or a seven-digit
// "INV-2026-1000000" someone typed — is the customer's own, is never rewritten,
// and never moves the generated sequence.

export const GENERATED_SKU_DIGITS = 6;
export const GENERATED_SKU_MAX = 999999;
const PATTERN = /^INV-(\d{4})-(\d{6})$/;

/** @returns {{year: number, sequence: number}|null} null for any custom SKU */
export function parseGeneratedSku(sku) {
  const match = PATTERN.exec(typeof sku === 'string' ? sku : '');
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}

export function formatGeneratedSku(sequence, year = new Date().getFullYear()) {
  return `INV-${year}-${String(sequence).padStart(GENERATED_SKU_DIGITS, '0')}`;
}

export function generatedSkuPrefix(year = new Date().getFullYear()) {
  return `INV-${year}-`;
}
