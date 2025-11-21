import * as THREE from 'three';

export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.isConnected = false;
    this.roomCode = null;
    this.serverUrl = 'http://localhost:3000'; 
    
    this.ghostGroup = new THREE.Group();
    this.ghostHead = null;
    this.ghostHand1 = null;
    this.ghostHand2 = null;
    
    this.statusMesh = null; 
    
    this.initGhost();
    this.initStatusIndicator();
  }

  initStatusIndicator() {
    // Status Light: Red=Offline, Yellow=Connected, Green=Online
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
    // Handle
    const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.15, 12);
    handleGeo.rotateX(-Math.PI / 2); 
    const handle = new THREE.Mesh(handleGeo, material);
    handle.position.z = 0.04; 
    group.add(handle);
    // Ring
    const headGeo = new THREE.TorusGeometry(0.045, 0.008, 8, 16);
    const head = new THREE.Mesh(headGeo, material);
    head.position.z = -0.05; 
    group.add(head);
    return group;
  }

  initGhost() {
    // Solid Blue Material (High Visibility)
    const ghostMat = new THREE.MeshBasicMaterial({ 
        color: 0x0088ff, 
        side: THREE.DoubleSide,
        depthTest: false // Always visible through walls
    });

    // 1. Head (Backup for Desktop)
    const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
    this.ghostHead = new THREE.Mesh(headGeo, ghostMat);
    this.ghostHead.renderOrder = 999;
    this.ghostGroup.add(this.ghostHead);
    
    // 2. Hands (Primary for VR)
    this.ghostHand1 = this.createGhostController(ghostMat);
    this.ghostHand1.renderOrder = 999;
    this.ghostGroup.add(this.ghostHand1);
    
    this.ghostHand2 = this.createGhostController(ghostMat);
    this.ghostHand2.renderOrder = 999;
    this.ghostGroup.add(this.ghostHand2);
    
    // Start Hidden
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

    this.socket.on('playerJoined', (id) => {
        this.updateStatus(0x00ff00); // Green
        this.game.showNotification('Opponent Connected!', 3000);
    });
    
    // --- AVATAR UPDATE ---
    this.socket.on('opponentMoved', (data) => {
        this.updateStatus(0x00ff00); 
        
        if (!this.ghostGroup.visible) this.ghostGroup.visible = true;
        
        const hasHand1 = !!data.hand1;
        const hasHand2 = !!data.hand2;
        const isVR = hasHand1 || hasHand2;

        // Logic: If VR, hide Head. If Desktop, show Head.
        this.ghostHead.visible = !isVR;

        // Update Head
        if (data.head && typeof data.head.x === 'number') {
            this.ghostHead.position.set(data.head.x, data.head.y, data.head.z);
            this.ghostHead.quaternion.set(data.head.qx, data.head.qy, data.head.qz, data.head.qw);
        }

        // Update Hand 1
        if (hasHand1) {
            this.ghostHand1.visible = true;
            this.ghostHand1.position.set(data.hand1.x, data.hand1.y, data.hand1.z);
            this.ghostHand1.quaternion.set(data.hand1.qx, data.hand1.qy, data.hand1.qz, data.hand1.qw);
        } else {
            this.ghostHand1.visible = false;
        }

        // Update Hand 2
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
        this.game.showNotification('INCOMING SHOT!', 2000);
        
        const direction = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
        this.game.executeRemoteShot(direction, data.power, data.spin);
    });

    // --- PHYSICS SYNC ---
    this.socket.on('tableStateUpdate', (data) => {
        // Only update if we are NOT the authority (we are watching)
        if (!this.game.isAuthority) {
            this.game.poolTable.importState(data.balls);
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

  // --- SEND SHOT COMMAND ---
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

  // --- SEND PHYSICS SYNC ---
  sendTableState(ballsData) {
    if (!this.isConnected || !this.roomCode) return;
    this.socket.emit('tableStateUpdate', { roomCode: this.roomCode, balls: ballsData });
  }
}