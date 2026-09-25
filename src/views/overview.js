// Dashboard. Record counts and quantity totals are reported separately, and
// valuations are never summed across currencies.

import { CHART_COLORS, CONDITIONS, CONDITION_COLORS } from '../config.js';
import { t } from '../i18n.js';
import { actionLabel, activityDetail, categoryName, conditionLabel, currencySymbol } from '../labels.js';
import { repository } from '../repository.js';
import { totalsByCurrency } from '../money.js';
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

/* Grouping lives in src/money.js, so the rule "never add across currencies"
   has one implementation rather than one per screen. */

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
    render(scroll, [emptyState('📊', t('overview.emptyTitle'), t('overview.emptySub'))]);
    return;
  }

  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const analyzed = items.filter((i) => i.aiData).length;
  const valued = items.filter((i) => i.valuation).length;
  const categories = new Set(items.map((i) => i.categoryId).filter(Boolean)).size;
  const totals = totalsByCurrency(items);
  const primaryTotal = totals[0];

  const blocks = [];

  // ── KPIs ──
  blocks.push(el('div', { class: 'ov-kpi-grid' }, [
    kpi('📦', formatNumber(items.length), t('overview.records'),
      `${t('overview.folders', { count: repository.state.folders.length })} · ${t('overview.categories', { count: categories })}`, 'var(--blue)'),
    kpi('🔢', formatNumber(totalQuantity), t('overview.totalQuantity'),
      t('overview.average', { value: formatNumber(totalQuantity / items.length, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }), 'var(--purple)'),
    // One tile cannot hold three currencies, and picking the biggest and
    // calling it "the total" would be the lie this whole module avoids. The
    // tile names its own currency and says how many others there are; the
    // breakdown below is the real answer.
    kpi('💰',
      primaryTotal ? `${formatCompact(primaryTotal.total)} ${currencySymbol(primaryTotal.currency)}` : '—',
      totals.length > 1 ? t('overview.valuationIn', { currency: currencySymbol(primaryTotal.currency) }) : t('overview.totalValuation'),
      totals.length > 1
        ? t('overview.otherCurrencies', { count: totals.length - 1 })
        : t('overview.valuedRecords', { count: valued }), 'var(--green)'),
    kpi('✦', formatNumber(analyzed), t('overview.analyzed'),
      t('overview.percentOfRecords', { percent: formatNumber(analyzed / items.length, { style: 'percent' }) }), 'var(--teal)'),
  ]));

  // ── valuation by currency ──
  if (totals.length) {
    blocks.push(section(t('overview.byCurrency'), [
      el('div', { class: 'gl-s ov-card' }, totals.map((entry) => el('div', { class: 'ov-cur-row' }, [
        el('div', { class: 'ov-cur-code' }, [
          el('span', { class: 'ov-cur-sym', text: currencySymbol(entry.currency) }),
          el('span', { text: entry.currency }),
        ]),
        el('div', { class: 'ov-cur-meta', text: t('overview.recordCount', { count: entry.count }) }),
        el('div', { class: 'ov-cur-total', text: formatCompact(entry.total) }),
      ]))),
      el('div', { class: 'ov-note', text: t('overview.currencyNote') }),
    ]));
  }

  // ── condition distribution ──
  const conditionCounts = CONDITIONS
    .map((condition) => ({ condition, count: items.filter((i) => i.condition === condition).length }))
    .filter((entry) => entry.count > 0);
  const unspecified = items.filter((i) => !i.condition).length;

  if (conditionCounts.length || unspecified) {
    blocks.push(section(t('overview.conditions'), [
      el('div', { class: 'ov-cond-grid' }, [
        ...conditionCounts.map((entry) => el('div', { class: 'ov-cond-pill' }, [
          el('div', { class: 'ov-cond-val', style: { color: CONDITION_COLORS[entry.condition] }, text: formatNumber(entry.count) }),
          el('div', { class: 'ov-cond-lbl', text: conditionLabel(entry.condition) }),
        ])),
        unspecified ? el('div', { class: 'ov-cond-pill' }, [
          el('div', { class: 'ov-cond-val', style: { color: 'var(--tt)' }, text: formatNumber(unspecified) }),
          el('div', { class: 'ov-cond-lbl', text: t('overview.unspecified') }),
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
    blocks.push(section(t('overview.byCategory'), [
      el('div', { class: 'gl-s ov-card' }, categoryStats.map((entry, index) => barRow(
        `${entry.category.icon} ${categoryName(entry.category)}`,
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
    blocks.push(section(t('overview.byFolder'), [
      el('div', { class: 'gl-s ov-card' }, folderStats.map((entry) => el('button', {
        class: 'ov-fld-row', type: 'button',
        onClick: () => { goTab('home'); enterFolder(entry.folder.id); },
      }, [
        el('div', { class: 'ov-fld-ico', style: { background: `${entry.folder.color || '#007AFF'}22` }, text: entry.folder.icon, 'aria-hidden': 'true' }),
        el('div', { class: 'ov-fld-info' }, [
          el('div', { class: 'ov-fld-name', text: entry.folder.name, dir: 'auto' }),
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

    blocks.push(section(t('overview.topValued', { currency: primaryTotal.currency }), [
      el('div', { class: 'ov-list-card' }, ranked.map((item, index) => el('button', {
        class: 'ov-item-row', type: 'button', onClick: () => openDetail(item.id),
      }, [
        el('div', { class: `ov-rank ${rankClasses[index] || ''}`, text: medals[index] || String(index + 1) }),
        itemThumbNode(item),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ov-act-name', text: item.name || '—', dir: 'auto' }),
          el('div', { class: 'ov-act-meta', text: categoryName(repository.category(item.categoryId)), dir: 'auto' }),
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

    blocks.push(section(t('overview.aiSummary'), [
      el('div', { class: 'ov-kpi-grid' }, [
        kpi('🏠', `${formatNumber(avgLocal, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}/10`, t('overview.localAverage'), t('overview.recordCount', { count: withLocal.length }), 'var(--teal)'),
        avgGlobal !== null ? kpi('🌍', `${formatNumber(avgGlobal, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}/10`, t('overview.globalAverage'), t('overview.recordCount', { count: withGlobal.length }), 'var(--purple)') : null,
      ]),
      el('div', { class: 'ov-note', text: t('overview.aiNote') }),
    ]));
  }

  // ── activity log ──
  const activity = repository.state.activity.slice(0, 8);
  if (activity.length) {
    blocks.push(section(t('overview.recentActivity'), [
      el('div', { class: 'gl-s ov-card ov-act-card' }, activity.map((entry) => el('div', { class: 'ov-act-row' }, [
        el('div', { class: 'ov-act-ico', text: actionIcon(entry.action), 'aria-hidden': 'true' }),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ov-act-name', text: actionLabel(entry.action) }),
          el('div', { class: 'ov-act-meta', text: activityDetail(entry), dir: 'auto' }),
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
