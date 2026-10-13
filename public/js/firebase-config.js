/* =========================================================================
   EDIT ME: paste your Firebase web app config here.
   Firebase console > Project settings > General > Your apps > Web app > Config
   Until this is filled in, the site runs on the sample data in defaults.js
   and wishes are kept only in the visitor's own browser.
   ========================================================================= */
export const firebaseConfig = {
  apiKey: "AIzaSyBZcA_FRgXyv4Rc7L7nblbUIuQQAh3-3X4",
  authDomain: "wedding-invitation-769fc.firebaseapp.com",
  projectId: "wedding-invitation-769fc",
  storageBucket: "wedding-invitation-769fc.firebasestorage.app",
  messagingSenderId: "860259085349",
  appId: "1:860259085349:web:13d9463dcee44574c963cc",
  measurementId: "G-PMKXDJ9CHC"
};

// The admin user's UID (Firebase console > Authentication > Users).
// Must match the UID in firestore.rules — the rules are what actually enforce it;
// this is only used to show a clear message if someone else signs in.
export const ADMIN_UID = "YH9Rv09hCkcrTBKam3u0jcDwzRy2";

// The live site address. Share links are built from it (SITE_URL/<wedding link name>),
// even when a page is opened from localhost or a Vercel preview URL.
export const SITE_URL = "https://invitation-five-mu.vercel.app";

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("PASTE");

// Local testing against the Firebase emulator (firebase emulators:start, see SETUP.md): add ?emulator=1 to a
// localhost page and this browser uses the emulator until ?emulator=0. Live pages never do. The ports must
// match "emulators" in firebase.json.
export const useEmulator = (() => {
  if(!["localhost", "127.0.0.1"].includes(location.hostname)) return false;
  try {
    const p = new URLSearchParams(location.search).get("emulator");
    if(p === "1") localStorage.setItem("wi:emulator", "1");
    if(p === "0") localStorage.removeItem("wi:emulator");
    return localStorage.getItem("wi:emulator") === "1";
  } catch { return false; }
})();
export const EMULATOR = { host: "127.0.0.1", firestorePort: 8085, authUrl: "http://127.0.0.1:9099" };
