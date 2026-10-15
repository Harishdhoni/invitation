# CLAUDE.md

Guidance for Claude Code in this repository. What the product does and for whom is in [PRODUCT.md](PRODUCT.md).
Human setup and deploy steps are in [SETUP.md](SETUP.md). The template contract (hooks) is in [TEMPLATES.md](TEMPLATES.md).

## What this is

Tamil / English invitation websites for weddings, engagements, housewarmings, birthdays, baby showers and any other category the admin adds.
Many events run at once. Each one lives at `/<slug>` (e.g. `/arjun-meera`) with its own details, photos, music,
guest book and template. One admin (email + password) manages everything. An event's editor gets in with a PIN.
An event can have extra links that show the same details in other designs, each with its own hidden parts and its own
on/off switch and dates. Invitations are sold to the public (₹200 each by default): the admin records the customer
and payment, and an invitation stays closed to guests until it is marked **paid**. The bare address `/` is the sales page.

- **No build step.** No `package.json`, no npm dependencies, no bundler, no framework, no TypeScript.
  Plain HTML, CSS and ES-module JavaScript, served as-is from `public/`.
- **Firebase from the CDN**: Firestore (data), Auth (admin email/password, editor anonymous), AI Logic (Gemini
  translation). It is imported from `https://www.gstatic.com/firebasejs/12.19.0/…`.
- **Hosting**: Vercel (primary: project `online-invitation`, live at `https://invitation-five-mu.vercel.app`,
  auto-deploys on push to `main` from `github.com/Harishdhoni/online-invitation`) or Firebase Hosting. On Vercel, two
  functions in `api/` add per-event link previews. The site's name is "Online Invitations" (page titles, and the
  fallback for the business name from Settings).

## Commands

There are no build, test or lint scripts.

| Task | Command |
|---|---|
| Run locally | Start Apache in XAMPP, then open `http://localhost/wedding-invite/public/` |
| Syntax-check every JS file | `for f in public/js/*.js api/*.js; do node --check "$f"; done` (Node 24 detects ES modules) |
| Local emulator (needs Java 21) | `firebase emulators:start --only firestore,auth --export-on-exit .emulator-data` (+ `--import .emulator-data` later), then open a page with `?emulator=1`. Test admin setup: SETUP.md §1 |
| Compile the rules without deploying | `firebase deploy --only firestore:rules --dry-run` |
| Deploy Firestore rules + indexes | `firebase deploy --only firestore:rules,firestore:indexes` |
| Deploy the site (Vercel) | `git push` to `main` |
| Deploy the site (Firebase Hosting) | `firebase deploy --only hosting` |

Local URLs (all under `http://localhost/wedding-invite/public/`):

| URL | Shows |
|---|---|
| `admin.html` | Admin: events list. `?w=<slug>` edits an event, `?view=templates` lists templates, `?template=<id>` / `?template=new&category=<id>` edits one |
| `editor.html` | PIN editor |
| `?w=<slug>` | An event (locally, `/<slug>` paths don't work; use `?w=`) |
| `/` (no params) | Goes to `home.html`, the sales page (on Vercel a server redirect to `/home`; elsewhere `invite.js` redirects) |
| `home.html`, `help.html`, `terms.html`, `privacy.html`, `refund.html`, `contact.html` | The sales page and the information pages |
| `showcase.html` (`/showcase` on Vercel), `?category=<id>` for one kind of event | The page to share with people who want to know about the product: what guests and customers get, and every design with a live preview |
| `?w=<slug>&editor-preview=1` | The customer's own preview of their invitation, read with their editor session (works while it is unpaid or closed) |
| `?template=<id>` | A saved template with sample details. Use `classic` for the built-in design |
| `?template=<id>&w=<slug>` | An event in another template. Nothing is saved |
| `?template-file=templates/<file>.html&category=<id>` | A starter file from `public/templates/` before it is added to Firestore |

Important:
- **Local pages use the live Firestore project** (`wedding-invitation-769fc`) unless the browser is switched to the
  emulator. There is no staging. Anything saved from a local admin page, and any wish sent from a local invite, is
  real production data. Test on a throwaway event and delete it afterwards, or use the emulator.
- **Emulator**: `?emulator=1` on a localhost page makes that browser use the Firestore and Auth emulators
  (`useEmulator` in `firebase-config.js`, wired in `firebase.js` and `editor-firebase.js`) until `?emulator=0`. It runs
  the local `firestore.rules`, so rules can be tested before deploying. It starts empty: create the test admin
  with the real admin UID (SETUP.md §1), then **Add starter templates**. Firestore emulator REST calls with
  `Authorization: Bearer owner` bypass the rules, which is handy for seeding test data.
- **Vercel does not deploy `firestore.rules` or `firestore.indexes.json`.** After you edit either one, run the firebase
  deploy command. Deploying affects the live site, so ask the user before you run it.
- **`api/` functions run only on Vercel.** XAMPP serves `public/` as static files. To check an `api/` change, use a
  Vercel deployment (with the GitHub integration, a pushed branch gets a preview URL).
- On an office network that inspects HTTPS, set `NODE_OPTIONS=--use-system-ca` before running the firebase or vercel CLI.
- **Local admin sign-in**: on `localhost`, `admin.js` `autoLogin()` signs the admin in with the email and password in
  `local-admin.js` at the project root (gitignored, outside `public/` so never deployed, and limited to this computer by
  the root `.htaccess`), or with the emulator's test admin (`admin@test.local` / `test1234`). A real sign-in is still
  needed because the rules check the admin UID. **Log out** sets `sessionStorage` `wi:noAutoLogin` so that tab shows the form.
- **Local caching**: `public/.htaccess` makes Apache send `Cache-Control: no-cache` for html/js/css/json, as
  `vercel.json` does on Vercel, so a normal reload shows your edits. If a page still mixes old and new files (new
  markup, old script), hard-refresh with Ctrl+Shift+R.

## Architecture

### Pages

| Page | Script | Used by |
|---|---|---|
| `public/index.html`: the built-in **Classic** design, and the shell for every event | `js/invite.js` | Guests |
| `public/admin.html` (`/admin`) | `js/admin.js` | The one admin |
| `public/editor.html` (`/editor`) | `js/editor.js` | Someone holding an event's PIN |
| `public/templates/*.html`: 36 starter designs (10 wedding, 5 housewarming, 11 birthday, 5 baby shower, 5 engagement) listed in `starters.json`, copied into Firestore on request | none (the runtime is injected) | n/a |
| `public/home.html` (the sales page, served at `/`), `showcase.html` (the tour with every design) and `help`, `terms`, `privacy`, `refund`, `contact` `.html` | `js/site.js` | Customers |

`admin.html` and `editor.html` share `css/admin.css` and the same sidebar (no fixed header). On wide screens its toggle
folds it to a rail of icons and back; on phones and tablets a menu button slides it in. The credit ("© 2026 ✦ Developed
by Harish Siva") sits at the foot of the sidebar (`.site-credit.side-credit`); the page's own `.site-credit` footer shows
only under the login, PIN and setup screens. On the editor page `event-editor.js` puts the business name from Settings
beside the year in both.
The admin, editor, home and showcase pages have a **corner dock** at the bottom right (`cornerDock()` in
`scroll-top.js`): the back-to-top button above the assistant's **Ask AI** button. `admin.css` lifts it above the save
bar with `--dock-bottom`. The admin's assistant starts once signed in; the editor's from the PIN screen.
The sales and information pages share `css/home.css`. `public/assets/templates/<id>.webp` are phone screenshots of
the starter designs for the sales page's gallery and the showcase, and the thumbnails of unchanged starters in the
admin and editor.

### Modules in `public/js/`

- `invite.js`: the **guest runtime**. Works out which event the page is for, loads its config (from localStorage
  first, then Firestore), switches to the event's template if needed, fills in the hooks, and runs the intro,
  countdown, music, language switch, reveal-on-scroll and guest book. Fires `invite:render` after every render.
  With no event to show it sends the visitor to `home.html`. `?editor-preview=1` reads with `editor-firebase.js` (the
  customer's session) and shows a preview note. `addCredit()` appends the footer that sells to guests, the same in
  every design (`#madeWith`, styled by `CREDIT_CSS` with id selectors and the design's own text colour): a thin rule,
  "Would you like an invitation like this?", a small **See all designs** button to `SITE_URL/showcase?category=<the
  event's category>`, and "Made with <businessName>" once Settings has a name. It isn't added inside frames.
  `start()` also adds the back-to-top button (`scroll-top.js`) above the design's music button.
- `defaults.js`: `DEFAULT_CONFIG` (sample wedding), per-category `SAMPLES` / `sampleFor()`, `samplePhoto()` and
  `SAMPLE_MUSIC` (the sample previews' cover photo and song), `DEFAULT_CATEGORIES`,
  `TRANSLATIONS` (guest UI strings in EN + TA), `SAMPLE_WISHES`. Also the helpers `tr`, `withDefaults`, `clone`,
  `newId`, `slugify`, `isValidSlug`, `isValidId` and `RESERVED_SLUGS`.
- `firebase-config.js`: `firebaseConfig`, `ADMIN_UID`, `SITE_URL`, `isFirebaseConfigured`.
- `firebase.js`: the default Firebase app, re-exporting the Firestore and Auth functions the pages use (admin and guests).
- `editor-firebase.js`: a separate **named app (`"editor"`)** with anonymous auth. This keeps an editor session and an
  admin session in the same browser from replacing each other. Keep the two apps separate.
- `admin.js`: admin boot, login and the router, the events list (category filter chips, upcoming before
  past, each event's open/closed status and its extra links, **Switch off / on**), new event, delete (with its extra
  links) and the one-time legacy import. Above the list: a takings summary, status chips, search, **Export CSV**
  and **Clean up ended**. The admin page is **one page**: its views (events, templates, settings, event editor,
  template editor) switch in place with `history.pushState`, keeping the `?w=` / `?view=` / `?template=` addresses,
  so reload, Back / Forward and bookmarks still work. It catches clicks on same-page links (`<a href="?…">`) and
  `go()`, asks before leaving unsaved changes, keeps each list's scroll spot, and redraws every view from
  `admin-data.js` whenever its data changes, whether it is showing or not.
- `admin-data.js`: the admin page's data (every `weddings/` doc, orders, PINs, categories, templates and
  `site/settings`), read once after sign-in with Firestore `onSnapshot` listeners and kept current, so views show at
  once and follow changes made in other tabs or by customers. `onData(fn)` hears every change; `loaded` / `failed`
  say what has arrived. Admin views read from here instead of fetching.
- `admin-templates.js`: categories, the Templates page (grouped by category, with a category dropdown that is
  remembered for the tab in `sessionStorage` `wi:templatesCategory`), the template editor (HTML textarea,
  upload/download, live iframe preview), `templatePicker`, `thumbnail`s and the starter import. Exports
  `CLASSIC` (id `""`). A thumbnail is the starter's screenshot (`assets/templates/<id>.webp`) while the template is
  unchanged since it was added (`createdAt` equals `updatedAt`), and Classic's; any other template gets a live
  iframe that loads when it scrolls into view. `initTemplates()` wires the Templates page and template editor once;
  `renderTemplates()` redraws from `admin-data.js`, keeping the cards of templates that didn't change.
- `admin-access.js`: the editor PIN panel on each event card (create, change, revoke, copy details, and **Send on
  WhatsApp** when the order has a number). `customerMessage()` builds the customer message from Settings'
  `welcomeMessage` (or `DEFAULT_MESSAGE`): a one-tap `editor?pin=` link, the PIN, the invitation link and, while
  unpaid, how to pay. `issuePin()` and `sendOnWhatsApp()` are also used by **Create event** in `admin.js`, which makes
  the PIN and opens WhatsApp when a customer number is given (`welcomeCustomer`). WhatsApp can't be sent without a
  tap from a website; fully automatic sending would need Meta's WhatsApp Business API and a server function.
- `admin-sales.js`: selling. Orders (`newOrder`, `markOrderDeleted`), the order panel with **Mark as
  paid** / **Mark unpaid** (one batch: `weddings/<slug>.paid` + `orders/<slug>`), `salesSummary`, `downloadCsv`, and
  the Settings view (`?view=settings`, `site/settings`), which follows the saved settings until something is typed.
- `share.js`: `openShare(mod, voice)`, the **Share** window in the sidebar of the admin and editor pages. It shows the
  home page or showcase link (`?category=`) in a message for WhatsApp, the phone's share menu (`navigator.share`) or
  copying. It builds `#shareDialog` into the page on first open and reads `site/settings` through the page's own
  Firebase module. `"business"` (admin) writes to customers and signs with the business name; `"friend"` (editor) is
  a customer passing it on.
- `site.js`: the sales and information pages. Reads `site/settings` through the Firestore REST API (no SDK) and fills
  `data-site`, `data-site-if`, `a[data-whatsapp]`, `a[data-mailto]` and the home page's `#gallery` (from `starters.json`, with the same category chips as the
  showcase: `categoryChips()`, `?category=<id>`). On the
  showcase it also builds `#showcase` (category chips, a **Preview** and a **Choose** WhatsApp button per design), the
  hero's `#designReel` strip and the `#designPreview` dialog, which shows `./?template=<id>` in a scaled phone frame on
  wide screens (phones open the design in a new tab, so the intro and music play). A visitor whose referrer is the
  admin or editor page gets a **← Back to admin / editor** bar in the header, kept for the tab in `sessionStorage`
  `wi:back`; on the tab's first page it closes the tab (back to the unsaved edits), otherwise it goes to that address.
- `event-editor.js`: the **event editor**, shared by the admin and editor pages. Tabs: details, photos & music,
  events, contacts, design, links, wishes. Builds its markup into `#editorView` **when the module is imported**, so the
  host page must already contain `#editorView`. `#editorView[data-admin]` turns on the admin-only parts (back link,
  category select, "create template" links, each link's on/off switch and dates). The Links tab lists the event link
  and the extra links; it also exports `linkStatus`/`stateBadge`, which the events list uses. `openEditor()` can be
  called again for another event (`closeEditor()` clears the state and stops the listeners). While open it follows
  the event, its extra links and wishes, and on the editor page its category's templates and `site/settings`, with
  listeners: a change made elsewhere shows when nothing is unsaved here; otherwise only the fields this page never
  edits are taken (`lockedFields`). The admin passes its categories and templates in (`catalog`, `setCatalog`).
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
  `permissionHint`), `go(url)` (another view: in place on the admin page, whose router `useRouter` sets; a page load
  elsewhere), and `wireSidebar()`: from 1024px the `#sideToggle` button folds the sidebar to an icon rail
  (`html.side-collapsed`, remembered in `localStorage` `wi:sideCollapsed`, shared by both pages); below that it is a
  slide-in menu (`html.nav-open` locks the page and makes everything else `inert`; the close button, backdrop, Escape
  or choosing an item closes it).
- `smooth-scroll.js`: `smoothScroll()`, called by every page (in `invite.js` from `start()`, after any template swap).
  On a mouse or trackpad (`(hover: hover) and (pointer: fine)`, no reduced motion, not in a frame) it loads Lenis from
  jsDelivr and glides the wheel; touch screens keep native scrolling. Boxes that scroll by themselves and open
  `<dialog>`s keep their own scrolling. It pauses while `<html>` or `<body>` has `overflow:hidden` (intros, the menu).
- `scroll-top.js`: `addScrollTop()`, the round back-to-top button on every page. It shows after most of a screen of
  scrolling and glides up (through Lenis when it runs). It brings its own `<style>` (id selectors, so templates
  can't restyle it). With `above` (invitations) it floats on its own, see-through, centred 12px over the design's
  music button when that is fixed in the bottom-right corner (measured with `offset*`, which ignore a spinning
  button's transform); otherwise it goes into `cornerDock()` in maroon and gold.
- `assistant.js`: `startAssistant(page)`, the **Ask AI** chat on the admin, editor, home and showcase pages (`page` is
  `"admin"`, `"editor"`, `"home"` or `"showcase"`). It answers questions about that page with Gemini through
  Firebase AI Logic, in a named Firebase app `"assistant"` (no Auth, no Firestore) loaded on the first question,
  streaming the reply. Replies are plain text with `**bold**`, lists and `[text](go:id)` shortcuts, built with
  `textContent` only; a shortcut becomes a button only when its place exists and shows right now. The system prompt
  is built from `assistant-guide.js`, the public `site/settings` (business name, price, read through REST like
  `site.js`) and, on the home page and showcase, `starters.json` (so it can offer `go:preview:<id>`). Each question
  is sent with a short "where I am" note (view, tab, section). The chat is kept per tab in `sessionStorage`
  (`wi:assistant:<page>`). Styles: `css/assistant.css`, loaded by the script.
- `assistant-guide.js`: what the assistant knows. `PRODUCT` (shared facts, with `{business}` and `{price}`) and
  `GUIDES[page]`: `about` (the page explained, quoting button, tab and section names exactly), `greeting`,
  `suggestions`, `places` (`id → { does, run, when }`: the shortcuts) and `where()`. `where()` reads only the page's
  own labels, never names, numbers or other customer details.

### Serverless functions in `api/` (Vercel only, CommonJS)

- `invite.js`: the target of the `vercel.json` rewrite `/:slug([a-z0-9-]+)`. It reads `weddings/<slug>` (and, for an
  extra link, its parent event, and the template) through the Firestore REST API with no credentials. A 403 (a link
  that isn't open to guests) gets the generic page, cached for 60 s. It returns the template HTML, or Classic
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
   config from `localStorage` (`wi:config:<slug>`) or fetches `weddings/<slug>`. For an extra link (`{ parent }`) it
   also fetches the parent and merges them: the parent's details with the link's `templateId` and `hiddenSections`,
   plus `parent` and `link` (the link's own on/off and dates). Images, music and wishes are read from the parent
   (`dataSlug()`). A refused read (`permission-denied`) means the link isn't open: the intro shows `unavailable`.
   A cached copy whose dates say it has closed isn't shown.
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
site/settings              { legacyImported, businessName, price, upiId, whatsapp, email, address }
                           read: anyone (the sales details are public by design) · write: admin
orders/<slug>              { customer, phone, amount, method, ref, note, status, createdAt, paidAt, deleted }  admin only
site/config                the pre-multi-event invitation (only used by the import)
categories/<id>            { name, order }                           admin only
templates/<id>             { name, categoryId, description, html, v, createdAt, updatedAt }
                           get: anyone · list: admin + any editor · write: admin
weddings/<slug>            one event of any category (see fields below), or an extra link of one
                           get: anyone while the link is open (isLive), admin and its editor always · list: admin
                           create/delete: admin, or the event's editor for extra links · update: admin, or the editor (limited)
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
- `paid` (admin only): `false` for a sold invitation until its payment is recorded; missing means paid (events made
  before selling). The customer's details live in `orders/<slug>`, never here: anyone with the link can read this doc.
- When guests can open it (admin only): `active` (missing = `true`), `startDate` / `endDate` (`"YYYY-MM-DD"`, India
  time, both inclusive, `""` = none). With no `endDate` the link closes 15 days after the date in `weddingDateTimeISO`.
  `noExpiry: true` (the event link's **No expiry** box) means it never closes on its own: no end date, no 15-day auto end.
- `hiddenSections`: part ids from `SECTIONS` in `defaults.js` that this link doesn't show (admin and editor).
- `links`: the slugs of the event's extra links. Changes only in the same batch as creating or deleting one.
- **Extra link** docs (`weddings/<slug>` too, so the slug namespace and the rewrite are shared) hold only
  `{ parent, category, templateId, hiddenSections, active, startDate, endDate, createdAt, updatedAt }`. They show the
  parent's details, photos, music and one shared guest book. `category` is a copy of the parent's (the admin's save
  copies a change). An event has at most 3 links in all when an editor adds them (`MAX_LINKS`); the admin isn't limited.
- `groomName` / `brideName` are the two names for **every** category (shown as `name1` / `name2`). The field names
  and the `weddings` collection are older than categories. Keep them so existing links and documents keep working.

### Security model

`firestore.rules` is the only thing that enforces access. Hiding something in the UI is cosmetic.

- **Admin**: `request.auth.uid` equals the UID hardcoded in `isAdmin()`.
- **Editor**: signs in anonymously, then writes `editors/<uid> = { pin, slug }`. The rules accept that only if
  `pins/<pin>.slug == slug`. `isEditorOf(slug)` checks again on every write that the pin doc still exists, so deleting
  the pin doc (Change or Revoke) cuts access immediately. An editor may update their event but not its `category`,
  `paid`, `active`, `startDate` or `endDate`, and may change `templateId` only to a template in the same category (or `""` for
  weddings). They may write its images and music, and hide, unhide or delete its wishes, but not rewrite them.
  They may create extra links (switched on, no dates, the event's category, recorded in `links` in the same batch,
  at most 2: `linksChangeOk`), change an extra link's `templateId` and `hiddenSections`, and delete one.
- **Guest**: may `get` an event or link by slug (not list them) while it is open (`isLive`: paid, switched on, between
  its dates, and before the 15-day auto end unless `noExpiry`, all in India time), read visible wishes of an open event, and create a wish
  of exactly `{ name (1–60), message (1–500), hidden: false, createdAt: request.time }` on an open event (not on an
  extra link's path). An extra link needs its parent to be open too, since that is where its details are read.
  Images and music stay readable by id, as before.
- `isLive` compares dates as numbers (`"2027-02-12"` → `20270212`) against `request.time` shifted to India time, so
  the rules never parse dates. `get` allows `resource == null`, so looking up a free slug isn't refused.
- `orders/*` is admin only. `site/settings` is readable by anyone, so it holds only public sales details.
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
  `audio-trim.js`, and Lenis `1.3.26` from jsDelivr in `smooth-scroll.js`). The Firebase SDK version `12.19.0` is
  pinned in `firebase.js`, `editor-firebase.js`, `translate.js` and `assistant.js`. Bump them together.
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

### Templates (beyond the hooks in TEMPLATES.md)

Start a new design from a recent starter such as `templates/birthday-sprinkle-cake.html`, which already does all of this:

- **Intro**: the head script adds `js` to `<html>`, plus `intro-open` unless the URL has `?preview` or the page is in a
  frame. The runtime only adds `.open` and then `.hidden` to `#curtain-overlay`, so the template's own tap handler must
  remove `intro-open` (that unlocks scrolling and starts the hero's entrance). In frames it removes the overlay.
- **Tamil for fixed labels**: the `data-i18n` strings in `TRANSLATIONS` are worded for weddings. The ten newer birthday
  starters put Tamil on their own labels with `data-ta="…"` (text) and `data-ta-ph="…"` (placeholder), swapped by a small
  `invite:render` handler. A `MutationObserver` on `#wishesWall` labels wishes that arrive later. Only put `data-ta` on
  elements whose whole content is plain text; wrap the text in a `<span>` when it sits next to an icon or a `<b>`.
- **Photo slots**: an `<img data-bind="cover">` (or `emblem`) whose `src` is a transparent GIF, laid over a stand-in
  illustration. The runtime keeps the template's `src` until a photo is uploaded, so the illustration shows until then.
- **No sample details in fixed text**: never write the sample child's name, age or date into the page; use
  `data-bind` (`name1`, `year`, `day`, `monthNum`, …) or generic wording.
- **Original artwork only**: themed designs (superheroes, cartoons, princesses, games) evoke the theme with colours and
  generic motifs. No copyrighted characters, logos or franchise names in the art or the text.

## Values that must stay in sync

Without a build step there is no shared config, so these are duplicated on purpose:

| Value | Where |
|---|---|
| Admin UID | `firestore.rules` `isAdmin()` · `public/js/firebase-config.js` `ADMIN_UID` |
| Firebase project id | `firebase-config.js` · `api/_firestore.js` `PROJECT_ID` · `.firebaserc` |
| Emulator ports (Firestore 8085, Auth 9099) | `firebase.json` `emulators` · `EMULATOR` in `firebase-config.js` |
| Live site URL | `firebase-config.js` `SITE_URL` · `og:image` / `og:url` in `public/index.html` · `og:image` in `home.html` and `showcase.html` |
| Slug and id rules | `defaults.js` `isValidSlug` / `isValidId` · `api/_firestore.js` · the `vercel.json` rewrite regex |
| Reserved slugs | `RESERVED_SLUGS` in `defaults.js`. Add every new top-level page or folder in `public/` |
| Firebase SDK version | `firebase.js` · `editor-firebase.js` · `translate.js` · `assistant.js` |
| What the assistant knows | `assistant-guide.js` (button, tab and section names, element ids its shortcuts click, section ids such as `#features` and `#how` in `home.html`) · the pages it describes · `PRODUCT.md`. Rename a button or tab and the guide must follow |
| Corner dock above the save bar | `--dock-bottom` in `admin.css` (80px) · the `.savebar` height in `admin.css` |
| Template hooks | `invite.js` (the implementation) · `TEMPLATES.md` · the Hooks `<details>` in `admin.html` · `templates/blank.html` |
| Parts a link can hide | `SECTIONS` in `defaults.js` · `PART_SELECTORS` and the render functions in `invite.js` · the table in `TEMPLATES.md` · the Hooks `<details>` in `admin.html` |
| When a link is open (switch, dates, 15-day auto end, India time) | `firestore.rules` `isLive` · `linkState` / `AUTO_END_DAYS` in `defaults.js` |
| Links per event (3 in all for editors) | `firestore.rules` `linksChangeOk` (`after.size() <= 2`) · `MAX_LINKS` in `defaults.js` |
| No-cache headers for html/js/css | `vercel.json` `headers` (Vercel) · `public/.htaccess` (local Apache, so edits show on a normal reload) |
| Starter templates | `public/templates/starters.json` · the starter count in `README.md` and `SETUP.md` ("Add 36 starter templates") · the catalog in `PRODUCT.md` §6 |
| Site credit | two copies in each of `admin.html` and `editor.html` ("Developed by Harish Siva"): the `.side-credit` in the sidebar and the page's `.site-credit` footer · `loadSales()` in `event-editor.js`, which adds the business name to their first part |
| Sidebar breakpoint (1024px) | the `min-width:1024px` / `max-width:1023.98px` queries in `admin.css` · `matchMedia` in `wireSidebar()` (`admin-ui.js`) |
| Sales settings (businessName, price, upiId, payNumber, whatsapp, email, address, welcomeMessage) | `SALES_DEFAULTS` in `defaults.js` · `FIELDS` in `admin-sales.js` and the Settings form in `admin.html` · `data-site` hooks in `site.js` and the sales/info pages |
| Bare address → sales page | `vercel.json` redirect of `/` to `/home` (a redirect, because Vercel serves `index.html` before any rewrite; its `missing` list must name every query the invite page takes: `w`, `template`, `template-file`, `editor-preview`) · the `home.html` redirect in `invite.js` `boot()` |
| Customer message placeholders | `customerMessage()` / `MESSAGE_PLACEHOLDERS` in `admin-access.js` · the hint under the message box in `admin.html` |
| Design screenshots | `public/assets/templates/<id>.webp`, one per entry in `starters.json` plus `classic` (also the admin and editor thumbnails of unchanged starters) |
| Brand logo and favicon | `public/favicon.ico` and `public/assets/brand/` (`mark.png` for `.brand`, `logo.png` for `.logo`, `apple-touch-icon.png`, `og-card.jpg` for the `og:image` of `home.html` and `showcase.html`), all cut from one logo image · the icon `<link>`s in every page in `public/`. Templates have none and get `/favicon.ico`. `assets/emblem.svg` is Classic's default deity image, not the logo |
| Wish limits (60 / 500) | `firestore.rules` (both wish blocks) · `maxlength` in templates and `index.html` · `sendWish()` in `invite.js` |
| Size limits | Images: `image-utils.js` (900K-char data URL). Music: `MUSIC_*` in `event-editor.js` (900 KB chunks, 10 MB saved, 60 MB source). Template: `MAX_HTML` in `admin-templates.js` (900 KB) |
| Setup steps | `SETUP.md`, whenever rules, Firebase console steps or admin buttons change |

## Gotchas

- **The admin page doesn't reload between views.** Wire event listeners once (module top level, `initTemplates`,
  `initSettings`), never in code that runs each time a view opens. Render functions run on every data change, shown
  or not, so they must be safe to repeat and must not wipe what is being typed (the events list waits while a
  **Mark as paid** form is open). Move between views with `go()` or an `<a href="?…">`, not `location.href`. State
  that belongs to one event is reset in `closeEditor()`. A redrawn preview `<iframe>` loads all over again, so keep
  existing cards when nothing about them changed.
- **Starter files are only seeds.** "Add starter templates" copies `public/templates/<file>.html` into
  `templates/<id>` in Firestore. After that, events use the Firestore copy, and editing the file changes nothing live.
  To update a live template, save it through the admin template editor. To add a starter, add the file and an entry
  in `public/templates/starters.json` (`id`, `file`, `name`, `category`, `description`). Importing a starter whose
  category is missing creates the category, named from `DEFAULT_CATEGORIES` in `defaults.js` (or its id). Give a new
  category a sample in `SAMPLES` there too, so previews and new events start with fitting details, and a photo in
  `SAMPLE_PHOTOS` (a file in `public/assets/samples/`) so its previews show one. Reserved template ids: `classic`, `new`, `blank`.
- **Template pages replace the whole document.** Template scripts must not wait for `DOMContentLoaded` or `load`, must
  not include `js/invite.js`, and should skip the intro inside iframes (`window.self !== window.top`). See
  TEMPLATES.md.
- **Templates on phones**: decorations wider than the screen (spinning square SVGs, `120vw` glows) widen the whole
  page on mobile, even with `body{overflow-x:hidden}`. Put `overflow-x:clip` on the section that holds them.
  Pixel and monospace fonts have no Tamil and very wide spaces, so give `html[lang="ta"] [data-ta]` a Tamil font (the
  runtime sets `<html lang>`). Fonts with old-style figures (Playfair Display, Cormorant Garamond) turn "1" into "ı";
  use `font-variant-numeric:lining-nums`.
- **Admin and editor layout**: `admin.css` makes `<body>` a full-height flex column (`#appView` and `.center-view`
  grow) so the `.site-credit` footer sits at the bottom of the login, PIN and setup screens; it is hidden
  (`#appView:not([hidden]) ~ .site-credit`) once the app shows, since the sidebar has the credit. A new direct child
  of `<body>` becomes a flex item. From 1024px the `.sidebar` is fixed on the left: `#appView` gets
  `padding-left: var(--side-w)` (252px, or 76px folded), and the toast and the `.savebar` move over by the same width.
  Folded, the labels (`.side-text`, `.brand-name`) are visually hidden but still read by screen readers, so put a new
  item's label in a `.side-text` span and give it a `title` for the tooltip. Below 1024px, `.mobilebar` (not sticky)
  holds the menu button. There is no fixed header, so sticky things (`.tpl-preview`) stick at `top:1rem`.
- **Smooth scrolling and scroll locks**: Lenis scrolls from script, which `overflow:hidden` doesn't stop, so
  `smooth-scroll.js` pauses it whenever `<html>` or `<body>` is `overflow:hidden`/`clip` (watched through their `class`
  and `style`). Lock scrolling by toggling a class or style on `<html>`/`<body>` (`html.intro-open`, `body.locked`,
  `html.nav-open`): a lock that only a `:has()` rule turns on isn't noticed, so wheels would still move the page on
  desktop (inside a modal `<dialog>` that doesn't matter: Lenis leaves dialogs alone). A box scrolls by itself only
  when it has `overflow:auto|scroll` and more content than fits.
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
- **Sample photo and song**: while `invite.js` shows sample details (`sample`), the cover slot gets the category's
  photo from `public/assets/samples/` and the music is `SAMPLE_MUSIC`, played from its URL (`preload="none"`, so admin
  thumbnails don't each download it) instead of Firestore chunks. Neither is ever put in a config, so `sampleFor()` and
  new events stay without a photo or song. The baby shower photo is cropped from the original to drop its empty top. Engagements reuse the wedding photo.
- **Everything is India time.** `datetime-local` input is stored with `+05:30`, and dates are displayed with
  `timeZone: "Asia/Kolkata"`. Event dates are free text; `parseEventDate()` pulls the day, month and year out of the
  English for template date hooks.
- **iOS audio**: music can start only from a tap. `startMusic()` plays a silent WAV on the intro tap to unlock the
  element, then plays the song once it has loaded. Keep music starting from a user gesture.
- **The event editor saves with `mergeFields`.** `save()` writes the main doc with `set(…, { mergeFields })` and
  leaves out `links` (and, for editors, `active`/`startDate`/`endDate`), so a stale copy can't undo a link created
  elsewhere or the admin's dates. A top-level field dropped from `state` is therefore no longer deleted on save.
- **Closed links and caches**: guests' devices keep the config in `localStorage`, so `invite.js` checks `linkState`
  before using a cached copy. Vercel can serve an event's page HTML for ~5 minutes after it closes, but the page
  then can't read the details, so guests see the "not open" message.
- **The 15-day rule applies to old events too.** An event without an `endDate` closes 15 days after its main date
  as soon as the rules are deployed. To keep one open, set an end date or tick **No expiry** in its Links tab.
- **`/` is the sales page.** `useTemplate("")` fetches Classic as `./index.html`, never `./`. A new query parameter for
  the invite page must also go in the `missing` list of the `/` redirect in `vercel.json`, or `/?that=…` goes to the sales page.
- **Selling data**: customer names, phones and payment references go in `orders/<slug>` only. `weddings/<slug>` and
  `site/settings` are readable by anyone. A new starter design needs a screenshot in `public/assets/templates/`
  (390×780 WebP of the opened intro with sample details, as in the existing ones) for the sales page.
- **Secrets**: `.env.local` and `.vercel/` hold the Vercel CLI link and token. They are gitignored. Never commit or
  print them. The Firebase web `apiKey` in `firebase-config.js` is public by design; the rules protect the data.
- **The assistant and Tamil translation share one Gemini quota** (AI Logic, Gemini Developer API). Anyone on the home
  page or showcase can ask, so busy days use it up faster; the assistant then says "Lots of questions right now".
  It never calls the model until a question is sent.
- **HEIC photos** can't be decoded by browsers. The upload shows an error asking for JPG, PNG or WebP.

## Checking a change

There are no automated tests. Check changes by hand:

1. Run the `node --check` loop above.
2. Open the affected page through XAMPP, go through the flow, and watch the browser console.
3. Runtime or template changes: open `?template=classic` and two or three starters (`?template=temple-gold`,
   `?template=twinkle-birthday`), or a starter file not yet in Firestore with
   `?template-file=templates/<file>.html&category=<id>`. Check at phone width (390px, and no sideways scroll after the
   intro), open the intro, switch EN / தமிழ், and send a preview wish. Then open a real event with `?w=<slug>`.
   For headless screenshots use Chrome DevTools device emulation (`Emulation.setDeviceMetricsOverride`):
   `--window-size` can't go below about 500px on Windows, and `--virtual-time-budget` can freeze animations that start
   after load.
4. Editor or rules changes: test as the admin, as an editor (PIN entered in a different browser profile), and as a
   guest (private window). On the emulator this needs no deploy. Against live data rules changes need a deploy
   first, so ask before deploying. Before that,
   `firebase deploy --only firestore:rules --dry-run` compiles them without deploying: an unknown function or
   method shows as an `Invalid function name` warning, so check the output for warnings.
5. `api/` changes: check on a Vercel deployment. Confirm the preview tags with
   `curl -s https://<deployment>/<slug> | grep og:`.
