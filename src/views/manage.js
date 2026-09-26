// Categories, folders, locations, Trash, settings, auth panel, import/export.

import { icon } from '../icons.js';
import {
  CAT_ICONS, FOLDER_COLORS, FOLDER_ICONS,
} from '../config.js';
import { aiAvailability, aiStatusLabel } from '../ai.js';
import { LANGUAGES, getLanguage, onLanguageChange, pick, setLanguage, t } from '../i18n.js';
import { locationName, roleLabel } from '../labels.js';
import {
  currentSession, registerWithEmail, sendPasswordReset,
  signInWithApple, signInWithEmail, signInWithGoogle, signOutUser,
} from '../auth.js';
import { firebaseContext, isCloudOff } from '../firebase.js';
import {
  maxBackupFileBytes, applyMerge, exportExcel, exportJSON, readBackupFile, saveBackupFile,
} from '../exporting.js';
import {
  RESTORE_BLOCKED_MESSAGE, RestoreStage, restoreFromBackup, stageLabel, unfinishedRestore,
} from '../restore.js';
import { withFullInventory } from '../inventory-load.js';
import { inventoryCounts, queryInventory } from '../query.js';
import { storageEstimate } from '../local-store.js';
import { openTeamSheet, openWorkspaceSheet } from './team.js';
import { startSpreadsheetImport } from './sheet-import.js';
import { MigrationState, migrationStatus, runMigration } from '../migration.js';
import { repository } from '../repository.js';
import {
  assistantLabel, currentPlan, onSubscriptionChange, planStatus, planUsage, quotaStatus, subscriptionState,
} from '../subscription.js';
import { UNLIMITED } from '../entitlements.js';
import { openPlansSheet } from './plans.js';
import { eraseRow, renderAboutPanel, renderLegalPanel } from './settings-legal.js';
import { legalConsentLine } from './legal.js';
import { accountSignInMethods } from '../account.js';
import { hasAiConsent, withdrawAiConsent } from '../ai-consent.js';
import { Feature, isAuthProviderAvailable, isFeatureAvailable } from '../features.js';
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

// ── classification (Settings → التصنيفات) ──
//
// One screen, three depths: the Main Categories; the Categories of one; the
// Subcategories of one Category. Every row can be reordered with buttons (not
// only by dragging), hidden or shown, renamed; the customer's own rows can be
// merged or deleted — never with records left pointing at nothing.

let selectedCategoryIcon = '📦';
/** What the rename/new sheet is doing: { mode: 'rename'|'create', id?, level?, parentId? }. */
let categorySheet = null;
/** Where the management screen is. */
const manager = { mainId: null, categoryId: null, fields: false };
let managerCounts = { mains: new Map(), categories: new Map(), subs: new Map() };

function countFor(node) {
  const map = node.level === 'main' ? managerCounts.mains : node.level === 'sub' ? managerCounts.subs : managerCounts.categories;
  return map?.get(node.id) || 0;
}

function managedRow(node, siblings, index) {
  const taxonomy = repository.taxonomy();
  const name = taxonomy.label(node);
  const canWrite = repository.canWrite();
  const drill = node.level === 'main' || (node.level === 'category' && (taxonomy.subcategories(node.id, { includeHidden: true }).length || canWrite));
  const count = countFor(node);
  const act = (label, aria, onClick, disabled = false) => el('button', {
    type: 'button', class: 'tx-act', text: label, 'aria-label': aria, disabled: disabled || undefined, onClick,
  });
  const move = async (delta) => {
    const ids = siblings.map((n) => n.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    try { await repository.reorderTaxonomyNodes(ids); } catch (error) { toastError(error); }
  };
  return el('div', { class: 'tx-row', dataset: { node: node.id } }, [
    el('button', {
      type: 'button', class: 'tx-open', disabled: drill ? undefined : true,
      'aria-label': drill ? t('taxonomy.open', { name }) : name,
      onClick: () => {
        if (node.level === 'main') { manager.mainId = node.id; manager.categoryId = null; }
        else if (node.level === 'category') manager.categoryId = node.id;
        renderCategories();
        $('catgrid')?.querySelector('.tx-row .tx-open')?.focus();
      },
    }, [
      el('span', { class: 'tax-ico', 'aria-hidden': 'true', text: taxonomy.icon(node) }),
      el('span', {}, [
        el('div', { class: 'tx-name', dir: 'auto', text: name }),
        el('div', { class: 'tx-sub', text: t('taxonomy.itemsCount', { count }) }),
      ]),
      node.source === 'custom' ? el('span', { class: 'tx-badge', text: t('taxonomy.customBadge') }) : null,
      node.hidden ? el('span', { class: 'tx-badge', text: t('taxonomy.hiddenBadge') }) : null,
    ]),
    canWrite ? el('div', { class: 'tx-acts' }, [
      act('↑', t('taxonomy.moveUp', { name }), () => move(-1), index === 0),
      act('↓', t('taxonomy.moveDown', { name }), () => move(1), index === siblings.length - 1),
      act(node.hidden ? t('taxonomy.show') : t('taxonomy.hide'), t(node.hidden ? 'taxonomy.showAria' : 'taxonomy.hideAria', { name }),
        async () => { try { await repository.setTaxonomyNodeHidden(node.id, !node.hidden); } catch (error) { toastError(error); } }),
      node.level !== 'sub' ? el('button', {
        type: 'button', class: 'tx-act', 'aria-pressed': String(node.pinned),
        'aria-label': t(node.pinned ? 'taxonomy.unpin' : 'taxonomy.pin', { name }), text: node.pinned ? '★' : '☆',
        onClick: async () => { try { await repository.setTaxonomyNodePinned(node.id, !node.pinned); } catch (error) { toastError(error); } },
      }) : null,
      act(t('taxonomy.rename'), t('taxonomy.renameAria', { name }), () => openCategorySheet({ mode: 'rename', id: node.id })),
      node.source === 'custom' ? act(t('taxonomy.merge'), t('taxonomy.mergeAria', { name }), () => mergeFlow(node.id)) : null,
      node.source === 'custom' ? act(t('taxonomy.delete'), t('taxonomy.deleteAria', { name }), () => deleteCategoryFlow(node.id)) : null,
    ]) : null,
  ]);
}

function managedList(nodes) {
  return el('div', { class: 'sgroup' }, nodes.map((node, index) => managedRow(node, nodes, index)));
}

export function renderCategories() {
  const grid = $('catgrid');
  if (!grid) return;
  // The old grid of category tiles is now a list with levels.
  grid.className = 'tx-manager';
  const taxonomy = repository.taxonomy();
  if (manager.categoryId && !taxonomy.node(manager.categoryId)) manager.categoryId = null;
  if (manager.mainId && !taxonomy.node(manager.mainId)) manager.mainId = null;
  const canWrite = repository.canWrite();
  const children = [];

  if (manager.fields) {
    render(grid, fieldsOverview());
    return;
  }
  if (!manager.mainId) {
    const all = taxonomy.mainCategories({ includeHidden: true });
    const shown = all.filter((node) => !node.hidden);
    const hidden = all.filter((node) => node.hidden);
    children.push(el('h2', { class: 'cf-title', text: t('taxonomy.mains') }));
    children.push(managedList(shown));
    if (canWrite) children.push(el('button', { type: 'button', class: 'tax-add', text: t('taxonomy.addMain'), onClick: () => openCategorySheet({ mode: 'create', level: 'main' }) }));
    if (hidden.length) {
      children.push(el('h2', { class: 'cf-title', text: t('taxonomy.hidden') }));
      children.push(managedList(hidden));
    }
  } else {
    const main = taxonomy.node(manager.mainId);
    const category = manager.categoryId ? taxonomy.node(manager.categoryId) : null;
    children.push(el('button', {
      type: 'button', class: 'tax-add', id: 'tx-back',
      text: `‹ ${category ? taxonomy.label(main) : t('taxonomy.back')}`,
      onClick: () => { if (manager.categoryId) manager.categoryId = null; else manager.mainId = null; renderCategories(); $('tx-back')?.focus(); },
    }));
    children.push(el('div', { class: 'tx-crumb', dir: 'auto', text: [main, category].filter(Boolean).map((n) => taxonomy.label(n)).join(' › ') }));
    if (!category) {
      const list = taxonomy.categories(main.id, { includeHidden: true });
      children.push(el('h2', { class: 'cf-title', text: t('taxonomy.categories') }));
      if (list.length) children.push(managedList(list));
      else children.push(el('p', { class: 'tax-empty', text: t('taxonomy.emptyCategories') }));
      if (canWrite) children.push(el('button', { type: 'button', class: 'tax-add', text: t('taxonomy.addCategory'), onClick: () => openCategorySheet({ mode: 'create', level: 'category', parentId: main.id }) }));
    } else {
      const list = taxonomy.subcategories(category.id, { includeHidden: true });
      children.push(el('h2', { class: 'cf-title', text: t('taxonomy.subcategories') }));
      if (list.length) children.push(managedList(list));
      if (canWrite) children.push(el('button', { type: 'button', class: 'tax-add', text: t('taxonomy.addSubcategory'), onClick: () => openCategorySheet({ mode: 'create', level: 'sub', parentId: category.id }) }));
      children.push(savedFieldsBlock(category));
    }
  }
  render(grid, children);
  void inventoryCounts().then((counts) => {
    managerCounts = { mains: counts.mains || new Map(), categories: counts.categories || new Map(), subs: counts.subs || new Map() };
    for (const row of grid.querySelectorAll('[data-node]')) {
      const node = repository.taxonomy().node(row.dataset.node);
      const sub = row.querySelector('.tx-sub');
      if (node && sub) sub.textContent = t('taxonomy.itemsCount', { count: countFor(node) });
    }
  }).catch(() => {});
}

/** The fields the customer saved to a Category, with a way to take one off. */
function savedFieldsBlock(category) {
  const fields = repository.taxonomy().savedFields(category.id);
  return el('div', {}, [
    el('h2', { class: 'cf-title', text: t('taxonomy.savedFields') }),
    fields.length ? el('div', { class: 'sgroup' }, fields.map((def) => el('div', { class: 'tx-row' }, [
      el('span', { class: 'tx-open' }, [el('span', { class: 'tx-name', dir: 'auto', text: def.label }), el('span', { class: 'tx-sub', text: t(`fieldType.${def.type}`) })]),
      repository.canWrite() ? el('button', {
        type: 'button', class: 'tx-act', text: t('fields.removeValue'), 'aria-label': t('taxonomy.removeSavedField', { name: def.label }),
        onClick: async () => {
          try { await repository.saveTaxonomyNodeFields(category.id, fields.filter((f) => f.id !== def.id)); } catch (error) { toastError(error); }
        },
      }) : null,
    ]))) : el('p', { class: 'tax-empty', text: t('taxonomy.noSavedFields') }),
  ]);
}

/** Opens Settings → التصنيفات, optionally on one node's list. */
export function openClassificationManager({ mainId = null, fields = false } = {}) {
  manager.mainId = mainId;
  manager.categoryId = null;
  manager.fields = fields;
  goTab('cats');
}

/** «الحقول المخصصة»: every node that carries saved fields, and the way to each. */
function fieldsOverview() {
  const taxonomy = repository.taxonomy();
  const withFields = taxonomy.storedNodes().filter((node) => node.fields.length && !node.mergedInto);
  return [
    el('button', { type: 'button', class: 'tax-add', id: 'tx-back', text: `‹ ${t('taxonomy.back')}`, onClick: () => { manager.fields = false; renderCategories(); $('tx-back')?.focus(); } }),
    el('h2', { class: 'cf-title', text: t('taxonomy.customFields') }),
    withFields.length ? el('div', { class: 'sgroup' }, withFields.map((node) => el('div', { class: 'tx-row' }, [
      el('button', {
        type: 'button', class: 'tx-open', 'aria-label': t('taxonomy.open', { name: taxonomy.label(node) }),
        onClick: () => {
          manager.fields = false;
          const main = taxonomy.mainOf(node);
          manager.mainId = main?.id || null;
          manager.categoryId = node.level === 'category' ? node.id : null;
          renderCategories();
        },
      }, [
        el('span', { class: 'tax-ico', 'aria-hidden': 'true', text: taxonomy.icon(node) }),
        el('span', {}, [
          el('div', { class: 'tx-name', dir: 'auto', text: taxonomy.breadcrumb({ categoryId: node.level === 'category' ? node.id : null, mainCategoryId: node.level === 'main' ? node.id : taxonomy.mainOf(node)?.id }) }),
          el('div', { class: 'tx-sub', text: node.fields.map((def) => def.label).join(t('common.listSeparator')) }),
        ]),
      ]),
    ]))) : el('p', { class: 'tax-empty', text: t('taxonomy.noCustomFields') }),
  ];
}

/**
 * The rename / new-node sheet. A built-in node's rename is a local display
 * name; clearing it goes back to the built-in label.
 */
export function openCategorySheet(options = null) {
  const taxonomy = repository.taxonomy();
  categorySheet = options?.mode ? options : { mode: 'create', level: manager.categoryId ? 'sub' : manager.mainId ? 'category' : 'main', parentId: manager.categoryId || manager.mainId };
  const node = categorySheet.mode === 'rename' ? taxonomy.node(categorySheet.id) : null;
  selectedCategoryIcon = node?.icon || '📦';
  setText('cat-sheet-title', node ? t('taxonomy.renameTitle') : t(categorySheet.level === 'main' ? 'taxonomy.addMain' : categorySheet.level === 'sub' ? 'taxonomy.addSubcategory' : 'taxonomy.addCategory').replace(/^\+\s*/, ''));
  $('cat-name').value = node ? (node.source === 'builtin' ? node.name : taxonomy.label(node)) : '';
  $('cat-name').placeholder = node?.source === 'builtin' ? taxonomy.defaultLabel(node) : t('category.namePlaceholder');
  const hint = $('cat-hint');
  if (hint) hint.textContent = node?.source === 'builtin' ? t('taxonomy.renameBuiltinHint', { name: taxonomy.defaultLabel(node) }) : '';
  // Icons belong to Main Categories the customer creates; a built-in keeps its own.
  const iconsVisible = categorySheet.mode === 'create' && categorySheet.level === 'main';
  $('caticolist').style.display = iconsVisible ? '' : 'none';
  $('caticolist').previousElementSibling.style.display = iconsVisible ? '' : 'none';
  renderIconPicker($('caticolist'), CAT_ICONS, selectedCategoryIcon, (picked) => { selectedCategoryIcon = picked; });
  openSheet('cat', { focus: '#cat-name' });
}

async function saveCategory() {
  const name = $('cat-name').value.trim();
  const sheet = categorySheet || { mode: 'create', level: 'category', parentId: 'other' };
  try {
    if (sheet.mode === 'rename') {
      await repository.renameTaxonomyNode(sheet.id, name);
      toast(t('manage.updated'), '✓');
    } else {
      if (!name) { toast(t('taxonomy.error.nameRequired'), '⚠'); return; }
      await repository.createTaxonomyNode({
        level: sheet.level, parentId: sheet.parentId, name,
        icon: sheet.level === 'main' ? selectedCategoryIcon : null,
      });
      toast(t('taxonomy.created', { name }), '✓');
    }
    closeSheet('cat');
  } catch (error) {
    toastError(error, 'category.saveFailed');
  }
}

/** Same-level nodes a node could merge into, or its records move to. */
function sameLevelTargets(node) {
  const taxonomy = repository.taxonomy();
  if (node.level === 'main') return taxonomy.mainCategories({ includeHidden: true }).filter((n) => n.id !== node.id);
  if (node.level === 'sub') return taxonomy.subcategories(node.parentId, { includeHidden: true }).filter((n) => n.id !== node.id);
  return taxonomy.allCategories({ includeHidden: true }).filter((n) => n.id !== node.id);
}

function targetLabel(node) {
  const taxonomy = repository.taxonomy();
  if (node.level !== 'category') return `${taxonomy.icon(node)} ${taxonomy.label(node)}`;
  return `${taxonomy.label(taxonomy.mainOf(node))} › ${taxonomy.label(node)}`;
}

async function mergeFlow(nodeId) {
  const taxonomy = repository.taxonomy();
  const node = taxonomy.node(nodeId);
  const targets = sameLevelTargets(node);
  if (!targets.length) { toast(t('taxonomy.noMergeTarget'), '⚠'); return; }
  const usage = await repository.taxonomyNodeUsage(nodeId);
  const name = taxonomy.label(node);
  optionList($('reassign-target'), targets.map((target) => ({ value: target.id, label: targetLabel(target) })), targets[0].id);
  setText('reassign-title', t('taxonomy.mergeTitle'));
  setText('reassign-message', t('taxonomy.mergeMessage', { name, count: usage }));
  $('reassign-confirm').textContent = t('taxonomy.mergeConfirm');
  $('reassign-confirm').onclick = async () => {
    try {
      await repository.mergeTaxonomyNodes(nodeId, $('reassign-target').value);
      closeSheet('reassign');
      toast(t('taxonomy.mergeDone', { name }), '✓');
    } catch (error) {
      toastError(error);
    }
  };
  openSheet('reassign');
}

/**
 * Deleting one of the customer's own nodes. Unused: a plain confirmation. In
 * use: «يستخدم هذا الصنف في {count} قطعة» with three ways on — move the
 * records to another Category, delete and leave them without one, or keep it.
 */
async function deleteCategoryFlow(nodeId) {
  const taxonomy = repository.taxonomy();
  const node = taxonomy.node(nodeId);
  if (!node) return;
  const name = taxonomy.label(node);
  const usage = await repository.taxonomyNodeUsage(nodeId);

  if (!usage) {
    const confirmed = await confirmAction({
      title: () => t('taxonomy.deleteConfirmTitle', { name }),
      messageKey: 'taxonomy.deleteUnused',
      icon: '◈',
      confirmLabelKey: 'common.delete',
    });
    if (!confirmed) return;
    try {
      await repository.deleteTaxonomyNode(nodeId, 'uncategorize');
      toast(t('taxonomy.deleted', { name }), '✓');
    } catch (error) {
      toastError(error, 'category.deleteFailed');
    }
    return;
  }
  if (node.level === 'main') { toast(t('taxonomy.error.mainInUse'), '⚠'); return; }

  const targets = sameLevelTargets(node);
  optionList($('reassign-target'), [
    { value: '__none__', label: t('taxonomy.removeFromItems') },
    ...targets.map((target) => ({ value: target.id, label: `↳ ${targetLabel(target)}` })),
  ], targets.length ? targets[0].id : '__none__');
  setText('reassign-title', t('taxonomy.deleteConfirmTitle', { name }));
  setText('reassign-message', `${t(node.level === 'sub' ? 'taxonomy.inUseSub' : 'taxonomy.inUse', { count: usage })} ${t('taxonomy.moveItems')} — ${t('taxonomy.keep')}: ${t('common.cancel')}`);
  $('reassign-confirm').textContent = t('category.deleteAndMove');
  $('reassign-confirm').onclick = async () => {
    const target = $('reassign-target').value;
    try {
      const moved = await repository.deleteTaxonomyNode(
        nodeId,
        target === '__none__' ? 'uncategorize' : 'reassign',
        target === '__none__' ? null : target,
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
    await exportExcel();
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
    const { bytes, restorable } = await exportJSON();
    if (!restorable) {
      // Said now, not on the day the file is needed.
      void confirmAction({
        titleKey: 'export.oversizeTitle',
        messageKey: 'export.oversizeMessage', messageParams: { size: Math.ceil(bytes / 1048576), limit: maxBackupFileBytes() / 1048576 },
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
  renderClassificationPanel();
  renderDataPanel();
  renderMigrationPanel();
  renderLegalPanel();
  renderAboutPanel();
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

  if (isCloudOff(status)) {
    render(panel, [
      el('div', { class: 'srow' }, [
        el('div', { class: 'srowiw', style: { background: 'rgba(52,199,89,.15)' }, text: '📱', 'aria-hidden': 'true' }),
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
        el('input', { id: 'auth-email', type: 'email', dir: 'ltr', autocomplete: 'email', placeholder: 'name@example.com', enterkeyhint: 'next' }),
      ]),
      el('div', { class: 'frow' }, [
        el('label', { for: 'auth-password', text: t('auth.password') }),
        el('input', { id: 'auth-password', type: 'password', dir: 'ltr', autocomplete: 'current-password', placeholder: '••••••••', enterkeyhint: 'go', 'aria-describedby': 'auth-password-rule' }),
        el('div', { class: 'field-hint', id: 'auth-password-rule', text: t('gate.passwordRule') }),
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
      legalConsentLine(),
      // Apple first: on iOS it is required wherever Google is offered.
      isAuthProviderAvailable('apple') ? el('button', {
        class: 'btn btn-s auth-google', type: 'button', text: t('gate.withApple'),
        onClick: (event) => authAction(event.currentTarget, signInWithApple),
      }) : null,
      isAuthProviderAvailable('google') ? el('button', {
        class: 'btn btn-s auth-google', type: 'button', text: t('auth.google'),
        onClick: (event) => authAction(event.currentTarget, signInWithGoogle),
      }) : null,
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

  const workspaceName = subscriptionState().workspace?.name || '';
  const detail = (label, value, dir = 'auto') => el('div', { class: 'srow', style: { cursor: 'default' } }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'srowd', text: label }),
      el('div', { class: 'srowl', dir, text: value }),
    ]),
  ]);
  render(panel, [
    detail(t('account.name'), session.user.displayName || '—'),
    session.user.email ? detail(t('account.email'), session.user.email, 'ltr') : null,
    detail(t('account.provider'), providerLabel()),
    workspaceName ? detail(t('account.workspace'), `${workspaceName} · ${roleLabel(session.role)}`) : null,
    el('button', {
      class: 'btn btn-d', type: 'button', text: t('auth.signOut'), style: { width: '100%', marginTop: '10px' },
      onClick: (event) => authAction(event.currentTarget, signOutUser),
    }),
  ]);
}

/** How the signed-in account proves who it is, in words. */
function providerLabel() {
  const methods = accountSignInMethods();
  const names = [];
  if (methods.apple) names.push(t('account.provider.apple'));
  if (methods.google) names.push(t('account.provider.google'));
  if (methods.password) names.push(t('account.provider.password'));
  return names.join(' · ') || '—';
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
    // Consent to external processing can be taken back as easily as it was
    // given; the next analysis asks again.
    hasAiConsent() ? el('button', {
      class: 'srow srow-btn', type: 'button',
      onClick: () => { withdrawAiConsent(); toast(t('aiConsent.withdrawn'), '✓'); renderAiPanel(); },
    }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', text: t('aiConsent.withdraw') }),
        el('div', { class: 'srowd', text: t('aiConsent.withdrawSub') }),
      ]),
    ]) : null,
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

/**
 * Settings → التصنيفات: manage the hierarchy, see the fields saved to it, and
 * put the built-in library back the way it shipped. Three rows, no more.
 */
function renderClassificationPanel() {
  const panel = $('classification-panel');
  if (!panel) return;
  const row = (glyph, background, title, subtitle, onClick) => el('button', { class: 'srow srow-btn', type: 'button', onClick }, [
    el('div', { class: 'srowiw', style: { background }, text: glyph, 'aria-hidden': 'true' }),
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'srowl', text: title }),
      el('div', { class: 'srowd', text: subtitle }),
    ]),
    el('div', { class: 'srowc', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
  ]);
  const savedCount = repository.taxonomy().storedNodes().reduce((sum, node) => sum + node.fields.length, 0);
  render(panel, [
    row('◈', 'rgba(99,102,241,.15)', t('taxonomy.manage'), t('taxonomy.manageSub'), () => openClassificationManager()),
    row('✎', 'rgba(52,199,89,.15)', t('taxonomy.customFields'), t('taxonomy.fieldsIn', { count: savedCount }), () => openClassificationManager({ fields: true })),
    repository.canWrite() ? row('↺', 'rgba(255,149,0,.15)', t('taxonomy.restoreDefaults'), t('taxonomy.restoreDefaultsSub'), restoreDefaultsFlow) : null,
  ]);
}

async function restoreDefaultsFlow() {
  const confirmed = await confirmAction({
    titleKey: 'taxonomy.restoreConfirmTitle',
    messageKey: 'taxonomy.restoreConfirm',
    icon: '↺',
    confirmLabelKey: 'taxonomy.restoreDefaults',
    tone: 'neutral',
  });
  if (!confirmed) return;
  try {
    await repository.restoreDefaultTaxonomy();
    toast(t('taxonomy.restoreDone'), '✓');
  } catch (error) {
    toastError(error);
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
    // Device-only mode has no members and no other workspace to move to, so
    // these are absent rather than present and refusing.
    cloudSession && isFeatureAvailable(Feature.TEAM) ? row('👥', 'rgba(37,99,255,.15)', t('team.title'), t('settings.teamSub'), openTeamSheet) : null,
    cloudSession && isFeatureAvailable(Feature.TEAM) ? row('🗄', 'rgba(147,197,253,.25)', t('workspace.title'), t('settings.workspacesSub'), () => { void openWorkspaceSheet(); }) : null,
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
    // A workspace's records, in whichever workspace is open — for a device
    // inventory the erase row below is the complete version of this.
    !cloudSession ? null : el('button', {
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
    eraseRow(),
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
  window.addEventListener('almakhzan:open-classification', () => openClassificationManager());
  window.addEventListener('almakhzan:edit-folder', (event) => openFolderSheet(event.detail));
}
