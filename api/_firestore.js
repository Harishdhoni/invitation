// Minimal read-only Firestore REST client for the link-preview functions.
// Files starting with "_" in api/ are helpers, not endpoints.
// Reads need no credentials: the rules allow anyone to get a wedding and its images.

// Must match projectId in public/js/firebase-config.js.
const PROJECT_ID = "wedding-invitation-769fc";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

// Same rule as isValidSlug in public/js/defaults.js.
const isValidSlug = s => typeof s === "string" && s.length >= 3 && s.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

// Firestore REST values ({ stringValue: "x" }, { mapValue: { fields } }, ...) to plain JS.
function plain(v){
  if(!v) return undefined;
  if("stringValue" in v) return v.stringValue;
  if("integerValue" in v) return Number(v.integerValue);
  if("doubleValue" in v) return v.doubleValue;
  if("booleanValue" in v) return v.booleanValue;
  if("timestampValue" in v) return v.timestampValue;
  if("nullValue" in v) return null;
  if("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  if("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  return undefined;
}

// Returns the document's fields (only `fields` if given), or null when it doesn't exist.
async function getDoc(path, fields = []){
  const mask = fields.map(f => "mask.fieldPaths=" + encodeURIComponent(f)).join("&");
  const r = await fetch(BASE + path + (mask ? "?" + mask : ""), { signal: AbortSignal.timeout(5000) });
  if(r.status === 404) return null;
  if(!r.ok) throw new Error(`Firestore ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return plain({ mapValue: { fields: (await r.json()).fields || {} } });
}

module.exports = { getDoc, isValidSlug };
