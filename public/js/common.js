// public/js/common.js
// shared helpers and socket connection
window.ByaHero = window.ByaHero || {};

(function(exports){
  // create socket connection
  const socket = io();
  exports.socket = socket;

  // small deterministic color from a string
  exports.colorFor = function(s){
    let h = 0;
    for (let i = 0; i < (s||"").length; i++) h = (h << 5) - h + s.charCodeAt(i);
    h = Math.abs(h);
    return `hsl(${h % 360} 70% 40%)`;
  };

  // UI helper: add badge to live users bar
  exports.upsertBadge = function(id, name){
    const root = document.getElementById('live-users');
    if (!root) return;
    let el = root.querySelector(`.user-badge[data-id="${id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'user-badge';
      el.dataset.id = id;
      el.style.cursor = 'pointer';
      el.style.padding = '6px 12px';
      el.style.borderRadius = '6px';
      el.style.color = 'white';
      el.style.fontWeight = 'bold';
      el.addEventListener('click', () => {
        navigator.clipboard?.writeText(name).then(()=> {
          el.style.opacity = '0.7';
          setTimeout(()=> el.style.opacity = '', 300);
        }).catch(()=>{});
      });
      root.appendChild(el);
    }
    el.textContent = name;
    el.style.background = exports.colorFor(name || id);
  };

  exports.removeBadge = function(id){
    const root = document.getElementById('live-users');
    if (!root) return;
    const el = root.querySelector(`.user-badge[data-id="${id}"]`);
    if (el) el.remove();
  };

  // Distance util (meters) - Haversine
  exports.distanceMeters = function(lat1, lon1, lat2, lon2){
    const R = 6371000;
    const toRad = (v) => v * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

})(window.ByaHero);