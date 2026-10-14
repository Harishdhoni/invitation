# Invitations — Setup Guide

Invitation websites for weddings, housewarmings, birthdays, baby showers and other events, with an admin page.
Plain HTML/CSS/JS + Firebase (Firestore for data, Auth for the admin login, Hosting for the public link).

```
public/index.html       → the Classic design; js/invite.js shows every event, in Classic or its template
public/admin.html       → Events (names, dates, photos, music, contacts, wishes, template) and Templates
public/templates/       → starter templates, added to Firestore from the admin's Templates page
api/                    → Vercel functions: each event's page in its template, with names and photo in link previews
TEMPLATES.md            → how a template shows an event's details (for writing your own)
```

Each event has its own link name and its own link, e.g. `https://invitation-five-mu.vercel.app/arjun-meera`.
The bare address `/` is the sales page (`home.html`), with Help, Terms, Privacy, Refunds and Contact pages next to it.

## 1. Preview locally (works right away)

Start **Apache** in the XAMPP Control Panel, then open:

- Admin:  http://localhost/wedding-invite/public/admin.html
- Invite: http://localhost/wedding-invite/public/?w=arjun-meera (the event's link name after `?w=`)
- Sales page: http://localhost/wedding-invite/public/ (opens `home.html`)
- A template with sample details: http://localhost/wedding-invite/public/?template=temple-gold

Until Firebase is connected the invite shows sample data and the admin page shows "Connect Firebase first".

**Skip the admin login on localhost**: put your admin email and password in `local-admin.js` in this folder
(`export default { email: "…", password: "…" };`). The admin page then signs itself in on `localhost` only. The
file is gitignored and sits outside `public/`, so it is never deployed, and the folder's `.htaccess` lets only this
computer load it. After **Log out** that tab shows the login form again; a new tab signs in by itself.

Local pages save to the **live** Firestore database. To try changes without touching it — and to try new
`firestore.rules` before deploying them — use the Firebase emulator instead:

1. Install Java 21 (for example `winget install EclipseAdoptium.Temurin.21.JRE`), then in this folder run
   `firebase emulators:start --only firestore,auth --export-on-exit .emulator-data`
   (add `--import .emulator-data` from the second time on, to keep your test data). It uses the local `firestore.rules`.
2. Create a test admin with the admin UID from `firestore.rules` (the rules only accept that UID):
   ```bash
   curl -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/wedding-invitation-769fc/accounts" \
     -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
     -d '{"localId":"<admin UID>","email":"admin@test.local","password":"test1234"}'
   ```
3. Open `admin.html?emulator=1`. It signs in with that test account by itself. The browser stays on the emulator — for the
   admin, the editor and invites — until you open any page with `?emulator=0`. A "Running in emulator mode" bar shows
   at the bottom. The emulator starts empty: click **Add 31 starter templates**, then create an event.
   See the data at http://127.0.0.1:4000. Auto-translate doesn't work against the emulator.

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

Open the admin page, log in, and click **Templates** at the top. The first visit creates four categories:
Weddings, Housewarmings, Birthdays and Baby Showers.

- **Add 31 starter templates** (shown while some are missing) copies the designs in `public/templates/` into Firestore:
  ten wedding designs, five housewarming, eleven birthday and five baby-shower ones. Adding them also creates any category
  they need that is missing (for example Baby Showers on a site set up before it existed). The built-in **Classic Maroon & Gold** design is always
  there for weddings.
- Templates are listed by category. Each card has a live preview, the events using it, and **Edit**, **Preview ↗**,
  **Copy link** (`/?template=<id>`, the template with sample details), **Duplicate** and **Delete**.
  A template that an event uses can't be deleted; pick another design for that event first.
- **＋ New template** (in a category) opens the editor with a blank starter page. Paste or upload your HTML, or edit
  it in place; the preview on the right shows it with that category's sample details (Phone / Desktop).
  **Save template** (or Ctrl+S). Changes reach every event using it — within ~5 minutes on event links, because
  the pages are cached briefly. How to make a template show event details is in `TEMPLATES.md` and under **Hooks**
  in the editor.
- **＋ New category** adds a kind of event (e.g. Engagement). Categories can be renamed, and deleted once they have no
  templates or events. Add at least one template to a new category so events can use it.

## 6. Add events

**Events** lists every event, soonest first; once there's more than one category, buttons at the top filter by category.

- **＋ New event** — pick the category and a template, type the names (groom and bride for weddings; for other
  categories one name, or two like "Ravi & Priya"); the link name fills in (e.g. `arjun-meera`, `aarav-birthday`) and
  you can change it. Lowercase letters, numbers and dashes only. It can't be changed later, because it's the link guests open.
  The new event starts with that category's sample events and contacts for you to replace.
- **Import your current invitation** — shown once if you used this site before multi-wedding support. It copies the old
  details, photos, music and wishes into a wedding with its own link name. The old data is left as it was (you can delete the `site/config`, `images`, `music` and `wishes`
  collections in the Firebase console once you're happy).
- Each event card shows whether guests can open its link now (**Open**, **Off**, **Not open yet** or **Ended**) and
  until when, and lists its extra links. It has **Edit**, **Copy link** (the link to send guests), **Switch off** /
  **Switch on**, and **Delete** (removes its details, photos, music, wishes and
  extra links; you type the link name to confirm).

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
- **Links** — the event link and its extra links. Every link shows the same details, photos, music and guest
  book; each has its own design and its own **Show on this link** boxes (cover photo, events, countdown, guest book,
  help message, contact numbers, music). For each link you also set:
  - **Open to guests** — untick it to switch the link off. Guests then see "This invitation isn't open right now".
  - **Start date** / **End date** (optional, India time) — the first and last day guests can open it. With no end date
    a link closes **15 days after the event's main date**. An extra link also closes whenever the event link is closed.
  - **No expiry** (event link only) — tick it for a customer who wants the link to keep working: it never closes on its
    own, with no end date and no 15-day end. It still has to be paid, and **Open to guests** still switches it off.
  - **＋ Add another link** — pick a link name (e.g. `arjun-meera-friends`) and a design no other link of the event uses.
    The link works as soon as it is created; **Delete** on its card removes it.
- **Wishes** — hide or delete any guest wish; changes are instant.

Type in the **EN** boxes and the **தமிழ்** box fills in automatically about a second after you stop typing
(Gemini via Firebase AI Logic). Typing in a Tamil box yourself keeps your version — click **↻ Translate again**
to go back to automatic. **அ Fill missing Tamil** (bottom bar) translates every empty Tamil box at once.

Click **Save changes** (or Ctrl+S) after editing the first four tabs, the design or the links. (Creating or deleting
a link, and the wishes, take effect at once.)

## 8. Sharing the link

Use **Copy link** in the admin (or the invite's own Copy Invite Link button). On Vercel, WhatsApp and Facebook show
the invitation title (or "Groom weds Bride"), the date line, and the cover photo — filled in automatically from the admin.
A preview can take up to ~5 minutes to reflect a change, and WhatsApp keeps showing the old preview in messages
already sent. The sales page `/` shows the generic card in `public/assets/og-cover.jpg`.

## 9. Let someone else edit one invitation (PIN)

On **Events**, every event card has an **Editor PIN** row:

1. **Create editor PIN** makes a PIN like `K7QM-X2PD` for that event.
2. **Copy details** copies a message with the invitation link, the editor page (`/editor`) and the PIN. Send it to the editor.
3. The editor opens `/editor`, types the PIN in the one field, and sees the editor for **that invitation only**:
   details, photos, music, events, contacts, the design (templates of the event's own category), the links and the
   wishes (hide / unhide / delete). In **Links** they can add extra links — up to **3 links in all**, each with a
   different design — choose what each link shows, and delete the extra links. They can't switch links on or off or
   change their dates (only you can), change the category, see other events, or reach the admin page.
   Their browser remembers the PIN until you change it or they click **Leave editor**. Their top bar also has
   **Home page ↗**, **Showcase ↗** and **Share**, so they can send friends your site.
4. **Change** gives the event a new PIN; **Revoke** removes access. Either takes effect immediately — the editor's next
   save is refused and they are asked for the PIN again.

Deploy the latest rules for this (`firebase deploy --only firestore:rules`) and enable **Anonymous** sign-in (section 2).
Until then the Editor PIN row doesn't appear, and the editor page can't verify PINs.

PINs are 8 characters (letters and numbers without look-alikes, so no 0/O or 1/I) rather than 4–6 digits: the page has no
password, so the PIN is the only thing standing between the internet and the editor, and a short number could be guessed.
An event has one PIN at a time. Deleting an event removes its PIN.

## 10. Selling invitations

**Before the first sale**

1. **Firebase → Upgrade to Blaze** (pay as you go) and set a **budget alert** (e.g. ₹500/month) under
   Billing → Budgets & alerts. On the free plan two busy weddings on the same day can use up the daily reads and stop
   every invitation until midnight (Pacific time). On Blaze a 300-guest wedding costs about ₹1–3.
2. **Hosting that allows selling**: Vercel's free Hobby plan is for non-commercial use. Upgrade the project to
   **Vercel Pro**, or move to a host whose free plan allows commercial use.
3. **Your own domain** (e.g. `yourbrand.in`): add it in the host's dashboard, then update `SITE_URL` in
   `public/js/firebase-config.js` and the `og:image`/`og:url` tags in `public/index.html`, `public/home.html` and
   `public/showcase.html`.
4. **Admin → Settings**: business name, price, UPI ID, GPay / PhonePe number, WhatsApp number, support email and
   address. The sales page, the customer's editor and the WhatsApp message use them straight away. The business name
   also signs every invitation, and the end of every invitation asks guests whether they'd like one like it, with a
   button to your WhatsApp number. To reword the WhatsApp message to new customers, click **Start from the standard
   message**, change it, and check it with **Preview with sample details**.
5. **Read the legal pages** (`terms.html`, `privacy.html`, `refund.html`, `contact.html`) and have them checked by a
   professional. They describe what this site really does with data, but only you can promise your refund terms.
6. Deploy the rules (`firebase deploy --only firestore:rules`); they add the paid check and the private `orders`.

**For each order**

1. A customer messages you from the sales page (**Order on WhatsApp**).
2. **＋ New event**: names, design, link name, the customer's name and **WhatsApp number**. Leave **Already paid**
   unticked. Click **Create event**.
3. Their editor PIN is made and WhatsApp opens on their chat with the message typed in: their editor link (with the
   PIN in it), their invitation link, and how to pay ₹200 with their name in the payment note. Tap **Send**. If the
   browser blocks the new tab, click **Send on WhatsApp** in the green box. To send it again later, use
   **Send on WhatsApp** on the event's card.
4. The customer fills it in and checks it with **View site** (only they can see it). Guests who open the link see
   "This invitation isn't open right now".
5. They pay with **Pay ₹200 by UPI** in their editor and send you the screenshot. Check it reached your account, then
   click **Mark as paid** on the card (amount, how they paid, the UPI reference). The link opens to guests.
6. Use the chips at the top (**Unpaid**, **Open**, **Closed**) and the search box to find orders. **Export CSV** gives
   you every invitation and payment for your accounts.
7. Every month or so click **Clean up ended**: it deletes the photos, music and wishes of invitations that closed
   more than 90 days ago, as the privacy page promises.

**Sharing your site:** click **Share** in the top bar. Pick **Home page** or **Showcase** (optionally the designs for
one kind of event), check the message, then **Send on WhatsApp** (type a customer's number, or leave it empty to pick
the chat), **More apps…** on a phone, or **Copy link** / **Copy message**.

## Notes

- **Free plan limits (Spark):** 50,000 Firestore reads/day, shared by all weddings. A guest visit costs about 1 read for details,
  photos only on the first visit (cached after), and up to 30 for the wishes wall — fine for several weddings at once.
  If you expect very heavy traffic, upgrade to Blaze (pay-as-you-go; still ~free at wedding scale).
- **Security:** only the account whose UID is in `firestore.rules` can create or delete events, change categories or
  templates, create PINs, switch links on or off, set their dates, or list all events. A person with an event's PIN can
  additionally change that event's details, photos, music, design, links and wishes — but not its category, when it is
  open, or anything belonging to another event. Guests can open an event only by its link and only while that link is
  open; they can only add wishes (max 60-char name, 500-char message) to an open event, and never see hidden ones.
- **After updating to links with dates**, deploy the new rules: `firebase deploy --only firestore:rules`. Until then
  links never close, and editors can't add links. Deploying applies the 15-day rule to existing events at once: any
  event whose main date was more than 15 days ago (and has no end date) closes to guests. Set an end date or tick
  **No expiry** in its **Links** tab first if it should stay open.
- **Hidden parts are a display choice.** A link that hides the contact numbers doesn't show them, but the details are
  saved once for the whole event and the page downloads them, so someone technical could still find them.
- **After updating to templates**, deploy the new rules (they add `categories` and `templates`):
  `firebase deploy --only firestore:rules` — until then the Templates page shows "Permission denied" and events
  with a template show the Classic design.
- **After updating from the single-invitation version**, deploy the new rules:
  `firebase deploy --only firestore:rules` — until then the weddings list shows "Permission denied".
- **"Permission denied" when saving** → the UID in `firestore.rules` doesn't match your admin user, or the rules weren't deployed.
- **iPhone HEIC photos** can't be read by browsers — export as JPG first.
