// ============================================
// PLAYER MENU - Stylish VR Menu System
// Opens with B button, tabbed settings interface
// ============================================

import * as THREE from 'three';

export class PlayerMenu {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.menuGroup = null;
    this.canvas = null;
    this.canvasTexture = null;
    this.menuMesh = null;
    
    // Tab system
    this.tabs = ['CONTROLS', 'THEMES', 'MULTIPLAYER'];
    
    // Check if first time player - default to CONTROLS tab
    const hasPlayedBefore = localStorage.getItem('bowlliards_hasPlayed');
    this.activeTab = hasPlayedBefore ? 'MULTIPLAYER' : 'CONTROLS';
    
    // Player states (keyed by visually displayed slot, not socket ID for easy UI)
    this.players = new Map();
    this.localPlayerMuted = false;
    
    // Settings
    this.leftHandedMode = false;
    this.bowlingStyleActive = false;
    this.tableColor = 0x40a4c4; // Default blue
    
    // Menu dimensions
    this.menuWidth = 0.55;
    this.menuHeight = 0.65;
    this.canvasWidth = 560;
    this.canvasHeight = 663;
    
    // Animation
    this.targetScale = 0;
    this.currentScale = 0;
    this.animationSpeed = 8;
    
    // Button hover states
    this.hoveredButton = null;
    this.buttons = [];
    
    // B button state tracking
    this.bButtonWasPressed = false;
    
    // Track game state for re-rendering
    this.lastKnownGameState = null;
    this.lastNewGameRequestPending = false;
    this.lastOpponentWantsNewGame = false;
    
    this.loadSettings();
    this.init();
  }

  init() {
    // Create canvas for menu rendering
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');
    
    // Create texture from canvas
    this.canvasTexture = new THREE.CanvasTexture(this.canvas);
    this.canvasTexture.minFilter = THREE.LinearFilter;
    this.canvasTexture.magFilter = THREE.LinearFilter;
    
    // Create menu mesh
    const geometry = new THREE.PlaneGeometry(this.menuWidth, this.menuHeight);
    const material = new THREE.MeshBasicMaterial({
      map: this.canvasTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true
    });
    
    this.menuMesh = new THREE.Mesh(geometry, material);
    
    // Create group for positioning
    this.menuGroup = new THREE.Group();
    this.menuGroup.add(this.menuMesh);
    this.menuGroup.visible = false;
    this.menuGroup.scale.set(0, 0, 0);
    
    // Add glow border mesh behind main menu
    const glowGeometry = new THREE.PlaneGeometry(this.menuWidth + 0.02, this.menuHeight + 0.02);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    this.glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    this.glowMesh.position.z = -0.001;
    this.menuGroup.add(this.glowMesh);
    
    this.game.scene.add(this.menuGroup);
    
    // Create laser pointer for right controller (only visible when menu is open)
    const laserGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -3)
    ]);
    const laserMaterial = new THREE.LineBasicMaterial({ 
      color: 0x00ff88, 
      transparent: true,
      opacity: 0.8
    });
    this.laserPointer = new THREE.Line(laserGeometry, laserMaterial);
    this.laserPointer.visible = false;
    
    // Keyboard support for desktop testing (C key to toggle menu)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        this.toggle();
      }
    });
    
    // Mouse click support for desktop testing
    window.addEventListener('click', (e) => {
      if (this.isOpen) {
        this.handleDesktopClick(e);
      }
    });
    
    // Apply loaded settings
    this.applyLoadedSettings();
    
    // Initial render
    this.render();
    
    console.log('[MENU] Player menu initialized (press C to toggle)');
  }

  // ============================================
  // SETTINGS PERSISTENCE
  // ============================================
  
  saveSettings() {
    const settings = {
      leftHandedMode: this.leftHandedMode,
      bowlingStyleActive: this.bowlingStyleActive,
      tableColor: this.tableColor
    };
    localStorage.setItem('bowlliards_settings', JSON.stringify(settings));
  }
  
  loadSettings() {
    const saved = localStorage.getItem('bowlliards_settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        this.leftHandedMode = settings.leftHandedMode || false;
        this.bowlingStyleActive = settings.bowlingStyleActive || false;
        
        // Handle both old format (position value like 0.22) and new format (hex color like 0x40a4c4)
        const savedColor = settings.tableColor;
        if (savedColor !== undefined) {
          if (savedColor < 1) {
            // Old format - convert position to hex color
            if (Math.abs(savedColor - 0.15) < 0.05) {
              this.tableColor = 0xaa0000; // Red
            } else if (Math.abs(savedColor - 0.29) < 0.05) {
              this.tableColor = 0xD2B48C; // Tan
            } else {
              this.tableColor = 0x40a4c4; // Blue (default)
            }
          } else {
            // New format - use hex color directly
            this.tableColor = savedColor;
          }
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }
  
  applyLoadedSettings() {
    // Apply left-handed mode
    if (this.leftHandedMode && this.game) {
      this.game.setLeftHandedMode(true);
    }
    
    // Apply bowling style
    if (this.bowlingStyleActive && this.game.poolTable) {
      this.game.poolTable.setBallStyle('bowling');
    }
    
    // Apply table color
    if (this.game.poolTable) {
      this.game.poolTable.setFeltColor(this.tableColor);
    }
  }

  // ============================================
  // RENDERING
  // ============================================
  
  render() {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, w, h);
    
    // Background with gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, h);
    bgGradient.addColorStop(0, 'rgba(10, 25, 40, 0.95)');
    bgGradient.addColorStop(1, 'rgba(5, 15, 30, 0.98)');
    
    // Rounded rectangle background
    this.roundRect(ctx, 10, 10, w - 20, h - 20, 20);
    ctx.fillStyle = bgGradient;
    ctx.fill();
    
    // Glowing border
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 15;
    this.roundRect(ctx, 10, 10, w - 20, h - 20, 20);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Reset buttons array
    this.buttons = [];
    
    // Header
    this.renderHeader(ctx, w);
    
    // Render tabs on left side
    this.renderTabs(ctx, 95);
    
    // Render content based on active tab
    const contentX = 170;
    const contentY = 95;
    const contentW = w - contentX - 30;
    const contentH = h - contentY - 100;
    
    switch (this.activeTab) {
      case 'CONTROLS':
        this.renderControlsTab(ctx, contentX, contentY, contentW, contentH);
        break;
      case 'THEMES':
        this.renderThemesTab(ctx, contentX, contentY, contentW, contentH);
        break;
      case 'MULTIPLAYER':
        this.renderMultiplayerTab(ctx, contentX, contentY, contentW, contentH);
        break;
    }
    
    // Render New Game button at bottom
    this.renderNewGameButton(ctx, w, h - 70);
    
    // Update texture
    this.canvasTexture.needsUpdate = true;
  }
  
  renderHeader(ctx, w) {
    ctx.save();
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚙ SETTINGS', w / 2, 55);
    ctx.restore();
    
    // Subtitle - how to toggle menu
    ctx.fillStyle = '#888888';
    ctx.font = 'italic 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Toggle this menu with B button', w / 2, 78);
    ctx.textAlign = 'left';
  }

  renderTabs(ctx, startY) {
    const tabWidth = 130;
    const tabHeight = 55;
    const tabX = 25;
    let y = startY;
    
    this.tabs.forEach((tab, index) => {
      const isActive = tab === this.activeTab;
      const isHovered = this.hoveredButton === `tab_${tab}`;
      
      // Tab background
      if (isActive) {
        // Active tab - highlighted
        const gradient = ctx.createLinearGradient(tabX, y, tabX + tabWidth, y);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 200, 100, 0.1)');
        ctx.fillStyle = gradient;
        this.roundRectLeft(ctx, tabX, y, tabWidth, tabHeight, 10);
        ctx.fill();
        
        // Active border
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Inactive tab
        ctx.fillStyle = isHovered ? 'rgba(40, 60, 80, 0.6)' : 'rgba(30, 45, 60, 0.4)';
        this.roundRectLeft(ctx, tabX, y, tabWidth, tabHeight, 10);
        ctx.fill();
        
        if (isHovered) {
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      
      // Tab text
      ctx.fillStyle = isActive ? '#00ff88' : (isHovered ? '#ffffff' : '#aaaaaa');
      ctx.font = `bold ${isActive ? 16 : 14}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(tab, tabX + tabWidth / 2, y + tabHeight / 2 + 5);
      
      // Store button for click detection
      this.buttons.push({
        x: tabX,
        y: y,
        w: tabWidth,
        h: tabHeight,
        id: `tab_${tab}`,
        type: 'tab'
      });
      
      y += tabHeight + 8;
    });
  }
  
  // Rounded rect with only left corners rounded
  roundRectLeft(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ============================================
  // CONTROLS TAB
  // ============================================
  
  renderControlsTab(ctx, x, y, w, h) {
    // Left-handed mode toggle
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🎮 Left-Handed Mode', x, y + 25);
    
    this.renderToggleButton(ctx, x + w - 100, y, 90, 40, this.leftHandedMode, 'leftHanded');
    
    // Divider
    this.renderDivider(ctx, x, y + 55, w);
    
    // Controls description header
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText('VR Controls', x, y + 90);
    
    // Control descriptions
    ctx.fillStyle = '#cccccc';
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    
    const controls = [
      { label: 'Trigger', desc: 'Locks aim line / Shoot' },
      { label: 'Grip', desc: 'Grab cue ball (when allowed)' },
      { label: 'B Button', desc: 'Open this menu' },
      { label: 'X/A Button', desc: 'Browse leaderboard' },
      { label: 'Y + R-Stick', desc: 'Adjust player height' },
      { label: 'Thumbstick', desc: 'Move around table' }
    ];
    
    let cy = y + 115;
    controls.forEach(control => {
      // Label (cyan)
      ctx.fillStyle = '#00ddff';
      ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
      ctx.fillText(control.label + ':', x + 10, cy);
      
      // Description
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '14px "Segoe UI", Arial, sans-serif';
      ctx.fillText(control.desc, x + 110, cy);
      
      cy += 25;
    });
    
    // Desktop controls
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Desktop Controls', x, cy + 20);
    
    const desktopControls = [
      { label: 'Click + Drag', desc: 'Aim and shoot' },
      { label: 'Right Click', desc: 'Rotate camera' },
      { label: 'Scroll', desc: 'Zoom in/out' },
      { label: 'R Key', desc: 'New game' },
      { label: 'C Key', desc: 'Open this menu' }
    ];
    
    cy += 45;
    desktopControls.forEach(control => {
      ctx.fillStyle = '#00ddff';
      ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
      ctx.fillText(control.label + ':', x + 10, cy);
      
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '14px "Segoe UI", Arial, sans-serif';
      ctx.fillText(control.desc, x + 120, cy);
      
      cy += 25;
    });
  }

  // ============================================
  // THEMES TAB
  // ============================================
  
  renderThemesTab(ctx, x, y, w, h) {
    // Ball Style section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🎳 Bowling Pins Style', x, y + 25);
    
    this.renderToggleButton(ctx, x + w - 100, y, 90, 40, this.bowlingStyleActive, 'bowling');
    
    // Divider
    this.renderDivider(ctx, x, y + 55, w);
    
    // Table Color section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('🎨 Table Felt Color', x, y + 95);
    
    // Color swatches
    const colors = [
      { color: 0xaa0000, name: 'Red', hex: '#aa0000' },
      { color: 0x40a4c4, name: 'Blue', hex: '#40a4c4' },
      { color: 0xD2B48C, name: 'Tan', hex: '#D2B48C' },
      { color: 0x228B22, name: 'Green', hex: '#228B22' },
      { color: 0x4B0082, name: 'Purple', hex: '#4B0082' }
    ];
    
    let cx = x + 10;
    const cy = y + 120;
    const swatchSize = 50;
    const swatchGap = 10;
    
    colors.forEach((c, i) => {
      const isSelected = this.tableColor === c.color;
      const isHovered = this.hoveredButton === `color_${c.color}`;
      
      // Swatch background
      ctx.fillStyle = c.hex;
      this.roundRect(ctx, cx, cy, swatchSize, swatchSize, 8);
      ctx.fill();
      
      // Selection/hover border
      if (isSelected) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Color name below
      ctx.fillStyle = isSelected ? '#00ff88' : '#888888';
      ctx.font = '12px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.name, cx + swatchSize / 2, cy + swatchSize + 15);
      ctx.textAlign = 'left';
      
      // Store button
      this.buttons.push({
        x: cx,
        y: cy,
        w: swatchSize,
        h: swatchSize,
        id: `color_${c.color}`,
        type: 'color',
        color: c.color
      });
      
      cx += swatchSize + swatchGap;
    });
    
    // Preview text
    ctx.fillStyle = '#888888';
    ctx.font = 'italic 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Click a color to change the table felt', x + 10, y + 220);
  }

  // ============================================
  // MULTIPLAYER TAB
  // ============================================
  
  renderMultiplayerTab(ctx, x, y, w, h) {
    // Microphone section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🎤 Your Microphone', x, y + 25);
    
    this.renderToggleButton(ctx, x + w - 100, y, 90, 40, !this.localPlayerMuted, 'selfMute');
    
    // Voice connection status
    const voiceChat = this.game.voiceChat;
    const isConnected = voiceChat && voiceChat.isConnected;
    const isInitialized = voiceChat && voiceChat.isInitialized;
    
    let statusText = '🔴 Not connected';
    let statusColor = '#ff4444';
    
    if (isConnected) {
      statusText = '🟢 Voice connected';
      statusColor = '#00ff88';
    } else if (isInitialized) {
      statusText = '🟡 Mic ready';
      statusColor = '#ffaa00';
    }
    
    ctx.fillStyle = statusColor;
    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    ctx.fillText(statusText, x, y + 60);
    
    // Connect button
    this.renderConnectButton(ctx, x + w - 130, y + 45, 120, 35);
    
    // Divider
    this.renderDivider(ctx, x, y + 95, w);
    
    // Players section
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText('PLAYERS IN ROOM', x, y + 125);
    
    // Player list
    this.renderPlayerList(ctx, x, y + 145, w);
  }
  
  renderConnectButton(ctx, x, y, w, h) {
    const voiceChat = this.game.voiceChat;
    const isConnected = voiceChat && voiceChat.isConnected;
    const isHovered = this.hoveredButton === 'voiceConnect';
    
    // Button background
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    if (isConnected) {
      gradient.addColorStop(0, 'rgba(0, 100, 50, 0.8)');
      gradient.addColorStop(1, 'rgba(0, 80, 40, 0.8)');
    } else {
      gradient.addColorStop(0, isHovered ? 'rgba(0, 180, 120, 0.9)' : 'rgba(0, 150, 100, 0.9)');
      gradient.addColorStop(1, isHovered ? 'rgba(0, 140, 90, 0.9)' : 'rgba(0, 120, 80, 0.9)');
    }
    
    this.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();
    
    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isConnected ? '🔄 Reconnect' : '📞 Connect', x + w / 2, y + h / 2 + 5);
    ctx.textAlign = 'left';
    
    this.buttons.push({ x, y, w, h, id: 'voiceConnect', type: 'action' });
  }

  renderPlayerList(ctx, x, y, w) {
    const players = this.getPlayerList();
    const remotes = players.filter(p => !p.isLocal);
    
    if (remotes.length === 0) {
      ctx.fillStyle = '#555555';
      ctx.font = 'italic 16px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('No other players in room', x + 10, y + 25);
      return;
    }
    
    remotes.forEach((player, index) => {
      const rowY = y + index * 70;
      
      // Player card background
      const cardGradient = ctx.createLinearGradient(x, rowY, x, rowY + 60);
      cardGradient.addColorStop(0, 'rgba(40, 60, 80, 0.6)');
      cardGradient.addColorStop(1, 'rgba(30, 45, 60, 0.6)');
      
      this.roundRect(ctx, x, rowY, w, 60, 10);
      ctx.fillStyle = cardGradient;
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Player avatar circle
      ctx.beginPath();
      ctx.arc(x + 30, rowY + 30, 18, 0, Math.PI * 2);
      const avatarGradient = ctx.createRadialGradient(x + 30, rowY + 25, 0, x + 30, rowY + 30, 18);
      avatarGradient.addColorStop(0, '#4488ff');
      avatarGradient.addColorStop(1, '#2255aa');
      ctx.fillStyle = avatarGradient;
      ctx.fill();
      
      // Player initial
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.name.charAt(0).toUpperCase(), x + 30, rowY + 35);
      ctx.textAlign = 'left';
      
      // Player name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
      const displayName = player.name.length > 10 ? player.name.substring(0, 10) + '...' : player.name;
      ctx.fillText(displayName, x + 55, rowY + 28);
      
      // Status
      ctx.fillStyle = '#888888';
      ctx.font = '12px "Segoe UI", Arial, sans-serif';
      const status = player.isMuted ? 'Muted' : 'Connected';
      ctx.fillText(status, x + 55, rowY + 45);
      
      // Mute button
      this.renderIconButton(ctx, x + w - 100, rowY + 10, 40, 40, '🔊', '🔇', !player.isMuted, `mute_${player.id}`);
      
      // Hide avatar button
      this.renderIconButton(ctx, x + w - 50, rowY + 10, 40, 40, '👁', '👁‍🗨', !player.isHidden, `hide_${player.id}`);
    });
  }

  renderNewGameButton(ctx, w, y) {
    const gameOver = this.game.gameState === 'gameOver';
    const isMultiplayer = this.game.isMultiplayer;
    const newGameRequestPending = this.game.newGameRequestPending || false;
    const opponentWantsNewGame = this.game.opponentWantsNewGame || false;
    
    const btnW = 200;
    const btnH = 45;
    const btnX = (w - btnW) / 2;
    const btnY = y;
    
    this.buttons.push({ x: btnX, y: btnY, w: btnW, h: btnH, id: 'newGame', type: 'action' });
    
    const isHovered = this.hoveredButton === 'newGame';
    
    let isClickable = false;
    let buttonText = '🎱 New Game';
    let bgColor1, bgColor2, borderColor;
    
    if (!isMultiplayer) {
      isClickable = true;
      buttonText = gameOver ? '🎱 Play Again!' : '🎱 New Game';
      bgColor1 = isHovered ? 'rgba(255, 180, 0, 0.95)' : 'rgba(220, 150, 0, 0.9)';
      bgColor2 = isHovered ? 'rgba(220, 150, 0, 0.95)' : 'rgba(180, 120, 0, 0.9)';
      borderColor = '#ffaa00';
    } else if (newGameRequestPending) {
      isClickable = false;
      buttonText = '⏳ Waiting...';
      bgColor1 = 'rgba(100, 100, 0, 0.7)';
      bgColor2 = 'rgba(80, 80, 0, 0.7)';
      borderColor = '#aaaa00';
    } else if (opponentWantsNewGame) {
      isClickable = true;
      buttonText = '✅ Accept New Game';
      bgColor1 = isHovered ? 'rgba(0, 255, 100, 0.95)' : 'rgba(0, 200, 80, 0.9)';
      bgColor2 = isHovered ? 'rgba(0, 200, 80, 0.95)' : 'rgba(0, 160, 60, 0.9)';
      borderColor = '#00ff88';
    } else {
      isClickable = true;
      buttonText = '🎱 Request New Game';
      bgColor1 = isHovered ? 'rgba(0, 180, 220, 0.95)' : 'rgba(0, 140, 180, 0.9)';
      bgColor2 = isHovered ? 'rgba(0, 140, 180, 0.95)' : 'rgba(0, 100, 140, 0.9)';
      borderColor = '#00aaff';
    }
    
    const btnGradient = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGradient.addColorStop(0, bgColor1);
    btnGradient.addColorStop(1, bgColor2);
    
    this.roundRect(ctx, btnX, btnY, btnW, btnH, 10);
    ctx.fillStyle = btnGradient;
    ctx.fill();
    
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isHovered && isClickable ? 3 : 2;
    ctx.stroke();
    
    if (isClickable && isHovered) {
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    ctx.fillStyle = isClickable ? '#ffffff' : '#cccccc';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(buttonText, btnX + btnW / 2, btnY + btnH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  renderToggleButton(ctx, x, y, w, h, isOn, id) {
    this.buttons.push({ x, y, w, h, id, type: 'toggle' });
    
    const isHovered = this.hoveredButton === id;
    
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    if (isOn) {
      gradient.addColorStop(0, isHovered ? '#00ff99' : '#00dd77');
      gradient.addColorStop(1, isHovered ? '#00cc66' : '#00aa55');
    } else {
      gradient.addColorStop(0, isHovered ? '#ff5555' : '#dd4444');
      gradient.addColorStop(1, isHovered ? '#cc3333' : '#aa2222');
    }
    
    this.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    if (isOn) {
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = isHovered ? 15 : 8;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isOn ? 'ON' : 'OFF', x + w / 2, y + h / 2 + 5);
    ctx.textAlign = 'left';
  }
  
  renderIconButton(ctx, x, y, w, h, iconOn, iconOff, isOn, id) {
    this.buttons.push({ x, y, w, h, id, type: 'icon', isOn });
    
    const isHovered = this.hoveredButton === id;
    
    this.roundRect(ctx, x, y, w, h, 8);
    
    if (isOn) {
      const gradient = ctx.createLinearGradient(x, y, x, y + h);
      gradient.addColorStop(0, isHovered ? 'rgba(0, 255, 136, 0.4)' : 'rgba(0, 255, 136, 0.2)');
      gradient.addColorStop(1, isHovered ? 'rgba(0, 200, 100, 0.4)' : 'rgba(0, 200, 100, 0.2)');
      ctx.fillStyle = gradient;
    } else {
      const gradient = ctx.createLinearGradient(x, y, x, y + h);
      gradient.addColorStop(0, isHovered ? 'rgba(255, 80, 80, 0.4)' : 'rgba(255, 80, 80, 0.2)');
      gradient.addColorStop(1, isHovered ? 'rgba(200, 50, 50, 0.4)' : 'rgba(200, 50, 50, 0.2)');
      ctx.fillStyle = gradient;
    }
    ctx.fill();
    
    ctx.strokeStyle = isOn ? 'rgba(0, 255, 136, 0.6)' : 'rgba(255, 80, 80, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.font = '20px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isOn ? '#00ff88' : '#ff6666';
    ctx.fillText(isOn ? iconOn : iconOff, x + w / 2, y + h / 2 + 7);
    ctx.textAlign = 'left';
  }
  
  renderDivider(ctx, x, y, width) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0)');
    gradient.addColorStop(0.5, 'rgba(0, 255, 136, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ============================================
  // PLAYER MANAGEMENT
  // ============================================
  
  getPlayerList() {
    const players = [];
    
    if (this.game.voiceChat) {
      this.localPlayerMuted = this.game.voiceChat.isLocalMuted();
    }
    
    players.push({
      id: 'local',
      name: this.game.myPlayerName || 'You',
      isMuted: this.localPlayerMuted,
      isHidden: false,
      isLocal: true
    });
    
    if (this.game.networkManager && this.game.isMultiplayer) {
      const remoteName = this.game.remotePlayerName || 'Opponent';
      const remoteState = this.players.get('remote') || { isMuted: false, isHidden: false };
      
      if (this.game.voiceChat) {
        remoteState.isMuted = this.game.voiceChat.isRemoteMuted();
      }
      
      players.push({
        id: 'remote',
        name: remoteName,
        isMuted: remoteState.isMuted,
        isHidden: remoteState.isHidden,
        isLocal: false
      });
    }
    
    return players;
  }
  
  setPlayerMuted(playerId, muted) {
    if (playerId === 'local' || playerId === 'selfMute') {
      this.localPlayerMuted = muted;
      if (this.game.voiceChat) {
        this.game.voiceChat.setLocalMuted(muted);
      }
    } else {
      const state = this.players.get(playerId) || { isMuted: false, isHidden: false };
      state.isMuted = muted;
      this.players.set(playerId, state);
      if (this.game.voiceChat) {
        this.game.voiceChat.setRemoteMuted(playerId, muted);
      }
    }
    this.render();
  }
  
  setPlayerHidden(playerId, hidden) {
    const state = this.players.get(playerId) || { isMuted: false, isHidden: false };
    state.isHidden = hidden;
    this.players.set(playerId, state);
    if (this.game.networkManager) {
      this.game.networkManager.setGhostVisible(!hidden);
    }
    this.render();
  }

  // ============================================
  // MENU OPEN/CLOSE
  // ============================================
  
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
  
  open() {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.lastKnownGameState = this.game.gameState;
    const session = this.game.renderer.xr.getSession();
    this.targetScale = session ? 0.5 : 1;
    this.menuGroup.visible = true;
    this.positionMenu();
    this.render();
    
    // Show laser pointers for menu interaction
    if (this.game.laser1) this.game.laser1.visible = true;
    if (this.game.laser2) this.game.laser2.visible = true;
    
    if (this.game.soundManager) {
      this.game.soundManager.playSound('uiClick', null, 0.3);
    }
    
    console.log('[MENU] Menu opened');
  }
  
  close() {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    this.targetScale = 0;
    
    // Hide laser pointers and reset their length
    if (this.game.laser1) {
      this.game.laser1.visible = false;
      this.resetLaserLength(this.game.laser1);
    }
    if (this.game.laser2) {
      this.game.laser2.visible = false;
      this.resetLaserLength(this.game.laser2);
    }
    
    // Mark player as having played (so menu defaults to MULTIPLAYER tab next time)
    localStorage.setItem('bowlliards_hasPlayed', 'true');
    
    if (this.game.soundManager) {
      this.game.soundManager.playSound('uiClick', null, 0.2);
    }
    
    console.log('[MENU] Menu closed');
  }
  
  resetLaserLength(laser) {
    if (!laser) return;
    const positions = laser.geometry.attributes.position.array;
    positions[5] = -3; // Reset to full length
    laser.geometry.attributes.position.needsUpdate = true;
    laser.material.color.setHex(0x00ffff); // Reset to cyan
  }
  
  positionMenu() {
    const session = this.game.renderer.xr.getSession();
    
    if (session) {
      // Use the game's tracked left hand controller (set by handedness on connection)
      const leftController = this.game.leftHandController;
      
      if (leftController) {
        const controllerPos = new THREE.Vector3();
        leftController.getWorldPosition(controllerPos);
        
        this.menuGroup.position.set(controllerPos.x, controllerPos.y + 0.2, controllerPos.z);
        
        const cameraPos = new THREE.Vector3();
        this.game.renderer.xr.getCamera().getWorldPosition(cameraPos);
        
        const direction = new THREE.Vector3();
        direction.subVectors(cameraPos, this.menuGroup.position);
        direction.y = 0;
        direction.normalize();
        
        const angle = Math.atan2(direction.x, direction.z) + Math.PI;
        this.menuGroup.rotation.set(0, angle, 0);
      }
    } else {
      const camera = this.game.camera;
      const cameraPos = new THREE.Vector3();
      const cameraDir = new THREE.Vector3();
      
      camera.getWorldPosition(cameraPos);
      camera.getWorldDirection(cameraDir);
      
      const menuPos = cameraPos.clone().add(cameraDir.multiplyScalar(2.0));
      menuPos.y = cameraPos.y;
      
      this.menuGroup.position.copy(menuPos);
      this.menuGroup.lookAt(cameraPos);
    }
  }

  // ============================================
  // UPDATE & INPUT HANDLING
  // ============================================
  
  update(delta) {
    if (this.currentScale !== this.targetScale) {
      const diff = this.targetScale - this.currentScale;
      this.currentScale += diff * this.animationSpeed * delta;
      
      if (Math.abs(diff) < 0.01) {
        this.currentScale = this.targetScale;
        if (this.targetScale === 0) {
          this.menuGroup.visible = false;
        }
      }
      
      this.menuGroup.scale.set(this.currentScale, this.currentScale, this.currentScale);
    }
    
    if (this.isOpen && this.glowMesh) {
      const pulse = 0.2 + Math.sin(Date.now() * 0.003) * 0.1;
      this.glowMesh.material.opacity = pulse;
    }
    
    if (this.isOpen && this.game.renderer.xr.getSession()) {
      this.positionMenu();
    }
    
    this.checkControllerInput();
    
    if (this.isOpen) {
      this.checkInteraction();
      
      const currentNewGamePending = this.game.newGameRequestPending || false;
      const currentOpponentWants = this.game.opponentWantsNewGame || false;
      
      if (this.game.gameState !== this.lastKnownGameState ||
          currentNewGamePending !== this.lastNewGameRequestPending ||
          currentOpponentWants !== this.lastOpponentWantsNewGame) {
        this.lastKnownGameState = this.game.gameState;
        this.lastNewGameRequestPending = currentNewGamePending;
        this.lastOpponentWantsNewGame = currentOpponentWants;
        this.render();
      }
    }
  }
  
  checkControllerInput() {
    const session = this.game.renderer.xr.getSession();
    if (!session) return;
    
    for (const source of session.inputSources) {
      if (source.gamepad && source.handedness === 'right') {
        const bButton = source.gamepad.buttons[5];
        
        if (bButton && bButton.pressed && !this.bButtonWasPressed) {
          this.toggle();
        }
        
        this.bButtonWasPressed = bButton ? bButton.pressed : false;
      }
    }
  }
  
  checkInteraction() {
    const session = this.game.renderer.xr.getSession();
    if (!session) return;
    
    // Only use RIGHT hand controller for menu interaction
    const rightController = this.game.rightHandController;
    if (!rightController) return;
    
    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(rightController.matrixWorld);
    
    const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
    const rayOrigin = new THREE.Vector3().setFromMatrixPosition(rightController.matrixWorld);
    
    raycaster.set(rayOrigin, rayDir);
    
    const intersects = raycaster.intersectObject(this.menuMesh);
    
    // Update laser length based on intersection
    this.updateLaserLength(rightController, intersects.length > 0 ? intersects[0].distance : null);
    
    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      if (uv) {
        // Find the right hand input source for trigger detection
        let rightInputSource = null;
        for (const source of session.inputSources) {
          if (source.handedness === 'right') {
            rightInputSource = source;
            break;
          }
        }
        this.handlePointer(uv, rightInputSource);
      }
    } else {
      // Not hovering over menu - clear hover state
      if (this.hoveredButton !== null) {
        this.hoveredButton = null;
        this.render();
      }
    }
  }
  
  updateLaserLength(controller, hitDistance) {
    // Find which laser belongs to this controller
    let laser = null;
    if (controller === this.game.controller1) {
      laser = this.game.laser1;
    } else if (controller === this.game.controller2) {
      laser = this.game.laser2;
    }
    
    if (!laser) return;
    
    // Set laser length: stop at menu if hitting, otherwise full length
    const length = hitDistance !== null ? hitDistance : 3;
    
    const positions = laser.geometry.attributes.position.array;
    positions[5] = -length; // Z coordinate of end point
    laser.geometry.attributes.position.needsUpdate = true;
    
    // Change color when hitting menu
    if (hitDistance !== null) {
      laser.material.color.setHex(0x00ff88); // Green when hitting menu
    } else {
      laser.material.color.setHex(0x00ffff); // Cyan when not hitting
    }
  }

  handlePointer(uv, inputSource) {
    const canvasX = uv.x * this.canvasWidth;
    const canvasY = (1 - uv.y) * this.canvasHeight;
    
    let newHovered = null;
    for (const btn of this.buttons) {
      if (canvasX >= btn.x && canvasX <= btn.x + btn.w &&
          canvasY >= btn.y && canvasY <= btn.y + btn.h) {
        newHovered = btn.id;
        
        if (inputSource && inputSource.gamepad) {
          const trigger = inputSource.gamepad.buttons[0];
          if (trigger && trigger.pressed && !this.triggerWasPressed) {
            this.handleButtonClick(btn);
          }
          this.triggerWasPressed = trigger ? trigger.pressed : false;
        }
        break;
      }
    }
    
    if (newHovered !== this.hoveredButton) {
      this.hoveredButton = newHovered;
      this.render();
    }
  }
  
  handleButtonClick(btn) {
    console.log('[MENU] Button clicked:', btn.id);
    
    if (this.game.soundManager) {
      this.game.soundManager.playSound('uiClick', null, 0.5);
    }
    
    // Tab buttons
    if (btn.id.startsWith('tab_')) {
      const tab = btn.id.replace('tab_', '');
      this.activeTab = tab;
      this.render();
      return;
    }
    
    // Settings toggles
    if (btn.id === 'leftHanded') {
      this.leftHandedMode = !this.leftHandedMode;
      if (this.game) {
        this.game.setLeftHandedMode(this.leftHandedMode);
      }
      this.saveSettings();
      this.render();
      return;
    }
    
    if (btn.id === 'bowling') {
      this.bowlingStyleActive = !this.bowlingStyleActive;
      if (this.game.poolTable) {
        this.game.poolTable.setBallStyle(this.bowlingStyleActive ? 'bowling' : 'default');
      }
      this.saveSettings();
      this.render();
      return;
    }
    
    // Color buttons
    if (btn.id.startsWith('color_')) {
      this.tableColor = btn.color;
      if (this.game.poolTable) {
        this.game.poolTable.setFeltColor(this.tableColor);
      }
      this.saveSettings();
      this.render();
      return;
    }
    
    // Voice controls
    if (btn.id === 'selfMute') {
      this.setPlayerMuted('local', !this.localPlayerMuted);
      return;
    }
    
    if (btn.id === 'voiceConnect') {
      this.connectVoice();
      return;
    }
    
    // New Game
    if (btn.id === 'newGame') {
      const newGameRequestPending = this.game.newGameRequestPending || false;
      
      if (newGameRequestPending) {
        this.game.showNotification('Already waiting for opponent...', 2000);
      } else {
        this.game.startNewGame();
        if (!this.game.isMultiplayer) {
          this.close();
        }
      }
      return;
    }
    
    // Player mute/hide
    if (btn.id.startsWith('mute_')) {
      const playerId = btn.id.replace('mute_', '');
      const state = this.players.get(playerId) || { isMuted: false, isHidden: false };
      this.setPlayerMuted(playerId, !state.isMuted);
      return;
    }
    
    if (btn.id.startsWith('hide_')) {
      const playerId = btn.id.replace('hide_', '');
      const state = this.players.get(playerId) || { isMuted: false, isHidden: false };
      this.setPlayerHidden(playerId, !state.isHidden);
      return;
    }
  }

  async connectVoice() {
    console.log('[MENU] Manual voice connect requested');
    this.game.showNotification('🎤 Connecting voice...', 2000);
    
    if (!this.game.voiceChat) {
      this.game.showNotification('❌ Voice chat not available', 3000);
      return;
    }
    
    if (this.game.voiceChat.isConnected) {
      this.game.voiceChat.disconnect();
    }
    
    const initialized = await this.game.voiceChat.init();
    if (!initialized) {
      this.game.showNotification('❌ Mic init failed', 3000);
      return;
    }
    
    if (this.game.myPlayerNumber === 1) {
      this.game.showNotification('📞 Calling opponent...', 2000);
      this.game.voiceChat.startCall();
    } else {
      if (this.game.networkManager && this.game.networkManager.socket) {
        this.game.networkManager.socket.emit('voiceRequestCall', {
          roomCode: this.game.networkManager.roomCode
        });
        this.game.showNotification('📞 Requesting voice call...', 2000);
      }
    }
    
    this.render();
  }
  
  handleDesktopClick(event) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, this.game.camera);
    
    const intersects = raycaster.intersectObject(this.menuMesh);
    
    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      if (uv) {
        const canvasX = uv.x * this.canvasWidth;
        const canvasY = (1 - uv.y) * this.canvasHeight;
        
        for (const btn of this.buttons) {
          if (canvasX >= btn.x && canvasX <= btn.x + btn.w &&
              canvasY >= btn.y && canvasY <= btn.y + btn.h) {
            this.handleButtonClick(btn);
            break;
          }
        }
      }
    }
  }
  
  // ============================================
  // CLEANUP
  // ============================================
  
  dispose() {
    if (this.menuGroup) {
      this.game.scene.remove(this.menuGroup);
    }
    if (this.canvasTexture) {
      this.canvasTexture.dispose();
    }
    console.log('[MENU] Player menu disposed');
  }
}
