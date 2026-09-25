// The page's life on a phone, in one place.
//
// iOS suspends a backgrounded tab or Home Screen app without warning, may kill
// it under memory pressure, and may bring it back from the back-forward cache
// exactly as it was — timers, open camera and all. Three events cover this:
//
//   visibilitychange → hidden   the app left the screen (home button, app
//                               switcher, another tab, the screen locked)
//   pagehide                    the page is being unloaded or frozen into the
//                               back-forward cache
//   pageshow (persisted)        it came back from that cache
//
// Resources that must never outlive the screen — the camera above all — stop
// on the first two. Display state that may have gone stale while frozen (the
// keyboard metrics) is re-read on the third. Nothing here touches data: an
// import or restore records its own progress durably as it goes, and a hidden
// page must not interrupt that bookkeeping.

const backgroundHandlers = new Set();
const resumeHandlers = new Set();
let bound = false;

function runAll(handlers, arg) {
  for (const handler of [...handlers]) {
    try { handler(arg); } catch (error) { console.error('[lifecycle] a handler failed', error); }
  }
}

function bind() {
  if (bound) return;
  bound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') runAll(backgroundHandlers, 'hidden');
  });
  window.addEventListener('pagehide', (event) => runAll(backgroundHandlers, event.persisted ? 'frozen' : 'unload'));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) runAll(resumeHandlers, 'bfcache');
  });
}

/**
 * Runs `handler` whenever the page leaves the screen — hidden, frozen or
 * unloading. Returns an unsubscribe. Safe to register any number of times;
 * the document listeners are added once.
 */
export function onBackground(handler) {
  bind();
  backgroundHandlers.add(handler);
  return () => backgroundHandlers.delete(handler);
}

/** Runs `handler` when the page is restored from the back-forward cache. */
export function onResume(handler) {
  bind();
  resumeHandlers.add(handler);
  return () => resumeHandlers.delete(handler);
}

/**
 * True when running as an installed Home Screen app rather than in a browser
 * tab. Presentation only: the inventory, the plan and every rule are the same
 * either way.
 */
export function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
}
