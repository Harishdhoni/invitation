// The PIN editor page: one PIN field. A valid PIN opens the editor for the one event it belongs to.
//
// How access works (rules in firestore.rules):
//  - The visitor signs in anonymously (a new account per browser, no email or password).
//  - pins/<PIN> says which event a PIN belongs to. Only the admin can list or write pins.
//  - The visitor saves { pin, slug } as editors/<their uid>. The rules accept that only if the PIN exists,
//    and then let this uid write that one event, its photos, music and wishes — and nothing else —
//    for as long as the pin document exists. Changing or revoking the PIN in the admin deletes it.
import { isFirebaseConfigured } from "./firebase-config.js";
import { $, show, toast } from "./admin-ui.js";
import { normalizePin, isValidPin } from "./pin.js";
import { openEditor, hasUnsavedChanges, discardChanges } from "./event-editor.js";

let fb = null;
let editorOpened = false;
const editorRef = () => fb.doc(fb.db, "editors", fb.auth.currentUser.uid);
const pinRef = pin => fb.doc(fb.db, "pins", pin);

function showView(name){
  ["setupView", "pinView", "appView"].forEach(v => show(v, v === name));
  if(name === "pinView") $("pinInput").focus();
}

function showPinForm(message = ""){
  $("pinError").textContent = message;
  $("pinBtn").disabled = false;
  showView("pinView");
}

// The event this browser may edit; null if no PIN was entered yet, false if its PIN was changed or revoked.
async function currentAccess(){
  if(!fb.auth.currentUser) return null;
  const mine = await fb.getDoc(editorRef());
  if(!mine.exists()) return null;
  const { pin, slug } = mine.data();
  const live = await fb.getDoc(pinRef(pin));
  return live.exists() && live.data().slug === slug ? slug : false;
}

async function startEditor(slug){
  try {
    await openEditor({ mod: fb, id: slug, onAccessDenied });
  } catch(e){
    return showPinForm(e.message);
  }
  editorOpened = true;
  showView("appView");
}

// A save was refused: most likely the admin changed or revoked the PIN.
async function onAccessDenied(){
  try {
    if(await currentAccess()) return;
  } catch(e){
    console.warn("access check failed", e);
  }
  discardChanges();
  showPinForm("This PIN was changed or revoked. Ask for the new one, then enter it here.");
}

const PIN_ERRORS = {
  "auth/operation-not-allowed": "Editing by PIN isn't switched on yet. Ask the admin to enable Anonymous sign-in in Firebase Authentication.",
  "auth/network-request-failed": "No internet connection.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again."
};

$("pinForm").addEventListener("submit", async e => {
  e.preventDefault();
  const pin = normalizePin($("pinInput").value);
  const error = $("pinError");
  error.textContent = "";
  if(!isValidPin(pin)){ error.textContent = "A PIN is 8 letters and numbers, like ABCD-EFGH."; return; }

  $("pinBtn").disabled = true;
  try {
    if(!fb.auth.currentUser) await fb.signInAnonymously(fb.auth);
    const found = await fb.getDoc(pinRef(pin));
    if(!found.exists()){
      error.textContent = "That PIN isn't valid. Check it and try again, or ask for a new one.";
      $("pinBtn").disabled = false;
      return;
    }
    const slug = found.data().slug;
    await fb.setDoc(editorRef(), { pin, slug });
    if(editorOpened){ location.reload(); return; }   // back after losing access: start from a clean page
    $("pinInput").value = "";
    await startEditor(slug);
  } catch(err){
    console.error(err);
    error.textContent = PIN_ERRORS[err.code] || (err.code === "permission-denied"
      ? "That PIN isn't valid, or the editor isn't set up yet. Ask the admin to check the Firestore rules."
      : "Something went wrong: " + err.message);
    $("pinBtn").disabled = false;
  }
});

$("leaveBtn").addEventListener("click", async () => {
  if(hasUnsavedChanges() && !confirm("You have unsaved changes. Leave anyway?")) return;
  discardChanges();
  try {
    await fb.deleteDoc(editorRef());
  } catch(e){
    console.warn("couldn't remove the editor session", e);
  }
  await fb.signOut(fb.auth);
  location.reload();
});

async function boot(){
  if(!isFirebaseConfigured) return showView("setupView");
  try {
    fb = await import("./editor-firebase.js");
    await fb.auth.authStateReady();
  } catch(e){
    console.error(e);
    showView("setupView");
    toast("Couldn't load Firebase — check your internet connection.");
    return;
  }
  // Come back to the same event without asking for the PIN again, while it is still valid.
  let access = null;
  try {
    access = await currentAccess();
    if(access) return startEditor(access);
  } catch(e){
    console.warn("couldn't resume the editor session", e);
  }
  showPinForm(access === false ? "Your PIN is no longer valid. Enter the current one." : "");
}
boot();
