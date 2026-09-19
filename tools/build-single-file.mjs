#!/usr/bin/env node
// Bundles the app into one self-contained HTML file.
//
// The deployed app is served as ES modules and needs no build step. This exists
// only so the app can be opened straight from disk (file://), where module
// imports are blocked by the browser.
//
//   node tools/build-single-file.mjs   →  dist/almakhzan.html

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = 'src/app.js';

// Anchored to line start so the word "import" inside prose or a comment is not
// mistaken for a declaration.
const STATIC_IMPORT = /^[ \t]*import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2;?/gm;

const modules = new Map();

function resolveSpecifier(fromFile, specifier) {
  return join(dirname(fromFile), specifier).replaceAll('\\', '/');
}

/** Rewrites a module's import/export syntax into registry calls. */
function transform(file) {
  if (modules.has(file)) return;
  modules.set(file, null); // reserve first, so a cycle cannot recurse forever

  let source = readFileSync(join(root, file), 'utf8');
  const dependencies = [];

  source = source.replace(STATIC_IMPORT, (match, clause, _quote, specifier) => {
    if (!specifier.startsWith('.')) return match; // leave bare/URL imports alone
    const target = resolveSpecifier(file, specifier);
    dependencies.push(target);

    const namespace = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (namespace) return `const ${namespace[1]} = __req(${JSON.stringify(target)});`;

    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (named) {
      const bindings = named[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const alias = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
          return alias ? `${alias[1]}: ${alias[2]}` : part;
        })
        .join(', ');
      return `const { ${bindings} } = __req(${JSON.stringify(target)});`;
    }

    throw new Error(`Unsupported import form in ${file}: ${match}`);
  });

  const exported = new Set();

  source = source
    .replace(/^export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (_m, isAsync, name) => {
      exported.add(name);
      return `${isAsync || ''}function ${name}`;
    })
    .replace(/^export\s+class\s+([A-Za-z_$][\w$]*)/gm, (_m, name) => {
      exported.add(name);
      return `class ${name}`;
    })
    .replace(/^export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_m, kind, name) => {
      exported.add(name);
      return `${kind} ${name}`;
    })
    .replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_m, clause) => {
      for (const part of clause.split(',').map((p) => p.trim()).filter(Boolean)) {
        const alias = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        exported.add(alias ? `${alias[2]}: ${alias[1]}` : part);
      }
      return '';
    });

  if (/^export\s+default/m.test(source)) {
    throw new Error(`Default exports are not supported by this bundler (${file})`);
  }

  const bindings = [...exported]
    .map((entryName) => (entryName.includes(':') ? entryName : `${entryName}`))
    .join(', ');

  modules.set(file, `__def(${JSON.stringify(file)}, () => {\n${source}\nreturn { ${bindings} };\n});`);

  for (const dependency of dependencies) transform(dependency);
}

transform(entry);

const runtime = `
(() => {
  const __factories = new Map();
  const __cache = new Map();
  const __def = (id, factory) => __factories.set(id, factory);
  const __req = (id) => {
    if (__cache.has(id)) return __cache.get(id);
    const factory = __factories.get(id);
    if (!factory) throw new Error('module not found: ' + id);
    const exports = factory();
    __cache.set(id, exports);
    return exports;
  };
`;

// Modules are defined first, then the entry runs — so definition order does not
// matter and a module body only executes when it is first required.
const body = [...modules.values()].filter(Boolean).join('\n\n');
const bundle = `${runtime}\n${body}\n__req(${JSON.stringify(entry)});\n})();`;

const css = readFileSync(join(root, 'styles/main.css'), 'utf8');
let html = readFileSync(join(root, 'index.html'), 'utf8');

// Replacements go through a function: in a replacement *string*, `$` is special
// and would mangle any `$` in the code or CSS being inlined.
html = html
  .replace('<link rel="stylesheet" href="styles/main.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', () => `<script type="module">\n${bundle}\n</script>`)
  // The meta CSP would block the inlined script; the served app keeps its CSP.
  .replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?">\n/, '')
  .replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
  .replace(/<link rel="icon"[^>]*>\n/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\n/, '');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/almakhzan.html'), html);

console.log(`bundled ${modules.size} modules → dist/almakhzan.html (${Math.round(html.length / 1024)} KB)`);
