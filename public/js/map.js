// public/js/map.js - map creation and marker management
// Updated to allow free navigation (no fixed center/bounds)
window.ByaHero = window.ByaHero || {};

(function(exports){
  let map = null;
  const markers = {}; // id -> { marker, lastSeen }

  // Configuration: default center (kept as previous user-selected default)
  // You can override by passing options.center to createMap.
  const DEFAULT_CENTER = [14.091652, 121.021957];

  // Zoom configuration
  const DEFAULT_ZOOM = 13;   // starting zoom (adjust to taste)
  const MIN_ZOOM = 2;        // allow zooming out freely
  const MAX_ZOOM = 30;       // maximum zoom in

  // elementId: id of the DOM element to render the map into (e.g., 'map')
  // options: optional object to override config { center, minZoom, maxZoom, defaultZoom }
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

    // No bounding box enforcement — allow free panning and zooming.

    return map;
  };

  exports.addOrUpdateMarker = function(id, name, lat, lng){
    if (!map) return;

    // Accept markers anywhere (no bounds restriction)

    if (markers[id]) {
      markers[id].marker.setLatLng([lat,lng]);
      markers[id].lastSeen = Date.now();
      if (markers[id].marker.getPopup()) {
        markers[id].marker.getPopup().setContent(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } else {
      const icon = L.divIcon({
        className: 'bus-icon',
        html: `<div style="background:${window.ByaHero.colorFor ? window.ByaHero.colorFor(name) : '#2b8cbe'};padding:6px 8px;border-radius:6px;color:white;font-weight:bold;">${name}</div>`,
        iconSize: [100,30]
      });
      const m = L.marker([lat,lng], { icon }).addTo(map);
      m.bindPopup(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      markers[id] = { marker: m, lastSeen: Date.now() };
    }
    if (window.ByaHero.upsertBadge) window.ByaHero.upsertBadge(id, name);
  };

  exports.removeMarker = function(id){
    if (markers[id]) {
      markers[id].marker.remove();
      delete markers[id];
    }
    if (window.ByaHero.removeBadge) window.ByaHero.removeBadge(id);
  };

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

  // cleanup stale after some time (remove markers not seen for 5 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const id of Object.keys(markers)) {
      if (now - markers[id].lastSeen > 1000 * 60 * 5) { // 5 minutes
        exports.removeMarker(id);
      }
    }
  }, 60 * 1000);

})(window.ByaHero);