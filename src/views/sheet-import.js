// Importing a spreadsheet, in three steps the customer can see through.
//
//   1. Map      — which column is which field, guessed then confirmed.
//   2. Confirm  — exactly what will be written: how many records, how many
//                 new categories, every cell that could not be read, and both
//                 limits that bound the write.
//   3. Write    — batched, with progress, after a plan check, and stoppable at
//                 a chunk boundary.
//
// A write that stopped can be continued, closed, or cancelled, and the last
// two are different things: closing keeps the records already written, and
// cancelling removes exactly the ones this import wrote.
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
import { readSpreadsheet, validateSpreadsheetFileMetadata } from '../spreadsheet.js';
import { normalizeArabic } from '../search.js';
import { ACTIONS } from '../config.js';
import { repository } from '../repository.js';
import { canImportRows, importLimit, quotaStatus } from '../subscription.js';
import { AppError, $, el, formatDate, formatNumber, render, uid } from '../utils.js';
import { closeSheet, confirmAction, onSheetClose, openSheet, section, toast, toastError } from '../ui.js';
import {
  JOB, ensureImportReady, findCompletedJob, findUnfinishedJob, importRecoveryState, markJobActive,
  markJobInactive, persistJobCritical, runImportRecovery,
} from '../import-jobs.js';

const state = {
  file: null,
  sheet: null,        // { headers, rows, lines, sheetName, truncated, totalRows, appliedLimit }
  fingerprint: null,  // what the file is, as opposed to what it is called
  limit: null,        // { plan, technical, effective, boundBy }
  /** Records the plan still has room for, counted when the file was opened
   *  and again before writing — from the usage counter and a direct count,
   *  never from an inventory loaded into memory. */
  room: Infinity,
  mapping: {},
  resolved: {},       // the customer's answers for the ambiguous columns
  /** True once records have been written under this mapping — see §26. */
  mappingLocked: false,
  step: 'map',        // map | confirm | running | blocked
  progress: null,
  /**
   * The import currently being written, if any.
   *
   * Its `id` is what makes the row ids deterministic, so pressing "import"
   * again after a failure rewrites the chunks that already landed rather than
   * adding a second copy of them; `written` is where a resume starts.
   * Kept across a failure and cleared on success.
   */
  job: null,
  /**
   * Set when the customer presses "إيقاف" while the write is running. Read at
   * the next chunk boundary: a chunk is one transaction and stopping inside it
   * would mean stopping inside a commit, which is not a thing that can be done
   * safely. Between chunks the import is exactly as resumable as it is after a
   * tab is discarded, which is a state everything downstream already handles.
   */
  stopRequested: false,
  /**
   * True while a write, a cancellation or a close is in flight. Every import
   * action is guarded by it, so a second press cannot start a second write
   * over the first — §49.
   */
  busy: false,
};

const IGNORE = '';

// ── test seams ──
//
// The import flow is driven by a file picker and by failures that are hard to
// stage from outside. These let the resumption tests put the screen into the
// states that matter without faking the module they are testing.

/** The job this screen is holding. */
export function __jobForTest() {
  return state.job;
}

/** The mapping this screen is holding. */
export function __mappingForTest() {
  return { ...state.mapping };
}

export function __setMappingForTest(mapping, resolved = {}) {
  state.mapping = { ...mapping };
  state.resolved = { ...resolved };
}

/** The write path, reached without the button — so a test can check that the
 *  rules are the write's rules and not the screen's. */
export async function __runForTest() {
  await run();
}

/** Leave a stopped job behind, as a tab discarded mid-import would. */
export async function __stopJobForTest(written) {
  const { records } = currentPlan();
  state.job = {
    id: uid('job').slice(4),
    startedAt: Date.now(),
    fileName: state.file?.name || '',
    fileSize: state.file?.size || 0,
    fileFingerprint: state.fingerprint,
    sheetName: state.sheet?.sheetName || '',
    mapping: { ...state.mapping },
    resolved: { ...state.resolved },
    total: records.length,
    written,
    failedAt: written,
    created: { categories: [], locations: [], folders: [] },
  };
  await persistJobCritical(state.job, JOB.STOPPED);
  return state.job;
}

/** What the import screen is still holding, as booleans — so a test can see
 *  that a closed import let go of the file without being handed the file. */
export function __importMemoryForTest() {
  return {
    file: state.file !== null,
    sheet: state.sheet !== null,
    fingerprint: state.fingerprint !== null,
    limit: state.limit !== null,
    mapping: Object.keys(state.mapping).length > 0,
    resolved: Object.keys(state.resolved).length > 0,
    mappingLocked: state.mappingLocked,
    progress: state.progress !== null,
    stopRequested: state.stopRequested,
    job: state.job !== null,
  };
}

export async function startSpreadsheetImport() {
  // Known to be blocked: say so now rather than after the customer has gone
  // looking for a file.
  if (importRecoveryState.checked && !importRecoveryState.ready) {
    openRecoveryBlocked();
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xlsm,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void openSpreadsheetImport(file);
  };
  input.click();
}

/**
 * What this file *is*, rather than what it is called.
 *
 * Name and size were not identity. Two exports of the same sheet a week apart
 * carry the same name and can easily carry the same byte count, and resuming
 * one import into the other file's rows would write last week's numbers under
 * this week's record ids. The content decides.
 *
 * The file size is already capped, so hashing it is affordable. A failure here
 * is not papered over with the old weaker match: an import that cannot be
 * identified starts fresh, which is always safe, rather than resuming
 * something it cannot prove it belongs to.
 */
async function fingerprint(file) {
  if (!globalThis.crypto?.subtle?.digest) {
    throw new AppError(
      'تعذّر التحقق من هوية الملف في هذا المتصفح. أعد المحاولة أو استخدم متصفحاً مدعوماً.',
      { code: 'sheet/fingerprint-unavailable' },
    );
  }
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    // Never a weaker identity. An import that cannot be identified is one that
    // cannot be safely resumed, and resuming the wrong file writes its numbers
    // under the other file's record ids.
    throw new AppError(
      'تعذّر التحقق من هوية الملف في هذا المتصفح. أعد المحاولة أو استخدم متصفحاً مدعوماً.',
      { code: 'sheet/fingerprint-unavailable', cause: error },
    );
  }
}

/**
 * Undo an import, and say so on the screen while it happens.
 *
 * The distinction this exists to make: closing the screen on a half-written
 * import keeps what it wrote, because those are real records. Cancelling says
 * the import was a mistake, and takes its records back out — only its records,
 * found by the `importJobId` each one carries, plus any category, location or
 * folder the import itself created that nothing else has since pointed at.
 *
 * The job is marked `rolling-back` before the first delete, so a tab that dies
 * half way through leaves evidence rather than a half-undone import that looks
 * finished. Running it again from there finishes the job: deleting records
 * that are already gone deletes nothing.
 */
async function rollback(job) {
  if (!job?.id) return { removed: 0, taxonomy: 0 };
  // Durable before the first delete, or no delete at all: a tab that dies
  // after deleting has begun must leave a job that says so, or the half that
  // is left looks like an import that was never cancelled.
  markJobActive(job.id);
  try {
    await persistJobCritical(job, JOB.ROLLING_BACK);
    state.step = 'running';
    state.progress = { done: 0, total: job.written || 0, stage: 'جارٍ التراجع عن الاستيراد…' };
    renderImport();

    const result = await repository.rollbackImport(job.id, job.created, {
      onProgress: (removed) => {
        state.progress = {
          done: removed,
          total: Math.max(removed, job.written || 0),
          stage: 'جارٍ التراجع عن الاستيراد…',
        };
        renderImport();
      },
    });

    await persistJobCritical({ ...job, written: 0 }, JOB.ROLLED_BACK);
    return result;
  } finally {
    markJobInactive(job.id);
  }
}

/** Opens the flow for a file that is already in hand. */
export async function openSpreadsheetImport(file) {
  try {
    // Before the file is touched: every interrupted import is back in a known
    // state, and any cancellation a closed tab left half done is finished. If
    // one cannot be, this refuses — no fingerprint, no parse, no job, nothing
    // written — because importing into a half-undone import is the one thing
    // that would make both of them impossible to reason about.
    try {
      await ensureImportReady();
    } catch (error) {
      if (error?.code === 'import/recovery-blocked') { openRecoveryBlocked(); return; }
      throw error;
    }

    // What the file is, from its name and size alone — before the fingerprint,
    // which reads every byte to hash them. A file too large to import is
    // refused here, not after it has been read into memory.
    validateSpreadsheetFileMetadata(file);

    // Identity next, before anything expensive. A file that cannot be
    // identified cannot be safely resumed, so there is no point parsing it —
    // and this throws rather than continuing with a weaker identity.
    const fileFingerprint = await fingerprint(file);

    const limit = importLimit();
    const sheet = await readSpreadsheet(file, { rowLimit: limit.effective });

    // No inventory load. Matching taxonomy by name needs the categories,
    // locations and folders, which are held in full anyway; how much room the
    // plan has left is a count, asked of the counter and of the store. Neither
    // needs twenty thousand records in memory — that is what this used to do.
    const room = await importRoom();

    state.file = file;
    state.sheet = sheet;
    state.limit = limit;
    state.room = room;
    state.fingerprint = fileFingerprint;
    state.step = 'map';
    state.progress = null;

    // The same file, picked again after an import of it stopped — or after the
    // tab died while it was running: continue that job rather than starting a
    // second one beside it, with the mapping and the answers the customer gave
    // the first time. Any other file starts fresh.
    const previous = await findUnfinishedJob(fileFingerprint);
    const sameSheet = previous && previous.sheetName === sheet.sheetName;
    if (previous && !sameSheet) {
      // Same bytes, different worksheet selected: the rows are not the rows
      // that job was writing, so resuming it would put them under the wrong ids.
      console.info('[import] a stopped job matched the file but not the sheet; starting fresh');
    }

    if (previous && sameSheet) {
      state.job = { ...previous, failedAt: previous.written };
      state.mapping = { ...previous.mapping };
      state.resolved = { ...(previous.resolved || {}) };
      // Writing has already begun under this mapping, so the mapping is what
      // the records already written mean. Changing it now would give one
      // import two meanings.
      state.mappingLocked = previous.written > 0;
      state.step = 'confirm';
    } else {
      // The same bytes, already imported in full. Asked, not refused: a second
      // import of one file is sometimes deliberate, and always something the
      // customer should choose rather than stumble into.
      const done = previous ? null : await findCompletedJob(fileFingerprint);
      if (done && !(await confirmAction({
        title: 'سبق استيراد هذا الملف',
        message: `سبق استيراد هذا الملف بتاريخ ${formatDate(done.updatedAt)} (${formatNumber(done.written || 0)} قطعة). استيراده مرة أخرى يضيف نسخة ثانية من قطعه.`,
        icon: '⚠️',
        confirmLabel: 'استيراده مرة أخرى',
      }))) {
        releaseImportMemory();
        return;
      }
      state.job = null;
      state.mapping = guessMapping(sheet.headers);
      state.resolved = {};
      state.mappingLocked = false;
    }

    openSheet('simport');
    renderImport();
  } catch (error) {
    releaseImportMemory();
    toastError(error, 'تعذّر قراءة الملف');
  }
}

/**
 * How many more records the plan has room for.
 *
 * The usage counter is the authority where there is one. It is checked
 * against a direct count of the store, and the larger of the two is used: a
 * counter that has fallen behind must not let an import through that the
 * inventory itself says does not fit. No plan limit, or an unlimited one, is
 * no ceiling.
 */
async function importRoom() {
  const quota = quotaStatus();
  if (!quota || quota.limit == null || quota.limit < 0) return Infinity;
  const counts = await repository.recordCounts();
  const used = Math.max(quota.used ?? 0, counts?.live ?? 0);
  return Math.max(0, quota.limit - used);
}

// ── releasing the file ─────────────────────────────────────────────────────
//
// One place, because an import can end in many: completed, cancelled,
// continued later, refused, closed by a swipe. A parsed 50,000-row sheet is
// tens of megabytes, and every path that used to close the sheet without
// clearing it kept all of it alive until the next import replaced it.
//
// Releasing memory is not abandoning a job. A stopped job keeps everything it
// needs on the device — fingerprint, sheet, mapping, answers, progress — and
// continues when the customer picks the same file again, which is parsed
// afresh and matched by its fingerprint.

function releaseImportMemory() {
  state.file = null;
  state.sheet = null;
  state.fingerprint = null;
  state.limit = null;
  state.room = Infinity;
  state.mapping = {};
  state.resolved = {};
  state.mappingLocked = false;
  state.progress = null;
  state.stopRequested = false;
  state.job = null;
  state.step = 'map';
}

function importSheetOpen() {
  return Boolean($('sh-simport')?.classList.contains('open'));
}

/** Closes the sheet and lets go of the file, once nothing is still using it. */
function closeImport() {
  closeSheet('simport');
  releaseWhenIdle();
}

/** A write in flight still holds the job and its progress; the release waits
 *  for it to finish rather than pulling the state out from under it. */
function releaseWhenIdle() {
  if (!state.busy && !importSheetOpen()) releaseImportMemory();
}

// Every way the sheet can close — a button, the overlay, the back gesture —
// goes through here.
onSheetClose('simport', releaseWhenIdle);

// ── a cancellation that could not be finished ──────────────────────────────

/**
 * The one screen shown instead of an import while an earlier cancellation is
 * unfinished. It offers the retry, and nothing that would start a new import.
 */
function openRecoveryBlocked() {
  releaseImportMemory();
  state.step = 'blocked';
  openSheet('simport');
  renderImport();
}

function renderBlocked(body, foot) {
  render(body, [
    el('div', { class: 'imp-warnings', role: 'alert' }, [
      el('div', { class: 'imp-warn-title', text: 'يوجد استيراد سابق لم يكتمل التراجع عنه' }),
      el('div', {
        class: 'imp-warn',
        text: 'تعذّر إكمال التراجع عن استيراد سابق. أعد المحاولة قبل بدء استيراد جديد.',
      }),
      el('div', {
        class: 'imp-warn',
        text: 'مخزونك متاح للتصفح كالمعتاد — الاستيراد وحده متوقف حتى يكتمل التراجع.',
      }),
    ]),
  ]);
  render(foot, [
    el('button', {
      class: 'btn btn-s', type: 'button', text: 'إغلاق',
      style: { flex: '1', padding: '12px' },
      onClick: () => closeImport(),
    }),
    el('button', {
      class: 'btn btn-p', type: 'button',
      text: state.busy ? 'جارٍ إكمال التراجع…' : 'إعادة محاولة إكمال التراجع',
      style: { flex: '2', padding: '12px' },
      disabled: state.busy ? true : undefined,
      onClick: () => {
        void guarded(async () => {
          renderImport();
          const result = await runImportRecovery();
          if (result.ready) {
            closeImport();
            toast('اكتمل التراجع عن الاستيراد السابق. يمكنك بدء استيراد جديد الآن.', '✓');
            window.dispatchEvent(new CustomEvent('almakhzan:data-imported'));
          } else {
            toast('تعذّر إكمال التراجع مرة أخرى. حاول لاحقاً.', '⚠');
          }
        });
      },
    }),
  ]);
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

  if (state.step === 'blocked') { renderBlocked(body, foot); return; }
  // Released while a write was finishing in the background: nothing to draw.
  if (!state.sheet) return;
  if (state.step === 'running') { renderRunning(body, foot); return; }
  if (state.step === 'confirm') { renderConfirm(body, foot); return; }
  renderMap(body, foot);
}

function fileLine() {
  const { sheetName, totalRows, truncated, totalKnown, appliedLimit } = state.sheet;
  const limit = state.limit || importLimit();
  // A truncated read does not know how many rows the file holds — that is what
  // stopping early means — so it says what it read rather than inventing a
  // total. And it names which limit was met: a plan allowance the customer can
  // lift, or a per-file ceiling they cannot but can work around.
  const rowText = totalKnown
    ? `${formatNumber(totalRows)} صفّاً`
    : `أول ${formatNumber(appliedLimit)} صفّ`;
  const reason = limit.boundBy === 'plan'
    ? `خطتك تسمح بـ${formatNumber(limit.plan)} صفّاً في الملف الواحد`
    : `الحد ${formatNumber(limit.technical)} صفّاً في الملف الواحد — يمكنك استيراد ملفات إضافية`;
  return el('p', { class: 'sheet-note' }, [
    el('b', { text: state.file.name }),
    ` · ${sheetName} · ${rowText}`,
    truncated ? el('span', { class: 'imp-warn', text: ` — ${reason}` }) : null,
  ]);
}

function renderMap(body, foot) {
  const { headers } = state.sheet;
  const nameMapped = state.mapping.name != null && state.mapping.name >= 0;

  render(body, [
    fileLine(),
    // Once a record has been written, the mapping is what that record means.
    // Changing it now would give one import two meanings — half the rows
    // reading "Ref" as a serial number and half as a SKU — so the way to
    // change it is to abandon this import and start another.
    state.mappingLocked ? el('div', { class: 'imp-warnings' }, [
      el('div', { class: 'imp-warn-title', text: 'المطابقة مثبّتة' }),
      el('div', {
        class: 'imp-warn',
        text: 'بدأت الكتابة بهذه المطابقة، فلا يمكن تغييرها الآن. لتغييرها، ألغِ هذا الاستيراد وابدأ استيراداً جديداً.',
      }),
    ]) : null,
    el('p', { class: 'sheet-note', text: 'طابق أعمدة ملفك على حقول القطعة. ما تتركه «تجاهل» لن يُستورد.' }),
    section('المطابقة', [el('div', { class: 'fsec' }, FIELDS.map((field) => el('div', { class: 'frow' }, [
      el('label', { for: `map-${field.key}`, text: field.label + (field.required ? ' *' : '') }),
      el('select', {
        id: `map-${field.key}`,
        disabled: state.mappingLocked || undefined,
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
      onClick: () => closeImport() }),
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
  if (state.mappingLocked) return null;
  // A column the customer has already answered is not asked again, including
  // one they answered with "ignore" — which leaves no trace in the mapping and
  // so used to come back on the next render.
  const answered = new Set(Object.keys(state.resolved || {}).map(Number));
  const columns = ambiguousColumns(state.sheet.headers, state.mapping)
    .filter((column) => !answered.has(column.index));
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
  const newCount = newTaxonomy.categories.length + newTaxonomy.locations.length + newTaxonomy.folders.length;
  const resuming = state.job?.failedAt != null;

  // ── the two limits, which are not the same limit ──────────────────────
  //
  // §38–§41. `importRows` says how many rows of a file may be *read*. The item
  // quota says how many records the workspace may *hold*. They constrain
  // different things and a file can meet either one first, so the screen shows
  // both rather than showing whichever happens to bite and leaving the
  // customer to guess which number they are looking at.
  //
  // What will actually be written is the smallest of three: the rows that
  // parsed cleanly, the rows the read limit allowed in, and the room left in
  // the plan. When the plan is the smallest of the three the import is blocked
  // — not trimmed to fit. Writing the first eight hundred rows of a thousand
  // and calling it done is how a customer ends up with an inventory they
  // believe is complete and is not.
  const limit = state.limit || importLimit();
  const room = state.room;
  // A resumed import's written records are already counted in `used`, so what
  // has to fit is what is left to write, not the whole file again.
  const pending = resuming
    ? Math.max(0, records.length - (state.job.written || 0))
    : records.length;
  const overflow = pending > room;

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
      el('div', { class: 'imp-warn', text: `${formatNumber(pending)} قطعة ستُضاف، والمتبقي في خطتك ${formatNumber(room)}. ارفع الخطة أو احذف ما لم يعد يلزمك.` }),
      el('div', { class: 'imp-warn', text: 'لن يُستورد جزء من الملف — الاستيراد الناقص يبدو مكتملاً وهو ليس كذلك.' }),
    ]) : null,

    section('الحدود', [
      el('div', { class: 'imp-stats' }, [
        el('div', { class: 'imp-stat' }, [
          el('b', { text: limit.unlimitedPlan ? formatNumber(limit.technical) : formatNumber(limit.effective) }),
          limit.boundBy === 'plan' ? ' صفّاً لكل ملف (خطتك)' : ' صفّاً لكل ملف (حد الملف)',
        ]),
        el('div', { class: 'imp-stat' }, [
          el('b', { text: room === Infinity ? 'بلا حد' : formatNumber(room) }),
          ' قطعة متبقية في خطتك',
        ]),
        el('div', { class: overflow ? 'imp-stat imp-error' : 'imp-stat imp-ready' }, [
          el('b', { text: formatNumber(overflow ? 0 : pending) }),
          ' قطعة ستُكتب الآن',
        ]),
      ]),
    ]),

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
        text: 'وجد نَظْم استيراداً سابقاً توقف قبل اكتماله. يمكنك متابعة العملية من حيث توقفت.',
      }),
      el('div', {
        class: 'imp-warn',
        text: `كُتبت ${formatNumber(state.job.written)} من ${formatNumber(state.job.total)} قطعة. المتابعة تكمل من حيث توقف — الصفوف المكتوبة تُكتب بنفس هويتها، فلا تتكرر.`,
      }),
      el('div', {
        class: 'imp-warn',
        text: 'الإغلاق يُبقي ما كُتب كقطع حقيقية في المخزون. الإلغاء يحذف ما كتبه هذا الاستيراد وحده.',
      }),
    ]) : null,

    el('p', { class: 'sheet-note', text: 'الاستيراد يضيف فقط. لا يُعدّل قطعة موجودة ولا يحذف شيئاً.' }),
  ]);

  // Two different things a customer can mean by "stop", kept apart because
  // they have opposite consequences — §21.
  //
  //   إغلاق والمتابعة لاحقاً  — the records written so far stay. Real inventory.
  //   إلغاء الاستيراد        — they were a mistake; take them back out.
  //
  // One button called "إلغاء" could only have meant one of those, and whichever
  // it meant would have been the wrong one for somebody.
  const written = resuming ? state.job.written || 0 : 0;

  render(foot, resuming ? [
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' } }, [
      el('button', {
        class: 'btn btn-p', type: 'button',
        text: `متابعة الاستيراد (${formatNumber(state.job.total - written)} متبقية)`,
        style: { width: '100%', padding: '12px' },
        disabled: state.busy ? true : undefined,
        onClick: () => { void guarded(run); },
      }),
      el('div', { style: { display: 'flex', gap: '8px' } }, [
        el('button', {
          class: 'btn btn-s', type: 'button',
          text: 'إغلاق والمتابعة لاحقاً',
          style: { flex: '1', padding: '12px' },
          disabled: state.busy ? true : undefined,
          onClick: () => {
            void guarded(async () => {
              // Kept as a stopped job, not abandoned: the customer said
              // "later", and picking the same file again has to find it. The
              // file itself is let go — the job holds everything needed to
              // match it again.
              try {
                await persistJobCritical(state.job, JOB.STOPPED);
                toast(`حُفظ الاستيراد — ${formatNumber(written)} قطعة مكتوبة حتى الآن`, '💾');
              } catch (error) {
                toastError(error, 'تعذّر حفظ حالة الاستيراد');
              }
              closeImport();
            });
          },
        }),
        el('button', {
          class: 'btn btn-d', type: 'button',
          text: written
            ? `إلغاء الاستيراد وحذف ${formatNumber(written)} قطعة`
            : 'إلغاء الاستيراد',
          style: { flex: '1', padding: '12px' },
          disabled: state.busy ? true : undefined,
          onClick: () => {
            // A destructive action, and the confirmation says the number out
            // loud rather than asking "are you sure?" about nothing in
            // particular.
            if (written && !confirm(
              `سيُحذف ${formatNumber(written)} قطعة كتبها هذا الاستيراد، ولن تُنقل للمحذوفات.`
              + '\nالقطع التي كانت موجودة قبل الاستيراد لن تتأثر.',
            )) return;
            void guarded(async () => {
              const job = state.job;
              try {
                const result = await rollback(job);
                closeImport();
                toast(
                  result.removed
                    ? `أُلغي الاستيراد — حُذفت ${formatNumber(result.removed)} قطعة`
                    : 'أُلغي الاستيراد',
                  '↩',
                );
                window.dispatchEvent(new CustomEvent('almakhzan:data-imported'));
              } catch (error) {
                if (error?.code === 'import/job-unsaved') {
                  // `rolling-back` never reached the device, so nothing was
                  // deleted: the job is still the stopped job it was.
                  state.step = 'confirm';
                  renderImport();
                  toastError(error, 'تعذّر إلغاء الاستيراد');
                  return;
                }
                // Deleting began and did not finish. The job is at
                // `rolling-back`, which recovery finishes — and until it does,
                // no new import starts on top of it.
                importRecoveryState.ready = false;
                importRecoveryState.error = error;
                importRecoveryState.pendingRollbackJobs = [job.id];
                console.error('[import] rollback failed part way; recovery is now required', error);
                openRecoveryBlocked();
                toastError(error, 'تعذّر إلغاء الاستيراد');
              }
            });
          },
        }),
      ]),
    ]),
  ] : [
    el('button', {
      class: 'btn btn-s', type: 'button',
      text: 'رجوع',
      style: { flex: '1', padding: '12px' },
      onClick: () => {
        state.step = 'map';
        renderImport();
      },
    }),
    el('button', {
      class: 'btn btn-p', type: 'button',
      text: `استيراد ${formatNumber(records.length)} قطعة`,
      style: { flex: '2', padding: '12px' },
      disabled: records.length && !overflow && !state.busy ? undefined : true,
      onClick: () => { void guarded(run); },
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
  // A cancellation is not something to interrupt: stopping half way through an
  // undo leaves exactly the mess the undo exists to clear.
  const undoing = stage.includes('التراجع');

  render(body, [
    fileLine(),
    el('div', { class: 'import-progress', role: 'status', 'aria-live': 'polite' }, [
      el('div', { text: stage }),
      el('div', { text: `${formatNumber(done)} من ${formatNumber(total)}` }),
    ]),
  ]);

  render(foot, undoing ? [] : [
    el('button', {
      class: 'btn btn-s', type: 'button',
      text: state.stopRequested ? 'جارٍ الإيقاف…' : 'إيقاف',
      style: { flex: '1', padding: '12px' },
      disabled: state.stopRequested ? true : undefined,
      // Not an abort. It stops at the end of the chunk being written, and what
      // was written stays — the screen that follows is where "continue" and
      // "cancel and remove" are offered.
      onClick: () => {
        state.stopRequested = true;
        renderImport();
        toast('سيتوقف الاستيراد بعد إتمام الدفعة الحالية', '⏸');
      },
    }),
  ]);
}

// ── writing ────────────────────────────────────────────────────────────────

const CHUNK = 200;

/**
 * One import action at a time — §49.
 *
 * Writing, stopping and cancelling all move the same records, and a second
 * press while the first is in flight is not a second intention, it is the
 * customer wondering whether the first one registered. So the second press
 * does nothing, and the buttons say why by going flat while the work runs.
 */
async function guarded(run) {
  if (state.busy) return;
  state.busy = true;
  try {
    await run();
  } finally {
    state.busy = false;
    if (importSheetOpen()) {
      if (state.step !== 'running') renderImport();
    } else {
      releaseWhenIdle();
    }
  }
}

async function run() {
  // A stop asked for during the previous attempt is not a stop asked for now.
  state.stopRequested = false;
  const { records, newTaxonomy } = currentPlan();

  // The screen already said what the limits are. These are the rules, asked
  // again where they cannot be skipped by anything the screen did or did not
  // draw — and they are two rules, not one. The first is how much of a file
  // may be read; the second is how much the workspace may hold.
  const allowed = canImportRows(state.sheet.rows.length);
  if (!allowed.allowed) {
    toast(allowed.message, '⚠');
    return;
  }

  // One job, kept across a retry. A failed import used to leave the written
  // chunks behind and send the customer back to a button that would write
  // everything again — 400 duplicates, then the rest of the file.
  const resuming = Boolean(state.job);
  const job = state.job || {
    id: uid('job').slice(4),
    startedAt: Date.now(),
    fileName: state.file?.name || '',
    fileSize: state.file?.size || 0,
    fileFingerprint: state.fingerprint,
    sheetName: state.sheet?.sheetName || '',
    mapping: { ...state.mapping },
    resolved: { ...state.resolved },
    total: records.length,
    written: 0,
    failedAt: null,
    created: { categories: [], locations: [], folders: [] },
  };
  job.total = records.length;

  // ── capacity, at the commit ──
  //
  // The preview said what fits; the plan may have filled up since. Asked
  // again now, before the job is recorded, before any category is created and
  // before the first record — and only for the records that will actually be
  // new: on a resume, rows already written (including a chunk that landed
  // without its progress being recorded, which a replay rewrites under the
  // same ids) are looked up by id and cost nothing. Blocked, not trimmed: an
  // import that writes the part that fits looks complete and is not.
  try {
    const remainingIds = records.slice(Math.max(0, job.written || 0))
      .map((record) => record.id || importItemId(job.id, record.sourceLine));
    const present = await repository.backend.existingIds('items', remainingIds);
    await repository.assertItemCapacity(remainingIds.length - present.size);
  } catch (error) {
    state.room = await importRoom();
    toastError(error, 'لا تتسع خطتك لهذا الملف');
    return;
  }

  state.job = job;
  markJobActive(job.id);

  state.step = 'running';
  state.progress = { done: job.written || 0, total: records.length, stage: 'جارٍ التحضير…' };
  renderImport();

  try {
    // ── 1. the job exists on the device before anything carries its id ──
    //
    // Every record this import writes has the job's id inside its own id and
    // in its provenance. A record written under a job the device does not
    // know about can be neither resumed nor cancelled, so if the job cannot
    // be written, nothing is.
    if (!resuming) await persistJobCritical(job, JOB.PREPARED);

    // ── 2. taxonomy: ownership recorded before creation ──
    //
    // The order is the point. Each name this import needs gets its id chosen
    // first; the ids go into the job's `created` list and the job is written;
    // only then are the rows created, with exactly those ids. If the tab dies
    // between the two, the job claims an id that was never created — which a
    // rollback deletes as a no-op. The other order — create, then record —
    // left a window in which a crash made an import's own category look like
    // one the customer had before, and no rollback would ever take it back.
    //
    // Matched by name against what exists, so a resumed import does not add a
    // second "ساعات" beside the first; and a name planned by an earlier
    // attempt keeps the id it was given then.
    state.progress = { ...state.progress, stage: 'جارٍ إنشاء التصنيفات…' };
    renderImport();
    const created = { categories: {}, locations: {}, folders: {} };
    const planned = {
      categories: { ...(job.plannedTaxonomy?.categories || {}) },
      locations: { ...(job.plannedTaxonomy?.locations || {}) },
      folders: { ...(job.plannedTaxonomy?.folders || {}) },
    };
    const claimed = {
      categories: new Set(job.created?.categories || []),
      locations: new Set(job.created?.locations || []),
      folders: new Set(job.created?.folders || []),
    };
    const toCreate = [];
    const PREFIX = { categories: 'cat', locations: 'loc', folders: 'fld' };
    for (const collection of ['categories', 'locations', 'folders']) {
      for (const name of newTaxonomy[collection]) {
        const key = normalizeArabic(name);
        const plannedId = planned[collection][key];
        const already = repository.state[collection].find((row) => (plannedId && row.id === plannedId)
          || normalizeArabic(row.name) === key);
        if (already) { created[collection][key] = already.id; continue; }
        const id = plannedId || uid(PREFIX[collection]);
        planned[collection][key] = id;
        claimed[collection].add(id);
        created[collection][key] = id;
        toCreate.push({ collection, id, name });
      }
    }
    job.plannedTaxonomy = planned;
    job.created = {
      categories: [...claimed.categories],
      locations: [...claimed.locations],
      folders: [...claimed.folders],
    };
    await persistJobCritical(job, resuming ? JOB.RUNNING : JOB.PREPARED);

    for (const { collection, id, name } of toCreate) {
      if (collection === 'categories') await repository.saveCategory({ id, name, icon: '📦' });
      else if (collection === 'locations') await repository.saveLocation({ id, name });
      else await repository.saveFolder({ id, name, icon: '🗂', color: '#2563FF' });
    }

    // ── 3. running, durably, before the first record ──
    await persistJobCritical(job, JOB.RUNNING);

    // Each record's id comes from the job and its row, so writing a chunk
    // twice writes the same documents twice rather than two copies of them.
    const resolved = attachTaxonomy(records, created).map((record) => ({
      ...record,
      id: record.id || importItemId(job.id, record.sourceLine),
      // Provenance as a field rather than as a naming convention. This is what
      // a cancellation selects on, and what tells anyone reading a record
      // later which file and which line it came from.
      importJobId: job.id,
      sourceLine: record.sourceLine,
    }));

    // Resume where it stopped. `written` is the last boundary recorded on the
    // device; if the tab died between a chunk committing and its progress
    // being recorded, that one chunk is written again — which changes
    // nothing, because the ids are the same.
    const start = Math.min(Math.max(0, job.written || 0), resolved.length);
    state.progress = { done: start, total: resolved.length, stage: 'جارٍ كتابة القطع…' };
    renderImport();

    // ── 4. chunks: commit, then record the boundary, then the next ──
    //
    // The record of how far it got is what makes the gap after a crash one
    // chunk wide. If that record cannot be written the import stops here,
    // rather than writing chunk after chunk with nothing on the device saying
    // they exist — the chunk just committed is safe to replay, several are an
    // ever-wider gap.
    for (let i = start; i < resolved.length; i += CHUNK) {
      const slice = resolved.slice(i, i + CHUNK);
      await repository.bulkCreateItems(slice, { log: false });
      job.written = Math.min(resolved.length, i + CHUNK);
      job.failedAt = null;
      await persistJobCritical(job, JOB.RUNNING);
      state.progress = {
        done: job.written,
        total: resolved.length,
        stage: 'جارٍ كتابة القطع…',
      };
      renderImport();

      // Asked to stop, between two transactions. Everything written so far is
      // committed and the job records where it reached, which is the same
      // state a discarded tab leaves behind — so continuing later, and
      // cancelling instead, both work from here.
      if (state.stopRequested) {
        state.stopRequested = false;
        job.failedAt = job.written;
        state.mappingLocked = job.written > 0;
        await persistJobCritical(job, JOB.STOPPED);
        await logImport(ACTIONS.SPREADSHEET_IMPORT_STOPPED, job, { status: 'stopped' });
        state.step = 'confirm';
        renderImport();
        toast(`أُوقف الاستيراد بعد ${formatNumber(job.written)} قطعة`, '⏸');
        return;
      }
    }

    await persistJobCritical(job, JOB.COMPLETED);
    const written = resolved.length - start;
    await logImport(ACTIONS.SPREADSHEET_IMPORTED, job, { status: 'completed' });
    closeImport();
    toast(`أُضيفت ${formatNumber(written)} قطعة`, '📥');
    window.dispatchEvent(new CustomEvent('almakhzan:data-imported'));
  } catch (error) {
    await stopAfterFailure(job, error);
  } finally {
    markJobInactive(job.id);
  }
}

/**
 * What a failed write leaves behind.
 *
 * A record write that failed leaves an import that can be continued, so the
 * job is recorded as stopped and the screen offers to continue. A job write
 * that failed is different: the device would not keep the record of what
 * happened, so nothing more is written — not even the `stopped` status. The
 * job on disk still says where it last durably reached; it reads as
 * interrupted the next time this file is picked, and resumes from there.
 */
async function stopAfterFailure(job, error) {
  const bookkeeping = String(error?.code || '').startsWith('import/job-');
  if (!bookkeeping) {
    job.failedAt = job.written;
    job.lastErrorCode = error?.code || null;
    // From here on the mapping is what the written records mean.
    state.mappingLocked = job.written > 0;
    try {
      await persistJobCritical(job, JOB.STOPPED);
      state.step = 'confirm';
      if (importSheetOpen()) renderImport();
      toastError(error, 'تعذّر الاستيراد');
      return;
    } catch (persistError) {
      error = persistError;
    }
  }
  closeImport();
  toastError(error, 'تعذّر الاستيراد');
}

/**
 * One activity entry for an import, when it ends — completed, or stopped by the
 * customer. Structured, so the log can say "12,430 قطعة من inventory.xlsx"
 * rather than the same "200 added" sixty times over.
 */
async function logImport(action, job, extra = {}) {
  const { rowStatus } = state.sheet ? currentPlan() : { rowStatus: null };
  await repository.log(action, {
    importJobId: job.id,
    fileName: job.fileName,
    fingerprint: job.fileFingerprint,
    totalRows: job.total,
    writtenRows: job.written,
    errors: rowStatus ? rowStatus.error.length : null,
    startedAt: job.startedAt,
    completedAt: Date.now(),
    summary: `${formatNumber(job.written)} قطعة من ${job.fileName}`,
    ...extra,
  });
}
