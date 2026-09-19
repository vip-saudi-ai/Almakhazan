// Categories, folders, locations, Trash, settings, auth panel, import/export.

import {
  APP_VERSION, CAT_ICONS, FOLDER_COLORS, FOLDER_ICONS, ROLE_LABELS, SCHEMA_VERSION, UNCATEGORIZED_ID,
} from '../config.js';
import { AI_STATUS_LABELS, aiAvailability } from '../ai.js';
import {
  currentSession, listMembers, registerWithEmail, sendPasswordReset,
  signInWithEmail, signInWithGoogle, signOutUser,
} from '../auth.js';
import { FirebaseStatus, firebaseContext } from '../firebase.js';
import { applyMerge, applyRestore, exportExcel, exportJSON, readJsonFile } from '../exporting.js';
import { MigrationState, migrationStatus, runMigration } from '../migration.js';
import { repository } from '../repository.js';
import {
  assistantLabel, currentPlan, onSubscriptionChange, planStatus, planUsage, quotaStatus,
} from '../subscription.js';
import { UNLIMITED } from '../entitlements.js';
import { openPlansSheet } from './plans.js';
import { bindImageSrc } from '../storage.js';
import { $, el, formatDate, formatNumber, render, setText } from '../utils.js';
import { primaryImage, validateImport } from '../validation.js';
import {
  closeSheet, confirmAction, emptyState, flashSuccess, openSheet, optionList, toast, toastError, withBusy,
} from '../ui.js';
import { renderHome, view as homeView } from './home.js';
import { goTab } from '../navigation.js';

// ── categories ──
let selectedCategoryIcon = '📦';
let editingCategoryId = null;

export function renderCategories() {
  const grid = $('catgrid');
  if (!grid) return;
  const items = repository.liveItems();

  render(grid, [
    ...repository.state.categories.map((category) => {
      const count = items.filter((i) => i.categoryId === category.id).length;
      return el('div', { class: 'catcell' }, [
        el('button', {
          class: 'catcell-main', type: 'button',
          'aria-label': `${category.name}، ${count} قطعة`,
          onClick: () => { filterHomeByCategory(category.id); },
        }, [
          el('div', { class: 'catcico', text: category.icon, 'aria-hidden': 'true' }),
          el('div', { class: 'catcname', text: category.name }),
          el('div', { class: 'catccount', text: `${formatNumber(count)} قطعة` }),
        ]),
        repository.canWrite() ? el('div', { class: 'catcell-acts' }, [
          el('button', {
            class: 'catcell-act', type: 'button', text: '✎', 'aria-label': `تعديل ${category.name}`,
            onClick: () => openCategorySheet(category.id),
          }),
          el('button', {
            class: 'catcell-act danger', type: 'button', text: '🗑', 'aria-label': `حذف ${category.name}`,
            onClick: () => deleteCategoryFlow(category.id),
          }),
        ]) : null,
      ]);
    }),
    repository.canWrite() ? el('button', {
      class: 'catcell catcell-add', type: 'button', onClick: () => openCategorySheet(),
    }, [
      el('div', { class: 'catcico', text: '+', 'aria-hidden': 'true' }),
      el('div', { class: 'catcname', text: 'تصنيف جديد' }),
    ]) : null,
  ]);
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
  const usage = repository.categoryUsage(categoryId);

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
  const count = repository.liveItems().filter((i) => i.folderId === folder.id).length;

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

function renderLocations() {
  const list = $('loc-list');
  if (!list) return;
  const items = repository.liveItems();

  render(list, [
    ...repository.state.locations.map((location) => {
      const count = items.filter((i) => i.locationId === location.id).length;
      return el('div', { class: 'srow' }, [
        el('div', { class: 'srowiw', text: '📍', 'aria-hidden': 'true' }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'srowl', text: location.name }),
          el('div', { class: 'srowd', text: `${formatNumber(count)} قطعة` }),
        ]),
        repository.canWrite() ? el('button', {
          class: 'catcell-act danger', type: 'button', text: '🗑',
          'aria-label': `حذف ${location.name}`,
          onClick: async () => {
            const confirmed = await confirmAction({
              title: `حذف موقع "${location.name}"؟`,
              message: count ? `${formatNumber(count)} قطعة ستصبح بلا موقع محدد.` : 'لا توجد قطع في هذا الموقع.',
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
        }) : null,
      ]);
    }),
    !repository.state.locations.length ? el('div', { class: 'srow' }, [
      el('div', { class: 'srowd', text: 'لا توجد مواقع' }),
    ]) : null,
  ]);
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
export function openTrashSheet() {
  renderTrash();
  openSheet('trash');
}

function renderTrash() {
  const list = $('trash-list');
  if (!list) return;
  const trashed = repository.trashedItems();

  if (!trashed.length) {
    render(list, [emptyState('🗑', 'سلة المحذوفات فارغة', 'القطع المحذوفة تظهر هنا ويمكن استعادتها')]);
    return;
  }

  render(list, trashed.map((item) => {
    const image = primaryImage(item);
    let thumb;
    if (image) {
      const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
      bindImageSrc(img, image, { thumbnail: true });
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
          class: 'btn btn-g trash-btn', type: 'button', text: '↩ استعادة',
          onClick: async () => {
            try {
              await repository.restoreItem(item.id);
              renderTrash();
              toast('استُعيدت القطعة', '↩');
            } catch (error) {
              toastError(error, 'تعذّر استعادة القطعة');
            }
          },
        }),
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
              renderTrash();
              toast('حُذفت نهائياً', '🗑');
            } catch (error) {
              toastError(error, 'تعذّر الحذف النهائي');
            }
          },
        }),
      ]),
    ]);
  }));
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
      const parsed = await readJsonFile(file);
      const result = validateImport(parsed);
      if (!result.ok) {
        toast(result.errors[0] || 'ملف غير صالح', '✕');
        return;
      }
      pendingImport = result;
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
      message: `سيُحذف الجرد الحالي بالكامل (${formatNumber(repository.state.items.length)} قطعة) ويُستبدل بمحتوى الملف. نزّل نسخة احتياطية أولاً.`,
      icon: '⚠️',
      confirmLabel: 'استبدال',
      requirePhrase: 'استبدال',
    });
    if (!confirmed) return;
    // A safety net the user did not have to remember to take.
    try { exportJSON(); } catch (error) { console.error('[import] pre-restore backup failed', error); }
  }

  await withBusy($(mode === 'merge' ? 'import-merge' : 'import-restore'), 'جارٍ التنفيذ…', async () => {
    try {
      if (mode === 'merge') {
        const { added } = await applyMerge(data);
        toast(`أُضيف ${formatNumber(added)} سجل`, '✓');
      } else {
        const { restored } = await applyRestore(data);
        toast(`استُعيد ${formatNumber(restored)} سجل`, '✓');
      }
      pendingImport = null;
      closeSheet('import');
      renderHome();
    } catch (error) {
      toastError(error, 'فشل الاستيراد');
    }
  });
}

// ── settings ──
export function renderSettings() {
  renderAuthPanel();
  renderPlanPanel();
  renderAiPanel();
  renderDataPanel();
  renderMigrationPanel();
  setText('app-version', `توثيق وحصر المقتنيات — v${APP_VERSION} · مخطط ${SCHEMA_VERSION}`);
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

function usageBar(row) {
  const unlimited = row.limit === UNLIMITED;
  const ratio = unlimited ? 0 : Math.min(1, row.limit > 0 ? row.used / row.limit : 1);
  // A one-seat plan is always "full" on members; that is the plan, not a
  // problem, so it is not coloured like one.
  const fixed = row.key === 'members' && row.limit === 1;
  const tone = fixed ? '' : ratio >= 1 ? 'full' : ratio >= 0.9 ? 'warn' : ratio >= 0.7 ? 'notice' : '';

  return el('div', { class: 'usage-row' }, [
    el('div', { class: 'usage-head' }, [
      el('span', { class: 'usage-label', text: row.label }),
      el('span', {
        class: 'usage-value',
        text: unlimited ? `${row.format(row.used)} · بلا حد` : `${row.format(row.used)} من ${row.format(row.limit)}`,
      }),
    ]),
    el('div', { class: 'usage-track' }, [
      el('div', { class: `usage-fill ${tone}`.trim(), style: { width: `${Math.round(ratio * 100)}%` } }),
    ]),
  ]);
}

/**
 * Shows the plan the server says is in force, and what is left of it. The
 * numbers come from counters only the backend writes, so this card cannot be
 * talked into showing a bigger allowance than the customer has.
 */
export function renderPlanPanel() {
  const panel = $('plan-panel');
  if (!panel) return;

  const status = planStatus();
  if (status === 'local') {
    render(panel, [
      el('div', { class: 'srow', style: { cursor: 'default' } }, [
        el('div', { class: 'srowiw', style: { background: 'rgba(142,142,147,.15)' }, text: '📱', 'aria-hidden': 'true' }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'srowl', text: 'هذا الجهاز فقط' }),
          el('div', { class: 'srowd', text: 'بلا حساب: لا مزامنة ولا حدود خطة. أنشئ حساباً لمزامنة مخزنك وحفظه.' }),
        ]),
      ]),
    ]);
    return;
  }

  const plan = currentPlan();
  const assistant = assistantLabel();
  const quota = quotaStatus();
  const rows = planUsage();

  render(panel, [
    el('div', { class: 'srow', style: { cursor: 'default' } }, [
      el('div', { class: 'srowiw', style: { background: 'rgba(0,122,255,.15)' }, text: '◆', 'aria-hidden': 'true' }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', text: `خطة ${plan.name.ar}` }),
        el('div', { class: 'srowd', text: `${STATUS_LABELS[status] || status} · مساعد نَظْم: ${assistant.label}` }),
      ]),
      plan.price?.monthly ? el('span', { class: 'plan-price', text: `${plan.price.monthly} ر.س / شهر` }) : null,
    ]),
    quota && quota.level !== 'none' ? el('div', { class: `plan-alert ${quota.level}`, role: 'status', text: quota.message }) : null,
    el('div', { class: 'usage-list' }, rows.map(usageBar)),
    el('button', {
      class: 'btn btn-p', type: 'button', style: { width: '100%', marginTop: '10px' },
      text: plan.id === 'free' ? 'عرض الباقات' : 'تغيير الخطة',
      onClick: () => openPlansSheet(),
    }),
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

function renderDataPanel() {
  const panel = $('data-panel');
  if (!panel) return;

  const row = (icon, background, title, subtitle, onClick) => el('button', {
    class: 'srow srow-btn', type: 'button', onClick,
  }, [
    el('div', { class: 'srowiw', style: { background }, text: icon, 'aria-hidden': 'true' }),
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'srowl', text: title }),
      subtitle ? el('div', { class: 'srowd', text: subtitle }) : null,
    ]),
    el('div', { class: 'srowc', text: '›', 'aria-hidden': 'true' }),
  ]);

  render(panel, [
    // Categories lost their tab to the assistant; they live here now.
    row('◈', 'rgba(99,102,241,.15)', 'التصنيفات والمواقع', 'تنظيم التصنيفات والمواقع المستخدمة في المخزون', () => goTab('cats')),
    row('📊', 'rgba(52,199,89,.15)', 'تصدير Excel', 'جرد كامل بقيم رقمية وتواريخ حقيقية', () => {
      try { exportExcel(); toast('تم التصدير', '📊'); } catch (error) { toastError(error); }
    }),
    row('💾', 'rgba(0,122,255,.15)', 'نسخة احتياطية JSON', 'بيانات فقط — الصور محفوظة في التخزين السحابي', () => {
      try { exportJSON(); toast('تم إنشاء النسخة', '💾'); } catch (error) { toastError(error); }
    }),
    row('📥', 'rgba(255,149,0,.15)', 'استيراد', 'دمج أو استبدال، مع تحقق كامل قبل التنفيذ', startImport),
    row('🗑', 'rgba(142,142,147,.15)', 'سلة المحذوفات', `${formatNumber(repository.trashedItems().length)} قطعة`, openTrashSheet),
    row('📍', 'rgba(175,82,222,.15)', 'المواقع', `${formatNumber(repository.state.locations.length)} موقع`, openLocationsSheet),
  ]);

  const danger = $('danger-panel');
  render(danger, [
    el('button', {
      class: 'srow srow-btn', type: 'button',
      onClick: async () => {
        const items = repository.state.items.length;
        const folders = repository.state.folders.length;
        const confirmed = await confirmAction({
          title: 'حذف كل القطع والمجلدات؟',
          message: `سيُحذف ${formatNumber(items)} قطعة و${formatNumber(folders)} مجلد نهائياً. التصنيفات والمواقع لن تُحذف. نزّل نسخة احتياطية أولاً.`,
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
      el('div', { class: 'srowiw', style: { background: 'rgba(255,59,48,.15)' }, text: '🗑', 'aria-hidden': 'true' }),
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

  $('as-excel')?.addEventListener('click', () => {
    closeSheet('as');
    try { exportExcel(); toast('تم التصدير', '📊'); } catch (error) { toastError(error); }
  });
  $('as-json')?.addEventListener('click', () => {
    closeSheet('as');
    try { exportJSON(); toast('تم إنشاء النسخة', '💾'); } catch (error) { toastError(error); }
  });
  $('as-import')?.addEventListener('click', () => { closeSheet('as'); startImport(); });

  $('cats-back')?.addEventListener('click', () => goTab('set'));
  window.addEventListener('almakhzan:start-import', startImport);
  window.addEventListener('almakhzan:new-folder', () => openFolderSheet());
  window.addEventListener('almakhzan:edit-folder', (event) => openFolderSheet(event.detail));
}
