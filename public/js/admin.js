import { tr, slugify, isValidSlug, sampleFor } from "./defaults.js";
import { isFirebaseConfigured, ADMIN_UID, SITE_URL } from "./firebase-config.js";
import { compressPreviewImage } from "./image-utils.js";
import { $, show, el, toast, actionBtn, copyText } from "./admin-ui.js";
import {
  useFirebase, loadCategories, loadTemplates, templatesIn, templateName, categoryName, templatePicker,
  enterTemplates, enterTemplateEditor
} from "./admin-templates.js";
import { useFirebase as useAccessFirebase, loadPins, revokePin, accessPanel } from "./admin-access.js";
import {
  openEditor, normalize, coupleNames, shareLink, previewLink, musicChunkId, hasUnsavedChanges, discardChanges
} from "./event-editor.js";

let fb = null;
const params = new URLSearchParams(location.search);
// admin?w=<event> edits that event (other views are routed in enterApp).
const weddingId = params.get("w") || "";
const settingsDoc = () => fb.doc(fb.db, "site", "settings");
let appStarted = false;
let pins = new Map();        // slug -> { pin }: events that someone else may edit with a PIN
let pinsReady = false;       // false until the rules that allow reading pins/ are deployed
let categories = [];         // [{ id, name, order }]
let templates = [];          // [{ id, name, categoryId, html, … }]

/* ------------------------------ weddings list ------------------------------ */
let settings = {};           // site/settings: { defaultWedding, legacyImported }
let weddings = [];           // [{ id, cfg }]
let legacyConfig = null;     // site/config from before multi-wedding, until it's imported

const SLUG_RULES = "Use 3–40 lowercase letters, numbers and dashes, like arjun-meera. " +
  "admin, api, assets, css, editor, js, index and templates are used by the site itself.";
const siteHost = () => SITE_URL.replace(/^https?:\/\//, "");

function weddingTime(cfg){
  const t = new Date(cfg.weddingDateTimeISO || "").getTime();
  return isNaN(t) ? null : t;
}

// Firestore batches hold at most 500 writes.
async function inBatches(items, write){
  for(let i = 0; i < items.length; i += 450){
    const batch = fb.writeBatch(fb.db);
    items.slice(i, i + 450).forEach(x => write(batch, x));
    await batch.commit();
  }
}

function enterList(){
  show("weddingsView");
  document.querySelectorAll(".slug-prefix").forEach(s => { s.textContent = siteHost() + "/"; });
  $("importMainLink").textContent = siteHost() + "/";
  loadWeddings();
}

let categoryFilter = "all";
const eventCategory = cfg => cfg.category || "wedding";

async function loadWeddings(){
  const status = $("weddingsStatus");
  status.textContent = "Loading events…";
  show("weddingsStatus");
  try {
    const [list, settingsSnap] = await Promise.all([
      fb.getDocs(fb.collection(fb.db, "weddings")),
      fb.getDoc(settingsDoc())
    ]);
    settings = settingsSnap.exists() ? settingsSnap.data() : {};
    weddings = list.docs.map(d => ({ id: d.id, cfg: d.data() }));
    legacyConfig = null;
    if(!settings.legacyImported){
      const legacy = await fb.getDoc(fb.doc(fb.db, "site", "config"));
      if(legacy.exists()) legacyConfig = legacy.data();
    }
  } catch(e){
    status.textContent = e.code === "permission-denied"
      ? "Permission denied — check the admin UID in firestore.rules and deploy the rules."
      : "Couldn't load events: " + e.message;
    return;
  }
  // Categories and templates only add labels here, so the list still works if they fail
  // (e.g. before the new rules are deployed).
  try {
    [categories, templates] = await Promise.all([loadCategories(), loadTemplates()]);
  } catch(e){
    console.warn("categories/templates unavailable", e);
    toast("Couldn't load templates — deploy the latest firestore.rules (see SETUP.md).");
  }
  try {
    pins = await loadPins();
    pinsReady = true;
  } catch(e){
    console.warn("editor PINs unavailable", e);
    pinsReady = false;
    toast("Couldn't load editor PINs — deploy the latest firestore.rules (see SETUP.md).");
  }

  if(legacyConfig && $("importForm").hidden){
    $("importSlug").value = slugify(`${tr(legacyConfig.groomName, "en")}-${tr(legacyConfig.brideName, "en")}`);
    show("importForm");
  }
  if(!legacyConfig) show("importForm", false);
  renderWeddings();
}

function renderCategoryFilter(){
  const counts = {};
  weddings.forEach(w => { const c = eventCategory(w.cfg); counts[c] = (counts[c] || 0) + 1; });
  const used = Object.keys(counts);
  // Only worth showing once there's more than one kind of event.
  if(used.length < 2){ categoryFilter = "all"; return $("categoryFilter").replaceChildren(); }
  if(categoryFilter !== "all" && !counts[categoryFilter]) categoryFilter = "all";
  const chip = (id, label, n) => {
    const b = el("button", "chip", label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(categoryFilter === id));
    b.append(el("span", "n", String(n)));
    b.addEventListener("click", () => { categoryFilter = id; renderWeddings(); });
    return b;
  };
  $("categoryFilter").replaceChildren(chip("all", "All", weddings.length),
    ...used.sort((a, b) => categoryName(categories, a).localeCompare(categoryName(categories, b)))
      .map(id => chip(id, categoryName(categories, id), counts[id])));
}

function renderWeddings(){
  renderCategoryFilter();
  // Upcoming events first (soonest at the top), then past ones (most recent first).
  // An event counts as upcoming until a day after its main date.
  const cutoff = Date.now() - 86_400_000;
  const time = w => weddingTime(w.cfg) ?? Infinity;
  const shown = weddings.filter(w => categoryFilter === "all" || eventCategory(w.cfg) === categoryFilter);
  const upcoming = shown.filter(w => time(w) >= cutoff).sort((a, b) => time(a) - time(b));
  const past = shown.filter(w => time(w) < cutoff).sort((a, b) => time(b) - time(a));

  $("weddingsList").replaceChildren(...upcoming.map(w => weddingCard(w, false)), ...past.map(w => weddingCard(w, true)));
  $("weddingsStatus").textContent = weddings.length ? "" : "No events yet. Click ＋ New event to create the first one.";
  show("weddingsStatus", !weddings.length);
}

function weddingCard(w, isPast){
  const card = el("div", "card wedding-card" + (isPast ? " past" : ""));
  const head = el("div", "item-head");
  const tags = el("div", "item-tools");
  const isMain = settings.defaultWedding === w.id;
  if(isMain) tags.append(el("span", "badge main", "Main link"));
  if(isPast) tags.append(el("span", "badge off", "Past"));
  tags.append(el("span", "badge cat", categoryName(categories, eventCategory(w.cfg))));
  head.append(el("h3", "", coupleNames(w.cfg, w.id)), tags);

  const t = weddingTime(w.cfg);
  const when = el("p", "muted", t
    ? new Date(t).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "No date set");
  const design = el("p", "design", "Template: " + templateName(templates, w.cfg.templateId || ""));

  const link = el("a", "wedding-link", `${siteHost()}/${w.id}`);
  link.href = previewLink(w.id);
  link.target = "_blank";
  link.rel = "noopener";

  const edit = el("a", "btn primary small", "Edit");
  edit.href = "?w=" + w.id;
  const acts = el("div", "row");
  acts.append(edit, actionBtn("Copy link", "ghost", () => copyText(shareLink(w.id))));
  if(!isMain) acts.append(actionBtn("Show at main link", "ghost", () => setMainWedding(w)));
  acts.append(actionBtn("Delete", "danger", () => deleteWedding(w)));

  card.append(head, when, design, link);
  if(pinsReady) card.append(accessPanel({ slug: w.id, name: coupleNames(w.cfg, w.id), pins }));
  card.append(acts);
  return card;
}

async function setMainWedding(w){
  try {
    await fb.setDoc(settingsDoc(), { defaultWedding: w.id }, { merge: true });
    settings.defaultWedding = w.id;
    renderWeddings();
    toast(`${siteHost()}/ now shows ${coupleNames(w.cfg, w.id)}.`);
  } catch(e){
    toast("Failed: " + e.message);
  }
}

async function deleteWedding(w){
  const name = coupleNames(w.cfg, w.id);
  const typed = prompt(`Delete "${name}" permanently? Its details, photos, music and all wishes are removed, and its link stops working.\n\nType the link name "${w.id}" to confirm:`);
  if(typed === null) return;
  if(typed.trim() !== w.id) return toast("The link name didn't match, so nothing was deleted.");

  $("weddingsStatus").textContent = `Deleting ${name}…`;
  show("weddingsStatus");
  try {
    const ref = (...path) => fb.doc(fb.db, "weddings", w.id, ...path);
    // Photos and music are listed in the config, so they can be deleted without downloading them.
    const refs = Object.keys(w.cfg.images || {}).map(id => ref("images", id));
    const m = w.cfg.music;
    if(m) for(let i = 0; i < m.chunks; i++) refs.push(ref("music", musicChunkId(m.v, i)));
    const wishes = await fb.getDocs(fb.collection(ref(), "wishes"));
    refs.push(...wishes.docs.map(d => d.ref));
    await inBatches(refs, (batch, r) => batch.delete(r));
    if(pinsReady) await revokePin(w.id);   // the editor's access goes with the event
    await fb.deleteDoc(ref());   // last, so a failed delete can simply be retried
    if(settings.defaultWedding === w.id) await fb.setDoc(settingsDoc(), { defaultWedding: "" }, { merge: true });
    toast(`Deleted ${name}.`);
  } catch(e){
    console.error(e);
    toast("Delete failed: " + e.message);
  }
  loadWeddings();
}

/* ------------------------------ new event ------------------------------ */
let slugEdited = false;
let newTemplate = "";
const newCategory = () => $("newCategory").value || "wedding";
const suggestSlug = () => {
  const cat = newCategory();
  if(!slugEdited) $("newSlug").value = slugify([$("newGroom").value, $("newBride").value, cat === "wedding" ? "" : cat].join("-"));
};
$("newGroom").addEventListener("input", suggestSlug);
$("newBride").addEventListener("input", suggestSlug);
$("newSlug").addEventListener("input", () => { slugEdited = true; });

// Name labels and template choices follow the category.
function refreshNewForm(){
  const cat = newCategory(), wedding = cat === "wedding";
  $("newGroomLabel").textContent = wedding ? "Groom's name" : "Name";
  $("newBrideLabel").textContent = wedding ? "Bride's name" : "Second name (optional)";
  $("newBride").required = wedding;
  const list = templatesIn(templates, cat);
  if(!list.some(t => t.id === newTemplate)) newTemplate = list[0]?.id ?? "";
  $("newTemplatePicker").replaceChildren(templatePicker({
    templates, category: cat, selected: newTemplate, name: "newTemplate", onChange: id => { newTemplate = id; }
  }));
  $("createWeddingBtn").disabled = !list.length;
  suggestSlug();
}
$("newCategory").addEventListener("change", refreshNewForm);

$("newWeddingBtn").addEventListener("click", () => {
  $("newWeddingForm").reset();
  $("newWeddingError").textContent = "";
  slugEdited = false;
  const cats = categories.length ? categories : [{ id: "wedding", name: "Weddings" }];
  $("newCategory").replaceChildren(...cats.map(c => Object.assign(el("option", "", c.name), { value: c.id })));
  $("newCategory").value = categoryFilter !== "all" && cats.some(c => c.id === categoryFilter) ? categoryFilter : cats[0].id;
  newTemplate = "";
  refreshNewForm();
  show("newWeddingForm");
  $("newGroom").focus();
});
$("cancelNewBtn").addEventListener("click", () => show("newWeddingForm", false));

$("newWeddingForm").addEventListener("submit", async e => {
  e.preventDefault();
  const groom = $("newGroom").value.trim(), bride = $("newBride").value.trim();
  const category = newCategory();
  const id = $("newSlug").value.trim().toLowerCase();
  const error = $("newWeddingError");
  error.textContent = "";
  if(!isValidSlug(id)){ error.textContent = SLUG_RULES; return; }
  if(!templatesIn(templates, category).some(t => t.id === newTemplate)){
    error.textContent = "Pick a template for this event (add one under Templates if the category has none).";
    return;
  }

  $("createWeddingBtn").disabled = true;
  try {
    const ref = fb.doc(fb.db, "weddings", id);
    if((await fb.getDoc(ref)).exists()) throw new Error(`"${id}" is already used by another event. Pick a different link name.`);
    // Start from the category's sample details so every section has something to edit,
    // with the sample's names (e.g. "Aarav turns 1!") swapped for the ones typed in.
    const sample = sampleFor(category);
    let text = JSON.stringify(sample);
    [[tr(sample.groomName, "en"), groom], [tr(sample.brideName, "en"), bride]].forEach(([from, to]) => {
      if(from && to) text = text.split(JSON.stringify(from).slice(1, -1)).join(JSON.stringify(to).slice(1, -1));
    });
    const cfg = normalize(JSON.parse(text));
    cfg.groomName = { en: groom, ta: "" };
    cfg.brideName = { en: bride, ta: "" };
    cfg.templateId = newTemplate;
    cfg.hashtag = category === "wedding" ? "#" + [groom, bride].map(n => n.replace(/[^\p{L}\p{N}]/gu, "")).join("Weds") : "";
    await fb.setDoc(ref, { ...cfg, updatedAt: fb.serverTimestamp() });
    if(!settings.defaultWedding) await fb.setDoc(settingsDoc(), { defaultWedding: id }, { merge: true });
    location.href = `?w=${id}&new=1`;
  } catch(e){
    error.textContent = e.message;
    $("createWeddingBtn").disabled = false;
  }
});

/* ------------------------- import the old invitation ------------------------- */
// Copies site/config and the top-level images, music and wishes into weddings/<id>.
// The originals are left as they are.
async function importLegacy(id, status){
  const target = (...path) => fb.doc(fb.db, "weddings", id, ...path);
  if((await fb.getDoc(target())).exists()) throw new Error(`"${id}" is already used by another wedding.`);

  const { updatedAt, ...rest } = legacyConfig;
  const cfg = clone(rest);
  const images = { ...(cfg.images || {}) };

  // One write per photo or music chunk: each is up to ~900 KB, too big to batch together.
  const ids = Object.keys(images);
  let cover = null;
  for(const [i, imageId] of ids.entries()){
    status(`Copying photos ${i + 1}/${ids.length}…`);
    const snap = await fb.getDoc(fb.doc(fb.db, "images", imageId));
    if(!snap.exists()){ delete images[imageId]; continue; }
    await fb.setDoc(target("images", imageId), snap.data());
    if(imageId === "cover") cover = snap.data().dataUrl;
  }
  if(cover){
    status("Making the link preview…");
    try {
      const og = await compressPreviewImage(await (await fetch(cover)).blob());
      await fb.setDoc(target("images", "og"), { ...og, updatedAt: fb.serverTimestamp() });
      images.og = images.cover;
    } catch(e){
      console.warn("link preview image skipped; the cover photo is used instead", e);
    }
  }

  const m = cfg.music;
  if(m){
    for(let i = 0; i < m.chunks; i++){
      status(`Copying music ${i + 1}/${m.chunks}…`);
      const snap = await fb.getDoc(fb.doc(fb.db, "music", musicChunkId(m.v, i)));
      if(!snap.exists()) throw new Error("A piece of the music is missing, so it can't be copied.");
      await fb.setDoc(target("music", musicChunkId(m.v, i)), snap.data());
    }
  }

  status("Copying wishes…");
  const wishes = await fb.getDocs(fb.collection(fb.db, "wishes"));
  await inBatches(wishes.docs, (batch, d) => batch.set(target("wishes", d.id), d.data()));

  // The wedding doc goes last: until it exists, the link shows "not found" and a retry starts over.
  status("Saving details…");
  await fb.setDoc(target(), { ...cfg, images, updatedAt: fb.serverTimestamp() });
  await fb.setDoc(settingsDoc(), { defaultWedding: id, legacyImported: true }, { merge: true });
}

$("importForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("importSlug").value.trim().toLowerCase();
  const error = $("importError"), btn = $("importBtn");
  error.textContent = "";
  if(!isValidSlug(id)){ error.textContent = SLUG_RULES; return; }

  btn.disabled = true;
  try {
    await importLegacy(id, text => { btn.textContent = text; });
    show("importForm", false);
    toast(`Imported ✓ ${siteHost()}/${id} is ready, and the main link shows it too.`);
    loadWeddings();
  } catch(e){
    console.error(e);
    error.textContent = "Import failed: " + e.message;
  }
  btn.disabled = false;
  btn.textContent = "Import";
});

/* ------------------------------ auth + boot ------------------------------ */
const AUTH_ERRORS = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "No internet connection.",
  "auth/operation-not-allowed": "Email/Password sign-in isn't enabled in Firebase Authentication yet."
};

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  $("loginBtn").disabled = true;
  try {
    await fb.signInWithEmailAndPassword(fb.auth, $("loginEmail").value.trim(), $("loginPassword").value);
  } catch(err){
    $("loginError").textContent = AUTH_ERRORS[err.code] || err.message;
  } finally {
    $("loginBtn").disabled = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  if(hasUnsavedChanges() && !confirm("You have unsaved changes. Log out anyway?")) return;
  discardChanges();
  await fb.signOut(fb.auth);
  location.reload();
});

async function enterApp(user){
  if(appStarted) return;
  appStarted = true;
  show("loginView", false);
  show("appView");
  $("whoAmI").textContent = user.email;

  const banner = $("uidBanner");
  if(ADMIN_UID.startsWith("PASTE")){
    banner.replaceChildren(
      "Setup step: your admin UID is ", el("code", "", user.uid),
      ". Paste it into firestore.rules and js/firebase-config.js, then deploy the rules. Saving fails until then."
    );
    show("uidBanner");
  } else if(user.uid !== ADMIN_UID){
    banner.textContent = "This account isn't the admin account set in firebase-config.js, so Firestore will refuse to save.";
    show("uidBanner");
  }

  // admin?w=<event> edits an event, ?template=<id|new> edits a template,
  // ?view=templates lists templates, and plain admin lists events.
  const templateParam = params.get("template");
  const onTemplates = !!templateParam || params.get("view") === "templates";
  $(onTemplates ? "navTemplates" : "navEvents").classList.add("active");
  if(weddingId) enterEditor();
  else if(templateParam) enterTemplateEditor(templateParam, params.get("category"));
  else if(onTemplates) enterTemplates();
  else enterList();
}

async function enterEditor(){
  try {
    await openEditor({ mod: fb, id: weddingId, backHref: location.pathname, firstRun: params.has("new") });
  } catch(e){
    return backToList(e.message);
  }
  if(params.has("new")) history.replaceState(null, "", "?w=" + weddingId); // don't show the banner again on reload
}

function backToList(msg){
  history.replaceState(null, "", location.pathname);
  toast(msg);
  enterList();
}

if(!isFirebaseConfigured){
  show("setupView");
} else {
  import("./firebase.js").then(mod => {
    fb = mod;
    useFirebase(mod);
    useAccessFirebase(mod);
    fb.onAuthStateChanged(fb.auth, user => {
      if(user) enterApp(user);
      else { show("appView", false); show("loginView"); }
    });
  }).catch(e => {
    console.error(e);
    show("setupView");
    toast("Couldn't load Firebase — check your internet connection.");
  });
}
