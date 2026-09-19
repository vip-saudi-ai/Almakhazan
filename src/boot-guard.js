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

  function note(kind, detail) {
    problems.push(kind + ': ' + detail);
  }

  window.addEventListener('error', function (event) {
    if (event.message) note('خطأ', event.message);
    else if (event.target && event.target.src) note('تعذّر تحميل ملف', String(event.target.src));
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    note('فشل', (reason && (reason.message || reason)) || 'سبب غير معروف');
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
      lines.push('لم يبدأ تشغيل كود التطبيق في هذا العارض.');
      lines.push('افتح الملف في متصفح Safari أو Chrome بدل معاينة الملفات.');
    } else {
      lines.push('توقّف التشغيل قبل اكتماله.');
    }
    if (problems.length) lines.push('التفاصيل: ' + problems.slice(0, 3).join(' · '));

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
    retry.textContent = 'إعادة المحاولة';
    retry.className = 'btn btn-p';
    retry.style.marginTop = '6px';
    retry.style.padding = '10px 22px';
    retry.onclick = function () { window.location.reload(); };
    label.appendChild(retry);
  }

  setTimeout(show, TIMEOUT_MS);
})();
