import * as THREE from 'three';

export class SoundManager {
  constructor(camera) {
    this.camera = camera;

    // Create the listener, but DO NOT add it to the camera yet.
    // Adding it while the context is suspended causes the 'linearRampToValueAtTime' crash.
    this.audioListener = new THREE.AudioListener();
    this.isAudioActive = false;

    this.audioLoader = new THREE.AudioLoader();
    this.soundBuffers = {};  
    this.activeSounds = {};  

    this.sources = {
      ballHit: 'sound when do balls make impact with one another.mp3',
      cushionHit: 'ball hits cusion.mp3',
      cueHitSoft: 'impact of cue hitting cue.mp3', 
      cueHitHard: 'impact of cue hitting cue.mp3',
      pocketSoft: 'ball falling in pocket slowly.mp3',
      pocketHard: 'ball falling into pocket hard shot.mp3',
      hustlerMovie: 'The VR Hustler (Full Movie).mp3',
      // Array of files - one will be randomly selected each time
      yourTurn: [
        'It is Your turn.mp3',
        'It is Your turn 2.mp3',
        'It is Your turn 3.mp3'
      ]
    };

    this.baseVolumes = {
      ballHit: 0.6,
      cushionHit: 0.7,
      cueHitSoft: 0.8,
      cueHitHard: 1.0,
      pocketSoft: 0.7,
      pocketHard: 1.0,
      hustlerMovie: 0.4,
      yourTurn: 1.0
    };
  }

  // --- SAFETY FIX: Only attach audio when user interacts ---
  resumeContext() {
    if (this.isAudioActive) return;

    // 1. Attach listener to camera now that we are ready
    this.camera.add(this.audioListener);
    this.isAudioActive = true;

    // 2. Resume the context
    if (this.audioListener.context && this.audioListener.context.state === 'suspended') {
      this.audioListener.context.resume().then(() => {
        console.log('[SoundManager] Audio Context Resumed & Listener Attached');
      }).catch(err => console.warn('[SoundManager] Failed to resume audio:', err));
    }
  }
  
  toggleSound(key, position) {
    // Check if this sound is already playing
    if (this.activeSounds[key]) {
      // Stop the sound
      this.activeSounds[key].stop();
      this.activeSounds[key] = null;
      console.log(`[SoundManager] Stopped ${key}`);
    } else {
      // Start the sound
      this.playSound(key, position, 1.0);
      console.log(`[SoundManager] Started ${key}`);
    }
  }

  _playFromBuffer(key, buffer, position, volume) {
    // CRITICAL FIX: Do not attempt to play if listener is not attached
    if (!buffer || !this.isAudioActive) return;

    const sound = new THREE.PositionalAudio(this.audioListener);
    sound.setBuffer(buffer);
    sound.setRefDistance(1.5);
    sound.setRolloffFactor(1.5);
    sound.setDistanceModel('inverse');

    const safeVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.8));
    sound.setVolume(safeVolume);

    const obj = new THREE.Object3D();
    if (position && position.isVector3) {
      obj.position.copy(position);
    } else {
      obj.position.set(0, 1.0, 0);
    }

    const parent = this.camera.parent || this.camera;
    parent.add(obj);
    obj.add(sound);

    sound.play();

    // Store long-playing sounds so we can stop them later
    if (key === 'hustlerMovie') {
      this.activeSounds[key] = sound;
    }

    const src = sound.source;
    if (src && typeof src.onended !== 'undefined') {
      src.onended = () => {
        if (obj.parent) obj.parent.remove(obj);
        // Clear from activeSounds when it ends
        if (this.activeSounds[key] === sound) {
          this.activeSounds[key] = null;
        }
      };
    }
  }

  playSound(key, position, intensity = 1.0) {
    // If audio isn't active yet, ignore the request to prevent crashes
    if (!this.isAudioActive) return;

    let file = this.sources[key];
    if (!file) return;

    // Handle array of files - pick one randomly
    let cacheKey = key;
    if (Array.isArray(file)) {
      const randomIndex = Math.floor(Math.random() * file.length);
      file = file[randomIndex];
      cacheKey = `${key}_${randomIndex}`; // Unique cache key for each variation
      console.log(`[SoundManager] Playing random ${key} variation: ${randomIndex + 1}/${this.sources[key].length}`);
    }

    const base = this.baseVolumes[key] != null ? this.baseVolumes[key] : 1.0;
    const safeIntensity = Number.isFinite(intensity) ? Math.max(0, intensity) : 1.0;
    const volume = base * safeIntensity;

    if (this.soundBuffers[cacheKey]) {
      this._playFromBuffer(key, this.soundBuffers[cacheKey], position, volume);
      return;
    }

    this.audioLoader.load(
      file,
      (buffer) => {
        this.soundBuffers[cacheKey] = buffer;
        this._playFromBuffer(key, buffer, position, volume);
      },
      undefined,
      (err) => {
        console.error('[SoundManager] Failed to load sound:', file, err);
      }
    );
  }
}