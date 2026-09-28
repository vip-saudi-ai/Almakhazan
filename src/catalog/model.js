// The catalog domain: what a catalog entity is, independent of where it came
// from (the bundled NAZM catalog, a future cloud catalog, or the customer's
// own entries).
//
// A catalog entity is reference data, never inventory: «Rolex», «Daytona»,
// «126500LN», «Caterpillar», «320 GX». An item points at one by id and keeps a
// short display snapshot of its label; the entity itself is never copied into
// the item. Global catalog entries are read-only to customers; the customer's
// own entries (`source: 'custom'`) are workspace data, backed up with it.
//
//   {
//     id, domain(s), entityType, parentId,
//     nameAr, nameEn, aliasesAr, aliasesEn, code,
//     metadata, source: 'catalog' | 'custom',
//     status: 'active' | 'deprecated' | 'retired',
//     redirectTo, sortKey, createdAt, updatedAt
//   }
//
// Ids are stable, language-independent and never reused. A corrected or
// discontinued entry is marked `deprecated` (optionally `redirectTo` its
// replacement) — never deleted — so an item that references it still reads.

import { nameSortKey, normalizeArabic } from '../search.js';

/** The shape of catalog entities. Bumped only when the entity model changes. */
export const CATALOG_SCHEMA_VERSION = 1;

/** The bundled data's own version — independent of APP_VERSION. */
export const BUILTIN_CATALOG_DATA_VERSION = '2026.09.1';

/**
 * Domains and the entity types they use, parents first. `terms` is the
 * domain's own word for its top level (a car has a Manufacturer, a watch a
 * Brand, a painting an Artist).
 */
export const DOMAINS = Object.freeze({
  watch: { types: ['brand', 'collection', 'model', 'reference'] },
  vehicle: { types: ['manufacturer', 'model'] },
  machinery: { types: ['manufacturer', 'model'] },
  forklift: { types: ['manufacturer', 'model'] },
  crane: { types: ['manufacturer', 'model'] },
  generator: { types: ['manufacturer', 'model'] },
  pump: { types: ['manufacturer', 'model'] },
  compressor: { types: ['manufacturer', 'model'] },
  tools: { types: ['manufacturer', 'model'] },
  electronics: { types: ['brand', 'family', 'model'] },
  lab: { types: ['manufacturer', 'family', 'model'] },
  jewellery: { types: ['brand', 'collection'] },
  gem: { types: ['type', 'variety'] },
  gem_lab: { types: ['laboratory'] },
  art: { types: ['artist'] },
  parts: { types: ['manufacturer'] },
  furniture: { types: ['maker'] },
  fashion: { types: ['brand'] },
  author: { types: ['author'] },
  product: { types: ['brand'] },
});

export const ENTITY_TYPES = Object.freeze([...new Set(Object.values(DOMAINS).flatMap((d) => d.types))]);
export const SOURCES = Object.freeze(['catalog', 'custom']);
export const STATUSES = Object.freeze(['active', 'deprecated', 'retired']);

const ID = /^[a-z0-9][a-z0-9_.-]{0,127}$/;
const CUSTOM_PREFIX = 'cust_';

export function isCatalogId(id) {
  return typeof id === 'string' && ID.test(id);
}

export function isCustomCatalogId(id) {
  return isCatalogId(id) && id.startsWith(CUSTOM_PREFIX);
}

/** A new id for a customer's entry: never derived from its label. */
export function newCustomCatalogId() {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${CUSTOM_PREFIX}${Date.now().toString(36)}${random[0].toString(36)}${random[1].toString(36)}`.slice(0, 64);
}

/** The key a label or alias is searched by; the label itself is never changed. */
export function searchKey(text) {
  return normalizeArabic(text || '');
}

/** Codes compared without spaces, dots, slashes or dashes: «126500 LN» = «126500LN», «5711/1A» = «57111a». */
export function compactKey(text) {
  return searchKey(text).replace(/[\s./\-_–]+/g, '');
}

function cleanText(value, max = 160) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function cleanList(list, max = 24) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((entry) => cleanText(entry, 80)).filter(Boolean))].slice(0, max);
}

/**
 * An entity as it may be stored or served, or null when it is not one.
 * Anything unknown is dropped; nothing is invented.
 */
export function normalizeCatalogEntity(raw) {
  if (!raw || typeof raw !== 'object' || !isCatalogId(raw.id)) return null;
  const domains = cleanList(Array.isArray(raw.domains) ? raw.domains : [raw.domain], 8).filter((d) => DOMAINS[d]);
  if (!domains.length) return null;
  if (!ENTITY_TYPES.includes(raw.entityType)) return null;
  const nameEn = cleanText(raw.nameEn);
  const nameAr = cleanText(raw.nameAr);
  if (!nameEn && !nameAr) return null;
  const source = SOURCES.includes(raw.source) ? raw.source : 'catalog';
  const entity = {
    id: raw.id,
    domains,
    entityType: raw.entityType,
    parentId: isCatalogId(raw.parentId) ? raw.parentId : null,
    nameAr,
    nameEn,
    aliasesAr: cleanList(raw.aliasesAr),
    aliasesEn: cleanList(raw.aliasesEn),
    code: cleanText(raw.code, 80) || null,
    metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata) ? { ...raw.metadata } : {},
    source,
    status: STATUSES.includes(raw.status) ? raw.status : 'active',
    redirectTo: isCatalogId(raw.redirectTo) ? raw.redirectTo : null,
    sortKey: nameSortKey(nameEn || nameAr),
  };
  if (source === 'custom') {
    entity.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
    entity.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : entity.createdAt;
    if (raw.retiredAt && Number.isFinite(raw.retiredAt)) entity.retiredAt = raw.retiredAt;
  }
  return entity;
}

/** The label to show, in a language, with the other language as fallback. */
export function entityLabel(entity, language = 'ar') {
  if (!entity) return '';
  // Official Latin spellings are shown as they are; an Arabic name, when the
  // catalog has one, is used in Arabic.
  return language === 'ar' ? (entity.nameAr || entity.nameEn) : (entity.nameEn || entity.nameAr);
}

/** Every string an entity can be found by, folded once. */
export function entityKeys(entity) {
  const names = [entity.nameEn, entity.nameAr].filter(Boolean).map(searchKey);
  const aliases = [...entity.aliasesEn, ...entity.aliasesAr].map(searchKey).filter(Boolean);
  const codes = [entity.code, entity.nameEn].filter(Boolean).map(compactKey).filter((k) => k.length >= 2);
  return { names, aliases, codes };
}

/**
 * Expands a compact data row into an entity. Data modules keep rows short —
 * `[id, nameEn, nameAr?, aliases?, extra?]` — so the bundle stays small and
 * nothing is built until a domain is first used.
 */
export function row(domain, entityType, parentId, [id, nameEn, nameAr = '', aliases = [], extra = {}]) {
  const latin = aliases.filter((a) => !/[\u0600-\u06FF]/.test(a));
  const arabic = aliases.filter((a) => /[\u0600-\u06FF]/.test(a));
  return {
    id,
    domains: Array.isArray(domain) ? domain : [domain],
    entityType,
    parentId,
    nameEn,
    nameAr,
    aliasesEn: latin,
    aliasesAr: arabic,
    code: extra.code || null,
    metadata: extra.metadata || {},
    source: 'catalog',
    status: extra.status || 'active',
    redirectTo: extra.redirectTo || null,
  };
}
