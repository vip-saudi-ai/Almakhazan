// Every message, merged from the per-area modules. A key defined twice is a
// mistake — the later one would silently win — so it is reported.

import common from './common.js';
import formMessages from './form.js';
import settingsMessages from './settings.js';
import detailMessages from './detail.js';
import homeMessages from './home.js';
import importing from './import.js';
import assistant from './assistant.js';
import plans from './plans.js';
import errors from './errors.js';
import app from './app.js';
import ui from './ui.js';

const MODULES = { common, formMessages, settingsMessages, detailMessages, homeMessages, importing, assistant, plans, errors, app, ui };

export const MESSAGES = {};
for (const [area, messages] of Object.entries(MODULES)) {
  for (const [key, value] of Object.entries(messages)) {
    if (key in MESSAGES) console.warn(`[i18n] ${key} is defined twice (again in ${area})`);
    MESSAGES[key] = value;
  }
}
