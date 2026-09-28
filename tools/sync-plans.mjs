#!/usr/bin/env node
// Regenerates the browser and Cloud Functions copies of shared/plans.json.
//
// The browser cannot import JSON reliably across the Safari versions this app
// supports, and Cloud Functions deploy only their own directory — so both get a
// generated copy. `npm run test:unit` fails if either drifts from the source.
//
//   node tools/sync-plans.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'shared/plans.json');
const raw = readFileSync(source, 'utf8');
const config = JSON.parse(raw);

const banner = '// GENERATED FILE — edit shared/plans.json and run `npm run sync:plans`.\n';

mkdirSync(join(root, 'src'), { recursive: true });
writeFileSync(
  join(root, 'src/plans.generated.js'),
  `${banner}\nexport const PLAN_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
);

mkdirSync(join(root, 'functions'), { recursive: true });
writeFileSync(join(root, 'functions/plans.json'), raw);

console.log(`synced ${Object.keys(config.plans).length} plans → src/plans.generated.js, functions/plans.json`);
