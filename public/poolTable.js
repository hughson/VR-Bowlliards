import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsEngine } from './physicsEngine.js';

export class PoolTable {
  constructor(scene, physics, soundManager) {
    this.scene = scene;
    this.physics = physics;
    this.soundManager = soundManager; 
    
    // Initialize the physics engine
    this.physicsEngine = new PhysicsEngine();
    
    // Load saved physics params from localStorage
    this.loadPhysicsParams();
    
    this.balls = [];
    this.pockets = [];
    this.pocketedThisShot = [];
    this.cueBallHitObject = false;
    this.cueBallPocketed = false;
    
    // Active spin tracking for cue ball
    this.cueBallSpin = null;
    
    // --- Raycaster for anti-tunneling logic ---
    this.tunnelingRaycaster = new THREE.Raycaster();
    
    this.ballShadowTexture = this.createBallShadowTexture();
    this.tableShadowTexture = this.createTableShadowTexture();
    
    this.originalBallColors = [
      0xffff00, // 1 yellow
      0x0000ff, // 2 blue  
      0xff0000, // 3 red
      0xff00ff, // 4 pink
      0xff8800, // 5 orange
      0x00ff00, // 6 green
      0x8b0000, // 7 maroon
      0x000000, // 8 black
      0xffff88, // 9 light yellow
      0x4169e1  // 10 royal blue
    ];
    
    this.ballStyleSetting = 'default';
    
    // --- Easter Egg State ---
    this.easterEggPoster = null;
    this.easterEggButton = null; 
    this.isEasterEggActive = false;
    
    this.createTable();
    this.createPockets();
    this.setupBalls();
    this.setupCollisionTracking();
  }

  // Load physics params from server (async)
  async loadPhysicsParams() {
    // First try to load from server
    const loadedFromServer = await this.physicsEngine.loadFromServer();
    
    if (!loadedFromServer) {
      // Fallback to localStorage
      const saved = localStorage.getItem('vrBowlliardsPhysics');
      if (saved) {
        try {
          const params = JSON.parse(saved);
          Object.keys(params).forEach(key => {
            this.physicsEngine.setParam(key, params[key]);
          });
          console.log('[PoolTable] Loaded physics params from localStorage (server unavailable)');
        } catch (e) {
          console.error('[PoolTable] Failed to load physics params:', e);
        }
      }
    }
  }
  
  // Setup Socket.IO listener for physics updates
  setupPhysicsListener(socket) {
    if (!socket) return;
    
    socket.on('physicsUpdate', (params) => {
      console.log('[PoolTable] Received physics update from server');
      this.physicsEngine.updateAllParams(params);
    });
  }
  
  // Get physics engine (for external access)
  getPhysicsEngine() {
    return this.physicsEngine;
  }

  // ============================================================
  // NETWORK STATE SYNC
  // ============================================================
  
  exportState() {
    return {
      balls: this.balls.map(ball => {
        const body = ball.userData.physicsBody;
        const position = body
          ? { x: body.position.x, y: body.position.y, z: body.position.z }
          : { x: ball.position.x, y: ball.position.y, z: ball.position.z };
        const velocity = body
          ? { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z }
          : { x: 0, y: 0, z: 0 };
        const angularVelocity = body
          ? { x: body.angularVelocity.x, y: body.angularVelocity.y, z: body.angularVelocity.z }
          : { x: 0, y: 0, z: 0 };

        return {
          number: ball.userData.ballNumber,
          isPocketed: !!ball.userData.isPocketed,
          visible: ball.visible,
          position,
          velocity,
          angularVelocity
        };
      }),
      cueBallSpin: this.cueBallSpin
    };
  }

  importState(stateData) {
    if (!stateData || !stateData.balls) return;

    stateData.balls.forEach(data => {
      const ball = this.balls.find(b => b.userData.ballNumber === data.number);
      if (!ball) return;

      ball.position.set(data.position.x, data.position.y, data.position.z);
      ball.visible = data.visible;
      ball.userData.isPocketed = data.isPocketed;

      if (ball.userData.physicsBody) {
        const body = ball.userData.physicsBody;
        body.position.set(data.position.x, data.position.y, data.position.z);
        body.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
        body.angularVelocity.set(data.angularVelocity.x, data.angularVelocity.y, data.angularVelocity.z);
        body.wakeUp();
      }

      if (ball.userData.shadowMesh) {
        ball.userData.shadowMesh.visible = data.visible && !data.isPocketed;
        if (ball.userData.shadowMesh.visible) {
          ball.userData.shadowMesh.position.set(ball.position.x, this.tableHeight, ball.position.z);
        }
      }
    });
    
    if (stateData.cueBallSpin) {
      this.cueBallSpin = stateData.cueBallSpin;
    }
  }

  // ============================================================
  // TEXTURE GENERATION
  // ============================================================

  createBallShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0.0, 'rgba(0, 0, 0, 0.5)'); 
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');   
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return new THREE.CanvasTexture(canvas);
  }

  createTableShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradientX = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradientX.addColorStop(0, 'rgba(0,0,0,0.0)');
    gradientX.addColorStop(0.1, 'rgba(0,0,0,0.5)');
    gradientX.addColorStop(0.9, 'rgba(0,0,0,0.5)');
    gradientX.addColorStop(1, 'rgba(0,0,0,0.0)');
    const gradientY = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradientY.addColorStop(0, 'rgba(0,0,0,0.0)');
    gradientY.addColorStop(0.1, 'rgba(0,0,0,1)');
    gradientY.addColorStop(0.9, 'rgba(0,0,0,1)');
    gradientY.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradientX;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = gradientY;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return new THREE.CanvasTexture(canvas);
  }

  createBowlingBallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.arc(128 - 30, 128 - 15, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(128 + 30, 128 - 15, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(128, 128 + 30, 10.8, 0, Math.PI * 2); ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }
  
  createBowlingPinTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 128 - 16, 256, 8);
    ctx.fillRect(0, 128 + 8, 256, 8);
    return new THREE.CanvasTexture(canvas);
  }


  // ============================================================
  // TABLE CONSTRUCTION
  // ============================================================

  createTable() {
    const tableGroup = new THREE.Group();
    
    this.feltMaterial = new THREE.MeshStandardMaterial({ color: 0x40a4c4, roughness: 0.85 });
    const felt = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.1, 1.27), this.feltMaterial);
    felt.position.y = 0.9; felt.receiveShadow = false; felt.castShadow = false; felt.renderOrder = 1;
    tableGroup.add(felt);
    
    const shadowMat = new THREE.MeshBasicMaterial({ map: this.tableShadowTexture, transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -4.0 });
    const tableShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.0), shadowMat);
    tableShadow.rotation.x = -Math.PI / 2; tableShadow.position.y = 0; tableShadow.renderOrder = 0; 
    tableGroup.add(tableShadow);

    const loader = new THREE.TextureLoader();
    const posterMat = new THREE.MeshBasicMaterial({ map: loader.load('ivr_hustler.jpg'), side: THREE.DoubleSide });
    this.easterEggPoster = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), posterMat);
    this.easterEggPoster.position.set(0, 0.84, 0);
    this.easterEggPoster.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    this.easterEggPoster.visible = false; 
    tableGroup.add(this.easterEggPoster);

    const tableShape = new CANNON.Box(new CANNON.Vec3(1.27, 0.05, 0.635));
    const tableBody = new CANNON.Body({ mass: 0 });
    tableBody.addShape(tableShape);
    tableBody.position.set(0, 0.9, 0);
    this.physics.world.addBody(tableBody);

    this.tableHeight = 0.95;
    this.createVisualCushions(tableGroup);
    
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.5, metalness: 0.1 });
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.54 + 0.16, 0.04, 0.08), railMaterial); r1.position.set(0, 0.975, -0.675); tableGroup.add(r1);
    const r2 = r1.clone(); r2.position.z = 0.675; tableGroup.add(r2);
    const r3 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 1.27), railMaterial); r3.position.set(-1.31, 0.975, 0); tableGroup.add(r3);
    const r4 = r3.clone(); r4.position.x = 1.31; tableGroup.add(r4);

    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.5 });
    const legGeo = new THREE.BoxGeometry(0.1, 0.9, 0.1);
    [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, legMaterial); leg.position.set(x, 0.45, z); tableGroup.add(leg);
    });

    this.createRackGuide(tableGroup);

    const dMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide });
    const dShape = new THREE.Shape(); dShape.moveTo(0, 0.0075); dShape.lineTo(0.0075, 0); dShape.lineTo(0, -0.0075); dShape.lineTo(-0.0075, 0); dShape.lineTo(0, 0.0075);
    const dGeo = new THREE.ShapeGeometry(dShape);
    const dY = 0.996; const hL = 1.27; const hW = 0.635; const off = 0.04; const lS = hL/4; 
    const locs = [
        {x:-hL+lS,z:-hW-off,r:0},{x:-hL+lS*2,z:-hW-off,r:0},{x:-hL+lS*3,z:-hW-off,r:0},{x:hL-lS*3,z:-hW-off,r:0},{x:hL-lS*2,z:-hW-off,r:0},{x:hL-lS,z:-hW-off,r:0},
        {x:-hL+lS,z:hW+off,r:0},{x:-hL+lS*2,z:hW+off,r:0},{x:-hL+lS*3,z:hW+off,r:0},{x:hL-lS*3,z:hW+off,r:0},{x:hL-lS*2,z:hW+off,r:0},{x:hL-lS,z:hW+off,r:0},
        {x:-hL-off,z:-hW/2,r:Math.PI/2},{x:-hL-off,z:0,r:Math.PI/2},{x:-hL-off,z:hW/2,r:Math.PI/2},{x:hL+off,z:-hW/2,r:Math.PI/2},{x:hL+off,z:0,r:Math.PI/2},{x:hL+off,z:hW/2,r:Math.PI/2}
    ];
    locs.forEach(l => { const d = new THREE.Mesh(dGeo, dMat); d.position.set(l.x, dY, l.z); d.rotation.set(-Math.PI/2, 0, l.r); tableGroup.add(d); });

    this.scene.add(tableGroup);
    this.tableGroup = tableGroup; 
    this.createRailPhysics();
  }
  
  toggleEasterEgg() {
    this.isEasterEggActive = !this.isEasterEggActive;
    if (this.easterEggPoster) { this.easterEggPoster.visible = this.isEasterEggActive; }
    if (this.soundManager && this.easterEggButton) { this.soundManager.toggleSound('hustlerMovie', this.easterEggButton.getWorldPosition(new THREE.Vector3())); }
    if (this.easterEggButton) {
        this.easterEggButton.position.y = this.isEasterEggActive ? -0.005 : -0.015;
        this.easterEggButton.material.emissiveIntensity = this.isEasterEggActive ? 0.8 : 0.2;
    }
  }
  
  createVisualCushions(tableGroup) {
    this.cushionMaterial = new THREE.MeshStandardMaterial({ color: 0x40a4c4, roughness: 0.85 });
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0, 0.045); shape.lineTo(0.04, 0.028*1.25); shape.lineTo(0, 0); 
    const cGap = 0.115; const sGap = 0.12; const y = 0.95;
    const createRail = (len, a1, a2) => {
        const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
        const pos = g.attributes.position; const v = new THREE.Vector3();
        for(let i=0; i<pos.count; i++){ v.fromBufferAttribute(pos,i); const d = 0.04-v.x; if(v.z<len/2) v.z-=d*Math.tan(a1); else v.z+=d*Math.tan(a2); pos.setXYZ(i,v.x,v.y,v.z); }
        g.computeVertexNormals(); return g;
    };
    const sG = createRail(1.27 - cGap*2, Math.PI/4, Math.PI/4);
    const lG = createRail((2.54/2) - sGap/2 - cGap, Math.PI/4, Math.PI/12);
    const lG2 = createRail((2.54/2) - sGap/2 - cGap, Math.PI/12, Math.PI/4);
    const add = (g,x,z,r) => { const m = new THREE.Mesh(g, this.cushionMaterial); m.position.set(x,y,z); m.rotation.y=r; tableGroup.add(m); };
    add(sG, -1.27, -0.635+cGap, 0); add(sG, 1.27, 0.635-cGap, Math.PI);
    add(lG, 1.27-cGap, -0.635, -Math.PI/2); add(lG2, -sGap/2, -0.635, -Math.PI/2);
    add(lG, -1.27+cGap, 0.635, Math.PI/2); add(lG2, sGap/2, 0.635, Math.PI/2);
  }
  
  createRackGuide(tableGroup) {
    const pts = [new THREE.Vector3(0.64, 0.951, 0), new THREE.Vector3(0.64+0.028*2.1*0.866*3, 0.951, -0.028*2.1*1.5), new THREE.Vector3(0.64+0.028*2.1*0.866*3, 0.951, 0.028*2.1*1.5), new THREE.Vector3(0.64, 0.951, 0)];
    tableGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, linewidth: 2 })));
    const cGeo = new THREE.RingGeometry(0.01, 0.012, 32); const cMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const m1 = new THREE.Mesh(cGeo, cMat); m1.rotation.x = -Math.PI/2; m1.position.set(0.64, 0.951, 0); tableGroup.add(m1);
    const m2 = m1.clone(); m2.position.set(-0.64, 0.951, 0); tableGroup.add(m2);
  }

  createPockets() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -4.0 });
    const add = (x,z,r) => { const p = new THREE.Mesh(new THREE.CircleGeometry(r,32), mat); p.position.set(x, 0.95, z); p.rotation.x = -Math.PI/2; p.renderOrder = 2; this.scene.add(p); this.pockets.push({position: new THREE.Vector3(x, 0.95, z), radius: r*0.9}); };
    [[-1.225, -0.59], [-1.225, 0.59], [1.225, -0.59], [1.225, 0.59]].forEach(p => add(p[0], p[1], 0.052));
    [[0, -0.64], [0, 0.64]].forEach(p => add(p[0], p[1], 0.055));
  }

  createRailPhysics() {
    const mat = this.physics.cushionMaterial;
    const y = 0.95 + 0.04;
    
    const cornerPocketRadius = 0.052;
    const sidePocketRadius = 0.055;
    const pocketGap = 0.01;
    
    const add = (w, h, d, x, z, n) => {
      const b = new CANNON.Body({ mass: 0, material: mat, type: CANNON.Body.STATIC });
      b.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
      b.position.set(x, y, z);
      b.userData = { isCushion: true, name: n };
      this.physics.world.addBody(b);
    };
    
    const topZ = -0.615;
    const topLeftStart = -1.225 + cornerPocketRadius + pocketGap;
    const topLeftEnd = -sidePocketRadius - pocketGap;
    const topLeftWidth = topLeftEnd - topLeftStart;
    const topLeftCenter = (topLeftStart + topLeftEnd) / 2;
    add(topLeftWidth, 0.08, 0.04, topLeftCenter, topZ, 'top-left');
    
    const topRightStart = sidePocketRadius + pocketGap;
    const topRightEnd = 1.225 - cornerPocketRadius - pocketGap;
    const topRightWidth = topRightEnd - topRightStart;
    const topRightCenter = (topRightStart + topRightEnd) / 2;
    add(topRightWidth, 0.08, 0.04, topRightCenter, topZ, 'top-right');
    
    const bottomZ = 0.615;
    add(topLeftWidth, 0.08, 0.04, topLeftCenter, bottomZ, 'bottom-left');
    add(topRightWidth, 0.08, 0.04, topRightCenter, bottomZ, 'bottom-right');
    
    const leftX = -1.25;
    const leftStart = -0.59 + cornerPocketRadius + pocketGap;
    const leftEnd = 0.59 - cornerPocketRadius - pocketGap;
    const leftDepth = leftEnd - leftStart;
    const leftCenter = (leftStart + leftEnd) / 2;
    add(0.04, 0.08, leftDepth, leftX, leftCenter, 'left');
    
    const rightX = 1.25;
    add(0.04, 0.08, leftDepth, rightX, leftCenter, 'right');
  }


  setupBalls() {
    this.balls.forEach(b => { this.scene.remove(b); if(b.userData.shadowMesh) this.scene.remove(b.userData.shadowMesh); this.physics.world.removeBody(b.userData.physicsBody); });
    this.balls = []; this.pocketedThisShot = [];
    this.createBall(-0.64, 0, 0xffffff, 0);
    const sp = 0.028*2.1; const fx = 0.64;
    [[fx,0],[fx+sp*0.866,-sp/2],[fx+sp*0.866,sp/2],[fx+sp*0.866*2,-sp],[fx+sp*0.866*2,0],[fx+sp*0.866*2,sp],[fx+sp*0.866*3,-sp*1.5],[fx+sp*0.866*3,-sp/2],[fx+sp*0.866*3,sp/2],[fx+sp*0.866*3,sp*1.5]].forEach((p,i) => this.createBall(p[0], p[1], this.originalBallColors[i], i+1));
  }
  
  // ============================================================
  // COLLISION TRACKING WITH NEW PHYSICS
  // ============================================================
  
  setupCollisionTracking() {
    this.physics.world.addEventListener('beginContact', (e) => {
      const v = e.bodyA.velocity.distanceTo(e.bodyB.velocity);
      
      let isCushionCollision = false;
      let ballBody = null;
      let cushionBody = null;
      
      if (e.bodyA.collisionFilterGroup === 1 && e.bodyB.userData?.isCushion) {
        isCushionCollision = true;
        ballBody = e.bodyA;
        cushionBody = e.bodyB;
      } else if (e.bodyB.collisionFilterGroup === 1 && e.bodyA.userData?.isCushion) {
        isCushionCollision = true;
        ballBody = e.bodyB;
        cushionBody = e.bodyA;
      }
      
      // Sound for cushion hit
      if (isCushionCollision && ballBody && this.soundManager) {
        this.soundManager.playSound('cushionHit', new THREE.Vector3(ballBody.position.x, ballBody.position.y, ballBody.position.z), v * 1.5);
      } 
      // Sound for ball-ball hit
      else if (e.bodyA.collisionFilterGroup === 1 && e.bodyB.collisionFilterGroup === 1 && this.soundManager) {
        this.soundManager.playSound('ballHit', new THREE.Vector3((e.bodyA.position.x+e.bodyB.position.x)/2, (e.bodyA.position.y+e.bodyB.position.y)/2, (e.bodyA.position.z+e.bodyB.position.z)/2), v);
      }

      // CUE BALL collision handling
      const cb = this.balls[0]?.userData.physicsBody;
      if (cb && (e.bodyA === cb || e.bodyB === cb)) {
        const otherBody = e.bodyA === cb ? e.bodyB : e.bodyA;
        
        // Check if it's an object ball collision
        const hitBall = this.balls.find(b => b.userData.physicsBody === otherBody);
        if (hitBall && hitBall.userData.ballNumber > 0) {
          this.cueBallHitObject = true;
          
          // Apply spin effects on object ball collision
          if (this.cueBallSpin && (Math.abs(this.cueBallSpin.vertical) > 0.1 || Math.abs(this.cueBallSpin.english) > 0.1)) {
            const collisionNormal = new CANNON.Vec3(
              otherBody.position.x - cb.position.x,
              0,
              otherBody.position.z - cb.position.z
            );
            
            // Schedule spin effect application (slight delay for physics to settle)
            setTimeout(() => {
              if (this.cueBallSpin) {
                if (this.cueBallSpin.vertical < 0) {
                  // Backspin (draw)
                  this.physicsEngine.applyBackspinEffect(cb, this.cueBallSpin, collisionNormal);
                } else if (this.cueBallSpin.vertical > 0) {
                  // Topspin (follow)
                  this.physicsEngine.applyTopspinEffect(cb, this.cueBallSpin, collisionNormal);
                }
                // Clear spin after effect
                this.cueBallSpin = null;
              }
            }, 16);
          }
        }
        
        // Check if it's a cushion collision
        if (cushionBody && cushionBody.userData?.isCushion) {
          if (this.cueBallSpin && Math.abs(this.cueBallSpin.english) > 0.1) {
            setTimeout(() => {
              if (this.cueBallSpin) {
                this.physicsEngine.applyCushionEnglish(cb, this.cueBallSpin, cushionBody.userData.name);
              }
            }, 16);
          }
        }
      }
    });
  }
  
  getCueBall() { return this.balls[0]; }
  
  showCueBall() {
    const cb = this.getCueBall();
    if (cb) {
      cb.visible = true; 
      if (cb.userData.shadowMesh) cb.userData.shadowMesh.visible = true;
      cb.userData.isPocketed = false; 
      const b = cb.userData.physicsBody;
      if (b.position.y < 0) { 
        b.position.set(-0.64, this.tableHeight + 0.028, 0); 
        b.velocity.set(0, 0, 0); 
        b.angularVelocity.set(0, 0, 0); 
        cb.position.copy(b.position); 
      }
    }
  }
  
  isCueBallPocketed() { return this.cueBallPocketed; }
  getPocketedBalls() { return this.pocketedThisShot.filter(n => n > 0); }
  resetShotTracking() { 
    this.pocketedThisShot = []; 
    this.cueBallHitObject = false; 
    this.cueBallPocketed = false; 
    this.cueBallSpin = null;
  }

  createBall(x, z, color, number) {
    const r = 0.028; 
    const g = new THREE.SphereGeometry(r, 32, 32);
    const m = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.1 });
    if (this.ballStyleSetting === 'bowling') {
      if (number === 0) { m.map = this.createBowlingBallTexture(); m.color.set(0xffffff); } 
      else { m.map = this.createBowlingPinTexture(); m.color.set(0xffffff); }
      m.needsUpdate = true;
    }
    const b = new THREE.Mesh(g, m); 
    b.userData.material = m; 
    b.castShadow = false; 
    b.receiveShadow = false; 
    b.position.set(x, this.tableHeight + r, z); 
    b.renderOrder = 4; 
    
    const sg = new THREE.PlaneGeometry(r * 1.9, r * 1.9); 
    const sm = new THREE.MeshBasicMaterial({ map: this.ballShadowTexture, transparent: true, depthWrite: false, opacity: 1.0, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -4.0 });
    const smesh = new THREE.Mesh(sg, sm); 
    smesh.rotation.x = -Math.PI / 2; 
    smesh.renderOrder = 3; 
    b.userData.shadowMesh = smesh; 
    this.scene.add(smesh);
    
    const shape = new CANNON.Sphere(r);
    const body = new CANNON.Body({ 
      mass: this.physicsEngine.params.ballMass, 
      shape: shape, 
      material: this.physics.ballMaterial, 
      linearDamping: 0.19, 
      angularDamping: 0.19, 
      ccdSpeedThreshold: 0.1, 
      ccdIterations: 10 
    });
    body.position.set(x, this.tableHeight + r, z); 
    body.collisionFilterGroup = 1; 
    body.collisionFilterMask = -1;
    this.physics.world.addBody(body); 
    b.userData.physicsBody = body; 
    b.userData.ballNumber = number;
    this.scene.add(b); 
    this.balls.push(b);
  }


  // ============================================================
  // SHOOTING - NEW PHYSICS ENGINE
  // ============================================================
  
  /**
   * Shoot the cue ball using the new physics engine
   * @param {THREE.Vector3} direction - Shot direction (normalized)
   * @param {number} power - Shot power (0-1)
   * @param {Object} spin - Spin object {vertical, english} from cueController
   */
  shootCueBall(direction, power, spin) {
    // Wake up all balls
    this.balls.forEach(b => { 
      if (b.userData.physicsBody) b.userData.physicsBody.wakeUp(); 
    });
    
    const cb = this.balls[0]; 
    const body = cb.userData.physicsBody;
    
    cb.userData.isPocketed = false; 
    cb.visible = true; 
    if (body) body.wakeUp();
    
    this.resetShotTracking();
    
    // Play hit sound
    if (this.soundManager) {
      this.soundManager.playSound('cueHitSoft', cb.position.clone(), power * 10.0);
    }
    
    // Normalize direction (ensure it's horizontal)
    const nd = new THREE.Vector3(direction.x, 0, direction.z).normalize();
    
    // Calculate physics using the physics engine
    const shotPhysics = this.physicsEngine.calculateShotPhysics(nd, power, spin || { vertical: 0, english: 0 });
    
    // Apply linear velocity
    body.velocity.set(
      shotPhysics.velocity.x,
      shotPhysics.velocity.y,
      shotPhysics.velocity.z
    );
    
    // Apply angular velocity
    body.angularVelocity.set(
      shotPhysics.angularVelocity.x,
      shotPhysics.angularVelocity.y,
      shotPhysics.angularVelocity.z
    );
    
    // Store spin for later collision effects
    this.cueBallSpin = shotPhysics.spin;
    
    console.log('[PoolTable] Shot fired:', {
      power: power.toFixed(3),
      velocity: `(${shotPhysics.velocity.x.toFixed(2)}, ${shotPhysics.velocity.z.toFixed(2)})`,
      spin: this.cueBallSpin
    });
  }
  
  spotBalls(nums) {
    const fx = 0.64; const r = 0.028; const s = r * 2.1;
    nums.forEach((n, i) => {
      const b = this.balls.find(bb => bb.userData.ballNumber === n); if (!b) return;
      const body = b.userData.physicsBody; let sx = fx + (i * s); if (sx > 1.2) sx = 1.2; 
      body.position.set(sx, this.tableHeight + r, 0); body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0); b.position.copy(body.position);
      if (b.userData.shadowMesh) b.userData.shadowMesh.visible = true;
    });
  }
  
  preventTunneling(delta) {
    const cb = this.balls[0]; if (!cb) return;
    const b = cb.userData.physicsBody; const s = b.velocity.length(); if (s < 5.0) return;
    const d = b.velocity.clone().normalize(); const r = 0.028;
    this.tunnelingRaycaster.set(cb.position, new THREE.Vector3(d.x, d.y, d.z)); this.tunnelingRaycaster.far = s * delta + r;
    const hits = this.tunnelingRaycaster.intersectObjects(this.balls.filter(bb => bb.userData.ballNumber !== 0 && !bb.userData.isPocketed));
    if (hits.length > 0) {
      const sd = hits[0].distance - r - 0.001; if (sd < 0) return;
      const sp = new THREE.Vector3().copy(cb.position).addScaledVector(new THREE.Vector3(d.x, d.y, d.z), sd);
      b.position.set(sp.x, sp.y, sp.z); cb.position.copy(sp);
      if (hits[0].object.userData.physicsBody) hits[0].object.userData.physicsBody.wakeUp();
    }
  }

  checkBallInPocket(position) {
    for (const pocket of this.pockets) {
      const dx = position.x - pocket.position.x;
      const dz = position.z - pocket.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const effectiveRadius = pocket.radius * 1.20;
      
      if (distance < effectiveRadius || 
          (distance < pocket.radius * 1.4 && position.y < this.tableHeight - 0.015)) {
        return true;
      }
    }
    return false;
  }

  setFeltColor(hexColor) {
    const newColor = new THREE.Color(hexColor);
    if (this.feltMaterial) { this.feltMaterial.color.copy(newColor); }
    if (this.cushionMaterial) { this.cushionMaterial.color.copy(newColor); }
  }

  setBallStyle(style) {
    this.ballStyleSetting = style;
    if (!this.balls || this.balls.length === 0) return;
    this.balls.forEach(ball => {
      const ballNum = ball.userData.ballNumber;
      const material = ball.userData.material;
      if (style === 'bowling') {
        if (ballNum === 0) { material.map = this.createBowlingBallTexture(); material.color.set(0xffffff); material.needsUpdate = true; }
        else { material.map = this.createBowlingPinTexture(); material.color.set(0xffffff); material.needsUpdate = true; }
      } else {
        material.map = null;
        if (ballNum === 0) material.color.set(0xffffff); 
        else material.color.set(this.originalBallColors[ballNum - 1]);
        material.needsUpdate = true;
      }
    });
  }


  // ============================================================
  // UPDATE LOOP - NEW PHYSICS ENGINE
  // ============================================================

  update(delta = 1/60) {
    this.preventTunneling(delta);
    
    const pe = this.physicsEngine;
    const params = pe.params;
    
    this.balls.forEach(ball => {
      if (ball.position.y < -0.5 || ball.userData.isPocketed) return;
      
      const body = ball.userData.physicsBody;
      const vx = body.velocity.x;
      const vz = body.velocity.z;
      const speed = Math.sqrt(vx * vx + vz * vz);
      
      // Apply slide-to-roll physics for cue ball
      if (ball.userData.ballNumber === 0 && speed > params.stopSpeedThreshold) {
        pe.applySlideToRoll(body, delta);
      }
      
      // Dynamic damping based on speed
      const damping = pe.getDamping(speed);
      body.linearDamping = damping.linear;
      body.angularDamping = damping.angular;
      
      // Zero Y angular velocity for cue ball (no curve during travel)
      if (ball.userData.ballNumber === 0) {
        body.angularVelocity.y = 0;
      }
      
      // Update visual position
      ball.position.copy(body.position);
      ball.quaternion.copy(body.quaternion);
      
      // Update shadow
      if (ball.userData.shadowMesh) {
        ball.userData.shadowMesh.position.set(ball.position.x, this.tableHeight, ball.position.z);
      }
      
      // Check if ball should stop completely
      if (pe.shouldStop(body)) {
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
      
      // Check for out-of-bounds (edge pocketing)
      if (!ball.userData.isPocketed) {
        if (Math.abs(body.position.x) > 1.4 || Math.abs(body.position.z) > 0.8) {
          if (ball.userData.ballNumber === 0) this.cueBallPocketed = true; 
          else if (!this.pocketedThisShot.includes(ball.userData.ballNumber)) this.pocketedThisShot.push(ball.userData.ballNumber);
          ball.userData.isPocketed = true; 
          body.velocity.set(0, 0, 0); 
          body.angularVelocity.set(0, 0, 0); 
          body.position.y = -2; 
          ball.position.y = -2;
          if (ball.userData.shadowMesh) ball.userData.shadowMesh.visible = false; 
          if (ball.userData.ballNumber > 0) ball.visible = false;
          return; 
        }
      }
      
      // Check for pocket
      if (this.checkBallInPocket(body.position)) {
        if (this.soundManager) { 
          const ps = body.velocity.length(); 
          this.soundManager.playSound(ps > 2.0 ? 'pocketHard' : 'pocketSoft', ball.position.clone(), ps * 3.0); 
        }
        if (ball.userData.ballNumber === 0) this.cueBallPocketed = true; 
        else if (!this.pocketedThisShot.includes(ball.userData.ballNumber)) this.pocketedThisShot.push(ball.userData.ballNumber);
        body.velocity.set(0, 0, 0); 
        body.angularVelocity.set(0, 0, 0); 
        body.position.y = -2; 
        ball.position.y = -2; 
        ball.userData.isPocketed = true;
        if (ball.userData.shadowMesh) ball.userData.shadowMesh.visible = false; 
        if (ball.userData.ballNumber > 0) ball.visible = false;
      }
    });
    
    // Decay stored spin over time
    if (this.cueBallSpin) {
      this.cueBallSpin.vertical *= params.spinDecayRate;
      this.cueBallSpin.english *= params.spinDecayRate;
      
      // Clear spin if it's decayed too much
      if (Math.abs(this.cueBallSpin.vertical) < 0.01 && Math.abs(this.cueBallSpin.english) < 0.01) {
        this.cueBallSpin = null;
      }
    }
  }
}
