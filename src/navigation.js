// Tab switching. Kept in its own module so views can navigate without importing
// the app orchestrator (and creating an import cycle).

import { withFullInventory } from './inventory-load.js';
import { repository } from './repository.js';
import { $ } from './utils.js';

// 'cats' keeps a view but no longer a tab: categories are managed from
// Settings, and the tab bar belongs to the four screens a customer lives in.
const TABS = ['home', 'ov', 'ai', 'cats', 'set'];
const renderers = new Map();

export function registerTab(name, render) {
  renderers.set(name, render);
}

/**
 * Redraw the screen in front of the customer, and only that one.
 *
 * A data change used to re-render the inventory list whatever the customer was
 * looking at. An import writing 2,000 records emits a snapshot per chunk, and
 * each one rebuilt two hundred cards, resolved their images and recomputed
 * their pills — into a screen nobody could see, on the same thread as the
 * screen they were actually using.
 *
 * The hidden screens need no bookkeeping to stay correct: `goTab` redraws
 * whatever it opens, from the data as it is at that moment. Being shown is the
 * first time a drawing can be looked at, and therefore the first time it has
 * to be right.
 */
export function renderActiveTab() {
  renderers.get(activeTab())?.();
}

// Which screens are a statement about the whole inventory.
//
//   ov    a dashboard of totals and proportions
//   ai    a score and an answer computed from every record
//
// Two screens have left this set as the query engine learned to answer their
// questions by index. Settings never described the records at all, and the
// Categories screen now gets an exact count per category from an index range
// rather than by counting an array. Trash has its own index too, and reads it
// on the way in. What remains are the two screens that genuinely aggregate
// over every record, and for those the wait is the honest price of the answer.
const NEEDS_WHOLE_INVENTORY = new Set(['ov', 'ai']);

export function goTab(name) {
  if (!TABS.includes(name)) return;

  for (const tab of TABS) {
    const view = $(`v-${tab}`);
    const button = $(`t-${tab}`);
    const active = tab === name;
    view?.classList.toggle('active', active);
    button?.classList.toggle('on', active);
    button?.setAttribute('aria-selected', String(active));
    view?.setAttribute('aria-hidden', String(!active));
  }

  const render = renderers.get(name);
  if (!render) return;

  if (NEEDS_WHOLE_INVENTORY.has(name) && !repository.itemsComplete) {
    // Nothing is drawn from a fraction: the screen appears once the numbers on
    // it are the real ones. If the load fails, go back rather than show a
    // total that is wrong.
    void withFullInventory('جارٍ قراءة المخزون كاملاً…').then((ok) => {
      if (ok) render();
      else if (activeTab() === name) goTab('home');
    });
    return;
  }

  render();
}

export function activeTab() {
  return TABS.find((tab) => $(`v-${tab}`)?.classList.contains('active')) || 'home';
}
