import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAI, VertexAIBackend } from "firebase/ai";

const firebaseConfig = {
  apiKey: "AIzaSyDjK3nV2R5jbWkJ8Unh4S5h8vs7LRh00lM",
  authDomain: "finnexa-budget.firebaseapp.com",
  projectId: "finnexa-budget",
  storageBucket: "finnexa-budget.firebasestorage.app",
  messagingSenderId: "136285058568",
  appId: "1:136285058568:web:fd0da6a448c5c22e0483bd"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const ai = getAI(app, {
  backend: new VertexAIBackend('us-central1')
});
