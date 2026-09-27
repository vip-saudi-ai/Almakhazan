// CatalogService: the one way screens, the import and the restore read the
// catalog — search, children, an entity by id, its path, recently used, and
// the customer's own entries.
//
// Behind it are providers answering the same questions:
//
//   BuiltinCatalogProvider   the bundled NAZM catalog (catalog/builtin.js),
//                            built lazily per domain
//   UserCatalogProvider      the customer's own entries (`source: 'custom'`),
//                            workspace data held by the repository
//   CloudCatalogProvider     a future server catalog — not active while cloud
//                            is off; it will be asked with
//                            {domain, entityType, parentId, query, limit, cursor}
//                            and cached, never downloaded whole
//
// Every method is asynchronous and paginated so a cloud provider can answer
// them without a change to any form. A failure never blocks an item from
// being saved: the picker falls back to what is cached and to manual entry.

import { getLanguage } from '../i18n.js';
import { loadPrefs, savePrefs } from '../local-store.js';
import { repository } from '../repository.js';
import { Feature, isFeatureAvailable } from '../features.js';
import { AppError } from '../utils.js';
import { registerCatalogLabels } from '../field-format.js';
import { BuiltinCatalog } from './builtin.js';
import { CatalogIndex, rank, MATCH } from './catalog-index.js';
import {
  BUILTIN_CATALOG_DATA_VERSION, CATALOG_SCHEMA_VERSION, compactKey, entityLabel, isCatalogId, newCustomCatalogId, searchKey,
} from './model.js';

export const DEFAULT_PAGE = 30;
export const MAX_PAGE = 100;
const USAGE_KEY = 'catalogUsage';
const RECENT_MAX = 8;
const COUNT_MAX = 400;

/** The bundled catalog. */
class BuiltinCatalogProvider {
  constructor() { this.catalog = new BuiltinCatalog(); }
  get index() { return this.catalog.index; }
  prepare(domain, options) { this.catalog.ensure(domain, options); }
  get(id) { return this.catalog.get(id); }
  version() { return BUILTIN_CATALOG_DATA_VERSION; }
}

/** The customer's own entries, re-indexed whenever the repository's list changes. */
class UserCatalogProvider {
  constructor() { this.source = null; this.cached = new CatalogIndex(); }
  get index() {
    const list = repository.catalogEntities?.() || [];
    if (list !== this.source) {
      this.source = list;
      this.cached = new CatalogIndex();
      this.cached.addAll(list);
    }
    return this.cached;
  }
  prepare() {}
  get(id) { return this.index.get(id); }
}

/**
 * The future NAZM Cloud catalog. Inactive in 1.0: `active` is false while the
 * cloud feature is off, and nothing here makes a request. When enabled it
 * answers the same paginated questions from a server, with responses cached
 * by version/ETag, and is consulted after the bundled catalog.
 */
export class CloudCatalogProvider {
  // Requires the cloud feature and a deployed catalog endpoint; neither exists in 1.0.
  get active() { return isFeatureAvailable(Feature.CLOUD) && this.endpoint != null; }
  endpoint = null;
  async search() { return { items: [], nextCursor: null }; }
  async get() { return null; }
}

function encodeCursor(offset) { return `o${offset}`; }
function decodeCursor(cursor) {
  if (cursor == null) return 0;
  const match = /^o(\d{1,6})$/.exec(String(cursor));
  if (!match) throw new AppError('catalog.invalid', { code: 'catalog/invalid-cursor' });
  return Number(match[1]);
}

export class CatalogService {
  constructor() {
    this.builtin = new BuiltinCatalogProvider();
    this.user = new UserCatalogProvider();
    this.cloud = new CloudCatalogProvider();
  }

  /** What version of the catalog this device holds — never APP_VERSION. */
  version() {
    return { schemaVersion: CATALOG_SCHEMA_VERSION, catalogDataVersion: this.builtin.version() };
  }

  label(entity, language = getLanguage()) {
    return entityLabel(entity, language);
  }

  /** An entity by id from any provider; null when no provider knows it. */
  getEntity(id) {
    if (!isCatalogId(id)) return null;
    return this.user.get(id) || this.builtin.get(id);
  }

  /** The entity and its ancestors, root first. */
  path(id) {
    const out = [];
    const seen = new Set();
    let entity = this.getEntity(id);
    while (entity && !seen.has(entity.id)) {
      seen.add(entity.id);
      out.unshift(entity);
      entity = entity.parentId ? this.getEntity(entity.parentId) : null;
    }
    return out;
  }

  /** Whether `id` is `ancestorId` or lies under it. */
  isWithin(id, ancestorId) {
    if (!ancestorId) return true;
    return this.path(id).some((entity) => entity.id === ancestorId);
  }

  /** Scores an entity with the index that holds it. */
  _scorer() {
    return (entity, folded, compact) => (entity.source === 'custom' ? this.user.index : this.builtin.index).score(entity, folded, compact);
  }

  _pool(spec, { includeInactive = false } = {}) {
    const deep = Boolean(spec.query) || Boolean(spec.parentId) || Boolean(spec.ancestorId)
      || (spec.types || [spec.entityType]).some((type) => type !== 'brand' && type !== 'manufacturer');
    this.builtin.prepare(spec.domain, { deep });
    const out = [];
    for (const provider of [this.builtin, this.user]) {
      for (const entity of provider.index.pool(spec)) {
        if (!includeInactive && entity.status !== 'active') continue;
        out.push(entity);
      }
    }
    return out;
  }

  /**
   * One page of catalog entries for a picker level, ranked: exact name, exact
   * alias, begins with, code begins with, contains… recently and frequently
   * used only break ties.
   *
   * @param {{domain: string, entityType?: string, types?: string[],
   *   parentId?: string|null, ancestorId?: string|null, query?: string,
   *   limit?: number, cursor?: string|null}} spec
   * @returns {Promise<{items: Array<{entity, label, path: string[], score}>,
   *   nextCursor: string|null, total: number}>}
   */
  async search(spec) {
    const limit = Math.min(Math.max(1, spec.limit || DEFAULT_PAGE), MAX_PAGE);
    const offset = decodeCursor(spec.cursor);
    const pool = this._pool(spec);
    const rescored = rank(this._scorer(), pool, spec.query || '', this.usage());
    const page = rescored.slice(offset, offset + limit);
    const language = getLanguage();
    return {
      items: page.map(({ entity, score }) => ({
        entity,
        score,
        label: entityLabel(entity, language),
        path: this.path(entity.id).slice(0, -1).map((a) => entityLabel(a, language)),
      })),
      nextCursor: offset + limit < rescored.length ? encodeCursor(offset + limit) : null,
      total: rescored.length,
    };
  }

  /** The entries directly under a parent (or a domain's top level), unranked by text. */
  children({ domain, entityType, parentId = null, limit, cursor }) {
    return this.search({ domain, entityType, parentId, limit, cursor });
  }

  // ── usage: recent and frequent, on this device only ──

  usage() {
    const stored = loadPrefs()[USAGE_KEY];
    const map = new Map();
    const recent = stored?.recent && typeof stored.recent === 'object' ? stored.recent : {};
    for (const list of Object.values(recent)) {
      if (!Array.isArray(list)) continue;
      list.forEach((id, i) => {
        const entry = map.get(id) || {};
        entry.recent = Math.min(entry.recent ?? Infinity, i);
        map.set(id, entry);
      });
    }
    for (const [id, count] of Object.entries(stored?.count || {})) {
      const entry = map.get(id) || {};
      entry.count = Number(count) || 0;
      map.set(id, entry);
    }
    return map;
  }

  /** The entries used most recently at a picker level, newest first. */
  recent({ domain, entityType, parentId = null }) {
    const key = `${domain}|${entityType}|${parentId || ''}`;
    const ids = loadPrefs()[USAGE_KEY]?.recent?.[key];
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => this.getEntity(id)).filter((e) => e && e.status === 'active');
  }

  /** Remembers a choice. Nothing leaves the device; nothing is analytics. */
  recordUse({ domain, entityType, parentId = null }, id) {
    if (!isCatalogId(id)) return;
    const prefs = loadPrefs();
    const usage = prefs[USAGE_KEY] && typeof prefs[USAGE_KEY] === 'object' ? prefs[USAGE_KEY] : {};
    const recent = usage.recent && typeof usage.recent === 'object' ? usage.recent : {};
    const key = `${domain}|${entityType}|${parentId || ''}`;
    recent[key] = [id, ...(Array.isArray(recent[key]) ? recent[key] : []).filter((other) => other !== id)].slice(0, RECENT_MAX);
    const count = usage.count && typeof usage.count === 'object' ? usage.count : {};
    count[id] = (Number(count[id]) || 0) + 1;
    const counts = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, COUNT_MAX);
    savePrefs({ ...prefs, [USAGE_KEY]: { recent, count: Object.fromEntries(counts) } });
  }

  // ── the customer's own entries ──

  /**
   * What already exists under this parent with this name: an exact match by
   * name or alias (never created twice), and similar names (suggested only —
   * two different companies may share a prefix).
   */
  findDuplicates({ domain, entityType, parentId = null, label }) {
    const key = searchKey(label);
    if (!key) return { exact: null, similar: [] };
    const pool = this._pool({ domain, entityType, parentId: parentId || null }, { includeInactive: true })
      .filter((e) => (e.parentId || null) === (parentId || null));
    let exact = null;
    const similar = [];
    for (const entity of pool) {
      const score = this._scorer()(entity, key, compactKey(label));
      if (score >= MATCH.EXACT_CODE && entity.status !== 'retired') { exact ||= entity; continue; }
      if (score >= MATCH.PREFIX || (key.length >= 4 && score >= MATCH.CONTAINS)) similar.push(entity);
    }
    return { exact, similar: similar.slice(0, 5) };
  }

  /**
   * Adds the customer's own entry. An exact existing match is returned instead
   * (`duplicate`); `force` still refuses an exact duplicate but accepts a
   * merely similar name.
   */
  async createCustom({ domain, entityType, parentId = null, label }) {
    const text = String(label || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 160);
    if (!text) throw new AppError('catalog.nameRequired', { code: 'catalog/name-required' });
    const { exact } = this.findDuplicates({ domain, entityType, parentId, label: text });
    if (exact) return { duplicate: exact };
    const arabic = /[\u0600-\u06FF]/.test(text);
    // Kept exactly as typed, in the field matching its script; never translated.
    const entity = await repository.saveCatalogEntity({
      id: newCustomCatalogId(), domains: [domain], entityType, parentId,
      nameAr: arabic ? text : '', nameEn: arabic ? '' : text, source: 'custom', status: 'active', createdAt: Date.now(),
    });
    return { entity };
  }

  /** Renames one of the customer's entries; its id — what items store — never changes. */
  async renameCustom(id, label) {
    const entity = this.user.get(id);
    if (!entity) throw new AppError('catalog.notCustom', { code: 'catalog/not-custom' });
    const text = String(label || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 160);
    if (!text) throw new AppError('catalog.nameRequired', { code: 'catalog/name-required' });
    const arabic = /[\u0600-\u06FF]/.test(text);
    return repository.saveCatalogEntity({ ...entity, nameAr: arabic ? text : '', nameEn: arabic ? '' : text });
  }

  /**
   * Retires one of the customer's entries: no longer offered, still resolvable.
   * Refused while any record — including one in the Trash — points at it.
   */
  async retireCustom(id) {
    const entity = this.user.get(id);
    if (!entity) throw new AppError('catalog.notCustom', { code: 'catalog/not-custom' });
    const inUse = await repository.countCatalogReferences(id);
    if (inUse > 0) return { inUse };
    await repository.saveCatalogEntity({ ...entity, status: 'retired', retiredAt: Date.now() });
    return { retired: true };
  }

  /**
   * A text from a spreadsheet or an older record, matched to the catalog:
   * one exact match → `unique`; several → `ambiguous`; none → `none`. The
   * text itself is always kept by the caller.
   */
  resolveText({ domain, entityType, parentId = null, ancestorId = null, text }) {
    const key = searchKey(text);
    if (!key) return { status: 'none', candidates: [] };
    const compact = compactKey(text);
    const pool = this._pool({ domain, entityType, parentId, ancestorId });
    const score = this._scorer();
    const hits = pool.filter((entity) => score(entity, key, compact) >= MATCH.EXACT_CODE);
    if (hits.length === 1) return { status: 'unique', entity: hits[0], candidates: hits };
    if (hits.length > 1) return { status: 'ambiguous', candidates: hits.slice(0, 5) };
    return { status: 'none', candidates: [] };
  }
}

export const catalogService = new CatalogService();

// Stored selections read in the current language, from the live catalog when
// it knows the id — the snapshot otherwise (field-format.js).
registerCatalogLabels((id, language) => {
  const entity = catalogService.getEntity(id);
  return entity ? entityLabel(entity, language || getLanguage()) : '';
});
