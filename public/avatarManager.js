import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * AvatarManager - Handles Avaturn avatar loading and VR tracking
 * 
 * Features:
 * - Loads Avaturn GLB avatars
 * - Simple IK for VR headset and controller tracking
 * - Name labels above avatars
 * - Multiplayer avatar synchronization
 */
export class AvatarManager {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    
    // Local player avatar
    this.localAvatar = null;
    this.localAvatarModel = null;
    this.localAvatarBones = {
      head: null,
      leftHand: null,
      rightHand: null,
      spine: null,
      hips: null
    };
    
    // Remote player avatar
    this.remoteAvatar = null;
    this.remoteAvatarModel = null;
    this.remoteAvatarBones = {
      head: null,
      leftHand: null,
      rightHand: null,
      spine: null,
      hips: null
    };    
    // Use simple avatars for now (no API hassle!)
    this.useSimpleAvatars = true;
    
    // Default Avaturn avatar URL - Your personal avatar (requires fresh signed URLs)
    this.defaultAvatarUrl = null; // Disabled due to URL expiration
    
    // Name labels
    this.localNameLabel = null;
    this.remoteNameLabel = null;
  }

  /**
   * Initialize local player avatar
   * @param {string} avatarUrl - URL to Avaturn GLB file (or username for self-hosted)
   * @param {string} playerName - Player's display name
   */
  async loadLocalAvatar(avatarUrl = null, playerName = 'Player') {
    // Check if avatarUrl is just a username (no /)
    if (avatarUrl && !avatarUrl.includes('/') && !avatarUrl.includes('.')) {
      avatarUrl = `/avatars/${avatarUrl}.glb`;
    }
    
    const url = avatarUrl || this.defaultAvatarUrl;
    
    if (!url || this.useSimpleAvatars) {
      // Use simple geometric avatar
      this.createSimpleLocalAvatar();
      this.localNameLabel = this.createNameLabel(playerName, true);
      this.scene.add(this.localNameLabel);
      return;
    }

    try {
      const gltf = await this.loadGLB(url);
      this.localAvatarModel = gltf.scene;
      this.localAvatarModel.scale.set(1, 1, 1);      
      // Find bones for IK
      this.localAvatarBones = this.findBones(this.localAvatarModel);
      
      // Add to scene but hide initially (will position on first update)
      this.localAvatarModel.visible = false;
      this.scene.add(this.localAvatarModel);
      
      // Create name label
      this.localNameLabel = this.createNameLabel(playerName, true);
      this.scene.add(this.localNameLabel);
      
      console.log('[AVATAR] Local avatar loaded successfully');
    } catch (error) {
      console.error('[AVATAR] Failed to load local avatar, using simple avatar:', error);
      this.createSimpleLocalAvatar();
      this.localNameLabel = this.createNameLabel(playerName, true);
      this.scene.add(this.localNameLabel);
    }
  }

  /**
   * Initialize remote player avatar
   * @param {string} avatarUrl - URL to Avaturn GLB file (or username for self-hosted)
   * @param {string} playerName - Player's display name
   */
  async loadRemoteAvatar(avatarUrl = null, playerName = 'Opponent') {
    // Check if avatarUrl is just a username (no /)
    if (avatarUrl && !avatarUrl.includes('/') && !avatarUrl.includes('.')) {
      avatarUrl = `/avatars/${avatarUrl}.glb`;
    }
    
    const url = avatarUrl || this.defaultAvatarUrl;
    
    if (!url || this.useSimpleAvatars) {
      // Use simple geometric avatar
      this.createSimpleRemoteAvatar();
      this.remoteNameLabel = this.createNameLabel(playerName, false);
      this.scene.add(this.remoteNameLabel);
      return;
    }

    try {
      const gltf = await this.loadGLB(url);
      this.remoteAvatarModel = gltf.scene;
      this.remoteAvatarModel.scale.set(1, 1, 1);
      
      // Find bones for IK
      this.remoteAvatarBones = this.findBones(this.remoteAvatarModel);
      
      // Add to scene but hide initially
      this.remoteAvatarModel.visible = false;
      this.scene.add(this.remoteAvatarModel);
      
      // Create name label
      this.remoteNameLabel = this.createNameLabel(playerName, false);
      this.scene.add(this.remoteNameLabel);
      
      console.log('[AVATAR] Remote avatar loaded successfully');
    } catch (error) {
      console.error('[AVATAR] Failed to load remote avatar, using simple avatar:', error);
      this.createSimpleRemoteAvatar();
      this.remoteNameLabel = this.createNameLabel(playerName, false);
      this.scene.add(this.remoteNameLabel);
    }
  }

  /**
   * Load GLB file
   */
  loadGLB(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf),
        (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`[AVATAR] Loading: ${percent.toFixed(0)}%`);
        },
        (error) => reject(error)
      );
    });
  }

  /**
   * Find important bones in the avatar for IK
   */
  findBones(model) {
    const bones = {
      head: null,
      leftHand: null,
      rightHand: null,
      spine: null,
      hips: null
    };

    model.traverse((child) => {
      if (child.isBone || child.type === 'Bone') {
        const name = child.name.toLowerCase();
        
        // Head bone
        if (name.includes('head') && !bones.head) {
          bones.head = child;
        }
        // Left hand
        else if ((name.includes('lefthand') || name.includes('left_hand') || 
                  name.includes('hand_l') || name.includes('handl')) && !bones.leftHand) {
          bones.leftHand = child;
        }
        // Right hand
        else if ((name.includes('righthand') || name.includes('right_hand') || 
                  name.includes('hand_r') || name.includes('handr')) && !bones.rightHand) {
          bones.rightHand = child;
        }
        // Spine
        else if ((name.includes('spine') || name.includes('chest')) && !bones.spine) {
          bones.spine = child;
        }
        // Hips/Root
        else if ((name.includes('hip') || name.includes('pelvis') || name === 'root') && !bones.hips) {
          bones.hips = child;
        }
      }
    });

    console.log('[AVATAR] Found bones:', {
      head: !!bones.head,
      leftHand: !!bones.leftHand,
      rightHand: !!bones.rightHand,
      spine: !!bones.spine,
      hips: !!bones.hips
    });

    return bones;
  }

  /**
   * Update local avatar position based on VR tracking
   */
  updateLocalAvatar(camera, leftController, rightController, isMultiplayer, gameStarted) {
    if (!this.localAvatarModel && !this.simpleLocalAvatar) return;

    const headPos = new THREE.Vector3();
    const headQuat = new THREE.Quaternion();
    camera.getWorldPosition(headPos);
    camera.getWorldQuaternion(headQuat);

    if (this.localAvatarModel) {
      // Position avatar at floor level under camera
      this.localAvatarModel.visible = true;
      this.localAvatarModel.position.set(headPos.x, 0, headPos.z);
      
      // Rotate avatar to face forward
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(headQuat);
      forward.y = 0;
      forward.normalize();
      const angle = Math.atan2(forward.x, forward.z);
      this.localAvatarModel.rotation.y = angle;
    } else if (this.simpleLocalAvatar) {
      // Update simple avatar
      this.updateSimpleAvatar(this.simpleLocalAvatar, headPos, headQuat, leftController, rightController);
    }

    // Update name label (only in multiplayer)
    if (this.localNameLabel) {
      this.localNameLabel.position.copy(headPos);
      this.localNameLabel.position.y += 0.3;
      this.localNameLabel.visible = isMultiplayer && gameStarted;
    }
  }

  /**
   * Update remote avatar position from network data
   */
  updateRemoteAvatar(data) {
    if (!this.remoteAvatarModel && !this.simpleRemoteAvatar) return;

    const headPos = new THREE.Vector3(data.head.x, data.head.y, data.head.z);
    const headQuat = new THREE.Quaternion(data.head.qx, data.head.qy, data.head.qz, data.head.qw);

    if (this.remoteAvatarModel) {
      // Position avatar at floor level
      this.remoteAvatarModel.visible = true;
      this.remoteAvatarModel.position.set(headPos.x, 0, headPos.z);
      
      // Rotate avatar
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(headQuat);
      forward.y = 0;
      forward.normalize();
      const angle = Math.atan2(forward.x, forward.z);
      this.remoteAvatarModel.rotation.y = angle;
    } else if (this.simpleRemoteAvatar) {
      // Update simple avatar
      const hand1 = data.hand1 ? { position: new THREE.Vector3(data.hand1.x, data.hand1.y, data.hand1.z) } : null;
      const hand2 = data.hand2 ? { position: new THREE.Vector3(data.hand2.x, data.hand2.y, data.hand2.z) } : null;
      this.updateSimpleAvatar(this.simpleRemoteAvatar, headPos, headQuat, hand1, hand2);
    }

    // Update name label
    if (this.remoteNameLabel) {
      this.remoteNameLabel.position.copy(headPos);
      this.remoteNameLabel.position.y += 0.3;
      this.remoteNameLabel.visible = true;
    }
  }

  /**
   * Create simple geometric avatar (fallback)
   */
  createSimpleLocalAvatar() {
    const group = new THREE.Group();
    
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.4
    });

    // Head
    const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const head = new THREE.Mesh(headGeo, material);
    group.add(head);
    group.userData.head = head;

    // Hands
    const handGeo = new THREE.BoxGeometry(0.05, 0.08, 0.12);
    const hand1 = new THREE.Mesh(handGeo, material);
    const hand2 = new THREE.Mesh(handGeo, material);
    group.add(hand1);
    group.add(hand2);
    group.userData.hand1 = hand1;
    group.userData.hand2 = hand2;

    group.visible = false;
    this.scene.add(group);
    this.simpleLocalAvatar = group;
  }

  createSimpleRemoteAvatar() {
    const group = new THREE.Group();
    
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.4
    });

    // Head
    const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const head = new THREE.Mesh(headGeo, material);
    group.add(head);
    group.userData.head = head;

    // Hands
    const handGeo = new THREE.BoxGeometry(0.05, 0.08, 0.12);
    const hand1 = new THREE.Mesh(handGeo, material);
    const hand2 = new THREE.Mesh(handGeo, material);
    group.add(hand1);
    group.add(hand2);
    group.userData.hand1 = hand1;
    group.userData.hand2 = hand2;

    group.visible = false;
    this.scene.add(group);
    this.simpleRemoteAvatar = group;
  }

  updateSimpleAvatar(avatar, headPos, headQuat, hand1, hand2) {
    if (!avatar) return;
    
    avatar.visible = true;
    
    if (avatar.userData.head) {
      avatar.userData.head.position.copy(headPos);
      avatar.userData.head.quaternion.copy(headQuat);
    }

    if (hand1 && avatar.userData.hand1) {
      avatar.userData.hand1.visible = true;
      const pos = hand1.position || hand1.getWorldPosition(new THREE.Vector3());
      avatar.userData.hand1.position.copy(pos);
      if (hand1.quaternion) avatar.userData.hand1.quaternion.copy(hand1.quaternion);
    } else if (avatar.userData.hand1) {
      avatar.userData.hand1.visible = false;
    }

    if (hand2 && avatar.userData.hand2) {
      avatar.userData.hand2.visible = true;
      const pos = hand2.position || hand2.getWorldPosition(new THREE.Vector3());
      avatar.userData.hand2.position.copy(pos);
      if (hand2.quaternion) avatar.userData.hand2.quaternion.copy(hand2.quaternion);
    } else if (avatar.userData.hand2) {
      avatar.userData.hand2.visible = false;
    }
  }

  /**
   * Create name label sprite
   */
  createNameLabel(text, isLocal = false) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.font = 'bold 64px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    const glowColor = isLocal ? '#00ff00' : '#00ffff';
    const textColor = isLocal ? '#00ff00' : '#00ffff';
    
    context.shadowColor = glowColor;
    context.shadowBlur = 10;
    context.fillStyle = '#ffffff';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    context.shadowBlur = 0;
    context.fillStyle = textColor;
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.5, 0.125, 1);
    sprite.visible = false;

    return sprite;
  }

  /**
   * Hide local avatar (for single player or when not needed)
   */
  hideLocalAvatar() {
    if (this.localAvatarModel) this.localAvatarModel.visible = false;
    if (this.simpleLocalAvatar) this.simpleLocalAvatar.visible = false;
    if (this.localNameLabel) this.localNameLabel.visible = false;
  }

  /**
   * Hide remote avatar
   */
  hideRemoteAvatar() {
    if (this.remoteAvatarModel) this.remoteAvatarModel.visible = false;
    if (this.simpleRemoteAvatar) this.simpleRemoteAvatar.visible = false;
    if (this.remoteNameLabel) this.remoteNameLabel.visible = false;
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this.localAvatarModel) this.scene.remove(this.localAvatarModel);
    if (this.remoteAvatarModel) this.scene.remove(this.remoteAvatarModel);
    if (this.simpleLocalAvatar) this.scene.remove(this.simpleLocalAvatar);
    if (this.simpleRemoteAvatar) this.scene.remove(this.simpleRemoteAvatar);
    if (this.localNameLabel) this.scene.remove(this.localNameLabel);
    if (this.remoteNameLabel) this.scene.remove(this.remoteNameLabel);
  }
}
