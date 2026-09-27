// Exports that scale: the inventory written a page at a time.
//
// The spreadsheet (XLSX) and the metadata JSON are built in memory — a ZIP of
// XML parts, one JSON text — which is fine for most inventories and wrong for
// very large ones. Above EXPORT_LIMITS the app says so and offers CSV, which is
// written from repository.queryItems pages: at most one page of records is
// held at a time, and the file is written to disk as it grows where the
// browser allows it (the File System Access API), or assembled from per-page
// text parts otherwise — never from an array of every record.
//
// Every export runs as a job (job-service.js), so a cloud backend can later
// run the same export on a server and hand back a file instead.

import { repository } from './repository.js';
import { itemCells, itemHeadings } from './exporting.js';
import { startJob } from './job-service.js';
import { saveFile } from './platform.js';
import { AppError } from './utils.js';

/** Records above which a format built in memory is not offered without a warning. */
export const EXPORT_LIMITS = Object.freeze({ xlsx: 20000, json: 20000 });

const PAGE = 200;

/**
 * Whether a format suits the inventory's size.
 *
 * @returns {Promise<{count: number, limit: number, overLimit: boolean}>}
 */
export async function exportAdvice(format) {
  const { count } = await repository.countItemsMatching({ filters: {} });
  const limit = EXPORT_LIMITS[format] ?? Infinity;
  return { count, limit, overLimit: count > limit };
}

/**
 * A spreadsheet cell as CSV. Text that a spreadsheet would read as a formula
 * (= + - @, a tab or a carriage return at the start) is prefixed with an
 * apostrophe, as OWASP recommends, so opening the file never runs anything.
 * Numbers stay numbers.
 */
export function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(cells) {
  return `${cells.map(csvCell).join(',')}\r\n`;
}

/**
 * Every live record, oldest first, a page at a time.
 *
 * @param {(page: object[]) => Promise<void>|void} onPage
 */
export async function forEachItemPage(onPage, { signal = null } = {}) {
  let cursor = null;
  for (;;) {
    if (signal?.aborted) return;
    const page = await repository.queryItems({ sort: { field: 'createdAt', direction: 'asc' }, limit: PAGE, cursor });
    if (page.items.length) await onPage(page.items);
    if (!page.hasMore || !page.nextCursor) return;
    cursor = page.nextCursor;
  }
}

/** Where the file is written: straight to disk when the browser allows it. */
async function openSink(filename) {
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function' && !window.Capacitor) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
      const writable = await handle.createWritable();
      return {
        write: (text) => writable.write(text),
        close: () => writable.close(),
        abort: () => writable.abort?.(),
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw new AppError('error.export/cancelled', { code: 'export/cancelled' });
      // Anything else: fall through to the in-browser file.
    }
  }
  const parts = [];
  return {
    write: (text) => { parts.push(text); },
    close: () => saveFile(new Blob(parts, { type: 'text/csv;charset=utf-8' }), filename),
    abort: () => { parts.length = 0; },
  };
}

/**
 * The inventory as CSV, as a job. Same columns as the spreadsheet's inventory
 * sheet; a byte-order mark so spreadsheet programs read the Arabic correctly.
 *
 * @returns {Promise<object>} the job (job-service.js); `result.rows` on success
 */
export function exportCsv({ onProgress } = {}) {
  return startJob('export.csv', async ({ progress, signal }) => {
    const { count } = await repository.countItemsMatching({ filters: {} });
    const sink = await openSink(`nazm_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
    let rows = 0;
    try {
      await sink.write(`﻿${csvLine(itemHeadings())}`);
      await forEachItemPage(async (items) => {
        let chunk = '';
        for (const item of items) chunk += csvLine(itemCells(repository, item));
        await sink.write(chunk);
        rows += items.length;
        progress({ done: rows, total: count });
        onProgress?.({ done: rows, total: count });
      }, { signal });
      await sink.close();
    } catch (error) {
      await sink.abort?.();
      throw error;
    }
    return { rows };
  });
}
