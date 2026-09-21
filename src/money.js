// Money, and the one rule that governs it.
//
//   Two amounts in different currencies are not comparable, and they are
//   never addable, unless an exchange rate exists to convert them. NAZM has
//   no exchange rate and no opinion about what one should be.
//
// So: nothing here ever returns a single number for a mixed-currency set.
// Every total is a list of totals, one per currency, and every threshold
// comparison either names a currency or refuses to answer until one is named.
//
// This costs a little clarity in the copy — "SAR 100,000 · USD 100,000"
// instead of one big figure — and buys the thing an inventory of valuables is
// for: a number the owner can rely on. A combined "250,000 ر.س" for an
// inventory holding 100,000 SAR, 100,000 USD and 50,000 EUR is not a rounding
// error, it is a wrong answer stated confidently.

import { valuationMidpoint } from './validation.js';

import { CURRENCY_LABELS } from './config.js';

/**
 * How to write one currency.
 *
 * A curated label where the local convention differs from the code — SAR is
 * written ر.س — and otherwise the ISO code itself. Deliberately NOT the
 * platform's symbol: `Intl` renders both JPY and CNY as ¥ in most locales, and
 * an inventory holding both would show two different currencies under one
 * mark. An unfamiliar three-letter code is worse typography and better
 * information, and this module trades the first for the second every time.
 *
 * A record valued in AED is shown as AED. The alternative, back when the app
 * knew four currencies, was to call it SAR — not an unfamiliar symbol but a
 * wrong number.
 */
export function currencySymbol(code) {
  if (!code) return '';
  return CURRENCY_LABELS[code] || code;
}

export function formatAmount(amount, currency, { compact = false } = {}) {
  const value = compact && Math.abs(amount) >= 1000
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)
    : new Intl.NumberFormat('en-US').format(Math.round(amount));
  return `${value} ${currencySymbol(currency)}`;
}

/**
 * Totals, one per currency, largest first.
 *
 * @returns {Array<{currency: string, total: number, count: number, max: number}>}
 *   Sorted by total *within* a currency only. The order across currencies is
 *   presentational — it is not a claim that the first is worth more than the
 *   second, because that comparison cannot be made.
 */
export function totalsByCurrency(items) {
  const byCurrency = new Map();
  for (const item of items || []) {
    const mid = valuationMidpoint(item?.valuation);
    if (mid === null) continue;
    const code = item.valuation.currency;
    const entry = byCurrency.get(code) || { currency: code, total: 0, count: 0, max: 0 };
    entry.total += mid;
    entry.count += 1;
    entry.max = Math.max(entry.max, item.valuation.max ?? mid);
    byCurrency.set(code, entry);
  }
  return [...byCurrency.values()].sort((a, b) => b.count - a.count || b.total - a.total);
}

/** Which currencies actually appear among priced records. */
export function currenciesPresent(items) {
  return [...new Set((items || [])
    .filter((i) => i?.valuation && valuationMidpoint(i.valuation) !== null)
    .map((i) => i.valuation.currency))];
}

/** "SAR 120,000 · USD 8,500" — never one number standing for both. */
export function describeTotals(totals, { compact = false } = {}) {
  if (!totals.length) return 'لا توجد تقديرات سعرية بعد.';
  return totals.map((t) => formatAmount(t.total, t.currency, { compact })).join(' · ');
}

const NAMED = [
  [/ر\.?\s?س|ريال|sar|sr\b/i, 'SAR'],
  [/\$|دولار|usd/i, 'USD'],
  [/€|يورو|eur/i, 'EUR'],
  [/£|جنيه|gbp/i, 'GBP'],
];

/** The currency a question names, if it names one. */
export function currencyInText(text) {
  const t = String(text || '');
  for (const [pattern, code] of NAMED) if (pattern.test(t)) return code;
  return null;
}

/**
 * Decides whether a "worth more than N" question can be answered at all.
 *
 * @returns {{ ok: true, currency: string } | { ok: false, options: string[] }}
 *   `ok: false` means the inventory holds several currencies and the question
 *   named none of them. There is no defensible way to pick one, so the caller
 *   asks rather than guessing — comparing 100,000 SAR against a threshold
 *   meant as dollars is the failure this prevents.
 */
export function resolveCurrency(text, items) {
  const named = currencyInText(text);
  const present = currenciesPresent(items);
  if (named) return { ok: true, currency: named };
  if (present.length <= 1) return { ok: true, currency: present[0] || 'SAR' };
  return { ok: false, options: present };
}
