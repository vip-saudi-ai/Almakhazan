// Item detail, quick preview, move-to-folder, delete and duplicate flows.

import { aiDisclaimer, aiSubtitle, assistantName, isAnalysisStale } from '../ai.js';
import { onLanguageChange, t } from '../i18n.js';
import { categoryName, conditionLabel, locationName, unitLabel } from '../labels.js';
import { repository } from '../repository.js';
import { ImageTier, bindImageSrc } from '../storage.js';
import { openImageViewer } from './image-viewer.js';
import { $, el, formatDate, formatNumber, render, setText } from '../utils.js';
import { formatValuation, primaryImage } from '../validation.js';
import {
  closeSheet, confirmAction, detailRow, flashSuccess, identifierRow, isSheetOpen, openSheet, toast, toastError,
} from '../ui.js';
import { openItemForm } from './item-form.js';
import { openLabels } from './labels.js';

// ── fetching the record behind a card ──────────────────────────────────────
//
// A card can show any record the query engine found — the newest or the ten
// thousandth — and the window in memory holds only the newest few hundred. So
// every flow here asks the repository for the record by id rather than
// looking for it in the window, and says "لم تعد هذه القطعة موجودة" only when
// the store says so.
//
// Each flow also carries a generation. Tapping item A and then item B, or
// navigating away, makes A's answer stale; a stale answer is dropped rather
// than opening a sheet the customer has already moved on from.

let generation = 0;

/** Anything still being fetched is no longer wanted. Called on navigation. */
export function cancelItemOpens() {
  generation += 1;
}

/**
 * @returns {Promise<{item: object|null, stale: boolean}>} `item` null means
 *   the store confirmed there is no such record, or it could not be read —
 *   either way the customer has been told which.
 */
async function resolve(itemId) {
  const mine = ++generation;
  let item = null;
  try {
    // Fresh: opening a record is a request to see it as it is now. A copy
    // cached earlier in the session may have been changed by another tab or
    // device since, and one keyed read is the whole cost of being sure.
    item = await repository.getItem(itemId, { fresh: true });
  } catch (error) {
    if (mine === generation) toastError(error, 'error.item/load-failed');
    return { item: null, stale: mine !== generation };
  }
  if (mine !== generation) return { item: null, stale: true };
  if (!item) toast(t('error.item/not-found'), '✕');
  return { item, stale: false };
}

/** Opens the viewer on one of an item's images. */
function inspect(item, imageId) {
  const images = item.images || [];
  openImageViewer({
    images,
    index: Math.max(0, images.findIndex((i) => i.id === imageId)),
    title: item.name || '',
  });
}

function heroNode(item, { big = true } = {}) {
  const image = primaryImage(item);
  const category = repository.category(item.categoryId);
  if (!image) {
    return el('div', { style: { fontSize: big ? '72px' : '64px' }, text: category.icon, 'aria-hidden': 'true' });
  }
  const img = el('img', { alt: item.name || t('home.itemPhoto') });
  bindImageSrc(img, image, { tier: big ? ImageTier.DISPLAY : ImageTier.THUMB });
  // A photograph of an object is the documentation of it, so it is always a
  // way in to looking at it properly — a button, not a picture.
  return el('button', {
    class: 'img-open', type: 'button',
    'aria-label': t('detail.viewFull', { name: item.name || t('home.theItem') }),
    onClick: () => inspect(item, image.id),
  }, [img]);
}

function galleryStrip(item) {
  if (!item.images?.length || item.images.length < 2) return null;
  return el('div', { class: 'gal-strip', role: 'list', 'aria-label': t('detail.morePhotos') },
    item.images.map((image, index) => {
      const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
      bindImageSrc(img, image, { tier: ImageTier.THUMB });
      return el('div', { class: 'gal-thumb-wrap', role: 'listitem' }, [
        el('button', {
          class: `gal-thumb img-open${image.id === item.primaryImageId ? ' on' : ''}`,
          type: 'button',
          'aria-label': t('detail.photoOf', { index: index + 1, total: item.images.length }),
          onClick: () => inspect(item, image.id),
        }, [img]),
      ]);
    }));
}

function aiPanel(item) {
  const ai = item.aiData;
  if (!ai) return null;
  const stale = isAnalysisStale(item);

  const pill = (label, value) => (value == null || value === '' ? null : el('div', { class: 'aipill' }, [
    el('div', { class: 'aiplbl', text: label }),
    el('div', { class: 'aipval', text: String(value) }),
  ]));

  const scorePill = (label, score) => (score == null ? null : el('div', { class: 'aipill' }, [
    el('div', { class: 'aiplbl', text: label }),
    el('div', { class: 'aipval' }, [String(score), el('small', { text: '/10' })]),
  ]));

  return el('div', { class: 'aipanel', style: { marginTop: '14px' } }, [
    el('div', { class: 'aiphdr' }, [
      el('div', { class: `aidot${stale ? '' : ' live'}` }),
      `✦ ${assistantName()}`,
      el('span', { class: 'ai-badge', text: aiSubtitle() }),
    ]),
    el('div', { class: 'aibody' }, [
      stale ? el('div', { class: 'ai-stale', role: 'status' }, [
        t('detail.aiStale'),
      ]) : null,
      el('div', { class: 'aitxt', text: ai.description || ai.evaluation || '' }),
      el('div', { class: 'airow' }, [
        scorePill(t('detail.localMarket'), ai.localScore),
        scorePill(t('detail.globalMarket'), ai.globalScore),
        pill(t('field.condition'), ai.condition ? conditionLabel(ai.condition) : null),
        ai.suggestedValuation ? pill(t('ai.subtitle'), formatValuation(ai.suggestedValuation, { compact: true })) : null,
      ]),
      el('div', { class: 'ai-disclaimer', text: aiDisclaimer() }),
      ai.analyzedAt ? el('div', { class: 'ai-meta', text: `${assistantName()} · ${formatDate(ai.analyzedAt)}` }) : null,
    ]),
  ]);
}

export async function openDetail(itemId) {
  const { item } = await resolve(itemId);
  if (!item) return;
  drawDetail(item);
  openSheet('det');
}

/**
 * The record on the open detail and quick-preview sheets, so a language
 * switch can redraw them as they are — same record, no second read.
 */
const shown = { det: null, qp: null };

onLanguageChange(() => {
  if (shown.det && isSheetOpen('det')) drawDetail(shown.det);
  if (shown.qp && isSheetOpen('qp')) drawPreview(shown.qp);
});

function drawDetail(item) {
  shown.det = item;
  const itemId = item.id;
  const category = repository.category(item.categoryId);
  const folder = repository.folder(item.folderId);
  const location = repository.location(item.locationId);

  setText('dettitle', item.name || '—');

  render($('detbody'), [
    el('div', { style: { padding: '0 20px 20px' } }, [
      el('div', { class: 'dhero gls' }, [heroNode(item)]),
      galleryStrip(item),
      el('div', { class: 'drow3' }, [
        el('div', { class: 'dpill gls' }, [
          el('div', { class: 'dpval', text: formatNumber(item.quantity) }),
          el('div', { class: 'dplbl', text: unitLabel(item.unit) || t('detail.count') }),
        ]),
        el('div', { class: 'dpill gls' }, [
          el('div', { class: 'dpval', style: { fontSize: '13px' }, text: conditionLabel(item.condition) || '—' }),
          el('div', { class: 'dplbl', text: t('field.condition') }),
        ]),
        el('div', { class: 'dpill gls' }, [
          el('div', { class: 'dpval', style: { fontSize: '12px', color: 'var(--blue)' }, text: formatValuation(item.valuation, { compact: true }) }),
          el('div', { class: 'dplbl', text: t('field.valuation') }),
        ]),
      ]),
      el('div', { class: 'fsec' }, [
        detailRow(t('field.category'), `${category.icon} ${categoryName(category)}`),
        folder ? detailRow(t('field.folder'), `${folder.icon} ${folder.name}`) : null,
        location ? detailRow(t('field.location'), locationName(location)) : null,
        detailRow(t('field.sku'), item.sku),
        detailRow(t('field.barcode'), item.barcode),
        detailRow(t('field.brand'), item.brand),
        // The identifiers an insurer, a police report or an auction house asks
        // for. They are shown left-to-right and isolated, because an Arabic
        // paragraph direction otherwise reorders a mixed letter-and-digit
        // serial on screen into something that is not what is on the object.
        identifierRow(t('field.serialNumber'), item.serialNumber),
        identifierRow(t('field.modelNumber'), item.modelNumber),
        identifierRow(t('field.referenceNumber'), item.referenceNumber),
        item.valuation ? detailRow(t('field.valuation'), formatValuation(item.valuation)) : null,
        item.valuation ? detailRow(t('export.valuationSource'), item.valuation.source === 'ai' ? t('detail.estimateFrom', { name: assistantName() }) : t('form.manual')) : null,
      ]),
      item.description ? el('div', {
        class: 'desc-block',
        dir: 'auto',
        text: item.description,
      }) : null,
      aiPanel(item),
      el('div', { class: 'det-meta' }, [
        t('detail.added', { date: formatDate(item.createdAt) }),
        item.updatedAt && item.updatedAt !== item.createdAt ? ` · ${t('detail.updated', { date: formatDate(item.updatedAt) })}` : '',
      ]),
    ]),
  ]);

  const canWrite = repository.canWrite();
  const editButton = $('detedit');
  const deleteButton = $('detdel');
  const moveButton = $('detmove');
  const labelButton = $('detlabel');

  for (const [button, handler] of [
    [editButton, () => { closeSheet('det'); setTimeout(() => openItemForm({ itemId }), 240); }],
    // The version on screen goes with the action, so a record changed
    // elsewhere since this sheet was drawn is a conflict, not an overwrite.
    [deleteButton, () => { closeSheet('det'); setTimeout(() => deleteItemFlow(itemId, { version: item.version }), 240); }],
    [moveButton, () => { closeSheet('det'); setTimeout(() => openMoveSheet(itemId, { version: item.version }), 240); }],
  ]) {
    if (!button) continue;
    button.onclick = handler;
    button.disabled = !canWrite;
    button.style.display = canWrite ? '' : 'none';
  }

  // Printing a label changes nothing, so a viewer may do it too.
  if (labelButton) {
    labelButton.onclick = () => { closeSheet('det'); setTimeout(() => openLabels([itemId]), 240); };
  }
}

export async function openQuickPreview(itemId) {
  const { item } = await resolve(itemId);
  if (!item) return;
  drawPreview(item);
  openSheet('qp');
}

function drawPreview(item) {
  shown.qp = item;
  const itemId = item.id;
  const category = repository.category(item.categoryId);
  const folder = repository.folder(item.folderId);
  const location = repository.location(item.locationId);

  setText('qptitle', item.name || '—');
  render($('qpbody'), [
    el('div', [
      el('div', { class: 'qp-hero gls' }, [heroNode(item, { big: false })]),
      el('div', { class: 'fsec' }, [
        detailRow(t('field.category'), `${category.icon} ${categoryName(category)}`),
        folder ? detailRow(t('field.folder'), `${folder.icon} ${folder.name}`) : null,
        location ? detailRow(t('field.location'), locationName(location)) : null,
        detailRow(t('field.quantity'), `${formatNumber(item.quantity)} ${unitLabel(item.unit)}`.trim()),
        detailRow(t('field.condition'), conditionLabel(item.condition)),
        item.valuation ? detailRow(t('field.valuation'), formatValuation(item.valuation)) : null,
        detailRow(t('field.brand'), item.brand),
        detailRow(t('field.sku'), item.sku),
        detailRow(t('field.barcode'), item.barcode),
        identifierRow(t('field.serialNumber'), item.serialNumber),
      ]),
      item.description ? el('div', { class: 'desc-block desc-block-sm', dir: 'auto', text: item.description }) : null,
    ]),
  ]);

  const open = $('qp-open');
  if (open) {
    open.onclick = () => { closeSheet('qp'); setTimeout(() => { void openDetail(itemId); }, 240); };
  }
}

export async function openMoveSheet(itemId, { version } = {}) {
  if (!repository.canWrite()) { toast(t('error.repo/forbidden.viewer'), '🔒'); return; }
  const { item } = await resolve(itemId);
  if (!item) return;
  const shownVersion = version ?? item.version;

  const targets = [
    { id: null, name: t('home.mainInventory'), icon: '📦', color: null },
    ...repository.state.folders,
  ];

  render($('mvlist'), targets.map((target) => {
    const isCurrent = (target.id || null) === (item.folderId || null);
    // Same rule as the folder cards on the home screen: a count taken from a
    // window is a fraction wearing a total's clothes, so there is no count
    // until there is an inventory to count.
    const count = !repository.itemsComplete ? null
      : target.id
        ? repository.liveItems().filter((i) => i.folderId === target.id).length
        : repository.liveItems().filter((i) => !i.folderId).length;
    const color = target.color || '#007AFF';

    return el('button', {
      class: 'mv-row',
      type: 'button',
      'aria-current': isCurrent ? 'true' : undefined,
      onClick: async () => {
        try {
          await repository.moveItem(itemId, target.id, shownVersion);
          toast(target.id ? t('detail.movedTo', { name: target.name }) : t('detail.movedToMain'), '🗂');
          closeSheet('mv');
        } catch (error) {
          toastError(error, 'detail.moveFailed');
        }
      },
    }, [
      el('div', {
        class: 'mv-ico',
        style: { background: target.id ? `${color}22` : 'rgba(0,0,0,.06)' },
        text: target.icon,
        'aria-hidden': 'true',
      }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'mv-name', dir: 'auto', text: target.name }),
        count == null ? null : el('div', { class: 'mv-sub', text: t('count.items', { count }) }),
      ]),
      isCurrent ? el('div', { style: { color: 'var(--blue)', fontSize: '18px', fontWeight: '700' }, text: '✓' }) : null,
    ]);
  }));

  openSheet('mv');
}

export async function deleteItemFlow(itemId, { version } = {}) {
  const { item } = await resolve(itemId);
  if (!item) return;
  const confirmed = await confirmAction({
    titleKey: 'detail.trashTitle', titleParams: { name: item.name },
    messageKey: 'detail.trashMessage',
    icon: '🗑',
    confirmLabelKey: 'bulk.trashConfirm',
  });
  if (!confirmed) return;

  try {
    await repository.deleteItem(itemId, version ?? item.version);
    flashSuccess();
    toast(t('detail.trashed'), '🗑');
  } catch (error) {
    toastError(error, 'detail.deleteFailed');
  }
}

export async function duplicateItemFlow(itemId) {
  try {
    const copy = await repository.duplicateItem(itemId);
    toast(t('detail.duplicated', { sku: copy.sku }), '⧉');
  } catch (error) {
    toastError(error, 'detail.duplicateFailed');
  }
}
