// The sales and information pages (home, showcase, help, terms, privacy, refund, contact). They fill in the business
// details from the admin's Settings (site/settings), read through Firestore's REST API so these pages don't
// load the Firebase SDK. Hooks:
//   data-site="businessName|price|upiId|whatsapp|email|address"  the value as text (businessName falls back to data-fallback)
//   data-site-if="email"                                          hidden while that value is empty
//   data-site-host                                                the live site's address (from SITE_URL)
//   a[data-whatsapp="message"]                                    a wa.me link to the business number; {price} is replaced
//   a[data-mailto]                                                a mailto: link to the support email
//   #gallery                                                      the home page's designs with category filters
//   #showcase, #designReel, #designPreview, data-count="designs|occasions"
//                                                                 the showcase page: every design with category filters
//                                                                 and a live preview, a moving strip of them, and counts
import { firebaseConfig, useEmulator, EMULATOR, SITE_URL } from "./firebase-config.js";
import { salesSettings, whatsappLink, DEFAULT_CATEGORIES } from "./defaults.js";
import { smoothScroll } from "./smooth-scroll.js";

const $$ = sel => [...document.querySelectorAll(sel)];
function el(tag, className, text){
  const n = document.createElement(tag);
  if(className) n.className = className;
  if(text !== undefined) n.textContent = text;
  return n;
}

// Firestore REST values to plain ones (only the kinds site/settings uses).
const plain = v => v?.stringValue ?? (v?.integerValue !== undefined ? Number(v.integerValue) : v?.doubleValue ?? "");

async function loadSettings(){
  const base = useEmulator ? `http://${EMULATOR.host}:${EMULATOR.firestorePort}/v1` : "https://firestore.googleapis.com/v1";
  try {
    const r = await fetch(`${base}/projects/${firebaseConfig.projectId}/databases/(default)/documents/site/settings`);
    if(!r.ok) return salesSettings();
    const fields = (await r.json()).fields || {};
    return salesSettings(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, plain(v)])));
  } catch(e){
    console.warn("Couldn't load the business details.", e);
    return salesSettings();
  }
}

// The defaults until Settings arrive, so links made before then still work.
let settings = salesSettings();
const priceText = () => Number(settings.price).toLocaleString("en-IN");

// A wa.me link to the business with this message, or the contact page while there is no WhatsApp number.
function pointToWhatsApp(a, message){
  const href = whatsappLink(settings.whatsapp, message.replace(/\{price\}/g, priceText()));
  if(href) Object.assign(a, { href, target: "_blank", rel: "noopener" });
  else { a.href = "contact.html"; a.removeAttribute("target"); }
}

function fill(s){
  settings = s;
  const value = key => key === "price" ? priceText() : String(s[key] || "");
  $$("[data-site]").forEach(n => { n.textContent = value(n.dataset.site) || n.dataset.fallback || ""; });
  $$("[data-site-if]").forEach(n => { n.hidden = !s[n.dataset.siteIf]; });
  $$("a[data-whatsapp]").forEach(a => pointToWhatsApp(a, a.dataset.whatsapp));
  $$("a[data-mailto]").forEach(a => { if(s.email) a.href = "mailto:" + s.email; });
  // Page titles start with "Online Invitations" (what link previews show); swap in the business name once known.
  const SITE_NAME = "Online Invitations";
  if(s.businessName && document.title.startsWith(SITE_NAME)) document.title = s.businessName + document.title.slice(SITE_NAME.length);
  $$("[data-year]").forEach(n => { n.textContent = new Date().getFullYear(); });
}

/* ------------------------------ designs ------------------------------ */
// Every design: Classic (built into index.html) and the starters, grouped by category. Fetched once per page.
let designsLoad;
function designGroups(){
  designsLoad ||= (async () => {
    let starters = [];
    try { starters = await (await fetch("templates/starters.json")).json(); } catch {}
    const all = [{ id: "classic", name: "Classic Maroon & Gold", category: "wedding",
      description: "A curtain that opens, gold corners and falling petals." }, ...starters];
    return DEFAULT_CATEGORIES.map(c => ({ ...c, list: all.filter(t => t.category === c.id) })).filter(g => g.list.length);
  })();
  return designsLoad;
}
const previewLink = t => `./?template=${t.id}`;
const screenshot = (t, alt) => Object.assign(el("img"), { src: `assets/templates/${t.id}.webp`, alt, width: 390, height: 780 });
const chooseMessage = t => `Hi! I'd like an invitation in the "${t.name}" design (₹{price}).`;

// The category chips above the designs on the home page and the showcase: "All designs" and one per category, with
// their counts. The chosen one is kept in the address (?category=<id>), so a filtered page can be shared.
// draw(groups) puts the chosen groups' designs on the page; it runs now and after every pick.
function categoryChips(box, groups, draw){
  let current = new URLSearchParams(location.search).get("category");
  if(!groups.some(g => g.id === current)) current = "";
  const chips = el("div", "chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Show designs for");
  const pick = id => {
    current = id;
    chips.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.category === id)));
    draw(id ? groups.filter(g => g.id === id) : groups);
  };
  const chip = (id, label, count) => {
    const b = el("button", "chip");
    b.type = "button";
    b.dataset.category = id;
    b.append(el("span", "", label), el("span", "chip-count", String(count)));
    b.addEventListener("click", () => {
      const url = new URL(location.href);
      if(id) url.searchParams.set("category", id); else url.searchParams.delete("category");
      history.replaceState(null, "", url);
      pick(id);
      // With the chips stuck to the top of the screen, start the new list from its beginning.
      if(box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: "start" });
    });
    return b;
  };
  chips.append(chip("", "All designs", groups.reduce((n, g) => n + g.list.length, 0)),
    ...groups.map(g => chip(g.id, g.name, g.list.length)));
  pick(current);
  return chips;
}

// The home page: the designs by category, with the category chips, each opening a live preview with sample details.
async function gallery(){
  const box = document.getElementById("gallery");
  if(!box) return;
  const groups = await designGroups();
  const results = el("div", "gallery-results");
  const chips = categoryChips(box, groups, shown => results.replaceChildren(...shown.map(g => {
    const section = el("section", "gallery-group");
    section.append(el("h3", "", `${g.name} · ${g.list.length}`));
    const grid = el("div", "gallery-grid");
    grid.append(...g.list.map(t => {
      const card = el("a", "design");
      Object.assign(card, { href: previewLink(t), target: "_blank", rel: "noopener" });
      const img = Object.assign(screenshot(t, `${t.name} design`), { loading: "lazy" });
      const info = el("span", "design-info");
      info.append(el("b", "", t.name), el("span", "design-desc", t.description || ""), el("span", "design-cta", "See it live ↗"));
      card.append(img, info);
      return card;
    }));
    section.append(grid);
    return section;
  })));
  box.replaceChildren(chips, results);
}

/* ------------------------------ showcase ------------------------------ */
// The hero's moving strip of every design. It holds the list twice, so sliding by half loops without a seam.
function reel(list){
  const track = document.querySelector("#designReel .reel-track");
  if(!track) return;
  const phone = t => { const p = el("div", "phone"); p.append(Object.assign(screenshot(t, ""), { decoding: "async" })); return p; };
  track.replaceChildren(...list.map(phone), ...list.map(phone));
}

// A phone-sized live preview beside the design's details. Only on screens with room for it: on phones a design
// opens in a new tab instead, where guests' opening animation and music play too.
const roomy = matchMedia("(min-width: 760px) and (min-height: 600px)");
function previewer(){
  const dialog = document.getElementById("designPreview");
  if(!dialog?.showModal) return null;
  const part = name => dialog.querySelector(`[data-preview="${name}"]`);
  const phone = part("phone"), frame = phone.querySelector("iframe");
  let list = [], index = 0;
  // The page is laid out at a real phone's width and scaled to fit the frame.
  new ResizeObserver(() => { frame.style.transform = `scale(${phone.clientWidth / 390})`; }).observe(phone);
  // The page stays hidden while it fetches the design ("booting"), so keep the cover on until it has rendered.
  frame.addEventListener("load", () => {
    const ready = () => phone.classList.remove("loading");
    const doc = frame.contentDocument;
    if(!doc?.documentElement.classList.contains("booting")) return ready();
    doc.addEventListener("invite:render", ready, { once: true });
    setTimeout(ready, 8000);
  });

  function show(i){
    index = (i + list.length) % list.length;
    const t = list[index];
    phone.classList.add("loading");
    frame.src = previewLink(t);
    part("category").textContent = DEFAULT_CATEGORIES.find(c => c.id === t.category)?.name || "";
    part("name").textContent = t.name;
    part("desc").textContent = t.description || "";
    part("count").textContent = `${index + 1} of ${list.length}`;
    part("open").href = previewLink(t);
    const order = part("order");
    order.dataset.whatsapp = chooseMessage(t);
    pointToWhatsApp(order, order.dataset.whatsapp);
  }
  part("prev").addEventListener("click", () => show(index - 1));
  part("next").addEventListener("click", () => show(index + 1));
  part("close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", e => { if(e.target === dialog) dialog.close(); });
  dialog.addEventListener("keydown", e => {
    if(e.key === "ArrowRight") show(index + 1);
    else if(e.key === "ArrowLeft") show(index - 1);
  });
  // Stop the preview (and its countdown and listeners) once it is closed.
  dialog.addEventListener("close", () => { frame.src = "about:blank"; });
  return (items, i) => {
    list = items;
    show(i);
    if(!dialog.open) dialog.showModal();
  };
}

// Every design with category chips (?category=<id> picks one, so a filtered page can be shared) and two
// buttons per design: a live preview and "Choose", a WhatsApp message naming the design.
async function showcase(){
  const box = document.getElementById("showcase");
  if(!box) return;
  const groups = await designGroups();
  const all = groups.flatMap(g => g.list);
  $$("[data-count]").forEach(n => { n.textContent = n.dataset.count === "designs" ? all.length : groups.length; });
  reel(all);
  const openPreview = previewer();

  function card(t, shown){
    const item = el("article", "tour-card");
    const shot = Object.assign(el("a", "tour-shot"), { href: previewLink(t), target: "_blank", rel: "noopener" });
    shot.setAttribute("aria-label", `See ${t.name} live`);
    shot.append(Object.assign(screenshot(t, `${t.name} design`), { loading: "lazy" }), el("span", "tour-play", "See it live"));
    const info = el("div", "tour-info");
    info.append(el("h4", "", t.name), el("p", "", t.description || ""));
    const actions = el("div", "tour-actions");
    const live = Object.assign(el("a", "btn ghost dark small", "Preview"), { href: previewLink(t), target: "_blank", rel: "noopener" });
    const choose = el("a", "btn primary small", "Choose");
    choose.dataset.whatsapp = chooseMessage(t);
    pointToWhatsApp(choose, choose.dataset.whatsapp);
    actions.append(live, choose);
    [shot, live].forEach(a => a.addEventListener("click", e => {
      if(!openPreview || !roomy.matches) return;
      e.preventDefault();
      openPreview(shown, shown.indexOf(t));
    }));
    item.append(shot, info, actions);
    return item;
  }

  const results = el("div", "tour-results");
  const chips = categoryChips(box, groups, visible => {
    const shown = visible.flatMap(g => g.list);
    results.replaceChildren(...visible.map(g => {
      const section = el("section", "tour-group");
      section.append(el("h3", "", `${g.name} · ${g.list.length}`));
      const grid = el("div", "tour-grid");
      grid.append(...g.list.map(t => card(t, shown)));
      section.append(grid);
      return section;
    }));
  });
  box.replaceChildren(chips, results);
}

/* ------------------------------ back to admin / editor ------------------------------ */
// The admin's and the editor's top bars open the home page and the showcase in a new tab. For someone who came from
// there, a bar in the header leads back. Where they came from is read from the referrer (so the links people share
// stay clean) and kept for the tab, so the bar stays while they go from page to page.
const BACK_LABELS = { admin: "← Back to admin", editor: "← Back to editor" };
function backBar(){
  let back = null;
  try {
    const from = document.referrer ? new URL(document.referrer) : null;
    const page = from?.origin === location.origin && from.pathname.match(/\/(admin|editor)(\.html)?$/)?.[1];
    if(page) sessionStorage.setItem("wi:back", JSON.stringify({ page, url: from.href }));
    back = JSON.parse(sessionStorage.getItem("wi:back") || "null");
  } catch {}
  const head = document.querySelector(".site-head");
  if(!head || !BACK_LABELS[back?.page] || new URL(back.url, location.href).origin !== location.origin) return;
  const link = Object.assign(el("a", "back-link", BACK_LABELS[back.page]), { href: back.url });
  // Still on the tab's first page: closing the tab shows the admin or editor just as it was, unsaved changes and all.
  // Browsers that won't close it go to the page instead.
  link.addEventListener("click", e => {
    if(history.length > 1) return;
    e.preventDefault();
    window.close();
    setTimeout(() => { if(!window.closed) location.href = back.url; }, 200);
  });
  const bar = el("div", "back-bar");
  bar.append(link, el("span", "back-note", "Only you see this."));
  head.prepend(bar);
}

$$("[data-site-host]").forEach(n => { n.textContent = new URL(SITE_URL).host; });
smoothScroll();
backBar();
gallery();
showcase();
loadSettings().then(fill);
