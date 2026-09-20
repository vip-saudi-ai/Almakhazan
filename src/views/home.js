// Inventory view: stats, folders, category pills, grid/list, pagination,
// filter and sort sheets, and the long-press context menu.

import { icon } from '../icons.js';
import { CONDITIONS, PAGE_SIZE, UNCATEGORIZED_ID } from '../config.js';
import { partialNotice, withFullInventory } from '../inventory-load.js';
import { ensureFor, runQuery, summarize } from '../query.js';
import { repository } from '../repository.js';
import { canUseFeature, quotaStatus } from '../subscription.js';
import { ImageTier, bindImageSrc } from '../storage.js';
import {
  EMPTY_FILTERS, SORT_MODES, activeFilterCount, paginationModel,
} from '../search.js';
import { $, appendChildren, debounce, el, formatNumber, render, setText } from '../utils.js';
import { formatValuation, primaryImage } from '../validation.js';
import { closeSheet, confirmAction, emptyState, openSheet, optionList, toast, toastError } from '../ui.js';
import { openDetail, openMoveSheet, openQuickPreview, deleteItemFlow, duplicateItemFlow } from './detail.js';
import { openItemForm } from './item-form.js';
import { openPlansSheet } from './plans.js';
import { symbolNode } from './mark.js';
import { goTab } from '../navigation.js';
import { openScanner } from './scan.js';
import { openLabels } from './labels.js';
import { exportSelection } from '../exporting.js';

/**
 * The screen's state *is* a query — scope, search, filters, sort, page. It is
 * kept in this shape (rather than as a query object) because the controls bind
 * to individual fields, and turned into one by `currentQuery()` whenever the
 * list is asked for. Nothing here filters an array of records itself.
 */
export const view = {
  page: 1,
  grid: true,
  categoryPill: 'all',
  sortMode: 'newest',
  query: '',
  filters: { ...EMPTY_FILTERS },
  folderId: null,
  /** A set of ids handed over by the assistant, with the label that explains it. */
  assistantSet: null,
  /** Null when not selecting; a Set of ids when the customer is choosing. */
  selection: null,
};

/** This screen's state, as the query the data layer answers. */
function currentQuery() {
  return {
    search: view.query,
    folderId: view.folderId,
    categoryId: view.categoryPill,
    filters: view.filters,
    sort: view.sortMode,
    page: view.page,
    perPage: PAGE_SIZE,
    ids: view.assistantSet ? view.assistantSet.ids : null,
  };
}

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
  void narrowing(() => {
    view.folderId = id;
    view.page = 1;
    view.categoryPill = 'all';
  }).then(() => $('hscroll')?.scrollTo(0, 0));
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
// Narrowing — searching, filtering, sorting, entering a folder — is a question
// about the whole inventory, not about the window the screen happens to hold.
// So each of them loads the rest first, once, and does nothing if that fails:
// a filter applied to a fraction answers confidently and wrongly.
async function narrowing(apply) {
  // Apply first so the query reflects what was just asked for, then let the
  // query say whether it can be answered from what is loaded.
  const before = currentQuery();
  apply();
  const after = currentQuery();
  const ok = await ensureFor(after, () => withFullInventory('جارٍ قراءة المخزون كاملاً…'));
  if (!ok) {
    // Put the screen back rather than answering a narrowed question from a
    // fraction of the inventory.
    Object.assign(view, {
      query: before.search, folderId: before.folderId, categoryPill: before.categoryId,
      filters: before.filters, sortMode: before.sort, page: before.page,
    });
  }
  renderHome();
}

// ── stats ──
// A summary model, not a walk over every record. Each field is either a real
// number or null, and null means "not knowable from what is loaded" rather
// than zero — so a proportion computed from the newest 200 can never be
// printed as a fact about the inventory.
function renderStats() {
  const summary = summarize(currentQuery());

  setText('s-total', summary.records == null ? '—' : formatNumber(summary.records));
  setText('s-qty', summary.quantity == null ? '—' : formatNumber(summary.quantity));

  if (summary.documentedRatio == null) {
    setText('s-cats', summary.records ? 'اعرض الكل لحساب النِّسب' : 'ابدأ بأول قطعة');
  } else {
    setText('s-cats', `${Math.round(summary.documentedRatio * 100)}% موثّق بالصور`);
  }

  setText('s-qtysub', summary.categories == null
    ? `${formatNumber(summary.folders)} مجلد`
    : `${formatNumber(summary.categories)} تصنيف · ${formatNumber(summary.folders)} مجلد`);
}

// ── folders ──
function folderCard(folder) {
  // A count taken from the window would be a fraction presented as a total.
  // Until the inventory is whole, the card carries no number at all.
  const count = repository.itemsComplete
    ? repository.liveItems().filter((i) => i.folderId === folder.id).length
    : null;
  const color = folder.color || '#007AFF';
  return el('button', {
    class: 'fld-card gl-s',
    type: 'button',
    'aria-label': count == null ? folder.name : `${folder.name}، ${count} قطعة`,
    onClick: () => enterFolder(folder.id),
  }, [
    el('div', { class: 'fld-card-bg', text: folder.icon, 'aria-hidden': 'true' }),
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', position: 'relative' } }, [
      el('div', { style: { fontSize: '28px' }, text: folder.icon, 'aria-hidden': 'true' }),
      count == null ? null : el('div', {
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
    }, [icon('plus', { size: 18 }), el('span', { text: 'مجلد جديد' })]),
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
  bindImageSrc(img, image, { tier: ImageTier.THUMB });
  return el('div', { class: className }, [img]);
}

function cardNode(item) {
  const category = repository.category(item.categoryId);
  const image = primaryImage(item);

  let imageNode;
  if (image) {
    const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
    bindImageSrc(img, image, { tier: ImageTier.THUMB });
    imageNode = img;
  } else {
    // The category's own icon, not a cardboard box: a record with no
    // photograph still has a kind, and showing the kind is more use than
    // showing that a photograph is missing.
    imageNode = el('div', { class: 'icph' }, [
      el('span', { class: 'icph-ico', text: category.icon, 'aria-hidden': 'true' }),
    ]);
  }

  const selected = view.selection?.has(item.id) === true;
  const activate = () => (view.selection ? toggleSelected(item.id) : openDetail(item.id));

  return el('div', {
    class: `icard gl-s${selected ? ' picked' : ''}`,
    dataset: { id: item.id },
    role: view.selection ? 'checkbox' : 'button',
    'aria-checked': view.selection ? String(selected) : undefined,
    tabindex: '0',
    'aria-label': `${item.name}، ${category.name}`,
    onClick: activate,
    onKeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    },
  }, [
    view.selection ? el('span', { class: `pickmark${selected ? ' on' : ''}`, text: selected ? '✓' : '', 'aria-hidden': 'true' }) : null,
    // The same actions the long press offers, on a button that can be seen.
    // A long press is a shortcut for people who know it exists; it is not a
    // way to find out that "duplicate" or "print a label" exist at all.
    view.selection ? null : el('button', {
      class: 'icmore', type: 'button',
      'aria-label': `إجراءات ${item.name || 'القطعة'}`,
      onClick: (event) => { event.stopPropagation(); openContextMenu(item.id); },
    }, [icon('more', { size: 16 })]),
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

  const selected = view.selection?.has(item.id) === true;
  const activate = () => (view.selection ? toggleSelected(item.id) : openDetail(item.id));

  return el('div', {
    class: `litem${selected ? ' picked' : ''}`,
    dataset: { id: item.id },
    role: view.selection ? 'checkbox' : 'button',
    'aria-checked': view.selection ? String(selected) : undefined,
    tabindex: '0',
    'aria-label': item.name || 'قطعة',
    onClick: activate,
    onKeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    },
  }, [
    view.selection ? el('span', { class: `pickmark${selected ? ' on' : ''}`, text: selected ? '✓' : '', 'aria-hidden': 'true' }) : null,
    itemThumb(item, 'lthumb'),
    el('div', { class: 'linfo' }, [
      el('div', { class: 'lname', text: item.name || '—' }),
      el('div', { class: 'lsub', text: subtitle }),
    ]),
    el('div', { style: { textAlign: 'left', flexShrink: '0' } }, [
      el('div', { class: 'lqty', text: formatNumber(item.quantity) }),
      el('div', { class: 'lunit', text: item.unit || '' }),
    ]),
    view.selection ? null : el('button', {
      class: 'lmore', type: 'button',
      'aria-label': `إجراءات ${item.name || 'القطعة'}`,
      onClick: (event) => { event.stopPropagation(); openContextMenu(item.id); },
    }, [icon('more', { size: 16 })]),
    el('div', { class: 'lchev', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
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
    onClick: () => narrowing(() => { view.categoryPill = id; resetPage(); }),
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

// ── scanning from the inventory screen ──
/**
 * A scanned code is first a question: do I already own this? If a record
 * carries it, open that record; if none does, offer to create one with the
 * code already filled in. Never silently create.
 */
export async function scanIntoSearch() {
  await openScanner({
    title: 'امسح باركود أو رمز QR لقطعة',
    onCode: async ({ value }) => {
      // "No item carries this code" has to mean the whole inventory, not the
      // part of it this screen happens to hold.
      if (!(await withFullInventory('جارٍ البحث في المخزون…'))) return;
      const match = repository.liveItems().find(
        (item) => item.barcode === value || item.sku === value || item.id === value,
      );
      if (match) { openDetail(match.id); return; }

      $('hsearch').value = value;
      view.query = value;
      resetPage();
      renderHome();
      toast('لا توجد قطعة بهذا الرمز — ابحث أو أضِف قطعة جديدة', '⌕');
    },
  });
}

// ── selecting several records ─────────────────────────────────────────────
//
// Selection is a mode, not a mouse gesture: on a phone there is no modifier
// key, so tapping a card while selecting toggles it rather than opening it.
// The mode is always visible — an action bar with the count — because a mode
// the customer cannot see is a mode they will fight.

export function startSelection(firstId = null) {
  const gate = canUseFeature('bulkActions');
  if (!gate.allowed) {
    openPlansSheet(`${gate.message} الإجراءات الجماعية متاحة من خطة شخصي فصاعداً.`);
    return;
  }
  view.selection = new Set(firstId ? [firstId] : []);
  renderHome();
}

export function endSelection() {
  view.selection = null;
  renderHome();
}

export function isSelecting() {
  return view.selection !== null;
}

function toggleSelected(id) {
  if (!view.selection) return;
  if (view.selection.has(id)) view.selection.delete(id);
  else view.selection.add(id);
  renderHome();
}

/** The records currently selected, in the order the screen shows them. */
function selectedItems() {
  if (!view.selection) return [];
  const ids = view.selection;
  return repository.liveItems().filter((item) => ids.has(item.id));
}

function renderSelectionBar(visibleItems) {
  const bar = $('select-bar');
  if (!bar) return;

  if (!view.selection) {
    bar.style.display = 'none';
    render(bar, []);
    document.body.classList.remove('selecting');
    return;
  }

  document.body.classList.add('selecting');
  bar.style.display = 'flex';

  const count = view.selection.size;
  const pageIds = visibleItems.map((item) => item.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => view.selection.has(id));

  const action = (label, iconName, handler, danger = false) => el('button', {
    class: `selact${danger ? ' danger' : ''}`, type: 'button',
    disabled: count === 0 || undefined,
    onClick: handler,
  }, [
    el('span', { class: 'selact-ico' }, [icon(iconName, { size: 18 })]),
    el('span', { text: label }),
  ]);

  render(bar, [
    el('div', { class: 'selbar-top' }, [
      el('button', { class: 'selbar-close', type: 'button', 'aria-label': 'إنهاء التحديد', onClick: endSelection }, [icon('close', { size: 16 })]),
      el('span', { class: 'selbar-count', text: count ? `${formatNumber(count)} محددة` : 'اختر قطعاً' }),
      el('button', {
        class: 'selbar-all', type: 'button',
        text: allOnPage ? 'إلغاء تحديد الصفحة' : 'تحديد الصفحة',
        onClick: () => {
          for (const id of pageIds) {
            if (allOnPage) view.selection.delete(id);
            else view.selection.add(id);
          }
          renderHome();
        },
      }),
    ]),
    el('div', { class: 'selbar-acts' }, [
      action('نقل', 'move', () => bulkMove()),
      action('تصنيف', 'category', () => bulkField('categoryId', 'التصنيف')),
      action('موقع', 'location', () => bulkField('locationId', 'الموقع')),
      action('تصدير', 'download', () => bulkExport()),
      action('حذف', 'trash', () => bulkDelete(), true),
    ]),
  ]);
}

async function applyToSelection(label, patch) {
  const items = selectedItems();
  if (!items.length) return;
  try {
    await repository.bulkUpdate(items.map((item) => item.id), patch);
    toast(`${label} — ${formatNumber(items.length)} قطعة`, '✓');
    endSelection();
  } catch (error) {
    toastError(error, 'تعذّر تنفيذ الإجراء');
  }
}

function bulkMove() {
  const options = [
    { value: '', label: '📦 المخزون الرئيسي' },
    ...repository.state.folders.map((f) => ({ value: f.id, label: `${f.icon} ${f.name}` })),
  ];
  pickOne('نقل إلى مجلد', options, (value) => applyToSelection('نُقلت', { folderId: value || null }));
}

function bulkField(field, title) {
  const source = field === 'categoryId' ? repository.state.categories : repository.state.locations;
  const options = source.map((entry) => ({ value: entry.id, label: `${entry.icon || '⌂'} ${entry.name}` }));
  if (!options.length) { toast(`لا توجد ${title} بعد`, '⚠'); return; }
  pickOne(`تغيير ${title}`, options, (value) => applyToSelection('حُدّثت', { [field]: value }));
}

function bulkExport() {
  const items = selectedItems();
  try {
    exportSelection(items);
    toast(`صُدِّرت ${formatNumber(items.length)} قطعة`, '📤');
  } catch (error) {
    toastError(error, 'تعذّر التصدير');
  }
}

async function bulkDelete() {
  const items = selectedItems();
  const confirmed = await confirmAction({
    title: `نقل ${formatNumber(items.length)} قطعة إلى المحذوفات؟`,
    message: 'يمكنك استرجاعها من المحذوفات — لا شيء يُحذف نهائياً الآن.',
    icon: '🗑',
    confirmLabel: 'نقل للمحذوفات',
  });
  if (!confirmed) return;
  try {
    await repository.bulkTrash(items.map((item) => item.id));
    toast(`نُقلت ${formatNumber(items.length)} قطعة للمحذوفات`, '✓');
    endSelection();
  } catch (error) {
    toastError(error, 'تعذّر الحذف');
  }
}

/** A one-choice sheet, reused by the three field actions. */
function pickOne(title, options, onPick) {
  setText('bulk-title', title);
  render($('bulk-options'), options.map((option) => el('button', {
    class: 'srow srow-btn', type: 'button',
    onClick: () => { closeSheet('bulk'); setTimeout(() => onPick(option.value), 200); },
  }, [
    el('div', { style: { flex: '1' } }, [el('div', { class: 'srowl', text: option.label })]),
    el('div', { class: 'srowc', text: '›', 'aria-hidden': 'true' }),
  ])));
  openSheet('bulk');
}

// ── an answer handed over by the assistant ──
export function applyAssistantFilter({ label, ids }) {
  view.assistantSet = { label, ids: new Set(ids) };
  view.query = '';
  view.folderId = null;
  view.categoryPill = 'all';
  view.filters = { ...EMPTY_FILTERS };
  resetPage();
  syncFilterControls();
  goTab('home');
  renderHome();
  $('hscroll')?.scrollTo(0, 0);
}

export function clearAssistantFilter() {
  view.assistantSet = null;
  resetPage();
  renderHome();
}

function renderAssistantBanner() {
  const banner = $('assistant-banner');
  if (!banner) return;
  if (!view.assistantSet) {
    banner.style.display = 'none';
    render(banner, []);
    return;
  }
  banner.style.display = 'flex';
  render(banner, [
    el('span', { class: 'ab-mark', text: '✦', 'aria-hidden': 'true' }),
    el('span', { class: 'ab-txt', text: view.assistantSet.label }),
    el('button', { class: 'ab-clear', type: 'button', text: 'إلغاء', onClick: clearAssistantFilter }),
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

  // One page of one query. The screen does not filter an array of records; it
  // asks for what it needs and renders the answer. An assistant hand-over is
  // the same query with an explicit id set, so it narrows this screen rather
  // than opening a second one.
  const result = runQuery(currentQuery());
  const { rows: pageItems, total, totalPages, searching, scopeItems } = result;
  view.page = result.page;

  renderPills(scopeItems);
  renderFilterBanner(searching);
  renderAssistantBanner();

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
    // Three different nothings, which want three different sentences and
    // three different next steps. "The warehouse is empty" was one message
    // for all of them, and a way out for none.
    const filtered = activeFilterCount(view.filters) > 0 || view.categoryPill !== 'all';
    renderEmptyState({ searching, filtered, folder });
    renderPagination(1);
    renderPartial();
    // Still draw the selection bar: an empty page is exactly when someone
    // needs the way out of selection mode.
    renderSelectionBar([]);
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
  renderPartial();
  renderSelectionBar(pageItems);
}

/**
 * The empty state. Which emptiness it is decides both the sentence and the
 * action: a search that found nothing wants the search cleared, a filtered
 * view wants the filters cleared, and a genuinely empty inventory wants a
 * first photograph — not a cardboard box and an instruction to press a plus
 * sign the customer has to go and find.
 */
function renderEmptyState({ searching, filtered, folder }) {
  const cta = $('add-first-item');
  const iconHost = $('hempty-ico');

  if (searching) {
    setText('hempty-title', 'لم نجد شيئاً بهذا الوصف.');
    setText('hempty-sub', 'جرّب كلمة أقل تحديداً، أو امسح البحث.');
    if (iconHost) render(iconHost, [icon('search', { size: 44 })]);
    if (cta) { cta.textContent = 'مسح البحث'; cta.dataset.emptyAction = 'search'; }
    return;
  }
  if (filtered) {
    setText('hempty-title', 'لا نتائج مطابقة.');
    setText('hempty-sub', 'الفلاتر الحالية لا تُبقي أي قطعة.');
    if (iconHost) render(iconHost, [icon('filter', { size: 44 })]);
    if (cta) { cta.textContent = 'مسح الفلاتر'; cta.dataset.emptyAction = 'filters'; }
    return;
  }
  if (folder) {
    setText('hempty-title', `${folder.name} فارغ.`);
    setText('hempty-sub', 'أضف قطعة هنا، أو انقل قطعاً إليه من المخزون.');
    if (iconHost) render(iconHost, [icon('folder', { size: 44 })]);
    if (cta) { cta.textContent = 'إضافة قطعة'; cta.dataset.emptyAction = 'add'; }
    return;
  }
  setText('hempty-title', 'لا توجد قطع بعد.');
  setText('hempty-sub', 'ابدأ بتصوير أول قطعة، وسيساعدك نَظْم في توثيقها.');
  if (iconHost) render(iconHost, [icon('image', { size: 44 })]);
  if (cta) { cta.textContent = 'إضافة أول قطعة'; cta.dataset.emptyAction = 'add'; }
}

/** Says, under the list, that this is a window and not an inventory. */
function renderPartial() {
  const node = $('hpartial');
  if (!node) return;
  const notice = partialNotice(() => renderHome());
  render(node, notice ? [notice] : []);
}

function renderNavBar(folder) {
  const bar = $('home-nbar');
  if (!bar) return;

  const actions = el('div', { class: 'nacts' }, [
    folder ? el('button', {
      class: 'ibtn gls', type: 'button',
      'aria-label': 'تعديل المجلد',
      onClick: () => window.dispatchEvent(new CustomEvent('almakhzan:edit-folder', { detail: folder.id })),
    }, [icon('edit')]) : el('button', {
      class: 'ibtn gl', type: 'button', 'aria-label': 'تصدير واستيراد',
      onClick: () => openSheet('as'),
    }, [icon('upload')]),
    el('button', {
      class: 'ibtn gl ibtn-primary', type: 'button',
      'aria-label': 'إضافة قطعة',
      onClick: () => openItemForm({ folderId: view.folderId }),
    }, [icon('plus', { size: 22 })]),
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
  void narrowing(() => applyFilterControlsNow());
}

function applyFilterControlsNow() {
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
    onClick: () => narrowing(() => {
      view.sortMode = mode;
      resetPage();
      setText('sort-label', SORT_MODES[mode]);
      closeSheet('sort');
    }),
  }, [
    el('span', { class: 'sort-opt-lbl', text: label }),
    el('div', { class: 'sort-opt-check', text: '✓', 'aria-hidden': 'true' }),
  ])));
  openSheet('sort');
}

// ── search ──
const runSearch = debounce(() => {
  // An empty box is not a search: it costs nothing and needs nothing.
  if (!view.query) { resetPage(); renderHome(); return; }
  void narrowing(() => resetPage());
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
  clear?.addEventListener('click', () => { clearSearch(); input.focus(); });
}

/** Empties the search box and the query behind it. */
export function clearSearch() {
  const input = $('hsearch');
  if (input) input.value = '';
  view.query = '';
  const clear = $('sclear');
  if (clear) clear.className = 'sclear';
  resetPage();
  renderHome();
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
      // While selecting, a long press is just another way to pick; the
      // per-record menu would be the wrong offer.
      if (view.selection) toggleSelected(pressElement.dataset.id);
      else openContextMenu(pressElement.dataset.id);
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
    bindImageSrc(img, image, { tier: ImageTier.THUMB });
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
  $('ctx-label')?.addEventListener('click', run((id) => openLabels([id])));
  $('ctx-select')?.addEventListener('click', run((id) => startSelection(id)));
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
