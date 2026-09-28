// The bundled NAZM catalog, assembled on demand.
//
// Each group of data is expanded into entities and indexed the first time a
// domain that needs it is used — the Add Item sheet opening costs nothing;
// choosing «ساعات» builds the watch brands; opening a brand or typing a search
// builds that domain's collections and references. Nothing is fetched.

import { row } from './model.js';
import { CatalogIndex } from './catalog-index.js';
import { watchBrands, watchDetails } from './data/watches.js';
import { vehicleMakes } from './data/vehicles.js';
import { industrialMakers } from './data/industrial.js';
import { electronicsBrands, labManufacturers } from './data/devices.js';
import { artists, fashionHouses, furnitureMakers, gemLaboratories, gemTypes, jewelleryHouses } from './data/collectibles.js';

/** A stable id fragment from a label: lowercase ASCII, digits and underscores. */
export function slugOf(text) {
  return String(text).replace(/\+/g, ' plus ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'x';
}

const GROUPS = {
  watchBrands() {
    return watchBrands().map(([slug, en, ar, aliases]) => row('watch', 'brand', null, [`watch_brand_${slug}`, en, ar, aliases]));
  },
  watchDetails() {
    const out = [];
    const walk = (brandSlug, parentId, nodes) => {
      for (const node of nodes) {
        if (typeof node === 'string') {
          out.push(row('watch', 'reference', parentId, [`watch_ref_${brandSlug}_${slugOf(node)}`, node, '', [], { code: node }]));
          continue;
        }
        const prefix = node.kind === 'model' ? 'watch_model' : 'watch_col';
        const id = `${prefix}_${brandSlug}_${node.slug}`;
        out.push(row('watch', node.kind, parentId, [id, node.nameEn, node.ar, node.aliases]));
        walk(brandSlug, id, node.children);
      }
    };
    for (const [brandSlug, nodes] of Object.entries(watchDetails())) walk(brandSlug, `watch_brand_${brandSlug}`, nodes);
    return out;
  },
  vehicles() {
    const out = [];
    for (const [slug, en, ar, aliases, models] of vehicleMakes()) {
      const id = `vehicle_make_${slug}`;
      out.push(row('vehicle', 'manufacturer', null, [id, en, ar, aliases]));
      for (const [name, nameAr, modelAliases] of models) {
        out.push(row('vehicle', 'model', id, [`vehicle_model_${slug}_${slugOf(name)}`, name, nameAr, modelAliases]));
      }
    }
    return out;
  },
  industrial() {
    const out = [];
    for (const [slug, en, ar, aliases, domains, models] of industrialMakers()) {
      const id = `mfr_${slug}`;
      out.push(row(domains, 'manufacturer', null, [id, en, ar, aliases]));
      // Tools brands are «brand», not «manufacturer», in their domain's words;
      // the entity type is shared and the field's label says which.
      for (const [name, machineType] of models) {
        out.push(row('machinery', 'model', id, [`mfr_model_${slug}_${slugOf(name)}`, name, '', [], { code: name, metadata: { machineType } }]));
      }
    }
    return out;
  },
  electronics() {
    return families('electronics', 'brand', 'electronics', electronicsBrands());
  },
  lab() {
    return families('lab', 'manufacturer', 'lab', labManufacturers());
  },
  collectibles() {
    const out = [];
    for (const [slug, en, ar, aliases, collections] of jewelleryHouses()) {
      const id = `jewel_brand_${slug}`;
      out.push(row('jewellery', 'brand', null, [id, en, ar, aliases]));
      for (const name of collections) out.push(row('jewellery', 'collection', id, [`jewel_col_${slug}_${slugOf(name)}`, name, '', []]));
    }
    for (const [slug, en, ar, aliases, varieties] of gemTypes()) {
      const id = `gem_${slug}`;
      out.push(row('gem', 'type', null, [id, en, ar, aliases]));
      for (const [name, nameAr, vAliases] of varieties) out.push(row('gem', 'variety', id, [`gem_${slug}_${slugOf(name)}`, name, nameAr, vAliases]));
    }
    for (const [slug, en, ar, aliases] of gemLaboratories()) out.push(row('gem_lab', 'laboratory', null, [`gemlab_${slug}`, en, ar, aliases]));
    for (const [slug, en, ar, aliases] of artists()) out.push(row('art', 'artist', null, [`artist_${slug}`, en, ar, aliases]));
    for (const [slug, en, ar, aliases] of furnitureMakers()) out.push(row('furniture', 'maker', null, [`furniture_${slug}`, en, ar, aliases]));
    for (const [slug, en, ar, aliases] of fashionHouses()) out.push(row('fashion', 'brand', null, [`fashion_${slug}`, en, ar, aliases]));
    return out;
  },
};

function families(domain, topType, prefix, list) {
  const out = [];
  for (const [slug, en, ar, aliases, fams] of list) {
    const id = `${prefix}_${topType}_${slug}`;
    out.push(row(domain, topType, null, [id, en, ar, aliases]));
    for (const [family, models, famAliases = []] of fams || []) {
      const familyId = `${prefix}_family_${slug}_${slugOf(family)}`;
      out.push(row(domain, 'family', id, [familyId, family, '', famAliases]));
      // A model is its public name, or [name, aliases] when people write it
      // differently («i50» for the Nicolet iS50).
      for (const entry of models) {
        const [model, modelAliases = []] = Array.isArray(entry) ? entry : [entry];
        out.push(row(domain, 'model', familyId, [`${prefix}_model_${slug}_${slugOf(model)}`, model, '', modelAliases, { code: model }]));
      }
    }
  }
  return out;
}

/** Every bundled row, un-indexed — for validation. */
export function builtinRows() {
  return Object.values(GROUPS).flatMap((group) => group());
}

/** The rows of one lazily loaded group (the Flutter asset generator reads these). */
export function builtinGroupRows(name) {
  return GROUPS[name] ? GROUPS[name]() : [];
}

/** Which groups a domain needs, and which of them wait for a deeper look. */
export const DOMAIN_GROUPS = {
  watch: { first: ['watchBrands'], deep: ['watchDetails'] },
  vehicle: { first: ['vehicles'] },
  machinery: { first: ['industrial'] },
  forklift: { first: ['industrial'] },
  crane: { first: ['industrial'] },
  generator: { first: ['industrial'] },
  pump: { first: ['industrial'] },
  compressor: { first: ['industrial'] },
  tools: { first: ['industrial'] },
  parts: { first: ['industrial'] },
  electronics: { first: ['electronics'] },
  lab: { first: ['lab'] },
  jewellery: { first: ['collectibles'] },
  gem: { first: ['collectibles'] },
  gem_lab: { first: ['collectibles'] },
  art: { first: ['collectibles'] },
  furniture: { first: ['collectibles'] },
  fashion: { first: ['collectibles'] },
};

/** Every id prefix the bundled catalog uses — a customer entry can never take one. */
export const BUILTIN_ID_PREFIXES = Object.freeze([
  'watch_', 'vehicle_', 'mfr_', 'electronics_', 'lab_', 'jewel_', 'gem_', 'gemlab_', 'artist_', 'furniture_', 'fashion_',
]);

/**
 * The bundled catalog behind one index. `ensure(domain, {deep})` builds what
 * a domain needs; `loadAll()` builds everything (tests, validation, and a
 * lookup by id of something not yet seen).
 */
export class BuiltinCatalog {
  constructor() {
    this.index = new CatalogIndex();
    this.loaded = new Set();
  }

  load(group) {
    if (this.loaded.has(group)) return;
    this.loaded.add(group);
    this.index.addAll(GROUPS[group]());
  }

  ensure(domain, { deep = false } = {}) {
    const plan = DOMAIN_GROUPS[domain];
    if (!plan) return;
    for (const group of plan.first) this.load(group);
    if (deep) for (const group of plan.deep || []) this.load(group);
  }

  loadAll() {
    for (const group of Object.keys(GROUPS)) this.load(group);
  }

  /** An entity by id, building only the group its prefix belongs to. */
  get(id) {
    const hit = this.index.get(id);
    if (hit) return hit;
    const group = groupForId(id);
    if (group && !this.loaded.has(group)) {
      if (group === 'watchDetails') this.load('watchBrands');
      this.load(group);
      return this.index.get(id);
    }
    return null;
  }

  groupsLoaded() {
    return [...this.loaded];
  }
}

function groupForId(id) {
  if (id.startsWith('watch_brand_')) return 'watchBrands';
  if (id.startsWith('watch_')) return 'watchDetails';
  if (id.startsWith('vehicle_')) return 'vehicles';
  if (id.startsWith('mfr_')) return 'industrial';
  if (id.startsWith('electronics_')) return 'electronics';
  if (id.startsWith('lab_')) return 'lab';
  if (/^(jewel_|gem_|gemlab_|artist_|furniture_|fashion_)/.test(id)) return 'collectibles';
  return null;
}
