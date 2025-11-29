// public/js/bus.js - Bus role behavior: send GPS, keep map centered, and show bus-mode controls
// Added: showBusModeControls() renders an in-place bus mode UI (toggle follow + seat status).
window.ByaHero = window.ByaHero || {};

(function(exports){
  const socket = exports.socket;
  let watchId = null;
  let following = true;
  let myName = null;
  let myRoute = null;
  let socketListenersAttached = false;
  let currentSeatStatus = null; // 'available' | 'full' | null

  function attachSocketListeners() {
    if (!socket || socketListenersAttached) return;
    socketListenersAttached = true;

    socket.on('register-role-ok', (info) => {
      if (info && info.name) myName = info.name;
      if (info && info.route) myRoute = info.route;
      exports.upsertBadge && exports.upsertBadge('me', `You: ${myName}${myRoute ? ' ('+myRoute+')' : ''}`);
    });

    socket.on('receive-location', (data) => {
      if (!data) return;
      if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
      exports.addOrUpdateMarker && exports.addOrUpdateMarker(data.id, data.name, data.lat, data.lng);
    });

    socket.on('user-disconnected', (id) => {
      exports.removeMarker && exports.removeMarker(id);
    });
  }

  function startGeolocationAndSend() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation not available in this browser/device.');
      return;
    }
    if (watchId != null) return; // already watching

    watchId = navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const payload = { lat, lng, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed };

      // Update local marker for snappier UX
      if (exports.addOrUpdateMarker) {
        exports.addOrUpdateMarker('me', `You: ${myName || 'Bus'}${myRoute ? ' ('+myRoute+')' : ''}`, lat, lng);
      }

      // center map if following
      if (following && exports.centerOn) {
        exports.centerOn(lat, lng, 16);
      }

      // send to server, include route if available
      if (socket && socket.connected) {
        socket.emit('send-location', payload);
      }
    }, (err) => {
      console.warn('Geolocation error (bus):', err);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 });
  }

  function stopGeolocation() {
    if (watchId != null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  // New: register and start without showing UI
  // options: { name: string, route: string }
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

    // Persist role so reloads treat this client as a bus
    try {
      sessionStorage.setItem('byahero_role', 'bus');
      sessionStorage.setItem('byahero_name', myName);
      sessionStorage.setItem('byahero_route', myRoute);
    } catch (e) { /* ignore storage errors */ }

    // Send registration to server
    if (socket && socket.connected) {
      socket.emit('register-role', { role: 'bus', name: myName, route: myRoute });
    }

    // Start location sharing immediately
    startGeolocationAndSend();

    // Update UI badge if available
    exports.upsertBadge && exports.upsertBadge('me', `You: ${myName} (${myRoute})`);
  };

  // Show compact bus-mode UI in #info area: toggles follow + seat status
  exports.showBusModeControls = function () {
    attachSocketListeners();

    // restore persisted values
    try {
      const savedName = sessionStorage.getItem('byahero_name');
      const savedRoute = sessionStorage.getItem('byahero_route');
      if (savedName) myName = savedName;
      if (savedRoute) myRoute = savedRoute;
      const savedStatus = sessionStorage.getItem('byahero_seat_status');
      if (savedStatus === 'available' || savedStatus === 'full') currentSeatStatus = savedStatus;
    } catch (e) { /* ignore */ }

    const infoEl = document.getElementById('info');
    const modeTitle = document.getElementById('mode-title');
    const controls = document.getElementById('controls');
    if (!infoEl || !modeTitle || !controls) return;

    infoEl.style.display = '';
    modeTitle.textContent = 'Mode: Bus (sharing GPS)';

    // Build UI
    controls.innerHTML = '';

    // display name/route
    const label = document.createElement('div');
    label.style.marginBottom = '8px';
    label.innerHTML = `<strong>${myName ? `You: ${myName}` : 'You: Bus'}</strong> ${myRoute ? `<span style="opacity:.8">(${myRoute})</span>` : ''}`;
    controls.appendChild(label);

    // Follow toggle
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

    // Seat status group
    const seatsGroup = document.createElement('div');
    seatsGroup.style.display = 'inline-block';
    seatsGroup.style.marginLeft = '8px';

    const availableBtn = document.createElement('button');
    availableBtn.textContent = 'Seats Available';
    availableBtn.className = 'btn';
    availableBtn.style.marginRight = '6px';

    const fullBtn = document.createElement('button');
    fullBtn.textContent = 'Bus Full';
    fullBtn.className = 'btn';

    function renderSeatButtons() {
      // reset classes
      availableBtn.classList.remove('btn-success','btn-outline-secondary','btn-danger');
      fullBtn.classList.remove('btn-danger','btn-outline-secondary','btn-success');

      if (currentSeatStatus === 'available') {
        availableBtn.classList.add('btn-success');
        fullBtn.classList.add('btn-outline-secondary');
      } else if (currentSeatStatus === 'full') {
        availableBtn.classList.add('btn-outline-secondary');
        fullBtn.classList.add('btn-danger');
      } else {
        // unknown
        availableBtn.classList.add('btn-outline-secondary');
        fullBtn.classList.add('btn-outline-secondary');
      }
    }

    availableBtn.addEventListener('click', () => {
      currentSeatStatus = 'available';
      try { sessionStorage.setItem('byahero_seat_status', currentSeatStatus); } catch (e){}
      renderSeatButtons();
      // emit status update to server
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

    seatsGroup.appendChild(availableBtn);
    seatsGroup.appendChild(fullBtn);
    controls.appendChild(seatsGroup);

    renderSeatButtons();

    // Optional small "Stop sharing" button to allow bus to stop geolocation and unregister client-side
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop Sharing';
    stopBtn.className = 'btn btn-outline-danger';
    stopBtn.style.marginLeft = '12px';
    stopBtn.addEventListener('click', () => {
      // stop geolocation locally and clear persisted role
      stopGeolocation();
      try {
        sessionStorage.removeItem('byahero_role');
        sessionStorage.removeItem('byahero_name');
        sessionStorage.removeItem('byahero_route');
      } catch (e) {}
      // notify server (best-effort)
      if (socket && socket.connected) socket.emit('unregister-role', { role: 'bus' });
      // update UI
      controls.innerHTML = '';
      modeTitle.textContent = '';
      exports.removeBadge && exports.removeBadge('me');
      // reload to clear bus mode behavior (optional)
      setTimeout(() => location.reload(), 250);
    });
    controls.appendChild(stopBtn);
  };

  // Backwards-compatible initBus (keeps existing in-page UI option) — still available
  exports.initBus = function(){
    // Reuse showBusModeControls for the in-page bus UI (it also contains Save & Register logic below)
    // If you want the original "form" style (inputs + save btn) keep the original code.
    // For clarity, we render a small form to register and start:
    const infoEl = document.getElementById('info');
    const modeTitle = document.getElementById('mode-title');
    const controls = document.getElementById('controls');
    infoEl.style.display = '';
    modeTitle.textContent = 'Mode: Bus (sharing GPS)';
    controls.innerHTML = '';

    // Name input
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Bus name (required)';
    nameInput.required = true;
    nameInput.style.padding = '6px';
    nameInput.style.marginRight = '8px';

    // Route select (required) - only two options
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

    // Save & Register button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Register';
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.marginRight = '8px';

    const followBtn = document.createElement('button');
    followBtn.textContent = 'Toggle follow (ON)';
    followBtn.className = 'btn btn-secondary';

    // Assemble controls
    controls.appendChild(nameInput);
    controls.appendChild(routeSelect);
    controls.appendChild(saveBtn);
    controls.appendChild(followBtn);

    // create map if not present
    exports.createMap && exports.createMap('map');

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value && nameInput.value.trim() ? nameInput.value.trim() : undefined;
      const route = routeSelect.value && routeSelect.value.trim() ? routeSelect.value.trim() : undefined;

      // Validate required fields
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

      // Use registerAndStart so modal and in-page both use same logic
      exports.registerAndStart({ name, route });

      // After registering, render the bus-mode compact controls
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