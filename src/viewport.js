// The viewport as it actually is, not as `100vh` claims it is.
//
// Two things lie to CSS on a phone:
//
//   1. `100vh` is the height with browser chrome hidden. Safari's chrome is
//      only hidden while you are scrolling down, so a shell sized to 100vh is
//      cut off at the bottom for most of the session. `dvh`/`svh` fix that in
//      CSS (see layout.css) and need no help here.
//
//   2. The on-screen keyboard does not resize the layout viewport at all on
//      iOS. Nothing in CSS knows it is there. A bottom sheet sits happily
//      underneath it, with the field the customer is typing into and the save
//      button they are reaching for both hidden.
//
// `visualViewport` is the only thing that reports (2) — but it also reports
// everything else that moves the visual viewport: a pinch-zoom, Safari's
// toolbar collapsing and expanding, a rotation mid-way. Read naively, a page
// zoomed to 200% looks exactly like a keyboard covering half the screen, and
// the tab bar would vanish and every sheet jump up by a keyboard that is not
// there. So a keyboard is only believed when three things agree:
//
//   · an editable control has focus — no focus, no keyboard, whatever the
//     geometry says;
//   · the page is not zoomed (`visualViewport.scale` ≈ 1);
//   · the visual viewport really ends well above the layout viewport's bottom.
//
// The result is one custom property, `--kb` (the height occluded at the
// bottom, 0 when no keyboard is up), and `body.kb-open`. Everything else is
// CSS reading those.

import { onResume } from './lifecycle.js';

let bound = false;
let raf = 0;
let settleTimer = 0;
let current = -1;

/** Input types that bring up no text keyboard: tapping them is not typing. */
const NON_TEXT_INPUTS = new Set([
  'button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden',
]);

/** True for a control a software keyboard types into. */
export function isEditableElement(element) {
  if (!element || element.disabled || element.readOnly) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  if (tag === 'TEXTAREA') return true;
  // A <select> opens a picker, not a keyboard; its wheel does not occlude the
  // sheet the way a keyboard does, and treating it as one moved sheets for no
  // reason.
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((element.type || 'text').toLowerCase());
  return false;
}

/** The height the keyboard hides, or 0. */
function occludedHeight() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  if (!isEditableElement(document.activeElement)) return 0;
  // A pinch-zoomed page shrinks the visual viewport in both directions; that
  // is the customer reading, not a keyboard. (0.02: scale is a float, and a
  // page at rest reports 1 or something within a rounding error of it.)
  if (Math.abs((vv.scale || 1) - 1) > 0.02) return 0;
  // The layout viewport's height, which the keyboard does not change on iOS.
  // clientHeight is the stable reading; innerHeight follows the toolbar and
  // is the fallback where clientHeight is not reported.
  const layout = document.documentElement.clientHeight || window.innerHeight;
  const hidden = Math.max(0, layout - (vv.offsetTop + vv.height));
  // With focus confirmed, anything below this is the toolbar settling, not a
  // keyboard — the smallest real keyboard (a hardware-keyboard accessory bar
  // on iPad) is taller than this.
  return hidden > 60 ? Math.round(hidden) : 0;
}

function apply() {
  raf = 0;
  const kb = occludedHeight();
  if (kb === current) return;
  current = kb;
  document.documentElement.style.setProperty('--kb', `${kb}px`);
  document.body.classList.toggle('kb-open', kb > 0);
  if (kb > 0) keepFocusVisible(document.activeElement);
}

function schedule() {
  if (raf) return;
  raf = requestAnimationFrame(apply);
}

/**
 * Measure now, and again once Safari has finished animating: the focus event
 * arrives before the keyboard has risen, and the blur before it has fallen.
 */
function scheduleSettled() {
  schedule();
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = 0;
    apply();
    // Moving from field to field leaves the keyboard up and `--kb` unchanged,
    // so apply() has nothing new to react to — but the new field may still be
    // under the keyboard.
    if (current > 0) keepFocusVisible(document.activeElement);
  }, 350);
}

/**
 * Starts tracking. Safe to call more than once, and safe to call where
 * `visualViewport` does not exist — there, `--kb` stays 0 and every rule that
 * reads it is a no-op.
 */
export function watchViewport() {
  if (bound) return;
  bound = true;
  document.documentElement.style.setProperty('--kb', '0px');
  current = 0;

  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  document.addEventListener('focusin', scheduleSettled);
  document.addEventListener('focusout', scheduleSettled);
  // A rotation changes both viewports; the resize event can fire before the
  // new metrics settle, so re-read after they have.
  window.addEventListener('orientationchange', scheduleSettled);
  // Back from the back-forward cache: whatever was measured before the page
  // froze (a keyboard that was up, say) is stale.
  onResume(() => { current = -1; scheduleSettled(); });
  apply();
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Keeps a focused control visible above the keyboard.
 *
 * The browser's own scroll-into-view runs against the layout viewport, which
 * does not know the keyboard exists — so it can decide a field is already
 * visible when it is behind the keyboard. This checks against the visual
 * viewport instead, and only scrolls when the control really is occluded. It
 * scrolls instantly while the keyboard is up: Safari is animating the visual
 * viewport at the same moment, and a smooth scroll racing that animation is
 * the bounce customers notice.
 */
export function keepFocusVisible(element) {
  if (!element || !element.isConnected) return;
  requestAnimationFrame(() => {
    const vv = window.visualViewport;
    const rect = element.getBoundingClientRect();
    const top = vv ? vv.offsetTop : 0;
    const bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
    if (rect.bottom <= bottom - 8 && rect.top >= top) return;
    const smooth = current === 0 && !reducedMotion();
    element.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  });
}
