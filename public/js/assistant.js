// The assistant: a small chat at the bottom right of the admin, editor, home and showcase pages. It answers questions
// about the page it is on and offers one-tap shortcuts to the right section, view or tab. It is Gemini through
// Firebase AI Logic, as in translate.js, in a Firebase app of its own (no sign-in, no database) that loads the first
// time someone asks. What it knows about each page is in assistant-guide.js. It is told only that guide, the public
// sales details from Settings and where on the page the person is: never the admin's lists or an invitation's details.
// The conversation is kept for the tab (sessionStorage), so a reload doesn't lose it.
import { firebaseConfig, isFirebaseConfigured, useEmulator, EMULATOR } from "./firebase-config.js";
import { salesSettings, whatsappLink } from "./defaults.js";
import { GUIDES, PRODUCT, previewDesign } from "./assistant-guide.js";
import { cornerDock } from "./scroll-top.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
// The fast model has the most room on the free tier. "-latest" follows Google's newest; the pinned name is the fallback.
const MODELS = ["gemini-flash-lite-latest", "gemini-2.5-flash-lite"];
const MAX_TURNS = 10;       // questions and answers sent back with each question; older ones are left out
const MAX_QUESTION = 600;   // characters

const el = (tag, className, text) => {
  const n = document.createElement(tag);
  if(className) n.className = className;
  if(text !== undefined) n.textContent = text;
  return n;
};
const SVG_NS = "http://www.w3.org/2000/svg";
function icon(paths, { fill = false } = {}){
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if(fill) svg.setAttribute("class", "fill");
  for(const d of [].concat(paths)){
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}
const ICONS = {
  sparkle: ["M11 3c.6 4.4 2.4 6.4 7 7-4.6.6-6.4 2.6-7 7-.6-4.4-2.4-6.4-7-7 4.6-.6 6.4-2.6 7-7z",
    "M18.5 14.5c.25 1.6.9 2.3 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.2 2.25-.9 2.5-2.5z"],
  close: "M6 6l12 12M18 6 6 18",
  down: "M6 9.5l6 6 6-6",
  send: ["M12 19V5.5", "M6 11.5 12 5.5l6 6"],
  restart: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3", "M4.5 4.5v4h4"],
  go: ["M5 12h14", "M13 6l6 6-6 6"]
};
const narrow = () => matchMedia("(max-width: 599.98px)").matches;
const store = {
  get(k){ try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v){ try { sessionStorage.setItem(k, v); } catch {} },
  del(k){ try { sessionStorage.removeItem(k); } catch {} }
};

let guide = null, page = "", messages = [], busy = false;
let launch, panel, log, form, input, sendBtn;
const STORE_KEY = () => "wi:assistant:" + page;

/** Adds the assistant to this page. `name` is "home", "showcase", "admin" or "editor" (see assistant-guide.js). */
export function startAssistant(name){
  if(guide || !GUIDES[name] || !isFirebaseConfigured || window.self !== window.top) return;
  guide = GUIDES[name];
  page = name;
  try { messages = JSON.parse(store.get(STORE_KEY()) || "[]").filter(m => m && typeof m.text === "string"); }
  catch { messages = []; }
  // Its stylesheet first, so the button never shows unstyled.
  const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: new URL("../css/assistant.css", import.meta.url).href });
  css.addEventListener("load", build, { once: true });
  document.head.append(css);
}

/* ---------------------------------- the panel ---------------------------------- */
function build(){
  launch = el("button", "ai-launch");
  launch.type = "button";
  launch.setAttribute("aria-controls", "aiPanel");
  launch.setAttribute("aria-expanded", "false");
  launch.title = "Ask the assistant about this page";
  launch.append(icon(ICONS.sparkle, { fill: true }), el("span", "ai-launch-text", "Ask AI"), icon(ICONS.down));
  launch.addEventListener("click", () => panel.hidden ? openPanel() : closePanel());
  cornerDock().append(launch);

  panel = el("section", "ai-panel");
  panel.id = "aiPanel";
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "aiTitle");

  const head = el("header", "ai-head");
  const avatar = el("span", "ai-avatar");
  avatar.append(icon(ICONS.sparkle, { fill: true }));
  const titles = el("div", "ai-titles");
  const title = el("h2", "ai-title", "Assistant");
  title.id = "aiTitle";
  titles.append(title, el("p", "ai-sub", `Help with the ${guide.name.toLowerCase()}`));
  const restart = iconButton(ICONS.restart, "Start a new chat", () => { resetChat(); input.focus(); });
  const close = iconButton(ICONS.close, "Close", () => closePanel());
  head.append(avatar, titles, restart, close);

  log = el("div", "ai-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");

  form = el("form", "ai-form");
  input = el("textarea", "ai-input");
  Object.assign(input, { rows: 1, maxLength: MAX_QUESTION, placeholder: "Ask about this page…" });
  input.setAttribute("aria-label", "Your question");
  input.setAttribute("enterkeyhint", "send");
  sendBtn = el("button", "ai-send");
  sendBtn.type = "submit";
  sendBtn.setAttribute("aria-label", "Send");
  sendBtn.append(icon(ICONS.send));
  form.append(input, sendBtn);
  form.addEventListener("submit", e => { e.preventDefault(); ask(input.value); });
  // Enter sends; Shift+Enter starts a new line.
  input.addEventListener("keydown", e => {
    if(e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); ask(input.value); }
  });
  input.addEventListener("input", () => { grow(); sendBtn.disabled = busy || !input.value.trim(); });

  const note = el("p", "ai-note", "AI answers can be wrong. Please don't type personal details.");
  panel.append(head, log, form, note);
  panel.addEventListener("keydown", e => { if(e.key === "Escape"){ e.stopPropagation(); closePanel(); } });
  document.body.append(panel);

  // On phones the panel fills the screen above the keyboard, which only the visual viewport knows about.
  const vv = window.visualViewport;
  const fit = () => {
    if(!vv || panel.hidden) return;
    panel.style.setProperty("--vv-h", vv.height + "px");
    panel.style.setProperty("--vv-top", vv.offsetTop + "px");
  };
  vv?.addEventListener("resize", fit);
  vv?.addEventListener("scroll", fit);
  panel.fit = fit;

  drawChat();
  requestAnimationFrame(() => launch.classList.add("in"));
}

function iconButton(paths, label, onClick){
  const b = el("button", "ai-icon");
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.append(icon(paths));
  b.addEventListener("click", onClick);
  return b;
}

function openPanel(){
  panel.hidden = false;
  panel.fit();
  document.documentElement.classList.add("ai-open");
  launch.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => panel.classList.add("open"));
  log.scrollTop = log.scrollHeight;
  // A phone's keyboard would cover the answers, so it opens only when they tap the box.
  if(matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });
  else panel.focus({ preventScroll: true });
}

function closePanel(){
  if(panel.hidden) return;
  const hadFocus = panel.contains(document.activeElement);
  panel.classList.remove("open");
  document.documentElement.classList.remove("ai-open");
  launch.setAttribute("aria-expanded", "false");
  const done = () => { if(!panel.classList.contains("open")) panel.hidden = true; };
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) done();
  else setTimeout(done, 200);
  if(hadFocus) launch.focus();
}

// The text box grows with the question, up to about five lines.
function grow(){
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
}

/* ---------------------------------- the chat ---------------------------------- */
function drawChat(){
  log.replaceChildren(bubble("bot", guide.greeting));
  if(!messages.length){
    const chips = el("div", "ai-suggest");
    for(const q of guide.suggestions){
      const b = el("button", "", q);
      b.type = "button";
      b.addEventListener("click", () => ask(q));
      chips.append(b);
    }
    log.append(chips);
  }
  for(const m of messages){
    if(m.role === "user") log.append(bubble("me", m.text));
    else { const b = bubble("bot", ""); showReply(b, m.text, true); log.append(b); }
  }
  sendBtn.disabled = !input.value.trim();
}

function resetChat(){
  if(busy) return;
  messages = [];
  store.del(STORE_KEY());
  drawChat();
}

function bubble(who, text){
  const b = el("div", "ai-msg " + who);
  if(who === "bot") b.append(...format(text, true));
  else b.textContent = text;
  return b;
}

async function ask(raw){
  const question = String(raw || "").trim().slice(0, MAX_QUESTION);
  if(!question || busy) return;
  busy = true;
  sendBtn.disabled = true;
  input.value = "";
  grow();
  log.querySelector(".ai-suggest")?.remove();
  messages.push({ role: "user", text: question });
  log.append(bubble("me", question));
  const reply = el("div", "ai-msg bot");
  reply.append(typing());
  log.append(reply);
  log.setAttribute("aria-busy", "true");
  log.scrollTop = log.scrollHeight;
  try {
    const text = await answer(partial => { showReply(reply, partial, false); follow(); });
    messages.push({ role: "model", text });
    showReply(reply, text, true);
    store.set(STORE_KEY(), JSON.stringify(messages.slice(-MAX_TURNS * 2)));
  } catch(e){
    console.warn("The assistant couldn't answer.", e);
    // The question isn't kept, so asking again doesn't send it twice; it goes back in the box to try again.
    messages.pop();
    if(!input.value) input.value = question;
    reply.classList.add("error");
    reply.replaceChildren(el("p", "", problem(e)));
  } finally {
    busy = false;
    log.removeAttribute("aria-busy");
    sendBtn.disabled = !input.value.trim();
    follow();
  }
}

// Keeps the newest words in view while the answer streams in, unless the person has scrolled up to read.
function follow(){
  if(log.scrollHeight - log.scrollTop - log.clientHeight < 120) log.scrollTop = log.scrollHeight;
}

function typing(){
  const t = el("span", "ai-typing");
  t.setAttribute("aria-label", "Thinking");
  t.append(el("span"), el("span"), el("span"));
  return t;
}

function problem(e){
  const m = e?.message || "";
  if(/has not been used|is disabled|API_NOT_ENABLED|SERVICE_DISABLED|api-not-enabled|PERMISSION_DENIED|\b403\b/i.test(m))
    return page === "admin"
      ? "The assistant isn't switched on: turn on Firebase AI Logic (Gemini Developer API) in the Firebase console, as for Tamil translation."
      : "The assistant isn't available right now. Please try again later.";
  if(/\b429\b|quota|RESOURCE_EXHAUSTED|rate/i.test(m))
    return "Lots of questions right now. Please try again in a minute.";
  if(!navigator.onLine || /network|fetch|Failed to/i.test(m))
    return "I couldn't reach the assistant. Check your internet connection and try again.";
  return "Sorry, something went wrong. Please try again.";
}

/* ---------------------------------- formatting ---------------------------------- */
// Replies are plain text with **bold**, "- " lists, "1. " steps and [text](go:id) shortcuts, built into nodes with
// textContent only. While a reply streams in, a shortcut that has only half arrived waits for the rest.
function showReply(node, text, done){
  const shown = done ? text : text.replace(/\[[^\]\n]*(\]\([^)\n]*)?$/, "");
  if(!shown.trim()) return;
  node.replaceChildren(...format(shown, done));
}

function format(text, done){
  const out = [];
  let list = null;
  for(const raw of text.replace(/`([^`]*)`/g, "$1").split("\n")){
    const line = raw.trim();
    if(!line){ list = null; continue; }
    const item = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
    if(item){
      const ordered = !!item[1];
      if(!list || (list.tagName === "OL") !== ordered){
        list = el(ordered ? "ol" : "ul");
        if(ordered && item[1] !== "1") list.start = Number(item[1]);
        out.push(list);
      }
      const li = el("li");
      li.append(...inline(item[2], done));
      list.append(li);
      continue;
    }
    list = null;
    const p = el("p");
    p.append(...inline(line.replace(/^#{1,6}\s+/, ""), done));
    out.push(p);
  }
  return out;
}

function inline(s, done){
  const parts = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(go:([a-z0-9:-]+)\)|\[([^\]]+)\]\([^)]*\)/g;
  let last = 0, m;
  while((m = re.exec(s))){
    if(m.index > last) parts.push(plain(s.slice(last, m.index)));
    if(m[1]) parts.push(el("b", "", plain(m[1])));
    else if(m[2]) parts.push((done && shortcut(m[2], m[3])) || plain(m[2]));
    else parts.push(plain(m[4]));   // any other link: just its words
    last = re.lastIndex;
  }
  if(last < s.length) parts.push(plain(s.slice(last)));
  return parts;
}
const plain = s => s.replace(/\*\*?|__/g, "");

// A one-tap shortcut to a place on this page, when it can be used right now.
function shortcut(label, id){
  const place = placeFor(id);
  if(!place || !place.when()) return null;
  const b = el("button", "ai-go");
  b.type = "button";
  b.append(el("span", "", plain(label)), icon(ICONS.go));
  b.addEventListener("click", () => {
    // A phone's panel covers the page, so it gets out of the way.
    if(narrow()) closePanel();
    try { place.run(); } catch(e){ console.warn("That shortcut didn't work.", e); }
  });
  return b;
}

function placeFor(id){
  if(guide.places[id]) return guide.places[id];
  if(extraPlaces[id]) return extraPlaces[id];
  const design = /^preview:([a-z0-9-]+)$/.exec(id)?.[1];
  if(design && designs.some(d => d.id === design)) return { when: () => true, run: () => previewDesign(design) };
  return null;
}

/* ----------------------------------- Gemini ----------------------------------- */
let ai = null, modelIndex = 0, system = null, designs = [];
const models = {};
// Shortcuts that need Settings: on the editor page, a WhatsApp message to the business asking for help.
const extraPlaces = {};
const isModelMissing = e => /\b404\b|not found|is not supported|unsupported model/i.test(e?.message || "");
const isBusy = e => /\b(500|502|503|504)\b|high demand|overloaded|unavailable/i.test(e?.message || "");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function model(){
  if(!ai){
    const [{ initializeApp, getApps }, sdk] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-ai.js")]);
    const app = getApps().find(a => a.name === "assistant") || initializeApp(firebaseConfig, "assistant");
    ai = { sdk, ai: sdk.getAI(app, { backend: new sdk.GoogleAIBackend() }) };
  }
  system ||= await instructions();
  const name = MODELS[modelIndex];
  return models[name] ||= ai.sdk.getGenerativeModel(ai.ai, {
    model: name,
    systemInstruction: system,
    generationConfig: { temperature: 0.3, maxOutputTokens: 900 }
  });
}

// Streams the answer to the last question, calling onText with the text so far. Where the person is on the page
// goes in front of the question, so the answer can fit what they are looking at.
async function answer(onText){
  let history = messages.slice(-MAX_TURNS * 2);
  while(history.length && history[0].role !== "user") history = history.slice(1);
  const where = guide.where?.() || "";
  const contents = history.map((m, i) => ({
    role: m.role,
    parts: [{ text: i === history.length - 1 && where ? `[Where I am: ${where}]\n${m.text}` : m.text }]
  }));
  for(let attempt = 0; ; attempt++){
    let text = "";
    try {
      const result = await (await model()).generateContentStream({ contents });
      for await (const chunk of result.stream){
        try { text += chunk.text(); } catch {}
        onText(text);
      }
      if(!text.trim()) throw new Error("The assistant sent an empty reply.");
      return text.trim();
    } catch(e){
      if(text) throw e;   // half an answer arrived: don't start it again
      if(isModelMissing(e) && modelIndex < MODELS.length - 1){ modelIndex++; continue; }
      if(isBusy(e) && attempt < 2){ await sleep(1200 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

// The assistant's instructions: how to answer, then what it knows about the product and this page.
async function instructions(){
  const [s, list] = await Promise.all([readSettings(), page === "home" || page === "showcase" ? readDesigns() : []]);
  designs = list;
  const business = s.businessName || "Online Invitations";
  const fill = t => t.replace(/\{business\}/g, business).replace(/\{price\}/g, Number(s.price).toLocaleString("en-IN"));
  const unsure = page === "admin"
    ? "say so plainly; PRODUCT.md and SETUP.md in the project describe everything"
    : `say you aren't sure and suggest asking ${business} on WhatsApp`;
  const chat = page === "editor" && whatsappLink(s.whatsapp, "Hi! I need help with my invitation.");
  if(chat) extraPlaces.whatsapp = { does: `opens WhatsApp with a message to ${business} asking for help`,
    when: () => true, run: () => window.open(chat, "_blank", "noopener") };
  const places = Object.entries({ ...guide.places, ...extraPlaces }).map(([id, p]) => `- go:${id}: ${p.does}`);
  if(designs.length) places.push("- go:preview:<design id>: opens a live preview of that design with sample details. " +
    "When you suggest particular designs, offer their previews, like [Preview Web Hero](go:preview:web-hero)");
  return [
    `You are the friendly assistant on the ${guide.name.toLowerCase()} of ${business}'s website. Help the person understand this page and find their way around it.
- Answer only questions about this website, its pages and the invitations. For anything else, say in one sentence that you can only help with the invitations.
- Use only the facts below. Never make up features, prices, dates, designs or policies. If the answer isn't here, ${unsure}.
- Be short: one to four sentences, or up to six short numbered steps. Name buttons, tabs and sections exactly as they appear on the page, in **bold**.
- Language: look only at the person's latest message. If it is in Tamil script, reply in Tamil script. If it is Tamil typed in English letters (like "evlo price"), reply the same way. Otherwise reply in English. Keep button, tab and section names in English, as they appear on the page.
- When going somewhere would help, end with one or two shortcuts on their own line, like [Open Settings](go:settings). Use only the ids under SHORTCUTS, and no other links or web addresses.
- Write plain sentences with **bold**, "- " bullets and "1. " steps only. No headings, tables, emojis or code.
- Never ask for or repeat PINs, phone numbers, payment details or other personal details.
- A question may start with [Where I am: …], saying where the person is on the page. Use it to fit the answer; don't repeat it.`,
    fill(PRODUCT),
    fill(guide.about),
    designs.length && "DESIGNS (id: name, kind of event: look)\n" +
      designs.map(d => `- ${d.id}: ${d.name}, ${d.category}: ${d.description || ""}`).join("\n"),
    "SHORTCUTS\n" + places.join("\n")
  ].filter(Boolean).join("\n\n");
}

// The public sales details from Settings (site/settings), read through the REST API as site.js does.
async function readSettings(){
  const base = useEmulator ? `http://${EMULATOR.host}:${EMULATOR.firestorePort}/v1` : "https://firestore.googleapis.com/v1";
  const value = v => v?.stringValue ?? (v?.integerValue !== undefined ? Number(v.integerValue) : v?.doubleValue ?? "");
  try {
    const r = await fetch(`${base}/projects/${firebaseConfig.projectId}/databases/(default)/documents/site/settings`);
    if(!r.ok) return salesSettings();
    const fields = (await r.json()).fields || {};
    return salesSettings(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, value(v)])));
  } catch {
    return salesSettings();
  }
}

// Every design customers can choose: Classic and the starters (as on the home page and the showcase).
async function readDesigns(){
  let starters = [];
  try { starters = await (await fetch(new URL("../templates/starters.json", import.meta.url))).json(); } catch {}
  return [{ id: "classic", name: "Classic Maroon & Gold", category: "wedding",
    description: "A curtain that opens, gold corners and falling petals." }, ...starters];
}
