// public/js/common.js
// shared helpers and socket connection + LAN URL detection
window.ByaHero = window.ByaHero || {};

(function(exports){
  // create socket connection (relative; uses same origin so it works on HTTPS)
  const socket = io();
  exports.socket = socket;

  // Expose serverUrl once detected (other modules can read ByaHero.serverUrl)
  exports.serverUrl = null;

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

  // LAN / server URL detection and UI update
  async function detectServerUrl() {
    // 1) Prefer page origin when the page was served by the same server (works for https and proxied hosts)
    try {
      if (window.location && window.location.origin && window.location.origin !== 'null') {
        return window.location.origin;
      }
    } catch (e) {
      // ignore and try next
    }

    // 2) Try server-provided /info endpoint (server may expose candidate LAN urls)
    try {
      const resp = await fetch('/info', { cache: 'no-store' });
      if (resp.ok) {
        const info = await resp.json();
        if (info && Array.isArray(info.urls) && info.urls.length > 0) {
          // prefer https if present (onrender uses https)
          const httpsCandidate = info.urls.find(u => u.startsWith('https://'));
          return httpsCandidate || info.urls[0];
        }
        if (info && info.primaryIp) {
          const scheme = window.location && window.location.protocol === 'https:' ? 'https:' : 'http:';
          return `${scheme}//${info.primaryIp}:${info.port || 3000}`;
        }
      }
    } catch (e) {
      // ignore
    }

    // 3) Fallback to localhost (development)
    const port = window.location && window.location.port ? window.location.port : 3000;
    return `${window.location.protocol || 'http:'}//localhost:${port}`;
  }

  function makeUrlElement(url) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '8px';
    container.style.alignItems = 'center';

    const a = document.createElement('a');
    a.href = url;
    a.textContent = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.fontSize = '0.9rem';
    a.style.color = 'inherit';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'btn btn-sm btn-outline-secondary';
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(url).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(()=> copyBtn.textContent = 'Copy', 1200);
      }).catch(()=> {
        copyBtn.textContent = 'Copy';
        alert('Unable to copy. Select the URL and copy manually.');
      });
    });

    container.appendChild(a);
    container.appendChild(copyBtn);
    return container;
  }

  async function updateLanUrlUi() {
    const el = document.getElementById('lan-url');
    if (!el) return;
    el.textContent = 'Detecting LAN URL...';

    const url = await detectServerUrl();
    exports.serverUrl = url;

    // normalize (remove trailing slash for display)
    const displayUrl = url.replace(/\/$/, '');
    el.innerHTML = ''; // clear
    el.appendChild(makeUrlElement(displayUrl));
    el.setAttribute('title', `Server URL: ${displayUrl}`);
  }

  // Kick off detection (non-blocking)
  updateLanUrlUi().catch((e) => {
    const el = document.getElementById('lan-url');
    if (el) el.textContent = 'LAN URL detection failed';
    console.warn('LAN URL detection failed', e);
  });

})(window.ByaHero);