import * as THREE from 'three';

export class SettingsPanel {
  constructor(scene, gameProxies) {
    this.scene = scene;
    this.canvasCache = {}; 
    
    this.poolTable = gameProxies.poolTable;
    this.controller1 = gameProxies.controller1; 
    this.controller2 = gameProxies.controller2;   
    this.getIsVR = gameProxies.getIsVR;
    this.game = gameProxies.game; 
    
    this.clickableObjects = [];
    this.bowlingStyleActive = false;
    this.leftHandedMode = false; 
    
    this.loadSettings();
    this.createWorkstation();
    this.applyLoadedSettings();
  }

  createWorkstation() {
    const group = new THREE.Group();
    
    const boxHeight = 0.5;
    const boxGeo = new THREE.BoxGeometry(0.5, boxHeight, 0.5);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const baseBox = new THREE.Mesh(boxGeo, boxMat);
    baseBox.position.y = boxHeight / 2;
    group.add(baseBox);

    this.createEasterEggButton(baseBox, boxHeight);

    const boardHeight = 1.4; 
    const boardWidth = 0.8;
    const boardGeometry = new THREE.PlaneGeometry(boardWidth, boardHeight);
    const boardMaterial = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.position.y = (boardHeight / 2) + boxHeight; 
    group.add(board);
    
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0), new THREE.MeshStandardMaterial({color:0x808080}));
    post.position.y = 0.5 + boxHeight; 
    group.add(post);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 32), new THREE.MeshStandardMaterial({color:0x808080}));
    base.position.y = 0.01 + boxHeight; 
    group.add(base);

    const titleTexture = this.createCanvasTexture('PLAYER SETTINGS', 512, 64, 32, '#00ff88');
    const titlePlane = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth * 0.8, (boardWidth * 0.8) * (64/512)), new THREE.MeshBasicMaterial({ map: titleTexture, transparent: true }));
    titlePlane.position.set(0, boardHeight + 0.05, 0.01);
    board.add(titlePlane);

    const startY = (boardHeight / 2) - 0.2;
    const zOffset = 0.01;

    this.addSettingRow(board, 'Left-Handed Mode', startY, zOffset, 'leftHanded');
    this.addSettingRow(board, 'Bowling Theme', startY - 0.15, zOffset, 'bowling');
    this.addColorSettingRow(board, 'Table Color', startY - 0.30, zOffset);
    this.addNewGameRow(board, startY - 0.50, zOffset);

    group.position.set(3, 0, -3); 
    group.rotation.y = -Math.PI / 4;
    this.scene.add(group);
  }

  createEasterEggButton(parentMesh, boxHeight) {
    const buttonGroup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), new THREE.MeshStandardMaterial({ color: 0x555555 }));
    buttonGroup.add(base);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 }));
    btn.position.y = -0.015; 
    btn.userData = { setting: 'easterEgg' }; 
    buttonGroup.add(btn);
    parentMesh.add(buttonGroup);
    buttonGroup.position.set(0, 0, -0.26);
    buttonGroup.rotation.set(Math.PI / 2, 0, 0);
    if (this.poolTable) this.poolTable.easterEggButton = btn;
    this.clickableObjects.push(btn);
  }

  createCanvasTexture(text, w, h, s, c) {
    const cvs = document.createElement('canvas'); cvs.width=w; cvs.height=h;
    const x = cvs.getContext('2d'); x.fillStyle=c; x.font=`bold ${s}px Arial`; x.textAlign='center'; x.textBaseline='middle'; x.fillText(text, w/2, h/2);
    return new THREE.CanvasTexture(cvs);
  }
  
  addSettingRow(parent, label, y, z, settingName) {
    const g = new THREE.Group(); g.position.set(0, y, z);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5*(64/512)), new THREE.MeshBasicMaterial({map:this.createCanvasTexture(label,512,64,24,'#FFFFFF'), transparent:true}));
    txt.position.x = -0.15; g.add(txt);
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.02), new THREE.MeshStandardMaterial({color:0x555555}));
    btn.position.x = 0.2; btn.userData.setting = settingName; this.clickableObjects.push(btn); g.add(btn);
    
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.015, 16), new THREE.MeshBasicMaterial({ color: 0x330000 }));
    light.position.x = 0.28; g.add(light);
    if (settingName === 'bowling') this.bowlingLight = light;
    if (settingName === 'leftHanded') this.leftHandedLight = light;
    
    parent.add(g);
  }
  
  addColorSettingRow(parent, label, y, z) {
    const g = new THREE.Group(); g.position.set(0, y, z);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5*(64/512)), new THREE.MeshBasicMaterial({map:this.createCanvasTexture(label,512,64,24,'#FFFFFF'), transparent:true}));
    txt.position.x = -0.15; g.add(txt);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.02), new THREE.MeshStandardMaterial({color:0xaa0000})); r.position.x=0.15; r.userData.color=0xaa0000; g.add(r); this.clickableObjects.push(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.02), new THREE.MeshStandardMaterial({color:0x40a4c4})); b.position.x=0.22; b.userData.color=0x40a4c4; g.add(b); this.clickableObjects.push(b);
    const bg = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.02), new THREE.MeshStandardMaterial({color:0xD2B48C})); bg.position.x=0.29; bg.userData.color=0xD2B48C; g.add(bg); this.clickableObjects.push(bg);
    
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.01, 16), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    light.position.set(0.22, 0.035, 0.01); g.add(light);
    this.colorLight = light;
    parent.add(g);
  }
  
  addNewGameRow(parent, y, z) {
    const g = new THREE.Group(); g.position.set(0, y, z);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35*(64/512)), new THREE.MeshBasicMaterial({map:this.createCanvasTexture('New Game',512,64,24,'#FFAA00'), transparent:true}));
    txt.position.x = -0.15; g.add(txt);
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.05,0.025), new THREE.MeshStandardMaterial({color:0xff4400, emissive:0x442200, emissiveIntensity:0.3}));
    btn.position.x = 0.21; btn.userData.setting = 'newGame'; this.clickableObjects.push(btn); g.add(btn);
    
    const icon = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    icon.position.set(0.12, 0, 0.01); g.add(icon);
    parent.add(g);
  }

  onSelectStart(source) {
    let raycaster; 
    if (source.isObject3D) { 
      raycaster = new THREE.Raycaster(); 
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(source.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    } else { raycaster = source; }
    const intersects = raycaster.intersectObjects(this.clickableObjects);
    if (intersects.length > 0) { this.handleButtonClick(intersects[0].object); return true; }
    return false; 
  }
  
  handleButtonClick(button) {
    const userData = button.userData;
    if (userData.setting === 'bowling') {
      this.bowlingStyleActive = !this.bowlingStyleActive;
      if (this.bowlingStyleActive) this.bowlingLight.material.color.set(0x00ff00); else this.bowlingLight.material.color.set(0x330000);
      this.poolTable.setBallStyle(this.bowlingStyleActive ? 'bowling' : 'default');
      this.saveSettings();
    } else if (userData.setting === 'leftHanded') {
      this.leftHandedMode = !this.leftHandedMode;
      if (this.leftHandedMode) this.leftHandedLight.material.color.set(0x00ff00); else this.leftHandedLight.material.color.set(0x330000);
      this.game.setLeftHandedMode(this.leftHandedMode);
      this.saveSettings();
    } else if (userData.setting === 'newGame') {
      this.game.startNewGame();
    } else if (userData.setting === 'easterEgg') {
      this.poolTable.toggleEasterEgg();
    } else if (userData.color) {
      this.poolTable.setFeltColor(userData.color);
      this.colorLight.position.x = button.position.x;
      this.saveSettings();
    }
  }
  
  checkPhysicalTouch(controller) {
    if (!controller) return;
    const touchPoint = new THREE.Vector3(0, 0, -0.05).applyMatrix4(controller.matrixWorld);
    for (const button of this.clickableObjects) {
      if (touchPoint.distanceTo(button.getWorldPosition(new THREE.Vector3())) < 0.04) {
        if (controller.userData.lastTouchedButton !== button) {
          this.handleButtonClick(button); controller.userData.lastTouchedButton = button;
        }
        return;
      }
    }
    controller.userData.lastTouchedButton = null;
  }

  update() {
    if (this.getIsVR()) {
      this.checkPhysicalTouch(this.controller1);
      this.checkPhysicalTouch(this.controller2);
    }
  }
  
  saveSettings() {
    const settings = { leftHandedMode: this.leftHandedMode, bowlingStyleActive: this.bowlingStyleActive, tableColor: this.colorLight ? this.colorLight.position.x : 0.22 };
    localStorage.setItem('bowlliards_settings', JSON.stringify(settings));
  }
  
  loadSettings() {
    const saved = localStorage.getItem('bowlliards_settings');
    if (saved) {
      try { const settings = JSON.parse(saved); this.leftHandedMode = settings.leftHandedMode || false; this.bowlingStyleActive = settings.bowlingStyleActive || false; this.savedTableColorX = settings.tableColor || 0.22; } 
      catch (e) { console.error('Failed to load settings:', e); }
    }
  }
  
  applyLoadedSettings() {
    if (this.leftHandedMode && this.leftHandedLight) { this.leftHandedLight.material.color.set(0x00ff00); if (this.game) this.game.setLeftHandedMode(true); }
    if (this.bowlingStyleActive && this.bowlingLight) { this.bowlingLight.material.color.set(0x00ff00); this.poolTable.setBallStyle('bowling'); }
    if (this.colorLight && this.savedTableColorX) { this.colorLight.position.x = this.savedTableColorX; let c = 0x40a4c4; if (Math.abs(this.savedTableColorX - 0.15) < 0.01) c = 0xaa0000; else if (Math.abs(this.savedTableColorX - 0.29) < 0.01) c = 0xD2B48C; this.poolTable.setFeltColor(c); }
  }
}