// English -> Tamil translation for the admin page, using Gemini through
// Firebase AI Logic (Gemini Developer API backend, free tier on the Spark plan).
// Enable once: Firebase console > AI Logic > Get started > Gemini Developer API.
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js";
import { app } from "./firebase.js";

// Short fields (names, dates, venues) use the fast model; long text uses the full
// model, whose Tamil prose is noticeably more natural. "-latest" aliases follow
// Google's newest models so the page survives version retirements; the pinned
// names are fallbacks.
const TIERS = {
  fast: ["gemini-flash-lite-latest", "gemini-2.5-flash-lite"],
  quality: ["gemini-flash-latest", "gemini-2.5-flash"]
};
// Latin letters glued to Tamil letters, e.g. "இணைnகள்" — a known fast-model slip.
const MIXED_SCRIPT = /[஀-௿][A-Za-z]|[A-Za-z][஀-௿]/;

const SYSTEM = `You translate short English text from a Tamil Hindu wedding invitation website into natural, warm, respectful Tamil (as used in Tamil Nadu).
Rules:
- Transliterate, do not translate, personal names, temple / hall / venue names, and area or city names into Tamil script. Examples: "Sri Lakshmi Mahal" -> "ஸ்ரீ லட்சுமி மஹால்", "Anna Nagar, Chennai" -> "அண்ணா நகர், சென்னை", "Karthik" -> "கார்த்திக்".
- Use the usual Tamil wedding words: Wedding -> திருமணம், Muhurtham -> முகூர்த்தம், Reception -> வரவேற்பு, Engagement / Nichayathartham -> நிச்சயதார்த்தம், Mehendi -> மெஹந்தி.
- Dates like "12th February 2027" -> "12 பிப்ரவரி 2027". Times: "6:00 AM" -> "காலை 6:00", "6:30 PM onwards" -> "மாலை 6:30 மணி முதல்".
- Keep emojis, digits, phone numbers, PIN codes, URLs, hashtags, punctuation and line breaks exactly as they are.
- Reply with only the Tamil text. No quotes, notes, transliteration in English, or alternatives.
- When asked for a JSON array, reply with only that JSON array.`;

const ai = getAI(app, { backend: new GoogleAIBackend() });
const tierIndex = { fast: 0, quality: 0 };
const models = {};
const cache = new Map();
const cacheKey = (text, context) => context + "\u0000" + text;

function modelFor(tier, json){
  const name = TIERS[tier][tierIndex[tier]];
  return models[name + (json ? ":json" : "")] ||= getGenerativeModel(ai, {
    model: name,
    systemInstruction: SYSTEM,
    generationConfig: json ? { temperature: 0.2, responseMimeType: "application/json" } : { temperature: 0.2 }
  });
}

const isModelMissing = e => /\b404\b|not found|is not supported|unsupported model/i.test(e?.message || "");
// Google returns 500/503 "high demand" or 429 when a model is briefly overloaded.
const isBusy = e => /\b(429|500|502|503|504)\b|high demand|overloaded|unavailable|RESOURCE_EXHAUSTED/i.test(e?.message || "");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function generate(prompt, { tier = "fast", json = false } = {}){
  for(let attempt = 0; ; attempt++){
    try {
      return (await modelFor(tier, json).generateContent(prompt)).response.text().trim();
    } catch(e){
      if(isModelMissing(e) && tierIndex[tier] < TIERS[tier].length - 1){ tierIndex[tier]++; continue; }
      if(isBusy(e) && attempt < 2){ await sleep(1500 * (attempt + 1)); continue; }
      if(isBusy(e) && tier === "quality") return generate(prompt, { tier: "fast", json }); // still busy: use the fast model
      throw e;
    }
  }
}

/** Translate one field's English text to Tamil. `context` is the field label, e.g. "Event date". */
export async function toTamil(text, context = ""){
  const key = cacheKey(text, context);
  if(cache.has(key)) return cache.get(key);
  const prompt = `Field: ${context}\nEnglish:\n${text}`;
  const long = text.length > 80 || text.includes("\n");
  let out = await generate(prompt, { tier: long ? "quality" : "fast" });
  if(!long && MIXED_SCRIPT.test(out)) out = await generate(prompt, { tier: "quality" });
  cache.set(key, out);
  return out;
}

/** Translate several fields in one request. items: [{ text, context }] -> Tamil strings, same order. */
export async function toTamilBatch(items){
  const reply = await generate(
    `Translate each item's "text" into Tamil, following the rules. "context" says what the text is.\n` +
    `Return a JSON array of strings: the Tamil for each item, in the same order.\n\n${JSON.stringify(items)}`,
    { tier: "quality", json: true }
  );
  const arr = JSON.parse(reply);
  if(!Array.isArray(arr)) throw new Error("Unexpected translation reply");
  return items.map((it, i) => {
    const out = typeof arr[i] === "string" ? arr[i].trim() : "";
    if(out) cache.set(cacheKey(it.text, it.context), out);
    return out;
  });
}

/** Classify a failure so the admin page can show a useful message. */
export function translateErrorKind(e){
  const m = e?.message || "";
  if(/has not been used|is disabled|API_NOT_ENABLED|SERVICE_DISABLED|api-not-enabled|PERMISSION_DENIED|\b403\b/i.test(m)) return "not-enabled";
  if(/\b429\b|quota|RESOURCE_EXHAUSTED|rate/i.test(m)) return "quota";
  return "other";
}

export const modelInUse = () => ({ fast: TIERS.fast[tierIndex.fast], quality: TIERS.quality[tierIndex.quality] });
