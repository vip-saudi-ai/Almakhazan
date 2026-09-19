// Add / edit sheet: fields, multi-image management, AI analysis, save.

import { AI_DISCLAIMER, AI_SUBTITLE, AI_TITLE, AiAvailability, aiAvailability, analyzeItem } from '../ai.js';
import { CONDITIONS, CURRENCIES, CURRENCY_LABELS, IMAGE_LIMITS, UNITS, UNCATEGORIZED_ID } from '../config.js';
import { repository, ConflictError } from '../repository.js';
import { bindImageSrc, uploadImage } from '../storage.js';
import { $, el, render, setText, uid } from '../utils.js';
import {
  formatValuation, normalizeValuation, parseValuationText, validateQuantity,
} from '../validation.js';
import { closeSheet, confirmAction, openSheet, optionList, toast, toastError, withBusy } from '../ui.js';

const form = {
  itemId: null,
  isNew: true,
  baseVersion: null,
  images: [],
  primaryImageId: null,
  aiData: null,
  descriptionMode: 'manual',
  provisionalSku: null,
};

// ── field helpers ──
function fillSelects(item) {
  optionList($('f-cat'), [
    ...repository.state.categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })),
    { value: UNCATEGORIZED_ID, label: '📦 غير مصنّف' },
  ], item?.categoryId || repository.state.categories[0]?.id || UNCATEGORIZED_ID);

  optionList($('f-folder'), [
    { value: '', label: '— الجرد الرئيسي —' },
    ...repository.state.folders.map((f) => ({ value: f.id, label: `${f.icon} ${f.name}` })),
  ], item?.folderId || '');

  optionList($('f-loc'), [
    { value: '', label: '— غير محدد —' },
    ...repository.state.locations.map((l) => ({ value: l.id, label: l.name })),
  ], item?.locationId || '');

  optionList($('f-cond'), [
    { value: '', label: 'غير محدد' },
    ...CONDITIONS.map((c) => ({ value: c, label: c })),
  ], item?.condition || '');

  optionList($('f-currency'), CURRENCIES.map((code) => ({
    value: code, label: `${CURRENCY_LABELS[code]} ${code}`,
  })), item?.valuation?.currency || 'SAR');

  const unitSelect = $('f-unit');
  unitSelect.replaceChildren();
  for (const [group, units] of Object.entries(UNITS)) {
    const optgroup = el('optgroup', { label: group });
    for (const unit of units) optgroup.append(el('option', { value: unit, text: unit }));
    unitSelect.append(optgroup);
  }
  unitSelect.value = item?.unit || 'قطعة';
}

function setDescriptionMode(mode) {
  form.descriptionMode = mode;
  $('dtbtn-manual').className = `desc-toggle-btn${mode === 'manual' ? ' on' : ''}`;
  $('dtbtn-ai').className = `desc-toggle-btn${mode === 'ai' ? ' on' : ''}`;
  $('dtbtn-manual').setAttribute('aria-pressed', String(mode === 'manual'));
  $('dtbtn-ai').setAttribute('aria-pressed', String(mode === 'ai'));
  $('ai-section').style.display = mode === 'ai' ? '' : 'none';
  $('desc-manual-sec').style.display = mode === 'manual' ? '' : 'none';
  if (mode === 'ai') refreshAiPanel();
}

// ── images ──
function renderImages() {
  const strip = $('img-strip');
  if (!strip) return;

  render(strip, [
    ...form.images.map((image) => {
      const img = el('img', { alt: image.originalFilename || 'صورة', loading: 'lazy', decoding: 'async' });
      bindImageSrc(img, image, { thumbnail: true });
      const isPrimary = image.id === form.primaryImageId;

      return el('div', { class: `img-cell${isPrimary ? ' primary' : ''}` }, [
        img,
        isPrimary ? el('span', { class: 'img-primary-tag', text: 'رئيسية' }) : null,
        el('div', { class: 'img-cell-acts' }, [
          !isPrimary ? el('button', {
            class: 'img-act', type: 'button', text: '★', title: 'اجعلها الصورة الرئيسية',
            'aria-label': 'اجعلها الصورة الرئيسية',
            onClick: () => { form.primaryImageId = image.id; renderImages(); refreshAiPanel(); },
          }) : null,
          el('button', {
            class: 'img-act', type: 'button', text: '‹', title: 'نقل لليمين', 'aria-label': 'نقل الصورة لليمين',
            onClick: () => moveImage(image.id, -1),
          }),
          el('button', {
            class: 'img-act', type: 'button', text: '›', title: 'نقل لليسار', 'aria-label': 'نقل الصورة لليسار',
            onClick: () => moveImage(image.id, 1),
          }),
          el('button', {
            class: 'img-act danger', type: 'button', text: '✕', title: 'حذف الصورة', 'aria-label': 'حذف الصورة',
            onClick: () => removeImage(image.id),
          }),
        ]),
      ]);
    }),
    form.images.length < IMAGE_LIMITS.maxPerItem ? el('button', {
      class: 'img-cell img-add', type: 'button', 'aria-label': 'إضافة صورة',
      onClick: () => $('imgInput').click(),
    }, [
      el('span', { class: 'ipicotext', text: '📷', 'aria-hidden': 'true' }),
      el('span', { class: 'iptxt', text: form.images.length ? 'إضافة صورة' : 'أضف صورة' }),
      el('span', { class: 'ipsub', text: 'كل الصيغ' }),
    ]) : null,
  ]);

  setText('img-count', form.images.length
    ? `${form.images.length} / ${IMAGE_LIMITS.maxPerItem} صورة`
    : 'لا توجد صور');
}

function moveImage(imageId, direction) {
  const index = form.images.findIndex((i) => i.id === imageId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= form.images.length) return;
  const [moved] = form.images.splice(index, 1);
  form.images.splice(target, 0, moved);
  renderImages();
}

async function removeImage(imageId) {
  const image = form.images.find((i) => i.id === imageId);
  if (!image) return;
  const confirmed = await confirmAction({
    title: 'إزالة الصورة من هذه القطعة؟',
    message: 'لن تتأثر أي قطعة أخرى تستخدم نفس الصورة.',
    icon: '🖼',
    confirmLabel: 'إزالة',
  });
  if (!confirmed) return;

  // Only the reference is dropped here. The file itself is reclaimed by the
  // backend once no item points at it, so removing it from one item can never
  // destroy the copy another item still shows.
  form.images = form.images.filter((i) => i.id !== imageId);
  if (form.primaryImageId === imageId) form.primaryImageId = form.images[0]?.id || null;
  renderImages();
  refreshAiPanel();
}

async function handleFiles(fileList) {
  const files = [...fileList].slice(0, IMAGE_LIMITS.maxPerItem - form.images.length);
  if (!files.length) {
    toast(`الحد الأقصى ${IMAGE_LIMITS.maxPerItem} صور`, '⚠');
    return;
  }

  const progress = $('img-progress');
  progress.style.display = '';

  const STAGES = {
    prepare: 'جارٍ تجهيز الصورة…',
    upload: 'جارٍ الرفع…',
    save: 'جارٍ الحفظ…',
  };

  for (const [index, file] of files.entries()) {
    try {
      const counter = files.length > 1 ? ` (${index + 1}/${files.length})` : '';
      setText('img-progress-label', STAGES.prepare + counter);
      const image = await uploadImage(file, {
        mode: repository.session.mode,
        workspaceId: repository.session.workspaceId,
        itemId: form.itemId,
        userId: repository.session.userId,
      }, (percent, stage) => {
        $('img-progress-bar').style.width = `${percent}%`;
        if (stage) setText('img-progress-label', STAGES[stage] + counter);
      });

      form.images.push(image);
      form.primaryImageId ||= image.id;
      renderImages();
    } catch (error) {
      toastError(error, 'فشل رفع الصورة');
    }
  }

  progress.style.display = 'none';
  $('img-progress-bar').style.width = '0%';
  $('imgInput').value = '';
  refreshAiPanel();
}

// ── AI ──
function primaryFormImage() {
  return form.images.find((i) => i.id === form.primaryImageId) || form.images[0] || null;
}

function refreshAiPanel() {
  const availability = aiAvailability();
  const image = primaryFormImage();
  const button = $('aibtn');
  const content = $('aicontent');
  const dot = $('aidot');
  if (!button || !content) return;

  const canRun = availability === AiAvailability.READY
    && Boolean(image)
    && !image.storagePath?.startsWith('local:')
    && repository.canWrite();
  button.disabled = !canRun;

  let hint = '';
  if (availability === AiAvailability.UNAVAILABLE) hint = 'خدمة التحليل غير مهيأة على الخادم';
  else if (availability === AiAvailability.OFFLINE) hint = 'التحليل يحتاج اتصالاً بالإنترنت';
  else if (!image) hint = 'أضف صورة ثم اضغط تحليل';
  else if (image.storagePath?.startsWith('local:')) hint = 'التحليل يتطلب تسجيل الدخول لرفع الصورة للسحابة';

  if (form.aiData) {
    const ai = form.aiData;
    const stale = ai.imageHash && image?.hash && ai.imageHash !== image.hash;
    dot.className = `aidot${stale ? '' : ' live'}`;
    render(content, [
      stale ? el('div', { class: 'ai-stale', role: 'status', text: '⚠ تغيّرت الصورة بعد آخر تحليل — أعد التحليل' }) : null,
      el('div', { class: 'aitxt', style: { marginBottom: '8px' }, text: ai.description || ai.evaluation || '' }),
      el('div', { class: 'airow' }, [
        ai.localScore != null ? el('div', { class: 'aipill' }, [
          el('div', { class: 'aiplbl', text: 'السوق المحلي' }),
          el('div', { class: 'aipval' }, [String(ai.localScore), el('small', { text: '/10' })]),
        ]) : null,
        ai.globalScore != null ? el('div', { class: 'aipill' }, [
          el('div', { class: 'aiplbl', text: 'السوق العالمي' }),
          el('div', { class: 'aipval' }, [String(ai.globalScore), el('small', { text: '/10' })]),
        ]) : null,
        ai.condition ? el('div', { class: 'aipill' }, [
          el('div', { class: 'aiplbl', text: 'الحالة' }),
          el('div', { class: 'aipval', style: { fontSize: '13px' }, text: ai.condition }),
        ]) : null,
        ai.suggestedValuation ? el('div', { class: 'aipill' }, [
          el('div', { class: 'aiplbl', text: 'تقدير أولي' }),
          el('div', { class: 'aipval', style: { fontSize: '12px' }, text: formatValuation(ai.suggestedValuation, { compact: true }) }),
        ]) : null,
      ]),
      el('div', { class: 'ai-disclaimer', text: AI_DISCLAIMER }),
    ]);
  } else {
    dot.className = 'aidot';
    render(content, [el('div', { class: 'aiph', text: hint || 'أضف صورة ثم اضغط تحليل' })]);
  }

  setText('ai-status-label', `${AI_TITLE} · ${AI_SUBTITLE}`);
}

async function runAnalysis() {
  const image = primaryFormImage();
  if (!image) { toast('أضف صورة أولاً', '⚠'); return; }

  const button = $('aibtn');
  await withBusy(button, 'جارٍ التحليل…', async () => {
    try {
      const aiData = await analyzeItem({
        workspaceId: repository.session.workspaceId,
        itemId: form.itemId,
        image,
        name: $('f-name').value.trim(),
        categoryName: repository.category($('f-cat').value).name,
      });

      form.aiData = aiData;
      refreshAiPanel();

      // Suggestions fill only empty fields; they never overwrite the user.
      if (!$('f-name').value.trim() && aiData.description) {
        $('f-name').value = aiData.description.split(' ').slice(0, 5).join(' ');
      }
      if (aiData.condition && !$('f-cond').value) $('f-cond').value = aiData.condition;
      if (aiData.suggestedValuation && !$('f-valuation').value.trim()) {
        const { min, max, currency } = aiData.suggestedValuation;
        $('f-valuation').value = min === max ? String(min) : `${min}-${max}`;
        $('f-currency').value = currency;
        updateValuationPreview();
      }
      toast('اكتمل التحليل ✦');
    } catch (error) {
      toastError(error, 'تعذّر إجراء التحليل');
    }
  });
}

// ── valuation preview ──
function readValuation() {
  const text = $('f-valuation').value.trim();
  if (!text) return null;
  return normalizeValuation({
    ...parseValuationText(text, { currency: $('f-currency').value }),
    currency: $('f-currency').value,
  });
}

function updateValuationPreview() {
  const preview = $('f-valuation-preview');
  if (!preview) return;
  const text = $('f-valuation').value.trim();
  if (!text) { preview.textContent = ''; return; }
  const valuation = readValuation();
  preview.textContent = valuation
    ? `سيُحفظ كـ ${formatValuation(valuation)}`
    : 'لم يُتعرّف على رقم — سيُحفظ بدون تقييم';
  preview.className = `field-hint${valuation ? '' : ' warn'}`;
}

// ── open / save ──
export function openItemForm({ itemId = null, folderId = null } = {}) {
  if (!repository.canWrite()) { toast('صلاحيتك للعرض فقط', '🔒'); return; }

  const item = itemId ? repository.item(itemId) : null;
  form.itemId = item?.id || uid('itm');
  form.isNew = !item;
  form.baseVersion = item?.version ?? null;
  form.images = item ? [...item.images] : [];
  form.primaryImageId = item?.primaryImageId || null;
  form.aiData = item?.aiData || null;

  setText('addtitle', item ? 'تعديل القطعة' : 'إضافة قطعة');
  fillSelects(item);

  $('f-name').value = item?.name || '';
  form.provisionalSku = repository.provisionalSku();
  $('f-sku').value = item?.sku || form.provisionalSku;
  $('f-barcode').value = item?.barcode || '';
  $('f-qty').value = item ? String(item.quantity) : '';
  $('f-brand').value = item?.brand || '';
  $('f-desc').value = item?.description || '';
  $('f-valuation').value = item?.valuation
    ? (item.valuation.min === item.valuation.max ? String(item.valuation.min) : `${item.valuation.min}-${item.valuation.max}`)
    : '';
  if (folderId) $('f-folder').value = folderId;

  updateValuationPreview();
  renderImages();
  setDescriptionMode(item?.aiData ? 'ai' : 'manual');
  refreshAiPanel();

  openSheet('add', { focus: '#f-name' });
}

async function saveItem() {
  const name = $('f-name').value.trim();
  if (!name) { toast('أدخل اسم القطعة', '⚠'); $('f-name').focus(); return; }

  const unit = $('f-unit').value || 'قطعة';
  const quantity = validateQuantity($('f-qty').value, unit);
  if (!quantity.ok) { toast(quantity.error, '⚠'); $('f-qty').focus(); return; }

  const sku = $('f-sku').value.trim();
  const barcode = $('f-barcode').value.trim();

  const skuClash = repository.skuConflict(sku, form.isNew ? null : form.itemId);
  if (skuClash) {
    const proceed = await confirmAction({
      title: 'الرمز مستخدم مسبقاً',
      message: `الرمز "${sku}" مرتبط بالقطعة "${skuClash.name}". هل تريد توليد رمز جديد؟`,
      icon: '🔖',
      confirmLabel: 'توليد رمز جديد',
    });
    if (!proceed) return;
    $('f-sku').value = await repository.reserveSku();
    return saveItem();
  }

  const barcodeClash = barcode ? repository.barcodeConflict(barcode, form.isNew ? null : form.itemId) : null;
  if (barcodeClash) {
    const proceed = await confirmAction({
      title: 'الباركود مكرّر',
      message: `الباركود "${barcode}" مسجّل على "${barcodeClash.name}". هل تريد الحفظ على أي حال؟`,
      icon: '⚠️',
      confirmLabel: 'حفظ رغم التكرار',
    });
    if (!proceed) return;
  }

  // The field shows a provisional number so the form looks complete. If the
  // user left it untouched, take an authoritative one from the workspace
  // counter now — two devices saving at once must not land on the same SKU.
  const resolvedSku = (form.isNew && (!sku || sku === form.provisionalSku))
    ? await repository.reserveSku()
    : sku;

  const payload = {
    id: form.itemId,
    name,
    sku: resolvedSku,
    barcode,
    categoryId: $('f-cat').value || UNCATEGORIZED_ID,
    folderId: $('f-folder').value || null,
    locationId: $('f-loc').value || null,
    quantity: quantity.value,
    unit,
    condition: $('f-cond').value,
    brand: $('f-brand').value.trim(),
    valuation: readValuation(),
    description: $('f-desc').value.trim(),
    images: form.images,
    primaryImageId: form.primaryImageId,
    aiData: form.aiData,
  };

  await withBusy($('save-item-btn'), 'جارٍ الحفظ…', async () => {
    try {
      if (form.isNew) {
        await repository.createItem(payload);
        toast('تمت الإضافة', '✓');
      } else {
        await repository.updateItem(form.itemId, payload, form.baseVersion);
        toast('تم التحديث', '✓');
      }

      closeSheet('add');
    } catch (error) {
      if (error instanceof ConflictError) {
        await handleConflict(error);
        return;
      }
      toastError(error, 'تعذّر حفظ القطعة');
    }
  });
}

async function handleConflict(error) {
  const keepMine = await confirmAction({
    title: 'تعارض في التعديل',
    message: 'عُدّلت هذه القطعة على جهاز آخر بعد أن فتحتها. هل تريد الكتابة فوق النسخة الأحدث أم إعادة تحميلها؟',
    icon: '⚠️',
    confirmLabel: 'الكتابة فوقها',
  });

  if (!keepMine) {
    const fresh = repository.item(form.itemId);
    if (fresh) openItemForm({ itemId: fresh.id });
    toast('أُعيد تحميل النسخة الأحدث', '↻');
    return;
  }

  try {
    const current = repository.item(form.itemId);
    form.baseVersion = current?.version ?? error.current?.version ?? null;
    await saveItem();
  } catch (retryError) {
    toastError(retryError, 'تعذّر حفظ القطعة');
  }
}

export function bindItemForm() {
  $('imgInput')?.addEventListener('change', (event) => {
    if (event.target.files?.length) handleFiles(event.target.files);
  });

  const dropzone = $('img-strip');
  dropzone?.addEventListener('dragover', (event) => event.preventDefault());
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) handleFiles(event.dataTransfer.files);
  });

  $('dtbtn-manual')?.addEventListener('click', () => setDescriptionMode('manual'));
  $('dtbtn-ai')?.addEventListener('click', () => setDescriptionMode('ai'));
  $('aibtn')?.addEventListener('click', runAnalysis);
  $('save-item-btn')?.addEventListener('click', saveItem);
  $('f-valuation')?.addEventListener('input', updateValuationPreview);
  $('f-currency')?.addEventListener('change', updateValuationPreview);
  $('f-unit')?.addEventListener('change', () => {
    const check = validateQuantity($('f-qty').value, $('f-unit').value);
    setText('f-qty-hint', check.ok ? '' : check.error);
  });
  $('f-qty')?.addEventListener('input', () => {
    const check = validateQuantity($('f-qty').value, $('f-unit').value);
    setText('f-qty-hint', check.ok ? '' : check.error);
  });
}
