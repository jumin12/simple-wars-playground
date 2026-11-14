// Runtime error reporting. Loaded before every other script so load-time errors are caught too.
// A failing frame is logged and the game keeps running instead of freezing; the player sees one short
// notice at most every 30 seconds. The last 20 errors stay in window.__wodErrors for the dev menu.
'use strict';
(function () {
    const MAX_KEPT = 20;
    const NOTICE_EVERY_MS = 30000;
    let lastNoticeAt = -Infinity;
    window.__wodErrors = [];

    function describe(err) {
        if (err && err.stack) return String(err.stack).split('\n').slice(0, 6).join('\n');
        if (err && err.message) return String(err.message);
        return String(err);
    }

    window.wodReportRuntimeError = function wodReportRuntimeError(err, where) {
        const text = describe(err);
        const list = window.__wodErrors;
        const last = list[list.length - 1];
        if (last && last.text === text && last.where === where) {
            last.count++;
            last.at = Date.now();
        } else {
            list.push({ where: where || 'unknown', text, count: 1, at: Date.now() });
            if (list.length > MAX_KEPT) list.shift();
            console.error('[Simple Wars] ' + (where || 'error') + ':', err);
        }
        const now = Date.now();
        if (now - lastNoticeAt < NOTICE_EVERY_MS) return;
        lastNoticeAt = now;
        try {
            if (typeof showNotification === 'function')
                showNotification('Something went wrong, but the game kept running. If it misbehaves, return to the menu.');
        } catch (_) { /* the notice is best effort; the error is already logged */ }
    };

    window.addEventListener('error', (ev) => {
        // Resource load errors (img/audio) have no error object and are handled where they are loaded.
        if (!ev || (!ev.error && !ev.message)) return;
        window.wodReportRuntimeError(ev.error || ev.message, 'uncaught');
    });
    window.addEventListener('unhandledrejection', (ev) => {
        window.wodReportRuntimeError(ev && ev.reason, 'unhandled promise');
    });
})();
