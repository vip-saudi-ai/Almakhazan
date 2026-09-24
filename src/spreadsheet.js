// Reading a spreadsheet the customer already has — CSV, TSV or XLSX.
//
// No dependency, for the same reason the writer next door has none: a parser
// pulled from a CDN is a supply chain, an SRI hash to keep current, and a
// thing that can change under a shipped product.
//
// XLSX is a ZIP of XML. Unzipping needs inflate, which the platform provides
// as DecompressionStream('deflate-raw'); where it does not, the file is
// refused by name rather than half-read. CSV needs no such help.
//
// This module reads. It does not decide what a column means — that is the
// customer's job, in the mapping screen — and it never coerces: a cell comes
// back as the text it held, or as a number when the sheet stored a number.

import { AppError } from './utils.js';

/**
 * The most rows one import may process in a browser, whatever the plan says.
 *
 * This is a technical ceiling, not a commercial one, and the two were tangled:
 * the plans promise Pro 10,000 rows and Business 50,000, while the parser
 * stopped everything at 5,000 — so two paid tiers could not deliver what they
 * were sold. The ceiling now clears the largest plan allowance, and the
 * effective limit for any given import is the smaller of the two, named
 * separately so the customer is told which one they met.
 */
export const MAX_ROWS = 50000;

/** Wider than any real inventory sheet; narrower than a runaway file. */
export const MAX_COLUMNS = 512;
/** A cell longer than this is not a value, it is a pasted document. */
export const MAX_CELL_CHARS = 32768;

/**
 * What a spreadsheet is allowed to cost this tab.
 *
 * A row cap alone does not bound the work: the rows are counted only after the
 * file has been decompressed and parsed. A 2MB .xlsx holding one enormous
 * shared-strings part expands to hundreds of megabytes of text before anything
 * has counted a row — which is not an attack on a server here, it is the
 * customer's own phone becoming unresponsive on a file they were sent.
 *
 * So the limits sit before the work: what may be read, and what a compressed
 * part may become once it is not compressed any more.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_INFLATED_BYTES = 120 * 1024 * 1024;
/** A part that expands more than this from its stored size is not a spreadsheet. */
export const MAX_INFLATION_RATIO = 400;

// ── CSV / TSV ──────────────────────────────────────────────────────────────

/**
 * Excel writes CSV with the list separator of the machine that made it, which
 * in much of the world is a semicolon. Guessing from the header line is more
 * reliable than insisting on a comma and reading the whole file as one column.
 */
function detectDelimiter(text) {
  const line = text.slice(0, text.indexOf('\n') + 1 || text.length);
  const counts = [
    [',', (line.match(/,/g) || []).length],
    [';', (line.match(/;/g) || []).length],
    ['\t', (line.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** A full CSV reader: quoted fields, escaped quotes, newlines inside quotes. */
/**
 * @param {string} text
 * @param {string|null} [delimiter]
 * @param {{rowLimit?: number}} [options] stop once this many rows are complete.
 *   One extra is read past the limit, which is how truncation is detected
 *   without reading the rest of the file.
 * @returns {Array<Array<string>> & {truncated?: boolean}}
 */
export function parseDelimited(text, delimiter = null, { rowLimit = Infinity } = {}) {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
  const sep = delimiter || detectDelimiter(body);
  // One past the limit: enough to know there is more, not enough to pay for it.
  const stopAfter = Number.isFinite(rowLimit) ? rowLimit + 1 : Infinity;

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let truncated = false;

  const finishRow = () => {
    row.push(field);
    if (row.length > MAX_COLUMNS) {
      throw new AppError(
        `يحتوي الملف على أكثر من ${MAX_COLUMNS} عموداً — تحقّق من الفواصل في الملف`,
        { code: 'sheet/too-many-columns' },
      );
    }
    rows.push(row);
    row = [];
    field = '';
  };

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];

    if (field.length > MAX_CELL_CHARS) {
      throw new AppError(
        'خلية في الملف أطول مما يمكن استيراده — تحقّق من علامات الاقتباس في الملف',
        { code: 'sheet/cell-too-long' },
      );
    }

    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '') { quoted = true; continue; }
    if (ch === sep) {
      row.push(field);
      field = '';
      if (row.length > MAX_COLUMNS) {
        throw new AppError(
          `يحتوي الملف على أكثر من ${MAX_COLUMNS} عموداً — تحقّق من الفواصل في الملف`,
          { code: 'sheet/too-many-columns' },
        );
      }
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      finishRow();
      // The rest of the file is not read. A 200,000-row export used to be
      // parsed in full and then sliced, which is the same work as importing it.
      if (rows.length >= stopAfter) { truncated = true; break; }
      continue;
    }
    field += ch;
  }
  if (!truncated && (field !== '' || row.length)) finishRow();

  Object.defineProperty(rows, 'truncated', { value: truncated, enumerable: false });
  return rows;
}

// ── ZIP ────────────────────────────────────────────────────────────────────

function u16(view, offset) { return view.getUint16(offset, true); }
function u32(view, offset) { return view.getUint32(offset, true); }

/**
 * Reads the central directory rather than scanning local headers: a local
 * header may declare zero sizes and defer them to a data descriptor, which is
 * exactly what streaming writers do.
 */
function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 65_557; i -= 1) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new AppError('الملف ليس ملف Excel صالحاً', { code: 'sheet/not-zip' });

  const count = u16(view, eocd + 10);
  let offset = u32(view, eocd + 16);
  const entries = new Map();

  for (let n = 0; n < count; n += 1) {
    if (u32(view, offset) !== 0x02014b50) break;
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, view };
}

async function readEntry(bytes, view, entry) {
  const local = entry.localOffset;
  if (u32(view, local) !== 0x04034b50) {
    throw new AppError('الملف تالف', { code: 'sheet/bad-entry' });
  }
  const start = local + 30 + u16(view, local + 26) + u16(view, local + 28);
  const slice = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(slice);
  if (entry.method !== 8) {
    throw new AppError('ضغط غير مدعوم داخل الملف', { code: 'sheet/compression' });
  }
  if (typeof DecompressionStream !== 'function') {
    throw new AppError(
      'هذا المتصفح لا يفك ضغط ملفات Excel — صدّر الملف بصيغة CSV وأعد المحاولة',
      { code: 'sheet/no-inflate' },
    );
  }

  // Read the expansion as it arrives rather than after it. `Response.text()`
  // would buffer the whole thing first, which is precisely the cost being
  // guarded against — by the time it could be measured it has already been
  // paid.
  const ceiling = Math.min(
    MAX_INFLATED_BYTES,
    Math.max(1024 * 1024, entry.compressedSize * MAX_INFLATION_RATIO),
  );
  const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    seen += value.byteLength;
    if (seen > ceiling) {
      await reader.cancel().catch(() => {});
      throw new AppError(
        'هذا الملف يتمدّد إلى حجم غير معقول عند فتحه — صدّره من جديد بصيغة CSV',
        { code: 'sheet/inflation' },
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

// ── XLSX ───────────────────────────────────────────────────────────────────

// A self-closing element is matched by its own alternative, listed first.
// Folding it into one pattern lets a greedy attribute run swallow the ` /` of
// `<t />` and then match the *next* element's closing tag — which silently
// moves one cell's value into another cell's column.
const tagPattern = (tag) => new RegExp(
  `<${tag}\\b[^>]*?/>|<${tag}\\b[^>]*?>([\\s\\S]*?)</${tag}>`, 'g',
);

/**
 * Every matching element, lazily.
 *
 * This is the one to use for anything that can be long — worksheet rows, cells,
 * shared strings. `matchAll` returns an iterator; spreading it into an array
 * is what turned a worksheet with 200,000 `<row>` elements into 200,000 match
 * objects in memory *before* the row limit could stop anything. A limit that
 * only applies after everything has been materialised is not a limit.
 */
const iterateTags = (xml, tag) => xml.matchAll(tagPattern(tag));

/**
 * The same, as an array — for the small fixed documents where the count is
 * bounded by the format rather than by the customer's data: a workbook's sheet
 * list, a styles table, one cell's runs of text.
 */
const TAG = (xml, tag) => [...iterateTags(xml, tag)];

function unescapeXml(value) {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    // Last, or an escaped entity in the source would be double-decoded.
    .replace(/&amp;/g, '&');
}

/**
 * The shared-string table, read one entry at a time.
 *
 * `<si>` may hold one `<t>` or many, when Excel split a run mid-string — so
 * each entry is joined from its runs, which are bounded per entry.
 *
 * Honest limitation: the table itself is not streamed. The whole
 * `sharedStrings.xml` is decompressed to a string first (bounded by
 * MAX_INFLATED_BYTES and the inflation ratio), and the array built here holds
 * one string per distinct cell value in the workbook. That is the remaining
 * memory cost of reading XLSX in a browser without a streaming XML parser, and
 * it is proportional to the number of *distinct* values rather than to the
 * number of rows. Iterating rather than spreading is what keeps the match
 * objects from being a second copy on top of it.
 */
function sharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const [block] of iterateTags(xml, 'si')) {
    let text = '';
    for (const [, inner] of iterateTags(block, 't')) text += unescapeXml(inner || '');
    if (text.length > MAX_CELL_CHARS) {
      throw new AppError(
        'خلية في الملف أطول مما يمكن استيراده',
        { code: 'sheet/cell-too-long' },
      );
    }
    out.push(text);
  }
  return out;
}

// Built-in numeric formats that mean "date". Anything custom is detected by
// the format code carrying a date token.
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const EXCEL_EPOCH_OFFSET = 25569;

/** Which cell styles are dates, so a date does not arrive as 45123. */
function dateStyles(xml) {
  const dates = new Set();
  if (!xml) return dates;

  const custom = new Set();
  for (const [, id, code] of xml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    // A format code is a date's if it carries a date token outside quotes.
    if (/[dmyhs]/i.test(code.replace(/"[^"]*"/g, '')) && /[dy]/i.test(code)) custom.add(Number(id));
  }

  const cellXfs = xml.match(/<cellXfs[\s\S]*?<\/cellXfs>/);
  if (!cellXfs) return dates;
  let index = 0;
  for (const [, id] of cellXfs[0].matchAll(/<xf\b[^>]*numFmtId="(\d+)"[^>]*>?/g)) {
    const n = Number(id);
    if (BUILTIN_DATE_FORMATS.has(n) || custom.has(n)) dates.add(index);
    index += 1;
  }
  return dates;
}

function serialToISO(serial) {
  const ms = (serial - EXCEL_EPOCH_OFFSET) * 86_400_000;
  const date = new Date(Math.round(ms));
  return Number.isNaN(date.getTime()) ? String(serial) : date.toISOString().slice(0, 10);
}

const columnIndex = (ref) => {
  const letters = (ref.match(/^[A-Z]+/) || [''])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/**
 * Rows carry the line they came from, not their position in the result. A
 * warning that says "row 5" has to mean row 5 of the customer's file — the
 * one they will scroll to — and blank rows in between would otherwise shift
 * every number after them.
 */
/**
 * @param {{rowLimit?: number}} [options] stop once this many rows are built.
 *   One extra is built past the limit so truncation can be reported; the rest
 *   of the worksheet is never walked. A 200,000-row sheet used to be built in
 *   full and then sliced, which costs the same as importing all of it.
 */
function sheetRows(xml, strings, dates, { rowLimit = Infinity } = {}) {
  const rows = [];
  const stopAfter = Number.isFinite(rowLimit) ? rowLimit + 1 : Infinity;
  let previous = 0;
  let truncated = false;
  // Lazily: the loop below breaks at the row limit, and with an array that
  // break would come after every row in the worksheet had already been
  // matched and kept.
  for (const [rowXml] of iterateTags(xml, 'row')) {
    const declared = Number((rowXml.match(/<row\b[^>]*\br="(\d+)"/) || [])[1]);
    const line = Number.isFinite(declared) && declared > 0 ? declared : previous + 1;
    previous = line;
    const cells = [];
    // Cells are walked rather than matched in one pass, for the same reason
    // TAG has two alternatives: `<c r="D4" t="inlineStr" />` is a real cell
    // Excel writes, and a single greedy pattern reads it as the start of the
    // next cell.
    const cellStart = /<c\b([^>]*?)(\/)?>/g;
    let match;
    while ((match = cellStart.exec(rowXml)) !== null) {
      const attrs = match[1] || '';
      let inner = '';
      if (!match[2]) {
        const end = rowXml.indexOf('</c>', cellStart.lastIndex);
        inner = end < 0 ? '' : rowXml.slice(cellStart.lastIndex, end);
        cellStart.lastIndex = end < 0 ? rowXml.length : end + 4;
      }
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/t="([^"]+)"/) || [])[1] || 'n';
      const style = Number((attrs.match(/s="(\d+)"/) || [])[1] ?? -1);
      const at = ref ? columnIndex(ref) : cells.length;

      let value = '';
      if (type === 's') {
        const index = Number((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1]);
        value = strings[index] ?? '';
      } else if (type === 'inlineStr') {
        value = TAG(inner, 't').map(([, t]) => unescapeXml(t || '')).join('');
      } else {
        const raw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (raw == null || raw === '') value = '';
        else if (type === 'n' && dates.has(style) && Number.isFinite(Number(raw))) value = serialToISO(Number(raw));
        else value = unescapeXml(raw);
      }

      while (cells.length < at) cells.push('');
      cells[at] = value;
    }
    if (cells.length > MAX_COLUMNS) {
      throw new AppError(
        `تحتوي ورقة العمل على أكثر من ${MAX_COLUMNS} عموداً`,
        { code: 'sheet/too-many-columns' },
      );
    }
    rows.push({ cells, line });
    if (rows.length >= stopAfter) { truncated = true; break; }
  }
  rows.truncated = truncated;
  return rows;
}

/** The first worksheet, resolved through the workbook's relationships. */
function firstSheetPath(workbookXml, relsXml, entries) {
  const rid = workbookXml
    ? (workbookXml.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1]
    : null;
  if (rid && relsXml) {
    const target = (relsXml.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`)) || [])[1];
    if (target) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      if (entries.has(path)) return path;
    }
  }
  // A workbook whose relationships we could not follow still has sheets on
  // disk; take the lowest-numbered one rather than giving up.
  const sheets = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d*\.xml$/.test(name))
    .sort();
  return sheets[0] || null;
}

/**
 * Reads the first worksheet of an XLSX file.
 *
 * The reads are deliberately sequential rather than parallel. Each part of the
 * archive inflates to a string that can be tens of megabytes on a large
 * workbook, and reading them together would hold every one of those strings
 * alive at the same time. Instead each source XML is scoped to the smallest
 * block that needs it and converted into the structure the row reader wants —
 * a sheet path, a sheet name, a string table, a set of date styles — so the
 * XML behind it is unreachable before the next one is inflated. The worksheet,
 * the largest of them, is read last and never bound to a name of its own, so
 * it is collectable as soon as `sheetRows` returns.
 */
async function readXlsx(buffer, { rowLimit = Infinity } = {}) {
  const bytes = new Uint8Array(buffer);
  const { entries, view } = zipEntries(bytes);
  const read = async (name) => (entries.has(name) ? readEntry(bytes, view, entries.get(name)) : null);

  let path = null;
  let sheetName = 'ورقة 1';
  {
    const workbookXml = await read('xl/workbook.xml');
    const relsXml = await read('xl/_rels/workbook.xml.rels');
    path = firstSheetPath(workbookXml, relsXml, entries);
    if (workbookXml) {
      sheetName = unescapeXml((workbookXml.match(/<sheet\b[^>]*name="([^"]*)"/) || [])[1] || 'ورقة 1');
    }
  }
  if (!path) throw new AppError('لا توجد ورقة بيانات في الملف', { code: 'sheet/no-sheet' });

  const strings = sharedStrings(await read('xl/sharedStrings.xml'));
  const dates = dateStyles(await read('xl/styles.xml'));

  const rows = sheetRows((await read(path)) || '', strings, dates, { rowLimit });
  return { rows, sheetName, truncated: Boolean(rows.truncated) };
}

// ── the one entry point ────────────────────────────────────────────────────

/**
 * @param {File} file
 * @returns {Promise<{headers: string[], rows: string[][], lines: number[], sheetName: string, truncated: boolean, totalRows: number}>}
 *   The first non-empty row becomes the headers. A column with no header is
 *   named by its letter rather than dropped — the customer may still want it.
 *   `lines[i]` is the row number `rows[i]` had in the file, so a warning can
 *   name a row the customer can actually scroll to.
 */
/**
 * @param {File} file
 * @param {{rowLimit?: number}} [options] the most rows this import may take —
 *   the smaller of what the plan allows and what a browser can safely process.
 *   Reading stops there rather than reading everything and slicing.
 * @returns {Promise<{headers, rows, lines, sheetName, truncated, totalRows,
 *                    appliedLimit, totalKnown}>}
 *   `totalRows` is exact only when the file was read to its end — which is
 *   what `totalKnown` says. Stopping early is the point of the limit, and a
 *   total invented from a partial read would be worse than no total.
 */
export async function readSpreadsheet(file, { rowLimit = MAX_ROWS } = {}) {
  const name = (file?.name || '').toLowerCase();
  const appliedLimit = Math.max(1, Math.min(rowLimit || MAX_ROWS, MAX_ROWS));
  // One more than the limit, because the header row is one of the rows read
  // and truncation has to be detectable.
  const readLimit = appliedLimit + 1;
  let table;

  // Before anything is read. A file this size is a database export or a
  // mistake, and either way the honest answer is the one that arrives
  // immediately rather than after the tab has stopped responding.
  if (file?.size > MAX_FILE_BYTES) {
    const mb = Math.round(MAX_FILE_BYTES / 1024 / 1024);
    throw new AppError(
      `حجم الملف يتجاوز ${mb} ميجابايت — قسّمه أو صدّر جزءاً منه`,
      { code: 'sheet/too-large' },
    );
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    table = await readXlsx(await file.arrayBuffer(), { rowLimit: readLimit });
  } else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    {
      // Not constant-memory. The whole file becomes one string before it is
      // split, so a CSV costs its own size in memory, twice over while the
      // rows are built. What bounds it is MAX_FILE_BYTES, checked above; a
      // streaming reader would lift that bound and is not built.
      const parsed = parseDelimited(await file.text(), null, { rowLimit: readLimit });
      table = {
        rows: parsed.map((cells, index) => ({ cells, line: index + 1 })),
        sheetName: file.name,
        truncated: Boolean(parsed.truncated),
      };
    }
  } else if (name.endsWith('.xls')) {
    throw new AppError(
      'صيغة .xls القديمة غير مدعومة — احفظ الملف بصيغة .xlsx أو .csv',
      { code: 'sheet/legacy-xls' },
    );
  } else {
    throw new AppError('اختر ملف .xlsx أو .csv', { code: 'sheet/unsupported' });
  }

  const nonEmpty = table.rows.filter((row) => row.cells.some((cell) => String(cell ?? '').trim() !== ''));
  if (!nonEmpty.length) throw new AppError('الملف فارغ', { code: 'sheet/empty' });

  const headers = nonEmpty[0].cells.map((cell, index) => {
    const text = String(cell ?? '').trim();
    return text || `عمود ${columnLetter(index)}`;
  });

  const body = nonEmpty.slice(1);
  const kept = body.slice(0, appliedLimit);
  // Either the read stopped early, or it finished and there were more rows
  // than the limit allows. Both are truncation; only the second one knows how
  // many rows the file actually holds.
  const stoppedEarly = Boolean(table.truncated);
  const truncated = stoppedEarly || body.length > appliedLimit;

  return {
    headers,
    rows: kept.map((row) => headers.map((_, i) => String(row.cells[i] ?? '').trim())),
    lines: kept.map((row) => row.line),
    sheetName: table.sheetName,
    truncated,
    totalRows: body.length,
    totalKnown: !stoppedEarly,
    appliedLimit,
  };
}

function columnLetter(index) {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}
