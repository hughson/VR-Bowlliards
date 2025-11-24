// --- Stats Tracker with Username + PIN Auth ---
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  addDoc,
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase config (from your existing leaderboard.js)
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

export class StatsTracker {
  constructor() {
    this.db = db;
    this.playersCollection = collection(this.db, 'players');
    this.gamesCollection = collection(this.db, 'games');
    
    this.currentPlayer = null;
    this.isLoggedIn = false;
  }

  // === AUTHENTICATION METHODS ===
  
  // Register a new player with username + PIN
  async register(username, pin) {
    const cleanUsername = username.trim().toLowerCase();
    
    // Check if username is taken
    const playerDoc = await getDoc(doc(this.db, 'players', cleanUsername));
    if (playerDoc.exists()) {
      return { success: false, error: 'Username already taken' };
    }
    
    // Create new player
    const playerData = {
      username: cleanUsername,
      displayName: username.trim(),
      pin: pin,
      createdAt: new Date().toISOString(),
      // Aggregate stats (updated after each game)
      totalGames: 0,
      highScore: 0,
      totalScore: 0,
      highRun: 0,
      highFrameScore: 0,
      maxBreakBalls: 0,
      totalBallsMade: 0,
      totalShots: 0,
      strikeFrames: 0,
      spareFrames: 0,
      openFrames: 0,
      // Win/Loss/Tie record (multiplayer games only)
      wins: 0,
      losses: 0,
      ties: 0
    };
    
    await setDoc(doc(this.db, 'players', cleanUsername), playerData);
    
    this.currentPlayer = playerData;
    this.isLoggedIn = true;
    
    // Save to localStorage
    localStorage.setItem('bowlliards_username', cleanUsername);
    localStorage.setItem('bowlliards_pin', pin);
    
    return { success: true, player: playerData };
  }
  
  // Login with username + PIN
  async login(username, pin) {
    const cleanUsername = username.trim().toLowerCase();
    
    const playerDoc = await getDoc(doc(this.db, 'players', cleanUsername));
    if (!playerDoc.exists()) {
      return { success: false, error: 'Username not found' };
    }
    
    const playerData = playerDoc.data();
    if (playerData.pin !== pin) {
      return { success: false, error: 'Incorrect PIN' };
    }
    
    this.currentPlayer = playerData;
    this.isLoggedIn = true;
    
    // Save to localStorage
    localStorage.setItem('bowlliards_username', cleanUsername);
    localStorage.setItem('bowlliards_pin', pin);
    
    return { success: true, player: playerData };
  }
  
  // Try auto-login from localStorage
  async autoLogin() {
    const username = localStorage.getItem('bowlliards_username');
    const pin = localStorage.getItem('bowlliards_pin');
    
    if (username && pin) {
      const result = await this.login(username, pin);
      return result;
    }
    return { success: false, error: 'No saved credentials' };
  }
  
  // Logout
  logout() {
    this.currentPlayer = null;
    this.isLoggedIn = false;
    localStorage.removeItem('bowlliards_username');
    localStorage.removeItem('bowlliards_pin');
  }
  
  // Check if username exists
  async checkUsername(username) {
    const cleanUsername = username.trim().toLowerCase();
    const playerDoc = await getDoc(doc(this.db, 'players', cleanUsername));
    return playerDoc.exists();
  }


  // === GAME DATA METHODS ===
  
  // Save a completed game
  async saveGame(gameData) {
    if (!this.isLoggedIn || !this.currentPlayer) {
      console.warn('[StatsTracker] Cannot save game - not logged in');
      return { success: false, error: 'Not logged in' };
    }
    
    const username = this.currentPlayer.username;
    
    // Create game record
    const game = {
      username: username,
      score: gameData.score || 0,
      frames: gameData.frames || [],
      breaks: gameData.breaks || [],
      frameScores: gameData.frameScores || [],
      timestamp: new Date().toISOString(),
      // Multiplayer game data
      isMultiplayer: gameData.isMultiplayer || false,
      opponentScore: gameData.opponentScore || 0,
      gameResult: gameData.gameResult || null  // 'win', 'loss', 'tie', or null for solo
    };
    
    // Save game to games collection
    await addDoc(this.gamesCollection, game);
    
    // Update player aggregate stats
    await this.updatePlayerStats(username, game);
    
    return { success: true };
  }
  
  // Update player aggregate stats after a game
  async updatePlayerStats(username, game) {
    const playerRef = doc(this.db, 'players', username);
    const playerDoc = await getDoc(playerRef);
    
    if (!playerDoc.exists()) return;
    
    const current = playerDoc.data();
    const gameScore = game.score || 0;
    
    // Calculate game-specific stats
    const gameStats = this.calculateGameStats(game);
    
    // Update aggregates
    const updates = {
      totalGames: (current.totalGames || 0) + 1,
      totalScore: (current.totalScore || 0) + gameScore,
      highScore: Math.max(current.highScore || 0, gameScore),
      highRun: Math.max(current.highRun || 0, gameStats.highRun),
      highFrameScore: Math.max(current.highFrameScore || 0, gameStats.highFrameScore),
      maxBreakBalls: Math.max(current.maxBreakBalls || 0, gameStats.maxBreakBalls),
      totalBallsMade: (current.totalBallsMade || 0) + gameStats.totalBallsMade,
      totalShots: (current.totalShots || 0) + gameStats.totalShots,
      strikeFrames: (current.strikeFrames || 0) + gameStats.strikeFrames,
      spareFrames: (current.spareFrames || 0) + gameStats.spareFrames,
      openFrames: (current.openFrames || 0) + gameStats.openFrames
    };
    
    // Update win/loss/tie record for multiplayer games
    if (game.gameResult === 'win') {
      updates.wins = (current.wins || 0) + 1;
    } else if (game.gameResult === 'loss') {
      updates.losses = (current.losses || 0) + 1;
    } else if (game.gameResult === 'tie') {
      updates.ties = (current.ties || 0) + 1;
    }
    
    await updateDoc(playerRef, updates);
    
    // Update local cache
    this.currentPlayer = { ...this.currentPlayer, ...updates };
  }


  // Calculate stats from a single game (uses logic from stats.js)
  calculateGameStats(game) {
    let highFrameScore = 0;
    let maxBreakBalls = 0;
    let totalBallsMade = 0;
    let totalShots = 0;
    let strikeFrames = 0;
    let spareFrames = 0;
    let openFrames = 0;
    
    const frames = game.frames || [];
    const breaks = game.breaks || [];
    
    // Process frames
    frames.forEach((frame, i) => {
      const rolls = frame.rolls || [frame.roll1 || 0, frame.roll2 || 0, frame.roll3 || 0].filter(r => r != null);
      const roll1 = rolls[0] || 0;
      const roll2 = rolls[1] || 0;
      
      // Frame type counting
      if (roll1 === 10) {
        strikeFrames++;
        // Calculate strike frame score
        let nextRoll1 = 0, nextRoll2 = 0;
        if (i + 1 < frames.length) {
          const nextFrame = frames[i + 1];
          const nextRolls = nextFrame.rolls || [nextFrame.roll1 || 0, nextFrame.roll2 || 0];
          nextRoll1 = nextRolls[0] || 0;
          if (nextRoll1 === 10 && i + 2 < frames.length) {
            const nextNextFrame = frames[i + 2];
            const nextNextRolls = nextNextFrame.rolls || [nextNextFrame.roll1 || 0];
            nextRoll2 = nextNextRolls[0] || 0;
          } else {
            nextRoll2 = nextRolls[1] || 0;
          }
        }
        const frameScore = 10 + nextRoll1 + nextRoll2;
        highFrameScore = Math.max(highFrameScore, frameScore);
      } else if (roll1 + roll2 === 10) {
        spareFrames++;
        let nextRoll = 0;
        if (i + 1 < frames.length) {
          const nextFrame = frames[i + 1];
          const nextRolls = nextFrame.rolls || [nextFrame.roll1 || 0];
          nextRoll = nextRolls[0] || 0;
        }
        const frameScore = 10 + nextRoll;
        highFrameScore = Math.max(highFrameScore, frameScore);
      } else {
        openFrames++;
        highFrameScore = Math.max(highFrameScore, roll1 + roll2);
      }
      
      // Get break balls for this frame (if any)
      const breakBallsThisFrame = breaks[i]?.breaks?.[0] || 0;
      maxBreakBalls = Math.max(maxBreakBalls, breakBallsThisFrame);
      
      // Potting average calculation - EXCLUDE break balls for accurate skill measurement
      const frameTotal = rolls.reduce((s, v) => s + (v || 0), 0);
      const skillBallsMade = frameTotal - breakBallsThisFrame;  // Subtract break balls
      totalBallsMade += skillBallsMade;
      
      const sumTwo = roll1 + roll2;
      // Calculate shots: total balls for strike, +1 for spare, +2 for open
      // Subtract the actual number of break balls (not just 1)
      let shots = roll1 === 10 ? frameTotal : (sumTwo === 10 ? frameTotal + 1 : frameTotal + 2);
      shots -= breakBallsThisFrame;  // Subtract actual break balls made, not just 1
      totalShots += Math.max(0, shots);  // Ensure non-negative
    });
    
    // High Run calculation
    const highRun = this.calculateHighRun([game]);
    
    return {
      highFrameScore,
      maxBreakBalls,
      totalBallsMade,
      totalShots,
      strikeFrames,
      spareFrames,
      openFrames,
      highRun
    };
  }


  // High Run calculation (from stats.js)
  calculateHighRun(games) {
    let maxHighRun = 0;

    games.forEach(game => {
      let currentRun = 0;
      let gameHighRun = 0;
      
      if (Array.isArray(game.frames) && game.frames.length && 
          Array.isArray(game.frames[0].rolls) && Array.isArray(game.breaks)) {
        
        game.frames.forEach((frame, frameIndex) => {
          const rolls = frame.rolls || [];
          const breakBalls = game.breaks[frameIndex]?.breaks?.[0] || 0;
          const frameBallsMade = rolls.reduce((sum, roll) => sum + (roll || 0), 0);
          const roll1 = rolls[0] || 0;
          const roll2 = rolls[1] || 0;
          
          if (frameIndex === 9) {
            const totalSkillBalls = frameBallsMade - breakBalls;
            currentRun += totalSkillBalls;
            gameHighRun = Math.max(gameHighRun, currentRun);
          } else {
            if (roll1 === 10) {
              const skillBalls = roll1 - breakBalls;
              currentRun += skillBalls;
              gameHighRun = Math.max(gameHighRun, currentRun);
            } else if (roll1 > 0) {
              const skillBalls = Math.max(0, roll1 - breakBalls);
              currentRun += skillBalls;
              gameHighRun = Math.max(gameHighRun, currentRun);
              currentRun = 0;
            } else {
              gameHighRun = Math.max(gameHighRun, currentRun);
              currentRun = 0;
            }
            
            if (roll1 < 10 && roll2 > 0) {
              currentRun = roll2;
              gameHighRun = Math.max(gameHighRun, currentRun);
              if (roll1 + roll2 !== 10) {
                currentRun = 0;
              }
            }
          }
        });
        
        gameHighRun = Math.max(gameHighRun, currentRun);
      } else {
        // Legacy format
        const allRolls = [];
        if (Array.isArray(game.frames)) {
          game.frames.forEach(frame => {
            if (Array.isArray(frame.rolls)) {
              frame.rolls.forEach(roll => { if (roll != null) allRolls.push(roll); });
            } else {
              [frame.roll1, frame.roll2, frame.roll3].filter(r => r != null).forEach(r => allRolls.push(r));
            }
          });
        }
        
        allRolls.forEach(roll => {
          if (roll === 10) { currentRun += 10; gameHighRun = Math.max(gameHighRun, currentRun); }
          else if (roll > 0) { currentRun += roll; gameHighRun = Math.max(gameHighRun, currentRun); }
          else { gameHighRun = Math.max(gameHighRun, currentRun); currentRun = 0; }
        });
      }
      
      maxHighRun = Math.max(maxHighRun, gameHighRun);
    });

    return maxHighRun;
  }


  // === LEADERBOARD METHODS ===
  
  // Get leaderboard for a specific stat
  async getLeaderboard(statKey, count = 100) {
    try {
      const q = query(
        this.playersCollection,
        where(statKey, '>', 0),
        orderBy(statKey, 'desc'),
        limit(count)
      );
      
      const snapshot = await getDocs(q);
      const results = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        results.push({
          name: data.displayName || data.username,
          value: data[statKey] || 0,
          username: data.username
        });
      });
      
      return results;
    } catch (e) {
      console.error('[StatsTracker] Error loading leaderboard:', e);
      return [];
    }
  }
  
  // Get average score leaderboard (calculated field)
  async getAvgScoreLeaderboard(count = 100) {
    try {
      // Get all players with at least 1 game
      const q = query(
        this.playersCollection,
        where('totalGames', '>=', 1),
        orderBy('totalGames', 'desc'),
        limit(500) // Get more to sort by avg
      );
      
      const snapshot = await getDocs(q);
      const results = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const avg = data.totalGames > 0 ? (data.totalScore / data.totalGames) : 0;
        results.push({
          name: data.displayName || data.username,
          value: Math.round(avg * 10) / 10, // 1 decimal
          username: data.username
        });
      });
      
      // Sort by average descending
      results.sort((a, b) => b.value - a.value);
      
      return results.slice(0, count);
    } catch (e) {
      console.error('[StatsTracker] Error loading avg leaderboard:', e);
      return [];
    }
  }
  
  // Get potting average leaderboard
  async getPottingAvgLeaderboard(count = 100) {
    try {
      const q = query(
        this.playersCollection,
        where('totalShots', '>=', 1),
        orderBy('totalShots', 'desc'),
        limit(500)
      );
      
      const snapshot = await getDocs(q);
      const results = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const avg = data.totalShots > 0 ? (data.totalBallsMade / data.totalShots) : 0;
        results.push({
          name: data.displayName || data.username,
          value: avg.toFixed(3).replace(/^0/, ''),
          username: data.username
        });
      });
      
      results.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
      
      return results.slice(0, count);
    } catch (e) {
      console.error('[StatsTracker] Error loading potting avg leaderboard:', e);
      return [];
    }
  }
  
  // Get win record leaderboard (sorted by wins, shows W-L-T)
  async getWinRecordLeaderboard(count = 100) {
    try {
      const q = query(
        this.playersCollection,
        where('wins', '>=', 1),
        orderBy('wins', 'desc'),
        limit(count)
      );
      
      const snapshot = await getDocs(q);
      const results = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const wins = data.wins || 0;
        const losses = data.losses || 0;
        const ties = data.ties || 0;
        const totalMP = wins + losses + ties;
        const winPct = totalMP > 0 ? Math.round((wins / totalMP) * 100) : 0;
        results.push({
          name: data.displayName || data.username,
          value: `${wins}-${losses}-${ties}`,
          wins: wins,
          winPct: winPct,
          username: data.username
        });
      });
      
      // Sort by wins, then win percentage
      results.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
      
      return results.slice(0, count);
    } catch (e) {
      console.error('[StatsTracker] Error loading win record leaderboard:', e);
      return [];
    }
  }


  // === PERSONAL STATS METHODS ===
  
  // Get current player's stats for VR display
  getMyStats() {
    if (!this.isLoggedIn || !this.currentPlayer) {
      return null;
    }
    
    const p = this.currentPlayer;
    const totalFrames = (p.strikeFrames || 0) + (p.spareFrames || 0) + (p.openFrames || 0);
    
    return {
      totalGames: p.totalGames || 0,
      highScore: p.highScore || 0,
      avgScore: p.totalGames > 0 ? Math.round((p.totalScore / p.totalGames) * 10) / 10 : 0,
      pottingAvg: p.totalShots > 0 ? (p.totalBallsMade / p.totalShots).toFixed(3).replace(/^0/, '') : '.000',
      highRun: p.highRun || 0,
      highFrameScore: p.highFrameScore || 0,
      maxBreakBalls: p.maxBreakBalls || 0,
      strikePercent: totalFrames > 0 ? Math.round((p.strikeFrames / totalFrames) * 100) : 0,
      sparePercent: totalFrames > 0 ? Math.round((p.spareFrames / totalFrames) * 100) : 0,
      openPercent: totalFrames > 0 ? Math.round((p.openFrames / totalFrames) * 100) : 0,
      // Win/Loss/Tie record
      wins: p.wins || 0,
      losses: p.losses || 0,
      ties: p.ties || 0,
      winPercent: (p.wins || 0) + (p.losses || 0) + (p.ties || 0) > 0 
        ? Math.round(((p.wins || 0) / ((p.wins || 0) + (p.losses || 0) + (p.ties || 0))) * 100) 
        : 0
    };
  }
  
  // Get player's game history
  async getMyGames(limitCount = 50) {
    if (!this.isLoggedIn || !this.currentPlayer) {
      return [];
    }
    
    try {
      // Try query with ordering (requires composite index)
      const q = query(
        this.gamesCollection,
        where('username', '==', this.currentPlayer.username),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      const games = [];
      
      snapshot.forEach(doc => {
        games.push({ id: doc.id, ...doc.data() });
      });
      
      return games;
    } catch (e) {
      // If composite index doesn't exist, fall back to simple query + client-side sort
      console.warn('[StatsTracker] Composite index missing, using fallback query:', e.message);
      
      try {
        const fallbackQ = query(
          this.gamesCollection,
          where('username', '==', this.currentPlayer.username),
          limit(limitCount * 2)  // Get more since we'll sort client-side
        );
        
        const snapshot = await getDocs(fallbackQ);
        const games = [];
        
        snapshot.forEach(doc => {
          games.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by timestamp descending client-side
        games.sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return timeB - timeA;
        });
        
        return games.slice(0, limitCount);
      } catch (fallbackError) {
        console.error('[StatsTracker] Error loading games (fallback):', fallbackError);
        return [];
      }
    }
  }
  
  // Refresh current player data from DB
  async refreshStats() {
    if (!this.isLoggedIn || !this.currentPlayer) return;
    
    const playerDoc = await getDoc(doc(this.db, 'players', this.currentPlayer.username));
    if (playerDoc.exists()) {
      this.currentPlayer = playerDoc.data();
    }
  }
}
