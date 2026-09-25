// Every message, merged from the per-area modules. A key defined twice is a
// mistake — the later one would silently win — so it is reported.

import { messages as common } from './common.js';
import { messages as gateMessages } from './gate.js';
import { messages as viewerMessages } from './viewer.js';
import { messages as teamMessages } from './team.js';
import { messages as overviewMessages } from './overview.js';
import { messages as sheetimportMessages } from './sheetimport.js';
import { messages as formMessages } from './form.js';
import { messages as settingsMessages } from './settings.js';
import { messages as detailMessages } from './detail.js';
import { messages as homeMessages } from './home.js';
import { messages as importing } from './import.js';
import { messages as assistant } from './assistant.js';
import { messages as plans } from './plans.js';
import { messages as errors } from './errors.js';
import { messages as app } from './app.js';
import { messages as ui } from './ui.js';

const MODULES = { common, gateMessages, viewerMessages, teamMessages, overviewMessages, sheetimportMessages, formMessages, settingsMessages, detailMessages, homeMessages, importing, assistant, plans, errors, app, ui };

export const MESSAGES = {};
for (const [area, messages] of Object.entries(MODULES)) {
  for (const [key, value] of Object.entries(messages)) {
    if (key in MESSAGES) console.warn(`[i18n] ${key} is defined twice (again in ${area})`);
    MESSAGES[key] = value;
  }
}
