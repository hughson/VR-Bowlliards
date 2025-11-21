import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment } from './environment.js';
import { PoolTable } from './poolTable.js';
import { PhysicsWorld } from './physics.js';
import { CueController } from './cueController.js';
import { BowlliardsRulesEngine } from './scoring.js';
import { Scoreboard, LeaderboardDisplay } from './scoreboard.js';
import { BallInHand } from './ballInHand.js';
import { Leaderboard } from './leaderboard.js';
import { DesktopControls } from './desktopControls.js';
import { SettingsPanel } from './settingsPanel.js';
import { SoundManager } from './soundManager.js';
import { CelebrationSystem } from './celebrationSystem.js';
import { NetworkManager } from './networkManager.js';

class VRBowlliardsGame {
  constructor() {
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.setupLighting();
    this.setupPhysics();
    this.setupLocomotion();
    this.setupVR();
    this.setupDesktopControls();
    
    this.clock = new THREE.Clock();
    this.leftHanded = false;
    this.isVR = false;
    
    // Multiplayer Turn Management
    this.isMultiplayer = false;
    this.isMyTurn = true;  // Start with your turn
    this.myPlayerNumber = 1; // 1 or 2
    this.myPlayerName = "Player";
    this.remotePlayerName = "Opponent";
    this.remoteRulesEngine = null;
    this.isAuthority = true;
    
    // Logical controller references
    this.leftHandController = null;
    this.rightHandController = null;

    this.renderer.setAnimationLoop(() => this.animate());
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;

    document.body.appendChild(this.renderer.domElement);
    document.body.appendChild(VRButton.createButton(this.renderer));
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101010);
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 1.6, 3.0);
  }

  setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);

    const spotLights = [
      { x: -2, y: 3, z: 2 },
      { x:  2, y: 3, z: 2 },
      { x: -2, y: 3, z: -2 },
      { x:  2, y: 3, z: -2 }
    ];

    spotLights.forEach(pos => {
      const spot = new THREE.SpotLight(0xffffff, 0.6);
      spot.position.set(pos.x, pos.y, pos.z);
      spot.angle = Math.PI / 6;
      spot.penumbra = 0.3;
      spot.decay = 2;
      spot.distance = 15;
      spot.castShadow = true;
      this.scene.add(spot);
      const target = new THREE.Object3D();
      target.position.set(0, 0.8, 0);
      this.scene.add(target);
      spot.target = target;
      this.scene.add(spot.target);
    });
  }

  setupPhysics() {
    this.physics = new PhysicsWorld();
  }

  setupLocomotion() {
    this.locomotion = {
      dolly: new THREE.Group(),
      speed: 1.8,
      heightMin: 1.2,
      heightMax: 1.9,
      heightAdjustSpeed: 0.6,
      smoothTurnSpeed: 1.8
    };

    this.locomotion.dolly.position.set(0, 1.6, 3.0);
    this.locomotion.dolly.add(this.camera);
    this.scene.add(this.locomotion.dolly);
  }

  setupDesktopControls() {
    this.desktopControls = new DesktopControls(this.camera, this.renderer, this);
    this.desktopControls.setEnabled(true);
  }

  setupVR() {
    const controllerModelFactory = new XRControllerModelFactory();
    this.controller1 = this.renderer.xr.getController(0);
    this.controller2 = this.renderer.xr.getController(1);
    
    this.controller1.userData.index = 0;
    this.controller2.userData.index = 1;
    
    this.scene.add(this.controller1);
    this.scene.add(this.controller2);
    
    this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
    this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
    
    this.controllerGrip1.add(
      controllerModelFactory.createControllerModel(this.controllerGrip1)
    );
    this.controllerGrip2.add(
      controllerModelFactory.createControllerModel(this.controllerGrip2)
    );
    
    this.scene.add(this.controllerGrip1);
    this.scene.add(this.controllerGrip2);

    this.leftHandController = this.controller1;
    this.rightHandController = this.controller2;

    const onSessionStart = () => {
      console.log('[VR] Session started');
      this.isVR = true;
      this.desktopControls.setEnabled(false);
      if (!this.gameInitialized) {
        this.initGame();
        this.gameInitialized = true;
      }
      if (this.networkManager) {
        this.networkManager.handleVRStart();
      }
    };

    const onSessionEnd = () => {
      console.log('[VR] Session ended');
      this.isVR = false;
      this.desktopControls.setEnabled(true);
    };

    this.renderer.xr.addEventListener('sessionstart', onSessionStart);
    this.renderer.xr.addEventListener('sessionend', onSessionEnd);

    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    ]);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    
    const onSelectStart = (controller) => {
      const strokeController = this.getStrokeController();
      if (controller !== strokeController) {
         this.onLockStrokeStart();
      } else {
         if (this.settingsPanel) {
            this.settingsPanel.onSelectStart(controller);
         }
      }
    };

    const onSelectEnd = (controller) => {
      const strokeController = this.getStrokeController();
      if (controller !== strokeController) {
         this.onLockStrokeEnd();
      }
    };
    
    this.controller1.addEventListener('selectstart', () => onSelectStart(this.controller1));
    this.controller1.addEventListener('selectend', () => onSelectEnd(this.controller1));
    
    this.controller2.addEventListener('selectstart', () => onSelectStart(this.controller2));
    this.controller2.addEventListener('selectend', () => onSelectEnd(this.controller2));

    this.controller1.addEventListener('squeezestart', () => this.onBallInHandStart(0));
    this.controller1.addEventListener('squeezeend', () => this.onBallInHandEnd(0));
    
    this.controller2.addEventListener('squeezestart', () => this.onBallInHandStart(1));
    this.controller2.addEventListener('squeezeend', () => this.onBallInHandEnd(1));
  }

  getStrokeController() {
    if (this.leftHanded) return this.leftHandController;
    return this.rightHandController;
  }

  async initGame() {
    createEnvironment(this.scene);

    this.soundManager = new SoundManager(this.camera);

    this.poolTable = new PoolTable(this.scene, this.physics, this.soundManager);
    this.celebrationSystem = new CelebrationSystem(this.scene, this.camera, this.poolTable);
    
    // Get player name
    this.myPlayerName = localStorage.getItem('bowlliards_playerName') || "Player";
    if (!this.myPlayerName || this.myPlayerName.trim() === "") {
      this.myPlayerName = "Player";
    }
    
    // --- Network Manager Init ---
    this.networkManager = new NetworkManager(this);

    // Multiplayer / lobby config (host vs join) BEFORE we actually join the room.
    if (window.ROOM_CODE) {
        console.log('[INIT] Found Room Code from Lobby:', window.ROOM_CODE, 'IS_HOST:', window.IS_HOST);

        // Locally mark this client as multiplayer
        this.isMultiplayer = true;

        // Decide provisional player number based on which button was clicked in the lobby.
        // If IS_HOST is false -> this is the JOINED player (Player 2).
        // Otherwise (true or undefined) -> treat as HOST (Player 1).
        if (window.IS_HOST === false) {
            this.myPlayerNumber = 2;
            this.isMyTurn = false;
            console.log('[INIT] Provisional role: JOINED player (Player 2). isMyTurn =', this.isMyTurn);
        } else {
            this.myPlayerNumber = 1;
            this.isMyTurn = true;
            console.log('[INIT] Provisional role: HOST (Player 1). isMyTurn =', this.isMyTurn);
        }

        // Ensure we have a remote rules engine ready for the opponent's scores.
        if (!this.remoteRulesEngine) {
            this.remoteRulesEngine = new BowlliardsRulesEngine();
            console.log('[INIT] Created remoteRulesEngine for multiplayer.');
        }

        // Actually join the room on the server
        this.networkManager.joinRoom(window.ROOM_CODE);
    }

    this.cueController = new CueController(
      this.scene,
      null, 
      null,
      () => this.leftHanded,
      () => this.isVR,
      this.poolTable,
      this 
    );
    this.rulesEngine = new BowlliardsRulesEngine();
    
    this.scoreboard = new Scoreboard(this.scene); 
    this.leaderboardDisplay = new LeaderboardDisplay(this.scene); 

    // If multiplayer was flagged before the scoreboard existed, switch to multi layout now.
    if (this.isMultiplayer && this.scoreboard.mode !== 'multi') {
      console.log('[INIT] Switching scoreboard to MULTI mode. myPlayerNumber =', this.myPlayerNumber, 'isMyTurn =', this.isMyTurn);
      this.scoreboard.setupBoard('multi');
    }
    
    this.ballInHand = new BallInHand(this.scene, this.poolTable, () => this.isVR);
    
    this.leaderboard = new Leaderboard();
    await this.leaderboard.init(); 
    
    this.settingsPanel = new SettingsPanel(this.scene, {
      poolTable: this.poolTable,
      controller1: this.controller1,
      controller2: this.controller2,
      getIsVR: () => this.isVR,
      game: this
    });

    this.currentInning = 1;
    this.frameJustStarted = true;
    this.ballsSettled = true;
    this.breakShotTaken = false;
    this.gameState = 'ready'; 

    this.scoreboard.drawEmptyScore(); 
    this.leaderboardDisplay.update(this.leaderboard);

    this.setupNewFrame(true);
    this.ballInHand.enable(true);
  }

  setupNewFrame(isBreakShot = false) {
    this.poolTable.setupBalls();
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.ballsSettled = false;

    if (!isBreakShot) {
      setTimeout(() => {
        this.ballsSettled = true;
        this.gameState = 'ready';
        this.updateScoreboard();
      }, 800);
    } else {
      this.ballsSettled = true;
      this.updateScoreboard();
    }
  }

  _getGamepadsByHand(session) {
    let left = null, right = null;

    const sources = session?.inputSources || [];
    for (const src of sources) {
      if (!src?.gamepad) continue;
      if (src.handedness === 'left') left = src.gamepad;
      else if (src.handedness === 'right') right = src.gamepad;
    }

    if (!left) left = sources[0]?.gamepad || null;
    if (!right) right = sources[1]?.gamepad || null;

    return { left, right };
  }

  updateLocomotion(delta) {
    if (!this.isVR || !this.renderer.xr.isPresenting) {
      if (this.desktopControls) this.desktopControls.update(delta);
      return;
    }

    const session = this.renderer.xr.getSession();
    if (!session) return;

    const { left: leftGamepad, right: rightGamepad } = this._getGamepadsByHand(session);
    const deadZone = 0.2; 

    if (leftGamepad && leftGamepad.axes && leftGamepad.axes.length >= 4) {
      const x = -(leftGamepad.axes[2] ?? 0);
      const y = leftGamepad.axes[3] ?? 0;

      if (Math.abs(x) > deadZone || Math.abs(y) > deadZone) {
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();

        const moveVector = new THREE.Vector3();
        moveVector.addScaledVector(cameraRight, x * this.locomotion.speed * delta);
        moveVector.addScaledVector(cameraDirection, -y * this.locomotion.speed * delta);

        this.locomotion.dolly.position.add(moveVector);
      }
    }

    if (rightGamepad && rightGamepad.axes && rightGamepad.axes.length >= 4) {
      const turnX = -(rightGamepad.axes[2] ?? 0);
      const heightY = rightGamepad.axes[3] ?? 0;

      const heightButtonPressed =
        rightGamepad.buttons &&
        rightGamepad.buttons[3] &&
        rightGamepad.buttons[3].pressed;

      if (heightButtonPressed) {
        if (Math.abs(heightY) > deadZone) {
          let newY =
            this.locomotion.dolly.position.y +
            (-heightY) * this.locomotion.heightAdjustSpeed * delta;
          newY = Math.min(this.locomotion.heightMax, Math.max(this.locomotion.heightMin, newY));
          this.locomotion.dolly.position.y = newY;
        }
      } else {
        if (Math.abs(turnX) > deadZone) {
          const turnAmount = turnX * this.locomotion.smoothTurnSpeed * delta;
          this.locomotion.dolly.rotateY(turnAmount);
        }
      }
    }
  }

  onBallInHandStart(controllerIndex) {
    if (!this.isVR) return;
    
    const canGrab = this.gameState === 'ballInHand' || this.ballInHand.enabled;
    if (!canGrab) return;

    const controller = controllerIndex === 0 ? this.controller1 : this.controller2;
    if (this.ballInHand.grab(controller)) {
        this.gameState = 'ballInHand';
        if (this.cueController) this.cueController.updateDesktop(false); 
    }
  }

  onBallInHandEnd(controllerIndex) {
    if (!this.isVR || this.gameState !== 'ballInHand') return;

    const controller = controllerIndex === 0 ? this.controller1 : this.controller2;
    const placed = this.ballInHand.release(controller);
    if (placed) {
      this.gameState = 'ready';
      this.showNotification('Ball placed. Ready to shoot!', 1500);
      this.cueController.update(true);
    }
  }

  onLockStrokeStart() {
    if (!this.isVR || this.gameState === 'ballInHand' || !this.ballsSettled) return;
    this.cueController.lockStrokeDirection();
  }

  onLockStrokeEnd() {
    if (!this.isVR || this.gameState === 'ballInHand') return;
    this.cueController.unlockStrokeDirection();
  }
  
  setLeftHandedMode(isLeftHanded) {
    this.leftHanded = isLeftHanded;
    console.log('Left-handed mode:', isLeftHanded ? 'ON' : 'OFF');
  }

  onShoot() {}
  onSelectStart() {}
  onSelectEnd() {}
  onSqueezeStart() {}
  onSqueezeEnd() {}

  checkBallsSettled() {
    if (this.gameState !== 'shooting') return;

    const allSettled = this.poolTable.balls.every(ball => {
      if (ball.position.y < 0 || ball.userData.isPocketed) return true;
      const body = ball.userData.physicsBody;
      return body.velocity.length() < 0.1 && body.angularVelocity.length() < 0.1;
    });

    if (allSettled && !this.ballsSettled) {
      this.ballsSettled = true;
      setTimeout(() => this.processShot(), 400);
    }
  }

  // --- TRIGGER SHOT (with Turn Check) ---
  takeShot(direction, power, spin = { english: 0, vertical: 0 }) {
    // STRICT TURN CHECK
    if (this.isMultiplayer && !this.isMyTurn) {
        console.log('[TURN CHECK] BLOCKED - Not your turn!');
        this.showNotification("Not your turn! Wait for opponent to finish.", 2500);
        return;
    }

    console.log('[SHOT] Taking shot - Player:', this.myPlayerName, 'Frame:', this.rulesEngine.currentFrame + 1);
    
    this.ballInHand.disable(); 
    
    // I am now the authority for this shot
    this.isAuthority = true;
    
    // Send shot to opponent
    if (this.networkManager && this.isMultiplayer) {
        this.networkManager.sendShot(direction, power, spin);
    }

    const wasBreak = this.rulesEngine.isBreakShot();
    this.poolTable.shootCueBall(direction, power, spin);
    this.gameState = 'shooting';
    this.ballsSettled = false;

    if (wasBreak) {
      this.breakShotTaken = true;
      this.frameJustStarted = false;
    }
  }
  
  // --- RECEIVE REMOTE SHOT ---
  executeRemoteShot(direction, power, spin) {
    console.log('[REMOTE SHOT] Receiving opponent shot');
    this.ballInHand.disable();
    
    // Opponent is authority, I'm watching
    this.isAuthority = false;
    
    const wasBreak = this.rulesEngine.isBreakShot();
    this.poolTable.shootCueBall(direction, power, spin);
    this.gameState = 'shooting';
    this.ballsSettled = false;
    if (wasBreak) {
      this.breakShotTaken = true;
      this.frameJustStarted = false;
    }
  }

  async processShot() {
    const pocketedBalls = this.poolTable.getPocketedBalls();
    const cueBallPocketed = this.poolTable.isCueBallPocketed();

    const result = this.rulesEngine.processShot(pocketedBalls, cueBallPocketed);
    
    if (this.isMultiplayer) {
        console.log('[PROCESS SHOT] Multiplayer result:', result);
    }

    if (result.strike || result.spare) {
      this.celebrationSystem.showCelebration(result.strike ? 'STRIKE' : 'SPARE', this.rulesEngine.currentFrame);
    }

    if (cueBallPocketed) {
      this.showNotification('FOUL! Cue ball scratched.', 2000);
      this.poolTable.resetCueBall();
      this.gameState = 'ballInHand';
      this.ballInHand.enable(true);
    } else {
      this.gameState = 'ready';
      this.ballInHand.enable(true);
    }

    if (this.scoreboard) {
      this.updateScoreboard();
    }

    this.poolTable.clearPocketedBalls();

    this.checkFrameOrGameComplete();
  }

  checkFrameOrGameComplete() {
    // Multiplayer frame completion branch
    if (this.isMultiplayer && this.rulesEngine.isFrameComplete()) {
        console.log('[FRAME] Local frame complete for player', this.myPlayerNumber);

        // My frame is complete
        this.isMyTurn = false;
        
        // Send my scores to opponent
        if (this.networkManager) {
            this.networkManager.sendFrameComplete(this.rulesEngine.exportScores());
        }
        
        const frameNum = this.rulesEngine.currentFrame + 1;
        this.showNotification(`Frame ${frameNum} Complete! Opponent's turn...`, 3000);
        
        // Don't advance my frame yet - wait for opponent
        this.updateScoreboard();
        this.gameState = 'waiting';
        return;
    }
    
    // SINGLE PLAYER: Continue as normal
    if (this.rulesEngine.isGameComplete()) {
      const finalScore = this.rulesEngine.getTotalScore();
      this.gameState = 'gameOver';
      this.showNotification(`Game Over! Score: ${finalScore}. Press RESET button to play again.`, 10000);
      
      let playerName = localStorage.getItem('bowlliards_playerName');
      if (!playerName || playerName.trim() === "") {
        playerName = "Player";
      }

      await this.leaderboard.addScore(finalScore, playerName);
      
      this.updateScoreboard();
      this.leaderboardDisplay.update(this.leaderboard);

    } else if (this.rulesEngine.isFrameComplete()) {
      this.rulesEngine.nextFrame();
      this.setupNewFrame(true);
      this.gameState = 'ready';
      this.ballInHand.enable(true); 
      
      this.showNotification(
        'Frame ' + (this.rulesEngine.currentFrame + 1) + ' Ready',
        2000
      );
    }
  }
  
  // Called when opponent finishes their frame
  onOpponentFrameComplete() {
      console.log('[OPPONENT] Frame complete, my turn now');
      
      // Now it's my turn
      this.isMyTurn = true;
      
      // Advance my frame
      if (!this.rulesEngine.isGameComplete()) {
          this.rulesEngine.nextFrame();
          this.setupNewFrame(true);
          this.gameState = 'ready';
          this.ballInHand.enable(true);
          
          this.showNotification(
              'Your Frame ' + (this.rulesEngine.currentFrame + 1) + ' Ready',
              2000
          );
      }

      this.updateScoreboard();
  }

  checkGameComplete() {
      if (!this.isMultiplayer) return;
      
      const myComplete = this.rulesEngine.isGameComplete();
      const oppComplete = this.remoteRulesEngine && this.remoteRulesEngine.isGameComplete();
      
      if (myComplete && oppComplete) {
          const myScore = this.rulesEngine.getTotalScore();
          const oppScore = this.remoteRulesEngine.getTotalScore();
          
          if (myScore > oppScore) {
              this.showNotification(`YOU WIN! ${myScore} vs ${oppScore}`, 5000);
          } else if (oppScore > myScore) {
              this.showNotification(`YOU LOSE! ${myScore} vs ${oppScore}`, 5000);
          } else {
              this.showNotification(`TIE GAME! ${myScore} vs ${oppScore}`, 5000);
          }
          
          this.gameState = 'gameOver';
      }
  }

  updateScoreboard() {
    if (!this.scoreboard) return;

    const isMulti = this.isMultiplayer && this.remoteRulesEngine;
    
    if (isMulti) {
      this.scoreboard.update(
        this.rulesEngine,
        this.remoteRulesEngine,
        this.myPlayerName,
        this.remotePlayerName,
        this.isMyTurn
      );
    } else {
      this.scoreboard.update(
        this.rulesEngine,
        null,
        this.myPlayerName,
        null,
        true
      );
    }
  }

  showNotification(message, duration = 2000) {
    if (!this.scoreboard) return;
    this.scoreboard.showNotification(message, duration);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    const delta = this.clock.getDelta();
    this.physics.step(delta);
    this.poolTable.updateFromPhysics();
    this.checkBallsSettled();
    this.updateLocomotion(delta);

    if (this.networkManager && this.isMultiplayer) {
        this.networkManager.sendAvatarUpdate();

        if (this.isAuthority && !this.ballsSettled && this.gameState === 'shooting') {
             const state = this.poolTable.exportState();
             this.networkManager.sendTableState(state);
        }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new VRBowlliardsGame();
  window.game.initGame(); 
});