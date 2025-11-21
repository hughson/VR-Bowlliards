import * as THREE from 'three';

export class SoundManager {
  constructor(camera) {
    this.camera = camera;
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);
    
    this.soundBuffers = {};
    this.activeSounds = {}; // Track playing sounds for toggling
    this.loader = new THREE.AudioLoader();
    
    // Mapping logical names to the filenames you provided
    this.sources = {
      ballHit: 'sound when do balls make impact with one another.mp3',
      cushionHit: 'ball hits cusion.mp3',
      pocketHard: 'ball falling into pocket hard shot.mp3',
      pocketSoft: 'ball falling in pocket slowly.mp3',
      cueHitHard: 'impact of cue hitting cue ball harder.mp3',
      cueHitSoft: 'impact of cue hitting cue.mp3',
      // --- NEW: The Movie Audio ---
      hustlerMovie: 'The VR Hustler (Full Movie).mp3'
    };

    // Time tracking to prevent audio phasing
    this.lastPlayTimes = {}; 
    
    this.loadSounds();
  }

  loadSounds() {
    for (const [key, file] of Object.entries(this.sources)) {
      this.loader.load(file, (buffer) => {
        this.soundBuffers[key] = buffer;
      }, undefined, (err) => {
        console.warn(`Error loading sound ${file}:`, err);
      });
    }
  }

  /**
   * Plays a sound at a specific 3D location
   */
  playSound(soundKey, position, intensity = 10) {
    if (!this.soundBuffers[soundKey]) return;

    const now = performance.now();
    if (this.lastPlayTimes[soundKey] && (now - this.lastPlayTimes[soundKey] < 30)) {
      return; 
    }
    this.lastPlayTimes[soundKey] = now;

    let volume = Math.min(Math.abs(intensity) / 10, 1.0);
    if (volume < 0.05) return;

    const sound = new THREE.PositionalAudio(this.audioListener);
    sound.setBuffer(this.soundBuffers[soundKey]);
    sound.setRefDistance(1.0); 
    sound.setRolloffFactor(1.0); 
    sound.setVolume(volume);

    const soundObj = new THREE.Object3D();
    soundObj.position.copy(position);
    this.camera.parent.add(soundObj); 
    soundObj.add(sound);

    sound.play();

    sound.onEnded = () => {
      if (sound.isPlaying) sound.stop();
      sound.disconnect();
      soundObj.remove(sound);
      soundObj.parent.remove(soundObj);
    };
  }

  // --- NEW: Toggle specific audio (for the movie button) ---
  toggleSound(soundKey, position) {
    if (!this.soundBuffers[soundKey]) return false;

    // If sound is already playing, stop it
    if (this.activeSounds[soundKey]) {
      const oldSound = this.activeSounds[soundKey];
      if (oldSound.isPlaying) oldSound.stop();
      oldSound.disconnect();
      
      // Cleanup parent object if it exists
      if (oldSound.parent && oldSound.parent.parent) {
        oldSound.parent.parent.remove(oldSound.parent);
      }
      
      delete this.activeSounds[soundKey];
      return false; // State: OFF
    } 
    
    // If not playing, start it
    const sound = new THREE.PositionalAudio(this.audioListener);
    sound.setBuffer(this.soundBuffers[soundKey]);
    sound.setRefDistance(2.0); // Audbile from further away
    sound.setRolloffFactor(0.5); // Gentle rolloff so you can hear it around the table
    sound.setVolume(1.0);
    sound.setLoop(true); // Loop the movie? Or play once. Let's loop for ambience.

    const soundObj = new THREE.Object3D();
    soundObj.position.copy(position);
    this.camera.parent.add(soundObj);
    soundObj.add(sound);

    sound.play();
    this.activeSounds[soundKey] = sound;
    
    return true; // State: ON
  }
}