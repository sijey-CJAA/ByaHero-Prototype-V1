const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// Utility to find a LAN IPv4 address
function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

// Provide info endpoint so clients can get the machine's LAN URL
app.get("/info", (req, res) => {
  const PORT = process.env.PORT || 3000;
  const ip = getLocalIPv4();
  const url = ip ? `http://${ip}:${PORT}/` : null;
  res.json({ ip, port: PORT, url });
});

// Endpoint: list buses (current known buses with location)
app.get("/buses", (req, res) => {
  const buses = [];
  for (const [id, u] of Object.entries(users)) {
    if (u.role === "bus" && u.lastLocation && typeof u.lastLocation.lat === "number") {
      buses.push({
        id,
        name: u.name,
        lastLocation: u.lastLocation,
      });
    }
  }
  res.json({ buses });
});

io.on("connection", (socket) => {
  console.log("A new connection:", socket.id);

  // Assign a new default name & role unknown
  userCount++;
  const defaultName = `Bus ${userCount}`;
  users[socket.id] = { name: defaultName, role: null, lastLocation: null, lastSentAt: 0 };

  // Inform client of assigned default name
  socket.emit("assign-name", defaultName);

  // Client registers its role (bus | customer) and optional name
  socket.on("register-role", (payload) => {
    // payload: { role: 'bus'|'customer', name?: string }
    const role = payload?.role;
    if (role !== "bus" && role !== "customer") {
      socket.emit("register-role-failed", "Invalid role");
      return;
    }
    users[socket.id].role = role;

    if (role === "bus") {
      // name may be provided
      const sanitized = sanitizeName(payload?.name) || users[socket.id].name;
      users[socket.id].name = sanitized;
      registeredNames.push(sanitized);
      saveNames(registeredNames);
      console.log(`Bus registered: ${sanitized} (${socket.id})`);

      // Send current buses to this bus (not necessary but helpful)
      for (const [id, user] of Object.entries(users)) {
        if (id !== socket.id && user.role === "bus" && user.lastLocation) {
          socket.emit("receive-location", { id, name: user.name, ...user.lastLocation });
        }
      }
    } else {
      // customer
      console.log(`Customer connected (${socket.id})`);
      // Send all known buses to the new customer
      for (const [id, user] of Object.entries(users)) {
        if (user.role === "bus" && user.lastLocation) {
          socket.emit("receive-location", { id, name: user.name, ...user.lastLocation });
        }
      }
    }
    socket.emit("register-role-ok", { role: users[socket.id].role, name: users[socket.id].name });
  });

  // Allow clients to ask for list of registered names (optional)
  socket.on("list-registered-names", () => {
    socket.emit("registered-names", Array.from(new Set(registeredNames)).slice(0, 200));
  });

  // Receive location from a user (only buses should send)
  socket.on("send-location", (data) => {
    if (!users[socket.id]) return;
    if (users[socket.id].role !== "bus") return; // only accept bus location updates

    // Rate limiting
    const now = Date.now();
    if (now - users[socket.id].lastSentAt < MIN_SEND_INTERVAL_MS) {
      return;
    }
    users[socket.id].lastSentAt = now;

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

    // Broadcast to all OTHER clients (customers and other buses)
    socket.broadcast.emit("receive-location", {
      id: socket.id,
      name: users[socket.id].name,
      ...payload,
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (users[socket.id]) {
      console.log(`${users[socket.id].name} disconnected (${socket.id})`);
      io.emit("user-disconnected", socket.id);
      delete users[socket.id];
    }
  });

  // Customers can request current buses via socket
  socket.on("request-buses", () => {
    const buses = [];
    for (const [id, u] of Object.entries(users)) {
      if (u.role === "bus" && u.lastLocation) {
        buses.push({
          id,
          name: u.name,
          ...u.lastLocation,
        });
      }
    }
    socket.emit("buses-list", { buses });
  });
});

// Listen on all interfaces so LAN devices can reach it
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIPv4() || "localhost";
  console.log(`✅ Server running at http://localhost:${PORT} and on your LAN at http://${ip}:${PORT}`);
});