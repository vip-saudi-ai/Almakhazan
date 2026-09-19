// Generates every NAZM brand asset from one geometry definition.
//
//   node tools/build-brand.mjs
//
// The symbol exists in exactly one place — GEOMETRY below — so the file on
// disk, the icon in the manifest and the mark the app draws at runtime can
// never drift apart. src/views/mark.js imports the same numbers.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SYMBOL, symbolPaths } from '../src/views/symbol-geometry.js';
import { WORDMARK_AR } from '../src/views/wordmark-ar.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p, body) => {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), body);
  return p;
};

const GRADIENT = (id) => `<linearGradient id="${id}" x1="8" y1="4" x2="88" y2="92" gradientUnits="userSpaceOnUse">`
  + '<stop offset="0" stop-color="#2563FF"/><stop offset="0.55" stop-color="#6366F1"/>'
  + '<stop offset="1" stop-color="#93C5FD"/></linearGradient>';

function symbolSvg({ paint = 'currentColor', variant = 'regular', bleed = false, defs = '' } = {}) {
  const { ring, blade } = symbolPaths(variant);
  const S = SYMBOL.size;
  const body = `<rect x="${ring.x}" y="${ring.y}" width="${ring.size}" height="${ring.size}" rx="${ring.rx}"`
    + ` fill="none" stroke="${paint}" stroke-width="${ring.strokeWidth}"/>`
    + `<path d="${blade}" fill="${paint}"/>`;
  const frame = bleed
    ? `<g transform="translate(${S * 0.1} ${S * 0.1}) scale(0.8)">${body}</g>`
    : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="NAZM">`
    + `<title>NAZM</title>${defs ? `<defs>${defs}</defs>` : ''}${frame}</svg>\n`;
}

function plate(inner, { radius = 0, background }) {
  const S = SYMBOL.size;
  const shape = radius
    ? `<rect width="${S}" height="${S}" rx="${radius}" fill="${background}"/>`
    : `<rect width="${S}" height="${S}" fill="${background}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="NAZM">`
    + `<title>NAZM</title><defs>${GRADIENT('plate')}</defs>${shape}${inner}</svg>\n`;
}

const written = [];

// ── the symbol, in every finish it is allowed to take ──
written.push(out('public/brand/nazm-symbol.svg', symbolSvg()));
written.push(out('public/brand/nazm-symbol-gradient.svg',
  symbolSvg({ paint: 'url(#nazm-gradient)', defs: GRADIENT('nazm-gradient') })));
written.push(out('public/brand/nazm-symbol-navy.svg', symbolSvg({ paint: '#0B1F4B' })));
written.push(out('public/brand/nazm-symbol-white.svg', symbolSvg({ paint: '#FFFFFF' })));
written.push(out('public/brand/nazm-symbol-black.svg', symbolSvg({ paint: '#000000' })));
written.push(out('public/brand/nazm-symbol-small.svg', symbolSvg({ variant: 'small' })));

// ── app icons: full bleed on a navy plate, the mark in white ──
const iconInner = (variant, scale) => {
  const { ring, blade } = symbolPaths(variant);
  const S = SYMBOL.size;
  const shift = (S * (1 - scale)) / 2;
  return `<g transform="translate(${shift.toFixed(2)} ${shift.toFixed(2)}) scale(${scale})">`
    + `<rect x="${ring.x}" y="${ring.y}" width="${ring.size}" height="${ring.size}" rx="${ring.rx}"`
    + ` fill="none" stroke="#FFFFFF" stroke-width="${ring.strokeWidth}"/>`
    + `<path d="${blade}" fill="#FFFFFF"/></g>`;
};
written.push(out('public/icons/app-source.svg', plate(iconInner('regular', 0.64), { background: '#0B1F4B' })));
written.push(out('public/icons/maskable-source.svg', plate(iconInner('regular', 0.50), { background: '#0B1F4B' })));
written.push(out('public/icons/favicon.svg', plate(iconInner('small', 0.70), { background: '#0B1F4B', radius: SYMBOL.size * 0.23 })));

// ── lockups ──
const symbolInner = () => {
  const { ring, blade } = symbolPaths('regular');
  return `<rect x="${ring.x}" y="${ring.y}" width="${ring.size}" height="${ring.size}" rx="${ring.rx}"`
    + ` fill="none" stroke="currentColor" stroke-width="${ring.strokeWidth}"/>`
    + `<path d="${blade}" fill="currentColor"/>`;
};

const AR = WORDMARK_AR;
const EN = { width: 304, height: 100 };
const enPath = 'M7.5 92.5V7.5L50.5 92.5V7.5 M87.5 92.5L109.0 7.5L130.5 92.5M96.5 62H121.5 '
  + 'M167.5 7.5H204.5L167.5 92.5H204.5 M241.5 92.5V7.5L269.0 62L296.5 7.5V92.5';

const arGroup = (height, y, x) => {
  const scale = height / AR.height;
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)})">`
    + `<g transform="${AR.transform}"><path d="${AR.letters}" fill="currentColor"/>`
    + `<path d="${AR.marks}" fill="currentColor"/></g></g>`;
};
const enGroup = (height, y, x) => {
  const scale = height / EN.height;
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)})">`
    + `<path d="${enPath}" fill="none" stroke="currentColor" stroke-width="15"`
    + ' stroke-linecap="round" stroke-linejoin="round"/></g>';
};

const S = SYMBOL.size;
const GAP = S * 0.27;

{ // Arabic: the symbol opens the lockup on the right
  const h = 74, w = S + GAP + (AR.width / AR.height) * h;
  out('public/brand/nazm-logo-ar.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${S}" role="img" aria-label="نَظْم">`
    + '<title>نَظْم</title>'
    + `<g transform="translate(${(w - S).toFixed(2)} 0)">${symbolInner()}</g>`
    + arGroup(h, (S - h) / 2 + h * 0.045, 0)
    + '</svg>\n');
  written.push('public/brand/nazm-logo-ar.svg');
}

{ // English
  const h = 46, w = S + GAP + (EN.width / EN.height) * h;
  out('public/brand/nazm-logo-en.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${S}" role="img" aria-label="NAZM">`
    + `<title>NAZM</title>${symbolInner()}${enGroup(h, (S - h) / 2, S + GAP)}</svg>\n`);
  written.push('public/brand/nazm-logo-en.svg');
}

{ // Bilingual: نَظْم over NAZM
  const arH = 54, enH = 18;
  const textW = Math.max((AR.width / AR.height) * arH, (EN.width / EN.height) * enH);
  const w = S + GAP + textW;
  out('public/brand/nazm-logo-bilingual.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${S}" role="img" aria-label="نَظْم NAZM">`
    + '<title>نَظْم | NAZM</title>'
    + `<g transform="translate(${(w - S).toFixed(2)} 0)">${symbolInner()}</g>`
    + arGroup(arH, 9, textW - (AR.width / AR.height) * arH)
    + enGroup(enH, 70, textW - (EN.width / EN.height) * enH)
    + '</svg>\n');
  written.push('public/brand/nazm-logo-bilingual.svg');
}

{ // wordmarks on their own
  out('public/brand/nazm-wordmark-ar.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${AR.width} ${AR.height}" role="img" aria-label="نَظْم">`
    + `<title>نَظْم</title><g transform="${AR.transform}">`
    + `<path d="${AR.letters}" fill="currentColor"/><path d="${AR.marks}" fill="currentColor"/></g></svg>\n`);
  out('public/brand/nazm-wordmark-en.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${EN.width} ${EN.height}" role="img" aria-label="NAZM">`
    + `<title>NAZM</title><path d="${enPath}" fill="none" stroke="currentColor" stroke-width="15"`
    + ' stroke-linecap="round" stroke-linejoin="round"/></svg>\n');
  written.push('public/brand/nazm-wordmark-ar.svg', 'public/brand/nazm-wordmark-en.svg');
}

console.log(`wrote ${written.length} brand files`);
