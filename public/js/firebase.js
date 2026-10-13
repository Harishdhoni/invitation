// Firebase modular SDK loaded straight from Google's CDN — no build step needed.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig, isFirebaseConfigured, useEmulator, EMULATOR } from "./firebase-config.js";

export {
  doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, addDoc, collection, query, where,
  orderBy, limit, onSnapshot, serverTimestamp, writeBatch, Bytes, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

export const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
if(app && useEmulator){
  connectFirestoreEmulator(db, EMULATOR.host, EMULATOR.firestorePort);
  connectAuthEmulator(auth, EMULATOR.authUrl);
}
export { isFirebaseConfigured };
