/**
 * VR Bowlliards Physics Engine
 * 
 * Realistic pool physics with:
 * - Slide-to-roll transition (center hit starts as pure slide, friction adds forward roll)
 * - Topspin/Backspin from vertical offset × power
 * - English (sidespin) from horizontal offset × power (affects cushions only, no curve)
 * - No spin transfer to object balls
 */

export class PhysicsEngine {
  constructor() {
    // Flag to track if we've loaded from server
    this.loadedFromServer = false;
    
    // ============================================
    // DEFAULT PHYSICS PARAMETERS (tuned middle-of-road values)
    // ============================================
    this.params = {
      // Power
      powerMultiplier: 11,          // Base force multiplier for shots
      maxPower: 4,                  // Maximum power cap
      minPower: 0.006,              // Minimum power threshold
      
      // ============================================
      // SPIN SENSITIVITY (how offset translates to spin)
      // ============================================
      verticalSpinSensitivity: 2.6,   // How much vertical offset affects spin
      englishSpinSensitivity: 1.7,    // How much horizontal offset affects spin
      spinPowerScaling: 1,            // How much power amplifies spin
      
      // ============================================
      // BALL-FELT FRICTION (slide-to-roll transition)
      // ============================================
      feltFriction: 0.2,              // Friction coefficient for slide-to-roll
      slideThreshold: 0.1,            // Speed difference threshold for "sliding" vs "rolling"
      rollAcceleration: 2,            // How fast friction converts slide to roll (rad/s²)
      
      // ============================================
      // SPIN EFFECTS ON OBJECT BALL COLLISION
      // ============================================
      topspinFollowForce: 1.6,        // How much topspin pushes ball forward after collision
      backspinDrawForce: 1.8,         // How much backspin pulls ball back after collision
      spinEffectThreshold: 0.15,      // Minimum spin to trigger effects
      stopShotThreshold: 0.3,         // Backspin level that causes stop shot (vs draw)
      
      // ============================================
      // ENGLISH (CUSHION) EFFECTS
      // ============================================
      cushionEnglishEffect: 0.6,      // How much english affects cushion rebound angle
      cushionSpeedThreshold: 0.3,     // Minimum speed for english to apply on cushion
      
      // ============================================
      // ANGULAR VELOCITY SETTINGS
      // ============================================
      initialRollFactor: 0.3,         // Initial forward roll from natural stroke (0 = pure slide)
      topspinAngularMultiplier: 50,   // Angular velocity for topspin (rad/s per spin unit)
      backspinAngularMultiplier: 50,  // Angular velocity for backspin  
      englishAngularMultiplier: 30,   // Angular velocity for english (Y-axis)
      
      // ============================================
      // SPIN DECAY
      // ============================================
      spinDecayRate: 0.98,            // How fast stored spin values decay per frame
      angularDampingLow: 0.2,         // Angular damping when ball is slow
      angularDampingHigh: 0.15,       // Angular damping when ball is fast
      linearDampingLow: 0.2,          // Linear damping when ball is slow
      linearDampingHigh: 0.12,        // Linear damping when ball is fast
      
      // ============================================
      // SPEED THRESHOLDS
      // ============================================
      slowSpeedThreshold: 0.5,        // Speed below which ball is "slow"
      stopSpeedThreshold: 0.08,       // Speed below which ball stops completely
      stopAngularThreshold: 0.6,      // Angular speed below which rotation stops
      
      // ============================================
      // BALL PHYSICAL PROPERTIES
      // ============================================
      ballRadius: 0.028,              // Ball radius in meters
      ballMass: 0.17,                 // Ball mass in kg
    };
    
    // Active spin storage (cleared on collision)
    this.activeSpin = {
      vertical: 0,
      english: 0,
      power: 0
    };
  }
  
  /**
   * Calculate spin from hit position and stroke power
   * @param {number} verticalOffset - Offset above/below center (-1 to 1)
   * @param {number} horizontalOffset - Offset left/right of center (-1 to 1)
   * @param {number} power - Shot power (0 to 1)
   * @returns {Object} Spin values {vertical, english}
   */
  calculateSpin(verticalOffset, horizontalOffset, power) {
    const p = this.params;
    
    // Scale power's effect on spin (can be non-linear if spinPowerScaling != 1)
    const powerFactor = Math.pow(power, p.spinPowerScaling);
    
    // Calculate final spin values
    const vertical = verticalOffset * p.verticalSpinSensitivity * powerFactor;
    const english = horizontalOffset * p.englishSpinSensitivity * powerFactor;
    
    return {
      vertical: Math.max(-1, Math.min(1, vertical)),
      english: Math.max(-1, Math.min(1, english)),
      power: power
    };
  }

  /**
   * Calculate initial ball state from shot
   * @param {THREE.Vector3} direction - Shot direction (normalized)
   * @param {number} power - Shot power (0 to 1)
   * @param {Object} spin - Spin object {vertical, english}
   * @returns {Object} Initial velocity and angular velocity
   */
  calculateShotPhysics(direction, power, spin) {
    const p = this.params;
    const r = p.ballRadius;
    
    // Calculate linear velocity
    const speed = power * p.powerMultiplier;
    const velocity = {
      x: direction.x * speed,
      y: 0,
      z: direction.z * speed
    };
    
    // Calculate angular velocity
    // Right vector (perpendicular to shot direction, for forward/back spin axis)
    const rightX = -direction.z;
    const rightZ = direction.x;
    
    // Base roll (natural forward roll from stroke - reduced for slide effect)
    const baseRoll = (speed / r) * p.initialRollFactor;
    
    // Topspin/Backspin adds to/subtracts from roll
    const verticalSpin = (spin.vertical || 0) * p.topspinAngularMultiplier * power;
    
    // English is pure Y-axis rotation
    const englishSpin = (spin.english || 0) * p.englishAngularMultiplier * power;
    
    const angularVelocity = {
      x: rightX * (baseRoll + verticalSpin),
      y: englishSpin,  // Sidespin (will be zeroed each frame for straight travel)
      z: rightZ * (baseRoll + verticalSpin)
    };
    
    return {
      velocity,
      angularVelocity,
      spin: {
        vertical: spin.vertical || 0,
        english: spin.english || 0,
        power: power
      }
    };
  }
  
  /**
   * Apply slide-to-roll physics (called each frame)
   * Converts sliding ball to natural rolling state via felt friction
   * @param {CANNON.Body} body - Physics body
   * @param {number} delta - Frame delta time
   */
  applySlideToRoll(body, delta) {
    const p = this.params;
    const r = p.ballRadius;
    
    // Get current velocities
    const vx = body.velocity.x;
    const vz = body.velocity.z;
    const speed = Math.sqrt(vx * vx + vz * vz);
    
    if (speed < p.stopSpeedThreshold) return;
    
    // Direction of travel
    const dirX = vx / speed;
    const dirZ = vz / speed;
    
    // Right vector (axis of forward roll)
    const rightX = -dirZ;
    const rightZ = dirX;
    
    // Current angular velocity around the roll axis
    const currentRoll = body.angularVelocity.x * rightX + body.angularVelocity.z * rightZ;
    
    // Expected roll for pure rolling (v = ω × r)
    const expectedRoll = speed / r;
    
    // Difference between current and expected (positive = sliding forward faster than rolling)
    const rollDiff = expectedRoll - currentRoll;
    
    // If significant slip, friction accelerates the ball toward rolling
    if (Math.abs(rollDiff) > p.slideThreshold) {
      const rollAccel = p.rollAcceleration * delta * Math.sign(rollDiff);
      
      // Add angular velocity toward pure roll
      body.angularVelocity.x += rightX * rollAccel;
      body.angularVelocity.z += rightZ * rollAccel;
      
      // Friction slightly reduces linear velocity during slide
      const frictionDecel = p.feltFriction * delta;
      body.velocity.x *= (1 - frictionDecel * 0.1);
      body.velocity.z *= (1 - frictionDecel * 0.1);
    }
  }
  
  /**
   * Apply backspin physics (pulls ball back, or stops it)
   * @param {CANNON.Body} body - Cue ball physics body
   * @param {Object} spin - Active spin values
   * @param {CANNON.Vec3} collisionNormal - Direction to object ball
   */
  applyBackspinEffect(body, spin, collisionNormal) {
    const p = this.params;
    
    if (!spin || spin.vertical >= -p.spinEffectThreshold) return;
    
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    const effectStrength = Math.abs(spin.vertical) * spin.power * p.backspinDrawForce;
    
    // Normalize collision direction
    const nx = collisionNormal.x;
    const nz = collisionNormal.z;
    const len = Math.sqrt(nx * nx + nz * nz);
    const dirX = nx / len;
    const dirZ = nz / len;
    
    if (Math.abs(spin.vertical) < p.stopShotThreshold) {
      // Weak backspin = stop shot
      body.velocity.x *= (1 - effectStrength * 0.5);
      body.velocity.z *= (1 - effectStrength * 0.5);
    } else {
      // Strong backspin = draw shot (reverse direction)
      const drawForce = effectStrength * Math.max(speed, 1.5);
      body.velocity.x -= dirX * drawForce;
      body.velocity.z -= dirZ * drawForce;
    }
    
    // Kill the spin after effect
    body.angularVelocity.x *= 0.3;
    body.angularVelocity.z *= 0.3;
  }

  /**
   * Apply topspin physics (follows through after collision)
   * @param {CANNON.Body} body - Cue ball physics body
   * @param {Object} spin - Active spin values
   * @param {CANNON.Vec3} collisionNormal - Direction to object ball
   */
  applyTopspinEffect(body, spin, collisionNormal) {
    const p = this.params;
    
    if (!spin || spin.vertical <= p.spinEffectThreshold) return;
    
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    const effectStrength = spin.vertical * spin.power * p.topspinFollowForce;
    
    // Normalize collision direction
    const nx = collisionNormal.x;
    const nz = collisionNormal.z;
    const len = Math.sqrt(nx * nx + nz * nz);
    const dirX = nx / len;
    const dirZ = nz / len;
    
    // Push ball forward in direction of collision
    const followForce = effectStrength * Math.max(speed, 1.5);
    body.velocity.x += dirX * followForce;
    body.velocity.z += dirZ * followForce;
  }
  
  /**
   * Apply english effect on cushion collision
   * @param {CANNON.Body} body - Cue ball physics body
   * @param {Object} spin - Active spin values
   * @param {string} cushionName - Which cushion was hit
   */
  applyCushionEnglish(body, spin, cushionName) {
    const p = this.params;
    
    if (!spin || Math.abs(spin.english) < 0.1) return;
    
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    if (speed < p.cushionSpeedThreshold) return;
    
    const effect = spin.english * speed * p.cushionEnglishEffect;
    
    // Apply perpendicular force based on which cushion
    if (cushionName === 'left') {
      body.velocity.z -= effect;
    } else if (cushionName === 'right') {
      body.velocity.z += effect;
    } else if (cushionName.includes('top')) {
      body.velocity.x -= effect;
    } else if (cushionName.includes('bottom')) {
      body.velocity.x += effect;
    }
  }
  
  /**
   * Get dynamic damping based on ball speed
   * @param {number} speed - Current ball speed
   * @returns {Object} {linear, angular} damping values
   */
  getDamping(speed) {
    const p = this.params;
    
    if (speed < p.stopSpeedThreshold) {
      return { linear: 0.98, angular: 0.98 };
    } else if (speed < p.slowSpeedThreshold) {
      return { linear: p.linearDampingLow, angular: p.angularDampingLow };
    } else {
      return { linear: p.linearDampingHigh, angular: p.angularDampingHigh };
    }
  }
  
  /**
   * Check if ball should stop completely
   * @param {CANNON.Body} body - Physics body
   * @returns {boolean} True if ball should stop
   */
  shouldStop(body) {
    const p = this.params;
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    const angSpeed = Math.sqrt(body.angularVelocity.x ** 2 + body.angularVelocity.z ** 2);
    
    return speed < p.stopSpeedThreshold && angSpeed < p.stopAngularThreshold;
  }
  
  /**
   * Update a parameter value
   * @param {string} key - Parameter name
   * @param {number} value - New value
   */
  setParam(key, value) {
    if (this.params.hasOwnProperty(key)) {
      this.params[key] = value;
      console.log(`[Physics] ${key} = ${value}`);
    }
  }
  
  /**
   * Get all parameters (for settings UI)
   * @returns {Object} All physics parameters
   */
  getParams() {
    return { ...this.params };
  }
  
  /**
   * Export params as JSON string
   */
  exportParams() {
    return JSON.stringify(this.params, null, 2);
  }
  
  /**
   * Import params from JSON string
   */
  importParams(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      Object.keys(imported).forEach(key => {
        if (this.params.hasOwnProperty(key)) {
          this.params[key] = imported[key];
        }
      });
      console.log('[Physics] Parameters imported successfully');
    } catch (e) {
      console.error('[Physics] Failed to import parameters:', e);
    }
  }
  
  /**
   * Load physics settings from server
   * @returns {Promise<boolean>} Success status
   */
  async loadFromServer() {
    try {
      const response = await fetch('/api/physics');
      if (response.ok) {
        const serverParams = await response.json();
        Object.keys(serverParams).forEach(key => {
          if (this.params.hasOwnProperty(key)) {
            this.params[key] = serverParams[key];
          }
        });
        this.loadedFromServer = true;
        console.log('[Physics] Loaded settings from server');
        return true;
      }
    } catch (e) {
      console.log('[Physics] Could not load from server, using defaults');
    }
    return false;
  }
  
  /**
   * Update all params from object (used for live updates)
   * @param {Object} newParams - New parameter values
   */
  updateAllParams(newParams) {
    if (!newParams || typeof newParams !== 'object') return;
    
    Object.keys(newParams).forEach(key => {
      if (this.params.hasOwnProperty(key)) {
        this.params[key] = newParams[key];
      }
    });
    console.log('[Physics] Parameters updated from server');
  }
}
