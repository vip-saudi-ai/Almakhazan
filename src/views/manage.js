// Categories, folders, locations, Trash, settings, auth panel, import/export.

import { icon } from '../icons.js';
import {
  APP_VERSION, CAT_ICONS, FOLDER_COLORS, FOLDER_ICONS, ROLE_LABELS, SCHEMA_VERSION, UNCATEGORIZED_ID,
} from '../config.js';
import { AI_STATUS_LABELS, aiAvailability } from '../ai.js';
import {
  currentSession, listMembers, registerWithEmail, sendPasswordReset,
  signInWithEmail, signInWithGoogle, signOutUser,
} from '../auth.js';
import { FirebaseStatus, firebaseContext } from '../firebase.js';
import { applyMerge, exportExcel, exportJSON, readBackupFile, saveBackupFile } from '../exporting.js';
import {
  RESTORE_BLOCKED_MESSAGE, RestoreStage, restoreFromBackup, stageLabel, unfinishedRestore,
} from '../restore.js';
import { withFullInventory } from '../inventory-load.js';
import { queryInventory } from '../query.js';
import { storageEstimate } from '../local-store.js';
import { openTeamSheet, openWorkspaceSheet } from './team.js';
import { startSpreadsheetImport } from './sheet-import.js';
import { MigrationState, migrationStatus, runMigration } from '../migration.js';
import { repository } from '../repository.js';
import {
  assistantLabel, currentPlan, onSubscriptionChange, planStatus, planUsage, quotaStatus,
} from '../subscription.js';
import { UNLIMITED } from '../entitlements.js';
import { openPlansSheet } from './plans.js';
import { ImageTier, bindImageSrc } from '../storage.js';
import { $, el, formatDate, formatNumber, render, setText } from '../utils.js';
import { primaryImage, validateImport } from '../validation.js';
import {
  closeSheet, confirmAction, emptyState, flashSuccess, openSheet, optionList, toast, toastError, withBusy,
} from '../ui.js';
import { renderHome, view as homeView } from './home.js';
import { goTab } from '../navigation.js';

/**
 * Exact reference counts, applied after the list is already on screen.
 *
 * These lists used to count the loaded window, so a workspace of 6,000 records
 * described its folders by whichever 200 happened to be newest. The real count
 * comes from an index and may cost a round trip, so the list draws immediately
 * with what it has and corrects itself a moment later — which is both faster
 * and, at the moment it matters, true. Nodes that have since been re-rendered
 * away simply are not found, and nothing happens.
 */
function applyExactCounts(root, group, suffix = 'قطعة') {
  if (!root) return;
  repository.taxonomyCounts().then((counts) => {
    for (const [id, n] of counts[group]) {
      const node = root.querySelector(`[data-count-for="${CSS.escape(id)}"]`);
      if (node) node.textContent = `${formatNumber(n)} ${suffix}`;
      const labelled = root.querySelector(`[data-count-label="${CSS.escape(id)}"]`);
      if (labelled) {
        labelled.setAttribute('aria-label', `${labelled.dataset.countName}، ${formatNumber(n)} ${suffix}`);
      }
    }
  });
}

// ── categories ──
let selectedCategoryIcon = '📦';
let editingCategoryId = null;

export function renderCategories() {
  const grid = $('catgrid');
  if (!grid) return;
  // Drawn immediately from nothing and corrected a moment later by
  // `applyExactCounts`, which asks the backend for an index range count per
  // category. Drawing a number first and correcting it would flash a wrong
  // one; drawing none and filling it in does not.
  render(grid, [
    ...repository.state.categories.map((category) => {
      const count = 0;
      return el('div', { class: 'catcell' }, [
        el('button', {
          class: 'catcell-main', type: 'button',
          'aria-label': `${category.name}، ${formatNumber(count)} قطعة`,
          'data-count-label': category.id,
          'data-count-name': category.name,
          onClick: () => { filterHomeByCategory(category.id); },
        }, [
          el('div', { class: 'catcico', text: category.icon, 'aria-hidden': 'true' }),
          el('div', { class: 'catcname', text: category.name }),
          el('div', { class: 'catccount', 'data-count-for': category.id, text: `${formatNumber(count)} قطعة` }),
        ]),
        repository.canWrite() ? el('div', { class: 'catcell-acts' }, [
          el('button', {
            class: 'catcell-act', type: 'button', 'aria-label': `تعديل ${category.name}`,
            onClick: () => openCategorySheet(category.id),
          }, [icon('edit', { size: 15 })]),
          el('button', {
            class: 'catcell-act danger', type: 'button', 'aria-label': `حذف ${category.name}`,
            onClick: () => deleteCategoryFlow(category.id),
          }, [icon('trash', { size: 15 })]),
        ]) : null,
      ]);
    }),
    repository.canWrite() ? el('button', {
      class: 'catcell catcell-add', type: 'button', onClick: () => openCategorySheet(),
    }, [
      el('div', { class: 'catcico' }, [icon('plus', { size: 20 })]),
      el('div', { class: 'catcname', text: 'تصنيف جديد' }),
    ]) : null,
  ]);
  applyExactCounts(grid, 'categories');
}

/** Jumps to the inventory tab showing only this category, across all folders. */
function filterHomeByCategory(categoryId) {
  homeView.folderId = null;
  homeView.categoryPill = categoryId;
  homeView.page = 1;
  goTab('home');
  renderHome();
}

export function openCategorySheet(categoryId = null) {
  editingCategoryId = categoryId;
  const category = categoryId ? repository.state.categories.find((c) => c.id === categoryId) : null;
  selectedCategoryIcon = category?.icon || '📦';

  setText('cat-sheet-title', category ? 'تعديل التصنيف' : 'تصنيف جديد');
  $('cat-name').value = category?.name || '';
  renderIconPicker($('caticolist'), CAT_ICONS, selectedCategoryIcon, (icon) => {
    selectedCategoryIcon = icon;
  });
  openSheet('cat', { focus: '#cat-name' });
}

async function saveCategory() {
  const name = $('cat-name').value.trim();
  if (!name) { toast('أدخل اسم التصنيف', '⚠'); return; }
  try {
    await repository.saveCategory({ id: editingCategoryId || undefined, name, icon: selectedCategoryIcon });
    toast(editingCategoryId ? 'تم التحديث' : 'تمت الإضافة', '✓');
    closeSheet('cat');
  } catch (error) {
    toastError(error, 'تعذّر حفظ التصنيف');
  }
}

async function deleteCategoryFlow(categoryId) {
  const category = repository.state.categories.find((c) => c.id === categoryId);
  const usage = await repository.categoryUsage(categoryId);

  if (!usage) {
    const confirmed = await confirmAction({
      title: `حذف تصنيف "${category.name}"؟`,
      message: 'لا توجد قطع مرتبطة بهذا التصنيف.',
      icon: '◈',
      confirmLabel: 'حذف',
    });
    if (!confirmed) return;
    try {
      await repository.deleteCategory(categoryId, 'uncategorize');
      toast('حُذف التصنيف', '✓');
    } catch (error) {
      toastError(error, 'تعذّر حذف التصنيف');
    }
    return;
  }

  // Referential integrity: the user chooses where the affected items go.
  const alternatives = repository.state.categories.filter((c) => c.id !== categoryId);
  optionList($('reassign-target'), [
    { value: '__uncategorized__', label: '📦 نقلها إلى "غير مصنّف"' },
    ...alternatives.map((c) => ({ value: c.id, label: `↳ ${c.icon} ${c.name}` })),
  ], '__uncategorized__');

  setText('reassign-title', `حذف "${category.name}"`);
  setText('reassign-message', `${formatNumber(usage)} قطعة مرتبطة بهذا التصنيف. اختر وجهتها قبل الحذف.`);

  $('reassign-confirm').onclick = async () => {
    const target = $('reassign-target').value;
    try {
      const moved = await repository.deleteCategory(
        categoryId,
        target === '__uncategorized__' ? 'uncategorize' : 'reassign',
        target === '__uncategorized__' ? null : target,
      );
      closeSheet('reassign');
      toast(`حُذف التصنيف ونُقلت ${formatNumber(moved)} قطعة`, '✓');
    } catch (error) {
      toastError(error, 'تعذّر حذف التصنيف');
    }
  };
  openSheet('reassign');
}

// ── icon / color pickers ──
function renderIconPicker(container, icons, selected, onPick) {
  if (!container) return;
  render(container, icons.map((icon) => el('button', {
    class: `icon-pick${icon === selected ? ' on' : ''}`,
    type: 'button',
    text: icon,
    'aria-label': `أيقونة ${icon}`,
    'aria-pressed': String(icon === selected),
    onClick: (event) => {
      onPick(icon);
      container.querySelectorAll('.icon-pick').forEach((node) => {
        node.classList.remove('on');
        node.setAttribute('aria-pressed', 'false');
      });
      event.currentTarget.classList.add('on');
      event.currentTarget.setAttribute('aria-pressed', 'true');
    },
  })));
}

function renderColorPicker(container, colors, selected, onPick) {
  if (!container) return;
  render(container, colors.map((color) => el('button', {
    class: `color-pick${color === selected ? ' on' : ''}`,
    type: 'button',
    style: { background: color },
    'aria-label': `لون ${color}`,
    'aria-pressed': String(color === selected),
    onClick: (event) => {
      onPick(color);
      container.querySelectorAll('.color-pick').forEach((node) => {
        node.classList.remove('on');
        node.setAttribute('aria-pressed', 'false');
      });
      event.currentTarget.classList.add('on');
      event.currentTarget.setAttribute('aria-pressed', 'true');
    },
  })));
}

// ── folders ──
let editingFolderId = null;
let selectedFolderIcon = '🗂';
let selectedFolderColor = '#007AFF';

export function openFolderSheet(folderId = null) {
  if (!repository.canWrite()) { toast('صلاحيتك للعرض فقط', '🔒'); return; }
  editingFolderId = folderId;
  const folder = folderId ? repository.folder(folderId) : null;

  selectedFolderIcon = folder?.icon || '🗂';
  selectedFolderColor = folder?.color || '#007AFF';

  setText('fldshtitle', folder ? 'تعديل المجلد' : 'مجلد جديد');
  $('fld-name').value = folder?.name || '';
  $('fld-desc').value = folder?.description || '';
  $('flddelbtn').style.display = folder ? '' : 'none';

  renderIconPicker($('fldiclist'), FOLDER_ICONS, selectedFolderIcon, (icon) => { selectedFolderIcon = icon; });
  renderColorPicker($('fldcolorlist'), FOLDER_COLORS, selectedFolderColor, (color) => { selectedFolderColor = color; });

  openSheet('fld', { focus: '#fld-name' });
}

async function saveFolder() {
  const name = $('fld-name').value.trim();
  if (!name) { toast('أدخل اسم المجلد', '⚠'); return; }
  try {
    await repository.saveFolder({
      id: editingFolderId || undefined,
      name,
      description: $('fld-desc').value.trim(),
      icon: selectedFolderIcon,
      color: selectedFolderColor,
    });
    toast(editingFolderId ? 'تم تحديث المجلد' : 'تم إنشاء المجلد', '🗂');
    closeSheet('fld');
  } catch (error) {
    toastError(error, 'تعذّر حفظ المجلد');
  }
}

async function deleteFolderFlow() {
  const folder = repository.folder(editingFolderId);
  if (!folder) return;
  const count = await repository.countItemsReferencing('folderId', folder.id);

  const confirmed = await confirmAction({
    title: `حذف مجلد "${folder.name}"؟`,
    message: count
      ? `${formatNumber(count)} قطعة ستعود إلى الجرد الرئيسي (لن تُحذف).`
      : 'المجلد فارغ.',
    icon: '📁',
    confirmLabel: 'حذف المجلد',
  });
  if (!confirmed) return;

  try {
    const moved = await repository.deleteFolder(folder.id);
    closeSheet('fld');
    flashSuccess();
    toast(moved ? `حُذف المجلد وعادت ${formatNumber(moved)} قطعة للجرد` : 'حُذف المجلد', '🗑');
  } catch (error) {
    toastError(error, 'تعذّر حذف المجلد');
  }
}

// ── locations ──
export function openLocationsSheet() {
  renderLocations();
  openSheet('loc');
}

/** "N قطعة", or an honest phrase when the number is not known. */
async function describeCount() {
  const counts = await repository.recordCounts();
  return counts ? `${formatNumber(counts.live)} قطعة` : 'كل ما في مخزونك';
}

function renderLocations() {
  const list = $('loc-list');
  if (!list) return;

  render(list, [
    ...repository.state.locations.map((location) => {
      const count = 0;
      return el('div', { class: 'srow' }, [
        el('div', { class: 'srowiw', text: '📍', 'aria-hidden': 'true' }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'srowl', text: location.name }),
          el('div', { class: 'srowd', 'data-count-for': location.id, text: `${formatNumber(count)} قطعة` }),
        ]),
        repository.canWrite() ? el('button', {
          class: 'catcell-act danger', type: 'button',
          'aria-label': `حذف ${location.name}`,
          onClick: async () => {
            // The number in a destructive confirmation is the number of records
            // the deletion will rewrite — asked of the backend, never counted
            // off the loaded window.
            const exact = await repository.countItemsReferencing('locationId', location.id);
            const confirmed = await confirmAction({
              title: `حذف موقع "${location.name}"؟`,
              message: exact ? `${formatNumber(exact)} قطعة ستصبح بلا موقع محدد.` : 'لا توجد قطع في هذا الموقع.',
              icon: '📍',
              confirmLabel: 'حذف',
            });
            if (!confirmed) return;
            try {
              await repository.deleteLocation(location.id);
              renderLocations();
              toast('حُذف الموقع', '✓');
            } catch (error) {
              toastError(error, 'تعذّر حذف الموقع');
            }
          },
        }, [icon('trash', { size: 15 })]) : null,
      ]);
    }),
    !repository.state.locations.length ? el('div', { class: 'srow' }, [
      el('div', { class: 'srowd', text: 'لا توجد مواقع' }),
    ]) : null,
  ]);
  applyExactCounts(list, 'locations');
}

async function addLocation() {
  const input = $('loc-name');
  const name = input.value.trim();
  if (!name) { toast('أدخل اسم الموقع', '⚠'); return; }
  try {
    await repository.saveLocation({ name });
    input.value = '';
    renderLocations();
    toast('أُضيف الموقع', '📍');
  } catch (error) {
    toastError(error, 'تعذّر إضافة الموقع');
  }
}

// ── trash ──
/**
 * The Trash has its own index, so it has its own query.
 *
 * A deleted record is old by definition and sorts out of a newest-first
 * window, so this used to load the entire inventory on the way in. It does not
 * need to: a trashed record carries a numeric `deletedAt` and a live one
 * carries null, and IndexedDB leaves null out of an index — so the `deletedAt`
 * index contains exactly the deleted records and nothing else.
 */
//
// Paged, newest deletion first. It used to read one page of 200 and stop, so a
// Trash that had grown past 200 hid everything older — records that could be
// neither restored nor purged. The index orders by `deletedAt` and then by
// primary key, so two records deleted in the same millisecond keep a stable
// order across pages. Restoring or purging re-reads the page the customer is
// on rather than sending them back to the first.

const TRASH_PAGE = 50;
const trashView = { page: 1, ticket: 0 };

export async function openTrashSheet() {
  trashView.page = 1;
  openSheet('trash');
  await renderTrash();
}

async function renderTrash() {
  const list = $('trash-list');
  if (!list) return;
  const ticket = ++trashView.ticket;
  if (!list.childElementCount) render(list, [el('div', { class: 'srowd', text: 'جارٍ القراءة…' })]);

  let result;
  try {
    result = await queryInventory({ trashed: true, sort: 'newest', page: trashView.page, perPage: TRASH_PAGE }, {
      // Only the cloud adapter, which answers from what it holds, needs this.
      ensure: () => withFullInventory('جارٍ قراءة المحذوفات…'),
    });
  } catch (error) {
    console.error('[trash] could not be read', error);
    result = null;
  }
  // A restore on page 3 followed quickly by a purge: only the newest read paints.
  if (ticket !== trashView.ticket) return;
  if (!result?.answerable) {
    render(list, [emptyState('🗑', 'تعذّر قراءة المحذوفات', 'حاول مرة أخرى')]);
    return;
  }
  trashView.page = result.page;
  const trashed = result.rows;

  if (!trashed.length) {
    render(list, [emptyState('🗑', 'سلة المحذوفات فارغة', 'القطع المحذوفة تظهر هنا ويمكن استعادتها')]);
    return;
  }

  const pages = result.totalPages;
  const pager = pages && pages > 1 ? el('nav', { class: 'trash-pager', 'aria-label': 'صفحات المحذوفات',
    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '12px 4px' } }, [
    el('button', {
      class: 'btn btn-g', type: 'button', text: 'السابقة',
      disabled: trashView.page <= 1 || undefined,
      onClick: () => { trashView.page -= 1; void renderTrash(); },
    }),
    el('span', { class: 'lsub', 'aria-live': 'polite',
      text: `صفحة ${formatNumber(trashView.page)} من ${formatNumber(pages)} · ${formatNumber(result.total)} قطعة` }),
    el('button', {
      class: 'btn btn-g', type: 'button', text: 'التالية',
      disabled: trashView.page >= pages || undefined,
      onClick: () => { trashView.page += 1; void renderTrash(); },
    }),
  ]) : null;

  render(list, [...trashed.map((item) => {
    const image = primaryImage(item);
    let thumb;
    if (image) {
      const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
      bindImageSrc(img, image, { tier: ImageTier.THUMB });
      thumb = el('div', { class: 'lthumb' }, [img]);
    } else {
      thumb = el('div', { class: 'lthumb', text: repository.category(item.categoryId).icon, 'aria-hidden': 'true' });
    }

    return el('div', { class: 'litem trash-row' }, [
      thumb,
      el('div', { class: 'linfo' }, [
        el('div', { class: 'lname', text: item.name || '—' }),
        el('div', { class: 'lsub', text: `حُذفت ${formatDate(item.deletedAt)}` }),
      ]),
      el('div', { class: 'trash-acts' }, [
        el('button', {
          class: 'btn btn-g trash-btn', type: 'button',
          onClick: async () => {
            try {
              await repository.restoreItem(item.id);
              void renderTrash();
              toast('استُعيدت القطعة', '↩');
            } catch (error) {
              if (error?.code === 'item/sku-conflict') { await resolveRestoreConflict(item, error); return; }
              toastError(error, 'تعذّر استعادة القطعة');
            }
          },
        }, [el('span', { class: 'ico-inline', 'aria-hidden': 'true' }, [icon('restore', { size: 16 })]), 'استعادة']),
        el('button', {
          class: 'btn btn-d trash-btn', type: 'button', text: 'حذف نهائي',
          onClick: async () => {
            const confirmed = await confirmAction({
              title: `حذف "${item.name}" نهائياً؟`,
              message: 'لا يمكن التراجع عن هذا الإجراء.',
              icon: '⚠️',
              confirmLabel: 'حذف نهائياً',
              requirePhrase: 'حذف',
            });
            if (!confirmed) return;
            try {
              await repository.purgeItem(item.id);
              void renderTrash();
              toast('حُذفت نهائياً', '🗑');
            } catch (error) {
              toastError(error, 'تعذّر الحذف النهائي');
            }
          },
        }),
      ]),
    ]);
  }), pager]);
}

/**
 * A trashed record whose SKU a live record now carries. Nothing has changed
 * yet; the customer chooses. A generated SKU can simply be replaced with a
 * fresh one as the record comes back. A SKU the customer typed is theirs, so
 * the only way forward offered is to edit the record and choose another.
 */
async function resolveRestoreConflict(item, error) {
  const message = `الرمز "${error.sku}" مستخدم على "${error.conflictName || 'قطعة أخرى'}".`;
  if (error.generated) {
    const renew = await confirmAction({
      title: 'لا يمكن استعادة القطعة لأن الرمز SKU مستخدم على قطعة أخرى.',
      message: `${message} يمكن إعطاؤها رمزاً جديداً واستعادتها.`,
      icon: '🔖',
      confirmLabel: 'إنشاء رمز جديد واستعادة',
    });
    if (!renew) return;
    try {
      const { sku } = await repository.restoreItem(item.id, undefined, { newSku: true });
      void renderTrash();
      toast(`استُعيدت القطعة برمز ${sku}`, '↩');
    } catch (retryError) {
      toastError(retryError, 'تعذّر استعادة القطعة');
    }
    return;
  }
  const edit = await confirmAction({
    title: 'لا يمكن استعادة القطعة لأن الرمز SKU مستخدم على قطعة أخرى.',
    message: `${message} عدّل رمز إحدى القطعتين ثم أعد المحاولة.`,
    icon: '🔖',
    confirmLabel: 'تعديل القطعة',
  });
  if (edit) {
    closeSheet('trash');
    setTimeout(() => { void import('./item-form.js').then(({ openItemForm }) => openItemForm({ itemId: item.id })); }, 240);
  }
}

// ── import ──
let pendingImport = null;

async function startImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      // Read once: the bytes give the backup its identity, then its content.
      const { data: parsed, sourceFingerprint } = await readBackupFile(file);
      const result = validateImport(parsed);
      if (!result.ok) {
        toast(result.errors[0] || 'ملف غير صالح', '✕');
        return;
      }
      pendingImport = { ...result, sourceFingerprint };
      showImportSummary(result, file.name);
    } catch (error) {
      toastError(error, 'تعذّر قراءة الملف');
    }
  };
  input.click();
}

function showImportSummary(result, filename) {
  setText('import-file', filename);
  render($('import-stats'), [
    el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(result.stats.items) }), ' قطعة']),
    el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(result.stats.folders) }), ' مجلد']),
    el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(result.stats.categories) }), ' تصنيف']),
    el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(result.stats.locations) }), ' موقع']),
  ]);

  const warnings = $('import-warnings');
  // An unfinished restore is said up front, on the screen that would start
  // another one — not only after the customer has confirmed.
  void unfinishedRestore().then((job) => {
    if (!job) return;
    warnings.style.display = '';
    warnings.prepend(el('div', { class: 'imp-warn', text: 'اختر ملف الاستعادة نفسه ثم «استبدال» لإكمالها.' }));
    warnings.prepend(el('div', { class: 'imp-warn-title', role: 'alert', text: RESTORE_BLOCKED_MESSAGE }));
  });
  if (result.warnings.length) {
    warnings.style.display = '';
    render(warnings, [
      el('div', { class: 'imp-warn-title', text: `${result.warnings.length} تنبيه` }),
      ...result.warnings.slice(0, 8).map((warning) => el('div', { class: 'imp-warn', text: `• ${warning}` })),
      result.warnings.length > 8 ? el('div', { class: 'imp-warn', text: `• و${result.warnings.length - 8} تنبيهاً آخر` }) : null,
    ]);
  } else {
    warnings.style.display = 'none';
    render(warnings, []);
  }

  openSheet('import');
}

async function runImport(mode) {
  if (!pendingImport?.data) return;
  const data = pendingImport.data;

  if (mode === 'restore') {
    const confirmed = await confirmAction({
      title: 'استبدال كل البيانات الحالية؟',
      message: `سيُستبدل المخزون الحالي (${await describeCount()}) بمحتوى الملف. تُؤخذ نسخة أمان تلقائياً قبل أي تغيير، وإن تعذّر حفظها تتوقف العملية.`,
      icon: '⚠️',
      confirmLabel: 'استبدال',
      requirePhrase: 'استبدال',
    });
    if (!confirmed) return;
  }

  await withBusy($(mode === 'merge' ? 'import-merge' : 'import-restore'), 'جارٍ التنفيذ…', async () => {
    try {
      if (mode === 'merge') {
        const { added } = await applyMerge(data);
        toast(`أُضيف ${formatNumber(added)} سجل`, '✓');
      } else {
        const result = await restoreFromBackup(data, {
          sourceFingerprint: pendingImport.sourceFingerprint,
          saveBackup: (text) => saveBackupFile(text, 'nazm_safety'),
          onProgress: ({ stage, done, total }) => {
            const label = stageLabel(stage);
            setText('import-progress', stage === RestoreStage.DONE || total <= 1
              ? label
              : `${label} ${formatNumber(done)} / ${formatNumber(total)}`);
          },
        });
        toast(`استُعيد ${formatNumber(result.restored)} سجل`, '✓');
      }
      pendingImport = null;
      setText('import-progress', '');
      closeSheet('import');
      renderHome();
    } catch (error) {
      setText('import-progress', '');
      toastError(error, 'فشل الاستيراد');
    }
  });
}

// ── full exports ──
//
// One path per format, used by every button that exports. An export is a
// statement about the whole inventory, so it — and only it — loads the whole
// inventory, explicitly, says so while it does, and refuses rather than write
// a short file that looks complete. Settings used to call the exporter
// directly against the window and fail with "the inventory is incomplete".

export async function runFullExcelExport() {
  if (!(await withFullInventory('جارٍ قراءة المخزون كاملاً للتصدير…'))) return false;
  try {
    exportExcel();
    toast('تم التصدير', '📊');
    return true;
  } catch (error) {
    toastError(error, 'فشل تصدير Excel');
    return false;
  }
}

export async function runFullJsonExport() {
  if (!(await withFullInventory('جارٍ قراءة المخزون كاملاً للتصدير…'))) return false;
  try {
    exportJSON();
    toast('تم تصدير البيانات — بدون ملفات الصور', '💾');
    return true;
  } catch (error) {
    toastError(error, 'فشل تصدير البيانات');
    return false;
  }
}

// ── settings ──
export function renderSettings() {
  renderAuthPanel();
  renderPlanPanel();
  renderAiPanel();
  renderDataPanel();
  renderMigrationPanel();
  setText('app-version', `الجرد الذكي للمقتنيات والأصول — v${APP_VERSION} · مخطط ${SCHEMA_VERSION}`);
}

function renderAuthPanel() {
  const panel = $('auth-panel');
  if (!panel) return;
  const session = currentSession();
  const { status } = firebaseContext();

  if (status === FirebaseStatus.UNAVAILABLE || status === FirebaseStatus.UNCONFIGURED) {
    render(panel, [
      el('div', { class: 'srow' }, [
        el('div', { class: 'srowiw', style: { background: 'rgba(255,149,0,.15)' }, text: '📴', 'aria-hidden': 'true' }),
        el('div', [
          el('div', { class: 'srowl', text: 'وضع محلي' }),
          el('div', { class: 'srowd', text: 'البيانات محفوظة على هذا الجهاز فقط — لا مزامنة ولا نسخ سحابي' }),
        ]),
      ]),
    ]);
    return;
  }

  if (!session.user) {
    render(panel, [
      el('div', { class: 'auth-intro', text: 'سجّل الدخول لمزامنة مقتنياتك بين أجهزتك وتفعيل التعرّف على الصور.' }),
      el('div', { class: 'frow' }, [
        el('label', { for: 'auth-email', text: 'البريد' }),
        el('input', { id: 'auth-email', type: 'email', autocomplete: 'email', placeholder: 'name@example.com' }),
      ]),
      el('div', { class: 'frow' }, [
        el('label', { for: 'auth-password', text: 'كلمة المرور' }),
        el('input', { id: 'auth-password', type: 'password', autocomplete: 'current-password', placeholder: '••••••••' }),
      ]),
      el('div', { class: 'auth-actions' }, [
        el('button', {
          class: 'btn btn-p', type: 'button', text: 'دخول', id: 'auth-signin',
          onClick: (event) => authAction(event.currentTarget, () => signInWithEmail($('auth-email').value.trim(), $('auth-password').value)),
        }),
        el('button', {
          class: 'btn btn-s', type: 'button', text: 'حساب جديد',
          onClick: (event) => authAction(event.currentTarget, () => registerWithEmail($('auth-email').value.trim(), $('auth-password').value)),
        }),
      ]),
      el('button', {
        class: 'btn btn-s auth-google', type: 'button', text: 'الدخول بحساب Google',
        onClick: (event) => authAction(event.currentTarget, signInWithGoogle),
      }),
      el('button', {
        class: 'auth-link', type: 'button', text: 'نسيت كلمة المرور؟',
        onClick: async () => {
          const email = $('auth-email').value.trim();
          if (!email) { toast('أدخل بريدك أولاً', '⚠'); return; }
          try {
            await sendPasswordReset(email);
            toast('أُرسل رابط إعادة التعيين', '✉');
          } catch (error) {
            toastError(error);
          }
        },
      }),
    ]);
    return;
  }

  render(panel, [
    el('div', { class: 'srow' }, [
      el('div', { class: 'srowiw', style: { background: 'rgba(52,199,89,.15)' }, text: '👤', 'aria-hidden': 'true' }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', text: session.user.displayName }),
        el('div', { class: 'srowd', text: `${session.user.email || 'بلا بريد'} · ${ROLE_LABELS[session.role] || session.role}` }),
      ]),
    ]),
    el('button', {
      class: 'btn btn-d', type: 'button', text: 'تسجيل الخروج', style: { width: '100%', marginTop: '10px' },
      onClick: (event) => authAction(event.currentTarget, signOutUser),
    }),
    el('button', {
      class: 'auth-link', type: 'button', text: 'عرض أعضاء مساحة العمل',
      onClick: async () => {
        try {
          const members = await listMembers(session.workspaceId);
          toast(`${formatNumber(members.length)} عضو`, '👥');
        } catch (error) {
          toastError(error, 'تعذّر جلب الأعضاء');
        }
      },
    }),
  ]);
}

function authAction(button, action) {
  return withBusy(button, '…', async () => {
    try {
      await action();
    } catch (error) {
      toastError(error);
    }
  });
}

// ── plan & subscription ────────────────────────────────────────────────────
const STATUS_LABELS = {
  free: 'الخطة المجانية',
  trialing: 'فترة تجريبية',
  active: 'اشتراك نشط',
  past_due: 'دفعة متأخرة',
  canceled: 'اشتراك ملغى',
  inactive: 'اشتراك متوقف',
  local: 'هذا الجهاز فقط',
};

/**
 * Shows the plan the server says is in force, and what is left of it. The
 * numbers come from counters only the backend writes, so this card cannot be
 * talked into showing a bigger allowance than the customer has.
 */
export function renderPlanPanel() {
  const panel = $('plan-panel');
  if (!panel) return;

  const status = planStatus();
  if (status === 'local' || status === 'local-free') {
    // What the device-only policy actually is, stated — not implied by an
    // absent account. And honest about the data: nothing here is synced or
    // backed up anywhere else.
    const quota = quotaStatus();
    const text = status === 'local-free'
      ? `بلا حساب: على هذا الجهاز فقط، بحدود الخطة المجانية (${formatNumber(quota?.limit ?? 0)} قطعة). البيانات غير متزامنة ولا نسخة لها خارج الجهاز. أنشئ حساباً لمزامنة مخزنك.`
      : 'نسخة تجريبية على هذا الجهاز: بلا حدود خطة. البيانات غير متزامنة ولا نسخة لها خارج الجهاز.';
    render(panel, [
      el('div', { class: 'srow', style: { cursor: 'default' } }, [
        el('div', { class: 'srowiw', style: { background: 'rgba(142,142,147,.15)' }, text: '📱', 'aria-hidden': 'true' }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'srowl', text: 'هذا الجهاز فقط' }),
          el('div', { class: 'srowd', text }),
        ]),
      ]),
    ]);
    return;
  }

  const plan = currentPlan();
  const assistant = assistantLabel();
  const quota = quotaStatus();
  const rows = planUsage();
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  const headline = byKey.items;
  const ratio = headline && headline.limit !== UNLIMITED && headline.limit > 0
    ? Math.min(1, headline.used / headline.limit)
    : 0;
  const tone = quota?.level === 'full' ? 'full' : quota?.level === 'warn' ? 'warn' : '';

  render(panel, [
    // The headline: which plan, and how much of its main allowance is gone.
    el('div', { class: 'plan-head' }, [
      el('div', { class: 'plan-head-top' }, [
        el('span', { class: 'plan-pill', text: plan.id === 'free' ? 'الخطة المجانية' : `خطة ${plan.name.ar}` }),
        // The pill already says "free"; repeating it as a status says nothing.
        status === 'free' ? null : el('span', { class: 'plan-status', text: STATUS_LABELS[status] || status }),
      ]),
      headline ? el('div', { class: 'plan-count' }, [
        el('span', { class: 'plan-count-used', text: formatNumber(headline.used) }),
        el('span', {
          class: 'plan-count-of',
          text: headline.limit === UNLIMITED ? 'قطعة' : `/ ${formatNumber(headline.limit)} قطعة`,
        }),
      ]) : null,
      headline && headline.limit !== UNLIMITED ? el('div', { class: 'usage-track' }, [
        el('div', { class: `usage-fill ${tone}`.trim(), style: { width: `${Math.round(ratio * 100)}%` } }),
      ]) : null,
      quota && quota.message ? el('div', { class: `plan-head-note ${quota.level}`, role: 'status', text: quota.message }) : null,
    ]),

    // Then the dimensions that are not the headline, one row each.
    el('div', { class: 'plan-meters' }, [
      meterRow('التخزين', byKey.storage),
      meterRow('مساعد نَظْم', byKey.ai, assistant.included ? 'مشمول' : null),
      meterRow('أعضاء الفريق', byKey.members),
    ].filter(Boolean)),

    el('button', {
      class: 'btn btn-p', type: 'button', style: { width: '100%', marginTop: '12px' },
      text: plan.id === 'free' ? 'عرض الباقات' : 'تغيير الخطة',
      onClick: () => openPlansSheet(),
    }),
  ]);
}

/**
 * One metered dimension. A plan that includes the assistant says "مشمول"
 * rather than counting down credits at the customer — the number is still
 * tracked and enforced server-side, it is just not their problem.
 */
function meterRow(label, row, includedLabel = null) {
  if (!row) return null;
  const unlimited = row.limit === UNLIMITED;
  return el('div', { class: 'plan-meter' }, [
    el('span', { class: 'plan-meter-label', text: label }),
    el('span', { class: 'plan-meter-value' }, includedLabel
      ? [el('span', { class: 'plan-meter-included', text: includedLabel })]
      : [
        el('span', { text: row.format(row.used) }),
        el('span', { class: 'plan-meter-of', text: unlimited ? ' · بلا حد' : ` / ${row.format(row.limit)}` }),
      ]),
  ]);
}


function renderAiPanel() {
  const panel = $('ai-settings');
  if (!panel) return;
  const availability = aiAvailability();
  const colors = { ready: 'var(--green)', offline: 'var(--orange)', unavailable: 'var(--tt)' };

  render(panel, [
    el('div', { class: 'srow', style: { cursor: 'default' } }, [
      el('div', { class: 'srowiw', style: { background: 'rgba(102,126,234,.15)' }, text: '✦', 'aria-hidden': 'true' }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', text: '✦ مساعد نَظْم' }),
        el('div', { class: 'srowd', text: 'يُنفَّذ على الخادم — لا يُخزَّن أي مفتاح في المتصفح' }),
      ]),
      el('span', { class: 'ai-status' }, [
        el('span', { class: 'ai-status-dot', style: { background: colors[availability] } }),
        el('span', { text: AI_STATUS_LABELS[availability] }),
      ]),
    ]),
  ]);
}

const MB = 1024 * 1024;

function humanBytes(bytes) {
  if (bytes >= 1024 * MB) return `${(bytes / 1024 / MB).toFixed(1)} غيغابايت`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} ميغابايت`;
  return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
}

/**
 * Fills in the device-storage line once the browser answers.
 *
 * Browsers report an approximation, and some report nothing at all — so an
 * unknown is said as "unknown" rather than drawn as a zero, and the line
 * still says the one thing that is always true and always worth knowing:
 * whether these records exist anywhere but here.
 */
async function describeDeviceStorage() {
  const note = $('storage-note');
  if (!note) return;
  const cloud = Boolean(currentSession().user) && !currentSession().local;
  const safety = cloud
    ? 'نسخة سحابية موجودة أيضاً.'
    : 'هذه النسخة الوحيدة — نزّل نسخة احتياطية بين حين وآخر.';

  try {
    const estimate = await storageEstimate();
    if (!estimate) {
      note.textContent = `لا يكشف هذا المتصفح عن المساحة المتاحة. ${safety}`;
      return;
    }
    const used = humanBytes(estimate.usage);
    const free = humanBytes(estimate.remaining);
    const tight = estimate.ratio > 0.85;
    note.textContent = tight
      ? `مستخدم ${used}، والمتبقي ${free} فقط — احذف صوراً أو صدّر نسخة قبل أن تمتلئ. ${safety}`
      : `مستخدم ${used}، والمتبقي نحو ${free}. ${safety}`;
  } catch (error) {
    console.error('[settings] storage estimate failed', error);
    note.textContent = safety;
  }
}

function renderDataPanel() {
  const panel = $('data-panel');
  if (!panel) return;

  const { user, local } = currentSession();
  const cloudSession = Boolean(user) && !local;

  // `icon` as a parameter name shadowed the icon() helper this module now
  // imports, so every call inside this function resolved to a string instead
  // of the drawing function. Renamed rather than aliased: a shadowed import
  // fails at the first call that needs the real one, which is how this
  // surfaced — as "icon is not a function" three sections away.
  const row = (glyph, background, title, subtitle, onClick, subtitleId) => el('button', {
    class: 'srow srow-btn', type: 'button', onClick,
  }, [
    el('div', { class: 'srowiw', style: { background }, text: glyph, 'aria-hidden': 'true' }),
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'srowl', text: title }),
      subtitle ? el('div', { class: 'srowd', id: subtitleId, text: subtitle }) : null,
    ]),
    el('div', { class: 'srowc', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
  ]);

  render(panel, [
    // Categories lost their tab to the assistant; they live here now.
    row('◈', 'rgba(99,102,241,.15)', 'التصنيفات والمواقع', 'تنظيم التصنيفات والمواقع المستخدمة في المخزون', () => goTab('cats')),
    // Device-only mode has no members and no other workspace to move to, so
    // these are absent rather than present and refusing.
    cloudSession ? row('👥', 'rgba(37,99,255,.15)', 'الفريق', 'الأعضاء وأدوارهم، ودعوة من يعمل معك', openTeamSheet) : null,
    cloudSession ? row('🗄', 'rgba(147,197,253,.25)', 'المساحات', 'تنقّل بين المساحات التي تنتمي إليها', () => { void openWorkspaceSheet(); }) : null,
    row('📊', 'rgba(52,199,89,.15)', 'تصدير Excel', 'جرد كامل بقيم رقمية وتواريخ حقيقية', () => { void runFullExcelExport(); }),
    // Honest about what the file holds. It is the records, never the image
    // files: on a device-only workspace those stay on the device, and on a
    // cloud workspace they stay in cloud storage.
    repository.session.mode === 'cloud'
      ? row('💾', 'rgba(0,122,255,.15)', 'نسخة بيانات JSON', 'بيانات القطع فقط — ملفات الصور تبقى في التخزين السحابي ولا يتضمنها الملف', () => { void runFullJsonExport(); })
      : row('💾', 'rgba(0,122,255,.15)', 'تصدير بيانات JSON', 'يشمل بيانات القطع فقط، ولا يتضمن ملفات الصور.', () => { void runFullJsonExport(); }),
    row('📄', 'rgba(255,149,0,.15)', 'استيراد من Excel أو CSV', 'طابق الأعمدة بنفسك، وشاهد ما سيُكتب قبل كتابته', () => { void startSpreadsheetImport(); }),
    row('📥', 'rgba(255,149,0,.15)', 'استيراد نسخة JSON', 'دمج أو استبدال، مع تحقق كامل قبل التنفيذ', startImport),
    // The count comes from the index that holds exactly the deleted records,
    // so it is exact and costs nothing — and it fills in a moment after the
    // row is drawn rather than making Settings wait for it.
    row('🗑', 'rgba(142,142,147,.15)', 'سلة المحذوفات',
      'القطع المحذوفة، قابلة للاستعادة', openTrashSheet, 'trash-count'),
    row('📍', 'rgba(175,82,222,.15)', 'المواقع', `${formatNumber(repository.state.locations.length)} موقع`, openLocationsSheet),
    // What this app is using of the device, and whether the browser has agreed
    // not to evict it. On a device-only inventory that is not a cache
    // statistic: it is the difference between "your records are here" and
    // "your records were here until the phone needed room".
    el('div', { class: 'srow', id: 'storage-row' }, [
      el('div', { class: 'srowiw', style: { background: 'rgba(142,142,147,.15)' }, text: '💽', 'aria-hidden': 'true' }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', text: 'مساحة الجهاز' }),
        el('div', { class: 'srowd', id: 'storage-note', text: 'جارٍ القياس…' }),
      ]),
    ]),
  ]);

  void describeDeviceStorage();
  void repository.recordCounts().then((counts) => {
    const node = $('trash-count');
    if (node && counts) node.textContent = `${formatNumber(counts.trashed)} قطعة`;
  });

  const danger = $('danger-panel');
  render(danger, [
    el('button', {
      class: 'srow srow-btn', type: 'button',
      onClick: async () => {
        // clearInventory loads everything before it deletes anything, so the
        // count in the warning is read after that load rather than from the
        // window that happens to be on screen.
        const items = (await repository.recordCounts())?.live ?? null;
        const folders = repository.state.folders.length;
        const confirmed = await confirmAction({
          title: 'حذف كل القطع والمجلدات؟',
          message: items == null
            ? `سيُحذف كل ما في المخزون و${formatNumber(folders)} مجلد نهائياً. التصنيفات والمواقع لن تُحذف. نزّل نسخة احتياطية أولاً.`
            : `سيُحذف ${formatNumber(items)} قطعة و${formatNumber(folders)} مجلد نهائياً. التصنيفات والمواقع لن تُحذف. نزّل نسخة احتياطية أولاً.`,
          icon: '⚠️',
          confirmLabel: 'حذف الكل',
          requirePhrase: 'حذف الكل',
        });
        if (!confirmed) return;
        try {
          await repository.clearInventory();
          flashSuccess();
          toast('حُذفت القطع والمجلدات', '🗑');
          renderHome();
        } catch (error) {
          toastError(error, 'تعذّر الحذف');
        }
      },
    }, [
      el('div', { class: 'srowiw', style: { background: 'var(--danger-soft)' }, 'aria-hidden': 'true' }, [icon('trash')]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', style: { color: 'var(--red)' }, text: 'حذف كل القطع والمجلدات' }),
        el('div', { class: 'srowd', text: 'التصنيفات والمواقع تبقى كما هي' }),
      ]),
    ]),
  ]);
}

// ── migration ──
async function renderMigrationPanel() {
  const panel = $('migration-panel');
  if (!panel) return;

  let status;
  try {
    status = await migrationStatus();
  } catch (error) {
    console.error('[migration] status check failed', error);
    render(panel, []);
    panel.style.display = 'none';
    return;
  }

  if (status.status === MigrationState.NOT_NEEDED) {
    panel.style.display = 'none';
    render(panel, []);
    return;
  }

  panel.style.display = '';

  if (status.status === MigrationState.COMPLETED) {
    render(panel, [
      el('div', { class: 'srow', style: { cursor: 'default' } }, [
        el('div', { class: 'srowiw', style: { background: 'rgba(52,199,89,.15)' }, text: '✓', 'aria-hidden': 'true' }),
        el('div', [
          el('div', { class: 'srowl', text: 'اكتملت ترقية البيانات' }),
          el('div', { class: 'srowd', text: `${formatNumber(status.counts?.actual || 0)} قطعة · ${formatDate(status.completedAt)}` }),
        ]),
      ]),
    ]);
    return;
  }

  render(panel, [
    el('div', { class: 'migrate-card' }, [
      el('div', { class: 'migrate-title', text: '⬆ بيانات من الإصدار السابق' }),
      el('div', { class: 'migrate-sub', text: `وُجدت ${formatNumber(status.counts?.items || 0)} قطعة في "${status.source}". ستُنقل إلى البنية الجديدة، وتُرفع الصور المضمّنة إلى التخزين، مع نسخة احتياطية قبل البدء. البيانات القديمة تبقى كما هي.` }),
      el('div', { class: 'migrate-progress', id: 'migrate-progress', style: { display: 'none' } }, [
        el('div', { class: 'migrate-bar' }, [el('div', { class: 'migrate-bar-fill', id: 'migrate-bar-fill' })]),
        el('div', { class: 'migrate-label', id: 'migrate-label' }),
      ]),
      el('button', {
        class: 'btn btn-p', id: 'migrate-btn', type: 'button', style: { width: '100%' },
        text: status.status === MigrationState.FAILED ? 'إعادة محاولة الترقية' : 'ابدأ الترقية',
        onClick: (event) => startMigration(event.currentTarget),
      }),
    ]),
  ]);
}

async function startMigration(button) {
  const progress = $('migrate-progress');
  progress.style.display = '';

  await withBusy(button, 'جارٍ الترقية…', async () => {
    try {
      const result = await runMigration({
        onProgress: ({ done, total, message }) => {
          const percent = total ? Math.round((done / total) * 100) : 0;
          $('migrate-bar-fill').style.width = `${percent}%`;
          setText('migrate-label', message);
        },
      });
      toast(`اكتملت الترقية — ${formatNumber(result.counts.actual)} قطعة`, '✓');
      if (result.counts.imageFailures) {
        toast(`${formatNumber(result.counts.imageFailures)} صورة لم تُرحَّل`, '⚠');
      }
      renderMigrationPanel();
      renderHome();
    } catch (error) {
      toastError(error, 'فشلت الترقية');
      renderMigrationPanel();
    }
  });
}

// ── wiring ──
export function bindManageViews() {
  $('save-cat-btn')?.addEventListener('click', saveCategory);
  $('save-folder-btn')?.addEventListener('click', saveFolder);
  $('flddelbtn')?.addEventListener('click', deleteFolderFlow);
  $('loc-add')?.addEventListener('click', addLocation);
  $('import-merge')?.addEventListener('click', () => runImport('merge'));
  $('import-restore')?.addEventListener('click', () => runImport('restore'));
  $('new-folder-btn')?.addEventListener('click', () => openFolderSheet());
  $('new-cat-btn')?.addEventListener('click', () => openCategorySheet());

  // This sheet opens from the home screen, which browses a window. An export
  // is about the whole inventory, so the whole inventory is loaded first.
  $('as-excel')?.addEventListener('click', async () => {
    closeSheet('as');
    await runFullExcelExport();
  });
  $('as-json')?.addEventListener('click', async () => {
    closeSheet('as');
    await runFullJsonExport();
  });
  $('as-sheet')?.addEventListener('click', () => { closeSheet('as'); void startSpreadsheetImport(); });
  $('as-import')?.addEventListener('click', () => { closeSheet('as'); startImport(); });

  $('cats-back')?.addEventListener('click', () => goTab('set'));
  window.addEventListener('almakhzan:start-import', startImport);
  window.addEventListener('almakhzan:new-folder', () => openFolderSheet());
  window.addEventListener('almakhzan:edit-folder', (event) => openFolderSheet(event.detail));
}
