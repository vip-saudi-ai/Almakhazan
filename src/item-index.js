// Fields an item record carries only so that a database can order and find it
// — never edited, never shown, always derived from the fields that are.
//
//   nameSortKey        the name, folded exactly as search folds it (Arabic
//                      letter variants, diacritics, case) with every run of
//                      digits zero-padded, so a plain byte-order index sorts
//                      «قطعة 2» before «قطعة 10» and «Apple» next to «apple».
//                      Deterministic on every device and every server: no
//                      locale collation is involved.
//   valuationMidpoint  the number a valuation is ordered by (a range sorts at
//                      its middle). Only ever compared within one currency:
//                      the index is [currency, midpoint], never midpoint alone.
//   searchTokens       the words of the name and the identifiers stamped on the
//                      object (SKU, barcode, serial, model, reference), folded.
//                      Bounded: descriptions and notes are not tokenized.
//
// They are written wherever an item is stored (the device backend, and the
// cloud backend when it is enabled), and an older record that lacks them is
// given them by a resumable background pass (repository.js). A record without
// them still reads and displays normally — only the index-ordered views wait
// for that pass before relying on the indexes.

import { nameSortKey, normalizeArabic } from './search.js';
import { valuationMidpoint } from './validation.js';

/** Bumped when any derivation below changes, so the backfill runs again. */
export const INDEX_FIELDS_VERSION = 1;

const MAX_TOKENS = 32;
const MAX_TOKEN_LENGTH = 64;

/** The folded words a record can be found by without reading it. */
export function searchTokensOf(item) {
  const tokens = new Set();
  const add = (value) => {
    const folded = normalizeArabic(value || '');
    if (!folded) return;
    for (const word of folded.split(/[\s/,،.;:()\-_]+/)) {
      if (word.length < 2) continue;
      tokens.add(word.slice(0, MAX_TOKEN_LENGTH));
      // «المولد» is also found by «مولد».
      if (word.length > 4 && word.startsWith('ال')) tokens.add(word.slice(2, 2 + MAX_TOKEN_LENGTH));
    }
  };
  // Identifiers whole as well as by part: «INV-2026-000123» is found as typed.
  for (const value of [item.sku, item.barcode, item.serialNumber, item.modelNumber, item.referenceNumber]) {
    const folded = normalizeArabic(value || '');
    if (folded.length >= 2) tokens.add(folded.slice(0, MAX_TOKEN_LENGTH));
    add(value);
  }
  add(item.name);
  add(item.brand);
  return [...tokens].slice(0, MAX_TOKENS);
}

/**
 * A record as it is stored: the same record with its derived fields current.
 * Everything else is left exactly as given.
 */
export function withIndexFields(record) {
  if (!record || typeof record !== 'object') return record;
  const out = { ...record };
  out.nameSortKey = nameSortKey(record.name);
  const mid = valuationMidpoint(record.valuation);
  if (mid == null || !record.valuation?.currency) delete out.valuationMidpoint;
  else out.valuationMidpoint = mid;
  out.searchTokens = searchTokensOf(record);
  return out;
}

/** Whether a stored record's derived fields are what they should be. */
export function hasCurrentIndexFields(record) {
  const expected = withIndexFields(record);
  if (record.nameSortKey !== expected.nameSortKey) return false;
  if ((record.valuationMidpoint ?? null) !== (expected.valuationMidpoint ?? null)) return false;
  const a = record.searchTokens || [];
  const b = expected.searchTokens;
  return a.length === b.length && a.every((token, i) => token === b[i]);
}

/** The fields a copy of a record for export or display does not need. */
export const INDEX_ONLY_FIELDS = Object.freeze(['nameSortKey', 'valuationMidpoint', 'searchTokens']);
