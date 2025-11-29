// ============================================
// VOICE CHAT - WebRTC Voice Communication
// Peer-to-peer voice chat for multiplayer
// ============================================

import * as THREE from 'three';

export class VoiceChat {
  constructor(game) {
    this.game = game;
    this.localStream = null;
    this.peerConnection = null;
    this.remoteAudio = null;
    
    // State
    this.isInitialized = false;
    this.isConnected = false;
    this.localMuted = false;
    this.remoteMuted = false;
    
    // WebRTC config (using public STUN servers)
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
    
    // Create hidden audio element for remote audio
    this.remoteAudio = document.createElement('audio');
    this.remoteAudio.autoplay = true;
    this.remoteAudio.playsInline = true;
    this.remoteAudio.muted = false;
    this.remoteAudio.volume = 1.0;
    this.remoteAudio.id = 'remoteVoiceAudio';
    document.body.appendChild(this.remoteAudio);
    
    // Debug: log when audio starts playing
    this.remoteAudio.addEventListener('playing', () => {
      console.log('[VOICE] Remote audio element is now playing!');
    });
    this.remoteAudio.addEventListener('error', (e) => {
      console.error('[VOICE] Audio element error:', e);
    });
    
    // Bind methods
    this.handleIceCandidate = this.handleIceCandidate.bind(this);
    this.handleTrack = this.handleTrack.bind(this);
    this.handleConnectionStateChange = this.handleConnectionStateChange.bind(this);
    
    console.log('[VOICE] VoiceChat initialized');
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  
  async init() {
    if (this.isInitialized) {
      console.log('[VOICE] Already initialized');
      return true;
    }
    
    try {
      // Check if we have a preauthorized stream from lobby
      if (window.preauthorizedMicStream) {
        console.log('[VOICE] Using preauthorized microphone stream');
        this.game.showNotification('🎤 Using pre-authorized mic', 1500);
        this.localStream = window.preauthorizedMicStream;
        window.preauthorizedMicStream = null; // Clear it so it's not reused
      } else {
        // Request microphone access
        console.log('[VOICE] Requesting microphone access...');
        this.game.showNotification('🎤 Requesting mic permission...', 2000);
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
      }
      
      console.log('[VOICE] Microphone access granted');
      this.game.showNotification('✅ Mic access granted!', 1500);
      this.isInitialized = true;
      
      // Apply initial mute state
      this.setLocalMuted(this.localMuted);
      
      return true;
    } catch (error) {
      console.error('[VOICE] Failed to get microphone access:', error);
      this.game.showNotification('❌ Mic denied: ' + error.name, 3000);
      return false;
    }
  }
  
  // ============================================
  // PEER CONNECTION SETUP
  // ============================================
  
  createPeerConnection() {
    if (this.peerConnection) {
      console.log('[VOICE] Closing existing peer connection');
      this.peerConnection.close();
    }
    
    console.log('[VOICE] Creating new peer connection');
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    
    // Add local audio track to connection
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      console.log('[VOICE] Local stream has', audioTracks.length, 'audio tracks');
      audioTracks.forEach(track => {
        console.log('[VOICE] Adding local audio track:', track.label, 'enabled:', track.enabled);
        this.peerConnection.addTrack(track, this.localStream);
      });
    } else {
      console.warn('[VOICE] No local stream available when creating peer connection!');
    }
    
    // Set up event handlers
    this.peerConnection.onicecandidate = this.handleIceCandidate;
    this.peerConnection.ontrack = this.handleTrack;
    this.peerConnection.onconnectionstatechange = this.handleConnectionStateChange;
    
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[VOICE] ICE connection state:', this.peerConnection.iceConnectionState);
    };
    
    this.peerConnection.onnegotiationneeded = () => {
      console.log('[VOICE] Negotiation needed');
    };
    
    return this.peerConnection;
  }
  
  handleIceCandidate(event) {
    if (event.candidate) {
      console.log('[VOICE] Sending ICE candidate');
      // Send ICE candidate to peer via signaling server
      if (this.game.networkManager && this.game.networkManager.socket) {
        this.game.networkManager.socket.emit('voiceIceCandidate', {
          roomCode: this.game.networkManager.roomCode,
          candidate: event.candidate
        });
      }
    }
  }
  
  handleTrack(event) {
    console.log('[VOICE] ====== RECEIVED REMOTE TRACK ======');
    console.log('[VOICE] Track kind:', event.track.kind);
    console.log('[VOICE] Track enabled:', event.track.enabled);
    console.log('[VOICE] Track muted:', event.track.muted);
    console.log('[VOICE] Streams count:', event.streams ? event.streams.length : 0);
    
    if (event.streams && event.streams[0]) {
      const stream = event.streams[0];
      console.log('[VOICE] Stream ID:', stream.id);
      console.log('[VOICE] Stream active:', stream.active);
      console.log('[VOICE] Stream tracks:', stream.getTracks().length);
      
      this.remoteAudio.srcObject = stream;
      this.remoteAudio.volume = 1.0;
      this.remoteAudio.muted = false;
      
      // Log audio element state
      console.log('[VOICE] Audio element srcObject set');
      console.log('[VOICE] Audio element muted:', this.remoteAudio.muted);
      console.log('[VOICE] Audio element volume:', this.remoteAudio.volume);
      
      // Try to play (may need user interaction on some browsers)
      this.remoteAudio.play().then(() => {
        console.log('[VOICE] ✓ Remote audio playing successfully!');
        this.isConnected = true;
        this.game.showNotification('🎤 Voice chat connected!', 2000);
      }).catch(err => {
        console.error('[VOICE] ✗ Error playing remote audio:', err);
        console.error('[VOICE] Error name:', err.name);
        // Try resuming AudioContext if that's the issue
        if (err.name === 'NotAllowedError') {
          this.game.showNotification('Click anywhere to enable voice audio', 3000);
          // Add one-time click handler to resume audio
          const resumeAudio = () => {
            this.remoteAudio.play().then(() => {
              console.log('[VOICE] Audio resumed after user interaction');
              this.game.showNotification('🎤 Voice chat enabled!', 2000);
            }).catch(e => console.error('[VOICE] Still cannot play:', e));
            document.removeEventListener('click', resumeAudio);
          };
          document.addEventListener('click', resumeAudio);
        }
        this.isConnected = true;
      });
    } else {
      console.warn('[VOICE] No streams in track event!');
    }
    console.log('[VOICE] ====== END REMOTE TRACK ======');
  }
  
  handleConnectionStateChange() {
    const state = this.peerConnection.connectionState;
    console.log('[VOICE] Connection state changed:', state);
    
    if (state === 'connected') {
      this.isConnected = true;
      console.log('[VOICE] Peer connection established!');
    } else if (state === 'disconnected' || state === 'failed') {
      this.isConnected = false;
      console.log('[VOICE] Peer connection lost');
    }
  }

  // ============================================
  // SIGNALING - Create and Handle Offers/Answers
  // ============================================
  
  async startCall() {
    console.log('[VOICE] ====== STARTING CALL ======');
    this.game.showNotification('📞 Starting voice call...', 2000);
    
    // Initialize if not already done
    if (!this.isInitialized) {
      console.log('[VOICE] Need to initialize first...');
      this.game.showNotification('🎤 Initializing mic...', 2000);
      const success = await this.init();
      if (!success) {
        console.error('[VOICE] Failed to init');
        this.game.showNotification('❌ Mic init failed', 3000);
        return;
      }
    }
    
    console.log('[VOICE] Creating peer connection and offer...');
    this.createPeerConnection();
    
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      console.log('[VOICE] Sending offer to peer');
      this.game.showNotification('📤 Sending voice offer...', 2000);
      
      if (this.game.networkManager && this.game.networkManager.socket) {
        this.game.networkManager.socket.emit('voiceOffer', {
          roomCode: this.game.networkManager.roomCode,
          offer: offer
        });
        console.log('[VOICE] Offer sent to room:', this.game.networkManager.roomCode);
      } else {
        console.error('[VOICE] No socket to send offer!');
        this.game.showNotification('❌ No connection', 3000);
      }
    } catch (error) {
      console.error('[VOICE] Error creating offer:', error);
      this.game.showNotification('❌ Offer error: ' + error.message, 3000);
    }
  }
  
  async handleOffer(offer) {
    console.log('[VOICE] ====== RECEIVED OFFER ======');
    this.game.showNotification('📞 Voice call incoming...', 2000);
    
    // Initialize if not already done
    if (!this.isInitialized) {
      console.log('[VOICE] Not initialized, initializing now...');
      this.game.showNotification('🎤 Requesting mic access...', 2000);
      const success = await this.init();
      if (!success) {
        console.error('[VOICE] Failed to init when handling offer');
        this.game.showNotification('❌ Mic access denied', 3000);
        return;
      }
    }
    
    this.createPeerConnection();
    
    try {
      console.log('[VOICE] Setting remote description (offer)...');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      console.log('[VOICE] Creating answer...');
      const answer = await this.peerConnection.createAnswer();
      
      console.log('[VOICE] Setting local description (answer)...');
      await this.peerConnection.setLocalDescription(answer);
      
      console.log('[VOICE] Sending answer to peer');
      this.game.showNotification('📤 Sending voice answer...', 2000);
      
      if (this.game.networkManager && this.game.networkManager.socket) {
        this.game.networkManager.socket.emit('voiceAnswer', {
          roomCode: this.game.networkManager.roomCode,
          answer: answer
        });
        console.log('[VOICE] Answer sent!');
      } else {
        console.error('[VOICE] No socket available to send answer!');
        this.game.showNotification('❌ Network error', 3000);
      }
    } catch (error) {
      console.error('[VOICE] Error handling offer:', error);
      this.game.showNotification('❌ Voice error: ' + error.message, 3000);
    }
  }
  
  async handleAnswer(answer) {
    console.log('[VOICE] ====== RECEIVED ANSWER ======');
    this.game.showNotification('✅ Voice answer received!', 2000);
    
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[VOICE] Remote description set - connection should establish');
    } catch (error) {
      console.error('[VOICE] Error handling answer:', error);
      this.game.showNotification('❌ Answer error: ' + error.message, 3000);
    }
  }
  
  async handleRemoteIceCandidate(candidate) {
    console.log('[VOICE] Received remote ICE candidate');
    
    if (this.peerConnection && candidate) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[VOICE] Error adding ICE candidate:', error);
      }
    }
  }

  // ============================================
  // MUTE CONTROLS
  // ============================================
  
  setLocalMuted(muted) {
    this.localMuted = muted;
    
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
      console.log('[VOICE] Local microphone', muted ? 'MUTED' : 'UNMUTED');
    }
  }
  
  setRemoteMuted(playerId, muted) {
    this.remoteMuted = muted;
    
    if (this.remoteAudio) {
      this.remoteAudio.muted = muted;
      console.log('[VOICE] Remote audio', muted ? 'MUTED' : 'UNMUTED');
    }
  }
  
  isLocalMuted() {
    return this.localMuted;
  }
  
  isRemoteMuted() {
    return this.remoteMuted;
  }
  
  // Debug method - call from console: game.voiceChat.debug()
  debug() {
    console.log('====== VOICE CHAT DEBUG ======');
    console.log('isInitialized:', this.isInitialized);
    console.log('isConnected:', this.isConnected);
    console.log('localMuted:', this.localMuted);
    console.log('remoteMuted:', this.remoteMuted);
    console.log('localStream:', this.localStream ? 'exists' : 'null');
    if (this.localStream) {
      console.log('  tracks:', this.localStream.getTracks().length);
      this.localStream.getTracks().forEach(t => {
        console.log('  -', t.kind, t.label, 'enabled:', t.enabled);
      });
    }
    console.log('peerConnection:', this.peerConnection ? 'exists' : 'null');
    if (this.peerConnection) {
      console.log('  connectionState:', this.peerConnection.connectionState);
      console.log('  iceConnectionState:', this.peerConnection.iceConnectionState);
      console.log('  signalingState:', this.peerConnection.signalingState);
    }
    console.log('remoteAudio.srcObject:', this.remoteAudio.srcObject ? 'exists' : 'null');
    console.log('remoteAudio.paused:', this.remoteAudio.paused);
    console.log('remoteAudio.muted:', this.remoteAudio.muted);
    console.log('remoteAudio.volume:', this.remoteAudio.volume);
    console.log('====== END DEBUG ======');
    return {
      initialized: this.isInitialized,
      connected: this.isConnected,
      peerState: this.peerConnection?.connectionState,
      iceState: this.peerConnection?.iceConnectionState
    };
  }
  
  // ============================================
  // CLEANUP
  // ============================================
  
  disconnect() {
    console.log('[VOICE] Disconnecting...');
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    this.isConnected = false;
  }
  
  dispose() {
    console.log('[VOICE] Disposing voice chat...');
    
    this.disconnect();
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio.remove();
    }
    
    this.isInitialized = false;
  }
}
