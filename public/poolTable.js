import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PoolTable {
  constructor(scene, physics, soundManager) {
    this.scene = scene;
    this.physics = physics;
    this.soundManager = soundManager; 
    
    this.balls = [];
    this.pockets = [];
    this.pocketedThisShot = [];
    this.cueBallHitObject = false;
    this.cueBallPocketed = false;
    
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

  // ============================================================
  // NETWORK STATE SYNC (Placed at top to ensure inclusion)
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
      })
    };
  }

  importState(stateData) {
    if (!stateData || !stateData.balls) return;

    stateData.balls.forEach(data => {
      const ball = this.balls.find(b => b.userData.ballNumber === data.number);
      if (!ball) return;

      // 1. Sync Visuals
      ball.position.set(data.position.x, data.position.y, data.position.z);
      ball.visible = data.visible;
      ball.userData.isPocketed = data.isPocketed;

      // 2. Sync Physics
      if (ball.userData.physicsBody) {
          const body = ball.userData.physicsBody;
          body.position.set(data.position.x, data.position.y, data.position.z);
          body.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
          body.angularVelocity.set(data.angularVelocity.x, data.angularVelocity.y, data.angularVelocity.z);
          body.wakeUp();
      }

      // 3. Sync Shadow
      if (ball.userData.shadowMesh) {
          ball.userData.shadowMesh.visible = data.visible && !data.isPocketed;
          if (ball.userData.shadowMesh.visible) {
            ball.userData.shadowMesh.position.set(ball.position.x, this.tableHeight, ball.position.z);
          }
      }
    });
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
    const mat = this.physics.cushionMaterial; const y = 0.95 + 0.04; const off = 0.6075;
    const add = (w,h,d,x,z,n) => { const b = new CANNON.Body({ mass: 0, material: mat, type: CANNON.Body.STATIC }); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))); b.position.set(x,y,z); b.userData={isCushion:true,name:n}; this.physics.world.addBody(b); };
    add(1.0, 0.08, 0.04, -off, -0.615, 'top-left'); add(1.0, 0.08, 0.04, off, -0.615, 'top-right');
    add(1.0, 0.08, 0.04, -off, 0.615, 'bottom-left'); add(1.0, 0.08, 0.04, off, 0.615, 'bottom-right');
    add(0.04, 0.08, 1.0, -1.25, 0, 'left'); add(0.04, 0.08, 1.0, 1.25, 0, 'right');
  }

  setupBalls() {
    this.balls.forEach(b => { this.scene.remove(b); if(b.userData.shadowMesh) this.scene.remove(b.userData.shadowMesh); this.physics.world.removeBody(b.userData.physicsBody); });
    this.balls = []; this.pocketedThisShot = [];
    this.createBall(-0.64, 0, 0xffffff, 0);
    const sp = 0.028*2.1; const fx = 0.64;
    [[fx,0],[fx+sp*0.866,-sp/2],[fx+sp*0.866,sp/2],[fx+sp*0.866*2,-sp],[fx+sp*0.866*2,0],[fx+sp*0.866*2,sp],[fx+sp*0.866*3,-sp*1.5],[fx+sp*0.866*3,-sp/2],[fx+sp*0.866*3,sp/2],[fx+sp*0.866*3,sp*1.5]].forEach((p,i) => this.createBall(p[0], p[1], this.originalBallColors[i], i+1));
  }
  
  setupCollisionTracking() {
    this.physics.world.addEventListener('beginContact', (e) => {
      const v = e.bodyA.velocity.distanceTo(e.bodyB.velocity);
      if (e.bodyA.collisionFilterGroup === 1 && e.bodyB.collisionFilterGroup === 1 && this.soundManager) {
        this.soundManager.playSound('ballHit', new THREE.Vector3((e.bodyA.position.x+e.bodyB.position.x)/2, (e.bodyA.position.y+e.bodyB.position.y)/2, (e.bodyA.position.z+e.bodyB.position.z)/2), v);
      }
      let bb = null; if (e.bodyA.collisionFilterGroup === 1 && e.bodyB.userData?.isCushion) bb = e.bodyA; else if (e.bodyB.collisionFilterGroup === 1 && e.bodyA.userData?.isCushion) bb = e.bodyB;
      if (bb && this.soundManager) this.soundManager.playSound('cushionHit', new THREE.Vector3(bb.position.x, bb.position.y, bb.position.z), v * 1.5);

      const cb = this.balls[0]?.userData.physicsBody;
      if (cb && (e.bodyA === cb || e.bodyB === cb)) {
        const ob = e.bodyA === cb ? e.bodyB : e.bodyA;
        const hit = this.balls.find(b => b.userData.physicsBody === ob);
        if (hit && hit.userData.ballNumber > 0) {
          this.cueBallHitObject = true;
          const s = cb.userData?.spin;
          if (s && (Math.abs(s.vertical) > 0.05 || Math.abs(s.english) > 0.05)) setTimeout(() => this.applySpinEffects(cb, s, ob.position), 16);
        }
      }
      this.checkCushionCollision(e.bodyA, e.bodyB);
    });
  }
  
  applySpinEffects(cb, s, obPos) {
    if (!cb || !s || !obPos) return;
    const v = cb.velocity; const speed = Math.sqrt(v.x*v.x + v.z*v.z); const es = Math.max(speed, 2.0);
    const iv = new CANNON.Vec3(obPos.x - cb.position.x, 0, obPos.z - cb.position.z); iv.normalize();
    const vert = Math.max(-1, Math.min(1, s.vertical || 0)); const p = Math.max(0, Math.min(1, s.power || 0));
    if (vert > 0.2) { const f = p * vert; const ef = es * (0.2 + 1.0 * f); v.x += iv.x * ef; v.z += iv.z * ef; }
    if (vert < -0.2) { const d = p * Math.abs(vert); const ds = es * (0.4 + 1.3 * d); v.x -= iv.x * ds; v.z -= iv.z * ds; }
    cb.wakeUp(); cb.userData.spin = null; 
  }
  
  checkCushionCollision(bodyA, bodyB) {
    const cb = this.balls[0]?.userData.physicsBody; if (!cb) return;
    let c = null; if (bodyA === cb && bodyB.userData?.isCushion) c = bodyB; else if (bodyB === cb && bodyA.userData?.isCushion) c = bodyA;
    if (!c) return;
    const s = cb.userData?.spin; if (!s || Math.abs(s.english) < 0.1) return;
    cb.userData.lastCushionHit = c.userData.name;
    setTimeout(() => this.applyCushionEnglish(cb, s, c.userData.name), 16);
  }
  
  applyCushionEnglish(cb, s, n) {
    if (!cb || !s || !n) return;
    const v = cb.velocity; const sp = Math.sqrt(v.x*v.x + v.z*v.z); if (sp < 0.5) return;
    const es = s.english * sp * 0.5;
    if (n === 'left') v.z += es; else if (n === 'right') v.z -= es; else if (n.includes('top')) v.x += es; else if (n.includes('bottom')) v.x -= es;
  }
  
  getCueBall() { return this.balls[0]; }
  
  showCueBall() {
      const cb = this.getCueBall();
      if (cb) {
          cb.visible = true; if (cb.userData.shadowMesh) cb.userData.shadowMesh.visible = true;
          cb.userData.isPocketed = false; const b = cb.userData.physicsBody;
          if (b.position.y < 0) { b.position.set(-0.64, this.tableHeight + 0.028, 0); b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); cb.position.copy(b.position); }
      }
  }
  isCueBallPocketed() { return this.cueBallPocketed; }
  getPocketedBalls() { return this.pocketedThisShot.filter(n => n > 0); }
  resetShotTracking() { this.pocketedThisShot = []; this.cueBallHitObject = false; this.cueBallPocketed = false; }

  createBall(x, z, color, number) {
    const r = 0.028; const g = new THREE.SphereGeometry(r, 32, 32);
    const m = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.1 });
    if (this.ballStyleSetting === 'bowling') {
      if (number === 0) { m.map = this.createBowlingBallTexture(); m.color.set(0xffffff); } else { m.map = this.createBowlingPinTexture(); m.color.set(0xffffff); }
      m.needsUpdate = true;
    }
    const b = new THREE.Mesh(g, m); b.userData.material = m; b.castShadow = false; b.receiveShadow = false; b.position.set(x, this.tableHeight + r, z); b.renderOrder = 4; 
    const sg = new THREE.PlaneGeometry(r * 1.9, r * 1.9); const sm = new THREE.MeshBasicMaterial({ map: this.ballShadowTexture, transparent: true, depthWrite: false, opacity: 1.0, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -4.0 });
    const smesh = new THREE.Mesh(sg, sm); smesh.rotation.x = -Math.PI / 2; smesh.renderOrder = 3; b.userData.shadowMesh = smesh; this.scene.add(smesh);
    
    const shape = new CANNON.Sphere(r);
    const body = new CANNON.Body({ mass: 0.17, shape: shape, material: this.physics.ballMaterial, linearDamping: 0.38, angularDamping: 0.38, ccdSpeedThreshold: 0.1, ccdIterations: 10 });
    body.position.set(x, this.tableHeight + r, z); body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    this.physics.world.addBody(body); b.userData.physicsBody = body; b.userData.ballNumber = number;
    this.scene.add(b); this.balls.push(b);
  }

  shootCueBall(direction, power, spin) {
    this.balls.forEach(b => { if (b.userData.physicsBody) b.userData.physicsBody.wakeUp(); });
    const cb = this.balls[0]; const b = cb.userData.physicsBody;
    cb.userData.isPocketed = false; cb.visible = true; if (b) b.wakeUp();
    this.resetShotTracking();
    if (this.soundManager) this.soundManager.playSound('cueHitSoft', cb.position.clone(), power * 10.0);
    const nd = new THREE.Vector3(direction.x, 0, direction.z).normalize();
    const f = power * 12.7; // Power set to 12.7
    b.velocity.copy(new CANNON.Vec3(nd.x * f, 0, nd.z * f));
    b.userData = b.userData || {}; b.userData.spin = { vertical: spin ? spin.vertical : 0, english: spin ? spin.english : 0, power: power };
    
    const r = 0.028; const rv = new THREE.Vector3(-nd.z, 0, nd.x).normalize(); const rs = f / r * 0.3; 
    if (spin && (Math.abs(spin.vertical) > 0.05 || Math.abs(spin.english) > 0.05)) {
      const ss = power * 40.0; const va = new THREE.Vector3(-nd.z, 0, nd.x).normalize();
      b.angularVelocity.set(rv.x * rs + va.x * spin.vertical * ss, 0, rv.z * rs + va.z * spin.vertical * ss);
    } else {
      b.angularVelocity.set(rv.x * rs, 0, rv.z * rs);
    }
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

  // ============================================================
  // HELPER FUNCTIONS (That were reported missing)
  // ============================================================

  checkBallInPocket(position) {
    for (const pocket of this.pockets) {
      const dx = position.x - pocket.position.x;
      const dz = position.z - pocket.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      // Increased pocket tolerance to 1.20
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
    if (this.feltMaterial) {
      this.feltMaterial.color.copy(newColor);
    }
    if (this.cushionMaterial) {
      this.cushionMaterial.color.copy(newColor);
    }
  }

  setBallStyle(style) {
    this.ballStyleSetting = style;
    if (!this.balls || this.balls.length === 0) return;
    this.balls.forEach(ball => {
      const ballNum = ball.userData.ballNumber;
      const material = ball.userData.material;
      if (style === 'bowling') {
        if (ballNum === 0) {
          const texture = this.createBowlingBallTexture();
          material.map = texture; material.color.set(0xffffff); material.needsUpdate = true;
        } else {
          const texture = this.createBowlingPinTexture();
          material.map = texture; material.color.set(0xffffff); material.needsUpdate = true;
        }
      } else {
        material.map = null;
        if (ballNum === 0) material.color.set(0xffffff); 
        else material.color.set(this.originalBallColors[ballNum - 1]);
        material.needsUpdate = true;
      }
    });
  }

  update(delta = 1/60) {
    this.preventTunneling(delta);
    this.balls.forEach(ball => {
      if (ball.position.y < -0.5 || ball.userData.isPocketed) return;
      const b = ball.userData.physicsBody;
      const v = b.velocity; const w = b.angularVelocity; const s = v.length(); const slip = Math.abs(s - w.length() * 0.028);
      if (slip > 0.1) b.linearDamping = 0.55; else b.linearDamping = 0.25;
      if (s < 0.08) { b.linearDamping = 0.98; b.angularDamping = 0.98; } else { b.angularDamping = 0.38; }
      if (ball.userData.ballNumber === 0) b.angularVelocity.y = 0; 
      ball.position.copy(b.position); ball.quaternion.copy(b.quaternion);
      if (ball.userData.shadowMesh) { ball.userData.shadowMesh.position.set(ball.position.x, this.tableHeight, ball.position.z); }
      if (v.lengthSquared() < 0.06 && w.lengthSquared() < 0.36) { b.velocity.set(0,0,0); b.angularVelocity.set(0,0,0); }
      
      if (!ball.userData.isPocketed) {
        if (Math.abs(b.position.x) > 1.4 || Math.abs(b.position.z) > 0.8) {
          if (ball.userData.ballNumber === 0) this.cueBallPocketed = true; else if (!this.pocketedThisShot.includes(ball.userData.ballNumber)) this.pocketedThisShot.push(ball.userData.ballNumber);
          ball.userData.isPocketed = true; b.velocity.set(0,0,0); b.angularVelocity.set(0,0,0); b.position.y = -2; ball.position.y = -2;
          if (ball.userData.shadowMesh) ball.userData.shadowMesh.visible = false; if (ball.userData.ballNumber > 0) ball.visible = false;
          return; 
        }
      }
      // This line was crashing because checkBallInPocket was missing. Now it is present.
      if (this.checkBallInPocket(b.position)) {
          if (this.soundManager) { const ps = b.velocity.length(); this.soundManager.playSound(ps > 2.0 ? 'pocketHard' : 'pocketSoft', ball.position.clone(), ps * 3.0); }
          if (ball.userData.ballNumber === 0) this.cueBallPocketed = true; else if (!this.pocketedThisShot.includes(ball.userData.ballNumber)) this.pocketedThisShot.push(ball.userData.ballNumber);
          b.velocity.set(0,0,0); b.angularVelocity.set(0,0,0); b.position.y = -2; ball.position.y = -2; ball.userData.isPocketed = true;
          if (ball.userData.shadowMesh) ball.userData.shadowMesh.visible = false; if (ball.userData.ballNumber > 0) ball.visible = false;
      }
    });
  }
}