// public/js/map.js - map creation and marker management
window.ByaHero = window.ByaHero || {};

(function(exports){
  let map = null;
  const markers = {}; // id -> { marker, lastSeen }

  exports.createMap = function(elementId){
    if (map) return map;
    map = L.map(elementId).setView([0,0],2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    return map;
  };

  exports.addOrUpdateMarker = function(id, name, lat, lng){
    if (!map) return;
    if (markers[id]) {
      markers[id].marker.setLatLng([lat,lng]);
      markers[id].lastSeen = Date.now();
      markers[id].marker.getPopup().setContent(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } else {
      const icon = L.divIcon({
        className: 'bus-icon',
        html: `<div style="background:${window.ByaHero.colorFor(name)};padding:6px 8px;border-radius:6px;color:white;font-weight:bold;">${name}</div>`,
        iconSize: [100,30]
      });
      const m = L.marker([lat,lng], { icon }).addTo(map);
      m.bindPopup(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      markers[id] = { marker: m, lastSeen: Date.now() };
    }
    window.ByaHero.upsertBadge(id, name);
  };

  exports.removeMarker = function(id){
    if (markers[id]) {
      markers[id].marker.remove();
      delete markers[id];
    }
    window.ByaHero.removeBadge(id);
  };

  exports.centerOn = function(lat, lng, zoom=14){
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

  // cleanup stale after some time
  setInterval(() => {
    const now = Date.now();
    for (const id of Object.keys(markers)) {
      if (now - markers[id].lastSeen > 1000 * 60 * 5) { // 5 minutes
        exports.removeMarker(id);
      }
    }
  }, 60 * 1000);

})(window.ByaHero);