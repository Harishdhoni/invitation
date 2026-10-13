// Admin: selling invitations. Who bought each one and how they paid (orders/<slug>, admin only), the
// "Mark as paid" switch that opens an invitation to guests, this month's takings, a CSV for the accounts,
// and the Settings page (price, UPI ID, WhatsApp… in site/settings, which customers see).
//
// weddings/<slug>.paid is what firestore.rules check (isLive); the order only records the sale. Customer names,
// phone numbers and payment references stay out of weddings/<slug>, because anyone with the link can read it.
import { SALES_DEFAULTS, salesSettings, whatsappLink, tr, indiaToday } from "./defaults.js";
import { $, show, el, toast, actionBtn, permissionHint } from "./admin-ui.js";

let fb = null;
export const useFirebase = mod => { fb = mod; };
const orderRef = slug => fb.doc(fb.db, "orders", slug);
const settingsRef = () => fb.doc(fb.db, "site", "settings");

const rupees = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const indiaDate = ms => new Date(ms + 330 * 60000).toISOString().slice(0, 10);
const paidMs = o => o?.paidAt?.toMillis?.() ?? null;
const fmtDate = ms => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const METHODS = ["UPI", "Cash", "Bank transfer", "Razorpay", "Other"];

/* --------------------------------- orders --------------------------------- */
// slug -> order, for every invitation sold through the admin (events made before selling have none).
export async function loadOrders(){
  const snap = await fb.getDocs(fb.collection(fb.db, "orders"));
  return new Map(snap.docs.map(d => [d.id, d.data()]));
}

// The order written with a new event, in the same batch. `paid` is what the admin ticked.
export function newOrder(batch, slug, { customer, phone, paid, price }){
  const order = { customer, phone, amount: paid ? price : 0, method: paid ? "UPI" : "", ref: "", note: "",
    status: paid ? "paid" : "unpaid", createdAt: fb.serverTimestamp(), paidAt: paid ? fb.serverTimestamp() : null };
  batch.set(orderRef(slug), order);
  return order;
}

// Deleting an event keeps its order, marked deleted, for the accounts.
export async function markOrderDeleted(slug, orders){
  if(orders.has(slug)) await fb.setDoc(orderRef(slug), { deleted: true, deletedAt: fb.serverTimestamp() }, { merge: true });
}

// The customer and payment part of an event card: who bought it, whether it is paid, and the switch.
// `onChange` re-renders the list after a change (w.cfg.paid and `orders` are updated here).
export function orderPanel({ w, orders, sales, onChange }){
  const box = el("div", "order");
  const order = orders.get(w.id);
  const paid = w.cfg.paid !== false;

  if(order?.customer || order?.phone){
    const who = el("p", "order-who");
    who.append(el("span", "muted", "Customer: "), order.customer || "—");
    if(order.phone){
      who.append(" · " + order.phone + " ");
      const chat = whatsappLink(order.phone);
      if(chat){
        const a = el("a", "", "WhatsApp");
        Object.assign(a, { href: chat, target: "_blank", rel: "noopener" });
        who.append(a);
      }
    }
    box.append(who);
  }

  const line = el("div", "order-line");
  if(paid){
    if(!order) return box.children.length ? box : null;   // made before selling: nothing to show
    const when = paidMs(order);
    line.append(el("span", "badge ok", "Paid"),
      " " + [rupees(order.amount), order.method, when ? fmtDate(when) : ""].filter(Boolean).join(" · ") + (order.ref ? ` · ref ${order.ref}` : ""),
      actionBtn("Mark unpaid", "ghost", () => setPaid(w, false, {}, orders, onChange)));
    box.append(line);
    return box;
  }

  line.append(el("span", "badge wait", "Not paid yet"), " Guests can't open it until it is paid.");
  const form = paidForm(sales, fields => setPaid(w, true, fields, orders, onChange));
  const open = actionBtn("Mark as paid", "primary", () => { show(form.id, true); open.hidden = true; form.querySelector("input").focus(); });
  form.addEventListener("reset", () => { form.hidden = true; open.hidden = false; });
  line.append(open);
  box.append(line, form);
  return box;
}

let formSeq = 0;
// Amount, method, reference and note, filled in when a payment arrives.
function paidForm(sales, onSave){
  const form = el("form", "paid-form");
  form.id = "paidForm" + (++formSeq);
  form.hidden = true;
  const field = (label, input) => { const l = el("label", "field"); l.append(el("span", "", label), input); return l; };
  const amount = Object.assign(el("input"), { type: "number", min: 0, step: 1, value: sales.price, required: true });
  const method = el("select");
  method.append(...METHODS.map(m => Object.assign(el("option", "", m), { value: m })));
  const ref = Object.assign(el("input"), { type: "text", placeholder: "UPI transaction ID" });
  const note = Object.assign(el("input"), { type: "text" });
  const grid = el("div", "paid-grid");
  grid.append(field("Amount (₹)", amount), field("Paid by", method), field("Reference (optional)", ref), field("Note (optional)", note));
  const save = el("button", "btn primary small", "Save — open to guests");
  save.type = "submit";
  const cancel = el("button", "btn ghost small", "Cancel");
  cancel.type = "reset";
  const acts = el("div", "row");
  acts.append(save, cancel);
  form.append(grid, acts);
  form.addEventListener("submit", e => {
    e.preventDefault();
    save.disabled = true;
    onSave({ amount: Math.max(0, Math.round(Number(amount.value) || 0)), method: method.value, ref: ref.value.trim(), note: note.value.trim() })
      .finally(() => { save.disabled = false; });
  });
  return form;
}

// Marks the invitation paid (guests can open it) or unpaid, and records it on the order, in one write.
async function setPaid(w, paid, fields, orders, onChange){
  const name = [tr(w.cfg.groomName, "en"), tr(w.cfg.brideName, "en")].filter(Boolean).join(" & ") || w.id;
  if(!paid && !confirm(`Mark "${name}" as not paid?\n\nGuests won't be able to open its links until it is marked paid again.`)) return;
  const order = paid
    ? { ...fields, status: "paid", paidAt: fb.serverTimestamp() }
    : { status: "unpaid", paidAt: null };
  try {
    const batch = fb.writeBatch(fb.db);
    batch.update(fb.doc(fb.db, "weddings", w.id), { paid });
    batch.set(orderRef(w.id), order, { merge: true });
    await batch.commit();
    w.cfg.paid = paid;
    orders.set(w.id, { ...(orders.get(w.id) || {}), ...order, paidAt: paid ? { toMillis: () => Date.now() } : null });
    toast(paid ? `${name} is paid. Guests can open it now (if its dates allow).` : `${name} is marked as not paid.`);
    onChange();
  } catch(e){
    console.error(e);
    toast("Couldn't save: " + permissionHint(e));
  }
}

/* --------------------------------- summary --------------------------------- */
// Takings this month (India time), waiting payments, and all-time takings.
export function salesSummary(events, orders){
  const month = indiaToday().slice(0, 7);
  const paidOrders = [...orders.values()].filter(o => o.status === "paid" && !o.deleted);
  const thisMonth = paidOrders.filter(o => paidMs(o) && indiaDate(paidMs(o)).startsWith(month));
  const sum = list => list.reduce((n, o) => n + (Number(o.amount) || 0), 0);
  const waiting = events.filter(w => !w.cfg.parent && w.cfg.paid === false).length;
  const tile = (value, label) => { const t = el("div", "tile"); t.append(el("b", "", value), el("span", "", label)); return t; };
  const box = el("div", "sales-summary");
  box.append(
    tile(rupees(sum(thisMonth)), `paid this month (${thisMonth.length} invitation${thisMonth.length === 1 ? "" : "s"})`),
    tile(String(waiting), "waiting for payment"),
    tile(rupees(sum(paidOrders)), `paid in all (${paidOrders.length})`)
  );
  return box;
}

/* ----------------------------------- CSV ----------------------------------- */
// Every invitation with its order, for the accounts. A byte-order mark so Excel reads Tamil names.
export function downloadCsv(events, orders, statusOf){
  const cols = ["Link", "Names", "Category", "Event date", "Status", "Customer", "Phone", "Amount", "Paid by", "Reference", "Paid on", "Note", "Deleted"];
  const rows = events.filter(w => !w.cfg.parent).map(w => {
    const o = orders.get(w.id) || {};
    return [w.id, [tr(w.cfg.groomName, "en"), tr(w.cfg.brideName, "en")].filter(Boolean).join(" & "), w.cfg.category || "wedding",
      (w.cfg.weddingDateTimeISO || "").slice(0, 10), statusOf(w), o.customer || "", o.phone || "", o.amount ?? "",
      o.method || "", o.ref || "", paidMs(o) ? indiaDate(paidMs(o)) : "", o.note || "", ""];
  });
  // Orders whose event was deleted.
  for(const [slug, o] of orders) if(o.deleted && !events.some(w => w.id === slug))
    rows.push([slug, "", "", "", "deleted", o.customer || "", o.phone || "", o.amount ?? "", o.method || "", o.ref || "",
      paidMs(o) ? indiaDate(paidMs(o)) : "", o.note || "", "yes"]);
  const cell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const csv = "﻿" + [cols, ...rows].map(r => r.map(cell).join(",")).join("\r\n");
  const a = el("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `invitations-${indiaToday()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* --------------------------------- settings --------------------------------- */
// admin?view=settings: what customers see about buying (site/settings, public).
const FIELDS = { businessName: "setBusinessName", price: "setPrice", upiId: "setUpiId", whatsapp: "setWhatsapp", email: "setEmail", address: "setAddress" };

export async function enterSettings(){
  show("settingsView");
  let s;
  try {
    const snap = await fb.getDoc(settingsRef());
    s = salesSettings(snap.exists() ? snap.data() : {});
  } catch(e){
    $("settingsError").textContent = "Couldn't load the settings: " + permissionHint(e);
    s = salesSettings();
  }
  for(const [key, id] of Object.entries(FIELDS)) $(id).value = s[key] ?? "";
  $("settingsForm").addEventListener("submit", async e => {
    e.preventDefault();
    const data = {};
    for(const [key, id] of Object.entries(FIELDS)) data[key] = $(id).value.trim();
    data.price = Math.round(Number(data.price)) || SALES_DEFAULTS.price;
    $("settingsError").textContent = "";
    $("settingsSaveBtn").disabled = true;
    try {
      await fb.setDoc(settingsRef(), data, { merge: true });
      toast("Settings saved. The sales page, the editor page and new messages use them now.");
    } catch(err){
      $("settingsError").textContent = "Couldn't save: " + permissionHint(err);
    }
    $("settingsSaveBtn").disabled = false;
  });
}
