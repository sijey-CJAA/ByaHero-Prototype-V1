'use strict';
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const server = http.createServer(app);

// Socket.IO with permissive CORS for LAN/dev; tighten in production
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));

// Simple persistence for registered names (optional)
const NAMES_FILE = path.join(__dirname, "names.json");
function loadNames() {
  try {
    const raw = fs.readFileSync(NAMES_FILE, "utf8");
    return JSON.parse(raw) || [];
  } catch (e) {
    return [];
  }
}
function saveNames(names) {
  try {
    fs.writeFileSync(NAMES_FILE, JSON.stringify(Array.from(new Set(names)), null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save names:", e);
  }
}
let registeredNames = loadNames();

// Connected users: socket.id -> { name, role, lastLocation, lastSentAt }
const users = {};
let userCount = 0;

// Validation helpers
function sanitizeName(name) {
  if (!name || typeof name !== "string") return null;
  let s = name.trim();
  s = s.replace(/[\x00-\x1F\x7F]/g, "");
  if (s.length === 0) return null;
  if (s.length > 50) s = s.slice(0, 50);
  return s;
}
function validLatLng(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

// Per-socket minimal send interval (ms)
const MIN_SEND_INTERVAL_MS = 800;

// Network utilities
function isIPv4(net) {
  return net && (net.family === "IPv4" || net.family === 4);
}
function isPrivateIPv4(ip) {
  if (!ip || typeof ip !== "string") return false;
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    (/^172\.(1[6-9]|2[0-9]|3[0-1])\./).test(ip)
  );
}

function getAllLocalIPv4s() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (isIPv4(net) && !net.internal) {
        results.push({ interface: name, address: net.address });
      }
    }
  }
  return results;
}
function getLocalIPv4() {
  const all = getAllLocalIPv4s();
  if (!all || all.length === 0) return null;
  const privateOne = all.find(x => isPrivateIPv4(x.address));
  if (privateOne) return privateOne.address;
  return all[0].address;
}

function getBusesList() {
  const buses = [];
  for (const [id, u] of Object.entries(users)) {
    if (u.role === "bus" && u.lastLocation && typeof u.lastLocation.lat === "number") {
      buses.push({
        id,
        name: u.name,
        ...u.lastLocation
      });
    }
  }
  return buses;
}

// Debug/info endpoint
app.get("/info", (req, res) => {
  const PORT = process.env.PORT || 3000;
  const ips = getAllLocalIPv4s().map(x => x.address);
  const primaryIp = getLocalIPv4();
  const hostHeader = req.get("host") || null;
  const urls = [];
  if (primaryIp) urls.push(`http://${primaryIp}:${PORT}/`);
  for (const ip of ips) {
    const candidate = `http://${ip}:${PORT}/`;
    if (!urls.includes(candidate)) urls.push(candidate);
  }
  if (hostHeader && !urls.includes(`http://${hostHeader}/`)) {
    urls.push(`http://${hostHeader}/`);
  }
  res.json({
    port: PORT,
    ips,
    primaryIp,
    urls,
    networkInterfaces: os.networkInterfaces()
  });
});

app.get("/buses", (req, res) => {
  res.json({ buses: getBusesList() });
});

// Optional debug users dump (remove in production)
app.get('/debug/users', (req, res) => {
  res.json({ users });
});

io.on("connection", (socket) => {
  console.log("A new connection:", socket.id);

  userCount++;
  const defaultName = `Bus ${userCount}`;
  users[socket.id] = { name: defaultName, role: null, lastLocation: null, lastSentAt: 0 };

  socket.emit("assign-name", defaultName);

  socket.on("register-role", (payload) => {
    const role = payload?.role;
    if (role !== "bus" && role !== "customer") {
      socket.emit("register-role-failed", "Invalid role");
      return;
    }
    users[socket.id].role = role;

    if (role === "bus") {
      const sanitized = sanitizeName(payload?.name) || users[socket.id].name;
      users[socket.id].name = sanitized;
      registeredNames.push(sanitized);
      saveNames(registeredNames);
      console.log(`Bus registered: ${sanitized} (${socket.id})`);
    } else {
      console.log(`Customer connected (${socket.id})`);
    }

    socket.emit("register-role-ok", { role: users[socket.id].role, name: users[socket.id].name });

    // Broadcast authoritative list to all clients so they can reconcile
    const buses = getBusesList();
    io.emit("buses-updated", { buses });
  });

  socket.on("list-registered-names", () => {
    socket.emit("registered-names", Array.from(new Set(registeredNames)).slice(0, 200));
  });

  socket.on("send-location", (data) => {
    if (!users[socket.id]) return;
    if (users[socket.id].role !== "bus") {
      console.warn(`Ignoring send-location from non-bus socket ${socket.id}. Role: ${users[socket.id].role}`);
      return;
    }

    const now = Date.now();
    if (now - users[socket.id].lastSentAt < MIN_SEND_INTERVAL_MS) {
      return;
    }
    users[socket.id].lastSentAt = now;

    // Ensure numeric parsing - clients might send strings
    const lat = parseFloat(data?.lat);
    const lng = parseFloat(data?.lng);
    if (!validLatLng(lat, lng)) return;

    const payload = {
      lat,
      lng,
      accuracy: typeof data.accuracy === "number" ? data.accuracy : undefined,
      heading: typeof data.heading === "number" ? data.heading : undefined,
      speed: typeof data.speed === "number" ? data.speed : undefined,
    };

    users[socket.id].lastLocation = payload;

    // quick delta broadcast
    socket.broadcast.emit("receive-location", {
      id: socket.id,
      name: users[socket.id].name,
      ...payload,
    });

    // authoritative full list broadcast
    const buses = getBusesList();
    io.emit("buses-updated", { buses });
  });

  socket.on("disconnect", () => {
    if (users[socket.id]) {
      console.log(`${users[socket.id].name} disconnected (${socket.id})`);
      delete users[socket.id];
      io.emit("user-disconnected", socket.id);
      const buses = getBusesList();
      io.emit("buses-updated", { buses });
    }
  });

  socket.on("request-buses", () => {
    const buses = getBusesList();
    socket.emit("buses-list", { buses });
  });
});

// Listen on all interfaces so LAN devices can reach it
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  const allIps = getAllLocalIPv4s().map(x => x.address);
  const primary = getLocalIPv4();
  console.log(`✅ Server listening on http://localhost:${PORT}/`);
  if (primary) {
    console.log(`✅ LAN (preferred) at http://${primary}:${PORT}/`);
  }
  if (allIps.length > 0) {
    console.log("Other detected non-internal IPv4 addresses:", allIps);
  } else {
    console.log("No non-internal IPv4 addresses detected. If you're running inside WSL/Docker or disconnected from a network, the machine may not have a LAN address.");
    console.log("Network interfaces:", JSON.stringify(os.networkInterfaces(), null, 2));
  }
  console.log("If other devices cannot connect: ensure firewall allows incoming TCP on the port, and use one of the printed LAN IPs from a device on the same network.");
});