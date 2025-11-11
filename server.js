const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Connected users: socket.id -> { name, lastLocation }
const users = {};
let userCount = 0;

io.on("connection", (socket) => {
  console.log("A new connection:", socket.id);

  // Assign a new bus name by default
  userCount++;
  const defaultName = `Bus ${userCount}`;
  users[socket.id] = { name: defaultName, lastLocation: null };

  // Send the default assigned name to the client
  socket.emit("assign-name", defaultName);

  // When client registers a saved name (persistent bus)
  socket.on("register-name", (savedName) => {
    users[socket.id].name = savedName;
    console.log(`${savedName} connected (${socket.id})`);

    // Send all existing users (except itself) to the newly connected user
    for (const [id, user] of Object.entries(users)) {
      if (id !== socket.id && user.lastLocation) {
        socket.emit("receive-location", {
          id,
          name: user.name,
          ...user.lastLocation,
        });
      }
    }
  });

  // Receive location from a user
  socket.on("send-location", (data) => {
    if (!users[socket.id]) return;
    users[socket.id].lastLocation = data;

    io.emit("receive-location", {
      id: socket.id,
      name: users[socket.id].name,
      ...data,
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (users[socket.id]) {
      console.log(`${users[socket.id].name} disconnected`);
      io.emit("user-disconnected", socket.id);
      delete users[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
