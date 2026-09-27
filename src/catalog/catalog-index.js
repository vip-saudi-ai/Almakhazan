// An in-memory index over a set of catalog entities: lookups by id, by parent
// and entity type, by ancestor, and a folded search index — built once per
// set, so a keystroke never walks every model of every brand.
//
// The same index serves the bundled catalog and the customer's own entries;
// a cloud provider would answer the same questions from a server instead.

import { compactKey, entityKeys, searchKey } from './model.js';

/** How a result matched, strongest first. Recency and frequency only break ties. */
export const MATCH = Object.freeze({
  EXACT: 100,
  EXACT_ALIAS: 95,
  EXACT_CODE: 92,
  PREFIX: 80,
  CODE_PREFIX: 75,
  ALIAS_PREFIX: 70,
  CONTAINS: 60,
  ALIAS_CONTAINS: 50,
  CODE_CONTAINS: 45,
});

export class CatalogIndex {
  constructor() {
    this.byId = new Map();
    this.byParentType = new Map();
    this.byAncestorType = new Map();
    this.byDomainType = new Map();
    this.keys = new Map();
  }

  add(entity) {
    if (this.byId.has(entity.id)) return;
    this.byId.set(entity.id, entity);
    this.keys.set(entity.id, entityKeys(entity));
    const push = (map, key) => {
      const list = map.get(key);
      if (list) list.push(entity); else map.set(key, [entity]);
    };
    push(this.byParentType, `${entity.parentId || ''}|${entity.entityType}`);
    for (const domain of entity.domains) push(this.byDomainType, `${domain}|${entity.entityType}`);
    // Every ancestor: a reference is found under its brand as well as under
    // its collection, so a customer who skipped a level is not stuck.
    let parent = entity.parentId ? this.byId.get(entity.parentId) : null;
    const seen = new Set();
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      push(this.byAncestorType, `${parent.id}|${entity.entityType}`);
      parent = parent.parentId ? this.byId.get(parent.parentId) : null;
    }
  }

  /** Adds entities parents-first, so ancestor links resolve. */
  addAll(entities) {
    const pending = [...entities];
    const known = (e) => !e.parentId || this.byId.has(e.parentId) || !pending.some((p) => p.id === e.parentId);
    let guard = pending.length + 1;
    while (pending.length && guard-- > 0) {
      for (let i = 0; i < pending.length;) {
        if (known(pending[i])) this.add(pending.splice(i, 1)[0]); else i += 1;
      }
    }
    for (const entity of pending) this.add(entity);
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  /** The candidates for a picker level: children of a parent, descendants of an ancestor, or a whole domain level. */
  pool({ domain, entityType, types, parentId, ancestorId }) {
    const wanted = types || [entityType];
    const out = [];
    for (const type of wanted) {
      let list;
      if (parentId) list = this.byParentType.get(`${parentId}|${type}`);
      else if (ancestorId) list = this.byAncestorType.get(`${ancestorId}|${type}`);
      else list = this.byDomainType.get(`${domain}|${type}`);
      if (list) out.push(...list);
    }
    return domain ? out.filter((e) => e.domains.includes(domain)) : out;
  }

  /** The strength of a match, or 0. */
  score(entity, query, compact) {
    const k = this.keys.get(entity.id);
    if (!k) return 0;
    let best = 0;
    for (const name of k.names) {
      if (name === query) return MATCH.EXACT;
      if (name.startsWith(query)) best = Math.max(best, MATCH.PREFIX);
      else if (query.length >= 3 && name.includes(query)) best = Math.max(best, MATCH.CONTAINS);
    }
    for (const alias of k.aliases) {
      if (alias === query) best = Math.max(best, MATCH.EXACT_ALIAS);
      else if (alias.startsWith(query)) best = Math.max(best, MATCH.ALIAS_PREFIX);
      else if (query.length >= 3 && alias.includes(query)) best = Math.max(best, MATCH.ALIAS_CONTAINS);
    }
    if (compact.length >= 2) {
      for (const code of k.codes) {
        if (code === compact) best = Math.max(best, MATCH.EXACT_CODE);
        else if (code.startsWith(compact)) best = Math.max(best, MATCH.CODE_PREFIX);
        else if (compact.length >= 3 && code.includes(compact)) best = Math.max(best, MATCH.CODE_CONTAINS);
      }
    }
    return best;
  }
}

/**
 * Ranks entities against a query. `scoreOf(entity, folded, compact)` is the
 * match strength (0 = no match) from whichever index holds the entity.
 * `usage` maps an id to {recent: rank (0 = most recent), count} and only
 * orders results of equal match strength.
 */
export function rank(scoreOf, entities, query, usage = new Map()) {
  const q = searchKey(query);
  const compact = compactKey(query);
  const scored = [];
  for (const entity of entities) {
    const score = q ? scoreOf(entity, q, compact) : 1;
    if (score > 0) scored.push({ entity, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ua = usage.get(a.entity.id);
    const ub = usage.get(b.entity.id);
    const ra = ua?.recent ?? Infinity;
    const rb = ub?.recent ?? Infinity;
    if (ra !== rb) return ra - rb;
    const ca = ua?.count || 0;
    const cb = ub?.count || 0;
    if (ca !== cb) return cb - ca;
    return a.entity.sortKey < b.entity.sortKey ? -1 : a.entity.sortKey > b.entity.sortKey ? 1 : 0;
  });
  return scored;
}
