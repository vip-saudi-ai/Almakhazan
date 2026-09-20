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
// `visualViewport` is the only thing that reports (2). This module turns it
// into one custom property, `--kb`, which is the height currently occluded at
// the bottom — zero whenever no keyboard is up. Everything else is ordinary
// CSS reading that property.

let bound = false;
let raf = 0;

function occludedHeight() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  // What the layout viewport has that the visual viewport does not, below the
  // fold. On iOS this is the keyboard; on Android with `resizes-content` it is
  // already zero because the layout really did shrink.
  const hidden = window.innerHeight - vv.height - vv.offsetTop;
  // Small differences are the URL bar animating, not a keyboard.
  return hidden > 80 ? Math.round(hidden) : 0;
}

function apply() {
  raf = 0;
  const kb = occludedHeight();
  document.documentElement.style.setProperty('--kb', `${kb}px`);
  document.body.classList.toggle('kb-open', kb > 0);
}

function schedule() {
  if (raf) return;
  raf = requestAnimationFrame(apply);
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

  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  // A rotation changes both viewports; the resize event above fires before the
  // new metrics settle on some devices, so re-read after the frame lands.
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
  apply();
}

/**
 * Keeps a focused control visible above the keyboard.
 *
 * The browser's own scroll-into-view runs against the layout viewport, which
 * does not know the keyboard exists — so it can decide a field is already
 * visible when it is behind the keyboard. This checks against the visual
 * viewport instead, and only scrolls when the control really is occluded.
 */
export function keepFocusVisible(element) {
  if (!element) return;
  requestAnimationFrame(() => {
    const vv = window.visualViewport;
    const rect = element.getBoundingClientRect();
    const bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
    if (rect.bottom <= bottom - 8 && rect.top >= 0) return;
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
