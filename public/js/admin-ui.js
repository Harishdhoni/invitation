// Small DOM helpers shared by the admin and editor pages' modules.
export const $ = id => document.getElementById(id);
export const show = (id, on = true) => { $(id).hidden = !on; };

export function el(tag, className, text){
  const n = document.createElement(tag);
  if(className) n.className = className;
  if(text !== undefined) n.textContent = text;
  return n;
}

let toastTimer;
export function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3800);
}

export function actionBtn(label, className, onClick){
  const b = el("button", "btn small " + className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

export function linkBtn(label, className, href, newTab = false){
  const a = el("a", "btn small " + className, label);
  a.href = href;
  if(newTab){ a.target = "_blank"; a.rel = "noopener"; }
  return a;
}

// Moves to another view, e.g. go("?view=templates"). The admin page switches views in place (admin.js sets the
// router with useRouter); anywhere else this is an ordinary page load.
let router = url => { location.href = url; };
export const go = (url, options) => router(url, options);
export const useRouter = fn => { router = fn; };

export async function copyText(text, copiedMessage = "Link copied: " + text){
  try {
    await navigator.clipboard.writeText(text);
    toast(copiedMessage);
  } catch {
    prompt("Copy this:", text);
  }
}

// The sidebar of the admin and editor pages. Wide screens always show it, and its toggle folds it to a rail of icons
// and back; this browser remembers which (localStorage, shared by both pages). On phones and tablets the menu button
// slides it in over the page, which can't be scrolled or tabbed into meanwhile; the close button, the backdrop,
// Escape or choosing an item closes it again.
const SIDE_COLLAPSED = "wi:sideCollapsed";

export function wireSidebar(){
  const root = document.documentElement, menu = $("menuBtn"), side = $("sidebar"), toggle = $("sideToggle");
  const setCollapsed = on => {
    root.classList.toggle("side-collapsed", on);
    const label = on ? "Expand the sidebar" : "Collapse the sidebar";
    toggle.setAttribute("aria-expanded", String(!on));
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  };
  let collapsed = false;
  try { collapsed = localStorage.getItem(SIDE_COLLAPSED) === "1"; } catch(e){}
  setCollapsed(collapsed);
  toggle.addEventListener("click", () => {
    const on = !root.classList.contains("side-collapsed");
    setCollapsed(on);
    try { localStorage.setItem(SIDE_COLLAPSED, on ? "1" : ""); } catch(e){}
  });

  const behind = () => document.querySelectorAll("#appView > :not(#sidebar):not(#sideBackdrop)");
  const setOpen = open => {
    if(open === root.classList.contains("nav-open")) return;
    root.classList.toggle("nav-open", open);
    menu.setAttribute("aria-expanded", String(open));
    behind().forEach(n => { n.inert = open; });
    if(open) $("menuClose").focus();
    else if(side.contains(document.activeElement)) menu.focus();
  };
  menu.addEventListener("click", () => setOpen(true));
  $("menuClose").addEventListener("click", () => setOpen(false));
  $("sideBackdrop").addEventListener("click", () => setOpen(false));
  side.addEventListener("click", e => { if(e.target.closest(".side-nav a, .side-nav button, .side-out")) setOpen(false); });
  addEventListener("keydown", e => { if(e.key === "Escape") setOpen(false); });
  matchMedia("(min-width: 1024px)").addEventListener("change", () => setOpen(false));
}

export const permissionHint = e => e?.code === "permission-denied"
  ? "Permission denied — check the admin UID in firestore.rules and deploy the rules (firebase deploy --only firestore:rules)."
  : e?.message || String(e);
