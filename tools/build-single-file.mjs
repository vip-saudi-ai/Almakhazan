#!/usr/bin/env node
// Bundles the app into one self-contained HTML file.
//
// The deployed app is served as ES modules and needs no build step. This exists
// only so the app can be opened straight from disk (file://), where module
// imports are blocked by the browser.
//
//   node tools/build-single-file.mjs   →  dist/nazm.html

import { contentSecurityPolicy, loadConfig, sha256 } from './security-policy.mjs';
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

  // A re-export would pass through untouched and break the whole bundle at
  // parse time ("Unexpected token 'export'"), so it is refused here instead.
  if (/^export\s+(\*|\{[^}]*\})\s+from\s/m.test(source)) {
    throw new Error(`Re-exports ("export … from") are not supported by this bundler (${file})`);
  }
  if (/^export\s+default/m.test(source)) {
    throw new Error(`Default exports are not supported by this bundler (${file})`);
  }

  // Remaining dynamic imports are remote SDK loads; see __noImport above.
  source = source.replace(/\bimport\(/g, '__noImport(');

  const bindings = [...exported]
    .map((entryName) => (entryName.includes(':') ? entryName : `${entryName}`))
    .join(', ');

  modules.set(file, `__def(${JSON.stringify(file)}, () => {\n${source}\nreturn { ${bindings} };\n});`);

  for (const dependency of dependencies) transform(dependency);
}

transform(entry);

const runtime = `
(() => {
  // A classic script cannot rely on dynamic import() being available in every
  // viewer. This build has no cloud anyway (it runs from file://), so the
  // Firebase loader is stubbed out rather than left to parse-and-fail.
  const __noImport = (specifier) =>
    Promise.reject(new Error('cloud services are not available in the single-file build: ' + specifier));

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

// Tokens first: every value the stylesheet reads is defined there.
let css = [
  readFileSync(join(root, 'styles/tokens.css'), 'utf8'),
  readFileSync(join(root, 'styles/main.css'), 'utf8'),
  readFileSync(join(root, 'styles/layout.css'), 'utf8'),
].join('\n');

// The demo opens from file://, where a relative font URL resolves to nothing.
// Inline the faces so Arabic renders at the right weight with no server.
for (const weight of [400, 500, 700, 800]) {
  const font = readFileSync(join(root, `public/fonts/tajawal-${weight}.woff2`)).toString('base64');
  css = css.replace(
    `url('../public/fonts/tajawal-${weight}.woff2')`,
    () => `url(data:font/woff2;base64,${font})`,
  );
}
const bootGuard = readFileSync(join(root, 'src/boot-guard.js'), 'utf8');
// The release configuration travels with the page, ahead of everything else.
const releaseConfig = readFileSync(join(root, 'nazm.config.js'), 'utf8');
let html = readFileSync(join(root, 'index.html'), 'utf8');

// Emitted as a *classic* script, not a module: iOS Quick Look and some embedded
// web views silently refuse to execute `type="module"`, which is exactly the
// case this build exists to serve. The registry needs no module semantics.
const scriptText = `\n${releaseConfig}\n${bootGuard}\n${bundle}\n`;
const inlineScript = `<script>${scriptText}</script>`;

// The scanner's Safari fallback (ZXing). The served app fetches it on first
// use from public/vendor; a single file has nowhere to fetch it from, so it
// travels inside the page as inert text — not parsed as script, not run at
// startup — and src/scanner.js evaluates it the first time a scan is asked
// for. Guarded against a closing tag, although the build contains none.
const zxing = readFileSync(join(root, 'public/vendor/zxing/zxing.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const zxingText = `\n${zxing}\n`;
const zxingBlock = `<script type="text/plain" id="nazm-zxing-source">${zxingText}</script>\n`;

// The standalone file carries its own enforced policy: a single file opened
// from disk has no server to send headers, and every script is inline, so
// scripts are allowed by their SHA-256 hashes — the app bundle, and the
// decoder text src/scanner.js turns into a script on first scan — and by
// nothing else. No 'unsafe-inline' for scripts, no eval.
const config = loadConfig(join(root, 'nazm.config.js'));
const standaloneCsp = contentSecurityPolicy(config, { target: 'standalone', scriptHashes: [sha256(scriptText), sha256(zxingText)] });
const standalonePolicy = `<!-- Enforced Content Security Policy for this single-file build (generated by
     tools/build-single-file.mjs from nazm.config.js). Scripts are allowed only
     by their SHA-256 hashes: the inline application bundle and the barcode
     decoder text it evaluates on first scan. No eval. Fonts are inline data:
     URIs. 'unsafe-inline' applies to styles only. -->
<meta http-equiv="Content-Security-Policy" content="${standaloneCsp}">
`;

// Replacements go through a function: in a replacement *string*, `$` is special
// and would mangle any `$` in the code or CSS being inlined.
html = html
  .replace('<link rel="stylesheet" href="styles/tokens.css">', '')
  .replace('<link rel="stylesheet" href="styles/layout.css">', '')
  .replace(/<link rel="preload" href="public\/fonts\/[^"]+"[^>]*>/g, '')
  .replace('<link rel="stylesheet" href="styles/main.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="nazm.config.js"></script>\n', '')
  .replace('<script src="src/boot-guard.js"></script>\n', '')
  .replace('<script type="module" src="src/app.js"></script>', () => zxingBlock + inlineScript)
  // The served page's policy (for separate files) is replaced by the hashed one.
  .replace(/<!-- security-policy:begin[\s\S]*?<!-- security-policy:end -->\n/, () => standalonePolicy)
  .replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
  .replace(/<link rel="icon"[^>]*>\n/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\n/, '');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/nazm.html'), html);

console.log(`bundled ${modules.size} modules → dist/nazm.html (${Math.round(html.length / 1024)} KB)`);
