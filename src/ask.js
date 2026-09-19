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

const YEAR = 365 * 24 * 60 * 60 * 1000;

const byId = (list, id) => (id ? list.find((entry) => entry.id === id) : null);

export const SUGGESTIONS = [
  'وش القطع اللي ما لها صور؟',
  'وش الأشياء اللي قيمتها فوق 10000؟',
  'وش القطع اللي ما تم تحديثها من سنة؟',
  'كم إجمالي قيمة مخزوني؟',
  'وش القطع بدون تصنيف؟',
];

/** Arabic and Latin digits, with thousands separators and "ألف"/"مليون". */
function readNumber(text) {
  const t = normalizeDigits(String(text)).replace(/,/g, '');
  const match = t.match(/(\d+(?:\.\d+)?)\s*(ألف|الف|مليون|k|m)?/i);
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
    test: (q) => /(بدون|بلا|ما ?لها|ماله[اا]?|بدون) ?(صور|صوره|صورة)/.test(q) || /(صور|صورة).*(ناقص|مفقود)/.test(q),
    build: () => ({ kind: 'list', title: 'قطع بدون صور', match: (i) => !i.images?.length }),
  },
  {
    id: 'missing-category',
    test: (q) => /(بدون|بلا|ما ?لها) ?(تصنيف|فئة)/.test(q),
    build: () => ({ kind: 'list', title: 'قطع بدون تصنيف', match: (i) => !i.categoryId || i.categoryId === UNCATEGORIZED_ID }),
  },
  {
    id: 'missing-location',
    test: (q) => /(بدون|بلا|ما ?لها) ?(موقع|مكان)/.test(q),
    build: () => ({ kind: 'list', title: 'قطع بدون موقع', match: (i) => !i.locationId }),
  },
  {
    id: 'stale',
    test: (q) => /(ما ?تم|لم) ?(تحديث|تحدث|تراجع|مراجعة)|من سنة|منذ سنة|قديمة المراجعة/.test(q),
    build: (q, ctx) => ({
      kind: 'list',
      title: 'قطع لم تُراجع منذ سنة',
      match: (i) => ctx.now - (i.updatedAt ?? 0) > YEAR,
    }),
  },
  {
    id: 'value-above',
    test: (q) => /(فوق|أكثر من|اكثر من|تتجاوز|>)\s*[\d٠-٩]/.test(q) && /(قيمة|قيمته|سعر|تقييم|تقدير)/.test(q),
    build: (q) => {
      const threshold = readNumber(q.split(/فوق|أكثر من|اكثر من|تتجاوز|>/)[1] || '');
      return {
        kind: 'list',
        title: `قطع تزيد قيمتها عن ${(threshold ?? 0).toLocaleString('en-US')}`,
        match: (i) => (valuationMidpoint(i.valuation) ?? 0) > (threshold ?? Infinity),
      };
    },
  },
  {
    id: 'total-value',
    test: (q) => /(إجمالي|اجمالي|مجموع|كم).*(قيمة|قيم|تقييم)/.test(q),
    build: () => ({ kind: 'sum', title: 'إجمالي القيمة المقدّرة', match: () => true }),
  },
  {
    id: 'count',
    test: (q) => /^(كم|عدد)(\s|$)/.test(q) && !/(قيمة|قيم)/.test(q),
    build: (q, ctx) => {
      const scope = scopeFrom(q, ctx);
      return { kind: 'count', title: scope.title || 'عدد القطع', match: scope.match };
    },
  },
  {
    id: 'where',
    test: (q) => /^(وين|اين|فين)(\s|$)/.test(q),
    build: (q, ctx) => {
      const subject = q.replace(/^(وين|أين|اين|فين)\s*/, '').replace(/[؟?]/g, '').trim();
      const terms = normalizeArabic(subject).split(' ').filter((t) => t.length > 1);
      return {
        kind: 'where',
        title: subject ? `أين ${subject}` : 'أين القطعة',
        match: (i) => terms.length > 0 && terms.every((t) => normalizeArabic(
          [i.name, i.brand, i.description, byId(ctx.lookups.categories, i.categoryId)?.name].join(' '),
        ).includes(t)),
      };
    },
  },
];

/** Category and location mentioned anywhere in the question. */
function scopeFrom(question, ctx) {
  const q = normalizeArabic(question);
  let match = () => true;
  const parts = [];

  for (const category of ctx.lookups.categories) {
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

  return { match, title: parts.length ? `القطع في ${parts.join(' · ')}` : null, parts };
}

/**
 * @param {string} question
 * @param {{items: Array, lookups: {categories: Array, locations: Array, folders: Array}, now?: number}} context
 * @returns {{understood: boolean, kind: string, title: string, answer: string, items: Array, total?: number}}
 */
export function askInventory(question, { items, lookups, now = Date.now() }) {
  const text = normalizeDigits(String(question || '')).trim();
  if (!text) {
    return { understood: false, kind: 'empty', title: '', answer: 'اكتب سؤالك عن مخزونك.', items: [], suggestions: SUGGESTIONS };
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
        answer: `${found.length.toLocaleString('en-US')} قطعة.`,
        items: found,
      };
    }
    return {
      understood: false,
      kind: 'unknown',
      title: '',
      answer: 'لم أفهم السؤال بعد. جرّب صيغة أوضح، أو اختر من الأمثلة.',
      items: [],
      suggestions: SUGGESTIONS,
    };
  }

  const plan = intent.build(text, ctx);
  const scope = scopeFrom(text, ctx);
  const found = items.filter((item) => plan.match(item) && scope.match(item));
  const title = scope.parts.length ? `${plan.title} — ${scope.parts.join(' · ')}` : plan.title;

  if (plan.kind === 'sum') {
    const total = found.reduce((sum, item) => sum + (valuationMidpoint(item.valuation) ?? 0), 0);
    const priced = found.filter((item) => item.valuation).length;
    return {
      understood: true,
      kind: 'sum',
      title,
      total,
      answer: `${Math.round(total).toLocaleString('en-US')} ر.س تقديراً، من ${priced.toLocaleString('en-US')} قطعة مسعّرة.`,
      items: found.filter((item) => item.valuation).slice(0, 12),
      note: found.length > priced ? `${found.length - priced} قطعة بلا تقدير سعري لم تدخل في المجموع.` : null,
    };
  }

  if (plan.kind === 'count') {
    return {
      understood: true,
      kind: 'count',
      title,
      answer: `${found.length.toLocaleString('en-US')} قطعة.`,
      items: found.slice(0, 12),
      total: found.length,
    };
  }

  if (plan.kind === 'where') {
    if (!found.length) {
      return { understood: true, kind: 'where', title, answer: 'لم أجد قطعة بهذا الاسم.', items: [] };
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
        ? `${first.name} — ${where}.`
        : `${first.name} — لم يُسجَّل لها موقع بعد.`,
      items: found.slice(0, 6),
    };
  }

  return {
    understood: true,
    kind: 'list',
    title,
    answer: found.length
      ? `${found.length.toLocaleString('en-US')} قطعة.`
      : 'لا توجد قطع تطابق هذا السؤال — وهذه أخبار جيدة.',
    items: found,
    total: found.length,
  };
}
