// Admin: editor access. The admin creates a PIN for one event; whoever has the PIN can open /editor,
// enter it, and edit that event only. Changing or revoking the PIN cuts that access at once.
//
// pins/<PIN> = { slug, createdAt } is what firestore.rules check on every editor save.
// editors/<uid> = { pin, slug } is the record a signed-in editor leaves (see js/editor.js); it is
// cleaned up here when the PIN goes away.
import { SITE_URL } from "./firebase-config.js";
import { salesSettings, whatsappLink } from "./defaults.js";
import { el, toast, actionBtn, copyText } from "./admin-ui.js";
import { generatePin, formatPin } from "./pin.js";

let fb = null;
export const useFirebase = mod => { fb = mod; };

export const editorPageLink = () => `${SITE_URL}/editor`;

// The PINs themselves (slug -> { pin, at }) are read by js/admin-data.js.

// Removes every PIN of this event, and the editors who signed in with them.
async function clearPins(batch, slug){
  const pinDocs = await fb.getDocs(fb.query(fb.collection(fb.db, "pins"), fb.where("slug", "==", slug)));
  pinDocs.docs.forEach(d => batch.delete(d.ref));
  const sessions = await fb.getDocs(fb.query(fb.collection(fb.db, "editors"), fb.where("slug", "==", slug)));
  sessions.docs.forEach(d => batch.delete(d.ref));
}

// A new PIN for the event; the old one (if any) stops working in the same write.
export async function issuePin(slug){
  let pin;
  do { pin = generatePin(); } while((await fb.getDoc(fb.doc(fb.db, "pins", pin))).exists());
  const batch = fb.writeBatch(fb.db);
  await clearPins(batch, slug);
  batch.set(fb.doc(fb.db, "pins", pin), { slug, createdAt: fb.serverTimestamp() });
  await batch.commit();
  return pin;
}

export async function revokePin(slug){
  const batch = fb.writeBatch(fb.db);
  await clearPins(batch, slug);
  await batch.commit();
}

/* --------------------------- the customer's message --------------------------- */
// What the admin sends a customer on WhatsApp (or copies): their editor link with the PIN in it (editor.js reads
// it), their invitation link, and, while unpaid, how to pay with their name in the payment note.
// The admin can reword it on the Settings page (site/settings.welcomeMessage); {placeholders} are filled in here.
export const MESSAGE_PLACEHOLDERS = ["customer", "names", "editorLink", "editorPage", "pin", "inviteLink", "payment", "price", "helpLink", "business"];
export const DEFAULT_MESSAGE = `Hi {customer}! 🙏
Your invitation for {names} is ready for you to fill in.

✏️ Open your editor: {editorLink}
(or open {editorPage} and type the PIN {pin})

💌 Your invitation link: {inviteLink}

{payment}

Need help? {helpLink}`;

// Where to pay: the UPI ID and/or the GPay / PhonePe number from Settings.
function payTo(sales){
  const ways = [sales.upiId && `UPI ID ${sales.upiId}`, sales.payNumber && `GPay / PhonePe number ${sales.payNumber}`].filter(Boolean);
  return ways.join(" or ");
}

export function customerMessage({ name, slug, pin, paid, sales, customer = "" }){
  const who = customer.trim().split(/\s+/)[0] || "there";
  const where = payTo(sales);
  const payment = paid
    ? "✅ Your payment is received. Guests can open your link as soon as you share it."
    : `💰 Guests can open your link once the payment of ₹${sales.price} is received. ` +
      (where ? `Please send ₹${sales.price} to ${where}, and write your name (${customer.trim() || name}) in the payment note. `
             : `We'll send you the payment details. `) +
      "Then send us the payment screenshot here.";
  const values = {
    customer: who, names: name, pin: formatPin(pin), payment, price: sales.price, business: sales.businessName || "",
    editorLink: `${editorPageLink()}?pin=${formatPin(pin)}`, editorPage: editorPageLink(),
    inviteLink: `${SITE_URL}/${slug}`, helpLink: `${SITE_URL}/help`
  };
  return (sales.welcomeMessage?.trim() || DEFAULT_MESSAGE)
    .replace(/\{(\w+)\}/g, (m, key) => key in values ? String(values[key]) : m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Opens WhatsApp on the customer's chat with the message typed in; the admin taps Send. Returns false when the
// browser blocked the new tab or there is no number, so the caller can offer a button instead.
// (No "noopener" feature: with it window.open always returns null, and a blocked tab couldn't be told apart.)
export function sendOnWhatsApp(phone, message){
  const link = whatsappLink(phone, message);
  const tab = link ? window.open(link, "_blank") : null;
  try { if(tab) tab.opener = null; } catch {}
  return !!tab;
}

// The "Editor access" block of an event card. `pins` is shared with the list and kept up to date here.
// `customer` and `phone` come from the event's order, for the WhatsApp button.
export function accessPanel({ slug, name, pins, paid = true, sales = salesSettings(), customer = "", phone = "" }){
  const box = el("div", "access");

  async function run(job, done){
    box.querySelectorAll("button").forEach(b => { b.disabled = true; });
    try {
      await job();
      toast(done);
    } catch(e){
      console.error(e);
      toast(e.code === "permission-denied"
        ? "Permission denied — deploy the latest firestore.rules (see SETUP.md)."
        : "Failed: " + e.message);
    }
    render();
  }

  const create = () => run(async () => { pins.set(slug, { pin: await issuePin(slug), at: Date.now() }); }, "PIN created — copy the details to share them.");
  const change = () => {
    if(!confirm(`Change the PIN for "${name}"?\n\nThe current PIN stops working immediately, including for anyone editing right now.`)) return;
    run(async () => { pins.set(slug, { pin: await issuePin(slug), at: Date.now() }); }, "PIN changed. The old one no longer works.");
  };
  const revoke = () => {
    if(!confirm(`Revoke editor access to "${name}"?\n\nThe PIN stops working immediately. You can create a new one any time.`)) return;
    run(async () => { await revokePin(slug); pins.delete(slug); }, "Editor access revoked.");
  };

  function render(){
    const rec = pins.get(slug);
    box.replaceChildren();
    if(!rec){
      box.append(el("span", "muted", "No editor PIN"), actionBtn("Create editor PIN", "ghost", create));
      return;
    }
    const code = el("code", "pin", formatPin(rec.pin));
    code.title = "Editor PIN";
    const acts = el("div", "row");
    const message = () => customerMessage({ name, slug, pin: rec.pin, paid, sales, customer });
    // With the customer's number, a link (not window.open) so the browser never blocks it.
    const chat = phone && whatsappLink(phone, message());
    if(chat){
      const a = el("a", "btn small primary", "Send on WhatsApp");
      Object.assign(a, { href: chat, target: "_blank", rel: "noopener", title: "Opens WhatsApp on the customer's chat with the message typed in" });
      acts.append(a);
    }
    acts.append(
      actionBtn("Copy details", "ghost", () => copyText(message(), "Copied — send it to the customer.")),
      actionBtn("Change", "ghost", change),
      actionBtn("Revoke", "danger", revoke)
    );
    box.append(el("span", "muted", "Editor PIN"), code, acts);
  }
  render();
  return box;
}
