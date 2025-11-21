export class BowlliardsRulesEngine {
  constructor() {
    this.frames = [];
    this.currentFrame = 0;
    this.currentInning = 1;
    this.breakProcessed = false;
    
    // --- NEW ---
    this.bonusRolls = 0; // Tracks 10th frame bonus rolls
    // --- END NEW ---

    for (let i = 0; i < 10; i++) {
      this.frames.push({
        inning1: { scored: 0, complete: false },
        inning2: { scored: 0, complete: false },
        bonus: [], // Will store bonus roll scores
        score: 0,
        isStrike: false,
        isSpare: false,
        isOpen: false
      });
    }
  }

  isBreakShot() {
    return this.currentInning === 1 && !this.breakProcessed;
  }

  processBreak() {
    this.breakProcessed = true;
  }

  // --- MODIFICATION: Added isBreak flag ---
  processShot(ballsPocketed, isBreak = false) {
    // --- NEW: Handle 10th frame bonus rolls first ---
    if (this.bonusRolls > 0) {
      this.bonusRolls--;
      const frame = this.frames[9];
      frame.bonus.push(ballsPocketed);
      const isGameOver = this.bonusRolls === 0;
      
      // We set breakProcessed = true to reset the table for the next shot
      if (!isGameOver) {
          this.breakProcessed = true;
      }
      
      return { 
        isBonus: true, 
        inningComplete: isGameOver, 
        isTenthFrame: true 
      };
    }
    // --- END NEW ---

    const frame = this.frames[this.currentFrame];
    
    // --- MODIFIED: Special 10th Frame Logic ---
    if (this.currentFrame === 9) {
      if (this.currentInning === 1) {
        frame.inning1.scored += ballsPocketed;
        
        if (frame.inning1.scored === 10) {
          // 10th Frame Strike
          frame.isStrike = true;
          frame.inning1.complete = true;
          this.bonusRolls = 2; // Grant 2 bonus rolls
          this.currentInning = 2; // Move to "inning 2" for scoreboard
          this.breakProcessed = true; // Need to re-rack
          // Note: inningComplete is FALSE, game is not over
          return { isStrike: true, inningComplete: false, inning: 1, isTenthFrame: true };
        
        // --- MODIFICATION: Check isBreak flag ---
        } else if (ballsPocketed === 0 && !isBreak) {
        // --- END MODIFICATION ---
          // Miss
          frame.inning1.complete = true;
          this.currentInning = 2;
          return { inningComplete: true, inning: 1, scored: frame.inning1.scored };
        }
        // Partial clear, inning continues
        return { inningComplete: false, inning: 1 };

      } else {
        // 10th Frame, Second inning
        frame.inning2.scored += ballsPocketed;
        const totalScored = frame.inning1.scored + frame.inning2.scored;
        
        if (totalScored === 10) {
          // 10th Frame Spare
          frame.isSpare = true;
          frame.inning2.complete = true;
          this.bonusRolls = 1; // Grant 1 bonus roll
          this.breakProcessed = true; // Need to re-rack
          // Note: inningComplete is FALSE, game is not over
          return { isSpare: true, inningComplete: false, inning: 2, isTenthFrame: true };
        } else {
          // 10th Frame Open
          frame.isOpen = true;
          frame.inning2.complete = true;
          // Note: inningComplete is TRUE, game IS over
          return { inningComplete: true, inning: 2, totalScored };
        }
      }
    }
    // --- END MODIFIED 10th FRAME ---

    // Frames 1-9 (Original Logic)
    if (this.currentInning === 1) {
      frame.inning1.scored += ballsPocketed;
      
      if (frame.inning1.scored === 10) {
        // Strike!
        frame.isStrike = true;
        frame.inning1.complete = true;
        frame.inning2.complete = true; // Mark 2nd inning as "complete" too
        return { isStrike: true, inningComplete: true, inning: 1 };
      
      // --- MODIFICATION: Check isBreak flag ---
      } else if (ballsPocketed === 0 && !isBreak) {
      // --- END MODIFICATION ---
        // Miss - first inning ends
        frame.inning1.complete = true;
        this.currentInning = 2;
        return { inningComplete: true, inning: 1, scored: frame.inning1.scored };
      }
      
      return { inningComplete: false, inning: 1 };
    } else {
      // Second inning
      frame.inning2.scored += ballsPocketed;
      const totalScored = frame.inning1.scored + frame.inning2.scored;
      
      if (totalScored === 10) {
        // Spare!
        frame.isSpare = true;
        frame.inning2.complete = true;
        return { isSpare: true, inningComplete: true, inning: 2, totalScored };
      } else if (ballsPocketed === 0 || totalScored >= 10) {
        // Miss or all balls cleared
        frame.isOpen = true;
        frame.inning2.complete = true;
        return { inningComplete: true, inning: 2, totalScored };
      }
      
      return { inningComplete: false, inning: 2, totalScored };
    }
  }

  processFoul() {
    // --- NEW: Handle foul on bonus roll ---
    if (this.bonusRolls > 0) {
      this.bonusRolls--;
      const frame = this.frames[9];
      frame.bonus.push(0); // Foul scores 0
      const isGameOver = this.bonusRolls === 0;
      
      if (!isGameOver) {
          this.breakProcessed = true; // Re-rack
      }
      
      return { 
        isBonus: true, 
        inningComplete: isGameOver, 
        isTenthFrame: true,
        grantBallInHand: !isGameOver // Grant ball-in-hand if not over
      };
    }
    // --- END NEW ---

    const frame = this.frames[this.currentFrame];
    
    // --- MODIFIED: Handle 10th frame foul ---
    if (this.currentFrame === 9) {
        if (this.currentInning === 1) {
            frame.inning1.complete = true;
            this.currentInning = 2;
            return { grantBallInHand: true, inningComplete: false };
        } else {
            frame.inning2.complete = true;
            frame.isOpen = true; // Ends the frame and game
            return { grantBallInHand: false, inningComplete: true };
        }
    }
    // --- END MODIFIED ---

    // Frames 1-9 (Original Logic)
    if (this.currentInning === 1) {
      frame.inning1.complete = true;
      this.currentInning = 2;
      return { grantBallInHand: true, inningComplete: false };
    } else {
      frame.inning2.complete = true;
      frame.isOpen = true;
      return { grantBallInHand: false, inningComplete: true };
    }
  }

  nextFrame() {
    // --- NEW: Don't advance past frame 10 ---
    if (this.currentFrame === 9) {
      return;
    }
    // --- END NEW ---
    this.currentFrame++;
    this.currentInning = 1;
    this.breakProcessed = false;
  }

  isGameComplete() {
    // --- MODIFIED: New game complete logic ---
    if (this.currentFrame < 9) return false;
    
    const frame10 = this.frames[9];
    
    // If not even first inning, not complete
    if (!frame10.inning1.complete) return false;
    
    // If strike, game is over when 2 bonus rolls are done
    if (frame10.isStrike) {
      return frame10.bonus.length === 2;
    }
    
    // If no strike, must have finished inning 2
    if (!frame10.inning2.complete) return false;
    
    // If spare, game is over when 1 bonus roll is done
    if (frame10.isSpare) {
      return frame10.bonus.length === 1;
    }
    
    // If open, game is over
    if (frame10.isOpen) return true;
    
    return false; // Default
    // --- END MODIFIED ---
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
      
      if (frame.isStrike) {
        frame.score = 10;
        // --- MODIFIED: 10th frame strike ---
        if (i === 9) {
          frame.score += (frame.bonus[0] || 0) + (frame.bonus[1] || 0);
        } else {
        // --- END MODIFIED ---
          // Frames 1-8
          const next = this.frames[i + 1];
          if (next.inning1.complete) {
            frame.score += next.inning1.scored;
            if (next.isStrike && i < 8) {
              const nextNext = this.frames[i + 2];
              if (nextNext.inning1.complete) {
                frame.score += nextNext.inning1.scored;
              }
            } else if (next.inning2.complete) {
              frame.score += next.inning2.scored;
            } else if (next.bonus.length > 0) { // Case for 9th frame strike
                frame.score += next.bonus[0];
            }
          }
        }
      } else if (frame.isSpare) {
        frame.score = 10;
        // --- MODIFIED: 10th frame spare ---
        if (i === 9) {
          frame.score += (frame.bonus[0] || 0);
        } else {
        // --- END MODIFIED ---
          // Frames 1-9
          const next = this.frames[i + 1];
          if (next.inning1.complete) {
            frame.score += next.inning1.scored;
          }
        }
      } else {
        // Open frame
        frame.score = totalPins;
      }
    }
  }
}