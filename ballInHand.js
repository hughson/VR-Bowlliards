import * as THREE from 'three';

export class BallInHand {
  constructor(scene, poolTable, getIsVR) {
    this.scene = scene;
    this.poolTable = poolTable;
    this.getIsVR = getIsVR;
    this.enabled = false;
    this.behindHeadString = false;
    this.grabbed = false;
    this.activeController = null;
    this.placementValid = true; 
    
    this.headStringX = -0.64;
  }

  enable(behindHeadString) {
    this.enabled = true;
    this.behindHeadString = behindHeadString;
    this.grabbed = false; 
    
    // Just make sure it's visible, but NO GLOW yet.
    const cueBall = this.poolTable.getCueBall();
    if (cueBall) {
      cueBall.visible = true;
      cueBall.material.emissive.setHex(0x000000);
      cueBall.material.emissiveIntensity = 0;
    }
  }

  disable() {
    this.enabled = false;
    const cueBall = this.poolTable.getCueBall();
    if (cueBall) {
      cueBall.material.emissive.setHex(0x000000);
      cueBall.material.emissiveIntensity = 0;
    }
  }

  grab(controller) {
    if (!this.enabled || this.grabbed) return false;
    
    this.grabbed = true;
    this.activeController = controller;
    this.placementValid = true;
    
    const cueBall = this.poolTable.getCueBall();
    if (!cueBall) return false;
    
    cueBall.visible = true;
    // Critical: Ensure the game loop knows this ball is active/on-table
    cueBall.userData.isPocketed = false; 
    
    cueBall.position.y = this.poolTable.tableHeight + 0.028;
    
    // VISUAL: Turn ON Green Glow (Active Moving Mode)
    cueBall.material.emissive.setHex(0x00ff00);
    cueBall.material.emissiveIntensity = 0.3;
    
    // PHYSICS: Ghost Mode (No collisions while moving)
    const body = cueBall.userData.physicsBody;
    if (body) {
        body.collisionFilterMask = 0; 
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
    }
    
    // For desktop, reset if needed
    if (!this.getIsVR()) {
        if (cueBall.position.y < this.poolTable.tableHeight) {
          cueBall.position.set(this.behindHeadString ? -0.64 : 0, this.poolTable.tableHeight + 0.028, 0);
        }
        if (body) body.position.copy(cueBall.position);
    }
    
    return true;
  }
  
  release(controller) {
    if (!this.grabbed) return false;
    if (this.getIsVR() && this.activeController !== controller) return false;
    
    const cueBall = this.poolTable.getCueBall();
    if (!cueBall) return false;
    
    const x = cueBall.position.x;
    const z = cueBall.position.z;
    
    const body = cueBall.userData.physicsBody;
    
    // Update physics final position
    if (body) {
        body.position.set(x, this.poolTable.tableHeight + 0.028, z);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        
        // PHYSICS: Restore Collisions (Solid)
        body.collisionFilterMask = -1;
        body.wakeUp();
    }
    
    // VISUAL: Turn OFF Glow (Ball placed)
    cueBall.material.emissive.setHex(0x000000);
    cueBall.material.emissiveIntensity = 0;

    this.grabbed = false;
    this.activeController = null;
    
    // We keep 'enabled' = true so you can pick it up again
    return true;
  }
  
  updatePosition(pos) {
    if (!this.grabbed) return;
    
    const cueBall = this.poolTable.getCueBall();
    if (!cueBall) return;
    
    // Table bounds (inside cushions, accounting for ball radius)
    // Physics cushions: X at ±1.25 (0.04 thick), Z at ±0.615 (0.04 thick)
    // Inner cushion edge: X = ±1.23, Z = ±0.595
    const ballRadius = 0.028;
    const maxX = 1.23 - ballRadius;  // 1.202
    const maxZ = 0.595 - ballRadius; // 0.567
    
    let x = pos.x;
    let z = pos.z;
    
    // 1. Clamp to table bounds
    x = Math.max(-maxX, Math.min(maxX, x));
    z = Math.max(-maxZ, Math.min(maxZ, z));
    
    if (this.behindHeadString) {
      x = Math.min(x, this.headStringX);
    }

    // 2. Push-Out Logic (Collision Resolution)
    const minSeparation = (ballRadius * 2) + 0.002; 
    const minSepSq = minSeparation * minSeparation;
    const activeBalls = this.poolTable.balls;

    for (let i = 0; i < activeBalls.length; i++) {
        const otherBall = activeBalls[i];
        if (otherBall === cueBall || otherBall.userData.isPocketed) continue;
        
        const dx = x - otherBall.position.x;
        const dz = z - otherBall.position.z;
        const distSq = dx*dx + dz*dz;
        
        if (distSq < minSepSq) {
            const dist = Math.sqrt(distSq);
            let nx = dx; let nz = dz;
            
            if (dist < 0.0001) { nx = 1; nz = 0; } 
            else { nx /= dist; nz /= dist; }
            
            x = otherBall.position.x + (nx * minSeparation);
            z = otherBall.position.z + (nz * minSeparation);
        }
    }

    // 3. Re-Clamp (using same safe bounds)
    x = Math.max(-maxX, Math.min(maxX, x));
    z = Math.max(-maxZ, Math.min(maxZ, z));
    if (this.behindHeadString) x = Math.min(x, this.headStringX);
    
    const y = this.poolTable.tableHeight + 0.028;
    
    // Update visual
    cueBall.position.set(x, y, z);
    
    // Keep glowing while holding
    cueBall.material.emissive.setHex(0x00ff00);
    
    // Sync physics ghost
    const body = cueBall.userData.physicsBody;
    if (body) {
        body.position.set(x, y, z);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
    }
  }
  
  update() {
    if (!this.grabbed || !this.activeController) return;
    
    const cueBall = this.poolTable.getCueBall();
    if (!cueBall) return;
    
    const controllerPos = new THREE.Vector3();
    this.activeController.getWorldPosition(controllerPos);
    
    this.updatePosition(controllerPos);
  }
}