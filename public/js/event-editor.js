// The invitation editor: details, photos, music, events, contacts, wishes and (admin only) design.
// Shared by the admin page (admin.js, all events) and the PIN editor page (editor.js, one event).
// Which pages may write what is decided by firestore.rules, not by this file.
import { clone, withDefaults, newId, tr, isWedding, isValidSlug } from "./defaults.js";
import { SITE_URL } from "./firebase-config.js";
import { compressImage, compressPreviewImage, kb } from "./image-utils.js";
import { $, show, el, toast, copyText } from "./admin-ui.js";

// The editor's markup lives here once. The Design tab is only for the admin; it needs
// template access that editors don't have.
const editorMarkup = admin => `
  <div class="editor-head">
    <a class="back" id="backLink" href="#"${admin ? "" : " hidden"}>← All events</a>
    <h1 id="editorTitle"></h1>
    <div class="row">
      <button class="btn ghost small" id="copyLinkBtn">Copy link</button>
      <a class="btn ghost small" id="viewSiteLink" target="_blank" rel="noopener">View site ↗</a>
    </div>
  </div>

  <div class="banner info" id="firstRunBanner" hidden>Sample events and contacts are filled in to start from. Replace them with your own details, use <b>அ Fill missing Tamil</b> for the names, and click <b>Save changes</b>.</div>

  <nav class="tabs" role="tablist">
    <button class="tab active" data-tab="details" id="detailsTab">Couple &amp; Hero</button>
    <button class="tab" data-tab="photos">Photos &amp; Music</button>
    <button class="tab" data-tab="events">Events</button>
    <button class="tab" data-tab="contacts">Help &amp; Contacts</button>
    <button class="tab" data-tab="design">Design</button>
    <button class="tab" data-tab="wishes">Wishes <span class="count" id="wishCount"></span></button>
  </nav>

  <main>
    <section class="panel active" data-panel="details">
      <div class="card" id="detailsForm"></div>
    </section>

    <section class="panel" data-panel="photos">
      <div class="photo-grid">
        <div class="card photo-card" data-image="cover">
          <h2>Couple cover photo</h2>
          <p class="muted">Shown full-width below the names. Landscape works best.</p>
          <img class="preview" alt="">
          <div class="photo-meta muted"></div>
          <div class="row">
            <label class="btn primary">Choose photo<input type="file" accept="image/*" hidden></label>
            <button class="btn ghost" data-remove>Use default</button>
          </div>
        </div>
        <div class="card photo-card" data-image="deity">
          <h2>Deity / emblem image</h2>
          <p class="muted">Shown at the top with a golden glow. A PNG with a transparent background looks best.</p>
          <img class="preview" alt="">
          <div class="photo-meta muted"></div>
          <div class="row">
            <label class="btn primary">Choose image<input type="file" accept="image/*" hidden></label>
            <button class="btn ghost" data-remove>Use default</button>
          </div>
        </div>
        <div class="card music-card">
          <h2>Background music</h2>
          <p class="muted">Starts when guests open the invitation, and loops. MP3 up to 10 MB — 3–5 MB is best so it loads fast on mobile data.</p>
          <div class="music-box">
            <div class="music-icon" aria-hidden="true">🎵</div>
            <div class="music-info">
              <div class="music-name" id="musicName">No music added</div>
              <div class="muted" id="musicMeta"></div>
            </div>
          </div>
          <audio id="musicPreview" controls preload="none" hidden></audio>
          <div class="row">
            <label class="btn primary">Choose music<input type="file" id="musicFile" accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/x-m4a,.mp3,.m4a" hidden></label>
            <button class="btn ghost" id="musicPreviewBtn" hidden>▶ Play current</button>
            <button class="btn ghost" id="musicRemoveBtn" hidden>Remove music</button>
          </div>
        </div>
      </div>
      <p class="muted note">Photos are compressed in your browser before upload so each one fits in Firestore (≈ under 700 KB). Music is split into small pieces and uploaded when you click Save.</p>
    </section>

    <section class="panel" data-panel="events">
      <div id="eventsList"></div>
      <button class="btn ghost add" id="addEventBtn">＋ Add event</button>
    </section>

    <section class="panel" data-panel="contacts">
      <div class="card" id="helpForm"></div>
      <h2 class="list-title">Coordinators</h2>
      <div id="coordList"></div>
      <button class="btn ghost add" id="addCoordBtn">＋ Add coordinator</button>
    </section>

    <section class="panel" data-panel="design">
      <div class="card">
        ${admin ? `<label class="field"><span>Category</span><select id="designCategory"></select>
          <small class="hint">What kind of event this is. Each category has its own templates.</small></label>` : ""}
        <div class="field">
          <span class="label">Template</span>
          <p class="muted design-current" id="designCurrent"></p>
          <div id="designPicker"></div>
        </div>
        <a class="btn ghost small" id="designPreviewLink" target="_blank" rel="noopener">Preview this event in the selected template ↗</a>
      </div>
    </section>

    <section class="panel" data-panel="wishes">
      <div class="card">
        <p class="muted" id="wishSummary">Loading wishes…</p>
        <div class="table-wrap">
          <table class="wish-table">
            <thead><tr><th>When</th><th>Name</th><th>Wish</th><th>Status</th><th></th></tr></thead>
            <tbody id="wishRows"></tbody>
          </table>
        </div>
      </div>
    </section>
  </main>

  <footer class="savebar" id="saveBar">
    <button class="btn ghost fill-tamil" id="fillTamilBtn" title="Translate every empty Tamil box from its English text">அ Fill missing Tamil</button>
    <span class="save-status" id="saveStatus">All changes saved</span>
    <button class="btn primary" id="saveBtn" disabled>Save changes</button>
  </footer>`;

// The host page marks #editorView with data-admin when the admin is using it.
const isAdminPage = $("editorView").hasAttribute("data-admin");
$("editorView").innerHTML = editorMarkup(isAdminPage);

/* ---------------------------- small helpers ---------------------------- */
const asBi = v => (v && typeof v === "object") ? { en: v.en || "", ta: v.ta || "" } : { en: v || "", ta: "" };

const FALLBACK_IMG = { cover: "assets/cover-placeholder.svg", deity: "assets/emblem.svg" };
const BI_KEYS = ["groomName", "brideName", "title", "tagline", "heroDateLine", "accommodationText"];
const EVENT_BI_KEYS = ["name", "date", "time", "place", "venue", "desc"];
const eventImageId = ev => "event-" + ev.id;

/* -------------------------------- state -------------------------------- */
// openEditor() loads one event. Switching event is a page load, so the state below always belongs to one event.
export const shareLink = id => `${SITE_URL}/${id}`;
export const previewLink = id => `./?w=${id}`;   // works on XAMPP and Vercel alike
const wdoc = (...path) => fb.doc(fb.db, "weddings", weddingId, ...path);

let fb = null;
let weddingId = "";
let onDenied = null;         // editor page: called when a save is refused, in case the PIN was revoked
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
export const musicChunkId = (v, i) => `${v}_${i}`;
const mb = n => (n / 1024 / 1024).toFixed(1) + " MB";
let editorOpen = false;

function setDirty(on = true){
  dirty = on;
  $("saveBtn").disabled = !on;
  const s = $("saveStatus");
  s.textContent = on ? "Unsaved changes" : "All changes saved";
  s.classList.toggle("dirty", on);
}
addEventListener("beforeunload", e => { if(dirty){ e.preventDefault(); e.returnValue = ""; } });
export const hasUnsavedChanges = () => dirty;
export const discardChanges = () => { dirty = false; };

export function coupleNames(cfg, fallback = ""){
  return [tr(cfg.groomName, "en"), tr(cfg.brideName, "en")].filter(Boolean).join(" & ") || fallback;
}

export function normalize(cfg){
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
  const wedding = isWedding(state);
  $("detailsTab").textContent = wedding ? "Couple & Hero" : "Names & Hero";
  $("detailsForm").replaceChildren(
    wedding
      ? biField("Groom's name", state, "groomName", { context: "Groom's personal name (transliterate)", hint: "Shown first. Tamil fills in automatically — clear the Tamil box to show the English name in both languages." })
      : biField("Name", state, "groomName", { context: "Person's or family's name (transliterate)", hint: "Who the invitation is from or for, e.g. Ravi, or Aarav for a birthday." }),
    wedding
      ? biField("Bride's name", state, "brideName", { context: "Bride's personal name (transliterate)" })
      : biField("Second name (optional)", state, "brideName", { context: "Person's name (transliterate)", hint: "Shown as “Ravi & Priya”. Leave empty for one name." }),
    biField("Invitation title (optional)", state, "title", { context: "Invitation title",
      hint: wedding ? "Used in link previews instead of “Groom weds Bride”, and as a heading in some templates." : "Example: Gruhapravesam, or Aarav turns 1! Used as the heading in some templates and in link previews." }),
    istDateTimeField(wedding ? "Muhurtham date & time (India time)" : "Main event date & time (India time)", state, "weddingDateTimeISO", "The countdown on the invite counts down to this moment."),
    biField("Date line under the names", state, "heroDateLine", { context: "Event date and city line", hint: wedding ? "Example: 💍 12th February 2027 • Chennai" : "Example: 🏡 14th March 2027 • Coimbatore" }),
    biField("Tagline / your story", state, "tagline", { multiline: true, context: wedding ? "Invitation message from the couple" : "Invitation message from the hosts" }),
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
      biField("Event name", ev, "name", { context: "Event / ceremony name", onInput: () => { title.textContent = ev.name.en || "Untitled event"; } }),
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

/* --------------------------------- design --------------------------------- */
// Which category this event is in and which template shows it (state.category / state.templateId).
// The admin can change both; an editor can only pick another template of the event's own category.
let categories = [];         // [{ id, name, order }]
let templates = [];          // [{ id, name, categoryId, html, … }]
let T = null;                // admin-templates.js: template cards and previews for the Design tab

function renderDesign(){
  const sel = $("designCategory");
  if(sel){
    sel.replaceChildren(...categories.map(c => Object.assign(el("option", "", c.name), { value: c.id })));
    if(!categories.some(c => c.id === state.category)) sel.prepend(Object.assign(el("option", "", state.category), { value: state.category }));
    sel.value = state.category;
  }

  const offered = T.templatesIn(templates, state.category).some(t => t.id === state.templateId);
  $("designCurrent").textContent = "Now showing: " + T.templateName(templates, state.templateId) +
    (offered ? "" : ` (not a ${T.categoryName(categories, state.category)} template — pick one below)`);
  $("designPicker").replaceChildren(T.templatePicker({
    templates, category: state.category, selected: state.templateId, name: "designTemplate", canCreate: isAdminPage,
    onChange: id => {
      state.templateId = id;
      $("designCurrent").textContent = "Now showing: " + T.templateName(templates, id);
      $("designPreviewLink").href = T.eventInTemplateLink(weddingId, id);
      setDirty();
    }
  }));
  $("designPreviewLink").href = T.eventInTemplateLink(weddingId, state.templateId);
}

$("designCategory")?.addEventListener("change", () => {
  state.category = $("designCategory").value;
  // Switch to the new category's first template; keep the current one if the category has none yet.
  const list = T.templatesIn(templates, state.category);
  if(list.length && !list.some(t => t.id === state.templateId)) state.templateId = list[0].id;
  setDirty();
  renderDesign();
  renderDetails();
});

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
      ? (onDenied ? "Couldn't save — your editor access may have been changed." : "Permission denied — check the admin UID in firestore.rules and deploy the rules.")
      : "Save failed: " + e.message);
    setDirty(true);
    if(e.code === "permission-denied") onDenied?.();
  }
}
$("saveBtn").addEventListener("click", save);
addEventListener("keydown", e => {
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && editorOpen){ e.preventDefault(); save(); }
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

$("copyLinkBtn").addEventListener("click", () => copyText(shareLink(weddingId)));

/* ---------------------------------- open ---------------------------------- */
// Loads the event into the editor and shows it. `mod` is the Firebase module (firebase.js or
// editor-firebase.js); the page must have signed in already. Rejects with a readable message.
// `backHref` (admin only) is the link back to the events list. `onAccessDenied` is called when a save is refused.
export async function openEditor({ mod, id, backHref = "", firstRun = false, onAccessDenied = null }){
  fb = mod;
  weddingId = id;
  onDenied = onAccessDenied;

  let snap = null;
  try {
    if(isValidSlug(weddingId)) snap = await fb.getDoc(wdoc());
  } catch(e){
    throw new Error("Couldn't load this event: " + e.message);
  }
  if(!snap?.exists()) throw new Error(`There's no event with the link name "${weddingId}".`);

  const data = snap.data();
  delete data.updatedAt;
  state = normalize(data);
  try {
    T = await import("./admin-templates.js");
    T.useFirebase(fb);
    if(isAdminPage){
      [categories, templates] = await Promise.all([T.loadCategories(), T.loadTemplates()]);
    } else {
      // Only the templates of this event's category.
      const snap = await fb.getDocs(fb.query(fb.collection(fb.db, "templates"), fb.where("categoryId", "==", state.category || "wedding")));
      templates = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch(e){
    console.warn("categories/templates unavailable", e);
    toast(isAdminPage ? "Couldn't load templates — deploy the latest firestore.rules (see SETUP.md)." : "Couldn't load the designs right now.");
  }

  show("editorView");
  $("editorTitle").textContent = coupleNames(state, weddingId);
  document.title = coupleNames(state, weddingId) + (isAdminPage ? " · Invitation Admin" : " · Invitation Editor");
  if(isAdminPage) $("backLink").href = backHref;
  $("viewSiteLink").href = previewLink(weddingId);
  show("firstRunBanner", firstRun);

  renderDetails();
  renderHelp();
  renderEvents();
  renderCoords();
  if(T) renderDesign();
  refreshPhoto("cover");
  refreshPhoto("deity");
  refreshMusic();
  setDirty(false);
  editorOpen = true;
  loadSavedImages();
  watchWishes();
}
