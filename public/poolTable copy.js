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

  createBallShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, 
      canvas.height / 2, 
      0, 
      canvas.width / 2, 
      canvas.height / 2, 
      canvas.width / 2
    );
    
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
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const holeRadius = 12;
    const holeSpacing = 30;
    
    ctx.beginPath();
    ctx.arc(centerX - holeSpacing, centerY - holeSpacing / 2, holeRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(centerX + holeSpacing, centerY - holeSpacing / 2, holeRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(centerX, centerY + holeSpacing, holeRadius * 0.9, 0, Math.PI * 2);
    ctx.fill();
    
    return new THREE.CanvasTexture(canvas);
  }
  
  createBowlingPinTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const stripeWidth = 8;
    const stripeSpacing = 16;
    const centerY = canvas.height / 2;
    
    ctx.fillStyle = '#ff0000';
    
    ctx.fillRect(0, centerY - stripeSpacing / 2 - stripeWidth, canvas.width, stripeWidth);
    ctx.fillRect(0, centerY + stripeSpacing / 2, canvas.width, stripeWidth);
    
    return new THREE.CanvasTexture(canvas);
  }

  createTable() {
    const tableGroup = new THREE.Group();
    
    const feltGeometry = new THREE.BoxGeometry(2.54, 0.1, 1.27);
    this.feltMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x40a4c4,
      roughness: 0.85
    });
    const felt = new THREE.Mesh(feltGeometry, this.feltMaterial);
    felt.position.y = 0.9;
    felt.receiveShadow = false;
    felt.castShadow = false;
    felt.renderOrder = 1;
    
    tableGroup.add(felt);
    
    const shadowGeo = new THREE.PlaneGeometry(3.3, 2.0); 
    const shadowMat = new THREE.MeshBasicMaterial({ 
      map: this.tableShadowTexture, 
      transparent: true, 
      depthWrite: false, 
      opacity: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0
    });
    const tableShadow = new THREE.Mesh(shadowGeo, shadowMat);
    tableShadow.rotation.x = -Math.PI / 2;
    tableShadow.position.y = 0; 
    tableShadow.renderOrder = 0; 
    tableGroup.add(tableShadow);

    // --- EASTER EGG COMPONENTS ---
    
    // 1. The Poster (Initially Hidden)
    const loader = new THREE.TextureLoader();
    const posterTexture = loader.load('ivr_hustler.jpg');
    const posterGeo = new THREE.PlaneGeometry(0.6, 0.9);
    const posterMat = new THREE.MeshBasicMaterial({ 
        map: posterTexture,
        side: THREE.DoubleSide
    });
    this.easterEggPoster = new THREE.Mesh(posterGeo, posterMat);
    
    // Position: Underneath the table bed (approx y=0.84)
    this.easterEggPoster.position.set(0, 0.84, 0);
    
    // Rotation: 
    // X: 90 deg (face down)
    // Z: +90 deg (Mirrored/Flipped so it's readable from break side)
    this.easterEggPoster.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    
    this.easterEggPoster.visible = false; // Start hidden
    tableGroup.add(this.easterEggPoster);

    const tableShape = new CANNON.Box(new CANNON.Vec3(1.27, 0.05, 0.635));
    const tableBody = new CANNON.Body({ mass: 0 });
    tableBody.addShape(tableShape);
    tableBody.position.set(0, 0.9, 0);
    this.physics.world.addBody(tableBody);

    this.tableHeight = 0.95;
    
    this.createVisualCushions(tableGroup);
    
    const railMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x3d2817,
      roughness: 0.5,
      metalness: 0.1
    });
    
    const railHeight = 0.04;
    const railWidth = 0.08;
    const railYPosition = 0.995 - (railHeight / 2); 
    
    const longRail1 = new THREE.Mesh(
      new THREE.BoxGeometry(2.54 + railWidth * 2, railHeight, railWidth),
      railMaterial
    );
    longRail1.position.set(0, railYPosition, -1.27/2 - railWidth/2);
    longRail1.castShadow = false;
    tableGroup.add(longRail1);
    
    const longRail2 = longRail1.clone();
    longRail2.position.z = 1.27/2 + railWidth/2;
    tableGroup.add(longRail2);
    
    const shortRail1 = new THREE.Mesh(
      new THREE.BoxGeometry(railWidth, railHeight, 1.27), 
      railMaterial
    );
    shortRail1.position.set(-2.54/2 - railWidth/2, railYPosition, 0);
    shortRail1.castShadow = false;
    tableGroup.add(shortRail1);
    
    const shortRail2 = shortRail1.clone();
    shortRail2.position.x = 2.54/2 + railWidth/2;
    tableGroup.add(shortRail2);

    const legGeometry = new THREE.BoxGeometry(0.1, 0.9, 0.1);
    const legMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x3d2817,
      roughness: 0.5
    });
    
    const legPositions = [
      [-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]
    ];
    
    legPositions.forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.position.set(x, 0.45, z);
      leg.castShadow = false;
      tableGroup.add(leg);
    });

    this.createRackGuide(tableGroup);

    const diamondMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xf5f5f5, 
        roughness: 0.2, 
        metalness: 0.1, 
        side: THREE.DoubleSide
    });
    
    const diamondSize = 0.0075;
    const diamondShape = new THREE.Shape();
    diamondShape.moveTo(0, diamondSize);
    diamondShape.lineTo(diamondSize, 0);
    diamondShape.lineTo(0, -diamondSize);
    diamondShape.lineTo(-diamondSize, 0);
    diamondShape.lineTo(0, diamondSize);
    const diamondGeometry = new THREE.ShapeGeometry(diamondShape);
    
    const diamondY = railYPosition + railHeight / 2 + 0.001;
    const halfTableLength = 2.54 / 2; 
    const halfTableWidth = 1.27 / 2;  
    const railCenterOffset = railWidth / 2;

    const longSection = halfTableLength / 4; 
    const shortSection = halfTableWidth / 2; 

    const diamondLocations = [
        { x: -halfTableLength + longSection,   z: -halfTableWidth - railCenterOffset, rotZ: 0 }, 
        { x: -halfTableLength + longSection*2, z: -halfTableWidth - railCenterOffset, rotZ: 0 }, 
        { x: -halfTableLength + longSection*3, z: -halfTableWidth - railCenterOffset, rotZ: 0 }, 
        { x:  halfTableLength - longSection*3, z: -halfTableWidth - railCenterOffset, rotZ: 0 }, 
        { x:  halfTableLength - longSection*2, z: -halfTableWidth - railCenterOffset, rotZ: 0 }, 
        { x:  halfTableLength - longSection,   z: -halfTableWidth - railCenterOffset, rotZ: 0 }, 
        
        { x: -halfTableLength + longSection,   z: halfTableWidth + railCenterOffset, rotZ: 0 }, 
        { x: -halfTableLength + longSection*2, z: halfTableWidth + railCenterOffset, rotZ: 0 }, 
        { x: -halfTableLength + longSection*3, z: halfTableWidth + railCenterOffset, rotZ: 0 }, 
        { x:  halfTableLength - longSection*3, z: halfTableWidth + railCenterOffset, rotZ: 0 }, 
        { x:  halfTableLength - longSection*2, z: halfTableWidth + railCenterOffset, rotZ: 0 }, 
        { x:  halfTableLength - longSection,   z: halfTableWidth + railCenterOffset, rotZ: 0 }, 
        
        { x: -halfTableLength - railCenterOffset, z: -shortSection, rotZ: Math.PI / 2 }, 
        { x: -halfTableLength - railCenterOffset, z: 0,           rotZ: Math.PI / 2 },
        { x: -halfTableLength - railCenterOffset, z: shortSection,  rotZ: Math.PI / 2 }, 
        
        { x: halfTableLength + railCenterOffset, z: -shortSection, rotZ: Math.PI / 2 }, 
        { x: halfTableLength + railCenterOffset, z: 0,           rotZ: Math.PI / 2 },
        { x: halfTableLength + railCenterOffset, z: shortSection,  rotZ: Math.PI / 2 }  
    ];

    diamondLocations.forEach(loc => {
        const diamond = new THREE.Mesh(diamondGeometry, diamondMaterial);
        diamond.position.set(loc.x, diamondY, loc.z);
        diamond.rotation.set(-Math.PI / 2, 0, loc.rotZ);
        diamond.castShadow = false;
        diamond.receiveShadow = false;
        tableGroup.add(diamond);
    });

    this.scene.add(tableGroup);
    this.tableGroup = tableGroup; 
    
    this.createRailPhysics();
  }
  
  // --- Easter Egg Logic ---
  toggleEasterEgg() {
    this.isEasterEggActive = !this.isEasterEggActive;
    
    if (this.easterEggPoster) {
        this.easterEggPoster.visible = this.isEasterEggActive;
    }
    
    if (this.soundManager && this.easterEggButton) {
        this.soundManager.toggleSound('hustlerMovie', this.easterEggButton.getWorldPosition(new THREE.Vector3()));
    }
    
    if (this.easterEggButton) {
        if (this.isEasterEggActive) {
            this.easterEggButton.position.y = -0.005; 
            this.easterEggButton.material.emissiveIntensity = 0.8; 
        } else {
            this.easterEggButton.position.y = -0.015; 
            this.easterEggButton.material.emissiveIntensity = 0.2; 
        }
    }
  }
  
  createVisualCushions(tableGroup) {
    this.cushionMaterial = new THREE.MeshStandardMaterial({
      color: 0x40a4c4,
      roughness: 0.85,
    });

    // Dimensions
    const cushionTotalHeight = 0.045; 
    const cushionTotalWidth = 0.04;  
    const ballRadius = 0.028;
    const cushionContactHeight = ballRadius * 1.25; 
    const yPos = this.tableHeight; 
    
    const cushionShape = new THREE.Shape();
    cushionShape.moveTo(0, 0); 
    cushionShape.lineTo(0, cushionTotalHeight);
    cushionShape.lineTo(cushionTotalWidth, cushionContactHeight); // The Nose
    cushionShape.lineTo(0, 0); 

    // Corner pocket gap: 0.115 (Final approved length)
    const cornerPocketGap = 0.115; 
    const sidePocketGap = 0.12;  
    
    const tableLength = 2.54;
    const tableWidth = 1.27;
    const halfLength = tableLength / 2;
    const halfWidth = tableWidth / 2;

    const longSegmentLength = (tableLength / 2) - (sidePocketGap / 2) - cornerPocketGap;
    const shortSegmentLength = tableWidth - (cornerPocketGap * 2);

    const ANGLE_CORNER = Math.PI / 4; // 45 degrees
    const ANGLE_SIDE = Math.PI / 12;  // 15 degrees

    const createBeveledRail = (shape, length, angleStart, angleEnd) => {
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1 });
        
        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        
        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            const distFromNose = cushionTotalWidth - vertex.x;
            
            if (vertex.z < length / 2) {
                vertex.z -= distFromNose * Math.tan(angleStart);
            } else {
                vertex.z += distFromNose * Math.tan(angleEnd);
            }
            
            posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        
        geometry.computeVertexNormals();
        return geometry;
    };

    const placeCushion = (geom, x, y, z, rotY) => {
      const cushion = new THREE.Mesh(geom, this.cushionMaterial);
      cushion.position.set(x, y, z);
      cushion.rotation.set(0, rotY, 0);
      cushion.castShadow = false;
      tableGroup.add(cushion);
    };

    const shortGeom = createBeveledRail(cushionShape, shortSegmentLength, ANGLE_CORNER, ANGLE_CORNER);
    placeCushion(shortGeom, -halfLength, yPos, -halfWidth + cornerPocketGap, 0);
    placeCushion(shortGeom, halfLength, yPos, halfWidth - cornerPocketGap, Math.PI);

    const geomCornerToSide = createBeveledRail(cushionShape, longSegmentLength, ANGLE_CORNER, ANGLE_SIDE);
    const geomSideToCorner = createBeveledRail(cushionShape, longSegmentLength, ANGLE_SIDE, ANGLE_CORNER);

    placeCushion(geomCornerToSide, halfLength - cornerPocketGap, yPos, -halfWidth, -Math.PI / 2);
    placeCushion(geomSideToCorner, -sidePocketGap / 2, yPos, -halfWidth, -Math.PI / 2);
    placeCushion(geomCornerToSide, -halfLength + cornerPocketGap, yPos, halfWidth, Math.PI / 2);
    placeCushion(geomSideToCorner, sidePocketGap / 2, yPos, halfWidth, Math.PI / 2);
  }
  
  createRackGuide(tableGroup) {
    const radius = 0.028;
    const spacing = radius * 2.1; 
    
    const footSpotX = 0.64;
    
    const frontPoint = new THREE.Vector3(footSpotX, 0.951, 0);
    const backLeft = new THREE.Vector3(footSpotX + spacing * 0.866 * 3, 0.951, -spacing * 1.5);
    const backRight = new THREE.Vector3(footSpotX + spacing * 0.866 * 3, 0.951, spacing * 1.5);
    
    const points = [
      frontPoint,
      backLeft,
      backRight,
      frontPoint
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      linewidth: 2
    });
    
    const rackLine = new THREE.Line(geometry, material);
    tableGroup.add(rackLine);
    
    const circleGeometry = new THREE.RingGeometry(0.01, 0.012, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    const footSpotMarker = new THREE.Mesh(circleGeometry, circleMaterial);
    footSpotMarker.rotation.x = -Math.PI / 2;
    footSpotMarker.position.set(footSpotX, 0.951, 0);
    tableGroup.add(footSpotMarker);
    
    const headSpot = footSpotMarker.clone();
    headSpot.position.set(-0.64, 0.951, 0);
    tableGroup.add(headSpot);
  }

  createPockets() {
    const cornerPocketRadius = 0.052; 
    const sidePocketRadius   = 0.055; 

    const pocketMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 1.0,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0
    });

    const feltY = this.tableHeight; 

    const makePocket = (x, z, radius) => {
      const pocketGeom = new THREE.CircleGeometry(radius, 32);
      const pocket = new THREE.Mesh(pocketGeom, pocketMaterial);
      pocket.position.set(x, feltY, z);
      pocket.rotation.x = -Math.PI / 2;
      pocket.renderOrder = 2; 
      
      pocket.castShadow = false;
      pocket.receiveShadow = false;
      this.scene.add(pocket);
    };

    const cornerPositions = [
      [-1.225, -0.59],  
      [-1.225,  0.59],  
      [ 1.225, -0.59],  
      [ 1.225,  0.59]   
    ];

    cornerPositions.forEach(([x, z]) => {
      makePocket(x, z, cornerPocketRadius);
      this.pockets.push({
        position: new THREE.Vector3(x, this.tableHeight, z),
        radius: cornerPocketRadius * 0.9
      });
    });

    const sidePositions = [
      [0, -0.64],      
      [0,  0.64]       
    ];

    sidePositions.forEach(([x, z]) => {
      makePocket(x, z, sidePocketRadius);
      this.pockets.push({
        position: new THREE.Vector3(x, this.tableHeight, z),
        radius: sidePocketRadius * 0.9
      });
    });
  }

  createRailPhysics() {
    const cushionMaterial = this.physics.cushionMaterial;
    
    const cushionWidth = 0.04; 
    const cushionHeight = 0.08; 
    const wallY = this.tableHeight + cushionHeight / 2; 
    
    const tableLength = 2.54;
    const tableWidth = 1.27;
    const halfLength = tableLength / 2;
    const halfWidth = tableWidth / 2;
    
    // Corner Cushions: Final approved length
    const cornerGap = 0.115; 
    
    // Side Cushions: Reverted to desired size
    const sideGap = 0.12;
    
    // Recalculate segment lengths based on cornerGap and sideGap
    const longSegmentLength = (tableLength / 2) - (sideGap / 2) - cornerGap;
    const shortSegmentLength = tableWidth - (cornerGap * 2);
    
    // --- FIXED SIDE POCKET PHYSICS POSITIONING ---
    // Calculated offset to center the rail segments correctly between corner and side pocket.
    const sideRailOffset = (halfLength - cornerGap + sideGap / 2) / 2; // ~0.6075
    
    const cushions = [
      { 
        x: -sideRailOffset,  // Top Left
        y: wallY,
        z: -halfWidth + cushionWidth/2,  
        width: longSegmentLength, 
        height: cushionHeight, 
        depth: cushionWidth, 
        name: 'top-left'
      },
      { 
        x: sideRailOffset,  // Top Right
        y: wallY,
        z: -halfWidth + cushionWidth/2,  
        width: longSegmentLength, 
        height: cushionHeight, 
        depth: cushionWidth, 
        name: 'top-right'
      },
      { 
        x: -sideRailOffset,  // Bottom Left
        y: wallY,
        z: halfWidth - cushionWidth/2,  
        width: longSegmentLength, 
        height: cushionHeight, 
        depth: cushionWidth, 
        name: 'bottom-left'
      },
      { 
        x: sideRailOffset,  // Bottom Right
        y: wallY,
        z: halfWidth - cushionWidth/2,  
        width: longSegmentLength, 
        height: cushionHeight, 
        depth: cushionWidth, 
        name: 'bottom-right'
      },
      { 
        x: -halfLength + cushionWidth/2,  
        y: wallY,
        z: 0, 
        width: cushionWidth,  
        height: cushionHeight, 
        depth: shortSegmentLength,
        name: 'left'
      },
      { 
        x: halfLength - cushionWidth/2, 
        y: wallY,
        z: 0, 
        width: cushionWidth, 
        height: cushionHeight, 
        depth: shortSegmentLength,
        name: 'right'
      }
    ];
    
    cushions.forEach((cushion) => {
      const shape = new CANNON.Box(new CANNON.Vec3(
        cushion.width/2, 
        cushion.height/2, 
        cushion.depth/2
      ));
      
      const body = new CANNON.Body({ 
        mass: 0,
        material: cushionMaterial,
        type: CANNON.Body.STATIC
      });
      
      body.addShape(shape);
      body.position.set(cushion.x, cushion.y, cushion.z);
      
      body.userData = { isCushion: true, name: cushion.name };
      this.physics.world.addBody(body);
    });
  }

  setupBalls() {
    this.balls.forEach(ball => {
      this.scene.remove(ball);
      if (ball.userData.shadowMesh) {
        this.scene.remove(ball.userData.shadowMesh);
      }
      this.physics.world.removeBody(ball.userData.physicsBody);
    });
    this.balls = [];
    this.pocketedThisShot = [];
    this.createBall(-0.64, 0, 0xffffff, 0);
    
    const radius = 0.028;
    const spacing = radius * 2.1; 
    const footSpotX = 0.64; 
    
    const ballPositions = [
      [footSpotX, 0],
      [footSpotX + spacing * 0.866, -spacing/2],
      [footSpotX + spacing * 0.866, spacing/2],
      [footSpotX + spacing * 0.866 * 2, -spacing],
      [footSpotX + spacing * 0.866 * 2, 0],
      [footSpotX + spacing * 0.866 * 2, spacing],
      [footSpotX + spacing * 0.866 * 3, -spacing * 1.5],
      [footSpotX + spacing * 0.866 * 3, -spacing/2],
      [footSpotX + spacing * 0.866 * 3, spacing/2],
      [footSpotX + spacing * 0.866 * 3, spacing * 1.5]
    ];
    
    const ballColors = this.originalBallColors;

    ballPositions.forEach((pos, i) => {
      this.createBall(pos[0], pos[1], ballColors[i], i + 1);
    });
  }
  
  // ============================================================
  // COLLISION TRACKING
  // ============================================================
  setupCollisionTracking() {
    this.physics.world.addEventListener('beginContact', (event) => {
      const bodyA = event.bodyA;
      const bodyB = event.bodyB;
      
      const velocity = bodyA.velocity.distanceTo(bodyB.velocity);

      // 1. BALL ON BALL
      if (bodyA.collisionFilterGroup === 1 && bodyB.collisionFilterGroup === 1) {
        const contactPos = new THREE.Vector3(
          (bodyA.position.x + bodyB.position.x) / 2,
          (bodyA.position.y + bodyB.position.y) / 2,
          (bodyA.position.z + bodyB.position.z) / 2
        );
        
        if (this.soundManager) {
           this.soundManager.playSound('ballHit', contactPos, velocity);
        }
      }

      // 2. BALL ON CUSHION
      let ballBody = null;
      if (bodyA.collisionFilterGroup === 1 && bodyB.userData?.isCushion) {
          ballBody = bodyA;
      } else if (bodyB.collisionFilterGroup === 1 && bodyA.userData?.isCushion) {
          ballBody = bodyB;
      }

      if (ballBody && this.soundManager) {
          const pos = new THREE.Vector3(ballBody.position.x, ballBody.position.y, ballBody.position.z);
          this.soundManager.playSound('cushionHit', pos, velocity * 1.5);
      }

      // 3. SPIN APPLICATION
      const cueBallBody = this.balls[0]?.userData.physicsBody;
      if (!cueBallBody) return;
      
      if (bodyA === cueBallBody || bodyB === cueBallBody) {
        const otherBody = bodyA === cueBallBody ? bodyB : bodyA;
        
        const hitBall = this.balls.find(b => b.userData.physicsBody === otherBody);
        if (hitBall && hitBall.userData.ballNumber > 0) {
          this.cueBallHitObject = true;
          
          const spin = cueBallBody.userData?.spin;
          if (spin && (Math.abs(spin.vertical) > 0.05 || Math.abs(spin.english) > 0.05)) {
            // Pass the Object Ball position to calculate impact vector correctly
            setTimeout(() => {
              this.applySpinEffects(cueBallBody, spin, otherBody.position);
            }, 16); 
          }
        }
      }
      
      this.checkCushionCollision(bodyA, bodyB);
    });
  }
  
  // ============================================================
  // SPIN LOGIC (IMPACT VECTOR METHOD)
  // ============================================================
  applySpinEffects(cueBallBody, spin, objectBallPos) {
    if (!cueBallBody || !spin || !objectBallPos) return;
    
    const velocity = cueBallBody.velocity;
    let speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    
    const effectiveSpeed = Math.max(speed, 2.0); 

    // Calculate Impact Vector (Cue -> Object)
    // This represents the "Line of collision"
    const impactVector = new CANNON.Vec3(
        objectBallPos.x - cueBallBody.position.x,
        0,
        objectBallPos.z - cueBallBody.position.z
    );
    impactVector.normalize();

    const vert = Math.max(-1, Math.min(1, spin.vertical || 0));
    const power = Math.max(0, Math.min(1, spin.power || 0));

    // FOLLOW (Top Spin)
    if (vert > 0.2) {
      const followPower = power * vert;
      const extraForward = effectiveSpeed * (0.2 + 1.0 * followPower); 
      velocity.x += impactVector.x * extraForward;
      velocity.z += impactVector.z * extraForward;
    }
    
    // DRAW (Back Spin)
    if (vert < -0.2) {
      const drawPower = power * Math.abs(vert);
      
      // --- MODIFICATION: Reduced multiplier from 1.8 to 1.3 ---
      const drawStrength = effectiveSpeed * (0.4 + 1.3 * drawPower);
      // --- END MODIFICATION ---
      
      // Subtract the impact vector (Pull back along the aiming line)
      velocity.x -= impactVector.x * drawStrength;
      velocity.z -= impactVector.z * drawStrength;
    }

    cueBallBody.wakeUp(); 
    cueBallBody.userData.spin = null; 
  }
  
  checkCushionCollision(bodyA, bodyB) {
    const cueBallBody = this.balls[0]?.userData.physicsBody;
    if (!cueBallBody) return;
    
    let cushionBody = null;
    if (bodyA === cueBallBody && bodyB.userData?.isCushion) {
      cushionBody = bodyB;
    } else if (bodyB === cueBallBody && bodyA.userData?.isCushion) {
      cushionBody = bodyA;
    }
    
    if (!cushionBody) return;
    
    const spin = cueBallBody.userData?.spin;
    if (!spin || Math.abs(spin.english) < 0.1) return;
    
    cueBallBody.userData.lastCushionHit = cushionBody.userData.name;
    
    setTimeout(() => {
      this.applyCushionEnglish(cueBallBody, spin, cushionBody.userData.name);
    }, 16); 
  }
  
  // ============================================================
  // SPIN LOGIC (CUSHION INTERACTION: ENGLISH ONLY)
  // ============================================================
  applyCushionEnglish(cueBallBody, spin, cushionName) {
    if (!cueBallBody || !spin || !cushionName) return;
    
    const velocity = cueBallBody.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    
    if (speed < 0.5) return; 
    
    const englishStrength = spin.english * speed * 0.5; 
    
    if (cushionName === 'left') {
      velocity.z += englishStrength;
      
    } else if (cushionName === 'right') {
      velocity.z -= englishStrength;
      
    } else if (cushionName.includes('top')) {
      velocity.x += englishStrength;
      
    } else if (cushionName.includes('bottom')) {
      velocity.x -= englishStrength;
    }
  }
  
  getCueBall() {
    return this.balls[0];
  }
  showCueBall() {
      const cueBall = this.getCueBall();
      if (cueBall) {
          cueBall.visible = true;
          if (cueBall.userData.shadowMesh) {
            cueBall.userData.shadowMesh.visible = true;
          }
          
          cueBall.userData.isPocketed = false;
          
          const body = cueBall.userData.physicsBody;
          if (body.position.y < 0) {
              // --- MODIFICATION: Reset to (-0.64, 0) HEAD SPOT instead of (0,0) ---
              body.position.set(-0.64, this.tableHeight + 0.028, 0);
              // --------------------------------------------------------------------
              body.velocity.set(0, 0, 0);
              body.angularVelocity.set(0, 0, 0);
              cueBall.position.copy(body.position);
          }
      }
  }
  isCueBallPocketed() {
    return this.cueBallPocketed;
  }
  getPocketedBalls() {
    return this.pocketedThisShot.filter(num => num > 0);
  }
  resetShotTracking() {
    this.pocketedThisShot = [];
    this.cueBallHitObject = false;
    this.cueBallPocketed = false;
  }

  createBall(x, z, color, number) {
    const radius = 0.028;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    
    const material = new THREE.MeshStandardMaterial({ 
      color: color,
      roughness: 0.3,
      metalness: 0.1
    });

    if (this.ballStyleSetting === 'bowling') {
      if (number === 0) {
        const texture = this.createBowlingBallTexture();
        material.map = texture;
        material.color.set(0xffffff); 
        material.needsUpdate = true;
      } else {
        const texture = this.createBowlingPinTexture();
        material.map = texture;
        material.color.set(0xffffff); 
        material.needsUpdate = true;
      }
    }

    const ball = new THREE.Mesh(geometry, material);
    ball.userData.material = material; 
    
    ball.castShadow = false;
    ball.receiveShadow = false;
    
    ball.position.set(x, this.tableHeight + radius, z);
    
    ball.renderOrder = 4; 
    
    const shadowGeo = new THREE.PlaneGeometry(radius * 1.9, radius * 1.9);
    const shadowMat = new THREE.MeshBasicMaterial({ 
      map: this.ballShadowTexture, 
      transparent: true, 
      depthWrite: false, 
      opacity: 1.0, 
      
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0 
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.renderOrder = 3; 
    ball.userData.shadowMesh = shadowMesh;
    
    this.scene.add(shadowMesh);

    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass: 0.17,
      shape: shape,
      material: this.physics.ballMaterial,
      
      // === TUNED FOR REALISM (Heavy Table) ===
      linearDamping: 0.38,
      
      // === SLIDE vs ROLL IMPLEMENTATION ===
      angularDamping: 0.38, 
      
      ccdSpeedThreshold: 0.1, 
      ccdIterations: 10
    });
    body.position.set(x, this.tableHeight + radius, z);
    
    body.collisionFilterGroup = 1;
    body.collisionFilterMask = -1;
    
    this.physics.world.addBody(body);
    
    ball.userData.physicsBody = body;
    ball.userData.ballNumber = number;
    
    this.scene.add(ball);
    this.balls.push(ball);
  }

  shootCueBall(direction, power, spin) {
    this.balls.forEach(b => {
        if (b.userData.physicsBody) b.userData.physicsBody.wakeUp();
    });

    const cueBall = this.balls[0];
    const body = cueBall.userData.physicsBody;
    
    // --- CRITICAL FIX: Force visual tracking & physics active ---
    cueBall.userData.isPocketed = false;
    cueBall.visible = true;
    if (body) body.wakeUp();
    // ----------------------------------------------------------
    
    this.resetShotTracking();
    
    if (this.soundManager) {
        const soundKey = 'cueHitSoft';
        this.soundManager.playSound(soundKey, cueBall.position.clone(), power * 10.0);
    }

    const normalizedDirection = new THREE.Vector3(direction.x, 0, direction.z).normalize();
    
    // --- POWER REVERTED TO 12.7 ---
    const forceMagnitude = power * 12.7;
    
    const velocity = new CANNON.Vec3(
      normalizedDirection.x * forceMagnitude,
      0,
      normalizedDirection.z * forceMagnitude
    );
    
    body.velocity.copy(velocity);
    
    body.userData = body.userData || {};
    body.userData.spin = {
      vertical: spin ? spin.vertical : 0,
      english: spin ? spin.english : 0,
      power: power
    };
    
    const ballRadius = 0.028;
    
    const rightVec = new THREE.Vector3(-normalizedDirection.z, 0, normalizedDirection.x);
    rightVec.normalize();
    
    const naturalRollSpeed = forceMagnitude / ballRadius * 0.3; 
    
    if (spin && (Math.abs(spin.vertical) > 0.05 || Math.abs(spin.english) > 0.05)) {
      
      // Visual spin reduced to 40.0
      const spinStrength = power * 40.0; 
      
      const verticalSpinAxis = new THREE.Vector3(-normalizedDirection.z, 0, normalizedDirection.x);
      verticalSpinAxis.normalize();
      const verticalSpinAmount = spin.vertical * spinStrength;
      
      const sideSpinAmount = spin.english * spinStrength * 0.5; 
      
      body.angularVelocity.set(
        rightVec.x * naturalRollSpeed + verticalSpinAxis.x * verticalSpinAmount,
        0, 
        rightVec.z * naturalRollSpeed + verticalSpinAxis.z * verticalSpinAmount
      );
    } else {
      body.angularVelocity.set(
        rightVec.x * naturalRollSpeed,
        0,
        rightVec.z * naturalRollSpeed
      );
    }
  }
  spotBalls(ballNumbers) {
    const footSpotX = 0.64;
    const spotRadius = 0.028;
    const spacing = spotRadius * 2.1;
    
    ballNumbers.forEach((ballNum, index) => {
      const ball = this.balls.find(b => b.userData.ballNumber === ballNum);
      if (!ball) return;
      
      const body = ball.userData.physicsBody;
      
      let spotX = footSpotX + (index * spacing);
      if (spotX > 1.2) spotX = 1.2; 
      
      body.position.set(spotX, this.tableHeight + spotRadius, 0);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      
      ball.position.copy(body.position);
      
      if (ball.userData.shadowMesh) {
        ball.userData.shadowMesh.visible = true;
      }
    });
  }
  
  // --- Manual raycast check to prevent tunneling ---
  preventTunneling(delta) {
      const cueBall = this.balls[0];
      if (!cueBall) return;
      
      const body = cueBall.userData.physicsBody;
      const speed = body.velocity.length();
      
      // Only run if ball is moving fast (>5.0 units/sec)
      if (speed < 5.0) return;
      
      const direction = body.velocity.clone().normalize();
      const radius = 0.028;
      const distanceToTravel = speed * delta + radius; // Look slightly ahead
      
      // Setup raycaster
      this.tunnelingRaycaster.set(cueBall.position, new THREE.Vector3(direction.x, direction.y, direction.z));
      this.tunnelingRaycaster.far = distanceToTravel;
      
      // Get all object balls
      const objectBalls = this.balls.filter(b => b.userData.ballNumber !== 0 && !b.userData.isPocketed);
      
      const intersects = this.tunnelingRaycaster.intersectObjects(objectBalls);
      
      if (intersects.length > 0) {
          const hit = intersects[0];
          const objectBall = hit.object;
          
          // We found a ball we are about to pass through!
          // Manually place cue ball at impact point (radius + tiny buffer)
          const safeDistance = hit.distance - radius - 0.001;
          
          if (safeDistance < 0) return; // Already inside
          
          // Move visual and physics body to safe spot
          const safePos = new THREE.Vector3()
              .copy(cueBall.position)
              .addScaledVector(new THREE.Vector3(direction.x, direction.y, direction.z), safeDistance);
          
          body.position.set(safePos.x, safePos.y, safePos.z);
          cueBall.position.copy(safePos);
          
          // Wake up the target so physics resolves the collision next frame
          if (objectBall.userData.physicsBody) {
              objectBall.userData.physicsBody.wakeUp();
          }
      }
  }

  update(delta = 1/60) {
    // --- Run anti-tunneling check before physics sync ---
    this.preventTunneling(delta);

    // --- Define aggressive damping constants ---
    const CREEP_THRESHOLD = 0.08; // units/second
    const STOP_DAMPING = 0.98;    // Linear damping for stopping
    const STOP_ANGULAR_DAMPING = 0.98;    // Kill spin fast when stopping
    const NORMAL_ANGULAR_DAMPING = 0.38;  // Default spin decay

    this.balls.forEach(ball => {
      if (ball.position.y < -0.5 || ball.userData.isPocketed) return;
      
      const body = ball.userData.physicsBody;
      
      // === SLIDE VS ROLL LOGIC ===
      const v = body.velocity;
      const w = body.angularVelocity;
      const speed = v.length();
      const spinSpeed = w.length() * 0.028; // angular velocity * radius
      const slip = Math.abs(speed - spinSpeed);

      if (slip > 0.1) {
         // SKIDDING (High Friction)
         body.linearDamping = 0.55; 
      } else {
         // ROLLING (Low Friction)
         body.linearDamping = 0.25; 
      }
      
      // === DYNAMIC DAMPING FOR ABRUPT STOP (LINEAR & ANGULAR) ===
      if (speed < CREEP_THRESHOLD) {
          body.linearDamping = STOP_DAMPING;
          body.angularDamping = STOP_ANGULAR_DAMPING; // Kill spin
      } else {
          // Reset angular damping if moving above threshold
          body.angularDamping = NORMAL_ANGULAR_DAMPING;
          
          if (slip < 0.1) {
              // If rolling and above threshold, use normal rolling friction (0.25)
              body.linearDamping = 0.25;
          } else {
              // If sliding and above threshold, use normal sliding friction (0.55)
              body.linearDamping = 0.55;
          }
      }

      if (ball.userData.ballNumber === 0) {
          body.angularVelocity.y = 0; 
      }
      
      ball.position.copy(body.position);
      ball.quaternion.copy(body.quaternion);
      
      const shadowMesh = ball.userData.shadowMesh;
      if (shadowMesh) {
        shadowMesh.position.x = ball.position.x;
        shadowMesh.position.z = ball.position.z;
        shadowMesh.position.y = this.tableHeight; 
      }
      
      const speedSq = body.velocity.lengthSquared();
      const angularSpeedSq = body.angularVelocity.lengthSquared();
      
      if (speedSq < 0.06 && angularSpeedSq < 0.36) { 
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
      
      if (!ball.userData.isPocketed) {
        const absX = Math.abs(body.position.x);
        const absZ = Math.abs(body.position.z);
        
        if (absX > 1.4 || absZ > 0.8) {
          const ballNum = ball.userData.ballNumber;
          
          if (ballNum === 0) {
            console.log('Cue ball knocked off table!');
            this.cueBallPocketed = true;
          } else {
            console.log('Ball', ballNum, 'fell off table - counting as pocketed');
            if (!this.pocketedThisShot.includes(ballNum)) {
              this.pocketedThisShot.push(ballNum);
            }
          }
          
          ball.userData.isPocketed = true;
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.position.set(ball.position.x, -2, ball.position.z);
          ball.position.set(ball.position.x, -2, ball.position.z);
          
          if (shadowMesh) {
            shadowMesh.visible = false;
          }
          if (ballNum > 0) {
            ball.visible = false;
          }
          
          return; 
        }
      }

      const ballIsPocketed = this.checkBallInPocket(body.position);
      
      if (ballIsPocketed) {
          if (this.soundManager) {
              const pocketSpeed = body.velocity.length();
              const soundKey = pocketSpeed > 2.0 ? 'pocketHard' : 'pocketSoft';
              this.soundManager.playSound(soundKey, ball.position.clone(), pocketSpeed * 3.0);
          }

          const ballNum = ball.userData.ballNumber;
          console.log('Ball', ballNum, 'pocketed at position', body.position.y);
          if (ballNum === 0) {
              this.cueBallPocketed = true;
              console.log('Cue ball pocketed flag set');
          }
          if (!this.pocketedThisShot.includes(ballNum)) {
              this.pocketedThisShot.push(ballNum);
              console.log('Added ball', ballNum, 'to pocketedThisShot. Array now:', this.pocketedThisShot);
          }
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.position.set(ball.position.x, -2, ball.position.z);
          ball.position.set(ball.position.x, -2, ball.position.z);
          
          ball.userData.isPocketed = true;
          
          if (shadowMesh) {
            shadowMesh.visible = false;
          }

          if (ballNum > 0) {
            ball.visible = false;
          }
      }
    });
  }
  
  checkBallInPocket(position) {
    for (const pocket of this.pockets) {
      const dx = position.x - pocket.position.x;
      const dz = position.z - pocket.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Increased pocket tolerance to 1.20 to fix non-counting ball bug
      const effectiveRadius = pocket.radius * 1.20;
      
      if (distance < effectiveRadius || 
          (distance < pocket.radius * 1.4 && position.y < this.tableHeight - 0.015)) {
        console.log('POCKETING BALL - distance:', distance.toFixed(3), 'pocket radius:', pocket.radius.toFixed(3), 'y:', position.y.toFixed(3));
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
          material.map = texture;
          material.color.set(0xffffff); 
          material.needsUpdate = true;
        } else {
          const texture = this.createBowlingPinTexture();
          material.map = texture;
          material.color.set(0xffffff); 
          material.needsUpdate = true;
        }
      } else {
        material.map = null;
        if (ballNum === 0) {
          material.color.set(0xffffff); 
        } else {
          material.color.set(this.originalBallColors[ballNum - 1]);
        }
        material.needsUpdate = true;
      }
    });
  }

  // ============================================================
  // NETWORK STATE EXPORT
  // ============================================================
  /**
   * Export a minimal, serializable snapshot of the table state.
   * This is used by NetworkManager so the host can broadcast
   * the current ball positions / velocities to remote clients.
   */
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
}