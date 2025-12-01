// public/js/map.js - map creation, marker management and unified badge handling
// Updated: robust status detection + setSeatStatus/recolorMarker helpers.
window.ByaHero = window.ByaHero || {};

(function(exports){
  let map = null;
  const markers = {}; // id -> { marker, lastSeen }

  const DEFAULT_CENTER = [14.091652, 121.021957];
  const DEFAULT_ZOOM = 13;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 30;

  const STATUS_META = {
    available: { color: '#27ae60', className: 'status-available' }, // green
    full:      { color: '#e74c3c', className: 'status-full' },      // red
    following: { color: '#2c3e50', className: 'status-following' }, // dark
    default:   { color: '#2b8cbe', className: 'status-default' }    // blue
  };

  exports.createMap = function(elementId, options = {}){
    if (map) return map;

    const center = options.center || DEFAULT_CENTER;
    const minZoom = options.minZoom || MIN_ZOOM;
    const maxZoom = options.maxZoom || MAX_ZOOM;
    const zoom = options.defaultZoom || DEFAULT_ZOOM;

    map = L.map(elementId, {
      center,
      zoom,
      minZoom,
      maxZoom,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    return map;
  };

  function normalizeStatusFromString(s) {
    if (!s || typeof s !== 'string') return 'default';
    const t = s.toLowerCase();
    if (/\bavailable\b/.test(t)) return 'available';
    if (/\bfull\b/.test(t)) return 'full';
    if (/\bfollowing\b/.test(t)) return 'following';
    return 'default';
  }

  function colorFromStatus(status) {
    return (STATUS_META[status] && STATUS_META[status].color) || STATUS_META.default.color;
  }

  // Try to derive status from the name label or from a badge DOM element if present
  function deriveStatus(id, name) {
    const s = normalizeStatusFromString(name || '');
    if (s !== 'default') return s;
    try {
      if (id) {
        const badge = document.querySelector(`[data-user="${id}"]`);
        if (badge) {
          if (badge.classList.contains('status-available')) return 'available';
          if (badge.classList.contains('status-full')) return 'full';
          if (badge.classList.contains('status-following')) return 'following';
        }
      }
    } catch(e){}
    return 'default';
  }

  // keep icon label short to avoid wrapping
  function makeIcon(label, color) {
    const safe = (label && String(label).length > 20) ? String(label).slice(0,20).trim() + '…' : (label || '');
    const html = `<div style="background:${color};padding:6px 10px;border-radius:6px;color:white;font-weight:700;white-space:nowrap;">${safe}</div>`;
    return L.divIcon({ className: 'bus-icon', html, iconSize: ['auto','auto'] });
  }

  function recolorMarker(id, name) {
    const entry = markers[id];
    if (!entry || !entry.marker) return;
    const status = deriveStatus(id, name || (entry.marker.getPopup() && entry.marker.getPopup().getContent()) || '');
    const color = colorFromStatus(status);

    // choose a short label for the icon: prefer short name or id
    let label = name;
    if (!label && entry.marker.getPopup()) {
      try {
        label = entry.marker.getPopup().getContent().split('<br/>')[0].replace(/<\/?strong>/g,'');
      } catch(e){}
    }
    label = (label && label.length > 0) ? label : id;

    const icon = makeIcon(label, color);
    try {
      entry.marker.setIcon(icon);
    } catch(e) {
      // fallback: replace marker preserving popup and latlng
      try {
        const latlng = entry.marker.getLatLng();
        const popupHtml = entry.marker.getPopup() ? entry.marker.getPopup().getContent() : `<strong>${label}</strong>`;
        entry.marker.remove();
        const m = L.marker(latlng, { icon }).addTo(map);
        m.bindPopup(popupHtml);
        entry.marker = m;
        markers[id].marker = m;
      } catch(e2) { /* ignore */ }
    }
  }

  // Public API
  exports.addOrUpdateMarker = function(id, name, lat, lng){
    if (!map) return;
    if (markers[id]) {
      markers[id].marker.setLatLng([lat,lng]);
      markers[id].lastSeen = Date.now();
      if (markers[id].marker.getPopup()) {
        markers[id].marker.getPopup().setContent(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } else {
        markers[id].marker.bindPopup(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
      recolorMarker(id, name);
    } else {
      const status = deriveStatus(id, name);
      const color = colorFromStatus(status);
      const icon = makeIcon(name || id, color);
      const m = L.marker([lat,lng], { icon }).addTo(map);
      m.bindPopup(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      markers[id] = { marker: m, lastSeen: Date.now() };
    }
    // Keep UI badge list in sync if provided
    if (window.ByaHero && typeof window.ByaHero.upsertBadge === 'function') {
      try { window.ByaHero.upsertBadge(id, name); } catch(e) {}
    }
  };

  exports.removeMarker = function(id){
    if (markers[id]) {
      if (markers[id].marker) markers[id].marker.remove();
      delete markers[id];
    }
    if (window.ByaHero && typeof window.ByaHero.removeBadge === 'function') {
      try { window.ByaHero.removeBadge(id); } catch(e) {}
    }
  };

  // Exposed helper: set seat status and recolor marker and badge immediately
  exports.setSeatStatus = function(id, status) {
    if (!id) return;
    const norm = normalizeStatusFromString(status || '');
    // update badge class if present
    try {
      const badge = document.querySelector(`[data-user="${id}"]`);
      if (badge) {
        badge.classList.remove(STATUS_META.available.className, STATUS_META.full.className, STATUS_META.following.className, STATUS_META.default.className);
        if (norm === 'available') badge.classList.add(STATUS_META.available.className);
        else if (norm === 'full') badge.classList.add(STATUS_META.full.className);
        else if (norm === 'following') badge.classList.add(STATUS_META.following.className);
        else badge.classList.add(STATUS_META.default.className);
      }
    } catch(e){}
    // recolor marker (use a name hint containing status so deriveStatus picks it up)
    const nameHint = (norm === 'available' || norm === 'full') ? `${id} — ${norm === 'available' ? 'Available' : 'Full'}` : id;
    recolorMarker(id, nameHint);
  };

  exports.recolorMarker = function(id, name) { recolorMarker(id, name); };

  exports.centerOn = function(lat, lng, zoom=DEFAULT_ZOOM){
    if (!map) return;
    map.setView([lat,lng], zoom);
  };

  exports.getMarkersSnapshot = function(){
    const out = [];
    for (const [id, entry] of Object.entries(markers)) {
      const latlng = entry.marker.getLatLng();
      const popup = entry.marker.getPopup();
      const name = popup ? (popup.getContent().split('<br/>')[0].replace('<strong>','').replace('</strong>','')) : id;
      out.push({ id, lat: latlng.lat, lng: latlng.lng, lastSeen: entry.lastSeen, name });
    }
    return out;
  };

  exports.getMap = function(){ return map; };

  setInterval(() => {
    const now = Date.now();
    for (const id of Object.keys(markers)) {
      if (now - markers[id].lastSeen > 1000 * 60 * 5) {
        exports.removeMarker(id);
      }
    }
  }, 60 * 1000);

  // expose for compatibility
  if (!window.ByaHero) window.ByaHero = {};
  window.ByaHero.setSeatStatus = window.ByaHero.setSeatStatus || exports.setSeatStatus;
  window.ByaHero.recolorMarker = window.ByaHero.recolorMarker || exports.recolorMarker;
  window.ByaHero.addOrUpdateMarker = window.ByaHero.addOrUpdateMarker || exports.addOrUpdateMarker;
  window.ByaHero.removeMarker = window.ByaHero.removeMarker || exports.removeMarker;

})(window.ByaHero);