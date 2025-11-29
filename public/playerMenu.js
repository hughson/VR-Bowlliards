// ============================================
// PLAYER MENU - Stylish VR Menu System
// Opens with B button, shows player controls
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
    
    // Player states (keyed by visually displayed slot, not socket ID for easy UI)
    this.players = new Map(); // id -> { name, isMuted, isHidden, isLocal }
    this.localPlayerMuted = false;
    
    // Menu dimensions
    this.menuWidth = 0.5;  // meters
    this.menuHeight = 0.6; // meters
    this.canvasWidth = 512;
    this.canvasHeight = 614;
    
    // Animation
    this.targetScale = 0;
    this.currentScale = 0;
    this.animationSpeed = 8;
    
    // Button hover states
    this.hoveredButton = null;
    this.buttons = [];
    
    // B button state tracking
    this.bButtonWasPressed = false;
    
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
    
    // Initial render
    this.render();
    
    console.log('[MENU] Player menu initialized (press C to toggle)');
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
    
    // Header
    this.renderHeader(ctx, w);
    
    // Reset buttons array
    this.buttons = [];
    
    // Render self-mute section
    this.renderSelfControls(ctx, w, 100);
    
    // Divider
    this.renderDivider(ctx, 30, 180, w - 60);
    
    // Players section header
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PLAYERS IN ROOM', 40, 215);
    
    // Render player list
    this.renderPlayerList(ctx, w, 240);
    
    // Update texture
    this.canvasTexture.needsUpdate = true;
  }
  
  renderHeader(ctx, w) {
    // Title with glow effect
    ctx.save();
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚙ SETTINGS', w / 2, 65);
    ctx.restore();
  }
  
  renderSelfControls(ctx, w, y) {
    // "Your Microphone" label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🎤  Your Microphone', 40, y + 10);
    
    // Mute toggle button
    const btnX = w - 160;
    const btnY = y - 15;
    const btnW = 120;
    const btnH = 45;
    
    this.renderToggleButton(ctx, btnX, btnY, btnW, btnH, !this.localPlayerMuted, 'selfMute');
  }

  renderPlayerList(ctx, w, startY) {
    let y = startY;
    const rowHeight = 90;
    
    // Get players from network manager or use placeholder
    const players = this.getPlayerList();
    
    if (players.length === 0) {
      ctx.fillStyle = '#555555';
      ctx.font = 'italic 18px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No other players in room', w / 2, y + 30);
      return;
    }
    
    players.forEach((player, index) => {
      if (!player.isLocal) {
        this.renderPlayerRow(ctx, w, y, player, index);
        y += rowHeight;
      }
    });
  }
  
  renderPlayerRow(ctx, w, y, player, index) {
    // Player card background
    const cardGradient = ctx.createLinearGradient(30, y, 30, y + 75);
    cardGradient.addColorStop(0, 'rgba(40, 60, 80, 0.6)');
    cardGradient.addColorStop(1, 'rgba(30, 45, 60, 0.6)');
    
    this.roundRect(ctx, 30, y, this.canvasWidth - 60, 75, 12);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    // Subtle border
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, 30, y, this.canvasWidth - 60, 75, 12);
    ctx.stroke();
    
    // Player avatar circle
    ctx.beginPath();
    ctx.arc(75, y + 37, 22, 0, Math.PI * 2);
    const avatarGradient = ctx.createRadialGradient(75, y + 32, 0, 75, y + 37, 22);
    avatarGradient.addColorStop(0, '#4488ff');
    avatarGradient.addColorStop(1, '#2255aa');
    ctx.fillStyle = avatarGradient;
    ctx.fill();
    
    // Player initial
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name.charAt(0).toUpperCase(), 75, y + 44);
    
    // Player name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    const displayName = player.name.length > 12 ? player.name.substring(0, 12) + '...' : player.name;
    ctx.fillText(displayName, 110, y + 32);
    
    // Status text
    ctx.fillStyle = '#888888';
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    const status = player.isMuted && player.isHidden ? 'Muted & Hidden' :
                   player.isMuted ? 'Muted' :
                   player.isHidden ? 'Hidden' : 'Connected';
    ctx.fillText(status, 110, y + 52);
    
    // Mute button (speaker icon)
    const muteX = this.canvasWidth - 170;
    this.renderIconButton(ctx, muteX, y + 12, 50, 50, '🔊', '🔇', !player.isMuted, `mute_${player.id}`);
    
    // Hide avatar button (eye icon)
    const hideX = this.canvasWidth - 105;
    this.renderIconButton(ctx, hideX, y + 12, 50, 50, '👁', '👁‍🗨', !player.isHidden, `hide_${player.id}`);
  }

  renderToggleButton(ctx, x, y, w, h, isOn, id) {
    // Track button for hit testing
    this.buttons.push({ x, y, w, h, id, type: 'toggle' });
    
    const isHovered = this.hoveredButton === id;
    
    // Button background
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
    
    // Button glow when on
    if (isOn) {
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = isHovered ? 15 : 8;
      this.roundRect(ctx, x, y, w, h, 8);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isOn ? 'ON' : 'OFF', x + w/2, y + h/2 + 6);
  }
  
  renderIconButton(ctx, x, y, w, h, iconOn, iconOff, isOn, id) {
    // Track button for hit testing
    this.buttons.push({ x, y, w, h, id, type: 'icon', isOn });
    
    const isHovered = this.hoveredButton === id;
    
    // Button background
    this.roundRect(ctx, x, y, w, h, 10);
    
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
    
    // Border
    ctx.strokeStyle = isOn ? 'rgba(0, 255, 136, 0.6)' : 'rgba(255, 80, 80, 0.6)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();
    
    // Icon
    ctx.font = '24px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isOn ? '#00ff88' : '#ff6666';
    ctx.fillText(isOn ? iconOn : iconOff, x + w/2, y + h/2 + 8);
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
    
    // Sync local mute state with voice chat
    if (this.game.voiceChat) {
      this.localPlayerMuted = this.game.voiceChat.isLocalMuted();
    }
    
    // Add local player
    players.push({
      id: 'local',
      name: this.game.myPlayerName || 'You',
      isMuted: this.localPlayerMuted,
      isHidden: false,
      isLocal: true
    });
    
    // Add remote players from network manager
    if (this.game.networkManager && this.game.isMultiplayer) {
      const remoteName = this.game.remotePlayerName || 'Opponent';
      const remoteState = this.players.get('remote') || { isMuted: false, isHidden: false };
      
      // Sync remote mute state with voice chat
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
      console.log('[MENU] Local player muted:', muted);
      
      // Mute/unmute microphone
      if (this.game.voiceChat) {
        this.game.voiceChat.setLocalMuted(muted);
      }
    } else {
      const state = this.players.get(playerId) || { isMuted: false, isHidden: false };
      state.isMuted = muted;
      this.players.set(playerId, state);
      console.log('[MENU] Player', playerId, 'muted:', muted);
      
      // Mute/unmute remote player audio
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
    console.log('[MENU] Player', playerId, 'hidden:', hidden);
    
    // Actually hide the avatar
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
    // Use smaller scale in VR (attached to controller), larger on desktop
    const session = this.game.renderer.xr.getSession();
    this.targetScale = session ? 0.5 : 1;
    this.menuGroup.visible = true;
    this.positionMenu();
    this.render();
    
    // Play open sound
    if (this.game.soundManager) {
      this.game.soundManager.playSound('uiClick', null, 0.3);
    }
    
    console.log('[MENU] Menu opened');
  }
  
  close() {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    this.targetScale = 0;
    this._menuInitialRotationSet = false; // Reset so menu faces user next time
    
    // Play close sound
    if (this.game.soundManager) {
      this.game.soundManager.playSound('uiClick', null, 0.2);
    }
    
    console.log('[MENU] Menu closed');
  }
  
  positionMenu() {
    const session = this.game.renderer.xr.getSession();
    
    if (session) {
      // In VR: Attach to left controller
      const leftController = this.game.renderer.xr.getController(0); // Usually left controller
      
      if (leftController) {
        // Get controller world position
        const controllerPos = new THREE.Vector3();
        leftController.getWorldPosition(controllerPos);
        
        // Position menu above the controller
        this.menuGroup.position.set(
          controllerPos.x,
          controllerPos.y + 0.2,
          controllerPos.z
        );
        
        // Get user's head position for facing direction (only on first open)
        if (!this._menuInitialRotationSet) {
          const cameraPos = new THREE.Vector3();
          this.game.renderer.xr.getCamera().getWorldPosition(cameraPos);
          
          // Make menu face the camera horizontally only (no tilt)
          const lookTarget = new THREE.Vector3(cameraPos.x, this.menuGroup.position.y, cameraPos.z);
          this.menuGroup.lookAt(lookTarget);
          this._menuInitialRotationSet = true;
        }
      }
    } else {
      // Desktop mode: Position in front of camera
      const camera = this.game.camera;
      
      const cameraPos = new THREE.Vector3();
      const cameraDir = new THREE.Vector3();
      
      camera.getWorldPosition(cameraPos);
      camera.getWorldDirection(cameraDir);
      
      // Position menu 2m in front of camera
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
    // Animate menu scale
    if (this.currentScale !== this.targetScale) {
      const diff = this.targetScale - this.currentScale;
      this.currentScale += diff * this.animationSpeed * delta;
      
      // Snap to target when close
      if (Math.abs(diff) < 0.01) {
        this.currentScale = this.targetScale;
        if (this.targetScale === 0) {
          this.menuGroup.visible = false;
        }
      }
      
      this.menuGroup.scale.set(this.currentScale, this.currentScale, this.currentScale);
    }
    
    // Pulse glow effect when open
    if (this.isOpen && this.glowMesh) {
      const pulse = 0.2 + Math.sin(Date.now() * 0.003) * 0.1;
      this.glowMesh.material.opacity = pulse;
    }
    
    // Keep menu attached to left controller while open in VR
    if (this.isOpen && this.game.renderer.xr.getSession()) {
      this.positionMenu();
    }
    
    // Check for B button press
    this.checkControllerInput();
    
    // Update hover states and check for clicks
    if (this.isOpen) {
      this.checkInteraction();
    }
  }
  
  checkControllerInput() {
    const session = this.game.renderer.xr.getSession();
    if (!session) return;
    
    for (const source of session.inputSources) {
      if (source.gamepad && source.handedness === 'right') {
        // B button is buttons[5] on RIGHT controller only
        // (buttons[5] on left controller is Y - we don't want that)
        const bButton = source.gamepad.buttons[5];
        
        if (bButton && bButton.pressed && !this.bButtonWasPressed) {
          this.toggle();
        }
        
        this.bButtonWasPressed = bButton ? bButton.pressed : false;
      }
    }
  }
  
  checkInteraction() {
    // Get controller positions and check for pointing at menu
    const session = this.game.renderer.xr.getSession();
    if (!session) return;
    
    // Use right controller for pointing
    const controllers = this.game.renderer.xr.getControllerGrip
      ? [this.game.renderer.xr.getController(0), this.game.renderer.xr.getController(1)]
      : [];
    
    for (let i = 0; i < controllers.length; i++) {
      const controller = controllers[i];
      if (!controller) continue;
      
      // Raycast from controller to menu
      const raycaster = new THREE.Raycaster();
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      
      const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
      const rayOrigin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
      
      raycaster.set(rayOrigin, rayDir);
      
      const intersects = raycaster.intersectObject(this.menuMesh);
      
      if (intersects.length > 0) {
        const uv = intersects[0].uv;
        if (uv) {
          this.handlePointer(uv, session.inputSources[i]);
        }
      }
    }
  }

  handlePointer(uv, inputSource) {
    // Convert UV to canvas coordinates
    const canvasX = uv.x * this.canvasWidth;
    const canvasY = (1 - uv.y) * this.canvasHeight; // Flip Y
    
    // Check which button is being hovered
    let newHovered = null;
    for (const btn of this.buttons) {
      if (canvasX >= btn.x && canvasX <= btn.x + btn.w &&
          canvasY >= btn.y && canvasY <= btn.y + btn.h) {
        newHovered = btn.id;
        
        // Check for trigger press (click)
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
    
    // Update hover state if changed
    if (newHovered !== this.hoveredButton) {
      this.hoveredButton = newHovered;
      this.render();
    }
  }
  
  handleButtonClick(btn) {
    console.log('[MENU] Button clicked:', btn.id);
    
    // Play click sound
    if (this.game.soundManager) {
      this.game.soundManager.playSound('uiClick', null, 0.5);
    }
    
    if (btn.id === 'selfMute') {
      this.setPlayerMuted('local', !this.localPlayerMuted);
    } else if (btn.id.startsWith('mute_')) {
      const playerId = btn.id.replace('mute_', '');
      const state = this.players.get(playerId) || { isMuted: false, isHidden: false };
      this.setPlayerMuted(playerId, !state.isMuted);
    } else if (btn.id.startsWith('hide_')) {
      const playerId = btn.id.replace('hide_', '');
      const state = this.players.get(playerId) || { isMuted: false, isHidden: false };
      this.setPlayerHidden(playerId, !state.isHidden);
    }
  }
  
  // Desktop/mouse click handling for testing outside VR
  handleDesktopClick(event) {
    // Raycast from camera through mouse position
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, this.game.camera);
    
    const intersects = raycaster.intersectObject(this.menuMesh);
    
    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      if (uv) {
        // Convert UV to canvas coordinates
        const canvasX = uv.x * this.canvasWidth;
        const canvasY = (1 - uv.y) * this.canvasHeight;
        
        // Check which button was clicked
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
