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
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

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

    this.ballsSettled = true;
    this.breakShotTaken = false;
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.gameState = 'ready';

    this.setupCamera();
    this.setupLighting();
    this.setupRenderer();
    this.setupPhysics();
    this.setupLocomotion();
    this.setupDesktopControls();
    this.setupVR();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 1.6, 2);
  }

  setupLighting() {
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    this.scene.add(ambient);

    const spotLight = new THREE.SpotLight(0xffffff, 1.2);
    spotLight.position.set(0, 3, 0);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.3;
    spotLight.decay = 2;
    spotLight.distance = 10;
    spotLight.castShadow = true;
    this.scene.add(spotLight);

    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.75, 0);
    this.scene.add(spotTarget);
    spotLight.target = spotTarget;
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;

    document.body.appendChild(this.renderer.domElement);
    document.body.appendChild(VRButton.createButton(this.renderer));
  }

  setupPhysics() {
    this.physics = new PhysicsWorld();
  }

  setupLocomotion() {
    this.locomotion = {
      speed: 2.0,
      smoothTurnSpeed: 1.5,
      heightAdjustSpeed: 1.6,
      heightMin: -2.0,
      heightMax: 2.2,
      dolly: new THREE.Group()
    };
    this.locomotion.dolly.add(this.camera);
    this.scene.add(this.locomotion.dolly);
  }

  setupDesktopControls() {
    this.desktopControls = new DesktopControls(this.camera, this.renderer, this);
    this.desktopControls.setEnabled(true);
  }

  setupVR() {
    this.renderer.xr.enabled = true;

    const controllerModelFactory = new XRControllerModelFactory();
    this.controller1 = this.renderer.xr.getController(0);
    this.controller2 = this.renderer.xr.getController(1);

    this.controller1.userData.index = 0;
    this.controller2.userData.index = 1;

    this.scene.add(this.controller1);
    this.scene.add(this.controller2);

    const grip1 = this.renderer.xr.getControllerGrip(0);
    const grip2 = this.renderer.xr.getControllerGrip(1);

    grip1.add(controllerModelFactory.createControllerModel(grip1));
    grip2.add(controllerModelFactory.createControllerModel(grip2));

    this.locomotion.dolly.add(grip1);
    this.locomotion.dolly.add(grip2);

    this.leftHandController = this.controller1;
    this.rightHandController = this.controller2;

    const handleConnection = (controller) => {
      controller.addEventListener('connected', (event) => {
        if (event.data.handedness === 'left') {
          this.leftHandController = controller;
        }
        if (event.data.handedness === 'right') {
          this.rightHandController = controller;
        }
        const grip = this.renderer.xr.getControllerGrip(
          controller === this.controller1 ? 0 : 1
        );
        grip.add(controllerModelFactory.createControllerModel(grip));
        this.locomotion.dolly.add(grip);
      });
    };

    handleConnection(this.controller1);
    handleConnection(this.controller2);

    this.locomotion.dolly.add(this.controller1);
    this.locomotion.dolly.add(this.controller2);

    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -0.1)
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

    this.renderer.xr.addEventListener('sessionstart', () => {
      this.isVR = true;
      this.locomotion.dolly.position.set(-1.2, 0, 0);
      this.locomotion.dolly.rotation.set(0, -Math.PI / 2, 0);
      if (this.desktopControls) this.desktopControls.setVREnabled(true);

      if (this.networkManager) {
        this.networkManager.handleVRStart();
      }
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      this.isVR = false;
      this.locomotion.dolly.position.set(0, 0, 0);
      this.locomotion.dolly.rotation.set(0, 0, 0);
      if (this.desktopControls) this.desktopControls.setVREnabled(false);
    });
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

    // Multiplayer / lobby config (host vs join) BEFORE other game objects use turn state
    if (window.ROOM_CODE) {
        console.log("[INIT] Found Room Code from Lobby:", window.ROOM_CODE, "IS_HOST:", window.IS_HOST);

        // Mark this client as multiplayer
        this.isMultiplayer = true;

        // Decide provisional player number based on how we entered the lobby
        if (window.IS_HOST === false) {
            // Joined player
            this.myPlayerNumber = 2;
            this.isMyTurn = false;
            console.log("[INIT] Provisional role: JOINED player (Player 2). isMyTurn =", this.isMyTurn);
        } else {
            // Host player (or default)
            this.myPlayerNumber = 1;
            this.isMyTurn = true;
            console.log("[INIT] Provisional role: HOST (Player 1). isMyTurn =", this.isMyTurn);
        }

        // Ensure we have a remote rules engine to track opponent scores
        if (!this.remoteRulesEngine) {
            this.remoteRulesEngine = new BowlliardsRulesEngine();
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
    
    // If we already know we are in multiplayer, switch the board now
    if (this.isMultiplayer) {
        this.scoreboard.setupBoard('multi');
        this.updateScoreboard();
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

    this.ballsSettled = true;
    this.currentInning = 1;
    this.frameJustStarted = true;

    this.scoreboard.drawEmptyScore(); 
    this.leaderboardDisplay.update(this.leaderboard);

    this.setupNewFrame(true);
    this.gameState = 'ready';
    this.ballInHand.enable(true);

    this.renderer.setAnimationLoop(() => this.animate());
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
    let left = null,
      right = null;

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
        moveVector.addScaledVector(
          cameraDirection,
          -y * this.locomotion.speed * delta
        );

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

      const deadZone = 0.2;

      if (heightButtonPressed) {
        if (Math.abs(heightY) > deadZone) {
          let newY =
            this.locomotion.dolly.position.y +
            -heightY * this.locomotion.heightAdjustSpeed * delta;
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

    const allSettled = this.poolTable.balls.every((ball) => {
      if (ball.position.y < -0.5 || ball.userData.isPocketed) return true;
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
      this.showNotification('Not your turn! Wait for opponent to finish.', 2500);
      return;
    }

    console.log(
      '[SHOT] Taking shot - Player:',
      this.myPlayerName,
      'Frame:',
      this.rulesEngine.currentFrame + 1
    );

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
    const cueBallHitObject = this.poolTable.cueBallHitObject;

    if (this.breakShotTaken && !this.rulesEngine.breakProcessed) {
      this.rulesEngine.processBreak();
      this.breakShotTaken = false;

      const scratch = cueBallPocketed;
      const nonScratchFoul = !cueBallHitObject;
      const ballsScored = pocketedBalls.length;

      const result = this.rulesEngine.processShot(ballsScored, true);

      if (result.isStrike) {
        this.celebrationSystem.celebrateStrike();
        this.showNotification('STRIKE on break!', 2500);
      } else if (result.isSpare) {
        this.celebrationSystem.celebrateSpare();
        this.showNotification('SPARE on break!', 2500);
      }

      if (scratch) {
        this.showNotification('Scratch on break! Ball in kitchen.', 2500);
        this.poolTable.showCueBall();
        this.gameState = 'ballInHand';
        this.ballInHand.enable(true); 
        if (this.desktopControls) this.desktopControls.orbitControls.enabled = false;
        
        this.updateScoreboard();
        this.poolTable.resetShotTracking();
        return; 
      } 
      
      if (ballsScored > 0) {
         this.showNotification(`Break! ${ballsScored} ball(s) pocketed`, 2000);
      } else if (nonScratchFoul) {
         this.showNotification('Foul on break! Play from where it lies.', 2500);
      }
      
      this.gameState = 'ready';
      this.updateScoreboard();
      this.poolTable.resetShotTracking();
      return;
    }

    if (cueBallPocketed) {
      // Scratch after break
      const foulResult = this.rulesEngine.processFoulAfterBreak();
      if (foulResult.gameOver) {
         this.showNotification('Foul, game over!', 2000);
         await this.advanceFrame();
         this.poolTable.resetShotTracking();
         return;
      }
      
      if (foulResult.inningComplete && !foulResult.isTenthFrame) {
         this.showNotification('Foul - Frame ended', 2000);
         await this.advanceFrame();
         this.poolTable.resetShotTracking();
         return;
      }

      this.poolTable.showCueBall();
      this.gameState = 'ballInHand';
      const isSecondInningNow = (this.rulesEngine.currentInning === 2);
      this.ballInHand.enable(isSecondInningNow); 

      if (!this.isVR && this.desktopControls) {
         this.ballInHand.grab(null);
         this.desktopControls.orbitControls.enabled = false;
         this.showNotification('Scratch! Move mouse to place ball.', 2000);
      }

      this.poolTable.resetShotTracking();
      return; 
    }
    
    if (!cueBallHitObject) {
        this.showNotification('Foul! Play from where it lies.', 2000);
        const foulResult = this.rulesEngine.processNoHitFoul();
        
        if (foulResult.gameOver) {
             this.showNotification('Foul, game over!', 2000);
             await this.advanceFrame();
        } else if (foulResult.inningComplete && !foulResult.isTenthFrame) {
             if (foulResult.isStrike) this.showNotification('Strike!', 2000);
             else this.showNotification('Open frame', 2000);
             await this.advanceFrame();
        } else {
             this.showNotification('Foul. Second inning!', 2000);
             this.gameState = 'ready';
        }
        
        this.poolTable.resetShotTracking();
        return;
    }

    const ballsScored = pocketedBalls.length;
    const result = this.rulesEngine.processShot(ballsScored, false);

    if (result.isStrike) {
      this.celebrationSystem.celebrateStrike();
      this.showNotification('STRIKE!', 2500);
      await this.advanceFrame();
    } else if (result.isSpare) {
      this.celebrationSystem.celebrateSpare();
      this.showNotification('SPARE!', 2500);
      await this.advanceFrame();
    } else if (result.inningComplete) {
      if (result.inning === 1) {
        this.showNotification(
          `First inning: ${result.scored} down. Second inning!`,
          2000
        );
        this.gameState = 'ready';
      } else {
        this.showNotification(`Open frame: ${result.totalScored} total`, 2000);
        await this.advanceFrame();
      }
    } else {
      if (ballsScored > 0) {
        this.showNotification(`${ballsScored} ball(s) pocketed`, 1500);
      }
    }

    this.poolTable.resetShotTracking();
    this.updateScoreboard();

    if (this.gameState === 'shooting') {
      setTimeout(() => {
        this.cueController.update(true);
        this.gameState = 'ready';
      }, 200);
    }
  }

  async advanceFrame() {
    // MULTIPLAYER: Switch turns after EACH frame
    if (this.isMultiplayer) {
      // My frame is complete
      this.isMyTurn = false;

      // Send my scores to opponent
      if (this.networkManager) {
        this.networkManager.sendFrameComplete(this.rulesEngine.exportScores());
      }

      const frameNum = this.rulesEngine.currentFrame + 1;
      this.showNotification(
        `Frame ${frameNum} Complete! Opponent's turn...`,
        3000
      );

      // Don't advance my frame yet - wait for opponent
      this.updateScoreboard();
      this.gameState = 'waiting';
      return;
    }

    // SINGLE PLAYER: Continue as normal
    if (this.rulesEngine.isGameComplete()) {
      const finalScore = this.rulesEngine.getTotalScore();
      this.gameState = 'gameOver';
      this.showNotification(
        `Game Over! Score: ${finalScore}. Press RESET button to play again.`,
        10000
      );

      let playerName = localStorage.getItem('bowlliards_playerName');
      if (!playerName || playerName.trim() === '') {
        playerName = 'Player';
      }

      await this.leaderboard.addScore(finalScore, playerName);

      this.updateScoreboard();
      this.leaderboardDisplay.update(this.leaderboard);
    } else {
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

      const frameNum = this.rulesEngine.currentFrame + 1;
      this.showNotification(`Your turn! Frame ${frameNum}`, 2500);
    } else {
      // I'm done with all 10 frames, check winner
      this.checkGameComplete();
    }

    this.updateScoreboard();
  }

  checkGameComplete() {
    if (!this.isMultiplayer) return;

    const myComplete = this.rulesEngine.isGameComplete();
    const oppComplete =
      this.remoteRulesEngine && this.remoteRulesEngine.isGameComplete();

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

  // --- HELPER: Update Scoreboard (Single or Multi) ---
  updateScoreboard() {
    if (this.isMultiplayer && this.scoreboard.mode === 'multi') {
      this.scoreboard.update(
        this.rulesEngine,
        this.remoteRulesEngine,
        this.myPlayerName,
        this.remotePlayerName,
        this.isMyTurn
      );
    } else {
      this.scoreboard.update(this.rulesEngine, null, null, null, null);
    }
  }

  showNotification(message, duration) {
    let notification = document.getElementById('notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'notification';
      notification.style.position = 'absolute';
      notification.style.top = '20px';
      notification.style.left = '50%';
      notification.style.transform = 'translateX(-50%)';
      notification.style.background = 'rgba(0, 0, 0, 0.85)';
      notification.style.color = 'white';
      notification.style.padding = '10px 20px';
      notification.style.borderRadius = '8px';
      notification.style.fontFamily = 'sans-serif';
      notification.style.fontSize = '14px';
      notification.style.zIndex = '999';
      document.body.appendChild(notification);
    }
    notification.textContent = message;
    notification.style.display = 'block';
    clearTimeout(this._notifTimeout);
    this._notifTimeout = setTimeout(() => {
      notification.style.display = 'none';
    }, duration || 2000);
  }

  startNewGame() {
    const wasGameInProgress = this.rulesEngine && !this.rulesEngine.isGameComplete();

    this.rulesEngine = new BowlliardsRulesEngine();
    this.poolTable.resetTable?.();
    this.breakShotTaken = false;
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.ballsSettled = true;
    this.gameState = 'ready';
    this.ballInHand.enable(true);

    this.scoreboard.drawEmptyScore();
    this.leaderboardDisplay.update(this.leaderboard);

    if (!wasGameInProgress || this.gameState === 'gameOver') {
      this.showNotification('New game! Ready to Break.', 2000);
    }
  }

  resetGame() {
    this.startNewGame();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    const delta = this.clock.getDelta();

    this.physics.step(delta);
    
    this.poolTable.update(delta); 
    
    this.cueController.update(this.ballsSettled);
    this.ballInHand.update();
    this.checkBallsSettled();
    this.updateLocomotion(delta);
    
    if (this.celebrationSystem) {
        this.celebrationSystem.update(delta);
    }

    if (this.settingsPanel) {
      this.settingsPanel.update();
    }
    
    // --- SYNC PHYSICS & AVATAR ---
    if (this.networkManager) {
        this.networkManager.sendAvatarUpdate();
        
        // Send physics state when I'm the authority
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