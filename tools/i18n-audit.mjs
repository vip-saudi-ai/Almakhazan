#!/usr/bin/env node
// Translation audit — a development check, never shipped.
//
//   node tools/i18n-audit.mjs          report, exit 1 on any failure
//   node tools/i18n-audit.mjs --json   the same, machine-readable
//
// It checks three things:
//
//   1. Every message has both languages, and the plural forms of each are
//      complete (`other` always present) and carry the same placeholders.
//   2. Every key the code asks for — t('…'), data-i18n="…", data-i18n-attr —
//      exists. Keys built at run time (t(`sort.${mode}`)) are reported as
//      dynamic, with the prefix they must start with.
//   3. Hard-coded Arabic outside the message catalogue, each line classified:
//      stored values and recognisers are allowed, anything else is a leak.
//
// Hard-coded English is not scanned line by line — code, identifiers and
// comments are English — but every string handed to `text:`, `placeholder:`,
// `title:` or `aria-label:` that is a plain English literal is reported.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const asJson = process.argv.includes('--json');

const { MESSAGES } = await import(new URL('../src/locales/index.js', import.meta.url));

// ── 1. the catalogue ───────────────────────────────────────────────────────

const LANGS = ['ar', 'en'];
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const forms = (value) => (value && typeof value === 'object' ? Object.values(value) : [value]);

const catalogue = { total: 0, ar: 0, en: 0, missing: [], placeholderMismatch: [], pluralIncomplete: [] };
for (const [key, entry] of Object.entries(MESSAGES)) {
  catalogue.total += 1;
  for (const lang of LANGS) {
    if (entry[lang] == null || entry[lang] === '') catalogue.missing.push(`${lang}:${key}`);
    else catalogue[lang] += 1;
    if (entry[lang] && typeof entry[lang] === 'object' && entry[lang].other == null) {
      catalogue.pluralIncomplete.push(`${lang}:${key}`);
    }
  }
  if (entry.ar != null && entry.en != null) {
    const want = new Set(forms(entry.ar).flatMap(placeholders));
    const have = new Set(forms(entry.en).flatMap(placeholders));
    const diff = [...want].filter((p) => !have.has(p) && p !== 'count')
      .concat([...have].filter((p) => !want.has(p) && p !== 'count'));
    if (diff.length) catalogue.placeholderMismatch.push(`${key} (${diff.join(', ')})`);
  }
}

// ── 2. keys the code uses ─────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const sources = walk(join(ROOT, 'src')).filter((p) => p.endsWith('.js') && !p.includes(`${join('src', 'locales')}`));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

const used = new Map();       // key -> first place
const dynamic = new Map();    // prefix -> first place
const note = (map, key, where) => { if (!map.has(key)) map.set(key, where); };

for (const path of sources) {
  // Comments are skipped: a usage example in a doc comment is not a usage.
  const text = readFileSync(path, 'utf8').split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  const rel = relative(ROOT, path);
  for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z][\w.\/-]*)'/g)) note(used, m[1], rel);
  for (const m of text.matchAll(/\bt\(\s*`([a-zA-Z][\w.\/-]*)\$\{/g)) note(dynamic, m[1], rel);
  for (const m of text.matchAll(/'data-i18n(?:-attr)?':\s*'([^']+)'/g)) {
    for (const part of m[1].split(';')) {
      const key = part.includes(':') ? part.split(':')[1].trim() : part.trim();
      if (key) note(used, key, rel);
    }
  }
}
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) note(used, m[1], 'index.html');
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
  for (const part of m[1].split(';')) {
    const key = part.split(':')[1]?.trim();
    if (key) note(used, key, 'index.html');
  }
}

// Keys passed around as values (error codes, stage keys, fallback keys) are
// resolved through `t` elsewhere; they count as used when they are literals
// that name an existing key anywhere in the source.
const allSource = sources.map((p) => readFileSync(p, 'utf8')).join('\n') + html;
const referenced = new Set();
for (const key of Object.keys(MESSAGES)) {
  if (allSource.includes(`'${key}'`) || allSource.includes(`"${key}"`) || allSource.includes(`\`${key}\``)) referenced.add(key);
}
const dynamicPrefixes = [...dynamic.keys()];
const unknownKeys = [...used].filter(([key]) => !(key in MESSAGES)).map(([key, where]) => `${key} — ${where}`);
const unusedKeys = Object.keys(MESSAGES).filter((key) => !referenced.has(key)
  && !dynamicPrefixes.some((prefix) => key.startsWith(prefix))
  // Families addressed through a helper by a stored value or code.
  && !/^(error\.|condition\.|unit\.|unitGroup\.|role\.|action\.|currency\.|category\.|location\.|language\.|count\.|time\.)/.test(key));

// ── 3. hard-coded Arabic ─────────────────────────────────────────────────

const ARABIC = /[\u0600-\u06FF]/;
// Lines that may carry Arabic, and why. Each is either data the app stores
// (and must stay identical in every language) or a recogniser for Arabic input.
const ALLOWED = [
  { file: 'src/config.js', why: 'stored values: conditions, units, seeded categories/locations (localised for display by labels.js)' },
  { file: 'src/plans.generated.js', why: 'plan data carrying its own { ar, en } pair' },
  { file: 'src/ask.js', why: 'Arabic question recognisers and example questions (English sets beside them)' },
  { file: 'src/import-mapping.js', why: 'Arabic column-header aliases and condition words (English beside them)' },
  { file: 'src/search.js', why: 'Arabic letter normalisation for search' },
  { file: 'src/utils.js', why: 'Arabic-Indic digit normalisation for input' },
  { file: 'src/money.js', why: 'currency words recognised in typed or imported amounts' },
  { file: 'src/validation.js', why: 'currency and range words recognised in input; the canonical stored unit' },
  { file: 'src/integrity.js', why: 'developer diagnostics from the dev integrity check (console / tests only)' },
  { file: 'src/boot-guard.js', why: 'classic-script boot failure text, bilingual table (runs before modules load)' },
  { file: 'src/brand.js', why: 'the Arabic brand name as a brand asset' },
  { file: 'src/views/item-form.js', why: 'the canonical stored unit and Arabic evidence recognisers' },
];

const arabic = { allowed: [], leaks: [] };
for (const path of sources) {
  const rel = relative(ROOT, path).split('\\').join('/');
  const lines = readFileSync(path, 'utf8').split('\n');
  let inBlock = false;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (inBlock) { if (trimmed.includes('*/')) inBlock = false; return; }
    if (trimmed.startsWith('/*')) { if (!trimmed.includes('*/')) inBlock = true; return; }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    const code = line.replace(/\/\/.*$/, '');
    if (!ARABIC.test(code)) return;
    // A file on the list may hold stored values and recognisers, never a
    // sentence for the screen: Arabic handed to a UI call is a leak anywhere.
    const uiCall = /\b(text|label|title|message|placeholder|reason|confirmLabel)\s*:\s*['`][^'`]*[\u0600-\u06FF]|\b(toast|toastError|AppError|Error)\(\s*['`][^'`]*[\u0600-\u06FF]/;
    // ask.js keeps its example questions as { ar, en } sets side by side,
    // because each example must be a question the parser answers (tested).
    const exampleSet = rel === 'src/ask.js' && /\bexample:/.test(code);
    const rule = uiCall.test(code) && rel !== 'src/boot-guard.js' && !exampleSet ? null : ALLOWED.find((a) => a.file === rel);
    const entry = `${rel}:${index + 1}: ${trimmed.slice(0, 120)}`;
    if (rule) arabic.allowed.push({ entry, why: rule.why });
    else arabic.leaks.push(entry);
  });
}

// Static markup: an element with Arabic text and no data-i18n of its own (or
// on an ancestor span) is text the language switch cannot reach.
const htmlLeaks = [];
html.split('\n').forEach((line, index) => {
  const stripped = line.replace(/<!--.*?-->/g, '');
  if (!ARABIC.test(stripped)) return;
  // Attributes: Arabic in an attribute that has no data-i18n-attr on the element.
  for (const m of stripped.matchAll(/<[^>]+>/g)) {
    const tag = m[0];
    if (!ARABIC.test(tag)) continue;
    if (/<(meta|title|html)\b/.test(tag)) continue;           // set by applyDocumentLocale
    if (!/data-i18n-attr=/.test(tag)) htmlLeaks.push(`index.html:${index + 1}: attribute — ${tag.slice(0, 100)}`);
  }
  // Text nodes: Arabic between tags whose opening tag carries no data-i18n.
  for (const m of stripped.matchAll(/<([a-z0-9-]+)([^>]*)>([^<]*[\u0600-\u06FF][^<]*)</gi)) {
    // data-i18n: translated by the document; data-i18n-js: a placeholder the
    // owning view overwrites before it is ever shown.
    if (/data-i18n(-js)?[=\s>]/.test(m[2] + '>')) continue;
    if (/^(title|option)$/i.test(m[1]) && /data-i18n/.test(m[2])) continue;
    if (m[1].toLowerCase() === 'title') continue;
    htmlLeaks.push(`index.html:${index + 1}: text — ${m[3].trim().slice(0, 80)}`);
  }
});

// Plain English literals in UI properties (text:, placeholder:, aria-label:, title:).
const englishLeaks = [];
for (const path of sources) {
  const rel = relative(ROOT, path);
  readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
    for (const m of line.matchAll(/(?:\btext|placeholder|'aria-label'|\btitle):\s*'([A-Za-z][A-Za-z ,.’!?-]{3,})'/g)) {
      englishLeaks.push(`${rel}:${index + 1}: ${m[1]}`);
    }
  });
}

// ── report ────────────────────────────────────────────────────────────────

const failures = catalogue.missing.length + catalogue.placeholderMismatch.length
  + catalogue.pluralIncomplete.length + unknownKeys.length + arabic.leaks.length
  + htmlLeaks.length + englishLeaks.length;

const report = {
  keys: { total: catalogue.total, ar: catalogue.ar, en: catalogue.en, usedStatically: used.size, dynamicPrefixes },
  missing: catalogue.missing,
  pluralIncomplete: catalogue.pluralIncomplete,
  placeholderMismatch: catalogue.placeholderMismatch,
  unknownKeys,
  unusedKeys,
  hardcodedArabic: { leaks: arabic.leaks, allowedLines: arabic.allowed.length, allowedFiles: ALLOWED },
  htmlLeaks,
  englishLeaks,
  ok: failures === 0,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const list = (title, items) => {
    console.log(`\n${title}: ${items.length}`);
    for (const item of items.slice(0, 40)) console.log(`  - ${item}`);
    if (items.length > 40) console.log(`  … and ${items.length - 40} more`);
  };
  console.log('NAZM translation audit');
  console.log(`keys: ${catalogue.total} total · ar ${catalogue.ar} · en ${catalogue.en} · ${used.size} referenced statically`);
  console.log(`dynamic key prefixes: ${dynamicPrefixes.join(', ') || '—'}`);
  list('missing translations', catalogue.missing);
  list('incomplete plural forms', catalogue.pluralIncomplete);
  list('placeholder mismatches ar↔en', catalogue.placeholderMismatch);
  list('keys used in code but not defined', unknownKeys);
  list('hard-coded Arabic (leaks)', arabic.leaks);
  console.log(`\nhard-coded Arabic (allowed, classified): ${arabic.allowed.length} lines`);
  for (const rule of ALLOWED) {
    const count = arabic.allowed.filter((a) => a.why === rule.why).length;
    if (count) console.log(`  - ${rule.file}: ${count} — ${rule.why}`);
  }
  list('static HTML text without a key', htmlLeaks);
  list('plain English literals in UI properties', englishLeaks);
  console.log(`\nunused keys (informational): ${unusedKeys.length}`);
  console.log(report.ok ? '\nOK' : `\nFAILED — ${failures} problem(s)`);
}

process.exitCode = report.ok ? 0 : 1;
