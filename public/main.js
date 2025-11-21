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
    this.isMyTurn = true;  // Start with your turn (Player 1 always goes first)
    this.myPlayerNumber = 1; // 1 or 2, assigned when joining room
    this.remoteRulesEngine = null; // Track opponent's score
    this.isAuthority = true; // Used for physics sync
    
    // Logical controller references
    this.leftHandController = null;
    this.rightHandController = null;

    this.renderer.setAnimationLoop(() => this.animate());
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

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);
    const vrButton = VRButton.createButton(this.renderer);
    document.body.appendChild(vrButton);

    this.renderer.xr.setReferenceSpaceType('local-floor');

    window.addEventListener('resize', () => {
      if (!this.renderer.xr.isPresenting) {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    });

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
      this.scene.add(this.camera);
      this.camera.position.set(0, 1.6, 2);
      this.camera.rotation.set(0, 0, 0);
      if (this.desktopControls) this.desktopControls.setVREnabled(false);
    });
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    this.scene.fog = new THREE.Fog(0x1a1a1a, 10, 30);
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

    const tableSpot = new THREE.SpotLight(0xffffff, 3.0, 10, Math.PI / 4, 0.3, 1);
    tableSpot.position.set(0, 4, 0);
    tableSpot.target.position.set(0, 0, 0);
    tableSpot.castShadow = false;

    this.scene.add(tableSpot);
    this.scene.add(tableSpot.target);

    const spotPositions = [
      [-2, 0], [2, 0], [0, -3], [0, 3],
      [-2, -3], [2, -3], [-2, 3], [2, 3]
    ];

    const fillLightIntensity = 1.0;

    spotPositions.forEach(([x, z]) => {
      const spot = new THREE.SpotLight(0xfff4e6, fillLightIntensity, 15, Math.PI / 6, 0.5, 1);
      spot.position.set(x, 4.5, z);
      spot.target.position.set(x, 0, z);
      spot.castShadow = false;

      this.scene.add(spot);
      this.scene.add(spot.target);
    });
  }

  setupPhysics() {
    this.physics = new PhysicsWorld();
  }

  setupDesktopControls() {
    this.desktopControls = new DesktopControls(this.camera, this.renderer, this);
    this.desktopControls.setEnabled(true);
  }

  setupVR() {
    const controllerModelFactory = new XRControllerModelFactory();

    this.controller1 = this.renderer.xr.getController(0);
    this.controller2 = this.renderer.xr.getController(1);

    const handleConnection = (controller) => {
      controller.addEventListener('connected', (event) => {
        if (event.data.handedness === 'left') {
          this.leftHandController = controller;
        } 
        if (event.data.handedness === 'right') {
          this.rightHandController = controller;
        }
        const grip = this.renderer.xr.getControllerGrip(controller === this.controller1 ? 0 : 1);
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
    
    // --- Network Manager Init ---
    this.networkManager = new NetworkManager(this);
    
    // Check if user set a room code in the HTML lobby
    if (window.ROOM_CODE) {
        console.log("Found Room Code from Lobby:", window.ROOM_CODE);
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
    // TURN CHECK - Block if not your turn in multiplayer
    if (this.isMultiplayer && !this.isMyTurn) {
        this.showNotification("Wait for opponent to finish their frame!", 2000);
        return;
    }

    this.ballInHand.disable(); 
    
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
    
    // Set authority for physics sync
    this.isAuthority = true;
  }
  
  // --- RECEIVE REMOTE SHOT ---
  executeRemoteShot(direction, power, spin) {
    this.ballInHand.disable();
    
    // Watching opponent
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
        this.showNotification('STRIKE!', 2500);
        await this.advanceFrame();
        this.updateScoreboard();
        this.poolTable.resetShotTracking();
        return;
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
      this.showNotification('Scratch! Ball in kitchen.', 2000);
      
      if (pocketedBalls.length > 0) this.poolTable.spotBalls(pocketedBalls);

      const foulResult = this.rulesEngine.processFoul();
      this.updateScoreboard();

      if (foulResult.inningComplete && foulResult.isTenthFrame) {
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
        const foulResult = this.rulesEngine.processFoul();
        this.updateScoreboard();
        
        if (foulResult.inningComplete) {
             if (foulResult.isTenthFrame) this.showNotification('Game Over!', 2000);
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

    if (result.isTenthFrame) {
      if (result.isBonus) this.showNotification(`Bonus Roll: ${ballsScored} ball(s)`, 1500);
      else if (result.isStrike) {
        this.celebrationSystem.celebrateStrike();
        this.showNotification('STRIKE!', 2500);
      }
      else if (result.isSpare) {
        this.celebrationSystem.celebrateSpare();
        this.showNotification('SPARE!', 2500);
      }
      else this.showNotification(`${ballsScored} ball(s) pocketed`, 1500);

      if (!result.inningComplete) {
        this.showNotification('Set up for bonus shot!', 2000);
        this.setupNewFrame();
        this.gameState = 'ready';
      } else {
        this.showNotification('Game Over!', 2000);
        await this.advanceFrame();
      }
    } else {
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
          this.showNotification(`First inning: ${result.scored} down. Second inning!`, 2000);
          this.gameState = 'ready';
        } else {
          this.showNotification(`Open frame: ${result.totalScored} total`, 2000);
          await this.advanceFrame();
        }
      } else {
        this.showNotification(`${ballsScored} ball(s) pocketed`, 1500);
        this.gameState = 'ready';
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
    if (this.rulesEngine.isGameComplete()) {
      const finalScore = this.rulesEngine.getTotalScore();
      
      // MULTIPLAYER: Pass turn to opponent
      if (this.isMultiplayer) {
          this.isMyTurn = false;
          this.showNotification(`Your Frame Complete! Score: ${finalScore}. Waiting for opponent...`, 5000);
          
          // Send frame complete to network
          if (this.networkManager) {
              this.networkManager.sendFrameComplete(this.rulesEngine.exportScores());
          }
          
          this.updateScoreboard();
          return; // Don't end game until both players finish
      }
      
      // SINGLE PLAYER: Game Over
      this.gameState = 'gameOver';
      this.showNotification(`Game Over! Score: ${finalScore}. Press RESET button to play again.`, 10000);
      
      let playerName = localStorage.getItem('bowlliards_playerName');
      if (!playerName || playerName.trim() === "") {
        playerName = "Player";
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

  async startNewGame() {
    console.log('Starting new game...');
    
    const wasGameInProgress = this.gameState !== 'ballInHand' || this.rulesEngine.currentFrame > 0;
    
    if (wasGameInProgress && this.gameState !== 'gameOver') {
      console.log('Game reset mid-play - score not saved (game incomplete)');
      this.showNotification('Game reset. Previous score not saved.', 2000);
    }
    
    this.rulesEngine = new BowlliardsRulesEngine();
    this.setupNewFrame(true);
    this.gameState = 'ready';
    this.ballInHand.enable(true);
    
    this.currentInning = 1;
    
    this.scoreboard.drawEmptyScore();
    this.leaderboardDisplay.update(this.leaderboard);
    
    if (!wasGameInProgress || this.gameState === 'gameOver') {
      this.showNotification('New game! Ready to Break.', 2000);
    }
  }

  resetGame() {
    this.startNewGame();
  }

  // --- HELPER: Update Scoreboard (Single or Multi) ---
  updateScoreboard() {
      if (this.isMultiplayer && this.scoreboard.mode === 'multi') {
          this.scoreboard.update(
              this.rulesEngine,
              this.remoteRulesEngine,
              "YOU",
              "OPPONENT",
              this.isMyTurn
          );
      } else {
          this.scoreboard.updateScore(this.rulesEngine);
      }
  }

  showNotification(message, duration) {
    let notification = document.getElementById('notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'notification';
      notification.style.position = 'absolute';
      notification.style.top = '50%';
      notification.style.left = '50%';
      notification.style.transform = 'translate(-50%, -50%)';
      notification.style.padding = '20px 40px';
      notification.style.background = 'rgba(0, 0, 0, 0.8)';
      notification.style.color = 'white';
      notification.style.fontSize = '24px';
      notification.style.borderRadius = '10px';
      notification.style.zIndex = '1000';
      notification.style.pointerEvents = 'none';
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.style.display = 'block';

    setTimeout(() => {
      notification.style.display = 'none';
    }, duration);
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
        
        if (this.isAuthority && !this.ballsSettled) {
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
