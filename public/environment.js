import * as THREE from 'three';

export function createEnvironment(scene) {
  // Floor - hardwood
  const floorGeometry = new THREE.PlaneGeometry(20, 20);
  const floorTexture = createWoodTexture();
  const floorMaterial = new THREE.MeshStandardMaterial({ 
    map: floorTexture,
    roughness: 0.8,
    metalness: 0.1
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  
  // --- MODIFICATION: Set render order ---
  floor.renderOrder = -1; // Draw floor first
  // --- END MODIFICATION ---

  scene.add(floor);

  // Walls - dark with wood trim
  createWalls(scene);
  
  // Ceiling
  const ceilingGeometry = new THREE.PlaneGeometry(20, 20);
  const ceilingMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2a2a2a,
    roughness: 0.9
  });
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 5;
  scene.add(ceiling);

  // Ceiling light fixtures
  for (let i = -2; i <= 2; i += 2) {
    for (let j = -3; j <= 3; j += 3) {
      const fixture = createLightFixture();
      fixture.position.set(i, 4.8, j);
      scene.add(fixture);
    }
  }
}

function createWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(0, 0, 512, 512);
  
  for (let i = 0; i < 50; i++) {
    ctx.strokeStyle = `rgba(101, 67, 33, ${Math.random() * 0.3})`;
    ctx.lineWidth = Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * 512);
    ctx.lineTo(512, Math.random() * 512);
    ctx.stroke();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

function createWalls(scene) {
  const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x000000,
    roughness: 0.9
  });
  
  const trimMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x000000,
    roughness: 0.6
  });

  // Back wall
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 0.2), wallMaterial);
  backWall.position.set(0, 2.5, -10);
  scene.add(backWall);
  
  const backTrim = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 0.15), trimMaterial);
  backTrim.position.set(0, 1, -9.9);
  scene.add(backTrim);

  // Front wall
  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 0.2), wallMaterial);
  frontWall.position.set(0, 2.5, 10);
  scene.add(frontWall);

  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 0.15), trimMaterial);
  frontTrim.position.set(0, 1, 9.9);
  scene.add(frontTrim);

  // Side walls
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5, 20), wallMaterial);
  leftWall.position.set(-10, 2.5, 0);
  scene.add(leftWall);
  
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5, 20), wallMaterial);
  rightWall.position.set(10, 2.5, 0);
  scene.add(rightWall);
}

function createLightFixture() {
  const group = new THREE.Group();
  
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 0.1, 16),
    new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 })
  );
  group.add(housing);
  
  const light = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff4e6 })
  );
  light.rotation.x = Math.PI / 2;
  light.position.y = -0.05;
  group.add(light);
  
  return group;
}