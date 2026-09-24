// Add / edit sheet: fields, multi-image management, AI analysis, save.

import { icon } from '../icons.js';
import { AI_DISCLAIMER, AI_SUBTITLE, AI_TITLE, ASSISTANT_NAME, AiAvailability, aiAvailability, analyzeItem } from '../ai.js';
import {
  CONDITIONS, CURRENCIES, IMAGE_LIMITS, UNITS, UNCATEGORIZED_ID, VALUATION_SOURCES,
} from '../config.js';
import { currencySymbol } from '../money.js';
import { repository, ConflictError } from '../repository.js';
import { canAddItem, canUseAssistant } from '../subscription.js';
import { openPlansSheet } from './plans.js';
import { openScanner } from './scan.js';
import { ImageTier, bindImageSrc, uploadImage } from '../storage.js';
import { openImageViewer } from './image-viewer.js';
import { $, el, render, setText, uid } from '../utils.js';
import {
  formatValuation, normalizeValuation, parseValuationText, validateQuantity,
} from '../validation.js';
import { closeSheet, confirmAction, onSheetClose, openSheet, optionList, toast, toastError, withBusy } from '../ui.js';
import { discardUnreferenced, markPending, releasePending } from '../media.js';

const form = {
  itemId: null,
  isNew: true,
  baseVersion: null,
  images: [],
  /**
   * Images uploaded during this editing session, by id.
   *
   * An upload happens the moment a photograph is chosen — that is what makes
   * the preview possible — but a record only claims it when the form is saved.
   * Abandon the form and the file stays on the device belonging to nothing, so
   * the set is kept and cleaned up on the way out. Saving empties it, because
   * from then on the record's own references account for the file.
   */
  pendingImages: [],
  primaryImageId: null,
  aiData: null,
  autoAnalyzed: false,
  assistantValuationText: null,
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

  // The picker offers the common currencies, plus whatever this record is
  // already in. An item imported at 10,000 AED must not silently become
  // 10,000 SAR the first time someone opens it to fix a typo in its name.
  const own = item?.valuation?.currency;
  const offered = own && !CURRENCIES.includes(own) ? [own, ...CURRENCIES] : CURRENCIES;
  optionList($('f-currency'), offered.map((code) => ({
    value: code, label: `${currencySymbol(code)} ${code}`,
  })), own || 'SAR');

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
      bindImageSrc(img, image, { tier: ImageTier.THUMB });
      const isPrimary = image.id === form.primaryImageId;

      return el('div', { class: `img-cell${isPrimary ? ' primary' : ''}` }, [
        // A photo taken a moment ago and not yet saved is exactly the one you
        // most want to check before committing to it, so it opens too.
        el('button', {
          class: 'img-open img-cell-open', type: 'button',
          'aria-label': `عرض ${image.originalFilename || 'الصورة'} بملء الشاشة`,
          onClick: () => openImageViewer({
            images: form.images,
            index: form.images.findIndex((i) => i.id === image.id),
            title: $('f-name')?.value || '',
            actions: [
              {
                label: 'اجعلها الصورة الرئيسية',
                onSelect: (selected) => { form.primaryImageId = selected.id; renderImages(); refreshAiPanel(); },
              },
            ],
          }),
        }, [img]),
        isPrimary ? el('span', { class: 'img-primary-tag', text: 'رئيسية' }) : null,
        el('div', { class: 'img-cell-acts' }, [
          !isPrimary ? el('button', {
            class: 'img-act', type: 'button', title: 'اجعلها الصورة الرئيسية',
            'aria-label': 'اجعلها الصورة الرئيسية',
            onClick: () => { form.primaryImageId = image.id; renderImages(); refreshAiPanel(); },
          }, [icon('star', { size: 14 })]) : null,
          el('button', {
            class: 'img-act', type: 'button', title: 'نقل لليمين', 'aria-label': 'نقل الصورة لليمين',
            onClick: () => moveImage(image.id, -1),
          }, [icon('forward', { size: 14 })]),
          el('button', {
            class: 'img-act', type: 'button', title: 'نقل لليسار', 'aria-label': 'نقل الصورة لليسار',
            onClick: () => moveImage(image.id, 1),
          }, [icon('back', { size: 14 })]),
          el('button', {
            class: 'img-act danger', type: 'button', text: '✕', title: 'حذف الصورة', 'aria-label': 'حذف الصورة',
            onClick: () => removeImage(image.id),
          }),
        ]),
      ]);
    }),
    // While the capture prompt is up it is the only way in; two invitations to
    // add the same first photo is one too many.
    form.images.length < IMAGE_LIMITS.maxPerItem && !(form.isNew && !form.images.length) ? el('button', {
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

  renderCapturePrompt();
}

/**
 * The signature flow: a new record starts at the camera, not at an empty form.
 * It disappears the moment there is a photo, so it never gets in the way of
 * someone who is editing.
 */
function renderCapturePrompt() {
  const prompt = $('capture-prompt');
  if (!prompt) return;

  if (!form.isNew || form.images.length) {
    prompt.style.display = 'none';
    render(prompt, []);
    return;
  }

  prompt.style.display = '';
  render(prompt, [
    el('button', {
      class: 'capture-cta', type: 'button',
      onClick: () => $('camInput').click(),
    }, [
      el('span', { class: 'capture-ico' }, [icon('image', { size: 30 })]),
      el('span', { class: 'capture-label', text: 'صوّر القطعة' }),
      el('span', { class: 'capture-sub', text: `ودع ${ASSISTANT_NAME} يقترح بياناتها` }),
    ]),
    el('div', { class: 'capture-alt' }, [
      el('button', {
        class: 'capture-link', type: 'button', text: 'اختر من المعرض',
        onClick: () => $('imgInput').click(),
      }),
      el('span', { class: 'capture-sep', text: '·', 'aria-hidden': 'true' }),
      el('button', {
        class: 'capture-link', type: 'button', text: 'إدخال يدوي',
        onClick: () => { $('capture-prompt').style.display = 'none'; $('f-name')?.focus(); },
      }),
    ]),
  ]);
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
      form.pendingImages.push(image);
      // Held by this form, not yet by a record: the reconciler leaves it be.
      markPending([image.mediaId || image.id]);
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
  await maybeAutoAnalyze();
}

/**
 * The promise on the welcome screen: photograph the thing and let the
 * assistant propose its details. It runs once, only on a new record whose
 * name is still empty, only when a credit is available, and it still only
 * produces suggestions the customer has to accept.
 */
async function maybeAutoAnalyze() {
  if (!form.isNew || form.aiData || form.autoAnalyzed) return;
  if ($('f-name').value.trim()) return;
  if (aiAvailability() !== AiAvailability.READY) return;

  const image = primaryFormImage();
  if (!image || image.storagePath?.startsWith('local:')) return;
  if (!canUseAssistant().allowed) return;

  form.autoAnalyzed = true;
  const box = $('ai-suggest');
  box.style.display = '';
  render(box, [el('div', { class: 'suggest-working' }, [
    el('span', { class: 'suggest-mark', text: '✦', 'aria-hidden': 'true' }),
    el('span', { text: 'مساعد نَظْم يقرأ الصورة…' }),
  ])]);

  try {
    form.aiData = await analyzeItem({
      workspaceId: repository.session.workspaceId,
      itemId: form.itemId,
      image,
      name: '',
      categoryName: '',
      categories: repository.state.categories.map((c) => c.name).filter(Boolean),
    });
    refreshAiPanel();
    renderSuggestions();
  } catch (error) {
    // Reading the photo is a bonus, not the job: a failure is reported quietly
    // and the form stays exactly as the customer left it.
    console.error('[form] automatic analysis failed', error);
    box.style.display = 'none';
    render(box, []);
  }
}

// ── suggestions from the assistant ─────────────────────────────────────────
//
// Nothing here writes to the item. Each suggestion is shown with what it would
// put where, and applies only when the customer taps it — an assistant that
// silently rewrites someone's inventory is worse than no assistant.

const BARCODE_SHAPE = /^[A-Za-z0-9][A-Za-z0-9\-_/]{5,63}$/;

function suggestionsFrom(aiData) {
  if (!aiData) return [];
  const rows = [];

  if (aiData.suggestedName) {
    rows.push({ key: 'name', label: 'الاسم', value: aiData.suggestedName, apply: () => { $('f-name').value = aiData.suggestedName; } });
  }

  if (aiData.suggestedCategory) {
    const category = repository.state.categories.find((c) => c.name === aiData.suggestedCategory);
    if (category) {
      rows.push({
        key: 'category', label: 'التصنيف', value: `${category.icon || ''} ${category.name}`.trim(),
        apply: () => { $('f-cat').value = category.id; },
      });
    }
  }

  if (aiData.brand) {
    rows.push({ key: 'brand', label: 'العلامة', value: aiData.brand, apply: () => { $('f-brand').value = aiData.brand; } });
  }

  if (aiData.condition) {
    rows.push({ key: 'condition', label: 'الحالة', value: aiData.condition, apply: () => { $('f-cond').value = aiData.condition; } });
  }

  if (aiData.suggestedValuation) {
    const { min, max, currency } = aiData.suggestedValuation;
    rows.push({
      key: 'valuation',
      label: 'تقدير أولي',
      value: formatValuation(aiData.suggestedValuation, { compact: true }),
      apply: () => {
        const text = min === max ? String(min) : `${min}-${max}`;
        $('f-valuation').value = text;
        $('f-currency').value = currency;
        form.assistantValuationText = text;
        updateValuationPreview();
      },
    });
  }

  if (aiData.visibleText) {
    const asBarcode = BARCODE_SHAPE.test(aiData.visibleText);
    rows.push({
      key: 'text',
      label: asBarcode ? 'رقم مقروء من الصورة' : 'نص مقروء من الصورة',
      value: aiData.visibleText,
      apply: () => {
        if (asBarcode) { $('f-barcode').value = aiData.visibleText; return; }
        const current = $('f-desc').value.trim();
        $('f-desc').value = current ? `${current}\n${aiData.visibleText}` : aiData.visibleText;
      },
    });
  }

  return rows;
}

/**
 * What is still missing, asked for rather than invented. The assistant is more
 * useful admitting it cannot read a reference number than guessing one, so
 * when the evidence is thin it asks for the photo that would settle it.
 */
const EVIDENCE = [
  { match: /ساع|watch/i, ask: 'هل تستطيع تصوير الرقم المرجعي داخل الغطاء؟ يرفع دقة التقدير كثيراً.' },
  { match: /لوح|فن|art|paint/i, ask: 'أضف صورة التوقيع وظهر اللوحة — هناك تُقرأ المعلومات المهمة.' },
  { match: /معد|جهاز|آل|equip|tool/i, ask: 'صوّر لوحة البيانات والرقم التسلسلي إن وُجدا.' },
  { match: /مجوهر|ذهب|ألماس|jewel/i, ask: 'صوّر الدمغة أو الختم إن وُجد — يحدد العيار والمنشأ.' },
];

function followUpPrompt() {
  const ai = form.aiData;
  if (!ai) return null;

  // Nothing to ask for once the object identifies itself.
  if (ai.visibleText) return null;

  const category = repository.category($('f-cat').value)?.name || '';
  const hint = EVIDENCE.find((entry) => entry.match.test(`${category} ${ai.suggestedName || ''}`));
  const ask = hint?.ask || 'أضف صورة ثانية من زاوية مختلفة لتحسين التوثيق.';

  return el('div', { class: 'suggest-ask', role: 'note' }, [
    el('span', { class: 'suggest-ask-mark' }, [icon('clock', { size: 15 })]),
    el('span', { text: ask }),
  ]);
}

function renderSuggestions() {
  const box = $('ai-suggest');
  if (!box) return;
  const rows = suggestionsFrom(form.aiData);

  if (!rows.length) {
    box.style.display = 'none';
    render(box, []);
    return;
  }

  box.style.display = '';
  render(box, [
    el('div', { class: 'suggest-head' }, [
      el('span', { class: 'suggest-mark', text: '✦', 'aria-hidden': 'true' }),
      el('span', { class: 'suggest-title', text: 'اقتراحات مساعد نَظْم' }),
      el('button', {
        class: 'suggest-all', type: 'button', text: 'طبّق الكل',
        onClick: () => {
          for (const row of rows) row.apply();
          toast('طُبّقت الاقتراحات — راجعها قبل الحفظ', '✦');
          renderSuggestions();
        },
      }),
    ]),
    el('div', { class: 'suggest-rows' }, rows.map((row) => el('button', {
      class: 'suggest-row', type: 'button',
      onClick: (event) => {
        row.apply();
        event.currentTarget.classList.add('applied');
        event.currentTarget.querySelector('.suggest-apply').textContent = '✓';
      },
    }, [
      el('span', { class: 'suggest-label', text: row.label }),
      el('span', { class: 'suggest-value', text: row.value }),
      el('span', { class: 'suggest-apply', text: '+', 'aria-hidden': 'true' }),
    ]))),
    el('div', { class: 'suggest-note', text: 'اقتراحات مبنية على الصورة — راجعها، فهي ليست توثيقاً معتمداً.' }),
    followUpPrompt(),
  ]);
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
        categories: repository.state.categories.map((c) => c.name).filter(Boolean),
      });

      form.aiData = aiData;
      refreshAiPanel();
      renderSuggestions();
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
  // An estimate the customer accepted from the assistant stays attributed to
  // it, so the detail view never presents it as their own figure. Editing the
  // number makes it theirs again.
  const fromAssistant = text === form.assistantValuationText;
  return normalizeValuation({
    ...parseValuationText(text, {
      currency: $('f-currency').value,
      source: fromAssistant ? VALUATION_SOURCES.AI : VALUATION_SOURCES.MANUAL,
    }),
    currency: $('f-currency').value,
    source: fromAssistant ? VALUATION_SOURCES.AI : VALUATION_SOURCES.MANUAL,
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

// ── the images this form is holding ──
//
// An image uploaded into the form belongs to no record until the save lands,
// so it is marked pending — the media reconciler leaves pending media alone.
// The mark has to live exactly as long as the unsaved reference it protects:
// released when the save lands (the record now holds the image), and released
// — with the image reclaimed if nothing kept it — when the form is abandoned.
// A mark that outlived its form kept a genuinely unreferenced file forever.
//
// Every path goes through these two. Each detaches the form's list before it
// works, so running one twice, or one after the other, does nothing twice.

function pendingMediaIds(images) {
  return images.map((image) => image.mediaId || image.id).filter(Boolean);
}

/** The save landed: the record holds these images now. Nothing is discarded. */
function releaseFormPendingMarkers() {
  const pending = form.pendingImages;
  form.pendingImages = [];
  releasePending(pendingMediaIds(pending));
}

/**
 * The form is being abandoned (closed, or replaced by a reload). Which of its
 * images the record actually kept is asked of the store — not of the window,
 * which may not hold the record at all — and the protection stays on until
 * that answer is in. Then the marks go, and only images nothing kept are
 * reclaimed; `discardUnreferenced` re-checks the count, so an image another
 * record has since picked up survives.
 *
 * @returns {Promise<number>} how many images were reclaimed
 */
async function discardAbandonedFormMedia(itemId) {
  const pending = form.pendingImages;
  form.pendingImages = [];
  if (!pending.length) return 0;
  let saved;
  try {
    saved = await repository.getItem(itemId, { fresh: true });
  } catch {
    // Unknown: keep everything rather than guess. The reconciler's grace
    // window collects anything genuinely orphaned later.
    saved = { images: pending };
  }
  const abandoned = pending.filter(
    (image) => !saved?.images?.some((kept) => kept.id === image.id),
  );
  releasePending(pendingMediaIds(pending));
  if (!abandoned.length) return 0;
  return discardUnreferenced(repository.session, abandoned);
}

/** For the tests: the media this form is holding as pending. */
export function __formPendingForTest() {
  return pendingMediaIds(form.pendingImages);
}

// ── open / save ──
let openGeneration = 0;

export async function openItemForm({ itemId = null, folderId = null } = {}) {
  if (!repository.canWrite()) { toast('صلاحيتك للعرض فقط', '🔒'); return; }

  // An edit starts from the record as it is stored now, not from the card it
  // was opened from: the card may be a snapshot of an older version, and the
  // version it carries is what the save is checked against. And the record
  // may be one the window has never held — found by a search, deep in the
  // inventory — so it is read by id rather than looked for in memory.
  const mine = ++openGeneration;
  let item = null;
  if (itemId) {
    try {
      item = await repository.getItem(itemId, { fresh: true });
    } catch (error) {
      if (mine === openGeneration) toastError(error, 'تعذّر فتح القطعة. حاول مرة أخرى.');
      return;
    }
    if (mine !== openGeneration) return;
    if (!item) { toast('لم تعد هذه القطعة موجودة.', '✕'); return; }
  }

  // At the ceiling, say so before the form is filled in — and never for an
  // edit, so a full workspace can still be corrected and cleaned up. The
  // server refuses the write regardless; this is only the explanation.
  if (!item) {
    const decision = canAddItem();
    if (!decision.allowed) {
      openPlansSheet(`${decision.message} ${decision.detail || ''}`.trim());
      return;
    }
  }

  // A previous form's unsaved images are that form's to settle, not this
  // one's to forget: settled against the record they were uploaded for.
  if (form.pendingImages.length) void discardAbandonedFormMedia(form.itemId);

  form.itemId = item?.id || uid('itm');
  form.isNew = !item;
  form.baseVersion = item?.version ?? null;
  form.images = item ? [...item.images] : [];
  form.pendingImages = [];
  form.primaryImageId = item?.primaryImageId || null;
  form.aiData = item?.aiData || null;
  form.autoAnalyzed = false;
  form.assistantValuationText = null;

  setText('addtitle', item ? 'تعديل القطعة' : 'إضافة قطعة');
  fillSelects(item);

  $('f-name').value = item?.name || '';
  form.provisionalSku = repository.provisionalSku();
  $('f-sku').value = item?.sku || form.provisionalSku;
  $('f-barcode').value = item?.barcode || '';
  $('f-qty').value = item ? String(item.quantity) : '';
  $('f-brand').value = item?.brand || '';
  $('f-serial').value = item?.serialNumber || '';
  $('f-model').value = item?.modelNumber || '';
  $('f-ref').value = item?.referenceNumber || '';
  $('f-desc').value = item?.description || '';
  $('f-valuation').value = item?.valuation
    ? (item.valuation.min === item.valuation.max ? String(item.valuation.min) : `${item.valuation.min}-${item.valuation.max}`)
    : '';
  if (folderId) $('f-folder').value = folderId;

  updateValuationPreview();
  renderImages();
  setDescriptionMode(item?.aiData ? 'ai' : 'manual');
  refreshAiPanel();
  // An existing record already carries whatever the customer accepted.
  if (item) { $('ai-suggest').style.display = 'none'; render($('ai-suggest'), []); }

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

  const skuClash = await repository.skuConflict(sku, form.isNew ? null : form.itemId);
  if (skuClash) {
    const proceed = await confirmAction({
      title: 'الرمز مستخدم مسبقاً',
      message: `الرمز "${sku}" مرتبط بالقطعة "${skuClash.name}". هل تريد توليد رمز جديد؟`,
      icon: '🔖',
      confirmLabel: 'توليد رمز جديد',
    });
    if (!proceed) return;
    $('f-sku').value = await repository.reserveUniqueSku();
    return saveItem();
  }

  const barcodeClash = barcode ? await repository.barcodeConflict(barcode, form.isNew ? null : form.itemId) : null;
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
  // The reserved number is the one written, so it is the one checked: the
  // clash check above looked at the provisional placeholder.
  const resolvedSku = (form.isNew && (!sku || sku === form.provisionalSku))
    ? await repository.reserveUniqueSku()
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
    serialNumber: $('f-serial').value.trim(),
    modelNumber: $('f-model').value.trim(),
    referenceNumber: $('f-ref').value.trim(),
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

      // Saved, references counted: the record now holds every file this form
      // uploaded. Released before the sheet closes, so the close handler
      // finds nothing left to settle — and nothing is left marked pending.
      releaseFormPendingMarkers();
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
    // Reloading throws this form's edit away — including any image uploaded
    // into it, which the latest record does not hold. Settled first, before
    // the new form replaces the list that knows about it.
    await discardAbandonedFormMedia(form.itemId);
    await openItemForm({ itemId: form.itemId });
    toast('أُعيد تحميل النسخة الأحدث', '↻');
    return;
  }

  try {
    const current = await repository.getItem(form.itemId, { fresh: true });
    form.baseVersion = current?.version ?? error.current?.version ?? null;
    await saveItem();
  } catch (retryError) {
    toastError(retryError, 'تعذّر حفظ القطعة');
  }
}

export function bindItemForm() {
  $('f-barcode-scan')?.addEventListener('click', () => openScanner({
    title: 'امسح باركود القطعة',
    onCode: ({ value }) => {
      $('f-barcode').value = value;
      toast('تمت قراءة الباركود', '⊡');
    },
  }));
  $('camInput')?.addEventListener('change', (event) => {
    if (event.target.files?.length) handleFiles(event.target.files);
    event.target.value = '';
  });
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

  // However the form is dismissed — the close button, the overlay, Escape, the
  // back gesture — a photograph uploaded into it and never saved onto a record
  // is reclaimed. It ran only on the save path before, which is the one path
  // where there is nothing to reclaim.
  onSheetClose('add', () => {
    void discardAbandonedFormMedia(form.itemId)
      .then((n) => { if (n) console.info(`[form] reclaimed ${n} unsaved image(s)`); });
  });
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
