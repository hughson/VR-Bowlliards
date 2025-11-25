import * as THREE from 'three';

// --- Helper function to create the physical board mesh (EASEL STAND) ---
function createBoardMesh(scene, isLeaderboard = false) {
  const group = new THREE.Group();
  
  // Board background
  const boardGeometry = new THREE.PlaneGeometry(1.8, isLeaderboard ? 0.9 : 0.8);
  const boardMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x001a1a,
    side: THREE.DoubleSide
  });
  const board = new THREE.Mesh(boardGeometry, boardMaterial);
  group.add(board);
  
  // Border glow
  const borderGeometry = new THREE.PlaneGeometry(1.85, isLeaderboard ? 0.95 : 0.85);
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
  // Leaderboard uses a 512x512 canvas in its update/drawEmpty, Scoreboard uses 1024x512
  const canvas = document.createElement('canvas');
  canvas.width = isLeaderboard ? 512 : 1024;
  canvas.height = 512; 
  const ctx = canvas.getContext('2d');
  
  const texture = new THREE.CanvasTexture(canvas);
  const textMaterial = new THREE.MeshBasicMaterial({ 
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });
  const textPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, isLeaderboard ? 0.85 : 0.85), 
    textMaterial
  );
  textPlane.position.z = 0.01;
  group.add(textPlane);
  
  // --- Easel Stand (Only for Scoreboard) ---
  if (!isLeaderboard) {
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
  }
  
  scene.add(group);
  
  return { group, texture, ctx, canvas };
}

// --- 1. MAIN GAME SCOREBOARD (Current Game Only) ---
export class Scoreboard {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'single'; 

    // Use createBoardMesh with isLeaderboard=false for the Easel Stand
    const { group, texture, ctx } = createBoardMesh(scene, false);
    this.group = group;
    this.texture = texture;
    this.ctx = ctx;
    
    // --- PLACEMENT: Match desired (-3, 1.7, -3) with 45 degree rotation ---
    this.group.position.set(-3, 1.7, -3);
    this.group.rotation.y = Math.PI / 4;
    // -----------------------------------------------------------------------------
    
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
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, w, h);
    
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, w - 20, h - 20);
    
    // Title
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 40px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('BOWLLIARDS SCORE', w/2, 60);
    
    this.ctx.font = '20px Arial';
    this.ctx.fillText('Ready to play!', w/2, 95);
    
    // Frame headers
    this.ctx.font = '24px Arial';
    for (let i = 0; i < 10; i++) {
      const x = 80 + i * 90;
      this.ctx.fillText(`${i + 1}`, x, 130);
    }
    
    this.texture.needsUpdate = true;
  }
  
  drawEmptyMultiScore() {
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;

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

  // Unified update method
  updateScore(rulesEngine, remoteRulesEngine = null, myName = null, oppName = null, isMyTurn = null) {
    console.log('[SCOREBOARD] updateScore called:', {
      mode: this.mode,
      hasRemote: !!remoteRulesEngine,
      myName,
      oppName,
      isMyTurn,
      localFrame: rulesEngine ? rulesEngine.currentFrame : 'none',
      remoteFrame: remoteRulesEngine ? remoteRulesEngine.currentFrame : 'none'
    });
    
    if (this.mode === 'multi' && remoteRulesEngine) {
      this.drawMultiScore(rulesEngine, remoteRulesEngine, myName, oppName, isMyTurn);
    } else {
      this.drawSingleScore(rulesEngine);
    }
  }

  // Full Multiplayer Drawing Logic
  drawMultiScore(localRules, remoteRules, myName, oppName, isMyTurn) {
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    const ctx = this.ctx;

    console.log('[SCOREBOARD] Drawing multiplayer scores:', {
      localFrame: localRules ? localRules.currentFrame : 'null',
      remoteFrame: remoteRules ? remoteRules.currentFrame : 'null',
      localTotal: localRules ? localRules.getTotalScore() : 0,
      remoteTotal: remoteRules ? remoteRules.getTotalScore() : 0
    });

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#001a1a');
    gradient.addColorStop(1, '#000000');
    ctx.fillStyle = gradient;
    ctx.fillRect(10, 10, w - 20, h - 20);

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MULTIPLAYER', w / 2, 40);

    const names = [
      myName || 'Player 1',
      oppName || 'Player 2'
    ];

    // Create two vertical panels within the canvas
    // Panel 1: Top half (Local), Panel 2: Bottom half (Remote)
    const panels = [
      { rules: localRules, label: `${names[0]} ${isMyTurn ? '(YOUR TURN)' : ''}`, yOffset: 70 },
      { rules: remoteRules, label: names[1], yOffset: h / 2 + 30 }
    ];

    const frameCount = 10;
    const boxWidth = (w - 80) / frameCount;
    const boxHeight = 60;
    const smallBoxHeight = boxHeight * 0.4; // Top 40% for innings
    const bigBoxHeight = boxHeight * 0.6;   // Bottom 60% for total
    const startX = 40;

    panels.forEach((panel, i) => {
      const rulesEngine = panel.rules;
      const yLabel = panel.yOffset;
      const yBoxes = yLabel + 20;

      ctx.fillStyle = i === 0 ? '#00ff88' : '#66ffaa';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(panel.label, w / 2, yLabel);

      if (!rulesEngine) return;

      rulesEngine.calculateScores(); // Ensure scores are fresh

      ctx.font = '14px Arial';
      let cumulative = 0;
      let hasAnyCompletedInning = false;

      for (let f = 0; f < frameCount; f++) {
        const x = startX + f * boxWidth;
        const y = yBoxes;

        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        
        // Draw outer frame box
        ctx.strokeRect(x, y, boxWidth - 4, boxHeight);

        const frame = rulesEngine.frames[f];
        if (!frame) continue;

        cumulative += frame.score;
        
        // Track if any inning has been completed
        if (frame.inning1.complete || frame.inning2.complete) {
          hasAnyCompletedInning = true;
        }

        // Frame Number (above the box)
        ctx.fillStyle = '#00ff88';
        ctx.textAlign = 'center';
        ctx.fillText(String(f + 1), x + (boxWidth - 4) / 2, y - 8);

        // Draw horizontal line separating small boxes from big box
        ctx.beginPath();
        ctx.moveTo(x, y + smallBoxHeight);
        ctx.lineTo(x + (boxWidth - 4), y + smallBoxHeight);
        ctx.stroke();

        // Draw vertical line dividing the two small boxes
        ctx.beginPath();
        ctx.moveTo(x + (boxWidth - 4) / 2, y);
        ctx.lineTo(x + (boxWidth - 4) / 2, y + smallBoxHeight);
        ctx.stroke();

        // --- INNING SCORES (Small boxes on top) ---
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        
        // Left small box: First inning score (show 0 if complete, even if score is 0)
        if (frame.inning1.complete) {
          ctx.textAlign = 'center';
          ctx.fillText(frame.inning1.scored, x + (boxWidth - 4) / 4, y + smallBoxHeight - 4);
        }

        // Right small box: Second inning score or spare/strike
        if (frame.isStrike) {
          ctx.textAlign = 'center';
          ctx.fillText('X', x + 3 * (boxWidth - 4) / 4, y + smallBoxHeight - 4);
        } else if (frame.isSpare) {
          ctx.textAlign = 'center';
          ctx.fillText('/', x + 3 * (boxWidth - 4) / 4, y + smallBoxHeight - 4);
        } else if (frame.inning2.complete) {
          // Show score even if it's 0
          ctx.textAlign = 'center';
          ctx.fillText(frame.inning2.scored, x + 3 * (boxWidth - 4) / 4, y + smallBoxHeight - 4);
        }

        // --- FRAME TOTAL (Big box on bottom) ---
        if (frame.score > 0 || frame.isOpen || (frame.inning1.complete && frame.inning2.complete)) {
          ctx.fillStyle = '#00ff88';
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(cumulative, x + (boxWidth - 4) / 2, y + smallBoxHeight + bigBoxHeight / 2 + 6);
        }
      }

      // Total Score - only show if at least one inning has been completed
      if (hasAnyCompletedInning) {
        ctx.fillStyle = i === 0 ? '#00ff88' : '#66ffaa';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(
          `TOTAL: ${cumulative}`,
          40,
          yBoxes + boxHeight + 22
        );
      }
    });

    this.texture.needsUpdate = true;
  }

  // Standard Single Player Draw
  drawSingleScore(rulesEngine) {
    if (!rulesEngine) {
      this.drawEmptyScore();
      return;
    }
    
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    const ctx = this.ctx;
    
    // Clear canvas
    ctx.fillStyle = '#001a1a';
    ctx.fillRect(0, 0, w, h);
    
    // Border
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    
    // Title
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BOWLLIARDS SCORE', w/2, 60);
    
    // Current frame indicator
    ctx.font = '20px Arial';
    const frameNum = rulesEngine.isGameComplete() ? 10 : rulesEngine.currentFrame + 1;
    const inningText = rulesEngine.bonusRolls > 0 ? "Bonus Roll" : `Inning ${rulesEngine.currentInning}`;
    ctx.fillText(`Frame ${frameNum} | ${inningText}`, w/2, 95);

    // --- Draw Score Boxes ---
    ctx.lineWidth = 2;
    ctx.textBaseline = 'middle';

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
    const startX = (1024 - (frameWidth * 9 + tenthFrameWidth + 9 * 5)) / 2; // Centered

    for (let i = 0; i < 10; i++) {
      const frame = frames[i];
      const isTenthFrame = (i === 9);
      
      const currentFrameWidth = isTenthFrame ? tenthFrameWidth : frameWidth;
      const x = startX + i * (frameWidth + 5);
      
      const frameCenterX = x + currentFrameWidth / 2;
      const smallBoxCenterY = ySmallBox + (smallBoxHeight / 2);
      
      // --- Draw Boxes ---
      ctx.strokeRect(x, yHeader, currentFrameWidth, (yBigBox + bigBoxHeight) - yHeader);
      ctx.beginPath();
      ctx.moveTo(x, ySmallBox);
      ctx.lineTo(x + currentFrameWidth, ySmallBox);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, yBigBox);
      ctx.lineTo(x + currentFrameWidth, yBigBox);
      ctx.stroke();
      if (isTenthFrame) {
        const thirdBoxWidth = currentFrameWidth / 3;
        const x1 = x + thirdBoxWidth;
        const x2 = x + thirdBoxWidth * 2;
        ctx.beginPath();
        ctx.moveTo(x1, ySmallBox);
        ctx.lineTo(x1, yBigBox);
        ctx.moveTo(x2, ySmallBox);
        ctx.lineTo(x2, yBigBox);
        ctx.stroke();
      } else {
        const x1 = x + currentFrameWidth / 2;
        ctx.beginPath();
        ctx.moveTo(x1, ySmallBox);
        ctx.lineTo(x1, yBigBox);
        ctx.stroke();
      }
      
      // --- Draw Text ---
      // Frame number
      ctx.font = '20px Arial';
      ctx.fillStyle = '#00ff88';
      ctx.fillText(`${i + 1}`, frameCenterX, yHeader + (ySmallBox - yHeader) / 2);

      // Inning results
      ctx.font = '22px Arial';

      if (isTenthFrame) {
        const thirdBoxWidth = currentFrameWidth / 3;
        const x1 = x + thirdBoxWidth / 2;
        const x2 = x1 + thirdBoxWidth;
        const x3 = x2 + thirdBoxWidth;
        
        const bonus1 = frame.bonus[0];
        const bonus2 = frame.bonus[1];
        
        if (frame.isStrike) {
            ctx.fillText('X', x1, smallBoxCenterY);
            if (bonus1 !== undefined) {
                const display = (bonus1 === 10) ? 'X' : bonus1.toString();
                ctx.fillText(display, x2, smallBoxCenterY);
            }
            if (bonus2 !== undefined) {
                const display = (bonus2 === 10) ? 'X' : bonus2.toString();
                ctx.fillText(display, x3, smallBoxCenterY);
            }
        } else if (frame.isSpare) {
            ctx.fillText(frame.inning1.scored.toString(), x1, smallBoxCenterY);
            ctx.fillText('/', x2, smallBoxCenterY);
            if (bonus1 !== undefined) {
                const display = (bonus1 === 10) ? 'X' : bonus1.toString();
                ctx.fillText(display, x3, smallBoxCenterY);
            }
        } else if (frame.inning1.complete) {
            ctx.fillText(frame.inning1.scored.toString(), x1, smallBoxCenterY);
            if (frame.inning2.complete) {
                ctx.fillText(frame.inning2.scored.toString(), x2, smallBoxCenterY);
            }
        }
      } else {
        const smallBoxWidth = currentFrameWidth / 2;
        const x1 = x + smallBoxWidth / 2;
        const x2 = x1 + smallBoxWidth;

        if (frame.isStrike) {
            ctx.fillText('X', x2, smallBoxCenterY); // 'X' in second box
        } else if (frame.inning1.complete) {
            ctx.fillText(frame.inning1.scored.toString(), x1, smallBoxCenterY);
            if (frame.inning2.complete) {
                const display = frame.isSpare ? '/' : frame.inning2.scored.toString();
                ctx.fillText(display, x2, smallBoxCenterY);
            }
        }
      }
      
      // Cumulative score (in big box)
      cumulative += frame.score;
      ctx.font = 'bold 26px Arial';
      const bigBoxCenterY = yBigBox + (bigBoxHeight / 2);

      if (frame.score > 0 || frame.isOpen || (frame.inning1.complete && frame.inning2.complete)) {
          if (i === 9 && !rulesEngine.isGameComplete()) {
             // Don't show final 10th frame score until game is over
          } else {
            ctx.fillText(cumulative.toString(), frameCenterX, bigBoxCenterY);
          }
      }
    }
    
    // Total Score ONLY
    const newTotalY = yBigBox + bigBoxHeight + 60;
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = '#00ff88';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic'; // Reset baseline
    ctx.fillText(`TOTAL: ${cumulative}`, 512, newTotalY);
    
    this.texture.needsUpdate = true;
  }
}

// --- 2. CORNER LEADERBOARD DISPLAY (Global High Scores) ---
export class LeaderboardDisplay {
  constructor(scene) {
    this.scene = scene;
    
    const { group, texture, ctx } = createBoardMesh(scene);
    this.group = group;
    this.texture = texture;
    this.ctx = ctx;
    
    // Position: Bottom-Left Corner (-9, 9)
    this.group.position.set(-9, 2.0, 9); 
    // Face the center of the room (0, 1.5, 0) approximately eye level
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
    
    // Adjusted X positions to be more inside (padding)
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

// --- 3. PERSONAL STATS DISPLAY (VR Corner Board) ---
export class PersonalStatsDisplay {
  constructor(scene) {
    this.scene = scene;
    
    // Use same canvas setup as LeaderboardDisplay (1024x512)
    const { group, texture, ctx } = createBoardMesh(scene);
    this.group = group;
    this.texture = texture;
    this.ctx = ctx;
    
    // Position: Opposite corner from leaderboard (9, 2, 9)
    this.group.position.set(9, 2.0, 9);
    this.group.lookAt(0, 1.5, 0);
    this.group.scale.set(2.0, 2.0, 2.0);
    
    this.drawEmpty();
  }
  
  drawEmpty() {
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, 1024, 512);
    
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, 1004, 492);
    
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 50px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('MY STATS', 512, 80);
    
    this.ctx.font = '30px Arial';
    this.ctx.fillStyle = '#888888';
    this.ctx.fillText('Login to track stats', 512, 240);
    this.ctx.font = '24px Arial';
    this.ctx.fillText('Visit stats.html', 512, 280);
    
    this.texture.needsUpdate = true;
  }
  
  update(stats, playerName = 'Player') {
    if (!stats) {
      this.drawEmpty();
      return;
    }
    
    // Canvas is 1024x512 (same as LeaderboardDisplay)
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, 1024, 512);
    
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, 1004, 492);
    
    // Title with player name
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 40px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${playerName}'s STATS`, 512, 70);
    
    // Single centered column layout like LeaderboardDisplay
    const labelX = 300;
    const valueX = 724;
    
    this.ctx.font = '24px Arial';
    
    const statRows = [
      { label: 'Games Played:', value: stats.totalGames },
      { label: 'High Score:', value: stats.highScore },
      { label: 'Avg Score:', value: stats.avgScore },
      { label: 'Potting Avg:', value: stats.pottingAvg },
      { label: 'High Run:', value: stats.highRun },
      { label: 'High Frame:', value: stats.highFrameScore },
      { label: 'Best Break:', value: stats.maxBreakBalls },
    ];
    
    let y = 130;
    
    statRows.forEach(row => {
      this.ctx.fillStyle = '#888888';
      this.ctx.font = '24px Arial';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(row.label, labelX, y);
      
      this.ctx.fillStyle = '#00ff88';
      this.ctx.font = 'bold 28px Arial';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(row.value.toString(), valueX, y);
      
      y += 45;
    });
    
    // Frame type percentages at bottom - centered
    this.ctx.font = '24px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#00ff88';
    this.ctx.fillText(`Strikes: ${stats.strikePercent}%`, 300, 470);
    this.ctx.fillStyle = '#0088ff';
    this.ctx.fillText(`Spares: ${stats.sparePercent}%`, 512, 470);
    this.ctx.fillStyle = '#ffaa00';
    this.ctx.fillText(`Open: ${stats.openPercent}%`, 724, 470);
    
    this.texture.needsUpdate = true;
  }
}

// --- 4. CYCLING LEADERBOARD DISPLAY (Enhanced) ---
export class CyclingLeaderboardDisplay {
  constructor(scene, statsTracker) {
    this.scene = scene;
    this.statsTracker = statsTracker;
    
    const { group, texture, ctx } = createBoardMesh(scene);
    this.group = group;
    this.texture = texture;
    this.ctx = ctx;
    
    // Position: Same as original leaderboard
    this.group.position.set(-9, 2.0, 9);
    this.group.lookAt(0, 1.5, 0);
    this.group.scale.set(2.0, 2.0, 2.0);
    
    this.statTypes = [
      { key: 'highScore', label: 'HIGH SCORE', valueLabel: 'SCORE' },
      { key: 'avgScore', label: 'AVG SCORE', valueLabel: 'AVG' },
      { key: 'highRun', label: 'HIGH RUN', valueLabel: 'RUN' },
      { key: 'highFrameScore', label: 'HIGH FRAME', valueLabel: 'FRAME' },
      { key: 'maxBreakBalls', label: 'BEST BREAK', valueLabel: 'BALLS' },
      { key: 'totalGames', label: 'MOST GAMES', valueLabel: 'GAMES' }
    ];
    
    this.currentStatIndex = 0;
    this.leaderboardData = [];
    this.isLoading = false;
    
    this.drawLoading();
  }
  
  drawLoading() {
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, 1024, 512);
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, 1004, 492);
    
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 50px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('LEADERBOARD', 512, 80);
    
    this.ctx.font = '30px Arial';
    this.ctx.fillText('Loading...', 512, 280);
    
    this.texture.needsUpdate = true;
  }
  
  async cycleNext() {
    this.currentStatIndex = (this.currentStatIndex + 1) % this.statTypes.length;
    await this.loadAndDisplay();
  }
  
  async cyclePrev() {
    this.currentStatIndex = (this.currentStatIndex - 1 + this.statTypes.length) % this.statTypes.length;
    await this.loadAndDisplay();
  }
  
  async loadAndDisplay() {
    if (this.isLoading || !this.statsTracker) return;
    
    this.isLoading = true;
    const statType = this.statTypes[this.currentStatIndex];
    
    try {
      let data;
      if (statType.key === 'avgScore') {
        data = await this.statsTracker.getAvgScoreLeaderboard(5);
      } else {
        data = await this.statsTracker.getLeaderboard(statType.key, 5);
      }
      this.leaderboardData = data;
      this.draw(statType);
    } catch (e) {
      console.error('[CyclingLeaderboard] Error loading:', e);
    }
    
    this.isLoading = false;
  }
  
  draw(statType) {
    this.ctx.fillStyle = '#001a1a';
    this.ctx.fillRect(0, 0, 1024, 512);
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, 1004, 492);
    
    // Title
    this.ctx.fillStyle = '#00ff88';
    this.ctx.font = 'bold 40px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(statType.label, 512, 70);
    
    // Navigation hint
    this.ctx.font = '18px Arial';
    this.ctx.fillStyle = '#666666';
    this.ctx.fillText('◀ Press A/X to cycle ▶', 512, 100);
    
    // Column headers
    const leftX = 200;
    const centerX = 512;
    const rightX = 824;
    
    this.ctx.font = 'bold 24px Arial';
    this.ctx.fillStyle = '#00ff88';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('RANK', leftX, 150);
    this.ctx.textAlign = 'center';
    this.ctx.fillText('NAME', centerX, 150);
    this.ctx.textAlign = 'right';
    this.ctx.fillText(statType.valueLabel, rightX, 150);
    
    if (this.leaderboardData.length === 0) {
      this.ctx.font = '28px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = '#888888';
      this.ctx.fillText('No scores yet!', 512, 280);
    } else {
      this.ctx.font = '24px Arial';
      this.leaderboardData.forEach((entry, index) => {
        const y = 200 + index * 55;
        const rank = index + 1;
        
        // Rank coloring
        if (rank === 1) this.ctx.fillStyle = '#ffd700';
        else if (rank === 2) this.ctx.fillStyle = '#c0c0c0';
        else if (rank === 3) this.ctx.fillStyle = '#cd7f32';
        else this.ctx.fillStyle = '#00ff88';
        
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${rank}.`, leftX, y);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(entry.name || 'Player', centerX, y);
        
        this.ctx.fillStyle = '#00ff88';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(entry.value.toString(), rightX, y);
      });
    }
    
    // Page indicator
    this.ctx.font = '20px Arial';
    this.ctx.fillStyle = '#666666';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${this.currentStatIndex + 1} / ${this.statTypes.length}`, 512, 480);
    
    this.texture.needsUpdate = true;
  }
  
  // Fallback update for legacy leaderboard object
  update(leaderboard) {
    if (!this.statsTracker && leaderboard) {
      // Legacy mode - use old leaderboard object
      this.ctx.fillStyle = '#001a1a';
      this.ctx.fillRect(0, 0, 1024, 512);
      this.ctx.strokeStyle = '#00ff88';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(10, 10, 1004, 492);
      
      this.ctx.fillStyle = '#00ff88';
      this.ctx.font = 'bold 50px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('HIGH SCORES', 512, 80);
      
      const topScores = leaderboard.getTopScores(5);
      const leftX = 200;
      const centerX = 512;
      const rightX = 824;
      
      if (topScores.length === 0) {
        this.ctx.font = '30px Arial';
        this.ctx.fillText('No scores yet. Be the first!', 512, 280);
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
          const y = 210 + index * 55;
          this.ctx.textAlign = 'left';
          this.ctx.fillText(`${index + 1}.`, leftX, y);
          this.ctx.textAlign = 'center';
          this.ctx.fillText(entry.name || 'Player', centerX, y);
          this.ctx.textAlign = 'right';
          this.ctx.fillText(entry.score.toString(), rightX, y);
        });
      }
      
      this.texture.needsUpdate = true;
    }
  }
}
