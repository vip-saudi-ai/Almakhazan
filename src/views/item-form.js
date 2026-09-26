// Add / edit sheet: fields, multi-image management, AI analysis, save.

import { icon } from '../icons.js';
import { AiAvailability, aiAvailability, aiDisclaimer, aiSubtitle, analyzeItem, assistantName } from '../ai.js';
import { ensureAiConsent, hasAiConsent } from '../ai-consent.js';
import { onLanguageChange, t } from '../i18n.js';
import { conditionLabel, locationName, unitGroupLabel, unitLabel } from '../labels.js';
import {
  CONDITIONS, CURRENCIES, IMAGE_LIMITS, UNITS, VALUATION_SOURCES,
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
import {
  closeSheet, confirmAction, isSheetOpen, onSheetClose, openSheet, optionList, toast, toastError, withBusy,
} from '../ui.js';
import { discardUnreferenced, markPending, releasePending } from '../media.js';
import {
  applySuggestedCategory, classificationLabelForAssistant, collectItemFields, currentClassification,
  initItemFields, rememberChoice, renderClassification, renderFields,
} from './item-fields.js';

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
  optionList($('f-folder'), [
    { value: '', label: `— ${t('home.mainInventory')} —` },
    ...repository.state.folders.map((f) => ({ value: f.id, label: `${f.icon} ${f.name}` })),
  ], item?.folderId || '');

  optionList($('f-loc'), [
    { value: '', label: `— ${t('form.notSet')} —` },
    ...repository.state.locations.map((l) => ({ value: l.id, label: locationName(l) })),
  ], item?.locationId || '');

  optionList($('f-cond'), [
    { value: '', label: t('form.notSet') },
    ...CONDITIONS.map((c) => ({ value: c, label: conditionLabel(c) })),
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
    const optgroup = el('optgroup', { label: unitGroupLabel(group) });
    // The stored value is the unit's own (Arabic) abbreviation; only the
    // label follows the language.
    for (const unit of units) optgroup.append(el('option', { value: unit, text: unitLabel(unit) }));
    unitSelect.append(optgroup);
  }
  unitSelect.value = item?.unit || 'قطعة';
}

/**
 * The open form in the language just chosen. The labels are static markup
 * (translated by i18n.js); what is redrawn here is the dynamic part — option
 * labels, photos, suggestions, the assistant panel — and every value the
 * customer has typed or chosen is read back first and put back after.
 */
function relocalizeForm() {
  const keep = {
    folderId: $('f-folder').value,
    locationId: $('f-loc').value,
    condition: $('f-cond').value,
    unit: $('f-unit').value,
    currency: $('f-currency').value,
  };
  fillSelects({ ...keep, valuation: keep.currency ? { currency: keep.currency } : null });
  renderClassification();
  renderFields();
  $('f-folder').value = keep.folderId;
  $('f-loc').value = keep.locationId;
  $('f-cond').value = keep.condition;
  $('f-unit').value = keep.unit;
  $('f-currency').value = keep.currency;
  setText('addtitle', form.isNew ? t('form.addTitle') : t('form.editTitle'));
  renderImages();
  renderCapturePrompt();
  renderSuggestions();
  refreshAiPanel();
  updateValuationPreview();
}

onLanguageChange(() => {
  if (isSheetOpen('add')) relocalizeForm();
});

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
      const img = el('img', { alt: image.originalFilename || t('form.photo'), loading: 'lazy', decoding: 'async' });
      bindImageSrc(img, image, { tier: ImageTier.THUMB });
      const isPrimary = image.id === form.primaryImageId;

      return el('div', { class: `img-cell${isPrimary ? ' primary' : ''}` }, [
        // A photo taken a moment ago and not yet saved is exactly the one you
        // most want to check before committing to it, so it opens too.
        el('button', {
          class: 'img-open img-cell-open', type: 'button',
          'aria-label': t('form.viewFull', { name: image.originalFilename || t('form.thePhoto') }),
          onClick: () => openImageViewer({
            images: form.images,
            index: form.images.findIndex((i) => i.id === image.id),
            title: $('f-name')?.value || '',
            actions: [
              {
                get label() { return t('form.makePrimary'); },
                onSelect: (selected) => { form.primaryImageId = selected.id; renderImages(); refreshAiPanel(); },
              },
            ],
          }),
        }, [img]),
        isPrimary ? el('span', { class: 'img-primary-tag', text: t('form.primary') }) : null,
        el('div', { class: 'img-cell-acts' }, [
          !isPrimary ? el('button', {
            class: 'img-act', type: 'button', title: t('form.makePrimary'),
            'aria-label': t('form.makePrimary'),
            onClick: () => { form.primaryImageId = image.id; renderImages(); refreshAiPanel(); },
          }, [icon('star', { size: 14 })]) : null,
          el('button', {
            class: 'img-act', type: 'button', title: t('form.moveEarlier'), 'aria-label': t('form.moveEarlierAria'),
            onClick: () => moveImage(image.id, -1),
          }, [icon('forward', { size: 14 })]),
          el('button', {
            class: 'img-act', type: 'button', title: t('form.moveLater'), 'aria-label': t('form.moveLaterAria'),
            onClick: () => moveImage(image.id, 1),
          }, [icon('back', { size: 14 })]),
          el('button', {
            class: 'img-act danger', type: 'button', title: t('form.removePhoto'), 'aria-label': t('form.removePhoto'),
            onClick: () => removeImage(image.id),
          }, [icon('close', { size: 14 })]),
        ]),
      ]);
    }),
    // While the capture prompt is up it is the only way in; two invitations to
    // add the same first photo is one too many.
    form.images.length < IMAGE_LIMITS.maxPerItem && !(form.isNew && !form.images.length) ? el('button', {
      class: 'img-cell img-add', type: 'button', 'aria-label': t('form.addPhoto'),
      onClick: () => $('imgInput').click(),
    }, [
      el('span', { class: 'ipicotext', text: '📷', 'aria-hidden': 'true' }),
      el('span', { class: 'iptxt', text: form.images.length ? t('form.addPhoto') : t('form.addAPhoto') }),
      el('span', { class: 'ipsub', text: t('form.anyFormat') }),
    ]) : null,
  ]);

  setText('img-count', form.images.length
    ? t('form.photoCount', { count: form.images.length, max: IMAGE_LIMITS.maxPerItem })
    : t('form.noPhotos'));

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
      el('span', { class: 'capture-label', text: t('form.capture') }),
      el('span', { class: 'capture-sub', text: t('form.captureSub', { name: assistantName() }) }),
    ]),
    el('div', { class: 'capture-alt' }, [
      el('button', {
        class: 'capture-link', type: 'button', text: t('form.fromGallery'),
        onClick: () => $('imgInput').click(),
      }),
      el('span', { class: 'capture-sep', text: '·', 'aria-hidden': 'true' }),
      el('button', {
        class: 'capture-link', type: 'button', text: t('form.manualEntry'),
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
    titleKey: 'form.removePhotoTitle',
    messageKey: 'form.removePhotoMessage',
    icon: '🖼',
    confirmLabelKey: 'form.remove',
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
    toast(t('form.maxPhotos', { max: IMAGE_LIMITS.maxPerItem }), '⚠');
    return;
  }

  const progress = $('img-progress');
  progress.style.display = '';

  const STAGES = {
    prepare: t('form.stagePrepare'),
    upload: t('form.stageUpload'),
    save: t('common.saving'),
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
      toastError(error, 'error.image/upload');
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
  // Automatic only once the customer has agreed to external processing; the
  // first analysis is always one they asked for, through the disclosure.
  if (!hasAiConsent()) return;

  const image = primaryFormImage();
  if (!image || image.storagePath?.startsWith('local:')) return;
  if (!canUseAssistant().allowed) return;

  form.autoAnalyzed = true;
  const box = $('ai-suggest');
  box.style.display = '';
  render(box, [el('div', { class: 'suggest-working' }, [
    el('span', { class: 'suggest-mark', text: '✦', 'aria-hidden': 'true' }),
    el('span', { text: t('form.aiReading') }),
  ])]);

  try {
    form.aiData = await analyzeItem({
      workspaceId: repository.session.workspaceId,
      itemId: form.itemId,
      image,
      name: '',
      categoryName: '',
      categories: repository.taxonomy().allCategories({ includeHidden: false }).map((node) => repository.taxonomy().label(node)).filter(Boolean),
    });
    refreshAiPanel();
    renderSuggestions();
  } catch (error) {
    // Reading the photo is a bonus, not the job: a failure is reported quietly
    // and the form stays exactly as the customer left it.
    console.warn('[form] automatic analysis failed', error?.code || 'unknown');
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
    rows.push({ key: 'name', label: t('field.name'), value: aiData.suggestedName, apply: () => { $('f-name').value = aiData.suggestedName; } });
  }

  if (aiData.suggestedCategory) {
    // Only a name that is exactly one Category, in either language: a guess
    // that could mean two things is not offered.
    const taxonomy = repository.taxonomy();
    const matches = taxonomy.findByName(aiData.suggestedCategory, { level: 'category' });
    const category = matches.length === 1 ? matches[0] : null;
    if (category) {
      rows.push({
        key: 'category', label: t('field.category'), value: `${taxonomy.icon(category)} ${taxonomy.label(category)}`.trim(),
        apply: () => applySuggestedCategory(category.id),
      });
    }
  }

  if (aiData.brand) {
    rows.push({ key: 'brand', label: t('field.brand'), value: aiData.brand, apply: () => { $('f-brand').value = aiData.brand; } });
  }

  if (aiData.condition) {
    rows.push({ key: 'condition', label: t('field.condition'), value: conditionLabel(aiData.condition), apply: () => { $('f-cond').value = aiData.condition; } });
  }

  if (aiData.suggestedValuation) {
    const { min, max, currency } = aiData.suggestedValuation;
    rows.push({
      key: 'valuation',
      label: t('ai.subtitle'),
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
      label: asBarcode ? t('form.readNumber') : t('form.readText'),
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
  { match: /ساع|watch/i, ask: 'form.evidenceWatch' },
  { match: /لوح|فن|art|paint/i, ask: 'form.evidenceArt' },
  { match: /معد|جهاز|آل|equip|tool/i, ask: 'form.evidenceEquipment' },
  { match: /مجوهر|ذهب|ألماس|jewel/i, ask: 'form.evidenceJewelry' },
];

function followUpPrompt() {
  const ai = form.aiData;
  if (!ai) return null;

  // Nothing to ask for once the object identifies itself.
  if (ai.visibleText) return null;

  const category = classificationLabelForAssistant() || '';
  const hint = EVIDENCE.find((entry) => entry.match.test(`${category} ${ai.suggestedName || ''}`));
  const ask = t(hint?.ask || 'form.evidenceDefault');

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
      el('span', { class: 'suggest-title', text: t('ai.suggestions') }),
      el('button', {
        class: 'suggest-all', type: 'button', text: t('form.applyAll'),
        onClick: () => {
          for (const row of rows) row.apply();
          toast(t('form.applied'), '✦');
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
    el('div', { class: 'suggest-note', text: t('form.suggestNote') }),
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
  if (availability === AiAvailability.UNAVAILABLE) hint = t('error.ai/failed-precondition');
  else if (availability === AiAvailability.OFFLINE) hint = t('error.ai/offline');
  else if (!image) hint = t('ai.addPhotoFirst');
  else if (image.storagePath?.startsWith('local:')) hint = t('form.aiNeedsCloud');

  if (form.aiData) {
    const ai = form.aiData;
    const stale = ai.imageHash && image?.hash && ai.imageHash !== image.hash;
    dot.className = `aidot${stale ? '' : ' live'}`;
    render(content, [
      stale ? el('div', { class: 'ai-stale', role: 'status', text: t('form.aiStale') }) : null,
      el('div', { class: 'aitxt', style: { marginBottom: '8px' }, text: ai.description || ai.evaluation || '' }),
      el('div', { class: 'airow' }, [
        ai.localScore != null ? el('div', { class: 'aipill' }, [
          el('div', { class: 'aiplbl', text: t('detail.localMarket') }),
          el('div', { class: 'aipval' }, [String(ai.localScore), el('small', { text: '/10' })]),
        ]) : null,
        ai.globalScore != null ? el('div', { class: 'aipill' }, [
          el('div', { class: 'aiplbl', text: t('detail.globalMarket') }),
          el('div', { class: 'aipval' }, [String(ai.globalScore), el('small', { text: '/10' })]),
        ]) : null,
        ai.condition ? el('div', { class: 'aipill' }, [
          el('div', { class: 'aiplbl', text: t('field.condition') }),
          el('div', { class: 'aipval', style: { fontSize: '13px' }, text: conditionLabel(ai.condition) }),
        ]) : null,
        ai.suggestedValuation ? el('div', { class: 'aipill' }, [
          el('div', { class: 'aiplbl', text: t('ai.subtitle') }),
          el('div', { class: 'aipval', style: { fontSize: '12px' }, text: formatValuation(ai.suggestedValuation, { compact: true }) }),
        ]) : null,
      ]),
      el('div', { class: 'ai-disclaimer', text: aiDisclaimer() }),
    ]);
  } else {
    dot.className = 'aidot';
    render(content, [el('div', { class: 'aiph', text: hint || t('ai.addPhotoFirst') })]);
  }

  setText('ai-status-label', `${assistantName()} · ${aiSubtitle()}`);
}

async function runAnalysis() {
  const image = primaryFormImage();
  if (!image) { toast(t('form.addPhotoFirst'), '⚠'); return; }

  const button = $('aibtn');
  if (!(await ensureAiConsent())) return;
  await withBusy(button, t('form.analyzing'), async () => {
    try {
      const aiData = await analyzeItem({
        workspaceId: repository.session.workspaceId,
        itemId: form.itemId,
        image,
        name: $('f-name').value.trim(),
        categoryName: classificationLabelForAssistant(),
        categories: repository.taxonomy().allCategories({ includeHidden: false }).map((node) => repository.taxonomy().label(node)).filter(Boolean),
      });

      form.aiData = aiData;
      refreshAiPanel();
      renderSuggestions();
      toast(t('form.analyzed'));
    } catch (error) {
      toastError(error, 'error.ai/failed');
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
    ? t('form.valuationWillSave', { value: formatValuation(valuation) })
    : t('form.valuationUnread');
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
  if (!repository.canWrite()) { toast(t('error.repo/forbidden.viewer'), '🔒'); return; }

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
      if (mine === openGeneration) toastError(error, 'error.item/load-failed');
      return;
    }
    if (mine !== openGeneration) return;
    if (!item) { toast(t('error.item/not-found'), '✕'); return; }
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

  setText('addtitle', item ? t('form.editTitle') : t('form.addTitle'));
  fillSelects(item);
  initItemFields(item);

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
  if (!name) { toast(t('form.nameRequired'), '⚠'); $('f-name').focus(); return; }

  const unit = $('f-unit').value || 'قطعة';
  const quantity = validateQuantity($('f-qty').value, unit);
  if (!quantity.ok) { toast(quantity.error, '⚠'); $('f-qty').focus(); return; }

  const sku = $('f-sku').value.trim();
  const barcode = $('f-barcode').value.trim();

  const skuClash = await repository.skuConflict(sku, form.isNew ? null : form.itemId);
  if (skuClash) {
    const proceed = await confirmAction({
      titleKey: 'form.skuTakenTitle',
      messageKey: 'form.skuTakenMessage', messageParams: { sku, name: skuClash.name },
      icon: '🔖',
      confirmLabelKey: 'form.generateSku',
    });
    if (!proceed) return;
    $('f-sku').value = await repository.reserveUniqueSku();
    return saveItem();
  }

  const barcodeClash = barcode ? await repository.barcodeConflict(barcode, form.isNew ? null : form.itemId) : null;
  if (barcodeClash) {
    const proceed = await confirmAction({
      titleKey: 'form.barcodeTakenTitle',
      messageKey: 'form.barcodeTakenMessage', messageParams: { barcode, name: barcodeClash.name },
      icon: '⚠️',
      confirmLabelKey: 'form.saveAnyway',
    });
    if (!proceed) return;
  }

  // The field shows a provisional number so the form looks complete. If the
  // user left it untouched, take an authoritative one from the workspace
  // counter now — two devices saving at once must not land on the same SKU.
  // The reserved number is the one written, so it is the one checked: the
  // clash check above looked at the provisional placeholder.
  const fields = collectItemFields();
  if (!fields.ok) return;
  const classification = currentClassification();

  const resolvedSku = (form.isNew && (!sku || sku === form.provisionalSku))
    ? await repository.reserveUniqueSku()
    : sku;

  const payload = {
    id: form.itemId,
    name,
    sku: resolvedSku,
    barcode,
    ...classification,
    customFields: fields.customFields,
    customFieldDefs: fields.customFieldDefs,
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

  await withBusy($('save-item-btn'), t('common.saving'), async () => {
    try {
      if (form.isNew) {
        await repository.createItem(payload);
        rememberChoice(classification);
        toast(t('manage.added'), '✓');
      } else {
        await repository.updateItem(form.itemId, payload, form.baseVersion);
        toast(t('manage.updated'), '✓');
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
      toastError(error, 'form.saveFailed');
    }
  });
}

async function handleConflict(error) {
  const keepMine = await confirmAction({
    titleKey: 'sync.conflict',
    messageKey: 'form.conflictMessage',
    icon: '⚠️',
    confirmLabelKey: 'form.overwrite',
  });

  if (!keepMine) {
    // Reloading throws this form's edit away — including any image uploaded
    // into it, which the latest record does not hold. Settled first, before
    // the new form replaces the list that knows about it.
    await discardAbandonedFormMedia(form.itemId);
    await openItemForm({ itemId: form.itemId });
    toast(t('form.reloaded'), '↻');
    return;
  }

  try {
    const current = await repository.getItem(form.itemId, { fresh: true });
    form.baseVersion = current?.version ?? error.current?.version ?? null;
    await saveItem();
  } catch (retryError) {
    toastError(retryError, 'form.saveFailed');
  }
}

export function bindItemForm() {
  $('f-barcode-scan')?.addEventListener('click', () => openScanner({
    titleKey: 'form.scanTitle',
    onManual: () => setTimeout(() => $('f-barcode')?.focus(), 250),
    onCode: ({ value }) => {
      $('f-barcode').value = value;
      toast(t('form.scanned'), '⊡');
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
