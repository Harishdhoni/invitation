// The sales and information pages (home, help, terms, privacy, refund, contact). They fill in the business
// details from the admin's Settings (site/settings), read through Firestore's REST API so these pages don't
// load the Firebase SDK. Hooks:
//   data-site="businessName|price|upiId|whatsapp|email|address"  the value as text (businessName falls back to data-fallback)
//   data-site-if="email"                                          hidden while that value is empty
//   a[data-whatsapp="message"]                                    a wa.me link to the business number; {price} is replaced
//   a[data-mailto]                                                a mailto: link to the support email
//   #gallery                                                      the starter designs from templates/starters.json
import { firebaseConfig, useEmulator, EMULATOR } from "./firebase-config.js";
import { salesSettings, whatsappLink, DEFAULT_CATEGORIES } from "./defaults.js";

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

function fill(s){
  const value = key => key === "price" ? Number(s.price).toLocaleString("en-IN") : String(s[key] || "");
  $$("[data-site]").forEach(n => { n.textContent = value(n.dataset.site) || n.dataset.fallback || ""; });
  $$("[data-site-if]").forEach(n => { n.hidden = !s[n.dataset.siteIf]; });
  $$("a[data-whatsapp]").forEach(a => {
    const href = whatsappLink(s.whatsapp, a.dataset.whatsapp.replace(/\{price\}/g, value("price")));
    if(href){ a.href = href; a.target = "_blank"; a.rel = "noopener"; }
    else a.href = "contact.html";
  });
  $$("a[data-mailto]").forEach(a => { if(s.email) a.href = "mailto:" + s.email; });
  // Page titles start with "Invitations" (what link previews show); swap in the business name once known.
  if(s.businessName && document.title.startsWith("Invitations")) document.title = s.businessName + document.title.slice("Invitations".length);
  $$("[data-year]").forEach(n => { n.textContent = new Date().getFullYear(); });
}

// The starter designs, by category, each opening a live preview with sample details.
async function gallery(){
  const box = document.getElementById("gallery");
  if(!box) return;
  let starters = [];
  try { starters = await (await fetch("templates/starters.json")).json(); } catch {}
  const all = [{ id: "classic", name: "Classic Maroon & Gold", category: "wedding",
    description: "A curtain that opens, gold corners and falling petals." }, ...starters];
  const groups = DEFAULT_CATEGORIES.map(c => ({ ...c, list: all.filter(t => t.category === c.id) })).filter(g => g.list.length);
  box.replaceChildren(...groups.map(g => {
    const section = el("section", "gallery-group");
    section.append(el("h3", "", `${g.name} · ${g.list.length}`));
    const grid = el("div", "gallery-grid");
    grid.append(...g.list.map(t => {
      const card = el("a", "design");
      Object.assign(card, { href: `./?template=${t.id}`, target: "_blank", rel: "noopener" });
      const img = Object.assign(el("img"), { src: `assets/templates/${t.id}.webp`, alt: `${t.name} design`, loading: "lazy", width: 390, height: 780 });
      const info = el("span", "design-info");
      info.append(el("b", "", t.name), el("span", "design-desc", t.description || ""), el("span", "design-cta", "See it live ↗"));
      card.append(img, info);
      return card;
    }));
    section.append(grid);
    return section;
  }));
}

gallery();
loadSettings().then(fill);
