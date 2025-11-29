// public/js/center-picker.js
// Simple UI to pick a center point on the map by clicking or dragging a marker.
// Usage: window.ByaHero.initCenterPicker(map, options)
// Fires a custom DOM event 'center:selected' on document when user confirms:
//   document.addEventListener('center:selected', (e) => console.log(e.detail)); // { lat, lng }

(function () {
  window.ByaHero = window.ByaHero || {};

  const DEFAULT_ID = 'byahero-center-picker-control';

  // create control DOM only once
  function createControl() {
    if (document.getElementById(DEFAULT_ID)) return document.getElementById(DEFAULT_ID);

    const container = document.createElement('div');
    container.id = DEFAULT_ID;
    container.style.position = 'absolute';
    container.style.top = '12px';
    container.style.right = '12px';
    container.style.zIndex = 1000;
    container.style.background = 'rgba(0,0,0,0.75)';
    container.style.color = '#fff';
    container.style.padding = '8px';
    container.style.borderRadius = '6px';
    container.style.fontFamily = 'system-ui,Segoe UI,Roboto,Arial';
    container.style.fontSize = '13px';
    container.style.minWidth = '220px';
    container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <strong style="font-size:14px">Center Picker</strong>
        <button id="${DEFAULT_ID}-reset" title="Reset" style="background:transparent;border:0;color:#fff;cursor:pointer">✕</button>
      </div>
      <div style="margin-top:8px;">
        <div style="color:#ddd">Selected:</div>
        <div id="${DEFAULT_ID}-coords" style="margin-top:4px;color:#fff;font-weight:600">none</div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button id="${DEFAULT_ID}-copy" class="btn-copy" style="flex:1;padding:6px;border-radius:4px;border:0;background:#0d6efd;color:#fff;cursor:pointer">Copy</button>
          <button id="${DEFAULT_ID}-confirm" class="btn-confirm" style="flex:1;padding:6px;border-radius:4px;border:0;background:#198754;color:#fff;cursor:pointer">Confirm</button>
        </div>
      </div>
      <div id="${DEFAULT_ID}-hint" style="margin-top:8px;color:#bbb;font-size:12px">Click the map to place a marker, drag to refine.</div>
    `;
    document.body.appendChild(container);

    // small style adjustments for buttons when hovered
    container.querySelectorAll('button').forEach(b => {
      b.addEventListener('mouseover', () => b.style.opacity = 0.9);
      b.addEventListener('mouseout', () => b.style.opacity = 1.0);
    });

    return container;
  }

  // utility to format coords
  function fmt(lat, lng) {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  // Main initializer
  window.ByaHero.initCenterPicker = function (map, options = {}) {
    if (!map) {
      // try to get map if not provided
      map = (window.ByaHero && window.ByaHero.getMap) ? window.ByaHero.getMap() : null;
      if (!map) {
        console.warn('ByaHero.initCenterPicker: no Leaflet map provided or available via window.ByaHero.getMap().');
        return;
      }
    }

    // state
    let marker = null;
    let selected = null;

    const ctrl = createControl();
    const coordsEl = document.getElementById(`${DEFAULT_ID}-coords`);
    const copyBtn = document.getElementById(`${DEFAULT_ID}-copy`);
    const confirmBtn = document.getElementById(`${DEFAULT_ID}-confirm`);
    const resetBtn = document.getElementById(`${DEFAULT_ID}-reset`);

    function updateDisplay(lat, lng) {
      selected = { lat: +lat, lng: +lng };
      coordsEl.textContent = fmt(selected.lat, selected.lng);
    }

    function clearSelection() {
      if (marker) {
        marker.remove();
        marker = null;
      }
      selected = null;
      coordsEl.textContent = 'none';
    }

    // place or move marker (draggable)
    function placeMarker(lat, lng) {
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        // on drag end update selection
        marker.on('dragend', function (ev) {
          const p = ev.target.getLatLng();
          updateDisplay(p.lat, p.lng);
        });
      }
      updateDisplay(lat, lng);
      // ensure marker visible in view
      map.panTo([lat, lng], { animate: true });
    }

    // map click handler
    function onMapClick(e) {
      const { lat, lng } = e.latlng;
      // if options.bounds provided, optionally ignore clicks outside
      if (options.bounds && !options.bounds.contains(e.latlng)) {
        // optionally flash a message or ignore
        return;
      }
      placeMarker(lat, lng);
    }

    // allow programmatic setting
    window.ByaHero.setPickerMarker = function (lat, lng) {
      placeMarker(lat, lng);
    };

    window.ByaHero.getPickerSelection = function () {
      return selected;
    };

    // copy to clipboard
    copyBtn.addEventListener('click', async function () {
      if (!selected) return;
      const text = `${selected.lat},${selected.lng}`;
      try {
        await navigator.clipboard.writeText(text);
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = prev, 1500);
      } catch (err) {
        // fallback: select text via prompt
        window.prompt('Copy coordinates', text);
      }
    });

    // confirm: dispatch event with coords detail
    confirmBtn.addEventListener('click', function () {
      if (!selected) return;
      const detail = { lat: selected.lat, lng: selected.lng };
      const ev = new CustomEvent('center:selected', { detail });
      document.dispatchEvent(ev);
      // visual feedback
      const prev = confirmBtn.textContent;
      confirmBtn.textContent = 'Selected';
      setTimeout(() => confirmBtn.textContent = prev, 1500);
    });

    resetBtn.addEventListener('click', function () {
      clearSelection();
    });

    // click on map to place marker
    map.on('click', onMapClick);

    // cleanup method (optional)
    window.ByaHero.destroyCenterPicker = function () {
      map.off('click', onMapClick);
      clearSelection();
      const el = document.getElementById(DEFAULT_ID);
      if (el) el.remove();
      delete window.ByaHero.setPickerMarker;
      delete window.ByaHero.getPickerSelection;
      delete window.ByaHero.destroyCenterPicker;
    };

    // If options.initial is provided set initial marker
    if (options.initial && typeof options.initial.lat === 'number' && typeof options.initial.lng === 'number') {
      placeMarker(options.initial.lat, options.initial.lng);
    }

    return {
      getSelection: () => selected,
      setMarker: (lat, lng) => placeMarker(lat, lng),
      clear: clearSelection
    };
  };

})();



// code for index.html

//script

// <script>
//     (async function () {
//       try {
//         const r = await fetch('/info');
//         if (!r.ok) throw new Error('no info');
//         const info = await r.json();
//         const el = document.getElementById('lan-url');
//         if (info && info.url) el.textContent = info.url;
//         else el.textContent = 'Open http://localhost:3000 on this machine.';
//       } catch (e) {
//         document.getElementById('lan-url').textContent = `CAN'T DETECT LAN URL`;
//       }
//     })();

//     // Picker wiring: wait for map, enable toggle button, handle selection.
//     (function () {
//       const btn = document.getElementById('pick-center-btn');
//       let pickerActive = false;
//       let initAttempt = 0;
//       const MAX_ATTEMPTS = 60; // approx 30s if using 500ms interval

//       function waitForMapAndInit() {
//         const map = (window.ByaHero && typeof window.ByaHero.getMap === 'function') ? window.ByaHero.getMap() : null;
//         if (map) {
//           // enable button and attach handler
//           btn.disabled = false;
//           btn.classList.remove('opacity-50');
//           btn.addEventListener('click', function () {
//             if (!pickerActive) {
//               // start picker
//               try {
//                 window.ByaHero.initCenterPicker(map, { bounds: map.getMaxBounds ? map.getMaxBounds() : null, initial: null });
//                 pickerActive = true;
//                 btn.textContent = 'Stop Picking';
//                 btn.classList.remove('btn-warning');
//                 btn.classList.add('btn-danger');
//               } catch (err) {
//                 console.error('Failed to start center picker', err);
//                 alert('Failed to start picker. See console.');
//               }
//             } else {
//               // stop picker
//               if (window.ByaHero && typeof window.ByaHero.destroyCenterPicker === 'function') {
//                 window.ByaHero.destroyCenterPicker();
//               }
//               pickerActive = false;
//               btn.textContent = 'Pick Center';
//               btn.classList.remove('btn-danger');
//               btn.classList.add('btn-warning');
//             }
//           });

//           // Listen for confirmed selection
//           document.addEventListener('center:selected', function (e) {
//             const d = e.detail || {};
//             const lat = d.lat && Number(d.lat);
//             const lng = d.lng && Number(d.lng);
//             if (typeof lat === 'number' && typeof lng === 'number') {
//               console.log('Center selected:', lat, lng);
//               // Show coords in the LAN URL box for easy copy/paste
//               const el = document.getElementById('lan-url');
//               el.textContent = `Selected center: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
//               // After selection, auto-stop picker
//               if (window.ByaHero && typeof window.ByaHero.destroyCenterPicker === 'function') {
//                 window.ByaHero.destroyCenterPicker();
//               }
//               pickerActive = false;
//               btn.textContent = 'Pick Center';
//               btn.classList.remove('btn-danger');
//               btn.classList.add('btn-warning');
//             }
//           });

//           return;
//         }

//         initAttempt++;
//         if (initAttempt > MAX_ATTEMPTS) {
//           // give up enabling picker for now
//           console.warn('pick-center: map not available after waiting, picker will remain disabled.');
//           btn.disabled = true;
//           btn.title = 'Map not ready - try reloading the page';
//           return;
//         }
//         setTimeout(waitForMapAndInit, 500);
//       }

//       // initially disabled until map ready
//       btn.disabled = true;
//       btn.classList.add('opacity-50');
//       waitForMapAndInit();
//     })();
//   </script>