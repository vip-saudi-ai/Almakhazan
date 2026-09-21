// Importing a spreadsheet, in three steps the customer can see through.
//
//   1. Map      — which column is which field, guessed then confirmed.
//   2. Confirm  — exactly what will be written: how many records, how many
//                 new categories, and every cell that could not be read.
//   3. Write    — batched, with progress, after a plan check.
//
// What this screen refuses to do is the point of it. It does not invent a
// name for a nameless row, does not turn "ثلاثة" into 3, does not accept a
// condition that is not one of ours, and does not create a category as a
// side effect of an import nobody was told about. Everything the import will
// do is on the confirm screen before the button exists.
//
// The planning is `src/import-mapping.js` — pure, and unit-tested — so the
// preview and the write come from one answer rather than two.

import { FIELDS, ambiguousColumns, attachTaxonomy, guessMapping, importItemId, planImport } from '../import-mapping.js';
import { MAX_ROWS, readSpreadsheet } from '../spreadsheet.js';
import { normalizeArabic } from '../search.js';
import * as local from '../local-store.js';
import { repository } from '../repository.js';
import { quotaStatus } from '../subscription.js';
import { $, el, formatNumber, render, uid } from '../utils.js';
import { closeSheet, openSheet, section, toast, toastError } from '../ui.js';
import { withFullInventory } from '../inventory-load.js';

const state = {
  file: null,
  sheet: null,      // { headers, rows, sheetName, truncated, totalRows }
  mapping: {},
  step: 'map',      // map | confirm | running
  progress: null,
  /**
   * The import currently being written, if any.
   *
   * `{ id, total, written, failedAt }`. Its `id` is what makes the row ids
   * deterministic, so pressing "import" again after a failure rewrites the
   * chunks that already landed rather than adding a second copy of them.
   * Kept across a failure and cleared on success.
   */
  job: null,
};

const IGNORE = '';

/** The job this screen is holding, for the test that covers resumption. */
export function __jobForTest() {
  return state.job;
}

export async function startSpreadsheetImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xlsm,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void openSpreadsheetImport(file);
  };
  input.click();
}

/** Opens the flow for a file that is already in hand. */
/**
 * An import of this exact file that stopped part way.
 *
 * Kept on the device rather than in memory, because the way an import on a
 * phone usually stops is that the tab is discarded — and after that there is
 * no session left to remember anything. Matching on the file's name and size
 * is enough: adopting the old job's id makes the rows land on the same records
 * as before, so continuing cannot double anything, and picking the wrong file
 * simply produces a fresh job.
 */
async function findUnfinishedJob(file) {
  try {
    const jobs = await local.getAll('importJobs');
    return jobs.find((job) => job.status === 'stopped'
      && job.fileName === file.name && job.fileSize === file.size) || null;
  } catch (error) {
    console.error('[import] could not read the import history', error);
    return null;
  }
}

async function recordJob(job, status) {
  try {
    await local.put('importJobs', {
      id: job.id, startedAt: job.startedAt, fileName: job.fileName, fileSize: job.fileSize,
      total: job.total, written: job.written, status,
    });
  } catch (error) {
    // Bookkeeping. Failing to write it must not fail the import itself.
    console.error('[import] could not record the import job', error);
  }
}

export async function openSpreadsheetImport(file) {
  try {
    const sheet = await readSpreadsheet(file);
    // The importer matches taxonomy by name and counts against the plan, so
    // it needs the inventory it is adding to, not a window of it.
    if (!(await withFullInventory('جارٍ قراءة المخزون كاملاً…'))) return;

    state.file = file;
    state.sheet = sheet;
    state.mapping = guessMapping(sheet.headers);
    state.step = 'map';
    state.progress = null;
    // The same file, picked again after an import of it stopped: continue that
    // job rather than starting a second one beside it. Any other file starts
    // fresh.
    const previous = await findUnfinishedJob(file);
    state.job = previous
      ? { ...previous, failedAt: previous.written }
      : null;
    openSheet('simport');
    renderImport();
  } catch (error) {
    toastError(error, 'تعذّر قراءة الملف');
  }
}

function currentPlan() {
  return planImport({
    rows: state.sheet.rows,
    lines: state.sheet.lines,
    mapping: state.mapping,
    existing: {
      categories: repository.state.categories,
      locations: repository.state.locations,
      folders: repository.state.folders,
    },
  });
}

// ── rendering ──────────────────────────────────────────────────────────────

function renderImport() {
  const body = $('simport-body');
  const foot = $('simport-foot');
  if (!body) return;

  if (state.step === 'running') { renderRunning(body, foot); return; }
  if (state.step === 'confirm') { renderConfirm(body, foot); return; }
  renderMap(body, foot);
}

function fileLine() {
  const { sheetName, totalRows, truncated } = state.sheet;
  return el('p', { class: 'sheet-note' }, [
    el('b', { text: state.file.name }),
    ` · ${sheetName} · ${formatNumber(totalRows)} صفّاً`,
    truncated ? el('span', { class: 'imp-warn', text: ` — يُقرأ أول ${formatNumber(MAX_ROWS)} صفّ فقط` }) : null,
  ]);
}

function renderMap(body, foot) {
  const { headers } = state.sheet;
  const nameMapped = state.mapping.name != null && state.mapping.name >= 0;

  render(body, [
    fileLine(),
    el('p', { class: 'sheet-note', text: 'طابق أعمدة ملفك على حقول القطعة. ما تتركه «تجاهل» لن يُستورد.' }),
    section('المطابقة', [el('div', { class: 'fsec' }, FIELDS.map((field) => el('div', { class: 'frow' }, [
      el('label', { for: `map-${field.key}`, text: field.label + (field.required ? ' *' : '') }),
      el('select', {
        id: `map-${field.key}`,
        onChange: (event) => {
          const value = event.target.value;
          if (value === IGNORE) delete state.mapping[field.key];
          else state.mapping[field.key] = Number(value);
          renderImport();
        },
      }, [
        el('option', { value: IGNORE, text: 'تجاهل', selected: state.mapping[field.key] == null || undefined }),
        ...headers.map((header, index) => el('option', {
          value: String(index), text: header,
          selected: state.mapping[field.key] === index || undefined,
        })),
      ]),
    ])))]),
    ambiguousBlock(),
    section('أول صفوف الملف', [previewTable()]),
    nameMapped ? null : el('p', { class: 'imp-warn', text: 'الاسم حقل مطلوب — اختر العمود الذي يحمله.' }),
  ]);

  render(foot, [
    el('button', { class: 'btn btn-s', type: 'button', text: 'إلغاء', style: { flex: '1', padding: '12px' },
      onClick: () => closeSheet('simport') }),
    el('button', {
      class: 'btn btn-p', type: 'button', text: 'معاينة', style: { flex: '2', padding: '12px' },
      disabled: nameMapped ? undefined : true,
      onClick: () => { state.step = 'confirm'; renderImport(); },
    }),
  ]);
}

/**
 * Columns whose header could mean more than one thing.
 *
 * "Ref" is a serial number to a watch dealer, a SKU to a retailer and an
 * internal reference to everyone else. Those go to three different fields,
 * and a serial number quietly filed as a SKU is wrong in a way nobody
 * notices until the day they need it. So the screen asks, once, rather than
 * guessing — and the deterministic mappings above still run without asking,
 * because "الاسم" is not ambiguous.
 */
function ambiguousBlock() {
  const columns = ambiguousColumns(state.sheet.headers, state.mapping);
  if (!columns.length) return null;

  return section('أعمدة تحتاج توضيحاً', columns.map((column) => el('div', { class: 'imp-ask' }, [
    el('div', { class: 'imp-ask-q' }, [
      el('b', { text: column.header }),
      el('span', { text: ' — ماذا يمثل؟' }),
    ]),
    el('div', { class: 'imp-ask-opts' }, column.options.map((option) => el('button', {
      class: 'chipbtn', type: 'button', text: option.label,
      onClick: () => {
        if (option.key) state.mapping[option.key] = column.index;
        state.resolved = { ...(state.resolved || {}), [column.index]: option.key || 'ignored' };
        renderImport();
      },
    }))),
  ])));
}

/** The file as it is, not as we hope it is — three rows, unaltered. */
function previewTable() {
  const { headers, rows } = state.sheet;
  const shown = rows.slice(0, 3);
  return el('div', { class: 'imp-table-wrap' }, [
    el('table', { class: 'imp-table' }, [
      el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h })))]),
      el('tbody', {}, shown.map((row) => el('tr', {}, headers.map((_, i) =>
        el('td', { text: row[i] ?? '' }))))),
    ]),
  ]);
}

function renderConfirm(body, foot) {
  const { records, problems, newTaxonomy, rowStatus } = currentPlan();
  const mapped = new Set(Object.values(state.mapping));
  const unknownColumns = state.sheet.headers.filter((_, i) => !mapped.has(i)).length;
  const quota = quotaStatus();
  const room = quota.limit == null ? Infinity : Math.max(0, quota.limit - quota.used);
  const overflow = records.length > room;

  const newCount = newTaxonomy.categories.length + newTaxonomy.locations.length + newTaxonomy.folders.length;
  const resuming = state.job?.failedAt != null;

  render(body, [
    fileLine(),
    // Three counts, because a row is one of three things and calling them all
    // "warnings" hides which ones are actually going to be left behind.
    el('div', { class: 'imp-stats' }, [
      el('div', { class: 'imp-stat imp-ready' }, [el('b', { text: formatNumber(records.length) }), ' قطعة ستُضاف']),
      el('div', { class: 'imp-stat imp-warning' }, [el('b', { text: formatNumber(rowStatus.warning.length) }), ' صفّاً يحتاج مراجعة']),
      el('div', { class: 'imp-stat imp-error' }, [el('b', { text: formatNumber(rowStatus.error.length) }), ' صفّاً لن يُستورد']),
      el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(newCount) }), ' تصنيف/موقع/مجلد جديد']),
      unknownColumns ? el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(unknownColumns) }), ' عموداً غير مستخدم']) : null,
    ]),

    overflow ? el('div', { class: 'imp-warnings' }, [
      el('div', { class: 'imp-warn-title', text: 'لا تتسع خطتك لهذا الملف' }),
      el('div', { class: 'imp-warn', text: `${formatNumber(records.length)} قطعة في الملف، والمتبقي في خطتك ${formatNumber(room)}. ارفع الخطة أو احذف ما لم يعد يلزمك.` }),
    ]) : null,

    newCount ? section('سيُنشأ', [
      ...taxonomyLine('تصنيفات', newTaxonomy.categories),
      ...taxonomyLine('مواقع', newTaxonomy.locations),
      ...taxonomyLine('مجلدات', newTaxonomy.folders),
    ]) : null,

    problems.length ? section(`تنبيهات (${formatNumber(problems.length)})`, [
      el('div', { class: 'imp-warnings' }, [
        ...problems.slice(0, 12).map((p) => el('div', { class: 'imp-warn', text: `• صف ${formatNumber(p.line)}: ${p.reason}` })),
        problems.length > 12
          ? el('div', { class: 'imp-warn', text: `• و${formatNumber(problems.length - 12)} تنبيهاً آخر` })
          : null,
      ]),
    ]) : null,

    // An import that stopped part way. Saying where it stopped, and that
    // continuing cannot double anything, is the difference between pressing
    // the button again and giving up on the file.
    resuming ? el('div', { class: 'imp-warnings' }, [
      el('div', { class: 'imp-warn-title', text: 'توقف الاستيراد في المنتصف' }),
      el('div', {
        class: 'imp-warn',
        text: `كُتبت ${formatNumber(state.job.written)} من ${formatNumber(state.job.total)} قطعة. المتابعة تكمل من حيث توقف — الصفوف المكتوبة تُكتب بنفس هويتها، فلا تتكرر.`,
      }),
    ]) : null,

    el('p', { class: 'sheet-note', text: 'الاستيراد يضيف فقط. لا يُعدّل قطعة موجودة ولا يحذف شيئاً.' }),
  ]);

  render(foot, [
    el('button', {
      class: 'btn btn-s', type: 'button',
      text: resuming ? 'إلغاء' : 'رجوع',
      style: { flex: '1', padding: '12px' },
      onClick: () => {
        // Abandoning a half-written import keeps what was written — those are
        // real records — and forgets the job, so a later run starts fresh.
        if (resuming) {
          void recordJob(state.job, 'abandoned');
          state.job = null;
          closeSheet('simport');
          return;
        }
        state.step = 'map';
        renderImport();
      },
    }),
    el('button', {
      class: 'btn btn-p', type: 'button',
      text: resuming
        ? `متابعة الاستيراد (${formatNumber(state.job.total - state.job.written)} متبقية)`
        : `استيراد ${formatNumber(records.length)} قطعة`,
      style: { flex: '2', padding: '12px' },
      disabled: records.length && !overflow ? undefined : true,
      onClick: () => { void run(); },
    }),
  ]);
}

function taxonomyLine(label, names) {
  if (!names.length) return [];
  const shown = names.slice(0, 8).join('، ');
  return [el('div', { class: 'imp-warn', text: `• ${names.length} ${label}: ${shown}${names.length > 8 ? '…' : ''}` })];
}

function renderRunning(body, foot) {
  const { done, total, stage } = state.progress || { done: 0, total: 0, stage: '' };
  render(body, [
    fileLine(),
    el('div', { class: 'import-progress', role: 'status', 'aria-live': 'polite' }, [
      el('div', { text: stage }),
      el('div', { text: `${formatNumber(done)} من ${formatNumber(total)}` }),
    ]),
  ]);
  render(foot, []);
}

// ── writing ────────────────────────────────────────────────────────────────

const CHUNK = 200;

async function run() {
  const { records, newTaxonomy } = currentPlan();
  // One job, kept across a retry. A failed import used to leave the written
  // chunks behind and send the customer back to a button that would write
  // everything again — 400 duplicates, then the rest of the file.
  state.job = state.job || {
    id: uid('job').slice(4),
    startedAt: Date.now(),
    fileName: state.file?.name || '',
    fileSize: state.file?.size || 0,
    total: records.length,
    written: 0,
    failedAt: null,
  };
  state.job.total = records.length;
  await recordJob(state.job, 'running');
  state.step = 'running';
  state.progress = { done: 0, total: records.length, stage: 'جارٍ إنشاء التصنيفات…' };
  renderImport();

  try {
    // Taxonomies first: the records reference them by id, so they have to
    // exist before a record can point at one.
    const created = { categories: {}, locations: {}, folders: {} };
    for (const [collection, save] of [
      ['categories', (name) => repository.saveCategory({ id: uid('cat'), name, icon: '📦' })],
      ['locations', (name) => repository.saveLocation({ id: uid('loc'), name })],
      ['folders', (name) => repository.saveFolder({ id: uid('fld'), name, icon: '🗂', color: '#2563FF' })],
    ]) {
      for (const name of newTaxonomy[collection]) {
        const saved = await save(name);
        created[collection][normalizeArabic(name)] = saved.id;
      }
    }

    // Each record's id comes from the job and its row, so writing a chunk
    // twice writes the same documents twice rather than two copies of them.
    const resolved = attachTaxonomy(records, created).map((record) => ({
      ...record,
      id: record.id || importItemId(state.job.id, record.sourceLine),
    }));
    state.progress = { done: 0, total: resolved.length, stage: 'جارٍ كتابة القطع…' };
    renderImport();

    for (let i = 0; i < resolved.length; i += CHUNK) {
      const slice = resolved.slice(i, i + CHUNK);
      await repository.bulkCreateItems(slice);
      state.job.written = Math.min(resolved.length, i + CHUNK);
      state.job.failedAt = null;
      state.progress = {
        done: state.job.written,
        total: resolved.length,
        stage: 'جارٍ كتابة القطع…',
      };
      renderImport();
    }

    await recordJob(state.job, 'done');
    state.job = null;
    closeSheet('simport');
    toast(`أُضيفت ${formatNumber(resolved.length)} قطعة`, '📥');
    window.dispatchEvent(new CustomEvent('almakhzan:data-imported'));
  } catch (error) {
    if (state.job) {
      state.job.failedAt = state.job.written;
      await recordJob(state.job, 'stopped');
    }
    state.step = 'confirm';
    renderImport();
    toastError(error, 'تعذّر الاستيراد');
  }
}
