import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class DesktopControls {
  constructor(camera, renderer, game) {
    this.camera = camera;
    this.renderer = renderer.domElement;
    this.game = game;
    this.enabled = false;
    this.isVREnabled = false;

    this.orbitControls = new OrbitControls(camera, renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.1;
    this.orbitControls.target.set(0, 1, 0);
    this.orbitControls.enabled = true;

    this.moveState = {
      forward: 0,
      right: 0
    };

    // Desktop shooting state
    this.mousePosition = new THREE.Vector2();
    this.aimPoint = new THREE.Vector3();
    this.charging = false;
    this.power = 0;
    this.maxPower = 1.0;
    this.chargeRate = 0.8; 
    
    this.raycaster = new THREE.Raycaster();

    this.initEventListeners();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.orbitControls.enabled = enabled;
  }
  
  setVREnabled(isVR) {
    this.isVREnabled = isVR;
    if (isVR) {
        this.setEnabled(false);
    } else {
        this.setEnabled(true);
    }
  }

  initEventListeners() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.renderer.addEventListener('click', (e) => this.onClick(e));
  }

  onClick(event) {
    if (this.isVREnabled || !this.enabled) return;
    // Don't interact with UI if we are currently holding the ball
    if (this.game.ballInHand.grabbed) return;
    
    this.raycaster.setFromCamera(this.mousePosition, this.camera);
    
    if (this.game.settingsPanel) {
      this.game.settingsPanel.onSelectStart(this.raycaster);
    }
  }

  onMouseMove(event) {
    if (this.isVREnabled || !this.enabled) return;
    
    this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // If holding the ball, update its position based on mouse raycast
    if (this.game.ballInHand.grabbed) {
      this.updateBallInHandPosition();
    }
    // Otherwise, if ready to shoot, update aim line
    else if (this.game.gameState === 'ready' && this.game.ballsSettled) {
      this.updateAimPoint();
    }
  }

  updateAimPoint() {
    this.raycaster.setFromCamera(this.mousePosition, this.camera);
    const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.game.poolTable.tableHeight);
    const intersectPoint = new THREE.Vector3();
    
    if (this.raycaster.ray.intersectPlane(tablePlane, intersectPoint)) {
      this.aimPoint.copy(intersectPoint);
      if (this.game.cueController) {
        this.game.cueController.aimAt(this.aimPoint);
      }
    }
  }

  updateBallInHandPosition() {
    this.raycaster.setFromCamera(this.mousePosition, this.camera);
    const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.game.poolTable.tableHeight);
    const intersectPoint = new THREE.Vector3();
    
    if (this.raycaster.ray.intersectPlane(tablePlane, intersectPoint)) {
      this.game.ballInHand.updatePosition(intersectPoint);
    }
  }

  onKeyDown(event) {
    if (this.isVREnabled) return;
    
    switch (event.code) {
      case 'KeyW': this.moveState.forward = 1; break;
      case 'KeyS': this.moveState.forward = -1; break;
      case 'KeyA': this.moveState.right = -1; break;
      case 'KeyD': this.moveState.right = 1; break;
      
      case 'Space':
        // Only charge shot if we are NOT holding the ball
        if (this.game.gameState === 'ready' && this.game.ballsSettled && !this.charging && !this.game.ballInHand.grabbed) {
          this.charging = true;
          this.power = 0;
          event.preventDefault(); 
        }
        break;

      case 'KeyM':
        // --- TOGGLE LOGIC FOR BALL IN HAND ---
        const canInteract = this.game.gameState === 'ballInHand' || this.game.ballInHand.enabled;
        
        if (canInteract) {
            if (this.game.ballInHand.grabbed) {
                // 1. Currently holding it -> Try to Place it
                const placed = this.game.ballInHand.release(null);
                if (placed) {
                    this.game.gameState = 'ready';
                    this.game.ballsSettled = true;
                    this.game.showNotification('Ball placed. Ready to shoot! (Press M to move again)', 1500);
                    
                    // Re-enable orbit controls
                    this.orbitControls.enabled = true;
                    
                    // Update cue position
                    setTimeout(() => { this.game.cueController.update(true); }, 50);
                }
            } else {
                // 2. Currently placed -> Try to Pick it up
                this.game.ballInHand.grab(null); // Grab with "null" controller (mouse)
                this.game.gameState = 'ballInHand';
                this.game.showNotification('Ball in hand. Move mouse to position, Press M to place.', 1500);
                
                // Disable orbit controls so mouse moves ball instead of camera
                this.orbitControls.enabled = false;
                
                // Hide cue stick while moving ball
                if (this.game.cueController) this.game.cueController.updateDesktop(false);
            }
        }
        break;
    }
  }

  onKeyUp(event) {
    if (this.isVREnabled) return;
    
    switch (event.code) {
      case 'KeyW': case 'KeyS': this.moveState.forward = 0; break;
      case 'KeyA': case 'KeyD': this.moveState.right = 0; break;
        
      case 'Space':
        if (this.charging && this.game.gameState === 'ready' && this.game.ballsSettled) {
          this.takeShot();
          this.charging = false;
          this.power = 0;
        }
        break;
    }
  }

  takeShot() {
    const cueBall = this.game.poolTable.getCueBall();
    if (!cueBall) return;

    const direction = new THREE.Vector3()
      .subVectors(this.aimPoint, cueBall.position)
      .normalize();
    
    const shotPower = Math.min(this.power, this.maxPower);
    
    this.game.takeShot(direction, shotPower);
  }
  
  update(delta) {
    if (this.isVREnabled || !this.enabled) return;

    this.orbitControls.update();
    
    if (this.charging) {
      this.power += this.chargeRate * delta;
      this.power = Math.min(this.power, this.maxPower);
      
      const powerPercent = Math.round(this.power * 100);
      this.game.showNotification(`Power: ${powerPercent}%`, 50);
    }
    
    const speed = 2.0;
    if (this.moveState.forward !== 0 || this.moveState.right !== 0) {
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();

        const moveVector = new THREE.Vector3();
        moveVector.addScaledVector(cameraDirection, this.moveState.forward * speed * delta);
        moveVector.addScaledVector(cameraRight, this.moveState.right * speed * delta);

        this.camera.position.add(moveVector);
        this.orbitControls.target.add(moveVector);
    }
  }
}