// Settings: Legal & Privacy, About, and erasing this device.
//
// Kept out of views/manage.js, which owns the inventory-facing settings. The
// rows use the same row component as every other settings group.

import { eraseLocalData } from '../account.js';
import { currentSession } from '../auth.js';
import { Feature, isFeatureAvailable } from '../features.js';
import { getAppVersion } from '../platform.js';
import { t } from '../i18n.js';
import { $, el, render } from '../utils.js';
import { confirmAction, toastError } from '../ui.js';
import { icon } from '../icons.js';
import { openLegalDocument, openSupport } from './legal.js';
import { openDeleteAccount } from './account.js';

function row({ glyph, background, title, subtitle, onClick, danger = false, id }) {
  return el('button', { class: 'srow srow-btn', type: 'button', onClick, id }, [
    el('div', { class: 'srowiw', style: { background }, 'aria-hidden': 'true', text: glyph }),
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'srowl', style: danger ? { color: 'var(--red)' } : null, text: title }),
      subtitle ? el('div', { class: 'srowd', text: subtitle }) : null,
    ]),
    el('div', { class: 'srowc', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
  ]);
}

/** Delete Account appears only where there is an account to delete. */
function canDeleteAccount() {
  const session = currentSession();
  return isFeatureAvailable(Feature.ACCOUNTS) && Boolean(session.user) && !session.local;
}

export function renderLegalPanel() {
  const panel = $('legal-panel');
  if (!panel) return;
  render(panel, [
    row({ glyph: '🔒', background: 'rgba(0,122,255,.12)', title: t('legal.privacyPolicy'), onClick: () => openLegalDocument('privacy'), id: 'legal-privacy' }),
    row({ glyph: '📄', background: 'rgba(142,142,147,.15)', title: t('legal.terms'), onClick: () => openLegalDocument('terms'), id: 'legal-terms' }),
    row({ glyph: '✦', background: 'rgba(102,126,234,.15)', title: t('legal.dataAi'), subtitle: t('legal.dataAiSub'), onClick: () => openLegalDocument('dataAi'), id: 'legal-data-ai' }),
    canDeleteAccount()
      ? row({ glyph: '⚠️', background: 'var(--danger-soft)', title: t('account.deleteTitle'), subtitle: t('account.deleteRowSub'), onClick: openDeleteAccount, danger: true, id: 'legal-delete-account' })
      : null,
    row({ glyph: '💬', background: 'rgba(52,199,89,.15)', title: t('support.title'), subtitle: t('support.rowSub'), onClick: openSupport, id: 'legal-support' }),
  ]);
}

export function renderAboutPanel() {
  const { version, build } = getAppVersion();
  const line = $('app-version');
  if (line) line.textContent = build ? t('settings.versionBuild', { version, build }) : t('settings.version', { version });
}

/**
 * Erase Data on This Device: the device inventory, nothing else. Says plainly
 * that a cloud account and its data are untouched, asks for the typed phrase,
 * and restarts into the first-run state only after every store is empty.
 */
export async function eraseLocalDataFlow() {
  const cloud = Boolean(currentSession().user) && !currentSession().local;
  const confirmed = await confirmAction({
    titleKey: 'erase.title',
    messageKey: cloud ? 'erase.messageCloud' : 'erase.message',
    icon: '⚠️',
    confirmLabelKey: 'erase.confirm',
    requirePhrase: t('erase.phrase'),
  });
  if (!confirmed) return false;
  try {
    await eraseLocalData();
  } catch (error) {
    toastError(error, 'error.account/erase-failed');
    return false;
  }
  // Every in-memory copy (the repository's state, caches, open views) belonged
  // to the erased inventory; a restart is the one reset that misses nothing.
  window.location.reload();
  return true;
}

export function eraseRow() {
  return row({
    glyph: '🧹', background: 'var(--danger-soft)', title: t('erase.row'), subtitle: t('erase.rowSub'),
    onClick: () => { void eraseLocalDataFlow(); }, danger: true, id: 'erase-device',
  });
}
