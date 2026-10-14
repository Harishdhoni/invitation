// The admin page's data: every event, order, PIN, category and template, and the site settings. It is read once
// after sign-in and then kept current by Firestore listeners, so each view shows straight away when it is opened
// and follows changes made anywhere: in this tab, in another tab, or in a customer's editor.
import { DEFAULT_CATEGORIES } from "./defaults.js";

let fb = null;

export const data = {
  events: [],            // [{ id, cfg }]: every weddings/ doc, extra links included
  settings: {},          // site/settings
  orders: new Map(),     // slug -> orders/<slug>
  pins: new Map(),       // slug -> { pin, at }: the event's newest PIN
  categories: [],        // [{ id, name, order }], in their order
  templates: []          // [{ id, name, categoryId, description, html, v, … }], by name
};
export const loaded = new Set();   // the kinds above that have arrived (or failed)
export const failed = new Map();   // kind -> the error that stopped it, e.g. rules not deployed yet

const watchers = new Set();
// fn(kind) runs whenever one kind of data arrives or changes.
export const onData = fn => { watchers.add(fn); };
const notify = kind => { loaded.add(kind); watchers.forEach(fn => fn(kind)); };

// Resolves once every kind named has arrived or failed.
export function whenLoaded(...kinds){
  return new Promise(resolve => {
    const check = () => { if(kinds.every(k => loaded.has(k))){ watchers.delete(check); resolve(); return true; } };
    if(!check()) watchers.add(check);
  });
}

// Server timestamps still being written show as the local estimate rather than null.
const docData = d => d.data({ serverTimestamps: "estimate" });

function listen(kind, ref, read){
  fb.onSnapshot(ref, snap => {
    data[kind] = read(snap);
    failed.delete(kind);
    notify(kind);
  }, e => {
    console.warn(`admin data: couldn't read ${kind}`, e);
    failed.set(kind, e);
    notify(kind);
  });
}

function readPins(snap){
  const pins = new Map();
  snap.docs.forEach(d => {
    const { slug, createdAt } = docData(d);
    const at = createdAt?.toMillis?.() ?? 0;
    if(!pins.has(slug) || at > pins.get(slug).at) pins.set(slug, { pin: d.id, at });
  });
  return pins;
}

// The first visit after setup creates Weddings, Housewarmings and Birthdays.
let seeded = false;
function readCategories(snap){
  if(snap.empty && !snap.metadata.fromCache && !seeded){
    seeded = true;
    const batch = fb.writeBatch(fb.db);
    DEFAULT_CATEGORIES.forEach(({ id, ...c }) => batch.set(fb.doc(fb.db, "categories", id), c));
    batch.commit().catch(e => console.warn("couldn't add the default categories", e));
  }
  const cats = snap.empty ? DEFAULT_CATEGORIES.map(c => ({ ...c })) : snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return cats.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
}

// Starts the listeners. The page must have signed the admin in already.
export function startData(mod){
  fb = mod;
  const col = name => fb.collection(fb.db, name);
  listen("events", col("weddings"), snap => snap.docs.map(d => ({ id: d.id, cfg: docData(d) })));
  listen("settings", fb.doc(fb.db, "site", "settings"), snap => snap.exists() ? snap.data() : {});
  listen("orders", col("orders"), snap => new Map(snap.docs.map(d => [d.id, docData(d)])));
  listen("pins", col("pins"), readPins);
  listen("categories", col("categories"), readCategories);
  listen("templates", col("templates"), snap =>
    snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)));
}
