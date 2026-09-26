// The classification service: Main Category → Category → optional Subcategory
// → the fields a Category recommends. Every screen — the form, the list, the
// filters, search, Settings, import, export, the assistant — reads the
// hierarchy through here and nowhere else.
//
// Two sources, merged:
//
//   built-in   src/locales/taxonomy-catalog.js, in the application bundle.
//              Stable ids, labels in Arabic and English, aliases, templates.
//              Never written to storage and never deleted: a built-in the
//              customer does not want is hidden.
//   stored     the `categories` collection. A record whose id is a built-in id
//              is that built-in's local settings (hidden, order, pinned, a
//              display name the customer prefers, fields saved to it). Any
//              other record is the customer's own Main Category, Category or
//              Subcategory (`source: 'custom'`).
//
// A record written before the hierarchy existed has no `level`. It is read as
// a Category and placed by the explicit table in the catalog — or under
// «تصنيفات سابقة» — until the migration (repository.migrateTaxonomy) writes
// that placement down. Reading and migrating use the same rule, so what the
// customer sees does not change when the migration runs.
//
// Pure apart from the language: no storage, no DOM. `buildTaxonomy(records)`
// is cached by the repository on the identity of its category array.

import {
  DEFAULT_CATEGORIES, TAXONOMY_LIMITS, TAXONOMY_SCHEMA_VERSION as TAXONOMY_VERSION, UNCATEGORIZED_ID,
} from './config.js';
import { getLanguage, hasMessage, t, translateIn } from './i18n.js';
import { normalizeArabic } from './search.js';
import { normalizeCustomFieldDefs } from './custom-fields.js';
import {
  FIELD_DEFINITIONS, FIELD_TEMPLATES, FIELD_UNITS, LEGACY_CATEGORY_MAP, MAIN_CATEGORIES,
  ONBOARDING_MAIN_CATEGORIES, PREVIOUS_MAIN,
} from './locales/taxonomy-catalog.js';

/** See config.js: the classification data model's own version. */
export const TAXONOMY_SCHEMA_VERSION = TAXONOMY_VERSION;

export const LEVELS = Object.freeze({ MAIN: 'main', CATEGORY: 'category', SUB: 'sub' });
const LEVEL_SET = new Set(Object.values(LEVELS));

export const PREVIOUS_MAIN_ID = PREVIOUS_MAIN.id;
export const OTHER_MAIN_ID = 'other';
export const ONBOARDING_CHOICES = ONBOARDING_MAIN_CATEGORIES;

// ── the built-in library, indexed once ─────────────────────────────────────

const BUILTIN = new Map();
const BUILTIN_ORDER = new Map();

function addBuiltin(def, level, parentId, index, inherited) {
  const node = Object.freeze({
    id: def.id,
    level,
    parentId,
    labels: Object.freeze({ ar: def.ar, en: def.en }),
    aliases: Object.freeze({ ar: def.aliases?.ar || [], en: def.aliases?.en || [] }),
    icon: def.icon || null,
    // `template: null` on a Category means "none", deliberately; absent means
    // "whatever the Main Category recommends".
    template: 'template' in def ? def.template : inherited,
    other: Boolean(def.other),
    onlyWhenUsed: Boolean(def.onlyWhenUsed),
  });
  BUILTIN.set(def.id, node);
  BUILTIN_ORDER.set(def.id, index);
  return node;
}

MAIN_CATEGORIES.concat([PREVIOUS_MAIN]).forEach((main, mainIndex) => {
  const mainNode = addBuiltin(main, LEVELS.MAIN, null, mainIndex, main.template ?? null);
  main.categories.forEach((category, categoryIndex) => {
    const categoryNode = addBuiltin(category, LEVELS.CATEGORY, main.id, categoryIndex, mainNode.template);
    (category.subcategories || []).forEach((sub, subIndex) => {
      addBuiltin(sub, LEVELS.SUB, category.id, subIndex, categoryNode.template);
    });
  });
});

function normalizeBuiltinField(field) {
  return Object.freeze({
    id: field.id,
    type: field.type,
    labelAr: field.ar,
    labelEn: field.en,
    required: false,
    defaultVisible: field.defaultVisible !== false,
    options: field.options
      ? Object.freeze(field.options.map((o) => Object.freeze({ id: o.id, labelAr: o.ar, labelEn: o.en })))
      : null,
    unit: field.unit || null,
    validation: field.validation || null,
    source: 'builtin',
  });
}

const FIELDS = new Map(FIELD_DEFINITIONS.map((field) => [field.id, normalizeBuiltinField(field)]));

export function isBuiltinId(id) {
  return BUILTIN.has(id);
}

export function builtinNode(id) {
  return BUILTIN.get(id) || null;
}

/** A built-in field definition by id, or null. */
export function builtinField(id) {
  return FIELDS.get(id) || null;
}

/** Every built-in id — for a restore deciding what it must not duplicate. */
export function builtinIds() {
  return [...BUILTIN.keys()];
}

/** The template name a built-in Category or Main Category recommends. */
export function builtinTemplate(id) {
  return BUILTIN.get(id)?.template ?? null;
}

export function templateFieldIds(name) {
  return FIELD_TEMPLATES[name] || [];
}

// ── labels ────────────────────────────────────────────────────────────────

const SEEDED_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));

function lang(language) {
  return language === 'en' || language === 'ar' ? language : getLanguage();
}

/** A field's label: the customer's own text, or the built-in one in the language. */
export function fieldLabel(def, language) {
  if (!def) return '';
  if (def.source === 'custom') return def.label;
  return lang(language) === 'en' ? def.labelEn : def.labelAr;
}

/** A select option's label. A customer's option is its own text. */
export function optionLabel(def, optionId, language) {
  const option = (def?.options || []).find((o) => (typeof o === 'string' ? o : o.id) === optionId);
  if (!option) return optionId;
  if (typeof option === 'string') return option;
  return lang(language) === 'en' ? option.labelEn : option.labelAr;
}

export function measurementUnitLabel(unit, language) {
  const entry = FIELD_UNITS[unit];
  return entry ? entry[lang(language)] : (unit || '');
}

/** "Two strings name the same thing" — Arabic letter forms, spacing and case folded. */
export function normalizeLabel(text) {
  return normalizeArabic(text).replace(/[\s‌‏‎]+/g, ' ').trim();
}

// ── merging built-in and stored ─────────────────────────────────────────────

/** Where a record from before the hierarchy belongs — the one rule both the
 *  display and the migration use. */
export function legacyPlacement(record) {
  const map = LEGACY_CATEGORY_MAP[record.id];
  // A seed the customer renamed is the customer's category now, and a rename
  // is exactly the evidence that "the same thing as ours" no longer holds.
  const untouched = map && SEEDED_NAME.get(record.id) === record.name;
  if (!untouched) return { parentId: PREVIOUS_MAIN_ID, mergedInto: null };
  if (map.category) return { parentId: map.main, mergedInto: map.category };
  if (map.mainOnly) return { parentId: map.main, mergedInto: map.main };
  return { parentId: map.main, mergedInto: null };
}

function customLevel(record) {
  return LEVEL_SET.has(record.level) ? record.level : LEVELS.CATEGORY;
}

function buildNode(record, builtin) {
  if (builtin) {
    return {
      id: builtin.id,
      level: builtin.level,
      parentId: builtin.parentId,
      source: 'builtin',
      builtin,
      record: record || null,
      name: record?.name || '',
      icon: builtin.icon,
      hidden: Boolean(record?.hidden),
      pinned: Boolean(record?.pinned),
      order: Number.isFinite(record?.order) ? record.order : null,
      aliases: builtin.aliases,
      other: builtin.other,
      template: builtin.template,
      fields: normalizeCustomFieldDefs(record?.fields, TAXONOMY_LIMITS.fieldsPerTemplate),
      mergedInto: null,
      migrated: true,
      defaultIndex: BUILTIN_ORDER.get(builtin.id),
      createdAt: 0,
    };
  }
  const legacy = !LEVEL_SET.has(record.level);
  const placement = legacy ? legacyPlacement(record) : null;
  return {
    id: record.id,
    level: customLevel(record),
    parentId: legacy ? placement.parentId : (record.parentId || null),
    source: 'custom',
    builtin: null,
    record,
    name: record.name || '',
    icon: record.icon || null,
    hidden: Boolean(record.hidden),
    pinned: Boolean(record.pinned),
    order: Number.isFinite(record.order) ? record.order : null,
    aliases: { ar: [], en: [] },
    other: false,
    template: record.template && FIELD_TEMPLATES[record.template] ? record.template : undefined,
    fields: normalizeCustomFieldDefs(record.fields, TAXONOMY_LIMITS.fieldsPerTemplate),
    mergedInto: legacy ? placement.mergedInto : (record.mergedInto || null),
    migrated: !legacy,
    defaultIndex: 100000,
    createdAt: record.createdAt || 0,
  };
}

function compareNodes(a, b) {
  const ao = a.order ?? a.defaultIndex;
  const bo = b.order ?? b.defaultIndex;
  if (ao !== bo) return ao - bo;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The merged hierarchy for a set of stored records.
 *
 * Indexes built once per set: nodes by id, children by parent, a searchable
 * text per node. Opening a picker or typing in its search reads these; it never
 * re-walks the records or touches an item.
 *
 * @param {Array<object>} records the `categories` collection
 */
export function buildTaxonomy(records = []) {
  const nodes = new Map();
  for (const builtin of BUILTIN.values()) nodes.set(builtin.id, null);
  const stored = new Map();
  for (const record of records) if (record?.id) stored.set(record.id, record);

  for (const builtin of BUILTIN.values()) nodes.set(builtin.id, buildNode(stored.get(builtin.id), builtin));
  for (const record of stored.values()) {
    if (BUILTIN.has(record.id) || record.id === UNCATEGORIZED_ID) continue;
    nodes.set(record.id, buildNode(record, null));
  }

  // A custom node whose parent is gone, or is of the wrong level, is kept and
  // flagged rather than dropped: its records still point at it, and the data
  // quality check is where it gets fixed.
  const expectedParentLevel = { [LEVELS.CATEGORY]: LEVELS.MAIN, [LEVELS.SUB]: LEVELS.CATEGORY };
  for (const node of nodes.values()) {
    node.orphan = false;
    if (node.level === LEVELS.MAIN) { node.parentId = null; continue; }
    const parent = nodes.get(node.parentId);
    if (!parent || parent.level !== expectedParentLevel[node.level]) {
      node.orphan = true;
      if (node.level === LEVELS.CATEGORY) node.parentId = PREVIOUS_MAIN_ID;
    }
  }

  const children = new Map();
  const mains = [];
  for (const node of nodes.values()) {
    if (node.level === LEVELS.MAIN) { mains.push(node); continue; }
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }
  mains.sort(compareNodes);
  for (const list of children.values()) list.sort(compareNodes);

  return new Taxonomy(nodes, mains, children);
}

class Taxonomy {
  constructor(nodes, mains, children) {
    this.nodes = nodes;
    this._mains = mains;
    this._children = children;
    this._search = new Map();
  }

  /** A node by id, following nothing. */
  node(id) {
    if (!id || id === UNCATEGORIZED_ID) return null;
    return this.nodes.get(id) || null;
  }

  /** A node by id, following a merge to where its records now live. */
  resolve(id) {
    let node = this.node(id);
    for (let hops = 0; node?.mergedInto && hops < 8; hops += 1) node = this.node(node.mergedInto);
    return node;
  }

  /** Is this node offered for new records? */
  isActive(node) {
    return Boolean(node) && !node.mergedInto && !node.hidden;
  }

  label(nodeOrId, language) {
    const node = typeof nodeOrId === 'string' ? this.node(nodeOrId) : nodeOrId;
    if (!node) return '';
    const l = lang(language);
    if (node.name) {
      // The seeds NAZM wrote in Arabic before the hierarchy read in the
      // current language for as long as the customer has not renamed them.
      if (node.source === 'custom' && SEEDED_NAME.get(node.id) === node.name && hasMessage(`category.${node.id}`)) {
        return l === getLanguage() ? t(`category.${node.id}`) : translateIn(l, `category.${node.id}`);
      }
      return node.name;
    }
    if (node.builtin) return node.builtin.labels[l];
    return '';
  }

  /** The built-in label, ignoring a display name the customer set. */
  defaultLabel(node, language) {
    return node?.builtin ? node.builtin.labels[lang(language)] : '';
  }

  icon(nodeOrId) {
    const node = typeof nodeOrId === 'string' ? this.node(nodeOrId) : nodeOrId;
    if (!node) return '📦';
    if (node.icon) return node.icon;
    const main = node.level === LEVELS.MAIN ? node : this.mainOf(node);
    return main?.icon || '📦';
  }

  mainOf(node) {
    if (!node) return null;
    if (node.level === LEVELS.MAIN) return node;
    if (node.level === LEVELS.CATEGORY) return this.node(node.parentId);
    return this.mainOf(this.node(node.parentId));
  }

  children(parentId) {
    return this._children.get(parentId) || [];
  }

  /**
   * Main Categories in the customer's order.
   * @param {{includeHidden?: boolean, keep?: string[]}} [options] `keep` are
   *   ids shown even when hidden — the value a record already has.
   */
  mainCategories({ includeHidden = false, keep = [] } = {}) {
    return this._mains.filter((node) => {
      if (keep.includes(node.id)) return true;
      if (node.mergedInto) return false;
      if (node.builtin?.onlyWhenUsed && !this.children(node.id).some((c) => !c.mergedInto)) return false;
      return includeHidden || !node.hidden;
    });
  }

  categories(mainId, { includeHidden = false, keep = [] } = {}) {
    return this.children(mainId).filter((node) => node.level === LEVELS.CATEGORY
      && (keep.includes(node.id) || (!node.mergedInto && (includeHidden || !node.hidden))));
  }

  subcategories(categoryId, { includeHidden = false, keep = [] } = {}) {
    return this.children(categoryId).filter((node) => node.level === LEVELS.SUB
      && (keep.includes(node.id) || (!node.mergedInto && (includeHidden || !node.hidden))));
  }

  /** Every Category, across Main Categories — the flat list some screens still need. */
  allCategories({ includeHidden = true } = {}) {
    const out = [];
    for (const main of this._mains) out.push(...this.categories(main.id, { includeHidden }));
    return out;
  }

  /** The customer's own nodes, and the built-ins they changed: what a backup carries. */
  storedNodes() {
    return [...this.nodes.values()].filter((node) => node.record);
  }

  customNodes() {
    return [...this.nodes.values()].filter((node) => node.source === 'custom');
  }

  /**
   * An item's classification, resolved: merged nodes followed, the Main
   * Category derived from the Category when the record does not carry one.
   * @returns {{main: object|null, category: object|null, sub: object|null}}
   */
  path(item) {
    if (!item) return { main: null, category: null, sub: null };
    const category = this.resolve(item.categoryId);
    let main = null;
    let sub = null;
    if (category?.level === LEVELS.MAIN) {
      // A seed as broad as a Main Category («المعدات») resolves to one.
      main = category;
    } else {
      main = (category && this.mainOf(category)) || this.resolve(item.mainCategoryId);
      if (main && main.level !== LEVELS.MAIN) main = null;
      const candidate = this.resolve(item.subcategoryId);
      if (candidate?.level === LEVELS.SUB && category && candidate.parentId === category.id) sub = candidate;
    }
    return { main, category: category?.level === LEVELS.CATEGORY ? category : null, sub };
  }

  /** «معدات وأدوات › مولدات › مولدات ديزل», without the empty levels. */
  breadcrumb(item, language) {
    const { main, category, sub } = this.path(item);
    return [main, category, sub].filter(Boolean).map((node) => this.label(node, language)).join(' › ');
  }

  /** The one label a list card shows: the Category, or the Main Category when that is all there is. */
  primaryLabel(item, language) {
    const { main, category } = this.path(item);
    return this.label(category || main, language);
  }

  /** Is this record classified at all? */
  isClassified(item) {
    const { main, category } = this.path(item);
    return Boolean(main || category);
  }

  /**
   * The words a search should find a record by: its path's labels in both
   * languages and their aliases.
   */
  searchWords(item) {
    const { main, category, sub } = this.path(item);
    return [main, category, sub].filter(Boolean).map((node) => this.searchText(node)).join(' ');
  }

  /** A node's normalised search text, built once. */
  searchText(node) {
    let text = this._search.get(node.id);
    if (text === undefined) {
      text = normalizeArabic([
        node.name, node.builtin?.labels.ar, node.builtin?.labels.en,
        node.name && this.label(node, 'ar'), node.name && this.label(node, 'en'),
        ...node.aliases.ar, ...node.aliases.en,
      ].filter(Boolean).join(' '));
      this._search.set(node.id, text);
    }
    return text;
  }

  /**
   * Nodes whose names or aliases contain every word of the query, Arabic or
   * English, whatever the interface language.
   * @param {{level?: string, parentId?: string, includeHidden?: boolean}} [scope]
   */
  search(query, { level = null, parentId = null, includeHidden = false } = {}) {
    const terms = normalizeArabic(query).split(' ').filter(Boolean);
    let pool;
    if (parentId) pool = this.children(parentId);
    else if (level === LEVELS.MAIN) pool = this._mains;
    else pool = [...this.nodes.values()];
    return pool.filter((node) => {
      if (level && node.level !== level) return false;
      if (node.mergedInto) return false;
      if (!includeHidden && node.hidden) return false;
      if (node.builtin?.onlyWhenUsed && !this.children(node.id).length) return false;
      if (!terms.length) return true;
      const text = this.searchText(node);
      return terms.every((term) => text.includes(term));
    });
  }

  /**
   * The node a word names exactly — a label in either language, or an alias —
   * for the spreadsheet import and the assistant. Returns every candidate; one
   * candidate is a safe mapping, several are not.
   */
  findByName(name, { level = null, parentId = null } = {}) {
    const wanted = normalizeLabel(name);
    if (!wanted) return [];
    const pool = parentId ? this.children(parentId) : [...this.nodes.values()];
    const found = [];
    for (const node of pool) {
      if (level && node.level !== level) continue;
      if (node.mergedInto) continue;
      if (node.builtin?.onlyWhenUsed && !this.children(node.id).length) continue;
      const names = [node.name, node.builtin?.labels.ar, node.builtin?.labels.en,
        node.name && this.label(node, 'ar'), node.name && this.label(node, 'en'),
        ...node.aliases.ar, ...node.aliases.en];
      if (names.some((candidate) => candidate && normalizeLabel(candidate) === wanted)) found.push(node);
    }
    return found;
  }

  /**
   * Would a new node with this name duplicate a sibling? Case-insensitive in
   * English, letter-form and whitespace-insensitive in Arabic. A different
   * parent is a different place: «أخرى» exists under every Main Category.
   */
  duplicateOf(name, { level, parentId = null, exceptId = null }) {
    const wanted = normalizeLabel(name);
    if (!wanted) return null;
    const pool = level === LEVELS.MAIN ? this._mains : this.children(parentId);
    return pool.find((node) => node.id !== exceptId && node.level === level && !node.mergedInto
      && [node.name, node.builtin?.labels.ar, node.builtin?.labels.en, this.label(node)]
        .some((candidate) => candidate && normalizeLabel(candidate) === wanted)) || null;
  }

  /**
   * The canonical form of a classification, or why it is not one.
   *
   * Rules: a Category must sit under the Main Category given (and supplies it
   * when none is); a Subcategory must sit under the Category given; nothing
   * below a missing level. A merged node is followed to where it went.
   *
   * @returns {{ok: true, value: {mainCategoryId, categoryId, subcategoryId}} |
   *           {ok: false, error: string}}
   */
  check({ mainCategoryId = null, categoryId = null, subcategoryId = null } = {}) {
    const noCategory = !categoryId || categoryId === UNCATEGORIZED_ID;
    let main = mainCategoryId ? this.resolve(mainCategoryId) : null;
    if (mainCategoryId && (!main || main.level !== LEVELS.MAIN)) return { ok: false, error: 'taxonomy.error.unknown' };

    if (noCategory) {
      if (subcategoryId) return { ok: false, error: 'taxonomy.error.subWithoutCategory' };
      return { ok: true, value: { mainCategoryId: main?.id || null, categoryId: UNCATEGORIZED_ID, subcategoryId: null } };
    }

    const category = this.resolve(categoryId);
    if (!category) return { ok: false, error: 'taxonomy.error.unknown' };
    if (category.level === LEVELS.MAIN) {
      // Only a retired seed resolves to a Main Category.
      if (main && main.id !== category.id) return { ok: false, error: 'taxonomy.error.categoryMismatch' };
      return { ok: true, value: { mainCategoryId: category.id, categoryId: UNCATEGORIZED_ID, subcategoryId: null } };
    }
    if (category.level !== LEVELS.CATEGORY) return { ok: false, error: 'taxonomy.error.unknown' };
    const parent = this.mainOf(category);
    if (main && parent && main.id !== parent.id) return { ok: false, error: 'taxonomy.error.categoryMismatch' };
    main = parent;

    let sub = null;
    if (subcategoryId) {
      sub = this.resolve(subcategoryId);
      if (!sub || sub.level !== LEVELS.SUB) return { ok: false, error: 'taxonomy.error.unknown' };
      if (sub.parentId !== category.id) return { ok: false, error: 'taxonomy.error.subMismatch' };
    }
    return { ok: true, value: { mainCategoryId: main?.id || null, categoryId: category.id, subcategoryId: sub?.id || null } };
  }

  isValidClassification(mainCategoryId, categoryId, subcategoryId) {
    return this.check({ mainCategoryId, categoryId, subcategoryId }).ok;
  }

  /**
   * The fields a Category recommends, in order: the built-in template (the
   * Category's own, or its Main Category's), then fields the customer saved
   * to the Main Category, then those saved to the Category, then to the
   * Subcategory. Each id once.
   */
  fieldsFor({ mainCategoryId = null, categoryId = null, subcategoryId = null } = {}) {
    const { main, category, sub } = this.path({ mainCategoryId, categoryId, subcategoryId });
    let template = null;
    if (category) template = category.template !== undefined ? category.template : main?.template ?? null;
    else if (main) template = main.template ?? null;
    const out = [];
    const seen = new Set();
    const push = (def) => {
      if (def && !seen.has(def.id)) { seen.add(def.id); out.push(def); }
    };
    for (const id of templateFieldIds(template)) push(FIELDS.get(id));
    for (const node of [main, category, sub]) for (const def of node?.fields || []) push(def);
    return out;
  }

  /** Where the customer's own field definitions for a node are kept. */
  savedFields(nodeId) {
    return this.node(nodeId)?.fields || [];
  }
}

/** Every field definition a record can refer to — for showing values whose
 *  field no longer applies («حقول سابقة»). */
export function definitionFor(fieldId, { taxonomy, item } = {}) {
  const builtin = FIELDS.get(fieldId);
  if (builtin) return builtin;
  const own = (item?.customFieldDefs || []).find((def) => def.id === fieldId);
  if (own) return own;
  if (taxonomy) {
    for (const node of taxonomy.nodes.values()) {
      const saved = node.fields.find((def) => def.id === fieldId);
      if (saved) return saved;
    }
  }
  return null;
}

/**
 * The most of a classification that fits the hierarchy, for data that must
 * not be refused outright — an import row, a restored record. Tried in order:
 * as given; without the Subcategory; the Category alone (its Main Category
 * derived); the Main Category alone; nothing.
 *
 * @returns {{value: {mainCategoryId, categoryId, subcategoryId}, exact: boolean}}
 */
export function reconcileClassification(taxonomy, item) {
  const attempts = [
    { mainCategoryId: item.mainCategoryId, categoryId: item.categoryId, subcategoryId: item.subcategoryId },
    { mainCategoryId: item.mainCategoryId, categoryId: item.categoryId },
    { categoryId: item.categoryId },
    { mainCategoryId: item.mainCategoryId },
  ];
  for (const [index, attempt] of attempts.entries()) {
    const result = taxonomy.check(attempt);
    if (result.ok) return { value: result.value, exact: index === 0 };
  }
  return { value: { mainCategoryId: null, categoryId: UNCATEGORIZED_ID, subcategoryId: null }, exact: false };
}
