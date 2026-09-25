// Categories, folders, locations, Trash, settings, auth panel, import/export.

import { icon } from '../icons.js';
import {
  APP_VERSION, CAT_ICONS, FOLDER_COLORS, FOLDER_ICONS, SCHEMA_VERSION, UNCATEGORIZED_ID,
} from '../config.js';
import { aiAvailability, aiStatusLabel } from '../ai.js';
import { LANGUAGES, getLanguage, onLanguageChange, pick, setLanguage, t } from '../i18n.js';
import { categoryName, locationName, roleLabel } from '../labels.js';
import {
  currentSession, listMembers, registerWithEmail, sendPasswordReset,
  signInWithEmail, signInWithGoogle, signOutUser,
} from '../auth.js';
import { FirebaseStatus, firebaseContext } from '../firebase.js';
import {
  MAX_BACKUP_FILE_BYTES, applyMerge, exportExcel, exportJSON, readBackupFile, saveBackupFile,
} from '../exporting.js';
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
  closeSheet, confirmAction, emptyState, flashSuccess, isSheetOpen, openSheet, optionList, toast, toastError, withBusy,
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
function applyExactCounts(root, group) {
  if (!root) return;
  repository.taxonomyCounts().then((counts) => {
    for (const [id, n] of counts[group]) {
      const node = root.querySelector(`[data-count-for="${CSS.escape(id)}"]`);
      if (node) node.textContent = t('count.items', { count: n });
      const labelled = root.querySelector(`[data-count-label="${CSS.escape(id)}"]`);
      if (labelled) {
        labelled.setAttribute('aria-label', t('home.folderAria', { name: labelled.dataset.countName, items: t('count.items', { count: n }) }));
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
          'aria-label': t('home.folderAria', { name: categoryName(category), items: t('count.items', { count }) }),
          'data-count-label': category.id,
          'data-count-name': categoryName(category),
          onClick: () => { filterHomeByCategory(category.id); },
        }, [
          el('div', { class: 'catcico', text: category.icon, 'aria-hidden': 'true' }),
          el('div', { class: 'catcname', dir: 'auto', text: categoryName(category) }),
          el('div', { class: 'catccount', 'data-count-for': category.id, text: t('count.items', { count }) }),
        ]),
        repository.canWrite() ? el('div', { class: 'catcell-acts' }, [
          el('button', {
            class: 'catcell-act', type: 'button', 'aria-label': t('manage.editNamed', { name: categoryName(category) }),
            onClick: () => openCategorySheet(category.id),
          }, [icon('edit', { size: 15 })]),
          el('button', {
            class: 'catcell-act danger', type: 'button', 'aria-label': t('manage.deleteNamed', { name: categoryName(category) }),
            onClick: () => deleteCategoryFlow(category.id),
          }, [icon('trash', { size: 15 })]),
        ]) : null,
      ]);
    }),
    repository.canWrite() ? el('button', {
      class: 'catcell catcell-add', type: 'button', onClick: () => openCategorySheet(),
    }, [
      el('div', { class: 'catcico' }, [icon('plus', { size: 20 })]),
      el('div', { class: 'catcname', text: t('category.newTitle') }),
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

  setText('cat-sheet-title', category ? t('category.editTitle') : t('category.newTitle'));
  $('cat-name').value = category?.name || '';
  renderIconPicker($('caticolist'), CAT_ICONS, selectedCategoryIcon, (icon) => {
    selectedCategoryIcon = icon;
  });
  openSheet('cat', { focus: '#cat-name' });
}

async function saveCategory() {
  const name = $('cat-name').value.trim();
  if (!name) { toast(t('category.nameRequired'), '⚠'); return; }
  try {
    await repository.saveCategory({ id: editingCategoryId || undefined, name, icon: selectedCategoryIcon });
    toast(editingCategoryId ? t('manage.updated') : t('manage.added'), '✓');
    closeSheet('cat');
  } catch (error) {
    toastError(error, 'category.saveFailed');
  }
}

async function deleteCategoryFlow(categoryId) {
  const category = repository.state.categories.find((c) => c.id === categoryId);
  const usage = await repository.categoryUsage(categoryId);

  if (!usage) {
    const confirmed = await confirmAction({
      // categoryName() localises a seeded category, so it is asked again on a switch.
      title: () => t('category.deleteConfirm', { name: categoryName(category) }),
      messageKey: 'category.deleteEmpty',
      icon: '◈',
      confirmLabelKey: 'common.delete',
    });
    if (!confirmed) return;
    try {
      await repository.deleteCategory(categoryId, 'uncategorize');
      toast(t('category.deletedToast'), '✓');
    } catch (error) {
      toastError(error, 'category.deleteFailed');
    }
    return;
  }

  // Referential integrity: the user chooses where the affected items go.
  const alternatives = repository.state.categories.filter((c) => c.id !== categoryId);
  optionList($('reassign-target'), [
    { value: '__uncategorized__', label: `📦 ${t('category.moveToUncategorized', { name: t('category.uncategorized') })}` },
    ...alternatives.map((c) => ({ value: c.id, label: `↳ ${c.icon} ${categoryName(c)}` })),
  ], '__uncategorized__');

  setText('reassign-title', t('category.reassignTitle', { name: categoryName(category) }));
  setText('reassign-message', t('category.reassignMessage', { count: usage }));

  $('reassign-confirm').onclick = async () => {
    const target = $('reassign-target').value;
    try {
      const moved = await repository.deleteCategory(
        categoryId,
        target === '__uncategorized__' ? 'uncategorize' : 'reassign',
        target === '__uncategorized__' ? null : target,
      );
      closeSheet('reassign');
      toast(t('category.deletedMoved', { count: moved }), '✓');
    } catch (error) {
      toastError(error, 'category.deleteFailed');
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
    'aria-label': t('manage.iconNamed', { icon }),
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
    'aria-label': t('manage.colorNamed', { color }),
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
  if (!repository.canWrite()) { toast(t('error.repo/forbidden.viewer'), '🔒'); return; }
  editingFolderId = folderId;
  const folder = folderId ? repository.folder(folderId) : null;

  selectedFolderIcon = folder?.icon || '🗂';
  selectedFolderColor = folder?.color || '#007AFF';

  setText('fldshtitle', folder ? t('folder.edit') : t('folder.newTitle'));
  $('fld-name').value = folder?.name || '';
  $('fld-desc').value = folder?.description || '';
  $('flddelbtn').style.display = folder ? '' : 'none';

  renderIconPicker($('fldiclist'), FOLDER_ICONS, selectedFolderIcon, (icon) => { selectedFolderIcon = icon; });
  renderColorPicker($('fldcolorlist'), FOLDER_COLORS, selectedFolderColor, (color) => { selectedFolderColor = color; });

  openSheet('fld', { focus: '#fld-name' });
}

async function saveFolder() {
  const name = $('fld-name').value.trim();
  if (!name) { toast(t('folder.nameRequired'), '⚠'); return; }
  try {
    await repository.saveFolder({
      id: editingFolderId || undefined,
      name,
      description: $('fld-desc').value.trim(),
      icon: selectedFolderIcon,
      color: selectedFolderColor,
    });
    toast(editingFolderId ? t('folder.updated') : t('folder.created'), '🗂');
    closeSheet('fld');
  } catch (error) {
    toastError(error, 'folder.saveFailed');
  }
}

async function deleteFolderFlow() {
  const folder = repository.folder(editingFolderId);
  if (!folder) return;
  const count = await repository.countItemsReferencing('folderId', folder.id);

  const confirmed = await confirmAction({
    titleKey: 'folder.deleteConfirm', titleParams: { name: folder.name },
    messageKey: count ? 'folder.deleteMessage' : 'folder.empty', messageParams: { count },
    icon: '📁',
    confirmLabelKey: 'folder.delete',
  });
  if (!confirmed) return;

  try {
    const moved = await repository.deleteFolder(folder.id);
    closeSheet('fld');
    flashSuccess();
    toast(moved ? t('folder.deletedMoved', { count: moved }) : t('folder.deleted'), '🗑');
  } catch (error) {
    toastError(error, 'folder.deleteFailed');
  }
}

// ── locations ──
export function openLocationsSheet() {
  renderLocations();
  openSheet('loc');
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
          el('div', { class: 'srowl', dir: 'auto', text: locationName(location) }),
          el('div', { class: 'srowd', 'data-count-for': location.id, text: t('count.items', { count }) }),
        ]),
        repository.canWrite() ? el('button', {
          class: 'catcell-act danger', type: 'button',
          'aria-label': t('manage.deleteNamed', { name: locationName(location) }),
          onClick: async () => {
            // The number in a destructive confirmation is the number of records
            // the deletion will rewrite — asked of the backend, never counted
            // off the loaded window.
            const exact = await repository.countItemsReferencing('locationId', location.id);
            const confirmed = await confirmAction({
              title: () => t('location.deleteConfirm', { name: locationName(location) }),
              messageKey: exact ? 'location.deleteMessage' : 'location.deleteEmpty', messageParams: { count: exact },
              icon: '📍',
              confirmLabelKey: 'common.delete',
            });
            if (!confirmed) return;
            try {
              await repository.deleteLocation(location.id);
              renderLocations();
              toast(t('location.deleted'), '✓');
            } catch (error) {
              toastError(error, 'location.deleteFailed');
            }
          },
        }, [icon('trash', { size: 15 })]) : null,
      ]);
    }),
    !repository.state.locations.length ? el('div', { class: 'srow' }, [
      el('div', { class: 'srowd', text: t('location.none') }),
    ]) : null,
  ]);
  applyExactCounts(list, 'locations');
}

async function addLocation() {
  const input = $('loc-name');
  const name = input.value.trim();
  if (!name) { toast(t('location.nameRequired'), '⚠'); return; }
  try {
    await repository.saveLocation({ name });
    input.value = '';
    renderLocations();
    toast(t('location.added'), '📍');
  } catch (error) {
    toastError(error, 'location.addFailed');
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
  if (!list.childElementCount) render(list, [el('div', { class: 'srowd', text: t('common.loading') })]);

  let result;
  try {
    result = await queryInventory({ trashed: true, sort: 'newest', page: trashView.page, perPage: TRASH_PAGE }, {
      // Only the cloud adapter, which answers from what it holds, needs this.
      ensure: () => withFullInventory(t('trash.reading')),
    });
  } catch (error) {
    console.error('[trash] could not be read', error);
    result = null;
  }
  // A restore on page 3 followed quickly by a purge: only the newest read paints.
  if (ticket !== trashView.ticket) return;
  if (!result?.answerable) {
    render(list, [emptyState('🗑', t('trash.readFailed'), t('common.retry'))]);
    return;
  }
  trashView.page = result.page;
  const trashed = result.rows;

  if (!trashed.length) {
    render(list, [emptyState('🗑', t('trash.emptyTitle'), t('trash.emptySub'))]);
    return;
  }

  const pages = result.totalPages;
  const pager = pages && pages > 1 ? el('nav', { class: 'trash-pager', 'aria-label': t('trash.pages'),
    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '12px 4px' } }, [
    el('button', {
      class: 'btn btn-g', type: 'button', text: t('trash.previousPage'),
      disabled: trashView.page <= 1 || undefined,
      onClick: () => { trashView.page -= 1; void renderTrash(); },
    }),
    el('span', { class: 'lsub', 'aria-live': 'polite',
      text: t('trash.pageOf', { page: trashView.page, pages, items: t('count.items', { count: result.total }) }) }),
    el('button', {
      class: 'btn btn-g', type: 'button', text: t('trash.nextPage'),
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
        el('div', { class: 'lname', dir: 'auto', text: item.name || '—' }),
        el('div', { class: 'lsub', text: t('trash.deletedOn', { date: formatDate(item.deletedAt) }) }),
      ]),
      el('div', { class: 'trash-acts' }, [
        el('button', {
          class: 'btn btn-g trash-btn', type: 'button',
          onClick: async () => {
            try {
              await repository.restoreItem(item.id);
              void renderTrash();
              toast(t('trash.restored'), '↩');
            } catch (error) {
              if (error?.code === 'item/sku-conflict') { await resolveRestoreConflict(item, error); return; }
              toastError(error, 'trash.restoreFailed');
            }
          },
        }, [el('span', { class: 'ico-inline', 'aria-hidden': 'true' }, [icon('restore', { size: 16 })]), t('trash.restore')]),
        el('button', {
          class: 'btn btn-d trash-btn', type: 'button', text: t('trash.purge'),
          onClick: async () => {
            const confirmed = await confirmAction({
              titleKey: 'trash.purgeTitle', titleParams: { name: item.name },
              messageKey: 'confirm.cannotUndo',
              icon: '⚠️',
              confirmLabelKey: 'trash.purgeConfirm',
              requirePhrase: t('confirm.phraseDelete'),
            });
            if (!confirmed) return;
            try {
              await repository.purgeItem(item.id);
              void renderTrash();
              toast(t('trash.purged'), '🗑');
            } catch (error) {
              toastError(error, 'trash.purgeFailed');
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
  const conflictMessage = () => t('trash.skuUsedBy', { sku: error.sku, name: error.conflictName || t('trash.anotherItem') });
  if (error.generated) {
    const renew = await confirmAction({
      titleKey: 'error.item/sku-conflict',
      message: () => `${conflictMessage()} ${t('trash.skuRenewHint')}`,
      icon: '🔖',
      confirmLabelKey: 'trash.skuRenew',
    });
    if (!renew) return;
    try {
      const { sku } = await repository.restoreItem(item.id, undefined, { newSku: true });
      void renderTrash();
      toast(t('trash.restoredWithSku', { sku }), '↩');
    } catch (retryError) {
      toastError(retryError, 'trash.restoreFailed');
    }
    return;
  }
  const edit = await confirmAction({
    titleKey: 'error.item/sku-conflict',
    message: () => `${conflictMessage()} ${t('trash.skuEditHint')}`,
    icon: '🔖',
    confirmLabelKey: 'trash.editItem',
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
        toast(result.errors[0] || t('backup.invalidFile'), '✕');
        return;
      }
      pendingImport = { ...result, sourceFingerprint };
      showImportSummary(result, file.name);
    } catch (error) {
      toastError(error, 'error.import/read');
    }
  };
  input.click();
}

function showImportSummary(result, filename) {
  setText('import-file', filename);
  render($('import-stats'), [
    el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(result.stats.items) }), ` ${t('backup.statItems', { count: result.stats.items })}`]),
    el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(result.stats.folders) }), ` ${t('backup.statFolders', { count: result.stats.folders })}`]),
    el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(result.stats.categories) }), ` ${t('backup.statCategories', { count: result.stats.categories })}`]),
    el('div', { class: 'imp-stat' }, [el('b', { text: formatNumber(result.stats.locations) }), ` ${t('backup.statLocations', { count: result.stats.locations })}`]),
  ]);

  const warnings = $('import-warnings');
  // An unfinished restore is said up front, on the screen that would start
  // another one — not only after the customer has confirmed.
  void unfinishedRestore().then((job) => {
    if (!job) return;
    warnings.style.display = '';
    warnings.prepend(el('div', { class: 'imp-warn', text: t('backup.chooseSameFile') }));
    warnings.prepend(el('div', { class: 'imp-warn-title', role: 'alert', text: t(RESTORE_BLOCKED_MESSAGE) }));
  });
  if (result.warnings.length) {
    warnings.style.display = '';
    render(warnings, [
      el('div', { class: 'imp-warn-title', text: t('count.warnings', { count: result.warnings.length }) }),
      ...result.warnings.slice(0, 8).map((warning) => el('div', { class: 'imp-warn', text: `• ${warning}` })),
      result.warnings.length > 8 ? el('div', { class: 'imp-warn', text: t('backup.moreWarnings', { count: result.warnings.length - 8 }) }) : null,
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
    const counts = await repository.recordCounts();
    const confirmed = await confirmAction({
      titleKey: 'backup.replaceTitle',
      message: () => t('backup.replaceMessage', { current: counts ? t('count.items', { count: counts.live }) : t('manage.everything') }),
      icon: '⚠️',
      confirmLabelKey: 'backup.replace',
      requirePhrase: t('confirm.phraseReplace'),
    });
    if (!confirmed) return;
  }

  await withBusy($(mode === 'merge' ? 'import-merge' : 'import-restore'), t('common.working'), async () => {
    try {
      if (mode === 'merge') {
        const { added } = await applyMerge(data);
        toast(t('backup.merged', { count: added }), '✓');
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
        toast(t('backup.restored', { count: result.restored }), '✓');
      }
      pendingImport = null;
      setText('import-progress', '');
      closeSheet('import');
      renderHome();
    } catch (error) {
      setText('import-progress', '');
      if (error?.code === 'import/sku-conflict') showMergeSkuConflicts(error.conflicts || []);
      toastError(error, 'backup.importFailed');
    }
  });
}

/**
 * Which records of the file stopped the merge, and why — on the import sheet,
 * where the customer is looking, a few lines at most. Nothing was written.
 */
function showMergeSkuConflicts(conflicts) {
  const warnings = $('import-warnings');
  if (!warnings) return;
  const line = (c) => (c.type === 'existing'
    ? `• «${c.incomingName || t('common.item')}»: ${t('sku.usedBy', { sku: c.sku })}${c.existingName ? ` («${c.existingName}»)` : ''}`
    : `• «${c.incomingName || t('common.item')}»: ${t('sku.duplicateInFile', { sku: c.sku })}`);
  warnings.style.display = '';
  render(warnings, [
    el('div', { class: 'imp-warn-title', role: 'alert', text: t('backup.mergeSkuConflicts', { count: conflicts.length }) }),
    ...conflicts.slice(0, 8).map((c) => el('div', { class: 'imp-warn', text: line(c) })),
    conflicts.length > 8 ? el('div', { class: 'imp-warn', text: t('backup.moreConflicts', { count: conflicts.length - 8 }) }) : null,
  ]);
}

// ── full exports ──
//
// One path per format, used by every button that exports. An export is a
// statement about the whole inventory, so it — and only it — loads the whole
// inventory, explicitly, says so while it does, and refuses rather than write
// a short file that looks complete. Settings used to call the exporter
// directly against the window and fail with "the inventory is incomplete".

export async function runFullExcelExport() {
  if (!(await withFullInventory(t('export.reading')))) return false;
  try {
    exportExcel();
    toast(t('export.done'), '📊');
    return true;
  } catch (error) {
    toastError(error, 'error.export/excel');
    return false;
  }
}

export async function runFullJsonExport() {
  if (!(await withFullInventory(t('export.reading')))) return false;
  try {
    const { bytes, restorable } = exportJSON();
    if (!restorable) {
      // Said now, not on the day the file is needed.
      void confirmAction({
        titleKey: 'export.oversizeTitle',
        messageKey: 'export.oversizeMessage', messageParams: { size: Math.ceil(bytes / 1048576), limit: MAX_BACKUP_FILE_BYTES / 1048576 },
        icon: '⚠️',
        confirmLabelKey: 'common.ok',
      });
      return true;
    }
    toast(t('export.jsonDone'), '💾');
    return true;
  } catch (error) {
    toastError(error, 'error.export/failed');
    return false;
  }
}

// ── settings ──
export function renderSettings() {
  renderLanguagePanel();
  renderAuthPanel();
  renderPlanPanel();
  renderAiPanel();
  renderDataPanel();
  renderMigrationPanel();
  setText('app-version', t('app.versionLine', { version: APP_VERSION, schema: String(SCHEMA_VERSION) }));
}

/**
 * Language, as a radio group: the choice is announced with its state, the
 * current one carries a visible check, and switching redraws the screens in
 * place — nothing is reloaded, and no data is touched.
 */
function renderLanguagePanel() {
  const panel = $('language-panel');
  if (!panel) return;
  const current = getLanguage();
  render(panel, [
    el('div', { class: 'lang-group', role: 'radiogroup', 'aria-labelledby': 'language-heading' }, LANGUAGES.map((lang) => el('button', {
      class: `srow srow-btn lang-option${lang === current ? ' on' : ''}`,
      type: 'button',
      role: 'radio',
      'aria-checked': String(lang === current),
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      // One tab stop for the group, arrows move between the options — the
      // radio-group pattern a screen reader announces as one.
      tabindex: lang === current ? '0' : '-1',
      onClick: () => setLanguage(lang),
      onKeydown: (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const next = LANGUAGES[(LANGUAGES.indexOf(current) + 1) % LANGUAGES.length];
        setLanguage(next);
        $('language-panel')?.querySelector(`[lang="${next}"]`)?.focus();
      },
    }, [
      el('div', { style: { flex: '1' } }, [el('div', { class: 'srowl', text: t(`language.${lang}`) })]),
      lang === current ? el('div', { class: 'srowc', 'aria-hidden': 'true' }, [icon('check', { size: 18 })]) : null,
    ]))),
  ]);
}

// Settings, the open sheets it owns, and the category and location lists,
// redrawn in the new language from what they already hold.
onLanguageChange(() => {
  if ($('v-set')?.classList.contains('active')) renderSettings();
  if (isSheetOpen('trash')) void renderTrash();
  if (isSheetOpen('loc')) renderLocations();
  if (isSheetOpen('import') && pendingImport) showImportSummary(pendingImport, $('import-file')?.textContent || '');
});

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
          el('div', { class: 'srowl', text: t('settings.localMode') }),
          el('div', { class: 'srowd', text: t('settings.localModeSub') }),
        ]),
      ]),
    ]);
    return;
  }

  if (!session.user) {
    render(panel, [
      el('div', { class: 'auth-intro', text: t('auth.intro') }),
      el('div', { class: 'frow' }, [
        el('label', { for: 'auth-email', text: t('auth.email') }),
        el('input', { id: 'auth-email', type: 'email', dir: 'ltr', autocomplete: 'email', placeholder: 'name@example.com' }),
      ]),
      el('div', { class: 'frow' }, [
        el('label', { for: 'auth-password', text: t('auth.password') }),
        el('input', { id: 'auth-password', type: 'password', dir: 'ltr', autocomplete: 'current-password', placeholder: '••••••••' }),
      ]),
      el('div', { class: 'auth-actions' }, [
        el('button', {
          class: 'btn btn-p', type: 'button', text: t('auth.signIn'), id: 'auth-signin',
          onClick: (event) => authAction(event.currentTarget, () => signInWithEmail($('auth-email').value.trim(), $('auth-password').value)),
        }),
        el('button', {
          class: 'btn btn-s', type: 'button', text: t('auth.register'),
          onClick: (event) => authAction(event.currentTarget, () => registerWithEmail($('auth-email').value.trim(), $('auth-password').value)),
        }),
      ]),
      el('button', {
        class: 'btn btn-s auth-google', type: 'button', text: t('auth.google'),
        onClick: (event) => authAction(event.currentTarget, signInWithGoogle),
      }),
      el('button', {
        class: 'auth-link', type: 'button', text: t('auth.forgot'),
        onClick: async () => {
          const email = $('auth-email').value.trim();
          if (!email) { toast(t('auth.emailFirst'), '⚠'); return; }
          try {
            await sendPasswordReset(email);
            toast(t('auth.resetSent'), '✉');
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
        el('div', { class: 'srowl', dir: 'auto', text: session.user.displayName }),
        el('div', { class: 'srowd', text: `${session.user.email || t('common.noEmail')} · ${roleLabel(session.role)}` }),
      ]),
    ]),
    el('button', {
      class: 'btn btn-d', type: 'button', text: t('auth.signOut'), style: { width: '100%', marginTop: '10px' },
      onClick: (event) => authAction(event.currentTarget, signOutUser),
    }),
    el('button', {
      class: 'auth-link', type: 'button', text: t('auth.showMembers'),
      onClick: async () => {
        try {
          const members = await listMembers(session.workspaceId);
          toast(t('auth.memberCount', { count: members.length }), '👥');
        } catch (error) {
          toastError(error, 'auth.membersFailed');
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
/** A subscription status, as the `planStatus.<status>` message. */
const statusLabel = (status) => t(`planStatus.${status}`);

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
      ? t('settings.localFree', { limit: quota?.limit ?? 0 })
      : t('settings.localDev');
    render(panel, [
      el('div', { class: 'srow', style: { cursor: 'default' } }, [
        el('div', { class: 'srowiw', style: { background: 'rgba(142,142,147,.15)' }, text: '📱', 'aria-hidden': 'true' }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'srowl', text: t('planStatus.local') }),
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
        el('span', { class: 'plan-pill', text: plan.id === 'free' ? t('planStatus.free') : t('plan.pill', { name: pick(plan.name) }) }),
        // The pill already says "free"; repeating it as a status says nothing.
        status === 'free' ? null : el('span', { class: 'plan-status', text: statusLabel(status) }),
      ]),
      headline ? el('div', { class: 'plan-count' }, [
        el('span', { class: 'plan-count-used', text: formatNumber(headline.used) }),
        el('span', {
          class: 'plan-count-of',
          text: headline.limit === UNLIMITED ? t('plan.itemsUnit') : `/ ${t('count.items', { count: headline.limit })}`,
        }),
      ]) : null,
      headline && headline.limit !== UNLIMITED ? el('div', { class: 'usage-track' }, [
        el('div', { class: `usage-fill ${tone}`.trim(), style: { width: `${Math.round(ratio * 100)}%` } }),
      ]) : null,
      quota && quota.message ? el('div', { class: `plan-head-note ${quota.level}`, role: 'status', text: quota.message }) : null,
    ]),

    // Then the dimensions that are not the headline, one row each.
    el('div', { class: 'plan-meters' }, [
      meterRow(t('plan.storage'), byKey.storage),
      meterRow(t('ai.assistantName'), byKey.ai, assistant.included ? t('plan.included') : null),
      meterRow(t('plan.teamMembers'), byKey.members),
    ].filter(Boolean)),

    el('button', {
      class: 'btn btn-p', type: 'button', style: { width: '100%', marginTop: '12px' },
      text: plan.id === 'free' ? t('home.showPlans') : t('plan.change'),
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
        el('span', { class: 'plan-meter-of', text: unlimited ? ` · ${t('plan.unlimited')}` : ` / ${row.format(row.limit)}` }),
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
        el('div', { class: 'srowl', text: t('settings.assistant') }),
        el('div', { class: 'srowd', text: t('settings.assistantSub') }),
      ]),
      el('span', { class: 'ai-status' }, [
        el('span', { class: 'ai-status-dot', style: { background: colors[availability] } }),
        el('span', { text: aiStatusLabel(availability) }),
      ]),
    ]),
  ]);
}

const MB = 1024 * 1024;

function humanBytes(bytes) {
  if (bytes >= 1024 * MB) return t('bytes.gb', { value: (bytes / 1024 / MB).toFixed(1) });
  if (bytes >= MB) return t('bytes.mb', { value: String(Math.round(bytes / MB)) });
  return t('bytes.kb', { value: String(Math.max(1, Math.round(bytes / 1024))) });
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
    ? t('storage.cloudCopy')
    : t('storage.onlyCopy');

  try {
    const estimate = await storageEstimate();
    if (!estimate) {
      note.textContent = `${t('storage.unknown')} ${safety}`;
      return;
    }
    const used = humanBytes(estimate.usage);
    const free = humanBytes(estimate.remaining);
    const tight = estimate.ratio > 0.85;
    note.textContent = tight
      ? `${t('storage.tight', { used, free })} ${safety}`
      : `${t('storage.usage', { used, free })} ${safety}`;
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
    row('◈', 'rgba(99,102,241,.15)', t('settings.taxonomy'), t('settings.taxonomySub'), () => goTab('cats')),
    // Device-only mode has no members and no other workspace to move to, so
    // these are absent rather than present and refusing.
    cloudSession ? row('👥', 'rgba(37,99,255,.15)', t('team.title'), t('settings.teamSub'), openTeamSheet) : null,
    cloudSession ? row('🗄', 'rgba(147,197,253,.25)', t('workspace.title'), t('settings.workspacesSub'), () => { void openWorkspaceSheet(); }) : null,
    row('📊', 'rgba(52,199,89,.15)', t('export.excel'), t('settings.excelSub'), () => { void runFullExcelExport(); }),
    // Honest about what the file holds. It is the records, never the image
    // files: on a device-only workspace those stay on the device, and on a
    // cloud workspace they stay in cloud storage.
    repository.session.mode === 'cloud'
      ? row('💾', 'rgba(0,122,255,.15)', t('settings.jsonCloud'), t('settings.jsonCloudSub'), () => { void runFullJsonExport(); })
      : row('💾', 'rgba(0,122,255,.15)', t('settings.jsonLocal'), t('settings.jsonLocalSub'), () => { void runFullJsonExport(); }),
    row('📄', 'rgba(255,149,0,.15)', t('import.fromSpreadsheet'), t('settings.sheetSub'), () => { void startSpreadsheetImport(); }),
    row('📥', 'rgba(255,149,0,.15)', t('import.jsonBackup'), t('settings.jsonImportSub'), startImport),
    // The count comes from the index that holds exactly the deleted records,
    // so it is exact and costs nothing — and it fills in a moment after the
    // row is drawn rather than making Settings wait for it.
    row('🗑', 'rgba(142,142,147,.15)', t('trash.title'),
      t('settings.trashSub'), openTrashSheet, 'trash-count'),
    row('📍', 'rgba(175,82,222,.15)', t('location.title'), t('count.locations', { count: repository.state.locations.length }), openLocationsSheet),
    // What this app is using of the device, and whether the browser has agreed
    // not to evict it. On a device-only inventory that is not a cache
    // statistic: it is the difference between "your records are here" and
    // "your records were here until the phone needed room".
    el('div', { class: 'srow', id: 'storage-row' }, [
      el('div', { class: 'srowiw', style: { background: 'rgba(142,142,147,.15)' }, text: '💽', 'aria-hidden': 'true' }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', text: t('storage.title') }),
        el('div', { class: 'srowd', id: 'storage-note', text: t('storage.measuring') }),
      ]),
    ]),
  ]);

  void describeDeviceStorage();
  void repository.recordCounts().then((counts) => {
    const node = $('trash-count');
    if (node && counts) node.textContent = t('count.items', { count: counts.trashed });
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
          titleKey: 'danger.clearTitle',
          message: () => (items == null
            ? t('danger.clearMessageAll', { folders: t('count.folders', { count: folders }) })
            : t('danger.clearMessage', { items: t('count.items', { count: items }), folders: t('count.folders', { count: folders }) })),
          icon: '⚠️',
          confirmLabelKey: 'danger.clearConfirm',
          requirePhrase: t('confirm.phraseDeleteAll'),
        });
        if (!confirmed) return;
        try {
          await repository.clearInventory();
          flashSuccess();
          toast(t('danger.cleared'), '🗑');
          renderHome();
        } catch (error) {
          toastError(error, 'bulk.deleteFailed');
        }
      },
    }, [
      el('div', { class: 'srowiw', style: { background: 'var(--danger-soft)' }, 'aria-hidden': 'true' }, [icon('trash')]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', style: { color: 'var(--red)' }, text: t('danger.clearRow') }),
        el('div', { class: 'srowd', text: t('danger.clearRowSub') }),
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
          el('div', { class: 'srowl', text: t('migration.completed') }),
          el('div', { class: 'srowd', text: `${t('count.items', { count: status.counts?.actual || 0 })} · ${formatDate(status.completedAt)}` }),
        ]),
      ]),
    ]);
    return;
  }

  render(panel, [
    el('div', { class: 'migrate-card' }, [
      el('div', { class: 'migrate-title', text: t('migration.title') }),
      el('div', { class: 'migrate-sub', text: t('migration.found', { items: t('count.items', { count: status.counts?.items || 0 }), source: status.source }) }),
      el('div', { class: 'migrate-progress', id: 'migrate-progress', style: { display: 'none' } }, [
        el('div', { class: 'migrate-bar' }, [el('div', { class: 'migrate-bar-fill', id: 'migrate-bar-fill' })]),
        el('div', { class: 'migrate-label', id: 'migrate-label' }),
      ]),
      el('button', {
        class: 'btn btn-p', id: 'migrate-btn', type: 'button', style: { width: '100%' },
        text: status.status === MigrationState.FAILED ? t('migration.retry') : t('migration.start'),
        onClick: (event) => startMigration(event.currentTarget),
      }),
    ]),
  ]);
}

async function startMigration(button) {
  const progress = $('migrate-progress');
  progress.style.display = '';

  await withBusy(button, t('migration.running'), async () => {
    try {
      const result = await runMigration({
        onProgress: ({ done, total, message }) => {
          const percent = total ? Math.round((done / total) * 100) : 0;
          $('migrate-bar-fill').style.width = `${percent}%`;
          setText('migrate-label', message);
        },
      });
      toast(t('migration.done', { items: t('count.items', { count: result.counts.actual }) }), '✓');
      if (result.counts.imageFailures) {
        toast(t('migration.imageFailures', { count: result.counts.imageFailures }), '⚠');
      }
      renderMigrationPanel();
      renderHome();
    } catch (error) {
      toastError(error, 'error.migration/failed');
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
