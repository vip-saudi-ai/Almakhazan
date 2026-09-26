// Buying a plan — the one place the app hands off to a payment provider.
//
// Nothing here activates a plan. A purchase goes to the provider (StoreKit in
// the iOS app, through the native bridge; a web checkout on the web), the
// provider's server notification reaches the backend (BILLING.md), and the
// backend writes the subscription the app then reads. The UI never assumes a
// purchase succeeded, and never shows a plan as active because a button was
// pressed.
//
// Shown only when features.billing is on in nazm.config.js, which must not be
// switched on before a provider is connected here: purchase, Restore Purchases
// and Manage Subscription (App Review Guideline 3.1.1 / 3.1.2).

import { AppError } from './utils.js';
import { Feature, isFeatureEnabled } from './features.js';
import { purchaseProvider } from './purchase-provider.js';

// The provider is the host's (src/platform.js → purchaseProvider): StoreKit
// through the native bridge, or a web checkout integration. Without one,
// Feature.BILLING is off whatever the configuration says.
const provider = () => purchaseProvider();

export function purchasesAvailable() {
  return isFeatureEnabled(Feature.BILLING) && typeof provider()?.purchase === 'function';
}

export function canRestorePurchases() {
  return isFeatureEnabled(Feature.BILLING) && typeof provider()?.restore === 'function';
}

export function canManageSubscription() {
  return isFeatureEnabled(Feature.BILLING) && typeof provider()?.manage === 'function';
}

/**
 * Starts the provider's purchase sheet. Resolves with the provider's own
 * status ('purchased' | 'pending' | 'cancelled'); the plan changes on screen
 * only when the backend has recorded it.
 */
export async function startPurchase(planId, cycle) {
  if (!purchasesAvailable()) {
    console.error('[billing] features.billing is on but no purchase provider is connected');
    throw new AppError('error.billing/unavailable', { code: 'billing/unavailable' });
  }
  try {
    const result = await provider().purchase({ planId, cycle });
    return result?.status || 'pending';
  } catch (error) {
    if (error?.code === 'cancelled' || error?.name === 'AbortError') return 'cancelled';
    throw new AppError('error.billing/failed', { code: 'billing/failed', cause: error });
  }
}

export async function restorePurchases() {
  if (!canRestorePurchases()) throw new AppError('error.billing/unavailable', { code: 'billing/unavailable' });
  try {
    return await provider().restore();
  } catch (error) {
    throw new AppError('error.billing/failed', { code: 'billing/failed', cause: error });
  }
}

export async function manageSubscription() {
  if (!canManageSubscription()) throw new AppError('error.billing/unavailable', { code: 'billing/unavailable' });
  await provider().manage();
}
