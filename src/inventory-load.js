// Loading the rest of the inventory, visibly.
//
// The app opens on a window of the newest records (see `ITEM_WINDOW` in
// repository.js). That is enough to browse, and it is not enough to answer a
// question about the whole inventory: a search, a total, a health score, an
// export or a restore all need every record.
//
// Rather than guess, every one of those goes through here first. It loads the
// rest once per session, says so while it is happening, and returns false if
// it could not — so the caller can refuse instead of answering from a
// fraction of the data.

import { repository } from './repository.js';
import { toastError } from './ui.js';
import { $, el, formatNumber } from './utils.js';

let overlay = null;

function showOverlay() {
  if (overlay) return overlay;
  overlay = el('div', {
    class: 'loadwrap', role: 'status', 'aria-live': 'polite',
  }, [
    el('div', { class: 'loadbox' }, [
      el('div', { class: 'boot-spin', 'aria-hidden': 'true' }),
      el('div', { class: 'loadtext', id: 'loadtext', text: 'جارٍ قراءة المخزون…' }),
    ]),
  ]);
  document.body.appendChild(overlay);
  return overlay;
}

function hideOverlay() {
  overlay?.remove();
  overlay = null;
}

/**
 * Ensures `repository.state.items` is the whole inventory.
 *
 * @param {string} [reason] what needs it, shown to the customer while waiting.
 * @returns {Promise<boolean>} false when the inventory could not be loaded —
 *   the caller must not present a partial answer as a complete one.
 */
export async function withFullInventory(reason = '') {
  if (repository.itemsComplete) return true;

  // A short load should not flash a box on the screen; a long one must not be
  // a frozen tap.
  const timer = setTimeout(() => {
    showOverlay();
    if (reason) $('loadtext') && ($('loadtext').textContent = reason);
  }, 250);

  try {
    await repository.completeItems({
      onProgress: (seen) => {
        const node = $('loadtext');
        if (node) node.textContent = `جارٍ قراءة المخزون… ${formatNumber(seen)}`;
      },
    });
    return true;
  } catch (error) {
    console.error('[inventory] loading the rest failed', error);
    toastError(error, 'تعذّر تحميل المخزون كاملاً');
    return false;
  } finally {
    clearTimeout(timer);
    hideOverlay();
  }
}

/**
 * The line under a list that is showing a window rather than an inventory.
 * Returns null when everything is loaded, so callers can render it
 * unconditionally and it simply disappears once it stops being true.
 */
export function partialNotice(onLoadAll) {
  const { loaded, total, complete } = repository.loadState();
  if (complete) return null;
  return el('div', { class: 'partial' }, [
    el('span', {
      class: 'partial-text',
      text: total
        ? `يُعرض أحدث ${formatNumber(loaded)} من ${formatNumber(total)} قطعة`
        : `يُعرض أحدث ${formatNumber(loaded)} قطعة`,
    }),
    el('button', {
      class: 'partial-btn', type: 'button', text: 'اعرض الكل',
      onClick: async () => { if (await withFullInventory('جارٍ قراءة المخزون كاملاً…')) onLoadAll?.(); },
    }),
  ]);
}
