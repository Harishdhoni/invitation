import { DEFAULT_CONFIG, clone, withDefaults, newId, tr, slugify, isValidSlug } from "./defaults.js";
import { isFirebaseConfigured, ADMIN_UID, SITE_URL } from "./firebase-config.js";
import { compressImage, compressPreviewImage, kb } from "./image-utils.js";

/* ---------------------------- small helpers ---------------------------- */
const $ = id => document.getElementById(id);
const show = (id, on = true) => { $(id).hidden = !on; };
function el(tag, className, text){
  const n = document.createElement(tag);
  if(className) n.className = className;
  if(text !== undefined) n.textContent = text;
  return n;
}
const asBi = v => (v && typeof v === "object") ? { en: v.en || "", ta: v.ta || "" } : { en: v || "", ta: "" };

let toastTimer;
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3800);
}

const FALLBACK_IMG = { cover: "assets/cover-placeholder.svg", deity: "assets/emblem.svg" };
const BI_KEYS = ["groomName", "brideName", "tagline", "heroDateLine", "accommodationText"];
const EVENT_BI_KEYS = ["name", "date", "time", "place", "venue", "desc"];
const eventImageId = ev => "event-" + ev.id;

/* -------------------------------- state -------------------------------- */
// admin?w=<wedding> edits that wedding; plain admin lists them all.
// Switching wedding is a page load, so the state below always belongs to one wedding.
const params = new URLSearchParams(location.search);
const weddingId = params.get("w") || "";
const shareLink = id => `${SITE_URL}/${id}`;
const previewLink = id => `./?w=${id}`;   // works on XAMPP and Vercel alike
const wdoc = (...path) => fb.doc(fb.db, "weddings", weddingId, ...path);
const settingsDoc = () => fb.doc(fb.db, "site", "settings");

let fb = null;
let state = null;            // working copy of weddings/<weddingId>, bound to the form inputs
let pendingImages = {};      // imageId -> { dataUrl, w, h } chosen but not yet saved
const removedImages = new Set();
const loadedImages = {};     // imageId -> data URL already in Firestore
let pendingMusic = null;     // { bytes, name, type, size, url } chosen but not yet saved
let removeMusic = false;
let dirty = false;

// Firestore caps a document at 1 MiB, so music is stored as ~900 KB chunks
// in music/<version>_<index>, described by state.music = { v, chunks, size, type, name }.
const MUSIC_CHUNK = 900_000;
const MUSIC_MAX = 10 * 1024 * 1024;
const musicChunkId = (v, i) => `${v}_${i}`;
const mb = n => (n / 1024 / 1024).toFixed(1) + " MB";
let appStarted = false;

function setDirty(on = true){
  dirty = on;
  $("saveBtn").disabled = !on;
  const s = $("saveStatus");
  s.textContent = on ? "Unsaved changes" : "All changes saved";
  s.classList.toggle("dirty", on);
}
addEventListener("beforeunload", e => { if(dirty){ e.preventDefault(); e.returnValue = ""; } });

function normalize(cfg){
  const s = withDefaults(cfg);
  BI_KEYS.forEach(k => { s[k] = asBi(s[k]); });
  s.images = s.images || {};
  s.music = s.music || null;
  s.events = (s.events || []).map(ev => {
    const out = { mapQuery: "", mapUrl: "", ...ev, id: ev.id || newId() };
    EVENT_BI_KEYS.forEach(k => { out[k] = asBi(ev[k]); });
    out.icon = { type: "emoji", emoji: "✨", imageId: "", ...(ev.icon || {}) };
    return out;
  });
  s.coordinators = (s.coordinators || []).map(c => ({
    name: asBi(c.name),
    phones: c.phones || (c.phone ? [c.phone] : [])
  }));
  return s;
}

/* ---------------------------- field builders ---------------------------- */
// Every builder writes straight into the given object, so `state` is always current.
// English edits are translated into the Tamil box after a short pause (see autoTranslate).
// `context` tells the translator what the text is, e.g. "Event venue name".
function biField(label, obj, key, { multiline = false, hint = "", onInput, context = label } = {}){
  obj[key] = asBi(obj[key]);
  const text = obj[key];
  const wrap = el("div", "field");
  wrap.append(el("span", "label", label));
  const bi = el("div", "bi");
  const box = (cls, tag) => {
    const b = el("div", "lang " + cls);
    b.dataset.lang = tag;
    const input = multiline ? el("textarea") : Object.assign(el("input"), { type: "text" });
    input.value = text[cls] || "";
    b.append(input);
    bi.append(b);
    return [b, input];
  };
  const [, enInput] = box("en", "EN");
  const [taBox, taInput] = box("ta", "தமிழ்");
  taInput.placeholder = "Fills in automatically from English";

  const auto = autoTranslate(text, taBox, taInput, context);
  enInput.addEventListener("input", () => { text.en = enInput.value; setDirty(); onInput?.(); auto.schedule(); });
  taInput.addEventListener("input", () => { text.ta = taInput.value; setDirty(); auto.manualEdit(); });

  wrap.append(bi);
  if(hint) wrap.append(el("small", "hint", hint));
  return wrap;
}

/* ---------------------------- auto-translate ---------------------------- */
// Uses Gemini via Firebase AI Logic (js/translate.js), loaded on first use.
// A Tamil box typed in by hand stops following the English until "Translate again".
let translatorModule = null;
let translateOff = false;   // set when AI Logic isn't enabled, so we don't retry on every keystroke
let lastTranslateToast = 0;
const autoFields = new Set();
const loadTranslator = () => (translatorModule ||= import("./translate.js"));

function autoTranslate(text, taBox, taInput, context){
  let timer = null, seq = 0, manual = false;
  const again = el("button", "retranslate", "↻ Translate again");
  again.type = "button";
  again.hidden = true;
  taBox.append(again);
  const status = s => { taBox.dataset.lang = "தமிழ்" + (s ? " · " + s : ""); };

  async function run(){
    clearTimeout(timer);
    const en = (text.en || "").trim();
    const my = ++seq;
    if(!en){
      if(text.ta){ text.ta = ""; taInput.value = ""; setDirty(); }
      status("");
      return;
    }
    status("translating…");
    try {
      const out = await (await loadTranslator()).toTamil(en, context);
      if(my !== seq || manual) return;
      if(out !== text.ta){ text.ta = out; taInput.value = out; setDirty(); }
      status("auto");
    } catch(e){
      if(my === seq) status("");
      await reportTranslateError(e);
    }
  }

  again.addEventListener("click", () => {
    manual = false;
    translateOff = false;
    again.hidden = true;
    run();
  });

  const field = {
    schedule(){
      if(manual || translateOff) return;
      clearTimeout(timer);
      // Long text goes to the slower, better model, so wait for a longer pause first.
      timer = setTimeout(run, (text.en || "").length > 80 ? 1800 : 900);
    },
    manualEdit(){
      manual = true;
      seq++;                 // drop any translation still in flight
      clearTimeout(timer);
      status("edited");
      again.hidden = false;
    },
    needsFill: () => !manual && !(text.ta || "").trim() && !!(text.en || "").trim(),
    item: () => ({ text: text.en.trim(), context }),
    apply(out){ text.ta = out; taInput.value = out; status("auto"); },
    get connected(){ return taInput.isConnected; }
  };
  autoFields.add(field);
  return field;
}

async function reportTranslateError(e){
  console.warn("translation failed", e);
  const kind = translatorModule ? (await translatorModule).translateErrorKind(e) : "other";
  if(kind === "not-enabled") translateOff = true;
  if(Date.now() - lastTranslateToast < 6000) return;
  lastTranslateToast = Date.now();
  toast(kind === "not-enabled"
    ? "Auto-translate needs AI Logic switched on: Firebase console → AI Logic → Get started → Gemini Developer API."
    : kind === "quota" ? "Translation limit reached for the moment — try again in a minute."
    : "Couldn't translate right now: " + String(e?.message || e).slice(0, 120));
}

// Fill every empty Tamil box that has English, in a few batched requests.
$("fillTamilBtn").addEventListener("click", async () => {
  for(const f of autoFields) if(!f.connected) autoFields.delete(f);
  const todo = [...autoFields].filter(f => f.needsFill());
  if(!todo.length) return toast("Every Tamil box already has text.");
  const btn = $("fillTamilBtn");
  btn.disabled = true;
  translateOff = false;
  try {
    const t = await loadTranslator();
    for(let i = 0; i < todo.length; i += 15){
      const group = todo.slice(i, i + 15);
      btn.textContent = `Translating ${Math.min(i + 15, todo.length)}/${todo.length}…`;
      const outs = await t.toTamilBatch(group.map(f => f.item()));
      group.forEach((f, j) => { if(outs[j]) f.apply(outs[j]); });
    }
    setDirty();
    toast(`Filled ${todo.length} Tamil field${todo.length === 1 ? "" : "s"} — check them, then Save.`);
  } catch(e){
    await reportTranslateError(e);
  }
  btn.disabled = false;
  btn.textContent = "அ Fill missing Tamil";
});

function textField(label, obj, key, { multiline = false, hint = "", placeholder = "", onInput } = {}){
  const wrap = el("label", "field");
  wrap.append(el("span", "", label));
  const input = multiline ? el("textarea") : Object.assign(el("input"), { type: "text" });
  input.value = obj[key] || "";
  input.placeholder = placeholder;
  input.addEventListener("input", () => { obj[key] = input.value; setDirty(); onInput?.(); });
  wrap.append(input);
  if(hint) wrap.append(el("small", "hint", hint));
  return wrap;
}

// Stored as "YYYY-MM-DDTHH:MM:00+05:30" so the countdown is right for guests in any timezone.
function istDateTimeField(label, obj, key, hint){
  const wrap = el("label", "field");
  wrap.append(el("span", "", label));
  const input = Object.assign(el("input"), { type: "datetime-local" });
  input.value = (obj[key] || "").slice(0, 16);
  input.addEventListener("input", () => { obj[key] = input.value ? input.value + ":00+05:30" : ""; setDirty(); });
  wrap.append(input);
  if(hint) wrap.append(el("small", "hint", hint));
  return wrap;
}

function iconBtn(label, title, disabled, onClick, extra = ""){
  const b = el("button", "icon-btn " + extra, label);
  b.type = "button"; b.title = title; b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function moveItem(list, i, dir, rerender){
  const j = i + dir;
  if(j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  setDirty();
  rerender();
}

/* ------------------------------ form panels ------------------------------ */
function renderDetails(){
  $("detailsForm").replaceChildren(
    biField("Groom's name", state, "groomName", { context: "Groom's personal name (transliterate)", hint: "Shown first. Tamil fills in automatically — clear the Tamil box to show the English name in both languages." }),
    biField("Bride's name", state, "brideName", { context: "Bride's personal name (transliterate)" }),
    istDateTimeField("Muhurtham date & time (India time)", state, "weddingDateTimeISO", "The countdown on the invite counts down to this moment."),
    biField("Date line under the names", state, "heroDateLine", { context: "Wedding date and city line", hint: "Example: 💍 12th February 2027 • Chennai" }),
    biField("Tagline / your story", state, "tagline", { multiline: true, context: "Invitation message from the couple" }),
    textField("Hashtag", state, "hashtag", { placeholder: "#ArjunWedsMeera", hint: "Shown in the footer." }),
    textField("Opening verse on the curtain", state, "curtainVerse", { multiline: true, hint: "Shown before guests tap to open the invite. Line breaks are kept." })
  );
}

function renderHelp(){
  $("helpForm").replaceChildren(
    biField("Message for outstation guests", state, "accommodationText", { multiline: true, context: "Help message for outstation guests" })
  );
}

function iconChooser(ev){
  const id = eventImageId(ev);
  const wrap = el("div", "field");
  wrap.append(el("span", "label", "Icon"));
  const row = el("div", "icon-choice");

  const radio = (value, text) => {
    const l = el("label");
    const r = Object.assign(el("input"), { type: "radio", name: "icon-" + ev.id, value, checked: ev.icon.type === value });
    r.addEventListener("change", () => { ev.icon.type = value; setDirty(); });
    l.append(r, text);
    return l;
  };
  const emoji = Object.assign(el("input"), { type: "text", value: ev.icon.emoji || "", maxLength: 12, title: "Paste any emoji" });
  emoji.addEventListener("input", () => { ev.icon.emoji = emoji.value; ev.icon.type = "emoji"; row.querySelector("input[value=emoji]").checked = true; setDirty(); });

  const preview = el("img", "icon-preview");
  preview.alt = "";
  preview.dataset.imgId = id;
  const src = pendingImages[id]?.dataUrl || loadedImages[id];
  if(src) preview.src = src; else preview.hidden = true;

  const upload = el("label", "btn ghost small", "Upload image");
  const file = Object.assign(el("input"), { type: "file", accept: "image/*", hidden: true });
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    if(!f) return;
    try {
      pendingImages[id] = await compressImage(f, { maxDim: 256, maxChars: 150_000, alpha: true });
      ev.icon.type = "image";
      ev.icon.imageId = id;
      setDirty();
      renderEvents();
    } catch(e){ toast(e.message); }
  });
  upload.append(file);

  row.append(radio("emoji", " Emoji"), emoji, radio("image", " Image"), preview, upload);
  wrap.append(row);
  return wrap;
}

function renderEvents(){
  const list = $("eventsList");
  list.replaceChildren();
  state.events.forEach((ev, i) => {
    const card = el("div", "card item");
    const head = el("div", "item-head");
    const title = el("h3", "", ev.name.en || "Untitled event");
    const tools = el("div", "item-tools");
    tools.append(
      iconBtn("↑", "Move up", i === 0, () => moveItem(state.events, i, -1, renderEvents)),
      iconBtn("↓", "Move down", i === state.events.length - 1, () => moveItem(state.events, i, 1, renderEvents)),
      iconBtn("✕", "Remove event", false, () => {
        if(!confirm(`Remove the event "${ev.name.en || "Untitled"}"?`)) return;
        state.events.splice(i, 1);
        delete pendingImages[eventImageId(ev)];
        setDirty();
        renderEvents();
      }, "del")
    );
    head.append(title, tools);

    const maps = el("div", "two-col");
    maps.append(
      textField("Google Maps search text", ev, "mapQuery", { hint: "Used by the “Get Directions” button.", placeholder: "Venue name, area, city, PIN" }),
      textField("…or a Google Maps link (optional)", ev, "mapUrl", { hint: "Overrides the search text when filled.", placeholder: "https://maps.app.goo.gl/…" })
    );

    card.append(
      head,
      biField("Event name", ev, "name", { context: "Wedding event / ceremony name", onInput: () => { title.textContent = ev.name.en || "Untitled event"; } }),
      biField("Date", ev, "date", { context: "Event date", hint: "Type it exactly as guests should read it, e.g. 12th February 2027." }),
      biField("Time", ev, "time", { context: "Event time" }),
      biField("Venue name", ev, "place", { context: "Venue / hall / temple name (transliterate)" }),
      biField("Address", ev, "venue", { context: "Venue address: area, city, PIN (transliterate place names)" }),
      biField("Short description (optional)", ev, "desc", { multiline: true, context: "Event description" }),
      maps,
      iconChooser(ev)
    );
    list.append(card);
  });
}

function renderCoords(){
  const list = $("coordList");
  list.replaceChildren();
  state.coordinators.forEach((c, i) => {
    const card = el("div", "card item");
    const head = el("div", "item-head");
    const title = el("h3", "", c.name.en || "New coordinator");
    const tools = el("div", "item-tools");
    tools.append(
      iconBtn("↑", "Move up", i === 0, () => moveItem(state.coordinators, i, -1, renderCoords)),
      iconBtn("↓", "Move down", i === state.coordinators.length - 1, () => moveItem(state.coordinators, i, 1, renderCoords)),
      iconBtn("✕", "Remove coordinator", false, () => {
        if(!confirm(`Remove "${c.name.en || "this coordinator"}"?`)) return;
        state.coordinators.splice(i, 1);
        setDirty();
        renderCoords();
      }, "del")
    );
    head.append(title, tools);

    const phones = el("label", "field");
    const input = Object.assign(el("input"), { type: "tel", value: c.phones.join(", "), placeholder: "+91 90000 00000, +91 91111 11111" });
    input.addEventListener("input", () => { c.phones = input.value.split(",").map(s => s.trim()).filter(Boolean); setDirty(); });
    phones.append(el("span", "", "Phone numbers"), input, el("small", "hint", "Separate multiple numbers with commas. Each becomes a tap-to-call link."));

    card.append(head, biField("Name", c, "name", { context: "Family coordinator's personal name (transliterate)", onInput: () => { title.textContent = c.name.en || "New coordinator"; } }), phones);
    list.append(card);
  });
}

$("addEventBtn").addEventListener("click", () => {
  state.events.push(normalize({ events: [{
    icon: { type: "emoji", emoji: "🎊" }, name: { en: "New event", ta: "" }
  }] }).events[0]);
  setDirty();
  renderEvents();
  $("eventsList").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("addCoordBtn").addEventListener("click", () => {
  state.coordinators.push({ name: { en: "", ta: "" }, phones: [] });
  setDirty();
  renderCoords();
});

/* --------------------------------- photos --------------------------------- */
function refreshPhoto(id){
  const card = document.querySelector(`.photo-card[data-image="${id}"]`);
  const pending = pendingImages[id];
  const hasSaved = state.images[id] && !removedImages.has(id);
  const current = hasSaved ? loadedImages[id] : null;
  card.querySelector(".preview").src = pending?.dataUrl || current || FALLBACK_IMG[id];
  card.querySelector(".photo-meta").textContent =
    pending ? `New image: ${pending.w}×${pending.h}px, ${kb(pending.dataUrl)} KB — click Save to publish`
    : current ? `Current image (${kb(current)} KB)`
    : hasSaved ? "Loading current image…"
    : "Using the default image";
}

document.querySelectorAll(".photo-card").forEach(card => {
  const id = card.dataset.image;
  const file = card.querySelector("input[type=file]");
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    if(!f) return;
    card.querySelector(".photo-meta").textContent = "Compressing…";
    try {
      pendingImages[id] = await compressImage(f, id === "cover" ? { maxDim: 1600 } : { maxDim: 900, alpha: true });
      removedImages.delete(id);
      // The cover also becomes the WhatsApp/Facebook preview image (api/og-image.js).
      if(id === "cover"){ pendingImages.og = await compressPreviewImage(f); removedImages.delete("og"); }
      setDirty();
    } catch(e){ toast(e.message); }
    refreshPhoto(id);
  });
  card.querySelector("[data-remove]").addEventListener("click", () => {
    const ids = id === "cover" ? ["cover", "og"] : [id];
    ids.forEach(i => { delete pendingImages[i]; if(state.images[i]) removedImages.add(i); });
    setDirty();
    refreshPhoto(id);
  });
});

/* --------------------------------- music --------------------------------- */
function refreshMusic(){
  const saved = !removeMusic && state.music;
  const preview = $("musicPreview");
  if(pendingMusic){
    $("musicName").textContent = pendingMusic.name;
    $("musicMeta").textContent = `${mb(pendingMusic.size)} — new, click Save to publish`;
    preview.src = pendingMusic.url;
    preview.hidden = false;
  } else if(saved){
    $("musicName").textContent = saved.name || "Background music";
    $("musicMeta").textContent = `${mb(saved.size || 0)} — live on the invite`;
    if(!preview.dataset.loadedV || preview.dataset.loadedV !== String(saved.v)){ preview.hidden = true; preview.removeAttribute("src"); }
  } else {
    $("musicName").textContent = "No music added";
    $("musicMeta").textContent = removeMusic ? "Music will be removed when you click Save" : "The music button stays hidden on the invite until you add a song.";
    preview.hidden = true;
    preview.removeAttribute("src");
  }
  $("musicPreviewBtn").hidden = !!pendingMusic || !saved || !preview.hidden;
  $("musicRemoveBtn").hidden = !pendingMusic && !saved;
}

$("musicFile").addEventListener("change", async () => {
  const f = $("musicFile").files[0];
  $("musicFile").value = "";
  if(!f) return;
  if(!/^audio\//.test(f.type) && !/\.(mp3|m4a)$/i.test(f.name)) return toast("Please choose an audio file (MP3 or M4A).");
  if(f.size > MUSIC_MAX) return toast(`That file is ${mb(f.size)}. Please use a song under 10 MB (3–5 MB is best).`);
  if(pendingMusic) URL.revokeObjectURL(pendingMusic.url);
  pendingMusic = {
    bytes: new Uint8Array(await f.arrayBuffer()),
    name: f.name,
    type: f.type || "audio/mpeg",
    size: f.size,
    url: URL.createObjectURL(f)
  };
  removeMusic = false;
  setDirty();
  refreshMusic();
});

$("musicRemoveBtn").addEventListener("click", () => {
  if(pendingMusic){ URL.revokeObjectURL(pendingMusic.url); pendingMusic = null; }
  else removeMusic = true;
  setDirty();
  refreshMusic();
});

$("musicPreviewBtn").addEventListener("click", async () => {
  const m = state.music;
  if(!m) return;
  $("musicPreviewBtn").disabled = true;
  $("musicMeta").textContent = "Loading…";
  try {
    const parts = await Promise.all(Array.from({ length: m.chunks }, async (_, i) => {
      const snap = await fb.getDoc(wdoc("music", musicChunkId(m.v, i)));
      return snap.data().data.toUint8Array();
    }));
    const preview = $("musicPreview");
    preview.src = URL.createObjectURL(new Blob(parts, { type: m.type || "audio/mpeg" }));
    preview.dataset.loadedV = String(m.v);
    preview.hidden = false;
    preview.play().catch(() => {});
  } catch(e){
    toast("Couldn't load the current music: " + e.message);
  }
  $("musicPreviewBtn").disabled = false;
  refreshMusic();
});

// Upload the new song's chunks (one write each — a batch can't hold several MB).
async function uploadMusic(){
  const { bytes, name, type, size } = pendingMusic;
  const v = Date.now();
  const chunks = Math.ceil(bytes.length / MUSIC_CHUNK);
  try {
    for(let i = 0; i < chunks; i++){
      $("saveStatus").textContent = `Uploading music ${i + 1}/${chunks}…`;
      await fb.setDoc(wdoc("music", musicChunkId(v, i)), {
        data: fb.Bytes.fromUint8Array(bytes.subarray(i * MUSIC_CHUNK, (i + 1) * MUSIC_CHUNK))
      });
    }
  } catch(e){
    deleteMusicChunks({ v, chunks });
    throw e;
  }
  return { v, chunks, size, type, name };
}

function deleteMusicChunks(m){
  if(!m) return Promise.resolve();
  return Promise.all(Array.from({ length: m.chunks }, (_, i) =>
    fb.deleteDoc(wdoc("music", musicChunkId(m.v, i))).catch(() => {})));
}

async function loadSavedImages(){
  const ids = Object.keys(state.images).filter(id => id !== "og"); // the preview copy isn't shown here
  await Promise.all(ids.map(async id => {
    try {
      const snap = await fb.getDoc(wdoc("images", id));
      if(snap.exists()) loadedImages[id] = snap.data().dataUrl;
    } catch(e){ console.warn("image load failed", id, e); }
  }));
  refreshPhoto("cover");
  refreshPhoto("deity");
  document.querySelectorAll("img.icon-preview").forEach(img => {
    const src = pendingImages[img.dataset.imgId]?.dataUrl || loadedImages[img.dataset.imgId];
    if(src){ img.src = src; img.hidden = false; }
  });
}

/* ---------------------------------- save ---------------------------------- */
async function save(){
  if(!dirty || !state) return;
  $("saveBtn").disabled = true;
  $("saveStatus").textContent = "Saving…";
  const oldMusic = state.music;
  let music = removeMusic ? null : state.music;
  try {
    if(pendingMusic) music = await uploadMusic();
    $("saveStatus").textContent = "Saving…";

    const batch = fb.writeBatch(fb.db);
    const version = Date.now();
    const images = { ...state.images };

    state.events.forEach(ev => { if(ev.icon.type === "image") ev.icon.imageId = eventImageId(ev); });
    for(const [id, img] of Object.entries(pendingImages)){
      batch.set(wdoc("images", id), { ...img, updatedAt: fb.serverTimestamp() });
      images[id] = version;
    }

    // Delete image docs nothing points at any more (removed photos, deleted events).
    const keep = new Set(["cover", "deity"].filter(id => images[id] && !removedImages.has(id)));
    if(keep.has("cover") && images.og && !removedImages.has("og")) keep.add("og");
    state.events.forEach(ev => { if(ev.icon.type === "image" && images[eventImageId(ev)]) keep.add(eventImageId(ev)); });
    for(const id of Object.keys(images)){
      if(!keep.has(id)){ batch.delete(wdoc("images", id)); delete images[id]; }
    }

    batch.set(wdoc(), { ...clone(state), images, music, updatedAt: fb.serverTimestamp() });
    try {
      await batch.commit();
    } catch(e){
      if(music && music !== oldMusic) deleteMusicChunks(music); // config still points at the old song
      throw e;
    }

    // The new config is live; the previous song's chunks are no longer referenced.
    if(oldMusic && oldMusic !== music) deleteMusicChunks(oldMusic);
    state.music = music;
    if(pendingMusic){
      const preview = $("musicPreview");
      preview.dataset.loadedV = String(music.v); // the preview already holds this song
      pendingMusic = null;
    }
    removeMusic = false;
    refreshMusic();

    state.images = images;
    Object.entries(pendingImages).forEach(([id, img]) => { loadedImages[id] = img.dataUrl; });
    pendingImages = {};
    removedImages.clear();
    setDirty(false);
    show("firstRunBanner", false);
    refreshPhoto("cover");
    refreshPhoto("deity");
    toast("Saved ✓ Guests see the changes when they open or refresh the invite.");
  } catch(e){
    console.error(e);
    toast(e.code === "permission-denied"
      ? "Permission denied — check the admin UID in firestore.rules and deploy the rules."
      : "Save failed: " + e.message);
    setDirty(true);
  }
}
$("saveBtn").addEventListener("click", save);
addEventListener("keydown", e => {
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && appStarted){ e.preventDefault(); save(); }
});

/* --------------------------------- wishes --------------------------------- */
function renderWishRows(docs){
  const body = $("wishRows");
  body.replaceChildren();
  let hidden = 0;
  docs.forEach(d => {
    const w = d.data({ serverTimestamps: "estimate" });
    if(w.hidden) hidden++;
    const row = el("tr", w.hidden ? "is-hidden" : "");
    const when = w.createdAt?.toDate
      ? w.createdAt.toDate().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
    const status = el("td");
    status.append(el("span", w.hidden ? "badge off" : "badge ok", w.hidden ? "Hidden" : "Visible"));

    const acts = el("td", "acts");
    const toggle = el("button", "btn ghost small", w.hidden ? "Show" : "Hide");
    toggle.addEventListener("click", () =>
      fb.updateDoc(wdoc("wishes", d.id), { hidden: !w.hidden }).catch(e => toast("Failed: " + e.message)));
    const del = el("button", "btn danger small", "Delete");
    del.addEventListener("click", () => {
      if(confirm(`Delete the wish from "${w.name}" permanently?`))
        fb.deleteDoc(wdoc("wishes", d.id)).catch(e => toast("Failed: " + e.message));
    });
    acts.append(toggle, del);

    row.append(el("td", "when", when), el("td", "", w.name), el("td", "msg", w.message), status, acts);
    body.append(row);
  });
  if(!docs.length){
    const row = el("tr");
    const td = el("td", "muted", "No wishes yet.");
    td.colSpan = 5;
    row.append(td);
    body.append(row);
  }
  $("wishSummary").textContent = `${docs.length} wish${docs.length === 1 ? "" : "es"} · ${hidden} hidden from guests. Changes apply instantly.`;
  $("wishCount").textContent = docs.length || "";
}

function watchWishes(){
  const q = fb.query(fb.collection(wdoc(), "wishes"), fb.orderBy("createdAt", "desc"), fb.limit(500));
  fb.onSnapshot(q, snap => renderWishRows(snap.docs),
    e => { $("wishSummary").textContent = "Could not load wishes: " + e.message; });
}

/* ---------------------------------- tabs ---------------------------------- */
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.dataset.panel === tab.dataset.tab));
}));

/* ------------------------------ weddings list ------------------------------ */
let settings = {};           // site/settings: { defaultWedding, legacyImported }
let weddings = [];           // [{ id, cfg }]
let legacyConfig = null;     // site/config from before multi-wedding, until it's imported

const SLUG_RULES = "Use 3–40 lowercase letters, numbers and dashes, like arjun-meera. " +
  "admin, api, assets, css, js and index are used by the site itself.";
const siteHost = () => SITE_URL.replace(/^https?:\/\//, "");

function coupleNames(cfg, fallback = ""){
  return [tr(cfg.groomName, "en"), tr(cfg.brideName, "en")].filter(Boolean).join(" & ") || fallback;
}

function weddingTime(cfg){
  const t = new Date(cfg.weddingDateTimeISO || "").getTime();
  return isNaN(t) ? null : t;
}

async function copyText(text){
  try {
    await navigator.clipboard.writeText(text);
    toast("Link copied: " + text);
  } catch {
    prompt("Copy this link:", text);
  }
}

function actionBtn(label, className, onClick){
  const b = el("button", "btn small " + className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
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

async function loadWeddings(){
  const status = $("weddingsStatus");
  status.textContent = "Loading weddings…";
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
      : "Couldn't load weddings: " + e.message;
    return;
  }

  if(legacyConfig && $("importForm").hidden){
    $("importSlug").value = slugify(`${tr(legacyConfig.groomName, "en")}-${tr(legacyConfig.brideName, "en")}`);
    show("importForm");
  }
  if(!legacyConfig) show("importForm", false);
  renderWeddings();
}

function renderWeddings(){
  // Upcoming weddings first (soonest at the top), then past ones (most recent first).
  // A wedding counts as upcoming until a day after its Muhurtham.
  const cutoff = Date.now() - 86_400_000;
  const time = w => weddingTime(w.cfg) ?? Infinity;
  const upcoming = weddings.filter(w => time(w) >= cutoff).sort((a, b) => time(a) - time(b));
  const past = weddings.filter(w => time(w) < cutoff).sort((a, b) => time(b) - time(a));

  $("weddingsList").replaceChildren(...upcoming.map(w => weddingCard(w, false)), ...past.map(w => weddingCard(w, true)));
  $("weddingsStatus").textContent = weddings.length ? "" : "No weddings yet. Click ＋ New wedding to create the first one.";
  show("weddingsStatus", !weddings.length);
}

function weddingCard(w, isPast){
  const card = el("div", "card wedding-card" + (isPast ? " past" : ""));
  const head = el("div", "item-head");
  const tags = el("div", "item-tools");
  const isMain = settings.defaultWedding === w.id;
  if(isMain) tags.append(el("span", "badge main", "Main link"));
  if(isPast) tags.append(el("span", "badge off", "Past"));
  head.append(el("h3", "", coupleNames(w.cfg, w.id)), tags);

  const t = weddingTime(w.cfg);
  const when = el("p", "muted", t
    ? new Date(t).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "No Muhurtham date set");

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

  card.append(head, when, link, acts);
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
    await fb.deleteDoc(ref());   // last, so a failed delete can simply be retried
    if(settings.defaultWedding === w.id) await fb.setDoc(settingsDoc(), { defaultWedding: "" }, { merge: true });
    toast(`Deleted ${name}.`);
  } catch(e){
    console.error(e);
    toast("Delete failed: " + e.message);
  }
  loadWeddings();
}

/* ------------------------------ new wedding ------------------------------ */
let slugEdited = false;
const suggestSlug = () => {
  if(!slugEdited) $("newSlug").value = slugify(`${$("newGroom").value}-${$("newBride").value}`);
};
$("newGroom").addEventListener("input", suggestSlug);
$("newBride").addEventListener("input", suggestSlug);
$("newSlug").addEventListener("input", () => { slugEdited = true; });

$("newWeddingBtn").addEventListener("click", () => {
  $("newWeddingForm").reset();
  $("newWeddingError").textContent = "";
  slugEdited = false;
  show("newWeddingForm");
  $("newGroom").focus();
});
$("cancelNewBtn").addEventListener("click", () => show("newWeddingForm", false));

$("newWeddingForm").addEventListener("submit", async e => {
  e.preventDefault();
  const groom = $("newGroom").value.trim(), bride = $("newBride").value.trim();
  const id = $("newSlug").value.trim().toLowerCase();
  const error = $("newWeddingError");
  error.textContent = "";
  if(!isValidSlug(id)){ error.textContent = SLUG_RULES; return; }

  $("createWeddingBtn").disabled = true;
  try {
    const ref = fb.doc(fb.db, "weddings", id);
    if((await fb.getDoc(ref)).exists()) throw new Error(`"${id}" is already used by another wedding. Pick a different link name.`);
    // Start from the sample details so every section has something to edit.
    const cfg = normalize(clone(DEFAULT_CONFIG));
    cfg.groomName = { en: groom, ta: "" };
    cfg.brideName = { en: bride, ta: "" };
    cfg.hashtag = "#" + [groom, bride].map(n => n.replace(/[^\p{L}\p{N}]/gu, "")).join("Weds");
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
  if(dirty && !confirm("You have unsaved changes. Log out anyway?")) return;
  dirty = false;
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

  if(weddingId) enterEditor();
  else enterList();
}

async function enterEditor(){
  let snap = null;
  try {
    if(isValidSlug(weddingId)) snap = await fb.getDoc(wdoc());
  } catch(e){
    return backToList("Couldn't load this wedding: " + e.message);
  }
  if(!snap?.exists()) return backToList(`There's no wedding with the link name "${weddingId}".`);

  const data = snap.data();
  delete data.updatedAt;
  state = normalize(data);

  show("editorView");
  $("editorTitle").textContent = coupleNames(state, weddingId);
  document.title = coupleNames(state, weddingId) + " · Wedding Admin";
  $("backLink").href = location.pathname;
  $("viewSiteLink").href = previewLink(weddingId);
  if(params.has("new")){
    show("firstRunBanner");
    history.replaceState(null, "", "?w=" + weddingId); // don't show it again on reload
  }

  renderDetails();
  renderHelp();
  renderEvents();
  renderCoords();
  refreshPhoto("cover");
  refreshPhoto("deity");
  refreshMusic();
  setDirty(false);
  loadSavedImages();
  watchWishes();
}

$("copyLinkBtn").addEventListener("click", () => copyText(shareLink(weddingId)));

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
