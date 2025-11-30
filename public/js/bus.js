// public/js/bus.js - Bus role behavior with extra mobile-friendly status + robust registration
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

  // attach basic socket listeners including register ack
  function attachSocketListeners() {
    if (!socket || socketListenersAttached) return;
    socketListenersAttached = true;

    socket.on('connect', () => {
      console.info('[bus] socket connected', socket.id);
      updateStatus('socket', 'connected');
    });
    socket.on('connect_error', (err) => {
      console.warn('[bus] socket connect_error', err);
      updateStatus('socket', 'error: ' + (err && err.message ? err.message : String(err)));
    });
    socket.on('disconnect', (reason) => {
      console.info('[bus] socket disconnected', reason);
      updateStatus('socket', 'disconnected');
      registeredAsBus = false;
    });

    socket.on('register-role-ok', (info) => {
      console.info('[bus] register-role-ok', info);
      if (info && info.name) myName = info.name;
      if (info && info.route) myRoute = info.route;
      exports.upsertBadge && exports.upsertBadge('me', `You: ${myName}${myRoute ? ' ('+myRoute+')' : ''}`);
      if (info && info.role === 'bus') {
        registeredAsBus = true;
        updateStatus('registered', 'ok');
        // If we have a last known position, send it now
        if (lastKnownPosition) {
          socket.emit('send-location', lastKnownPosition);
        }
        // Also request a fast one-time position to get a fresh fix
        tryGetCurrentPositionOnce();
      }
    });

    socket.on('register-role-failed', (msg) => {
      console.warn('[bus] register-role-failed', msg);
      updateStatus('registered', 'failed: ' + msg);
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

  // UI status helpers: shows small status element in #controls if present
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
    // simple multi-line status
    el.dataset[key] = String(text);
    const parts = [];
    if (el.dataset.socket) parts.push(`Socket: ${el.dataset.socket}`);
    if (el.dataset.registered) parts.push(`Registered: ${el.dataset.registered}`);
    if (el.dataset.geo) parts.push(`Geo: ${el.dataset.geo}`);
    if (el.dataset.lastpos) parts.push(`Last: ${el.dataset.lastpos}`);
    el.textContent = parts.join(' · ');
  }

  // Try to get an immediate single position to speed up first fix (useful on mobile)
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
      // If registered, send immediately
      if (socket && registeredAsBus) {
        socket.emit('send-location', lastKnownPosition);
      }
    }, (err) => {
      console.warn('[bus] getCurrentPosition error', err);
      updateStatus('geo', 'error: ' + err.message);
    }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 2000 });
  }

  function startGeolocationAndSend() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation not available in this browser/device.');
      updateStatus('geo', 'unsupported');
      return;
    }
    if (watchId != null) return; // already watching

    updateStatus('geo', 'watching...');
    watchId = navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      lastKnownPosition = { lat, lng, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed };
      updateStatus('lastpos', `${lat.toFixed(5)},${lng.toFixed(5)}`);
      // Update local marker
      if (exports.addOrUpdateMarker) {
        exports.addOrUpdateMarker('me', `You: ${myName || 'Bus'}${myRoute ? ' ('+myRoute+')' : ''}`, lat, lng);
      }
      if (following && exports.centerOn) {
        exports.centerOn(lat, lng, 16);
      }
      // If registered, send; otherwise buffer
      if (socket && registeredAsBus) {
        socket.emit('send-location', lastKnownPosition);
      } else {
        // Will be sent on register-role-ok handler
      }
    }, (err) => {
      console.warn('[bus] watchPosition error', err);
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

  // register and start bus (ensures ack before sending continuous positions)
  exports.registerAndStart = function(options = {}) {
    const name = options.name && options.name.trim() ? options.name.trim() : undefined;
    const route = options.route && options.route.trim() ? options.route.trim() : undefined;

    if (!name) {
      alert('Please enter Bus name.');
      return;
    }
    if (!route) {
      alert('Please select a route.');
      return;
    }

    myName = name;
    myRoute = route;

    attachSocketListeners();

    try {
      sessionStorage.setItem('byahero_role', 'bus');
      sessionStorage.setItem('byahero_name', myName);
      sessionStorage.setItem('byahero_route', myRoute);
    } catch (e) {}

    updateStatus('registered', 'pending');
    // emit register (socket.io buffers emits while connecting)
    socket && socket.emit('register-role', { role: 'bus', name: myName, route: myRoute });

    // start watch only after ack; if already acked start now
    if (registeredAsBus) {
      startGeolocationAndSend();
    } else {
      const onAck = (info) => {
        if (info && info.role === 'bus') {
          try { socket.off('register-role-ok', onAck); } catch(e){}
          startGeolocationAndSend();
        }
      };
      if (socket) socket.on('register-role-ok', onAck);
    }

    // Also request an immediate single position to bootstrap first fix
    tryGetCurrentPositionOnce();

    exports.upsertBadge && exports.upsertBadge('me', `You: ${myName} (${myRoute})`);
  };

  // compact bus UI controls
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

    // follow btn
    const followBtn = document.createElement('button');
    followBtn.className = 'btn';
    function renderFollowText() {
      followBtn.textContent = following ? 'Following (ON)' : 'Following (OFF)';
      followBtn.classList.toggle('btn-success', following);
      followBtn.classList.toggle('btn-secondary', !following);
    }
    renderFollowText();
    followBtn.style.marginRight = '8px';
    followBtn.addEventListener('click', () => {
      following = !following;
      renderFollowText();
    });
    controls.appendChild(followBtn);

    // seat status
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
      exports.upsertBadge && exports.upsertBadge('me', `You: ${myName || 'Bus'} (${myRoute || ''}) — Available`);
    });

    fullBtn.addEventListener('click', () => {
      currentSeatStatus = 'full';
      try { sessionStorage.setItem('byahero_seat_status', currentSeatStatus); } catch (e){}
      renderSeatButtons();
      if (socket && socket.connected) socket.emit('update-status', { status: currentSeatStatus });
      exports.upsertBadge && exports.upsertBadge('me', `You: ${myName || 'Bus'} (${myRoute || ''}) — Full`);
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

    // ensure we show status element
    updateStatus('socket', (socket && socket.connected) ? 'connected' : 'disconnected');
    updateStatus('registered', registeredAsBus ? 'ok' : 'no');
  };

  // Backwards-compatible initBus (small form UI)
  exports.initBus = function(){
    const infoEl = document.getElementById('info');
    const modeTitle = document.getElementById('mode-title');
    const controls = document.getElementById('controls');
    infoEl.style.display = '';
    modeTitle.textContent = 'Mode: Bus (sharing GPS)';
    controls.innerHTML = '';

    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Bus name (required)';
    nameInput.required = true;
    nameInput.style.padding = '6px';
    nameInput.style.marginRight = '8px';

    const routeSelect = document.createElement('select');
    routeSelect.style.padding = '6px';
    routeSelect.style.marginRight = '8px';
    routeSelect.required = true;
    routeSelect.className = 'form-select';
    routeSelect.style.width = '220px';

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Select route...';
    emptyOpt.disabled = true;
    emptyOpt.selected = true;
    routeSelect.appendChild(emptyOpt);

    const opt1 = document.createElement('option');
    opt1.value = 'LAUREL - TANAUAN';
    opt1.textContent = 'LAUREL - TANAUAN';
    routeSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = 'TANAUAN - LAUREL';
    opt2.textContent = 'TANAUAN - LAUREL';
    routeSelect.appendChild(opt2);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Register';
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.marginRight = '8px';

    const followBtn = document.createElement('button');
    followBtn.textContent = 'Toggle follow (ON)';
    followBtn.className = 'btn btn-secondary';

    controls.appendChild(nameInput);
    controls.appendChild(routeSelect);
    controls.appendChild(saveBtn);
    controls.appendChild(followBtn);

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value && nameInput.value.trim() ? nameInput.value.trim() : undefined;
      const route = routeSelect.value && routeSelect.value.trim() ? routeSelect.value.trim() : undefined;

      if (!name) {
        alert('Please enter Bus name.');
        nameInput.focus();
        return;
      }
      if (!route) {
        alert('Please select a route.');
        routeSelect.focus();
        return;
      }

      exports.registerAndStart({ name, route });
      setTimeout(() => { exports.showBusModeControls(); }, 300);
    });

    followBtn.addEventListener('click', () => {
      following = !following;
      followBtn.textContent = following ? 'Toggle follow (ON)' : 'Toggle follow (OFF)';
    });

    attachSocketListeners();
  };

  exports.stopBus = function(){
    stopGeolocation();
  };

})(window.ByaHero);