// Inventory view: stats, folders, category pills, grid/list, pagination,
// filter and sort sheets, and the long-press context menu.

import { icon } from '../icons.js';
import { CONDITIONS, PAGE_SIZE, UNCATEGORIZED_ID } from '../config.js';
import { partialNotice, withFullInventory } from '../inventory-load.js';
import { findByIdentifier, inventoryCounts, queryInventory } from '../query.js';
import { currenciesPresent, currencySymbol } from '../money.js';
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
/**
 * The generation of the narrowing currently in flight.
 *
 * Every narrowing takes a ticket. When one finishes it checks whether it is
 * still the newest; if a later keystroke or tap has come in, it returns
 * without rendering. Without this, a slow load started at "خا" resolves after
 * a fast one started at "خاتم" and paints the older results over the newer —
 * the result flashing the brief asks to remove.
 */
let narrowingGeneration = 0;

/** The answer currently on screen, so a repaint need not re-ask for it. */
let lastResult = null;

/**
 * Ask for what the screen should show, and paint it when it arrives.
 *
 * One path, always asynchronous, because on a device the answer comes out of
 * the database rather than out of an array the app was already holding. Every
 * request takes a ticket; a request that is no longer the newest paints
 * nothing and, where the engine can, stops working. Without that, a slow
 * answer to "خا" lands after a fast answer to "خاتم" and paints the older
 * results over the newer ones.
 *
 * @param {object} [options]
 * @param {Function} [options.apply] state to change before asking
 * @param {boolean}  [options.revertOnFailure] put the screen back when the
 *   question could not be answered, rather than showing part of an answer
 */
async function requestList({ apply, revertOnFailure = false, cursor = null } = {}) {
  const before = currentQuery();
  apply?.();
  const ticket = ++narrowingGeneration;
  const signal = { get aborted() { return ticket !== narrowingGeneration; } };

  let result;
  try {
    result = await queryInventory(currentQuery(), {
      ensure: () => withFullInventory('جارٍ قراءة المخزون كاملاً…'),
      signal,
      // Carrying on from where the last page ended, when there is one. Asking
      // for "page 40" of a walked answer means walking to it; asking for "what
      // follows this" means reading a page. The token is refused if it belongs
      // to a different question, so a stale one cannot resume the wrong answer.
      cursor,
    });
  } catch (error) {
    if (ticket !== narrowingGeneration) return;
    console.error('[home] the list could not be read', error);
    toastError(error, 'تعذّر قراءة المخزون');
    return;
  }

  if (!result || ticket !== narrowingGeneration) return;   // superseded

  if (!result.answerable) {
    if (revertOnFailure) {
      // Put the screen back rather than answering a narrowed question from a
      // fraction of the inventory.
      Object.assign(view, {
        query: before.search, folderId: before.folderId, categoryPill: before.categoryId,
        filters: before.filters, sortMode: before.sort, page: before.page,
      });
      void requestList();
    }
    return;
  }

  lastResult = result;
  paintList(result);
}

/** Narrowing — a search, a filter, a folder — is the same request, reverted
 *  when it turns out it could not be answered honestly. */
function narrowing(apply) {
  return requestList({ apply, revertOnFailure: true });
}

// ── stats ──
// A summary model, not a walk over every record. Each field is either a real
// number or null, and null means "not knowable from what is loaded" rather
// than zero — so a proportion computed from the newest 200 can never be
// printed as a fact about the inventory.
function renderStats(summary) {
  if (!summary) return;

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

/** The last counts the engine reported, so the rows can be drawn immediately. */
let folderCounts = { folders: new Map(), categories: new Map(), locations: new Map(), complete: false };

/**
 * Every category that has any record at all — what the pill row falls back to
 * outside a folder scope, where "which categories are in view" would cost a
 * walk of the inventory to draw a row of chips.
 */
let pillFallback = new Set();

/**
 * Re-reads every count the screens show beside a name. On the device engine
 * these are index range counts — twenty small counts rather than one pass over
 * the inventory — so this is cheap enough to run whenever the data changes.
 */
async function refreshCounts() {
  try {
    folderCounts = await inventoryCounts();
    pillFallback = new Set(folderCounts.categories.keys());
    renderFolders();
  } catch (error) {
    console.error('[home] counts unavailable', error);
  }
}

function folderCard(folder, counts) {
  // A count taken from the window would be a fraction presented as a total.
  // Until the inventory is whole, the card carries no number at all.
  const count = counts.complete ? (counts.folders.get(folder.id) || 0) : null;
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
  // Drawn at once from whatever counts are in hand, and corrected when the
  // real ones arrive — an index range count per folder, which is cheap but is
  // still a round trip. Waiting for it would make the row appear late for no
  // benefit it does not already give.
  render(row, [
    ...folders.map((folder) => folderCard(folder, folderCounts)),
    el('button', {
      class: 'fld-card fld-add gl-s',
      type: 'button',
      onClick: () => window.dispatchEvent(new CustomEvent('almakhzan:new-folder')),
    }, [icon('plus', { size: 18 }), el('span', { text: 'مجلد جديد' })]),
  ]);
}

/**
 * A record with no photograph.
 *
 * Two states that look alike and are not: *no image was ever added*, and *an
 * image exists and failed to load*. The first is a fact about the record and
 * should look deliberate; the second is a fact about the network and should
 * look recoverable. Drawing both as the same grey box tells someone their
 * documentation is missing when it is merely offline.
 */
function placeholderNode(category) {
  return el('div', { class: 'icph' }, [
    el('span', { class: 'icph-ico', text: category.icon, 'aria-hidden': 'true' }),
    el('span', { class: 'icph-lbl', text: 'بدون صورة' }),
  ]);
}

/** An image that exists but did not arrive. Offers the retry, quietly. */
function attachImageFallback(img, image, category, onRetry) {
  img.addEventListener('error', () => {
    const host = img.parentElement;
    if (!host) return;
    render(host, [
      el('div', { class: 'icph icph-failed' }, [
        el('span', { class: 'icph-ico', text: category.icon, 'aria-hidden': 'true' }),
        el('button', {
          class: 'icph-retry', type: 'button', text: 'تعذّر تحميل الصورة · إعادة',
          onClick: (event) => { event.stopPropagation(); onRetry?.(); },
        }),
      ]),
    ]);
  }, { once: true });
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
    attachImageFallback(img, image, category, () => renderHome());
    imageNode = img;
  } else {
    imageNode = placeholderNode(category);
  }

  const selected = view.selection?.has(item.id) === true;
  const activate = () => (view.selection ? toggleSelected(item.id) : openDetail(item.id));

  return el('div', {
    // In selection mode the card IS the control — one tap, one meaning — so it
    // carries the checkbox role and nothing interactive sits inside it.
    // Browsing, it is a container: `role="button"` around a real <button> is
    // invalid, and assistive technology flattens a button's contents, so the
    // actions button either disappeared into the card's label or could not be
    // reached at all. The card's primary action is its own button, stretched
    // over the card by CSS — see `.icard-open`.
    class: `icard gl-s${selected ? ' picked' : ''}`,
    dataset: { id: item.id },
    role: view.selection ? 'checkbox' : undefined,
    'aria-checked': view.selection ? String(selected) : undefined,
    tabindex: view.selection ? '0' : undefined,
    'aria-label': view.selection ? `${item.name}، ${category.name}` : undefined,
    onClick: view.selection ? activate : undefined,
    onKeydown: view.selection ? (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    } : undefined,
  }, [
    view.selection ? el('span', { class: `pickmark${selected ? ' on' : ''}`, text: selected ? '✓' : '', 'aria-hidden': 'true' }) : null,
    view.selection ? null : el('button', {
      class: 'icard-open', type: 'button',
      'aria-label': `${item.name}، ${category.name}`,
      onClick: activate,
    }),
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
    // Same reasoning as the card: a control while selecting, a container while
    // browsing, with the row's own action as a button stretched across it.
    class: `litem${selected ? ' picked' : ''}`,
    dataset: { id: item.id },
    role: view.selection ? 'checkbox' : undefined,
    'aria-checked': view.selection ? String(selected) : undefined,
    tabindex: view.selection ? '0' : undefined,
    'aria-label': view.selection ? (item.name || 'قطعة') : undefined,
    onClick: view.selection ? activate : undefined,
    onKeydown: view.selection ? (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    } : undefined,
  }, [
    view.selection ? el('span', { class: `pickmark${selected ? ' on' : ''}`, text: selected ? '✓' : '', 'aria-hidden': 'true' }) : null,
    view.selection ? null : el('button', {
      class: 'icard-open', type: 'button',
      'aria-label': `${item.name || 'قطعة'}، ${subtitle}`,
      onClick: activate,
    }),
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
function renderPills(result) {
  const container = $('hpills');
  if (!container) return;

  // Two shapes, one row. An adapter that holds the records hands them over and
  // the categories are read off them; the device engine counts instead and
  // hands over the set of category ids present in this scope. Neither one
  // walks the inventory once per category, which is what this used to do.
  let present;
  if (result?.scopeCategories instanceof Set) {
    present = result.scopeCategories;
  } else if (result?.scopeItems?.length) {
    present = new Set(result.scopeItems.map((item) => item.categoryId || UNCATEGORIZED_ID));
  } else {
    present = pillFallback;
  }

  const used = repository.state.categories.filter((c) => present.has(c.id));
  const hasUncategorized = present.has(UNCATEGORIZED_ID);

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
/**
 * The record carrying this exact code, wherever it is in the inventory.
 *
 * The device engine answers from the barcode, SKU and serial indexes. An
 * adapter that cannot — the cloud one, until a server-side lookup exists —
 * falls back to loading and searching, which is slower but still correct.
 */
async function findMatchingRecord(value) {
  const byIndex = await findByIdentifier(value);
  if (byIndex?.length) return byIndex[0];

  const direct = repository.item(value);
  if (direct && !direct.deletedAt) return direct;
  if (byIndex) return null;

  if (!(await withFullInventory('جارٍ البحث في المخزون…'))) return null;
  return repository.liveItems().find(
    (item) => item.barcode === value || item.sku === value
      || item.serialNumber === value || item.id === value,
  ) || null;
}

export async function scanIntoSearch() {
  await openScanner({
    title: 'امسح باركود أو رمز QR لقطعة',
    onCode: async ({ value }) => {
      // "No item carries this code" has to mean the whole inventory, not the
      // part of it this screen happens to hold — and it is one index lookup,
      // not a reading of every record. A scanner that made the customer wait
      // for 20,000 records before telling them whether they own the thing in
      // their hand was the wrong shape for the job.
      const match = await findMatchingRecord(value);
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
    el('div', { class: 'srowc', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
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
/**
 * Numbered pages while the engine can say how many there are; previous/next
 * while it cannot.
 *
 * A total is cheap when the answer is exactly one index range — a folder, a
 * category, a location, the Trash. Once something the index cannot see is in
 * play, counting the answer means walking it, and walking 20,000 records to
 * print a number is the cost this whole layer exists to avoid. So the pager
 * says what is true: how far you are, and whether there is more.
 */
function renderPagination(result) {
  const container = $('hpag');
  if (!container) return;

  const go = (page, cursor = null) => {
    view.page = Math.max(1, page);
    void requestList({ cursor });
    $('hscroll')?.scrollTo(0, 0);
  };

  const back = el('button', {
    class: 'pbtn pbtn-nav', type: 'button', 'aria-label': 'الصفحة السابقة',
    disabled: view.page <= 1 || undefined,
    onClick: () => go(view.page - 1),
  }, [icon('forward', { size: 17 })]);

  const forward = el('button', {
    class: 'pbtn pbtn-nav', type: 'button', 'aria-label': 'الصفحة التالية',
    disabled: !result.hasMore || undefined,
    onClick: () => go(view.page + 1, result.nextCursor),
  }, [icon('back', { size: 17 })]);

  if (result.totalPages == null) {
    if (view.page <= 1 && !result.hasMore) { render(container, []); return; }
    render(container, [
      back,
      el('span', { class: 'pgap', text: `صفحة ${formatNumber(view.page)}` }),
      forward,
    ]);
    return;
  }

  const model = paginationModel(view.page, result.totalPages);
  if (!model.length) { render(container, []); return; }

  render(container, [
    back,
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
    forward,
  ]);
}

// ── main render ──

/**
 * Draw the screen.
 *
 * `renderHome` paints everything that does not depend on the answer and then
 * asks for the answer; `paintList` paints the answer when it comes. They are
 * separate because the answer is asynchronous now — it is read from the
 * database rather than filtered out of an array the app was holding — and the
 * chrome should not wait on it.
 */
export function renderHome() {
  renderChrome();
  // A repaint that is not a new question — a snapshot arriving, a grid/list
  // toggle — still re-asks, because the records may have changed underneath.
  void requestList();
}

function renderChrome() {
  const folder = view.folderId ? repository.folder(view.folderId) : null;
  if (view.folderId && !folder) { view.folderId = null; }

  renderFolders();
  void refreshCounts();
  renderQuotaBanner();
  renderAssistantBanner();
  renderNavBar(folder);
  $('statsrow').style.display = view.folderId ? 'none' : 'grid';
}

function paintList(result) {
  const folder = view.folderId ? repository.folder(view.folderId) : null;
  const { rows: pageItems, total, totalPages, searching } = result;
  view.page = result.page;

  renderStats(result.summary);
  renderSortNotice(result);
  renderPills(result);
  renderFilterBanner(searching);

  setText('htitle', searching ? 'نتائج البحث' : folder ? `${folder.icon} ${folder.name}` : 'القطع');
  // A total the engine could not count cheaply is not printed as if it had
  // been. "24+" is what is actually known; a number would be a guess.
  setText('hcount', total == null
    ? `${formatNumber(pageItems.length + (view.page - 1) * PAGE_SIZE)}+`
    : formatNumber(total));

  const empty = $('hempty');
  const grid = $('hgrid');
  const list = $('hlist');

  if (!pageItems.length) {
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
    renderPagination(result);
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

  renderPagination(result);
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
/**
 * Says so when "by value" is really "by value, within each currency".
 *
 * Without an exchange rate — and NAZM has none, and no opinion about what one
 * should be — 400 USD and 500 SAR cannot be put in order. The list groups them
 * instead, and this is the line that stops the grouping from reading as a
 * ranking the app is not entitled to make.
 */
function renderSortNotice(result) {
  const node = $('hsortnote');
  if (!node) return;
  if (!result.groupedByCurrency) {
    node.style.display = 'none';
    render(node, []);
    return;
  }
  node.style.display = '';
  render(node, [el('div', { class: 'sortnote' }, [
    el('span', { class: 'sortnote-ico', text: '⇅', 'aria-hidden': 'true' }),
    el('span', {
      text: `التقييمات هنا بعملات مختلفة (${result.valueCurrencies.join(' · ')}) — الترتيب داخل كل عملة على حدة، لأن العملات لا تُقارن بدون سعر صرف.`,
    }),
  ])]);
}

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

  // Offered only when there is more than one currency to choose between: on a
  // single-currency inventory — most of them — the control is a question with
  // one answer, and the row is simply not drawn.
  const present = currenciesPresent(repository.liveItems());
  const currencyRow = $('fp-currency-row');
  if (currencyRow) currencyRow.style.display = present.length > 1 ? '' : 'none';
  if (present.length > 1) {
    optionList($('fp-currency'), [
      { value: '', label: 'كل العملات' },
      ...present.map((code) => ({ value: code, label: `${currencySymbol(code)} ${code}` })),
    ], view.filters.currency);
  }

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
    currency: $('fp-currency')?.value || '',
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
    'fp-currency': view.filters.currency,
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
/**
 * 200ms rather than 140: long enough that a word typed at speed is one query
 * rather than five, short enough to feel immediate. The Arabic and digit
 * normalisation happens inside the query, so nothing about typing changes.
 */
const runSearch = debounce(() => {
  // An empty box is not a search: it costs nothing and needs nothing.
  if (!view.query) { narrowingGeneration += 1; resetPage(); renderHome(); return; }
  void narrowing(() => resetPage());
}, 200);

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

export function openContextMenu(itemId) {
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
