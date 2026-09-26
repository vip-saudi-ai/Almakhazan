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
import { describeTotals, formatAmount, resolveCurrency, totalsByCurrency } from './money.js';
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

const INTENTS = [
  {
    id: 'missing-images',
    test: (q) => /(بدون|بلا|ما ?لها|ماله[اا]?|بدون) ?(صور|صوره|صورة)/.test(q) || /(صور|صورة).*(ناقص|مفقود)/.test(q)
      || /\b(no|without|missing)\s+(photos?|images?|pictures?)\b/.test(q),
    build: () => ({ kind: 'list', title: t('ask.titleNoImages'), match: (i) => !i.images?.length }),
  },
  {
    id: 'missing-category',
    test: (q) => /(بدون|بلا|ما ?لها) ?(تصنيف|فئه|صنف)/.test(q) || /\b(no|without|missing)\s+categor(y|ies)\b|\buncategori[sz]ed\b/.test(q),
    build: (q, ctx) => ({
      kind: 'list',
      title: t('ask.titleNoCategory'),
      match: ctx.lookups.taxonomy
        ? (i) => !ctx.lookups.taxonomy.path(i).category
        : (i) => !i.categoryId || i.categoryId === UNCATEGORIZED_ID,
    }),
  },
  {
    id: 'missing-location',
    test: (q) => /(بدون|بلا|ما ?لها) ?(موقع|مكان)/.test(q) || /\b(no|without|missing)\s+locations?\b/.test(q),
    build: () => ({ kind: 'list', title: t('ask.titleNoLocation'), match: (i) => !i.locationId }),
  },
  {
    id: 'stale',
    test: (q) => /(ما ?تم|لم) ?(تحديث|تحدث|تراجع|مراجعة)|من سنة|منذ سنة|قديمة المراجعة/.test(q)
      || /\bnot (been )?(updated|reviewed)\b|\bin (a|over a) year\b|\bstale\b/.test(q),
    build: (q, ctx) => ({
      kind: 'list',
      title: t('ask.titleStale'),
      match: (i) => ctx.now - (i.updatedAt ?? 0) > YEAR,
    }),
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
      const currency = resolveCurrency(q, ctx.items);
      if (!currency.ok) {
        return { kind: 'currency-choice', title: t('ask.titleWhichCurrency'), threshold, options: currency.options, match: () => false };
      }
      return {
        kind: 'list',
        title: t('ask.titleValueAbove', { amount: formatAmount(threshold ?? 0, currency.currency) }),
        match: (i) => i.valuation?.currency === currency.currency
          && (valuationMidpoint(i.valuation) ?? 0) > (threshold ?? Infinity),
      };
    },
  },
  {
    id: 'total-value',
    test: (q) => /(إجمالي|اجمالي|مجموع|كم).*(قيمة|قيم|تقييم)/.test(q) || /\b(total|sum|how much)\b.*\b(value|worth)\b/.test(q),
    build: () => ({ kind: 'sum', title: t('ask.titleTotal'), match: () => true }),
  },
  {
    id: 'count',
    test: (q) => (/^(كم|عدد)(\s|$)/.test(q) && !/(قيمة|قيم)/.test(q)) || (/^(how many|count)\b/.test(q) && !/\b(value|worth)\b/.test(q)),
    build: (q, ctx) => {
      const scope = scopeFrom(q, ctx);
      return { kind: 'count', title: scope.title || t('ask.titleCount'), match: scope.match };
    },
  },
  {
    id: 'where',
    test: (q) => /^(وين|اين|فين)(\s|$)/.test(q) || /^where\b/.test(q),
    build: (q, ctx) => {
      // «وين الأجهزة الإلكترونية؟» asks about a kind of thing, not one thing:
      // the classification scope answers it.
      if (classificationFrom(whereSubject(q), ctx.lookups.taxonomy, { exact: true })) {
        return { kind: 'where', title: t('ask.titleWhereItem'), match: () => true };
      }
      const subject = q.replace(/^(وين|أين|اين|فين)\s*/, '').replace(/^where\s+(is|are)?\s*(the|my)?\s*/i, '').replace(/[؟?]/g, '').trim();
      const terms = normalizeArabic(subject).split(' ').filter((t) => t.length > 1);
      return {
        kind: 'where',
        title: subject ? t('ask.titleWhere', { subject }) : t('ask.titleWhereItem'),
        match: (i) => terms.length > 0 && terms.every((t) => normalizeArabic(
          [i.name, i.brand, i.description, byId(ctx.lookups.categories, i.categoryId)?.name].join(' '),
        ).includes(t)),
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

/** Classification, category and location mentioned anywhere in the question. */
function scopeFrom(question, ctx, { exact = false } = {}) {
  const q = normalizeArabic(question);
  let match = () => true;
  const parts = [];

  const taxonomy = ctx.lookups.taxonomy;
  const node = classificationFrom(question, taxonomy, { exact });
  if (node) {
    const field = node.level === 'main' ? 'main' : node.level === 'sub' ? 'sub' : 'category';
    match = (i) => taxonomy.path(i)[field]?.id === node.id;
    parts.push(taxonomy.label(node));
  }

  for (const category of node || taxonomy ? [] : ctx.lookups.categories) {
    const name = normalizeArabic(category.name);
    if (name && name.length > 2 && q.includes(name)) {
      const id = category.id;
      const previous = match;
      match = (i) => previous(i) && i.categoryId === id;
      parts.push(category.name);
      break;
    }
  }
  for (const location of ctx.lookups.locations) {
    const name = normalizeArabic(location.name);
    if (name && name.length > 2 && q.includes(name)) {
      const id = location.id;
      const previous = match;
      match = (i) => previous(i) && i.locationId === id;
      parts.push(location.name);
      break;
    }
  }

  return { match, title: parts.length ? t('ask.titleIn', { place: parts.join(' · ') }) : null, parts };
}

/**
 * @param {string} question
 * @param {{items: Array, lookups: {categories: Array, locations: Array, folders: Array}, now?: number}} context
 * @returns {{understood: boolean, kind: string, title: string, answer: string, items: Array, total?: number}}
 */
export function askInventory(question, { items, lookups, now = Date.now() }) {
  const text = normalizeDigits(String(question || '')).trim();
  if (!text) {
    return { understood: false, kind: 'empty', title: '', answer: t('ask.empty'), items: [], suggestions: suggestions() };
  }

  const q = normalizeArabic(text);
  const ctx = { items, lookups, now };
  const intent = INTENTS.find((candidate) => candidate.test(q));

  if (!intent) {
    // A scope on its own is still a useful answer: "الساعات في مستودع الرياض".
    const scope = scopeFrom(text, ctx);
    if (scope.parts.length) {
      const found = items.filter(scope.match);
      return {
        understood: true,
        kind: 'list',
        title: scope.title,
        answer: t('ask.count', { count: found.length }),
        items: found,
      };
    }
    // A failure is still allowed to be useful: it says what *is* answerable
    // rather than only that this was not.
    return {
      understood: false,
      kind: 'unknown',
      title: '',
      answer: t('ask.unknown'),
      items: [],
      capabilities: capabilities(),
      suggestions: suggestions(),
    };
  }

  const plan = intent.build(text, ctx);
  const scope = intent.id === 'where' ? scopeFrom(whereSubject(text), ctx, { exact: true }) : scopeFrom(text, ctx);
  const found = items.filter((item) => plan.match(item) && scope.match(item));
  const title = scope.parts.length ? `${plan.title} — ${scope.parts.join(' · ')}` : plan.title;

  // The question was answerable except for one missing fact. Asking for it is
  // a better answer than picking a currency on the customer's behalf.
  if (plan.kind === 'currency-choice') {
    return {
      understood: true,
      kind: 'currency-choice',
      title: plan.title,
      answer: t('ask.whichCurrency', { amount: plan.threshold ?? 0 }),
      options: plan.options,
      threshold: plan.threshold,
      items: [],
    };
  }

  if (plan.kind === 'sum') {
    // One total per currency. Adding SAR to USD would produce a number that
    // looks authoritative and means nothing.
    const totals = totalsByCurrency(found);
    const priced = totals.reduce((n, t) => n + t.count, 0);
    return {
      understood: true,
      kind: 'sum',
      title,
      totals,
      answer: totals.length
        ? t('ask.total', { totals: describeTotals(totals), count: priced })
        : t('ask.noPriced'),
      items: found.filter((item) => item.valuation).slice(0, 12),
      note: found.length > priced ? t('ask.unpricedNote', { count: found.length - priced }) : null,
    };
  }

  if (plan.kind === 'count') {
    return {
      understood: true,
      kind: 'count',
      title,
      answer: t('ask.count', { count: found.length }),
      items: found.slice(0, 12),
      total: found.length,
    };
  }

  if (plan.kind === 'where') {
    if (!found.length) {
      return { understood: true, kind: 'where', title, answer: t('ask.notFound'), items: [] };
    }
    const first = found[0];
    const where = byId(lookups.locations, first.locationId)?.name
      || byId(lookups.folders, first.folderId)?.name
      || null;
    return {
      understood: true,
      kind: 'where',
      title,
      answer: where
        ? t('ask.whereAnswer', { name: first.name, where })
        : t('ask.whereUnknown', { name: first.name }),
      items: found.slice(0, 6),
    };
  }

  return {
    understood: true,
    kind: 'list',
    title,
    answer: found.length
      ? t('ask.count', { count: found.length })
      : t('ask.noneMatch'),
    items: found,
    total: found.length,
  };
}
