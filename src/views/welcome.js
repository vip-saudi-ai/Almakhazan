// The public face: welcome, sign-in, email verification and first-run setup.
//
// Shown only when the cloud is reachable and nobody is signed in. In local mode
// (no Firebase, or the demo build) the app goes straight to the inventory, so a
// single-device user is never asked to create an account to see their things.
//
// It is a gate over the same shell, not a separate page: same glass, same RTL,
// same type — signing in should feel like entering the app, not leaving a
// marketing site.

import { orderedPlans } from '../entitlements.js';
import { PLAN_CONFIG } from '../plans.generated.js';
import {
  currentSession, needsVerification, refreshVerification, registerWithEmail,
  sendPasswordReset, sendVerification, signInWithApple, signInWithEmail,
  signInWithGoogle, signOutUser,
} from '../auth.js';
import { firebaseContext } from '../firebase.js';
import { $, AppError, el, render } from '../utils.js';
import { symbolNode, wordmarkNode } from './mark.js';
import { BRAND } from '../brand.js';
import { toast, toastError, withBusy } from '../ui.js';
import {
  LANGUAGES, getLanguage, onLanguageChange, pick, setLanguage, t,
} from '../i18n.js';
import { formatNumber } from '../utils.js';

const USE_CASES = [
  { id: 'personal', icon: '🏠' },
  { id: 'art', icon: '🎨' },
  { id: 'retail', icon: '🏪' },
  { id: 'warehouse', icon: '🏭' },
  { id: 'estate', icon: '🗝' },
  { id: 'equipment', icon: '🛠' },
  { id: 'other', icon: '📦' },
];

const NAME_SUGGESTIONS = {
  get personal() { return t('gate.name.personal'); },
  get art() { return t('gate.name.art'); },
  get retail() { return t('gate.name.retail'); },
  get warehouse() { return t('gate.name.warehouse'); },
  get estate() { return t('gate.name.estate'); },
  get equipment() { return t('gate.name.equipment'); },
  get other() { return t('gate.name.other'); },
};

const state = {
  screen: 'welcome',
  useCase: null,
  step: 1,
  onComplete: null,
  billing: 'monthly',
  /** What the visitor picked before they had an account, if anything. */
  intendedPlan: null,
};

function gate() {
  return $('gate');
}

export function isGateOpen() {
  return gate()?.classList.contains('open') === true;
}

function show(screen) {
  state.screen = screen;
  renderGate();
}

/** Opens the gate. Resolves once the user is signed in and set up. */
export function openGate({ onComplete } = {}) {
  state.onComplete = onComplete || null;
  state.screen = currentSession().user ? verificationScreen() : 'welcome';
  gate()?.classList.add('open');
  document.body.classList.add('gated');
  renderGate();
}

export function closeGate() {
  gate()?.classList.remove('open');
  document.body.classList.remove('gated');
}

function verificationScreen() {
  return needsVerification() ? 'verify' : 'onboarding';
}

// ── building blocks ────────────────────────────────────────────────────────
function field(id, label, type, placeholder, autocomplete) {
  return el('label', { class: 'gate-field', for: id }, [
    el('span', { class: 'gate-field-label', text: label }),
    el('input', { id, type, placeholder, autocomplete, class: 'gate-input' }),
  ]);
}

function primary(text, onClick, id) {
  return el('button', { class: 'gate-btn gate-btn-primary', type: 'button', id, text, onClick });
}

function secondary(text, onClick) {
  return el('button', { class: 'gate-btn gate-btn-secondary', type: 'button', text, onClick });
}

function link(text, onClick) {
  return el('button', { class: 'gate-link', type: 'button', text, onClick });
}

function brand(size = 'lg') {
  const marks = { lg: [72, 46], sm: [40, 26] };
  const [symbol, wordmark] = marks[size] || marks.lg;
  return el('div', { class: `gate-brand gate-brand-${size}` }, [
    symbolNode(symbol, { className: 'nazm-mark gate-symbol', title: BRAND.name, gradient: size === 'lg' }),
    wordmarkNode(wordmark, { title: BRAND.name }),
  ]);
}

async function run(button, label, action) {
  await withBusy(button, label, async () => {
    try {
      await action();
    } catch (error) {
      toastError(error);
    }
  });
}

// ── screens ────────────────────────────────────────────────────────────────
function welcomeScreen() {
  return [
    el('div', { class: 'gate-hero' }, [
      brand(),
      el('h1', { class: 'gate-headline', text: BRAND.tagline }),
      el('p', { class: 'gate-sub', text: t('gate.sub') }),
    ]),
    el('div', { class: 'gate-actions' }, [
      primary(t('gate.startFree'), () => show('signup')),
      secondary(t('gate.signIn'), () => show('signin')),
      el('p', { class: 'gate-note', text: freeNote() }),
    ]),
    el('div', { class: 'gate-magic' }, [
      el('span', { class: 'gate-magic-mark', text: '✦', 'aria-hidden': 'true' }),
      el('span', { text: t('gate.magic', { assistant: BRAND.assistant }) }),
    ]),
    el('button', {
      class: 'gate-link gate-pricing-link', type: 'button', text: t('gate.pricing'),
      onClick: () => show('pricing'),
    }),
  ];
}

function providerButtons() {
  return [
    el('button', {
      class: 'gate-btn gate-btn-provider', type: 'button',
      onClick: (event) => run(event.currentTarget, '…', signInWithApple),
    }, [el('span', { class: 'gate-provider-mark', text: '', 'aria-hidden': 'true' }), t('gate.withApple')]),
    el('button', {
      class: 'gate-btn gate-btn-provider', type: 'button',
      onClick: (event) => run(event.currentTarget, '…', signInWithGoogle),
    }, [el('span', { class: 'gate-provider-mark gate-provider-google', text: 'G', 'aria-hidden': 'true' }), t('gate.withGoogle')]),
    el('div', { class: 'gate-divider' }, [el('span', { text: t('gate.orEmail') })]),
  ];
}

function signInScreen() {
  return [
    el('div', { class: 'gate-head' }, [brand('sm'), el('h2', { class: 'gate-title', text: t('gate.signIn') })]),
    ...providerButtons(),
    field('gate-email', t('gate.email'), 'email', 'name@example.com', 'email'),
    field('gate-password', t('gate.password'), 'password', '••••••••', 'current-password'),
    primary(t('gate.enter'), (event) => run(event.currentTarget, t('gate.entering'), async () => {
      await signInWithEmail($('gate-email').value.trim(), $('gate-password').value);
    })),
    link(t('gate.forgot'), async () => {
      const email = $('gate-email').value.trim();
      if (!email) { toast(t('gate.emailFirst'), '⚠'); return; }
      try {
        await sendPasswordReset(email);
        toast(t('gate.resetSent'), '✉');
      } catch (error) { toastError(error); }
    }),
    el('div', { class: 'gate-foot' }, [
      t('gate.noAccount'),
      link(t('gate.createAccount'), () => show('signup')),
    ]),
  ];
}

function signUpScreen() {
  return [
    el('div', { class: 'gate-head' }, [brand('sm'), el('h2', { class: 'gate-title', text: t('gate.signUp') })]),
    ...providerButtons(),
    field('gate-name', t('gate.name'), 'text', t('gate.namePlaceholder'), 'name'),
    field('gate-email', t('gate.email'), 'email', 'name@example.com', 'email'),
    field('gate-password', t('gate.password'), 'password', t('gate.passwordMin'), 'new-password'),
    primary(t('gate.startFree'), (event) => run(event.currentTarget, t('gate.creating'), async () => {
      const email = $('gate-email').value.trim();
      const password = $('gate-password').value;
      // Caught here rather than at the server so the message is ours, and so a
      // typo is not reported as a failure.
      if (!email) { toast(t('gate.emailRequired'), '⚠'); return; }
      if (password.length < 6) { toast(t('gate.passwordShort'), '⚠'); return; }
      await registerWithEmail(email, password, $('gate-name').value.trim());
      await sendVerification().catch((error) => console.error('[gate] verification send failed', error));
      show('verify');
    })),
    el('p', { class: 'gate-note', text: freeNote() }),
    el('div', { class: 'gate-foot' }, [
      t('gate.haveAccount'),
      link(t('gate.signIn'), () => show('signin')),
    ]),
  ];
}

function verifyScreen() {
  const email = currentSession().user?.email || t('gate.yourEmail');
  return [
    el('div', { class: 'gate-head' }, [
      el('div', { class: 'gate-icon', text: '✉', 'aria-hidden': 'true' }),
      el('h2', { class: 'gate-title', text: t('gate.verifyTitle') }),
    ]),
    el('p', { class: 'gate-sub', text: t('gate.verifySub', { email }) }),
    primary(t('gate.verified'), (event) => run(event.currentTarget, t('gate.verifying'), async () => {
      const verified = await refreshVerification();
      if (verified) {
        show('onboarding');
      } else {
        toast(t('gate.notVerified'), '⚠');
      }
    })),
    link(t('gate.resend'), async () => {
      try {
        await sendVerification();
        toast(t('gate.resent'), '✉');
      } catch (error) { toastError(error); }
    }),
    el('p', { class: 'gate-fineprint', text: t('gate.privacy') }),
    link(t('gate.signOut'), () => signOutUser().catch(toastError)),
  ];
}

// ── onboarding ─────────────────────────────────────────────────────────────
function onboardingScreen() {
  if (state.step === 1) {
    return [
      el('div', { class: 'gate-head' }, [
        el('h2', { class: 'gate-title', text: t('gate.whatOrganize') }),
        el('p', { class: 'gate-sub', text: t('gate.whatOrganizeSub') }),
      ]),
      el('div', { class: 'gate-choices' }, USE_CASES.map((useCase) => el('button', {
        class: `gate-choice${state.useCase === useCase.id ? ' on' : ''}`,
        type: 'button',
        onClick: () => {
          state.useCase = useCase.id;
          state.step = 2;
          renderGate();
        },
      }, [
        el('span', { class: 'gate-choice-icon', text: useCase.icon, 'aria-hidden': 'true' }),
        el('span', { text: t(`gate.useCase.${useCase.id}`) }),
      ]))),
    ];
  }

  if (state.step === 2) {
    return [
      el('div', { class: 'gate-head' }, [
        el('h2', { class: 'gate-title', text: t('gate.nameTitle') }),
      ]),
      field('gate-workspace', t('gate.workspaceName'), 'text', NAME_SUGGESTIONS[state.useCase] || NAME_SUGGESTIONS.personal, 'off'),
      primary(t('common.continue'), (event) => run(event.currentTarget, t('gate.preparing'), async () => {
        const name = $('gate-workspace').value.trim() || NAME_SUGGESTIONS[state.useCase] || NAME_SUGGESTIONS.other;
        await createWorkspaceForUser(name, state.useCase);
        state.step = 3;
        renderGate();
      })),
      link(t('common.back'), () => { state.step = 1; renderGate(); }),
    ];
  }

  return [
    el('div', { class: 'gate-head' }, [
      el('div', { class: 'gate-icon gate-icon-ok', text: '✓', 'aria-hidden': 'true' }),
      el('h2', { class: 'gate-title', text: t('gate.ready') }),
    ]),
    primary(t('gate.addFirst'), () => finish({ intent: 'add-item' })),
    secondary(t('gate.importExcel'), () => finish({ intent: 'import' })),
    link(t('gate.browseFirst'), () => finish({ intent: 'browse' })),
  ];
}

/**
 * Creates the workspace through the backend so the plan, its limits and the
 * owner membership are all set from values a client cannot influence.
 */
async function createWorkspaceForUser(name, useCase) {
  const { functions, sdk } = firebaseContext();
  if (!functions) throw new AppError('gate.cloudUnavailable', { code: 'gate/cloud-unavailable' });
  const callable = sdk.functions.httpsCallable(functions, 'createWorkspace');
  await callable({
    name,
    useCase: useCase || 'other',
    locale: getLanguage(),
    currency: 'SAR',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh',
  });
}

function pricingScreen() {
  const annual = state.billing === 'yearly';

  const toggle = el('div', { class: 'gate-billing', role: 'group', 'aria-label': t('planUi.billingCycle') }, [
    el('button', {
      class: `gate-billing-opt${annual ? '' : ' on'}`, type: 'button', text: t('planUi.monthly'),
      'aria-pressed': String(!annual),
      onClick: () => { state.billing = 'monthly'; renderGate(); },
    }),
    el('button', {
      class: `gate-billing-opt${annual ? ' on' : ''}`, type: 'button', text: t('planUi.yearly'),
      'aria-pressed': String(annual),
      onClick: () => { state.billing = 'yearly'; renderGate(); },
    }),
  ]);

  return [
    el('div', { class: 'gate-head' }, [
      brand('sm'),
      el('h2', { class: 'gate-title', text: t('gate.choosePlan') }),
      el('p', { class: 'gate-sub', text: t('gate.choosePlanSub') }),
    ]),
    toggle,
    annual ? el('p', { class: 'gate-annual-note', text: pick(PLAN_CONFIG.annualNote) }) : null,
    el('div', { class: 'gate-plans' }, orderedPlans().map((plan) => planCard(plan, annual))),
    secondary(t('common.back'), () => show('welcome')),
  ];
}

/**
 * One card per plan. Annual prices come from the plan table as published
 * figures — they are never computed from the monthly price, because the
 * commercial decision is the price, not the discount.
 */
function planCard(plan, annual) {
  const custom = Boolean(plan.price.custom);
  const free = !custom && plan.price.monthly === 0;
  const amount = annual ? plan.price.yearly : plan.price.monthly;
  const unit = annual ? t('planUi.perYear') : t('planUi.perMonth');

  // The paid plan we recommend carries the only filled button on the screen.
  const emphasised = Boolean(plan.badge);

  let price;
  if (custom) price = [el('span', { class: 'gate-plan-custom', text: pick(plan.price.custom) })];
  else if (free) price = [el('span', { class: 'gate-plan-custom', text: t('planUi.free') })];
  else price = [
    el('span', { class: 'gate-plan-amount', text: formatNumber(amount) }),
    el('span', { class: 'gate-plan-unit', text: unit }),
  ];

  return el('div', { class: `gate-plan${emphasised ? ' featured' : ''}` }, [
    plan.badge ? el('div', { class: 'gate-plan-badge', text: pick(plan.badge) }) : null,
    el('div', { class: 'gate-plan-name', text: pick(plan.name) }),
    el('div', { class: 'gate-plan-price' }, price),
    el('div', { class: 'gate-plan-items', text: plan.limitsLabel
      ? pick(plan.limitsLabel)
      : t('count.items', { count: plan.limits.items }) }),
    el('div', { class: 'gate-plan-line', text: `${BRAND.assistant}: ${pick(plan.assistant.label)}` }),
    el('button', {
      class: `gate-btn ${emphasised ? 'gate-btn-primary' : 'gate-btn-secondary'} gate-plan-cta`,
      type: 'button',
      text: planCta(plan),
      onClick: () => (plan.id === 'free' ? show('signup') : choosePlan(plan)),
    }),
  ]);
}

function planCta(plan) {
  if (plan.id === 'free') return t('gate.startFree');
  if (plan.contactOnly) return t('planUi.contact');
  return t('planUi.choose', { name: pick(plan.name) });
}

function choosePlan(plan) {
  // Signing up comes first: a plan is bought against an account, never before
  // one exists. The choice is remembered so checkout can resume after setup.
  state.intendedPlan = { id: plan.id, billing: state.billing };
  if (plan.contactOnly) {
    toast(t('planUi.enterpriseContact', { email: BRAND.salesEmail }), '✉');
    return;
  }
  show(currentSession().user ? 'onboarding' : 'signup');
}

// ── render ─────────────────────────────────────────────────────────────────
function renderGate() {
  const panel = $('gate-panel');
  if (!panel) return;

  const screens = {
    welcome: welcomeScreen,
    signin: signInScreen,
    signup: signUpScreen,
    verify: verifyScreen,
    onboarding: onboardingScreen,
    pricing: pricingScreen,
  };

  renderLanguageSwitch();
  panel.dataset.screen = state.screen;
  render(panel, (screens[state.screen] || welcomeScreen)());
  panel.scrollTo?.(0, 0);
}

function freeNote() {
  return t('gate.freeNote', { count: PLAN_CONFIG.plans.free.limits.items });
}

/**
 * A small العربية | English switch in the corner of the gate — the one place a
 * visitor who does not read Arabic has to be able to find on their own.
 */
function renderLanguageSwitch() {
  const host = gate();
  if (!host) return;
  let group = $('gate-lang');
  if (!group) {
    group = el('div', { id: 'gate-lang', class: 'gate-lang', role: 'radiogroup' });
    host.prepend(group);
  }
  group.setAttribute('aria-label', t('language.label'));
  const current = getLanguage();
  render(group, LANGUAGES.map((lang) => el('button', {
    type: 'button', role: 'radio', class: `gate-lang-opt${lang === current ? ' on' : ''}`,
    lang, 'aria-checked': String(lang === current), tabindex: lang === current ? '0' : '-1',
    text: t(`language.${lang}`),
    onClick: () => setLanguage(lang),
    onKeydown: (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const next = LANGUAGES[(LANGUAGES.indexOf(current) + 1) % LANGUAGES.length];
      setLanguage(next);
      $('gate-lang')?.querySelector(`[lang="${next}"]`)?.focus();
    },
  })));
}

/**
 * A language switch redraws the screen, and what the visitor typed — email,
 * name, the workspace name — is carried across: the fields are read before the
 * redraw and put back after it, with the focus where it was.
 */
function relocalizeGate() {
  if (!isGateOpen()) return;
  const panel = $('gate-panel');
  const values = new Map();
  panel?.querySelectorAll('input').forEach((input) => { if (input.id) values.set(input.id, input.value); });
  const focused = document.activeElement?.id;
  const scroll = panel?.parentElement?.scrollTop ?? 0;
  renderGate();
  for (const [id, value] of values) { const input = $(id); if (input) input.value = value; }
  if (focused) $(focused)?.focus?.({ preventScroll: true });
  if (panel?.parentElement) panel.parentElement.scrollTop = scroll;
}

onLanguageChange(relocalizeGate);

function finish(result) {
  closeGate();
  state.onComplete?.(result);
}

/** Called when the session changes while the gate is open. */
export function gateOnSession(session) {
  if (!isGateOpen()) return;
  if (!session.user) { show('welcome'); return; }
  if (needsVerification()) { show('verify'); return; }
  if (state.screen === 'signin' || state.screen === 'signup' || state.screen === 'verify') {
    state.step = session.workspaceId ? 3 : 1;
    show('onboarding');
  }
}

export { finish as completeGate };
