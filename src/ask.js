// اسأل نَظْم — natural-language retrieval over the customer's own records.
//
// This runs entirely on the device. A question is parsed into a filter by
// pattern, the filter runs against the local index, and the answer is built
// from what it found. No part of anyone's inventory is sent to a model to
// answer "وين لوحة أحمد مصطفى؟" — the answer is a lookup, and a lookup that
// costs nothing is also a lookup that cannot leak.
//
// Anything it cannot parse is answered honestly, with suggestions, rather than
// guessed at.

import { UNCATEGORIZED_ID } from './config.js';
import { normalizeArabic } from './search.js';
import { normalizeDigits } from './utils.js';
import { valuationMidpoint } from './validation.js';
import { currenciesPresent, currencyInText, describeTotals, formatAmount, totalsByCurrency } from './money.js';
import { compareForSort, matchesSpec, validateQuerySpec } from './query-spec.js';
import { searchTokensOf } from './item-index.js';
import { getLanguage, t } from './i18n.js';

const YEAR = 365 * 24 * 60 * 60 * 1000;

const byId = (list, id) => (id ? list.find((entry) => entry.id === id) : null);

/**
 * What this engine can actually answer, written as questions a customer would
 * type. These are the suggestion chips *and* the honest scope of the feature:
 * it is a rule engine over the customer's own records, not a language model,
 * and the UI says so by offering these rather than an empty box implying it
 * will understand anything.
 */
//
// The questions are written in the language on screen; the parser understands
// both languages whatever the screen says, so an English question typed into
// the Arabic interface (or the reverse) is still answered.
const SUGGESTION_SETS = {
  ar: [
    'وين ساعة الجيب؟',
    'وش القطع اللي ما لها صور؟',
    'وش القطع بدون موقع؟',
    'وش الأشياء اللي قيمتها فوق 10000؟',
    'كم إجمالي قيمة مخزوني؟',
    'وش القطع اللي ما تم تحديثها من سنة؟',
    'وش القطع بدون تصنيف؟',
  ],
  en: [
    'Where is the pocket watch?',
    'Which items have no photos?',
    'Which items have no location?',
    'What is worth more than 10000?',
    'What is the total value of my inventory?',
    'Which items have not been updated in a year?',
    'Which items have no category?',
  ],
};

const CAPABILITY_SETS = {
  ar: [
    { label: 'أين قطعة معينة؟', example: 'وين ساعة الجيب؟' },
    { label: 'ما القطع بدون صور؟', example: 'وش القطع اللي ما لها صور؟' },
    { label: 'اعرض قطع موقع معين', example: 'وش في الخزنة؟' },
    { label: 'ما القطع عالية القيمة؟', example: 'وش الأشياء اللي قيمتها فوق 10000؟' },
    { label: 'ما القطع التي تحتاج مراجعة؟', example: 'وش القطع اللي ما تم تحديثها من سنة؟' },
  ],
  en: [
    { label: 'Where is a particular item?', example: 'Where is the pocket watch?' },
    { label: 'Which items have no photos?', example: 'Which items have no photos?' },
    { label: 'Items in a particular location', example: 'What is in the safe?' },
    { label: 'Which items are high value?', example: 'What is worth more than 10000?' },
    { label: 'Which items need a review?', example: 'Which items have not been updated in a year?' },
  ],
};

export function suggestions() {
  return SUGGESTION_SETS[getLanguage()] || SUGGESTION_SETS.ar;
}

/** The kinds of question the parser understands, for a failed answer. */
export function capabilities() {
  return CAPABILITY_SETS[getLanguage()] || CAPABILITY_SETS.ar;
}

/** Arabic and Latin digits, with thousands separators and "ألف"/"مليون". */
function readNumber(text) {
  const clean = normalizeDigits(String(text)).replace(/,/g, '');
  const match = clean.match(/(\d+(?:\.\d+)?)\s*(ألف|الف|مليون|k|m)?/i);
  if (!match) return null;
  let value = Number(match[1]);
  const scale = match[2]?.toLowerCase();
  if (scale === 'ألف' || scale === 'الف' || scale === 'k') value *= 1000;
  if (scale === 'مليون' || scale === 'm') value *= 1_000_000;
  return Number.isFinite(value) ? value : null;
}

// Each intent turns a question into a *plan*: serializable filters in the
// query contract (query-spec.js), never a function over records. The same plan
// is executed against the device's indexes (ask-run.js), against a server
// later, or — in the tests — against an array (`askInventory`). A cloud model
// that one day interprets questions will produce this same plan, so it will
// never need the inventory to answer one.
const INTENTS = [
  {
    id: 'missing-images',
    test: (q) => /(بدون|بلا|ما ?لها|ماله[اا]?|بدون) ?(صور|صوره|صورة)/.test(q) || /(صور|صورة).*(ناقص|مفقود)/.test(q)
      || /\b(no|without|missing)\s+(photos?|images?|pictures?)\b/.test(q),
    build: () => ({ kind: 'list', title: t('ask.titleNoImages'), filters: { hasImages: false } }),
  },
  {
    id: 'missing-category',
    test: (q) => /(بدون|بلا|ما ?لها) ?(تصنيف|فئه|صنف)/.test(q) || /\b(no|without|missing)\s+categor(y|ies)\b|\buncategori[sz]ed\b/.test(q),
    build: () => ({ kind: 'list', title: t('ask.titleNoCategory'), filters: { categoryId: UNCATEGORIZED_ID } }),
  },
  {
    id: 'missing-location',
    test: (q) => /(بدون|بلا|ما ?لها) ?(موقع|مكان)/.test(q) || /\b(no|without|missing)\s+locations?\b/.test(q),
    build: () => ({ kind: 'list', title: t('ask.titleNoLocation'), filters: { locationId: { exists: false } } }),
  },
  {
    id: 'stale',
    test: (q) => /(ما ?تم|لم) ?(تحديث|تحدث|تراجع|مراجعة)|من سنة|منذ سنة|قديمة المراجعة/.test(q)
      || /\bnot (been )?(updated|reviewed)\b|\bin (a|over a) year\b|\bstale\b/.test(q),
    build: (q, ctx) => ({ kind: 'list', title: t('ask.titleStale'), filters: { updatedAt: { lt: ctx.now - YEAR } } }),
  },
  {
    id: 'value-above',
    test: (q) => (/(فوق|أكثر من|اكثر من|تتجاوز|>)\s*[\d٠-٩]/.test(q) && /(قيمة|قيمته|سعر|تقييم|تقدير)/.test(q))
      || (/\b(over|above|more than|greater than)\s*[\d]/.test(q) && /\b(worth|value|valued|price|priced|cost)\b/.test(q)),
    build: (q, ctx) => {
      const threshold = readNumber(q.split(/فوق|أكثر من|اكثر من|تتجاوز|>|\bover\b|\babove\b|\bmore than\b|\bgreater than\b/i)[1] || '');
      // "Worth more than 100,000" is not one question when the inventory
      // holds several currencies — it is one question per currency, and they
      // have different answers. Rather than pick one, say so.
      const named = currencyInText(q);
      const currency = named || (ctx.currencies.length <= 1 ? ctx.currencies[0] || 'SAR' : null);
      if (!currency) {
        return { kind: 'currency-choice', title: t('ask.titleWhichCurrency'), threshold, options: ctx.currencies };
      }
      return {
        kind: 'list',
        title: t('ask.titleValueAbove', { amount: formatAmount(threshold ?? 0, currency) }),
        filters: { valuationCurrency: currency, valuationMidpoint: { gt: threshold ?? Number.MAX_SAFE_INTEGER } },
        sort: { field: 'valuation', direction: 'desc' },
      };
    },
  },
  {
    id: 'total-value',
    test: (q) => /(إجمالي|اجمالي|مجموع|كم).*(قيمة|قيم|تقييم)/.test(q) || /\b(total|sum|how much)\b.*\b(value|worth)\b/.test(q),
    build: () => ({ kind: 'sum', title: t('ask.titleTotal'), filters: {} }),
  },
  {
    id: 'count',
    test: (q) => (/^(كم|عدد)(\s|$)/.test(q) && !/(قيمة|قيم)/.test(q)) || (/^(how many|count)\b/.test(q) && !/\b(value|worth)\b/.test(q)),
    build: (q, ctx) => {
      const scope = scopeFrom(q, ctx);
      return { kind: 'count', title: scope.title || t('ask.titleCount'), filters: {}, scoped: true };
    },
  },
  {
    id: 'where',
    test: (q) => /^(وين|اين|فين)(\s|$)/.test(q) || /^where\b/.test(q),
    build: (q, ctx) => {
      // «وين الأجهزة الإلكترونية؟» asks about a kind of thing, not one thing:
      // the classification scope answers it.
      if (classificationFrom(whereSubject(q), ctx.lookups.taxonomy, { exact: true })) {
        return { kind: 'where', title: t('ask.titleWhereItem'), filters: {} };
      }
      const subject = whereSubject(q);
      return {
        kind: 'where',
        title: subject ? t('ask.titleWhere', { subject }) : t('ask.titleWhereItem'),
        filters: {},
        // A word of the name or brand, or an identifier (query-spec.js).
        text: subject || '\u0000',
      };
    },
  },
];

/** What «وين …؟» / "where is …" asks about. */
function whereSubject(question) {
  return String(question).replace(/^(وين|أين|اين|فين)\s*/, '').replace(/^where\s+(is|are)?\s*(the|my)?\s*/i, '').replace(/[؟?]/g, '').trim();
}

/** Words with the Arabic definite article taken off: «المولدات» → «مولدات». */
function words(text) {
  return normalizeArabic(text).replace(/[؟?!.,،]/g, ' ').split(' ').filter(Boolean)
    .map((word) => (word.length > 4 && word.startsWith('ال') ? word.slice(2) : word));
}

function containsRun(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true;
  }
  return false;
}

/**
 * The Main Category, Category or Subcategory a question names — by its label
 * in either language or an alias, whole words only, the longest name winning:
 * «كم عندي معدات؟» is Equipment & Tools, «اعرض المولدات» is Generators, and
 * «وين الأجهزة الإلكترونية؟» is Electronics & Devices.
 */
function classificationFrom(question, taxonomy, { exact = false } = {}) {
  if (!taxonomy) return null;
  const q = words(question);
  let best = null;
  for (const node of taxonomy.nodes.values()) {
    if (node.mergedInto) continue;
    const names = [node.name, node.builtin?.labels.ar, node.builtin?.labels.en,
      node.name && taxonomy.label(node, 'ar'), node.name && taxonomy.label(node, 'en'),
      ...node.aliases.ar, ...node.aliases.en].filter(Boolean);
    for (const name of names) {
      const run = words(name);
      if (run.join('').length < 3 || !containsRun(q, run)) continue;
      // «وين ساعة الجيب؟» asks for one thing that happens to contain a
      // Category's word; only a question that is the name alone is a kind.
      if (exact && run.length !== q.length) continue;
      const score = run.join(' ').length;
      if (!best || score > best.score) best = { node, score };
    }
  }
  return best?.node || null;
}

/** Classification, category and location mentioned anywhere in the question — as filters. */
function scopeFrom(question, ctx, { exact = false } = {}) {
  const q = normalizeArabic(question);
  const filters = {};
  const parts = [];

  const taxonomy = ctx.lookups.taxonomy;
  const node = classificationFrom(question, taxonomy, { exact });
  if (node) {
    const field = node.level === 'main' ? 'mainCategoryId' : node.level === 'sub' ? 'subcategoryId' : 'categoryId';
    filters[field] = node.id;
    parts.push(taxonomy.label(node));
  }

  for (const category of node || taxonomy ? [] : ctx.lookups.categories) {
    const name = normalizeArabic(category.name);
    if (name && name.length > 2 && q.includes(name)) {
      filters.categoryId = category.id;
      parts.push(category.name);
      break;
    }
  }
  for (const location of ctx.lookups.locations) {
    const name = normalizeArabic(location.name);
    if (name && name.length > 2 && q.includes(name)) {
      filters.locationId = location.id;
      parts.push(location.name);
      break;
    }
  }

  return { filters, title: parts.length ? t('ask.titleIn', { place: parts.join(' · ') }) : null, parts };
}

/**
 * A question as a plan — no records involved.
 *
 * @param {string} question
 * @param {{lookups: object, currencies: string[], now?: number}} context
 *   `currencies` are the currencies the inventory holds values in (from an
 *   index or an aggregate, never by reading records).
 * @returns {{understood: boolean, kind: string, title: string,
 *   query?: {filters: object, text?: string, sort?: object}, operation?: string,
 *   threshold?, options?}}
 */
export function interpretQuestion(question, { lookups, currencies = [], now = Date.now() }) {
  const text = normalizeDigits(String(question || '')).trim();
  if (!text) return { understood: false, kind: 'empty' };
  const q = normalizeArabic(text);
  const ctx = { lookups, currencies, now };
  const intent = INTENTS.find((candidate) => candidate.test(q));

  if (!intent) {
    // A scope on its own is still a useful answer: "الساعات في مستودع الرياض".
    const scope = scopeFrom(text, ctx);
    if (scope.parts.length) {
      return { understood: true, kind: 'list', operation: 'list', title: scope.title, query: { filters: scope.filters } };
    }
    return { understood: false, kind: 'unknown' };
  }

  const plan = intent.build(text, ctx);
  if (plan.kind === 'currency-choice') {
    return { understood: true, kind: 'currency-choice', title: plan.title, threshold: plan.threshold, options: plan.options };
  }
  const scope = intent.id === 'where' ? scopeFrom(whereSubject(text), ctx, { exact: true }) : scopeFrom(text, ctx);
  const title = scope.parts.length && !plan.scoped ? `${plan.title} — ${scope.parts.join(' · ')}` : plan.title;
  const filters = { ...plan.filters, ...scope.filters };
  // A place or kind named in a «where» question already is the subject.
  const textQuery = intent.id === 'where' && scope.parts.length ? undefined : plan.text;
  return {
    understood: true,
    kind: plan.kind,
    operation: plan.kind,
    title,
    query: { filters, ...(textQuery ? { text: textQuery } : {}), ...(plan.sort ? { sort: plan.sort } : {}) },
  };
}

/**
 * The customer-facing answer, from a plan and what executing it found.
 *
 * @param {object} plan from `interpretQuestion`
 * @param {{items: Array, total: number, totals?: Array, priced?: number}} found
 */
export function answerFor(plan, found, { lookups }) {
  if (plan.kind === 'empty') {
    return { understood: false, kind: 'empty', title: '', answer: t('ask.empty'), items: [], suggestions: suggestions() };
  }
  if (!plan.understood) {
    // A failure is still allowed to be useful: it says what *is* answerable
    // rather than only that this was not.
    return {
      understood: false, kind: 'unknown', title: '', answer: t('ask.unknown'), items: [],
      capabilities: capabilities(), suggestions: suggestions(),
    };
  }
  if (plan.kind === 'currency-choice') {
    // The question was answerable except for one missing fact. Asking for it
    // is a better answer than picking a currency on the customer's behalf.
    return {
      understood: true, kind: 'currency-choice', title: plan.title,
      answer: t('ask.whichCurrency', { amount: plan.threshold ?? 0 }),
      options: plan.options, threshold: plan.threshold, items: [],
    };
  }
  const title = plan.title;
  if (plan.kind === 'sum') {
    // One total per currency. Adding SAR to USD would produce a number that
    // looks authoritative and means nothing.
    const totals = found.totals || [];
    const priced = totals.reduce((n, entry) => n + entry.count, 0);
    return {
      understood: true, kind: 'sum', title, totals,
      answer: totals.length ? t('ask.total', { totals: describeTotals(totals), count: priced }) : t('ask.noPriced'),
      items: found.items.slice(0, 12),
      note: found.total > priced ? t('ask.unpricedNote', { count: found.total - priced }) : null,
      query: plan.query,
    };
  }
  if (plan.kind === 'count') {
    return {
      understood: true, kind: 'count', title, answer: t('ask.count', { count: found.total }),
      items: found.items.slice(0, 12), total: found.total, query: plan.query,
    };
  }
  if (plan.kind === 'where') {
    if (!found.items.length) return { understood: true, kind: 'where', title, answer: t('ask.notFound'), items: [] };
    const first = found.items[0];
    const where = byId(lookups.locations, first.locationId)?.name || byId(lookups.folders, first.folderId)?.name || null;
    return {
      understood: true, kind: 'where', title,
      answer: where ? t('ask.whereAnswer', { name: first.name, where }) : t('ask.whereUnknown', { name: first.name }),
      items: found.items.slice(0, 6), total: found.total, query: plan.query,
    };
  }
  return {
    understood: true, kind: 'list', title,
    answer: found.total ? t('ask.count', { count: found.total }) : t('ask.noneMatch'),
    items: found.items, total: found.total, query: plan.query,
  };
}

/**
 * The plan executed against an array of records, with the contract's own
 * semantics (query-spec.js `matchesSpec`) — for tests and small in-memory
 * sets. The app executes plans through the repository instead (ask-run.js),
 * and must give the same answers.
 */
export function askInventory(question, { items, lookups, now = Date.now() }) {
  const plan = interpretQuestion(question, { lookups, currencies: currenciesPresent(items), now });
  if (!plan.understood || !plan.query) return answerFor(plan, { items: [], total: 0 }, { lookups });
  const spec = validateQuerySpec({ filters: plan.query.filters, text: plan.query.text });
  const found = items.filter((item) => matchesSpec(item, spec, searchTokensOf));
  if (plan.query.sort) found.sort(compareForSort(plan.query.sort));
  const priced = found.filter((item) => item.valuation && valuationMidpoint(item.valuation) != null);
  return answerFor(plan, {
    items: plan.kind === 'sum' ? priced : found,
    total: found.length,
    totals: plan.kind === 'sum' ? totalsByCurrency(found) : undefined,
  }, { lookups });
}
