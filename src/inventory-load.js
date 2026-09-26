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
//
// ── every caller, and why it is still here ────────────────────────────────
//
// This list is the audit. A call that cannot justify itself below should be
// deleted rather than left in, because each one is a customer waiting.
//
//   navigation.js      Overview, the assistant and the category screen. Each
//                      is a statement about the whole inventory — a total, a
//                      score, every category with its count — so each needs
//                      every record. Settings is deliberately NOT in this
//                      set: account, plan, appearance, import/export,
//                      workspace, team and preferences mention no record.
//
//   home.js narrowing  A search, a filter, a sort or a folder, answered by
//                      the local adapter, which has no index. This is the one
//                      that a remote adapter removes: it declares
//                      `needsEverything` false and the load never happens.
//                      The seam is in query.js; nothing in the UI changes.
//
//   home.js scanner    "No record carries this barcode" has to mean the whole
//                      inventory or it is not an answer.
//
//   manage.js trash    A deleted record is old by definition, so it sorts out
//                      of a newest-first window. Charged to opening Trash,
//                      not to opening Settings.
//
//   manage.js export   An export and a backup are statements about the whole
//   (Excel, JSON)      inventory. A short file that looks complete is worse
//                      than a slow one.
//
//   restore.js         Takes the safety backup. A backup of a window would
//   (completeItems)    let step three delete records it never backed up.
//
//   device-upload.js   "No image still points at the device" must be true of
//   (completeItems)    every record.
//
// What is NOT here any more: spreadsheet import (taxonomy is held in full
// anyway, and plan room is a count), opening Settings, and drawing category, folder
// or location counts — those now come from one pass over whatever is loaded
// (`inventoryCounts` in query.js) rather than one filter per entry.

import { repository } from './repository.js';
import { toastError } from './ui.js';
import { $, el, formatNumber } from './utils.js';
import { t } from './i18n.js';

let overlay = null;

function showOverlay() {
  if (overlay) return overlay;
  overlay = el('div', {
    class: 'loadwrap', role: 'status', 'aria-live': 'polite',
  }, [
    el('div', { class: 'loadbox' }, [
      el('div', { class: 'boot-spin', 'aria-hidden': 'true' }),
      el('div', { class: 'loadtext', id: 'loadtext', text: t('load.reading') }),
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
        if (node) node.textContent = t('load.readingCount', { count: seen });
      },
    });
    return true;
  } catch (error) {
    console.error('[inventory] loading the rest failed', error);
    toastError(error, 'load.failed');
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
        ? t('load.partialOf', { loaded, total })
        : t('load.partial', { count: loaded }),
    }),
    el('button', {
      class: 'partial-btn', type: 'button', text: t('load.showAll'),
      onClick: async () => { if (await withFullInventory(t('load.readingAll'))) onLoadAll?.(); },
    }),
  ]);
}
