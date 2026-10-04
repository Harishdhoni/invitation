// Firebase for the PIN editor page. It is a separate Firebase app from the admin page's (own name), so the
// anonymous editor session never replaces — or gets replaced by — an admin signed in in the same browser.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

export {
  doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, collection, query,
  orderBy, limit, onSnapshot, serverTimestamp, writeBatch, Bytes
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export {
  signInAnonymously, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

export const app = initializeApp(firebaseConfig, "editor");
export const db = getFirestore(app);
export const auth = getAuth(app);
