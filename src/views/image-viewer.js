// The full-screen image viewer.
//
// In NAZM an image is not decoration: it is the documentation. A hallmark, a
// serial number, a scratch on a case back — the reason to keep a photograph
// of an object is to be able to look at it closely later. So every image in
// the app opens here, including images that have not been saved yet.
//
// Shape of the thing:
//
//   stage        one per image, holding <img> and the transform
//   ── the viewer owns an array of stages and an index. That is deliberate:
//      a future side-by-side condition comparison is "render two stages in
//      one row" rather than a second viewer, and nothing here assumes there
//      is exactly one image on screen.
//
// Gestures are pointer events throughout, so a finger, a stylus and a mouse
// take the same path. What differs between them is only which gestures exist:
// a mouse gets wheel zoom and drag-pan, a finger gets pinch and swipe.

import { ImageTier, hasDistinctOriginal, imageSrc } from '../storage.js';
import { $, el, formatNumber, render } from '../utils.js';
import { icon } from '../icons.js';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 32;
// Far enough that a pan cannot become a page turn by accident.
const SWIPE_DISTANCE = 64;
const SWIPE_RATIO = 1.4;  // horizontal must beat vertical by this much

const state = {
  open: false,
  images: [],
  index: 0,
  title: '',
  actions: null,
  returnFocus: null,
  stages: new Map(),   // image id → { root, img, scale, tx, ty, loadedFull }
  pointers: new Map(),
  gesture: null,
  lastTap: 0,
  lastTapPoint: null,
  controlsHidden: false,
};

// ── opening ────────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {Array} options.images   image records, in the order they are shown
 * @param {number} [options.index] which one to open on
 * @param {string} [options.title] the item's name, for the accessible label
 * @param {Array}  [options.actions] optional overflow entries:
 *   `{ label, onSelect(image, index), danger? }`. Inspection is the job; an
 *   action only belongs here when it is about the image being looked at.
 */
export function openImageViewer({ images, index = 0, title = '', actions = null }) {
  const list = (images || []).filter(Boolean);
  if (!list.length) return;

  state.open = true;
  state.images = list;
  state.index = Math.min(Math.max(0, index), list.length - 1);
  state.title = title;
  state.actions = actions;
  state.returnFocus = document.activeElement;
  state.stages = new Map();

  const root = ensureRoot();
  resetSession(root);
  root.hidden = false;
  document.body.classList.add('viewer-open');
  buildStages();
  update();

  // Focus lands on the close button: the first thing a keyboard or screen
  // reader user needs is the way out.
  requestAnimationFrame(() => $('viewer-close')?.focus());
}

/**
 * Everything that belongs to one visit, put back.
 *
 * `controlsHidden` was reset on the state object but not on the DOM, so an
 * image closed with its chrome hidden reopened with the chrome still hidden —
 * a black screen with no way out but a guess. And the tap and pointer
 * bookkeeping outlived the visit too: a tap that ended the last session was
 * still "the first tap" of the next one, so opening an image and tapping it
 * once within 300ms of that earlier tap zoomed instead of toggling the
 * controls. A pointer left in the map by a gesture the browser cancelled made
 * the next one-finger pan behave like half a pinch.
 *
 * None of this is state the next visit should inherit, so none of it does.
 */
function resetSession(root) {
  state.controlsHidden = false;
  state.lastTap = 0;
  state.lastTapPoint = null;
  state.pointers.clear();
  state.gesture = null;
  root?.classList.remove('controls-hidden');
}

export function closeImageViewer() {
  if (!state.open) return;
  state.open = false;
  const root = $('viewer');
  if (root) root.hidden = true;
  document.body.classList.remove('viewer-open');
  releaseStages();
  // Also on the way out, so a viewer that is inspected while closed — or
  // reopened by a path that does not go through `openImageViewer` — is never
  // found holding the last visit's gesture state.
  resetSession(root);

  // Back to whatever opened it — the same thumbnail, not the top of the page.
  const target = state.returnFocus;
  state.returnFocus = null;
  if (target && document.contains(target)) {
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }
}

export function isImageViewerOpen() {
  return state.open;
}

// ── the shell ──────────────────────────────────────────────────────────────

function ensureRoot() {
  let root = $('viewer');
  if (root) return root;

  root = el('div', {
    id: 'viewer',
    class: 'viewer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'عرض الصورة',
    hidden: true,
  }, [
    el('div', { class: 'viewer-stagewrap', id: 'viewer-stages' }),
    el('div', { class: 'viewer-bar viewer-bar-top', id: 'viewer-top' }, [
      el('button', {
        id: 'viewer-close', class: 'viewer-btn', type: 'button',
        'aria-label': 'إغلاق عرض الصورة',
        onClick: closeImageViewer,
      }, [icon('close')]),
      el('div', { class: 'viewer-count', id: 'viewer-count', role: 'status', 'aria-live': 'polite' }),
      el('div', { class: 'viewer-top-end', id: 'viewer-actions' }),
    ]),
    el('button', {
      class: 'viewer-nav viewer-prev', id: 'viewer-prev', type: 'button',
      'aria-label': 'الصورة السابقة', onClick: () => step(-1),
    }, [icon('back', { size: 26 })]),
    el('button', {
      class: 'viewer-nav viewer-next', id: 'viewer-next', type: 'button',
      'aria-label': 'الصورة التالية', onClick: () => step(1),
    }, [icon('forward', { size: 26 })]),
    el('div', { class: 'viewer-zoombar', id: 'viewer-zoom' }, [
      el('button', { class: 'viewer-btn', type: 'button', 'aria-label': 'تصغير', onClick: () => zoomBy(1 / 1.5) }, [icon('minus')]),
      // Wrapped, not passed directly: a handler receives the event as its
      // first argument, and resetZoom's first argument is a stage index.
      el('button', { class: 'viewer-btn', type: 'button', 'aria-label': 'ملء الشاشة', onClick: () => resetZoom() }, [icon('expand')]),
      el('button', { class: 'viewer-btn', type: 'button', 'aria-label': 'تكبير', onClick: () => zoomBy(1.5) }, [icon('plus')]),
    ]),
    el('div', { class: 'viewer-loading', id: 'viewer-loading', role: 'status', hidden: true },
      [el('span', { class: 'boot-spin', 'aria-hidden': 'true' }), el('span', { text: 'جارٍ تحميل الصورة الأصلية…' })]),
  ]);

  document.body.appendChild(root);
  bindGestures(root);
  return root;
}

// ── stages ─────────────────────────────────────────────────────────────────

function buildStages() {
  const wrap = $('viewer-stages');
  state.stages = new Map();

  render(wrap, state.images.map((image, i) => {
    const img = el('img', {
      class: 'viewer-img',
      alt: `${state.title ? state.title + ' — ' : ''}الصورة ${formatNumber(i + 1)} من ${formatNumber(state.images.length)}`,
      draggable: 'false',
      decoding: 'async',
    });
    const root = el('div', { class: 'viewer-stage', 'data-index': String(i) }, [img]);
    state.stages.set(i, { root, img, scale: 1, tx: 0, ty: 0, loadedFull: false });
    return root;
  }));
}

function releaseStages() {
  state.stages.clear();
  render($('viewer-stages'), []);
}

function stage(index = state.index) {
  return state.stages.get(index);
}

// ── loading ────────────────────────────────────────────────────────────────
//
// The visible image is never blanked. The display copy goes in first, because
// it is usually already decoded from the screen behind; the original replaces
// it when it arrives. If the two resolve to the same file there is nothing to
// wait for and no loading state is shown at all.

async function loadStage(index, { full }) {
  const st = state.stages.get(index);
  if (!st || (full && st.loadedFull)) return;

  if (!st.img.src) {
    const quick = await imageSrc(state.images[index], { tier: ImageTier.DISPLAY });
    if (quick && !st.img.src) st.img.src = quick;
  }
  if (!full) return;

  const distinct = await hasDistinctOriginal(state.images[index]);
  if (!distinct) { st.loadedFull = true; return; }

  const isCurrent = () => state.open && state.index === index;
  // Only say "loading" if it is still loading once a moment has passed. A
  // cached original arrives faster than the words can be read.
  const timer = setTimeout(() => { if (isCurrent()) showLoading(true); }, 400);

  try {
    const src = await imageSrc(state.images[index], { tier: ImageTier.FULL });
    if (!src) return;
    // Decode before swapping, so the image never flashes empty mid-change.
    const next = new Image();
    next.decoding = 'async';
    next.src = src;
    if (typeof next.decode === 'function') await next.decode().catch(() => {});
    if (!state.open) return;
    st.img.src = src;
    st.loadedFull = true;
  } catch (error) {
    console.error('[viewer] original failed to load', error);
  } finally {
    clearTimeout(timer);
    if (isCurrent()) showLoading(false);
  }
}

function showLoading(on) {
  const node = $('viewer-loading');
  if (node) node.hidden = !on;
}

// ── navigation ─────────────────────────────────────────────────────────────

function step(delta) {
  const next = state.index + delta;
  if (next < 0 || next >= state.images.length) return;
  // The image being left goes back to fit. Coming back to it half-zoomed,
  // panned to a corner someone chose three images ago, is disorienting.
  resetZoom(state.index);
  state.index = next;
  update();
}

function update() {
  const wrap = $('viewer-stages');
  if (wrap) wrap.style.transform = `translateX(${state.index * 100 * (isRtl() ? 1 : -1)}%)`;

  const total = state.images.length;
  const count = $('viewer-count');
  if (count) {
    count.textContent = total > 1 ? `${formatNumber(state.index + 1)} / ${formatNumber(total)}` : '';
    count.setAttribute('aria-label', total > 1
      ? `الصورة ${formatNumber(state.index + 1)} من ${formatNumber(total)}${state.title ? ' — ' + state.title : ''}`
      : state.title || 'الصورة');
  }

  const prev = $('viewer-prev');
  const next = $('viewer-next');
  if (prev) prev.hidden = total < 2 || state.index === 0;
  if (next) next.hidden = total < 2 || state.index === total - 1;

  renderActions();
  applyTransform();
  showLoading(false);

  // The one being looked at, at full resolution; its neighbours at display
  // resolution so a swipe does not land on an empty frame. Never the whole
  // gallery at full size.
  void loadStage(state.index, { full: true });
  void loadStage(state.index - 1, { full: false });
  void loadStage(state.index + 1, { full: false });
}

function renderActions() {
  const host = $('viewer-actions');
  if (!host) return;
  const actions = state.actions;
  if (!actions?.length) { render(host, []); return; }

  render(host, [
    el('button', {
      class: 'viewer-btn', type: 'button',
      'aria-label': 'إجراءات الصورة',
      'aria-expanded': 'false',
      onClick: (event) => {
        event.stopPropagation();
        const menu = $('viewer-menu');
        if (menu) { menu.remove(); event.currentTarget.setAttribute('aria-expanded', 'false'); return; }
        event.currentTarget.setAttribute('aria-expanded', 'true');
        host.appendChild(el('div', { class: 'viewer-menu', id: 'viewer-menu', role: 'menu' },
          actions.map((action) => el('button', {
            class: `viewer-menu-item${action.danger ? ' danger' : ''}`,
            type: 'button', role: 'menuitem', text: action.label,
            onClick: () => {
              $('viewer-menu')?.remove();
              action.onSelect?.(state.images[state.index], state.index);
            },
          }))));
      },
    }, [icon('more')]),
  ]);
}

// ── zoom and pan ───────────────────────────────────────────────────────────

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function applyTransform(index = state.index) {
  const st = state.stages.get(index);
  if (!st) return;
  st.img.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
  st.root.classList.toggle('zoomed', st.scale > 1.01);
}

/**
 * Keeps the image from being dragged off the screen entirely.
 *
 * The scaled size is computed from the layout size times the scale, not read
 * back from `getBoundingClientRect`. The rect reflects the transform that is
 * currently painted, and this runs *before* the new one is applied — reading
 * it there clamps every zoom against the previous frame's size, which pins
 * the first zoom step to the centre no matter where it was aimed.
 */
function clampPan(st) {
  const box = st.root.getBoundingClientRect();
  const width = st.img.offsetWidth * st.scale;
  const height = st.img.offsetHeight * st.scale;
  // How far the scaled image overflows its box, in each axis. When it is
  // smaller than the box there is nothing to reveal, so it stays centred.
  const slackX = Math.max(0, (width - box.width) / 2);
  const slackY = Math.max(0, (height - box.height) / 2);
  st.tx = clamp(st.tx, -slackX, slackX);
  st.ty = clamp(st.ty, -slackY, slackY);
}

/**
 * Scales around a point in viewport coordinates, so the pixel under the
 * finger or cursor stays under it. Zooming to the centre of the image is the
 * behaviour that makes a serial number in a corner impossible to reach.
 */
function zoomAt(clientX, clientY, factor) {
  const st = stage();
  if (!st) return;
  const box = st.root.getBoundingClientRect();
  const next = clamp(st.scale * factor, MIN_SCALE, MAX_SCALE);
  if (next === st.scale) return;

  // The point, relative to the box centre, which is where the transform
  // origin sits.
  const px = clientX - (box.left + box.width / 2);
  const py = clientY - (box.top + box.height / 2);
  const ratio = next / st.scale;
  st.tx = px - (px - st.tx) * ratio;
  st.ty = py - (py - st.ty) * ratio;
  st.scale = next;
  if (st.scale <= MIN_SCALE) { st.tx = 0; st.ty = 0; }
  clampPan(st);
  applyTransform();
}

function zoomBy(factor) {
  const st = stage();
  if (!st) return;
  const box = st.root.getBoundingClientRect();
  zoomAt(box.left + box.width / 2, box.top + box.height / 2, factor);
}

function resetZoom(index = state.index) {
  const st = state.stages.get(index);
  if (!st) return;
  st.scale = 1; st.tx = 0; st.ty = 0;
  applyTransform(index);
}

// ── gestures ───────────────────────────────────────────────────────────────

const isRtl = () => document.documentElement.dir === 'rtl';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function bindGestures(root) {
  const wrap = root.querySelector('.viewer-stagewrap');

  wrap.addEventListener('pointerdown', (event) => {
    if (event.button != null && event.button > 0) return;
    // Capture is an optimisation — it keeps the moves coming when a finger
    // leaves the element — and it throws if the pointer has already ended,
    // which happens for a very fast tap and for a pointer the system took
    // away. The gesture must still be tracked when it does.
    try { wrap.setPointerCapture?.(event.pointerId); } catch { /* pointer already gone */ }
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      const st = stage();
      state.gesture = {
        kind: 'pinch',
        startDistance: distance(a, b),
        startScale: st ? st.scale : 1,
        centre: midpoint(a, b),
      };
      return;
    }
    if (state.pointers.size === 1) {
      const st = stage();
      state.gesture = {
        kind: st && st.scale > 1.01 ? 'pan' : 'swipe',
        startX: event.clientX,
        startY: event.clientY,
        baseTx: st ? st.tx : 0,
        baseTy: st ? st.ty : 0,
        moved: false,
        pointerType: event.pointerType || 'mouse',
      };
    }
  });

  wrap.addEventListener('pointermove', (event) => {
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const st = stage();
    if (!st || !state.gesture) return;

    if (state.gesture.kind === 'pinch' && state.pointers.size >= 2) {
      const [a, b] = [...state.pointers.values()];
      const factor = distance(a, b) / (state.gesture.startDistance || 1);
      const target = clamp(state.gesture.startScale * factor, MIN_SCALE, MAX_SCALE);
      const centre = midpoint(a, b);
      zoomAt(centre.x, centre.y, target / st.scale);
      state.gesture.moved = true;
      event.preventDefault();
      return;
    }

    const dx = event.clientX - state.gesture.startX;
    const dy = event.clientY - state.gesture.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) state.gesture.moved = true;

    if (state.gesture.kind === 'pan') {
      // Panning a zoomed image never turns into a page change: the gesture
      // committed to panning the moment it started on a zoomed stage.
      st.tx = state.gesture.baseTx + dx;
      st.ty = state.gesture.baseTy + dy;
      clampPan(st);
      applyTransform();
      event.preventDefault();
    } else if (state.gesture.kind === 'swipe' && Math.abs(dx) > Math.abs(dy)) {
      const wrapEl = $('viewer-stages');
      const base = state.index * 100 * (isRtl() ? 1 : -1);
      wrapEl.style.transition = 'none';
      wrapEl.style.transform = `translateX(calc(${base}% + ${dx}px))`;
      event.preventDefault();
    }
  });

  const finish = (event) => {
    if (!state.pointers.has(event.pointerId)) return;
    const gesture = state.gesture;
    const last = state.pointers.get(event.pointerId);
    state.pointers.delete(event.pointerId);
    if (state.pointers.size > 0) return;   // still pinching with one finger down
    state.gesture = null;

    const wrapEl = $('viewer-stages');
    wrapEl.style.transition = '';

    if (!gesture) return;

    if (gesture.kind === 'swipe') {
      const dx = last.x - gesture.startX;
      const dy = last.y - gesture.startY;
      const horizontal = Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO;
      if (horizontal && Math.abs(dx) > SWIPE_DISTANCE) {
        // In RTL the images run right-to-left, so a drag to the right is
        // "next", not "previous".
        const forward = isRtl() ? dx > 0 : dx < 0;
        step(forward ? 1 : -1);
        return;
      }
      update();       // snap back
      if (!gesture.moved) handleTap(last, gesture.pointerType);
      return;
    }
    if (gesture.kind === 'pan' && !gesture.moved) handleTap(last, gesture.pointerType);
  };

  wrap.addEventListener('pointerup', finish);
  wrap.addEventListener('pointercancel', finish);

  // Wheel and trackpad. A trackpad pinch arrives as a wheel event with
  // ctrlKey set; an ordinary wheel zooms too, because in a full-screen image
  // there is nothing else for it to scroll.
  wrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false });

  // One gesture, one zoom. A mouse double click fires two pointerup pairs
  // *and* a dblclick, so handling both meant toggleZoomAt ran twice — zoom in,
  // then straight back out, leaving the scale exactly where it started.
  //
  // Each input type now has exactly one pathway: the browser's own dblclick
  // for a mouse (it respects the reader's OS double-click speed), and the
  // pointer timing for touch and pen, where no dblclick is dispatched
  // reliably. Clearing `lastTap` also cancels the two pending single-click
  // control toggles the two clicks queued on their way here.
  wrap.addEventListener('dblclick', (event) => {
    event.preventDefault();
    state.lastTap = 0;
    state.lastTapPoint = null;
    toggleZoomAt(event.clientX, event.clientY);
  });
}

/**
 * A single tap toggles the controls; two taps toggle the zoom.
 *
 * `pointerType` decides whether the second half of that sentence applies
 * here: for a mouse it does not, because `dblclick` owns it (see
 * bindGestures). Running both is what made one double click zoom and unzoom.
 */
function handleTap(point, pointerType = 'touch') {
  const now = Date.now();
  const near = state.lastTapPoint
    && Math.hypot(point.x - state.lastTapPoint.x, point.y - state.lastTapPoint.y) < DOUBLE_TAP_SLOP;

  if (pointerType !== 'mouse' && now - state.lastTap < DOUBLE_TAP_MS && near) {
    state.lastTap = 0;
    state.lastTapPoint = null;
    toggleZoomAt(point.x, point.y);
    return;
  }
  state.lastTap = now;
  state.lastTapPoint = point;
  // Wait out the double-tap window before acting on a single tap, or every
  // double tap would also flash the controls.
  setTimeout(() => {
    if (state.lastTap !== now) return;
    toggleControls();
  }, DOUBLE_TAP_MS);
}

function toggleZoomAt(x, y) {
  const st = stage();
  if (!st) return;
  if (st.scale > 1.01) { resetZoom(); return; }
  zoomAt(x, y, DOUBLE_TAP_SCALE);
}

function toggleControls() {
  state.controlsHidden = !state.controlsHidden;
  $('viewer')?.classList.toggle('controls-hidden', state.controlsHidden);
  // The way out is never hidden: the close button stays, whatever else goes.
}

// ── keyboard ───────────────────────────────────────────────────────────────

/**
 * Handled at the document level, and only while open. Returns true when the
 * key was consumed, so the app's own Escape handling does not also fire.
 */
export function handleViewerKey(event) {
  if (!state.open) return false;

  switch (event.key) {
    case 'Escape':
      if ($('viewer-menu')) { $('viewer-menu').remove(); return true; }
      closeImageViewer();
      return true;
    case 'ArrowRight':
      step(isRtl() ? -1 : 1);
      return true;
    case 'ArrowLeft':
      step(isRtl() ? 1 : -1);
      return true;
    case '+': case '=':
      zoomBy(1.5);
      return true;
    case '-': case '_':
      zoomBy(1 / 1.5);
      return true;
    case '0':
      resetZoom();
      return true;
    case 'Tab': {
      // Focus stays inside: a dialog the keyboard can walk out of is a dialog
      // the keyboard cannot get back into.
      const focusable = [...$('viewer').querySelectorAll('button:not([hidden])')]
        .filter((node) => node.offsetParent !== null);
      if (!focusable.length) return false;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { last.focus(); return true; }
      if (!event.shiftKey && document.activeElement === last) { first.focus(); return true; }
      return false;
    }
    default:
      return false;
  }
}

/**
 * Re-centres after a rotation. The image keeps its zoom, but a pan that was
 * valid in portrait can leave it off-screen in landscape.
 */
export function reflowViewer() {
  if (!state.open) return;
  const st = stage();
  if (st) { clampPan(st); applyTransform(); }
  update();
}
