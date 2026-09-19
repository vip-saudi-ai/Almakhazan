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
import {
  currentSession, needsVerification, refreshVerification, registerWithEmail,
  sendPasswordReset, sendVerification, signInWithApple, signInWithEmail,
  signInWithGoogle, signOutUser,
} from '../auth.js';
import { firebaseContext } from '../firebase.js';
import { $, el, render } from '../utils.js';
import { toast, toastError, withBusy } from '../ui.js';

const USE_CASES = [
  { id: 'personal', label: 'مقتنيات شخصية', icon: '🏠' },
  { id: 'art', label: 'فن وتحف', icon: '🎨' },
  { id: 'retail', label: 'متجر أو مخزون', icon: '🏪' },
  { id: 'warehouse', label: 'مستودع', icon: '🏭' },
  { id: 'estate', label: 'تركة', icon: '🗝' },
  { id: 'equipment', label: 'معدات وأصول', icon: '🛠' },
  { id: 'other', label: 'أخرى', icon: '📦' },
];

const NAME_SUGGESTIONS = {
  personal: 'مقتنياتي',
  art: 'مجموعة الفن',
  retail: 'مخزون المتجر',
  warehouse: 'مستودع الشركة',
  estate: 'التركة',
  equipment: 'الأصول والمعدات',
  other: 'مخزني',
};

const state = {
  screen: 'welcome',
  useCase: null,
  step: 1,
  onComplete: null,
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
  return el('div', { class: `gate-brand gate-brand-${size}` }, [
    'المخزن',
    el('span', { text: '.' }),
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
      el('h1', { class: 'gate-headline', text: 'كل ما تملك، في مكانه.' }),
      el('p', { class: 'gate-sub', text: 'صوّر مقتنياتك، صنّفها، واعثر عليها متى احتجتها.' }),
    ]),
    el('div', { class: 'gate-actions' }, [
      primary('ابدأ مجاناً', () => show('signup')),
      secondary('تسجيل الدخول', () => show('signin')),
      el('p', { class: 'gate-note', text: 'مجاني حتى 50 قطعة · بدون بطاقة بنكية' }),
    ]),
    el('div', { class: 'gate-magic' }, [
      el('span', { class: 'gate-magic-mark', text: '✦', 'aria-hidden': 'true' }),
      el('span', { text: 'صوّر القطعة ودع مساعد المخزن يقترح بياناتها تلقائياً.' }),
    ]),
    el('button', {
      class: 'gate-link gate-pricing-link', type: 'button', text: 'الخطط والأسعار',
      onClick: () => show('pricing'),
    }),
  ];
}

function providerButtons() {
  return [
    el('button', {
      class: 'gate-btn gate-btn-provider', type: 'button',
      onClick: (event) => run(event.currentTarget, '…', signInWithApple),
    }, [el('span', { class: 'gate-provider-mark', text: '', 'aria-hidden': 'true' }), 'المتابعة باستخدام Apple']),
    el('button', {
      class: 'gate-btn gate-btn-provider', type: 'button',
      onClick: (event) => run(event.currentTarget, '…', signInWithGoogle),
    }, [el('span', { class: 'gate-provider-mark gate-provider-google', text: 'G', 'aria-hidden': 'true' }), 'المتابعة باستخدام Google']),
    el('div', { class: 'gate-divider' }, [el('span', { text: 'أو باستخدام البريد الإلكتروني' })]),
  ];
}

function signInScreen() {
  return [
    el('div', { class: 'gate-head' }, [brand('sm'), el('h2', { class: 'gate-title', text: 'تسجيل الدخول' })]),
    ...providerButtons(),
    field('gate-email', 'البريد الإلكتروني', 'email', 'name@example.com', 'email'),
    field('gate-password', 'كلمة المرور', 'password', '••••••••', 'current-password'),
    primary('دخول', (event) => run(event.currentTarget, 'جارٍ الدخول…', async () => {
      await signInWithEmail($('gate-email').value.trim(), $('gate-password').value);
    })),
    link('نسيت كلمة المرور؟', async () => {
      const email = $('gate-email').value.trim();
      if (!email) { toast('أدخل بريدك أولاً', '⚠'); return; }
      try {
        await sendPasswordReset(email);
        toast('أُرسل رابط إعادة التعيين', '✉');
      } catch (error) { toastError(error); }
    }),
    el('div', { class: 'gate-foot' }, [
      'ليس لديك حساب؟ ',
      link('أنشئ حساباً', () => show('signup')),
    ]),
  ];
}

function signUpScreen() {
  return [
    el('div', { class: 'gate-head' }, [brand('sm'), el('h2', { class: 'gate-title', text: 'إنشاء حساب' })]),
    ...providerButtons(),
    field('gate-name', 'الاسم', 'text', 'اسمك', 'name'),
    field('gate-email', 'البريد الإلكتروني', 'email', 'name@example.com', 'email'),
    field('gate-password', 'كلمة المرور', 'password', '6 أحرف على الأقل', 'new-password'),
    primary('ابدأ مجاناً', (event) => run(event.currentTarget, 'جارٍ الإنشاء…', async () => {
      const email = $('gate-email').value.trim();
      const password = $('gate-password').value;
      // Caught here rather than at the server so the message is ours, and so a
      // typo is not reported as a failure.
      if (!email) { toast('أدخل بريدك الإلكتروني', '⚠'); return; }
      if (password.length < 6) { toast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', '⚠'); return; }
      await registerWithEmail(email, password, $('gate-name').value.trim());
      await sendVerification().catch((error) => console.error('[gate] verification send failed', error));
      show('verify');
    })),
    el('p', { class: 'gate-note', text: 'مجاني حتى 50 قطعة · بدون بطاقة بنكية' }),
    el('div', { class: 'gate-foot' }, [
      'لديك حساب؟ ',
      link('تسجيل الدخول', () => show('signin')),
    ]),
  ];
}

function verifyScreen() {
  const email = currentSession().user?.email || 'بريدك';
  return [
    el('div', { class: 'gate-head' }, [
      el('div', { class: 'gate-icon', text: '✉', 'aria-hidden': 'true' }),
      el('h2', { class: 'gate-title', text: 'فعّل بريدك الإلكتروني' }),
    ]),
    el('p', { class: 'gate-sub', text: `أرسلنا رابط التفعيل إلى ${email}. افتح الرابط ثم ارجع هنا.` }),
    primary('تحققت، تابع', (event) => run(event.currentTarget, 'جارٍ التحقق…', async () => {
      const verified = await refreshVerification();
      if (verified) {
        show('onboarding');
      } else {
        toast('لم يُفعّل البريد بعد — افتح الرابط في رسالتك', '⚠');
      }
    })),
    link('إعادة إرسال الرسالة', async () => {
      try {
        await sendVerification();
        toast('أُرسلت الرسالة', '✉');
      } catch (error) { toastError(error); }
    }),
    el('p', { class: 'gate-fineprint', text: 'يمكنك تصفح التطبيق، لكن المزامنة والمشاركة تحتاجان بريداً مفعّلاً.' }),
    link('تسجيل الخروج', () => signOutUser().catch(toastError)),
  ];
}

// ── onboarding ─────────────────────────────────────────────────────────────
function onboardingScreen() {
  if (state.step === 1) {
    return [
      el('div', { class: 'gate-head' }, [
        el('h2', { class: 'gate-title', text: 'ماذا تريد أن تنظّم؟' }),
        el('p', { class: 'gate-sub', text: 'نقترح لك تصنيفات مناسبة — ويمكنك تغييرها متى شئت.' }),
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
        el('span', { text: useCase.label }),
      ]))),
    ];
  }

  if (state.step === 2) {
    return [
      el('div', { class: 'gate-head' }, [
        el('h2', { class: 'gate-title', text: 'ماذا تريد أن تسمّي مخزنك؟' }),
      ]),
      field('gate-workspace', 'اسم المخزن', 'text', NAME_SUGGESTIONS[state.useCase] || 'مخزني', 'off'),
      primary('متابعة', (event) => run(event.currentTarget, 'جارٍ التجهيز…', async () => {
        const name = $('gate-workspace').value.trim() || NAME_SUGGESTIONS[state.useCase] || 'مخزني';
        await createWorkspaceForUser(name, state.useCase);
        state.step = 3;
        renderGate();
      })),
      link('رجوع', () => { state.step = 1; renderGate(); }),
    ];
  }

  return [
    el('div', { class: 'gate-head' }, [
      el('div', { class: 'gate-icon gate-icon-ok', text: '✓', 'aria-hidden': 'true' }),
      el('h2', { class: 'gate-title', text: 'مخزنك جاهز.' }),
    ]),
    primary('إضافة أول قطعة', () => finish({ intent: 'add-item' })),
    secondary('استيراد من Excel', () => finish({ intent: 'import' })),
    link('تصفّح أولاً', () => finish({ intent: 'browse' })),
  ];
}

/**
 * Creates the workspace through the backend so the plan, its limits and the
 * owner membership are all set from values a client cannot influence.
 */
async function createWorkspaceForUser(name, useCase) {
  const { functions, sdk } = firebaseContext();
  if (!functions) throw new Error('الخدمة السحابية غير متاحة');
  const callable = sdk.functions.httpsCallable(functions, 'createWorkspace');
  await callable({
    name,
    useCase: useCase || 'other',
    locale: 'ar',
    currency: 'SAR',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh',
  });
}

function pricingScreen() {
  return [
    el('div', { class: 'gate-head' }, [
      brand('sm'),
      el('h2', { class: 'gate-title', text: 'الخطط والأسعار' }),
    ]),
    el('div', { class: 'gate-plans' }, orderedPlans().map((plan) => el('div', {
      class: `gate-plan${plan.badge ? ' featured' : ''}`,
    }, [
      plan.badge ? el('div', { class: 'gate-plan-badge', text: plan.badge.ar }) : null,
      el('div', { class: 'gate-plan-name', text: plan.name.ar }),
      el('div', { class: 'gate-plan-price' }, plan.price.custom
        ? [el('span', { class: 'gate-plan-custom', text: plan.price.custom.ar })]
        : [
          el('span', { class: 'gate-plan-amount', text: String(plan.price.monthly) }),
          el('span', { class: 'gate-plan-unit', text: 'ريال / شهر' }),
        ]),
      el('div', { class: 'gate-plan-items', text: plan.limits.items === -1
        ? 'قطع بلا حد'
        : `${plan.limits.items.toLocaleString('en-US')} قطعة` }),
      el('div', { class: 'gate-plan-line', text: `مساعد المخزن: ${plan.assistant.label.ar}` }),
    ]))),
    secondary('رجوع', () => show('welcome')),
  ];
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

  panel.dataset.screen = state.screen;
  render(panel, (screens[state.screen] || welcomeScreen)());
  panel.scrollTo?.(0, 0);
}

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
