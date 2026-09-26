// The store the app sells through, if the host installed one.
//
// Deliberately free of imports: src/config.js (the local-mode policy) and
// src/features.js both ask it, and it must not pull the platform module into
// the configuration layer.
//
//   native app  StoreKit through the bridge: NazmNative.purchase,
//               restorePurchases, manageSubscriptions
//   web         a checkout integration that sets window.NazmBilling =
//               { purchase, restore?, manage? } before the app loads
//
// null when there is none — and then no plan is ever offered for sale.

export function purchaseProvider() {
  const native = globalThis.NazmNative;
  if (typeof native?.purchase === 'function') {
    return {
      purchase: (request) => native.purchase(request),
      restore: typeof native.restorePurchases === 'function' ? () => native.restorePurchases() : null,
      manage: typeof native.manageSubscriptions === 'function' ? () => native.manageSubscriptions() : null,
    };
  }
  const inNativeHost = Boolean(native) || Boolean(globalThis.Capacitor?.isNativePlatform?.());
  const web = globalThis.NazmBilling;
  if (!inNativeHost && typeof web?.purchase === 'function') {
    return {
      purchase: (request) => web.purchase(request),
      restore: typeof web.restore === 'function' ? () => web.restore() : null,
      manage: typeof web.manage === 'function' ? () => web.manage() : null,
    };
  }
  return null;
}
