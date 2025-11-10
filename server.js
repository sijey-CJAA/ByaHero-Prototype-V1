const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Keep track of connected users
let userCount = 0;
const users = {}; // socket.id -> name

io.on("connection", (socket) => {
  userCount++;
  const busName = `Bus ${userCount}`;
  users[socket.id] = busName;

  console.log(`${busName} connected`);

  // Send the assigned name to the client
  socket.emit("assign-name", busName);

  socket.on("send-location", (data) => {
    io.emit("receive-location", { id: socket.id, name: users[socket.id], ...data });
  });

  socket.on("disconnect", () => {
    console.log(`${users[socket.id]} disconnected`);
    io.emit("user-disconnected", socket.id);
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
