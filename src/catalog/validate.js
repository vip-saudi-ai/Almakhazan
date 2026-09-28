// Static checks on catalog data — run by the unit tests on the bundled
// catalog, and usable on any catalog version a cloud provider serves before
// it is trusted:
//
//   unique ids · every parent exists · no cycles · each entity type belongs to
//   its domains · aliases are strings · no two entries with the same name
//   under the same parent · ids are well-formed and never in the customer's
//   namespace
//
// Reference numbers are checked as text only: an unusual but real reference
// is not rejected by a pattern that thinks it knows better.

import { DOMAINS, isCatalogId, isCustomCatalogId, normalizeCatalogEntity, searchKey } from './model.js';

export function validateCatalogData(rows, { allowCustom = false } = {}) {
  const errors = [];
  const byId = new Map();
  for (const raw of rows) {
    const entity = normalizeCatalogEntity(raw);
    if (!entity) { errors.push(`invalid entity ${raw?.id}`); continue; }
    if (!isCatalogId(entity.id)) errors.push(`bad id ${entity.id}`);
    if (!allowCustom && isCustomCatalogId(entity.id)) errors.push(`built-in id in the customer namespace: ${entity.id}`);
    if (byId.has(entity.id)) errors.push(`duplicate id ${entity.id}`);
    byId.set(entity.id, entity);
    for (const domain of entity.domains) {
      if (!DOMAINS[domain]?.types.includes(entity.entityType)) errors.push(`${entity.id}: ${entity.entityType} is not a ${domain} type`);
    }
    for (const alias of [...(raw.aliasesEn || []), ...(raw.aliasesAr || [])]) {
      if (typeof alias !== 'string' || !alias.trim()) errors.push(`${entity.id}: empty alias`);
    }
    if (entity.entityType === 'reference' && !String(entity.nameEn || entity.code || '').trim()) errors.push(`${entity.id}: reference without text`);
  }
  const names = new Map();
  for (const entity of byId.values()) {
    if (entity.parentId) {
      const parent = byId.get(entity.parentId);
      if (!parent) errors.push(`${entity.id}: parent ${entity.parentId} missing`);
      else if (!parent.domains.some((d) => entity.domains.includes(d))) errors.push(`${entity.id}: parent in another domain`);
    }
    // No cycles.
    const seen = new Set([entity.id]);
    let cursor = entity.parentId ? byId.get(entity.parentId) : null;
    while (cursor) {
      if (seen.has(cursor.id)) { errors.push(`${entity.id}: cycle`); break; }
      seen.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    const key = `${entity.parentId || ''}|${entity.entityType}|${entity.domains.join(',')}|${searchKey(entity.nameEn || entity.nameAr)}`;
    if (names.has(key)) errors.push(`${entity.id}: same name as ${names.get(key)} under the same parent`);
    else names.set(key, entity.id);
  }
  return { ok: errors.length === 0, errors, count: byId.size };
}
