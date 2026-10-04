// The invitation runtime: fills the page with one event's details, photos, music and wishes.
// The page is either the built-in Classic design (index.html) or a template from Firestore that
// follows the hooks described in TEMPLATES.md; every hook is optional.
import {
  DEFAULT_CONFIG, TRANSLATIONS, SAMPLE_WISHES, tr, withDefaults, clone, isValidSlug, isValidId, isWedding, sampleFor
} from "./defaults.js";
import { isFirebaseConfigured, SITE_URL } from "./firebase-config.js";

/* ---------------------------- small helpers ---------------------------- */
const $ = id => document.getElementById(id);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k){ try { localStorage.removeItem(k); } catch {} },
  keys(){ try { return Object.keys(localStorage); } catch { return []; } }
};
function el(tag, className, text){
  const n = document.createElement(tag);
  if(className) n.className = className;
  if(text !== undefined) n.textContent = text;
  return n;
}
const safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : "");
const meta = name => document.querySelector(`meta[name="${name}"]`)?.content;

// Show or hide with an inline style, so a template's own `display` rules can't override it.
function setShown(n, on){
  if(n.dataset.display === undefined) n.dataset.display = n.style.display;
  n.style.display = on ? n.dataset.display : "none";
}
// Fill a hook: text, a node, or a function making a node. Empty values hide the element.
function setContent(n, v){
  const empty = v === "" || v == null;
  setShown(n, !empty);
  if(empty) return;
  if(typeof v === "function") n.replaceChildren(v());
  else n.textContent = v;
}

/* ----------------------------- which page ----------------------------- */
const params = new URLSearchParams(location.search);
// The admin's template editor previews unsaved HTML with sample details for this category.
const draftCategory = meta("invite-preview");
// ?template=<id> previews a saved template; ?template-file= a starter file in public/templates/.
const previewTemplate = isValidId(params.get("template")) ? params.get("template") : "";
const previewFile = /^templates\/[a-z0-9-]+\.html$/.test(params.get("template-file") || "") ? params.get("template-file") : "";
const preview = draftCategory != null || !!previewTemplate || !!previewFile;
// The design already in this page: a template put here by api/invite.js, or "" for Classic.
let pageTemplate = meta("template-id") || "";

// On Vercel, /arjun-meera is served by api/invite.js, which adds <meta name="wedding-id">.
// ?w= is for local previews; the last path segment covers Firebase Hosting's rewrite.
// The main link "/" has none of these and shows the wedding picked in the admin.
const pageSlug = draftCategory != null ? "" : (meta("wedding-id")
  || params.get("w")
  || [location.pathname.split("/").pop()].find(isValidSlug)
  || "");
let slug = isValidSlug(pageSlug) ? pageSlug : "";
const badLink = !!pageSlug && !slug;

const CONFIG_CACHE = () => "wi:config:" + slug;
const IMG_PREFIX = () => `wi:img:${slug}:`;
const IMG_CACHE = id => IMG_PREFIX() + id;
const DEFAULT_WEDDING = "wi:default";
const LOCAL_WISHES = "wi:wishes";
const WISH_PAGE = 30;

// Shown until the event's details load, so guests never see the sample names.
const BLANK = {
  ...clone(DEFAULT_CONFIG), groomName: "", brideName: "", tagline: "", heroDateLine: "", hashtag: "", title: "",
  curtainVerse: "", accommodationText: "", weddingDateTimeISO: "", events: [], coordinators: []
};

/* -------------------------------- state -------------------------------- */
function cachedConfig(){
  if(!slug) return null;
  try { const c = JSON.parse(store.get(CONFIG_CACHE())); return c ? withDefaults(c) : null; }
  catch { return null; }
}
let config = clone(BLANK);
let notFound = false;
let lang = "en";
const T = () => TRANSLATIONS[lang];
const images = {};   // imageId -> data URL currently known
let fb = null;       // Firebase module, once loaded
let wishes = [];
let started = false;
const weddingDoc = (...path) => fb.doc(fb.db, "weddings", slug, ...path);
const lists = {};    // events / wishes / coords -> { box, tpl } (tpl: the template's <template>, if any)

/* ------------------------------- rendering ------------------------------- */
// First letter, keeping Tamil vowel signs with their consonant where the browser can tell.
const initial = s => {
  if(!s) return "";
  const first = typeof Intl.Segmenter === "function" ? [...new Intl.Segmenter().segment(s)][0]?.segment : [...s][0];
  return (first || "").toUpperCase();
};

function namesNode(groom, bride){
  const f = document.createDocumentFragment();
  if(groom && bride) f.append(el("span", "name-part", groom), " ", el("span", "hero-amp", "&"), " ", el("span", "name-part", bride));
  else f.append(el("span", "name-part", groom || bride));
  return f;
}

function verseNode(text){
  const f = document.createDocumentFragment();
  text.split("\n").forEach(line => { const s = el("span", "vl", line); s.style.display = "block"; f.append(s); });
  return f;
}

// Date parts for templates: from a Date, in the given time zone, in the page language.
function dateParts(d, timeZone){
  if(!d || isNaN(d)) return {};
  const f = o => new Intl.DateTimeFormat(lang === "ta" ? "ta-IN" : "en-GB", { timeZone, ...o }).format(d);
  const p = { day: f({ day: "numeric" }), month: f({ month: "long" }), monthNum: f({ month: "2-digit" }), year: f({ year: "numeric" }), weekday: f({ weekday: "long" }) };
  p.mon = lang === "ta" ? f({ month: "short" }) : p.month.slice(0, 3).toUpperCase();
  p.dateLong = `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
  return p;
}

// Event dates are typed as text ("12th February 2027", "Feb 12, 2027"); read the day, month and year from the English.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function parseEventDate(s){
  const a = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?\s+(\d{4})/i.exec(s);
  const b = !a && /([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(s);
  const [day, mon, year] = a ? [a[1], a[2], a[3]] : b ? [b[2], b[1], b[3]] : [];
  const m = MONTHS.indexOf((mon || "").slice(0, 3).toLowerCase());
  return m < 0 ? null : new Date(Date.UTC(+year, m, +day, 12));
}

function mainDate(){
  const d = new Date(config.weddingDateTimeISO);
  if(isNaN(d)) return {};
  const time = new Intl.DateTimeFormat(lang === "ta" ? "ta-IN" : "en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(d);
  return { ...dateParts(d, "Asia/Kolkata"), time };
}

function pageTitle(){
  const g = tr(config.groomName, "en"), b = tr(config.brideName, "en"), t = tr(config.title, "en");
  if(t) return t;
  if(isWedding(config) && g && b) return `${g} weds ${b}`;
  return [g, b].filter(Boolean).join(" & ");
}

// data-bind hooks, plus the ids the Classic design and older templates use.
const COMPAT = { names: ".couple-names", tagline: "#heroTagline", dateLine: "#heroDatePill", verse: "#curtainVerse", help: "#stayText", hashtag: "#footerHashtag" };
function renderValues(){
  const g = tr(config.groomName, lang), b = tr(config.brideName, lang);
  const verse = notFound ? T().notFound : (config.curtainVerse || "");
  const values = {
    names: g || b ? () => namesNode(g, b) : "",
    name1: g, name2: b, initial1: initial(g), initial2: initial(b),
    title: tr(config.title, lang),
    tagline: tr(config.tagline, lang),
    dateLine: tr(config.heroDateLine, lang),
    verse: verse ? () => verseNode(verse) : "",
    help: tr(config.accommodationText, lang),
    hashtag: config.hashtag || "",
    ...mainDate()
  };
  for(const [key, v] of Object.entries(values)){
    document.querySelectorAll(`[data-bind="${key}"]` + (COMPAT[key] ? ", " + COMPAT[key] : "")).forEach(n => setContent(n, v));
  }
  const title = pageTitle();
  if(title) document.title = title;
}

// Fill one copied list item: data-field values, data-href links and data-if conditions.
function fill(root, { fields, hrefs = {} }){
  root.querySelectorAll("[data-field]").forEach(n => setContent(n, fields[n.dataset.field]));
  root.querySelectorAll("[data-href]").forEach(n => {
    const h = hrefs[n.dataset.href];
    if(h) n.setAttribute("href", h);
    if(h && n.dataset.href === "map" && !n.target){ n.target = "_blank"; n.rel = "noopener"; }
    setShown(n, !!h);
  });
  root.querySelectorAll("[data-if]").forEach(n => setShown(n, !!fields[n.dataset.if]));
}

function grabList(name, id){
  const box = $(id);
  lists[name] = box ? { box, tpl: [...box.children].find(c => c.tagName === "TEMPLATE") || null } : null;
}

// Re-render a list from the template's <template> (or the Classic markup). Items that were
// already revealed stay revealed, so switching language doesn't replay the animation.
function renderList(name, items, item, classic){
  const l = lists[name];
  if(!l) return;
  const shown = l.box.dataset.shown === "1" || !!l.box.querySelector(".reveal.in");
  [...l.box.children].forEach(c => { if(c !== l.tpl) c.remove(); });
  items.forEach((x, i) => {
    if(!l.tpl) return l.box.append(classic(x, i));
    const copy = l.tpl.content.cloneNode(true);
    fill(copy, item(x, i));
    translate(copy);
    l.box.append(copy);
  });
  if(shown){
    l.box.dataset.shown = "1";
    l.box.querySelectorAll(".reveal").forEach(n => n.classList.add("in"));
  }
  observeReveals();
}

const mapUrl = ev => safeUrl(ev.mapUrl) ||
  (ev.mapQuery || tr(ev.venue, "en")
    ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ev.mapQuery || `${tr(ev.place, "en")} ${tr(ev.venue, "en")}`)
    : "");

function iconNode(ev){
  const src = ev.icon?.type === "image" && images[ev.icon.imageId];
  if(!src) return document.createTextNode(ev.icon?.emoji || "✨");
  const img = el("img");
  img.src = src;
  img.alt = "";
  return img;
}

function renderEvents(){
  renderList("events", config.events, (ev, i) => ({
    fields: {
      number: String(i + 1).padStart(2, "0"),
      name: tr(ev.name, lang), date: tr(ev.date, lang), time: tr(ev.time, lang),
      place: tr(ev.place, lang), venue: tr(ev.venue, lang), desc: tr(ev.desc, lang),
      icon: () => iconNode(ev),
      ...dateParts(parseEventDate(tr(ev.date, "en")), "UTC")
    },
    hrefs: { map: mapUrl(ev) }
  }), classicEvent);
}

function classicEvent(ev, i){
  const card = el("div", `event-card reveal delay${i % 3}`);
  const icon = el("div", "event-icon");
  icon.append(iconNode(ev));
  card.append(icon, el("div", "event-name", tr(ev.name, lang)));

  const meta = el("div", "event-meta");
  meta.append(el("b", "", tr(ev.date, lang)));
  if(tr(ev.time, lang)) meta.append(el("br"), tr(ev.time, lang));
  if(tr(ev.place, lang)) meta.append(el("br"), el("span", "event-place", tr(ev.place, lang)));
  if(tr(ev.venue, lang)) meta.append(el("br"), "📍 " + tr(ev.venue, lang));
  card.append(meta);

  if(tr(ev.desc, lang)) card.append(el("p", "event-desc", tr(ev.desc, lang)));

  const url = mapUrl(ev);
  if(url){
    const actions = el("div", "event-actions");
    const a = el("a", "btn-ghost", T().getDirections);
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    actions.append(a);
    card.append(actions);
  }
  return card;
}

const telHref = p => "tel:" + p.replace(/[^\d+]/g, "");
function phoneLinks(phones){
  const f = document.createDocumentFragment();
  phones.forEach((p, i) => {
    if(i) f.append(", ");
    const a = el("a", "", p);
    a.href = telHref(p);
    f.append(a);
  });
  return f;
}

function renderCoordinators(){
  renderList("coords", config.coordinators || [], c => {
    const phones = (c.phones || []).filter(Boolean);
    return {
      fields: { name: tr(c.name, lang), phone: phones[0] || "", phones: phones.length ? () => phoneLinks(phones) : "" },
      hrefs: { tel: phones[0] ? telHref(phones[0]) : "" }
    };
  }, c => {
    const line = el("span", "coord");
    line.append(el("b", "", tr(c.name, lang)), ": ", phoneLinks((c.phones || []).filter(Boolean)));
    return line;
  });
}

function renderImages(){
  const set = (img, src) => {
    if(img.dataset.defaultSrc === undefined) img.dataset.defaultSrc = img.getAttribute("src") || "";
    const want = src || img.dataset.defaultSrc;
    if(want && img.getAttribute("src") !== want) img.src = want;
  };
  document.querySelectorAll('[data-bind="cover"], #coverImg').forEach(img => set(img, images.cover));
  document.querySelectorAll('[data-bind="emblem"], #deityImg').forEach(img => set(img, images.deity));
}

function renderWishes(){
  renderList("wishes", wishes, w => ({ fields: { message: w.message, name: w.name } }), w => {
    const card = el("div", "wish-card");
    card.append(el("p", "", `“${w.message}”`), el("span", "", "— " + w.name));
    return card;
  });
  const empty = $("wishesEmpty");
  if(empty){ empty.hidden = wishes.length > 0; setShown(empty, !wishes.length); }
}

// Built-in UI text for data-i18n hooks, in the page or in a newly copied list item.
function translate(root){
  const dict = T();
  root.querySelectorAll("[data-i18n]").forEach(n => { const v = dict[n.dataset.i18n]; if(v !== undefined) n.textContent = v; });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(n => { const v = dict[n.dataset.i18nPlaceholder]; if(v !== undefined) n.placeholder = v; });
  root.querySelectorAll("[data-i18n-title]").forEach(n => { const v = dict[n.dataset.i18nTitle]; if(v !== undefined) n.title = v; });
}

function renderAll(){
  document.documentElement.lang = lang;
  translate(document);
  document.querySelectorAll(".lang-btn").forEach(b => b.classList.toggle("active", b.dataset.lang === lang));

  document.querySelectorAll("#openCurtainBtn, [data-open-invite], .curtain-tap").forEach(n => setShown(n, !notFound));
  renderValues();
  renderEvents();
  renderCoordinators();
  renderWishes();
  updateCountdown();
  document.dispatchEvent(new CustomEvent("invite:render", { detail: { config: clone(config), lang } }));
}

/* ------------------------------- countdown ------------------------------- */
function updateCountdown(){
  const target = new Date(config.weddingDateTimeISO).getTime();
  const diff = Math.max(0, (isNaN(target) ? 0 : target) - Date.now());
  const pad = n => String(n).padStart(2, "0");
  const put = (id, v) => { const n = $(id); if(n) n.textContent = pad(v); };
  put("cdDays", Math.floor(diff / 86400000));
  put("cdHours", Math.floor(diff % 86400000 / 3600000));
  put("cdMins", Math.floor(diff % 3600000 / 60000));
  put("cdSecs", Math.floor(diff % 60000 / 1000));
}

/* ------------------------------- toast ------------------------------- */
let toastTimer;
function showToast(msg){
  let t = $("toast");
  if(!t){
    t = el("div");
    t.id = "toast";
    t.setAttribute("role", "status");
    Object.assign(t.style, {
      position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", zIndex: 2000, maxWidth: "calc(100vw - 32px)",
      padding: "10px 18px", borderRadius: "999px", background: "rgba(20,16,14,.9)", color: "#fff", font: "14px/1.4 system-ui,sans-serif",
      textAlign: "center", transition: "opacity .3s", opacity: 0, pointerEvents: "none"
    });
    document.body.append(t);
    t.dataset.auto = "1";
  }
  t.textContent = msg;
  t.classList.add("show");
  if(t.dataset.auto) t.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); if(t.dataset.auto) t.style.opacity = 0; }, 2600);
}

/* --------------------------- Firestore loading --------------------------- */
// Images are versioned in config.images; a matching version in localStorage
// means repeat visitors download nothing.
function cachedImage(id){
  const v = config.images?.[id];
  if(!v) return null;
  try {
    const c = JSON.parse(store.get(IMG_CACHE(id)));
    return c && c.v === v ? c.dataUrl : null;
  } catch { return null; }
}

function neededImageIds(){
  const ids = ["cover", "deity"];
  config.events.forEach(ev => { if(ev.icon?.type === "image" && ev.icon.imageId) ids.push(ev.icon.imageId); });
  return ids.filter(id => config.images?.[id]);
}

function loadImagesFromCache(){
  for(const id of Object.keys(images)) delete images[id];
  if(preview) return;
  neededImageIds().forEach(id => { const d = cachedImage(id); if(d) images[id] = d; });
}

function cacheImage(id, dataUrl){
  if(preview) return;
  const value = JSON.stringify({ v: config.images[id], dataUrl });
  if(store.set(IMG_CACHE(id), value)) return;
  // Out of space: drop cached images that the current config no longer uses, then retry once.
  const keep = new Set(neededImageIds().map(IMG_CACHE));
  store.keys().filter(k => k.startsWith("wi:img:") && !keep.has(k)).forEach(store.del);
  store.set(IMG_CACHE(id), value);
}

async function loadRemoteImages(){
  const missing = neededImageIds().filter(id => !images[id]);
  await Promise.all(missing.map(async id => {
    try {
      const snap = await fb.getDoc(weddingDoc("images", id));
      if(snap.exists()){ images[id] = snap.data().dataUrl; cacheImage(id, images[id]); }
    } catch(e){ console.warn("image load failed", id, e); }
  }));
  if(missing.length){ renderImages(); renderEvents(); }
}

// The event's saved details, or null when there's no such event. Throws when offline.
async function fetchConfig(){
  const snap = await fb.getDoc(weddingDoc());
  if(!snap.exists()) return null;
  const data = snap.data();
  delete data.updatedAt;
  return withDefaults(data);
}

// Show freshly loaded details, and remember them for the next visit.
function applyConfig(cfg){
  config = cfg;
  if(!preview){
    store.set(CONFIG_CACHE(), JSON.stringify(config));
    const keep = new Set(neededImageIds().map(IMG_CACHE));
    store.keys().filter(k => k.startsWith(IMG_PREFIX()) && !keep.has(k)).forEach(store.del);
  }
  loadImagesFromCache();
  renderAll();
  renderImages();
  loadMusic();
  return loadRemoteImages();
}

// Re-check the details shown from the cache. If the admin has since picked another
// design, reload once so the page starts over with it.
async function refreshConfig(){
  try {
    const cfg = await fetchConfig();
    if(!cfg){ store.del(CONFIG_CACHE()); return showNotFound(); }
    if((cfg.templateId || "") !== pageTemplate){
      store.set(CONFIG_CACHE(), JSON.stringify(cfg));
      const key = "wi:design:" + slug;
      let last = null;
      try { last = sessionStorage.getItem(key); sessionStorage.setItem(key, cfg.templateId || "classic"); } catch {}
      if(last !== (cfg.templateId || "classic")) return location.reload();
    }
    await applyConfig(cfg);
  } catch(e){
    console.warn("Could not load the details; showing the cached copy.", e);
    loadMusic();
  }
}

// The main link "/" shows whichever event the admin marked as the main one.
async function defaultWedding(){
  try {
    const snap = await fb.getDoc(fb.doc(fb.db, "site", "settings"));
    const s = snap.exists() ? snap.data().defaultWedding : "";
    if(!isValidSlug(s)) return "";
    store.set(DEFAULT_WEDDING, s);
    return s;
  } catch(e){
    console.warn("Could not load site settings; using the last known event.", e);
    return store.get(DEFAULT_WEDDING) || "";
  }
}

function showNotFound(){
  notFound = true;
  config = clone(BLANK);
  if(unsubWishes){ unsubWishes(); unsubWishes = null; }
  wishes = [];
  if(musicBtn) setShown(musicBtn, false);
  renderAll();
}

/* ------------------------------ templates ------------------------------ */
async function fetchTemplate(id){
  const snap = await fb.getDoc(fb.doc(fb.db, "templates", id));
  return snap.exists() ? snap.data() : null;
}

// Put a whole template page in place of this one. This module keeps running and fills
// it in afterwards; the template's own scripts are re-created so the browser runs them.
async function swapDocument(html){
  const next = new DOMParser().parseFromString(html, "text/html");
  document.replaceChild(document.adoptNode(next.documentElement), document.documentElement);
  for(const old of [...document.querySelectorAll("script")]){
    if(/(^|\/)js\/invite\.js(\?|$)/.test(old.getAttribute("src") || "")){ old.remove(); continue; }
    const s = document.createElement("script");
    for(const a of old.attributes) s.setAttribute(a.name, a.value);
    s.textContent = old.textContent;
    if(s.src){
      s.async = false;
      const loaded = new Promise(r => { s.onload = s.onerror = r; });
      old.replaceWith(s);
      await loaded;
    } else old.replaceWith(s);
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
}

// Switch this page to the design with this id ("" = Classic). Keeps the current page if that fails.
async function useTemplate(id){
  try {
    let html;
    if(id){
      const t = await fetchTemplate(id);
      if(!t?.html) return console.warn(`Template "${id}" not found; showing the current design.`);
      html = t.html;
    } else {
      html = await (await fetch("./", { cache: "no-cache" })).text();
    }
    await swapDocument(html);
    pageTemplate = id;
  } catch(e){
    console.warn("Couldn't load the design; showing the current one.", e);
  }
}

/* -------------------------------- wishes -------------------------------- */
let wishLimit = WISH_PAGE, unsubWishes = null;

function subscribeWishes(){
  if(unsubWishes) unsubWishes();
  const q = fb.query(
    fb.collection(weddingDoc(), "wishes"),
    fb.where("hidden", "==", false),
    fb.orderBy("createdAt", "desc"),
    fb.limit(wishLimit)
  );
  unsubWishes = fb.onSnapshot(q, snap => {
    wishes = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    const more = $("wishesMore");
    if(more){ more.hidden = snap.size < wishLimit; setShown(more, !more.hidden); }
    renderWishes();
  }, e => console.warn("wishes listener failed", e));
}

function loadLocalWishes(){
  try { wishes = JSON.parse(store.get(LOCAL_WISHES)) || []; } catch { wishes = []; }
  renderWishes();
}

async function sendWish(e){
  e.preventDefault();
  const nameIn = $("wishName"), msgIn = $("wishMessage");
  const name = nameIn.value.trim().slice(0, 60), message = msgIn.value.trim().slice(0, 500);
  if(!name || !message) return;

  e.target.reset();
  if(preview){
    wishes.unshift({ name, message });
    renderWishes();
    return showToast(T().previewWish);
  }
  showToast(T().wishThanks);

  if(!fb){
    wishes.unshift({ name, message });
    store.set(LOCAL_WISHES, JSON.stringify(wishes));
    renderWishes();
    return;
  }
  // The live listener shows the new wish immediately (Firestore applies local
  // writes before the server confirms); this await only catches rejections.
  try {
    await fb.addDoc(fb.collection(weddingDoc(), "wishes"), {
      name, message, hidden: false, createdAt: fb.serverTimestamp()
    });
  } catch(err){
    console.warn("wish not saved", err);
    if(!nameIn.value && !msgIn.value){ nameIn.value = name; msgIn.value = message; }
    showToast(T().wishFailed);
  }
}

/* -------------------------------- music -------------------------------- */
// The song is uploaded from the admin page as ~900 KB Firestore chunks
// (music/<v>_<i>). It is fetched while the intro is showing, then kept in
// the Cache API so repeat visits download nothing.
const MUSIC_CACHE = "wi-music";
let musicBtn = null, bgMusic = null;
let musicPlaying = false, musicReady = false, wantMusic = false, musicV = null;

// Templates may leave the music button out; add a plain one when there's a song.
function ensureMusicControls(){
  if(!bgMusic){
    bgMusic = Object.assign(el("audio"), { id: "bgMusic", loop: true, preload: "auto" });
    document.body.append(bgMusic);
  }
  bgMusic.volume = 0.45;
  if(!musicBtn){
    musicBtn = el("button", "", "🎵");
    musicBtn.id = "musicToggle";
    musicBtn.type = "button";
    musicBtn.setAttribute("aria-label", T().musicHint);
    Object.assign(musicBtn.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: 1500, width: "48px", height: "48px", borderRadius: "50%",
      border: "1px solid rgba(0,0,0,.15)", background: "rgba(255,255,255,.92)", boxShadow: "0 4px 14px rgba(0,0,0,.2)",
      fontSize: "22px", cursor: "pointer"
    });
    document.body.append(musicBtn);
    musicBtn.addEventListener("click", toggleMusic);
  }
}

function startMusic(){
  if(musicPlaying || !config.music || !bgMusic) return;
  if(!musicReady){
    // iOS only lets an <audio> element play from a tap. Play a silent clip now so
    // the element is unlocked and the real song can start once it has loaded.
    wantMusic = true;
    bgMusic.src = silentWav();
    bgMusic.play().catch(() => {});
    return;
  }
  bgMusic.play().then(() => {
    musicPlaying = true;
    musicBtn.classList.add("spinning");
    musicBtn.textContent = "🎶";
  }).catch(() => showToast(T().musicBlocked));
}
function stopMusic(){
  wantMusic = false;
  bgMusic.pause();
  musicPlaying = false;
  musicBtn.classList.remove("spinning");
  musicBtn.textContent = "🎵";
}
function toggleMusic(){
  if(musicPlaying) return stopMusic();
  if(!musicReady) showToast(T().musicLoading);
  startMusic();
}

let silentUrl;
function silentWav(){
  if(silentUrl) return silentUrl;
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  return (silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
}

async function loadMusic(){
  const m = config.music;
  if(m) ensureMusicControls();
  if(musicBtn){ musicBtn.hidden = !m; setShown(musicBtn, !!m); }
  if(!m || musicV === m.v) return;
  musicV = m.v;
  musicReady = false;
  const prefix = `music-cache/${slug}/`, key = prefix + m.v;
  let blob = null;
  try {
    const hit = await (await caches.open(MUSIC_CACHE)).match(key);
    if(hit) blob = await hit.blob();
  } catch {}
  try {
    if(!blob){
      if(!fb) throw new Error("offline");
      const parts = await Promise.all(Array.from({ length: m.chunks }, async (_, i) => {
        const snap = await fb.getDoc(weddingDoc("music", `${m.v}_${i}`));
        return snap.data().data.toUint8Array();
      }));
      blob = new Blob(parts, { type: m.type || "audio/mpeg" });
      try {
        const cache = await caches.open(MUSIC_CACHE);
        for(const req of await cache.keys()) // drop this event's older songs
          if(req.url.includes("/" + prefix)) await cache.delete(req);
        await cache.put(key, new Response(blob, { headers: { "content-type": blob.type } }));
      } catch {}
    }
  } catch(e){
    console.warn("music unavailable", e);
    musicV = null;
    setShown(musicBtn, false);
    return;
  }
  if(musicV !== m.v) return; // a newer config arrived meanwhile
  const wasWanted = wantMusic;
  bgMusic.src = URL.createObjectURL(blob);
  musicReady = true;
  if(wasWanted) startMusic();
}

/* ------------------------------ interactions ------------------------------ */
// Opening the intro is a user gesture, so the music can start here
// (browsers block autoplay without one).
let opened = false;
function openInvite(){
  if(opened) return;
  opened = true;
  const overlay = $("curtain-overlay");
  if(overlay){
    overlay.classList.add("open");
    setTimeout(() => overlay.classList.add("hidden"), Number(overlay.dataset.hideAfter) || 1500);
  }
  document.body.classList.remove("locked");
  startMusic();
}

function wirePage(){
  document.querySelectorAll(".lang-btn").forEach(btn => btn.addEventListener("click", () => {
    lang = btn.dataset.lang === "ta" ? "ta" : "en";
    store.set("wi:lang", lang);
    renderAll();
  }));

  // Always share this event's link on the live site, even when the page is opened
  // from localhost, a Vercel preview URL, or the main link "/".
  $("shareBtn")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(slug ? `${SITE_URL}/${slug}` : location.href); showToast(T().linkCopied); }
    catch { showToast(T().linkCopyFailed); }
  });

  document.querySelectorAll("#openCurtainBtn, [data-open-invite]").forEach(b => b.addEventListener("click", openInvite));
  $("wishForm")?.addEventListener("submit", sendWish);
  $("wishesMore")?.addEventListener("click", () => {
    wishLimit += WISH_PAGE;
    subscribeWishes();
  });
  musicBtn?.addEventListener("click", toggleMusic);
}

/* ---------------------------- reveal on scroll ---------------------------- */
let io = null;
function observeReveals(){
  if(!started) return;
  if(!io && "IntersectionObserver" in window){
    io = new IntersectionObserver(entries => entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      entry.target.classList.add("in");
      io.unobserve(entry.target);
    }), { threshold: 0.15 });
  }
  document.querySelectorAll(".reveal:not(.in)").forEach(n => io ? io.observe(n) : n.classList.add("in"));
}

/* ------------------------- Classic design extras ------------------------- */
// Gold corners, falling petals, the scroll bar and the dot navigation — only in index.html.
const CORNER_SVG = `<svg viewBox="0 0 80 80" fill="none" stroke="#d4af37" stroke-width="1.4" stroke-linecap="round">
  <path d="M3 77V22Q3 3 22 3h55"/>
  <path d="M10 70V26Q10 10 26 10h44" opacity=".5"/>
  <path d="M22 3c0 10-6 15-12 15M3 22c10 0 15-6 15-12" opacity=".8"/>
  <path d="M30 10c6 4 12 4 18 0M10 30c4 6 4 12 0 18" opacity=".6"/>
  <circle cx="18" cy="18" r="3.2" fill="#d4af37" stroke="none"/>
  <circle cx="54" cy="10" r="1.6" fill="#d4af37" stroke="none"/>
  <circle cx="10" cy="54" r="1.6" fill="#d4af37" stroke="none"/>
</svg>`;

function classicExtras(){
  document.querySelectorAll("#hero > .corner").forEach(c => { c.innerHTML = CORNER_SVG; });

  const petals = $("petals-container");
  if(petals){
    ["🌸", "🌼"].flatMap(g => [g, g, g, g]).forEach(glyph => {
      const p = el("div", "petal", glyph);
      const dur = 9 + Math.random() * 10;
      p.style.left = Math.random() * 100 + "vw";
      p.style.setProperty("--drift", (Math.random() * 140 - 70) + "px");
      p.style.animationDuration = dur + "s";
      p.style.animationDelay = Math.random() * dur + "s";
      p.style.fontSize = (12 + Math.random() * 10) + "px";
      petals.append(p);
    });
    ["✦", "✧", "✦", "✧", "✦", "✧"].forEach(glyph => {
      const s = el("div", "sparkle", glyph);
      const dur = 11 + Math.random() * 9;
      s.style.left = Math.random() * 100 + "vw";
      s.style.fontSize = (9 + Math.random() * 11) + "px";
      s.style.animationDuration = dur + "s";
      s.style.animationDelay = Math.random() * dur + "s";
      petals.append(s);
    });
  }

  const bar = $("scrollProgress");
  if(!bar) return;
  const sections = ["hero", "coupleCover", "events", "countdown", "wishes", "stay"].map($).filter(Boolean);
  const dots = document.querySelectorAll("#dotNav a");
  let ticking = false;
  function onScroll(){
    ticking = false;
    const top = window.scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? top / max * 100 : 0) + "%";
    let current = "hero";
    sections.forEach(s => { if(top >= s.offsetTop - innerHeight * 0.5) current = s.id; });
    dots.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current));
  }
  addEventListener("scroll", () => { if(!ticking){ ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
}

/* --------------------------------- boot --------------------------------- */
// Runs once the right design is in the page.
function start(){
  if(started) return;
  started = true;
  const root = document.documentElement;
  root.classList.add("js");
  root.classList.remove("booting");
  // Templates without a language switch are written in English (or Tamil, with <html lang="ta">).
  lang = document.querySelector(".lang-btn")
    ? (store.get("wi:lang") === "ta" ? "ta" : "en")
    : (root.lang === "ta" ? "ta" : "en");

  grabList("events", "eventsGrid");
  grabList("wishes", "wishesWall");
  grabList("coords", "coordinators");
  musicBtn = $("musicToggle");
  bgMusic = $("bgMusic");
  if(bgMusic) bgMusic.volume = 0.45;
  wirePage();
  classicExtras();
  // Admin thumbnails and previews in a frame show the page without the intro.
  if(preview && window.self !== window.top){
    $("curtain-overlay")?.classList.add("open", "hidden");
    document.body.classList.remove("locked");
    opened = true;
  }

  loadImagesFromCache();
  renderAll();
  renderImages();
  setInterval(updateCountdown, 1000);
}

async function boot(){
  // Template editor preview: sample details, nothing loaded from Firestore.
  if(draftCategory != null){
    config = sampleFor(draftCategory);
    wishes = clone(SAMPLE_WISHES);
    return start();
  }
  if(!isFirebaseConfigured){
    config = clone(DEFAULT_CONFIG);
    start();
    return loadLocalWishes();
  }
  if(badLink){ start(); return showNotFound(); }

  // A starter file from public/templates/, with sample details.
  if(previewFile){
    const html = await (await fetch(previewFile, { cache: "no-cache" })).text();
    config = sampleFor(params.get("category") || "wedding");
    wishes = clone(SAMPLE_WISHES);
    await swapDocument(html);
    return start();
  }

  try { fb = await import("./firebase.js"); }
  catch(e){
    console.warn("Firebase unavailable; using local data.", e);
    config = cachedConfig() || clone(BLANK);
    start();
    return loadLocalWishes();
  }

  // ?template=<id>: that template with sample details, or with an event's details when ?w= is given.
  if(previewTemplate){
    // "classic" is the built-in design already in this page.
    const t = previewTemplate === "classic" ? null : await fetchTemplate(previewTemplate).catch(() => null);
    const cfg = slug ? await fetchConfig().catch(() => null) : null;
    config = cfg || sampleFor(t?.categoryId);
    if(!slug) wishes = clone(SAMPLE_WISHES);
    if(t?.html) await swapDocument(t.html);
    start();
    if(cfg){ applyConfig(cfg); subscribeWishes(); }
    return;
  }

  if(!slug){
    slug = await defaultWedding();
    if(!slug){ start(); return showNotFound(); }
  }

  // Use the details saved on the last visit straight away; otherwise wait for them,
  // since they say which design this event uses.
  const cached = cachedConfig();
  let fresh = null;
  if(!cached){
    try {
      fresh = await fetchConfig();
      if(!fresh){ start(); return showNotFound(); }
    } catch(e){
      console.warn("Could not load the details.", e);
    }
  }
  config = fresh || cached || clone(BLANK);
  if((fresh || cached) && (config.templateId || "") !== pageTemplate) await useTemplate(config.templateId || "");

  start();
  if(fresh) applyConfig(fresh);
  else if(cached) refreshConfig();
  subscribeWishes();
}

boot().catch(e => {
  console.error(e);
  start();
});
