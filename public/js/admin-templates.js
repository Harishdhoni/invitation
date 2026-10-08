// Admin: categories and invitation templates — the Templates page, the template editor,
// and the template picker used when creating or editing an event.
// Templates are whole HTML pages in templates/<id>; see TEMPLATES.md for the hooks they use.
import { DEFAULT_CATEGORIES, slugify, isValidId } from "./defaults.js";
import { SITE_URL } from "./firebase-config.js";
import { $, show, el, toast, actionBtn, linkBtn, copyText, permissionHint } from "./admin-ui.js";

let fb = null;
export const useFirebase = mod => { fb = mod; };

// The built-in design in index.html. It isn't stored in Firestore; events use it with templateId "".
export const CLASSIC = {
  id: "", name: "Classic Maroon & Gold", categoryId: "wedding", builtIn: true,
  description: "The built-in design: curtain intro, gold corners, falling petals and an English / Tamil switch."
};
const RESERVED_IDS = new Set(["classic", "new", "blank"]);
const MAX_HTML = 900_000;   // Firestore allows 1 MiB per document

// Links are relative to admin.html, so they work on XAMPP and Vercel alike.
export const templatePreviewLink = id => `./?template=${id || "classic"}`;
export const templateLiveLink = id => `${SITE_URL}/?template=${id || "classic"}`;
export const eventInTemplateLink = (slug, id) => `./?w=${slug}&template=${id || "classic"}`;
const siteHost = () => SITE_URL.replace(/^https?:\/\//, "");

/* --------------------------------- data --------------------------------- */
// Categories, oldest first. The first visit after setup creates Weddings, Housewarmings and Birthdays.
export async function loadCategories(){
  const snap = await fb.getDocs(fb.collection(fb.db, "categories"));
  let cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if(!cats.length){
    const batch = fb.writeBatch(fb.db);
    DEFAULT_CATEGORIES.forEach(({ id, ...c }) => batch.set(fb.doc(fb.db, "categories", id), c));
    await batch.commit();
    cats = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  }
  return cats.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
}

export async function loadTemplates(){
  const snap = await fb.getDocs(fb.collection(fb.db, "templates"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
}

// The templates an event of this category can use (Classic is for weddings only).
export const templatesIn = (templates, category) =>
  [...(category === "wedding" ? [CLASSIC] : []), ...templates.filter(t => t.categoryId === category)];

export const templateName = (templates, id) =>
  !id ? CLASSIC.name : templates.find(t => t.id === id)?.name || `Missing template "${id}"`;

export const categoryName = (categories, id) => categories.find(c => c.id === (id || "wedding"))?.name || id;

/* ------------------------------- previews ------------------------------- */
// A template page set up to show sample details for its category (js/invite.js reads the meta tag).
export function previewDoc(html, category){
  const tag = `<meta name="invite-preview" content="${String(category || "wedding").replace(/"/g, "")}">`;
  let page = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
  const script = `<script type="module" src="js/invite.js"></script>`;
  const end = page.toLowerCase().lastIndexOf("</body>");
  return end < 0 ? page + script : page.slice(0, end) + script + page.slice(end);
}

// Frames load only once they scroll into view; a page of 12 live previews is heavy otherwise.
const pendingFrames = new WeakMap();
const frameLoader = "IntersectionObserver" in window ? new IntersectionObserver(entries => entries.forEach(e => {
  if(!e.isIntersecting) return;
  pendingFrames.get(e.target)?.();
  pendingFrames.delete(e.target);
  frameLoader.unobserve(e.target);
}), { rootMargin: "200px" }) : null;

// A small live view of a template with sample details, scaled from a phone-sized page.
export function thumbnail(t, { width = 390, height = 600 } = {}){
  const box = el("div", "thumb");
  box.style.aspectRatio = `${width} / ${height}`;
  const frame = el("iframe");
  frame.title = `${t.name} preview`;
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { width: width + "px", height: height + "px" });
  const load = () => { if(t.builtIn) frame.src = templatePreviewLink(""); else frame.srcdoc = previewDoc(t.html || "", t.categoryId); };
  if(frameLoader){ pendingFrames.set(frame, load); frameLoader.observe(frame); } else load();
  box.append(frame);
  new ResizeObserver(() => { frame.style.transform = `scale(${box.clientWidth / width})`; }).observe(box);
  return box;
}

/* ----------------------------- template picker ----------------------------- */
// Cards for choosing one of a category's templates. Calls onChange(id) ("" = Classic).
export function templatePicker({ templates, category, selected, onChange, name = "template", canCreate = true }){
  const list = templatesIn(templates, category);
  const wrap = el("div", "picker");
  if(!list.length){
    const empty = el("div", "picker-empty");
    empty.append(el("p", "muted", "There are no templates in this category yet."));
    if(canCreate) empty.append(linkBtn("＋ Create one", "ghost", `?template=new&category=${encodeURIComponent(category)}`));
    wrap.append(empty);
    return wrap;
  }
  list.forEach(t => {
    const card = el("label", "pick-card");
    const radio = Object.assign(el("input"), { type: "radio", name, value: t.id, checked: t.id === selected });
    radio.addEventListener("change", () => { if(radio.checked) onChange(t.id); });
    const info = el("div", "pick-info");
    info.append(el("b", "", t.name), linkBtn("Preview ↗", "ghost", templatePreviewLink(t.id), true));
    card.append(radio, thumbnail(t), info);
    wrap.append(card);
  });
  return wrap;
}

/* ------------------------------ Templates page ------------------------------ */
let categories = [];
let templates = [];
let events = [];          // [{ id, cfg }] — to show and check which events use a template or category

// The category the Templates page shows ("all" or a category id). Kept for the browser tab, so it
// survives a trip to the template editor and back.
const CATEGORY_KEY = "wi:templatesCategory";
let shownCategory = "all";
try { shownCategory = sessionStorage.getItem(CATEGORY_KEY) || "all"; } catch(e){}

export async function enterTemplates(){
  show("templatesView");
  $("templateCategory").addEventListener("change", e => {
    shownCategory = e.target.value;
    try { sessionStorage.setItem(CATEGORY_KEY, shownCategory); } catch(err){}
    renderTemplateGroups();
  });
  $("newCategoryBtn").addEventListener("click", () => {
    $("newCategoryForm").reset();
    $("newCategoryError").textContent = "";
    show("newCategoryForm");
    $("newCategoryName").focus();
  });
  $("cancelCategoryBtn").addEventListener("click", () => show("newCategoryForm", false));
  $("newCategoryForm").addEventListener("submit", addCategory);
  $("startersBtn").addEventListener("click", addStarters);
  await refreshTemplates();
}

async function refreshTemplates(){
  const status = $("templatesStatus");
  status.textContent = "Loading templates…";
  show("templatesStatus");
  try {
    const [cats, tpls, evs] = await Promise.all([
      loadCategories(), loadTemplates(), fb.getDocs(fb.collection(fb.db, "weddings"))
    ]);
    categories = cats;
    templates = tpls;
    events = evs.docs.map(d => ({ id: d.id, cfg: d.data() }));
  } catch(e){
    status.textContent = "Couldn't load templates: " + permissionHint(e);
    return;
  }
  show("templatesStatus", false);
  renderTemplateGroups();
  checkStarters();
}

const eventName = e => [e.cfg.groomName?.en, e.cfg.brideName?.en].filter(Boolean).join(" & ") || e.id;
const usedBy = id => events.filter(e => (e.cfg.templateId || "") === id);
const eventsIn = catId => events.filter(e => (e.cfg.category || "wedding") === catId);

function renderTemplateGroups(){
  const known = new Set(categories.map(c => c.id));
  const groups = categories.map(c => ({ cat: c, list: templatesIn(templates, c.id) }));
  const orphans = templates.filter(t => !known.has(t.categoryId));
  if(orphans.length) groups.push({ cat: { id: "", name: "No category" }, list: orphans });
  renderCategorySelect(groups);
  const shown = shownCategory === "all" ? groups : groups.filter(g => g.cat.id === shownCategory);
  $("templateGroups").replaceChildren(...shown.map(g => templateGroup(g.cat, g.list)));
}

// The category dropdown lists every category with its template count. If the chosen category
// is gone (deleted or renamed away), the page goes back to showing all of them.
function renderCategorySelect(groups){
  if(shownCategory !== "all" && !groups.some(g => g.cat.id === shownCategory)) shownCategory = "all";
  const option = (value, label) => Object.assign(el("option", "", label), { value });
  const total = groups.reduce((n, g) => n + g.list.length, 0);
  $("templateCategory").replaceChildren(option("all", `All categories (${total})`),
    ...groups.map(g => option(g.cat.id, `${g.cat.name} (${g.list.length})`)));
  $("templateCategory").value = shownCategory;
  const picked = groups.find(g => g.cat.id === shownCategory);
  const n = picked ? picked.list.length : total;
  $("templateCount").textContent = `Showing ${n} template${n === 1 ? "" : "s"}` + (picked ? ` in ${picked.cat.name}` : " in all categories");
}

function templateGroup(cat, list){
  const section = el("section", "tpl-group");
  const head = el("div", "group-head");
  const title = el("h2", "", cat.name);
  title.append(el("span", "count", String(list.length)));
  const acts = el("div", "row");
  if(cat.id){
    acts.append(linkBtn("＋ New template", "primary", `?template=new&category=${encodeURIComponent(cat.id)}`));
    acts.append(actionBtn("Rename", "ghost", () => renameCategory(cat)));
    if(cat.id !== "wedding") acts.append(actionBtn("Delete", "danger", () => deleteCategory(cat, list)));
  }
  head.append(title, acts);
  const grid = el("div", "tpl-grid");
  if(list.length) grid.append(...list.map(templateCard));
  else grid.append(el("p", "muted", "No templates in this category yet."));
  section.append(head, grid);
  return section;
}

function templateCard(t){
  const card = el("article", "card tpl-card");
  const body = el("div", "tpl-body");
  const head = el("div", "tpl-name");
  head.append(el("h3", "", t.name));
  if(t.builtIn) head.append(el("span", "badge main", "Built-in"));
  body.append(head);
  if(t.description) body.append(el("p", "muted", t.description));

  const users = usedBy(t.id);
  body.append(el("p", "used", users.length
    ? `Used by ${users.length} event${users.length === 1 ? "" : "s"}: ${users.slice(0, 3).map(eventName).join(", ")}${users.length > 3 ? "…" : ""}`
    : "Not used by any event yet"));

  const link = el("a", "wedding-link", `${siteHost()}/?template=${t.id || "classic"}`);
  link.href = templatePreviewLink(t.id);
  link.target = "_blank";
  link.rel = "noopener";
  link.title = "Live preview with sample details";
  body.append(link);

  const acts = el("div", "row");
  if(!t.builtIn) acts.append(linkBtn("Edit", "primary", "?template=" + t.id));
  acts.append(linkBtn("Preview ↗", "ghost", templatePreviewLink(t.id), true),
    actionBtn("Copy link", "ghost", () => copyText(templateLiveLink(t.id))));
  if(!t.builtIn){
    acts.append(actionBtn("Duplicate", "ghost", () => duplicateTemplate(t)),
      actionBtn("Delete", "danger", () => deleteTemplate(t)));
  }
  body.append(acts);
  card.append(thumbnail(t), body);
  return card;
}

// A free id from a name: temple-gold, temple-gold-2, …
async function freeTemplateId(name){
  let base = slugify(name).slice(0, 34).replace(/-+$/, "");
  if(!isValidId(base) || RESERVED_IDS.has(base)) base = "template";
  for(let i = 1; ; i++){
    const id = i === 1 ? base : `${base}-${i}`;
    if(RESERVED_IDS.has(id) || templates.some(t => t.id === id)) continue;
    if(!(await fb.getDoc(fb.doc(fb.db, "templates", id))).exists()) return id;
  }
}

async function duplicateTemplate(t){
  try {
    const id = await freeTemplateId("copy of " + t.name);
    await fb.setDoc(fb.doc(fb.db, "templates", id), {
      name: "Copy of " + t.name, categoryId: t.categoryId, description: t.description || "", html: t.html,
      v: Date.now(), createdAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp()
    });
    location.href = "?template=" + id;
  } catch(e){
    toast("Couldn't duplicate: " + permissionHint(e));
  }
}

async function deleteTemplate(t, onDeleted = refreshTemplates){
  try {
    // Checked again here, in case an event picked it since the page loaded.
    const using = await fb.getDocs(fb.query(fb.collection(fb.db, "weddings"), fb.where("templateId", "==", t.id)));
    if(!using.empty){
      const names = using.docs.map(d => eventName({ id: d.id, cfg: d.data() }));
      return alert(`"${t.name}" is used by ${names.join(", ")}.\n\nOpen ${using.size === 1 ? "that event" : "those events"}, pick another design in the Design tab and save, then delete this template.`);
    }
    if(!confirm(`Delete the template "${t.name}"? This can't be undone.`)) return;
    await fb.deleteDoc(fb.doc(fb.db, "templates", t.id));
    toast(`Deleted "${t.name}".`);
    onDeleted();
  } catch(e){
    toast("Delete failed: " + permissionHint(e));
  }
}

/* ------------------------------- categories ------------------------------- */
async function addCategory(e){
  e.preventDefault();
  const name = $("newCategoryName").value.trim();
  const error = $("newCategoryError");
  error.textContent = "";
  const id = slugify(name).slice(0, 40).replace(/-+$/, "");
  if(!name || !isValidId(id)) return void (error.textContent = "Type a name with at least two letters or numbers, like Engagement.");
  if(categories.some(c => c.id === id || c.name.toLowerCase() === name.toLowerCase()))
    return void (error.textContent = `There's already a category called "${name}".`);
  try {
    await fb.setDoc(fb.doc(fb.db, "categories", id), { name, order: Math.max(0, ...categories.map(c => c.order || 0)) + 1 });
    show("newCategoryForm", false);
    toast(`Added "${name}". Add a template to it so events can use it.`);
    refreshTemplates();
  } catch(err){
    error.textContent = permissionHint(err);
  }
}

async function renameCategory(cat){
  const name = prompt(`New name for "${cat.name}":`, cat.name)?.trim();
  if(!name || name === cat.name) return;
  try {
    await fb.updateDoc(fb.doc(fb.db, "categories", cat.id), { name });
    refreshTemplates();
  } catch(e){
    toast("Rename failed: " + permissionHint(e));
  }
}

async function deleteCategory(cat, list){
  const evs = eventsIn(cat.id);
  if(list.length || evs.length){
    const parts = [];
    if(list.length) parts.push(`${list.length} template${list.length === 1 ? "" : "s"}`);
    if(evs.length) parts.push(`${evs.length} event${evs.length === 1 ? "" : "s"}`);
    return alert(`"${cat.name}" still has ${parts.join(" and ")}. Delete or move them first.`);
  }
  if(!confirm(`Delete the category "${cat.name}"?`)) return;
  try {
    await fb.deleteDoc(fb.doc(fb.db, "categories", cat.id));
    refreshTemplates();
  } catch(e){
    toast("Delete failed: " + permissionHint(e));
  }
}

/* ---------------------------- starter templates ---------------------------- */
// The designs shipped in public/templates/ (listed in starters.json), added to Firestore on request.
let starters = [];

async function checkStarters(){
  try {
    starters = await (await fetch("templates/starters.json", { cache: "no-cache" })).json();
  } catch { starters = []; }
  const missing = starters.filter(s => !templates.some(t => t.id === s.id));
  $("startersBtn").textContent = `Add ${missing.length} starter template${missing.length === 1 ? "" : "s"}`;
  show("startersBtn", missing.length > 0);
}

async function addStarters(){
  const btn = $("startersBtn");
  const missing = starters.filter(s => !templates.some(t => t.id === s.id));
  btn.disabled = true;
  try {
    for(const [i, s] of missing.entries()){
      btn.textContent = `Adding ${i + 1}/${missing.length}…`;
      if(!categories.some(c => c.id === s.category)){
        const def = DEFAULT_CATEGORIES.find(c => c.id === s.category);
        const cat = { name: def?.name || s.category, order: def?.order ?? categories.length + 1 };
        await fb.setDoc(fb.doc(fb.db, "categories", s.category), cat);
        categories.push({ id: s.category, ...cat });
      }
      const res = await fetch("templates/" + s.file, { cache: "no-cache" });
      if(!res.ok) throw new Error(`templates/${s.file} is missing`);
      await fb.setDoc(fb.doc(fb.db, "templates", s.id), {
        name: s.name, categoryId: s.category, description: s.description || "", html: await res.text(),
        v: Date.now(), createdAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp()
      });
    }
    toast(`Added ${missing.length} template${missing.length === 1 ? "" : "s"}.`);
  } catch(e){
    toast("Couldn't add the starter templates: " + permissionHint(e));
  }
  btn.disabled = false;
  refreshTemplates();
}

/* ----------------------------- template editor ----------------------------- */
let current = null;       // the template being edited ({ id, name, categoryId, description, html }); id "" while new
let tplDirty = false;
let previewTimer = null;
let device = "phone";
const DEVICES = { phone: [390, 844], desktop: [1280, 800] };

function setTplDirty(on = true){
  tplDirty = on;
  $("tplSaveBtn").disabled = !on;
  const s = $("tplSaveStatus");
  s.textContent = on ? "Unsaved changes" : "All changes saved";
  s.classList.toggle("dirty", on);
}

export async function enterTemplateEditor(id, presetCategory){
  addEventListener("beforeunload", e => { if(tplDirty){ e.preventDefault(); e.returnValue = ""; } });
  try {
    [categories, templates] = await Promise.all([loadCategories(), loadTemplates()]);
  } catch(e){
    return backToTemplates("Couldn't load templates: " + permissionHint(e));
  }

  if(id === "new"){
    let html = "";
    try { html = await (await fetch("templates/blank.html", { cache: "no-cache" })).text(); } catch {}
    const cat = categories.some(c => c.id === presetCategory) ? presetCategory : categories[0]?.id || "wedding";
    current = { id: "", name: "", categoryId: cat, description: "", html };
  } else {
    const t = templates.find(x => x.id === id);
    if(!t) return backToTemplates(`There's no template "${id}".`);
    current = { ...t };
  }

  show("templateEditorView");
  $("tplCategory").replaceChildren(...categories.map(c => Object.assign(el("option", "", c.name), { value: c.id })));
  if(!categories.some(c => c.id === current.categoryId))
    $("tplCategory").prepend(Object.assign(el("option", "", "No category"), { value: current.categoryId }));
  $("tplCategory").value = current.categoryId;
  $("tplName").value = current.name;
  $("tplDesc").value = current.description || "";
  $("tplHtml").value = current.html || "";
  refreshEditorHead();
  updateSize();
  renderPreview();
  setTplDirty(id === "new");

  $("tplName").addEventListener("input", () => { current.name = $("tplName").value; refreshEditorHead(); setTplDirty(); });
  $("tplDesc").addEventListener("input", () => { current.description = $("tplDesc").value; setTplDirty(); });
  $("tplCategory").addEventListener("change", () => { current.categoryId = $("tplCategory").value; setTplDirty(); renderPreview(); });
  $("tplHtml").addEventListener("input", () => {
    current.html = $("tplHtml").value;
    updateSize();
    setTplDirty();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 1200);
  });
  // Tab inserts two spaces instead of leaving the box.
  $("tplHtml").addEventListener("keydown", e => {
    if(e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    document.execCommand("insertText", false, "  ");
  });
  $("tplRefreshBtn").addEventListener("click", renderPreview);
  document.querySelectorAll("#tplDevice button").forEach(b => b.addEventListener("click", () => {
    device = b.dataset.device;
    document.querySelectorAll("#tplDevice button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderPreview();
  }));
  new ResizeObserver(fitPreview).observe($("tplStage"));

  $("tplUpload").addEventListener("change", async () => {
    const f = $("tplUpload").files[0];
    $("tplUpload").value = "";
    if(!f) return;
    if(current.html.trim() && !confirm(`Replace the HTML with "${f.name}"?`)) return;
    current.html = $("tplHtml").value = await f.text();
    if(!current.name) $("tplName").value = current.name = f.name.replace(/\.html?$/i, "").replace(/[-_]+/g, " ");
    refreshEditorHead();
    updateSize();
    setTplDirty();
    renderPreview();
  });
  $("tplDownloadBtn").addEventListener("click", () => {
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([current.html], { type: "text/html" }));
    a.download = (current.id || slugify(current.name) || "template") + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("tplSaveBtn").addEventListener("click", saveTemplate);
  $("tplDeleteBtn").addEventListener("click", async () => {
    if(!current.id) return backToTemplates();
    await deleteTemplate(current, () => { tplDirty = false; location.href = "?view=templates"; });
  });
  addEventListener("keydown", e => {
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s"){ e.preventDefault(); saveTemplate(); }
  });
}

function refreshEditorHead(){
  const name = current.name.trim() || "New template";
  $("tplTitle").textContent = name;
  document.title = name + " · Templates";
  show("tplLinks", !!current.id);
  show("tplLiveLinkRow", !!current.id);
  if(current.id){
    $("tplPreviewLink").href = templatePreviewLink(current.id);
    $("tplLiveLink").textContent = `${siteHost()}/?template=${current.id}`;
    $("tplLiveLink").href = templatePreviewLink(current.id);
  }
  $("tplDeleteBtn").textContent = current.id ? "Delete template" : "Cancel";
}

function updateSize(){
  const bytes = new Blob([current.html]).size;
  const hooks = /data-bind=|couple-names|id=["'](eventsGrid|heroTagline|wishForm)/.test(current.html);
  $("tplSize").textContent = `${(bytes / 1024).toFixed(0)} KB of ${(MAX_HTML / 1024).toFixed(0)} KB` +
    (hooks ? "" : " · no template hooks found yet — see “Hooks” below");
  $("tplSize").classList.toggle("warn", bytes > MAX_HTML || !hooks);
}

function renderPreview(){
  const [w, h] = DEVICES[device];
  const frame = $("tplFrame");
  Object.assign(frame.style, { width: w + "px", height: h + "px" });
  frame.srcdoc = previewDoc(current.html || "<p style='font:16px sans-serif;padding:24px'>Paste or upload the template's HTML.</p>", current.categoryId);
  fitPreview();
}

function fitPreview(){
  const stage = $("tplStage");
  const [w, h] = DEVICES[device];
  const scale = Math.min(1, stage.clientWidth / w);
  $("tplFrame").style.transform = `scale(${scale})`;
  $("tplFrame").style.left = Math.max(0, (stage.clientWidth - w * scale) / 2) + "px";
  stage.style.height = Math.round(h * scale) + "px";
}

async function saveTemplate(){
  if(!tplDirty) return;
  const name = current.name.trim();
  if(!name){ $("tplName").focus(); return toast("Give the template a name."); }
  if(!current.html.trim()) return toast("Paste or upload the template's HTML first.");
  if(new Blob([current.html]).size > MAX_HTML) return toast("The HTML is too big (over 900 KB). Move large images out of it — photos come from the event anyway.");

  const original = templates.find(t => t.id === current.id);
  $("tplSaveBtn").disabled = true;
  $("tplSaveStatus").textContent = "Saving…";
  try {
    // Moving a template to another category only matters for events that already use it.
    if(original && original.categoryId !== current.categoryId){
      const using = await fb.getDocs(fb.query(fb.collection(fb.db, "weddings"), fb.where("templateId", "==", current.id)));
      const other = using.docs.filter(d => (d.data().category || "wedding") !== current.categoryId);
      if(other.length && !confirm(`${other.length} event${other.length === 1 ? " uses" : "s use"} this template but ${other.length === 1 ? "is" : "are"} in another category. They keep showing it, but it won't be offered for their category any more. Save anyway?`)){
        return setTplDirty(true);
      }
    }
    const data = {
      name, categoryId: current.categoryId, description: current.description.trim(), html: current.html,
      v: Date.now(), updatedAt: fb.serverTimestamp()
    };
    if(!current.id){
      current.id = await freeTemplateId(name);
      await fb.setDoc(fb.doc(fb.db, "templates", current.id), { ...data, createdAt: fb.serverTimestamp() });
      templates.push({ ...current, ...data });
      history.replaceState(null, "", "?template=" + current.id);
    } else {
      await fb.updateDoc(fb.doc(fb.db, "templates", current.id), data);
      if(original) Object.assign(original, data);
    }
    refreshEditorHead();
    setTplDirty(false);
    toast("Saved ✓ Events using this template show the change when guests open or refresh them.");
  } catch(e){
    console.error(e);
    toast("Save failed: " + permissionHint(e));
    setTplDirty(true);
  }
}

function backToTemplates(msg){
  history.replaceState(null, "", "?view=templates");
  if(msg) toast(msg);
  enterTemplates();
}
