// Admin: editor access. The admin creates a PIN for one event; whoever has the PIN can open /editor,
// enter it, and edit that event only. Changing or revoking the PIN cuts that access at once.
//
// pins/<PIN> = { slug, createdAt } is what firestore.rules check on every editor save.
// editors/<uid> = { pin, slug } is the record a signed-in editor leaves (see js/editor.js); it is
// cleaned up here when the PIN goes away.
import { SITE_URL } from "./firebase-config.js";
import { el, toast, actionBtn, copyText } from "./admin-ui.js";
import { generatePin, formatPin } from "./pin.js";

let fb = null;
export const useFirebase = mod => { fb = mod; };

export const editorPageLink = () => `${SITE_URL}/editor`;

// slug -> { pin, createdAt } for every event that has a PIN.
export async function loadPins(){
  const snap = await fb.getDocs(fb.collection(fb.db, "pins"));
  const pins = new Map();
  snap.docs.forEach(d => {
    const { slug, createdAt } = d.data();
    const at = createdAt?.toMillis?.() ?? 0;
    if(!pins.has(slug) || at > pins.get(slug).at) pins.set(slug, { pin: d.id, at });
  });
  return pins;
}

// Removes every PIN of this event, and the editors who signed in with them.
async function clearPins(batch, slug){
  const pinDocs = await fb.getDocs(fb.query(fb.collection(fb.db, "pins"), fb.where("slug", "==", slug)));
  pinDocs.docs.forEach(d => batch.delete(d.ref));
  const sessions = await fb.getDocs(fb.query(fb.collection(fb.db, "editors"), fb.where("slug", "==", slug)));
  sessions.docs.forEach(d => batch.delete(d.ref));
}

// A new PIN for the event; the old one (if any) stops working in the same write.
async function issuePin(slug){
  let pin;
  do { pin = generatePin(); } while((await fb.getDoc(fb.doc(fb.db, "pins", pin))).exists());
  const batch = fb.writeBatch(fb.db);
  await clearPins(batch, slug);
  batch.set(fb.doc(fb.db, "pins", pin), { slug, createdAt: fb.serverTimestamp() });
  await batch.commit();
  return pin;
}

export async function revokePin(slug){
  const batch = fb.writeBatch(fb.db);
  await clearPins(batch, slug);
  await batch.commit();
}

// What the admin sends to the editor.
const shareText = (name, slug, pin) =>
  `Edit the invitation for ${name}\n` +
  `Invitation: ${SITE_URL}/${slug}\n` +
  `Editor page: ${editorPageLink()}\n` +
  `PIN: ${formatPin(pin)}`;

// The "Editor access" block of an event card. `pins` is shared with the list and kept up to date here.
export function accessPanel({ slug, name, pins }){
  const box = el("div", "access");

  async function run(job, done){
    box.querySelectorAll("button").forEach(b => { b.disabled = true; });
    try {
      await job();
      toast(done);
    } catch(e){
      console.error(e);
      toast(e.code === "permission-denied"
        ? "Permission denied — deploy the latest firestore.rules (see SETUP.md)."
        : "Failed: " + e.message);
    }
    render();
  }

  const create = () => run(async () => { pins.set(slug, { pin: await issuePin(slug), at: Date.now() }); }, "PIN created — copy the details to share them.");
  const change = () => {
    if(!confirm(`Change the PIN for "${name}"?\n\nThe current PIN stops working immediately, including for anyone editing right now.`)) return;
    run(async () => { pins.set(slug, { pin: await issuePin(slug), at: Date.now() }); }, "PIN changed. The old one no longer works.");
  };
  const revoke = () => {
    if(!confirm(`Revoke editor access to "${name}"?\n\nThe PIN stops working immediately. You can create a new one any time.`)) return;
    run(async () => { await revokePin(slug); pins.delete(slug); }, "Editor access revoked.");
  };

  function render(){
    const rec = pins.get(slug);
    box.replaceChildren();
    if(!rec){
      box.append(el("span", "muted", "No editor PIN"), actionBtn("Create editor PIN", "ghost", create));
      return;
    }
    const code = el("code", "pin", formatPin(rec.pin));
    code.title = "Editor PIN";
    const acts = el("div", "row");
    acts.append(
      actionBtn("Copy details", "ghost", () => copyText(shareText(name, slug, rec.pin), "Copied — send the link and PIN to the editor.")),
      actionBtn("Change", "ghost", change),
      actionBtn("Revoke", "danger", revoke)
    );
    box.append(el("span", "muted", "Editor PIN"), code, acts);
  }
  render();
  return box;
}
