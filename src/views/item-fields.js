// The item form's classification and its category-specific fields.
//
//   الفئة الرئيسية → الصنف → الصنف الفرعي (only when the Category has any)
//   تفاصيل إضافية: the fields the chosen Category recommends, the values from
//   an earlier classification («حقول سابقة»), and fields of the customer's own.
//
// Nothing here is reset by opening a record: dependent levels clear only when
// the customer changes the level above them, and say so. Values typed into a
// field that stops applying are never dropped — they move to «حقول سابقة»
// until the customer removes them.

import { CURRENCIES, TAXONOMY_LIMITS } from '../config.js';
import {
  CUSTOM_FIELD_TYPES, hasFieldValue, newCustomFieldId, normalizeCustomFieldDef, normalizeFieldValue,
} from '../custom-fields.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { currencySymbol } from '../money.js';
import { repository } from '../repository.js';
import {
  LEVELS, definitionFor, fieldLabel, measurementUnitLabel, optionLabel,
} from '../taxonomy.js';
import { $, el, render } from '../utils.js';
import { openTaxonomyPicker } from './taxonomy-picker.js';
import { toast, toastError } from '../ui.js';

const state = {
  cls: { mainCategoryId: null, categoryId: null, subcategoryId: null },
  /** What the record holds, by field id — untouched values are kept as stored. */
  stored: {},
  /** What the customer typed this session, by field id. */
  raw: {},
  ownDefs: [],
  removed: new Set(),
  showAll: false,
  notice: '',
  otherAcknowledged: false,
  builder: null,
};

/**
 * The choice to start the next new record from, within this session — a
 * warehouse entering forty generators should not pick «مولدات» forty times.
 * Never written anywhere, and visible (and changeable) in the form.
 */
let lastChoice = null;

export function rememberChoice(cls) {
  lastChoice = cls?.mainCategoryId ? { mainCategoryId: cls.mainCategoryId, categoryId: cls.categoryId, subcategoryId: null } : null;
}

function asNull(id) {
  return id && id !== 'uncategorized' ? id : null;
}

/** Fills the section from a record, or from the last choice for a new one. */
export function initItemFields(item) {
  const taxonomy = repository.taxonomy();
  if (item) {
    const { main, category, sub } = taxonomy.path(item);
    state.cls = { mainCategoryId: main?.id || null, categoryId: category?.id || null, subcategoryId: sub?.id || null };
  } else {
    const start = lastChoice && taxonomy.check(lastChoice).ok ? lastChoice : null;
    state.cls = start
      ? { mainCategoryId: start.mainCategoryId, categoryId: asNull(start.categoryId), subcategoryId: null }
      : { mainCategoryId: null, categoryId: null, subcategoryId: null };
  }
  state.stored = { ...(item?.customFields || {}) };
  state.raw = {};
  state.ownDefs = [...(item?.customFieldDefs || [])];
  state.removed = new Set();
  state.showAll = false;
  state.notice = '';
  state.otherAcknowledged = false;
  state.builder = null;
  // Each form starts closed; a record that already holds values opens it.
  const details = $('f-extra');
  if (details) details.open = false;
  renderClassification();
  renderFields({ sync: false });
}

export function currentClassification() {
  return {
    mainCategoryId: state.cls.mainCategoryId || null,
    categoryId: state.cls.categoryId || 'uncategorized',
    subcategoryId: state.cls.subcategoryId || null,
  };
}

/** For the assistant's suggestion: the Category (and its Main Category) in one go. */
export function applySuggestedCategory(categoryId) {
  const taxonomy = repository.taxonomy();
  const node = taxonomy.resolve(categoryId);
  if (!node || node.level !== LEVELS.CATEGORY) return;
  syncRaw();
  state.cls = { mainCategoryId: taxonomy.mainOf(node)?.id || null, categoryId: node.id, subcategoryId: null };
  renderClassification();
  renderFields({ sync: false });
}

// ── classification rows ───────────────────────────────────────────────────

function pickRow({ id, labelKey, node, placeholderKey, disabled, onClick }) {
  const taxonomy = repository.taxonomy();
  const value = node ? taxonomy.label(node) : t(placeholderKey);
  return el('button', {
    type: 'button', id, class: `frow frow-pick${node ? '' : ' empty'}`,
    'aria-haspopup': 'dialog', disabled: disabled || undefined,
    onClick,
  }, [
    el('span', { class: 'frow-pick-label', text: t(labelKey) }),
    el('span', { class: 'frow-pick-value', dir: 'auto' }, [
      node ? el('span', { class: 'frow-pick-ico', 'aria-hidden': 'true', text: taxonomy.icon(node) }) : null,
      value,
    ]),
    el('span', { class: 'lchev', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
  ]);
}

export function renderClassification() {
  const host = $('f-class');
  if (!host) return;
  const taxonomy = repository.taxonomy();
  const main = taxonomy.node(state.cls.mainCategoryId);
  const category = taxonomy.node(state.cls.categoryId);
  const sub = taxonomy.node(state.cls.subcategoryId);
  const subs = category ? taxonomy.subcategories(category.id, { keep: sub ? [sub.id] : [] }) : [];

  const rows = [
    pickRow({
      id: 'f-main', labelKey: 'field.mainCategory', node: main, placeholderKey: 'taxonomy.choose',
      onClick: () => chooseMain(),
    }),
    pickRow({
      id: 'f-cat', labelKey: 'field.category', node: category,
      placeholderKey: main ? 'taxonomy.choose' : 'taxonomy.pickMainFirst',
      disabled: !main, onClick: () => chooseCategory(),
    }),
  ];
  if (subs.length) {
    rows.push(pickRow({
      id: 'f-sub', labelKey: 'field.subcategory', node: sub, placeholderKey: 'taxonomy.optional',
      onClick: () => chooseSub(),
    }));
  }
  rows.push(el('div', { class: 'field-hint', id: 'f-class-note', role: 'status', text: state.notice }));

  if (category?.other && !state.otherAcknowledged) {
    rows.push(el('div', { class: 'tax-other', role: 'group', 'aria-label': t('taxonomy.otherTitle') }, [
      el('p', { class: 'sheet-note', text: t('taxonomy.otherHint') }),
      el('div', { class: 'tax-create-acts' }, [
        el('button', { type: 'button', class: 'btn btn-g', text: t('taxonomy.useOther'), onClick: () => { state.otherAcknowledged = true; renderClassification(); } }),
        el('button', { type: 'button', class: 'btn btn-s', text: t('taxonomy.createInstead'), onClick: () => chooseCategory({ create: true }) }),
      ]),
    ]));
  }
  render(host, rows);
}

function chooseMain() {
  openTaxonomyPicker({
    level: LEVELS.MAIN,
    selectedId: state.cls.mainCategoryId,
    clearLabel: t('taxonomy.clearMain'),
    onPick: (id, level) => {
      if (level === LEVELS.CATEGORY) { applySuggestedCategory(id); $('f-cat')?.focus(); return; }
      if (id === state.cls.mainCategoryId) return;
      syncRaw();
      const hadCategory = Boolean(state.cls.categoryId);
      state.cls = { mainCategoryId: id, categoryId: null, subcategoryId: null };
      state.notice = hadCategory ? t('taxonomy.mainChanged') : '';
      state.otherAcknowledged = false;
      renderClassification();
      renderFields({ sync: false });
      // The next tap is almost always the Category: offer it at once.
      if (id && repository.taxonomy().categories(id).length) chooseCategory();
      else $('f-main')?.focus();
    },
  });
}

function chooseCategory({ create = false } = {}) {
  if (!state.cls.mainCategoryId) return;
  openTaxonomyPicker({
    level: LEVELS.CATEGORY,
    parentId: state.cls.mainCategoryId,
    selectedId: state.cls.categoryId,
    clearLabel: t('taxonomy.clearCategory'),
    create,
    onPick: (id) => {
      if (id === state.cls.categoryId) { $('f-cat')?.focus(); return; }
      syncRaw();
      const hadSub = Boolean(state.cls.subcategoryId);
      state.cls = { ...state.cls, categoryId: id, subcategoryId: null };
      // A note about the level above stays until the next change that has one.
      if (hadSub) state.notice = t('taxonomy.categoryChanged');
      state.otherAcknowledged = false;
      renderClassification();
      renderFields({ sync: false });
      $('f-cat')?.focus();
    },
  });
}

function chooseSub() {
  if (!state.cls.categoryId) return;
  openTaxonomyPicker({
    level: LEVELS.SUB,
    parentId: state.cls.categoryId,
    selectedId: state.cls.subcategoryId,
    clearLabel: t('taxonomy.clearSubcategory'),
    onPick: (id) => {
      syncRaw();
      state.cls = { ...state.cls, subcategoryId: id };
      state.notice = '';
      renderClassification();
      renderFields({ sync: false });
      $('f-sub')?.focus();
    },
  });
}

// ── field values: stored ↔ what an input shows ──────────────────────────────

function toRaw(def, value) {
  if (value == null) return def.type === 'multiselect' ? [] : '';
  switch (def.type) {
    case 'currency': return { amount: value.amount != null ? String(value.amount) : '', currency: value.currency || 'SAR' };
    case 'measurement': return typeof value === 'object' ? String(value.value ?? '') : String(value);
    case 'boolean': return value === true ? 'true' : value === false ? 'false' : '';
    case 'multiselect': return Array.isArray(value) ? value : [];
    default: return String(value);
  }
}

function currentRaw(def) {
  if (def.id in state.raw) return state.raw[def.id];
  return toRaw(def, state.stored[def.id]);
}

function hasRawValue(raw) {
  if (raw == null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'object') return Boolean(String(raw.amount || '').trim());
  return String(raw).trim() !== '';
}

/** Reads every rendered input back into `state.raw`, before a redraw. */
function syncRaw() {
  const host = $('f-extra-body');
  if (!host) return;
  for (const wrapper of host.querySelectorAll('[data-field]')) {
    const id = wrapper.dataset.field;
    const type = wrapper.dataset.type;
    if (type === 'multiselect') {
      state.raw[id] = [...wrapper.querySelectorAll('input[type=checkbox]:checked')].map((box) => box.value);
    } else if (type === 'currency') {
      state.raw[id] = { amount: wrapper.querySelector('input').value, currency: wrapper.querySelector('select').value };
    } else {
      const control = wrapper.querySelector('input, select, textarea');
      if (control) state.raw[id] = control.value;
    }
  }
}

// ── rendering ──────────────────────────────────────────────────────────────

function fieldControl(def, controlId) {
  const raw = currentRaw(def);
  const common = { id: controlId, dir: def.type === 'identifier' || def.type === 'url' ? 'ltr' : 'auto' };
  switch (def.type) {
    case 'multiline':
      return el('textarea', { ...common, text: raw });
    case 'number':
    case 'decimal':
      return el('input', { ...common, dir: 'ltr', inputmode: 'decimal', value: raw });
    case 'measurement':
      return el('span', { class: 'frow-field' }, [
        el('input', { ...common, dir: 'ltr', inputmode: 'decimal', value: raw }),
        el('span', { class: 'cf-unit', text: measurementUnitLabel(def.unit) }),
      ]);
    case 'currency': {
      const currency = raw.currency || 'SAR';
      const codes = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];
      return el('span', { class: 'frow-field' }, [
        el('input', { ...common, dir: 'ltr', inputmode: 'decimal', value: raw.amount || '' }),
        el('select', { class: 'cf-currency', 'aria-label': t('field.currency') }, codes.map((code) => el('option', {
          value: code, text: `${currencySymbol(code)} ${code}`, selected: code === currency || undefined,
        }))),
      ]);
    }
    case 'date':
      return el('input', { ...common, dir: 'ltr', type: 'date', value: raw });
    case 'boolean':
      return el('select', common, [
        el('option', { value: '', text: t('fields.notSet') }),
        el('option', { value: 'true', text: t('fields.yes'), selected: raw === 'true' || undefined }),
        el('option', { value: 'false', text: t('fields.no'), selected: raw === 'false' || undefined }),
      ]);
    case 'select': {
      const ids = (def.options || []).map((o) => (typeof o === 'string' ? o : o.id));
      return el('select', common, [
        el('option', { value: '', text: t('fields.notSet') }),
        ...ids.map((id) => el('option', { value: id, text: optionLabel(def, id), selected: raw === id || undefined })),
      ]);
    }
    case 'url':
      return el('input', { ...common, type: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', value: raw });
    case 'identifier':
      return el('input', { ...common, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', value: raw });
    default:
      return el('input', { ...common, value: raw });
  }
}

function fieldRow(def, { removable = false } = {}) {
  const controlId = `cf-${def.id}`;
  const label = fieldLabel(def);
  const remove = removable ? el('button', {
    type: 'button', class: 'cf-remove', 'aria-label': t('fields.remove', { name: label }),
    onClick: () => removeField(def.id),
  }, [el('span', { 'aria-hidden': 'true', text: '✕' })]) : null;

  if (def.type === 'multiselect') {
    const chosen = new Set(currentRaw(def));
    const ids = (def.options || []).map((o) => (typeof o === 'string' ? o : o.id));
    return el('fieldset', { class: 'frow frowv cf-multi', dataset: { field: def.id, type: def.type } }, [
      el('legend', { class: 'cf-legend', text: label }),
      el('div', { class: 'cf-options' }, ids.map((id, index) => el('label', { class: 'cf-option' }, [
        el('input', { type: 'checkbox', value: id, id: `${controlId}-${index}`, checked: chosen.has(id) || undefined }),
        el('span', { text: optionLabel(def, id) }),
      ]))),
      remove,
      el('div', { class: 'field-hint', id: `${controlId}-error`, role: 'alert' }),
    ]);
  }
  return el('div', { class: `cf-row${def.type === 'multiline' ? ' frowv' : ''}`, dataset: { field: def.id, type: def.type } }, [
    el('div', { class: `frow${def.type === 'multiline' ? ' frowv' : ''}` }, [
      el('label', { for: controlId, text: label }),
      fieldControl(def, controlId),
      remove,
    ]),
    el('div', { class: 'field-hint', id: `${controlId}-error`, role: 'alert' }),
  ]);
}

/** The definitions this form shows now, in three groups. */
function groups() {
  const taxonomy = repository.taxonomy();
  const template = taxonomy.fieldsFor(state.cls).filter((def) => !state.removed.has(def.id));
  const templateIds = new Set(template.map((def) => def.id));
  const own = state.ownDefs.filter((def) => !templateIds.has(def.id) && !state.removed.has(def.id));
  const ownIds = new Set(own.map((def) => def.id));
  const previous = [];
  const ids = new Set([...Object.keys(state.stored), ...Object.keys(state.raw)]);
  for (const id of ids) {
    if (templateIds.has(id) || ownIds.has(id) || state.removed.has(id)) continue;
    const def = definitionFor(id, { taxonomy, item: { customFieldDefs: state.ownDefs } });
    if (!def) continue;
    const raw = id in state.raw ? state.raw[id] : toRaw(def, state.stored[id]);
    if (hasRawValue(raw)) previous.push(def);
  }
  return { template, own, previous };
}

export function renderFields({ sync = true } = {}) {
  if (sync) syncRaw();
  const host = $('f-extra-body');
  if (!host) return;
  const { template, own, previous } = groups();

  const visible = template.filter((def) => state.showAll || def.defaultVisible !== false || hasRawValue(currentRaw(def)));
  const hiddenCount = template.length - visible.length;
  const children = [];
  if (template.length) children.push(el('p', { class: 'sheet-note', text: t('fields.additionalHint') }));
  if (visible.length) children.push(el('div', { class: 'fsec cf-sec' }, visible.map((def) => fieldRow(def))));
  if (hiddenCount > 0) {
    children.push(el('button', {
      type: 'button', class: 'tax-add', text: t('fields.showAll', { count: template.length }),
      onClick: () => { syncRaw(); state.showAll = true; renderFields({ sync: false }); },
    }));
  }
  if (own.length) {
    children.push(el('h3', { class: 'cf-title', text: t('fields.own') }));
    children.push(el('div', { class: 'fsec cf-sec' }, own.map((def) => fieldRow(def, { removable: true }))));
  }
  if (previous.length) {
    children.push(el('h3', { class: 'cf-title', text: t('fields.previous') }));
    children.push(el('p', { class: 'sheet-note', text: t('fields.previousHint') }));
    children.push(el('div', { class: 'fsec cf-sec' }, previous.map((def) => fieldRow(def, { removable: true }))));
  }
  children.push(builderArea());
  render(host, children);

  const details = $('f-extra');
  const filled = [...template, ...own, ...previous].some((def) => hasRawValue(currentRaw(def)));
  if (details && filled) details.open = true;
  const count = $('f-extra-count');
  if (count) count.textContent = template.length ? String(template.length) : '';
}

function removeField(id) {
  syncRaw();
  state.removed.add(id);
  delete state.raw[id];
  state.ownDefs = state.ownDefs.filter((def) => def.id !== id);
  renderFields({ sync: false });
}

// ── «+ إضافة حقل مخصص» ─────────────────────────────────────────────────────

function builderArea() {
  if (!state.builder) {
    return el('button', {
      type: 'button', class: 'tax-add', id: 'cf-add', text: t('fields.addCustom'),
      onClick: () => { syncRaw(); state.builder = { type: 'text' }; renderFields({ sync: false }); $('cf-new-label')?.focus(); },
    });
  }
  const taxonomy = repository.taxonomy();
  const category = taxonomy.node(state.cls.categoryId);
  const typeSelect = el('select', { id: 'cf-new-type', onChange: (event) => { state.builder.type = event.target.value; syncBuilderOptions(); } },
    CUSTOM_FIELD_TYPES.map((type) => el('option', { value: type, text: t(`fieldType.${type}`), selected: state.builder.type === type || undefined })));
  return el('div', { class: 'fsec cf-builder', role: 'group', 'aria-label': t('fields.addCustom') }, [
    el('div', { class: 'frow' }, [
      el('label', { for: 'cf-new-label', text: t('fields.label') }),
      el('input', { id: 'cf-new-label', dir: 'auto', maxlength: String(TAXONOMY_LIMITS.fieldLabel), placeholder: t('fields.labelPlaceholder') }),
    ]),
    el('div', { class: 'frow' }, [el('label', { for: 'cf-new-type', text: t('fields.type') }), typeSelect]),
    el('div', { class: 'frow frowv', id: 'cf-new-options-row', style: { display: ['select', 'multiselect'].includes(state.builder.type) ? '' : 'none' } }, [
      el('label', { for: 'cf-new-options', text: t('fields.options') }),
      el('textarea', { id: 'cf-new-options', dir: 'auto', placeholder: t('fields.optionsPlaceholder') }),
    ]),
    category ? el('label', { class: 'frow cf-save-to' }, [
      el('input', { type: 'checkbox', id: 'cf-new-save' }),
      el('span', { text: t('fields.saveToCategory', { name: taxonomy.label(category) }) }),
    ]) : null,
    el('div', { class: 'field-hint', id: 'cf-new-error', role: 'alert' }),
    el('div', { class: 'tax-create-acts' }, [
      el('button', { type: 'button', class: 'btn btn-g', text: t('fields.cancel'), onClick: () => { syncRaw(); state.builder = null; renderFields({ sync: false }); $('cf-add')?.focus(); } }),
      el('button', { type: 'button', class: 'btn btn-p', id: 'cf-new-add', text: t('fields.add'), onClick: addCustomField }),
    ]),
  ]);
}

function syncBuilderOptions() {
  const row = $('cf-new-options-row');
  if (row) row.style.display = ['select', 'multiselect'].includes(state.builder?.type) ? '' : 'none';
}

async function addCustomField() {
  const error = $('cf-new-error');
  const label = $('cf-new-label').value;
  const type = $('cf-new-type').value;
  const options = ($('cf-new-options')?.value || '').split('\n');
  if (!label.trim()) { error.textContent = t('taxonomy.error.nameRequired'); return; }
  const def = normalizeCustomFieldDef({ id: newCustomFieldId(), type, label, options });
  if (!def) { error.textContent = t(['select', 'multiselect'].includes(type) ? 'fields.optionsRequired' : 'field.error.format'); return; }

  syncRaw();
  const saveToCategory = $('cf-new-save')?.checked && state.cls.categoryId;
  if (saveToCategory) {
    const saved = repository.taxonomy().savedFields(state.cls.categoryId);
    if (saved.length >= TAXONOMY_LIMITS.fieldsPerTemplate) { error.textContent = t('fields.limit'); return; }
    try {
      await repository.saveTaxonomyNodeFields(state.cls.categoryId, [...saved, def]);
      toast(t('fields.saved'), '✓');
    } catch (failure) {
      toastError(failure);
      return;
    }
  } else {
    if (state.ownDefs.length >= TAXONOMY_LIMITS.fieldsPerItem) { error.textContent = t('fields.limit'); return; }
    state.ownDefs.push(def);
  }
  state.builder = null;
  renderFields({ sync: false });
  $(`cf-${def.id}`)?.focus();
}

// ── on save ────────────────────────────────────────────────────────────────

/**
 * The values to store, validated against their definitions.
 * @returns {{ok: true, customFields: object, customFieldDefs: Array} | {ok: false}}
 */
export function collectItemFields() {
  syncRaw();
  const { template, own, previous } = groups();
  const shown = [...template, ...own, ...previous];
  const out = {};
  // Values of fields not on screen (a definition since deleted) are kept as
  // they were: the form never discards what it did not show.
  for (const [id, value] of Object.entries(state.stored)) {
    if (!state.removed.has(id) && !shown.some((def) => def.id === id)) out[id] = value;
  }
  let firstError = null;
  for (const def of shown) {
    const box = $(`cf-${def.id}-error`);
    if (box) box.textContent = '';
    if (!(def.id in state.raw)) {
      if (hasFieldValue(state.stored[def.id])) out[def.id] = state.stored[def.id];
      continue;
    }
    const raw = state.raw[def.id];
    const input = def.type === 'boolean' ? (raw === '' ? '' : raw === 'true') : raw;
    const result = normalizeFieldValue(def, input);
    if (result.error) {
      if (box) box.textContent = t(result.error);
      firstError ||= { def, problem: t(result.error) };
      continue;
    }
    if (result.value !== undefined) out[def.id] = result.value;
  }
  if (firstError) {
    $('f-extra').open = true;
    $(`cf-${firstError.def.id}`)?.focus();
    toast(t('fields.invalid', { name: fieldLabel(firstError.def), problem: firstError.problem }), '⚠');
    return { ok: false };
  }
  // Only this record's own definitions that still hold something, or are on screen.
  const customFieldDefs = own.concat(state.ownDefs.filter((def) => previous.some((p) => p.id === def.id)));
  return { ok: true, customFields: out, customFieldDefs };
}

export function classificationLabelForAssistant() {
  const taxonomy = repository.taxonomy();
  return taxonomy.label(taxonomy.node(state.cls.categoryId) || taxonomy.node(state.cls.mainCategoryId));
}
