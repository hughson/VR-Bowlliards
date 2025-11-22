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
    
    this.initGhost();
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

    this.ghostGroup.visible = false;
    this.game.scene.add(this.ghostGroup);
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
    });

    this.socket.on('connect_error', (err) => {
      console.error('[NETWORK] Connection error:', err);
    });

    // Server says: you joined a room, here's your player number
    this.socket.on('roomJoined', (data) => {
      console.log('[NETWORK] Room Joined. Player Number:', data.playerNumber);
      this.game.myPlayerNumber = data.playerNumber;

      if (data.playerNumber === 2) {
        this.game.isMyTurn = false;
        this.game.showNotification('You are Player 2. Waiting for Player 1...', 3000);
      } else {
        this.game.isMyTurn = true;
        this.game.showNotification('You are Player 1. Your turn!', 2000);
      }

      this.game.updateScoreboard();
    });

    // Host gets notified when the second player joins
    this.socket.on('playerJoined', (id) => {
      console.log('[NETWORK] Opponent joined:', id);
      this.game.isMultiplayer = true;

      if (!this.game.remoteRulesEngine) {
        this.game.remoteRulesEngine = new BowlliardsRulesEngine();
      }

      if (this.game.scoreboard) {
        this.game.scoreboard.setupBoard('multi');
        this.game.updateScoreboard();
      }

      this.game.showNotification('Opponent Connected! Game Starting...', 3000);
    });

    // Opponent avatar movement
    this.socket.on('opponentMoved', (data) => {
      this.ghostGroup.visible = true;

      this.ghostHead.position.set(data.head.x, data.head.y, data.head.z);
      this.ghostHead.quaternion.set(
        data.head.qx,
        data.head.qy,
        data.head.qz,
        data.head.qw
      );

      if (data.hand1) {
        this.ghostHand1.visible = true;
        this.ghostHand1.position.set(data.hand1.x, data.hand1.y, data.hand1.z);
        this.ghostHand1.quaternion.set(
          data.hand1.qx,
          data.hand1.qy,
          data.hand1.qz,
          data.hand1.qw
        );
      } else {
        this.ghostHand1.visible = false;
      }

      if (data.hand2) {
        this.ghostHand2.visible = true;
        this.ghostHand2.position.set(data.hand2.x, data.hand2.y, data.hand2.z);
        this.ghostHand2.quaternion.set(
          data.hand2.qx,
          data.hand2.qy,
          data.hand2.qz,
          data.hand2.qw
        );
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
      console.log('[NETWORK] Opponent frame complete');
      if (this.game.remoteRulesEngine && scoresData) {
        this.game.remoteRulesEngine.importScores(scoresData);
      }
      this.game.onOpponentFrameComplete();
      this.game.checkGameComplete();
    });

    // Server announcing whose turn it is (if you use this on backend)
    this.socket.on('turnChanged', (data) => {
      this.game.isMyTurn = (data.currentPlayer === this.game.myPlayerNumber);

      if (this.game.isMyTurn) {
        this.game.showNotification('Your Turn!', 2000);
      } else {
        this.game.showNotification("Opponent's Turn", 2000);
      }

      this.game.updateScoreboard();
    });

    this.socket.on('disconnect', () => {
      console.log('[NETWORK] Disconnected from server');
      this.isConnected = false;
      this.game.showNotification('Lost connection to server', 3000);
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
    
    // As soon as we attempt to join a room, treat this client as multiplayer.
    if (this.game) {
      this.game.isMultiplayer = true;

      if (!this.game.remoteRulesEngine) {
        this.game.remoteRulesEngine = new BowlliardsRulesEngine();
      }

      if (this.game.scoreboard && this.game.scoreboard.mode !== 'multi') {
        this.game.scoreboard.setupBoard('multi');
        this.game.updateScoreboard();
      }

      console.log(
        '[NETWORK] joinRoom -> Multiplayer ON. myPlayerNumber =',
        this.game.myPlayerNumber,
        'isMyTurn =',
        this.game.isMyTurn
      );
    }

    this.socket.emit('joinRoom', roomCode);
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

  // --- SEND FRAME COMPLETE ---
  sendFrameComplete(scoresData) {
    if (!this.isConnected || !this.roomCode) return;
    console.log('[NETWORK] Sending frame complete');
    this.socket.emit('frameComplete', { 
      roomCode: this.roomCode, 
      scores: scoresData 
    });
  }
}