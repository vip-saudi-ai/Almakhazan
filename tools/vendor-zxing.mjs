#!/usr/bin/env node
// Copies the ZXing browser build into public/vendor so the scanner's Safari
// fallback is self-hosted: no CDN, works offline once cached, and loaded only
// when a scan is first asked for (src/scanner.js). Re-run after upgrading
// @zxing/library:
//
//   node tools/vendor-zxing.mjs

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules/@zxing/library');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const out = join(root, 'public/vendor/zxing');
mkdirSync(out, { recursive: true });
copyFileSync(join(pkgDir, 'umd/index.min.js'), join(out, 'zxing.min.js'));
copyFileSync(join(pkgDir, 'LICENSE'), join(out, 'LICENSE'));
writeFileSync(join(out, 'VERSION'), `@zxing/library ${version} (Apache-2.0) — umd/index.min.js\n`);
console.log(`vendored @zxing/library ${version} → public/vendor/zxing/`);
