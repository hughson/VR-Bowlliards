// Import Firebase modules
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Initialize Firebase
if (!getApps().length) {
  initializeApp({
    apiKey: "AIzaSyDcNKxFtTH9-3HZ8YuCtdofdBRlzxw-Ia8",
    authDomain: "black-hole-pool-bowlliards.firebaseapp.com",
    projectId: "black-hole-pool-bowlliards",
    storageBucket: "black-hole-pool-bowlliards.appspot.com",
    messagingSenderId: "121104446089",
    appId: "1:121104446089:web:3c7d25da623e6514d0c58",
    measurementId: "G-SVQGLHCTN5"
  });
}

const db = getFirestore();
const auth = getAuth();

// Chart instances
let scoreChart = null;
let frameTypeChart = null;

// Strike and Spare calculation functions
function calculateStrikeFrameScore(gameRolls, startIdx) {
  const nextRoll1 = gameRolls[startIdx + 1] || 0;
  const nextRoll2 = gameRolls[startIdx + 2] || 0;
  return 10 + nextRoll1 + nextRoll2;
}

function calculateSpareFrameScore(roll1, roll2, nextRoll) {
  return 10 + nextRoll;
}

// Updated High Run Calculation with Break Ball Subtraction - FIXED
function calculateHighRun(games) {
  let maxHighRun = 0;

  games.forEach((game, gameIndex) => {
    let currentRun = 0;
    let gameHighRun = 0;
    
    // Only process games with new schema that have breaks data
    if (Array.isArray(game.frames) && game.frames.length && 
        Array.isArray(game.frames[0].rolls) && Array.isArray(game.breaks)) {
      
      game.frames.forEach((frame, frameIndex) => {
        const rolls = frame.rolls || [];
        const breakBalls = game.breaks[frameIndex]?.breaks?.[0] || 0;
        const frameBallsMade = rolls.reduce((sum, roll) => sum + (roll || 0), 0);
        
        const roll1 = rolls[0] || 0;
        const roll2 = rolls[1] || 0;
        
        // Special handling for 10th frame (frameIndex === 9)
        if (frameIndex === 9) {
          // 10th frame - count all balls made in all rolls
          const totalSkillBalls = frameBallsMade - breakBalls;
          currentRun += totalSkillBalls;
          gameHighRun = Math.max(gameHighRun, currentRun);
        } else {
          // Process Roll 1 for frames 1-9
          if (roll1 === 10) {
            // Strike - add skill balls to run (subtract break balls from this roll)
            const skillBalls = roll1 - breakBalls;
            currentRun += skillBalls;
            gameHighRun = Math.max(gameHighRun, currentRun);
          } else if (roll1 > 0) {
            // Partial roll (less than 10) - calculate skill balls and add to run, but run will end
            const skillBalls = Math.max(0, roll1 - breakBalls);
            currentRun += skillBalls;
            gameHighRun = Math.max(gameHighRun, currentRun);
            // Since roll1 < 10, run ends here
            gameHighRun = Math.max(gameHighRun, currentRun);
            currentRun = 0;
          } else {
            // Miss (0 balls) - run ends
            gameHighRun = Math.max(gameHighRun, currentRun);
            currentRun = 0;
          }
          
          // Process Roll 2 (only if roll1 wasn't a strike and currentRun was reset)
          if (roll1 < 10 && roll2 > 0) {
            // Roll 2 starts a new run
            currentRun = roll2; // New run starts here
            gameHighRun = Math.max(gameHighRun, currentRun);
            
            // Check if roll2 completes the frame (spare)
            if (roll1 + roll2 === 10) {
              // Spare made, run continues to next frame
            } else {
              // Frame incomplete, run will end
              gameHighRun = Math.max(gameHighRun, currentRun);
              currentRun = 0;
            }
          } else if (roll1 < 10 && roll2 === 0) {
            // Miss on roll 2 - no new run starts
          }
        }
      });
      
      // Final check in case the game ended on a cleared rack
      gameHighRun = Math.max(gameHighRun, currentRun);
      
    } else {
      // Fallback for legacy games without break data
      const allRolls = [];
      
      if (Array.isArray(game.frames)) {
        game.frames.forEach(frame => {
          if (Array.isArray(frame.rolls)) {
            // New schema - rolls array
            frame.rolls.forEach(roll => {
              if (roll != null) allRolls.push(roll);
            });
          } else {
            // Legacy schema - individual roll properties
            [frame.roll1, frame.roll2, frame.roll3]
              .filter(roll => roll != null)
              .forEach(roll => allRolls.push(roll));
          }
        });
      }
      
      // Simple sequential processing for legacy games
      allRolls.forEach(roll => {
        if (roll === 10) {
          currentRun += 10;
          gameHighRun = Math.max(gameHighRun, currentRun);
        } else if (roll > 0) {
          currentRun += roll;
          gameHighRun = Math.max(gameHighRun, currentRun);
        } else {
          gameHighRun = Math.max(gameHighRun, currentRun);
          currentRun = 0;
        }
      });
    }
    
    maxHighRun = Math.max(maxHighRun, gameHighRun);
  });

  return maxHighRun;
}

// Authentication State Changed Handler
onAuthStateChanged(auth, async user => {
  if (!user) return;

  // Populate profile select
  const profileSelect = document.getElementById('profile-select');
  profileSelect.innerHTML = "<option value=''>Select profile</option>";

  // Get user profiles
  const snap = await getDoc(doc(db, "profiles", user.uid));
  (snap.data()?.profiles || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    profileSelect.appendChild(opt);
  });

  // Handle profile selection
  profileSelect.addEventListener('change', async () => {
    const player = profileSelect.value;
    if (!player) return;

    // Get games data
    const gameSnap = await getDocs(
      query(
        collection(db, "games"),
        where("userId", "==", user.uid),
        where("player", "==", player)
      )
    );
    const games = gameSnap.docs.map(d => {
      const data = d.data();
      data.id = d.id; // Add document ID to the data
      return data;
    });

    // Initialize metrics
    const totalGames = games.length;
    let totalScoreSum = 0;
    let highScore = 0;
    let highFrameScore = 0;
    let breakBallsList = [];
    let totalBreakBalls = 0;
    let strikeFrames = 0, spareFrames = 0, openFrames = 0;

    // Process each game
    games.forEach(game => {
      // Calculate total score
      let gameScore = 0;
      if (Array.isArray(game.frameScores) && game.frameScores.length) {
        gameScore = game.frameScores.reduce((a, b) => a + (b || 0), 0);
      } else if (typeof game.score === 'number') {
        gameScore = game.score;
      }
      totalScoreSum += gameScore;
      highScore = Math.max(highScore, gameScore);

      // FIXED: Extract break balls from game.breaks array
      if (Array.isArray(game.breaks)) {
        game.breaks.forEach(b => {
          const breakBallCount = b?.breaks?.[0] || 0;
          if (breakBallCount > 0) {
            breakBallsList.push(breakBallCount);
            totalBreakBalls += breakBallCount;
          }
        });
      }

      // Process frames for legacy format
      if (Array.isArray(game.frames) && game.frames.length && !Array.isArray(game.frames[0].rolls)) {
        game.frames.forEach((frame, i) => {
          const roll1 = frame.roll1 || 0;
          const roll2 = frame.roll2 || 0;
          const roll3 = frame.roll3 || 0;

          // Update frame types
          if (roll1 === 10) {
            strikeFrames++;
            const nextRoll1 = i + 1 < game.frames.length ? (game.frames[i + 1].roll1 || 0) : 0;
            const nextRoll2 = i + 1 < game.frames.length ? (game.frames[i + 1].roll2 || 0) : 
              (i + 2 < game.frames.length ? (game.frames[i + 2].roll1 || 0) : 0);
            const frameScore = 10 + nextRoll1 + nextRoll2;
            highFrameScore = Math.max(highFrameScore, frameScore);
          } else if (roll1 + roll2 === 10) {
            spareFrames++;
            const nextRoll = i + 1 < game.frames.length ? (game.frames[i + 1].roll1 || 0) : 0;
            const frameScore = 10 + nextRoll;
            highFrameScore = Math.max(highFrameScore, frameScore);
          } else {
            openFrames++;
            highFrameScore = Math.max(highFrameScore, roll1 + roll2);
          }
        });
      } else if (Array.isArray(game.frames) && game.frames.length && Array.isArray(game.frames[0].rolls)) {
        // New format with rolls array
        game.frames.forEach((frame, i) => {
          const rolls = frame.rolls || [];
          // Calculate frame score
          const roll1 = rolls[0] || 0;
          const roll2 = rolls[1] || 0;

          if (roll1 === 10) {
            strikeFrames++;
            let nextRoll1 = 0, nextRoll2 = 0;
            if (i + 1 < game.frames.length) {
              const nextFrame = game.frames[i + 1];
              const nextRolls = nextFrame.rolls || [];
              nextRoll1 = nextRolls[0] || 0;
              if (nextRoll1 === 10) {
                if (i + 2 < game.frames.length) {
                  const nextNextFrame = game.frames[i + 2];
                  const nextNextRolls = nextNextFrame.rolls || [];
                  nextRoll2 = nextNextRolls[0] || 0;
                }
              } else {
                nextRoll2 = nextRolls[1] || 0;
              }
            }
            const frameScore = 10 + nextRoll1 + nextRoll2;
            highFrameScore = Math.max(highFrameScore, frameScore);
          } else if (roll1 + roll2 === 10) {
            spareFrames++;
            let nextRoll = 0;
            if (i + 1 < game.frames.length) {
              const nextFrame = game.frames[i + 1];
              const nextRolls = nextFrame.rolls || [];
              nextRoll = nextRolls[0] || 0;
            }
            const frameScore = 10 + nextRoll;
            highFrameScore = Math.max(highFrameScore, frameScore);
          } else {
            openFrames++;
            highFrameScore = Math.max(highFrameScore, roll1 + roll2);
          }
        });
      }
    });

    // Calculate additional metrics
    const avgScore = totalGames ? totalScoreSum / totalGames : 0;

    // Best Break (most balls on any single break shot)
    const maxBreakBalls = breakBallsList.length ? Math.max(...breakBallsList) : 0;

    // Potting average calculation - EXCLUDE break balls for accurate skill measurement
    const newGames = games.filter(g => 
      Array.isArray(g.frames) && g.frames.length && Array.isArray(g.frames[0].rolls)
    );
    let totalBallsMade = 0, totalShots = 0;
    newGames.forEach(game => {
      const breaksData = game.breaks || [];
      
      game.frames.forEach((frame, frameIndex) => {
        const rolls = frame.rolls || [];
        const breakBallsThisFrame = breaksData[frameIndex]?.breaks?.[0] || 0;
        
        const frameTotal = rolls.reduce((s, v) => s + (v || 0), 0);
        const first = rolls[0] || 0, second = rolls[1] || 0, sumTwo = first + second;
        
        // Subtract break balls from total balls made (break isn't a skill shot)
        const skillBallsMade = frameTotal - breakBallsThisFrame;
        totalBallsMade += Math.max(0, skillBallsMade);
        
        // Calculate shots - subtract 1 if there were break balls (break shot doesn't count)
        let shots = first === 10 ? frameTotal : (sumTwo === 10 ? frameTotal + 1 : frameTotal + 2);
        if (breakBallsThisFrame > 0) {
          shots -= 1;  // Break shot doesn't count toward potting average
        }
        totalShots += Math.max(0, shots);
      });
    });
    let batting = '';
    if (newGames.length && totalShots > 0) {
      batting = (totalBallsMade / totalShots).toFixed(3).replace(/^0/, '');
    }

    // Use the corrected high run calculation
    const highRunCount = calculateHighRun(games);

    // Update DOM elements - Reordered as requested
    document.getElementById('totalGames').textContent = totalGames;
    document.getElementById('highScore').textContent = highScore;
    document.getElementById('avgScore').textContent = avgScore.toFixed(1);
    document.getElementById('potAvgValue').textContent = batting;
    document.getElementById('highRun').textContent = highRunCount;
    document.getElementById('highFrameScore').textContent = highFrameScore;
    document.getElementById('maxBreakBalls').textContent = maxBreakBalls;

    // Update charts
    if (scoreChart) scoreChart.destroy();

    // Sort games by timestamp (assuming each game has a timestamp field)
    const sortedGames = [...games].sort((a, b) => {
      // First try to sort by timestamp
      if (a.timestamp && b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      // If no timestamp, try to sort by createdAt
      else if (a.createdAt && b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      // If neither exists, try to sort by date field
      else if (a.date && b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      // If no date fields exist, maintain original order
      return 0;
    });

    // Create labels based on game dates or numbers
    const chartLabels = sortedGames.map((game, i) => {
      if (game.date) {
        // Format date as MM/DD if available
        const date = new Date(game.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      } else {
        // Otherwise use game number
        return `Game ${i + 1}`;
      }
    });

    scoreChart = new Chart(document.getElementById('scoreChart').getContext('2d'), {
      type: 'line',
      data: { 
        labels: chartLabels,
        datasets: [{ 
          label: 'Total Score', 
          data: sortedGames.map(g => 
            Array.isArray(g.frameScores) ? g.frameScores.reduce((a, b) => a + (b || 0), 0)
            : (typeof g.score === 'number' ? g.score : 0)
          ),
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.2)'
        }]
      },
      options: { 
        scales: { 
          y: { 
            beginAtZero: true,
            ticks: { color: 'white' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          x: {
            ticks: { color: 'white' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: 'white'
            }
          },
          tooltip: {
            callbacks: {
              title: function(tooltipItems) {
                const idx = tooltipItems[0].dataIndex;
                const game = sortedGames[idx];
                if (game.date) {
                  return new Date(game.date).toLocaleDateString();
                } else {
                  return `Game ${idx + 1}`;
                }
              }
            }
          }
        }
      }
    });

    if (frameTypeChart) frameTypeChart.destroy();
    frameTypeChart = new Chart(document.getElementById('frameTypeChart').getContext('2d'), {
      type: 'pie',
      data: { 
        labels: ['Strikes', 'Spares', 'Open'],
        datasets: [{ 
          data: [strikeFrames, spareFrames, openFrames],
          backgroundColor: ['#4CAF50', '#2196F3', '#FFC107']
        }]
      },
      options: {
        cutout: '10%',
        radius: '80%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: 'white'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                return `${label}: ${percentage}%`;
              }
            }
          }
        }
      },
      plugins: [{
        id: 'percentageLabels',
        afterDraw: function(chart) {
          const ctx = chart.ctx;
          ctx.save();
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'white';
          
          const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          
          if (total > 0) {
            chart.data.datasets.forEach((dataset, datasetIndex) => {
              const meta = chart.getDatasetMeta(datasetIndex);
              meta.data.forEach((element, index) => {
                const data = dataset.data[index];
                const percentage = Math.round((data / total) * 100);
                
                if (percentage >= 5) {
                  const position = element.getCenterPoint();
                  ctx.fillText(percentage + '%', position.x, position.y);
                }
              });
            });
          }
          ctx.restore();
        }
      }]
    });
  });
});
