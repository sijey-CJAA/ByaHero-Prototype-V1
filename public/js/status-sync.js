(function () {
  'use strict';
  // Try to obtain the socket used by the app.
  var socket = null;
  try {
    // Common patterns: global io() or window.socket
    if (typeof window.socket !== 'undefined' && window.socket) socket = window.socket;
    else if (typeof io === 'function') socket = io();
    else if (typeof window.io !== 'undefined' && window.io) socket = window.io;
  } catch (e) {
    // ignore
  }

  function requestAuthoritative() {
    try {
      if (socket && socket.connected) {
        socket.emit('request-buses');
        // small safety: also ask for list after a short delay in case of races
        setTimeout(function () {
          try { if (socket && socket.connected) socket.emit('request-buses'); } catch (e) { }
        }, 200);
      }
    } catch (e) { /* ignore */ }
  }

  // Hook clicks on the two status buttons (if they are present) so we force-refresh after the user changes status.
  document.addEventListener('click', function (ev) {
    try {
      var target = ev.target || ev.srcElement;
      // Check by id or by closest (in case a child node was clicked)
      if (!target) return;
      if (target.id === 'btn-available' || (target.closest && target.closest('#btn-available'))) {
        // user clicked "Available"
        // give local UI a moment to update then request authoritative list
        setTimeout(requestAuthoritative, 120);
      } else if (target.id === 'btn-full' || (target.closest && target.closest('#btn-full'))) {
        // user clicked "Full"
        setTimeout(requestAuthoritative, 120);
      }
    } catch (e) { /* ignore */ }
  }, true);

  // If server acknowledges the set-bus-status, request the authoritative list (ensures everyone syncs)
  if (socket) {
    socket.on && socket.on('set-bus-status-ok', function () {
      try { requestAuthoritative(); } catch (e) { }
    });
    // Also re-request when the server acknowledges register-role (sometimes initial status is set server-side)
    socket.on && socket.on('register-role-ok', function () {
      try { requestAuthoritative(); } catch (e) { }
    });
  }

  // Provide a console helper to force a sync: ByaHeroForceRefresh()
  window.ByaHeroForceRefresh = function () {
    requestAuthoritative();
    return 'requested buses list';
  };
})();