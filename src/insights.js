// The assistant and the health score, answered through the repository.
//
// ask.js turns a question into a plan — filters, text, an order — and says
// what the answer means; this module executes that plan with the repository's
// query, count and aggregate calls. Nothing here reads the inventory: a count
// is an index size or a bounded walk, a total comes from the aggregate, a list
// is one page. The same calls reach the device's indexes today and a server
// later, so the assistant needs no change when the cloud becomes authoritative.

import { repository } from './repository.js';
import { answerFor, interpretQuestion } from './ask.js';
import { inventoryHealthFromOverview } from './health.js';
import { findDuplicateGroups } from './duplicates.js';

const YEAR = 365 * 24 * 60 * 60 * 1000;
/** How many records an answer shows before handing over to the inventory. */
const ANSWER_ROWS = 12;

/**
 * An answer to a question, from the repository.
 *
 * @param {string} question
 * @param {{lookups: object, now?: number}} context
 */
export async function askRepository(question, { lookups, now = Date.now() }) {
  const currencies = (await repository.currenciesPresent()) || [];
  const plan = interpretQuestion(question, { lookups, currencies, now });
  if (!plan.understood || !plan.query) return answerFor(plan, { items: [], total: 0 }, { lookups });

  const { filters, text, sort } = plan.query;
  const limit = plan.kind === 'where' ? 6 : ANSWER_ROWS;
  const page = await repository.queryItems({
    filters, text, limit, sort: sort || { field: 'updatedAt', direction: 'desc' }, projection: 'list',
  });
  const total = page.total ?? (await repository.countItemsMatching({ filters, text })).count;

  let totals;
  if (plan.kind === 'sum') {
    const sums = await repository.aggregateItems({ filters, text });
    totals = Object.entries(sums.byCurrency)
      .map(([currency, entry]) => ({ currency, total: entry.total, count: entry.count }))
      .sort((a, b) => b.count - a.count || b.total - a.total);
  }
  return answerFor(plan, {
    items: plan.kind === 'sum' ? page.items.filter((item) => item.valuation) : page.items,
    total,
    totals,
  }, { lookups });
}

/**
 * The health score from counts: the persisted aggregate, one ranged count for
 * records not reviewed in a year, and duplicate groups built from the records
 * whose identifiers or names collide (found by index keys alone).
 *
 * @returns {Promise<object|null>} null when the backend cannot say
 */
export async function inventoryHealthSnapshot({ now = Date.now(), duplicates: withDuplicates = true } = {}) {
  const overview = await repository.getInventoryOverview();
  if (!overview) return null;
  // Duplicates do not move the score (health.js WEIGHTS); finding them walks
  // four identifier indexes, so a caller may draw the score first and ask
  // for them after (`duplicates: false`).
  const [stale, candidates] = await Promise.all([
    overview.totalItems ? repository.countItemsMatching({ filters: { updatedAt: { lt: now - YEAR } } }).then((r) => r.count) : 0,
    overview.totalItems && withDuplicates ? repository.duplicateCandidates() : null,
  ]);
  const duplicates = candidates ? findDuplicateGroups(candidates.items) : [];
  const health = inventoryHealthFromOverview(overview, {
    stale,
    duplicates,
    classify: (refs) => repository.classification(refs),
  });
  return { ...health, duplicatesKnown: Boolean(candidates), duplicatesTruncated: Boolean(candidates?.truncated) };
}

/**
 * The questions the health tasks hand over to the inventory screen.
 *
 * "Not classified" depends on the taxonomy, not on a stored field, so it is
 * asked as "Category is one of these": the Category references that do not
 * resolve to a Category, read from the aggregate's (Main Category, Category)
 * pairs. Every record carries a Category reference (validation.js), so this
 * is the whole set.
 */
export async function healthQuery(action, { now = Date.now() } = {}) {
  if (action === 'review-missing-category') {
    const overview = await repository.getInventoryOverview();
    if (!overview) return null;
    const ids = new Set();
    for (const key of Object.keys(overview.byClassification || {})) {
      const [mainCategoryId, categoryId] = key.split('|');
      const { main, category } = repository.classification({ mainCategoryId: mainCategoryId || null, categoryId: categoryId || null });
      if ((!main || !category) && categoryId) ids.add(categoryId);
    }
    // The contract bounds an "in" list; a workspace with more distinct broken
    // references than that is shown the first of them, and fixing those
    // brings the rest into the next answer.
    return ids.size ? { filters: { categoryId: { in: [...ids].slice(0, 30) } } } : null;
  }
  switch (action) {
    case 'review-missing-images': return { filters: { hasImages: false } };
    case 'review-missing-location': return { filters: { locationId: { exists: false } } };
    case 'review-stale': return { filters: { updatedAt: { lt: now - YEAR } } };
    default: return null;
  }
}
