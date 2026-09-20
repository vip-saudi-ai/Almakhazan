// The team screen: who can open this workspace, and how someone else joins.
//
// Two honesty rules shape this screen.
//
// The first is about the invite link. No mail provider is wired up, so the
// screen does not say "we sent an email". It hands the link over, says it
// works once and expires, and says it is shown here only this once — because
// the backend stores a hash and genuinely cannot show it again.
//
// The second is about seats. The plan's seat limit is enforced by the backend
// before an invitation is created. The screen shows the count next to the
// limit so the refusal, when it comes, is never a surprise.

import { icon } from '../icons.js';
import { ROLE_LABELS, ROLES, roleAtLeast } from '../config.js';
import { currentSession } from '../auth.js';
import { planUsage } from '../subscription.js';
import {
  INVITABLE_ROLES, changeRole, inviteMember, listInvitations, listWorkspaces,
  removeMember, revokeInvitation, setActiveWorkspace, watchMembers,
} from '../team.js';
import { $, el, formatNumber, render } from '../utils.js';
import { closeSheet, confirmAction, openSheet, section, toast, toastError } from '../ui.js';

const state = {
  members: [],
  invitations: [],
  fresh: null,        // the one invitation whose link is still on screen
  loading: true,
  unwatch: null,
};

function seats() {
  const row = planUsage().find((r) => r.key === 'members');
  return row || { used: state.members.length, limit: null };
}

function myRole() {
  return currentSession().role || ROLES.VIEWER;
}

const canAdmin = () => roleAtLeast(myRole(), ROLES.ADMIN);

// ── opening ────────────────────────────────────────────────────────────────

export function openTeamSheet() {
  const { workspaceId, local } = currentSession();
  if (local || !workspaceId) {
    toast('الفريق يحتاج حساباً — هذا الجهاز يعمل بلا مزامنة', 'ℹ️');
    return;
  }

  state.fresh = null;
  state.loading = true;
  state.members = [];
  state.invitations = [];
  openSheet('team');
  renderTeam();

  state.unwatch?.();
  state.unwatch = watchMembers(workspaceId, (members) => {
    state.members = members.sort((a, b) => rank(b.role) - rank(a.role));
    state.loading = false;
    renderTeam();
  }, (error) => {
    console.error('[team] members watch failed', error);
    state.loading = false;
    renderTeam();
  });

  if (canAdmin()) void refreshInvitations(workspaceId);
}

export function closeTeamSheet() {
  state.unwatch?.();
  state.unwatch = null;
  state.fresh = null;
  closeSheet('team');
}

const RANK = { owner: 3, admin: 2, editor: 1, viewer: 0 };
const rank = (role) => RANK[role] ?? -1;

async function refreshInvitations(workspaceId) {
  try {
    state.invitations = await listInvitations(workspaceId);
  } catch (error) {
    console.error('[team] listing invitations failed', error);
    state.invitations = [];
  }
  renderTeam();
}

// ── rendering ──────────────────────────────────────────────────────────────

function renderTeam() {
  const body = $('team-body');
  if (!body) return;

  const { used, limit } = seats();
  const full = limit != null && used >= limit;

  render(body, [
    el('p', { class: 'sheet-note', text: limit == null
      ? `${formatNumber(state.members.length)} عضو`
      : `${formatNumber(used)} من ${formatNumber(limit)} مقعد مستخدم` }),

    section('الأعضاء', state.loading
      ? [el('p', { class: 'sheet-note', text: 'جارٍ التحميل…' })]
      : state.members.map(memberRow)),

    canAdmin() ? inviteBlock(full, limit) : null,
    canAdmin() && state.invitations.length
      ? section('دعوات معلّقة', state.invitations.map(inviteRow))
      : null,
    canAdmin() ? null : el('p', {
      class: 'sheet-note',
      text: 'دعوة الأعضاء وتغيير الأدوار تتطلب صلاحية مدير.',
    }),
  ]);
}

function memberRow(member) {
  const me = currentSession().user?.uid === member.uid;
  const isOwner = member.role === ROLES.OWNER;
  // Rules refuse an admin editing their own role, the owner's role, or
  // removing either. The screen refuses the same things, so the only way to
  // meet the rule is to already know it is there.
  const editable = canAdmin() && !me && !isOwner;

  return el('div', { class: 'mem' }, [
    el('div', { class: 'mem-av', text: (member.displayName || member.email || '؟').slice(0, 1), 'aria-hidden': 'true' }),
    el('div', { class: 'mem-id' }, [
      el('div', { class: 'mem-name', text: (member.displayName || member.email || 'عضو') + (me ? ' (أنت)' : '') }),
      member.email ? el('div', { class: 'mem-mail', text: member.email }) : null,
    ]),
    editable
      ? el('select', {
        class: 'mem-role', 'aria-label': `دور ${member.displayName || member.email || 'العضو'}`,
        onChange: async (event) => {
          const role = event.target.value;
          if (role === '__remove') { event.target.value = member.role; await confirmRemove(member); return; }
          try {
            await changeRole(currentSession().workspaceId, member.uid, role);
            toast('تغيّر الدور', '✓');
          } catch (error) { toastError(error, 'تعذّر تغيير الدور'); renderTeam(); }
        },
      }, [
        ...INVITABLE_ROLES.map((role) => el('option', {
          value: role, text: ROLE_LABELS[role], selected: role === member.role || undefined,
        })),
        el('option', { value: '__remove', text: 'إزالة من المساحة' }),
      ])
      : el('span', { class: 'mem-badge', text: ROLE_LABELS[member.role] || member.role }),
  ]);
}

async function confirmRemove(member) {
  const confirmed = await confirmAction({
    title: 'إزالة العضو؟',
    message: `لن يعود ${member.displayName || member.email || 'هذا العضو'} يرى هذه المساحة. لا تُحذف أي قطعة.`,
    icon: '⚠️',
    confirmLabel: 'إزالة',
  });
  if (!confirmed) return;
  try {
    await removeMember(currentSession().workspaceId, member.uid);
    toast('أُزيل العضو', '✓');
  } catch (error) {
    toastError(error, 'تعذّرت الإزالة');
  }
}

function inviteBlock(full, limit) {
  return section('دعوة عضو', [
    full
      ? el('p', { class: 'sheet-note', text: `بلغت المقاعد حدّ خطتك (${formatNumber(limit)}). ارفع الخطة لإضافة عضو آخر.` })
      : el('div', {}, [
        el('div', { class: 'fsec' }, [
          el('div', { class: 'frow' }, [
            el('label', { for: 'inv-email', text: 'البريد' }),
            el('input', {
              id: 'inv-email', type: 'email', inputmode: 'email', dir: 'ltr',
              placeholder: 'name@example.com', autocomplete: 'email',
            }),
          ]),
          el('div', { class: 'frow' }, [
            el('label', { for: 'inv-role', text: 'الدور' }),
            el('select', { id: 'inv-role' }, INVITABLE_ROLES.map((role) => el('option', {
              value: role, text: ROLE_LABELS[role], selected: role === ROLES.EDITOR || undefined,
            }))),
          ]),
        ]),
        el('button', { id: 'inv-send', class: 'btn btn-p', type: 'button', text: 'أنشئ رابط دعوة', onClick: send }),
      ]),
    state.fresh ? freshLink(state.fresh) : null,
  ]);
}

/**
 * The link, once. The backend stored only a hash of the token, so this is not
 * a design choice that could be softened later — it is the only moment the
 * link exists.
 */
function freshLink(fresh) {
  return el('div', { class: 'inv-fresh' }, [
    el('div', { class: 'inv-fresh-hd', text: `رابط دعوة ${fresh.email}` }),
    el('p', { class: 'sheet-note', text: `يعمل مرة واحدة، وينتهي خلال ${formatNumber(fresh.expiresInDays)} يوماً. أرسله بنفسك — لا يُعرض مرة أخرى.` }),
    el('input', { class: 'inv-link', value: fresh.link, readonly: 'readonly', dir: 'ltr', 'aria-label': 'رابط الدعوة',
      onClick: (event) => event.target.select() }),
    el('button', {
      class: 'btn btn-p', type: 'button', text: 'انسخ الرابط',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(fresh.link);
          toast('نُسخ الرابط', '📋');
        } catch {
          // A denied clipboard is not a failure worth an error: the field is
          // right there and selecting it does the same job.
          document.querySelector('.inv-link')?.select();
          toast('حدّد الرابط وانسخه', 'ℹ️');
        }
      },
    }),
  ]);
}

function inviteRow(invite) {
  const days = Math.max(0, Math.ceil((invite.expiresAt - Date.now()) / 86_400_000));
  return el('div', { class: 'mem' }, [
    el('div', { class: 'mem-av', text: '✉', 'aria-hidden': 'true' }),
    el('div', { class: 'mem-id' }, [
      el('div', { class: 'mem-name', text: invite.email }),
      el('div', { class: 'mem-mail', text: `${ROLE_LABELS[invite.role] || invite.role} · تنتهي خلال ${formatNumber(days)} يوماً` }),
    ]),
    el('button', {
      class: 'mem-revoke', type: 'button', text: 'إلغاء',
      'aria-label': `إلغاء دعوة ${invite.email}`,
      onClick: async () => {
        try {
          await revokeInvitation(invite.id);
          toast('أُلغيت الدعوة', '✓');
          await refreshInvitations(currentSession().workspaceId);
        } catch (error) { toastError(error, 'تعذّر الإلغاء'); }
      },
    }),
  ]);
}

async function send() {
  const button = $('inv-send');
  const email = ($('inv-email')?.value || '').trim().toLowerCase();
  const role = $('inv-role')?.value || ROLES.EDITOR;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    toast('أدخل بريداً إلكترونياً صحيحاً', '⚠');
    $('inv-email')?.focus();
    return;
  }
  if (state.members.some((m) => (m.email || '').toLowerCase() === email)) {
    toast('هذا البريد عضو بالفعل', 'ℹ️');
    return;
  }

  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'جارٍ الإنشاء…';
  try {
    const result = await inviteMember(currentSession().workspaceId, email, role);
    state.fresh = { email, ...result };
    $('inv-email').value = '';
    await refreshInvitations(currentSession().workspaceId);
  } catch (error) {
    toastError(error, 'تعذّر إنشاء الدعوة');
  } finally {
    button.disabled = false;
    button.textContent = label;
    renderTeam();
  }
}

// ── the workspace switcher ─────────────────────────────────────────────────

export async function openWorkspaceSheet() {
  const { user, workspaceId, local } = currentSession();
  if (local || !user) {
    toast('المساحات تحتاج حساباً', 'ℹ️');
    return;
  }

  openSheet('ws');
  render($('ws-body'), [el('p', { class: 'sheet-note', text: 'جارٍ التحميل…' })]);

  let list;
  try {
    list = await listWorkspaces(user.uid);
  } catch (error) {
    toastError(error, 'تعذّر قراءة المساحات');
    closeSheet('ws');
    return;
  }

  render($('ws-body'), [
    el('p', { class: 'sheet-note', text: list.workspaces.length > 1
      ? 'اختر المساحة التي تريد فتحها.'
      : 'أنت في مساحة واحدة. تظهر هنا كل مساحة تُدعى إليها.' }),
    ...list.workspaces.map((ws) => el('button', {
      class: 'srow srow-btn', type: 'button',
      'aria-current': ws.id === workspaceId ? 'true' : undefined,
      onClick: () => switchTo(user.uid, ws),
    }, [
      el('div', { class: 'srowiw', style: { background: 'rgba(37,99,255,.15)' }, text: '🗄', 'aria-hidden': 'true' }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'srowl', text: ws.name }),
        el('div', { class: 'srowd', text: ROLE_LABELS[ws.role] || ws.role }),
      ]),
      ws.id === workspaceId
        ? el('div', { class: 'srowc', text: '✓', 'aria-hidden': 'true' })
        : el('div', { class: 'srowc', 'aria-hidden': 'true' }, [icon('back', { size: 16 })]),
    ])),
  ]);
}

async function switchTo(uid, ws) {
  if (ws.id === currentSession().workspaceId) { closeSheet('ws'); return; }
  try {
    await setActiveWorkspace(uid, ws.id);
    closeSheet('ws');
    // Reopening is the app's job, not this screen's: a workspace change
    // invalidates every loaded record, so the whole session restarts rather
    // than trying to swap collections underneath a rendered inventory.
    window.dispatchEvent(new CustomEvent('almakhzan:workspace-changed', { detail: ws.id }));
  } catch (error) {
    toastError(error, 'تعذّر تبديل المساحة');
  }
}
