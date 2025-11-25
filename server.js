const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// Serve static files from the public directory
app.use(express.static('public'));

// Parse JSON bodies
app.use(express.json());

// CORS proxy for Avaturn API
app.get('/api/avaturn/avatars', async (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  try {
    // Node 18+ has native fetch
    const response = await fetch('https://api.avaturn.dev/v1/avatars', {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    console.log('[AVATURN PROXY] Response status:', response.status);
    console.log('[AVATURN PROXY] Response headers:', response.headers);
    
    const text = await response.text();
    console.log('[AVATURN PROXY] Response body (first 200 chars):', text.substring(0, 200));

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Avaturn API returned ${response.status}`,
        details: text.substring(0, 200)
      });
    }

    const data = JSON.parse(text);
    res.json(data);
  } catch (error) {
    console.error('[AVATURN PROXY] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/avaturn/avatars/:id', async (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  try {
    // Node 18+ has native fetch
    const response = await fetch(`https://api.avaturn.dev/v1/avatars/${req.params.id}`, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    console.log('[AVATURN PROXY] Response status:', response.status);
    
    const text = await response.text();
    console.log('[AVATURN PROXY] Response body (first 200 chars):', text.substring(0, 200));

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Avaturn API returned ${response.status}`,
        details: text.substring(0, 200)
      });
    }

    const data = JSON.parse(text);
    res.json(data);
  } catch (error) {
    console.error('[AVATURN PROXY] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Track rooms and player assignments
const rooms = new Map(); // roomCode -> { player1: socketId, player2: socketId, currentTurn: 1 or 2, player1Name: string, player2Name: string }

// Track available public rooms for matchmaking
const publicRooms = new Map(); // roomCode -> { player1: socketId, createdAt: timestamp }

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Broadcast updated player count to all clients
  io.emit('playerCount', { count: io.engine.clientsCount });

  // Handle explicit player count requests
  socket.on('requestPlayerCount', () => {
    socket.emit('playerCount', { count: io.engine.clientsCount });
  });

  // ============================================
  // PUBLIC MATCHMAKING
  // ============================================
  socket.on('joinPublicMatch', (data) => {
    const playerName = data?.playerName || 'Player';
    console.log('[PUBLIC] Matchmaking request from:', socket.id, `(${playerName})`);
    
    // Find first available public room with 1 player waiting
    let availableRoom = null;
    for (const [roomCode, room] of publicRooms.entries()) {
      if (room.player1 && !rooms.get(roomCode).player2) {
        availableRoom = roomCode;
        break;
      }
    }
    
    if (availableRoom) {
      // Join existing public room
      console.log('[PUBLIC] Joining player to existing room:', availableRoom);
      publicRooms.delete(availableRoom); // Remove from queue
      socket.emit('joinRoom', availableRoom); // Trigger normal join flow
      handleJoinRoom(socket, availableRoom, playerName);
    } else {
      // Create new public room
      const newRoomCode = 'PUB-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      console.log('[PUBLIC] Creating new room:', newRoomCode);
      
      publicRooms.set(newRoomCode, {
        player1: socket.id,
        createdAt: Date.now()
      });
      
      // Initialize room
      rooms.set(newRoomCode, { player1: null, player2: null, currentTurn: 1, player1Name: null, player2Name: null });
      
      socket.emit('joinRoom', newRoomCode); // Trigger normal join flow
      handleJoinRoom(socket, newRoomCode, playerName);
      
      // Notify player they're waiting
      socket.emit('waitingForOpponent', { roomCode: newRoomCode });
    }
  });

  // ============================================
  // CANCEL MATCHMAKING
  // ============================================
  socket.on('cancelMatchmaking', () => {
    console.log('[PUBLIC] Player canceling matchmaking:', socket.id);
    
    // Find and remove their public room
    for (const [roomCode, room] of publicRooms.entries()) {
      if (room.player1 === socket.id) {
        console.log('[PUBLIC] Removing room:', roomCode);
        publicRooms.delete(roomCode);
        rooms.delete(roomCode);
        socket.emit('matchmakingCanceled');
        return;
      }
    }
  });

  // ============================================
  // PRIVATE ROOM JOIN
  // ============================================
  socket.on('joinRoom', (data) => {
    const roomCode = typeof data === 'string' ? data : data.roomCode;
    const playerName = typeof data === 'object' ? data.playerName : 'Player';
    handleJoinRoom(socket, roomCode, playerName);
  });
  
  function handleJoinRoom(socket, roomCode, playerName = 'Player') {
    socket.join(roomCode);
    
    // Get or create room data
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, { player1: null, player2: null, currentTurn: 1, player1Name: null, player2Name: null });
    }
    
    const room = rooms.get(roomCode);
    let playerNumber = null;
    
    // Assign player number based on who joined first
    if (!room.player1) {
      room.player1 = socket.id;
      room.player1Name = playerName;
      playerNumber = 1;
      console.log(`User ${socket.id} (${playerName}) joined room ${roomCode} as PLAYER 1 (HOST)`);
    } else if (!room.player2) {
      room.player2 = socket.id;
      room.player2Name = playerName;
      playerNumber = 2;
      console.log(`User ${socket.id} (${playerName}) joined room ${roomCode} as PLAYER 2 (GUEST)`);
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
    
    // Notify the other player about the new player (including their name)
    socket.to(roomCode).emit('playerJoined', { 
      socketId: socket.id,
      playerNumber: playerNumber,
      playerName: playerName
    });
    
    // If both players are now in the room, start the game
    if (room.player1 && room.player2) {
      // Initialize turn to player 1
      room.currentTurn = 1;
      
      io.to(roomCode).emit('gameReady', {
        player1: room.player1,
        player2: room.player2,
        player1Name: room.player1Name,
        player2Name: room.player2Name,
        currentTurn: 1
      });
      
      // Send turn state to both players
      io.to(room.player1).emit('turnChanged', { 
        currentPlayer: 1,
        roomCode: roomCode 
      });
      io.to(room.player2).emit('turnChanged', { 
        currentPlayer: 1,
        roomCode: roomCode 
      });
      
      console.log(`Room ${roomCode} is READY - Both players connected! Player 1's turn.`);
    }
  } // End handleJoinRoom function

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

  // --- Frame Complete (Turn Switching) ---
  socket.on('frameComplete', (data) => {
    console.log(`*** FRAME COMPLETE in Room ${data.roomCode} ***`);
    
    const room = rooms.get(data.roomCode);
    if (!room) {
      console.log(`ERROR: Room ${data.roomCode} not found!`);
      return;
    }
    
    // Send scores to opponent
    socket.to(data.roomCode).emit('opponentFrameComplete', data.scores);
    
    // Switch turns
    room.currentTurn = room.currentTurn === 1 ? 2 : 1;
    console.log(`Room ${data.roomCode}: Turn switched to Player ${room.currentTurn}`);
    
    // Notify BOTH players of the turn change
    io.to(data.roomCode).emit('turnChanged', { 
      currentPlayer: room.currentTurn,
      roomCode: data.roomCode 
    });
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
    
    // Clean up public room queue if player was waiting
    for (const [roomCode, room] of publicRooms.entries()) {
      if (room.player1 === socket.id) {
        console.log(`[PUBLIC] Removing abandoned room ${roomCode}`);
        publicRooms.delete(roomCode);
        rooms.delete(roomCode);
      }
    }
    
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
    
    // Broadcast updated player count to all remaining clients
    io.emit('playerCount', { count: io.engine.clientsCount });
  });
});

// Clean up stale public rooms every minute
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [roomCode, room] of publicRooms.entries()) {
    if (now - room.createdAt > timeout) {
      console.log(`[PUBLIC] Cleaning up stale room: ${roomCode}`);
      publicRooms.delete(roomCode);
      rooms.delete(roomCode);
    }
  }
}, 60000);

server.listen(3000, () => {
  console.log('SERVER RESTARTED: Ready for Physics Sync + Public Matchmaking');
});