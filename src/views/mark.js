// The NAZM symbol and wordmark as DOM nodes.
//
// Built with createElementNS rather than innerHTML: the app forbids injecting
// markup, and that rule does not get an exception for our own assets. The
// geometry comes from symbol-geometry.js — the same numbers the asset files
// are generated from — so the mark on screen and the mark on disk cannot drift.

import { SMALL_BELOW, SYMBOL, symbolPaths } from './symbol-geometry.js';
import { WORDMARK_AR } from './wordmark-ar.js';

const NS = 'http://www.w3.org/2000/svg';
let counter = 0;

function svgRoot(viewBox, { title, className, width, height }) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('focusable', 'false');
  if (width) svg.setAttribute('width', String(width));
  if (height) svg.setAttribute('height', String(height));
  if (className) svg.setAttribute('class', className);
  if (title) {
    svg.setAttribute('role', 'img');
    const label = document.createElementNS(NS, 'title');
    label.textContent = title;
    svg.appendChild(label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  return svg;
}

function gradientDef(id) {
  const def = document.createElementNS(NS, 'linearGradient');
  def.setAttribute('id', id);
  def.setAttribute('x1', '8');
  def.setAttribute('y1', '4');
  def.setAttribute('x2', '88');
  def.setAttribute('y2', '92');
  def.setAttribute('gradientUnits', 'userSpaceOnUse');
  for (const [offset, color] of [['0', '#2563FF'], ['0.55', '#6366F1'], ['1', '#93C5FD']]) {
    const stop = document.createElementNS(NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    def.appendChild(stop);
  }
  return def;
}

/**
 * @param {number} size rendered size in px
 * @param {{ className?: string, title?: string, gradient?: boolean }} [options]
 */
export function symbolNode(size = 28, { className = 'nazm-mark', title, gradient = false } = {}) {
  const variant = size <= SMALL_BELOW ? 'small' : 'regular';
  const { ring, blade } = symbolPaths(variant);
  const svg = svgRoot(`0 0 ${SYMBOL.size} ${SYMBOL.size}`, {
    title, className, width: size, height: size,
  });

  // The branded gradient is reserved for hero moments; everywhere else the
  // mark takes the surrounding text colour.
  let paint = 'currentColor';
  if (gradient) {
    const id = `nazm-gradient-${++counter}`;
    svg.appendChild(gradientDef(id));
    paint = `url(#${id})`;
  }

  const frame = document.createElementNS(NS, 'rect');
  frame.setAttribute('x', String(ring.x));
  frame.setAttribute('y', String(ring.y));
  frame.setAttribute('width', String(ring.size));
  frame.setAttribute('height', String(ring.size));
  frame.setAttribute('rx', String(ring.rx));
  frame.setAttribute('fill', 'none');
  frame.setAttribute('stroke', paint);
  frame.setAttribute('stroke-width', String(ring.strokeWidth));

  const shape = document.createElementNS(NS, 'path');
  shape.setAttribute('d', blade);
  shape.setAttribute('fill', paint);

  svg.append(frame, shape);
  return svg;
}

/**
 * The Arabic wordmark. Inline vector, not an <img>: it must render before any
 * network request resolves, and it must survive being bundled into one file.
 * The fatha and sukun are a separate path so they can carry the brand blue.
 */
export function wordmarkNode(height = 26, { title, twoTone = true } = {}) {
  const { width, height: h, transform, letters, marks } = WORDMARK_AR;
  const svg = svgRoot(`0 0 ${width} ${h}`, {
    title,
    className: 'nazm-wordmark',
    height,
    width: Math.round((width / h) * height),
  });

  const group = document.createElementNS(NS, 'g');
  group.setAttribute('transform', transform);

  const body = document.createElementNS(NS, 'path');
  body.setAttribute('d', letters);
  body.setAttribute('fill', 'currentColor');

  const diacritics = document.createElementNS(NS, 'path');
  diacritics.setAttribute('d', marks);
  diacritics.setAttribute('fill', twoTone ? 'var(--brand)' : 'currentColor');
  diacritics.setAttribute('class', 'nazm-wordmark-marks');

  group.append(body, diacritics);
  svg.appendChild(group);
  return svg;
}
