// A quiet card on the inventory screen when the inventory has gone too long
// without a Full Backup (see backupReminderDue). Never a notification, never
// blocking, and «لاحقاً» puts it away for a week.

import { t } from '../i18n.js';
import { repository } from '../repository.js';
import { backupReminderDue, snoozeBackupReminder, lastBackupInfo } from '../full-backup.js';
import { $, el, render } from '../utils.js';

let due = false;
let checking = null;

/** Re-asks whether the card is due; cheap (two meta reads and a count). */
export function refreshBackupReminder() {
  if (checking) return checking;
  checking = (async () => {
    try {
      const counts = await repository.recordCounts().catch(() => null);
      const liveCount = counts?.live ?? repository.liveItems().length;
      due = await backupReminderDue({ liveCount });
      await paint();
    } finally {
      checking = null;
    }
  })();
  return checking;
}

async function paint() {
  const host = $('backup-card');
  if (!host) return;
  if (!due) { render(host, []); return; }
  const last = await lastBackupInfo();
  render(host, [el('section', { class: 'tx-banner', role: 'status' }, [
    el('p', { text: t(last ? 'fullBackup.reminder' : 'fullBackup.reminderNever') }),
    el('div', { class: 'tx-banner-acts' }, [
      el('button', {
        type: 'button', class: 'btn btn-p', id: 'backup-now', text: t('fullBackup.reminderAction'),
        onClick: () => window.dispatchEvent(new CustomEvent('almakhzan:run-full-backup')),
      }),
      el('button', {
        type: 'button', class: 'btn btn-g', text: t('fullBackup.reminderLater'),
        onClick: async () => { due = false; render(host, []); await snoozeBackupReminder(); },
      }),
    ]),
  ])]);
}

export function renderBackupReminder() {
  void paint();
}

window.addEventListener('almakhzan:backup-made', () => { due = false; void paint(); });
