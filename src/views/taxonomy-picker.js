// The classification picker: one sheet, one level at a time.
//
//   Main Category → the Categories under it → its Subcategories, if any.
//
// Searchable in Arabic and English (labels and aliases, from the index the
// taxonomy service built once), with recently used and pinned nodes first,
// the customer's hidden Main Categories one tap away, and a way to add a new
// node right where it is missing. Options are real buttons in a list — not
// clickable divs — with `aria-pressed` for the current value and a live
// region that announces how many results a search found.

import { loadPrefs, savePrefs } from '../local-store.js';
import { onLanguageChange, t } from '../i18n.js';
import { repository } from '../repository.js';
import { LEVELS } from '../taxonomy.js';
import { $, debounce, describeError, el, render } from '../utils.js';
import { closeSheet, isSheetOpen, openSheet, toast, toastError } from '../ui.js';

const RECENT_KEY = 'taxonomyRecent';
const RECENT_MAX = 5;

let session = null;

/** Nodes used recently at a level, newest first. Local to this device only. */
function recentIds(level) {
  const list = loadPrefs()[RECENT_KEY]?.[level];
  return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
}

/** Remembers a choice for the «المستخدمة مؤخراً» row. Nothing leaves the device. */
export function rememberRecent(level, id) {
  if (!id || !level) return;
  const prefs = loadPrefs();
  const all = prefs[RECENT_KEY] && typeof prefs[RECENT_KEY] === 'object' ? prefs[RECENT_KEY] : {};
  all[level] = [id, ...recentIds(level).filter((other) => other !== id)].slice(0, RECENT_MAX);
  savePrefs({ ...prefs, [RECENT_KEY]: all });
}

const TITLES = {
  [LEVELS.MAIN]: 'taxonomy.chooseMain',
  [LEVELS.CATEGORY]: 'taxonomy.chooseCategory',
  [LEVELS.SUB]: 'taxonomy.chooseSubcategory',
};

const ADD_LABEL = {
  [LEVELS.MAIN]: 'taxonomy.addMain',
  [LEVELS.CATEGORY]: 'taxonomy.addCategory',
  [LEVELS.SUB]: 'taxonomy.addSubcategory',
};

/**
 * Opens the picker.
 *
 * @param {{level: string, parentId?: string|null, selectedId?: string|null,
 *          clearLabel?: string|null, create?: boolean,
 *          onPick: (id: string|null) => void}} options
 *   `clearLabel` offers a "none" choice with that label; `create` opens
 *   straight on the add-new form.
 */
export function openTaxonomyPicker(options) {
  session = { query: '', creating: Boolean(options.create), ...options };
  $('tax-title').textContent = t(TITLES[session.level]);
  const search = $('tax-search');
  search.value = '';
  search.placeholder = t(session.level === LEVELS.MAIN ? 'taxonomy.searchMain' : 'taxonomy.searchCategory');
  search.setAttribute('aria-label', search.placeholder);
  $('tax-status').textContent = '';
  draw();
  openSheet('tax', { focus: session.creating ? '#tax-new-name' : '#tax-search' });
}

function pool() {
  const taxonomy = repository.taxonomy();
  const keep = session.selectedId ? [session.selectedId] : [];
  if (session.level === LEVELS.MAIN) return taxonomy.mainCategories({ keep });
  if (session.level === LEVELS.CATEGORY) return taxonomy.categories(session.parentId, { keep });
  return taxonomy.subcategories(session.parentId, { keep });
}

/**
 * Hands the choice back. From the Main Category step a search may have picked
 * a Category directly; the caller receives the node's level with it.
 */
function pick(id) {
  const done = session?.onPick;
  const node = id ? repository.taxonomy().node(id) : null;
  const level = node?.level || session?.level;
  closeSheet('tax');
  if (id) rememberRecent(level, id);
  done?.(id, level);
}

function optionButton(node, { selected }) {
  const taxonomy = repository.taxonomy();
  const label = taxonomy.label(node);
  return el('li', {}, [el('button', {
    type: 'button',
    class: `tax-opt${selected ? ' on' : ''}`,
    'aria-pressed': String(selected),
    dataset: { id: node.id },
    onClick: () => pick(node.id),
  }, [
    el('span', { class: 'tax-ico', 'aria-hidden': 'true', text: taxonomy.icon(node) }),
    el('span', { class: 'tax-name', dir: 'auto', text: label }),
    selected ? el('span', { class: 'tax-check', 'aria-hidden': 'true', text: '✓' }) : null,
  ])]);
}

function section(title, nodes) {
  if (!nodes.length) return null;
  return el('div', { class: 'tax-sec' }, [
    title ? el('h3', { class: 'tax-sec-title', text: title }) : null,
    el('ul', { class: 'tax-list', role: 'list' }, nodes.map((node) => optionButton(node, { selected: node.id === session.selectedId }))),
  ]);
}

function draw() {
  if (!session) return;
  const taxonomy = repository.taxonomy();
  const nodes = pool();
  const query = session.query.trim();
  const children = [];

  if (query) {
    const matches = new Set(taxonomy.search(query, {
      level: session.level, parentId: session.level === LEVELS.MAIN ? null : session.parentId,
    }).map((node) => node.id));
    const found = nodes.filter((node) => matches.has(node.id));
    // From the Main Category step, a search also reaches the Categories:
    // «مولد» or "generator" is one tap away, and picks both levels at once.
    const deep = session.level === LEVELS.MAIN
      ? taxonomy.search(query, { level: LEVELS.CATEGORY }).filter((node) => !taxonomy.mainOf(node)?.hidden).slice(0, 20)
      : [];
    if (found.length) children.push(section(deep.length ? t('taxonomy.mains') : null, found));
    if (deep.length) {
      children.push(el('div', { class: 'tax-sec' }, [
        el('h3', { class: 'tax-sec-title', text: t('taxonomy.categories') }),
        el('ul', { class: 'tax-list', role: 'list' }, deep.map((node) => el('li', {}, [el('button', {
          type: 'button', class: 'tax-opt', dataset: { id: node.id }, onClick: () => pick(node.id),
        }, [
          el('span', { class: 'tax-ico', 'aria-hidden': 'true', text: taxonomy.icon(node) }),
          el('span', { class: 'tax-name', dir: 'auto', text: `${taxonomy.label(taxonomy.mainOf(node))} › ${taxonomy.label(node)}` }),
        ])]))),
      ]));
    }
    if (!found.length && !deep.length) children.push(el('p', { class: 'tax-empty', text: t('taxonomy.noResults') }));
    announce(found.length + deep.length);
  } else {
    if (session.clearLabel) {
      children.push(el('ul', { class: 'tax-list', role: 'list' }, [el('li', {}, [el('button', {
        type: 'button', class: `tax-opt tax-clear${session.selectedId ? '' : ' on'}`,
        'aria-pressed': String(!session.selectedId),
        onClick: () => pick(null),
      }, [el('span', { class: 'tax-name', text: session.clearLabel })])])]));
    }
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const pinned = nodes.filter((node) => node.pinned);
    const recent = recentIds(session.level).map((id) => byId.get(id)).filter((node) => node && !node.pinned);
    children.push(section(t('taxonomy.pinned'), pinned));
    children.push(section(t('taxonomy.recent'), recent));
    if (nodes.length) {
      children.push(section(pinned.length || recent.length ? t('taxonomy.all') : null, nodes));
    } else if (session.level !== LEVELS.MAIN) {
      children.push(el('div', { class: 'tax-empty-state' }, [
        el('p', { class: 'tax-empty', text: t('taxonomy.emptyCategories') }),
        session.creating ? null : el('button', {
          type: 'button', class: 'btn btn-s', text: t('taxonomy.addCategoryCta'),
          onClick: () => { session.creating = true; draw(); $('tax-new-name')?.focus(); },
        }),
      ]));
    }
    if (session.level === LEVELS.MAIN) {
      const hidden = taxonomy.mainCategories({ includeHidden: true }).filter((node) => node.hidden);
      if (hidden.length) {
        children.push(el('div', { class: 'tax-sec' }, [
          el('h3', { class: 'tax-sec-title', text: t('taxonomy.hiddenMains') }),
          el('ul', { class: 'tax-list', role: 'list' }, hidden.map((node) => el('li', {}, [el('button', {
            type: 'button', class: 'tax-opt tax-hidden',
            'aria-label': `${taxonomy.label(node)} — ${t('taxonomy.showHidden')}`,
            onClick: () => showHidden(node.id),
          }, [
            el('span', { class: 'tax-ico', 'aria-hidden': 'true', text: taxonomy.icon(node) }),
            el('span', { class: 'tax-name', dir: 'auto', text: taxonomy.label(node) }),
            el('span', { class: 'tax-meta', text: t('taxonomy.showHidden') }),
          ])]))),
        ]));
      }
    }
  }

  children.push(createArea());
  render($('tax-body'), children.filter(Boolean));
}

const announce = debounce((count) => {
  const status = $('tax-status');
  if (status) status.textContent = t('taxonomy.results', { count });
}, 250);

async function showHidden(id) {
  try {
    await repository.setTaxonomyNodeHidden(id, false);
    pick(id);
  } catch (error) {
    toastError(error);
  }
}

function createArea() {
  if (!repository.canWrite()) return null;
  if (!session.creating) {
    return el('button', {
      type: 'button', class: 'tax-add', text: t(ADD_LABEL[session.level]),
      onClick: () => { session.creating = true; draw(); $('tax-new-name')?.focus(); },
    });
  }
  const input = el('input', {
    id: 'tax-new-name', dir: 'auto', maxlength: '120', autocomplete: 'off', enterkeyhint: 'done',
    placeholder: t(session.level === LEVELS.MAIN ? 'taxonomy.newMainPlaceholder' : 'taxonomy.newCategoryPlaceholder'),
    onKeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); create(); } },
  });
  return el('div', { class: 'tax-create' }, [
    el('div', { class: 'frow' }, [el('label', { for: 'tax-new-name', text: t('taxonomy.newName') }), input]),
    el('div', { class: 'field-hint', id: 'tax-new-error', role: 'alert' }),
    el('div', { class: 'tax-create-acts' }, [
      el('button', { type: 'button', class: 'btn btn-g', text: t('fields.cancel'), onClick: () => { session.creating = false; draw(); } }),
      el('button', { type: 'button', class: 'btn btn-p', text: t('taxonomy.create'), onClick: create }),
    ]),
  ]);
}

async function create() {
  const name = $('tax-new-name')?.value || '';
  try {
    const id = await repository.createTaxonomyNode({
      level: session.level, parentId: session.level === LEVELS.MAIN ? null : session.parentId, name,
    });
    toast(t('taxonomy.created', { name: name.trim() }), '✓');
    pick(id);
  } catch (error) {
    const box = $('tax-new-error');
    if (box && error?.messageKey) box.textContent = describeError(error);
    else toastError(error);
  }
}

onLanguageChange(() => {
  if (!session || !isSheetOpen('tax')) return;
  $('tax-title').textContent = t(TITLES[session.level]);
  draw();
});

export function bindTaxonomyPicker() {
  $('tax-search').addEventListener('input', (event) => {
    if (!session) return;
    session.query = event.target.value;
    draw();
  });
  repository.subscribe(() => { if (isSheetOpen('tax')) draw(); });
}
