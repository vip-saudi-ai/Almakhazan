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
import { hasMessage, t } from '../i18n.js';
import { currencySymbol } from '../money.js';
import { repository } from '../repository.js';
import {
  LEVELS, definitionFor, fieldApplies, fieldLabel, measurementUnitLabel, optionLabel,
} from '../taxonomy.js';
import { catalogService } from '../catalog/service.js';
import { catalogValueText } from '../field-format.js';
import { openCatalogPicker } from './catalog-picker.js';
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
  /** What the last cascade change did to the levels below it, said aloud. */
  catalogNotice: '',
};

/**
 * The last catalog path saved under each field template in this session —
 * offered as «استخدام آخر اختيار», never filled in by itself. Only catalog
 * selections are kept: never a serial number, a VIN or anything else that
 * belongs to one object.
 */
const lastPaths = new Map();

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
  state.catalogNotice = '';
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
    case 'catalog': return value && typeof value === 'object' ? { ref: value.ref ?? null, label: value.label || '' } : { ref: null, label: String(value) };
    case 'year': return value === '' || value == null ? '' : String(typeof value === 'object' ? value.value ?? '' : value);
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
  if (typeof raw === 'object') return Boolean(String(raw.label || raw.amount || '').trim());
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

function fieldRow(def, { removable = false, template = [] } = {}) {
  if (def.type === 'catalog' || def.type === 'year') return pickerRow(def, template, { removable });
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

/** The values the form holds now, as the stored shapes — for `showWhen`. */
function currentValues(defs) {
  const out = {};
  for (const def of defs) {
    const raw = currentRaw(def);
    if (!hasRawValue(raw)) continue;
    out[def.id] = raw;
  }
  return out;
}

/**
 * A value kept under an older text field that a catalog field now covers
 * («الشركة المصنعة» typed before there was a catalog) moves into the new
 * field — matched to the catalog only when exactly one entry has that name —
 * and the old key goes when the record is saved. Nothing is dropped: the text
 * is what the new field shows.
 */
function applySupersedes(template) {
  for (const def of template) {
    if (!def.supersedes?.length || def.id in state.raw || hasFieldValue(state.stored[def.id])) continue;
    for (const old of def.supersedes) {
      const legacy = state.stored[old];
      if (state.removed.has(old) || typeof legacy !== 'string' || !legacy.trim()) continue;
      state.raw[def.id] = def.type === 'catalog' ? matchCatalog(def, legacy) : legacy;
      state.removed.add(old);
      break;
    }
  }
}

function matchCatalog(def, text) {
  try {
    const found = catalogService.resolveText({ domain: def.catalog.domain, entityType: def.catalog.entityType, text });
    if (found.status === 'unique') return snapshot(found.entity);
  } catch (error) {
    console.error('[catalog] could not match an older value', error);
  }
  return { ref: null, label: text.trim() };
}

/** What a record stores for a catalog choice: the id, and its official name as a snapshot. */
function snapshot(entity) {
  return { ref: entity.id, label: entity.nameEn || entity.nameAr };
}

/** The definitions this form shows now, in three groups. */
function groups() {
  const taxonomy = repository.taxonomy();
  const all = taxonomy.fieldsFor(state.cls).filter((def) => !state.removed.has(def.id));
  applySupersedes(all);
  const allIds = new Set(all.map((def) => def.id));
  const values = currentValues(all);
  // A field that applies only to some machines or stones is left out until
  // it does — unless it already holds something.
  const template = all.filter((def) => values[def.id] !== undefined
    || fieldApplies(def, { values, templateIds: allIds, categoryId: state.cls.categoryId }));
  const templateIds = allIds;
  const own = state.ownDefs.filter((def) => !templateIds.has(def.id) && !state.removed.has(def.id));
  const ownIds = new Set(own.map((def) => def.id));
  const previous = [];
  const ids = new Set([...Object.keys(state.stored), ...Object.keys(state.raw)]);
  for (const id of ids) {
    if (templateIds.has(id) || ownIds.has(id) || state.removed.has(id)) continue;
    // A value whose definition is gone still gets a row (a definition
    // inferred from the value), so nothing stored becomes invisible here.
    const def = definitionFor(id, { taxonomy, item: { customFieldDefs: state.ownDefs }, value: state.stored[id] ?? state.raw[id] });
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
  renderQuick(template);
  const title = $('f-extra-title');
  if (title) {
    const name = repository.taxonomy().templateFor(state.cls);
    title.textContent = name && hasMessage(`fields.detailsFor.${name}`) ? t(`fields.detailsFor.${name}`) : t('fields.additional');
  }

  // One brand field, not two: when the Category asks for its brand through
  // the catalog, the record's own «البراند» row steps aside — unless it
  // already holds something, which is never hidden.
  const brandInput = $('f-brand');
  const brandRow = brandInput?.closest('.frow');
  if (brandRow) brandRow.hidden = template.some((def) => def.mirrors === 'brand') && !brandInput.value.trim();

  const detail = template.filter((def) => !def.quick);
  const visible = detail.filter((def) => state.showAll || def.defaultVisible !== false || hasRawValue(currentRaw(def)));
  const hiddenCount = detail.length - visible.length;
  const children = [];
  if (state.catalogNotice) children.push(el('p', { class: 'field-hint', role: 'status', text: state.catalogNotice }));
  if (detail.length) children.push(el('p', { class: 'sheet-note', text: t('fields.additionalHint') }));
  if (visible.length) children.push(el('div', { class: 'fsec cf-sec' }, visible.map((def) => fieldRow(def, { template }))));
  if (hiddenCount > 0) {
    children.push(el('button', {
      type: 'button', class: 'tax-add', text: t('fields.showAll', { count: detail.length }),
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

// ── catalog and year fields ────────────────────────────────────────────────

/** A catalog or year field: a row that opens the searchable picker. */
function pickerRow(def, template, { removable = false } = {}) {
  const controlId = `cf-${def.id}`;
  const label = fieldLabel(def);
  const raw = currentRaw(def);
  const has = hasRawValue(raw);
  const text = def.type === 'catalog' ? catalogValueText(raw) : raw;
  const button = el('button', {
    type: 'button', id: controlId, class: `frow frow-pick${has ? '' : ' empty'}`, 'aria-haspopup': 'dialog',
    onClick: () => (def.type === 'year' ? chooseYear(def) : chooseCatalog(def, template)),
  }, [
    el('span', { class: 'frow-pick-label', text: label }),
    el('span', { class: 'frow-pick-value', dir: 'auto', text: has ? text : t('catalog.choose') }),
    el('span', { class: 'lchev', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
  ]);
  const clear = has ? el('button', {
    type: 'button', class: 'catalog-clear', 'aria-label': t('catalog.clearValue', { name: label }),
    onClick: () => { setCatalogValue(def, template, null); },
  }, [el('span', { 'aria-hidden': 'true', text: '✕' })]) : null;
  const remove = removable ? el('button', {
    type: 'button', class: 'cf-remove', 'aria-label': t('fields.remove', { name: label }),
    onClick: () => removeField(def.id),
  }, [el('span', { 'aria-hidden': 'true', text: '✕' })]) : null;
  return el('div', { class: 'cf-row', dataset: { field: def.id, type: def.type } }, [
    el('div', { class: 'catalog-row' }, [button, clear, remove]),
    el('div', { class: 'field-hint', id: `${controlId}-error`, role: 'alert' }),
  ]);
}

/** The template's catalog fields above `def`, nearest first. */
function ancestorFields(def, template) {
  const byId = new Map(template.map((d) => [d.id, d]));
  const out = [];
  let parent = def.catalog?.parent ? byId.get(def.catalog.parent) : null;
  while (parent && !out.includes(parent)) {
    out.push(parent);
    parent = parent.catalog?.parent ? byId.get(parent.catalog.parent) : null;
  }
  return out;
}

/** The template's catalog fields below `def`, in any depth. */
function descendantFields(def, template) {
  return template.filter((other) => other.type === 'catalog' && other !== def && ancestorFields(other, template).includes(def));
}

function valueOf(def) {
  const raw = currentRaw(def);
  return hasRawValue(raw) ? raw : null;
}

/**
 * Where a catalog field looks: under the nearest level above it that holds a
 * catalog choice (its children, or its descendants when a level between was
 * left empty). A level above typed by hand says nothing about which entries
 * apply, so the list waits for a search instead.
 */
function pickerContext(def, template) {
  const chain = ancestorFields(def, template);
  for (const [index, ancestor] of chain.entries()) {
    const value = valueOf(ancestor);
    if (!value) continue;
    if (!value.ref) return { parentId: null, ancestorId: null, browse: false };
    return index === 0 ? { parentId: value.ref, ancestorId: null, browse: true } : { parentId: null, ancestorId: value.ref, browse: true };
  }
  // The top of a cascade lists its entries; a lower level with nothing above
  // it is searched directly — a reference typed in full finds its brand.
  return { parentId: null, ancestorId: null, browse: chain.length === 0 };
}

function chooseCatalog(def, template) {
  syncRaw();
  const context = pickerContext(def, template);
  const root = !def.catalog.parent;
  const hasChildren = descendantFields(def, template).length > 0;
  openCatalogPicker({
    mode: 'catalog',
    noun: def.noun,
    domain: def.catalog.domain,
    entityType: def.catalog.entityType,
    ...context,
    // From the top of a cascade, a search reaches every level: «126500»,
    // «5711/1A», «Land Cruiser» or «320 GX» fill the whole path at once.
    wholeDomain: root && hasChildren,
    selected: valueOf(def),
    onPick: (choice) => {
      if (choice.clear) setCatalogValue(def, template, null);
      else if (choice.manual) setCatalogValue(def, template, { ref: null, label: choice.manual });
      else if (choice.entity) pickEntity(def, template, choice.entity);
      document.getElementById(`cf-${def.id}`)?.focus();
    },
  });
}

function chooseYear(def) {
  syncRaw();
  const raw = currentRaw(def);
  openCatalogPicker({
    mode: 'year',
    selected: raw ? Number(raw) : null,
    yearMin: def.validation?.min ?? 1600,
    yearMax: def.validation?.max ?? new Date().getFullYear() + 1,
    onPick: (choice) => {
      state.raw[def.id] = choice.clear ? '' : String(choice.year);
      renderFields({ sync: false });
      document.getElementById(`cf-${def.id}`)?.focus();
    },
  });
}

/**
 * A catalog entry was chosen. The field that holds its level takes it —
 * which, from a whole-domain search, may be a level below the one tapped —
 * the levels above take its path, and the levels below are checked.
 */
function pickEntity(def, template, entity) {
  const target = template.find((d) => d.type === 'catalog' && d.catalog.domain === def.catalog.domain && d.catalog.entityType === entity.entityType
    && (d === def || ancestorFields(d, template).includes(def) || ancestorFields(def, template).includes(d))) || def;
  const path = catalogService.path(entity.id);
  const notes = [];
  state.raw[target.id] = snapshot(entity);
  for (const ancestor of ancestorFields(target, template)) {
    const inPath = path.find((e) => e.entityType === ancestor.catalog.entityType);
    const current = valueOf(ancestor);
    if (inPath) state.raw[ancestor.id] = snapshot(inPath);
    else if (current?.ref) {
      // A level the chosen entry does not have (a reference filed directly
      // under its collection): a different catalog choice there contradicts it.
      notes.push(t('catalog.cleared', { value: catalogValueText(current) }));
      state.raw[ancestor.id] = '';
    }
  }
  invalidateBelow(target, template, notes);
  state.catalogNotice = notes.join(' ');
  renderFields({ sync: false });
}

/** A field set directly — to nothing, or to a value typed for this item. */
function setCatalogValue(def, template, value) {
  syncRaw();
  state.raw[def.id] = value || '';
  const notes = [];
  if (value) invalidateBelow(def, template, notes);
  state.catalogNotice = notes.join(' ');
  renderFields({ sync: false });
}

/**
 * The levels below a change: a catalog choice that no longer lies under the
 * new selection is cleared, and said to be; a value the customer typed by
 * hand is kept — the customer decides — and said to be kept.
 */
function invalidateBelow(def, template, notes) {
  for (const child of descendantFields(def, template)) {
    const value = valueOf(child);
    if (!value) continue;
    if (!value.ref) { notes.push(t('catalog.keptManual', { value: value.label })); continue; }
    const anchor = ancestorFields(child, template).map(valueOf).find(Boolean);
    const fits = anchor?.ref ? catalogService.isWithin(value.ref, anchor.ref) : false;
    if (!fits) {
      notes.push(t('catalog.cleared', { value: catalogValueText(value) }));
      state.raw[child.id] = '';
    }
  }
}

/** The quick rows beside the classification, and «استخدام آخر اختيار». */
function renderQuick(template) {
  const host = $('f-quick');
  if (!host) return;
  const quick = template.filter((def) => def.quick);
  const rows = quick.map((def) => pickerRow(def, template));
  const name = repository.taxonomy().templateFor(state.cls);
  const last = name ? lastPaths.get(name) : null;
  const catalogDefs = template.filter((def) => def.type === 'catalog');
  const empty = catalogDefs.every((def) => !valueOf(def));
  if (last && empty) {
    const labels = catalogDefs.map((def) => last[def.id]).filter(Boolean).map((v) => catalogValueText(v));
    if (labels.length) {
      rows.push(el('button', {
        type: 'button', class: 'chipbtn catalog-last', id: 'f-use-last',
        text: t('catalog.useLast', { path: labels.join(' › ') }),
        onClick: () => {
          syncRaw();
          for (const def of catalogDefs) if (last[def.id]) state.raw[def.id] = { ...last[def.id] };
          renderFields({ sync: false });
          $('f-quick')?.querySelector('.frow-pick')?.focus();
        },
      }));
    }
  }
  render(host, rows);
}

/** Remembers this form's catalog path for «استخدام آخر اختيار» — catalog choices only. */
export function rememberCatalogSelection() {
  const taxonomy = repository.taxonomy();
  const name = taxonomy.templateFor(state.cls);
  if (!name) return;
  const path = {};
  for (const def of taxonomy.fieldsFor(state.cls)) {
    if (def.type !== 'catalog') continue;
    const value = valueOf(def);
    if (value) path[def.id] = { ...value };
  }
  if (Object.keys(path).length) lastPaths.set(name, path);
}

/**
 * The label of the catalog field that stands for the record's brand or
 * manufacturer, when it holds one — so «البراند» is filled and searchable
 * without being typed twice.
 */
export function mirroredBrand() {
  const def = repository.taxonomy().fieldsFor(state.cls).find((d) => d.mirrors === 'brand');
  if (!def) return null;
  const value = valueOf(def);
  // The official name as recorded (the snapshot), not this screen's language.
  return value ? value.label || catalogValueText(value) : null;
}

/** Whether the chosen Category asks for its brand through a catalog field. */
export function templateMirrorsBrand() {
  return repository.taxonomy().fieldsFor(state.cls).some((d) => d.mirrors === 'brand');
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
