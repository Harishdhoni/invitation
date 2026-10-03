// English -> Tamil translation for the admin page, using Gemini through
// Firebase AI Logic (Gemini Developer API backend, free tier on the Spark plan).
// Enable once: Firebase console > AI Logic > Get started > Gemini Developer API.
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js";
import { app } from "./firebase.js";

// "-latest" aliases follow Google's newest models, so the page keeps working when
// older versions retire; the pinned names are fallbacks.
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"];

const SYSTEM = `You translate short English text from a Tamil Hindu wedding invitation website into natural, warm, respectful Tamil (as used in Tamil Nadu).
Rules:
- Transliterate, do not translate, personal names, temple / hall / venue names, and area or city names into Tamil script. Examples: "Sri Lakshmi Mahal" -> "ஸ்ரீ லட்சுமி மஹால்", "Anna Nagar, Chennai" -> "அண்ணா நகர், சென்னை", "Karthik" -> "கார்த்திக்".
- Use the usual Tamil wedding words: Wedding -> திருமணம், Muhurtham -> முகூர்த்தம், Reception -> வரவேற்பு, Engagement / Nichayathartham -> நிச்சயதார்த்தம், Mehendi -> மெஹந்தி.
- Dates like "12th February 2027" -> "12 பிப்ரவரி 2027". Times: "6:00 AM" -> "காலை 6:00", "6:30 PM onwards" -> "மாலை 6:30 மணி முதல்".
- Keep emojis, digits, phone numbers, PIN codes, URLs, hashtags, punctuation and line breaks exactly as they are.
- Reply with only the Tamil text. No quotes, notes, transliteration in English, or alternatives.
- When asked for a JSON array, reply with only that JSON array.`;

const ai = getAI(app, { backend: new GoogleAIBackend() });
let modelIndex = 0;
const models = {};
const cache = new Map();
const cacheKey = (text, context) => context + "\u0000" + text;

function currentModel(json){
  const name = MODELS[modelIndex];
  return models[name + (json ? ":json" : "")] ||= getGenerativeModel(ai, {
    model: name,
    systemInstruction: SYSTEM,
    generationConfig: json ? { temperature: 0.2, responseMimeType: "application/json" } : { temperature: 0.2 }
  });
}

const isModelMissing = e => /\b404\b|not found|is not supported|unsupported model/i.test(e?.message || "");

async function generate(prompt, json = false){
  for(;;){
    try {
      return (await currentModel(json).generateContent(prompt)).response.text().trim();
    } catch(e){
      if(isModelMissing(e) && modelIndex < MODELS.length - 1){ modelIndex++; continue; }
      throw e;
    }
  }
}

/** Translate one field's English text to Tamil. `context` is the field label, e.g. "Event date". */
export async function toTamil(text, context = ""){
  const key = cacheKey(text, context);
  if(!cache.has(key)) cache.set(key, await generate(`Field: ${context}\nEnglish:\n${text}`));
  return cache.get(key);
}

/** Translate several fields in one request. items: [{ text, context }] -> Tamil strings, same order. */
export async function toTamilBatch(items){
  const reply = await generate(
    `Translate each item's "text" into Tamil, following the rules. "context" says what the text is.\n` +
    `Return a JSON array of strings: the Tamil for each item, in the same order.\n\n${JSON.stringify(items)}`,
    true
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

export const modelInUse = () => MODELS[modelIndex];
