// Small DOM helpers shared by the admin page's modules.
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

export async function copyText(text, copiedMessage = "Link copied: " + text){
  try {
    await navigator.clipboard.writeText(text);
    toast(copiedMessage);
  } catch {
    prompt("Copy this:", text);
  }
}

export const permissionHint = e => e?.code === "permission-denied"
  ? "Permission denied — check the admin UID in firestore.rules and deploy the rules (firebase deploy --only firestore:rules)."
  : e?.message || String(e);
