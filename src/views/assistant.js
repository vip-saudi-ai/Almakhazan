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

import { icon } from '../icons.js';
import { repository } from '../repository.js';
import { BRAND, assistantTitle } from '../brand.js';
import { askInventory, capabilities, suggestions } from '../ask.js';
import { onLanguageChange, t } from '../i18n.js';
import { locationName } from '../labels.js';
import { formatAmount } from '../money.js';
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
      dir: 'auto',
      value: state.question,
      // Not "ask anything": the engine answers a known set of questions, and
      // promising more than that is how a useful feature earns distrust.
      placeholder: t('assistant.askPlaceholder'),
      'aria-label': t('assistant.askTitle', { name: BRAND.name }),
      enterkeyhint: 'search',
    }),
    el('button', { class: 'ask-go', type: 'submit', text: '↵', 'aria-label': t('assistant.askGo') }),
  ]);

  const chips = el('div', { class: 'ask-chips' }, suggestions().map((suggestion) => el('button', {
    class: 'ask-chip', type: 'button', text: suggestion,
    onClick: () => runQuestion(suggestion),
  })));

  return el('section', { class: 'asec gl' }, [
    el('div', { class: 'asec-head' }, [
      el('span', { class: 'asec-mark', text: '✦', 'aria-hidden': 'true' }),
      el('h2', { class: 'asec-title', text: t('assistant.askTitle', { name: BRAND.name }) }),
    ]),
    form,
    result ? answerBlock(result) : chips,
  ]);
}

function answerBlock(result) {
  if (!result.understood) {
    return el('div', { class: 'ask-answer' }, [
      el('p', { class: 'ask-text', text: result.answer }),
      el('div', { class: 'ask-caps' }, (result.capabilities || capabilities()).map((cap) => el('button', {
        class: 'ask-cap', type: 'button',
        onClick: () => runQuestion(cap.example),
      }, [
        el('span', { class: 'ask-cap-lbl', text: cap.label }),
        el('span', { class: 'ask-cap-ex', text: cap.example }),
      ]))),
    ]);
  }

  // The inventory holds more than one currency and the question named none.
  // Each option re-asks the same question with the currency supplied.
  if (result.kind === 'currency-choice') {
    return el('div', { class: 'ask-answer' }, [
      el('div', { class: 'ask-title', text: result.title }),
      el('p', { class: 'ask-text', text: result.answer }),
      el('div', { class: 'ask-chips' }, result.options.map((code) => el('button', {
        class: 'ask-chip', type: 'button', text: code,
        onClick: () => runQuestion(`${state.question} ${code}`),
      }))),
    ]);
  }

  const shown = result.items.slice(0, 6);
  return el('div', { class: 'ask-answer' }, [
    result.title ? el('div', { class: 'ask-title', text: result.title }) : null,
    // A total is a list of totals. One per currency, each labelled — never a
    // single figure standing for several.
    result.kind === 'sum' && result.totals?.length
      ? el('div', { class: 'ask-totals' }, result.totals.map((total) => el('div', { class: 'ask-total' }, [
        el('div', { class: 'ask-total-val', text: formatAmount(total.total, total.currency) }),
        el('div', { class: 'ask-total-sub', text: t('count.items', { count: total.count }) }),
      ])))
      : null,
    el('p', { class: 'ask-text', text: result.answer }),
    result.note ? el('p', { class: 'ask-note', text: result.note }) : null,
    shown.length ? el('div', { class: 'ask-results' }, shown.map(resultCard)) : null,
    result.items.length > shown.length ? el('button', {
      class: 'ask-more', type: 'button',
      text: t('assistant.showAll', { count: result.items.length }),
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

  const location = locationName(repository.location(item.locationId))
    || repository.folder(item.folderId)?.name
    || t('assistant.noLocation');

  return el('button', {
    class: 'ask-result', type: 'button',
    onClick: () => openDetail(item.id),
  }, [
    thumb,
    el('div', { class: 'ask-result-body' }, [
      el('div', { class: 'ask-result-name', text: item.name || '—', dir: 'auto' }),
      el('div', { class: 'ask-result-meta', text: location, dir: 'auto' }),
    ]),
    item.valuation ? el('div', { class: 'ask-result-val', text: formatValuation(item.valuation, { compact: true }) }) : null,
    el('span', { class: 'ask-result-go', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
  ]);
}

/** Hands the answer to the inventory screen, which is built to show lists. */
function showAll(result) {
  applyAssistantFilter({
    label: result.title || t('assistant.results'),
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
  svg.setAttribute('aria-label', t('assistant.gaugeLabel', { score }));

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
      el('div', { class: 'asec-head' }, [el('h2', { class: 'asec-title', text: t('assistant.healthTitle') })]),
      emptyState('◷', t('health.band.empty'), t('assistant.healthEmptySub')),
    ]);
  }

  const counts = health.counts;
  const rows = [
    signalRow(t('health.signal.images'), `${health.signals[0].percent}%`, health.signals[0].percent >= 80 ? 'ok' : 'warn'),
    signalRow(t('health.signal.location'), `${health.signals[1].percent}%`, health.signals[1].percent >= 80 ? 'ok' : 'warn'),
    counts.missingCategory ? signalRow(t('assistant.rowNoCategory'), formatNumber(counts.missingCategory), 'warn') : null,
    counts.duplicates ? signalRow(t('assistant.rowDuplicates'), formatNumber(counts.duplicateGroups), 'warn') : null,
    counts.stale ? signalRow(t('assistant.rowStale'), formatNumber(counts.stale), 'warn') : null,
  ].filter(Boolean);

  return el('section', { class: 'asec gl' }, [
    el('div', { class: 'asec-head' }, [
      el('h2', { class: 'asec-title', text: t('assistant.healthTitle') }),
      el('button', {
        class: 'asec-help', type: 'button', text: t('assistant.helpMark'), 'aria-label': t('assistant.howScored'),
        onClick: () => toast(t('assistant.scoreFormula'), 'ℹ'),
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
    label: t('ask.titleNoImages'),
    ids: repository.liveItems().filter((i) => !i.images?.length).map((i) => i.id),
  }),
  'review-missing-category': () => applyAssistantFilter({
    label: t('ask.titleNoCategory'),
    ids: repository.liveItems().filter((i) => !i.categoryId || i.categoryId === 'uncategorized').map((i) => i.id),
  }),
  'review-missing-location': () => applyAssistantFilter({
    label: t('ask.titleNoLocation'),
    ids: repository.liveItems().filter((i) => !i.locationId).map((i) => i.id),
  }),
  'review-stale': () => {
    const year = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    applyAssistantFilter({
      label: t('ask.titleStale'),
      ids: repository.liveItems().filter((i) => now - (i.updatedAt ?? 0) > year).map((i) => i.id),
    });
  },
  'review-duplicates': () => { state.screen = 'duplicates'; renderAssistant(); },
};

function cleanupBlock(health) {
  const tasks = cleanupTasks(health);
  if (!tasks.length) {
    return el('section', { class: 'asec gl' }, [
      el('div', { class: 'asec-head' }, [el('h2', { class: 'asec-title', text: t('assistant.cleanupTitle') })]),
      el('p', { class: 'ask-text', text: t('assistant.cleanupNone') }),
    ]);
  }

  return el('section', { class: 'asec gl' }, [
    el('div', { class: 'asec-head' }, [
      el('h2', { class: 'asec-title', text: t('assistant.cleanupTitle') }),
    ]),
    el('p', { class: 'asec-sub', text: t('assistant.cleanupSub') }),
    el('div', { class: 'task-list' }, tasks.map((task) => el('div', { class: `task ${task.priority}` }, [
      task.priority === 'high' ? el('div', { class: 'task-flag', text: t('assistant.highPriority') }) : null,
      el('div', { class: 'task-title', text: task.title }),
      el('div', { class: 'task-detail', text: task.detail }),
      el('div', { class: 'task-foot' }, [
        task.gain ? el('span', { class: 'task-gain', text: t('assistant.points', { count: task.gain }) }) : null,
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
  const groups = (health.duplicates || []).filter((group) => !dismissed.has(group.key));
  return [
    el('div', { class: 'asec-nav' }, [
      el('button', { class: 'nback', type: 'button', text: t('assistant.back'), onClick: () => { state.screen = 'home'; renderAssistant(); } }),
    ]),
    el('section', { class: 'asec gl' }, [
      el('div', { class: 'asec-head' }, [el('h2', { class: 'asec-title', text: t('assistant.rowDuplicates') })]),
      el('p', { class: 'asec-sub', text: t('assistant.dupSub') }),
      groups.length
        ? el('div', { class: 'dup-list' }, groups.map(duplicateGroup))
        : emptyState('✓', t('assistant.dupNone'), t('assistant.dupNoneSub')),
    ]),
  ];
}

/**
 * One pair of possible duplicates, side by side where there is room to put
 * them side by side and stacked where there is not — because the comparison
 * *is* the interface. Two cards a scroll apart are two records; two cards
 * next to each other are a question you can answer.
 *
 * Four actions, and none of them destroys anything: open either one, fold the
 * quantity of the second into the first, or say they are two different things
 * and stop being asked. Merging automatically would lose an owner's record of
 * something they own, which is the one mistake this product cannot make.
 */
function duplicateGroup(group) {
  const [first, second, ...rest] = group.items;
  return el('div', { class: 'dup-group' }, [
    el('div', { class: 'dup-head' }, [
      el('span', { class: `dup-badge dup-${group.confidence}`, text: group.label }),
      // Every signal that linked these records, not just the strongest. "Same
      // barcode" alone reads as certainty; "same barcode, and the same name"
      // is the evidence, and it is what lets the owner decide.
      el('span', { class: 'dup-reason', text: group.reason }),
    ]),
    el('div', { class: 'dup-pair' }, [
      duplicateSide(first, t('assistant.dupFirst')),
      second ? duplicateSide(second, t('assistant.dupSecond')) : null,
    ]),
    rest.length ? el('div', { class: 'dup-rest' }, rest.map(resultCard)) : null,
    el('div', { class: 'dup-acts' }, [
      el('button', { class: 'chipbtn', type: 'button', text: t('assistant.openFirst'), onClick: () => openDetail(first.id) }),
      second ? el('button', { class: 'chipbtn', type: 'button', text: t('assistant.openSecond'), onClick: () => openDetail(second.id) }) : null,
      second ? el('button', {
        class: 'chipbtn', type: 'button', text: t('assistant.addQuantity'),
        title: t('assistant.addQuantityHint'),
        onClick: () => openItemForm({ itemId: first.id }),
      }) : null,
      el('button', {
        class: 'chipbtn', type: 'button', text: t('assistant.keepSeparate'),
        onClick: () => { dismissed.add(group.key); renderAssistant(); },
      }),
    ]),
  ]);
}

function duplicateSide(item, label) {
  if (!item) return null;
  return el('div', { class: 'dup-side' }, [
    el('div', { class: 'dup-side-lbl', text: label }),
    resultCard(item),
  ]);
}

/** Pairs the customer has already said are two different things. */
const dismissed = new Set();

// ── quick actions ──────────────────────────────────────────────────────────
function quickActions() {
  // `icon` was the parameter name here, which shadowed the icon() helper this
  // module now imports. Renamed rather than aliased: a shadowed import is the
  // kind of thing that works until someone adds a second call.
  const action = (iconName, label, onClick) => el('button', { class: 'qa', type: 'button', onClick }, [
    el('span', { class: 'qa-ico' }, [icon(iconName, { size: 20 })]),
    el('span', { class: 'qa-label', text: label }),
  ]);

  return el('div', { class: 'qa-row' }, [
    action('image', t('assistant.qaPhoto'), () => openItemForm({})),
    action('duplicate', t('assistant.qaDuplicates'), () => { state.screen = 'duplicates'; renderAssistant(); }),
    action('eye', t('assistant.qaNoPhotos'), () => ACTIONS['review-missing-images']()),
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
      assistantTitle(),
    ]),
  ]);
}

// Language is presentation: the question stays as typed, and the answer is
// worked out again so its words — not its items — follow the language.
onLanguageChange(() => {
  bindAssistant();
  if (state.result) {
    state.result = askInventory(state.question, { items: repository.liveItems(), lookups: lookups() });
  }
  if ($('ai-scroll')?.childElementCount) renderAssistant();
});
