---
trigger: always_on
---

# Cascade rules: Invitations (wedding-invite)

Tamil / English invitation websites (weddings, housewarmings, birthdays, custom categories). There are many events,
each at `/<slug>` with its own details, photos, music, guest book and template. One admin manages everything, and
an editor can edit one event with a PIN. More detail: `CLAUDE.md` (code), `PRODUCT.md` (product), `SETUP.md`
(setup/deploy), `TEMPLATES.md` (template hooks). Read TEMPLATES.md before you touch `public/templates/` or the hooks
in `invite.js`.

## Hard constraints

- **No build step.** No package.json, npm, bundler, framework or TypeScript. Plain HTML/CSS and ES modules served from
  `public/`. Don't add tooling. If you really need a library, load it from a CDN at runtime (see `loadLame` in
  `audio-trim.js`).
- Firebase (Firestore, Auth, AI Logic) is imported from `https://www.gstatic.com/firebasejs/12.19.0/`. The version is
  pinned in `firebase.js`, `editor-firebase.js` and `translate.js`. Change all three together.
- **`firestore.rules` is the only access control.** Hiding things in the UI is cosmetic. To change permissions, edit
  the rules first, then the UI.
- **Local pages use the live Firestore project** (`wedding-invitation-769fc`). There is no emulator or staging, so
  saves and wishes from localhost are real. Test on a throwaway event.
- Vercel doesn't deploy rules or indexes. Run `firebase deploy --only firestore:rules,firestore:indexes`. **Ask the
  user before any deploy or push.**
- Never commit or print `.env.local` or `.vercel/` (Vercel token and link).

## Commands

- Local: start Apache in XAMPP, then open `http://localhost/wedding-invite/public/`, `…/admin.html`, `…/editor.html`.
  Open an event with `?w=<slug>` (`/<slug>` paths only work on Vercel). Templates: `?template=<id>`
  (`classic` = built-in), `?template=<id>&w=<slug>`, `?template-file=templates/<file>.html&category=<id>`.
- Syntax check: `for f in public/js/*.js api/*.js; do node --check "$f"; done`
- Site deploy: push to `main` (Vercel), or `firebase deploy --only hosting`.
- No tests and no linter. Check changes by hand in the browser and watch the console.

## Map

- `public/index.html`: Classic design and the guest shell. `js/invite.js`: the guest runtime (load config, swap in
  the template, fill hooks, intro, countdown, music, language, wishes).
- `public/admin.html` + `js/admin.js` (events list, new/delete event, main link, legacy import, routing by
  `?w=` / `?view=templates` / `?template=`), `js/admin-templates.js` (categories, templates page, template editor,
  picker, thumbnails, starters), `js/admin-access.js` (editor PINs).
- `public/editor.html` + `js/editor.js`: PIN entry. `js/editor-firebase.js` is a separate named app `"editor"` with
  anonymous auth, so it never replaces an admin session. Keep it separate.
- `js/event-editor.js`: the event editor shared by admin and editor. It writes its markup into `#editorView` on
  import. `#editorView[data-admin]` turns on the admin-only bits.
- `js/defaults.js`: sample data, `TRANSLATIONS` (EN + TA guest UI strings), `tr`, `withDefaults`, `slugify`,
  `isValidSlug`, `isValidId`, `RESERVED_SLUGS`. `js/firebase-config.js`: config, `ADMIN_UID`, `SITE_URL`.
- `js/translate.js` (EN → TA with Gemini), `js/audio-trim.js` (song cutter, lamejs MP3), `js/image-utils.js`
  (browser compression), `js/pin.js`, `js/admin-ui.js` (DOM helpers `$`, `el`, `show`, `toast`, `copyText`,
  `permissionHint`).
- `api/` (Vercel, CommonJS): `invite.js` serves `/<slug>` with per-event OG tags between `<!-- og:start -->` and
  `<!-- og:end -->` and adds `meta wedding-id` / `template-id` and the runtime script. `og-image.js` serves the
  preview image. `_firestore.js` is a credential-less REST reader.
- `public/templates/*.html` + `starters.json`: starter designs. These are **seeds only**. Once added in the admin,
  events use the Firestore copy, so editing the file changes nothing live.

## Data (Firestore)

`site/settings {defaultWedding}` · `categories/<id> {name, order}` ·
`templates/<id> {name, categoryId, description, html, v}` ·
`weddings/<slug>` (an event of any category) with sub-collections `images/<id> {dataUrl}`
(`cover`, `og`, `deity`, `event-<id>`), `music/<v>_<i> {data: Bytes}` (~900 KB chunks) and
`wishes/<id> {name, message, hidden, createdAt}` · `pins/<PIN> {slug}` · `editors/<uid> {pin, slug}`.

Event fields: bilingual `{en, ta}` for `groomName`, `brideName`, `title`, `tagline`, `heroDateLine`,
`accommodationText`, and for each event's `name`, `date`, `time`, `place`, `venue`, `desc`. Plain `hashtag`,
`curtainVerse`, and `weddingDateTimeISO` (`…+05:30`). `events[]`, `coordinators[]`. `images {id: version}`,
`music {v, chunks, size, type, name}`. `category` (default `wedding`). `templateId` (`""` = Classic, weddings only).
The names `weddings`, `groomName`, `brideName` and `weddingDateTimeISO` are historic and used for every category.
**Never rename stored fields or collections.**

Access: admin = the UID in `isAdmin()`. An editor writes `editors/<uid>`, which is only accepted for a live pin.
Every write re-checks the pin, so revoking is instant. Editors can't change `category`, and can switch `templateId`
only within the same category. Guests can `get` an event (not list), read visible wishes, and create a wish of
exactly `{name 1–60, message 1–500, hidden:false, createdAt:request.time}`.

## Code style

- 2 spaces, double quotes, semicolons, `function f(){`, `if(x){`, `} catch(e){` (no spaces). async/await.
  Section banners `/* ----- name ----- */`.
- Build DOM with `el()` + `replaceChildren`. Put user data in with `textContent` only. Wishes are untrusted.
- Comments: plain sentences above the code, explaining why. Match the existing density.
- Read stored data through `withDefaults()` / `normalize()`. Old documents must keep rendering.
- Bilingual: read with `tr(field, lang)`. In the editor use `biField(..., { context })` so auto-translate works, and
  add "(transliterate)" for names and places.
- New guest UI text goes in `TRANSLATIONS` in **both** `en` and `ta`, used through `data-i18n`.
- User-facing messages are plain and warm and give the next step. Errors: `console.warn` plus a `toast`, with
  `permissionHint(e)` for permission errors.
- Commit subjects: imperative, describing the outcome for the user ("Let editors pick a design from their event's
  category").

## Keep in sync (duplicated on purpose)

- Admin UID: `firestore.rules` + `firebase-config.js`.
- Project id: `firebase-config.js` + `api/_firestore.js` + `.firebaserc`.
- `SITE_URL`: `firebase-config.js` + the og tags in `index.html`.
- Slug and id rules: `defaults.js` + `api/_firestore.js` + the `vercel.json` rewrite.
- `RESERVED_SLUGS`: add every new top-level page or folder in `public/`.
- Template hooks: `invite.js` + `TEMPLATES.md` + the Hooks box in `admin.html` + `templates/blank.html`.
- Wish limits (60/500): rules + `maxlength` in the HTML + `sendWish()`.
- Size limits: images ~900K chars, music 900 KB chunks / 10 MB saved / 60 MB source, template HTML 900 KB.
- `SETUP.md` when setup steps or admin buttons change.

## Gotchas

- Templates replace the whole document (`swapDocument`). Template scripts must not wait for
  `DOMContentLoaded`/`load`, must not include `js/invite.js`, and should skip the intro in iframes. Every hook is
  optional, and an empty value hides its element.
- Firestore has a 1 MiB document limit. Music chunks are written one at a time **before** the config batch, and old
  chunks are deleted **after** it commits. Keep that order.
- Guests cache by version (`wi:config:<slug>` and `wi:img:<slug>:<id>` in localStorage, `wi-music` in the Cache
  API). New uploads must get a new version.
- Vercel caches event links for ~5 min, so template and preview changes show up late.
- Everything is India time (`+05:30`, `Asia/Kolkata`). Event dates are free text.
- iOS: music starts only from the intro tap, which unlocks the audio with a silent WAV. Keep it tied to a user gesture.
- Stale: the top comment in `event-editor.js` and SETUP.md §9 say editors have no Design tab. They do have one,
  limited to their category. Only the category select is admin-only.

## Checking a change

1. Run the `node --check` loop.
2. Go through the flow in XAMPP and watch the console.
3. Runtime or template changes: check `?template=classic` and a few starters, the intro, EN / தமிழ், and a preview
   wish.
4. Rules changes: after deploying (ask first), test as admin, as an editor (another browser profile) and as a guest
   (private window).
5. `api/` changes can only be checked on a Vercel deployment.
