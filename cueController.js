import * as THREE from 'three';

export class CueController {
  constructor(scene, controller1, controller2, getLeftHandedMode, getIsVR, poolTable, game) {
    this.scene = scene;
    this.getLeftHandedMode = getLeftHandedMode;
    this.getIsVR = getIsVR;
    this.poolTable = poolTable;
    this.game = game; 

    this.controlState = 'IDLE'; 
    
    this.cuePivot = new THREE.Group();
    this.cueStick = this.createCueStick();
    this.cueStick.position.z = 0.7;  
    this.cueStick.rotation.y = Math.PI; 
    
    this.cuePivot.add(this.cueStick);
    this.scene.add(this.cuePivot);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 2.0;

    // Raycaster for anti-tunneling detection on fast cue strokes
    this.tunnelingRaycaster = new THREE.Raycaster();

    const dotGeo = new THREE.SphereGeometry(0.005, 12, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.aimDot = new THREE.Mesh(dotGeo, dotMat);
    this.aimDot.visible = false;
    this.scene.add(this.aimDot);

    this.lastIntersectDistance = Infinity;
    this.lastTipWorldPos = null; // Track previous tip position for tunneling detection

    this.lockedAimQuaternion = new THREE.Quaternion();
    this.lockedBridgePos = new THREE.Vector3(); 
    this.lockedButtPos = new THREE.Vector3(); 
    this.strokeStartPos = new THREE.Vector3();
    this.lastStrokePos = new THREE.Vector3(); 
    this.strokeVelocity = 0;
    
    // Velocity history for better slow shot detection
    this.velocityHistory = [];
    this.maxHistoryFrames = 5;
    
    // --- SHOT SETTINGS ---
    this.maxPower = 2.5;        
    this.hitThreshold = -0.05;

    this.desktopAimPoint = new THREE.Vector3();
    this.lastCueBallPosition = new THREE.Vector3(-0.64, 0.978, 0);
    
    this.lastFrameTime = performance.now();
  }

  createCueStick() {
    const group = new THREE.Group();
    
    const shaftGeometry = new THREE.CylinderGeometry(0.009, 0.006, 1.4, 16);
    const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0xd2691e });
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.rotation.x = Math.PI / 2;
    group.add(shaft);
    
    const ferruleGeometry = new THREE.CylinderGeometry(0.0075, 0.007, 0.03, 16);
    const ferruleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const ferrule = new THREE.Mesh(ferruleGeometry, ferruleMaterial);
    ferrule.rotation.x = Math.PI / 2;
    ferrule.position.z = -0.6875; 
    group.add(ferrule);
    
    const tipGeometry = new THREE.CylinderGeometry(0.007, 0.0065, 0.015, 16);
    const tipMaterial = new THREE.MeshStandardMaterial({ color: 0x4169e1 });
    const tip = new THREE.Mesh(tipGeometry, tipMaterial);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -0.7075;
    group.add(tip);
    
    group.userData.tipMesh = tip;
    
    return group;
  }

  getControllers() {
    const leftHanded = this.getLeftHandedMode();
    const leftHand = this.game.leftHandController;
    const rightHand = this.game.rightHandController;

    if (leftHanded) {
      return { bridgeController: rightHand, strokeController: leftHand };
    } else {
      return { bridgeController: leftHand, strokeController: rightHand };
    }
  }

  lockStrokeDirection() {
    if (this.controlState !== 'IDLE') return;

    // Only allow locking if green dot is visible (aiming at cue ball)
    if (this.aimDot.visible === false) {
      return; 
    }

    const { bridgeController, strokeController } = this.getControllers();
    if (!bridgeController || !strokeController) return;

    this.controlState = 'STROKE_LOCKED';

    this.cuePivot.getWorldQuaternion(this.lockedAimQuaternion);
    this.cuePivot.getWorldPosition(this.lockedButtPos);

    bridgeController.getWorldPosition(this.lockedBridgePos); 
    strokeController.getWorldPosition(this.strokeStartPos);
    this.lastStrokePos.copy(this.strokeStartPos);
    
    this.strokeVelocity = 0;
    this.velocityHistory = [];
    this.lastFrameTime = performance.now();
  }

  unlockStrokeDirection() {
    if (this.controlState !== 'STROKE_LOCKED') return;
    this.controlState = 'IDLE';
    this.strokeVelocity = 0;
    this.velocityHistory = [];
    this.lastTipWorldPos = null; // Reset tunneling detection when unlocking
  }


  updateVR() {
    if (!this.getIsVR()) return;
    
    const { bridgeController, strokeController } = this.getControllers();

    if (!bridgeController || !strokeController) {
      this.cuePivot.visible = false;
      this.aimDot.visible = false;
      return;
    }

    const bridgePos = new THREE.Vector3();
    const strokePos = new THREE.Vector3();
    bridgeController.getWorldPosition(bridgePos);
    strokeController.getWorldPosition(strokePos);

    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    
    const cueBall = this.poolTable.getCueBall();
    
    if (!cueBall) {
      this.cuePivot.visible = false;
      this.aimDot.visible = false;
      return;
    }

    this.cuePivot.visible = true;

    if (this.controlState === 'IDLE') {
      // In IDLE, cue follows the hands directly
      const handDirection = new THREE.Vector3()
        .subVectors(strokePos, bridgePos)
        .normalize();
      
      const cueLength = 1.4;
      const bridgeOffset = 0.15; 
      const buttOffset = cueLength - bridgeOffset;
      
      this.cuePivot.position.copy(bridgePos).addScaledVector(handDirection, buttOffset);
      this.cuePivot.lookAt(bridgePos); 
      
      this.strokeVelocity = 0;
      this.velocityHistory = [];
      
    } else if (this.controlState === 'STROKE_LOCKED') {
      // In LOCKED, cue follows the line established when trigger was pressed
      this.cuePivot.quaternion.copy(this.lockedAimQuaternion);

      const strokeDirection = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(this.lockedAimQuaternion);
      
      const strokeMovement = new THREE.Vector3()
        .subVectors(strokePos, this.strokeStartPos);
        
      let distanceAlongCue = strokeMovement.dot(strokeDirection); 
      
      this.cuePivot.position.copy(this.lockedButtPos)
        .addScaledVector(strokeDirection, distanceAlongCue);
      
      const deltaVec = new THREE.Vector3()
        .subVectors(strokePos, this.lastStrokePos);
      
      let frameVelocity = 0;
      if (dt > 0.0001) {
        frameVelocity = deltaVec.dot(strokeDirection) / dt;
      }
      
      // Add current velocity to history
      this.velocityHistory.push(frameVelocity);
      if (this.velocityHistory.length > this.maxHistoryFrames) {
        this.velocityHistory.shift();
      }
      
      // Calculate weighted average velocity for slow shots
      let recentAvgVelocity = 0;
      if (this.velocityHistory.length > 0) {
        let weightSum = 0;
        let weightedSum = 0;
        for (let i = 0; i < this.velocityHistory.length; i++) {
          const weight = i + 1;
          weightedSum += this.velocityHistory[i] * weight;
          weightSum += weight;
        }
        recentAvgVelocity = weightedSum / weightSum;
      }
      
      if (Math.abs(frameVelocity) < 1.0) {
        this.strokeVelocity = Math.max(this.strokeVelocity, recentAvgVelocity);
      } else {
        if (frameVelocity > this.strokeVelocity) {
          this.strokeVelocity = frameVelocity;
        }
      }

      // Check if cue tip is touching ball
      let cueTipTouchingBall = false;
      let tunnelingDetected = false;

      if (cueBall && this.cueStick.userData.tipMesh) {
        const tipWorldPos = new THREE.Vector3();
        this.cueStick.userData.tipMesh.getWorldPosition(tipWorldPos);
        const distanceToball = tipWorldPos.distanceTo(cueBall.position);
        const ballRadius = 0.028;
        const tipContactThreshold = 0.06; // ~6cm from ball surface = tip touching or very close
        cueTipTouchingBall = distanceToball < (ballRadius + tipContactThreshold);

        // ANTI-TUNNELING: Check if cue tip passed through ball between frames
        if (this.lastTipWorldPos && this.strokeVelocity > 1.0) {
          const movement = new THREE.Vector3().subVectors(tipWorldPos, this.lastTipWorldPos);
          const movementDistance = movement.length();

          // Only check if cue moved significantly (fast stroke)
          if (movementDistance > 0.01) {
            const movementDir = movement.normalize();
            this.tunnelingRaycaster.set(this.lastTipWorldPos, movementDir);
            this.tunnelingRaycaster.far = movementDistance + 0.1; // Raycast along movement path

            const intersects = this.tunnelingRaycaster.intersectObject(cueBall, false);
            if (intersects.length > 0) {
              tunnelingDetected = true;
              console.log('[CUE] Tunneling detected! Fast stroke passed through ball.');
            }
          }
        }

        // Store current tip position for next frame
        this.lastTipWorldPos = tipWorldPos.clone();
      }

      // Shot triggers when: cue tip collides with ball (or tunneling detected) AND moving forward with sufficient velocity
      if ((cueTipTouchingBall || tunnelingDetected) && distanceAlongCue >= this.hitThreshold && this.strokeVelocity > 0.1) {
        
        // Calculate power (0-1 range)
        const power = Math.min(this.strokeVelocity / this.maxPower, 1.0);
        
        // Get shot direction
        const direction = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(this.lockedAimQuaternion);

        // Calculate spin from hit position × power
        let spin = { vertical: 0, english: 0 };
        
        if (this.aimDot.visible) {
          const ballCenter = cueBall.position.clone();
          const hitPoint = this.aimDot.position.clone();
          const offset = new THREE.Vector3().subVectors(hitPoint, ballCenter);
          const ballRadius = 0.028;
          
          // Vertical offset (above/below center) - affects topspin/backspin
          const verticalOffset = THREE.MathUtils.clamp(offset.y / ballRadius, -1, 1);
          
          // Horizontal offset (left/right) - affects english
          const shotDir2D = new THREE.Vector2(direction.x, direction.z).normalize();
          const offsetDir2D = new THREE.Vector2(offset.x, offset.z);
          const rightVec = new THREE.Vector2(-shotDir2D.y, shotDir2D.x);
          const horizontalOffset = THREE.MathUtils.clamp(offsetDir2D.dot(rightVec) / ballRadius, -1, 1);
          
          // ============================================
          // SPIN = POSITION × POWER
          // ============================================
          // Use physics engine if available, otherwise simple calculation
          const pe = this.poolTable.getPhysicsEngine ? this.poolTable.getPhysicsEngine() : null;
          
          if (pe) {
            spin = pe.calculateSpin(verticalOffset, horizontalOffset, power);
          } else {
            // Fallback simple calculation
            spin.vertical = verticalOffset * power;
            spin.english = horizontalOffset * power;
          }
          
          // English direction logic (based on shot direction)
          // Default: Inverted for short rails
          spin.english = -spin.english;
          
          // If shooting towards side cushions, flip
          if (Math.abs(direction.x) > Math.abs(direction.z)) {
            spin.english *= -1;
          }
          
          // Small deadzone
          if (Math.abs(spin.vertical) < 0.01) spin.vertical = 0;
          if (Math.abs(spin.english) < 0.01) spin.english = 0;

          console.log('[CueController] Shot:', {
            power: power.toFixed(3),
            verticalOffset: verticalOffset.toFixed(3),
            horizontalOffset: horizontalOffset.toFixed(3),
            spin: spin
          });
        }

        // Take the shot!
        this.game.takeShot(direction, power, spin);

        // Reset state
        this.controlState = 'IDLE';
        this.strokeVelocity = 0;
        this.velocityHistory = [];
        this.lastTipWorldPos = null; // Reset tunneling detection after shot
      }

      this.lastStrokePos.copy(strokePos);
    }

    // Update green aim dot via raycast
    const cueTipPos = new THREE.Vector3();
    this.cuePivot.getWorldPosition(cueTipPos);
    
    const cueDir = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.cuePivot.quaternion); 

    this.raycaster.set(cueTipPos, cueDir);

    const cueBallObj = this.poolTable.getCueBall();
    const intersects = cueBallObj ? this.raycaster.intersectObject(cueBallObj) : [];
    
    if (intersects.length > 0) {
      this.aimDot.visible = true;
      this.aimDot.position.copy(intersects[0].point);
      this.lastIntersectDistance = intersects[0].distance; 
    } else {
      this.aimDot.visible = false;
      this.lastIntersectDistance = Infinity;
    }
  }

  updateDesktop() {
    this.cuePivot.visible = false;
    if (this.aimDot) {
      this.aimDot.visible = false;
    }
  }

  aimAt(point) {
    this.desktopAimPoint.copy(point);
  }

  update(ballsSettled = true) {
    if (this.getIsVR()) {
      this.updateVR();
    } else {
      this.updateDesktop(ballsSettled);
    }
  }
}
