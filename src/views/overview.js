// Dashboard. Record counts and quantity totals are reported separately, and
// valuations are never summed across currencies.

import { ACTION_LABELS, CHART_COLORS, CONDITIONS, CONDITION_COLORS, CURRENCY_LABELS } from '../config.js';
import { repository } from '../repository.js';
import { ImageTier, bindImageSrc } from '../storage.js';
import { $, el, formatCompact, formatNumber, render, timeAgo } from '../utils.js';
import { formatValuation, primaryImage, valuationMidpoint } from '../validation.js';
import { emptyState, section } from '../ui.js';
import { openDetail } from './detail.js';
import { enterFolder } from './home.js';
import { goTab } from '../navigation.js';

function kpi(icon, value, label, sub, subColor) {
  // Long money strings would otherwise wrap out of the card.
  const size = value.length > 13 ? ' xs' : value.length > 9 ? ' sm' : '';
  return el('div', { class: 'ov-kpi gl-s' }, [
    el('div', { class: 'ov-kpi-bg', text: icon, 'aria-hidden': 'true' }),
    el('div', { class: `ov-kpi-val${size}`, text: value }),
    el('div', { class: 'ov-kpi-lbl', text: label }),
    sub ? el('div', { class: 'ov-kpi-sub', style: { color: subColor || 'var(--blue)' }, text: sub }) : null,
  ]);
}

/** Groups valuations by currency; each currency keeps its own total. */
function valuationTotals(items) {
  const byCurrency = new Map();
  for (const item of items) {
    const mid = valuationMidpoint(item.valuation);
    if (mid === null) continue;
    const code = item.valuation.currency;
    const entry = byCurrency.get(code) || { total: 0, count: 0, max: 0, currency: code };
    entry.total += mid;
    entry.count += 1;
    entry.max = Math.max(entry.max, item.valuation.max);
    byCurrency.set(code, entry);
  }
  return [...byCurrency.values()].sort((a, b) => b.total - a.total);
}

function barRow(label, count, max, color) {
  return el('div', { class: 'ov-bar-row' }, [
    el('div', { class: 'ov-bar-lbl', text: label }),
    el('div', { class: 'ov-bar-wrap' }, [
      el('div', { class: 'ov-bar-fill', style: { width: `${Math.round((count / max) * 100)}%`, background: color } }),
    ]),
    el('div', { class: 'ov-bar-count', text: formatNumber(count) }),
  ]);
}

function itemThumbNode(item) {
  const image = primaryImage(item);
  if (!image) {
    return el('div', { class: 'ov-item-thumb', text: repository.category(item.categoryId).icon, 'aria-hidden': 'true' });
  }
  const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
  bindImageSrc(img, image, { tier: ImageTier.THUMB });
  return el('div', { class: 'ov-item-thumb' }, [img]);
}

export function renderOverview() {
  const scroll = $('ov-scroll');
  if (!scroll) return;

  const items = repository.liveItems();
  if (!items.length) {
    render(scroll, [emptyState('📊', 'لا توجد بيانات بعد', 'أضف قطعاً للجرد لرؤية الإحصائيات')]);
    return;
  }

  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const analyzed = items.filter((i) => i.aiData).length;
  const valued = items.filter((i) => i.valuation).length;
  const categories = new Set(items.map((i) => i.categoryId).filter(Boolean)).size;
  const totals = valuationTotals(items);
  const primaryTotal = totals[0];

  const blocks = [];

  // ── KPIs ──
  blocks.push(el('div', { class: 'ov-kpi-grid' }, [
    kpi('📦', formatNumber(items.length), 'عدد السجلات',
      `${repository.state.folders.length} مجلد · ${categories} تصنيف`, 'var(--blue)'),
    kpi('🔢', formatNumber(totalQuantity), 'إجمالي الكميات',
      `متوسط ${(totalQuantity / items.length).toFixed(1)} لكل سجل`, 'var(--purple)'),
    kpi('💰',
      primaryTotal ? `${formatCompact(primaryTotal.total)} ${CURRENCY_LABELS[primaryTotal.currency]}` : '—',
      'إجمالي التقييم',
      `${formatNumber(valued)} سجل مُقيَّم`, 'var(--green)'),
    kpi('✦', formatNumber(analyzed), 'مُحلّلة بصرياً',
      `${Math.round((analyzed / items.length) * 100)}% من السجلات`, 'var(--teal)'),
  ]));

  // ── valuation by currency ──
  if (totals.length) {
    blocks.push(section('التقييم حسب العملة', [
      el('div', { class: 'gl-s ov-card' }, totals.map((entry) => el('div', { class: 'ov-cur-row' }, [
        el('div', { class: 'ov-cur-code' }, [
          el('span', { class: 'ov-cur-sym', text: CURRENCY_LABELS[entry.currency] || entry.currency }),
          el('span', { text: entry.currency }),
        ]),
        el('div', { class: 'ov-cur-meta', text: `${formatNumber(entry.count)} سجل` }),
        el('div', { class: 'ov-cur-total', text: formatCompact(entry.total) }),
      ]))),
      el('div', { class: 'ov-note', text: 'المجاميع منفصلة لكل عملة — لا يجري أي تحويل تلقائي بين العملات.' }),
    ]));
  }

  // ── condition distribution ──
  const conditionCounts = CONDITIONS
    .map((condition) => ({ condition, count: items.filter((i) => i.condition === condition).length }))
    .filter((entry) => entry.count > 0);
  const unspecified = items.filter((i) => !i.condition).length;

  if (conditionCounts.length || unspecified) {
    blocks.push(section('توزيع الحالة', [
      el('div', { class: 'ov-cond-grid' }, [
        ...conditionCounts.map((entry) => el('div', { class: 'ov-cond-pill' }, [
          el('div', { class: 'ov-cond-val', style: { color: CONDITION_COLORS[entry.condition] }, text: formatNumber(entry.count) }),
          el('div', { class: 'ov-cond-lbl', text: entry.condition }),
        ])),
        unspecified ? el('div', { class: 'ov-cond-pill' }, [
          el('div', { class: 'ov-cond-val', style: { color: 'var(--tt)' }, text: formatNumber(unspecified) }),
          el('div', { class: 'ov-cond-lbl', text: 'غير محدد' }),
        ]) : null,
      ]),
    ]));
  }

  // ── categories ──
  const categoryStats = repository.state.categories
    .map((category) => ({ category, count: items.filter((i) => i.categoryId === category.id).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  if (categoryStats.length) {
    const max = categoryStats[0].count;
    blocks.push(section('السجلات حسب التصنيف', [
      el('div', { class: 'gl-s ov-card' }, categoryStats.map((entry, index) => barRow(
        `${entry.category.icon} ${entry.category.name}`,
        entry.count, max, CHART_COLORS[index % CHART_COLORS.length],
      ))),
    ]));
  }

  // ── folders ──
  const folderStats = repository.state.folders
    .map((folder) => ({ folder, count: items.filter((i) => i.folderId === folder.id).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  if (folderStats.length) {
    const max = folderStats[0].count;
    blocks.push(section('السجلات حسب المجلد', [
      el('div', { class: 'gl-s ov-card' }, folderStats.map((entry) => el('button', {
        class: 'ov-fld-row', type: 'button',
        onClick: () => { goTab('home'); enterFolder(entry.folder.id); },
      }, [
        el('div', { class: 'ov-fld-ico', style: { background: `${entry.folder.color || '#007AFF'}22` }, text: entry.folder.icon, 'aria-hidden': 'true' }),
        el('div', { class: 'ov-fld-info' }, [
          el('div', { class: 'ov-fld-name', text: entry.folder.name }),
          el('div', { class: 'ov-fld-bar-wrap' }, [
            el('div', { class: 'ov-fld-bar-fill', style: { width: `${Math.round((entry.count / max) * 100)}%`, background: entry.folder.color || '#007AFF' } }),
          ]),
        ]),
        el('div', { class: 'ov-fld-count', text: formatNumber(entry.count) }),
      ]))),
    ]));
  }

  // ── top valued (within the dominant currency, so the ranking is meaningful) ──
  if (primaryTotal) {
    const ranked = items
      .filter((i) => i.valuation?.currency === primaryTotal.currency)
      .sort((a, b) => valuationMidpoint(b.valuation) - valuationMidpoint(a.valuation))
      .slice(0, 5);
    const medals = ['🥇', '🥈', '🥉'];
    const rankClasses = ['gold', 'silver', 'bronze'];

    blocks.push(section(`أعلى السجلات تقييماً (${primaryTotal.currency})`, [
      el('div', { class: 'ov-list-card' }, ranked.map((item, index) => el('button', {
        class: 'ov-item-row', type: 'button', onClick: () => openDetail(item.id),
      }, [
        el('div', { class: `ov-rank ${rankClasses[index] || ''}`, text: medals[index] || String(index + 1) }),
        itemThumbNode(item),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ov-act-name', text: item.name || '—' }),
          el('div', { class: 'ov-act-meta', text: repository.category(item.categoryId).name }),
        ]),
        el('div', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--green)', flexShrink: '0' }, text: formatValuation(item.valuation, { compact: true }) }),
      ]))),
    ]));
  }

  // ── AI summary ──
  const withLocal = items.filter((i) => i.aiData?.localScore != null);
  const withGlobal = items.filter((i) => i.aiData?.globalScore != null);
  if (withLocal.length) {
    const avgLocal = withLocal.reduce((s, i) => s + i.aiData.localScore, 0) / withLocal.length;
    const avgGlobal = withGlobal.length
      ? withGlobal.reduce((s, i) => s + i.aiData.globalScore, 0) / withGlobal.length
      : null;

    blocks.push(section('ملخص التحليل البصري', [
      el('div', { class: 'ov-kpi-grid' }, [
        kpi('🏠', `${avgLocal.toFixed(1)}/10`, 'متوسط السوق المحلي', `${formatNumber(withLocal.length)} سجل`, 'var(--teal)'),
        avgGlobal !== null ? kpi('🌍', `${avgGlobal.toFixed(1)}/10`, 'متوسط السوق العالمي', `${formatNumber(withGlobal.length)} سجل`, 'var(--purple)') : null,
      ]),
      el('div', { class: 'ov-note', text: 'تقديرات أولية من مساعد نَظْم، لا تُغني عن التقييم المعتمد.' }),
    ]));
  }

  // ── activity log ──
  const activity = repository.state.activity.slice(0, 8);
  if (activity.length) {
    blocks.push(section('آخر النشاطات', [
      el('div', { class: 'gl-s ov-card ov-act-card' }, activity.map((entry) => el('div', { class: 'ov-act-row' }, [
        el('div', { class: 'ov-act-ico', text: actionIcon(entry.action), 'aria-hidden': 'true' }),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ov-act-name', text: ACTION_LABELS[entry.action] || entry.action }),
          el('div', { class: 'ov-act-meta', text: entry.itemName || entry.folderName || entry.categoryName || '—' }),
        ]),
        el('div', { style: { fontSize: '11px', color: 'var(--tt)', flexShrink: '0' }, text: timeAgo(entry.timestamp) }),
      ]))),
    ]));
  }

  render(scroll, blocks);
}

function actionIcon(action) {
  if (action?.startsWith('ITEM_CREATED')) return '➕';
  if (action?.startsWith('ITEM_DELETED')) return '🗑';
  if (action?.startsWith('ITEM_RESTORED')) return '↩';
  if (action?.startsWith('ITEM_DUPLICATED')) return '⧉';
  if (action?.startsWith('ITEM_MOVED')) return '🗂';
  if (action?.startsWith('AI_')) return '✦';
  if (action?.startsWith('FOLDER_')) return '📁';
  if (action?.startsWith('CATEGORY_')) return '◈';
  if (action?.startsWith('IMPORT_')) return '📥';
  if (action?.startsWith('MIGRATION_')) return '⬆';
  return '•';
}
