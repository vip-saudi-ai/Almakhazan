// Generates the Flutter app's reference data from the HTML/JavaScript app —
// the golden functional reference — so the two cannot drift apart while the
// migration is in progress.
//
//   node nazm_flutter/tool/export_reference.mjs
//
// Writes:
//   lib/l10n/app_en.arb, lib/l10n/app_ar.arb   every UI string (ICU plurals)
//   lib/l10n/reference_keys.json               reference key → ARB key
//   assets/catalog/index.json                  versions, domains, groups
//   assets/catalog/<group>.json                built-in catalog rows per lazily loaded group
//   assets/taxonomy/taxonomy.json              built-in taxonomy, fields, templates, units
//
// Nothing here is hand-edited; change the reference and run it again.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const reference = join(app, '..', 'src');

// The reference expects a browser; nothing it needs for data does.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { MESSAGES } = await import(join(reference, 'locales/index.js'));
const builtin = await import(join(reference, 'catalog/builtin.js'));
const model = await import(join(reference, 'catalog/model.js'));
const { validateCatalogData } = await import(join(reference, 'catalog/validate.js'));
const taxonomy = await import(join(reference, 'locales/taxonomy-catalog.js'));
const config = await import(join(reference, 'config.js'));

const write = (path, data) => {
  const full = join(app, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, typeof data === 'string' ? data : `${JSON.stringify(data, null, 1)}\n`);
  return full;
};

// ── strings → ARB ──────────────────────────────────────────────────────────

const DART_RESERVED = new Set(['abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'do', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'if', 'in', 'is', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'var', 'void', 'while', 'with']);

function arbKey(key) {
  const parts = key.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let out = parts.map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1))).join('');
  if (!/^[a-z]/.test(out)) out = `k${out.charAt(0).toUpperCase()}${out.slice(1)}`;
  if (DART_RESERVED.has(out)) out = `${out}Text`;
  return out;
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const placeholdersOf = (text) => [...String(text).matchAll(PLACEHOLDER)].map((m) => m[1]);

/** One language's value as an ICU message; plural objects become `{count, plural, …}`. */
function icu(value) {
  if (typeof value === 'string') return value;
  const forms = ['zero', 'one', 'two', 'few', 'many', 'other']
    .filter((form) => value[form] != null)
    .map((form) => `${form === 'zero' ? '=0' : form}{${value[form]}}`);
  return `{count, plural, ${forms.join(' ')}}`;
}

const en = { '@@locale': 'en' };
const ar = { '@@locale': 'ar' };
const keyMap = {};
const seen = new Map();
for (const [key, value] of Object.entries(MESSAGES).sort(([a], [b]) => a.localeCompare(b))) {
  const name = arbKey(key);
  if (seen.has(name)) throw new Error(`ARB key collision: ${key} and ${seen.get(name)} → ${name}`);
  seen.set(name, key);
  keyMap[key] = name;
  const variants = [value.en, value.ar];
  const plural = variants.some((v) => v && typeof v === 'object');
  const names = new Set();
  for (const v of variants) {
    if (v == null) continue;
    for (const text of typeof v === 'string' ? [v] : Object.values(v)) placeholdersOf(text).forEach((p) => names.add(p));
  }
  if (plural) names.add('count');
  en[name] = icu(value.en ?? value.ar ?? '');
  ar[name] = icu(value.ar ?? value.en ?? '');
  const meta = { description: `Reference key: ${key}` };
  if (names.size) {
    meta.placeholders = Object.fromEntries([...names].sort().map((p) => [p, { type: p === 'count' && plural ? 'num' : 'Object' }]));
  }
  en[`@${name}`] = meta;
}
write('lib/l10n/app_en.arb', en);
write('lib/l10n/app_ar.arb', ar);
write('lib/l10n/reference_keys.json', keyMap);

// ── catalog → assets ───────────────────────────────────────────────────────

const rows = builtin.builtinRows();
const check = validateCatalogData(rows);
if (!check.ok) throw new Error(`catalog invalid: ${check.errors.slice(0, 5).join('; ')}`);
const groups = {};
for (const plan of Object.values(builtin.DOMAIN_GROUPS)) {
  for (const name of [...(plan.first || []), ...(plan.deep || [])]) groups[name] ??= builtin.builtinGroupRows(name).map(model.normalizeCatalogEntity);
}
let exported = 0;
for (const [name, list] of Object.entries(groups)) {
  write(`assets/catalog/${name}.json`, list);
  exported += list.length;
}
if (exported !== rows.length) throw new Error(`catalog groups hold ${exported} rows, the catalog ${rows.length}`);
write('assets/catalog/index.json', {
  catalogSchemaVersion: model.CATALOG_SCHEMA_VERSION,
  catalogDataVersion: model.BUILTIN_CATALOG_DATA_VERSION,
  domains: model.DOMAINS,
  domainGroups: builtin.DOMAIN_GROUPS,
  groups: Object.fromEntries(Object.entries(groups).map(([name, list]) => [name, { file: `assets/catalog/${name}.json`, count: list.length }])),
  builtinIdPrefixes: builtin.BUILTIN_ID_PREFIXES,
  total: rows.length,
});

// ── taxonomy → asset ───────────────────────────────────────────────────────

write('assets/taxonomy/taxonomy.json', {
  taxonomySchemaVersion: config.TAXONOMY_SCHEMA_VERSION,
  uncategorizedId: config.UNCATEGORIZED_ID,
  conditions: config.CONDITIONS,
  mainCategories: taxonomy.MAIN_CATEGORIES,
  previousMain: taxonomy.PREVIOUS_MAIN,
  legacyCategoryMap: taxonomy.LEGACY_CATEGORY_MAP,
  fieldUnits: taxonomy.FIELD_UNITS,
  fieldDefinitions: taxonomy.FIELD_DEFINITIONS,
  fieldTemplates: taxonomy.FIELD_TEMPLATES,
  onboardingMainCategories: taxonomy.ONBOARDING_MAIN_CATEGORIES,
});

console.log(`strings ${Object.keys(keyMap).length} · catalog ${rows.length} in ${Object.keys(groups).length} groups · main categories ${taxonomy.MAIN_CATEGORIES.length} · field definitions ${taxonomy.FIELD_DEFINITIONS.length}`);
