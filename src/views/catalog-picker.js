// The searchable catalog picker: one sheet for every catalog field and for
// the quick year picker.
//
//   [ 🔍 ابحث عن الشركة… ]          focused at once
//   المستخدمة مؤخراً                 this device only
//   الكل / نتائج البحث               a bounded page, «عرض المزيد» for more
//   + إضافة مصنع غير موجود           always there — nobody is trapped in the catalog
//
// Results are real buttons in a list with `aria-pressed` for the current
// value, and a live region announces how many a search found. Only a page is
// ever rendered — a catalog of thousands never becomes thousands of rows.
// When the catalog cannot be searched, manual entry still works: a search
// failure never stops an item from being saved.

import { t } from '../i18n.js';
import { catalogService } from '../catalog/service.js';
import { DOMAINS } from '../catalog/model.js';
import { $, debounce, describeError, el, normalizeDigits, render } from '../utils.js';
import { closeSheet, isSheetOpen, openSheet, toast, toastError } from '../ui.js';
import { repository } from '../repository.js';

const PAGE = 30;
let session = null;

/**
 * @param {{mode?: 'catalog'|'year', noun?: string, domain?: string, entityType?: string,
 *   parentId?: string|null, ancestorId?: string|null, browse?: boolean, wholeDomain?: boolean,
 *   selected?: {ref, label}|number|null, yearMin?: number, yearMax?: number,
 *   onPick: (choice: {entity}|{manual: string}|{clear: true}|{year: number}) => void}} options
 *   `browse: false` shows no list until the customer searches — a parent
 *   entered by hand says nothing about which children apply.
 */
export function openCatalogPicker(options) {
  session = { mode: 'catalog', browse: true, query: '', limit: PAGE, creating: null, ...options };
  const title = session.mode === 'year' ? t('catalog.year.pick') : t(`catalog.pick.${session.noun}`);
  $('catpick-title').textContent = title;
  const search = $('catpick-search');
  search.value = '';
  search.inputMode = session.mode === 'year' ? 'numeric' : 'search';
  search.placeholder = session.mode === 'year' ? t('catalog.year.search')
    : session.wholeDomain ? t('catalog.searchWhole') : t(`catalog.search.${session.noun}`);
  search.setAttribute('aria-label', search.placeholder);
  $('catpick-status').textContent = '';
  void draw();
  openSheet('catpick', { focus: '#catpick-search' });
}

function finish(choice) {
  const done = session?.onPick;
  const spec = session;
  closeSheet('catpick');
  if (choice.entity && spec?.mode === 'catalog') {
    catalogService.recordUse({ domain: spec.domain, entityType: choice.entity.entityType, parentId: choice.entity.parentId }, choice.entity.id);
  }
  session = null;
  done?.(choice);
}

const announce = debounce((count) => {
  const status = $('catpick-status');
  if (status) status.textContent = t('catalog.count', { count });
}, 250);

function isSelected(entity) {
  const selected = session.selected;
  return Boolean(selected && typeof selected === 'object' && selected.ref === entity.id);
}

function option(item) {
  const { entity } = item;
  const selected = isSelected(entity);
  const custom = entity.source === 'custom';
  const path = item.path?.length ? t('catalog.inPath', { path: item.path.join(' › ') }) : '';
  return el('li', { class: 'catpick-li' }, [
    el('button', {
      type: 'button', class: `tax-opt catpick-opt${selected ? ' on' : ''}`, 'aria-pressed': String(selected),
      dataset: { id: entity.id }, onClick: () => finish({ entity }),
    }, [
      el('span', { class: 'catpick-text' }, [
        el('span', { class: 'tax-name', dir: 'auto', text: item.label }),
        path || custom ? el('span', { class: 'catpick-meta', dir: 'auto', text: [path, custom ? t('catalog.custom') : ''].filter(Boolean).join(' · ') }) : null,
      ]),
      selected ? el('span', { class: 'tax-check', 'aria-hidden': 'true', text: '✓' }) : null,
    ]),
    custom && repository.canWrite() ? el('span', { class: 'catpick-own' }, [
      el('button', { type: 'button', class: 'catpick-act', text: t('catalog.rename'), 'aria-label': `${t('catalog.rename')} — ${item.label}`, onClick: () => rename(entity, item.label) }),
      el('button', { type: 'button', class: 'catpick-act', text: t('catalog.retire'), 'aria-label': `${t('catalog.retire')} — ${item.label}`, onClick: () => retire(entity) }),
    ]) : null,
  ]);
}

function list(items) {
  return el('ul', { class: 'tax-list', role: 'list' }, items.map(option));
}

function section(title, items) {
  if (!items.length) return null;
  return el('div', { class: 'tax-sec' }, [title ? el('h3', { class: 'tax-sec-title', text: title }) : null, list(items)]);
}

async function draw() {
  if (!session) return;
  const mine = session;
  if (session.mode === 'year') { drawYears(); return; }
  const query = session.query.trim();
  const children = [];
  if (session.selected && !query) {
    children.push(el('ul', { class: 'tax-list', role: 'list' }, [el('li', {}, [el('button', {
      type: 'button', class: 'tax-opt tax-clear', onClick: () => finish({ clear: true }),
    }, [el('span', { class: 'tax-name', text: t('catalog.none') })])])]));
  }

  const types = session.wholeDomain ? DOMAINS[session.domain].types : [session.entityType];
  let page = null;
  let failed = false;
  try {
    if (query) {
      page = await catalogService.search({
        domain: session.domain, types, parentId: session.parentId, ancestorId: session.ancestorId, query, limit: session.limit,
      });
    } else if (session.browse) {
      page = await catalogService.search({
        domain: session.domain, entityType: session.entityType, parentId: session.parentId, ancestorId: session.ancestorId, limit: session.limit,
      });
    }
  } catch (error) {
    console.error('[catalog] search failed', error);
    failed = true;
  }
  if (mine !== session) return;

  if (failed) {
    children.push(el('p', { class: 'tax-empty', role: 'alert', text: t('catalog.unavailable') }));
  } else if (query) {
    if (page.items.length) children.push(section(t('catalog.results'), page.items));
    else children.push(el('p', { class: 'tax-empty', text: t('catalog.noResults') }));
    announce(page.total);
  } else {
    const recent = catalogService.recent({ domain: session.domain, entityType: session.entityType, parentId: session.parentId })
      .filter((entity) => !session.parentId || entity.parentId === session.parentId)
      .filter((entity) => !session.ancestorId || catalogService.isWithin(entity.id, session.ancestorId))
      .slice(0, 5)
      .map((entity) => ({ entity, label: catalogService.label(entity), path: [] }));
    children.push(section(t('catalog.recent'), recent));
    if (page?.items.length) children.push(section(recent.length ? t('catalog.all') : null, page.items));
    else if (!recent.length) {
      children.push(el('p', { class: 'tax-empty', text: t('catalog.emptyLevel') }));
    }
  }
  if (page?.nextCursor) {
    children.push(el('button', {
      type: 'button', class: 'tax-add', text: t('catalog.loadMore'),
      onClick: () => { session.limit += PAGE; void draw(); },
    }));
  }
  children.push(createArea(query));
  render($('catpick-body'), children.filter(Boolean));
}

// ── years ──────────────────────────────────────────────────────────────────

function drawYears() {
  const max = session.yearMax ?? new Date().getFullYear() + 1;
  const min = session.yearMin ?? 1600;
  const digits = normalizeDigits(session.query).replace(/\D/g, '');
  const years = [];
  // Generated, never stored: newest first, a page at a time.
  for (let year = max; year >= min && years.length < session.limit; year -= 1) {
    if (!digits || String(year).startsWith(digits)) years.push(year);
  }
  const typed = Number(digits);
  const children = [];
  if (session.selected) {
    children.push(el('ul', { class: 'tax-list', role: 'list' }, [el('li', {}, [el('button', {
      type: 'button', class: 'tax-opt tax-clear', onClick: () => finish({ clear: true }),
    }, [el('span', { class: 'tax-name', text: t('catalog.none') })])])]));
  }
  if (digits.length === 4 && typed >= min && typed <= max && !years.includes(typed)) years.unshift(typed);
  children.push(el('ul', { class: 'tax-list catpick-years', role: 'list' }, years.map((year) => el('li', {}, [el('button', {
    type: 'button', class: `tax-opt${session.selected === year ? ' on' : ''}`, 'aria-pressed': String(session.selected === year),
    onClick: () => finish({ year }),
  }, [el('span', { class: 'tax-name', dir: 'ltr', text: String(year) })])]))));
  if (years.length >= session.limit) {
    children.push(el('button', { type: 'button', class: 'tax-add', text: t('catalog.loadMore'), onClick: () => { session.limit += 60; drawYears(); } }));
  }
  render($('catpick-body'), children);
}

// ── manual and customer entries ────────────────────────────────────────────

function createArea(query) {
  if (!session.creating) {
    const buttons = [el('button', {
      type: 'button', class: 'tax-add', id: 'catpick-add',
      text: query ? t('catalog.addQuery', { query }) : t(`catalog.add.${session.noun}`),
      onClick: () => { session.creating = { name: query, step: 'form' }; void draw(); setTimeout(() => $('catpick-new')?.focus(), 0); },
    })];
    return el('div', { class: 'catpick-create' }, buttons);
  }
  const state = session.creating;
  const input = el('input', {
    id: 'catpick-new', dir: 'auto', maxlength: '160', autocomplete: 'off', enterkeyhint: 'done', value: state.name || '',
    'aria-label': t(`catalog.add.${session.noun}`),
    onInput: (event) => { state.name = event.target.value; state.checked = null; },
    onKeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); void confirmCreate(); } },
  });
  const rows = [el('div', { class: 'frow' }, [el('label', { for: 'catpick-new', text: t('catalog.renamePrompt') }), input])];
  const checked = state.checked;
  if (checked?.exact) {
    const label = catalogService.label(checked.exact);
    rows.push(el('p', { class: 'sheet-note', role: 'status', text: t('catalog.exists', { name: label }) }));
    rows.push(el('div', { class: 'tax-create-acts' }, [
      el('button', { type: 'button', class: 'btn btn-p', text: t('catalog.useExisting', { name: label }), onClick: () => finish({ entity: checked.exact }) }),
    ]));
  } else if (checked?.similar?.length && !state.acceptSimilar) {
    rows.push(el('p', { class: 'sheet-note', text: t('catalog.similar') }));
    rows.push(list(checked.similar.map((entity) => ({ entity, label: catalogService.label(entity), path: [] }))));
    rows.push(el('div', { class: 'tax-create-acts' }, [
      el('button', { type: 'button', class: 'btn btn-g', text: t('catalog.addAnyway'), onClick: () => { state.acceptSimilar = true; void draw(); } }),
    ]));
  } else if (checked) {
    rows.push(el('p', { class: 'sheet-note', role: 'status', text: t(`catalog.confirm.${session.noun}`, { name: state.name.trim() }) }));
  }
  rows.push(el('div', { class: 'field-hint', id: 'catpick-error', role: 'alert' }));
  if (!checked?.exact) {
    rows.push(el('div', { class: 'tax-create-acts' }, [
      el('button', { type: 'button', class: 'btn btn-g', text: t('fields.cancel'), onClick: () => { session.creating = null; void draw(); } }),
      el('button', { type: 'button', class: 'btn btn-g', id: 'catpick-oneoff', text: t('catalog.oneOff'), title: t('catalog.oneOffHint'), onClick: useOnce }),
      el('button', { type: 'button', class: 'btn btn-p', id: 'catpick-confirm', text: t('catalog.addConfirmButton'), onClick: () => void confirmCreate() }),
    ]));
  }
  return el('div', { class: 'tax-create catpick-form' }, rows);
}

function useOnce() {
  const name = (session.creating?.name || '').trim();
  if (!name) { $('catpick-error').textContent = t('catalog.nameRequired'); return; }
  finish({ manual: name });
}

/**
 * First press: look for an existing entry (exact → offered instead; similar →
 * suggested). Second press: create the customer's own entry. A catalog that
 * cannot be written (a read-only member) still allows a one-off value.
 */
async function confirmCreate() {
  const state = session.creating;
  const name = (state.name || '').trim();
  if (!name) { $('catpick-error').textContent = t('catalog.nameRequired'); return; }
  const spec = { domain: session.domain, entityType: session.entityType, parentId: session.parentId || null, label: name };
  if (!state.checked) {
    state.checked = catalogService.findDuplicates(spec);
    void draw();
    return;
  }
  if (!repository.canWrite()) { useOnce(); return; }
  try {
    const result = await catalogService.createCustom(spec);
    if (result.duplicate) { finish({ entity: result.duplicate }); return; }
    toast(t('taxonomy.created', { name }), '✓');
    finish({ entity: result.entity });
  } catch (error) {
    const box = $('catpick-error');
    if (box) box.textContent = describeError(error);
  }
}

async function rename(entity, current) {
  session.creating = null;
  const body = $('catpick-body');
  const input = el('input', { id: 'catpick-rename', dir: 'auto', maxlength: '160', value: current, 'aria-label': t('catalog.renamePrompt') });
  render(body, [el('div', { class: 'tax-create' }, [
    el('div', { class: 'frow' }, [el('label', { for: 'catpick-rename', text: t('catalog.renamePrompt') }), input]),
    el('div', { class: 'field-hint', id: 'catpick-error', role: 'alert' }),
    el('div', { class: 'tax-create-acts' }, [
      el('button', { type: 'button', class: 'btn btn-g', text: t('fields.cancel'), onClick: () => void draw() }),
      el('button', {
        type: 'button', class: 'btn btn-p', text: t('common.save'),
        onClick: async () => {
          try {
            await catalogService.renameCustom(entity.id, input.value);
            toast(t('catalog.renamed'), '✓');
            void draw();
          } catch (error) {
            $('catpick-error').textContent = describeError(error);
          }
        },
      }),
    ]),
  ])]);
  input.focus();
}

async function retire(entity) {
  try {
    const result = await catalogService.retireCustom(entity.id);
    if (result.inUse) { toast(t('catalog.inUse', { count: result.inUse }), 'ℹ'); return; }
    toast(t('catalog.retired'), '✓');
    void draw();
  } catch (error) {
    toastError(error);
  }
}

export function bindCatalogPicker() {
  const run = debounce(() => { if (session) void draw(); }, 80);
  $('catpick-search')?.addEventListener('input', (event) => {
    if (!session) return;
    session.query = event.target.value;
    session.limit = session.mode === 'year' ? 60 : PAGE;
    session.creating = null;
    run();
  });
  $('catpick-search')?.addEventListener('keydown', (event) => {
    // Enter picks the single best match: fast for a reference typed in full.
    if (event.key !== 'Enter' || !session) return;
    event.preventDefault();
    const first = $('catpick-body')?.querySelector('.catpick-opt, .catpick-years .tax-opt');
    first?.click();
  });
}

export function isCatalogPickerOpen() {
  return isSheetOpen('catpick');
}
