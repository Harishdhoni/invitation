// Firebase modular SDK loaded straight from Google's CDN — no build step needed.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

export {
  doc, getDoc, setDoc, deleteDoc, updateDoc, addDoc, collection, query, where,
  orderBy, limit, onSnapshot, serverTimestamp, writeBatch, Bytes
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export { isFirebaseConfigured };
