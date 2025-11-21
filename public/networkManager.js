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
    
    this.statusMesh = null; 
    
    this.initGhost();
    this.initStatusIndicator();
  }

  initStatusIndicator() {
    const geo = new THREE.SphereGeometry(0.05, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); 
    this.statusMesh = new THREE.Mesh(geo, mat);
    this.statusMesh.position.set(0, 1.5, -1.5); 
    this.game.scene.add(this.statusMesh);
  }

  updateStatus(colorHex) {
    if (this.statusMesh) {
        this.statusMesh.material.color.setHex(colorHex);
    }
  }

  createGhostController(material) {
    const group = new THREE.Group();
    const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.15, 12);
    handleGeo.rotateX(-Math.PI / 2); 
    const handle = new THREE.Mesh(handleGeo, material);
    handle.position.z = 0.04; 
    group.add(handle);
    const headGeo = new THREE.TorusGeometry(0.045, 0.008, 8, 16);
    const head = new THREE.Mesh(headGeo, material);
    head.position.z = -0.05; 
    group.add(head);
    return group;
  }

  initGhost() {
    const ghostMat = new THREE.MeshBasicMaterial({ 
        color: 0x0088ff, 
        side: THREE.DoubleSide,
        depthTest: false
    });

    const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
    this.ghostHead = new THREE.Mesh(headGeo, ghostMat);
    this.ghostHead.renderOrder = 999;
    this.ghostGroup.add(this.ghostHead);
    
    this.ghostHand1 = this.createGhostController(ghostMat);
    this.ghostHand1.renderOrder = 999;
    this.ghostGroup.add(this.ghostHand1);
    
    this.ghostHand2 = this.createGhostController(ghostMat);
    this.ghostHand2.renderOrder = 999;
    this.ghostGroup.add(this.ghostHand2);
    
    this.ghostGroup.visible = false;
    this.ghostHead.visible = false;
    this.ghostHand1.visible = false;
    this.ghostHand2.visible = false;
    
    this.game.scene.add(this.ghostGroup);
  }

  connect() {
    if (typeof io === 'undefined') return;

    this.socket = io(this.serverUrl);

    this.socket.on('connect', () => {
        this.isConnected = true;
        this.updateStatus(0xffff00); // Yellow
        console.log("Connected to Server");
    });

    // --- ROOM JOINED (Assign Player Number) ---
    this.socket.on('roomJoined', (data) => {
        console.log("Room Joined. Player Number:", data.playerNumber);
        this.game.myPlayerNumber = data.playerNumber;
        
        // Player 2 waits for Player 1's turn
        if (data.playerNumber === 2) {
            this.game.isMyTurn = false;
            this.game.showNotification("You are Player 2. Waiting for Player 1...", 3000);
        } else {
            this.game.isMyTurn = true;
            this.game.showNotification("You are Player 1. Your turn!", 2000);
        }
    });

    // --- OPPONENT CONNECTED ---
    this.socket.on('playerJoined', (id) => {
        this.updateStatus(0x00ff00); // Green
        this.game.isMultiplayer = true;
        
        // Initialize remote rules engine
        this.game.remoteRulesEngine = new BowlliardsRulesEngine();
        
        // Switch to multiplayer scoreboard
        if (this.game.scoreboard) {
            this.game.scoreboard.setupBoard('multi');
            this.game.updateScoreboard();
        }
        
        this.game.showNotification('Opponent Connected! Game Starting...', 3000);
    });
    
    // --- AVATAR UPDATE ---
    this.socket.on('opponentMoved', (data) => {
        this.updateStatus(0x00ff00); 
        
        if (!this.ghostGroup.visible) this.ghostGroup.visible = true;
        
        const hasHand1 = !!data.hand1;
        const hasHand2 = !!data.hand2;
        const isVR = hasHand1 || hasHand2;

        this.ghostHead.visible = !isVR;

        if (data.head && typeof data.head.x === 'number') {
            this.ghostHead.position.set(data.head.x, data.head.y, data.head.z);
            this.ghostHead.quaternion.set(data.head.qx, data.head.qy, data.head.qz, data.head.qw);
        }

        if (hasHand1) {
            this.ghostHand1.visible = true;
            this.ghostHand1.position.set(data.hand1.x, data.hand1.y, data.hand1.z);
            this.ghostHand1.quaternion.set(data.hand1.qx, data.hand1.qy, data.hand1.qz, data.hand1.qw);
        } else {
            this.ghostHand1.visible = false;
        }

        if (hasHand2) {
            this.ghostHand2.visible = true;
            this.ghostHand2.position.set(data.hand2.x, data.hand2.y, data.hand2.z);
            this.ghostHand2.quaternion.set(data.hand2.qx, data.hand2.qy, data.hand2.qz, data.hand2.qw);
        } else {
            this.ghostHand2.visible = false;
        }
    });

    // --- SHOT RECEIVED ---
    this.socket.on('opponentShot', (data) => {
        console.log("RX: Opponent Shot");
        this.game.showNotification('Opponent is shooting...', 1500);
        
        const direction = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
        this.game.executeRemoteShot(direction, data.power, data.spin);
    });

    // --- PHYSICS SYNC ---
    this.socket.on('tableStateUpdate', (data) => {
        if (!this.game.isAuthority) {
            this.game.poolTable.importState(data.balls);
        }
    });

    // --- OPPONENT FRAME COMPLETE ---
    this.socket.on('opponentFrameComplete', (scoresData) => {
        console.log("RX: Opponent Frame Complete");
        
        // Import opponent's scores
        if (this.game.remoteRulesEngine && scoresData) {
            this.game.remoteRulesEngine.importScores(scoresData);
        }
        
        // Check if opponent finished all 10 frames
        if (this.game.remoteRulesEngine && this.game.remoteRulesEngine.isGameComplete()) {
            const opponentScore = this.game.remoteRulesEngine.getTotalScore();
            this.game.showNotification(`Opponent finished! Score: ${opponentScore}`, 3000);
            
            // If both players are done, determine winner
            if (this.game.rulesEngine.isGameComplete()) {
                const myScore = this.game.rulesEngine.getTotalScore();
                if (myScore > opponentScore) {
                    this.game.showNotification(`YOU WIN! ${myScore} vs ${opponentScore}`, 5000);
                } else if (opponentScore > myScore) {
                    this.game.showNotification(`YOU LOSE! ${myScore} vs ${opponentScore}`, 5000);
                } else {
                    this.game.showNotification(`TIE GAME! ${myScore} vs ${opponentScore}`, 5000);
                }
            }
        } else {
            // Opponent still playing, it's your turn now
            this.game.isMyTurn = true;
            this.game.showNotification("Your turn! Start your next frame.", 2500);
            
            // Reset table for your turn
            this.game.setupNewFrame(true);
            this.game.gameState = 'ready';
            this.game.ballInHand.enable(true);
        }
        
        this.game.updateScoreboard();
    });

    // --- TURN CHANGE ---
    this.socket.on('turnChanged', (data) => {
        this.game.isMyTurn = (data.currentPlayer === this.game.myPlayerNumber);
        
        if (this.game.isMyTurn) {
            this.game.showNotification("Your Turn!", 2000);
        } else {
            this.game.showNotification("Opponent's Turn", 2000);
        }
        
        this.game.updateScoreboard();
    });
  }

  joinRoom(roomCode) {
    if (!this.socket || !this.isConnected) {
        this.connect();
        setTimeout(() => this.joinRoom(roomCode), 500);
        return;
    }
    this.roomCode = roomCode;
    this.socket.emit('joinRoom', roomCode);
  }
  
  handleVRStart() {
    if (!this.isConnected && this.roomCode) {
        this.connect(); 
        setTimeout(() => this.joinRoom(this.roomCode), 500);
    }
  }
  
  sendAvatarUpdate() {
    if (!this.isConnected || !this.roomCode) return;
    
    const headPos = new THREE.Vector3();
    const headRot = new THREE.Quaternion();
    this.game.camera.getWorldPosition(headPos);
    this.game.camera.getWorldQuaternion(headRot);

    const data = {
        roomCode: this.roomCode,
        head: { 
            x: headPos.x, y: headPos.y, z: headPos.z,
            qx: headRot.x, qy: headRot.y, qz: headRot.z, qw: headRot.w
        },
        hand1: null,
        hand2: null
    };
    
    if (this.game.controller1) {
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        this.game.controller1.getWorldPosition(p);
        this.game.controller1.getWorldQuaternion(q);
        if (p.lengthSq() > 0.01) data.hand1 = { x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
    }
    
    if (this.game.controller2) {
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        this.game.controller2.getWorldPosition(p);
        this.game.controller2.getWorldQuaternion(q);
        if (p.lengthSq() > 0.01) data.hand2 = { x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
    }
    
    this.socket.emit('updateAvatar', data);
  }

  sendShot(direction, power, spin) {
    if (!this.isConnected || !this.roomCode) return;
    const shotData = { 
        roomCode: this.roomCode, 
        dir: { x: direction.x, y: direction.y, z: direction.z }, 
        power: power, 
        spin: spin 
    };
    this.socket.emit('takeShot', shotData);
  }

  sendTableState(ballsData) {
    if (!this.isConnected || !this.roomCode) return;
    this.socket.emit('tableStateUpdate', { roomCode: this.roomCode, balls: ballsData });
  }

  // --- SEND FRAME COMPLETE ---
  sendFrameComplete(scoresData) {
    if (!this.isConnected || !this.roomCode) return;
    this.socket.emit('frameComplete', { 
        roomCode: this.roomCode, 
        scores: scoresData 
    });
  }
}
