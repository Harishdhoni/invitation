// The Share window, opened from the top bar of the admin and editor pages: the link to the home page (the sales page
// at the bare address) or the showcase of every design (optionally for one kind of event, ?category=), in a message
// to send on WhatsApp (to a number, or picking the chat), through the phone's share menu, or to copy. The wording
// uses the price and business name from site/settings, which anyone may read.
//
// The admin writes as the business, to customers ("business"). A customer in the editor passes it on to a friend
// ("friend"). The dialog is built into the page the first time it opens, so both pages use this one copy of it.
import { salesSettings, whatsappLink, DEFAULT_CATEGORIES } from "./defaults.js";
import { SITE_URL } from "./firebase-config.js";
import { $, show, el, copyText } from "./admin-ui.js";

const VOICES = {
  business: {
    title: "Share your site",
    intro: "Send customers the link to your home page, or to the showcase of every design.",
    phone: "Customer's WhatsApp number (optional)",
    home: "Hi! 🙏 We make invitation websites in Tamil and English for weddings, housewarmings, birthdays and baby showers: " +
      "one link to share on WhatsApp, with your photos, music, directions and a guest book.\n\n" +
      "₹{price} per invitation. See the designs and order here: {link}",
    showcase: "Hi! 🙏 Here are all our invitation designs{for}. Tap any one to see it live: {link}\n\n" +
      "Each invitation is ₹{price}, in Tamil and English. Reply here to order yours.",
    signed: true
  },
  friend: {
    title: "Share with friends",
    intro: "Know someone with a wedding, birthday or housewarming coming up? Send them the home page, or every design to choose from.",
    phone: "Their WhatsApp number (optional)",
    home: "Hi! 🙏 I made my invitation as a website{with}, in Tamil and English: one link to share on WhatsApp, " +
      "with photos, music, directions and a guest book.\n\n" +
      "₹{price} per invitation. See the designs and order here: {link}",
    showcase: "Hi! 🙏 Here are all the invitation designs{for}{from}. Tap any one to see it live: {link}\n\n" +
      "Each invitation is ₹{price}, in Tamil and English, and you can order the one you like from there.",
    signed: false
  }
};

// Fixed markup only: the voice's wording goes in with textContent.
const SHARE_MARKUP = `
  <h2 id="shareTitle"></h2>
  <p class="muted" id="shareIntro"></p>
  <div class="seg share-pages" role="group" aria-label="Page to share">
    <button type="button" data-page="home" aria-pressed="true">Home page</button>
    <button type="button" data-page="showcase" aria-pressed="false">Showcase</button>
  </div>
  <label class="field" id="shareCategoryRow" hidden><span>Designs for</span><select id="shareCategory"></select></label>
  <div class="share-link">
    <input type="text" id="shareLink" readonly aria-label="Link">
    <button type="button" class="btn ghost small" id="shareCopyLink">Copy link</button>
  </div>
  <label class="field"><span>Message</span><textarea id="shareMessage" class="share-message"></textarea>
    <small class="hint">Change it as you like; the link stays in it.</small></label>
  <label class="field"><span id="sharePhoneLabel"></span><input type="tel" id="sharePhone" placeholder="+91 90000 00000">
    <small class="hint">Leave it empty to pick the chat in WhatsApp.</small></label>
  <div class="row share-actions">
    <a class="btn primary" id="shareWhatsApp" target="_blank" rel="noopener">Send on WhatsApp</a>
    <button type="button" class="btn ghost" id="shareNative" hidden>More apps…</button>
    <button type="button" class="btn ghost" id="shareCopyMessage">Copy message</button>
    <button type="button" class="btn ghost" id="shareClose">Close</button>
  </div>`;

const share = { voice: null, page: "home", category: "", link: "", edited: false, sales: salesSettings() };

const shareLinkFor = (page, category) => page === "home" ? SITE_URL
  : `${SITE_URL}/showcase` + (category ? `?category=${encodeURIComponent(category)}` : "");

function shareMessageFor(){
  const cat = DEFAULT_CATEGORIES.find(c => c.id === share.category);
  const business = share.sales.businessName;
  const text = share.voice[share.page]
    .replace("{for}", cat ? ` for ${cat.name.toLowerCase()}` : "")
    .replace("{with}", business ? ` with ${business}` : "")
    .replace("{from}", business ? ` from ${business}` : "")
    .replace("{price}", share.sales.price)
    .replace("{link}", share.link);
  return share.voice.signed && business ? `${text}\n\n— ${business}` : text;
}

// A wa.me link: to the number when one is typed, otherwise WhatsApp asks which chat.
const shareWhatsApp = text => whatsappLink($("sharePhone").value, text) || "https://wa.me/?text=" + encodeURIComponent(text);

function refreshShare(){
  const before = share.link;
  share.link = shareLinkFor(share.page, share.category);
  $("shareLink").value = share.link;
  document.querySelectorAll(".share-pages button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.page === share.page)));
  show("shareCategoryRow", share.page === "showcase");
  // Keep the sender's own wording; only swap the link inside it.
  const box = $("shareMessage");
  if(!share.edited) box.value = shareMessageFor();
  else if(before && before !== share.link) box.value = box.value.split(before).join(share.link);
  $("shareWhatsApp").href = shareWhatsApp(box.value);
}

function buildShare(voice){
  share.voice = VOICES[voice] || VOICES.business;
  const dialog = el("dialog", "share-dialog");
  dialog.id = "shareDialog";
  dialog.setAttribute("aria-labelledby", "shareTitle");
  dialog.innerHTML = SHARE_MARKUP;
  document.body.append(dialog);
  $("shareTitle").textContent = share.voice.title;
  $("shareIntro").textContent = share.voice.intro;
  $("sharePhoneLabel").textContent = share.voice.phone;

  $("shareCategory").replaceChildren(Object.assign(el("option", "", "All kinds of events"), { value: "" }),
    ...DEFAULT_CATEGORIES.map(c => Object.assign(el("option", "", c.name), { value: c.id })));
  document.querySelectorAll(".share-pages button").forEach(b => b.addEventListener("click", () => { share.page = b.dataset.page; refreshShare(); }));
  $("shareCategory").addEventListener("change", e => { share.category = e.target.value; refreshShare(); });
  $("shareMessage").addEventListener("input", () => { share.edited = true; $("shareWhatsApp").href = shareWhatsApp($("shareMessage").value); });
  $("sharePhone").addEventListener("input", () => { $("shareWhatsApp").href = shareWhatsApp($("shareMessage").value); });
  $("shareCopyLink").addEventListener("click", () => copyText(share.link, "Link copied."));
  $("shareCopyMessage").addEventListener("click", () => copyText($("shareMessage").value, "Message copied."));
  $("shareClose").addEventListener("click", () => dialog.close());
  // The phone's own share menu (WhatsApp, Instagram, SMS…), where the browser has one.
  if(navigator.share){
    show("shareNative");
    $("shareNative").addEventListener("click", () =>
      navigator.share({ title: share.sales.businessName || "Invitations", text: $("shareMessage").value }).catch(() => {}));
  }
}

// mod: the page's Firebase module (firebase.js for the admin, editor-firebase.js for an editor).
export async function openShare(mod, voice = "business"){
  if(!share.voice) buildShare(voice);
  try {
    const snap = await mod.getDoc(mod.doc(mod.db, "site", "settings"));
    share.sales = salesSettings(snap.exists() ? snap.data() : {});
  } catch(e){
    console.warn("Couldn't load the settings for the share message.", e);
  }
  share.edited = false;
  refreshShare();
  $("shareDialog").showModal();
}
