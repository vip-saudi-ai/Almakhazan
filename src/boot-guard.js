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

  // The saved language, applied before the app's modules load, so an English
  // screen never draws right-to-left first. The app itself (src/i18n.js)
  // takes over from here; this only has to cover the boot screen.
  var lang = 'ar';
  try { if (window.localStorage.getItem('nazm.language') === 'en') lang = 'en'; } catch (e) { /* storage blocked */ }
  var TEXT = {
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
  }[lang];
  if (lang === 'en') {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    var bootLabel = document.getElementById('boot-label');
    if (bootLabel) bootLabel.textContent = TEXT.starting;
  }

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

  setTimeout(show, TIMEOUT_MS);
})();
