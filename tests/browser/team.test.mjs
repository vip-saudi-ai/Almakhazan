// Browser test for the team screen: members, roles, invitations, workspaces.
//
//   npx http-server -p 8123 -c-1 &
//   node tests/browser/team.test.mjs
//
// The backend is what actually grants membership — this suite is about the
// screen in front of it, and specifically about the four places where a
// friendly interface would happily lie:
//
//   * claiming an email was sent when no mail provider exists;
//   * offering a control Security Rules will refuse;
//   * offering a seat the plan does not have;
//   * showing an invite link a second time, when only its hash was stored.

const { chromium } = await import('playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const BASE = 'http://127.0.0.1:8123';
const browser = await chromium.launch();
const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const ME = 'u-me';

function authStub(role) {
  return `
    const session = { user: { uid: '${ME}', email: 'me@example.com', displayName: 'أنا' },
                      workspaceId: 'w1', role: '${role}', ready: true, local: false };
    export function currentSession() { return session; }
    export function initializeAuthentication() { return Promise.resolve(session); }
    export function onSessionChange(listener) { listener(session); return () => {}; }
    export function refreshWorkspace() { window.__refreshed = (window.__refreshed || 0) + 1; return Promise.resolve(session); }
    export function listMembers() { return Promise.resolve([]); }
    export function needsVerification() { return false; }
    export function refreshVerification() { return Promise.resolve(true); }
    const noop = () => Promise.resolve();
    export const registerWithEmail = noop, sendPasswordReset = noop, sendVerification = noop,
      signInWithApple = noop, signInWithEmail = noop, signInWithGoogle = noop, signOutUser = noop;
  `;
}

function teamStub({ members, invitations = [], inviteFails = null, workspaces }) {
  return `
    window.__team = { changed: [], removed: [], revoked: [], invited: [], active: [] };
    export const INVITABLE_ROLES = ['viewer', 'editor', 'admin'];
    let members = ${JSON.stringify(members)};
    let invitations = ${JSON.stringify(invitations)};
    export function watchMembers(_w, onData) { onData(members); return () => {}; }
    export function changeRole(w, uid, role) { window.__team.changed.push([uid, role]); return Promise.resolve(); }
    export function removeMember(w, uid) { window.__team.removed.push(uid); return Promise.resolve(); }
    export function inviteMember(w, email, role) {
      window.__team.invited.push([email, role]);
      ${inviteFails ? `return Promise.reject(Object.assign(new Error(${JSON.stringify(inviteFails)}), { code: 'x' }));` : `
      const inviteId = 'i' + (window.__team.invited.length);
      invitations = [...invitations, { id: inviteId, email, role, status: 'pending', expiresAt: Date.now() + 6048e5 }];
      return Promise.resolve({ inviteId, token: 'TOKEN-SECRET', link: 'https://nazm.app/?invite=' + inviteId + '&token=TOKEN-SECRET', expiresInDays: 7 });`}
    }
    export function invitationLink(id, token) { return 'https://nazm.app/?invite=' + id + '&token=' + token; }
    export function listInvitations() { return Promise.resolve(invitations); }
    export function revokeInvitation(id) { window.__team.revoked.push(id); invitations = invitations.filter(i => i.id !== id); return Promise.resolve(); }
    export function acceptInvitation() { return Promise.resolve({ ok: true, workspaceId: 'w2' }); }
    export function takeInvitationFromUrl() { return null; }
    export function listWorkspaces() { return Promise.resolve(${JSON.stringify(workspaces || { active: 'w1', workspaces: [{ id: 'w1', name: 'مخزني', role: 'owner' }, { id: 'w2', name: 'مكتب الرياض', role: 'editor' }] })}); }
    export function setActiveWorkspace(uid, id) { window.__team.active.push(id); return Promise.resolve(); }
  `;
}

function planStub(seatLimit, used) {
  return `
    import { PLAN_CONFIG } from '/src/plans.generated.js';
    import { checkCreateItem, itemQuotaStatus, assistantPresentation, checkUseAI, checkFeature } from '/src/entitlements.js';
    const plan = { ...PLAN_CONFIG.plans['pro'], id: 'pro' };
    const entitlement = { plan, planId: plan.id, status: 'active', readOnly: false };
    const usage = { items: 4, storageBytes: 0, members: ${used}, aiCreditsUsed: 0 };
    export function startPlanWatch(){} export function stopPlanWatch(){}
    export function onSubscriptionChange(listener){ listener({ entitlement, usage, ready: true }); return () => {}; }
    export function subscriptionState(){ return { entitlement, usage, ready: true }; }
    export function currentPlan(){ return plan; }
    export function planStatus(){ return 'active'; }
    export function quotaStatus(){ return itemQuotaStatus({ entitlement, usage }); }
    export function canAddItem(){ return checkCreateItem({ entitlement, usage }); }
    export function planUsage(){ return [{ key: 'members', label: 'الأعضاء', used: ${used}, limit: ${seatLimit} }]; }
    export function assistantLabel(){ return assistantPresentation({ entitlement }); }
    export function canUseAssistant(){ return checkUseAI({ entitlement, usage }); }
    export function canUseFeature(name){ return checkFeature({ entitlement }, name); }
  `;
}

const MEMBERS = [
  { uid: 'u-owner', role: 'owner', email: 'owner@example.com', displayName: 'المالك' },
  { uid: ME, role: 'admin', email: 'me@example.com', displayName: 'أنا' },
  { uid: 'u-editor', role: 'editor', email: 'editor@example.com', displayName: 'محرر' },
];

async function open({ role = 'admin', seatLimit = 3, used = 3, members = MEMBERS,
                      invitations = [], inviteFails = null, workspaces } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|ERR_|net::|firebase/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

  await page.route('**/src/auth.js', r => r.fulfill({ contentType: 'text/javascript', body: authStub(role) }));
  await page.route('**/src/team.js', r => r.fulfill({ contentType: 'text/javascript', body: teamStub({ members, invitations, inviteFails, workspaces }) }));
  await page.route('**/src/subscription.js', r => r.fulfill({ contentType: 'text/javascript', body: planStub(seatLimit, used) }));

  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  return { page, context, errs };
}

const openTeam = async (page) => {
  await page.evaluate(async () => {
    const { openTeamSheet } = await import('/src/views/team.js');
    openTeamSheet();
  });
  await page.waitForTimeout(350);
};

const teamText = (page) => page.evaluate(() => document.getElementById('team-body').innerText);

// ── members and roles ─────────────────────────────────────────────────────
{
  const { page, context, errs } = await open({ seatLimit: 5, used: 3 });
  await openTeam(page);

  const t = await teamText(page);
  check('T1 every member is listed with their role',
    t.includes('المالك') && t.includes('محرر') && t.includes('editor@example.com'), t.replace(/\n/g, ' / ').slice(0, 160));
  check('T2 the seat count is shown against the plan limit', t.includes('3') && t.includes('5') && t.includes('مقعد'), t.slice(0, 80));

  const controls = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.mem')];
    return rows.map(r => ({
      name: r.querySelector('.mem-name')?.textContent,
      editable: !!r.querySelector('.mem-role'),
    }));
  });
  const owner = controls.find(c => c.name === 'المالك');
  const me = controls.find(c => (c.name || '').includes('(أنت)'));
  const editor = controls.find(c => c.name === 'محرر');
  check('T3 the owner cannot be edited — Security Rules refuse it, so the screen does not offer it',
    owner && owner.editable === false, JSON.stringify(owner));
  check('T4 an admin cannot edit their own role, for the same reason',
    me && me.editable === false, JSON.stringify(me));
  check('T5 another member can be edited', editor && editor.editable === true, JSON.stringify(editor));

  await page.selectOption('.mem-role', 'viewer');
  await page.waitForTimeout(250);
  const changed = await page.evaluate(() => window.__team.changed);
  check('T6 changing a role calls the backend with that member and role',
    JSON.stringify(changed) === JSON.stringify([['u-editor', 'viewer']]), JSON.stringify(changed));

  check('T7 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── a viewer is told, not silently given dead controls ────────────────────
{
  const { page, context, errs } = await open({ role: 'viewer', seatLimit: 5, used: 3 });
  await openTeam(page);
  const t = await teamText(page);
  const hasForm = await page.evaluate(() => !!document.getElementById('inv-send'));
  check('T8 without admin there is no invite form', hasForm === false);
  check('T9 and the reason is stated rather than left to be discovered',
    t.includes('صلاحية مدير'), t.replace(/\n/g, ' / ').slice(0, 160));
  check('T10 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── the invite link, shown once ───────────────────────────────────────────
{
  const { page, context, errs } = await open({ seatLimit: 5, used: 3 });
  await openTeam(page);

  await page.fill('#inv-email', 'new@example.com');
  await page.selectOption('#inv-role', 'editor');
  await page.click('#inv-send');
  await page.waitForTimeout(400);

  const sent = await page.evaluate(() => window.__team.invited);
  check('T11 the invitation is created with the email and role given',
    JSON.stringify(sent) === JSON.stringify([['new@example.com', 'editor']]), JSON.stringify(sent));

  const t = await teamText(page);
  const link = await page.evaluate(() => document.querySelector('.inv-link')?.value);
  check('T12 the link is handed over, not an email that was never sent',
    link && link.includes('invite=i1') && link.includes('TOKEN-SECRET'), String(link));
  check('T13 and it says what the link is: single use, expiring, shown once',
    t.includes('مرة واحدة') && t.includes('7') && t.includes('لا يُعرض مرة أخرى'),
    t.replace(/\n/g, ' / ').slice(0, 220));
  check('T14 nothing claims an email was sent', !/أرسلنا|تم الإرسال|بريد.*أُرسل/.test(t), t.slice(0, 120));

  const pending = t.includes('دعوات معلّقة') && t.includes('new@example.com');
  check('T15 the invitation joins the pending list', pending, t.replace(/\n/g, ' / ').slice(0, 220));

  // Reopening must not resurrect the link: only a hash of it was stored.
  await page.evaluate(async () => {
    const { closeTeamSheet, openTeamSheet } = await import('/src/views/team.js');
    closeTeamSheet(); openTeamSheet();
  });
  await page.waitForTimeout(400);
  const again = await page.evaluate(() => !!document.querySelector('.inv-link'));
  check('T16 reopening the screen does not show the link again', again === false);

  check('T17 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── a full plan refuses before the backend has to ─────────────────────────
{
  const { page, context, errs } = await open({ seatLimit: 3, used: 3 });
  await openTeam(page);
  const t = await teamText(page);
  const hasForm = await page.evaluate(() => !!document.getElementById('inv-send'));
  check('T18 at the seat limit the form is replaced by the reason, not left to fail',
    hasForm === false && t.includes('حدّ خطتك'), t.replace(/\n/g, ' / ').slice(0, 200));
  check('T19 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── revoking ──────────────────────────────────────────────────────────────
{
  const { page, context } = await open({
    seatLimit: 5, used: 3,
    invitations: [{ id: 'i9', email: 'pending@example.com', role: 'viewer', status: 'pending', expiresAt: Date.now() + 864e5 }],
  });
  await openTeam(page);
  const before = await teamText(page);
  check('T20 a pending invitation shows who it is for and when it dies',
    before.includes('pending@example.com') && before.includes('مشاهد') && before.includes('تنتهي'),
    before.replace(/\n/g, ' / ').slice(0, 200));

  await page.click('.mem-revoke');
  await page.waitForTimeout(350);
  const revoked = await page.evaluate(() => window.__team.revoked);
  const after = await teamText(page);
  check('T21 revoking removes it', JSON.stringify(revoked) === '["i9"]' && !after.includes('pending@example.com'),
    JSON.stringify(revoked));
  await context.close();
}

// ── switching workspace ───────────────────────────────────────────────────
{
  const { page, context, errs } = await open({ seatLimit: 5, used: 3 });
  await page.evaluate(async () => {
    const { openWorkspaceSheet } = await import('/src/views/team.js');
    await openWorkspaceSheet();
  });
  await page.waitForTimeout(350);

  const listed = await page.evaluate(() => ({
    text: document.getElementById('ws-body').innerText,
    current: document.querySelector('#ws-body [aria-current="true"] .srowl')?.textContent,
  }));
  check('T22 every workspace this account belongs to is listed, with its role',
    listed.text.includes('مخزني') && listed.text.includes('مكتب الرياض') && listed.text.includes('محرر'),
    listed.text.replace(/\n/g, ' / ').slice(0, 160));
  check('T23 the one already open is marked', listed.current === 'مخزني', String(listed.current));

  await page.evaluate(() => {
    [...document.querySelectorAll('#ws-body .srow-btn')]
      .find(b => b.textContent.includes('مكتب الرياض')).click();
  });
  await page.waitForTimeout(400);

  const switched = await page.evaluate(() => ({
    active: window.__team.active,
    refreshed: window.__refreshed || 0,
    sheetOpen: document.getElementById('sh-ws').classList.contains('open'),
  }));
  check('T24 choosing another workspace records the choice and reopens the session',
    JSON.stringify(switched.active) === '["w2"]' && switched.refreshed >= 1 && !switched.sheetOpen,
    JSON.stringify(switched));
  check('T25 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

// ── device-only mode has no team ──────────────────────────────────────────
{
  // No auth stub: the app boots into device-only mode, as a real phone with
  // no account does.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
  await page.evaluate(async () => {
    const { goTab } = await import('/src/navigation.js');
    goTab('set');
  });
  await page.waitForTimeout(400);
  const settings = await page.evaluate(() => document.getElementById('data-panel')?.innerText || '');
  check('T26 device-only mode offers no team and no workspaces, rather than rows that refuse',
    !settings.includes('الفريق') && !settings.includes('المساحات'), settings.replace(/\n/g, ' / ').slice(0, 160));
  check('T27 no JS errors', errs.length === 0, errs.join(' / '));
  await context.close();
}

await browser.close();
for (const line of pass) console.log('  ✓ ' + line);
for (const line of fail) console.log('  ✗ ' + line);
console.log(`\n${fail.length ? 'FAIL' : 'PASS'} ${pass.length}/${pass.length + fail.length}`);
process.exit(fail.length ? 1 : 0);
