const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinRoom', (roomCode) => {
    socket.join(roomCode);
    console.log(`User ${socket.id} joined room: ${roomCode}`);
    socket.to(roomCode).emit('playerJoined', socket.id);
  });

  socket.on('updateAvatar', (data) => {
    socket.to(data.roomCode).emit('opponentMoved', data);
  });

  socket.on('takeShot', (data) => {
    console.log(`*** SHOT FIRED in Room ${data.roomCode} ***`);
    socket.to(data.roomCode).emit('opponentShot', data);
  });

  // --- NEW: Sync Ball Positions ---
  socket.on('tableStateUpdate', (data) => {
    // Relay exact ball positions to the other player
    socket.to(data.roomCode).emit('tableStateUpdate', data);
  });
  // --------------------------------

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(3000, () => {
  console.log('SERVER RESTARTED: Ready for Physics Sync');
});