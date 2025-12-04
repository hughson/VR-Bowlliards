const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// ============================================
// ADMIN PHYSICS SETTINGS
// ============================================
// Password from environment variable (set in Render dashboard)
const ADMIN_PASSWORD = process.env.ADMIN_PHYSICS_PASSWORD || 'vrbowlliards2025';
const PHYSICS_FILE = path.join(__dirname, 'physics-settings.json');

// Firebase Admin SDK for persistent storage
let firebaseAdmin = null;
let firestoreDb = null;

// Initialize Firebase Admin (if credentials available)
async function initFirebaseAdmin() {
  try {
    // Check if firebase-admin is installed
    firebaseAdmin = require('firebase-admin');
    
    // Check for service account credentials
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
      // Parse from environment variable (Render)
      const serviceAccount = JSON.parse(serviceAccountJson);
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount)
      });
      firestoreDb = firebaseAdmin.firestore();
      console.log('[PHYSICS] Firebase Admin initialized from env variable');
    } else if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      // Load from file path
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.applicationDefault()
      });
      firestoreDb = firebaseAdmin.firestore();
      console.log('[PHYSICS] Firebase Admin initialized from file');
    } else {
      console.log('[PHYSICS] No Firebase credentials - using local file storage');
    }
  } catch (e) {
    console.log('[PHYSICS] Firebase Admin not available:', e.message);
    console.log('[PHYSICS] Using local file storage as fallback');
  }
}

// Load physics from Firestore or local file
async function loadPhysicsSettings() {
  // Try Firestore first
  if (firestoreDb) {
    try {
      const doc = await firestoreDb.collection('settings').doc('physics').get();
      if (doc.exists) {
        console.log('[PHYSICS] Loaded settings from Firestore');
        return doc.data();
      }
    } catch (e) {
      console.error('[PHYSICS] Firestore read error:', e.message);
    }
  }
  
  // Fallback to local file
  try {
    if (fs.existsSync(PHYSICS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PHYSICS_FILE, 'utf8'));
      console.log('[PHYSICS] Loaded settings from local file');
      return data;
    }
  } catch (e) {
    console.error('[PHYSICS] Local file read error:', e.message);
  }
  
  console.log('[PHYSICS] Using default settings');
  return getDefaultPhysics();
}

// Save physics to Firestore and local file
async function savePhysicsSettings(settings) {
  let savedToFirestore = false;
  let savedToFile = false;
  
  // Save to Firestore
  if (firestoreDb) {
    try {
      await firestoreDb.collection('settings').doc('physics').set(settings);
      console.log('[PHYSICS] Saved to Firestore');
      savedToFirestore = true;
    } catch (e) {
      console.error('[PHYSICS] Firestore write error:', e.message);
    }
  }
  
  // Also save to local file as backup
  try {
    fs.writeFileSync(PHYSICS_FILE, JSON.stringify(settings, null, 2));
    console.log('[PHYSICS] Saved to local file');
    savedToFile = true;
  } catch (e) {
    console.error('[PHYSICS] Local file write error:', e.message);
  }
  
  return savedToFirestore || savedToFile;
}

// Default physics
function getDefaultPhysics() {
  return {
    powerMultiplier: 12.7,
    maxPower: 1.0,
    minPower: 0.05,
    verticalSpinSensitivity: 1.5,
    englishSpinSensitivity: 2.0,
    spinPowerScaling: 1.0,
    feltFriction: 0.2,
    slideThreshold: 0.1,
    rollAcceleration: 2.0,
    topspinFollowForce: 1.5,
    backspinDrawForce: 2.0,
    spinEffectThreshold: 0.15,
    stopShotThreshold: 0.3,
    cushionEnglishEffect: 0.6,
    cushionSpeedThreshold: 0.3,
    initialRollFactor: 0.3,
    topspinAngularMultiplier: 50,
    backspinAngularMultiplier: 50,
    englishAngularMultiplier: 30,
    spinDecayRate: 0.98,
    angularDampingLow: 0.2,
    angularDampingHigh: 0.15,
    linearDampingLow: 0.2,
    linearDampingHigh: 0.12,
    slowSpeedThreshold: 0.5,
    stopSpeedThreshold: 0.08,
    stopAngularThreshold: 0.6,
    ballRadius: 0.028,
    ballMass: 0.17
  };
}

// Current physics settings (in memory)
let currentPhysics = getDefaultPhysics();

// Initialize physics on startup
async function initPhysics() {
  await initFirebaseAdmin();
  currentPhysics = await loadPhysicsSettings();
  console.log('[PHYSICS] Initialization complete');
}

// Start initialization (don't block server startup)
initPhysics().catch(e => console.error('[PHYSICS] Init error:', e));

// Serve static files from the public directory
app.use(express.static('public'));

// Parse JSON bodies
app.use(express.json());

// ============================================
// PHYSICS API ENDPOINTS
// ============================================

// Get current physics (public - all players can fetch)
app.get('/api/physics', (req, res) => {
  res.json(currentPhysics);
});

// Update physics (admin only)
app.post('/api/physics', async (req, res) => {
  const { password, settings } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Invalid settings' });
  }
  
  // Merge with current settings
  currentPhysics = { ...currentPhysics, ...settings };
  
  // Save to storage (Firestore + file)
  await savePhysicsSettings(currentPhysics);
  
  // Broadcast to all connected game clients
  io.emit('physicsUpdate', currentPhysics);
  
  console.log('[PHYSICS] Settings updated by admin');
  res.json({ success: true, settings: currentPhysics });
});

// Reset physics to defaults (admin only)
app.post('/api/physics/reset', async (req, res) => {
  const { password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  currentPhysics = getDefaultPhysics();
  await savePhysicsSettings(currentPhysics);
  
  // Broadcast to all connected game clients
  io.emit('physicsUpdate', currentPhysics);
  
  console.log('[PHYSICS] Settings reset to defaults by admin');
  res.json({ success: true, settings: currentPhysics });
});

// CORS proxy for Avaturn API
app.get('/api/avaturn/avatars', async (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  try {
    // Node 18+ has native fetch
    const response = await fetch('https://api.avaturn.me/avatars/v2?limit=7', {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'x-override-origin': 'hub.avaturn.me'
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
    const response = await fetch(`https://api.avaturn.me/avatars/${req.params.id}`, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'origin': 'https://hub.avaturn.me'
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

// Get fresh avatar GLB URL (no auth needed - returns public URL)
app.get('/api/avatar-url/:userId', async (req, res) => {
  try {
    // For now, return the user's avatar ID
    // In production, you'd look this up from your database
    const avatarId = '019ab7b1-542b-7212-96a9-c1f2747b2207'; // Thomas's avatar
    
    // Return a URL that the client can fetch to get the current signed URL
    res.json({ 
      avatarId: avatarId,
      fetchUrl: `/api/avaturn/avatars/${avatarId}`
    });
  } catch (error) {
    console.error('[AVATAR URL] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch user's avatars from Avaturn (OAuth-style flow)
app.post('/api/avaturn/fetch-my-avatars', async (req, res) => {
  const { token, email } = req.body;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    console.log(`[AVATURN OAUTH] Fetching avatars for ${email}`);
    console.log(`[AVATURN OAUTH] Token length: ${token.length}`);
    console.log(`[AVATURN OAUTH] Token starts with: ${token.substring(0, 20)}...`);
    
    const response = await fetch('https://api.avaturn.me/avatars/v2?limit=20', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'origin': 'https://hub.avaturn.me'
      }
    });

    const text = await response.text();
    console.log('[AVATURN OAUTH] Response status:', response.status);
    console.log('[AVATURN OAUTH] Response body:', text.substring(0, 500));

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Avaturn API returned ${response.status}`,
        details: text.substring(0, 200)
      });
    }

    const data = JSON.parse(text);
    
    // Return simplified avatar list
    const avatars = data.items ? data.items.map(item => ({
      id: item.id,
      createdAt: item.created_at
    })) : [];

    console.log(`[AVATURN OAUTH] Found ${avatars.length} avatars`);
    
    res.json({ avatars });
  } catch (error) {
    console.error('[AVATURN OAUTH] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download avatar and save to server (OAuth-style flow)
app.post('/api/avaturn/download-avatar', async (req, res) => {
  const { token, avatarId, username } = req.body;
  
  if (!token || !avatarId || !username) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate username
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  try {
    console.log(`[AVATURN DOWNLOAD] Downloading avatar ${avatarId} for ${username}`);

    // Step 1: Get avatar metadata to get GLB URL
    const metaResponse = await fetch(`https://api.avaturn.me/avatars/${avatarId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'origin': 'https://hub.avaturn.me'
      }
    });

    if (!metaResponse.ok) {
      const text = await metaResponse.text();
      return res.status(metaResponse.status).json({ 
        error: `Failed to get avatar metadata: ${metaResponse.status}`,
        details: text.substring(0, 200)
      });
    }

    const metadata = await metaResponse.json();
    
    // Log the full metadata structure to see what we have
    console.log('[AVATURN DOWNLOAD] Full metadata structure:');
    console.log(JSON.stringify(metadata, null, 2));
    
    // Find the GLB URL (try multiple possible locations)
    let glbUrl = null;
    
    // Check various possible locations
    if (metadata.scan_glb_url) {
      glbUrl = metadata.scan_glb_url;
      console.log('[AVATURN DOWNLOAD] Found GLB in scan_glb_url');
    } else if (metadata.exports && metadata.exports.glb) {
      glbUrl = metadata.exports.glb;
      console.log('[AVATURN DOWNLOAD] Found GLB in exports.glb');
    } else if (metadata.model_url) {
      glbUrl = metadata.model_url;
      console.log('[AVATURN DOWNLOAD] Found GLB in model_url');
    } else if (metadata.urlGlb) {
      glbUrl = metadata.urlGlb;
      console.log('[AVATURN DOWNLOAD] Found GLB in urlGlb');
    } else if (metadata.url_glb) {
      glbUrl = metadata.url_glb;
      console.log('[AVATURN DOWNLOAD] Found GLB in url_glb');
    } else if (metadata.glb_url) {
      glbUrl = metadata.glb_url;
      console.log('[AVATURN DOWNLOAD] Found GLB in glb_url');
    } else if (metadata.body && metadata.body.url_glb) {
      glbUrl = metadata.body.url_glb;
      console.log('[AVATURN DOWNLOAD] Found GLB in body.url_glb');
    }

    if (!glbUrl) {
      console.log('[AVATURN DOWNLOAD] ❌ GLB URL NOT FOUND!');
      console.log('[AVATURN DOWNLOAD] Available keys:', Object.keys(metadata));
      return res.status(404).json({ 
        error: 'GLB URL not found in avatar metadata',
        availableKeys: Object.keys(metadata),
        metadata: metadata
      });
    }

    console.log(`[AVATURN DOWNLOAD] GLB URL found: ${glbUrl.substring(0, 100)}...`);

    // Step 2: Download the GLB file
    const glbResponse = await fetch(glbUrl);
    
    if (!glbResponse.ok) {
      return res.status(glbResponse.status).json({ 
        error: `Failed to download GLB: ${glbResponse.status}`
      });
    }

    const buffer = await glbResponse.arrayBuffer();
    console.log(`[AVATURN DOWNLOAD] Downloaded ${buffer.byteLength} bytes`);

    // Step 3: Save to disk
    const avatarsDir = path.join(__dirname, 'public', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    const filePath = path.join(avatarsDir, `${username}.glb`);
    fs.writeFileSync(filePath, Buffer.from(buffer));

    console.log(`[AVATURN DOWNLOAD] Saved to ${filePath}`);

    res.json({
      success: true,
      url: `/avatars/${username}.glb`,
      username: username,
      size: buffer.byteLength
    });

  } catch (error) {
    console.error('[AVATURN DOWNLOAD] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Avatar upload configuration
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const avatarsDir = path.join(__dirname, 'public', 'avatars');
    // Create avatars directory if it doesn't exist
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }
    cb(null, avatarsDir);
  },
  filename: function (req, file, cb) {
    // Save as username.glb
    const username = req.body.username;
    if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      return cb(new Error('Invalid username'));
    }
    cb(null, `${username}.glb`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.endsWith('.glb')) {
      return cb(new Error('Only .glb files are allowed'));
    }
    cb(null, true);
  }
});

// Avatar upload endpoint
app.post('/api/upload-avatar', avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const username = req.body.username;
    const avatarUrl = `/avatars/${username}.glb`;

    console.log(`[AVATAR UPLOAD] ${username} uploaded avatar: ${req.file.size} bytes`);

    res.json({
      success: true,
      url: avatarUrl,
      username: username,
      size: req.file.size
    });
  } catch (error) {
    console.error('[AVATAR UPLOAD] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handler for multer errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Track rooms and player assignments
const rooms = new Map(); // roomCode -> { player1: socketId, player2: socketId, spectators: [], spectatorNames: [], currentTurn: 1 or 2, player1Name: string, player2Name: string, newGameRequests: Set }

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
      rooms.set(newRoomCode, { player1: null, player2: null, spectators: [], spectatorNames: [], currentTurn: 1, player1Name: null, player2Name: null, newGameRequests: new Set() });
      
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
    // Get or create room data
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, { player1: null, player2: null, spectators: [], spectatorNames: [], currentTurn: 1, player1Name: null, player2Name: null, newGameRequests: new Set() });
    }
    
    const room = rooms.get(roomCode);
    
    // Check if room is full BEFORE joining
    if (room.player1 && room.player2 && room.spectators.length >= 2) {
      console.log(`User ${socket.id} tried to join FULL room ${roomCode} (2 players + 2 spectators)`);
      socket.emit('roomFull');
      return;
    }
    
    // Now safe to join the socket room
    socket.join(roomCode);
    
    let playerNumber = null;
    let isSpectator = false;
    
    // Assign player number based on who joined first
    // First 2 are players, next 2 are spectators
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
    } else if (room.spectators.length < 2) {
      // Add as spectator (max 2 spectators)
      room.spectators.push(socket.id);
      room.spectatorNames.push(playerName);
      isSpectator = true;
      console.log(`User ${socket.id} (${playerName}) joined room ${roomCode} as SPECTATOR ${room.spectators.length}`);
    }
    
    // Send assignment to the joining player
    if (isSpectator) {
      socket.emit('spectatorAssignment', { 
        roomCode: roomCode,
        spectatorNumber: room.spectators.length,
        player1Name: room.player1Name,
        player2Name: room.player2Name
      });
      
      // Notify everyone in room about new spectator
      socket.to(roomCode).emit('spectatorJoined', { 
        socketId: socket.id,
        spectatorName: playerName,
        spectatorCount: room.spectators.length
      });
      
      // If game is already in progress, send current state to spectator
      if (room.player1 && room.player2) {
        socket.emit('gameReady', {
          player1: room.player1,
          player2: room.player2,
          player1Name: room.player1Name,
          player2Name: room.player2Name,
          currentTurn: room.currentTurn,
          isSpectator: true
        });
      }
    } else {
      // Send player assignment to the joining player
      socket.emit('playerAssignment', { 
        playerNumber: playerNumber,
        roomCode: roomCode 
      });
      
      // Notify others about the new player (including their name)
      socket.to(roomCode).emit('playerJoined', { 
        socketId: socket.id,
        playerNumber: playerNumber,
        playerName: playerName
      });
    }
    
    // If both players are now in the room, start the game
    if (room.player1 && room.player2 && !isSpectator) {
      // Only emit gameReady when player 2 joins (not spectators)
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
    const room = rooms.get(data.roomCode);
    if (!room) return;
    
    // Determine who is sending this update
    let senderType = 'spectator';
    let senderNumber = 0;
    
    if (room.player1 === socket.id) {
      senderType = 'player';
      senderNumber = 1;
    } else if (room.player2 === socket.id) {
      senderType = 'player';
      senderNumber = 2;
    } else {
      // Check which spectator this is (spectator 1 = senderNumber 3, spectator 2 = senderNumber 4)
      const spectatorIndex = room.spectators.indexOf(socket.id);
      if (spectatorIndex !== -1) {
        senderType = 'spectator';
        senderNumber = 3 + spectatorIndex; // Spectator 1 = 3, Spectator 2 = 4
      }
    }
    
    // Add sender info to the data
    data.senderType = senderType;
    data.senderNumber = senderNumber;
    
    // Broadcast to room (client will filter based on sender)
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
  
  // ============================================
  // VOICE CHAT SIGNALING
  // ============================================
  
  socket.on('voiceOffer', (data) => {
    console.log(`[VOICE] ==============================`);
    console.log(`[VOICE] Relaying OFFER in room ${data.roomCode}`);
    console.log(`[VOICE] From socket: ${socket.id}`);
    const room = rooms.get(data.roomCode);
    if (room) {
      const targetPlayer = room.player1 === socket.id ? room.player2 : room.player1;
      console.log(`[VOICE] To socket: ${targetPlayer}`);
    }
    console.log(`[VOICE] ==============================`);
    socket.to(data.roomCode).emit('voiceOffer', { offer: data.offer });
  });
  
  socket.on('voiceAnswer', (data) => {
    console.log(`[VOICE] ==============================`);
    console.log(`[VOICE] Relaying ANSWER in room ${data.roomCode}`);
    console.log(`[VOICE] From socket: ${socket.id}`);
    console.log(`[VOICE] ==============================`);
    socket.to(data.roomCode).emit('voiceAnswer', { answer: data.answer });
  });
  
  socket.on('voiceIceCandidate', (data) => {
    socket.to(data.roomCode).emit('voiceIceCandidate', { candidate: data.candidate });
  });
  
  // Voice call request (Player 2 asking Player 1 to initiate call)
  socket.on('voiceRequestCall', (data) => {
    console.log(`[VOICE] Player requesting call in room ${data.roomCode}`);
    socket.to(data.roomCode).emit('voiceRequestCall', {});
  });

  // --- NEW: Score Update (After Each Inning) ---
  socket.on('scoreUpdate', (data) => {
    console.log(`*** SCORE UPDATE in Room ${data.roomCode} ***`);
    socket.to(data.roomCode).emit('opponentScoreUpdate', data.scores);
  });

  socket.on('newGameRequest', (data) => {
    console.log(`*** NEW GAME REQUEST in Room ${data.roomCode} from ${socket.id} ***`);
    
    const room = rooms.get(data.roomCode);
    if (!room) {
      console.log(`ERROR: Room ${data.roomCode} not found!`);
      return;
    }
    
    // Add this player to the new game requests set
    room.newGameRequests.add(socket.id);
    
    console.log(`[NEW GAME] Requests so far: ${room.newGameRequests.size}/2`);
    
    // Check if both players have requested new game
    if (room.newGameRequests.size >= 2 && room.player1 && room.player2) {
      console.log(`[NEW GAME] Both players agreed! Starting new game in room ${data.roomCode}`);
      
      // Clear the requests for next game
      room.newGameRequests.clear();
      
      // Reset turn to player 1
      room.currentTurn = 1;
      
      // Notify both players to start new game
      io.to(data.roomCode).emit('newGameConfirmed', {
        roomCode: data.roomCode
      });
      
      // Also send turn change
      io.to(data.roomCode).emit('turnChanged', { 
        currentPlayer: 1,
        roomCode: data.roomCode 
      });
    } else {
      // Notify the opponent that this player wants a new game
      socket.to(data.roomCode).emit('opponentNewGameRequest');
      
      // Confirm to sender that their request was received
      socket.emit('newGameRequestSent');
    }
  });
  
  // Cancel new game request
  socket.on('cancelNewGameRequest', (data) => {
    console.log(`*** CANCEL NEW GAME REQUEST in Room ${data.roomCode} from ${socket.id} ***`);
    
    const room = rooms.get(data.roomCode);
    if (!room) return;
    
    room.newGameRequests.delete(socket.id);
    
    // Notify opponent that this player canceled their request
    socket.to(data.roomCode).emit('opponentCanceledNewGame');
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
      } else if (room.spectators && room.spectators.includes(socket.id)) {
        // Remove spectator
        const spectatorIndex = room.spectators.indexOf(socket.id);
        const spectatorName = room.spectatorNames[spectatorIndex];
        const spectatorNumber = spectatorIndex + 1; // 1-based: spectator 1 or spectator 2
        room.spectators.splice(spectatorIndex, 1);
        room.spectatorNames.splice(spectatorIndex, 1);
        console.log(`Spectator ${spectatorNumber} (${spectatorName}) left room ${roomCode}`);
        socket.to(roomCode).emit('spectatorLeft', { 
          spectatorName: spectatorName,
          spectatorNumber: spectatorNumber, // Which spectator left (1 or 2)
          spectatorCount: room.spectators.length 
        });
      }
      
      // Delete room if empty (no players AND no spectators)
      if (!room.player1 && !room.player2 && (!room.spectators || room.spectators.length === 0)) {
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