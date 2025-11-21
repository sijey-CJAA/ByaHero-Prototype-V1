// public/js/bus.js - Bus role behavior: send GPS and keep map centered (follow)
window.ByaHero = window.ByaHero || {};

(function(exports){
  const socket = exports.socket;
  let watchId = null;
  let following = true;
  let myName = null;

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
        exports.addOrUpdateMarker('me', `You: ${myName || 'Bus'}`, lat, lng);
      }

      // center map if following
      if (following && exports.centerOn) {
        exports.centerOn(lat, lng, 16);
      }

      // send to server
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

  exports.initBus = function(){
    const infoEl = document.getElementById('info');
    const modeTitle = document.getElementById('mode-title');
    const controls = document.getElementById('controls');
    infoEl.style.display = '';
    modeTitle.textContent = 'Mode: Bus (sharing GPS)';
    controls.innerHTML = '';

    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Bus name (optional)';
    nameInput.style.padding = '6px';
    nameInput.style.marginRight = '8px';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Register';
    saveBtn.className = 'btn';
    saveBtn.style.marginRight = '8px';

    const followBtn = document.createElement('button');
    followBtn.textContent = 'Toggle follow (ON)';
    followBtn.className = 'btn secondary';

    controls.appendChild(nameInput);
    controls.appendChild(saveBtn);
    controls.appendChild(followBtn);

    // create map if not present
    exports.createMap && exports.createMap('map');

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value && nameInput.value.trim() ? nameInput.value.trim() : undefined;
      myName = name;
      // register role with server
      if (socket && socket.connected) {
        socket.emit('register-role', { role: 'bus', name });
      }
      // start sending location immediately (even before server ack) for snappy UX
      startGeolocationAndSend();
      exports.upsertBadge && exports.upsertBadge('me', `You: ${myName || 'Bus'}`);
    });

    followBtn.addEventListener('click', () => {
      following = !following;
      followBtn.textContent = following ? 'Toggle follow (ON)' : 'Toggle follow (OFF)';
    });

    // If server acknowledges, update name
    socket.on('register-role-ok', (info) => {
      if (info && info.name) {
        myName = info.name;
        exports.upsertBadge && exports.upsertBadge('me', `You: ${myName}`);
      }
    });

    // Show other buses' updates (customers and other buses)
    socket.on('receive-location', (data) => {
      if (!data) return;
      if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
      exports.addOrUpdateMarker && exports.addOrUpdateMarker(data.id, data.name, data.lat, data.lng);
    });

    socket.on('user-disconnected', (id) => {
      exports.removeMarker && exports.removeMarker(id);
    });
  };

  exports.stopBus = function(){
    stopGeolocation();
  };

})(window.ByaHero);