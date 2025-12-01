// public/js/bus.js - Bus role behavior with seat buttons that update badge + marker immediately
window.ByaHero = window.ByaHero || {};

(function(exports){
  const socket = exports.socket;
  let watchId = null;
  let following = true;
  let myName = null;
  let myRoute = null;
  let socketListenersAttached = false;
  let currentSeatStatus = null; // 'available' | 'full' | null
  let registeredAsBus = false;
  let lastKnownPosition = null;

  function attachSocketListeners() {
    if (!socket || socketListenersAttached) return;
    socketListenersAttached = true;

    socket.on('connect', () => {
      updateStatus('socket', 'connected');
    });
    socket.on('disconnect', () => {
      updateStatus('socket', 'disconnected');
      registeredAsBus = false;
    });

    socket.on('register-role-ok', (info) => {
      if (info && info.name) myName = info.name;
      if (info && info.route) myRoute = info.route;
      const display = `You: ${myName || 'Bus'}${myRoute ? ' ('+myRoute+')' : ''}${currentSeatStatus ? ' — ' + (currentSeatStatus === 'available' ? 'Available' : 'Full') : ''}`;
      exports.upsertBadge && exports.upsertBadge('me', display, currentSeatStatus || undefined);
      if (info && info.role === 'bus') {
        registeredAsBus = true;
        if (lastKnownPosition) socket.emit('send-location', lastKnownPosition);
        tryGetCurrentPositionOnce();
      }
    });

    socket.on('receive-location', (data) => {
      if (!data) return;
      const lat = typeof data.lat === 'number' ? data.lat : parseFloat(data.lat);
      const lng = typeof data.lng === 'number' ? data.lng : parseFloat(data.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      exports.addOrUpdateMarker && exports.addOrUpdateMarker(data.id, data.name, lat, lng);
    });

    socket.on('user-disconnected', (id) => {
      exports.removeMarker && exports.removeMarker(id);
    });
  }

  function ensureStatusEl() {
    const controls = document.getElementById('controls');
    if (!controls) return null;
    let el = controls.querySelector('.byahero-status');
    if (!el) {
      el = document.createElement('div');
      el.className = 'byahero-status';
      el.style.marginLeft = '12px';
      el.style.fontSize = '0.85rem';
      el.style.padding = '6px 8px';
      el.style.borderRadius = '6px';
      el.style.background = '#f8f9fa';
      el.style.border = '1px solid #e9ecef';
      controls.appendChild(el);
    }
    return el;
  }
  function updateStatus(key, text) {
    const el = ensureStatusEl();
    if (!el) return;
    el.dataset[key] = String(text);
    const parts = [];
    if (el.dataset.socket) parts.push(`Socket: ${el.dataset.socket}`);
    if (el.dataset.registered) parts.push(`Registered: ${el.dataset.registered}`);
    if (el.dataset.geo) parts.push(`Geo: ${el.dataset.geo}`);
    if (el.dataset.lastpos) parts.push(`Last: ${el.dataset.lastpos}`);
    el.textContent = parts.join(' · ');
  }

  function tryGetCurrentPositionOnce() {
    if (!('geolocation' in navigator)) {
      updateStatus('geo', 'unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      lastKnownPosition = { lat, lng, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed };
      updateStatus('geo', 'got-position');
      updateStatus('lastpos', `${lat.toFixed(5)},${lng.toFixed(5)}`);
      if (socket && registeredAsBus) socket.emit('send-location', lastKnownPosition);

      // update marker immediately with status embedded so map colors correctly
      const display = `You: ${myName || 'Bus'}${myRoute ? ' ('+myRoute+')' : ''}${currentSeatStatus ? ' — ' + (currentSeatStatus === 'available' ? 'Available' : 'Full') : ''}`;
      if (exports.addOrUpdateMarker) {
        exports.addOrUpdateMarker('me', display, lat, lng);
      } else if (window.ByaHero && typeof window.ByaHero.setSeatStatus === 'function') {
        window.ByaHero.setSeatStatus('me', currentSeatStatus || '');
      }
    }, (err) => {
      updateStatus('geo', 'error: ' + (err && err.message ? err.message : String(err)));
    }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 2000 });
  }

  function startGeolocationAndSend() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation not available in this browser/device.');
      updateStatus('geo', 'unsupported');
      return;
    }
    if (watchId != null) return;
    updateStatus('geo', 'watching...');
    watchId = navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      lastKnownPosition = { lat, lng, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed };
      updateStatus('lastpos', `${lat.toFixed(5)},${lng.toFixed(5)}`);

      const display = `You: ${myName || 'Bus'}${myRoute ? ' ('+myRoute+')' : ''}${currentSeatStatus ? ' — ' + (currentSeatStatus === 'available' ? 'Available' : 'Full') : ''}`;
      if (exports.addOrUpdateMarker) {
        exports.addOrUpdateMarker('me', display, lat, lng);
      } else if (window.ByaHero && typeof window.ByaHero.setSeatStatus === 'function') {
        window.ByaHero.setSeatStatus('me', currentSeatStatus || '');
      }

      if (following && exports.centerOn) exports.centerOn(lat, lng, 16);
      if (socket && registeredAsBus) socket.emit('send-location', lastKnownPosition);
    }, (err) => {
      updateStatus('geo', 'error: ' + (err && err.message ? err.message : String(err)));
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
  }

  function stopGeolocation() {
    if (watchId != null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      updateStatus('geo', 'stopped');
    }
  }

  exports.registerAndStart = function(options = {}) {
    const name = options.name && options.name.trim() ? options.name.trim() : undefined;
    const route = options.route && options.route.trim() ? options.route.trim() : undefined;
    if (!name) { alert('Please enter Bus name.'); return; }
    if (!route) { alert('Please select a route.'); return; }

    myName = name;
    myRoute = route;
    attachSocketListeners();

    try {
      sessionStorage.setItem('byahero_role', 'bus');
      sessionStorage.setItem('byahero_name', myName);
      sessionStorage.setItem('byahero_route', myRoute);
    } catch(e){}

    updateStatus('registered', 'pending');
    socket && socket.emit('register-role', { role: 'bus', name: myName, route: myRoute });

    if (registeredAsBus) startGeolocationAndSend();
    else {
      const onAck = (info) => { if (info && info.role === 'bus') { try { socket.off('register-role-ok', onAck); } catch(e){}; startGeolocationAndSend(); } };
      if (socket) socket.on('register-role-ok', onAck);
    }

    tryGetCurrentPositionOnce();
    const display = `You: ${myName} (${myRoute})${currentSeatStatus ? ' — ' + (currentSeatStatus === 'available' ? 'Available' : 'Full') : ''}`;
    exports.upsertBadge && exports.upsertBadge('me', display, currentSeatStatus || undefined);
  };

  exports.showBusModeControls = function () {
    attachSocketListeners();
    try {
      const savedName = sessionStorage.getItem('byahero_name');
      const savedRoute = sessionStorage.getItem('byahero_route');
      if (savedName) myName = savedName;
      if (savedRoute) myRoute = savedRoute;
      const savedStatus = sessionStorage.getItem('byahero_seat_status');
      if (savedStatus === 'available' || savedStatus === 'full') currentSeatStatus = savedStatus;
    } catch (e) {}

    const infoEl = document.getElementById('info');
    const modeTitle = document.getElementById('mode-title');
    const controls = document.getElementById('controls');
    if (!infoEl || !modeTitle || !controls) return;

    infoEl.style.display = '';
    modeTitle.textContent = 'Mode: Bus (sharing GPS)';
    controls.innerHTML = '';

    const label = document.createElement('div');
    label.style.marginBottom = '8px';
    label.innerHTML = `<strong>${myName ? `You: ${myName}` : 'You: Bus'}</strong> ${myRoute ? `<span style="opacity:.8">(${myRoute})</span>` : ''}`;
    controls.appendChild(label);

    const followBtn = document.createElement('button');
    followBtn.className = 'btn';
    function renderFollowText() {
      followBtn.textContent = following ? 'Following (ON)' : 'Following (OFF)';
      followBtn.classList.toggle('btn-success', following);
      followBtn.classList.toggle('btn-secondary', !following);
    }
    renderFollowText();
    followBtn.style.marginRight = '8px';
    followBtn.addEventListener('click', () => { following = !following; renderFollowText(); });
    controls.appendChild(followBtn);

    const availableBtn = document.createElement('button');
    availableBtn.textContent = 'Seats Available';
    availableBtn.className = 'btn';
    availableBtn.style.marginRight = '6px';
    const fullBtn = document.createElement('button');
    fullBtn.textContent = 'Bus Full';
    fullBtn.className = 'btn';

    function renderSeatButtons() {
      availableBtn.classList.remove('btn-success','btn-outline-secondary','btn-danger');
      fullBtn.classList.remove('btn-danger','btn-outline-secondary','btn-success');
      if (currentSeatStatus === 'available') {
        availableBtn.classList.add('btn-success');
        fullBtn.classList.add('btn-outline-secondary');
      } else if (currentSeatStatus === 'full') {
        availableBtn.classList.add('btn-outline-secondary');
        fullBtn.classList.add('btn-danger');
      } else {
        availableBtn.classList.add('btn-outline-secondary');
        fullBtn.classList.add('btn-outline-secondary');
      }
    }

    availableBtn.addEventListener('click', () => {
      currentSeatStatus = 'available';
      try { sessionStorage.setItem('byahero_seat_status', currentSeatStatus); } catch (e){}
      renderSeatButtons();
      if (socket && socket.connected) socket.emit('update-status', { status: currentSeatStatus });

      const display = `You: ${myName || 'Bus'}${myRoute ? ' ('+myRoute+')' : ''} — Available`;
      if (exports.upsertBadge) { try { exports.upsertBadge('me', display, 'available'); } catch(e){} }
      if (window.ByaHero && typeof window.ByaHero.setSeatStatus === 'function') { try { window.ByaHero.setSeatStatus('me', 'available'); } catch(e){} }

      if (lastKnownPosition && exports.addOrUpdateMarker) {
        try { exports.addOrUpdateMarker('me', display, lastKnownPosition.lat, lastKnownPosition.lng); } catch(e){}
      } else {
        tryGetCurrentPositionOnce();
      }
    });

    fullBtn.addEventListener('click', () => {
      currentSeatStatus = 'full';
      try { sessionStorage.setItem('byahero_seat_status', currentSeatStatus); } catch (e){}
      renderSeatButtons();
      if (socket && socket.connected) socket.emit('update-status', { status: currentSeatStatus });

      const display = `You: ${myName || 'Bus'}${myRoute ? ' ('+myRoute+')' : ''} — Full`;
      if (exports.upsertBadge) { try { exports.upsertBadge('me', display, 'full'); } catch(e){} }
      if (window.ByaHero && typeof window.ByaHero.setSeatStatus === 'function') { try { window.ByaHero.setSeatStatus('me', 'full'); } catch(e){} }

      if (lastKnownPosition && exports.addOrUpdateMarker) {
        try { exports.addOrUpdateMarker('me', display, lastKnownPosition.lat, lastKnownPosition.lng); } catch(e){}
      } else {
        tryGetCurrentPositionOnce();
      }
    });

    controls.appendChild(availableBtn);
    controls.appendChild(fullBtn);
    renderSeatButtons();

    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop Sharing';
    stopBtn.className = 'btn btn-outline-danger';
    stopBtn.style.marginLeft = '12px';
    stopBtn.addEventListener('click', () => {
      stopGeolocation();
      try {
        sessionStorage.removeItem('byahero_role');
        sessionStorage.removeItem('byahero_name');
        sessionStorage.removeItem('byahero_route');
      } catch (e) {}
      if (socket && socket.connected) socket.emit('unregister-role', { role: 'bus' });
      controls.innerHTML = '';
      modeTitle.textContent = '';
      exports.removeBadge && exports.removeBadge('me');
      setTimeout(() => location.reload(), 250);
    });
    controls.appendChild(stopBtn);

    updateStatus('socket', (socket && socket.connected) ? 'connected' : 'disconnected');
  };

  exports.initBus = function(){
    const infoEl = document.getElementById('info');
    const modeTitle = document.getElementById('mode-title');
    const controls = document.getElementById('controls');
    infoEl.style.display = '';
    modeTitle.textContent = 'Mode: Bus (sharing GPS)';
    controls.innerHTML = '';
    // minimal form omitted for brevity; existing code can stay
    attachSocketListeners();
  };

  exports.stopBus = function(){
    stopGeolocation();
  };

})(window.ByaHero);