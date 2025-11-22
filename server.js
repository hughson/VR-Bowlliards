const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Track rooms and player assignments
const rooms = new Map(); // roomCode -> { player1: socketId, player2: socketId }

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinRoom', (roomCode) => {
    socket.join(roomCode);
    
    // Get or create room data
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, { player1: null, player2: null });
    }
    
    const room = rooms.get(roomCode);
    let playerNumber = null;
    
    // Assign player number based on who joined first
    if (!room.player1) {
      room.player1 = socket.id;
      playerNumber = 1;
      console.log(`User ${socket.id} joined room ${roomCode} as PLAYER 1 (HOST)`);
    } else if (!room.player2) {
      room.player2 = socket.id;
      playerNumber = 2;
      console.log(`User ${socket.id} joined room ${roomCode} as PLAYER 2 (GUEST)`);
    } else {
      console.log(`User ${socket.id} tried to join FULL room ${roomCode}`);
      socket.emit('roomFull');
      return;
    }
    
    // Send player assignment to the joining player
    socket.emit('playerAssignment', { 
      playerNumber: playerNumber,
      roomCode: roomCode 
    });
    
    // Notify the other player
    socket.to(roomCode).emit('playerJoined', { 
      socketId: socket.id,
      playerNumber: playerNumber 
    });
    
    // If both players are now in the room, start the game
    if (room.player1 && room.player2) {
      io.to(roomCode).emit('gameReady', {
        player1: room.player1,
        player2: room.player2
      });
      console.log(`Room ${roomCode} is READY - Both players connected!`);
    }
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

  // --- NEW: Frame Complete (Turn Switching) ---
  socket.on('frameComplete', (data) => {
    console.log(`*** FRAME COMPLETE in Room ${data.roomCode} ***`);
    socket.to(data.roomCode).emit('opponentFrameComplete', data.scores);
  });
  // -------------------------------------------

  // --- NEW: Score Update (After Each Inning) ---
  socket.on('scoreUpdate', (data) => {
    console.log(`*** SCORE UPDATE in Room ${data.roomCode} ***`);
    socket.to(data.roomCode).emit('opponentScoreUpdate', data.scores);
  });
  // ---------------------------------------------

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up room assignments when player disconnects
    for (const [roomCode, room] of rooms.entries()) {
      if (room.player1 === socket.id) {
        console.log(`Player 1 left room ${roomCode}`);
        room.player1 = null;
        socket.to(roomCode).emit('opponentLeft', { playerNumber: 1 });
      } else if (room.player2 === socket.id) {
        console.log(`Player 2 left room ${roomCode}`);
        room.player2 = null;
        socket.to(roomCode).emit('opponentLeft', { playerNumber: 2 });
      }
      
      // Delete room if empty
      if (!room.player1 && !room.player2) {
        console.log(`Room ${roomCode} is empty - deleting`);
        rooms.delete(roomCode);
      }
    }
  });
});

server.listen(3000, () => {
  console.log('SERVER RESTARTED: Ready for Physics Sync');
});