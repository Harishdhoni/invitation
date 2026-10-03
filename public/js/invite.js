import { DEFAULT_CONFIG, TRANSLATIONS, tr, withDefaults, clone, isValidSlug } from "./defaults.js";
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

/* ----------------------------- which wedding ----------------------------- */
// On Vercel, /arjun-meera is served by api/invite.js, which adds <meta name="wedding-id">.
// ?w= is for local previews; the last path segment covers Firebase Hosting's rewrite.
// The main link "/" has none of these and shows the wedding picked in the admin.
const pageSlug = document.querySelector('meta[name="wedding-id"]')?.content
  || new URLSearchParams(location.search).get("w")
  || [location.pathname.split("/").pop()].find(isValidSlug)
  || "";
let slug = isValidSlug(pageSlug) ? pageSlug : "";
const badLink = !!pageSlug && !slug;

const CONFIG_CACHE = () => "wi:config:" + slug;
const IMG_PREFIX = () => `wi:img:${slug}:`;
const IMG_CACHE = id => IMG_PREFIX() + id;
const DEFAULT_WEDDING = "wi:default";
const LOCAL_WISHES = "wi:wishes";
const FALLBACK_IMG = { cover: "assets/cover-placeholder.svg", deity: "assets/emblem.svg" };
const WISH_PAGE = 30;

// Shown until the wedding's details load, so guests never see the sample couple's names.
const BLANK = {
  ...clone(DEFAULT_CONFIG), groomName: "", brideName: "", tagline: "", heroDateLine: "", hashtag: "",
  curtainVerse: "", accommodationText: "", weddingDateTimeISO: "", events: [], coordinators: []
};

/* -------------------------------- state -------------------------------- */
function cachedConfig(){
  if(!isFirebaseConfigured) return clone(DEFAULT_CONFIG);
  if(!slug) return clone(BLANK);
  try { const c = JSON.parse(store.get(CONFIG_CACHE())); return c ? withDefaults(c) : clone(BLANK); }
  catch { return clone(BLANK); }
}
let config = cachedConfig();
let notFound = false;
let lang = store.get("wi:lang") === "ta" ? "ta" : "en";
const T = () => TRANSLATIONS[lang];
const images = {};   // imageId -> data URL currently known
let fb = null;       // Firebase module, once loaded
let wishes = [];
const weddingDoc = (...path) => fb.doc(fb.db, "weddings", slug, ...path);

/* ------------------------------- rendering ------------------------------- */
function renderNames(){
  const groom = tr(config.groomName, lang), bride = tr(config.brideName, lang);
  document.querySelectorAll(".couple-names").forEach(n => {
    if(!groom && !bride) return n.replaceChildren(); // still loading, or no such wedding
    n.replaceChildren(el("span", "name-part", groom), " ", el("span", "hero-amp", "&"), " ", el("span", "name-part", bride));
  });
  if(tr(config.groomName, "en") || tr(config.brideName, "en"))
    document.title = `${tr(config.groomName, "en")} weds ${tr(config.brideName, "en")}`;
}

function renderEvents(){
  const grid = $("eventsGrid");
  const shown = grid.dataset.shown === "1";
  grid.replaceChildren();
  config.events.forEach((ev, i) => {
    const card = el("div", `event-card reveal delay${i % 3}${shown ? " in" : ""}`);

    const icon = el("div", "event-icon");
    const imgSrc = ev.icon?.type === "image" && images[ev.icon.imageId];
    if(imgSrc){ const img = el("img"); img.src = imgSrc; img.alt = ""; icon.append(img); }
    else icon.textContent = ev.icon?.emoji || "✨";
    card.append(icon, el("div", "event-name", tr(ev.name, lang)));

    const meta = el("div", "event-meta");
    meta.append(el("b", "", tr(ev.date, lang)));
    if(tr(ev.time, lang)) meta.append(el("br"), tr(ev.time, lang));
    if(tr(ev.place, lang)) meta.append(el("br"), el("span", "event-place", tr(ev.place, lang)));
    if(tr(ev.venue, lang)) meta.append(el("br"), "📍 " + tr(ev.venue, lang));
    card.append(meta);

    if(tr(ev.desc, lang)) card.append(el("p", "event-desc", tr(ev.desc, lang)));

    const mapUrl = safeUrl(ev.mapUrl) ||
      (ev.mapQuery || tr(ev.venue, "en")
        ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ev.mapQuery || `${tr(ev.place, "en")} ${tr(ev.venue, "en")}`)
        : "");
    if(mapUrl){
      const actions = el("div", "event-actions");
      const a = el("a", "btn-ghost", T().getDirections);
      a.href = mapUrl; a.target = "_blank"; a.rel = "noopener";
      actions.append(a);
      card.append(actions);
    }
    grid.append(card);
  });
  observeReveals();
}

function renderCoordinators(){
  const box = $("coordinators");
  box.replaceChildren();
  (config.coordinators || []).forEach(c => {
    const line = el("span", "coord");
    line.append(el("b", "", tr(c.name, lang)), ": ");
    (c.phones || []).filter(Boolean).forEach((p, i) => {
      if(i) line.append(", ");
      const a = el("a", "", p);
      a.href = "tel:" + p.replace(/[^\d+]/g, "");
      line.append(a);
    });
    box.append(line);
  });
}

function renderImages(){
  $("coverImg").src = images.cover || FALLBACK_IMG.cover;
  $("deityImg").src = images.deity || FALLBACK_IMG.deity;
}

function renderWishes(){
  const wall = $("wishesWall");
  wall.replaceChildren();
  wishes.forEach(w => {
    const card = el("div", "wish-card");
    card.append(el("p", "", `“${w.message}”`), el("span", "", "— " + w.name));
    wall.append(card);
  });
  $("wishesEmpty").hidden = wishes.length > 0;
}

function renderAll(){
  const dict = T();
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(n => { const v = dict[n.dataset.i18n]; if(v !== undefined) n.textContent = v; });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(n => { const v = dict[n.dataset.i18nPlaceholder]; if(v !== undefined) n.placeholder = v; });
  document.querySelectorAll("[data-i18n-title]").forEach(n => { const v = dict[n.dataset.i18nTitle]; if(v !== undefined) n.title = v; });
  document.querySelectorAll(".lang-btn").forEach(b => b.classList.toggle("active", b.dataset.lang === lang));

  $("curtainVerse").textContent = notFound ? dict.notFound : (config.curtainVerse || "");
  $("openCurtainBtn").hidden = notFound;
  document.querySelector(".curtain-tap").hidden = notFound;
  $("heroTagline").textContent = tr(config.tagline, lang);
  $("heroDatePill").textContent = tr(config.heroDateLine, lang);
  $("stayText").textContent = tr(config.accommodationText, lang);
  $("footerHashtag").textContent = config.hashtag || "";
  renderNames();
  renderEvents();
  renderCoordinators();
  renderWishes();
  updateCountdown();
}

/* ------------------------------- countdown ------------------------------- */
function updateCountdown(){
  const target = new Date(config.weddingDateTimeISO).getTime();
  const diff = Math.max(0, (isNaN(target) ? 0 : target) - Date.now());
  const pad = n => String(n).padStart(2, "0");
  $("cdDays").textContent = pad(Math.floor(diff / 86400000));
  $("cdHours").textContent = pad(Math.floor(diff % 86400000 / 3600000));
  $("cdMins").textContent = pad(Math.floor(diff % 3600000 / 60000));
  $("cdSecs").textContent = pad(Math.floor(diff % 60000 / 1000));
}
setInterval(updateCountdown, 1000);

/* ------------------------------- toast ------------------------------- */
let toastTimer;
function showToast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
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
  neededImageIds().forEach(id => { const d = cachedImage(id); if(d) images[id] = d; });
}

function cacheImage(id, dataUrl){
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

async function loadRemoteConfig(){
  try {
    const snap = await fb.getDoc(weddingDoc());
    if(!snap.exists()){
      store.del(CONFIG_CACHE());
      return showNotFound();
    }
    const data = snap.data();
    delete data.updatedAt;
    config = withDefaults(data);
    store.set(CONFIG_CACHE(), JSON.stringify(config));
    const keep = new Set(neededImageIds().map(IMG_CACHE));
    store.keys().filter(k => k.startsWith(IMG_PREFIX()) && !keep.has(k)).forEach(store.del);
    loadImagesFromCache();
    renderAll();
    renderImages();
    loadMusic();
    await loadRemoteImages();
  } catch(e){
    console.warn("Could not load wedding details; showing cached copy.", e);
    loadMusic();
  }
}

// The main link "/" shows whichever wedding the admin marked as the main one.
async function defaultWedding(){
  try {
    const snap = await fb.getDoc(fb.doc(fb.db, "site", "settings"));
    const s = snap.exists() ? snap.data().defaultWedding : "";
    if(!isValidSlug(s)) return "";
    store.set(DEFAULT_WEDDING, s);
    return s;
  } catch(e){
    console.warn("Could not load site settings; using the last known wedding.", e);
    return store.get(DEFAULT_WEDDING) || "";
  }
}

function showNotFound(){
  notFound = true;
  config = clone(BLANK);
  if(unsubWishes){ unsubWishes(); unsubWishes = null; }
  wishes = [];
  musicBtn.hidden = true;
  renderAll();
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
    $("wishesMore").hidden = snap.size < wishLimit;
    renderWishes();
  }, e => console.warn("wishes listener failed", e));
}

function loadLocalWishes(){
  try { wishes = JSON.parse(store.get(LOCAL_WISHES)) || []; } catch { wishes = []; }
  renderWishes();
}

$("wishesMore").addEventListener("click", () => {
  wishLimit += WISH_PAGE;
  subscribeWishes();
});

$("wishForm").addEventListener("submit", async e => {
  e.preventDefault();
  const nameIn = $("wishName"), msgIn = $("wishMessage");
  const name = nameIn.value.trim().slice(0, 60), message = msgIn.value.trim().slice(0, 500);
  if(!name || !message) return;

  e.target.reset();
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
});

/* ------------------------------ interactions ------------------------------ */
document.querySelectorAll(".lang-btn").forEach(btn => btn.addEventListener("click", () => {
  lang = btn.dataset.lang;
  store.set("wi:lang", lang);
  renderAll();
}));

// Always share this wedding's link on the live site, even when the page is opened
// from localhost, a Vercel preview URL, or the main link "/".
$("shareBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(`${SITE_URL}/${slug}`); showToast(T().linkCopied); }
  catch { showToast(T().linkCopyFailed); }
});

// Curtain intro. Opening it is a user gesture, so the music can start here
// (browsers block autoplay without one).
$("openCurtainBtn").addEventListener("click", () => {
  const overlay = $("curtain-overlay");
  overlay.classList.add("open");
  document.body.classList.remove("locked");
  setTimeout(() => overlay.classList.add("hidden"), 1500);
  startMusic();
});

/* -------------------------------- music -------------------------------- */
// The song is uploaded from the admin page as ~900 KB Firestore chunks
// (music/<v>_<i>). It is fetched while the curtain is showing, then kept in
// the Cache API so repeat visits download nothing.
const musicBtn = $("musicToggle"), bgMusic = $("bgMusic");
const MUSIC_CACHE = "wi-music";
bgMusic.volume = 0.45;
let musicPlaying = false, musicReady = false, wantMusic = false, musicV = null;

function startMusic(){
  if(musicPlaying || !config.music) return;
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
musicBtn.addEventListener("click", () => {
  if(musicPlaying) return stopMusic();
  if(!musicReady) showToast(T().musicLoading);
  startMusic();
});

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
  musicBtn.hidden = !m;
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
        for(const req of await cache.keys()) // drop this wedding's older songs
          if(req.url.includes("/" + prefix)) await cache.delete(req);
        await cache.put(key, new Response(blob, { headers: { "content-type": blob.type } }));
      } catch {}
    }
  } catch(e){
    console.warn("music unavailable", e);
    musicV = null;
    musicBtn.hidden = true;
    return;
  }
  if(musicV !== m.v) return; // a newer config arrived meanwhile
  const wasWanted = wantMusic;
  bgMusic.src = URL.createObjectURL(blob);
  musicReady = true;
  if(wasWanted) startMusic();
}

/* ------------------------------- decoration ------------------------------- */
const CORNER_SVG = `<svg viewBox="0 0 80 80" fill="none" stroke="#d4af37" stroke-width="1.4" stroke-linecap="round">
  <path d="M3 77V22Q3 3 22 3h55"/>
  <path d="M10 70V26Q10 10 26 10h44" opacity=".5"/>
  <path d="M22 3c0 10-6 15-12 15M3 22c10 0 15-6 15-12" opacity=".8"/>
  <path d="M30 10c6 4 12 4 18 0M10 30c4 6 4 12 0 18" opacity=".6"/>
  <circle cx="18" cy="18" r="3.2" fill="#d4af37" stroke="none"/>
  <circle cx="54" cy="10" r="1.6" fill="#d4af37" stroke="none"/>
  <circle cx="10" cy="54" r="1.6" fill="#d4af37" stroke="none"/>
</svg>`;
document.querySelectorAll("#hero > .corner").forEach(c => { c.innerHTML = CORNER_SVG; });

const petals = $("petals-container");
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

/* ------------------------- scroll progress + dot nav ------------------------- */
const sections = ["hero", "coupleCover", "events", "countdown", "wishes", "stay"].map($);
const dots = document.querySelectorAll("#dotNav a");
let ticking = false;
function onScroll(){
  ticking = false;
  const top = window.scrollY;
  const max = document.documentElement.scrollHeight - innerHeight;
  $("scrollProgress").style.width = (max > 0 ? top / max * 100 : 0) + "%";
  let current = "hero";
  sections.forEach(s => { if(top >= s.offsetTop - innerHeight * 0.5) current = s.id; });
  dots.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current));
}
addEventListener("scroll", () => { if(!ticking){ ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

/* ---------------------------- reveal on scroll ---------------------------- */
const io = new IntersectionObserver(entries => entries.forEach(entry => {
  if(!entry.isIntersecting) return;
  entry.target.classList.add("in");
  if(entry.target.classList.contains("event-card")) $("eventsGrid").dataset.shown = "1";
  io.unobserve(entry.target);
}), { threshold: 0.15 });
function observeReveals(){ document.querySelectorAll(".reveal:not(.in)").forEach(n => io.observe(n)); }

/* --------------------------------- boot --------------------------------- */
loadImagesFromCache();
renderAll();
renderImages();
onScroll();

if(isFirebaseConfigured && badLink){
  showNotFound();
} else if(isFirebaseConfigured){
  import("./firebase.js").then(async mod => {
    fb = mod;
    if(!slug){
      slug = await defaultWedding();
      if(!slug) return showNotFound();
      config = cachedConfig();
      loadImagesFromCache();
      renderAll();
      renderImages();
    }
    loadRemoteConfig();
    subscribeWishes();
  }).catch(e => {
    console.warn("Firebase unavailable; using local data.", e);
    loadLocalWishes();
  });
} else {
  loadLocalWishes();
}
