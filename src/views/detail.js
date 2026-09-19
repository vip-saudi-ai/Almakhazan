// Item detail, quick preview, move-to-folder, delete and duplicate flows.

import { AI_DISCLAIMER, AI_SUBTITLE, AI_TITLE, ASSISTANT_NAME, isAnalysisStale } from '../ai.js';
import { repository } from '../repository.js';
import { bindImageSrc } from '../storage.js';
import { $, el, formatDate, formatNumber, render, setText } from '../utils.js';
import { formatValuation, primaryImage } from '../validation.js';
import {
  closeSheet, confirmAction, detailRow, flashSuccess, openSheet, toast, toastError,
} from '../ui.js';
import { openItemForm } from './item-form.js';

function heroNode(item, { big = true } = {}) {
  const image = primaryImage(item);
  const category = repository.category(item.categoryId);
  if (!image) {
    return el('div', { style: { fontSize: big ? '72px' : '64px' }, text: category.icon, 'aria-hidden': 'true' });
  }
  const img = el('img', { alt: item.name || 'صورة القطعة' });
  // The detail hero is the one place the full-resolution original is worth loading.
  bindImageSrc(img, image, { thumbnail: !big });
  return img;
}

function galleryStrip(item) {
  if (!item.images?.length || item.images.length < 2) return null;
  return el('div', { class: 'gal-strip', role: 'list', 'aria-label': 'صور إضافية' },
    item.images.map((image) => {
      const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
      bindImageSrc(img, image, { thumbnail: true });
      return el('div', {
        class: `gal-thumb${image.id === item.primaryImageId ? ' on' : ''}`,
        role: 'listitem',
      }, [img]);
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

export function openDetail(itemId) {
  const item = repository.item(itemId);
  if (!item) { toast('القطعة غير موجودة', '✕'); return; }

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

  for (const [button, handler] of [
    [editButton, () => { closeSheet('det'); setTimeout(() => openItemForm({ itemId }), 240); }],
    [deleteButton, () => { closeSheet('det'); setTimeout(() => deleteItemFlow(itemId), 240); }],
    [moveButton, () => { closeSheet('det'); setTimeout(() => openMoveSheet(itemId), 240); }],
  ]) {
    if (!button) continue;
    button.onclick = handler;
    button.disabled = !canWrite;
    button.style.display = canWrite ? '' : 'none';
  }

  openSheet('det');
}

export function openQuickPreview(itemId) {
  const item = repository.item(itemId);
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
      ]),
      item.description ? el('div', { class: 'desc-block desc-block-sm', text: item.description }) : null,
    ]),
  ]);

  const open = $('qp-open');
  if (open) {
    open.onclick = () => { closeSheet('qp'); setTimeout(() => openDetail(itemId), 240); };
  }
  openSheet('qp');
}

export function openMoveSheet(itemId) {
  const item = repository.item(itemId);
  if (!item) return;
  if (!repository.canWrite()) { toast('صلاحيتك للعرض فقط', '🔒'); return; }

  const targets = [
    { id: null, name: 'الجرد الرئيسي', icon: '📦', color: null },
    ...repository.state.folders,
  ];

  render($('mvlist'), targets.map((target) => {
    const isCurrent = (target.id || null) === (item.folderId || null);
    const count = target.id
      ? repository.liveItems().filter((i) => i.folderId === target.id).length
      : repository.liveItems().filter((i) => !i.folderId).length;
    const color = target.color || '#007AFF';

    return el('button', {
      class: 'mv-row',
      type: 'button',
      'aria-current': isCurrent ? 'true' : undefined,
      onClick: async () => {
        try {
          await repository.moveItem(itemId, target.id);
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
        el('div', { class: 'mv-sub', text: `${count} قطعة` }),
      ]),
      isCurrent ? el('div', { style: { color: 'var(--blue)', fontSize: '18px', fontWeight: '700' }, text: '✓' }) : null,
    ]);
  }));

  openSheet('mv');
}

export async function deleteItemFlow(itemId) {
  const item = repository.item(itemId);
  if (!item) return;
  const confirmed = await confirmAction({
    title: `نقل "${item.name}" للمحذوفات؟`,
    message: 'ستبقى القطعة قابلة للاستعادة من سلة المحذوفات.',
    icon: '🗑',
    confirmLabel: 'نقل للمحذوفات',
  });
  if (!confirmed) return;

  try {
    await repository.deleteItem(itemId);
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
