// Inventory view: stats, folders, category pills, grid/list, pagination,
// filter and sort sheets, and the long-press context menu.

import { CONDITIONS, PAGE_SIZE, UNCATEGORIZED_ID } from '../config.js';
import { repository } from '../repository.js';
import { quotaStatus } from '../subscription.js';
import { bindImageSrc } from '../storage.js';
import {
  EMPTY_FILTERS, SORT_MODES, activeFilterCount, clampPage, paginationModel, queryItems,
} from '../search.js';
import { $, appendChildren, debounce, el, formatNumber, render, setText } from '../utils.js';
import { formatValuation, primaryImage } from '../validation.js';
import { closeSheet, emptyState, openSheet, optionList, toast } from '../ui.js';
import { openDetail, openMoveSheet, openQuickPreview, deleteItemFlow, duplicateItemFlow } from './detail.js';
import { openItemForm } from './item-form.js';
import { openPlansSheet } from './plans.js';
import { symbolNode } from './mark.js';

export const view = {
  page: 1,
  grid: true,
  categoryPill: 'all',
  sortMode: 'newest',
  query: '',
  filters: { ...EMPTY_FILTERS },
  folderId: null,
};

let contextItemId = null;

export function setGridMode(grid) {
  view.grid = grid;
  $('tg')?.setAttribute('aria-pressed', String(grid));
  $('tl')?.setAttribute('aria-pressed', String(!grid));
  $('tg').style.background = grid ? 'rgba(0,122,255,.15)' : '';
  $('tl').style.background = grid ? '' : 'rgba(0,122,255,.15)';
  renderHome();
}

export function enterFolder(id) {
  view.folderId = id;
  view.page = 1;
  view.categoryPill = 'all';
  renderHome();
  $('hscroll')?.scrollTo(0, 0);
}

export function exitFolder() {
  view.folderId = null;
  view.page = 1;
  view.categoryPill = 'all';
  renderHome();
  $('hscroll')?.scrollTo(0, 0);
}

// Any change to the result set invalidates the current page index.
function resetPage() {
  view.page = 1;
}

// ── stats ──
function renderStats() {
  const items = repository.liveItems();
  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const analyzed = items.filter((i) => i.aiData).length;
  const valued = items.filter((i) => i.valuation).length;
  const categories = new Set(items.map((i) => i.categoryId).filter(Boolean)).size;
  const folders = repository.state.folders.length;

  setText('s-total', formatNumber(items.length));
  setText('s-cats', `${formatNumber(totalQuantity)} وحدة · ${categories} تصنيف`);
  setText('s-folds', formatNumber(folders));
  setText('s-foldsub', `${formatNumber(repository.trashedItems().length)} في المحذوفات`);
  setText('s-ai', formatNumber(analyzed));
  setText('s-aipct', items.length ? `${Math.round((analyzed / items.length) * 100)}%` : '0%');
  setText('s-price', formatNumber(valued));
  setText('s-pricepct', items.length ? `${Math.round((valued / items.length) * 100)}%` : '0%');
}

// ── folders ──
function folderCard(folder) {
  const count = repository.liveItems().filter((i) => i.folderId === folder.id).length;
  const color = folder.color || '#007AFF';
  return el('button', {
    class: 'fld-card gl-s',
    type: 'button',
    'aria-label': `${folder.name}، ${count} قطعة`,
    onClick: () => enterFolder(folder.id),
  }, [
    el('div', { class: 'fld-card-bg', text: folder.icon, 'aria-hidden': 'true' }),
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', position: 'relative' } }, [
      el('div', { style: { fontSize: '28px' }, text: folder.icon, 'aria-hidden': 'true' }),
      el('div', {
        style: { background: `${color}22`, color, fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' },
        text: `${count} قطعة`,
      }),
    ]),
    el('div', { class: 'fld-card-name', text: folder.name }),
    folder.description ? el('div', { class: 'fld-card-count', text: folder.description }) : null,
  ]);
}

function renderFolders() {
  const row = $('fld-row');
  const section = $('folds-section');
  if (!row || !section) return;

  const folders = repository.state.folders;
  section.style.display = view.folderId ? 'none' : '';
  if (view.folderId) return;

  if (!folders.length) {
    row.style.display = 'none';
    render(row, []);
    return;
  }
  row.style.display = 'grid';
  render(row, [
    ...folders.map(folderCard),
    el('button', {
      class: 'fld-card fld-add gl-s',
      type: 'button',
      onClick: () => window.dispatchEvent(new CustomEvent('almakhzan:new-folder')),
    }, [el('span', { text: '+', 'aria-hidden': 'true' }), el('span', { text: 'مجلد جديد' })]),
  ]);
}

// ── item cards ──
function itemThumb(item, className) {
  const image = primaryImage(item);
  const category = repository.category(item.categoryId);
  if (!image) {
    return el('div', { class: className, text: category.icon, 'aria-hidden': 'true' });
  }
  const img = el('img', { alt: item.name || 'صورة القطعة', loading: 'lazy', decoding: 'async' });
  bindImageSrc(img, image, { thumbnail: true });
  return el('div', { class: className }, [img]);
}

function cardNode(item) {
  const category = repository.category(item.categoryId);
  const image = primaryImage(item);

  let imageNode;
  if (image) {
    const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
    bindImageSrc(img, image, { thumbnail: true });
    imageNode = img;
  } else {
    imageNode = el('div', { class: 'icph' }, [
      el('span', { text: category.icon, 'aria-hidden': 'true' }),
      el('span', { text: 'لا توجد صورة' }),
    ]);
  }

  return el('div', {
    class: 'icard gl-s',
    dataset: { id: item.id },
    role: 'button',
    tabindex: '0',
    'aria-label': `${item.name}، ${category.name}`,
    onClick: () => openDetail(item.id),
    onKeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(item.id); }
    },
  }, [
    el('div', { class: 'icimg' }, [
      imageNode,
      item.aiData ? el('div', {
        style: {
          position: 'absolute', bottom: '5px', left: '5px', background: 'rgba(102,126,234,.9)',
          color: 'white', fontSize: '9px', padding: '2px 6px', borderRadius: '20px', fontWeight: '700',
        },
        text: '✦',
        title: 'حُلِّلت بمساعد نَظْم',
      }) : null,
    ]),
    el('div', { class: 'icbody' }, [
      el('div', { class: 'icname', text: item.name || '—' }),
      el('div', { class: 'iccat', text: `${category.icon} ${category.name}` }),
      el('div', { class: 'icft' }, [
        el('div', { class: 'qbadge', text: `${formatNumber(item.quantity)} ${item.unit || ''}`.trim() }),
        item.valuation ? el('div', { class: 'tag tb', style: { fontSize: '10px' }, text: formatValuation(item.valuation, { compact: true }) }) : null,
      ]),
    ]),
  ]);
}

function rowNode(item) {
  const category = repository.category(item.categoryId);
  const folder = repository.folder(item.folderId);
  const subtitle = [`${category.icon} ${category.name}`, item.sku, folder ? `${folder.icon} ${folder.name}` : null]
    .filter(Boolean).join(' · ');

  return el('div', {
    class: 'litem',
    dataset: { id: item.id },
    role: 'button',
    tabindex: '0',
    'aria-label': item.name || 'قطعة',
    onClick: () => openDetail(item.id),
    onKeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(item.id); }
    },
  }, [
    itemThumb(item, 'lthumb'),
    el('div', { class: 'linfo' }, [
      el('div', { class: 'lname', text: item.name || '—' }),
      el('div', { class: 'lsub', text: subtitle }),
    ]),
    el('div', { style: { textAlign: 'left', flexShrink: '0' } }, [
      el('div', { class: 'lqty', text: formatNumber(item.quantity) }),
      el('div', { class: 'lunit', text: item.unit || '' }),
    ]),
    el('div', { class: 'lchev', text: '›', 'aria-hidden': 'true' }),
  ]);
}

// ── pills ──
function renderPills(scopeItems) {
  const container = $('hpills');
  if (!container) return;
  const used = repository.state.categories.filter((c) => scopeItems.some((i) => i.categoryId === c.id));
  const hasUncategorized = scopeItems.some((i) => !i.categoryId || i.categoryId === UNCATEGORIZED_ID);

  const pill = (id, label) => el('button', {
    class: `cpill${view.categoryPill === id ? ' on' : ''}`,
    type: 'button',
    'aria-pressed': String(view.categoryPill === id),
    onClick: () => { view.categoryPill = id; resetPage(); renderHome(); },
    text: label,
  });

  render(container, [
    pill('all', 'الكل'),
    ...used.map((c) => pill(c.id, `${c.icon} ${c.name}`)),
    hasUncategorized ? pill(UNCATEGORIZED_ID, '📦 غير مصنّف') : null,
  ]);
}

// ── plan quota banner ──
//
// A customer should learn they are running out at 70%, again at 90%, and never
// be surprised at record 51. Dismissing hides it until the level changes.
let dismissedQuotaLevel = null;

function renderQuotaBanner() {
  const banner = $('quota-banner');
  if (!banner) return;
  const quota = quotaStatus();

  if (!quota || quota.level === 'none' || quota.level === dismissedQuotaLevel) {
    banner.style.display = 'none';
    render(banner, []);
    return;
  }

  banner.style.display = 'flex';
  banner.className = `quota-banner ${quota.level}`;
  render(banner, [
    el('span', { class: 'qb-txt', text: quota.message }),
    el('button', {
      class: 'qb-act', type: 'button', text: 'عرض الباقات',
      onClick: () => { openPlansSheet(); },
    }),
    quota.level === 'full' ? null : el('button', {
      class: 'qb-close', type: 'button', text: '✕', 'aria-label': 'إخفاء',
      onClick: () => { dismissedQuotaLevel = quota.level; renderQuotaBanner(); },
    }),
  ]);
}

// ── active filters banner ──
function renderFilterBanner(searching) {
  const banner = $('active-filters');
  if (!banner) return;
  const count = activeFilterCount(view.filters);
  const pillActive = view.categoryPill !== 'all';
  const show = count > 0 || pillActive;

  banner.style.display = show ? 'flex' : 'none';
  if (!show) { render(banner, []); return; }

  const parts = [];
  if (count) parts.push(`${count} فلتر`);
  if (pillActive) parts.push(`تصنيف: ${repository.category(view.categoryPill).name}`);
  if (searching) parts.push('بحث شامل');

  render(banner, [
    el('span', { class: 'af-txt', text: `نتائج مُصفّاة — ${parts.join(' · ')}` }),
    el('button', {
      class: 'af-reset', type: 'button', text: 'إلغاء الفلاتر',
      onClick: () => { resetAllFilters(); },
    }),
  ]);
}

export function resetAllFilters() {
  view.filters = { ...EMPTY_FILTERS };
  view.categoryPill = 'all';
  resetPage();
  syncFilterControls();
  renderHome();
}

// ── pagination ──
function renderPagination(totalPages) {
  const container = $('hpag');
  if (!container) return;
  const model = paginationModel(view.page, totalPages);
  if (!model.length) { render(container, []); return; }

  const go = (page) => { view.page = page; renderHome(); $('hscroll')?.scrollTo(0, 0); };

  render(container, [
    el('button', {
      class: 'pbtn', type: 'button', text: '‹', 'aria-label': 'الصفحة السابقة',
      disabled: view.page <= 1 || undefined,
      onClick: () => go(view.page - 1),
    }),
    ...model.map((entry) => (entry.type === 'gap'
      ? el('span', { class: 'pgap', text: '…', 'aria-hidden': 'true' })
      : el('button', {
        class: `pbtn${entry.value === view.page ? ' on' : ''}`,
        type: 'button',
        text: formatNumber(entry.value),
        'aria-label': `صفحة ${entry.value}`,
        'aria-current': entry.value === view.page ? 'page' : undefined,
        onClick: () => go(entry.value),
      }))),
    el('button', {
      class: 'pbtn', type: 'button', text: '›', 'aria-label': 'الصفحة التالية',
      disabled: view.page >= totalPages || undefined,
      onClick: () => go(view.page + 1),
    }),
  ]);
}

// ── main render ──
export function renderHome() {
  const folder = view.folderId ? repository.folder(view.folderId) : null;
  if (view.folderId && !folder) { view.folderId = null; }

  renderStats();
  renderFolders();
  renderQuotaBanner();

  $('statsrow').style.display = view.folderId ? 'none' : 'grid';

  const { results, searching } = queryItems({
    items: repository.state.items,
    query: view.query,
    filters: view.filters,
    sortMode: view.sortMode,
    scope: { folderId: view.folderId },
    categoryPill: view.categoryPill,
    lookups: repository.lookups(),
  });

  // The pill list reflects what is reachable in the current scope, not the page.
  const scopeItems = searching
    ? repository.liveItems()
    : repository.liveItems().filter((i) => (view.folderId ? i.folderId === view.folderId : !i.folderId));
  renderPills(scopeItems);
  renderFilterBanner(searching);

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  view.page = clampPage(view.page, total, PAGE_SIZE);
  const pageItems = results.slice((view.page - 1) * PAGE_SIZE, view.page * PAGE_SIZE);

  setText('htitle', searching ? `نتائج البحث` : folder ? `${folder.icon} ${folder.name}` : 'القطع');
  setText('hcount', formatNumber(total));

  renderNavBar(folder);

  const empty = $('hempty');
  const grid = $('hgrid');
  const list = $('hlist');

  if (!total) {
    empty.style.display = 'flex';
    grid.style.display = 'none';
    list.style.display = 'none';
    render(grid, []);
    render(list, []);
    const filtered = activeFilterCount(view.filters) > 0 || view.categoryPill !== 'all';
    setText('hempty-title', searching ? 'لا نتائج للبحث' : filtered ? 'لا نتائج مطابقة' : folder ? `${folder.name} فارغ` : 'لا توجد قطع');
    setText('hempty-sub', searching || filtered ? 'جرّب تعديل البحث أو إلغاء الفلاتر' : 'اضغط + لإضافة قطعة');
    renderPagination(1);
    return;
  }

  empty.style.display = 'none';
  if (view.grid) {
    grid.style.display = 'grid';
    list.style.display = 'none';
    render(grid, pageItems.map(cardNode));
    render(list, []);
  } else {
    grid.style.display = 'none';
    list.style.display = '';
    render(list, pageItems.map(rowNode));
    render(grid, []);
  }

  renderPagination(totalPages);
}

function renderNavBar(folder) {
  const bar = $('home-nbar');
  if (!bar) return;

  const actions = el('div', { class: 'nacts' }, [
    folder ? el('button', {
      class: 'ibtn gls', type: 'button', text: '✎', style: { fontSize: '15px' },
      'aria-label': 'تعديل المجلد',
      onClick: () => window.dispatchEvent(new CustomEvent('almakhzan:edit-folder', { detail: folder.id })),
    }) : el('button', {
      class: 'ibtn gl', type: 'button', text: '↑', 'aria-label': 'تصدير واستيراد',
      onClick: () => openSheet('as'),
    }),
    el('button', {
      class: 'ibtn gl', type: 'button', text: '+', style: { fontSize: '22px', fontWeight: '300' },
      'aria-label': 'إضافة قطعة',
      onClick: () => openItemForm({ folderId: view.folderId }),
    }),
  ]);

  if (folder) {
    render(bar, [
      el('button', { class: 'nback', type: 'button', text: '‹ المخزون', onClick: exitFolder }),
      actions,
    ]);
  } else {
    render(bar, [
      el('div', { class: 'ntitle ntitle-brand' }, [
        // One quiet mark, not the whole logo: this is the customer's inventory,
        // not our billboard.
        symbolNode(26, { className: 'nazm-mark ntitle-mark' }),
        'المخزون',
        el('span', { id: 'syncDot', class: 'syncdot', role: 'status', 'aria-label': 'حالة المزامنة' }),
      ]),
      actions,
    ]);
    window.dispatchEvent(new CustomEvent('almakhzan:sync-refresh'));
  }
}

// ── filter + sort sheets ──
export function openFilterSheet() {
  optionList($('fp-cond'), [
    { value: '', label: 'الكل' },
    ...CONDITIONS.map((c) => ({ value: c, label: c })),
  ], view.filters.condition);

  optionList($('fp-folder'), [
    { value: '', label: 'الكل' },
    { value: '__root__', label: '📦 المخزون الرئيسي' },
    ...repository.state.folders.map((f) => ({ value: f.id, label: `${f.icon} ${f.name}` })),
  ], view.filters.folderId);

  optionList($('fp-loc'), [
    { value: '', label: 'الكل' },
    ...repository.state.locations.map((l) => ({ value: l.id, label: l.name })),
  ], view.filters.locationId);

  optionList($('fp-ai'), [
    { value: '', label: 'الكل' },
    { value: 'yes', label: 'مُحلّلة فقط' },
    { value: 'no', label: 'غير مُحلّلة' },
  ], view.filters.ai);

  optionList($('fp-price'), [
    { value: '', label: 'الكل' },
    { value: 'yes', label: 'لها تقييم' },
    { value: 'no', label: 'بدون تقييم' },
  ], view.filters.valuation);

  openSheet('filter');
}

export function applyFilterControls() {
  view.filters = {
    condition: $('fp-cond')?.value || '',
    folderId: $('fp-folder')?.value || '',
    locationId: $('fp-loc')?.value || '',
    categoryId: '',
    ai: $('fp-ai')?.value || '',
    valuation: $('fp-price')?.value || '',
  };
  resetPage();
  syncFilterControls();
  renderHome();
}

export function syncFilterControls() {
  const count = activeFilterCount(view.filters);
  const button = $('filter-btn');
  const badge = $('filter-badge');
  if (button) button.className = `fsact-btn gl-s${count ? ' has-filters' : ''}`;
  if (badge) badge.textContent = String(count);

  const fields = {
    'fp-cond': view.filters.condition,
    'fp-folder': view.filters.folderId,
    'fp-loc': view.filters.locationId,
    'fp-ai': view.filters.ai,
    'fp-price': view.filters.valuation,
  };
  for (const [id, value] of Object.entries(fields)) {
    const node = $(id);
    if (node) node.value = value;
  }
}

export function openSortSheet() {
  const container = $('sort-options');
  if (!container) return;
  render(container, Object.entries(SORT_MODES).map(([mode, label]) => el('button', {
    class: `sort-opt${view.sortMode === mode ? ' on' : ''}`,
    type: 'button',
    'aria-pressed': String(view.sortMode === mode),
    onClick: () => {
      view.sortMode = mode;
      resetPage();
      setText('sort-label', SORT_MODES[mode]);
      closeSheet('sort');
      renderHome();
    },
  }, [
    el('span', { class: 'sort-opt-lbl', text: label }),
    el('div', { class: 'sort-opt-check', text: '✓', 'aria-hidden': 'true' }),
  ])));
  openSheet('sort');
}

// ── search ──
const runSearch = debounce(() => {
  resetPage();
  renderHome();
}, 140);

export function bindSearch() {
  const input = $('hsearch');
  const clear = $('sclear');
  if (!input) return;
  input.addEventListener('input', () => {
    view.query = input.value;
    clear.className = `sclear${input.value ? ' show' : ''}`;
    runSearch();
  });
  clear?.addEventListener('click', () => {
    input.value = '';
    view.query = '';
    clear.className = 'sclear';
    resetPage();
    renderHome();
    input.focus();
  });
}

// ── long press context menu ──
let pressTimer = null;
let pressElement = null;
let pressActive = false;
let pressStart = { x: 0, y: 0 };

function findCard(event) {
  return event.target.closest?.('.icard[data-id], .litem[data-id]') || null;
}

export function bindLongPress() {
  document.addEventListener('pointerdown', (event) => {
    const card = findCard(event);
    if (!card) return;
    pressElement = card;
    pressStart = { x: event.clientX, y: event.clientY };
    pressActive = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressActive = true;
      pressElement?.classList.add('pressing');
      navigator.vibrate?.(10);
      openContextMenu(pressElement.dataset.id);
    }, 500);
  }, { passive: true });

  document.addEventListener('pointermove', (event) => {
    if (!pressTimer && !pressActive) return;
    if (Math.abs(event.clientX - pressStart.x) > 8 || Math.abs(event.clientY - pressStart.y) > 8) {
      clearTimeout(pressTimer);
      pressTimer = null;
      pressElement?.classList.remove('pressing');
      pressElement = null;
    }
  }, { passive: true });

  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      pressElement?.classList.remove('pressing');
      pressElement = null;
    }, { passive: true });
  }

  // Swallow the click the long press would otherwise trigger.
  document.addEventListener('click', (event) => {
    if (pressActive) {
      event.stopPropagation();
      event.preventDefault();
      pressActive = false;
    }
  }, { capture: true });

  document.addEventListener('contextmenu', (event) => {
    if (findCard(event)) event.preventDefault();
  });
  document.addEventListener('selectstart', (event) => {
    if (findCard(event)) event.preventDefault();
  });
}

function openContextMenu(itemId) {
  const item = repository.item(itemId);
  if (!item) return;
  contextItemId = itemId;
  const category = repository.category(item.categoryId);

  setText('ctx-name', item.name || '—');
  setText('ctx-cat', `${category.icon} ${category.name}`);

  const thumb = $('ctx-thumb');
  const image = primaryImage(item);
  if (image) {
    const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
    bindImageSrc(img, image, { thumbnail: true });
    render(thumb, [img]);
  } else {
    render(thumb, [el('span', { text: category.icon, 'aria-hidden': 'true' })]);
  }

  $('ov-ctx')?.classList.add('open');
  $('ctx-as')?.classList.add('open');
  $('ctx-as')?.setAttribute('aria-hidden', 'false');
}

export function closeContextMenu() {
  $('ov-ctx')?.classList.remove('open');
  $('ctx-as')?.classList.remove('open');
  $('ctx-as')?.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.pressing').forEach((node) => node.classList.remove('pressing'));
  pressActive = false;
}

export function bindContextActions() {
  const run = (action) => () => {
    const id = contextItemId;
    closeContextMenu();
    if (id) setTimeout(() => action(id), 110);
  };

  $('ctx-open')?.addEventListener('click', run(openDetail));
  $('ctx-preview')?.addEventListener('click', run(openQuickPreview));
  $('ctx-move')?.addEventListener('click', run(openMoveSheet));
  $('ctx-edit')?.addEventListener('click', run((id) => openItemForm({ itemId: id })));
  $('ctx-duplicate')?.addEventListener('click', run(duplicateItemFlow));
  $('ctx-delete')?.addEventListener('click', run(deleteItemFlow));
  $('ctx-cancel')?.addEventListener('click', closeContextMenu);
  $('ov-ctx')?.addEventListener('click', closeContextMenu);
}

export function focusSearch() {
  $('hsearch')?.focus();
}

export function notifyReadOnly() {
  toast('صلاحيتك للعرض فقط', '🔒');
}
