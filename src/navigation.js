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

// Which screens are a statement about the whole inventory.
//
//   ov    a dashboard of totals and proportions
//   ai    a score and an answer computed from every record
//   cats  every category with how many records carry it
//
// Settings is not one of them, and it used to be. Account, plan, appearance,
// import/export, workspace, team and preferences say nothing about the
// records — so a customer with 20,000 of them was made to wait for all of
// them to open a screen that never mentions them. The one Settings
// destination that does need them, Trash, loads on its own way in.
const NEEDS_WHOLE_INVENTORY = new Set(['ov', 'ai', 'cats']);

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
