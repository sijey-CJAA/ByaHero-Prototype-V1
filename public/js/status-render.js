(function () {
  'use strict';

  // Try to grab existing socket instance (do not create a second socket())
  var socket = null;
  try {
    if (window.socket) socket = window.socket;
    else if (window.__socket) socket = window.__socket;
    else if (typeof io === 'function' && io && io()) {
      // If io() returns a socket but the app already created one, prefer the global references.
      try { socket = window.ioSocket || window.socket || null; } catch (e) { socket = null; }
    }
  } catch (e) { socket = null; }

  // If we couldn't find a shared socket, try the common fallback
  if (!socket && typeof io === 'function') {
    try { socket = io(); } catch (e) { socket = null; }
  }

  // Utility: create or update the "live users / nearby buses" card that many pages use.
  function renderLiveBusesCard(buses) {
    var container = document.getElementById('live-users');
    if (!container) return;

    container.innerHTML = ''; // replace content so it's always authoritative

    var card = document.createElement('div');
    card.className = 'card';

    var header = document.createElement('div');
    header.className = 'card-header';
    header.textContent = 'Nearby Buses';
    card.appendChild(header);

    var list = document.createElement('ul');
    list.className = 'list-group list-group-flush';
    list.style.maxHeight = '240px';
    list.style.overflow = 'auto';

    buses.forEach(function (bus) {
      var li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.setAttribute('data-bus-id', bus.id || '');

      var left = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = bus.name || 'Bus';
      var coords = document.createElement('div');
      coords.innerHTML = '<small>' + (typeof bus.lat === 'number' ? bus.lat.toFixed(5) : '') + ', ' + (typeof bus.lng === 'number' ? bus.lng.toFixed(5) : '') + '</small>';
      left.appendChild(name);
      left.appendChild(coords);

      var badge = document.createElement('span');
      badge.className = 'badge ' + (bus.status === 'full' ? 'bg-danger' : 'bg-success');
      badge.textContent = (bus.status === 'full' ? 'Full' : 'Available');

      li.appendChild(left);
      li.appendChild(badge);

      // clicking the list item focuses the marker if the app exposes a map API
      li.addEventListener('click', function () {
        try {
          if (window.ByaHero && typeof window.ByaHero.focusMarker === 'function') {
            window.ByaHero.focusMarker(bus.id);
            return;
          }
          if (window.ByaHero && typeof window.ByaHero.getMap === 'function') {
            var map = window.ByaHero.getMap();
            if (map && typeof map.setView === 'function') {
              map.setView([bus.lat, bus.lng], 16);
            }
          }
        } catch (e) { /* ignore */ }
      });

      list.appendChild(li);
    });

    card.appendChild(list);
    container.appendChild(card);
  }

  // Utility: update any existing sidebar / proto list with id #buses-list (older proto.html)
  function updateProtoBusesList(buses) {
    try {
      var listEl = document.getElementById('buses-list');
      if (!listEl) return;
      listEl.innerHTML = '';
      buses.forEach(function (bus) {
        var li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.setAttribute('data-bus-id', bus.id || '');
        li.innerHTML = '<div><strong>' + (bus.name || '') + '</strong><br/><small>' +
          (typeof bus.lat === 'number' ? bus.lat.toFixed(5) : '') + ', ' + (typeof bus.lng === 'number' ? bus.lng.toFixed(5) : '') +
          '</small></div>';
        var badge = document.createElement('span');
        badge.className = 'badge ' + (bus.status === 'full' ? 'bg-danger' : 'bg-success');
        badge.textContent = (bus.status === 'full' ? 'Full' : 'Available');
        li.appendChild(badge);
        li.style.cursor = 'pointer';
        li.addEventListener('click', function () {
          try {
            if (window.ByaHero && typeof window.ByaHero.focusMarker === 'function') {
              window.ByaHero.focusMarker(bus.id);
            } else if (window.ByaHero && typeof window.ByaHero.getMap === 'function') {
              var m = window.ByaHero.getMap();
              if (m && typeof m.setView === 'function') m.setView([bus.lat, bus.lng], 16);
            }
          } catch (e) { /* ignore */ }
        });
        listEl.appendChild(li);
      });
    } catch (e) { /* ignore */ }
  }

  // Update markers/popups/badges on the map when server gives updated bus info.
  function updateMapMarkersWithStatus(buses) {
    if (!Array.isArray(buses)) return;
    buses.forEach(function (bus) {
      try {
        var statusSuffix = bus.status ? ' — ' + (bus.status === 'full' ? 'Full' : 'Available') : '';
        var label = (bus.name || 'Bus') + statusSuffix;
        // If your map code exposes a function to update the badge/label text, call it.
        if (window.ByaHero && typeof window.ByaHero.upsertBadge === 'function') {
          // upsertBadge(id, label)
          window.ByaHero.upsertBadge(bus.id, label);
        } else if (window.ByaHero && typeof window.ByaHero.addOrUpdateMarker === 'function') {
          // addOrUpdateMarker may recreate the marker with the new label
          window.ByaHero.addOrUpdateMarker(bus.id, label, bus.lat, bus.lng);
        } else {
          // Last resort: try to find a textual popup on the page and update it by matching name
          try {
            var popups = document.querySelectorAll('.leaflet-popup-content');
            popups.forEach(function (p) {
              if (p.innerText && p.innerText.indexOf((bus.name || '').split(' ')[0]) !== -1) {
                // best-effort replace status words
                p.innerHTML = p.innerHTML.replace(/(Available|Full)/gi, (bus.status === 'full' ? 'Full' : 'Available'));
              }
            });
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    });
  }

  // Top-level handler for authoritative lists from server
  function handleBusesUpdated(payload) {
    var buses = (payload && Array.isArray(payload.buses)) ? payload.buses : [];
    // 1) Update the simple live-users card (guaranteed UI)
    renderLiveBusesCard(buses);

    // 2) Update older proto list if present (#buses-list)
    updateProtoBusesList(buses);

    // 3) Update markers/badges/popups
    updateMapMarkersWithStatus(buses);
  }

  // Attach listeners to the socket so any update from server triggers UI refresh
  function attachSocketHandlers(s) {
    if (!s || !s.on) return;
    s.on('buses-updated', function (payload) {
      try { handleBusesUpdated(payload); } catch (e) { /* ignore */ }
    });
    s.on('buses-list', function (payload) {
      try { handleBusesUpdated(payload); } catch (e) { /* ignore */ }
    });
    s.on('set-bus-status-ok', function () {
      // re-request authoritative list so everyone including this client applies the same representation
      try {
        if (s && s.emit) { s.emit('request-buses'); }
      } catch (e) { /* ignore */ }
    });
    // also update if receive-location delta arrives (server sends status there too)
    s.on('receive-location', function (data) {
      try {
        if (!data || !data.id) return;
        // update just this bus on the map/list
        var bus = {
          id: data.id,
          name: data.name,
          status: data.status || 'available',
          lat: data.lat,
          lng: data.lng
        };
        // update map marker + local lists
        updateMapMarkersWithStatus([bus]);
        // best-effort update the live-users card by requesting an authoritative list
        // (only if socket connected)
        setTimeout(function () {
          try { if (s && s.emit) s.emit('request-buses'); } catch (e) { }
        }, 200);
      } catch (e) { /* ignore */ }
    });
  }

  // Safe initialization: try to attach to discovered socket, else wait a bit for the app to create one.
  function init() {
    if (socket && socket.on) {
      attachSocketHandlers(socket);
      // request an initial authoritative list (non-destructive)
      try { socket.emit && socket.emit('request-buses'); } catch (e) { /* ignore */ }
      return;
    }
    // Try again a few times as app may create socket later
    var attempts = 0;
    var maxAttempts = 20;
    var iv = setInterval(function () {
      attempts++;
      // prefer known globals
      socket = window.socket || window.ioSocket || socket || (typeof io === 'function' ? (window.socket = io()) : null);
      if (socket && socket.on) {
        clearInterval(iv);
        attachSocketHandlers(socket);
        try { socket.emit && socket.emit('request-buses'); } catch (e) { /* ignore */ }
        return;
      }
      if (attempts >= maxAttempts) clearInterval(iv);
    }, 300);
  }

  // expose a manual updater for debugging
  window.ByaHeroStatusRenderer = {
    handleBusesUpdated: handleBusesUpdated,
    refresh: function () {
      try {
        if (socket && socket.emit) socket.emit('request-buses');
      } catch (e) { /* ignore */ }
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') init();
  else document.addEventListener('DOMContentLoaded', init);
})();