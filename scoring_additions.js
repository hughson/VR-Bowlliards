// Add these methods to your BowlliardsRulesEngine class in scoring.js

// --- EXPORT SCORES FOR NETWORK SYNC ---
exportScores() {
    return {
        frames: this.frames.map(f => ({
            inning1: { ...f.inning1 },
            inning2: { ...f.inning2 },
            bonus1: f.bonus1 ? { ...f.bonus1 } : null,
            bonus2: f.bonus2 ? { ...f.bonus2 } : null,
            score: f.score,
            isStrike: f.isStrike,
            isSpare: f.isSpare,
            isOpen: f.isOpen
        })),
        currentFrame: this.currentFrame,
        currentInning: this.currentInning,
        breakProcessed: this.breakProcessed
    };
}

// --- IMPORT SCORES FROM OPPONENT ---
importScores(data) {
    if (!data || !data.frames) return;
    
    this.frames = data.frames.map(f => ({
        inning1: { ...f.inning1 },
        inning2: { ...f.inning2 },
        bonus1: f.bonus1 ? { ...f.bonus1 } : null,
        bonus2: f.bonus2 ? { ...f.bonus2 } : null,
        score: f.score,
        isStrike: f.isStrike,
        isSpare: f.isSpare,
        isOpen: f.isOpen
    }));
    
    this.currentFrame = data.currentFrame;
    this.currentInning = data.currentInning;
    this.breakProcessed = data.breakProcessed;
    
    // Recalculate scores
    this.calculateScores();
}
