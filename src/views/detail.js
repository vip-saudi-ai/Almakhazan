// Item detail, quick preview, move-to-folder, delete and duplicate flows.

import { AI_DISCLAIMER, AI_SUBTITLE, AI_TITLE, ASSISTANT_NAME, isAnalysisStale } from '../ai.js';
import { repository } from '../repository.js';
import { ImageTier, bindImageSrc } from '../storage.js';
import { openImageViewer } from './image-viewer.js';
import { $, el, formatDate, formatNumber, render, setText } from '../utils.js';
import { formatValuation, primaryImage } from '../validation.js';
import {
  closeSheet, confirmAction, detailRow, flashSuccess, identifierRow, openSheet, toast, toastError,
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
    if (mine === generation) toastError(error, 'تعذّر فتح القطعة. حاول مرة أخرى.');
    return { item: null, stale: mine !== generation };
  }
  if (mine !== generation) return { item: null, stale: true };
  if (!item) toast('لم تعد هذه القطعة موجودة.', '✕');
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
  const img = el('img', { alt: item.name || 'صورة القطعة' });
  bindImageSrc(img, image, { tier: big ? ImageTier.DISPLAY : ImageTier.THUMB });
  // A photograph of an object is the documentation of it, so it is always a
  // way in to looking at it properly — a button, not a picture.
  return el('button', {
    class: 'img-open', type: 'button',
    'aria-label': `عرض صورة ${item.name || 'القطعة'} بملء الشاشة`,
    onClick: () => inspect(item, image.id),
  }, [img]);
}

function galleryStrip(item) {
  if (!item.images?.length || item.images.length < 2) return null;
  return el('div', { class: 'gal-strip', role: 'list', 'aria-label': 'صور إضافية' },
    item.images.map((image, index) => {
      const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
      bindImageSrc(img, image, { tier: ImageTier.THUMB });
      return el('div', { class: 'gal-thumb-wrap', role: 'listitem' }, [
        el('button', {
          class: `gal-thumb img-open${image.id === item.primaryImageId ? ' on' : ''}`,
          type: 'button',
          'aria-label': `عرض الصورة ${index + 1} من ${item.images.length}`,
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
      `✦ ${AI_TITLE}`,
      el('span', { class: 'ai-badge', text: AI_SUBTITLE }),
    ]),
    el('div', { class: 'aibody' }, [
      stale ? el('div', { class: 'ai-stale', role: 'status' }, [
        '⚠ تغيّرت الصورة بعد آخر تحليل — أعد التحليل للحصول على نتيجة محدّثة',
      ]) : null,
      el('div', { class: 'aitxt', text: ai.description || ai.evaluation || '' }),
      el('div', { class: 'airow' }, [
        scorePill('السوق المحلي', ai.localScore),
        scorePill('السوق العالمي', ai.globalScore),
        pill('الحالة', ai.condition),
        ai.suggestedValuation ? pill('تقدير أولي', formatValuation(ai.suggestedValuation, { compact: true })) : null,
      ]),
      el('div', { class: 'ai-disclaimer', text: AI_DISCLAIMER }),
      ai.analyzedAt ? el('div', { class: 'ai-meta', text: `${ASSISTANT_NAME} · ${formatDate(ai.analyzedAt)}` }) : null,
    ]),
  ]);
}

export async function openDetail(itemId) {
  const { item } = await resolve(itemId);
  if (!item) return;

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
          el('div', { class: 'dplbl', text: item.unit || 'العدد' }),
        ]),
        el('div', { class: 'dpill gls' }, [
          el('div', { class: 'dpval', style: { fontSize: '13px' }, text: item.condition || '—' }),
          el('div', { class: 'dplbl', text: 'الحالة' }),
        ]),
        el('div', { class: 'dpill gls' }, [
          el('div', { class: 'dpval', style: { fontSize: '12px', color: 'var(--blue)' }, text: formatValuation(item.valuation, { compact: true }) }),
          el('div', { class: 'dplbl', text: 'التقييم' }),
        ]),
      ]),
      el('div', { class: 'fsec' }, [
        detailRow('التصنيف', `${category.icon} ${category.name}`),
        folder ? detailRow('المجلد', `${folder.icon} ${folder.name}`) : null,
        location ? detailRow('الموقع', location.name) : null,
        detailRow('الرمز', item.sku),
        detailRow('الباركود', item.barcode),
        detailRow('البراند', item.brand),
        // The identifiers an insurer, a police report or an auction house asks
        // for. They are shown left-to-right and isolated, because an Arabic
        // paragraph direction otherwise reorders a mixed letter-and-digit
        // serial on screen into something that is not what is on the object.
        identifierRow('الرقم التسلسلي', item.serialNumber),
        identifierRow('رقم الموديل', item.modelNumber),
        identifierRow('الرقم المرجعي', item.referenceNumber),
        item.valuation ? detailRow('التقييم', formatValuation(item.valuation)) : null,
        item.valuation ? detailRow('مصدر التقييم', item.valuation.source === 'ai' ? `تقدير من ${ASSISTANT_NAME}` : 'يدوي') : null,
      ]),
      item.description ? el('div', {
        class: 'desc-block',
        text: item.description,
      }) : null,
      aiPanel(item),
      el('div', { class: 'det-meta' }, [
        `أُضيف ${formatDate(item.createdAt)}`,
        item.updatedAt && item.updatedAt !== item.createdAt ? ` · آخر تحديث ${formatDate(item.updatedAt)}` : '',
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

  openSheet('det');
}

export async function openQuickPreview(itemId) {
  const { item } = await resolve(itemId);
  if (!item) return;
  const category = repository.category(item.categoryId);
  const folder = repository.folder(item.folderId);
  const location = repository.location(item.locationId);

  setText('qptitle', item.name || '—');
  render($('qpbody'), [
    el('div', [
      el('div', { class: 'qp-hero gls' }, [heroNode(item, { big: false })]),
      el('div', { class: 'fsec' }, [
        detailRow('التصنيف', `${category.icon} ${category.name}`),
        folder ? detailRow('المجلد', `${folder.icon} ${folder.name}`) : null,
        location ? detailRow('الموقع', location.name) : null,
        detailRow('الكمية', `${formatNumber(item.quantity)} ${item.unit || ''}`.trim()),
        detailRow('الحالة', item.condition),
        item.valuation ? detailRow('التقييم', formatValuation(item.valuation)) : null,
        detailRow('البراند', item.brand),
        detailRow('الرمز', item.sku),
        detailRow('الباركود', item.barcode),
        identifierRow('الرقم التسلسلي', item.serialNumber),
      ]),
      item.description ? el('div', { class: 'desc-block desc-block-sm', text: item.description }) : null,
    ]),
  ]);

  const open = $('qp-open');
  if (open) {
    open.onclick = () => { closeSheet('qp'); setTimeout(() => { void openDetail(itemId); }, 240); };
  }
  openSheet('qp');
}

export async function openMoveSheet(itemId, { version } = {}) {
  if (!repository.canWrite()) { toast('صلاحيتك للعرض فقط', '🔒'); return; }
  const { item } = await resolve(itemId);
  if (!item) return;
  const shownVersion = version ?? item.version;

  const targets = [
    { id: null, name: 'الجرد الرئيسي', icon: '📦', color: null },
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
          toast(target.id ? `نُقل إلى ${target.name}` : 'نُقل للجرد الرئيسي', '🗂');
          closeSheet('mv');
        } catch (error) {
          toastError(error, 'تعذّر نقل القطعة');
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
        el('div', { class: 'mv-name', text: target.name }),
        count == null ? null : el('div', { class: 'mv-sub', text: `${count} قطعة` }),
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
    title: `نقل "${item.name}" للمحذوفات؟`,
    message: 'ستبقى القطعة قابلة للاستعادة من سلة المحذوفات.',
    icon: '🗑',
    confirmLabel: 'نقل للمحذوفات',
  });
  if (!confirmed) return;

  try {
    await repository.deleteItem(itemId, version ?? item.version);
    flashSuccess();
    toast('نُقلت للمحذوفات', '🗑');
  } catch (error) {
    toastError(error, 'تعذّر حذف القطعة');
  }
}

export async function duplicateItemFlow(itemId) {
  try {
    const copy = await repository.duplicateItem(itemId);
    toast(`تم نسخ القطعة — ${copy.sku}`, '⧉');
  } catch (error) {
    toastError(error, 'تعذّر نسخ القطعة');
  }
}
