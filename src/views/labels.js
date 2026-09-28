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
import { isRtl, onLanguageChange, t } from '../i18n.js';
import { buildLabelsPdf, labelTextBox, LABEL_PDF_LAYOUT } from '../label-pdf.js';
import { canPrint, isNative, saveFile } from '../platform.js';
import { locationName } from '../labels.js';
import { closeSheet, openSheet, toast, toastError } from '../ui.js';

const NS = 'http://www.w3.org/2000/svg';

const state = { itemIds: [], items: [], mono: false, withLocation: true };

function qrNode(text, size = 120) {
  const code = encodeQr(text);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `-4 -4 ${code.size + 8} ${code.size + 8}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'qr');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('labels.codeOf', { code: text }));
  svg.setAttribute('shape-rendering', 'crispEdges');

  // The quiet zone is part of the symbol: without it a scanner may not find
  // the finder patterns at all. Four modules, as the standard asks.
  const quiet = document.createElementNS(NS, 'rect');
  quiet.setAttribute('x', '-4');
  quiet.setAttribute('y', '-4');
  quiet.setAttribute('width', String(code.size + 8));
  quiet.setAttribute('height', String(code.size + 8));
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

// The QR carries whatever identifies the record for certain — the id if no
// code was ever reserved — never its classification, so re-filing an item
// leaves every printed label valid. The printed line shows the code a person
// would read out, and a raw internal id is not that.
function labelParts(item) {
  return {
    qrValue: item.sku || item.barcode || item.id,
    humanCode: item.sku || item.barcode || `#${item.id.slice(-6).toUpperCase()}`,
    location: locationName(repository.location(item.locationId))
      || repository.folder(item.folderId)?.name
      || '',
  };
}

function labelNode(item) {
  const { qrValue, humanCode, location } = labelParts(item);

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
      class: 'btn btn-p', type: 'button', style: { width: '100%', marginTop: '14px' }, id: 'labels-pdf',
      text: t('labels.sharePdf'),
      onClick: (event) => sharePdf(event.currentTarget),
    }),
    // A native shell prints only through its own bridge; the web keeps the
    // browser's print dialog.
    canPrint() && !isNative() ? el('button', {
      class: 'btn btn-s', type: 'button', style: { width: '100%', marginTop: '8px' },
      text: items.length > 1 ? t('labels.printMany', { count: items.length }) : t('labels.printOne'),
      onClick: () => print(),
    }) : null,
  ]);
}

const TEXT_SCALE = 4; // canvas pixels per PDF point — about 290 dpi

function fitLine(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function wrapLines(ctx, text, width, max) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) { line = next; continue; }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = fitLine(ctx, `${kept[max - 1]} ${lines.slice(max).join(' ')}`, width);
    return kept;
  }
  return lines.map((l) => fitLine(ctx, l, width));
}

/** The words of one label, drawn once at print resolution. */
async function labelTextImage(item, rtl) {
  const box = labelTextBox();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width * TEXT_SCALE);
  canvas.height = Math.round(box.height * TEXT_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.scale(TEXT_SCALE, TEXT_SCALE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, box.width, box.height);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'top';
  const x = rtl ? box.width : 0;
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const ink = state.mono ? '#000' : '#0B1F4B';
  const { humanCode, location } = labelParts(item);

  let y = 2;
  ctx.fillStyle = state.mono ? '#000' : '#2563FF';
  ctx.font = `700 8px ${family}`;
  ctx.fillText(BRAND.name, x, y);
  y += 14;
  ctx.fillStyle = ink;
  ctx.font = `700 12px ${family}`;
  for (const line of wrapLines(ctx, item.name || '—', box.width, 2)) { ctx.fillText(line, x, y); y += 16; }
  y += 2;
  ctx.font = `700 10px ${family}`;
  ctx.direction = 'ltr';
  ctx.fillText(fitLine(ctx, humanCode, box.width), x, y);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  y += 14;
  if (state.withLocation && location) {
    ctx.fillStyle = state.mono ? '#000' : '#475569';
    ctx.font = `400 9px ${family}`;
    ctx.fillText(fitLine(ctx, location, box.width), x, y);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!blob) throw new Error('label image failed');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

export async function buildLabelsFile(items = state.items) {
  const rtl = isRtl();
  // A canvas draws with whatever font is ready at that instant.
  await document.fonts?.ready;
  const labels = [];
  for (const item of items) {
    labels.push({ code: encodeQr(labelParts(item).qrValue), text: await labelTextImage(item, rtl) });
  }
  const bytes = buildLabelsPdf(labels, { rtl, mono: state.mono, layout: LABEL_PDF_LAYOUT });
  const day = new Date().toISOString().slice(0, 10);
  return { blob: new Blob([bytes], { type: 'application/pdf' }), filename: `NAZM-Labels-${day}.pdf` };
}

async function sharePdf(button) {
  if (button) button.disabled = true;
  try {
    const { blob, filename } = await buildLabelsFile();
    await saveFile(blob, filename);
  } catch (error) {
    if (error?.name === 'AbortError') return; // the person closed the share sheet
    toastError(error, 'labels.pdfFailed');
  } finally {
    if (button) button.disabled = false;
  }
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
