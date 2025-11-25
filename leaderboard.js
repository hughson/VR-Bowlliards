// --- Import Firebase services via CDN ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDorLca4yCzbdPuLVfj0GuH65OrMzz4VJE",
  authDomain: "vr-bowlliards.firebaseapp.com",
  projectId: "vr-bowlliards",
  storageBucket: "vr-bowlliards.firebasestorage.app",
  messagingSenderId: "1067404069820",
  appId: "1:1067404069820:web:e069b9b74556ae48d8b9b9",
  measurementId: "G-60X7P2GKJ2"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export class Leaderboard {
  constructor() {
    this.scores = []; // Local cache for scores
    this.db = db; // Store database reference
    this.scoresCollection = collection(this.db, 'bowlliards_scores');
  }

  // --- Async init method ---
  // We call this after the constructor to load initial scores
  async init() {
    this.scores = await this.loadScores();
  }

  // --- loadScores fetches from Firebase ---
  async loadScores() {
    try {
      // Create a query to get top 10 scores, descending
      const q = query(this.scoresCollection, orderBy('score', 'desc'), limit(10));
      
      const querySnapshot = await getDocs(q);
      
      const scores = [];
      querySnapshot.forEach((doc) => {
        scores.push(doc.data());
      });
      
      return scores;

    } catch (e) {
      console.error("Error loading scores: ", e);
      return []; // Return empty on error
    }
  }

  // --- addScore saves to Firebase ---
  async addScore(score, name) {
    const entry = {
      score: score,
      name: name, // Add the player's name
      date: new Date().toISOString()
    };
    
    try {
      // Add the new score to the database
      await addDoc(this.scoresCollection, entry);
      
      // After adding, refresh our local cache with the new top 10
      this.scores = await this.loadScores();

    } catch (e) {
      console.error("Error adding score: ", e);
    }
  }

  // --- UNCHANGED: These now use the local cache ---
  getTopScores(count = 10) {
    return this.scores.slice(0, count);
  }

  getHighScore() {
    return this.scores.length > 0 ? this.scores[0].score : 0;
  }
}