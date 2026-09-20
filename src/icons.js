// The NAZM icon family.
//
// One drawing style for every system action, so the interface reads as one
// thing rather than as whatever glyph each screen reached for. Before this,
// the same context menu carried 🔍 👁 🗂 ✎ ⧉ ⊡ ☑ 🗑 — three colour emoji, four
// typographic symbols, six different weights, and a rendering that changed
// per device because emoji are a font, not a drawing.
//
// The rules, so a new icon looks like the others without being asked to:
//
//   grid        24×24, drawn on a 24-unit box
//   stroke      1.8, round caps, round joins, never filled
//   colour      currentColor, so an icon inherits the control it sits in
//   optical     shapes sit inside a 20-unit square, leaving a 2-unit margin,
//               so a circle and a square read the same size
//
// Emoji are still right for one thing, and only that thing: a category or a
// folder icon the *customer* chose. Those are their content, not our
// interface, and flattening them into monochrome strokes would be taking
// something away.

import { el } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Path data, keyed by what the icon means rather than what it looks like. */
const PATHS = {
  // navigation
  inventory: 'M4 7h16M4 12h16M4 17h16',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  overview: 'M4 19V10M9.5 19V5M15 19v-7M20.5 19v-4',
  assistant: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008.9 19a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 8.4a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',

  // actions
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M4 12.5l5 5L20 6.5',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  edit: 'M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17z',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  duplicate: 'M9 9h10v10H9zM5 15V5h10',
  move: 'M3 8a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  select: 'M4 5h16v14H4zM8 12l3 3 5-6',
  filter: 'M4 6h16M7 12h10M10 18h4',
  sort: 'M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3',
  scan: 'M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M4 12h16',
  label: 'M4 6h12l4 6-4 6H4zM8 12h.01',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 3 3L16 10l4 4M9 9.5h.01',
  eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM12 15a3 3 0 100-6 3 3 0 000 6z',
  star: 'M12 4l2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9L9.6 9z',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  location: 'M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  tag: 'M4 12V5h7l8 8-7 7zM8 8.5h.01',
  team: 'M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M20 19v-1.5a3.5 3.5 0 00-2.6-3.4M15 4.1a3.5 3.5 0 010 6.8',
  workspace: 'M4 8h16v11H4zM4 8l2-3h12l2 3M9 12h6',
  sheet: 'M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h5',
  download: 'M12 4v10M8 11l4 4 4-4M5 19h14',
  upload: 'M12 18V8M8 11l4-4 4 4M5 19h14',
  expand: 'M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.5 2',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h.01',
  warning: 'M12 4l9 16H3zM12 10v4M12 17.5h.01',
  category: 'M4 4h7v7H4zM17.5 4L21 11h-7zM7.5 20a3.5 3.5 0 100-7 3.5 3.5 0 000 7M14 13h7v7h-7z',
  quantity: 'M4 6h16M4 12h16M4 18h9',
  money: 'M12 21a9 9 0 100-18 9 9 0 000 18zM14.5 9.5A2.5 2.5 0 0012 8h-.5a2 2 0 000 4h1a2 2 0 010 4H12a2.5 2.5 0 01-2.5-1.5M12 6.5v11',
};

export const ICON_NAMES = Object.keys(PATHS);

/**
 * One icon, as an inline SVG node.
 *
 * Built with createElementNS rather than innerHTML: a node, not a string of
 * markup, so nothing in the icon path can ever be a place user content ends
 * up being parsed as HTML.
 *
 * @param {string} name  one of ICON_NAMES
 * @param {object} [options]
 * @param {number} [options.size]   rendered size in px; the grid stays 24
 * @param {string} [options.title]  an accessible name. Omit it for an icon
 *   that sits inside a labelled control, which is most of them — a duplicated
 *   name is worse than none.
 */
export function icon(name, { size = 20, title = '', className = '', stroke = 1.8 } = {}) {
  const path = PATHS[name];
  if (!path) {
    console.error('[icons] no icon named', name);
    return el('span', { 'aria-hidden': 'true' });
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(stroke));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `nz-icon${className ? ' ' + className : ''}`);
  // An icon beside a label is decoration; an icon alone is the label.
  if (title) {
    svg.setAttribute('role', 'img');
    const node = document.createElementNS(SVG_NS, 'title');
    node.textContent = title;
    svg.appendChild(node);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }

  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path);
  svg.appendChild(shape);
  return svg;
}

/** Replaces an element's contents with one icon. */
export function setIcon(node, name, options) {
  if (!node) return;
  node.replaceChildren(icon(name, options));
}

/**
 * Fills every `data-icon` placeholder in the document (or a subtree).
 *
 * Static markup declares which icon it wants and this draws it, so the HTML
 * stays free of inline SVG and an icon is never a character whose rendering
 * depends on the device's emoji font.
 */
export function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    const size = Number(node.dataset.iconSize) || undefined;
    setIcon(node, node.dataset.icon, size ? { size } : undefined);
  }
}
