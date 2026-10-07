# CLAUDE.md

Guidance for Claude Code in this repository. What the product does and for whom is in [PRODUCT.md](PRODUCT.md).
Human setup and deploy steps are in [SETUP.md](SETUP.md). The template contract (hooks) is in [TEMPLATES.md](TEMPLATES.md).

## What this is

Tamil / English invitation websites for weddings, housewarmings, birthdays and any other category the admin adds.
Many events run at once. Each one lives at `/<slug>` (e.g. `/arjun-meera`) with its own details, photos, music,
guest book and template. One admin (email + password) manages everything. An event's editor gets in with a PIN.

- **No build step.** No `package.json`, no npm dependencies, no bundler, no framework, no TypeScript.
  Plain HTML, CSS and ES-module JavaScript, served as-is from `public/`.
- **Firebase from the CDN**: Firestore (data), Auth (admin email/password, editor anonymous), AI Logic (Gemini
  translation). It is imported from `https://www.gstatic.com/firebasejs/12.19.0/…`.
- **Hosting**: Vercel (primary, live at `https://invitation-five-mu.vercel.app`, auto-deploys on push to `main`
  from `github.com/Harishdhoni/invitation`) or Firebase Hosting. On Vercel, two functions in `api/` add per-event
  link previews.

## Commands

There are no build, test or lint scripts.

| Task | Command |
|---|---|
| Run locally | Start Apache in XAMPP, then open `http://localhost/wedding-invite/public/` |
| Syntax-check every JS file | `for f in public/js/*.js api/*.js; do node --check "$f"; done` (Node 24 detects ES modules) |
| Deploy Firestore rules + indexes | `firebase deploy --only firestore:rules,firestore:indexes` |
| Deploy the site (Vercel) | `git push` to `main` |
| Deploy the site (Firebase Hosting) | `firebase deploy --only hosting` |

Local URLs (all under `http://localhost/wedding-invite/public/`):

| URL | Shows |
|---|---|
| `admin.html` | Admin: events list. `?w=<slug>` edits an event, `?view=templates` lists templates, `?template=<id>` / `?template=new&category=<id>` edits one |
| `editor.html` | PIN editor |
| `?w=<slug>` | An event (locally, `/<slug>` paths don't work; use `?w=`) |
| `/` (no params) | The event marked **Main link** (`site/settings.defaultWedding`) |
| `?template=<id>` | A saved template with sample details. Use `classic` for the built-in design |
| `?template=<id>&w=<slug>` | An event in another template. Nothing is saved |
| `?template-file=templates/<file>.html&category=<id>` | A starter file from `public/templates/` before it is added to Firestore |

Important:
- **Local pages use the live Firestore project** (`wedding-invitation-769fc`). There is no emulator and no staging.
  Anything saved from a local admin page, and any wish sent from a local invite, is real production data. Test on a
  throwaway event and delete it afterwards.
- **Vercel does not deploy `firestore.rules` or `firestore.indexes.json`.** After you edit either one, run the firebase
  deploy command. Deploying affects the live site, so ask the user before you run it.
- **`api/` functions run only on Vercel.** XAMPP serves `public/` as static files. To check an `api/` change, use a
  Vercel deployment (with the GitHub integration, a pushed branch gets a preview URL).
- On an office network that inspects HTTPS, set `NODE_OPTIONS=--use-system-ca` before running the firebase or vercel CLI.

## Architecture

### Pages

| Page | Script | Used by |
|---|---|---|
| `public/index.html`: the built-in **Classic** design, and the shell for every event | `js/invite.js` | Guests |
| `public/admin.html` (`/admin`) | `js/admin.js` | The one admin |
| `public/editor.html` (`/editor`) | `js/editor.js` | Someone holding an event's PIN |
| `public/templates/*.html`: starter designs, copied into Firestore on request | none (the runtime is injected) | n/a |

### Modules in `public/js/`

- `invite.js`: the **guest runtime**. Works out which event the page is for, loads its config (from localStorage
  first, then Firestore), switches to the event's template if needed, fills in the hooks, and runs the intro,
  countdown, music, language switch, reveal-on-scroll and guest book. Fires `invite:render` after every render.
- `defaults.js`: `DEFAULT_CONFIG` (sample wedding), per-category `SAMPLES` / `sampleFor()`, `DEFAULT_CATEGORIES`,
  `TRANSLATIONS` (guest UI strings in EN + TA), `SAMPLE_WISHES`. Also the helpers `tr`, `withDefaults`, `clone`,
  `newId`, `slugify`, `isValidSlug`, `isValidId` and `RESERVED_SLUGS`.
- `firebase-config.js`: `firebaseConfig`, `ADMIN_UID`, `SITE_URL`, `isFirebaseConfigured`.
- `firebase.js`: the default Firebase app, re-exporting the Firestore and Auth functions the pages use (admin and guests).
- `editor-firebase.js`: a separate **named app (`"editor"`)** with anonymous auth. This keeps an editor session and an
  admin session in the same browser from replacing each other. Keep the two apps separate.
- `admin.js`: admin boot, login and routing by URL params, the events list (category filter chips, upcoming before
  past), new event, delete, the Main link setting and the one-time legacy import.
- `admin-templates.js`: categories, the Templates page, the template editor (HTML textarea, upload/download, live
  iframe preview), `templatePicker`, lazy iframe `thumbnail`s and the starter import. Exports `CLASSIC` (id `""`).
- `admin-access.js`: the editor PIN panel on each event card (create, change, revoke, copy details).
- `event-editor.js`: the **event editor**, shared by the admin and editor pages. Tabs: details, photos & music,
  events, contacts, design, wishes. Builds its markup into `#editorView` **when the module is imported**, so the host
  page must already contain `#editorView`. `#editorView[data-admin]` turns on the admin-only parts (back link,
  category select, "create template" links).
- `audio-trim.js`: an in-browser song cutter. It decodes with Web Audio, draws a waveform with draggable handles and
  optional fades, and encodes MP3 with lamejs (loaded from cdnjs on first use; WAV if that fails).
- `image-utils.js`: resizes and compresses photos in the browser into data URLs under a character budget
  (`compressImage`, `compressPreviewImage` for the OG JPEG).
- `translate.js`: EN → TA with Gemini via Firebase AI Logic. Short text uses the fast tier, long text (> 80 chars or
  multi-line) uses the quality tier. It retries when the model is busy, falls back to another model when one is
  missing, and has a batch mode. The system prompt (transliterate names/venues, wedding vocabulary, date/time formats)
  is here.
- `pin.js`: PIN generation (8 chars from a 32-letter alphabet with no 0/O/1/I), formatting (`ABCD-EFGH`),
  normalising and validation.
- `admin-ui.js`: DOM helpers for admin and editor (`$`, `el`, `show`, `toast`, `actionBtn`, `linkBtn`, `copyText`,
  `permissionHint`).

### Serverless functions in `api/` (Vercel only, CommonJS)

- `invite.js`: the target of the `vercel.json` rewrite `/:slug([a-z0-9-]+)`. It reads `weddings/<slug>` (and the
  template) through the Firestore REST API with no credentials. It returns the template HTML, or Classic
  `index.html`, with the OG/Twitter tags replaced between `<!-- og:start -->` and `<!-- og:end -->`. It also adds
  `<meta name="wedding-id">` and `<meta name="template-id">` and appends `<script type="module" src="js/invite.js">`.
  Cache: `s-maxage=300, stale-while-revalidate=86400`.
- `og-image.js`: `/api/og-image?w=<slug>&v=<version>` decodes the `og` image (falling back to `cover`) from its data
  URL into image bytes, cached as immutable. With no image it redirects to `/assets/og-cover.jpg`.
- `_firestore.js`: a minimal read-only REST client. A leading `_` marks a helper, not an endpoint.

### How a guest's page loads (`/arjun-meera` on Vercel)

1. The `vercel.json` rewrite sends the request to `api/invite.js`, which returns HTML with that event's preview tags,
   its template and the meta tags.
2. `invite.js` reads the slug from `meta[name=wedding-id]` (or `?w=`, or the last path segment). It uses the cached
   config from `localStorage` (`wi:config:<slug>`) or fetches `weddings/<slug>`.
3. If the config's `templateId` doesn't match the page's design (`meta[name=template-id]`, `""` = Classic),
   `useTemplate()` fetches the template and `swapDocument()` replaces `document.documentElement`. Template scripts
   are recreated so they run, and a synthetic `DOMContentLoaded` is dispatched.
4. `start()` wires the page and renders. Images, music chunks and the wishes listener load after that.
   After rendering from the cache, `refreshConfig()` re-fetches. If the design changed it reloads once, using the
   `sessionStorage` key `wi:design:<slug>` to avoid a reload loop.

On Firebase Hosting every path is rewritten to `index.html`, so the template swap always happens in the browser and
link previews are always the generic card.

### Firestore data model

```
site/settings              { defaultWedding, legacyImported }        read: anyone · write: admin
site/config                the pre-multi-event invitation (only used by the import)
categories/<id>            { name, order }                           admin only
templates/<id>             { name, categoryId, description, html, v, createdAt, updatedAt }
                           get: anyone · list: admin + any editor · write: admin
weddings/<slug>            one event of any category (see fields below)
                           get: anyone · list/create/delete: admin · update: admin, or that event's editor (limited)
  images/<id>              { dataUrl, w, h, updatedAt }   ids: cover, og, deity, event-<eventId>
  music/<v>_<i>            { data: Bytes }                ~900 KB chunks of one song
  wishes/<auto>            { name, message, hidden, createdAt }
pins/<PIN>                 { slug, createdAt }     get: any signed-in user · list/write: admin
editors/<uid>              { pin, slug }           the user's own doc · admin can list/write
images/, music/, wishes/   legacy top-level collections, kept so the old site and the import keep working
```

Event fields (`weddings/<slug>`):
- Bilingual `{ en, ta }`: `groomName`, `brideName`, `title`, `tagline`, `heroDateLine`, `accommodationText`, and
  `name`, `date`, `time`, `place`, `venue`, `desc` on each event.
- Plain strings: `hashtag`, `curtainVerse`, `weddingDateTimeISO` (`"YYYY-MM-DDTHH:MM:00+05:30"`, India time),
  `category` (default `"wedding"`), `templateId` (`""` = Classic, which is offered for weddings only).
- `events[]`: `{ id, icon: { type: "emoji"|"image", emoji, imageId }, …bilingual fields, mapQuery, mapUrl }`.
- `coordinators[]`: `{ name: { en, ta }, phones: [] }`.
- `images`: `{ <imageId>: <version timestamp> }`. `music`: `{ v, chunks, size, type, name }` or `null`. `updatedAt`.
- `groomName` / `brideName` are the two names for **every** category (shown as `name1` / `name2`). The field names
  and the `weddings` collection are older than categories. Keep them so existing links and documents keep working.

### Security model

`firestore.rules` is the only thing that enforces access. Hiding something in the UI is cosmetic.

- **Admin**: `request.auth.uid` equals the UID hardcoded in `isAdmin()`.
- **Editor**: signs in anonymously, then writes `editors/<uid> = { pin, slug }`. The rules accept that only if
  `pins/<pin>.slug == slug`. `isEditorOf(slug)` checks again on every write that the pin doc still exists, so deleting
  the pin doc (Change or Revoke) cuts access immediately. An editor may update their event but not its `category`,
  and may change `templateId` only to a template in the same category (or `""` for weddings). They may write its
  images and music, and hide, unhide or delete its wishes, but not rewrite them.
- **Guest**: may `get` an event by slug (not list them), read visible wishes, and create a wish of exactly
  `{ name (1–60), message (1–500), hidden: false, createdAt: request.time }` on an event that exists.
- To change who can do what, change the rules first, then the UI, then deploy the rules.

## Conventions

- **Code style**: 2-space indent, double quotes, semicolons, no space before parens or braces in control flow and
  functions (`function load(){`, `if(x){`, `} catch(e){`). `async`/`await`. Small arrow helpers for one-liners.
  Section banners like `/* ------------------------------ wishes ------------------------------ */`.
- **DOM**: build nodes with `el(tag, className, text)` and `replaceChildren`. Put user data in with `textContent`
  only. Wishes and event text are untrusted, so never pass them to `innerHTML`. The only `innerHTML` uses are fixed
  markup (`editorMarkup`, `CORNER_SVG`).
- **Comments**: plain English sentences that explain *why* or name a constraint, placed above the code. Match the
  existing density: most functions have a one- or two-line lead comment.
- **Dependencies**: avoid new ones. If you really need one, load it from a CDN at runtime (see `loadLame` in
  `audio-trim.js`). The Firebase SDK version `12.19.0` is pinned in `firebase.js`, `editor-firebase.js` and
  `translate.js`. Bump all three together.
- **Old data must keep working**: read configs through `withDefaults()` / `normalize()`, and never assume a newly
  added field exists. Don't rename stored fields or collections.
- **Bilingual content**: store it as `{ en, ta }` and read it with `tr(field, lang)`, which falls back to English. In
  the editor use `biField(label, obj, key, { context })` so auto-translate works. `context` tells Gemini what the text
  is. Add "(transliterate)" for names and places.
- **Guest UI strings** go in `TRANSLATIONS` in `defaults.js`, in **both** `en` and `ta`. Pages use them through
  `data-i18n`, `data-i18n-placeholder` and `data-i18n-title`.
- **User-facing messages** are plain and warm, and say what happened and what to do next (e.g. "Permission denied —
  deploy the latest firestore.rules (see SETUP.md)."). Catch errors at the UI edge: `console.warn`/`console.error`
  plus a `toast`, using `permissionHint(e)` for `permission-denied`.
- **Docs voice** (README, SETUP, TEMPLATES): second person, short, practical, with the exact button names from the UI.
- **Commits**: imperative subject describing the outcome for the user ("Let editors pick a design from their event's
  category"). The body says what changed and why.

## Values that must stay in sync

Without a build step there is no shared config, so these are duplicated on purpose:

| Value | Where |
|---|---|
| Admin UID | `firestore.rules` `isAdmin()` · `public/js/firebase-config.js` `ADMIN_UID` |
| Firebase project id | `firebase-config.js` · `api/_firestore.js` `PROJECT_ID` · `.firebaserc` |
| Live site URL | `firebase-config.js` `SITE_URL` · `og:image` / `og:url` in `public/index.html` |
| Slug and id rules | `defaults.js` `isValidSlug` / `isValidId` · `api/_firestore.js` · the `vercel.json` rewrite regex |
| Reserved slugs | `RESERVED_SLUGS` in `defaults.js`. Add every new top-level page or folder in `public/` |
| Firebase SDK version | `firebase.js` · `editor-firebase.js` · `translate.js` |
| Template hooks | `invite.js` (the implementation) · `TEMPLATES.md` · the Hooks `<details>` in `admin.html` · `templates/blank.html` |
| Wish limits (60 / 500) | `firestore.rules` (both wish blocks) · `maxlength` in templates and `index.html` · `sendWish()` in `invite.js` |
| Size limits | Images: `image-utils.js` (900K-char data URL). Music: `MUSIC_*` in `event-editor.js` (900 KB chunks, 10 MB saved, 60 MB source). Template: `MAX_HTML` in `admin-templates.js` (900 KB) |
| Setup steps | `SETUP.md`, whenever rules, Firebase console steps or admin buttons change |

## Gotchas

- **Starter files are only seeds.** "Add starter templates" copies `public/templates/<file>.html` into
  `templates/<id>` in Firestore. After that, events use the Firestore copy, and editing the file changes nothing live.
  To update a live template, save it through the admin template editor. To add a starter, add the file and an entry
  in `public/templates/starters.json` (`id`, `file`, `name`, `category`, `description`). Reserved template ids:
  `classic`, `new`, `blank`.
- **Template pages replace the whole document.** Template scripts must not wait for `DOMContentLoaded` or `load`, must
  not include `js/invite.js`, and should skip the intro inside iframes (`window.self !== window.top`). See
  TEMPLATES.md.
- **The 1 MiB Firestore document limit shapes the storage.** Photos are compressed data URLs. Music is split into
  ~900 KB `Bytes` chunks, each written with its own `setDoc` before the config batch, because a batch can't carry
  several MB. Old chunks are deleted only after the new config commits. Keep that order.
- **Versions drive caching.** `config.images[id]` and `music.v` are timestamps. Guests cache images in
  `localStorage` (`wi:img:<slug>:<id>`) and music in the Cache API (`wi-music`), keyed by version. A new upload must
  get a new version, or guests keep seeing the old file.
- **The `og` image** is a small JPEG copy of the cover made on upload, for WhatsApp and Facebook. It is added and
  removed together with `cover`.
- **Propagation delay**: event links (and therefore template changes and link previews) are cached at Vercel's edge
  for ~5 minutes. WhatsApp keeps old previews in messages that were already sent.
- **Previews never write.** Template-editor iframes (`<meta name="invite-preview">`), `?template=` and
  `?template-file=` don't save wishes or touch the caches.
- **Everything is India time.** `datetime-local` input is stored with `+05:30`, and dates are displayed with
  `timeZone: "Asia/Kolkata"`. Event dates are free text; `parseEventDate()` pulls the day, month and year out of the
  English for template date hooks.
- **iOS audio**: music can start only from a tap. `startMusic()` plays a silent WAV on the intro tap to unlock the
  element, then plays the song once it has loaded. Keep music starting from a user gesture.
- **Stale docs**: the comment at the top of `event-editor.js` says the Design tab is admin-only, and SETUP.md §9 says
  editors have no Design tab. Since `adb3565`, editors **do** get a Design tab, limited to templates in their event's
  category. Only the category select is admin-only.
- **Secrets**: `.env.local` and `.vercel/` hold the Vercel CLI link and token. They are gitignored. Never commit or
  print them. The Firebase web `apiKey` in `firebase-config.js` is public by design; the rules protect the data.
- **HEIC photos** can't be decoded by browsers. The upload shows an error asking for JPG, PNG or WebP.

## Checking a change

There are no automated tests. Check changes by hand:

1. Run the `node --check` loop above.
2. Open the affected page through XAMPP, go through the flow, and watch the browser console.
3. Runtime or template changes: open `?template=classic` and two or three starters (`?template=temple-gold`,
   `?template=twinkle-birthday`). Open the intro, switch EN / தமிழ், and send a preview wish. Then open a real event
   with `?w=<slug>`.
4. Editor or rules changes: test as the admin, as an editor (PIN entered in a different browser profile), and as a
   guest (private window). Rules changes need a deploy first, so ask before deploying.
5. `api/` changes: check on a Vercel deployment. Confirm the preview tags with
   `curl -s https://<deployment>/<slug> | grep og:`.
