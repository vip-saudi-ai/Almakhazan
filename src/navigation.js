// Tab switching. Kept in its own module so views can navigate without importing
// the app orchestrator (and creating an import cycle).

import { $ } from './utils.js';

// 'cats' keeps a view but no longer a tab: categories are managed from
// Settings, and the tab bar belongs to the four screens a customer lives in.
const TABS = ['home', 'ov', 'ai', 'cats', 'set'];
const renderers = new Map();

export function registerTab(name, render) {
  renderers.set(name, render);
}

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

  renderers.get(name)?.();
}

export function activeTab() {
  return TABS.find((tab) => $(`v-${tab}`)?.classList.contains('active')) || 'home';
}
