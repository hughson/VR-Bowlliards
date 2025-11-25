// playerAuth.js - Username + PIN authentication system (no login required)
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase config (same as leaderboard.js)
const firebaseConfig = {
  apiKey: "AIzaSyDorLca4yCzbdPuLVfj0GuH65OrMzz4VJE",
  authDomain: "vr-bowlliards.firebaseapp.com",
  projectId: "vr-bowlliards",
  storageBucket: "vr-bowlliards.firebasestorage.app",
  messagingSenderId: "1067404069820",
  appId: "1:1067404069820:web:e069b9b74556ae48d8b9b9",
  measurementId: "G-60X7P2GKJ2"
};

// Initialize Firebase (only once)
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
const db = getFirestore(app);

export class PlayerAuth {
  constructor() {
    this.db = db;
    this.currentPlayer = null;
    this.playersCollection = 'bowlliards_players';
  }

  // Check if username exists
  async usernameExists(username) {
    const normalizedName = username.toLowerCase().trim();
    const docRef = doc(this.db, this.playersCollection, normalizedName);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  }

  // Register new player with username + PIN
  async register(username, pin) {
    const normalizedName = username.toLowerCase().trim();
    const displayName = username.trim();
    
    if (normalizedName.length < 2 || normalizedName.length > 20) {
      return { success: false, error: 'Username must be 2-20 characters' };
    }
    
    if (!/^\d{4}$/.test(pin)) {
      return { success: false, error: 'PIN must be exactly 4 digits' };
    }

    // Check if username taken
    if (await this.usernameExists(normalizedName)) {
      return { success: false, error: 'Username already taken' };
    }

    try {
      const playerData = {
        displayName: displayName,
        pin: pin, // In production, hash this!
        createdAt: new Date().toISOString(),
        stats: {
          totalGames: 0,
          highScore: 0,
          totalScoreSum: 0,
          highRun: 0,
          highFrameScore: 0,
          maxBreakBalls: 0,
          strikeFrames: 0,
          spareFrames: 0,
          openFrames: 0,
          totalBallsMade: 0,
          totalShots: 0
        }
      };

      await setDoc(doc(this.db, this.playersCollection, normalizedName), playerData);
      
      this.currentPlayer = { id: normalizedName, ...playerData };
      this._saveToLocalStorage(normalizedName, pin);
      
      return { success: true, player: this.currentPlayer };
    } catch (e) {
      console.error('Registration error:', e);
      return { success: false, error: 'Failed to register. Try again.' };
    }
  }

  // Login with username + PIN
  async login(username, pin) {
    const normalizedName = username.toLowerCase().trim();
    
    try {
      const docRef = doc(this.db, this.playersCollection, normalizedName);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return { success: false, error: 'Username not found' };
      }

      const playerData = docSnap.data();
      
      if (playerData.pin !== pin) {
        return { success: false, error: 'Incorrect PIN' };
      }

      this.currentPlayer = { id: normalizedName, ...playerData };
      this._saveToLocalStorage(normalizedName, pin);
      
      return { success: true, player: this.currentPlayer };
    } catch (e) {
      console.error('Login error:', e);
      return { success: false, error: 'Login failed. Try again.' };
    }
  }

  // Auto-login from localStorage
  async autoLogin() {
    const saved = this._getFromLocalStorage();
    if (!saved) return { success: false };
    
    return await this.login(saved.username, saved.pin);
  }

  // Update player stats after a game
  async updateStats(gameStats) {
    if (!this.currentPlayer) {
      console.warn('[PlayerAuth] No player logged in');
      return false;
    }

    try {
      const docRef = doc(this.db, this.playersCollection, this.currentPlayer.id);
      const docSnap = await getDoc(docRef);
      const current = docSnap.data().stats || {};

      const newStats = {
        totalGames: (current.totalGames || 0) + 1,
        highScore: Math.max(current.highScore || 0, gameStats.score || 0),
        totalScoreSum: (current.totalScoreSum || 0) + (gameStats.score || 0),
        highRun: Math.max(current.highRun || 0, gameStats.highRun || 0),
        highFrameScore: Math.max(current.highFrameScore || 0, gameStats.highFrameScore || 0),
        maxBreakBalls: Math.max(current.maxBreakBalls || 0, gameStats.maxBreakBalls || 0),
        strikeFrames: (current.strikeFrames || 0) + (gameStats.strikeFrames || 0),
        spareFrames: (current.spareFrames || 0) + (gameStats.spareFrames || 0),
        openFrames: (current.openFrames || 0) + (gameStats.openFrames || 0),
        totalBallsMade: (current.totalBallsMade || 0) + (gameStats.totalBallsMade || 0),
        totalShots: (current.totalShots || 0) + (gameStats.totalShots || 0)
      };

      await updateDoc(docRef, { stats: newStats });
      this.currentPlayer.stats = newStats;
      
      return true;
    } catch (e) {
      console.error('Failed to update stats:', e);
      return false;
    }
  }

  // Get current player stats
  getStats() {
    if (!this.currentPlayer) return null;
    return this.currentPlayer.stats;
  }

  // Get calculated stats (averages, percentages)
  getCalculatedStats() {
    const stats = this.getStats();
    if (!stats) return null;

    const totalFrames = stats.strikeFrames + stats.spareFrames + stats.openFrames;
    
    return {
      totalGames: stats.totalGames,
      highScore: stats.highScore,
      avgScore: stats.totalGames > 0 ? (stats.totalScoreSum / stats.totalGames).toFixed(1) : '0.0',
      pottingAvg: stats.totalShots > 0 ? (stats.totalBallsMade / stats.totalShots).toFixed(3).replace(/^0/, '') : '.000',
      highRun: stats.highRun,
      highFrameScore: stats.highFrameScore,
      maxBreakBalls: stats.maxBreakBalls,
      strikePercent: totalFrames > 0 ? ((stats.strikeFrames / totalFrames) * 100).toFixed(1) : '0.0',
      sparePercent: totalFrames > 0 ? ((stats.spareFrames / totalFrames) * 100).toFixed(1) : '0.0',
      openPercent: totalFrames > 0 ? ((stats.openFrames / totalFrames) * 100).toFixed(1) : '0.0',
      strikeFrames: stats.strikeFrames,
      spareFrames: stats.spareFrames,
      openFrames: stats.openFrames
    };
  }

  logout() {
    this.currentPlayer = null;
    localStorage.removeItem('bowlliards_auth');
  }

  isLoggedIn() {
    return this.currentPlayer !== null;
  }

  getDisplayName() {
    return this.currentPlayer?.displayName || 'Guest';
  }

  _saveToLocalStorage(username, pin) {
    localStorage.setItem('bowlliards_auth', JSON.stringify({ username, pin }));
  }

  _getFromLocalStorage() {
    try {
      const data = localStorage.getItem('bowlliards_auth');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}

export const playerAuth = new PlayerAuth();
