# Invitations — Setup Guide

Invitation websites for weddings, housewarmings, birthdays and other events, with an admin page.
Plain HTML/CSS/JS + Firebase (Firestore for data, Auth for the admin login, Hosting for the public link).

```
public/index.html       → the Classic design; js/invite.js shows every event, in Classic or its template
public/admin.html       → Events (names, dates, photos, music, contacts, wishes, template) and Templates
public/templates/       → starter templates, added to Firestore from the admin's Templates page
api/                    → Vercel functions: each event's page in its template, with names and photo in link previews
TEMPLATES.md            → how a template shows an event's details (for writing your own)
```

Each event has its own link name and its own link, e.g. `https://invitation-five-mu.vercel.app/arjun-meera`.
The main link `/` shows whichever event is marked **Main link** in the admin.

## 1. Preview locally (works right away)

Start **Apache** in the XAMPP Control Panel, then open:

- Admin:  http://localhost/wedding-invite/public/admin.html
- Invite: http://localhost/wedding-invite/public/?w=arjun-meera (the event's link name after `?w=`),
  or http://localhost/wedding-invite/public/ for the main-link event
- A template with sample details: http://localhost/wedding-invite/public/?template=temple-gold

Until Firebase is connected the invite shows sample data and the admin page shows "Connect Firebase first".

## 2. Firebase console (one time, ~10 minutes)

Go to https://console.firebase.google.com

1. **Create a project** (or open your existing one). Google Analytics is not needed.
2. **Build → Firestore Database → Create database** → *Production mode* → location **asia-south1 (Mumbai)**.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
   Also enable **Anonymous** here — the PIN editor page (section 9) signs editors in that way.
4. **Authentication → Users → Add user** → your admin email + a strong password.
   Copy the **User UID** shown in the list.
5. **Build → AI Logic → Get started → Gemini Developer API** (free, no card). This powers the admin
   page's automatic English → Tamil translation. It can take a few minutes to start working.
6. **Project settings (⚙) → General → Your apps → `</>` (Web)** → register an app (no Hosting checkbox needed) →
   copy the `firebaseConfig` values.

## 3. Paste your values (3 files)

| File | What to paste |
|---|---|
| `public/js/firebase-config.js` | the `firebaseConfig` values, and the admin UID in `ADMIN_UID` |
| `firestore.rules` | the admin UID in place of `PASTE_ADMIN_UID_HERE` |
| `.firebaserc` | your project ID in place of `YOUR_FIREBASE_PROJECT_ID` |

## 4. Deploy (rules + the site)

In a terminal opened in `C:\xampp\htdocs\wedding-invite`:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

**Hosting on Vercel instead (or as well):** import the GitHub repo at https://vercel.com/new.
`vercel.json` already tells Vercel to serve the `public/` folder with no build step, send wedding links
(`/arjun-meera`) through `api/invite.js`, and serve preview images from `api/og-image.js`, so just click Deploy.
Every push to `main` redeploys automatically. Firestore rules/indexes are still deployed with the
Firebase CLI: `firebase deploy --only firestore:rules,firestore:indexes`.

Per-wedding link previews (names + cover photo) need Vercel. On Firebase Hosting the wedding links
work too, but every link shows the generic "Wedding Invitation" preview.

If you change the live address, update `SITE_URL` in `public/js/firebase-config.js` (share links are built from it).
If you change Firebase projects, update `PROJECT_ID` in `api/_firestore.js` too.

On an office network that inspects HTTPS (errors like `SELF_SIGNED_CERT_IN_CHAIN` or
"Unable to fetch the CLI MOTD"), make Node trust the Windows certificate store first:
PowerShell `$env:NODE_OPTIONS="--use-system-ca"` · Git Bash `export NODE_OPTIONS=--use-system-ca`.

Your invite is now live at `https://<project-id>.web.app` (admin at `/admin`).
The wishes index takes a few minutes to build after the first deploy.

Run `firebase deploy --only hosting` again whenever you change files (not needed for admin edits —
those are saved to Firestore and appear instantly).

## 5. Templates and categories

Open the admin page, log in, and click **Templates** at the top. The first visit creates three categories:
Weddings, Housewarmings and Birthdays.

- **Add 22 starter templates** (shown while some are missing) copies the designs in `public/templates/` into Firestore:
  ten wedding designs, a housewarming and eleven birthday ones. The built-in **Classic Maroon & Gold** design is always
  there for weddings.
- Templates are listed by category. Each card has a live preview, the events using it, and **Edit**, **Preview ↗**,
  **Copy link** (`/?template=<id>`, the template with sample details), **Duplicate** and **Delete**.
  A template that an event uses can't be deleted; pick another design for that event first.
- **＋ New template** (in a category) opens the editor with a blank starter page. Paste or upload your HTML, or edit
  it in place; the preview on the right shows it with that category's sample details (Phone / Desktop).
  **Save template** (or Ctrl+S). Changes reach every event using it — within ~5 minutes on event links, because
  the pages are cached briefly. How to make a template show event details is in `TEMPLATES.md` and under **Hooks**
  in the editor.
- **＋ New category** adds a kind of event (e.g. Baby Shower). Categories can be renamed, and deleted once they have no
  templates or events. Add at least one template to a new category so events can use it.

## 6. Add events

**Events** lists every event, soonest first; once there's more than one category, buttons at the top filter by category.

- **＋ New event** — pick the category and a template, type the names (groom and bride for weddings; for other
  categories one name, or two like "Ravi & Priya"); the link name fills in (e.g. `arjun-meera`, `aarav-birthday`) and
  you can change it. Lowercase letters, numbers and dashes only. It can't be changed later, because it's the link guests open.
  The new event starts with that category's sample events and contacts for you to replace.
- **Import your current invitation** — shown once if you used this site before multi-wedding support. It copies the old
  details, photos, music and wishes into a wedding with its own link name, and makes it the main link so links you already
  sent keep working. The old data is left as it was (you can delete the `site/config`, `images`, `music` and `wishes`
  collections in the Firebase console once you're happy).
- Each wedding card has **Edit**, **Copy link** (the link to send guests), **Show at main link** (what `/` shows),
  and **Delete** (removes its details, photos, music and wishes; you type the link name to confirm).

## 7. Fill in an event's details

Click **Edit** on an event and go through the tabs:

- **Couple & Hero** (**Names & Hero** for other categories) — names (Tamil optional; English is used if empty), an
  optional invitation title (e.g. *Aarav turns 1!*, used by some templates and in link previews), the main date/time
  for the countdown, tagline, date line, hashtag, opening verse.
- **Photos & Music** — couple cover photo, deity/emblem image, and the background song. Choosing a song opens a cutter: drag the gold handles (or type start and end
  seconds) on the waveform, press Preview, then Use this clip. A long song (up to 60 MB) can be cut down to the
  part you want; the saved clip is at most 10 MB, and 3–5 MB loads best on mobile. Photos are compressed in your browser; the song is stored in ~900 KB pieces.
  The 🎵 button only appears on the invite once a song is added.
- **Events** — add/reorder/remove events. Each gets a "Get Directions" button (Maps search text or a Maps link).
- **Help & Contacts** — message for outstation guests + coordinators with tap-to-call numbers.
- **Design** — the event's category and template. **Preview this event in the selected template ↗** shows the saved
  details in the chosen template before you switch.
- **Wishes** — hide or delete any guest wish; changes are instant.

Type in the **EN** boxes and the **தமிழ்** box fills in automatically about a second after you stop typing
(Gemini via Firebase AI Logic). Typing in a Tamil box yourself keeps your version — click **↻ Translate again**
to go back to automatic. **அ Fill missing Tamil** (bottom bar) translates every empty Tamil box at once.

Click **Save changes** (or Ctrl+S) after editing the first four tabs.

## 8. Sharing the link

Use **Copy link** in the admin (or the invite's own Copy Invite Link button). On Vercel, WhatsApp and Facebook show
the invitation title (or "Groom weds Bride"), the date line, and the cover photo — filled in automatically from the admin.
A preview can take up to ~5 minutes to reflect a change, and WhatsApp keeps showing the old preview in messages
already sent. The main link `/` always shows the generic card in `public/assets/og-cover.jpg`.

## 9. Let someone else edit one invitation (PIN)

On **Events**, every event card has an **Editor PIN** row:

1. **Create editor PIN** makes a PIN like `K7QM-X2PD` for that event.
2. **Copy details** copies a message with the invitation link, the editor page (`/editor`) and the PIN. Send it to the editor.
3. The editor opens `/editor`, types the PIN in the one field, and sees the editor for **that invitation only**:
   details, photos, music, events, contacts and the wishes (hide / unhide / delete). There is no Design tab, no other
   events, no admin page and no settings. Their browser remembers the PIN until you change it or they click **Leave editor**.
4. **Change** gives the event a new PIN; **Revoke** removes access. Either takes effect immediately — the editor's next
   save is refused and they are asked for the PIN again.

Deploy the latest rules for this (`firebase deploy --only firestore:rules`) and enable **Anonymous** sign-in (section 2).
Until then the Editor PIN row doesn't appear, and the editor page can't verify PINs.

PINs are 8 characters (letters and numbers without look-alikes, so no 0/O or 1/I) rather than 4–6 digits: the page has no
password, so the PIN is the only thing standing between the internet and the editor, and a short number could be guessed.
An event has one PIN at a time. Deleting an event removes its PIN.

## Notes

- **Free plan limits (Spark):** 50,000 Firestore reads/day, shared by all weddings. A guest visit costs about 1 read for details,
  photos only on the first visit (cached after), and up to 30 for the wishes wall — fine for several weddings at once.
  If you expect very heavy traffic, upgrade to Blaze (pay-as-you-go; still ~free at wedding scale).
- **Security:** only the account whose UID is in `firestore.rules` can create or delete events, change categories or
  templates, create PINs, or list all events. A person with an event's PIN can additionally change that event's details,
  photos, music and wishes — but not its category or design, and nothing belonging to another event. Guests can open a wedding only by its link, can only add wishes (max 60-char name,
  500-char message) to a wedding that exists, and never see hidden ones.
- **After updating to templates**, deploy the new rules (they add `categories` and `templates`):
  `firebase deploy --only firestore:rules` — until then the Templates page shows "Permission denied" and events
  with a template show the Classic design.
- **After updating from the single-invitation version**, deploy the new rules:
  `firebase deploy --only firestore:rules` — until then the weddings list shows "Permission denied".
- **"Permission denied" when saving** → the UID in `firestore.rules` doesn't match your admin user, or the rules weren't deployed.
- **iPhone HEIC photos** can't be read by browsers — export as JPG first.
