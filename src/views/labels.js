// QR labels.
//
// A label's job is to survive being stuck on a box in a warehouse and scanned
// six months later, so it stays deliberately plain: the mark, the name, the
// code, and optionally where the thing lives. Two finishes — colour for an
// inkjet, pure black for a thermal printer, which cannot render grey at all.

import { repository } from '../repository.js';
import { BRAND } from '../brand.js';
import { encodeQr } from '../qr.js';
import { SYMBOL, symbolPaths } from './symbol-geometry.js';
import { $, el, render } from '../utils.js';
import { onLanguageChange, t } from '../i18n.js';
import { locationName } from '../labels.js';
import { closeSheet, openSheet, toast, toastError } from '../ui.js';

const NS = 'http://www.w3.org/2000/svg';

const state = { itemIds: [], items: [], mono: false, withLocation: true };

function qrNode(text, size = 120) {
  const code = encodeQr(text);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `-2 -2 ${code.size + 4} ${code.size + 4}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'qr');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('labels.codeOf', { code: text }));
  svg.setAttribute('shape-rendering', 'crispEdges');

  // The quiet zone is part of the symbol: without it a scanner may not find
  // the finder patterns at all.
  const quiet = document.createElementNS(NS, 'rect');
  quiet.setAttribute('x', '-2');
  quiet.setAttribute('y', '-2');
  quiet.setAttribute('width', String(code.size + 4));
  quiet.setAttribute('height', String(code.size + 4));
  quiet.setAttribute('fill', '#fff');
  svg.appendChild(quiet);

  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (!code.cells[y][x]) continue;
      const cell = document.createElementNS(NS, 'rect');
      cell.setAttribute('x', String(x));
      cell.setAttribute('y', String(y));
      cell.setAttribute('width', '1');
      cell.setAttribute('height', '1');
      cell.setAttribute('fill', '#000');
      svg.appendChild(cell);
    }
  }
  return svg;
}

function markNode(size = 18) {
  const { ring, blade } = symbolPaths('small');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SYMBOL.size} ${SYMBOL.size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  const frame = document.createElementNS(NS, 'rect');
  frame.setAttribute('x', String(ring.x));
  frame.setAttribute('y', String(ring.y));
  frame.setAttribute('width', String(ring.size));
  frame.setAttribute('height', String(ring.size));
  frame.setAttribute('rx', String(ring.rx));
  frame.setAttribute('fill', 'none');
  frame.setAttribute('stroke', 'currentColor');
  frame.setAttribute('stroke-width', String(ring.strokeWidth));

  const shape = document.createElementNS(NS, 'path');
  shape.setAttribute('d', blade);
  shape.setAttribute('fill', 'currentColor');

  svg.append(frame, shape);
  return svg;
}

function labelNode(item) {
  // The QR carries whatever identifies the record for certain — the id if no
  // code was ever reserved. The printed line shows the code a person would
  // read out, and a raw internal id is not that.
  const qrValue = item.sku || item.barcode || item.id;
  const humanCode = item.sku || item.barcode || `#${item.id.slice(-6).toUpperCase()}`;
  const location = locationName(repository.location(item.locationId))
    || repository.folder(item.folderId)?.name
    || '';

  return el('div', { class: 'label-card' }, [
    el('div', { class: 'label-qr' }, [qrNode(qrValue, 118)]),
    el('div', { class: 'label-body' }, [
      el('div', { class: 'label-brand' }, [markNode(15), el('span', { text: BRAND.name })]),
      el('div', { class: 'label-name', text: item.name || '—', dir: 'auto' }),
      el('div', { class: 'label-code', text: humanCode, dir: 'ltr' }),
      state.withLocation && location ? el('div', { class: 'label-place', text: location, dir: 'auto' }) : null,
    ]),
  ]);
}

function renderLabels() {
  const body = $('labels-body');
  if (!body) return;

  const items = state.items;

  if (!items.length) {
    render(body, [el('p', { class: 'plan-note', text: t('labels.none') })]);
    return;
  }

  const toggle = (label, key) => el('button', {
    class: `chipbtn${state[key] ? ' on' : ''}`, type: 'button', text: label,
    'aria-pressed': String(state[key]),
    onClick: () => { state[key] = !state[key]; renderLabels(); },
  });

  render(body, [
    el('p', { class: 'plan-note', text: t('labels.note') }),
    el('div', { class: 'label-opts' }, [
      toggle(t('labels.mono'), 'mono'),
      toggle(t('labels.withLocation'), 'withLocation'),
    ]),
    el('div', { class: `label-sheet${state.mono ? ' mono' : ''}`, id: 'label-sheet' }, items.map(labelNode)),
    el('button', {
      class: 'btn btn-p', type: 'button', style: { width: '100%', marginTop: '14px' },
      text: items.length > 1 ? t('labels.printMany', { count: items.length }) : t('labels.printOne'),
      onClick: () => print(),
    }),
  ]);
}

function print() {
  try {
    document.body.classList.add('printing-labels');
    window.print();
  } catch (error) {
    toastError(error, 'labels.printFailed');
  } finally {
    // Safari fires afterprint late; clearing on the next frame is enough and
    // does not depend on an event that may never arrive.
    requestAnimationFrame(() => document.body.classList.remove('printing-labels'));
  }
}

/** @param {string[]} itemIds */
/**
 * The records are read from the store by id, not looked for in the window:
 * a label is as often wanted for the oldest thing on the shelf as the newest.
 * An id the store no longer holds is said out loud, not quietly dropped from
 * the sheet.
 */
export async function openLabels(itemIds) {
  const ids = itemIds.filter(Boolean);
  if (!ids.length) { toast(t('labels.chooseFirst'), '⚠'); return; }
  let found;
  try {
    found = await repository.getItems(ids);
  } catch (error) {
    toastError(error, 'labels.openFailed');
    return;
  }
  state.itemIds = ids;
  state.items = found.items.filter((item) => !item.deletedAt);
  if (found.missing.length) toast(t('labels.missing', { count: found.missing.length }), '⚠');
  renderLabels();
  openSheet('labels');
}

export function closeLabels() {
  closeSheet('labels');
}

onLanguageChange(() => { if ($('sh-labels')?.classList.contains('open')) renderLabels(); });
