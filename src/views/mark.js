// The NAZM symbol as a DOM node.
//
// Built with createElementNS rather than innerHTML: the app forbids injecting
// markup, and that rule does not get an exception for our own assets. It
// inherits currentColor, so one mark serves light, dark and reversed contexts.

import { WORDMARK_AR } from './wordmark-ar.js';

const NS = 'http://www.w3.org/2000/svg';
let counter = 0;

/**
 * @param {number} size rendered size in px
 * @param {{ className?: string, title?: string }} [options]
 */
export function symbolNode(size = 28, { className = 'nazm-mark', title, gradient = false } = {}) {
  const seq = ++counter;
  const id = `nazm-n-${seq}`;
  const gradientId = `nazm-g-${seq}`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  if (title) {
    svg.setAttribute('role', 'img');
    const label = document.createElementNS(NS, 'title');
    label.textContent = title;
    svg.appendChild(label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  const mask = document.createElementNS(NS, 'mask');
  mask.setAttribute('id', id);
  const plate = document.createElementNS(NS, 'rect');
  plate.setAttribute('width', '96');
  plate.setAttribute('height', '96');
  plate.setAttribute('fill', '#fff');
  const n = document.createElementNS(NS, 'path');
  n.setAttribute('d', 'M34 67V29l28 38V29');
  n.setAttribute('fill', 'none');
  n.setAttribute('stroke', '#000');
  n.setAttribute('stroke-width', size < 26 ? '12.5' : '11');
  n.setAttribute('stroke-linecap', 'round');
  n.setAttribute('stroke-linejoin', 'round');
  mask.append(plate, n);

  // The branded gradient is reserved for hero moments; everywhere else the
  // mark takes the surrounding text colour.
  let paint = 'currentColor';
  if (gradient) {
    const def = document.createElementNS(NS, 'linearGradient');
    def.setAttribute('id', gradientId);
    def.setAttribute('x1', '8'); def.setAttribute('y1', '6');
    def.setAttribute('x2', '88'); def.setAttribute('y2', '92');
    def.setAttribute('gradientUnits', 'userSpaceOnUse');
    for (const [offset, color] of [['0', '#2563FF'], ['0.55', '#6366F1'], ['1', '#93C5FD']]) {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      def.appendChild(stop);
    }
    svg.appendChild(def);
    paint = `url(#${gradientId})`;
  }

  const plateOuter = document.createElementNS(NS, 'rect');
  plateOuter.setAttribute('x', '2');
  plateOuter.setAttribute('y', '2');
  plateOuter.setAttribute('width', '92');
  plateOuter.setAttribute('height', '92');
  plateOuter.setAttribute('rx', '26');
  plateOuter.setAttribute('fill', paint);
  plateOuter.setAttribute('mask', `url(#${id})`);

  svg.append(mask, plateOuter);
  return svg;
}

/**
 * The Arabic wordmark. Inline vector, not an <img>: it must render before any
 * network request resolves, and it must survive being bundled into one file.
 */
export function wordmarkNode(height = 26, { title } = {}) {
  const { width, height: h, transform, path } = WORDMARK_AR;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${h}`);
  svg.setAttribute('height', String(height));
  svg.setAttribute('width', String(Math.round((width / h) * height)));
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'nazm-wordmark');
  if (title) {
    svg.setAttribute('role', 'img');
    const label = document.createElementNS(NS, 'title');
    label.textContent = title;
    svg.appendChild(label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  const group = document.createElementNS(NS, 'g');
  group.setAttribute('transform', transform);
  const shape = document.createElementNS(NS, 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', 'currentColor');
  group.appendChild(shape);
  svg.appendChild(group);
  return svg;
}
