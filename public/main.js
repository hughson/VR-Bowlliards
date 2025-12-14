import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment } from './environment.js';
import { PoolTable } from './poolTable.js';
import { PhysicsWorld } from './physics.js';
import { CueController } from './cueController.js';
import { BowlliardsRulesEngine } from './scoring.js';
import { Scoreboard, LeaderboardDisplay, PersonalStatsDisplay, CyclingLeaderboardDisplay } from './scoreboard.js';
import { BallInHand } from './ballInHand.js';
import { Leaderboard } from './leaderboard.js';
import { DesktopControls } from './desktopControls.js';
// import { SettingsPanel } from './settingsPanel.js'; // Disabled - settings now in B button menu
import { SoundManager } from './soundManager.js';
import { CelebrationSystem } from './celebrationSystem.js';
import { NetworkManager } from './networkManager.js';
import { StatsTracker } from './statsTracker.js';
import { PlayerMenu } from './playerMenu.js';
import { VoiceChat } from './voiceChat.js';

class VRBowlliardsGame {
  constructor() {
    console.log('[GAME] Constructor: Starting setupRenderer...');
    this.setupRenderer();
    console.log('[GAME] Constructor: setupRenderer complete');
    
    console.log('[GAME] Constructor: Starting setupScene...');
    this.setupScene();
    console.log('[GAME] Constructor: setupScene complete');
    
    console.log('[GAME] Constructor: Starting setupCamera...');
    this.setupCamera();
    console.log('[GAME] Constructor: setupCamera complete');
    
    console.log('[GAME] Constructor: Starting setupLighting...');
    this.setupLighting();
    console.log('[GAME] Constructor: setupLighting complete');
    
    console.log('[GAME] Constructor: Starting setupPhysics...');
    this.setupPhysics();
    console.log('[GAME] Constructor: setupPhysics complete');
    
    console.log('[GAME] Constructor: Starting setupLocomotion...');
    this.setupLocomotion();
    console.log('[GAME] Constructor: setupLocomotion complete');
    
    console.log('[GAME] Constructor: Starting setupVR...');
    this.setupVR();
    console.log('[GAME] Constructor: setupVR complete');
    
    console.log('[GAME] Constructor: Starting setupDesktopControls...');
    this.setupDesktopControls();
    console.log('[GAME] Constructor: setupDesktopControls complete');
    
    this.clock = new THREE.Clock();
    this.leftHanded = false;
    this.isVR = false;
    
    // Multiplayer Defaults
    this.isMultiplayer = false;
    this.isSpectator = false;  // True when watching as a spectator
    this.isMyTurn = true;  
    this.myPlayerNumber = 1; 
    this.myPlayerName = "Player";
    this.remotePlayerName = "Opponent";
    this.remoteRulesEngine = null;
    this.isAuthority = true;
    this.gameStarted = false;  // True only when both players are connected
    
    // New game request tracking
    this.newGameRequestPending = false;   // True if we've requested new game
    this.opponentWantsNewGame = false;    // True if opponent requested new game
    
    // Track when local player has finished all 10 frames (but opponent may still be playing)
    this.myGameFinished = false;
    
    // Practice while waiting mode
    this.isPracticeWhileWaiting = false;  // True when playing solo while in matchmaking queue
    this.practiceRulesEngine = null;      // Separate rules engine for practice (don't pollute main one)
    
    this.leftHandController = null;
    this.rightHandController = null;
    
    this.ballsSettled = true;
    this.breakShotTaken = false;
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.gameState = 'ready';
    
    window.addEventListener('resize', () => this.onWindowResize());
    console.log('[GAME] Constructor: Complete!');
  }

  setTurnState(isMyTurn) {
    console.log(`[GAME] ===== SET TURN STATE CALLED =====`);
    console.log(`[GAME] Requested turn: ${isMyTurn ? "MY TURN" : "OPPONENT'S TURN"}`);
    console.log(`[GAME] Current state: isMyTurn=${this.isMyTurn}, gameState=${this.gameState}, myGameFinished=${this.myGameFinished}`);
    
    // Don't change turn state if game is over
    if (this.gameState === 'gameOver') {
      console.log(`[GAME] Ignoring turn change - game is over`);
      return;
    }
    
    // CRITICAL FIX: Check the ACTUAL game completion state from rules engine
    const myGameComplete = this.rulesEngine.isGameComplete();
    
    // CRITICAL: If rules engine says game is NOT complete, reset any incorrect flags
    if (!myGameComplete && isMyTurn) {
      // My game is not complete and someone is trying to give me the turn - allow it!
      console.log(`[GAME] Game not complete (frame ${this.rulesEngine.currentFrame + 1}), allowing turn to be set to MY TURN`);
      
      // Reset any incorrect flags
      if (this.myGameFinished) {
        console.log(`[GAME] CRITICAL: Resetting myGameFinished flag (was incorrectly set)`);
        this.myGameFinished = false;
      }
      if (this.gameState === 'spectating') {
        console.log(`[GAME] CRITICAL: Resetting gameState from spectating`);
        this.gameState = 'waiting';
      }
    } else if (myGameComplete && isMyTurn) {
      // My game IS complete - only allow spectating/waiting, not playing
      console.log(`[GAME] Ignoring turn change to MY TURN - my game is complete`);
      return;
    }
    
    // Don't change turn state if we're spectating and trying to take a turn (and game is complete)
    if (this.gameState === 'spectating' && isMyTurn && myGameComplete) {
      console.log(`[GAME] Ignoring turn change - spectating and my game is complete`);
      return;
    }
    
    // Don't change turn state while balls are in motion from our shot
    if (!isMyTurn && this.isMyTurn && this.gameState === 'shooting') {
      console.log(`[GAME] Ignoring turn change - currently shooting, balls in motion`);
      return;
    }
    
    // CRITICAL: Don't switch turn AWAY from player if they're in 10th frame with bonus rolls pending
    if (!isMyTurn && this.isMyTurn && this.rulesEngine.currentFrame === 9) {
      // Check if we have bonus rolls remaining
      if (this.rulesEngine.bonusRolls > 0) {
        console.log(`[GAME] Ignoring turn change - in 10th frame with ${this.rulesEngine.bonusRolls} bonus rolls remaining`);
        return;
      }
      // Check if game is not complete (could be mid-10th frame regular play)
      if (!myGameComplete) {
        console.log(`[GAME] Ignoring turn change - in 10th frame and game not complete`);
        return;
      }
    }
    
    console.log(`[GAME] Setting turn to: ${isMyTurn ? "MY TURN" : "OPPONENT'S TURN"}`);
    console.log(`[GAME] Player Number: ${this.myPlayerNumber}`);
    
    this.isMyTurn = isMyTurn;

    if (this.isMyTurn) {
        this.gameState = 'ready';
        // Enable ball in hand if it's a new rack or specific foul state
        if (this.frameJustStarted || this.gameState === 'ballInHand') {
             this.ballInHand.enable(true);
        }
        this.showNotification("Your Turn!", 2000);
        
        // Play "It is your turn" audio notification in multiplayer (only after game has started)
        if (this.isMultiplayer && this.gameStarted && this.soundManager) {
            this.soundManager.playSound('yourTurn', null, 1.0);
        }
        
        // CRITICAL: Ensure cue controller is updated for shooting
        if (this.cueController) {
          this.cueController.update(true);
        }
        
        console.log(`[GAME] ✓ Controls ENABLED - You can shoot`);
    } else {
        this.gameState = 'waiting';
        this.ballInHand.disable();
        if (this.cueController) this.cueController.updateDesktop(false); 
        this.showNotification("Opponent's Turn", 3000);
        console.log(`[GAME] ✗ Controls LOCKED - Waiting for opponent`);
    }
    this.updateScoreboard();
    console.log(`[GAME] ===== END SET TURN STATE =====`);
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
      this.locomotion.dolly.position.set(-2.0, 0, 0);
      this.locomotion.dolly.rotation.set(0, -Math.PI / 2, 0);
      if (this.desktopControls) this.desktopControls.setVREnabled(true);
      if (this.soundManager) this.soundManager.resumeContext();
      if (this.networkManager) this.networkManager.handleVRStart();
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      this.isVR = false;
      this.locomotion.dolly.position.set(0, 0, 0);
      this.locomotion.dolly.rotation.set(0, 0, 0);
      if (this.desktopControls) this.desktopControls.setVREnabled(false);
    });
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    this.scene.fog = new THREE.Fog(0x1a1a1a, 10, 30);
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
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
    const spotPositions = [[-2, 0], [2, 0], [0, -3], [0, 3], [-2, -3], [2, -3], [-2, 3], [2, 3]];
    spotPositions.forEach(([x, z]) => {
      const spot = new THREE.SpotLight(0xfff4e6, 1.0, 15, Math.PI / 6, 0.5, 1);
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
    const controllerModelFactory = new XRControllerModelFactory();
    this.controller1 = this.renderer.xr.getController(0);
    this.controller2 = this.renderer.xr.getController(1);
    this.controller1.userData.index = 0;
    this.controller2.userData.index = 1;
    
    // FIX: Add controllers to dolly ONLY, not to scene
    // (Adding to both causes parent conflicts)
    this.locomotion.dolly.add(this.controller1);
    this.locomotion.dolly.add(this.controller2);
    
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
        if (event.data.handedness === 'left') this.leftHandController = controller;
        if (event.data.handedness === 'right') this.rightHandController = controller;
      });
    };
    handleConnection(this.controller1);
    handleConnection(this.controller2);

    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.1)]);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    
    // Create laser pointers for menu interaction (initially invisible)
    const laserGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), 
      new THREE.Vector3(0, 0, -3)
    ]);
    const laserMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    this.laser1 = new THREE.Line(laserGeometry.clone(), laserMaterial.clone());
    this.laser2 = new THREE.Line(laserGeometry.clone(), laserMaterial.clone());
    this.laser1.visible = false;
    this.laser2.visible = false;
    this.controller1.add(this.laser1);
    this.controller2.add(this.laser2);
    // Store references for easy access (both shown/hidden together)
    this.rightLaser = this.laser1;
    this.leftLaser = this.laser2;
    
    const onSelectStart = (controller) => {
      // Spectators cannot shoot
      if (this.isSpectator) return;
      
      // Either hand's trigger can lock the cue for shooting
      // First check if we're in a state where we can lock
      if (this.gameState !== 'ballInHand' && this.gameState !== 'gameOver' && this.ballsSettled) {
        this.onLockStrokeStart();
      }
      // Also handle settings panel with stroke controller
      const strokeController = this.getStrokeController();
      if (controller === strokeController && this.settingsPanel) {
        this.settingsPanel.onSelectStart(controller);
      }
    };
    const onSelectEnd = (controller) => {
      // Either trigger release unlocks the cue
      this.onLockStrokeEnd();
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
    
    const unlockAudio = () => {
        if (this.soundManager) this.soundManager.resumeContext();
        document.body.removeEventListener('click', unlockAudio);
        document.body.removeEventListener('keydown', unlockAudio);
    };
    document.body.addEventListener('click', unlockAudio);
    document.body.addEventListener('keydown', unlockAudio);

    this.poolTable = new PoolTable(this.scene, this.physics, this.soundManager);
    this.celebrationSystem = new CelebrationSystem(this.scene, this.camera, this.poolTable);
    
    this.myPlayerName = localStorage.getItem('bowlliards_playerName') || "Player";
    
    this.networkManager = new NetworkManager(this);
    
    // Initialize player menu (VR menu system)
    this.playerMenu = new PlayerMenu(this);
    
    // Auto-open menu for first-time players
    const hasPlayedBefore = localStorage.getItem('bowlliards_hasPlayed');
    if (!hasPlayedBefore && this.playerMenu) {
      // Delay slightly to ensure everything is loaded
      setTimeout(() => {
        this.playerMenu.open();
        console.log('[GAME] First-time player detected - opening settings menu');
      }, 500);
    }
    
    // Initialize voice chat
    this.voiceChat = new VoiceChat(this);
    
    // Connect to server immediately to get player count for lobby
    // (Don't join a room yet - just connect for stats)
    if (!window.ROOM_CODE) {
      this.networkManager.connect();
    }

    if (window.ROOM_CODE) {
        console.log("[INIT] Found Room Code from Lobby:", window.ROOM_CODE);
        console.log("[INIT] Server will assign player number automatically");
        this.isMultiplayer = true;
        // Don't set player number here - wait for server assignment
        this.gameState = 'waiting';
        this.isMyTurn = false; // Default to waiting, server will update
        
        if (!this.remoteRulesEngine) this.remoteRulesEngine = new BowlliardsRulesEngine();
        this.networkManager.joinRoom(window.ROOM_CODE);
    }

    this.cueController = new CueController(
      this.scene, null, null,
      () => this.leftHanded, () => this.isVR,
      this.poolTable, this 
    );
    this.rulesEngine = new BowlliardsRulesEngine();
    console.log('[GAME] Creating Scoreboard...');
    this.scoreboard = new Scoreboard(this.scene); 
    console.log('[GAME] Scoreboard created at position:', this.scoreboard.group.position);
    console.log('[GAME] Scoreboard visible:', this.scoreboard.group.visible);
    console.log('[GAME] Scoreboard in scene:', this.scene.children.includes(this.scoreboard.group));
    
    console.log('[GAME] Creating LeaderboardDisplay...');
    this.leaderboardDisplay = new LeaderboardDisplay(this.scene);
    console.log('[GAME] LeaderboardDisplay created at position:', this.leaderboardDisplay.group.position);
    console.log('[GAME] LeaderboardDisplay visible:', this.leaderboardDisplay.group.visible);
    console.log('[GAME] LeaderboardDisplay in scene:', this.scene.children.includes(this.leaderboardDisplay.group));
    
    // Stats tracking system
    this.statsTracker = new StatsTracker();
    
    // Personal stats display (VR corner board)
    this.personalStatsDisplay = new PersonalStatsDisplay(this.scene);
    
    // Cycling leaderboard (enhanced version)
    this.cyclingLeaderboard = new CyclingLeaderboardDisplay(this.scene, this.statsTracker);
    
    // Try to auto-login player for stats tracking
    try {
      const authResult = await this.statsTracker.autoLogin();
      if (authResult.success) {
        console.log('[GAME] Auto-logged in as:', this.statsTracker.currentPlayer.displayName);
        this.myPlayerName = this.statsTracker.currentPlayer.displayName;
        localStorage.setItem('bowlliards_playerName', this.myPlayerName);
        // Update personal stats display
        const stats = this.statsTracker.getMyStats();
        this.personalStatsDisplay.update(stats, this.myPlayerName);
      }
    } catch (e) {
      console.log('[GAME] No saved login found');
    }
    
    // Load cycling leaderboard
    this.cyclingLeaderboard.loadAndDisplay();
    
    if (this.isMultiplayer) {
        this.scoreboard.setupBoard('multi');
        this.updateScoreboard();
    }
    
    this.ballInHand = new BallInHand(this.scene, this.poolTable, () => this.isVR);
    this.leaderboard = new Leaderboard();
    await this.leaderboard.init(); 
    
    // Settings panel disabled - settings now in B button menu (PlayerMenu)
    // this.settingsPanel = new SettingsPanel(this.scene, {
    //     poolTable: this.poolTable,
    //     controller1: this.controller1,
    //     controller2: this.controller2,
    //     getIsVR: () => this.isVR,
    //     game: this 
    // });
    this.settingsPanel = null;

    this.ballsSettled = true;
    this.currentInning = 1;
    this.frameJustStarted = true;

    this.scoreboard.drawEmptyScore(); 
    this.leaderboardDisplay.update(this.leaderboard);

    this.setupNewFrame(true);
    
    this.renderer.setAnimationLoop(() => this.animate());
  }

  // ============================================
  // PRACTICE WHILE WAITING MODE
  // ============================================
  
  startPracticeWhileWaiting() {
    console.log('[GAME] Starting practice mode while waiting for opponent...');
    
    this.isPracticeWhileWaiting = true;
    this.isMultiplayer = false;  // Temporarily disable multiplayer logic
    this.gameStarted = false;
    
    // Create a separate rules engine for practice (don't pollute main one)
    this.practiceRulesEngine = new BowlliardsRulesEngine();
    
    // Store the real rules engine and swap in practice one
    this._realRulesEngine = this.rulesEngine;
    this.rulesEngine = this.practiceRulesEngine;
    
    // Setup single player scoreboard for practice
    this.scoreboard.setupBoard('single');
    
    // Reset the table and allow playing
    this.poolTable.setupBalls();
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.ballsSettled = true;
    this.breakShotTaken = false;
    this.gameState = 'ready';
    this.isMyTurn = true;
    this.ballInHand.enable(true);
    
    // Update cue controller
    if (this.cueController) {
      this.cueController.update(true);
    }
    
    this.scoreboard.drawEmptyScore();
    this.updateScoreboard();
    
    this.showNotification('Practice while waiting! An opponent will join soon...', 3000);
    console.log('[GAME] Practice mode active');
  }
  
  stopPracticeAndStartMultiplayer() {
    if (!this.isPracticeWhileWaiting) return;
    
    console.log('[GAME] Opponent found! Stopping practice and starting multiplayer...');
    
    // Restore the real rules engine (reset it for fresh multiplayer game)
    if (this._realRulesEngine) {
      this.rulesEngine = this._realRulesEngine;
      this.rulesEngine.reset();  // Fresh start for multiplayer
      this._realRulesEngine = null;
    } else {
      this.rulesEngine = new BowlliardsRulesEngine();
    }
    
    this.practiceRulesEngine = null;
    this.isPracticeWhileWaiting = false;
    this.isMultiplayer = true;
    this.gameStarted = true;
    
    // Setup multiplayer scoreboard
    this.scoreboard.setupBoard('multi');
    
    // Create remote rules engine for opponent
    if (!this.remoteRulesEngine) {
      this.remoteRulesEngine = new BowlliardsRulesEngine();
    } else {
      this.remoteRulesEngine.reset();
    }
    
    // Reset the table for multiplayer
    this.poolTable.setupBalls();
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.ballsSettled = true;
    this.breakShotTaken = false;
    
    // Player 1 goes first
    this.isMyTurn = (this.myPlayerNumber === 1);
    this.gameState = this.isMyTurn ? 'ready' : 'waiting';
    
    if (this.isMyTurn) {
      this.ballInHand.enable(true);
    } else {
      this.ballInHand.disable();
    }
    
    // Update cue controller
    if (this.cueController) {
      this.cueController.update(true);
    }
    
    this.updateScoreboard();
    
    console.log('[GAME] Multiplayer mode active. Player', this.myPlayerNumber, 'ready.');
  }

  setupNewFrame(isBreakShot = false) {
    this.poolTable.setupBalls();
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.ballsSettled = false;

    if (this.isMultiplayer) {
        if (this.isMyTurn) {
            this.gameState = 'ready';
            this.ballInHand.enable(true);
            // --- CRITICAL: Force Sync Racked Table ---
            if (this.networkManager) {
                setTimeout(() => {
                    const state = this.poolTable.exportState();
                    this.networkManager.sendTableState(state);
                }, 200);
            }
        } else {
            this.gameState = 'waiting';
            this.ballInHand.disable();
        }
    } else {
        this.gameState = 'ready';
        this.ballInHand.enable(true);
    }

    if (!isBreakShot) {
      setTimeout(() => {
        this.ballsSettled = true;
        if (this.isMultiplayer && !this.isMyTurn) {
             this.gameState = 'waiting';
        } else {
             this.gameState = 'ready';
        }
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
        const cd = new THREE.Vector3(); this.camera.getWorldDirection(cd); cd.y = 0; cd.normalize();
        const cr = new THREE.Vector3(); cr.crossVectors(new THREE.Vector3(0,1,0), cd).normalize();
        const mv = new THREE.Vector3();
        mv.addScaledVector(cr, x * this.locomotion.speed * delta);
        mv.addScaledVector(cd, -y * this.locomotion.speed * delta);
        this.locomotion.dolly.position.add(mv);
      }
    }
    if (rightGamepad && rightGamepad.axes && rightGamepad.axes.length >= 4) {
      const tx = -(rightGamepad.axes[2] ?? 0);
      const hy = rightGamepad.axes[3] ?? 0;
      
      // Height adjust: Right thumbstick pressed (button 3) OR Y button on left controller (button 5)
      const hBtn = rightGamepad.buttons && rightGamepad.buttons[3] && rightGamepad.buttons[3].pressed;
      const yBtn = leftGamepad && leftGamepad.buttons && leftGamepad.buttons[5] && leftGamepad.buttons[5].pressed;
      const heightAdjustActive = hBtn || yBtn;
      
      if (heightAdjustActive) {
        if (Math.abs(hy) > deadZone) {
          let ny = this.locomotion.dolly.position.y + -hy * this.locomotion.heightAdjustSpeed * delta;
          ny = Math.min(this.locomotion.heightMax, Math.max(this.locomotion.heightMin, ny));
          this.locomotion.dolly.position.y = ny;
        }
      } else {
        if (Math.abs(tx) > deadZone) {
          this.locomotion.dolly.rotateY(tx * this.locomotion.smoothTurnSpeed * delta);
        }
      }
      
      // A button (button 4) to cycle leaderboard forward
      const aBtn = rightGamepad.buttons && rightGamepad.buttons[4] && rightGamepad.buttons[4].pressed;
      if (aBtn && !this._aBtnWasPressed) {
        if (this.cyclingLeaderboard) {
          this.cyclingLeaderboard.cycleNext();
        }
      }
      this._aBtnWasPressed = aBtn;
    }
    
    // X button on left controller (button 4) to cycle leaderboard backward
    if (leftGamepad && leftGamepad.buttons && leftGamepad.buttons[4]) {
      const xBtn = leftGamepad.buttons[4].pressed;
      if (xBtn && !this._xBtnWasPressed) {
        if (this.cyclingLeaderboard) {
          this.cyclingLeaderboard.cyclePrev();
        }
      }
      this._xBtnWasPressed = xBtn;
    }
  }

  onBallInHandStart(controllerIndex) {
    if (!this.isVR) return;
    if (this.isSpectator) return;  // Spectators cannot grab balls
    if (this.isMultiplayer && !this.isMyTurn) return;
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
    if (!this.isVR || this.gameState === 'ballInHand' || this.gameState === 'gameOver' || !this.ballsSettled) return;
    if (this.isMultiplayer && !this.isMyTurn) return; 
    this.cueController.lockStrokeDirection();
  }

  onLockStrokeEnd() {
    if (!this.isVR || this.gameState === 'ballInHand') return;
    this.cueController.unlockStrokeDirection();
  }

  setLeftHandedMode(isLeftHanded) {
    this.leftHanded = isLeftHanded;
  }

  onShoot() {}
  onSelectStart() {}
  onSelectEnd() {}
  onSqueezeStart() {}
  onSqueezeEnd() {}

  checkBallsSettled() {
    // Handle spectating mode - just track when balls settle, no processing
    if (this.gameState === 'spectating') {
      if (!this.ballsSettled) {
        const allSettled = this.poolTable.balls.every((ball) => {
          if (ball.position.y < -0.5 || ball.userData.isPocketed) return true;
          const body = ball.userData.physicsBody;
          return body.velocity.length() < 0.1 && body.angularVelocity.length() < 0.1;
        });
        if (allSettled) {
          this.ballsSettled = true;
          console.log('[GAME] Spectating: balls settled, ready for opponent\'s next shot');
        }
      }
      return;
    }
    
    if (this.gameState !== 'shooting') return;
    
    // CRITICAL: Don't trigger processShot for opponent's shots when our game is complete
    // Check this early to avoid unnecessary processing
    if (this.isMultiplayer && this.rulesEngine && this.rulesEngine.isGameComplete()) {
      // Our game is done - just mark balls as settled without processing
      const allSettled = this.poolTable.balls.every((ball) => {
        if (ball.position.y < -0.5 || ball.userData.isPocketed) return true;
        const body = ball.userData.physicsBody;
        return body.velocity.length() < 0.1 && body.angularVelocity.length() < 0.1;
      });
      if (allSettled && !this.ballsSettled) {
        this.ballsSettled = true;
        // FIXED: If we're spectating opponent (myGameFinished but waiting for opponent),
        // restore 'spectating' state instead of 'gameOver' so we keep watching their shots
        if (this.myGameFinished && this.remoteRulesEngine && !this.remoteRulesEngine.isGameComplete()) {
          this.gameState = 'spectating';  // Opponent still playing - keep spectating
          console.log('[GAME] Balls settled, spectating opponent - ready for their next shot');
        } else {
          this.gameState = 'gameOver';  // Both done or single player - game over
          console.log('[GAME] Balls settled but game is complete - not processing shot');
        }
      }
      return;
    }
    
    const allSettled = this.poolTable.balls.every((ball) => {
      if (ball.position.y < -0.5 || ball.userData.isPocketed) return true;
      const body = ball.userData.physicsBody;
      return body.velocity.length() < 0.1 && body.angularVelocity.length() < 0.1;
    });
    if (allSettled && !this.ballsSettled) {
      // --- FIX: Add slight delay to ensure pockets are registered ---
      this.ballsSettled = true;
      setTimeout(() => this.processShot(), 500);
    }
  }

  takeShot(direction, power, spin = { english: 0, vertical: 0 }) {
    console.log("[GAME] takeShot called:", {
      isMultiplayer: this.isMultiplayer,
      isMyTurn: this.isMyTurn,
      gameState: this.gameState,
      ballsSettled: this.ballsSettled
    });
    
    // Block shots if game is over
    if (this.gameState === 'gameOver') {
      console.log("[GAME] BLOCKED: Game is over");
      this.showNotification('Game Over! Press RESET to play again.', 2500);
      return;
    }
    
    if (this.isMultiplayer && !this.isMyTurn) {
      console.log("[GAME] BLOCKED: Not your turn");
      this.showNotification('Not your turn! Wait for opponent.', 2500);
      return;
    }
    
    console.log("[GAME] Shot ALLOWED - Proceeding");
    this.ballInHand.disable();
    this.isAuthority = true;
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

  executeRemoteShot(direction, power, spin) {
    // If we're spectating (our game finished, waiting for opponent), show their shots visually
    if (this.gameState === 'spectating' || this.myGameFinished) {
      console.log('[GAME] Spectating opponent shot - showing visual only');
      this.poolTable.shootCueBall(direction, power, spin);
      this.isAuthority = false;
      this.ballsSettled = false;  // Track that balls are in motion
      // Ensure state stays as 'spectating' - don't process for scoring
      this.gameState = 'spectating';
      return;
    }
    
    // If game is fully over (both players done), still show visual
    if (this.gameState === 'gameOver') {
      console.log('[GAME] Game over - showing opponent shot visual only');
      this.poolTable.shootCueBall(direction, power, spin);
      this.isAuthority = false;
      return;
    }
    
    this.showNotification('Opponent is shooting...', 1500);
    this.ballInHand.disable();
    this.isAuthority = false;
    // Don't track break for opponent's shots - their scores come via network
    this.poolTable.shootCueBall(direction, power, spin);
    this.gameState = 'shooting';
    this.ballsSettled = false;
    // Note: Don't set breakShotTaken for remote shots - we don't process their scores locally
  }

  async processShot() {
    // Block processing if game is already over
    if (this.gameState === 'gameOver') {
      console.log('[PROCESSSHOT] BLOCKED - Game is already over');
      return;
    }
    
    // Block processing if we're spectating (our game finished, watching opponent)
    if (this.gameState === 'spectating' || this.myGameFinished) {
      console.log('[PROCESSSHOT] BLOCKED - Spectating opponent, our game is finished');
      this.poolTable.resetShotTracking();
      return;
    }
    
    // CRITICAL: Block processing if in 10th frame with no bonus rolls remaining and game should be complete
    if (this.rulesEngine.currentFrame === 9 && 
        this.rulesEngine.bonusRolls === 0 && 
        this.rulesEngine.isGameComplete()) {
      console.log('[PROCESSSHOT] BLOCKED - Game is complete (10th frame, no bonus rolls left)');
      // DON'T set gameState = 'gameOver' here! Let advanceFrame() decide the correct state
      // (It will set 'spectating' in multiplayer if opponent hasn't finished, or 'gameOver' if both done)
      await this.advanceFrame();
      return;
    }
    
    // CRITICAL FIX: In multiplayer, only process shots if it's our turn
    // Otherwise opponent's pocketed balls get added to our score!
    if (this.isMultiplayer && !this.isMyTurn) {
      console.log('[PROCESSSHOT] BLOCKED - Not my turn, skipping local score processing');
      console.log('[PROCESSSHOT] Opponent scores will come via network update');
      this.gameState = 'waiting';
      this.poolTable.resetShotTracking();
      return;
    }
    
    // CRITICAL FIX: Don't process shots if we're not the authority (watching opponent)
    // This prevents double-scoring when opponent's shot is replayed locally
    if (this.isMultiplayer && !this.isAuthority) {
      console.log('[PROCESSSHOT] BLOCKED - Not authority, this is a remote shot replay');
      this.poolTable.resetShotTracking();
      return;
    }
    
    console.log('[PROCESSSHOT] Starting processShot:', {
      isMultiplayer: this.isMultiplayer,
      isMyTurn: this.isMyTurn,
      myPlayerNumber: this.myPlayerNumber,
      currentFrame: this.rulesEngine.currentFrame,
      gameState: this.gameState,
      isAuthority: this.isAuthority
    });
    
    const pocketedBalls = this.poolTable.getPocketedBalls();
    const cueBallPocketed = this.poolTable.isCueBallPocketed();
    const cueBallHitObject = this.poolTable.cueBallHitObject;

    if (this.breakShotTaken && !this.rulesEngine.breakProcessed) {
      console.log('[GAME] Processing BREAK shot - breakShotTaken:', this.breakShotTaken, 'breakProcessed:', this.rulesEngine.breakProcessed);
      this.rulesEngine.processBreak();
      this.breakShotTaken = false;
      const scratch = cueBallPocketed;
      const nonScratchFoul = !cueBallHitObject;
      const ballsScored = pocketedBalls.length;
      
      // CRITICAL: Record break balls for stats tracking (best break, potting average)
      this.rulesEngine.recordBreakBalls(ballsScored);
      console.log(`[STATS] Break balls recorded: ${ballsScored} for frame ${this.rulesEngine.currentFrame + 1}`);
      
      const result = this.rulesEngine.processShot(ballsScored, true);

      // Handle STRIKE on break
      if (result.isStrike) {
        this.celebrationSystem.celebrateStrike();
        this.soundManager.playSound('strikeSpare', null, 1.0);
        
        if (result.isTenthFrame) {
          // 10th frame strike on break - re-rack for bonus rolls
          this.showNotification('STRIKE on break! 2 bonus rolls coming...', 2500);
          this.poolTable.setupBalls();  // Re-rack for bonus
          this.gameState = 'ready';
          this.ballsSettled = true;  // CRITICAL: Allow shooting after re-rack
          this.ballInHand.enable(true);
          this.updateScoreboard();
          this.poolTable.resetShotTracking();
          // CRITICAL: Update cue controller to enable shooting
          if (this.cueController) this.cueController.update(true);
          // In multiplayer, ensure we keep our turn for bonus rolls
          if (this.isMultiplayer) {
            this.isMyTurn = true;
            console.log('[GAME] 10th frame strike on break - keeping turn for bonus rolls');
          }
          return;
        } else {
          // Frames 1-9: Strike on break - advance frame
          this.showNotification('STRIKE on break!', 2500);
          await this.advanceFrame();
          this.poolTable.resetShotTracking();
          return;
        }
      }
      
      // Handle SPARE on break
      if (result.isSpare) {
        this.celebrationSystem.celebrateSpare();
        this.soundManager.playSound('strikeSpare', null, 1.0);
        
        if (result.isTenthFrame) {
          // 10th frame spare on break - re-rack for bonus roll
          this.showNotification('SPARE on break! 1 bonus roll coming...', 2500);
          this.poolTable.setupBalls();  // Re-rack for bonus
          this.gameState = 'ready';
          this.ballsSettled = true;  // CRITICAL: Allow shooting after re-rack
          this.ballInHand.enable(true);
          this.updateScoreboard();
          this.poolTable.resetShotTracking();
          // CRITICAL: Update cue controller to enable shooting
          if (this.cueController) this.cueController.update(true);
          // In multiplayer, ensure we keep our turn for bonus roll
          if (this.isMultiplayer) {
            this.isMyTurn = true;
            console.log('[GAME] 10th frame spare on break - keeping turn for bonus roll');
          }
          return;
        } else {
          // Frames 1-9: Spare on break - advance frame
          this.showNotification('SPARE on break!', 2500);
          await this.advanceFrame();
          this.poolTable.resetShotTracking();
          return;
        }
      }

      // CRITICAL FIX: Check if this is a bonus roll break shot
      if (result.isBonus) {
        // This is a break shot during bonus rolls
        if (ballsScored > 0) {
          this.showNotification(`Bonus break! ${ballsScored} ball(s) pocketed. Keep shooting!`, 2000);
        } else {
          this.showNotification('Bonus break - missed. Keep trying!', 2000);
        }
        this.gameState = 'ready';
        this.updateScoreboard();
        this.poolTable.resetShotTracking();
        // In multiplayer, ensure we keep our turn for remaining bonus shots
        if (this.isMultiplayer) {
          this.isMyTurn = true;
        }
        return;
      }

      if (scratch) {
        console.log('[GAME] Scratch on break! Balls pocketed:', ballsScored, 'Frame:', this.rulesEngine.currentFrame + 1);
        console.log('[GAME] Current inning1 score after processShot:', this.rulesEngine.frames[this.rulesEngine.currentFrame].inning1.scored);
        console.log('[GAME] processShot result:', JSON.stringify(result));
        this.showNotification('Scratch on break! Ball in hand.', 2500);
        this.poolTable.showCueBall();
        this.gameState = 'ballInHand';
        this.ballInHand.enable(true); 
        if (this.desktopControls) this.desktopControls.orbitControls.enabled = false;
        this.updateScoreboard();
        this.poolTable.resetShotTracking();
        console.log('[GAME] Scratch on break handled - returning early (NOT advancing frame)');
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
      const ballsPocketedOnFoul = pocketedBalls.length;
      console.log(`[FOUL] Scratch! Balls pocketed on foul: ${ballsPocketedOnFoul}`);
      const foulResult = this.rulesEngine.processFoulAfterBreak(ballsPocketedOnFoul);
      console.log('[FOUL] processFoulAfterBreak result:', JSON.stringify(foulResult));
      
      // Handle scratch during bonus rolls (10th frame)
      if (foulResult.isBonus) {
        if (foulResult.gameOver) {
          this.showNotification('Bonus rolls complete!', 2000);
          await this.advanceFrame();
          this.poolTable.resetShotTracking();
          return;
        } else {
          // More bonus rolls - re-rack and ball in hand
          this.showNotification('Scratch! Ball in hand.', 2500);
          this.poolTable.setupBalls();
          this.poolTable.showCueBall();
          this.gameState = 'ballInHand';
          this.ballInHand.enable(true);
          this.updateScoreboard();
          this.poolTable.resetShotTracking();
          // In multiplayer, ensure we keep our turn for remaining bonus rolls
          if (this.isMultiplayer) {
            this.isMyTurn = true;
          }
          return;
        }
      }
      
      // Check for STRIKE on scratch (pocketed all 10 balls but also scratched)
      if (foulResult.isStrike) {
        this.celebrationSystem.celebrateStrike();
        this.soundManager.playSound('strikeSpare', null, 1.0);
        if (foulResult.isTenthFrame) {
          this.showNotification('STRIKE! 2 bonus rolls coming...', 2500);
          this.poolTable.setupBalls();  // Re-rack for bonus
          this.poolTable.showCueBall();
          this.gameState = 'ballInHand';
          this.ballInHand.enable(true);
          this.updateScoreboard();
          this.poolTable.resetShotTracking();
          // In multiplayer, ensure we keep our turn for bonus rolls
          if (this.isMultiplayer) {
            this.isMyTurn = true;
            console.log('[GAME] 10th frame strike on scratch - keeping turn for bonus rolls');
          }
          return;
        } else {
          this.showNotification('STRIKE!', 2500);
          await this.advanceFrame();
          this.poolTable.resetShotTracking();
          return;
        }
      }
      
      // Check for SPARE on scratch
      if (foulResult.isSpare) {
        this.celebrationSystem.celebrateSpare();
        this.soundManager.playSound('strikeSpare', null, 1.0);
        if (foulResult.isTenthFrame) {
          this.showNotification('SPARE! 1 bonus roll coming...', 2500);
          this.poolTable.setupBalls();  // Re-rack for bonus
          this.poolTable.showCueBall();
          this.gameState = 'ballInHand';
          this.ballInHand.enable(true);
          this.updateScoreboard();
          this.poolTable.resetShotTracking();
          // In multiplayer, ensure we keep our turn for bonus roll
          if (this.isMultiplayer) {
            this.isMyTurn = true;
            console.log('[GAME] 10th frame spare on scratch - keeping turn for bonus roll');
          }
          return;
        } else {
          this.showNotification('SPARE!', 2500);
          await this.advanceFrame();
          this.poolTable.resetShotTracking();
          return;
        }
      }
      
      if (foulResult.gameOver) {
         console.log('[GAME] Scratch triggered game over');
         this.showNotification('Foul, game over!', 2000);
         await this.advanceFrame();
         this.poolTable.resetShotTracking();
         return;
      }
      if (foulResult.inningComplete && !foulResult.isTenthFrame) {
         this.showNotification('Scratch! Frame ended.', 2500);
         await this.advanceFrame();
         this.poolTable.resetShotTracking();
         return;
      }
      // Check for 10th frame inning complete without gameOver flag
      if (foulResult.inningComplete && foulResult.isTenthFrame) {
         console.log('[GAME] 10th frame scratch inningComplete but gameOver false - checking manually');
         if (this.rulesEngine.isGameComplete()) {
           console.log('[GAME] Manual check: game IS complete');
           this.showNotification('Scratch, game over!', 2000);
           await this.advanceFrame();
           this.poolTable.resetShotTracking();
           return;
         }
      }
      this.poolTable.showCueBall();
      this.gameState = 'ballInHand';
      const isSecondInningNow = (this.rulesEngine.currentInning === 2);
      this.ballInHand.enable(isSecondInningNow); 
      if (!this.isVR && this.desktopControls) {
         this.ballInHand.grab(null);
         this.desktopControls.orbitControls.enabled = false;
      }
      this.showNotification('Scratch! Ball in hand.', 2500);
      this.poolTable.resetShotTracking();
      this.updateScoreboard();
      return; 
    }
    
    if (!cueBallHitObject) {
        const ballsPocketedOnFoul = pocketedBalls.length;
        console.log(`[FOUL] No hit foul! Balls pocketed on foul: ${ballsPocketedOnFoul}`);
        const foulResult = this.rulesEngine.processNoHitFoul(ballsPocketedOnFoul);
        
        // Handle no-hit foul during bonus rolls (10th frame)
        if (foulResult.isBonus) {
          if (foulResult.gameOver) {
            this.showNotification('Bonus rolls complete!', 2000);
            await this.advanceFrame();
            this.poolTable.resetShotTracking();
            return;
          } else {
            // More bonus rolls - re-rack
            this.showNotification('Foul! Continue bonus roll.', 2500);
            this.poolTable.setupBalls();
            this.gameState = 'ready';
            this.ballInHand.enable(true);
            this.updateScoreboard();
            this.poolTable.resetShotTracking();
            // CRITICAL: Update cue controller to enable shooting
            if (this.cueController) this.cueController.update(true);
            // In multiplayer, ensure we keep our turn for remaining bonus rolls
            if (this.isMultiplayer) {
              this.isMyTurn = true;
            }
            return;
          }
        }
        
        // Check for STRIKE on no-hit foul
        if (foulResult.isStrike) {
          this.celebrationSystem.celebrateStrike();
          this.soundManager.playSound('strikeSpare', null, 1.0);
          if (foulResult.isTenthFrame) {
            this.showNotification('STRIKE! 2 bonus rolls coming...', 2500);
            this.poolTable.setupBalls();  // Re-rack for bonus
            this.updateScoreboard();
            this.gameState = 'ready';
            this.ballInHand.enable(true);
            this.poolTable.resetShotTracking();
            // CRITICAL: Update cue controller to enable shooting
            if (this.cueController) this.cueController.update(true);
            // In multiplayer, ensure we keep our turn for bonus rolls
            if (this.isMultiplayer) {
              this.isMyTurn = true;
              console.log('[GAME] 10th frame strike on no-hit foul - keeping turn for bonus rolls');
            }
            return;
          } else {
            this.showNotification('STRIKE!', 2500);
            await this.advanceFrame();
            this.poolTable.resetShotTracking();
            return;
          }
        }
        
        // Check for SPARE on no-hit foul
        if (foulResult.isSpare) {
          this.celebrationSystem.celebrateSpare();
          this.soundManager.playSound('strikeSpare', null, 1.0);
          if (foulResult.isTenthFrame) {
            this.showNotification('SPARE! 1 bonus roll coming...', 2500);
            this.poolTable.setupBalls();  // Re-rack for bonus
            this.updateScoreboard();
            this.gameState = 'ready';
            this.ballInHand.enable(true);
            this.poolTable.resetShotTracking();
            // CRITICAL: Update cue controller to enable shooting
            if (this.cueController) this.cueController.update(true);
            // In multiplayer, ensure we keep our turn for bonus roll
            if (this.isMultiplayer) {
              this.isMyTurn = true;
              console.log('[GAME] 10th frame spare on no-hit foul - keeping turn for bonus roll');
            }
            return;
          } else {
            this.showNotification('SPARE!', 2500);
            await this.advanceFrame();
            this.poolTable.resetShotTracking();
            return;
          }
        }
        
        if (foulResult.gameOver) {
             console.log('[GAME] No-hit foul triggered game over');
             this.showNotification('Foul, game over!', 2000);
             await this.advanceFrame();
        } else if (foulResult.inningComplete && !foulResult.isTenthFrame) {
             this.showNotification('Foul! Open frame.', 2500);
             await this.advanceFrame();
        } else if (foulResult.inningComplete && foulResult.isTenthFrame) {
             // 10th frame inning complete but gameOver not set - check manually
             console.log('[GAME] 10th frame foul inningComplete but gameOver false - checking manually');
             if (this.rulesEngine.isGameComplete()) {
               console.log('[GAME] Manual check: game IS complete');
               this.showNotification('Foul, game over!', 2000);
               await this.advanceFrame();
             } else {
               console.log('[GAME] Manual check: game NOT complete (bonus rolls remaining?)');
               this.showNotification('Foul! Continue playing.', 2500);
               this.gameState = 'ready';
             }
        } else {
             this.showNotification('Foul! Second inning.', 2500);
             this.gameState = 'ready';
        }
        this.poolTable.resetShotTracking();
        this.updateScoreboard();
        return;
    }

    const ballsScored = pocketedBalls.length;
    const result = this.rulesEngine.processShot(ballsScored, false);

    if (result.isStrike) {
      this.celebrationSystem.celebrateStrike();
      this.soundManager.playSound('strikeSpare', null, 1.0);
      this.showNotification('STRIKE!', 2500);
      // In 10th frame, don't advance - need bonus rolls
      if (!result.isTenthFrame) {
        await this.advanceFrame();
        this.poolTable.resetShotTracking();
        return;
      } else {
        // 10th frame strike - re-rack balls for bonus rolls
        this.showNotification('STRIKE! 2 bonus rolls coming...', 2500);
        this.poolTable.setupBalls();  // Re-rack for bonus
        this.updateScoreboard();
        this.gameState = 'ready';
        this.ballsSettled = true;  // CRITICAL: Allow shooting after re-rack
        this.ballInHand.enable(true);
        this.poolTable.resetShotTracking();
        // CRITICAL: Update cue controller to enable shooting
        if (this.cueController) this.cueController.update(true);
        // In multiplayer, ensure we keep our turn for bonus rolls
        if (this.isMultiplayer) {
          this.isMyTurn = true;
          console.log('[GAME] 10th frame strike - keeping turn for bonus rolls');
        }
        return;
      }
    } else if (result.isSpare) {
      this.celebrationSystem.celebrateSpare();
      this.soundManager.playSound('strikeSpare', null, 1.0);
      this.showNotification('SPARE!', 2500);
      // In 10th frame, don't advance - need bonus roll
      if (!result.isTenthFrame) {
        await this.advanceFrame();
        this.poolTable.resetShotTracking();
        return;
      } else {
        // 10th frame spare - re-rack balls for bonus roll
        this.showNotification('SPARE! 1 bonus roll coming...', 2500);
        this.poolTable.setupBalls();  // Re-rack for bonus
        this.updateScoreboard();
        this.gameState = 'ready';
        this.ballsSettled = true;  // CRITICAL: Allow shooting after re-rack
        this.ballInHand.enable(true);
        this.poolTable.resetShotTracking();
        // CRITICAL: Update cue controller to enable shooting
        if (this.cueController) this.cueController.update(true);
        // In multiplayer, ensure we keep our turn for bonus rolls
        if (this.isMultiplayer) {
          this.isMyTurn = true;
          console.log('[GAME] 10th frame spare - keeping turn for bonus roll');
        }
        return;
      }
    } else if (result.isBonus) {
      // Handle bonus roll results
      console.log('[GAME] Bonus roll result:', {
        gameOver: result.gameOver,
        inningComplete: result.inningComplete,
        needsRerack: result.needsRerack,
        bonusRollsRemaining: this.rulesEngine.bonusRolls
      });
      
      if (result.gameOver) {
        this.showNotification('Bonus rolls complete! Game finished.', 2500);
        
        // Send final score update to opponent BEFORE advancing frame
        if (this.isMultiplayer && this.networkManager && this.isMyTurn) {
          const myScores = this.rulesEngine.exportScores();
          console.log('[GAME] Sending final bonus scores to opponent');
          this.networkManager.sendScoreUpdate(myScores);
        }
        
        await this.advanceFrame();
        this.poolTable.resetShotTracking();
        return;
      } else if (result.inningComplete) {
        // Bonus inning complete but more remain
        if (result.needsRerack) {
          // Cleared all 10 - re-rack for next bonus inning
          this.showNotification('Another strike! Bonus roll continues...', 1500);
          this.poolTable.setupBalls();
          this.ballsSettled = true;
          this.ballInHand.enable(true);
        } else {
          // Missed - continue from where you are for next bonus inning
          this.showNotification('Next bonus inning! Keep shooting...', 1500);
        }
        
        // Send score update to opponent during bonus rolls
        if (this.isMultiplayer && this.networkManager && this.isMyTurn) {
          const myScores = this.rulesEngine.exportScores();
          console.log('[GAME] Sending bonus progress to opponent');
          this.networkManager.sendScoreUpdate(myScores);
        }
        
        this.updateScoreboard();
        this.gameState = 'ready';
        this.poolTable.resetShotTracking();
        // CRITICAL: Update cue controller to enable shooting
        if (this.cueController) this.cueController.update(true);
        // In multiplayer, ensure we keep our turn for remaining bonus rolls
        if (this.isMultiplayer) {
          this.isMyTurn = true;
        }
        return;
      } else {
        // Still shooting in current bonus inning
        
        // Send score update to opponent during bonus rolls
        if (this.isMultiplayer && this.networkManager && this.isMyTurn) {
          const myScores = this.rulesEngine.exportScores();
          console.log('[GAME] Sending bonus progress to opponent (mid-inning)');
          this.networkManager.sendScoreUpdate(myScores);
        }
        
        this.updateScoreboard();
        this.gameState = 'ready';
        this.poolTable.resetShotTracking();
        // CRITICAL: Update cue controller to enable shooting for next shot
        if (this.cueController) this.cueController.update(true);
        // In multiplayer, ensure we keep our turn during bonus rolls
        if (this.isMultiplayer) {
          this.isMyTurn = true;
        }
        return;
      }
    } else if (result.inningComplete) {
      if (result.inning === 1) {
        this.showNotification(`First inning: ${result.scored} down. Second inning!`, 2000);
        
        // Update scoreboard immediately after first inning
        this.updateScoreboard();
        
        // Send score update to opponent after first inning (BOTH HOST AND GUEST)
        console.log('[GAME] First inning complete - Checking if should send:', {
          isMultiplayer: this.isMultiplayer,
          hasNetworkManager: !!this.networkManager,
          isMyTurn: this.isMyTurn,
          playerNumber: this.myPlayerNumber
        });
        
        if (this.isMultiplayer && this.networkManager && this.isMyTurn) {
          const myScores = this.rulesEngine.exportScores();
          console.log('[GAME] ✓ SENDING score update to opponent:', {
            playerNumber: this.myPlayerNumber,
            isMyTurn: this.isMyTurn,
            frame: myScores.currentFrame,
            inning1: myScores.frames[myScores.currentFrame].inning1,
            fullScores: JSON.stringify(myScores, null, 2)
          });
          this.networkManager.sendScoreUpdate(myScores);
        } else {
          console.log('[GAME] ✗ NOT sending score update. Conditions:', {
            isMultiplayer: this.isMultiplayer,
            hasNetworkManager: !!this.networkManager,
            isMyTurn: this.isMyTurn
          });
        }
        
        this.gameState = 'ready';
        this.poolTable.resetShotTracking();
        return;
      } else {
        // Second inning complete
        if (result.isTenthFrame) {
          // In 10th frame, only advance if game is actually over
          console.log('[GAME] 10th frame second inning complete:', {
            gameOver: result.gameOver,
            totalScored: result.totalScored,
            isGameComplete: this.rulesEngine.isGameComplete(),
            isMultiplayer: this.isMultiplayer,
            frame10: JSON.stringify(this.rulesEngine.frames[9])
          });
          if (result.gameOver) {
            this.showNotification(`10th Frame Complete: ${result.totalScored} total`, 2000);
            console.log('[GAME] Calling advanceFrame() for 10th frame game over');
            await this.advanceFrame(); // Will handle game completion
            this.poolTable.resetShotTracking();
            return;
          } else {
            // 10th frame but game not over - shouldn't happen for open frames
            // but might happen if there's a logic issue
            console.log('[GAME] 10th frame second inning complete but game not over?', result);
            this.showNotification(`Inning complete: ${result.totalScored} total`, 2000);
            this.gameState = 'ready';
            this.poolTable.resetShotTracking();
            this.updateScoreboard();
            return;
          }
        } else {
          // Regular frames 1-9
          this.showNotification(`Open frame: ${result.totalScored} total`, 2000);
          await this.advanceFrame();
          this.poolTable.resetShotTracking();
          return;
        }
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
        // Don't reset to ready if game is over
        if (this.gameState !== 'gameOver') {
          this.cueController.update(true);
          this.gameState = 'ready';
        }
      }, 200);
    }
  }

  async advanceFrame() {
    console.log('[GAME] advanceFrame() called - isMultiplayer:', this.isMultiplayer, 'isGameComplete:', this.rulesEngine.isGameComplete());
    if (this.isMultiplayer) {
      console.log("[GAME] =====  FRAME COMPLETE - ADVANCE FRAME =====");
      console.log("[GAME] Current state before advancing:", {
        myPlayerNumber: this.myPlayerNumber,
        isMyTurn: this.isMyTurn,
        currentFrame: this.rulesEngine.currentFrame,
        bonusRolls: this.rulesEngine.bonusRolls,
        currentFrameScores: this.rulesEngine.frames[this.rulesEngine.currentFrame]
      });
      
      // SAFEGUARD: In 10th frame, only allow advance if game is actually complete OR there are still bonus rolls pending
      if (this.rulesEngine.currentFrame === 9 && !this.rulesEngine.isGameComplete()) {
        // Check if there are actually bonus rolls pending
        if (this.rulesEngine.bonusRolls > 0) {
          // Still have bonus rolls to complete - this is valid, keep playing
          console.log("[GAME] In 10th frame with bonus rolls pending - keeping current turn");
          this.gameState = 'ready';
          return;
        } else {
          // No bonus rolls left but game not complete - this shouldn't happen, force completion
          console.log("[GAME] WARNING - In 10th frame, no bonus rolls, but isGameComplete() is false. Forcing completion check.");
          // Fall through to game completion logic
        }
      }
      
      // CRITICAL FIX: Check if game is complete BEFORE switching turns
      if (this.rulesEngine.isGameComplete()) {
        console.log("[GAME] *** MY GAME IS COMPLETE ***");
        console.log("[GAME] Final game state:", {
          currentFrame: this.rulesEngine.currentFrame,
          bonusRolls: this.rulesEngine.bonusRolls,
          frame10: this.rulesEngine.frames[9],
          isGameComplete: this.rulesEngine.isGameComplete()
        });
        
        const finalScore = this.rulesEngine.getTotalScore();
        
        // Mark MY game as finished
        this.myGameFinished = true;
        
        // CRITICAL: Set isMyTurn to false so we don't process shots as our own
        this.isMyTurn = false;
        
        // Export final scores to send to opponent FIRST (before any checks)
        const myScores = this.rulesEngine.exportScores();
        console.log("[GAME] Exporting FINAL scores to opponent:", {
          totalScore: finalScore,
          frame10: myScores.frames[9],
          bonusRolls: myScores.bonusRolls
        });
        
        if (this.networkManager) {
          console.log("[GAME] ✓ Sending final frameComplete to opponent");
          this.networkManager.sendFrameComplete(myScores);
        }
        
        // Check if opponent is also done
        const oppComplete = this.remoteRulesEngine && this.remoteRulesEngine.isGameComplete();
        console.log("[GAME] Opponent complete?", oppComplete);
        
        if (oppComplete) {
          // Both done! Game should end
          console.log("[GAME] Both players are complete - checking final results");
          this.updateScoreboard();
          this.checkGameComplete();
        } else {
          // I'm done but opponent isn't - spectate their remaining play
          this.gameState = 'spectating';
          console.log("[GAME] Set gameState = 'spectating' - waiting for opponent to finish");
          
          // Show local game complete message with opponent's current score
          const oppScore = this.remoteRulesEngine ? this.remoteRulesEngine.getTotalScore() : 0;
          this.showNotification(`Your game is complete! Score: ${finalScore}. Opponent has: ${oppScore}. Waiting...`, 5000);
          
          // Play local completion celebration
          if (this.celebrationSystem) {
            this.celebrationSystem.celebrateGameOver(finalScore);
          }
          
          this.updateScoreboard();
        }
        return;
      }
      
      // CRITICAL: Export scores BEFORE any state changes
      const myScores = this.rulesEngine.exportScores();
      console.log("[GAME] Exporting MY scores to send to opponent:");
      console.log(JSON.stringify(myScores, null, 2));
      
      // Now switch turn and rerack
      this.isMyTurn = false;
      this.setupNewFrame(true);
      
      // Send scores and table state
      if (this.networkManager) {
        console.log("[GAME] ✓ Sending frameComplete to opponent");
        this.networkManager.sendFrameComplete(myScores);
        // Wait for balls to settle, then sync the racked state
        setTimeout(() => {
          const state = this.poolTable.exportState();
          this.networkManager.sendTableState(state);
        }, 300);
      } else {
        console.log("[GAME] ✗ No networkManager, cannot send scores!");
      }
      
      this.showNotification(`Frame ${this.rulesEngine.currentFrame + 1} Complete! Opponent's turn...`, 3000);
      this.updateScoreboard();
      console.log("[GAME] ===== END ADVANCE FRAME =====");
      return;
    }
    if (this.rulesEngine.isGameComplete()) {
      const finalScore = this.rulesEngine.getTotalScore();
      console.log('[GAME] *** GAME OVER (Single Player) *** Score:', finalScore);
      this.gameState = 'gameOver';
      this.showNotification(`Game Over! Score: ${finalScore}. Press R or click New Game to play again.`, 10000);
      
      // Celebrate game over with floating text (delayed to let strike/spare celebration finish first)
      if (this.celebrationSystem) {
        this.celebrationSystem.celebrateGameOverDelayed(finalScore, 2500);
      }
      
      let playerName = localStorage.getItem('bowlliards_playerName') || 'Player';
      const pottingAverage = this.rulesEngine.getPottingAverage();
      await this.leaderboard.addScore(finalScore, playerName, pottingAverage);
      
      // Save game to stats tracker if logged in
      if (this.statsTracker && this.statsTracker.isLoggedIn) {
        // Build breaks array in format expected by stats tracker: breaks[frameIndex].breaks[0]
        const breaksData = this.rulesEngine.breakBalls.map(ballCount => ({
          breaks: [ballCount]
        }));
        
        const gameData = {
          score: finalScore,
          frames: this.rulesEngine.frames.map(f => ({
            rolls: [
              f.inning1.scored || 0, 
              f.inning2.scored || 0, 
              ...(f.bonus || [])
            ].filter(r => r !== undefined)
          })),
          breaks: breaksData,  // Now properly tracks break balls per frame
          frameScores: this.rulesEngine.frames.map(f => f.score || 0)
        };
        
        console.log('[STATS] Saving game with break data:', breaksData);
        await this.statsTracker.saveGame(gameData);
        console.log('[GAME] Game saved to stats tracker');
        
        // Refresh personal stats display
        await this.statsTracker.refreshStats();
        const stats = this.statsTracker.getMyStats();
        if (this.personalStatsDisplay) {
          this.personalStatsDisplay.update(stats, playerName);
        }
      }
      
      this.updateScoreboard();
      this.leaderboardDisplay.update(this.leaderboard);
    } else {
      this.rulesEngine.nextFrame();
      this.setupNewFrame(true);
      this.gameState = 'ready';
      this.ballInHand.enable(true);
      this.showNotification('Frame ' + (this.rulesEngine.currentFrame + 1) + ' Ready', 2000);
    }
  }

  onOpponentFrameComplete() {
    console.log("[GAME] ===== OPPONENT FRAME COMPLETE =====");
    
    // Log opponent's full state for debugging
    if (this.remoteRulesEngine) {
      console.log("[GAME] Opponent state after frame complete:", {
        oppFrame: this.remoteRulesEngine.currentFrame + 1,
        oppScore: this.remoteRulesEngine.getTotalScore(),
        oppComplete: this.remoteRulesEngine.isGameComplete(),
        oppBonusRolls: this.remoteRulesEngine.bonusRolls,
        oppFrame10: {
          inning1: this.remoteRulesEngine.frames[9].inning1,
          inning2: this.remoteRulesEngine.frames[9].inning2,
          isStrike: this.remoteRulesEngine.frames[9].isStrike,
          isSpare: this.remoteRulesEngine.frames[9].isSpare,
          isOpen: this.remoteRulesEngine.frames[9].isOpen,
          bonus: this.remoteRulesEngine.frames[9].bonus
        }
      });
    }
    
    // Log MY current state
    console.log("[GAME] My current state:", {
      myFrame: this.rulesEngine.currentFrame + 1,
      myScore: this.rulesEngine.getTotalScore(),
      myComplete: this.rulesEngine.isGameComplete(),
      myBonusRolls: this.rulesEngine.bonusRolls,
      isMyTurn: this.isMyTurn,
      gameState: this.gameState,
      myGameFinished: this.myGameFinished
    });
    
    // Don't process if game is already fully over (both players done)
    if (this.gameState === 'gameOver') {
      console.log("[GAME] Ignoring opponent frame complete - game is fully over");
      return;
    }
    
    // Check if opponent just finished their entire game (10th frame complete with bonus if applicable)
    const opponentFinishedGame = this.remoteRulesEngine && this.remoteRulesEngine.isGameComplete();
    const myGameComplete = this.rulesEngine.isGameComplete();
    
    console.log("[GAME] Completion status:", {
      opponentFinishedGame,
      myGameComplete,
      myGameFinished: this.myGameFinished
    });
    
    // CRITICAL FIX: If my game is NOT complete according to rules engine, 
    // reset myGameFinished flag and clear spectating state to allow continued play
    if (!myGameComplete) {
      if (this.myGameFinished) {
        console.log("[GAME] CRITICAL: Resetting myGameFinished flag (was incorrectly set, game NOT complete)");
        this.myGameFinished = false;
      }
      if (this.gameState === 'spectating') {
        console.log("[GAME] CRITICAL: Resetting gameState from spectating (game NOT complete)");
        this.gameState = 'waiting';
      }
    }
    
    // CASE 1: Both games are complete - trigger game over
    if (opponentFinishedGame && myGameComplete) {
      console.log("[GAME] *** BOTH PLAYERS COMPLETE - Triggering game over ***");
      this.myGameFinished = true;
      this.updateScoreboard();
      this.checkGameComplete();
      return;
    }
    
    // CASE 2: Opponent finished their game but I haven't - I MUST continue playing
    // This is the key fix for the 10th frame bonus issue
    if (opponentFinishedGame && !myGameComplete) {
      console.log("[GAME] *** OPPONENT FINISHED GAME - I must continue playing ***");
      console.log("[GAME] Opponent's final score:", this.remoteRulesEngine.getTotalScore());
      console.log("[GAME] Setting up my turn to continue the match");
      
      // CRITICAL: Clear any incorrect state flags
      this.myGameFinished = false;
      
      // Force set our turn and state
      this.isMyTurn = true;
      this.gameState = 'ready';
      this.ballsSettled = true;
      
      // Check if my current frame is done (need to advance)
      const currentFrameData = this.rulesEngine.frames[this.rulesEngine.currentFrame];
      const isMyFrameDone = currentFrameData.isStrike || currentFrameData.isOpen || 
                            (currentFrameData.inning1.complete && currentFrameData.inning2.complete);
      
      // Advance frame if current is done (but not if we're in 10th with bonus pending)
      if (isMyFrameDone && this.rulesEngine.currentFrame < 9) {
        console.log("[GAME] My current frame is done, advancing to next");
        this.rulesEngine.nextFrame();
      }
      
      // Check if we need to rerack
      const updatedFrameData = this.rulesEngine.frames[this.rulesEngine.currentFrame];
      const in10thFrame = this.rulesEngine.currentFrame === 9;
      const frame10Started = in10thFrame && (updatedFrameData.inning1.scored > 0 || updatedFrameData.inning1.complete);
      const haveBonusRolls = this.rulesEngine.bonusRolls > 0;
      
      // Rerack if starting fresh frame OR starting 10th frame fresh OR need rerack for bonus
      if (!in10thFrame || (!frame10Started && !haveBonusRolls)) {
        console.log("[GAME] Setting up new frame for my turn");
        this.setupNewFrame(true);
      } else if (haveBonusRolls && (updatedFrameData.isStrike || updatedFrameData.isSpare)) {
        // In 10th frame with bonus rolls - make sure balls are racked
        console.log("[GAME] In 10th frame with bonus rolls - ensuring balls are racked");
        this.poolTable.setupBalls();
        this.ballsSettled = true;
      }
      
      // Enable controls
      this.ballInHand.enable(true);
      if (this.cueController) {
        this.cueController.update(true);
      }
      
      // Play turn notification
      if (this.soundManager) {
        this.soundManager.playSound('yourTurn', null, 1.0);
      }
      
      this.showNotification(`Opponent finished with ${this.remoteRulesEngine.getTotalScore()}! Your turn - Frame ${this.rulesEngine.currentFrame + 1}`, 4000);
      this.updateScoreboard();
      
      console.log("[GAME] Turn setup complete:", {
        isMyTurn: this.isMyTurn,
        gameState: this.gameState,
        currentFrame: this.rulesEngine.currentFrame + 1,
        ballInHandEnabled: this.ballInHand.enabled,
        bonusRolls: this.rulesEngine.bonusRolls
      });
      return;
    }
    
    // CASE 3: I'm spectating (my game finished, watching opponent finish)
    if ((this.gameState === 'spectating' || this.myGameFinished) && !opponentFinishedGame) {
      console.log("[GAME] Spectating - opponent completed a frame but not game yet");
      this.updateScoreboard();
      return;
    }
    
    // CASE 4: My game finished and opponent just finished too
    if ((this.gameState === 'spectating' || this.myGameFinished) && opponentFinishedGame) {
      console.log("[GAME] Spectating - opponent also finished, triggering game over");
      this.updateScoreboard();
      this.checkGameComplete();
      return;
    }
    
    // CASE 5: I'm in 10th frame with bonus rolls ACTIVE - don't interrupt my turn!
    if (this.rulesEngine.currentFrame === 9 && this.rulesEngine.bonusRolls > 0 && this.isMyTurn) {
      console.log("[GAME] In 10th frame with bonus rolls pending AND it's my turn - not interrupting");
      console.log("[GAME] Bonus rolls remaining:", this.rulesEngine.bonusRolls);
      this.updateScoreboard();
      return;
    }
    
    // CASE 6: Normal frame-by-frame turn switching
    // If it's already my turn and game is ready, don't interrupt
    if (this.isMyTurn && this.gameState === 'ready') {
      console.log("[GAME] Already my turn and ready - just updating scoreboard");
      this.updateScoreboard();
      return;
    }
    
    // Check if I should advance my frame number (sync logic)
    const currentFrameData = this.rulesEngine.frames[this.rulesEngine.currentFrame];
    const isMyFrameDone = currentFrameData.isStrike || currentFrameData.isOpen || 
                          (currentFrameData.inning1.complete && currentFrameData.inning2.complete);
    
    console.log("[GAME] My current frame status:", {
      frame: this.rulesEngine.currentFrame + 1,
      isMyFrameDone,
      bonusRolls: this.rulesEngine.bonusRolls
    });
    
    // Only advance frame if not already in 10th frame
    if (isMyFrameDone && !myGameComplete && this.rulesEngine.currentFrame < 9) {
        console.log("[GAME] Advancing my frame number");
        this.rulesEngine.nextFrame();
    }
    
    if (!myGameComplete) {
      console.log("[GAME] Setting my turn to TRUE and setting up");
      
      // Set turn BEFORE setupNewFrame so controls are enabled
      this.isMyTurn = true;
      
      // Check if we need to rerack
      const updatedFrameData = this.rulesEngine.frames[this.rulesEngine.currentFrame];
      const in10thFrame = this.rulesEngine.currentFrame === 9;
      const frame10Started = in10thFrame && (updatedFrameData.inning1.scored > 0 || updatedFrameData.inning1.complete);
      
      if (!in10thFrame || !frame10Started) {
        console.log("[GAME] Reracking balls for new frame/10th frame start");
        this.setupNewFrame(true);
      } else {
        console.log("[GAME] In 10th frame and already started - continuing from current state");
      }
      
      // Ensure game state is ready and controls are enabled
      this.gameState = 'ready';
      this.ballInHand.enable(true);
      
      // Play "It is your turn" audio notification
      if (this.soundManager) {
        this.soundManager.playSound('yourTurn', null, 1.0);
      }
      
      // Force enable cue controller for shooting
      if (this.cueController) {
        this.cueController.update(true);
      }
      
      console.log("[GAME] Game state after turn handoff:", {
        isMyTurn: this.isMyTurn,
        gameState: this.gameState,
        ballInHandEnabled: this.ballInHand.enabled,
        currentFrame: this.rulesEngine.currentFrame + 1
      });
      
      this.showNotification(`Your turn! Frame ${this.rulesEngine.currentFrame + 1}`, 2500);
    } else {
      console.log("[GAME] My game is also complete - checking final results");
      this.myGameFinished = true;
      this.checkGameComplete();
    }
    this.updateScoreboard();
    console.log("[GAME] ===== END OPPONENT FRAME COMPLETE =====");
  }

  checkGameComplete() {
    if (!this.isMultiplayer) return;
    
    const myComplete = this.rulesEngine.isGameComplete();
    const oppComplete = this.remoteRulesEngine && this.remoteRulesEngine.isGameComplete();
    
    // Display human-readable frame numbers (1-indexed)
    console.log('[GAME] checkGameComplete:', {
      myComplete,
      oppComplete,
      myScore: this.rulesEngine.getTotalScore(),
      oppScore: this.remoteRulesEngine ? this.remoteRulesEngine.getTotalScore() : 'N/A',
      myFrame: this.rulesEngine.currentFrame + 1,
      oppFrame: this.remoteRulesEngine ? this.remoteRulesEngine.currentFrame + 1 : 'N/A',
      myBonusRolls: this.rulesEngine.bonusRolls,
      oppBonusRolls: this.remoteRulesEngine ? this.remoteRulesEngine.bonusRolls : 'N/A',
      myGameFinished: this.myGameFinished,
      gameState: this.gameState
    });
    
    // SAFEGUARD: Don't end game if I haven't actually COMPLETED my 10th frame with bonus
    if ((myComplete || this.myGameFinished) && this.rulesEngine.currentFrame === 9) {
      const myFrame10 = this.rulesEngine.frames[9];
      
      // If I have a strike or spare in 10th, make sure bonus rolls are done
      if ((myFrame10.isStrike || myFrame10.isSpare) && this.rulesEngine.bonusRolls > 0) {
        console.log('[GAME] WARNING: myComplete is true but I still have bonus rolls!');
        console.log('[GAME] My bonusRolls:', this.rulesEngine.bonusRolls);
        console.log('[GAME] NOT ending game - I need to finish bonus rolls');
        return;
      }
    }
    
    // Both players have finished (either via isGameComplete or myGameFinished flag)
    const bothDone = myComplete && oppComplete;
    
    if (bothDone) {
      console.log('[GAME] ===== BOTH PLAYERS CONFIRMED COMPLETE =====');
      
      const myScore = this.rulesEngine.getTotalScore();
      const oppScore = this.remoteRulesEngine.getTotalScore();
      
      console.log('[GAME] Final Scores - Me:', myScore, 'Opponent:', oppScore);
      
      let gameResult = null;
      
      if (myScore > oppScore) {
        this.showNotification(`YOU WIN! ${myScore} vs ${oppScore} - Click "New Game" to play again!`, 8000);
        gameResult = 'win';
      } else if (oppScore > myScore) {
        this.showNotification(`YOU LOSE! ${myScore} vs ${oppScore} - Click "New Game" to play again!`, 8000);
        gameResult = 'loss';
      } else {
        this.showNotification(`TIE GAME! ${myScore} vs ${oppScore} - Click "New Game" to play again!`, 8000);
        gameResult = 'tie';
      }
      
      // Celebrate result (delayed to let strike/spare celebration finish first)
      if (this.celebrationSystem) {
        this.celebrationSystem.celebrateResultDelayed(gameResult, 2500);
      }
      
      this.gameState = 'gameOver';
      this.isMyTurn = false;
      this.myGameFinished = true;
      console.log('[GAME] ===== GAME OVER ===== Both players finished. Click New Game to play again.');
      
      // Update scoreboard one final time to ensure both scores are displayed
      this.updateScoreboard();
      
      // Save multiplayer game to stats tracker if logged in (with game result)
      this.saveMultiplayerGame(myScore, gameResult);
    } else if (!myComplete && oppComplete) {
      // Opponent finished but I haven't - make sure I can continue playing
      console.log('[GAME] Opponent finished their game, I still need to play');
      
      // CRITICAL FIX: Reset any incorrect flags and ensure turn is mine
      this.myGameFinished = false;
      
      if (this.gameState !== 'gameOver' && this.gameState !== 'shooting') {
        console.log('[GAME] Ensuring my turn is enabled to continue');
        this.isMyTurn = true;
        this.gameState = 'ready';
        this.ballsSettled = true;
        this.ballInHand.enable(true);
        if (this.cueController) {
          this.cueController.update(true);
        }
        
        // Show notification
        this.showNotification(`Keep playing! Opponent finished with ${this.remoteRulesEngine.getTotalScore()}`, 3000);
      }
    } else if (myComplete && !oppComplete) {
      // I finished but opponent hasn't - enter spectating mode
      console.log('[GAME] I finished, waiting for opponent to complete');
      this.gameState = 'spectating';
      this.myGameFinished = true;
      this.isMyTurn = false;
    }
  }
  
  // Save multiplayer game data to stats tracker
  async saveMultiplayerGame(finalScore, gameResult = null) {
    if (!this.statsTracker || !this.statsTracker.isLoggedIn) {
      console.log('[STATS] Not logged in - multiplayer game not saved to stats');
      return;
    }
    
    // Build breaks array in format expected by stats tracker: breaks[frameIndex].breaks[0]
    const breaksData = this.rulesEngine.breakBalls.map(ballCount => ({
      breaks: [ballCount]
    }));
    
    const gameData = {
      score: finalScore,
      frames: this.rulesEngine.frames.map(f => ({
        rolls: [
          f.inning1.scored || 0, 
          f.inning2.scored || 0, 
          ...(f.bonus || [])
        ].filter(r => r !== undefined)
      })),
      breaks: breaksData,  // Tracks break balls per frame
      frameScores: this.rulesEngine.frames.map(f => f.score || 0),
      isMultiplayer: true,
      opponentScore: this.remoteRulesEngine ? this.remoteRulesEngine.getTotalScore() : 0,
      gameResult: gameResult  // 'win', 'loss', 'tie'
    };
    
    console.log('[STATS] Saving multiplayer game with break data:', breaksData);
    await this.statsTracker.saveGame(gameData);
    console.log('[GAME] Multiplayer game saved to stats tracker');
    
    // Refresh personal stats display
    await this.statsTracker.refreshStats();
    const stats = this.statsTracker.getMyStats();
    const playerName = localStorage.getItem('bowlliards_playerName') || 'Player';
    if (this.personalStatsDisplay) {
      this.personalStatsDisplay.update(stats, playerName);
    }
  }

  resetMultiplayerGame() {
    console.log('[GAME] Resetting multiplayer game');

    // Reset new game request tracking
    this.newGameRequestPending = false;
    this.opponentWantsNewGame = false;
    
    // Reset game completion tracking
    this.myGameFinished = false;

    // Reset both local and remote rules engines
    this.rulesEngine = new BowlliardsRulesEngine();
    this.remoteRulesEngine = new BowlliardsRulesEngine();

    // Reset table and ball state
    this.poolTable.setupBalls();
    this.poolTable.resetShotTracking();

    // Reset game state variables
    this.breakShotTaken = false;
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.ballsSettled = true;
    this.isMyTurn = (this.myPlayerNumber === 1); // Player 1 starts
    this.gameState = this.isMyTurn ? 'ready' : 'waiting';

    // Enable ball in hand for player 1
    if (this.isMyTurn) {
      this.ballInHand.enable(true);
      this.showNotification('New game! Your turn to break.', 2500);
    } else {
      this.ballInHand.disable();
      this.showNotification('New game! Waiting for opponent to break.', 2500);
    }

    // Reset scoreboard
    this.scoreboard.setupBoard('multi');
    this.scoreboard.drawEmptyScore();
    this.updateScoreboard();

    // Update cue controller
    if (this.cueController) {
      this.cueController.update(this.isMyTurn);
    }
  }

  onOpponentNewGameRequest() {
    console.log('[GAME] Opponent requested new game');
    this.opponentWantsNewGame = true;
    
    // Update the player menu to show opponent wants new game
    if (this.playerMenu) {
      this.playerMenu.render();
    }
    
    // Show notification - works anytime
    this.showNotification('Opponent wants to start a new game! Press B → Accept to confirm.', 5000);
  }
  
  onNewGameConfirmed() {
    console.log('[GAME] ===== NEW GAME CONFIRMED BY BOTH PLAYERS =====');
    
    // Reset request tracking
    this.newGameRequestPending = false;
    this.opponentWantsNewGame = false;
    
    // Actually reset the game
    this.resetMultiplayerGame();
    
    // Update player menu
    if (this.playerMenu) {
      this.playerMenu.render();
    }
  }
  
  onNewGameRequestSent() {
    console.log('[GAME] New game request sent, waiting for opponent...');
    this.newGameRequestPending = true;
    this.showNotification('Waiting for opponent to accept new game...', 3000);
    
    // Update player menu to show waiting state
    if (this.playerMenu) {
      this.playerMenu.render();
    }
  }
  
  onOpponentCanceledNewGame() {
    console.log('[GAME] Opponent canceled their new game request');
    this.opponentWantsNewGame = false;
    this.showNotification('Opponent canceled new game request', 2000);
    
    // Update player menu
    if (this.playerMenu) {
      this.playerMenu.render();
    }
  }

  updateScoreboard() {
    if (this.isMultiplayer) {
      // Ensure remoteRulesEngine exists
      if (!this.remoteRulesEngine) {
        console.warn('[SCOREBOARD] remoteRulesEngine is null, creating new one');
        this.remoteRulesEngine = new BowlliardsRulesEngine();
      }
      
      if (this.scoreboard.mode !== 'multi') this.scoreboard.setupBoard('multi');
      
      // Display human-readable frame numbers (1-indexed)
      console.log('[GAME] Updating multiplayer scoreboard:', {
        myFrame: this.rulesEngine.currentFrame + 1,
        oppFrame: this.remoteRulesEngine.currentFrame + 1,
        myScore: this.rulesEngine.getTotalScore(),
        oppScore: this.remoteRulesEngine.getTotalScore(),
        myComplete: this.rulesEngine.isGameComplete(),
        oppComplete: this.remoteRulesEngine.isGameComplete()
      });
      
      this.scoreboard.updateScore(
        this.rulesEngine, this.remoteRulesEngine, 
        this.myPlayerName, this.remotePlayerName, this.isMyTurn
      );
    } else {
      if (this.scoreboard.mode !== 'single') this.scoreboard.setupBoard('single');
      this.scoreboard.updateScore(this.rulesEngine, null, null, null, null);
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
    this._notifTimeout = setTimeout(() => { notification.style.display = 'none'; }, duration || 2000);
  }

  startNewGame() {
    // If multiplayer, use the two-player confirmation system (available anytime)
    if (this.isMultiplayer) {
      // If we already sent a request, show waiting message
      if (this.newGameRequestPending) {
        this.showNotification('Already waiting for opponent...', 2000);
        return;
      }
      
      console.log('[GAME] Requesting new multiplayer game');
      
      // Send request to server
      if (this.networkManager) {
        this.networkManager.sendNewGameRequest();
      }
      
      // If opponent already requested, the server will immediately confirm
      // Otherwise we wait for opponent
      return;
    }

    // Single player - immediately start new game
    this.rulesEngine = new BowlliardsRulesEngine();
    this.poolTable.setupBalls();  // Reset balls on table
    this.poolTable.resetShotTracking();  // Clear any previous shot state
    this.breakShotTaken = false;
    this.currentInning = 1;
    this.frameJustStarted = true;
    this.ballsSettled = true;
    this.gameState = 'ready';
    this.myGameFinished = false;  // Reset game completion flag
    this.ballInHand.enable(true);

    // Properly redraw scoreboard
    this.scoreboard.setupBoard('single');
    this.scoreboard.drawEmptyScore();
    this.updateScoreboard();
    this.leaderboardDisplay.update(this.leaderboard);

    // Update cue controller
    if (this.cueController) {
      this.cueController.update(true);
    }

    this.showNotification('New game! Ready to Break.', 2000);
  }

  resetGame() { this.startNewGame(); }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    const p = this.camera.position;
    if (isNaN(p.x) || isNaN(p.y) || isNaN(p.z)) return; 

    const delta = this.clock.getDelta();
    this.physics.step(delta);
    this.poolTable.update(delta);
    
    // Only enforce waiting state during opponent's shots, not constantly
    if (this.isMultiplayer && !this.isMyTurn && this.gameState === 'shooting') {
        this.gameState = 'waiting';
        this.ballInHand.disable();
        if (this.cueController) this.cueController.updateDesktop(false);
    }
    
    this.cueController.update(this.ballsSettled);
    this.ballInHand.update();
    this.checkBallsSettled();
    this.updateLocomotion(delta);
    if (this.celebrationSystem) this.celebrationSystem.update(delta);
    if (this.settingsPanel) this.settingsPanel.update();
    if (this.playerMenu) this.playerMenu.update(delta);
    if (this.networkManager) {
        this.networkManager.sendAvatarUpdate();
        this.networkManager.updateLocalNameLabel(); // Update local player name label
        if (this.isAuthority && !this.ballsSettled && this.gameState === 'shooting') {
             const state = this.poolTable.exportState();
             this.networkManager.sendTableState(state);
        }
    }
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('[INIT] DOMContentLoaded fired');
  try {
    console.log('[INIT] Creating VRBowlliardsGame...');
    window.game = new VRBowlliardsGame();
    console.log('[INIT] VRBowlliardsGame created successfully');
    console.log('[INIT] Calling initGame...');
    window.game.initGame(); 
    console.log('[INIT] initGame called successfully');
  } catch (error) {
    console.error('[INIT] FATAL ERROR during initialization:', error);
    console.error('[INIT] Error stack:', error.stack);
    // Display error on screen
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:20px;z-index:9999;font-family:monospace;';
    errorDiv.textContent = 'INIT ERROR: ' + error.message + ' - Check console for details';
    document.body.appendChild(errorDiv);
  }
});