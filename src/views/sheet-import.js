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

import { FIELDS, attachTaxonomy, guessMapping, planImport } from '../import-mapping.js';
import { MAX_ROWS, readSpreadsheet } from '../spreadsheet.js';
import { normalizeArabic } from '../search.js';
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
};

const IGNORE = '';

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
  const { records, problems, newTaxonomy } = currentPlan();
  const quota = quotaStatus();
  const room = quota.limit == null ? Infinity : Math.max(0, quota.limit - quota.used);
  const overflow = records.length > room;

  const newCount = newTaxonomy.categories.length + newTaxonomy.locations.length + newTaxonomy.folders.length;

  render(body, [
    fileLine(),
    el('div', { class: 'imp-stats' }, [
      el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(records.length) }), ' قطعة ستُضاف']),
      el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(newCount) }), ' تصنيف/موقع/مجلد جديد']),
      el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(problems.length) }), ' تنبيه']),
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

    el('p', { class: 'sheet-note', text: 'الاستيراد يضيف فقط. لا يُعدّل قطعة موجودة ولا يحذف شيئاً.' }),
  ]);

  render(foot, [
    el('button', { class: 'btn btn-s', type: 'button', text: 'رجوع', style: { flex: '1', padding: '12px' },
      onClick: () => { state.step = 'map'; renderImport(); } }),
    el('button', {
      class: 'btn btn-p', type: 'button',
      text: `استيراد ${formatNumber(records.length)} قطعة`,
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

    const resolved = attachTaxonomy(records, created);
    state.progress = { done: 0, total: resolved.length, stage: 'جارٍ كتابة القطع…' };
    renderImport();

    for (let i = 0; i < resolved.length; i += CHUNK) {
      const slice = resolved.slice(i, i + CHUNK);
      await repository.bulkCreateItems(slice);
      state.progress = {
        done: Math.min(resolved.length, i + CHUNK),
        total: resolved.length,
        stage: 'جارٍ كتابة القطع…',
      };
      renderImport();
    }

    closeSheet('simport');
    toast(`أُضيفت ${formatNumber(resolved.length)} قطعة`, '📥');
    window.dispatchEvent(new CustomEvent('almakhzan:data-imported'));
  } catch (error) {
    state.step = 'confirm';
    renderImport();
    toastError(error, 'تعذّر الاستيراد');
  }
}
