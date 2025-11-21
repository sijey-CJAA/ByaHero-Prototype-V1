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

    // register as customer
    if (socket && socket.connected) {
      socket.emit('register-role', { role: 'customer' });
    }

    socket.on('register-role-ok', (info) => {
      exports.upsertBadge && exports.upsertBadge('me', `You: Customer`);
    });

    // Listen for buses updates over socket
    socket.on('receive-location', (data) => {
      if (!data) return;
      if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
      exports.addOrUpdateMarker && exports.addOrUpdateMarker(data.id, data.name, data.lat, data.lng);
    });

    socket.on('user-disconnected', (id) => {
      exports.removeMarker && exports.removeMarker(id);
    });

    // Refresh by requesting /buses endpoint
    refreshBtn.addEventListener('click', async () => {
      try {
        const r = await fetch('/buses');
        if (!r.ok) throw new Error('fetch failed');
        const j = await r.json();
        if (Array.isArray(j.buses)) {
          j.buses.forEach(b => {
            if (b.lastLocation) {
              exports.addOrUpdateMarker && exports.addOrUpdateMarker(b.id, b.name, b.lastLocation.lat, b.lastLocation.lng);
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