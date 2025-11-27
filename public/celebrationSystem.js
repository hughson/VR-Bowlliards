import * as THREE from 'three';

export class CelebrationSystem {
  constructor(scene, camera, poolTable) {
    this.scene = scene;
    this.camera = camera;
    this.poolTable = poolTable;
    
    this.activeText = [];
    this.activeParticles = [];
  }

  celebrateStrike() {
    // 1. Giant Gold Text
    this.spawnFloatingText("STRIKE!", new THREE.Vector3(0, 1.5, 0), 0xffd700, 2.5); 
    
    // 2. Confetti Rain
    this.spawnConfetti();
  }

  celebrateSpare() {
    // 1. Silver Text only (Clean celebration)
    this.spawnFloatingText("SPARE!", new THREE.Vector3(0, 1.5, 0), 0xc0c0c0, 2.0); 
  }

  celebrateWin() {
    // Gold text with confetti for winning
    this.spawnFloatingText("YOU WIN!", new THREE.Vector3(0, 1.5, 0), 0xffd700, 2.5);
    this.spawnConfetti();
  }

  celebrateLoss() {
    // Red/dark text for losing (no confetti)
    this.spawnFloatingText("YOU LOST", new THREE.Vector3(0, 1.5, 0), 0xff4444, 2.0);
  }

  celebrateGameOver(score) {
    // Blue text showing final score
    this.spawnFloatingText("GAME OVER", new THREE.Vector3(0, 1.7, 0), 0x4488ff, 2.0);
    this.spawnFloatingText(`Score: ${score}`, new THREE.Vector3(0, 1.2, 0), 0xffffff, 1.5);
  }

  celebrateTie() {
    // Silver text for tie (no confetti)
    this.spawnFloatingText("TIE GAME!", new THREE.Vector3(0, 1.5, 0), 0xc0c0c0, 2.0);
  }

  spawnFloatingText(message, position, colorHex, scale = 1.0) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#' + new THREE.Color(colorHex).getHexString();
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, 256, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 1 });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(scale, scale * 0.25, 1);
    
    this.scene.add(sprite);
    this.activeText.push({ mesh: sprite, age: 0, life: 3.0, startY: position.y });
  }

  spawnConfetti() {
    const particleCount = 400;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];
    const colors = [];
    const colorPalette = [
        new THREE.Color(0xff0000), new THREE.Color(0x00ff00), 
        new THREE.Color(0x0000ff), new THREE.Color(0xffff00), 
        new THREE.Color(0xff00ff)
    ];

    for (let i = 0; i < particleCount; i++) {
      // Start High up (Y = 3.0 to 5.0) over the table (X/Z spread)
      positions.push(
          (Math.random() - 0.5) * 3, 
          3.0 + Math.random() * 2.0, 
          (Math.random() - 0.5) * 2
      );
      
      // Fall DOWN strictly (Negative Y velocity)
      velocities.push(
          (Math.random() - 0.5) * 0.5, // X Drift
          -(0.5 + Math.random() * 1.0), // Y Fall Speed (Slower than before)
          (Math.random() - 0.5) * 0.5  // Z Drift
      );
      
      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors.push(color.r, color.g, color.b);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.03, vertexColors: true, transparent: true }));
    this.scene.add(points);
    
    this.activeParticles.push({ mesh: points, velocities: velocities, age: 0, life: 5.0 });
  }

  update(delta) {
    // 1. Update Text
    for (let i = this.activeText.length - 1; i >= 0; i--) {
      const t = this.activeText[i];
      t.age += delta;
      if (t.age >= t.life) {
        this.scene.remove(t.mesh); 
        t.mesh.material.map.dispose();
        t.mesh.material.dispose(); 
        this.activeText.splice(i, 1); 
        continue;
      }
      t.mesh.position.y = t.startY + (t.age * 0.3); // Slower rise
      t.mesh.material.opacity = t.age > t.life * 0.7 ? 1.0 - ((t.age/t.life - 0.7) / 0.3) : 1.0;
    }

    // 2. Update Confetti
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.age += delta;
      if (p.age >= p.life) {
        this.scene.remove(p.mesh); 
        p.mesh.geometry.dispose(); 
        p.mesh.material.dispose(); 
        this.activeParticles.splice(i, 1); 
        continue;
      }
      
      const pos = p.mesh.geometry.attributes.position.array;
      for (let j = 0; j < pos.length; j += 3) {
        // Apply Velocity
        pos[j] += p.velocities[j] * delta;
        pos[j+1] += p.velocities[j+1] * delta;
        pos[j+2] += p.velocities[j+2] * delta;
        
        // Flutter effect (Sine wave on X/Z)
        p.velocities[j] += Math.sin(p.age * 5 + j) * 0.01; 
        p.velocities[j+2] += Math.cos(p.age * 5 + j) * 0.01; 
      }
      p.mesh.geometry.attributes.position.needsUpdate = true;
      p.mesh.material.opacity = p.age > p.life * 0.5 ? 1.0 - ((p.age/p.life - 0.5) / 0.5) : 1.0;
    }
  }
}