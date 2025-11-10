// ====== SETUP ======
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// Create Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// ====== SOCKET.IO CONNECTION ======
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // When a user sends location
  socket.on("send-location", (data) => {
    io.emit("receive-location", { id: socket.id, ...data });
  });

  // When user disconnects
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    io.emit("user-disconnected", socket.id);
  });
});

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at: http://localhost:${PORT}`);
});
