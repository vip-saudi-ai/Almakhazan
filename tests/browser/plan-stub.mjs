// The subscription module, as the browser tests need it.
//
// Several suites replace `src/subscription.js` so a flow can run without a
// billing backend. Each one used to carry its own copy of the stub, and every
// time the real module gained an export, those copies stopped satisfying the
// app's imports — the whole bundle failed to link and the failure showed up as
// "the app never became ready", which is a long way from its cause.
//
// One stub, here, built from the real entitlement engine so the answers are
// the real answers.

/**
 * @param {object} [options]
 * @param {string} [options.planId]  which plan the stubbed workspace is on
 * @param {object} [options.usage]   usage counters to report
 * @param {number|null} [options.quotaLimit] overrides the record quota shown
 * @param {string[]} [options.omit]  exports the caller supplies itself; the
 *   stub leaves them out rather than declaring them twice
 * @param {string} [options.extra]   extra module source, for a suite that
 *   needs one export to behave differently
 */
export function planStub({
  planId = 'business', usage = {}, quotaLimit = null, omit = [], extra = '',
} = {}) {
  const counters = { items: 0, storageBytes: 0, members: 1, aiCreditsUsed: 0, ...usage };
  const skipped = new Set(omit);
  // A suite that overrides an export must not also receive the default one:
  // two declarations of the same name is a syntax error, and the module then
  // fails to link, which surfaces as "the app never became ready".
  const only = (name, source) => (skipped.has(name) ? '' : source);
  return `
    import { PLAN_CONFIG } from '/src/plans.generated.js';
    import {
      assistantPresentation, checkCreateItem, checkFeature, checkImportRows, checkUseAI,
      importRowLimit, itemQuotaStatus, usageSummary,
    } from '/src/entitlements.js';
    import { MAX_ROWS } from '/src/spreadsheet.js';

    const plan = { ...PLAN_CONFIG.plans['${planId}'], id: '${planId}' };
    const entitlement = { plan, planId: plan.id, status: 'active', readOnly: false };
    const usage = ${JSON.stringify(counters)};

    export function startPlanWatch(){}
    export function stopPlanWatch(){}
    // The real module hands a new listener the current state immediately,
    // which is how the app learns the server's record count. The stub must too.
    ${only('onSubscriptionChange', `export function onSubscriptionChange(listener){ listener({ entitlement, usage, ready: true }); return () => {}; }`)}
    ${only('subscriptionState', `export function subscriptionState(){ return { entitlement, usage, ready: true }; }`)}
    ${only('currentPlan', `export function currentPlan(){ return plan; }`)}
    ${only('planStatus', `export function planStatus(){ return 'active'; }`)}
    ${only('quotaStatus', `export function quotaStatus(){ ${quotaLimit == null
      ? 'return itemQuotaStatus({ entitlement, usage });'
      : `return { level: 'none', message: null, used: usage.items, limit: ${quotaLimit}, ratio: 0 };`} }`)}
    ${only('canAddItem', `export function canAddItem(){ return checkCreateItem({ entitlement, usage }); }`)}
    ${only('planUsage', `export function planUsage(){ return usageSummary({ entitlement, usage }); }`)}
    ${only('assistantLabel', `export function assistantLabel(){ return assistantPresentation({ entitlement }); }`)}
    ${only('canUseAssistant', `export function canUseAssistant(){ return checkUseAI({ entitlement, usage }); }`)}
    ${only('canUseFeature', `export function canUseFeature(name){ return checkFeature({ entitlement }, name); }`)}
    ${only('importLimit', `export function importLimit(){ return importRowLimit({ entitlement }, MAX_ROWS); }`)}
    ${only('canImportRows', `export function canImportRows(rows){ return checkImportRows({ entitlement }, rows, MAX_ROWS); }`)}
    ${only('activityRetentionDays', `export function activityRetentionDays(){ return plan.limits.activityRetentionDays ?? 0; }`)}
    ${extra}
  `;
}
