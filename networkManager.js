import * as THREE from 'three';
import { BowlliardsRulesEngine } from './scoring.js';

export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.isConnected = false;
    this.roomCode = null;
    this.serverUrl = 'https://bowlliards-multiplayer.onrender.com';
    
    this.ghostGroup = new THREE.Group();
    this.ghostHead = null;
    this.ghostHand1 = null;
    this.ghostHand2 = null;
    this.ghostNameLabel = null;
    
    this.localNameLabel = null;
    
    this.initGhost();
    this.initLocalNameLabel();
  }

  initGhost() {
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.4
    });

    const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
    this.ghostHead = new THREE.Mesh(headGeo, material);
    this.ghostGroup.add(this.ghostHead);

    const handGeo = new THREE.BoxGeometry(0.05, 0.08, 0.12);
    this.ghostHand1 = new THREE.Mesh(handGeo, material);
    this.ghostHand2 = new THREE.Mesh(handGeo, material);
    this.ghostGroup.add(this.ghostHand1);
    this.ghostGroup.add(this.ghostHand2);

    // Create name label for opponent (cyan color)
    this.ghostNameLabel = this.createNameLabel('Opponent', false);
    this.ghostGroup.add(this.ghostNameLabel);

    this.ghostGroup.visible = false;
    this.game.scene.add(this.ghostGroup);
  }

  createNameLabel(text, isLocal = false) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    // Draw background with rounded corners
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text with glow effect
    context.font = 'bold 64px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Use different colors for local vs remote player
    const glowColor = isLocal ? '#00ff00' : '#00ffff';
    const textColor = isLocal ? '#00ff00' : '#00ffff';
    
    // Add text shadow/glow
    context.shadowColor = glowColor;
    context.shadowBlur = 10;
    context.fillStyle = '#ffffff';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // Draw text again without shadow for crispness
    context.shadowBlur = 0;
    context.fillStyle = textColor;
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false,  // Always render on top
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.5, 0.125, 1);  // Slightly larger
    sprite.position.set(0, 0.25, 0); // Above the head

    return sprite;
  }

  initLocalNameLabel() {
    // Create name label for local player using actual player name (green)
    const playerName = this.game.myPlayerName || 'Player';
    this.localNameLabel = this.createNameLabel(playerName, true);
    this.localNameLabel.visible = false;
    this.game.scene.add(this.localNameLabel);
  }

  updateLocalNameLabel() {
    if (!this.localNameLabel || !this.game.isMultiplayer || !this.game.gameStarted) {
      if (this.localNameLabel) this.localNameLabel.visible = false;
      return;
    }

    this.localNameLabel.visible = true;
    
    // Position above local player's head (camera position)
    const headPos = new THREE.Vector3();
    this.game.camera.getWorldPosition(headPos);
    this.localNameLabel.position.copy(headPos);
    this.localNameLabel.position.y += 0.3; // Above head
  }

  updateGhostNameLabel(opponentName) {
    if (this.ghostNameLabel && opponentName) {
      // Recreate the label with new name (cyan for opponent)
      this.ghostGroup.remove(this.ghostNameLabel);
      this.ghostNameLabel = this.createNameLabel(opponentName, false);
      this.ghostGroup.add(this.ghostNameLabel);
    }
  }

  updateMyNameLabel(newName) {
    if (this.localNameLabel && newName) {
      // Recreate the label with new name (green for local player)
      this.game.scene.remove(this.localNameLabel);
      this.localNameLabel = this.createNameLabel(newName, true);
      this.localNameLabel.visible = this.game.isMultiplayer && this.game.gameStarted;
      this.game.scene.add(this.localNameLabel);
      this.game.myPlayerName = newName;
    }
  }

  connect() {
    if (typeof io === 'undefined') {
      console.warn('[NETWORK] Socket.io not loaded - multiplayer disabled');
      return;
    }

    console.log('[NETWORK] Connecting to:', this.serverUrl);
    this.socket = io(this.serverUrl);

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('[NETWORK] Connected to Server');
      
      // Request current player count
      this.socket.emit('requestPlayerCount');
    });

    this.socket.on('connect_error', (err) => {
      console.error('[NETWORK] Connection error:', err);
    });

    // NEW: Server assigns player number automatically
    this.socket.on('playerAssignment', (data) => {
      console.log('[NETWORK] ===== PLAYER ASSIGNMENT =====');
      console.log('[NETWORK] Assigned Player Number:', data.playerNumber);
      console.log('[NETWORK] Room Code:', data.roomCode);
      
      this.game.myPlayerNumber = data.playerNumber;
      this.roomCode = data.roomCode;
      
      // Hide both waiting screen AND lobby (in case player was matched immediately)
      if (window.hideCancelButton) {
        window.hideCancelButton();
      }
      if (window.hideAllOverlays) {
        window.hideAllOverlays();
      }
      
      // Player 1 (first to join) is host and goes first
      const isMyTurn = (data.playerNumber === 1);
      console.log('[NETWORK] My Turn:', isMyTurn ? 'YES (I GO FIRST)' : 'NO (WAITING)');
      
      if (this.game.setTurnState) {
        this.game.setTurnState(isMyTurn);
      }
      
      const roleText = data.playerNumber === 1 ? 'HOST (Player 1)' : 'GUEST (Player 2)';
      this.game.showNotification(`You are ${roleText}. ${isMyTurn ? 'Your turn!' : 'Waiting for opponent...'}`, 3000);
      console.log('[NETWORK] ===== END PLAYER ASSIGNMENT =====');
    });

    // Room is full - cannot join
    this.socket.on('roomFull', () => {
      console.log('[NETWORK] Room is full!');
      this.game.showNotification('Room is full! Only 2 players allowed.', 5000);
    });

    // NEW: Waiting for opponent in public match
    this.socket.on('waitingForOpponent', (data) => {
      console.log('[NETWORK] Waiting for opponent in room:', data.roomCode);
      this.roomCode = data.roomCode;
      this.game.showNotification('Waiting for opponent to join...', 10000);
      
      // Show cancel button if available
      if (window.showCancelButton) {
        window.showCancelButton();
      }
    });
    
    // NEW: Matchmaking canceled
    this.socket.on('matchmakingCanceled', () => {
      console.log('[NETWORK] Matchmaking canceled');
      this.roomCode = null;
      this.game.isMultiplayer = false;
      this.game.showNotification('Matchmaking canceled', 2000);
      
      // Hide cancel button and show lobby
      if (window.hideCancelButton) {
        window.hideCancelButton();
      }
      if (window.showLobby) {
        window.showLobby();
      }
    });
    
    // NEW: Player count update
    this.socket.on('playerCount', (data) => {
      console.log('[NETWORK] Players online:', data.count);
      if (window.updatePlayerCount) {
        window.updatePlayerCount(data.count);
      }
    });

    // Game ready - both players connected
    this.socket.on('gameReady', (data) => {
      console.log('[NETWORK] ===== GAME READY =====');
      console.log('[NETWORK] Both players connected!');
      console.log('[NETWORK] Player 1:', data.player1, data.player1Name);
      console.log('[NETWORK] Player 2:', data.player2, data.player2Name);
      
      // Store opponent's name
      if (this.game.myPlayerNumber === 1) {
        this.game.remotePlayerName = data.player2Name || 'Opponent';
      } else {
        this.game.remotePlayerName = data.player1Name || 'Opponent';
      }
      
      // Update ghost name label with opponent's name
      this.updateGhostNameLabel(this.game.remotePlayerName);
      
      console.log('[NETWORK] Opponent name:', this.game.remotePlayerName);
      
      // Hide all overlays (waiting screen AND lobby)
      if (window.hideCancelButton) {
        window.hideCancelButton();
      }
      if (window.hideAllOverlays) {
        window.hideAllOverlays();
      }
      
      this.game.isMultiplayer = true;
      this.game.gameStarted = true;  // Mark game as actually started
      this.game.showNotification('Both players connected! Game starting...', 3000);
      
      // Play "It is your turn" sound for Player 1 now that game has started
      if (this.game.myPlayerNumber === 1 && this.game.soundManager) {
        this.game.soundManager.playSound('yourTurn', null, 1.0);
      }
      
      console.log('[NETWORK] ===== END GAME READY =====');
    });

    // DEPRECATED: Old roomJoined handler (kept for backwards compatibility)
    this.socket.on('roomJoined', (data) => {
      console.log('[NETWORK] [DEPRECATED] Old roomJoined event received');
      console.log('[NETWORK] Use playerAssignment instead');
    });

    // Opponent joined/left notifications
    this.socket.on('playerJoined', (data) => {
      console.log('[NETWORK] Player joined room:', data);
      const playerText = data.playerNumber === 1 ? 'Player 1 (Host)' : 'Player 2 (Guest)';
      this.game.showNotification(`${playerText} connected!`, 2000);
    });

    this.socket.on('opponentLeft', (data) => {
      console.log('[NETWORK] Opponent left (Player', data.playerNumber, ')');
      this.game.showNotification('Opponent disconnected!', 5000);
      this.game.isMultiplayer = false;
    });

    // Opponent avatar movement
    this.socket.on('opponentMoved', (data) => {
      this.ghostGroup.visible = true;
      this.ghostHead.position.set(data.head.x, data.head.y, data.head.z);
      this.ghostHead.quaternion.set(data.head.qx, data.head.qy, data.head.qz, data.head.qw);
      
      // Update name label position to follow head
      if (this.ghostNameLabel) {
        this.ghostNameLabel.position.set(data.head.x, data.head.y + 0.25, data.head.z);
      }

      if (data.hand1) {
        this.ghostHand1.visible = true;
        this.ghostHand1.position.set(data.hand1.x, data.hand1.y, data.hand1.z);
        this.ghostHand1.quaternion.set(data.hand1.qx, data.hand1.qy, data.hand1.qz, data.hand1.qw);
      } else {
        this.ghostHand1.visible = false;
      }

      if (data.hand2) {
        this.ghostHand2.visible = true;
        this.ghostHand2.position.set(data.hand2.x, data.hand2.y, data.hand2.z);
        this.ghostHand2.quaternion.set(data.hand2.qx, data.hand2.qy, data.hand2.qz, data.hand2.qw);
      } else {
        this.ghostHand2.visible = false;
      }
    });

    // Shot from opponent
    this.socket.on('opponentShot', (data) => {
      console.log('[NETWORK] RX: Opponent Shot');
      this.game.showNotification('Opponent is shooting...', 1500);
      const direction = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
      this.game.executeRemoteShot(direction, data.power, data.spin);
    });

    // Table state sync
    this.socket.on('tableStateUpdate', (data) => {
      if (!this.game.isAuthority) {
        this.game.poolTable.importState(data.balls);
      }
    });

    // Opponent finished their frame
    this.socket.on('opponentFrameComplete', (scoresData) => {
      console.log('[NETWORK] ===== OPPONENT FRAME COMPLETE RECEIVED =====');
      console.log('[NETWORK] Received scores:', JSON.stringify(scoresData, null, 2));
      console.log('[NETWORK] My player info:', {
        myPlayerNumber: this.game.myPlayerNumber,
        isMyTurn: this.game.isMyTurn
      });
      
      if (this.game.remoteRulesEngine && scoresData) {
        console.log('[NETWORK] Before import - Remote engine state:', {
          currentFrame: this.game.remoteRulesEngine.currentFrame,
          frame0Inning1: this.game.remoteRulesEngine.frames[0].inning1,
          frame0Inning2: this.game.remoteRulesEngine.frames[0].inning2
        });
        
        this.game.remoteRulesEngine.importScores(scoresData);
        
        console.log('[NETWORK] After import - Remote engine state:', {
          currentFrame: this.game.remoteRulesEngine.currentFrame,
          frame0Inning1: this.game.remoteRulesEngine.frames[0].inning1,
          frame0Inning2: this.game.remoteRulesEngine.frames[0].inning2,
          totalScore: this.game.remoteRulesEngine.getTotalScore()
        });
      } else {
        console.log('[NETWORK] ✗ Cannot import scores:', {
          hasRemoteEngine: !!this.game.remoteRulesEngine,
          hasScoresData: !!scoresData
        });
      }
      
      this.game.onOpponentFrameComplete();
      this.game.updateScoreboard(); // Force scoreboard update after importing scores
      this.game.checkGameComplete();
      console.log('[NETWORK] ===== END OPPONENT FRAME COMPLETE =====');
    });

    // NEW: Opponent score update (after each inning)
    this.socket.on('opponentScoreUpdate', (scoresData) => {
      console.log('[NETWORK] ===== OPPONENT SCORE UPDATE RECEIVED =====');
      console.log('[NETWORK] Received scores:', JSON.stringify(scoresData, null, 2));
      console.log('[NETWORK] My player info:', {
        myPlayerNumber: this.game.myPlayerNumber,
        isMyTurn: this.game.isMyTurn
      });
      
      if (this.game.remoteRulesEngine && scoresData) {
        console.log('[NETWORK] Before import - Remote engine state:', {
          currentFrame: this.game.remoteRulesEngine.currentFrame,
          frame0: this.game.remoteRulesEngine.frames[0]
        });
        
        this.game.remoteRulesEngine.importScores(scoresData);
        
        console.log('[NETWORK] After import - Remote engine state:', {
          currentFrame: this.game.remoteRulesEngine.currentFrame,
          frame0: this.game.remoteRulesEngine.frames[0],
          totalScore: this.game.remoteRulesEngine.getTotalScore()
        });
        
        this.game.updateScoreboard(); // Update scoreboard immediately
        console.log('[NETWORK] ✓ Scoreboard updated with opponent progress');
      } else {
        console.log('[NETWORK] ✗ Cannot import scores:', {
          hasRemoteEngine: !!this.game.remoteRulesEngine,
          hasScoresData: !!scoresData
        });
      }
      console.log('[NETWORK] ===== END OPPONENT SCORE UPDATE =====');
    });

    // Server announcing whose turn it is
    this.socket.on('turnChanged', (data) => {
      console.log('[NETWORK] ===== TURN CHANGED =====');
      console.log('[NETWORK] Server says current player is:', data.currentPlayer);
      console.log('[NETWORK] My player number is:', this.game.myPlayerNumber);
      
      const isMyTurn = (data.currentPlayer === this.game.myPlayerNumber);
      console.log('[NETWORK] Is it my turn?', isMyTurn ? 'YES' : 'NO');
      
      if (this.game.setTurnState) {
        this.game.setTurnState(isMyTurn);
        console.log('[NETWORK] ✓ Turn state updated');
      } else {
        console.log('[NETWORK] ✗ setTurnState not available!');
      }
      console.log('[NETWORK] ===== END TURN CHANGED =====');
    });

    this.socket.on('disconnect', () => {
      console.log('[NETWORK] Disconnected from server');
      this.isConnected = false;
      this.game.showNotification('Lost connection to server', 3000);
    });
    
    // NEW: Physics update from admin
    this.socket.on('physicsUpdate', (params) => {
      console.log('[NETWORK] Received physics update from admin');
      if (this.game.poolTable && this.game.poolTable.physicsEngine) {
        this.game.poolTable.physicsEngine.updateAllParams(params);
        this.game.showNotification('Physics settings updated!', 2000);
      }
    });
  }

  joinRoom(roomCode) {
    if (!this.socket || !this.isConnected) {
      this.connect();
      setTimeout(() => this.joinRoom(roomCode), 500);
      return;
    }
    this.roomCode = roomCode;
    console.log('[NETWORK] Joining room:', roomCode);
    
    // Setup multiplayer mode
    if (this.game) {
      this.game.isMultiplayer = true;

      if (!this.game.remoteRulesEngine) {
        this.game.remoteRulesEngine = new BowlliardsRulesEngine();
      }

      if (this.game.scoreboard && this.game.scoreboard.mode !== 'multi') {
        this.game.scoreboard.setupBoard('multi');
      }

      console.log('[NETWORK] Waiting for server to assign player number...');
    }

    this.socket.emit('joinRoom', { 
      roomCode: roomCode,
      playerName: this.game.myPlayerName 
    });
  }
  
  // NEW: Join public matchmaking queue
  joinPublicMatch() {
    if (!this.socket || !this.isConnected) {
      this.connect();
      setTimeout(() => this.joinPublicMatch(), 500);
      return;
    }
    
    console.log('[NETWORK] Joining public matchmaking...');
    this.game.showNotification('Finding opponent...', 2000);
    
    // Setup multiplayer mode
    if (this.game) {
      this.game.isMultiplayer = true;

      if (!this.game.remoteRulesEngine) {
        this.game.remoteRulesEngine = new BowlliardsRulesEngine();
      }

      if (this.game.scoreboard && this.game.scoreboard.mode !== 'multi') {
        this.game.scoreboard.setupBoard('multi');
      }

      console.log('[NETWORK] Waiting for matchmaking...');
    }

    // Emit to server to find/create public room (with player name)
    this.socket.emit('joinPublicMatch', {
      playerName: this.game.myPlayerName
    });
  }
  
  // NEW: Cancel public matchmaking
  cancelMatchmaking() {
    if (!this.socket || !this.isConnected) return;
    
    console.log('[NETWORK] Canceling matchmaking...');
    this.socket.emit('cancelMatchmaking');
  }
  
  handleVRStart() {
    if (!this.isConnected && this.roomCode) {
      console.log('[NETWORK] Reconnecting on VR start');
      this.connect();
      setTimeout(() => this.joinRoom(this.roomCode), 500);
    }
  }

  sendAvatarUpdate() {
    if (!this.isConnected || !this.roomCode) return;

    const headPos = new THREE.Vector3();
    const headQuat = new THREE.Quaternion();
    this.game.camera.getWorldPosition(headPos);
    this.game.camera.getWorldQuaternion(headQuat);

    const data = {
      roomCode: this.roomCode,
      head: {
        x: headPos.x,
        y: headPos.y,
        z: headPos.z,
        qx: headQuat.x,
        qy: headQuat.y,
        qz: headQuat.z,
        qw: headQuat.w
      },
      hand1: null,
      hand2: null
    };

    if (this.game.controller1) {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      this.game.controller1.getWorldPosition(p);
      this.game.controller1.getWorldQuaternion(q);
      data.hand1 = { x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
    }

    if (this.game.controller2) {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      this.game.controller2.getWorldPosition(p);
      this.game.controller2.getWorldQuaternion(q);
      data.hand2 = { x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
    }

    this.socket.emit('updateAvatar', data);
  }

  sendShot(direction, power, spin) {
    if (!this.isConnected || !this.roomCode) return;
    console.log('[NETWORK] Sending shot to opponent');
    this.socket.emit('takeShot', {
      roomCode: this.roomCode,
      dir: { x: direction.x, y: direction.y, z: direction.z },
      power,
      spin
    });
  }

  sendTableState(ballsData) {
    if (!this.isConnected || !this.roomCode) return;
    this.socket.emit('tableStateUpdate', { roomCode: this.roomCode, balls: ballsData });
  }

  sendFrameComplete(scoresData) {
    if (!this.isConnected || !this.roomCode) return;
    console.log('[NETWORK] Sending frame complete');
    this.socket.emit('frameComplete', { 
      roomCode: this.roomCode, 
      scores: scoresData 
    });
  }

  sendScoreUpdate(scoresData) {
    if (!this.isConnected || !this.roomCode) return;
    console.log('[NETWORK] Sending score update (inning complete)');
    this.socket.emit('scoreUpdate', { 
      roomCode: this.roomCode, 
      scores: scoresData 
    });
  }
}