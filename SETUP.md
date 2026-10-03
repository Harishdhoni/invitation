# Wedding Invitation — Setup Guide

A Tamil maroon & gold wedding invitation site with an admin page.
Plain HTML/CSS/JS + Firebase (Firestore for data, Auth for the admin login, Hosting for the public link).

```
public/index.html   → the invitation guests see (one page serves every wedding)
public/admin.html   → list of weddings; per wedding: names, dates, events, photos, contacts, wishes
api/                → Vercel functions that put each couple's names and photo in link previews
```

Each wedding has its own link name and its own link, e.g. `https://invitation-five-mu.vercel.app/arjun-meera`.
The main link `/` shows whichever wedding is marked **Main link** in the admin.

## 1. Preview locally (works right away)

Start **Apache** in the XAMPP Control Panel, then open:

- Admin:  http://localhost/wedding-invite/public/admin.html
- Invite: http://localhost/wedding-invite/public/?w=arjun-meera (the wedding's link name after `?w=`),
  or http://localhost/wedding-invite/public/ for the main-link wedding

Until Firebase is connected the invite shows sample data and the admin page shows "Connect Firebase first".

## 2. Firebase console (one time, ~10 minutes)

Go to https://console.firebase.google.com

1. **Create a project** (or open your existing one). Google Analytics is not needed.
2. **Build → Firestore Database → Create database** → *Production mode* → location **asia-south1 (Mumbai)**.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
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

## 5. Add weddings

Open the admin page and log in. You land on the **Weddings** list:

- **＋ New wedding** — type the groom's and bride's names; the link name fills in (e.g. `arjun-meera`) and
  you can change it. Lowercase letters, numbers and dashes only. It can't be changed later, because it's the link guests open.
  The new wedding starts with sample events and contacts for you to replace.
- **Import your current invitation** — shown once if you used this site before multi-wedding support. It copies the old
  details, photos, music and wishes into a wedding with its own link name, and makes it the main link so links you already
  sent keep working. The old data is left as it was (you can delete the `site/config`, `images`, `music` and `wishes`
  collections in the Firebase console once you're happy).
- Each wedding card has **Edit**, **Copy link** (the link to send guests), **Show at main link** (what `/` shows),
  and **Delete** (removes its details, photos, music and wishes; you type the link name to confirm).

## 6. Fill in a wedding's details

Click **Edit** on a wedding and go through the tabs:

- **Couple & Hero** — names (Tamil optional; English is used if empty), Muhurtham date/time for the countdown, tagline, date line, hashtag, curtain verse.
- **Photos & Music** — couple cover photo, deity/emblem image, and the background song (MP3 up to 10 MB;
  3–5 MB loads best on mobile). Photos are compressed in your browser; the song is stored in ~900 KB pieces.
  The 🎵 button only appears on the invite once a song is added.
- **Events** — add/reorder/remove events. Each gets a "Get Directions" button (Maps search text or a Maps link).
- **Help & Contacts** — message for outstation guests + coordinators with tap-to-call numbers.
- **Wishes** — hide or delete any guest wish; changes are instant.

Type in the **EN** boxes and the **தமிழ்** box fills in automatically about a second after you stop typing
(Gemini via Firebase AI Logic). Typing in a Tamil box yourself keeps your version — click **↻ Translate again**
to go back to automatic. **அ Fill missing Tamil** (bottom bar) translates every empty Tamil box at once.

Click **Save changes** (or Ctrl+S) after editing the first four tabs.

## 7. Sharing the link

Use **Copy link** in the admin (or the invite's own Copy Invite Link button). On Vercel, WhatsApp and Facebook show
"Groom weds Bride", the date line, and the couple's cover photo — filled in automatically from the admin, no file editing.
A preview can take up to ~5 minutes to reflect a change, and WhatsApp keeps showing the old preview in messages
already sent. The main link `/` always shows the generic card in `public/assets/og-cover.jpg`.

## Notes

- **Free plan limits (Spark):** 50,000 Firestore reads/day, shared by all weddings. A guest visit costs about 1 read for details,
  photos only on the first visit (cached after), and up to 30 for the wishes wall — fine for several weddings at once.
  If you expect very heavy traffic, upgrade to Blaze (pay-as-you-go; still ~free at wedding scale).
- **Security:** only the account whose UID is in `firestore.rules` can create, change or delete weddings, photos or wishes,
  or list all weddings. Guests can open a wedding only by its link, can only add wishes (max 60-char name,
  500-char message) to a wedding that exists, and never see hidden ones.
- **After updating from the single-invitation version**, deploy the new rules:
  `firebase deploy --only firestore:rules` — until then the weddings list shows "Permission denied".
- **"Permission denied" when saving** → the UID in `firestore.rules` doesn't match your admin user, or the rules weren't deployed.
- **iPhone HEIC photos** can't be read by browsers — export as JPG first.
