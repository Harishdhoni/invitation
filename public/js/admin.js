import { tr, slugify, isValidSlug, sampleFor, clone, salesSettings, lastDay, addDays, indiaToday, whatsappLink } from "./defaults.js";
import { isFirebaseConfigured, ADMIN_UID, SITE_URL, useEmulator } from "./firebase-config.js";
import { compressPreviewImage } from "./image-utils.js";
import { $, show, el, toast, actionBtn, copyText, permissionHint, wireSidebar, go, useRouter } from "./admin-ui.js";
import { smoothScroll } from "./smooth-scroll.js";
import { addScrollTop } from "./scroll-top.js";
import { startAssistant } from "./assistant.js";
import { data, loaded, failed, onData, startData } from "./admin-data.js";
import {
  useFirebase, templatesIn, templateName, categoryName, templatePicker,
  initTemplates, renderTemplates, enterTemplateEditor, templateHasUnsavedChanges, discardTemplateChanges
} from "./admin-templates.js";
import {
  useFirebase as useAccessFirebase, revokePin, accessPanel, issuePin, customerMessage, sendOnWhatsApp
} from "./admin-access.js";
import {
  useFirebase as useSalesFirebase, newOrder, markOrderDeleted, orderPanel, salesSummary, downloadCsv, initSettings, renderSettings
} from "./admin-sales.js";
import { openShare } from "./share.js";
import {
  openEditor, closeEditor, setCatalog, normalize, coupleNames, shareLink, previewLink, musicChunkId,
  hasUnsavedChanges, discardChanges, isSaving, linkStatus, stateBadge
} from "./event-editor.js";

let fb = null;
const settingsDoc = () => fb.doc(fb.db, "site", "settings");
let appStarted = false;

/* ------------------------------ weddings list ------------------------------ */
// Copies of the data in js/admin-data.js, taken each time it changes (takeData).
let settings = {};           // site/settings: { legacyImported, and the sales settings (price, upiId, …) }
let orders = new Map();      // event id -> orders/<id>: who bought it and how they paid
let pins = new Map();        // slug -> { pin }: events that someone else may edit with a PIN
let pinsReady = false;       // false until the rules that allow reading pins/ are deployed
let categories = [];         // [{ id, name, order }]
let templates = [];          // [{ id, name, categoryId, html, … }]
let weddings = [];           // [{ id, cfg }]: events, without their extra links
let extraLinks = new Map();  // event id -> [{ id, cfg }]: its extra links ({ parent } docs in weddings/)
let legacyConfig = null;     // site/config from before multi-wedding, until it's imported

const SLUG_RULES = "Use 3–40 lowercase letters, numbers and dashes, like arjun-meera. " +
  "Some names (admin, editor, help, terms, …) are used by the site itself.";
// Photos, music and wishes of invitations that closed longer ago than this can be cleaned up.
const CLEANUP_DAYS = 90;
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

let categoryFilter = "all";
const eventCategory = cfg => cfg.category || "wedding";

// Draws the list from js/admin-data.js. It runs whenever any of that data changes (see onData under "views"),
// whether or not the list is showing, so it is ready the moment it is opened.
function refreshList(){
  const status = $("weddingsStatus");
  if(!loaded.has("events") || !loaded.has("settings")){
    status.textContent = "Loading events…";
    return show("weddingsStatus");
  }
  const error = failed.get("events") || failed.get("settings");
  if(error){
    status.textContent = error.code === "permission-denied"
      ? "Permission denied — check the admin UID in firestore.rules and deploy the rules."
      : "Couldn't load events: " + error.message;
    return show("weddingsStatus");
  }
  takeData();
  checkLegacy();
  renderWeddings();
}

// Categories, templates, PINs and orders only add to the list, so it still works without them
// (e.g. before the new rules are deployed).
function takeData(){
  settings = data.settings;
  orders = failed.has("orders") ? new Map() : data.orders;
  pinsReady = loaded.has("pins") && !failed.has("pins");
  pins = pinsReady ? data.pins : new Map();
  categories = data.categories;
  templates = data.templates;
  const all = data.events;
  const ids = new Set(all.filter(w => !w.cfg.parent).map(w => w.id));
  // An extra link whose event is gone is listed on its own, so it can be deleted.
  weddings = all.filter(w => !w.cfg.parent || !ids.has(w.cfg.parent));
  extraLinks = new Map();
  all.filter(w => w.cfg.parent && ids.has(w.cfg.parent))
    .forEach(l => extraLinks.set(l.cfg.parent, [...(extraLinks.get(l.cfg.parent) || []), l]));
}

// The invitation from before events had their own links (site/config) is offered for import until it is imported.
let legacyChecked = false;
async function checkLegacy(){
  if(settings.legacyImported){ legacyConfig = null; return show("importForm", false); }
  if(legacyChecked) return;
  legacyChecked = true;
  try {
    const legacy = await fb.getDoc(fb.doc(fb.db, "site", "config"));
    if(legacy.exists()) legacyConfig = legacy.data();
  } catch(e){
    console.warn("couldn't check for the old invitation", e);
  }
  if(legacyConfig && !settings.legacyImported && $("importForm").hidden){
    $("importSlug").value = slugify(`${tr(legacyConfig.groomName, "en")}-${tr(legacyConfig.brideName, "en")}`);
    show("importForm");
  }
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

// Status chips: unpaid, open to guests, and closed (switched off, not open yet, or ended).
let statusFilter = "all";
const STATUS_GROUPS = { unpaid: "Unpaid", live: "Open", closed: "Closed" };
const statusGroup = w => { const s = linkStatus(w.cfg).state; return s === "unpaid" || s === "live" ? s : "closed"; };

function renderStatusFilter(){
  const counts = { all: weddings.length, unpaid: 0, live: 0, closed: 0 };
  weddings.forEach(w => { if(!w.cfg.parent) counts[statusGroup(w)]++; });
  const chip = (id, label) => {
    const b = el("button", "chip", label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(statusFilter === id));
    b.append(el("span", "n", String(counts[id])));
    b.addEventListener("click", () => { statusFilter = id; renderWeddings(); });
    return b;
  };
  $("statusFilter").replaceChildren(chip("all", "All"), ...Object.entries(STATUS_GROUPS).map(([id, label]) => chip(id, label)));
}

// Names (English and Tamil), link names, and the customer's name and phone.
let searchText = "";
function matchesSearch(w){
  const q = searchText.trim().toLowerCase();
  if(!q) return true;
  const o = orders.get(w.id) || {};
  const hay = [w.id, ...(extraLinks.get(w.id) || []).map(l => l.id), w.cfg.groomName?.en, w.cfg.groomName?.ta,
    w.cfg.brideName?.en, w.cfg.brideName?.ta, o.customer, o.phone].filter(Boolean).join(" ").toLowerCase();
  const digits = q.replace(/\D/g, "");
  return hay.includes(q) || (digits.length >= 4 && String(o.phone || "").replace(/\D/g, "").includes(digits));
}
$("eventSearch").addEventListener("input", e => { searchText = e.target.value; renderWeddings(); });

// A payment being typed into a card's Mark as paid form would be lost by redrawing the list, so a change that
// arrives meanwhile waits until the form is saved (which redraws with `force`) or cancelled.
let listWaiting = false;
$("weddingsList").addEventListener("reset", () => { if(listWaiting) setTimeout(renderWeddings); });

function renderWeddings(force = false){
  if(!force && $("weddingsList").querySelector(".paid-form:not([hidden])")){ listWaiting = true; return; }
  listWaiting = false;
  renderCategoryFilter();
  renderStatusFilter();
  $("salesSummary").replaceChildren(salesSummary(weddings, orders));
  // Upcoming events first (soonest at the top), then past ones (most recent first).
  // An event counts as upcoming until a day after its main date.
  const cutoff = Date.now() - 86_400_000;
  const time = w => weddingTime(w.cfg) ?? Infinity;
  const shown = weddings.filter(w => (categoryFilter === "all" || eventCategory(w.cfg) === categoryFilter)
    && (statusFilter === "all" || statusGroup(w) === statusFilter) && matchesSearch(w));
  const upcoming = shown.filter(w => time(w) >= cutoff).sort((a, b) => time(a) - time(b));
  const past = shown.filter(w => time(w) < cutoff).sort((a, b) => time(b) - time(a));

  $("weddingsList").replaceChildren(...upcoming.map(w => weddingCard(w, false)), ...past.map(w => weddingCard(w, true)));
  $("weddingsStatus").textContent = !weddings.length ? "No events yet. Click ＋ New event to create the first one."
    : !shown.length ? "No events match. Clear the search or pick another filter." : "";
  show("weddingsStatus", !shown.length);
}

const linkAnchor = id => {
  const a = el("a", "wedding-link", `${siteHost()}/${id}`);
  Object.assign(a, { href: previewLink(id), target: "_blank", rel: "noopener" });
  return a;
};

function weddingCard(w, isPast){
  if(w.cfg.parent) return orphanLinkCard(w);
  const card = el("div", "card wedding-card" + (isPast ? " past" : ""));
  const head = el("div", "item-head");
  const tags = el("div", "item-tools");
  const status = linkStatus(w.cfg);
  if(isPast) tags.append(el("span", "badge off", "Past"));
  tags.append(stateBadge(status.state), el("span", "badge cat", categoryName(categories, eventCategory(w.cfg))));
  head.append(el("h3", "", coupleNames(w.cfg, w.id)), tags);

  const t = weddingTime(w.cfg);
  const when = el("p", "muted", t
    ? new Date(t).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "No date set");
  const design = el("p", "design", "Template: " + templateName(templates, w.cfg.templateId || ""));

  // The event's extra links: the same details in other designs, each open or closed on its own.
  const extras = extraLinks.get(w.id) || [];
  const more = el("ul", "extra-links");
  extras.forEach(l => {
    const s = linkStatus(l.cfg, w.cfg);
    const li = el("li");
    li.append(linkAnchor(l.id), el("span", "muted", templateName(templates, l.cfg.templateId || "")), stateBadge(s.state));
    more.append(li);
  });

  const edit = el("a", "btn primary small", "Edit");
  edit.href = "?w=" + w.id;
  const acts = el("div", "row");
  acts.append(edit, actionBtn("Copy link", "ghost", () => copyText(shareLink(w.id))));
  acts.append(w.cfg.active === false
    ? actionBtn("Switch on", "ghost", () => setActive(w, true))
    : actionBtn("Switch off", "ghost", () => setActive(w, false)));
  acts.append(actionBtn("Delete", "danger", () => deleteWedding(w)));

  card.append(head, when, design, linkAnchor(w.id), el("p", "link-status", status.text));
  if(extras.length) card.append(more);
  const sale = orderPanel({ w, orders, sales: salesSettings(settings), onChange: () => renderWeddings(true) });
  if(sale) card.append(sale);
  const order = orders.get(w.id) || {};
  if(pinsReady) card.append(accessPanel({ slug: w.id, name: coupleNames(w.cfg, w.id), pins, paid: w.cfg.paid !== false,
    sales: salesSettings(settings), customer: order.customer || "", phone: order.phone || "" }));
  card.append(acts);
  return card;
}

// An extra link whose event was deleted: it shows nothing, so it can only be deleted.
function orphanLinkCard(w){
  const card = el("div", "card wedding-card past");
  const head = el("div", "item-head");
  head.append(el("h3", "", w.id), el("span", "badge off", "Extra link"));
  const acts = el("div", "row");
  acts.append(actionBtn("Delete", "danger", async () => {
    if(!confirm(`Delete the link ${siteHost()}/${w.id}? Its event “${w.cfg.parent}” no longer exists, so it shows nothing.`)) return;
    try { await fb.deleteDoc(fb.doc(fb.db, "weddings", w.id)); toast(`Deleted ${siteHost()}/${w.id}.`); }
    catch(e){ toast("Delete failed: " + permissionHint(e)); }
  }));
  card.append(head, el("p", "muted", `An extra link of “${w.cfg.parent}”, which no longer exists.`), acts);
  return card;
}

// The event link's on/off switch. Its extra links show its details, so they close with it.
async function setActive(w, on){
  const name = coupleNames(w.cfg, w.id);
  try {
    await fb.updateDoc(fb.doc(fb.db, "weddings", w.id), { active: on });
    const after = linkStatus({ ...w.cfg, active: on });
    toast(on
      ? `${name} is switched on.` + (after.state === "live" ? " Guests can open it." : " " + after.text + " Change its dates in the Links tab.")
      : `${name} is switched off. Guests opening its link${(extraLinks.get(w.id) || []).length ? "s" : ""} see that it isn't open.`);
  } catch(e){
    toast("Failed: " + permissionHint(e));
  }
}

// An event's photos, music chunks and wishes. Photos and music are listed in the config, so they can be
// deleted without downloading them.
async function eventDataRefs(w){
  const ref = (...path) => fb.doc(fb.db, "weddings", w.id, ...path);
  const refs = Object.keys(w.cfg.images || {}).map(id => ref("images", id));
  const m = w.cfg.music;
  if(m) for(let i = 0; i < m.chunks; i++) refs.push(ref("music", musicChunkId(m.v, i)));
  const wishes = await fb.getDocs(fb.collection(ref(), "wishes"));
  return [...refs, ...wishes.docs.map(d => d.ref)];
}

// Removes the photos, music and wishes of invitations that closed more than CLEANUP_DAYS ago, to keep storage
// and personal data down (the privacy page says so). The event's text and its order stay.
async function cleanupEnded(){
  const before = addDays(indiaToday(), -CLEANUP_DAYS);
  const old = weddings.filter(w => !w.cfg.parent && !w.cfg.cleanedAt && lastDay(w.cfg) && lastDay(w.cfg) < before);
  if(!old.length) return toast(`Nothing to clean up: no invitation closed more than ${CLEANUP_DAYS} days ago.`);
  if(!confirm(`Clean up ${old.length} invitation${old.length === 1 ? "" : "s"} that closed more than ${CLEANUP_DAYS} days ago?\n\n` +
    "Their photos, music and wishes are deleted for good. Names, details and order records stay.")) return;
  const btn = $("cleanupBtn");
  btn.disabled = true;
  try {
    for(const [i, w] of old.entries()){
      btn.textContent = `Cleaning ${i + 1}/${old.length}…`;
      await inBatches(await eventDataRefs(w), (batch, r) => batch.delete(r));
      await fb.updateDoc(fb.doc(fb.db, "weddings", w.id), { images: {}, music: null, cleanedAt: fb.serverTimestamp() });
    }
    toast(`Cleaned up ${old.length} invitation${old.length === 1 ? "" : "s"}.`);
  } catch(e){
    console.error(e);
    toast("Clean-up stopped: " + permissionHint(e));
  }
  btn.disabled = false;
  btn.textContent = "Clean up ended";
}
$("cleanupBtn").addEventListener("click", cleanupEnded);
$("exportCsvBtn").addEventListener("click", () => downloadCsv(weddings, orders, w => linkStatus(w.cfg).state));

async function deleteWedding(w){
  const name = coupleNames(w.cfg, w.id);
  const extras = (extraLinks.get(w.id) || []).length;
  const typed = prompt(`Delete "${name}" permanently? Its details, photos, music and all wishes are removed, and its link` +
    (extras ? ` and its ${extras} extra link${extras === 1 ? "" : "s"} stop` : " stops") +
    ` working.\n\nType the link name "${w.id}" to confirm:`);
  if(typed === null) return;
  if(typed.trim() !== w.id) return toast("The link name didn't match, so nothing was deleted.");

  $("weddingsStatus").textContent = `Deleting ${name}…`;
  show("weddingsStatus");
  try {
    const refs = await eventDataRefs(w);
    // Its extra links show its details, so they go too.
    refs.push(...(extraLinks.get(w.id) || []).map(l => fb.doc(fb.db, "weddings", l.id)));
    await inBatches(refs, (batch, r) => batch.delete(r));
    if(pinsReady) await revokePin(w.id);   // the editor's access goes with the event
    await fb.deleteDoc(fb.doc(fb.db, "weddings", w.id));   // last, so a failed delete can simply be retried
    await markOrderDeleted(w.id, orders);   // the sale stays in the accounts
    toast(`Deleted ${name}.`);
  } catch(e){
    console.error(e);
    toast("Delete failed: " + e.message);
  }
  renderWeddings();   // clears the "Deleting…" line
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
    // An unpaid invitation can be filled in and previewed by its customer, but guests can't open it yet.
    cfg.paid = $("newPaid").checked;
    const customer = $("newCustomer").value.trim(), phone = $("newPhone").value.trim();
    const batch = fb.writeBatch(fb.db);
    batch.set(ref, { ...cfg, updatedAt: fb.serverTimestamp() });
    newOrder(batch, id, { customer, phone, paid: cfg.paid, price: salesSettings(settings).price });
    await batch.commit();
    // Without a customer's number this is the admin's own event: straight to its editor.
    if(!whatsappLink(phone)){
      show("newWeddingForm", false);
      $("createWeddingBtn").disabled = false;
      return go(`?w=${id}&new=1`);
    }
    await welcomeCustomer({ id, name: [groom, bride].filter(Boolean).join(" & "), customer, phone, paid: cfg.paid });
  } catch(e){
    error.textContent = e.message;
  }
  $("createWeddingBtn").disabled = false;
});

// A customer's new invitation: make their editor PIN and open WhatsApp on their chat with the message typed in
// (editor link, invitation link, how to pay). The browser may block a tab opened after these writes, so the
// panel always has its own Send on WhatsApp link too.
async function welcomeCustomer({ id, name, customer, phone, paid }){
  const who = customer || phone;
  show("newWeddingForm", false);
  showCreated({ id, name, customer: who, phone, waiting: true });
  let pin = null;
  try {
    // On a bad connection this could take a while; the event is saved already, and its card can make the PIN later.
    pin = await Promise.race([issuePin(id), new Promise((_, reject) =>
      setTimeout(() => reject(new Error("making the PIN took too long. Check your internet connection")), 12000))]);
  } catch(e){
    console.error(e);
    toast("The invitation was created, but its editor PIN wasn't: " + permissionHint(e) + ".");
  }
  const message = pin && customerMessage({ name, slug: id, pin, paid, sales: salesSettings(settings), customer });
  const opened = !!message && sendOnWhatsApp(phone, message);
  showCreated({ id, name, customer: who, phone, message, opened });
}

function showCreated({ id, name, customer, phone, message, opened, waiting = false }){
  const box = $("createdPanel");
  const acts = el("div", "row");
  if(message){
    const send = el("a", "btn primary", opened ? "Open WhatsApp again" : "Send on WhatsApp");
    Object.assign(send, { href: whatsappLink(phone, message), target: "_blank", rel: "noopener" });
    acts.append(send, actionBtn("Copy message", "ghost", () => copyText(message, "Message copied.")));
  }
  const edit = el("a", "btn ghost small", "Open its editor");
  edit.href = `?w=${id}&new=1`;
  acts.append(edit, actionBtn("Close", "ghost", () => show("createdPanel", false)));
  box.replaceChildren(
    el("h2", "", `✓ ${name} is created`),
    el("p", "muted", waiting ? `Making ${customer}'s editor PIN and message…`
      : !message ? `Create its editor PIN on its card, then use Send on WhatsApp there.`
      : opened ? `WhatsApp opened on ${customer}'s chat with the message typed in. Tap Send there.`
      : `Tap Send on WhatsApp to message ${customer}: the message is typed in for you.`),
    ...(message ? [el("pre", "message-preview", message)] : []),
    acts
  );
  show("createdPanel");
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
  await fb.setDoc(settingsDoc(), { legacyImported: true }, { merge: true });
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
    toast(`Imported ✓ ${siteHost()}/${id} is ready.`);
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

wireSidebar();
smoothScroll();
addScrollTop();

// The sidebar's Share button: the home page or showcase link for customers.
$("shareOpenBtn").addEventListener("click", () => openShare(fb));

$("logoutBtn").addEventListener("click", async () => {
  if(hasUnsavedChanges() && !confirm("You have unsaved changes. Log out anyway?")) return;
  discardChanges();
  // Show the login form after logging out on localhost instead of signing straight back in (this tab only).
  try { sessionStorage.setItem(NO_AUTO_LOGIN, "1"); } catch(e){}
  await fb.signOut(fb.auth);
  location.reload();
});

// On localhost the admin page signs itself in, so local testing doesn't start at the login form. The
// rules only accept the admin's account, so it still has to be a real sign-in. The live email and
// password come from local-admin.js in the project folder, which is gitignored, outside public/ (so
// Vercel and Firebase Hosting never serve it) and limited to this computer by the folder's .htaccess.
// On the emulator it uses the test admin from SETUP.md §1.
const IS_LOCALHOST = ["localhost", "127.0.0.1"].includes(location.hostname);
const NO_AUTO_LOGIN = "wi:noAutoLogin";
const EMULATOR_ADMIN = { email: "admin@test.local", password: "test1234" };

async function autoLogin(){
  if(!IS_LOCALHOST) return false;
  try { if(sessionStorage.getItem(NO_AUTO_LOGIN)) return false; } catch(e){}
  let account = EMULATOR_ADMIN;
  if(!useEmulator){
    try { account = (await import("../../local-admin.js")).default; }
    catch(e){ return false; } // no local-admin.js: use the login form
  }
  if(!account?.email || !account?.password) return false;
  try {
    await fb.signInWithEmailAndPassword(fb.auth, account.email, account.password);
    return true;
  } catch(err){
    console.warn("Local auto sign-in failed", err);
    $("loginError").textContent = "Automatic sign-in failed: " + (AUTH_ERRORS[err.code] || err.message) +
      (useEmulator ? " Create the test admin (SETUP.md §1)." : " Check local-admin.js.");
    return false;
  }
}

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

  // Everything every view needs is read now and kept current, and every view is drawn as it arrives.
  startData(fb);
  route();
  // Help with this page, for the signed-in admin only.
  startAssistant("admin");
}

/* ---------------------------------- views ---------------------------------- */
// The admin page is one page. The sidebar, Edit buttons, back links and template links switch views in place,
// with the address kept in step: ?w=<event> edits an event, ?template=<id|new> edits a template, ?view=templates
// lists templates, ?view=settings is what customers see about buying, and plain admin lists events. So reloading,
// Back and Forward, and bookmarks all still work. The views draw from js/admin-data.js, so they show at once.
const VIEWS = ["weddingsView", "templatesView", "settingsView", "templateEditorView", "editorView"];
const NAV = { weddingsView: "navEvents", editorView: "navEvents", templatesView: "navTemplates",
  templateEditorView: "navTemplates", settingsView: "navSettings" };
let routeSeq = 0;               // counts view changes, so a view still loading can tell it was left
let shownAt = "";               // the address of the view showing
const scrollSpots = new Map();  // address -> how far down a list was scrolled, for coming back to it

function viewFor(params){
  if(params.get("w")) return "editorView";
  if(params.get("template")) return "templateEditorView";
  if(params.get("view") === "templates") return "templatesView";
  if(params.get("view") === "settings") return "settingsView";
  return "weddingsView";
}

async function scrollToY(y){
  const lenis = await smoothScroll();
  if(lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else scrollTo(0, y);
}

// Shows the view for the address in the address bar.
function route(){
  const seq = ++routeSeq;
  const isCurrent = () => seq === routeSeq;
  const params = new URLSearchParams(location.search);
  const view = viewFor(params);
  shownAt = location.pathname + location.search;
  Object.values(NAV).forEach(id => { $(id).classList.remove("active"); $(id).removeAttribute("aria-current"); });
  $(NAV[view]).classList.add("active");
  $(NAV[view]).setAttribute("aria-current", "page");
  document.title = "Online Invitation Admin";
  if(view !== "editorView") closeEditor();
  // The two editors show themselves once their event or template is in.
  VIEWS.forEach(v => show(v, v === view && v !== "editorView" && v !== "templateEditorView"));
  if(view === "editorView") enterEditor(params, isCurrent);
  else if(view === "templateEditorView") enterTemplateEditor(params.get("template"), params.get("category"), isCurrent);
  scrollToY(view === "editorView" || view === "templateEditorView" ? 0 : scrollSpots.get(shownAt) || 0);
}

async function enterEditor(params, isCurrent){
  const id = params.get("w");
  try {
    const opened = await openEditor({ mod: fb, id, backHref: location.pathname, firstRun: params.has("new"),
      catalog: () => ({ categories: data.categories, templates: data.templates }) });
    if(!opened || !isCurrent()) return;
  } catch(e){
    if(!isCurrent()) return;
    toast(e.message);
    return go(location.pathname, { replace: true });
  }
  if(params.has("new")){   // don't show the banner again on reload
    history.replaceState(null, "", "?w=" + id);
    shownAt = location.pathname + location.search;
  }
}

// Leaving an editor with unsaved changes asks first, and a save still writing is waited for. False means stay.
function canLeave(){
  if(isSaving()){ toast("Still saving — wait a moment, then try again."); return false; }
  if(!hasUnsavedChanges() && !templateHasUnsavedChanges()) return true;
  if(!confirm("You have unsaved changes. Leave without saving them?")) return false;
  discardChanges();
  discardTemplateChanges();
  return true;
}

// go() in js/admin-ui.js: another view of this page switches in place; any other page loads as usual.
function navigate(url, { replace = false } = {}){
  const target = new URL(url, location.href);
  if(target.origin !== location.origin || target.pathname !== location.pathname){ location.href = target.href; return; }
  if(!replace && target.search === location.search) return scrollToY(0);   // already here
  if(!canLeave()) return;
  scrollSpots.set(shownAt, scrollY);
  history[replace ? "replaceState" : "pushState"](null, "", target.pathname + target.search);
  route();
}
useRouter(navigate);
history.scrollRestoration = "manual";   // each view's place is kept in scrollSpots instead

addEventListener("popstate", () => {
  if(!appStarted) return;
  if(!canLeave()){ history.pushState(null, "", shownAt); return; }
  scrollSpots.set(shownAt, scrollY);
  route();
});

// Links to the admin's own views switch in place; links to new tabs or other pages work as usual.
document.addEventListener("click", e => {
  const a = e.target.closest?.("a[href]");
  if(!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
  const url = new URL(a.href, location.href);
  if(url.origin !== location.origin || url.pathname !== location.pathname) return;
  e.preventDefault();
  go(url.href);
});

// Each view is redrawn as its data arrives or changes, whether it is showing or not.
const LATE = { categories: "templates", templates: "templates", pins: "editor PINs", orders: "orders" };
const warned = new Set();
onData(kind => {
  refreshList();
  if(kind === "categories" || kind === "templates" || kind === "events") renderTemplates();
  if(kind === "categories" || kind === "templates") setCatalog(data.categories, data.templates);
  if(kind === "settings") renderSettings();
  if(failed.has(kind) && LATE[kind] && !warned.has(LATE[kind])){
    warned.add(LATE[kind]);
    toast(`Couldn't load ${LATE[kind]} — deploy the latest firestore.rules (see SETUP.md).`);
  }
});

if(!isFirebaseConfigured){
  show("setupView");
} else {
  import("./firebase.js").then(mod => {
    fb = mod;
    useFirebase(mod);
    useAccessFirebase(mod);
    useSalesFirebase(mod);
    document.querySelectorAll(".slug-prefix").forEach(s => { s.textContent = siteHost() + "/"; });
    initTemplates();
    initSettings();
    let triedAutoLogin = false;
    fb.onAuthStateChanged(fb.auth, async user => {
      if(user) return enterApp(user);
      show("appView", false);
      if(!triedAutoLogin){
        triedAutoLogin = true;
        if(await autoLogin()) return; // the next auth change enters the app
      }
      show("loginView");
    });
  }).catch(e => {
    console.error(e);
    show("setupView");
    toast("Couldn't load Firebase — check your internet connection.");
  });
}
