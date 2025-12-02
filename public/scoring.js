// scoring.js
export class BowlliardsRulesEngine {
  constructor() {
    this.frames = [];
    this.currentFrame = 0;   // 0–9
    this.currentInning = 1;  // 1 or 2
    this.breakProcessed = false;

    // For 10th-frame bonus rolls (like bowling)
    this.bonusRolls = 0;     // 0, 1, or 2
    
    // Track break balls per frame for stats (best break, potting average)
    this.breakBalls = [];    // breakBalls[frameIndex] = number of balls made on break

    for (let i = 0; i < 10; i++) {
      this.frames.push({
        inning1: { scored: 0, complete: false },
        inning2: { scored: 0, complete: false },
        bonus: [],          // bonus rolls in 10th frame
        score: 0,
        isStrike: false,
        isSpare: false,
        isOpen: false
      });
      this.breakBalls.push(0);  // Initialize break balls for each frame
    }
  }

  // Reset the rules engine to initial state (for starting new game)
  reset() {
    this.frames = [];
    this.currentFrame = 0;
    this.currentInning = 1;
    this.breakProcessed = false;
    this.bonusRolls = 0;
    this.breakBalls = [];

    for (let i = 0; i < 10; i++) {
      this.frames.push({
        inning1: { scored: 0, complete: false },
        inning2: { scored: 0, complete: false },
        bonus: [],
        score: 0,
        isStrike: false,
        isSpare: false,
        isOpen: false
      });
      this.breakBalls.push(0);
    }
  }

  // --- BREAK / STATE HELPERS ---

  isBreakShot() {
    // Treat "break" as first shot of a new frame when the frame has no completed innings yet.
    const f = this.frames[this.currentFrame];
    return !this.breakProcessed &&
           this.currentInning === 1 &&
           !f.inning1.complete &&
           !f.inning2.complete;
  }

  processBreak() {
    this.breakProcessed = true;
  }

  // Record how many balls were made on the break shot
  recordBreakBalls(ballsCount) {
    this.breakBalls[this.currentFrame] = ballsCount;
  }

  // Get break balls for a specific frame
  getBreakBalls(frameIndex) {
    return this.breakBalls[frameIndex] || 0;
  }

  // Get the best break across all frames
  getBestBreak() {
    return Math.max(...this.breakBalls, 0);
  }

  // --- MAIN SHOT LOGIC ---

  /**
   * Process a normal scoring shot.
   * @param {number} ballsPocketed - how many balls were made on this shot
   * @param {boolean} isBreak - true if this was the break shot
   * @returns {object} result info about the shot
   */
  processShot(ballsPocketed, isBreak = false) {
    // If we're in 10th-frame bonus rolls, handle those first.
    if (this.bonusRolls > 0) {
      const frame10 = this.frames[9];
      
      // Add pocketed balls to current bonus roll
      // We track bonus as an array where each element is the total for that bonus "inning"
      const currentBonusIndex = frame10.isStrike ? (2 - this.bonusRolls) : 0;
      
      // Check if this is the first shot of this bonus inning (bonus break shot)
      const isBonusBreak = frame10.bonus[currentBonusIndex] === undefined;
      
      if (isBonusBreak) {
        frame10.bonus[currentBonusIndex] = 0;
      }
      frame10.bonus[currentBonusIndex] += ballsPocketed;
      
      // Check if this bonus inning is complete
      const bonusTotal = frame10.bonus[currentBonusIndex];
      const clearedAll = bonusTotal >= 10;
      // Don't count as miss if it's the bonus break shot
      const missed = ballsPocketed === 0 && !isBonusBreak;
      const bonusInningComplete = missed || clearedAll;
      
      if (bonusInningComplete) {
        this.bonusRolls--;
        
        if (this.bonusRolls > 0) {
          // More bonus rolls remaining
          if (clearedAll) {
            // Only re-rack if player cleared all 10 (another strike)
            this.breakProcessed = true;
          }
          // If they missed, don't re-rack - they continue from where they are
        }
      }
      
      const gameOver = (this.bonusRolls === 0 && bonusInningComplete);

      this.calculateScores();

      return {
        isBonus: true,
        inningComplete: bonusInningComplete,
        needsRerack: clearedAll && this.bonusRolls > 0,
        isTenthFrame: true,
        gameOver
      };
    }

    const frame = this.frames[this.currentFrame];

    // ----- SPECIAL 10th FRAME -----
    if (this.currentFrame === 9) {
      if (this.currentInning === 1) {
        frame.inning1.scored += ballsPocketed;

        if (frame.inning1.scored === 10) {
          // 10th-frame strike
          frame.isStrike = true;
          frame.inning1.complete = true;
          this.bonusRolls = 2;       // two bonus rolls
          this.currentInning = 2;    // scoreboard still has row 2
          this.breakProcessed = true;

          this.calculateScores();
          return {
            isStrike: true,
            inningComplete: false,
            inning: 1,
            isTenthFrame: true
          };
        } else if (ballsPocketed === 0 && !isBreak) {
          // Miss – end first inning
          frame.inning1.complete = true;
          this.currentInning = 2;

          this.calculateScores();
          return {
            inningComplete: true,
            inning: 1,
            scored: frame.inning1.scored,
            isTenthFrame: true
          };
        }
        
        // Still in first inning (pocketed some balls but not all 10, or break shot) - keep shooting
        this.calculateScores();
        return {
          inningComplete: false,
          inning: 1,
          isTenthFrame: true
        };
      } else {
        // 10th-frame second inning (before any bonus rolls)
        frame.inning2.scored += ballsPocketed;
        const totalScored = frame.inning1.scored + frame.inning2.scored;

        if (totalScored === 10) {
          // 10th-frame spare
          frame.isSpare = true;
          frame.inning2.complete = true;
          this.bonusRolls = 1;      // one bonus roll
          this.breakProcessed = true;

          this.calculateScores();
          return {
            isSpare: true,
            inningComplete: false,
            inning: 2,
            isTenthFrame: true
          };
        } else if (ballsPocketed === 0) {
          // Miss - Open 10th frame – game over
          frame.isOpen = true;
          frame.inning1.complete = true;  // Ensure inning1 is marked complete for scoring
          frame.inning2.complete = true;

          this.calculateScores();
          return {
            inningComplete: true,
            inning: 2,
            totalScored,
            isTenthFrame: true,
            gameOver: true
          };
        }
        
        // Still shooting in second inning (pocketed some but not all)
        this.calculateScores();
        return {
          inningComplete: false,
          inning: 2,
          totalScored,
          isTenthFrame: true
        };
      }
    }

    // ----- FRAMES 1–9 -----
    if (this.currentInning === 1) {
      frame.inning1.scored += ballsPocketed;

      if (frame.inning1.scored === 10) {
        // Strike
        frame.isStrike = true;
        frame.inning1.complete = true;
        frame.inning2.complete = true; // no second inning needed
        this.calculateScores();
        return {
          isStrike: true,
          inningComplete: true,
          inning: 1
        };
      } else if (ballsPocketed === 0 && !isBreak) {
        // Miss ends first inning (non-scoring ball)
        frame.inning1.complete = true;
        this.currentInning = 2;
        this.calculateScores();
        return {
          inningComplete: true,
          inning: 1,
          scored: frame.inning1.scored
        };
      }

      // Still in inning 1
      this.calculateScores();
      return {
        inningComplete: false,
        inning: 1
      };
    } else {
      // Second inning (frames 1–9)
      frame.inning2.scored += ballsPocketed;
      const totalScored = frame.inning1.scored + frame.inning2.scored;

      if (totalScored === 10) {
        // Spare
        frame.isSpare = true;
        frame.inning2.complete = true;
        this.calculateScores();
        return {
          isSpare: true,
          inningComplete: true,
          inning: 2,
          totalScored
        };
      } else if (ballsPocketed === 0 || totalScored >= 10) {
        // Miss or all balls cleared
        frame.isOpen = true;
        frame.inning2.complete = true;
        this.calculateScores();
        return {
          inningComplete: true,
          inning: 2,
          totalScored
        };
      }

      // Still in inning 2
      this.calculateScores();
      return {
        inningComplete: false,
        inning: 2,
        totalScored
      };
    }
  }

  // --- FOULS ---

  /**
   * Generic foul handler (used in older code paths).
   * Returns { grantBallInHand, inningComplete } plus 10th-frame handling.
   * @param {number} ballsPocketedOnFoul - Number of balls pocketed during the foul shot
   */
  processFoul(ballsPocketedOnFoul = 0) {
    // Foul during bonus rolls in 10th frame
    if (this.bonusRolls > 0) {
      const frame10 = this.frames[9];
      const currentBonusIndex = frame10.isStrike ? (2 - this.bonusRolls) : 0;

      frame10.bonus[currentBonusIndex] = (frame10.bonus[currentBonusIndex] || 0) + ballsPocketedOnFoul;
      
      this.bonusRolls--;
      const gameOver = this.bonusRolls === 0;

      if (!gameOver) {
        this.breakProcessed = true;
      }

      this.calculateScores();

      return {
        isBonus: true,
        inningComplete: true,
        isTenthFrame: true,
        grantBallInHand: !gameOver,
        gameOver
      };
    }

    const frame = this.frames[this.currentFrame];

    // 10th frame foul
    if (this.currentFrame === 9) {
      if (this.currentInning === 1) {
        const prevScore = frame.inning1.scored || 0;
        frame.inning1.scored = prevScore + ballsPocketedOnFoul;
        
        // STRIKE only if we potted balls on THIS shot AND reached 10
        // (Must pot the 10th ball to get strike, even on a scratch)
        if (frame.inning1.scored >= 10 && ballsPocketedOnFoul > 0 && prevScore < 10) {
          frame.isStrike = true;
          frame.inning1.complete = true;
          this.bonusRolls = 2;
          this.currentInning = 2;
          this.breakProcessed = true;
          this.calculateScores();
          return { 
            grantBallInHand: true, 
            inningComplete: false, 
            isStrike: true,
            isTenthFrame: true
          };
        }
        
        frame.inning1.complete = true;
        this.currentInning = 2;
        this.calculateScores();
        return { grantBallInHand: true, inningComplete: false, isTenthFrame: true };
      } else {
        const prevScore1 = frame.inning1.scored || 0;
        const prevScore2 = frame.inning2.scored || 0;
        frame.inning1.complete = true;
        frame.inning2.scored = prevScore2 + ballsPocketedOnFoul;
        
        // SPARE only if we potted balls on THIS shot AND total reached 10
        const totalScored = prevScore1 + frame.inning2.scored;
        const prevTotal = prevScore1 + prevScore2;
        if (totalScored >= 10 && ballsPocketedOnFoul > 0 && prevTotal < 10) {
          frame.isSpare = true;
          frame.inning2.complete = true;
          this.bonusRolls = 1;
          this.breakProcessed = true;
          this.calculateScores();
          return { 
            grantBallInHand: true, 
            inningComplete: false,
            isSpare: true,
            isTenthFrame: true
          };
        }
        
        frame.inning2.complete = true;
        frame.isOpen = true;
        this.calculateScores();
        return { grantBallInHand: false, inningComplete: true, isTenthFrame: true };
      }
    }

    // Frames 1–9
    if (this.currentInning === 1) {
      const prevScore = frame.inning1.scored || 0;
      frame.inning1.scored = prevScore + ballsPocketedOnFoul;
      
      // STRIKE only if we potted balls on THIS shot AND reached 10
      if (frame.inning1.scored >= 10 && ballsPocketedOnFoul > 0 && prevScore < 10) {
        frame.isStrike = true;
        frame.inning1.complete = true;
        this.calculateScores();
        return { 
          grantBallInHand: false, 
          inningComplete: true,
          isStrike: true
        };
      }
      
      frame.inning1.complete = true;
      this.currentInning = 2;
      this.calculateScores();
      return { grantBallInHand: true, inningComplete: false };
    } else {
      const prevScore1 = frame.inning1.scored || 0;
      const prevScore2 = frame.inning2.scored || 0;
      frame.inning2.scored = prevScore2 + ballsPocketedOnFoul;
      
      // SPARE only if we potted balls on THIS shot AND total reached 10
      const totalScored = prevScore1 + frame.inning2.scored;
      const prevTotal = prevScore1 + prevScore2;
      if (totalScored >= 10 && ballsPocketedOnFoul > 0 && prevTotal < 10) {
        frame.isSpare = true;
        frame.inning2.complete = true;
        this.calculateScores();
        return { 
          grantBallInHand: false, 
          inningComplete: true,
          isSpare: true
        };
      }
      
      frame.inning2.complete = true;
      frame.isOpen = true;
      this.calculateScores();
      return { grantBallInHand: false, inningComplete: true };
    }
  }

  /**
   * Foul after the break (cue ball pocketed, special branch in main.js)
   * We wrap processFoul() and add flags that main.js expects:
   *   gameOver, isTenthFrame, isStrike, isSpare
   * @param {number} ballsPocketedOnFoul - Number of balls pocketed during the foul shot
   */
  processFoulAfterBreak(ballsPocketedOnFoul = 0) {
    const res = this.processFoul(ballsPocketedOnFoul);
    const frame = this.frames[this.currentFrame];

    return {
      ...res,
      isTenthFrame: (this.currentFrame === 9),
      isStrike: frame.isStrike,
      isSpare: frame.isSpare,
      gameOver: this.isGameComplete()
    };
  }

  /**
   * Foul where cue ball hits nothing (no object ball contact).
   * main.js expects:
   *   { gameOver, inningComplete, isTenthFrame, isStrike, isSpare }
   * and *no* ball-in-hand.
   * @param {number} ballsPocketedOnFoul - Number of balls pocketed during the foul shot
   */
  processNoHitFoul(ballsPocketedOnFoul = 0) {
    // Handle no-hit foul during bonus rolls in 10th frame
    if (this.bonusRolls > 0) {
      const frame10 = this.frames[9];
      const currentBonusIndex = frame10.isStrike ? (2 - this.bonusRolls) : 0;

      // Add any balls pocketed to the bonus score
      frame10.bonus[currentBonusIndex] = (frame10.bonus[currentBonusIndex] || 0) + ballsPocketedOnFoul;
      
      this.bonusRolls--;
      const gameOver = this.bonusRolls === 0;

      if (!gameOver) {
        this.breakProcessed = true;
      }

      this.calculateScores();

      return {
        isBonus: true,
        inningComplete: true,
        isTenthFrame: true,
        grantBallInHand: false,
        gameOver
      };
    }

    const frame = this.frames[this.currentFrame];

    if (this.currentFrame === 9) {
      // 10th frame
      if (this.currentInning === 1) {
        const prevScore = frame.inning1.scored || 0;
        frame.inning1.scored = prevScore + ballsPocketedOnFoul;
        frame.inning1.complete = true;
        
        // STRIKE only if we potted balls on THIS shot AND reached 10
        if (frame.inning1.scored >= 10 && ballsPocketedOnFoul > 0 && prevScore < 10) {
          frame.isStrike = true;
          this.bonusRolls = 2;
          this.currentInning = 2;
          this.breakProcessed = true;
          this.calculateScores();
          return { 
            grantBallInHand: false, 
            inningComplete: false, 
            isStrike: true,
            isTenthFrame: true,
            gameOver: false
          };
        }
        
        this.currentInning = 2;
      } else {
        const prevScore1 = frame.inning1.scored || 0;
        const prevScore2 = frame.inning2.scored || 0;
        frame.inning1.complete = true;
        frame.inning2.scored = prevScore2 + ballsPocketedOnFoul;
        frame.inning2.complete = true;
        
        // SPARE only if we potted balls on THIS shot AND total reached 10
        const totalScored = prevScore1 + frame.inning2.scored;
        const prevTotal = prevScore1 + prevScore2;
        if (totalScored >= 10 && ballsPocketedOnFoul > 0 && prevTotal < 10) {
          frame.isSpare = true;
          this.bonusRolls = 1;
          this.breakProcessed = true;
          this.calculateScores();
          return { 
            grantBallInHand: false, 
            inningComplete: false,
            isSpare: true,
            isTenthFrame: true,
            gameOver: false
          };
        }
        
        frame.isOpen = true;
      }
    } else {
      // Frames 1–9
      if (this.currentInning === 1) {
        const prevScore = frame.inning1.scored || 0;
        frame.inning1.scored = prevScore + ballsPocketedOnFoul;
        frame.inning1.complete = true;
        
        // STRIKE only if we potted balls on THIS shot AND reached 10
        if (frame.inning1.scored >= 10 && ballsPocketedOnFoul > 0 && prevScore < 10) {
          frame.isStrike = true;
          this.calculateScores();
          return { 
            grantBallInHand: false, 
            inningComplete: true,
            isStrike: true,
            isTenthFrame: false,
            gameOver: this.isGameComplete()
          };
        }
        
        this.currentInning = 2;
      } else {
        const prevScore1 = frame.inning1.scored || 0;
        const prevScore2 = frame.inning2.scored || 0;
        frame.inning2.scored = prevScore2 + ballsPocketedOnFoul;
        frame.inning2.complete = true;
        
        // SPARE only if we potted balls on THIS shot AND total reached 10
        const totalScored = prevScore1 + frame.inning2.scored;
        const prevTotal = prevScore1 + prevScore2;
        if (totalScored >= 10 && ballsPocketedOnFoul > 0 && prevTotal < 10) {
          frame.isSpare = true;
          this.calculateScores();
          return { 
            grantBallInHand: false, 
            inningComplete: true,
            isSpare: true,
            isTenthFrame: false,
            gameOver: this.isGameComplete()
          };
        }
        
        frame.isOpen = true;
      }
    }

    this.calculateScores();

    const inningComplete =
      (this.currentFrame === 9 && frame.inning2.complete) ||
      (this.currentFrame < 9 && this.currentInning === 2 && frame.inning2.complete);

    return {
      grantBallInHand: false,
      inningComplete,
      isTenthFrame: (this.currentFrame === 9),
      isStrike: frame.isStrike,
      isSpare: frame.isSpare,
      gameOver: this.isGameComplete()
    };
  }

  // --- FRAME ADVANCE / GAME COMPLETE ---

  nextFrame() {
    if (this.currentFrame >= 9) return; // don't go beyond 10th
    this.currentFrame++;
    this.currentInning = 1;
    this.breakProcessed = false;
  }

  isGameComplete() {
    if (this.currentFrame < 9) return false;

    const frame10 = this.frames[9];

    if (!frame10.inning1.complete) return false;

    if (frame10.isStrike) {
      // needs 2 bonus rolls
      return frame10.bonus.length >= 2;
    }

    if (!frame10.inning2.complete) return false;

    if (frame10.isSpare) {
      // needs 1 bonus roll
      return frame10.bonus.length >= 1;
    }

    // Open 10th frame: done when inning2 is complete
    return true;
  }

  getTotalScore() {
    this.calculateScores();
    return this.frames.reduce((sum, frame) => sum + frame.score, 0);
  }

  calculateScores() {
    for (let i = 0; i < 10; i++) {
      const frame = this.frames[i];

      if (!frame.inning1.complete) {
        frame.score = 0;
        continue;
      }

      const totalPins = frame.inning1.scored + frame.inning2.scored;

      if (i === 9) {
        // 10th frame
        if (frame.isStrike) {
          frame.score = 10 +
            (frame.bonus[0] || 0) +
            (frame.bonus[1] || 0);
        } else if (frame.isSpare) {
          frame.score = 10 + (frame.bonus[0] || 0);
        } else {
          frame.score = totalPins;
        }
      } else if (frame.isStrike) {
        // Strike in frames 1–9: 10 + next two rolls
        frame.score = 10 + this._strikeBonus(i);
      } else if (frame.isSpare) {
        // Spare in frames 1–9: 10 + next one roll
        frame.score = 10 + this._spareBonus(i);
      } else {
        frame.score = totalPins;
      }
    }
  }

  _strikeBonus(frameIndex) {
    const rolls = [];
    for (let i = frameIndex + 1; i < 10 && rolls.length < 2; i++) {
      const f = this.frames[i];

      // first roll
      if (f.inning1.complete) {
        rolls.push(f.inning1.scored);
      }

      // second roll or strike chaining
      if (rolls.length < 2) {
        if (f.isStrike && i < 9) {
          // another strike; second bonus will be next frame's first roll
          continue;
        }
        if (f.inning2.complete) {
          rolls.push(f.inning2.scored);
        } else if (i === 9 && f.bonus && f.bonus.length > 0) {
          // 10th-frame strike/bonus case
          rolls.push(f.bonus[0]);
        }
      }
    }
    return (rolls[0] || 0) + (rolls[1] || 0);
  }

  _spareBonus(frameIndex) {
    if (frameIndex >= 9) return 0;
    const next = this.frames[frameIndex + 1];
    if (next.inning1 && next.inning1.complete) {
      return next.inning1.scored;
    }
    return 0;
  }

  // --- MULTIPLAYER SYNC ---

  exportScores() {
    return {
      frames: this.frames.map(f => ({
        inning1: { ...f.inning1 },
        inning2: { ...f.inning2 },
        bonus: f.bonus ? [...f.bonus] : [],
        score: f.score,
        isStrike: f.isStrike,
        isSpare: f.isSpare,
        isOpen: f.isOpen
      })),
      breakBalls: [...this.breakBalls],  // Include break tracking data
      currentFrame: this.currentFrame,
      currentInning: this.currentInning,
      breakProcessed: this.breakProcessed,
      bonusRolls: this.bonusRolls
    };
  }

  importScores(data) {
    if (!data || !Array.isArray(data.frames)) return;

    this.frames = data.frames.map(f => ({
      inning1: { ...(f.inning1 || { scored: 0, complete: false }) },
      inning2: { ...(f.inning2 || { scored: 0, complete: false }) },
      bonus: f.bonus ? [...f.bonus] : [],
      score: f.score || 0,
      isStrike: !!f.isStrike,
      isSpare: !!f.isSpare,
      isOpen: !!f.isOpen
    }));

    // Import break balls data if present
    if (Array.isArray(data.breakBalls)) {
      this.breakBalls = [...data.breakBalls];
    } else {
      // Initialize if not present (legacy data)
      this.breakBalls = new Array(10).fill(0);
    }

    this.currentFrame = data.currentFrame ?? 0;
    this.currentInning = data.currentInning ?? 1;
    this.breakProcessed = !!data.breakProcessed;
    this.bonusRolls = data.bonusRolls ?? 0;

    this.calculateScores();
  }
}