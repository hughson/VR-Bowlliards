import * as THREE from 'three';

export class CueController {
  constructor(scene, controller1, controller2, getLeftHandedMode, getIsVR, poolTable, game) {
    this.scene = scene;
    // controller1 and controller2 args are deprecated/ignored in favor of dynamic lookup
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
    this.raycaster.far = 3.0;

    const dotGeo = new THREE.SphereGeometry(0.005, 12, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.aimDot = new THREE.Mesh(dotGeo, dotMat);
    this.aimDot.visible = false;
    this.scene.add(this.aimDot);

    this.lockedAimQuaternion = new THREE.Quaternion();
    this.lockedBridgePos = new THREE.Vector3(); 
    this.lockedButtPos = new THREE.Vector3(); 
    this.strokeStartPos = new THREE.Vector3();
    this.lastStrokePos = new THREE.Vector3(); 
    this.strokeVelocity = 0; 
    
    this.maxPower = 5.0;
    this.hitThreshold = -0.05; 
    
    // Safety Mechanism Variables
    this.shotArmed = false; 
    this.armThreshold = -0.10; // Must pull back 10cm to arm

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
    
    return group;
  }

  // Dynamic Controller Retrieval via Game Instance (Fixes Handedness Issues)
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

    // --- STRICT CHECK: IS THE GREEN DOT VISIBLE? ---
    // If the raycaster isn't hitting the cue ball, aimDot.visible is false.
    // In this case, we RETURN immediately. The trigger press is ignored.
    if (this.aimDot.visible === false) {
        return; 
    }
    // -----------------------------------------------

    const { bridgeController, strokeController } = this.getControllers();
    if (!bridgeController || !strokeController) return;

    this.controlState = 'STROKE_LOCKED';
    this.shotArmed = false; // Reset safety

    this.cuePivot.getWorldQuaternion(this.lockedAimQuaternion);
    this.cuePivot.getWorldPosition(this.lockedButtPos);

    bridgeController.getWorldPosition(this.lockedBridgePos); 
    strokeController.getWorldPosition(this.strokeStartPos);
    this.lastStrokePos.copy(this.strokeStartPos);
    
    this.strokeVelocity = 0;
    this.lastFrameTime = performance.now();
  }

  unlockStrokeDirection() {
    if (this.controlState !== 'STROKE_LOCKED') return;
    this.controlState = 'IDLE';
    this.strokeVelocity = 0;
    this.shotArmed = false;
  }

  updateVR() {
    if (!this.getIsVR()) return;
    
    const { bridgeController, strokeController } = this.getControllers();

    // Safety check for controller availability
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
    } else if (this.controlState === 'STROKE_LOCKED') {
      // In LOCKED, cue follows the line established when trigger was pressed
      this.cuePivot.quaternion.copy(this.lockedAimQuaternion);

      const strokeDirection = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(this.lockedAimQuaternion);
      
      const strokeMovement = new THREE.Vector3()
        .subVectors(strokePos, this.strokeStartPos);
        
      let distanceAlongCue = strokeMovement.dot(strokeDirection); 
      
      // Safety / Arming Logic
      if (!this.shotArmed) {
        if (distanceAlongCue < this.armThreshold) {
            this.shotArmed = true;
            // Optional: haptic feedback could go here
        } else {
            // Prevent moving forward until armed
            distanceAlongCue = Math.min(distanceAlongCue, 0);
        }
      }
      
      this.cuePivot.position.copy(this.lockedButtPos)
        .addScaledVector(strokeDirection, distanceAlongCue);
      
      const deltaVec = new THREE.Vector3()
        .subVectors(strokePos, this.lastStrokePos);
      
      let frameVelocity = 0;
      if (dt > 0.0001) {
        frameVelocity = deltaVec.dot(strokeDirection) / dt;
      }
      
      if (frameVelocity > this.strokeVelocity) {
        this.strokeVelocity = frameVelocity;
      }

      // SHOT TRIGGER LOGIC
      if (this.shotArmed && distanceAlongCue >= this.hitThreshold && this.strokeVelocity > 0.1) {
        const power = Math.min(this.strokeVelocity / this.maxPower, 1.0);
        
        const direction = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(this.lockedAimQuaternion);

        let spin = { vertical: 0, english: 0 };
        
        // We calculate spin based on where the green dot WAS (if visible)
        // Since we locked when visible, it should still be valid relative to the cue ball
        if (this.aimDot.visible) {
          const cueBall = this.poolTable.getCueBall();
          const ballCenter = cueBall.position.clone();
          const hitPoint = this.aimDot.position.clone();
          
          const offset = new THREE.Vector3().subVectors(hitPoint, ballCenter);
          const ballRadius = 0.028;
          
          const verticalOffsetRaw = offset.y / ballRadius;
          const verticalOffset = THREE.MathUtils.clamp(verticalOffsetRaw * 1.5, -1, 1);
          spin.vertical = verticalOffset;
          
          const shotDir2D = new THREE.Vector2(direction.x, direction.z).normalize();
          const offsetDir2D = new THREE.Vector2(offset.x, offset.z);
          
          const rightVec = new THREE.Vector2(-shotDir2D.y, shotDir2D.x);
          const horizontalOffsetRaw = offsetDir2D.dot(rightVec) / ballRadius;
          const horizontalOffset = THREE.MathUtils.clamp(horizontalOffsetRaw * 1.5, -1, 1);
          spin.english = horizontalOffset;
          
          const deadZone = 0.02;

          if (Math.abs(spin.vertical) < deadZone) spin.vertical = 0;
          if (Math.abs(spin.english) < deadZone) spin.english = 0;

          if (spin.vertical !== 0 || spin.english !== 0) {
            console.log('[SPIN DEBUG] from aimDot:', spin);
          }
        }

        this.game.takeShot(direction, power, spin);

        this.controlState = 'IDLE';
        this.strokeVelocity = 0;
        this.shotArmed = false; // Reset
      }

      this.lastStrokePos.copy(strokePos);
    }

    // Raycast from cue tip to find the ball (Update Green Dot)
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
    } else {
      this.aimDot.visible = false;
    }
  }

  updateDesktop() {
    // In desktop mode, we don't show the 3D cue stick
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