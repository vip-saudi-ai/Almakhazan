/* Classic script — deliberately not a module.
 *
 * It runs even where module scripts do not (iOS Quick Look and some embedded
 * web views silently refuse `type="module"`), and it turns a boot failure into
 * a message that says what happened instead of a spinner that never stops.
 *
 * ES5-only syntax: whatever breaks the app's parser must not break this too.
 */
(function () {
  'use strict';

  var TIMEOUT_MS = 12000;
  var problems = [];

  // The saved language is only a hint now: every launch starts at the
  // language gate (index.html, #lang-gate), and the saved choice is what the
  // gate highlights. The page's lang/dir follow the hint until the customer
  // chooses, so the boot screen that follows is never drawn in the wrong
  // direction first. src/i18n.js takes over once the modules run.
  var saved = null;
  try { saved = window.localStorage.getItem('nazm.language'); } catch (e) { /* storage blocked */ }
  if (saved !== 'ar' && saved !== 'en') saved = null;
  var TEXTS = {
    ar: {
      starting: 'جارٍ التشغيل…', error: 'خطأ', fileFailed: 'تعذّر تحميل ملف', failed: 'فشل', unknown: 'سبب غير معروف',
      notRunning: 'لم يبدأ تشغيل كود التطبيق في هذا العارض.',
      openInBrowser: 'افتح الملف في متصفح Safari أو Chrome بدل معاينة الملفات.',
      stopped: 'توقّف التشغيل قبل اكتماله.', details: 'التفاصيل: ', retry: 'إعادة المحاولة'
    },
    en: {
      starting: 'Starting…', error: 'Error', fileFailed: 'Could not load a file', failed: 'Failed', unknown: 'unknown reason',
      notRunning: 'The app did not start in this viewer.',
      openInBrowser: 'Open the file in Safari or Chrome instead of a file preview.',
      stopped: 'Startup stopped before it finished.', details: 'Details: ', retry: 'Try again'
    }
  };
  var TEXT = TEXTS[saved || 'ar'];

  function applyLanguage(lang) {
    TEXT = TEXTS[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    var bootLabel = document.getElementById('boot-label');
    if (bootLabel) bootLabel.textContent = TEXT.starting;
  }
  if (saved) applyLanguage(saved);

  // ── the language gate ──
  var chosen = null;

  function choose(lang) {
    if (chosen || (lang !== 'ar' && lang !== 'en')) return;
    chosen = lang;
    // The one storage key the app's i18n module reads (src/i18n.js).
    try { window.localStorage.setItem('nazm.language', lang); } catch (e) { /* private mode */ }
    // Locale first, then the reveal: the app shell is never shown in the
    // other language or direction, not even for a frame.
    applyLanguage(lang);
    document.documentElement.classList.remove('lang-pending');
    var gate = document.getElementById('lang-gate');
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
    window.__nazmLanguageChoice = lang;
    var event;
    try { event = new CustomEvent('nazm:language-chosen', { detail: lang }); } catch (e) {
      event = document.createEvent('CustomEvent');
      event.initCustomEvent('nazm:language-chosen', false, false, lang);
    }
    window.dispatchEvent(event);
    // The startup clock starts now: time spent choosing is not a stall.
    setTimeout(show, TIMEOUT_MS);
  }

  function bindGate() {
    var gate = document.getElementById('lang-gate');
    if (!gate) { choose(saved || 'ar'); return; }
    var buttons = gate.querySelectorAll('[data-language]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var lang = button.getAttribute('data-language');
      if (lang === saved) {
        button.className += ' is-previous';
        button.setAttribute('aria-describedby', 'lg-prev-' + lang);
      }
      button.onclick = (function (value) { return function () { choose(value); }; })(lang);
    }
    // A keyboard and a fine pointer: the remembered choice is focused, so
    // Enter takes it. On touch, focus is left alone — nothing to type into,
    // and a screen reader starts from the top.
    var previous = saved && gate.querySelector('[data-language="' + saved + '"]');
    if (previous && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      try { previous.focus({ preventScroll: true }); } catch (e) { previous.focus(); }
    }
  }

  // Automated tests choose a language up front through this hook (set by a
  // Playwright init script); nothing in the product sets it.
  if (window.__NAZM_TEST_LANGUAGE__) choose(window.__NAZM_TEST_LANGUAGE__);
  else bindGate();

  function note(kind, detail) {
    problems.push(kind + ': ' + detail);
  }

  window.addEventListener('error', function (event) {
    if (event.message) note(TEXT.error, event.message);
    else if (event.target && event.target.src) note(TEXT.fileFailed, String(event.target.src));
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    note(TEXT.failed, (reason && (reason.message || reason)) || TEXT.unknown);
  });

  function moduleScriptsRun() {
    // Set by the app bundle/module on first execution.
    return window.__almakhzanStarted === true;
  }

  function show() {
    if (document.body && document.body.classList.contains('ready')) return;

    var label = document.getElementById('boot-label');
    var spinner = document.querySelector('.boot-spin');
    if (spinner) spinner.style.display = 'none';
    if (!label) return;

    var lines = [];
    if (!moduleScriptsRun()) {
      lines.push(TEXT.notRunning);
      lines.push(TEXT.openInBrowser);
    } else {
      lines.push(TEXT.stopped);
    }
    if (problems.length) lines.push(TEXT.details + problems.slice(0, 3).join(' · '));

    label.textContent = '';
    for (var i = 0; i < lines.length; i++) {
      var line = document.createElement('div');
      line.textContent = lines[i];
      line.style.marginBottom = '8px';
      line.style.maxWidth = '300px';
      line.style.lineHeight = '1.7';
      label.appendChild(line);
    }

    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = TEXT.retry;
    retry.className = 'btn btn-p';
    retry.style.marginTop = '6px';
    retry.style.padding = '10px 22px';
    retry.onclick = function () { window.location.reload(); };
    label.appendChild(retry);
  }

})();
