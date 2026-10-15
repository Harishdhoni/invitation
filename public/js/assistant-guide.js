// What the assistant (js/assistant.js) knows about each page it is on, and the places on that page it can take
// people to. Keep this in step with the pages: button, tab and section names are quoted exactly, because the
// assistant tells people what to tap. PRODUCT.md is the longer description these are written from.
//   about        the page, explained for the model
//   greeting     the first message, shown before anything is asked (nothing is sent until then)
//   suggestions  questions offered as one-tap chips under the greeting
//   places       id -> { does, run(), when() }: shortcuts the model may offer as [text](go:id). `does` tells the
//                model what it does; `when` says whether it can be used right now (a chip is left out otherwise)
//   where()      a short note on where on the page the person is, sent with each question. Only the page's own
//                labels: never names, phone numbers or other details from the admin's lists or an invitation
import { smoothScroll } from "./smooth-scroll.js";

const $ = sel => document.querySelector(sel);
const shown = node => !!node && node.getClientRects().length > 0;
const text = node => (node?.textContent || "").replace(/\s+/g, " ").trim();

// Scrolls a section of the home page or showcase to just under the sticky header.
async function scrollToSection(sel){
  const node = $(sel);
  if(!node) return;
  const lenis = await smoothScroll();
  const head = $(".site-head")?.offsetHeight || 0;
  if(lenis) lenis.scrollTo(node, { offset: -head });
  else node.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

// Shortcut makers.
const section = (sel, does) => ({ does, run: () => scrollToSection(sel), when: () => !!$(sel) });
const press = (sel, does) => ({ does, run: () => $(sel).click(), when: () => shown($(sel)) });
const openPage = (url, does) => ({ does, run: () => window.open(url, "_blank", "noopener"), when: () => true });
const goPage = (url, does) => ({ does, run: () => { location.href = url; }, when: () => true });

// The section of a home or showcase page that is in the middle of the screen, by its heading.
function sectionInView(){
  const mid = innerHeight * 0.45;
  const box = [...document.querySelectorAll("body > section")]
    .find(s => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; });
  return text(box?.querySelector("h1, h2"));
}

// The kinds of event the home page and showcase sort designs by, with their chips.
const CATEGORY_PLACES = {
  "category:wedding": "shows only the wedding designs",
  "category:housewarming": "shows only the housewarming designs",
  "category:birthday": "shows only the birthday designs",
  "category:baby-shower": "shows only the baby shower designs",
  "category:engagement": "shows only the engagement designs",
  "category:all": "shows every design again"
};
function categoryPlaces(box){
  return Object.fromEntries(Object.entries(CATEGORY_PLACES).map(([id, does]) => {
    const kind = id.slice("category:".length);
    const chip = () => $(`${box} .chip[data-category="${kind === "all" ? "" : kind}"]`);
    return [id, { does, when: () => !!chip(), run: async () => { chip().click(); await scrollToSection(box); } }];
  }));
}

// A live preview of one design with sample details: the page's own Preview link (the showcase opens it in its
// phone frame on a computer), or the design in a new tab when it isn't listed at the moment.
export function previewDesign(id){
  const link = $(`#showcase .tour-actions a[href="./?template=${id}"], #gallery a.design[href="./?template=${id}"]`);
  if(shown(link)) link.click();
  else window.open(`./?template=${id}`, "_blank", "noopener");
}

/* ------------------------------ for every page ------------------------------ */
// The facts every page's assistant can use. {price} and {business} are filled in from Settings.
export const PRODUCT = `ABOUT THE PRODUCT
{business} makes invitation websites in Tamil and English for weddings, engagements (Nichayathartham), housewarmings (Gruhapravesam), birthdays and baby showers (including Valaikappu). Each invitation is one link, shared on WhatsApp, that opens a designed page in any phone's browser. Guests install nothing.

What guests get on every invitation:
- An opening animation they tap (curtains, temple doors, an envelope, a cake candle and so on). The family's song starts with it.
- The names, an optional cover photo, a message, and a date line.
- Every ceremony (for example Reception and Muhurtham) with its date, time, venue, address and a Get Directions button to Google Maps.
- A live countdown to the main date and time (India time).
- A guest book where guests leave wishes. The family can hide or delete any wish.
- A help message for out-of-town guests and tap-to-call numbers of the family's contacts.
- An EN / தமிழ் switch: every text is in English and Tamil.
- When the link is shared on WhatsApp, the preview shows the names, the date line and the cover photo.

What the customer does:
- They message {business} on WhatsApp. They get their own editor link and an 8-character PIN (like ABCD-EFGH). Only someone with the PIN can change the invitation.
- In the editor they type in English and the Tamil fills in by itself (names and places are written in Tamil script). They add a photo, cut the part of a song they want, add every ceremony, pick a design, and preview exactly what guests will see.
- They can make up to 3 links for the same invitation, each in its own design, and choose what each link shows (for example a link for friends without the family's phone numbers).
- They pay ₹{price} by UPI after filling it in and previewing it, and send the payment screenshot on WhatsApp. Once {business} confirms the payment, the link opens to guests.
- They can change anything at any time; guests see the change the next time they open the link. A change of design can take about 5 minutes to reach everyone.

Rules and limits:
- Price: ₹{price} per invitation, any design, any kind of event.
- The link stays open to guests until 15 days after the event's date. {business} can keep it open longer on request.
- The link name (like arjun-meera) can't be changed once it is made.
- Photos: JPG, PNG or WebP. iPhone HEIC photos can't be read: send the photo to yourself on WhatsApp first, which turns it into a JPG. One cover photo (there is no photo gallery).
- Music: a song file up to 60 MB; the saved clip is up to 10 MB (3–5 MB loads best on phones).
- Only English and Tamil. There is no RSVP, headcount or guest list.
- Privacy: only people with the link can open an invitation; it isn't listed anywhere. Photos, music and wishes are deleted about 3 months after the invitation closes.

The site's pages: the home page (what you get, the designs, the price, how to order), the showcase (every design with a live preview), help (how to fill in the invitation step by step), terms, privacy, refunds and contact.`;

/* -------------------------------- home page -------------------------------- */
const home = {
  name: "Home page",
  greeting: "Hi! I can tell you what an invitation website includes, help you find a design, and explain how ordering works. You can ask in English or தமிழ்.",
  suggestions: ["What do my guests get?", "How much does it cost?", "How do I order one?", "Show me the birthday designs"],
  about: `THIS PAGE: the home page, the sales page for visitors thinking of buying an invitation.
From the top: the header (Designs, Pricing, FAQ, Showcase, and an Order now button), the hero with "Order on WhatsApp" and "See the designs", "What you get" (eight features), "Designs" (every design with category chips: All designs, Weddings, Housewarmings, Birthdays, Baby Showers, Engagements; tapping a design opens it live with sample details), "Pricing" (one price per invitation and what it includes), "How it works" (three steps: message us on WhatsApp, fill it in and preview, pay and share), "Questions" (FAQ) and a last "Order on WhatsApp" button. The footer links to Showcase, Help, Terms, Privacy, Refunds and Contact.
Ordering always happens on WhatsApp: the Order buttons open a chat with {business} with a message already typed.`,
  places: {
    designs: section("#designs", "scrolls to the designs"),
    ...categoryPlaces("#gallery"),
    features: section("#features", "scrolls to what you get"),
    pricing: section("#pricing", "scrolls to the price and what it includes"),
    how: section("#how", "scrolls to the three steps"),
    faq: section("#faq", "scrolls to the questions and answers"),
    order: press(".hero a[data-whatsapp]", "opens WhatsApp to order, with a message ready"),
    showcase: goPage("showcase.html", "opens the showcase: every design with a live preview"),
    help: goPage("help.html", "opens the step-by-step help for filling in an invitation"),
    contact: goPage("contact.html", "opens the contact page")
  },
  where: () => {
    const at = sectionInView();
    const kind = text($("#gallery .chip[aria-pressed=true] span"));
    return [at && `looking at the "${at}" part`, kind && `designs shown: ${kind}`].filter(Boolean).join("; ");
  }
};

/* -------------------------------- showcase -------------------------------- */
const showcase = {
  name: "Showcase",
  greeting: "Hi! I can help you find a design for your event, open a live preview, and explain what you can change yourself. You can ask in English or தமிழ்.",
  suggestions: ["Which design suits a temple wedding?", "Show me the baby shower designs", "What can I change myself?", "How do I pay?"],
  about: `THIS PAGE: the showcase, the page to share with anyone who wants to know what the invitations are. It shows every design.
From the top: the header (Home, For guests, Designs, Pricing, Order now), a hero with counts and "See every design", "What your guests see" (a sample WhatsApp chat and the four steps of opening an invitation), "Designs" (category chips: All designs, Weddings, Housewarmings, Birthdays, Baby Showers, Engagements; each design has a picture, Preview and Choose), "What you can do" (what the customer changes themselves in the editor), "How it works" (four steps: message us on WhatsApp, get your editor link, fill it in and preview, pay and share) with the price card, "Questions", and a last "Order on WhatsApp" button.
Preview opens the design live with sample details (beside its details on a computer, the full page on a phone; full screen shows the opening animation and the தமிழ் switch). Choose opens WhatsApp with a message naming that design. The design can be changed later; the details stay.`,
  places: {
    guests: section("#guests", "scrolls to what guests see"),
    designs: section("#designs", "scrolls to the designs"),
    ...categoryPlaces("#showcase"),
    editor: section("#editor", "scrolls to what the customer can change themselves"),
    pricing: section("#pricing", "scrolls to the steps and the price"),
    faq: section("#faq", "scrolls to the questions and answers"),
    order: press(".tour-hero a[data-whatsapp]", "opens WhatsApp to order, with a message ready"),
    home: goPage("home.html", "opens the home page"),
    help: goPage("help.html", "opens the step-by-step help for filling in an invitation"),
    contact: goPage("contact.html", "opens the contact page")
  },
  where: () => {
    const at = sectionInView();
    const kind = text($("#showcase .chip[aria-pressed=true] span"));
    const open = $("#designPreview")?.open ? text($("#previewName")) : "";
    return [open ? `has the live preview of "${open}" open` : at && `looking at the "${at}" part`,
      kind && `designs shown: ${kind}`].filter(Boolean).join("; ");
  }
};

/* ------------------------- the event editor (shared) ------------------------- */
// The tabs of the event editor, the same for the admin and the customer.
const TABS = {
  details: "Couple & Hero (called Names & Hero for other kinds of event)",
  photos: "Photos & Music", events: "Events", contacts: "Help & Contacts", design: "Design", links: "Links", wishes: "Wishes"
};
const tabPlaces = () => Object.fromEntries(Object.entries(TABS).map(([id, name]) =>
  [`tab:${id}`, press(`#editorView:not([hidden]) .tab[data-tab="${id}"]`, `opens the ${name} tab of the event editor`)]));
const currentTab = () => {
  const tab = $("#editorView:not([hidden]) .tab.active");
  return tab ? TABS[tab.dataset.tab] || text(tab) : "";
};

const EDITOR_TABS = `The event editor has these tabs:
- Couple & Hero (Names & Hero for other kinds of event): the names, an optional title, the main date and time (the countdown counts to it), the date line, a message (tagline), a hashtag and the opening verse.
- Photos & Music: the cover photo, the deity or emblem picture, and the song. Choose a song, drag the gold handles on the waveform to the part you want (or type the seconds), tap Preview, optionally fade in and out, then Use this clip.
- Events: each ceremony with its name, date, time, venue, address, a description, and a Google Maps link or search text (that gives guests the Get Directions button), with an emoji or picture icon. Add, reorder or remove ceremonies.
- Help & Contacts: a message for guests travelling from out of town, and the people guests can call, each with any number of phone numbers.
- Design: the design for this event, chosen from the designs for its kind of event. "Preview this event in the selected template" shows the event's own details in it.
- Links: the event link and any extra links. For each link: whether guests can open it now and until when, what it shows ("Show on this link": cover photo, events, countdown, guest book, help message, contact numbers, music), its design (extra links), Copy link and Open. "＋ Add another link" makes another link to the same invitation in another design (up to 3 links in all for customers). Every link shares the same details, photos, music and guest book.
- Wishes: every wish from the guest book. Hide (Show brings it back) or Delete; that happens straight away.
Typing in an English box fills the Tamil box about a second later. A Tamil box changed by hand is kept until "↻ Translate again". "அ Fill missing Tamil" in the bar at the bottom fills every empty Tamil box at once.
"Save changes" in the bar at the bottom (or Ctrl+S) saves; the bar says when there are unsaved changes, and the page asks before leaving with unsaved changes. Wishes are saved straight away.`;

/* -------------------------------- admin page -------------------------------- */
const admin = {
  name: "Admin",
  greeting: "Hi! Ask me how to do anything here: create an event, send a customer their PIN, record a payment, switch a link off, add designs or change your settings.",
  suggestions: ["How do I create a new event?", "How do I send a customer their PIN?", "How do I mark an invitation as paid?", "Why can't guests open a link?"],
  about: `THIS PAGE: the admin page, used only by the owner of {business}, who sells the invitations and runs every event.
The sidebar has Events, Templates and Settings, then the customer pages (Home page ↗ and Showcase ↗ open in a new tab) and Share, and at the foot Log out. On phones the sidebar opens with the menu button; on a computer its toggle folds it to icons.

EVENTS (the list): every event, upcoming first, then past ones. Above it: this month's takings, how many are waiting for payment and all-time takings; the status chips All / Unpaid / Open / Closed; a search box (names, link name, customer name or phone); category chips; and the buttons Export CSV (every invitation with its customer and payment, for the accounts), Clean up ended (deletes photos, music and wishes of invitations that closed more than 90 days ago) and "＋ New event".
"＋ New event": pick the category, type the name or names, pick a template, check the link name (suggested from the names; it can't be changed later), and optionally the customer's name, their WhatsApp number and "Already paid", then Create event. With a number, the editor PIN is made at once and WhatsApp opens on the customer's chat with the welcome message typed in; you tap Send. Unless "Already paid" is ticked, it starts Unpaid.
Each event card shows whether guests can open it now (Open, Unpaid, Off, Not open yet, Ended) and until when, its extra links, the customer and payment, and the buttons Edit, Copy link, Switch off / Switch on and Delete (type the link name to confirm; it removes the details, photos, music, wishes, extra links and PIN, and keeps the order for the accounts).
Payment: "Mark as paid" on the card (amount, method, reference, note) opens the link to guests; "Mark unpaid" undoes it.
Editor PIN panel on each card: create, change or revoke the PIN, "Copy details", and "Send on WhatsApp" when the customer's number is known. The message has the one-tap editor link, the PIN, the invitation link and, while unpaid, how to pay. Change or Revoke stops the old PIN at once, even for someone editing at that moment.
When guests can open a link: it must be paid and switched on, and between its start and end dates (India time). With no end date it closes 15 days after the event's main date, unless "No expiry" is ticked on the event link. An extra link is also closed whenever its event link is. Dates and the on/off switch are in the event's Links tab; only the admin can change them.

TEMPLATES: the designs, grouped by category, with a category dropdown. Each card has a thumbnail, which events use it, and Edit, Preview ↗, Copy link, Duplicate and Delete (not while an event uses it). "Add starter templates" adds shipped designs not added yet. "＋ New category" adds a kind of event (for example Naming Ceremony). The template editor has the name, category, description and the page's HTML (paste, type, upload or download a .html file), a live preview with sample details at phone or desktop size, a size meter and built-in hook help, then Save template. A change to a template reaches every event using it within about 5 minutes.

SETTINGS: business name (it also signs the end of every invitation), price per invitation, UPI ID, GPay / PhonePe number, WhatsApp number, support email, business address, and the WhatsApp message to new customers (with placeholders such as {customer}, {editorLink}, {pin} and {payment}; "Preview with sample details" shows it). Customers see these on the home page, in the editor and in that message. Then Save settings.

SHARE (sidebar): the link to the home page or the showcase (all designs or one kind of event) in a ready message, to send on WhatsApp, through the phone's share menu, or to copy.

EDITING AN EVENT (Edit on a card): the event editor, the same one customers use, plus the admin-only parts: the category (Design tab), "create template" links, and in the Links tab each link's "Open to guests" switch, Start date and End date, and "No expiry" on the event link. "← All events" goes back.
${EDITOR_TABS}`,
  places: {
    events: press("#navEvents", "opens the Events list"),
    "new-event": { does: "opens the New event form", when: () => true,
      // From another view, go to Events first (which may ask about unsaved changes, and may be cancelled).
      run: () => {
        if(!shown($("#newWeddingBtn"))) $("#navEvents").click();
        setTimeout(() => { if(shown($("#newWeddingBtn"))) $("#newWeddingBtn").click(); }, 50);
      } },
    templates: press("#navTemplates", "opens Templates"),
    settings: press("#navSettings", "opens Settings"),
    share: press("#shareOpenBtn", "opens the Share window"),
    "home-page": openPage("home.html", "opens the home page customers see, in a new tab"),
    showcase: openPage("showcase.html", "opens the showcase, in a new tab"),
    ...tabPlaces()
  },
  where: () => {
    if(shown($("#loginView"))) return "on the login form";
    const parts = [];
    if(shown($("#editorView"))) parts.push(`editing an event, on its "${currentTab()}" tab`);
    else if(shown($("#templateEditorView"))) parts.push("in the template editor");
    else parts.push(`on the ${text($(".side-nav a.active .side-text")) || "Events"} page`);
    if(shown($("#newWeddingForm"))) parts.push("the New event form is open");
    return parts.join("; ");
  }
};

/* -------------------------------- editor page -------------------------------- */
const editor = {
  name: "Editor",
  greeting: "Hi! I can help you fill in your invitation: where things are, how the Tamil works, adding your photo and song, and how to pay and share. Ask in English or தமிழ்.",
  suggestions: ["Where do I add my photo and song?", "How does the Tamil work?", "How do I pay and share my link?", "Can I hide our numbers on a link for friends?"],
  about: `THIS PAGE: the editor page, where a customer fills in their own invitation. It opens with their PIN.
Before the editor opens it asks for the PIN (8 letters and numbers, like ABCD-EFGH; case, spaces and dashes don't matter). The editor link sent on WhatsApp fills it in by itself. The browser remembers the PIN until the business changes it or the customer taps "Leave editor". If the PIN stops working, ask {business} for the current one.
In the editor: the invitation's name at the top with "View site ↗" (the customer's own preview, which works even before paying, with a note saying whether guests can see it yet) and Copy link. While unpaid, a banner says guests can open it once ₹{price} is paid, with "Pay ₹{price} by UPI" (opens GPay, PhonePe or any UPI app with the amount filled in), the UPI ID and "Send the payment screenshot on WhatsApp". Once {business} marks it paid, the link opens to guests.
The sidebar has Home page ↗ and Showcase ↗ (new tab), Share (send a friend the link to the home page or the showcase), and "Leave editor" at the foot. On phones it opens with the menu button.
What customers can't change themselves: the kind of event, and when a link opens or closes (on/off and dates). For those, and anything else, they can message {business} on WhatsApp.
${EDITOR_TABS}`,
  places: {
    ...tabPlaces(),
    "view-site": press("#viewSiteLink", "opens their own preview of the invitation in a new tab"),
    pay: press("#payBanner a.btn.primary", "opens a UPI app to pay, with the amount filled in"),
    share: press("#shareOpenBtn", "opens the Share window"),
    help: openPage("help.html", "opens the step-by-step help page in a new tab"),
    showcase: openPage("showcase.html", "opens every design in a new tab")
  },
  where: () => {
    if(shown($("#pinView"))) return "on the PIN screen (the editor isn't open yet)";
    const parts = [];
    if(shown($("#editorView"))) parts.push(`in the editor, on the "${currentTab()}" tab`);
    if(shown($("#payBanner"))) parts.push("the invitation isn't paid yet, so guests can't open it");
    return parts.join("; ");
  }
};

export const GUIDES = { home, showcase, admin, editor };
