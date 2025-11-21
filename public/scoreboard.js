import * as THREE from 'three';

export class Scoreboard {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'single'; // 'single' or 'multi'
    
    this.currentMeshGroup = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    
    // Default to Single Player on load
    this.setupBoard('single');
  }

  setupBoard(mode) {
    // 1. Clean up old mesh if it exists
    if (this.currentMeshGroup) {
        this.scene.remove(this.currentMeshGroup);
        // Dispose memory
        this.currentMeshGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }

    this.mode = mode;
    this.currentMeshGroup = new THREE.Group();

    // 2. Define Dimensions
    let boardWidth, boardHeight, canvasW, canvasH;

    if (mode === 'multi') {
        // --- MULTIPLAYER: Wide Board (Side-by-Side) ---
        boardWidth = 3.4; 
        boardHeight = 1.0;
        canvasW = 2048; 
        canvasH = 640;
    } else {
        // --- SINGLE PLAYER: Standard Board ---
        boardWidth = 1.8;
        boardHeight = 0.8;
        canvasW = 1024;
        canvasH = 512;
    }

    // Resize Canvas
    this.canvas.width = canvasW;
    this.canvas.height = canvasH;
    this.texture = new THREE.CanvasTexture(this.canvas); 
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // 3. Build Mesh
    const boardMat = new THREE.MeshBasicMaterial({ color: 0x001a1a, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth, boardHeight), boardMat);
    this.currentMeshGroup.add(board);

    // Border Glow
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const border = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth + 0.05, boardHeight + 0.05), borderMat);
    border.position.z = -0.01;
    this.currentMeshGroup.add(border);

    // Text Plane
    const textMat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide });
    const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth - 0.1, boardHeight - 0.05), textMat);
    textPlane.position.z = 0.01;
    this.currentMeshGroup.add(textPlane);

    // Stand / Easel
    this.addStand(boardHeight);

    // Position in scene (Back Left Corner)
    this.currentMeshGroup.position.set(-3, 1.7, -3);
    this.currentMeshGroup.rotation.y = Math.PI / 4;
    this.scene.add(this.currentMeshGroup);

    // Initial Draw
    if (mode === 'single') this.drawEmptyScore();
    else this.drawEmptyMultiScore();
  }

  addStand(boardHeight) {
    const easelMaterial = new THREE.MeshStandardMaterial({ color: 0xD2B48C, roughness: 0.8 });
    const boardBottomY = -boardHeight / 2;
    const legHeight = 1.3; 
    
    const legGeo = new THREE.BoxGeometry(0.08, legHeight, 0.08);
    
    const leftLeg = new THREE.Mesh(legGeo, easelMaterial);
    leftLeg.position.set(-0.8, boardBottomY - (legHeight/2) + 0.05, 0.05);
    leftLeg.rotation.x = -0.15; leftLeg.rotation.z = 0.1;
    this.currentMeshGroup.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeo, easelMaterial);
    rightLeg.position.set(0.8, boardBottomY - (legHeight/2) + 0.05, 0.05);
    rightLeg.rotation.x = -0.15; rightLeg.rotation.z = -0.1;
    this.currentMeshGroup.add(rightLeg);
  }
  
  drawEmptyScore() {
    const w = this.canvas.width; const h = this.canvas.height;
    this.ctx.fillStyle = '#001a1a'; this.ctx.fillRect(0,0,w,h);
    this.ctx.strokeStyle = '#00ff88'; this.ctx.lineWidth = 5; this.ctx.strokeRect(10,10,w-20,h-20);
    this.ctx.fillStyle = '#00ff88'; this.ctx.font = 'bold 40px Arial'; this.ctx.textAlign = 'center';
    this.ctx.fillText('BOWLLIARDS SCORE', w/2, 60);
    this.texture.needsUpdate = true;
  }

  drawEmptyMultiScore() {
    const w = this.canvas.width; const h = this.canvas.height;
    this.ctx.fillStyle = '#001a1a'; this.ctx.fillRect(0,0,w,h);
    this.ctx.fillStyle = '#00ff88'; this.ctx.font = 'bold 50px Arial'; this.ctx.textAlign = 'center';
    this.ctx.fillText('MULTIPLAYER MATCH', w/2, 80);
    this.texture.needsUpdate = true;
  }

  // --- MAIN UPDATE FUNCTION ---
  update(localRules, remoteRules, localName, remoteName, isMyTurn) {
    if (this.mode === 'single') {
        this.renderSingle(localRules);
    } else {
        this.renderMulti(localRules, remoteRules, localName, remoteName, isMyTurn);
    }
    this.texture.needsUpdate = true;
  }

  renderSingle(rules) {
    const w = 1024; const h = 512;
    this.ctx.fillStyle = '#001a1a'; this.ctx.fillRect(0,0,w,h);
    this.ctx.strokeStyle = '#00ff88'; this.ctx.lineWidth = 3; this.ctx.strokeRect(10,10,w-20,h-20);
    
    this.ctx.fillStyle = '#00ff88'; this.ctx.font = 'bold 40px Arial'; this.ctx.textAlign = 'center';
    this.ctx.fillText('BOWLLIARDS', w/2, 60);
    
    const frameNum = rules.isGameComplete() ? "FINAL" : `Frame ${rules.currentFrame+1}`;
    this.ctx.font = '24px Arial'; this.ctx.fillText(frameNum, w/2, 95);

    this.drawGrid(rules, 62, 130); 
  }

  renderMulti(localRules, remoteRules, localName, remoteName, isMyTurn) {
    const w = 2048; const h = 640;
    this.ctx.fillStyle = '#001a1a'; this.ctx.fillRect(0,0,w,h);
    
    // Divider Line
    this.ctx.strokeStyle = '#333'; this.ctx.lineWidth = 5;
    this.ctx.beginPath(); this.ctx.moveTo(w/2, 20); this.ctx.lineTo(w/2, h-20); this.ctx.stroke();

    // --- LEFT SIDE (LOCAL) ---
    const leftCenter = w/4;
    this.ctx.fillStyle = isMyTurn ? '#00ff00' : '#666666'; 
    this.ctx.font = 'bold 50px Arial'; this.ctx.textAlign = 'center';
    this.ctx.fillText(localName || "YOU", leftCenter, 80);
    
    if (isMyTurn) {
        this.ctx.font = 'italic 30px Arial'; this.ctx.fillStyle = '#ffff00';
        this.ctx.fillText("YOUR TURN", leftCenter, 130);
    }

    this.drawGrid(localRules, 50, 200, 0.9); 

    // --- RIGHT SIDE (REMOTE) ---
    const rightCenter = (w/4) * 3;
    this.ctx.fillStyle = !isMyTurn ? '#ff0000' : '#666666'; 
    this.ctx.font = 'bold 50px Arial'; this.ctx.textAlign = 'center';
    this.ctx.fillText(remoteName || "OPPONENT", rightCenter, 80);

    if (!isMyTurn) {
        this.ctx.font = 'italic 30px Arial'; this.ctx.fillStyle = '#ff4444';
        this.ctx.fillText("PLAYING...", rightCenter, 130);
    }

    if (remoteRules) {
        this.drawGrid(remoteRules, w/2 + 50, 200, 0.9);
    }
  }

  drawGrid(rules, startX, startY, scale = 1.0) {
    this.ctx.save();
    this.ctx.translate(startX, startY);
    this.ctx.scale(scale, scale);

    rules.calculateScores();
    const frames = rules.frames;
    let cumulative = 0;
    
    const boxW = 85; const boxH = 80;
    this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.lineWidth = 2;

    for(let i=0; i<10; i++) {
        const f = frames[i];
        const x = i * (boxW + 5);
        const is10 = (i===9);
        const w = is10 ? 120 : boxW;
        
        this.ctx.strokeStyle = '#00ff88'; this.ctx.strokeRect(x, 0, w, boxH);
        this.ctx.beginPath(); this.ctx.moveTo(x, 25); this.ctx.lineTo(x+w, 25); this.ctx.stroke();
        
        this.ctx.fillStyle = '#00ff88'; this.ctx.font = '18px Arial';
        this.ctx.fillText(i+1, x + w/2, 12);

        this.ctx.fillStyle = '#ffffff'; this.ctx.font = 'bold 24px Arial';
        cumulative += f.score;
        
        if (f.score > 0 || f.isOpen || (f.inning1.complete && f.inning2.complete)) {
             this.ctx.fillText(cumulative, x + w/2, 55);
        }
        
        this.ctx.font = '18px Arial';
        if (f.isStrike) this.ctx.fillText("X", x + w - 15, 40);
        else if (f.isSpare) this.ctx.fillText("/", x + w - 15, 40);
        else if (f.inning1.complete) this.ctx.fillText(f.inning1.scored, x + 15, 40);
    }
    
    this.ctx.fillStyle = '#00ff88'; this.ctx.font = 'bold 30px Arial';
    this.ctx.fillText(`TOTAL: ${cumulative}`, 450, 120);
    this.ctx.restore();
  }
}

export class LeaderboardDisplay {
  constructor(scene) {
    this.scene = scene;
    // Keep existing basic board logic for leaderboard
    // ... (Assuming you want to keep the small corner board code as is)
  }
  update(leaderboard) { /* ... */ }
}