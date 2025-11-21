// Client-side script for ByaHero Live Bus Tracker
(function () {
  // Small deterministic color generator from string
  const colorFor = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
    h = Math.abs(h);
    return `hsl(${h % 360} 70% 40%)`;
  };

  // DOM
  const liveUsersDiv = document.getElementById("live-users");
  const mapEl = document.getElementById("map");

  // Setup map
  const map = L.map(mapEl).setView([0, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  // Socket
  const socket = io();

  // State
  const markers = {}; // id -> { marker, name, lastSeen }
  let myName = null;
  const LOCAL_KEY = "byahero:name";

  // UI helpers
  function upsertBadge(id, name) {
    let el = document.querySelector(`.user-badge[data-id="${id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "user-badge";
      el.dataset.id = id;
      el.style.cursor = "pointer";
      liveUsersDiv.appendChild(el);

      // Click to copy or save name locally
      el.addEventListener("click", () => {
        if (id === "me") {
          const newName = prompt("Save a name for this device (persist locally):", name || "");
          if (newName && newName.trim().length > 0) {
            localStorage.setItem(LOCAL_KEY, newName.trim());
            myName = newName.trim();
            socket.emit("register-name", myName);
            el.textContent = `You: ${myName}`;
          }
        } else {
          // copy other bus name to clipboard
          navigator.clipboard?.writeText(name).then(() => {
            el.style.opacity = "0.7";
            setTimeout(() => (el.style.opacity = ""), 300);
          }).catch(() => {});
        }
      });
    }
    el.textContent = name;
    el.style.background = colorFor(name || id);
  }

  function removeBadge(id) {
    const el = document.querySelector(`.user-badge[data-id="${id}"]`);
    if (el) el.remove();
  }

  // Handle incoming location from other users
  socket.on("receive-location", (data) => {
    // data: { id, name, lat, lng, heading?, speed? ... }
    const id = data.id;
    const name = data.name || "Unknown";
    const lat = data.lat;
    const lng = data.lng;

    if (typeof lat !== "number" || typeof lng !== "number") return;

    upsertBadge(id, name);

    if (markers[id]) {
      markers[id].marker.setLatLng([lat, lng]);
      markers[id].lastSeen = Date.now();
      markers[id].marker.getPopup().setContent(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } else {
      const icon = L.divIcon({
        className: "bus-icon",
        html: `<div style="background:${colorFor(name)};padding:6px 8px;border-radius:6px;color:white;font-weight:bold;">${name}</div>`,
        iconSize: [100, 30],
      });
      const m = L.marker([lat, lng], { icon }).addTo(map);
      m.bindPopup(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      markers[id] = { marker: m, name, lastSeen: Date.now() };
    }

    // If this is the first marker and map zoom is world, center
    if (Object.keys(markers).length === 1 && map.getZoom() <= 2) {
      map.setView([lat, lng], 14);
    }
  });

  socket.on("user-disconnected", (id) => {
    if (markers[id]) {
      markers[id].marker.remove();
      delete markers[id];
    }
    removeBadge(id);
  });

  socket.on("assign-name", (defaultName) => {
    myName = defaultName;
    // If client saved a name in localStorage, re-register with server
    const saved = localStorage.getItem(LOCAL_KEY);
    if (saved && saved.trim().length > 0) {
      myName = saved.trim();
      socket.emit("register-name", myName);
      upsertBadge("me", `You: ${myName}`);
    } else {
      upsertBadge("me", `You: ${myName}`);
    }
  });

  socket.on("register-name-failed", (msg) => {
    console.warn("Register name failed:", msg);
  });

  // Geolocation: send updates (throttled client-side too)
  let lastSent = 0;
  const SEND_INTERVAL_MS = 1000; // max 1 update per second

  function sendLocation(lat, lng, extra = {}) {
    const now = Date.now();
    if (now - lastSent < SEND_INTERVAL_MS) return;
    lastSent = now;
    const payload = { lat: Number(lat), lng: Number(lng), ...extra };
    // Locally update your own badge/marker for snappier UX
    upsertBadge("me", `You: ${myName || "Bus"}`);
    updateOwnMarker(payload);
    socket.emit("send-location", payload);
  }

  function updateOwnMarker(payload) {
    const id = "me";
    const name = `You: ${myName || "Bus"}`;
    const lat = payload.lat;
    const lng = payload.lng;
    if (markers[id]) {
      markers[id].marker.setLatLng([lat, lng]);
      markers[id].lastSeen = Date.now();
      markers[id].marker.getPopup().setContent(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } else {
      const icon = L.divIcon({
        className: "bus-icon",
        html: `<div style="background:${colorFor(name)};padding:6px 8px;border-radius:6px;color:white;font-weight:bold;">${name}</div>`,
        iconSize: [100, 30],
      });
      const m = L.marker([lat, lng], { icon }).addTo(map);
      m.bindPopup(`<strong>${name}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      markers[id] = { marker: m, name, lastSeen: Date.now() };
      if (Object.keys(markers).length === 1) {
        map.setView([lat, lng], 14);
      }
    }
  }

  if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        sendLocation(lat, lng, {
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        });
      },
      (err) => {
        console.warn("Geolocation error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 }
    );
  } else {
    console.warn("Geolocation not available in this browser.");
  }

  // Click map to send manual location (dev)
  map.on("click", (e) => {
    sendLocation(e.latlng.lat, e.latlng.lng);
  });

  // Housekeeping: remove stale markers (5 min)
  setInterval(() => {
    const now = Date.now();
    for (const [id, m] of Object.entries(markers)) {
      if (now - m.lastSeen > 1000 * 60 * 5) {
        m.marker.remove();
        delete markers[id];
        removeBadge(id);
      }
    }
  }, 60 * 1000);
})();