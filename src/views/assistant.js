// ✦ مساعد نَظْم — the assistant tab.
//
// Three things live here, in the order a customer needs them:
//   1. Ask NAZM — a question about their own inventory, answered from the
//      local index. Nothing about what they own leaves the device to answer it.
//   2. صحة مخزونك — a score computed from published weights, with the
//      breakdown that produced it. Arithmetic, not opinion.
//   3. Guided cleanup — what to fix first, ordered by the points it would add.
//
// The assistant proposes. It never edits a record on its own, and it never
// merges a duplicate.

import { repository } from '../repository.js';
import { BRAND } from '../brand.js';
import { SUGGESTIONS, askInventory } from '../ask.js';
import { cleanupTasks, inventoryHealth } from '../health.js';
import { $, el, formatNumber, render } from '../utils.js';
import { emptyState, toast } from '../ui.js';
import { formatValuation, primaryImage } from '../validation.js';
import { ImageTier, bindImageSrc } from '../storage.js';
import { symbolNode } from './mark.js';
import { openDetail } from './detail.js';
import { openItemForm } from './item-form.js';
import { applyAssistantFilter } from './home.js';

const state = {
  question: '',
  result: null,
  screen: 'home',   // home | duplicates
};

function lookups() {
  return {
    categories: repository.state.categories,
    locations: repository.state.locations,
    folders: repository.state.folders,
  };
}

// ── ask ────────────────────────────────────────────────────────────────────
function runQuestion(question) {
  state.question = question;
  state.result = askInventory(question, { items: repository.liveItems(), lookups: lookups() });
  renderAssistant();
  $('ask-input')?.focus();
}

function askBlock() {
  const result = state.result;

  const form = el('form', {
    class: 'ask-form',
    onSubmit: (event) => {
      event.preventDefault();
      runQuestion($('ask-input').value.trim());
    },
  }, [
    el('input', {
      id: 'ask-input',
      class: 'ask-input',
      type: 'search',
      value: state.question,
      placeholder: 'اسأل عن أي شيء في مخزونك…',
      'aria-label': `اسأل ${BRAND.name}`,
      enterkeyhint: 'search',
    }),
    el('button', { class: 'ask-go', type: 'submit', text: '↵', 'aria-label': 'اسأل' }),
  ]);

  const chips = el('div', { class: 'ask-chips' }, SUGGESTIONS.map((suggestion) => el('button', {
    class: 'ask-chip', type: 'button', text: suggestion,
    onClick: () => runQuestion(suggestion),
  })));

  return el('section', { class: 'asec gl' }, [
    el('div', { class: 'asec-head' }, [
      el('span', { class: 'asec-mark', text: '✦', 'aria-hidden': 'true' }),
      el('h2', { class: 'asec-title', text: `اسأل ${BRAND.name}` }),
    ]),
    form,
    result ? answerBlock(result) : chips,
  ]);
}

function answerBlock(result) {
  if (!result.understood) {
    return el('div', { class: 'ask-answer' }, [
      el('p', { class: 'ask-text', text: result.answer }),
      el('div', { class: 'ask-chips' }, (result.suggestions || SUGGESTIONS).map((suggestion) => el('button', {
        class: 'ask-chip', type: 'button', text: suggestion,
        onClick: () => runQuestion(suggestion),
      }))),
    ]);
  }

  const shown = result.items.slice(0, 6);
  return el('div', { class: 'ask-answer' }, [
    result.title ? el('div', { class: 'ask-title', text: result.title }) : null,
    el('p', { class: 'ask-text', text: result.answer }),
    result.note ? el('p', { class: 'ask-note', text: result.note }) : null,
    shown.length ? el('div', { class: 'ask-results' }, shown.map(resultCard)) : null,
    result.items.length > shown.length ? el('button', {
      class: 'ask-more', type: 'button',
      text: `عرض كل النتائج (${formatNumber(result.items.length)})`,
      onClick: () => showAll(result),
    }) : null,
  ]);
}

function resultCard(item) {
  const image = primaryImage(item);
  const thumb = el('div', { class: 'ask-thumb' });
  if (image) {
    const img = el('img', { alt: '' });
    bindImageSrc(img, image, { tier: ImageTier.THUMB });
    thumb.appendChild(img);
  } else {
    thumb.textContent = '📦';
  }

  const location = repository.location(item.locationId)?.name
    || repository.folder(item.folderId)?.name
    || 'بلا موقع';

  return el('button', {
    class: 'ask-result', type: 'button',
    onClick: () => openDetail(item.id),
  }, [
    thumb,
    el('div', { class: 'ask-result-body' }, [
      el('div', { class: 'ask-result-name', text: item.name || '—' }),
      el('div', { class: 'ask-result-meta', text: location }),
    ]),
    item.valuation ? el('div', { class: 'ask-result-val', text: formatValuation(item.valuation, { compact: true }) }) : null,
    el('span', { class: 'ask-result-go', text: '›', 'aria-hidden': 'true' }),
  ]);
}

/** Hands the answer to the inventory screen, which is built to show lists. */
function showAll(result) {
  applyAssistantFilter({
    label: result.title || 'نتائج المساعد',
    ids: result.items.map((item) => item.id),
  });
}

// ── health ─────────────────────────────────────────────────────────────────
function gauge(score, band) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('class', 'health-gauge');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `درجة صحة المخزون ${score} من 100`);

  const track = document.createElementNS(NS, 'circle');
  const value = document.createElementNS(NS, 'circle');
  for (const circle of [track, value]) {
    circle.setAttribute('cx', '64');
    circle.setAttribute('cy', '64');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke-width', '12');
    circle.setAttribute('stroke-linecap', 'round');
  }
  track.setAttribute('stroke', 'var(--track)');
  value.setAttribute('stroke', 'var(--brand)');
  value.setAttribute('stroke-dasharray', String(circumference));
  value.setAttribute('stroke-dashoffset', String(circumference * (1 - score / 100)));
  value.setAttribute('transform', 'rotate(-90 64 64)');

  svg.append(track, value);

  return el('div', { class: `health-dial ${band.key}` }, [
    svg,
    el('div', { class: 'health-score' }, [
      el('span', { class: 'health-number', text: formatNumber(score) }),
      el('span', { class: 'health-of', text: '/ 100' }),
    ]),
  ]);
}

function signalRow(label, value, tone) {
  return el('div', { class: 'health-row' }, [
    el('span', { class: 'health-row-label', text: label }),
    el('span', { class: `health-row-value ${tone}`, text: value }),
  ]);
}

function healthBlock(health) {
  if (health.empty) {
    return el('section', { class: 'asec gl' }, [
      el('div', { class: 'asec-head' }, [el('h2', { class: 'asec-title', text: 'صحة مخزونك' })]),
      emptyState('◷', 'لا توجد قطع بعد.', 'أضف أول قطعة وستظهر درجة التوثيق هنا.'),
    ]);
  }

  const counts = health.counts;
  const rows = [
    signalRow('موثّق بالصور', `${health.signals[0].percent}%`, health.signals[0].percent >= 80 ? 'ok' : 'warn'),
    signalRow('محدد الموقع', `${health.signals[1].percent}%`, health.signals[1].percent >= 80 ? 'ok' : 'warn'),
    counts.missingCategory ? signalRow('بدون تصنيف', formatNumber(counts.missingCategory), 'warn') : null,
    counts.duplicates ? signalRow('تكرارات محتملة', formatNumber(counts.duplicateGroups), 'warn') : null,
    counts.stale ? signalRow('لم تُراجع منذ سنة', formatNumber(counts.stale), 'warn') : null,
  ].filter(Boolean);

  return el('section', { class: 'asec gl' }, [
    el('div', { class: 'asec-head' }, [
      el('h2', { class: 'asec-title', text: 'صحة مخزونك' }),
      el('button', {
        class: 'asec-help', type: 'button', text: '؟', 'aria-label': 'كيف تُحسب الدرجة',
        onClick: () => toast('الدرجة: 30% صور · 20% موقع · 15% تصنيف · 15% حالة · 10% حداثة المراجعة · 10% اكتمال البيانات', 'ℹ'),
      }),
    ]),
    gauge(health.score, health.band),
    el('p', { class: 'health-band', text: health.band.label }),
    el('div', { class: 'health-rows' }, rows),
  ]);
}

// ── cleanup ────────────────────────────────────────────────────────────────
const ACTIONS = {
  'review-missing-images': (health) => applyAssistantFilter({
    label: 'قطع بدون صور',
    ids: repository.liveItems().filter((i) => !i.images?.length).map((i) => i.id),
  }),
  'review-missing-category': () => applyAssistantFilter({
    label: 'قطع بدون تصنيف',
    ids: repository.liveItems().filter((i) => !i.categoryId || i.categoryId === 'uncategorized').map((i) => i.id),
  }),
  'review-missing-location': () => applyAssistantFilter({
    label: 'قطع بدون موقع',
    ids: repository.liveItems().filter((i) => !i.locationId).map((i) => i.id),
  }),
  'review-stale': () => {
    const year = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    applyAssistantFilter({
      label: 'قطع لم تُراجع منذ سنة',
      ids: repository.liveItems().filter((i) => now - (i.updatedAt ?? 0) > year).map((i) => i.id),
    });
  },
  'review-duplicates': () => { state.screen = 'duplicates'; renderAssistant(); },
};

function cleanupBlock(health) {
  const tasks = cleanupTasks(health);
  if (!tasks.length) {
    return el('section', { class: 'asec gl' }, [
      el('div', { class: 'asec-head' }, [el('h2', { class: 'asec-title', text: 'اقتراحات التحسين' })]),
      el('p', { class: 'ask-text', text: 'لا شيء عاجل — توثيقك في حالة جيدة.' }),
    ]);
  }

  return el('section', { class: 'asec gl' }, [
    el('div', { class: 'asec-head' }, [
      el('h2', { class: 'asec-title', text: 'اقتراحات التحسين' }),
    ]),
    el('p', { class: 'asec-sub', text: 'مرتّبة حسب أثرها على جودة التوثيق.' }),
    el('div', { class: 'task-list' }, tasks.map((task) => el('div', { class: `task ${task.priority}` }, [
      task.priority === 'high' ? el('div', { class: 'task-flag', text: 'أولوية عالية' }) : null,
      el('div', { class: 'task-title', text: task.title }),
      el('div', { class: 'task-detail', text: task.detail }),
      el('div', { class: 'task-foot' }, [
        task.gain ? el('span', { class: 'task-gain', text: `+${task.gain} نقطة` }) : null,
        el('button', {
          class: 'btn btn-s task-cta', type: 'button', text: task.cta,
          onClick: () => ACTIONS[task.action]?.(health),
        }),
      ]),
    ]))),
  ]);
}

// ── duplicates ─────────────────────────────────────────────────────────────
function duplicatesScreen(health) {
  const groups = health.duplicates || [];
  return [
    el('div', { class: 'asec-nav' }, [
      el('button', { class: 'nback', type: 'button', text: '‹ المساعد', onClick: () => { state.screen = 'home'; renderAssistant(); } }),
    ]),
    el('section', { class: 'asec gl' }, [
      el('div', { class: 'asec-head' }, [el('h2', { class: 'asec-title', text: 'تكرارات محتملة' })]),
      el('p', { class: 'asec-sub', text: 'راجع التشابه بنفسك — لا يُدمج أي سجل تلقائياً.' }),
      groups.length
        ? el('div', { class: 'dup-list' }, groups.map((group) => el('div', { class: 'dup-group' }, [
          el('div', { class: 'dup-reason', text: group.reason }),
          el('div', { class: 'dup-items' }, group.items.map(resultCard)),
        ])))
        : emptyState('✓', 'لا توجد تكرارات محتملة.', 'لم نجد سجلين يتطابقان في الباركود أو الرمز أو الاسم.'),
    ]),
  ];
}

// ── quick actions ──────────────────────────────────────────────────────────
function quickActions() {
  const action = (icon, label, onClick) => el('button', { class: 'qa', type: 'button', onClick }, [
    el('span', { class: 'qa-ico', text: icon, 'aria-hidden': 'true' }),
    el('span', { class: 'qa-label', text: label }),
  ]);

  return el('div', { class: 'qa-row' }, [
    action('⊡', 'أضف قطعة بالصورة', () => openItemForm({})),
    action('◈', 'اكتشف التكرارات', () => { state.screen = 'duplicates'; renderAssistant(); }),
    action('◷', 'القطع بلا صور', () => ACTIONS['review-missing-images']()),
  ]);
}

// ── render ─────────────────────────────────────────────────────────────────
export function renderAssistant() {
  const root = $('ai-scroll');
  if (!root) return;

  const health = inventoryHealth(repository.liveItems());

  if (state.screen === 'duplicates') {
    render(root, duplicatesScreen(health));
    return;
  }

  render(root, [
    askBlock(),
    quickActions(),
    healthBlock(health),
    cleanupBlock(health),
  ]);
}

export function bindAssistant() {
  const bar = $('ai-bar');
  if (!bar) return;
  render(bar, [
    el('div', { class: 'ntitle ntitle-brand' }, [
      symbolNode(26, { className: 'nazm-mark ntitle-mark' }),
      `مساعد ${BRAND.name}`,
    ]),
  ]);
}
