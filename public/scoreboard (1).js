import * as THREE from 'three';

// --- Helper function to create the physical board mesh ---
// (Extracted exactly from your provided file)
function createBoardMesh(scene) {
  const group = new THREE.Group();
  
  // Board background
  const boardGeometry = new THREE.PlaneGeometry(1.8, 0.8);
  const boardMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x001a1a,
    side: THREE.DoubleSide
  });
  const board = new THREE.Mesh(boardGeometry, boardMaterial);
  group.add(board);
  
  // Border glow
  const borderGeometry = new THREE.PlaneGeometry(1.85, 0.85);
  const borderMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ff88,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  const border = new THREE.Mesh(borderGeometry, borderMaterial);
  border.position.z = -0.01;
  group.add(border);
  
  // Create canvas for score text
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  const texture = new THREE.CanvasTexture(canvas);
  const textMaterial = new THREE.MeshBasicMaterial({ 
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });
  const textPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.85), 
    textMaterial
  );
  textPlane.position.z = 0.01;
  group.add(textPlane);
  
  // --- Easel Stand ---
  const easelMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xD2B48C, // Natural wood color (Tan)
    roughness: 0.8 
  });
  
  // Board is 0.8 high, so half-height is 0.4
  const boardBottomY = -0.4;
  const legHeight = 1.3; // Approx 1.3m tall legs
  
  // Support Ledge
  const ledgeGeo = new THREE.BoxGeometry(1.8, 0.05, 0.05);
  const ledge = new THREE.Mesh(ledgeGeo, easelMaterial);
  ledge.position.set(0, boardBottomY, 0.03);
  group.add(ledge);
  
  // Legs
  const legGeo = new THREE.BoxGeometry(0.08, legHeight, 0.08);
  
  const backLeg = new THREE.Mesh(legGeo, easelMaterial);
  backLeg.position.set(0, boardBottomY - (legHeight / 2) + 0.05, -0.3);
  backLeg.rotation.x = 0.2; // Tilt back
  group.add(backLeg);
  
  const leftLeg = new THREE.Mesh(legGeo, easelMaterial);
  leftLeg.position.set(-0.8, boardBottomY - (legHeight / 2) + 0.05, 0.05);
  leftLeg.rotation.x = -0.15; // Tilt forward
  leftLeg.rotation.z = 0.1; // Tilt out
  group.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeo, easelMaterial);
  rightLeg.position.set(0.8, boardBottomY - (legHeight / 2) + 0.05, 0.05);
  rightLeg.rotation.x = -0.15; // Tilt forward
  rightLeg.rotation.z = -0.1; // Tilt out
  group.add(rightLeg);
  
  scene.add(group);
  
  return { group, texture, ctx, canvas };
}

// --- 1. MAIN GAME SCOREBOARD (Multiplayer Logic Restored) ---
export class Scoreboard {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'single';

    const { group, texture, ctx } = createBoardMesh(scene);
    this.group = group;
    this.texture = texture;
    this.ctx = ctx;
    
    // Position: Back-left corner near table (Original spot)
    this.group.position.set(-3, 1.7, -3);
    this.group.rotation.y = Math.PI / 4;
    
    this.drawEmptyScore();
  }

  setupBoard(mode = 'single') {
    this.mode = mode;
    if (mode === 'single') {
      this.drawEmptyScore();
    } else {
      this.drawEmptyMultiScore();
    }
  }

  drawEmptyScore() {
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, 1024, 512);
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, 1004, 492);
    
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 40px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('BOWLLIARDS SCORE', 512, 60);
    
    this.ctx.font = '20px Arial';
    this.ctx.fillText('Ready to play!', 512, 95);
    
    this.ctx.font = '24px Arial';
    for (let i = 0; i < 10; i++) {
      const x = 80 + i * 90;
      this.ctx.fillText(`${i + 1}`, x, 130);
    }
    this.texture.needsUpdate = true;
  }

  // Restored Multiplayer Empty State
  drawEmptyMultiScore() {
    const w = 1024; const h = 512;
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 5;
    this.ctx.strokeRect(10, 10, w - 20, h - 20);
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 32px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('MULTIPLAYER MATCH', w / 2, 60);
    this.texture.needsUpdate = true;
  }

  // Restored Unified Update Method
  updateScore(rulesEngine, remoteRulesEngine = null, myName = null, oppName = null, isMyTurn = null) {
    if (this.mode === 'multi' && remoteRulesEngine) {
      this.drawMultiScore(rulesEngine, remoteRulesEngine, myName, oppName, isMyTurn);
    } else {
      this.drawSingleScore(rulesEngine);
    }
  }

  // Restored Multiplayer Drawing Logic
  drawMultiScore(localRules, remoteRules, myName, oppName, isMyTurn) {
    const w = 1024; const h = 512;
    const ctx = this.ctx;

    ctx.fillStyle = '#001a1a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`MULTIPLAYER: ${isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}`, w / 2, 40);

    const panels = [
      { rules: localRules, label: myName || 'YOU', yOffset: 60, color: isMyTurn ? '#00ff88' : '#448866' },
      { rules: remoteRules, label: oppName || 'OPPONENT', yOffset: 280, color: !isMyTurn ? '#00ff88' : '#448866' }
    ];

    const boxWidth = 85;
    const startX = 50;
    const smallBoxHeight = 35;
    const bigBoxHeight = 45;

    panels.forEach((panel) => {
        const { rules, label, yOffset, color } = panel;
        ctx.fillStyle = color;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(label, startX, yOffset);
        
        const total = rules ? rules.getTotalScore() : 0;
        ctx.textAlign = 'right';
        ctx.fillText(`Total: ${total}`, w - 50, yOffset);

        if (!rules) return;
        const gridY = yOffset + 15;
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.font = '18px Arial';
        
        let cumulative = 0;
        rules.calculateScores();

        for (let i = 0; i < 10; i++) {
            const frame = rules.frames[i];
            const x = startX + i * (boxWidth + 5);
            const isTenth = (i === 9);
            const width = isTenth ? boxWidth * 1.5 : boxWidth;

            ctx.strokeRect(x, gridY, width, smallBoxHeight + bigBoxHeight);
            ctx.beginPath(); ctx.moveTo(x, gridY + smallBoxHeight); ctx.lineTo(x + width, gridY + smallBoxHeight); ctx.stroke();

            if (isTenth) {
                const third = width / 3;
                ctx.beginPath(); ctx.moveTo(x + third, gridY); ctx.lineTo(x + third, gridY + smallBoxHeight); ctx.moveTo(x + third * 2, gridY); ctx.lineTo(x + third * 2, gridY + smallBoxHeight); ctx.stroke();
            } else {
                const half = width / 2;
                ctx.beginPath(); ctx.moveTo(x + half, gridY); ctx.lineTo(x + half, gridY + smallBoxHeight); ctx.stroke();
            }

            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.font = '12px Arial';
            ctx.fillText(i + 1, x + width/2, gridY - 5);

            if (!frame) continue;
            cumulative += frame.score;
            ctx.font = '18px Arial';
            ctx.fillStyle = '#ffffff';
            
            if (isTenth) {
                const third = width / 3;
                let t1 = ""; if (frame.isStrike) t1 = "X"; else if (frame.inning1.complete) t1 = frame.inning1.scored;
                ctx.fillText(t1, x + third/2, gridY + 24);
                let t2 = ""; if (frame.bonus[0] === 10) t2 = "X"; else if (frame.isSpare) t2 = "/"; else if (frame.inning2.complete) t2 = frame.inning2.scored;
                ctx.fillText(t2, x + third + third/2, gridY + 24);
                let t3 = ""; if (frame.bonus[1] === 10) t3 = "X"; else if (frame.bonus.length > 1) t3 = frame.bonus[1];
                ctx.fillText(t3, x + width - third/2, gridY + 24);
            } else {
                const half = width / 2;
                if (frame.isStrike) ctx.fillText("X", x + width - half/2, gridY + 24);
                else {
                    if (frame.inning1.complete) ctx.fillText(frame.inning1.scored, x + half/2, gridY + 24);
                    if (frame.isSpare) ctx.fillText("/", x + width - half/2, gridY + 24);
                    else if (frame.inning2.complete) ctx.fillText(frame.inning2.scored, x + width - half/2, gridY + 24);
                }
            }

            if (frame.score > 0 || frame.isOpen || (frame.inning1.complete && frame.inning2.complete)) {
                ctx.fillStyle = color;
                ctx.font = 'bold 20px Arial';
                ctx.fillText(cumulative, x + width/2, gridY + smallBoxHeight + 30);
            }
        }
    });
    this.texture.needsUpdate = true;
  }

  drawSingleScore(rulesEngine) {
    if (!rulesEngine) {
      this.drawEmptyScore();
      return;
    }
    
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, 1024, 512);
    
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, 1004, 492);
    
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 40px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('BOWLLIARDS SCORE', 512, 60);
    
    this.ctx.font = '20px Arial';
    const frameNum = rulesEngine.isGameComplete() ? 10 : rulesEngine.currentFrame + 1;
    const inningText = rulesEngine.bonusRolls > 0 ? "Bonus Roll" : `Inning ${rulesEngine.currentInning}`;
    this.ctx.fillText(`Frame ${frameNum} | ${inningText}`, 512, 95);

    this.ctx.lineWidth = 2;
    this.ctx.textBaseline = 'middle';

    rulesEngine.calculateScores();
    const frames = rulesEngine.frames;
    let cumulative = 0;

    const frameWidth = 85;
    const tenthFrameWidth = 120;
    const smallBoxHeight = 40;
    const bigBoxHeight = 55;
    const yHeader = 120;
    const ySmallBox = yHeader + 30;
    const yBigBox = ySmallBox + smallBoxHeight;
    const startX = (1024 - (frameWidth * 9 + tenthFrameWidth + 9 * 5)) / 2; 

    for (let i = 0; i < 10; i++) {
      const frame = frames[i];
      const isTenthFrame = (i === 9);
      
      const currentFrameWidth = isTenthFrame ? tenthFrameWidth : frameWidth;
      const x = startX + i * (frameWidth + 5);
      
      const frameCenterX = x + currentFrameWidth / 2;
      const smallBoxCenterY = ySmallBox + (smallBoxHeight / 2);
      
      this.ctx.strokeRect(x, yHeader, currentFrameWidth, (yBigBox + bigBoxHeight) - yHeader);
      this.ctx.beginPath();
      this.ctx.moveTo(x, ySmallBox);
      this.ctx.lineTo(x + currentFrameWidth, ySmallBox);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(x, yBigBox);
      this.ctx.lineTo(x + currentFrameWidth, yBigBox);
      this.ctx.stroke();
      if (isTenthFrame) {
        const thirdBoxWidth = currentFrameWidth / 3;
        const x1 = x + thirdBoxWidth;
        const x2 = x + thirdBoxWidth * 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, ySmallBox);
        this.ctx.lineTo(x1, yBigBox);
        this.ctx.moveTo(x2, ySmallBox);
        this.ctx.lineTo(x2, yBigBox);
        this.ctx.stroke();
      } else {
        const x1 = x + currentFrameWidth / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, ySmallBox);
        this.ctx.lineTo(x1, yBigBox);
        this.ctx.stroke();
      }
      
      this.ctx.font = '20px Arial';
      this.ctx.fillStyle = '#00ff88';
      this.ctx.fillText(`${i + 1}`, frameCenterX, yHeader + (ySmallBox - yHeader) / 2);

      this.ctx.font = '22px Arial';

      if (isTenthFrame) {
        const thirdBoxWidth = currentFrameWidth / 3;
        const x1 = x + thirdBoxWidth / 2;
        const x2 = x1 + thirdBoxWidth;
        const x3 = x2 + thirdBoxWidth;
        
        const bonus1 = frame.bonus[0];
        const bonus2 = frame.bonus[1];
        
        if (frame.isStrike) {
            this.ctx.fillText('X', x1, smallBoxCenterY);
            if (bonus1 !== undefined) {
                const display = (bonus1 === 10) ? 'X' : bonus1.toString();
                this.ctx.fillText(display, x2, smallBoxCenterY);
            }
            if (bonus2 !== undefined) {
                const display = (bonus2 === 10) ? 'X' : bonus2.toString();
                this.ctx.fillText(display, x3, smallBoxCenterY);
            }
        } else if (frame.isSpare) {
            this.ctx.fillText(frame.inning1.scored.toString(), x1, smallBoxCenterY);
            this.ctx.fillText('/', x2, smallBoxCenterY);
            if (bonus1 !== undefined) {
                const display = (bonus1 === 10) ? 'X' : bonus1.toString();
                this.ctx.fillText(display, x3, smallBoxCenterY);
            }
        } else if (frame.inning1.complete) {
            this.ctx.fillText(frame.inning1.scored.toString(), x1, smallBoxCenterY);
            if (frame.inning2.complete) {
                this.ctx.fillText(frame.inning2.scored.toString(), x2, smallBoxCenterY);
            }
        }
      } else {
        const smallBoxWidth = currentFrameWidth / 2;
        const x1 = x + smallBoxWidth / 2;
        const x2 = x1 + smallBoxWidth;

        if (frame.isStrike) {
            this.ctx.fillText('X', x2, smallBoxCenterY); 
        } else if (frame.inning1.complete) {
            this.ctx.fillText(frame.inning1.scored.toString(), x1, smallBoxCenterY);
            if (frame.inning2.complete) {
                const display = frame.isSpare ? '/' : frame.inning2.scored.toString();
                this.ctx.fillText(display, x2, smallBoxCenterY);
            }
        }
      }
      
      cumulative += frame.score;
      this.ctx.font = 'bold 26px Arial';
      const bigBoxCenterY = yBigBox + (bigBoxHeight / 2);

      if (frame.score > 0 || frame.isOpen || (frame.inning1.complete && frame.inning2.complete)) {
          if (i === 9 && !rulesEngine.isGameComplete()) {
          } else {
            this.ctx.fillText(cumulative.toString(), frameCenterX, bigBoxCenterY);
          }
      }
    }
    
    const newTotalY = yBigBox + bigBoxHeight + 60;
    this.ctx.font = 'bold 36px Arial';
    this.ctx.fillStyle = '#00ff88';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(`TOTAL: ${cumulative}`, 512, newTotalY);
    
    this.texture.needsUpdate = true;
  }
}

// --- 2. LEADERBOARD DISPLAY (Exactly as in your provided file) ---
export class LeaderboardDisplay {
  constructor(scene) {
    this.scene = scene;
    
    const { group, texture, ctx } = createBoardMesh(scene);
    this.group = group;
    this.texture = texture;
    this.ctx = ctx;
    
    // Position: Bottom-Left Corner (-9, 9)
    this.group.position.set(-9, 2.0, 9); 
    // Face the center of the room (0, 1.5, 0)
    this.group.lookAt(0, 1.5, 0);
    // Scale up so it's visible from distance
    this.group.scale.set(2.0, 2.0, 2.0);
    
    this.drawEmptyLeaderboard();
  }
  
  drawEmptyLeaderboard() {
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, 1024, 512);
    
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, 1004, 492);
    
    // Title
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 50px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('HIGH SCORES', 512, 80);
    
    this.ctx.font = '30px Arial';
    this.ctx.fillText('Loading...', 512, 250);
    
    this.texture.needsUpdate = true;
  }
  
  update(leaderboard) {
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, 1024, 512);
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, 1004, 492);
    // Title
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 50px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('HIGH SCORES', 512, 80);
    
    const topScores = leaderboard.getTopScores(5);
    
    // Adjusted X positions
    const leftX = 200;
    const rightX = 824;
    const centerX = 512;
    
    if (topScores.length === 0) {
      this.ctx.font = '30px Arial';
      this.ctx.fillText('No scores yet. Be the first!', 512, 250);
    } else {
      this.ctx.font = 'bold 28px Arial';
      this.ctx.textAlign = 'left';
      this.ctx.fillText('RANK', leftX, 150);
      this.ctx.textAlign = 'center';
      this.ctx.fillText('NAME', centerX, 150);
      this.ctx.textAlign = 'right';
      this.ctx.fillText('SCORE', rightX, 150);
      
      this.ctx.font = '24px Arial';
      topScores.forEach((entry, index) => {
        const y = 210 + index * 60;
        const name = entry.name || "Player"; 
        
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${index + 1}.`, leftX, y);
        this.ctx.textAlign = 'center';
        this.ctx.fillText(name, centerX, y); 
        this.ctx.textAlign = 'right';
        this.ctx.fillText(entry.score.toString(), rightX, y); 
      });
    }
    
    this.texture.needsUpdate = true;
  }
}