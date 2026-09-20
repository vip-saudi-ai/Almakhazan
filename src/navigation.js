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

// The home screen can live on a window of the newest records. Every other
// screen states something about the whole inventory — a total, a score, a
// list of categories and their counts — so it waits for the whole inventory.
const NEEDS_WHOLE_INVENTORY = new Set(['ov', 'ai', 'cats', 'set']);

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
