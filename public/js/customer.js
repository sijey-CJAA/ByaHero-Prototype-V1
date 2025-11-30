// public/js/customer.js - Customer role behavior: view buses and find nearest
window.ByaHero = window.ByaHero || {};

(function(exports){
  const socket = exports.socket;

  exports.initCustomer = function(){
    const infoEl = document.getElementById('info');
    const modeTitle = document.getElementById('mode-title');
    const controls = document.getElementById('controls');
    infoEl.style.display = '';
    modeTitle.textContent = 'Mode: Customer (view buses)';
    controls.innerHTML = '';

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh buses';
    refreshBtn.className = 'btn';
    refreshBtn.style.marginRight = '8px';

    const nearestBtn = document.createElement('button');
    nearestBtn.textContent = 'Find nearest bus';
    nearestBtn.className = 'btn secondary';

    controls.appendChild(refreshBtn);
    controls.appendChild(nearestBtn);

    // ensure map exists
    exports.createMap && exports.createMap('map');

    // Register as customer once connected (or immediately; socket.io buffers emits)
    // use a flag to avoid duplicate registration attempts
    let registeredAsCustomer = false;
    function registerCustomer() {
      if (!socket) return;
      if (registeredAsCustomer) return;
      socket.emit('register-role', { role: 'customer' });
      // do not flip flag here; wait for server ack to confirm registration
    }

    // If socket exists, attempt to register now (socket.io will buffer emit if not connected)
    registerCustomer();

    // Also register on connect event to ensure registration when connection is established
    if (socket) {
      socket.on('connect', () => {
        registerCustomer();
      });
    }

    socket.on('register-role-ok', (info) => {
      if (info && info.role === 'customer') {
        registeredAsCustomer = true;
        exports.upsertBadge && exports.upsertBadge('me', `You: Customer`);
      }
    });

    socket.on('register-role-failed', (msg) => {
      console.warn('register-role-failed', msg);
    });

    // Listen for buses updates over socket
    socket.on('receive-location', (data) => {
      if (!data) return;
      // accept numeric or numeric-like coordinates
      const lat = typeof data.lat === 'number' ? data.lat : parseFloat(data.lat);
      const lng = typeof data.lng === 'number' ? data.lng : parseFloat(data.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      exports.addOrUpdateMarker && exports.addOrUpdateMarker(data.id, data.name, lat, lng);
    });

    socket.on('buses-updated', (payload) => {
      // payload: { buses: [...] } where each bus might have { id, name, lastLocation:{lat,lng} } OR { id, name, lat, lng }
      if (!payload || !Array.isArray(payload.buses)) return;
      const buses = payload.buses;
      buses.forEach(b => {
        let lat = null, lng = null;
        if (b.lastLocation) {
          lat = typeof b.lastLocation.lat === 'number' ? b.lastLocation.lat : parseFloat(b.lastLocation.lat);
          lng = typeof b.lastLocation.lng === 'number' ? b.lastLocation.lng : parseFloat(b.lastLocation.lng);
        } else if (typeof b.lat === 'number' && typeof b.lng === 'number') {
          lat = b.lat; lng = b.lng;
        } else if (b.lat != null && b.lng != null) {
          lat = parseFloat(b.lat); lng = parseFloat(b.lng);
        }
        if (isFinite(lat) && isFinite(lng)) {
          exports.addOrUpdateMarker && exports.addOrUpdateMarker(b.id, b.name, lat, lng);
        }
      });
    });

    socket.on('user-disconnected', (id) => {
      exports.removeMarker && exports.removeMarker(id);
      exports.removeBadge && exports.removeBadge(id);
    });

    // Refresh by requesting /buses endpoint
    refreshBtn.addEventListener('click', async () => {
      try {
        const r = await fetch('/buses');
        if (!r.ok) throw new Error('fetch failed');
        const j = await r.json();
        if (Array.isArray(j.buses)) {
          j.buses.forEach(b => {
            // support both shapes: b.lastLocation or top-level b.lat/b.lng
            let lat = null, lng = null;
            if (b.lastLocation) {
              lat = typeof b.lastLocation.lat === 'number' ? b.lastLocation.lat : parseFloat(b.lastLocation.lat);
              lng = typeof b.lastLocation.lng === 'number' ? b.lastLocation.lng : parseFloat(b.lastLocation.lng);
            } else if (typeof b.lat === 'number' && typeof b.lng === 'number') {
              lat = b.lat; lng = b.lng;
            } else if (b.lat != null && b.lng != null) {
              lat = parseFloat(b.lat); lng = parseFloat(b.lng);
            }
            if (isFinite(lat) && isFinite(lng)) {
              exports.addOrUpdateMarker && exports.addOrUpdateMarker(b.id, b.name, lat, lng);
            }
          });
        }
      } catch (e) {
        console.warn('Failed to fetch /buses', e);
        alert('Failed to fetch /buses. See console.');
      }
    });

    // Find nearest bus
    nearestBtn.addEventListener('click', () => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition((pos) => {
          doFindNearest(pos.coords.latitude, pos.coords.longitude);
        }, (err) => {
          console.warn('Geolocation denied or error; using map center', err);
          const map = exports.getMap && exports.getMap();
          if (!map) return alert('No map available');
          const c = map.getCenter();
          doFindNearest(c.lat, c.lng);
        }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 });
      } else {
        const map = exports.getMap && exports.getMap();
        if (!map) return alert('No map available');
        const c = map.getCenter();
        doFindNearest(c.lat, c.lng);
      }
    });

    function doFindNearest(lat, lng) {
      const snap = exports.getMarkersSnapshot ? exports.getMarkersSnapshot() : [];
      const buses = snap.filter(s => s.id && s.id !== 'me');
      if (!buses.length) {
        alert('No buses known yet. Try Refresh buses.');
        return;
      }
      let best = null;
      for (const b of buses) {
        const d = exports.distanceMeters(lat, lng, b.lat, b.lng);
        if (best == null || d < best.d) best = { bus: b, d };
      }
      if (best) {
        exports.centerOn(best.bus.lat, best.bus.lng, 16);
        alert(`Nearest bus: ${best.bus.name}\nDistance: ${(best.d/1000).toFixed(2)} km`);
      }
    }

    // initial fetch
    refreshBtn.click();
  };

})(window.ByaHero);