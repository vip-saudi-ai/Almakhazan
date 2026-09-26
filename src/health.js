// صحة مخزونك — the inventory health score.
//
// The score is arithmetic, not opinion: six signals with published weights,
// computed from the records themselves. The assistant may later explain a
// score or propose what to fix, but it never produces the number — a number a
// model invents cannot be argued with, and this one has to be.
//
// Weights (from the brandbook):
//   30% images · 20% location · 15% category · 15% condition
//   10% review recency · 10% data integrity

import { UNCATEGORIZED_ID } from './config.js';
import { findDuplicateGroups } from './duplicates.js';
import { t } from './i18n.js';

export const WEIGHTS = Object.freeze({
  images: 0.30,
  location: 0.20,
  category: 0.15,
  condition: 0.15,
  recency: 0.10,
  integrity: 0.10,
});

const YEAR = 365 * 24 * 60 * 60 * 1000;

const has = {
  images: (item) => item.images?.length > 0,
  location: (item) => Boolean(item.locationId),
  // Classified: a Main Category and a Category that belong together. A
  // Subcategory is optional and never counts against the score.
  category: (item, now, classify) => {
    if (classify) { const c = classify(item); return Boolean(c.main && c.category); }
    return Boolean(item.categoryId) && item.categoryId !== UNCATEGORIZED_ID;
  },
  condition: (item) => Boolean(item.condition),
  recency: (item, now) => now - (item.updatedAt ?? 0) < YEAR,
  // A record is "sound" when it can actually be found and counted: it has a
  // name, a usable quantity, and at least one way to identify it beyond the
  // name — a value, a code or a description.
  integrity: (item) => Boolean(item.name)
    && Number.isFinite(item.quantity)
    && item.quantity >= 0
    && Boolean(item.valuation || item.sku || item.barcode || item.description),
};

/** Each signal is shown as the `health.signal.<key>` message. */

/**
 * Four bands, four different words.
 *
 * 90+ and 75+ both used to open with "ممتاز", so a score of 76 and a score of
 * 98 were told the same thing — which makes the number decorative. Each band
 * now names where it actually stands, and only the top one is excellent.
 *
 * The thresholds and the weights are untouched; this is wording.
 */
function band(score) {
  const key = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 50 ? 'fair' : 'weak';
  return { key, label: t(`health.band.${key}`) };
}

/**
 * @param {Array} items live records (Trash excluded by the caller)
 * @returns {{score: number, band: object, signals: Array, counts: object, empty: boolean}}
 */
/**
 * @param {{now?: number, classify?: (item) => {main, category}}} [options]
 *   `classify` resolves a record's classification (repository.classification);
 *   without it only the flat Category is looked at.
 */
export function inventoryHealth(items, { now = Date.now(), classify = null } = {}) {
  const total = items.length;
  if (!total) {
    return {
      score: 0,
      band: { key: 'empty', label: t('health.band.empty') },
      signals: [],
      counts: { total: 0, missingImages: 0, missingLocation: 0, missingCategory: 0, stale: 0, duplicates: 0 },
      empty: true,
    };
  }

  const met = {};
  for (const key of Object.keys(WEIGHTS)) {
    met[key] = items.filter((item) => has[key](item, now, classify)).length;
  }
  // Of the unclassified, how many lack even a Main Category — the first step.
  const missingMain = classify ? items.filter((item) => !classify(item).main).length : 0;

  const score = Math.round(
    Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + weight * (met[key] / total), 0) * 100,
  );

  const duplicates = findDuplicateGroups(items);
  const duplicateItems = duplicates.reduce((sum, group) => sum + group.items.length, 0);

  const signals = Object.entries(WEIGHTS).map(([key, weight]) => ({
    key,
    label: t(`health.signal.${key}`),
    weight,
    met: met[key],
    missing: total - met[key],
    ratio: met[key] / total,
    percent: Math.round((met[key] / total) * 100),
  }));

  return {
    score,
    band: band(score),
    signals,
    counts: {
      total,
      missingImages: total - met.images,
      missingLocation: total - met.location,
      missingCategory: total - met.category,
      missingMainCategory: missingMain,
      missingCondition: total - met.condition,
      stale: total - met.recency,
      duplicates: duplicateItems,
      duplicateGroups: duplicates.length,
    },
    duplicates,
    empty: false,
  };
}

/**
 * What to fix first. Each task carries the points it would add, so the order
 * is defensible rather than a feeling: fixing images on a third of the
 * inventory is worth more than naming the last two folders.
 */
export function cleanupTasks(health, { valuableFrom = 10000 } = {}) {
  if (health.empty) return [];
  const { counts, total } = { counts: health.counts, total: health.counts.total };
  const points = (key, missing) => Math.round(WEIGHTS[key] * (missing / total) * 100);
  const tasks = [];

  if (counts.missingImages) {
    tasks.push({
      id: 'images',
      title: t('health.task.images', { count: counts.missingImages }),
      detail: t('health.task.imagesDetail'),
      gain: points('images', counts.missingImages),
      action: 'review-missing-images',
      cta: t('health.cta.review'),
      priority: 'high',
    });
  }
  if (counts.duplicates) {
    tasks.push({
      id: 'duplicates',
      title: t('health.task.duplicates', { count: counts.duplicateGroups }),
      detail: t('health.task.duplicatesDetail'),
      gain: 0,
      action: 'review-duplicates',
      cta: t('health.cta.duplicates'),
      priority: counts.duplicateGroups > 4 ? 'high' : 'normal',
    });
  }
  if (counts.missingCategory) {
    const noMain = counts.missingMainCategory || 0;
    tasks.push({
      id: 'category',
      title: noMain ? t('health.task.mainCategory', { count: noMain }) : t('health.task.category', { count: counts.missingCategory }),
      detail: noMain ? t('health.task.mainCategoryDetail') : t('health.task.categoryDetail'),
      gain: points('category', counts.missingCategory),
      action: 'review-missing-category',
      cta: t('health.cta.suggestions'),
      priority: 'normal',
    });
  }
  if (counts.missingLocation) {
    tasks.push({
      id: 'location',
      title: t('health.task.location', { count: counts.missingLocation }),
      detail: t('health.task.locationDetail'),
      gain: points('location', counts.missingLocation),
      action: 'review-missing-location',
      cta: t('health.cta.review'),
      priority: 'normal',
    });
  }
  if (counts.stale) {
    tasks.push({
      id: 'stale',
      title: t('health.task.stale', { count: counts.stale }),
      detail: t('health.task.staleDetail'),
      gain: points('recency', counts.stale),
      action: 'review-stale',
      cta: t('health.cta.show'),
      priority: 'low',
    });
  }

  return tasks.sort((a, b) => (b.gain - a.gain) || (a.priority === 'high' ? -1 : 1));
}
