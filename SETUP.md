# Wedding Invitation — Setup Guide

A Tamil maroon & gold wedding invitation site with an admin page.
Plain HTML/CSS/JS + Firebase (Firestore for data, Auth for the admin login, Hosting for the public link).

```
public/index.html   → the invitation guests see
public/admin.html   → where you enter names, dates, events, photos, contacts; moderate wishes
```

## 1. Preview locally (works right away)

Start **Apache** in the XAMPP Control Panel, then open:

- Invite: http://localhost/wedding-invite/public/
- Admin:  http://localhost/wedding-invite/public/admin.html

Until Firebase is connected the invite shows sample data and the admin page shows "Connect Firebase first".

## 2. Firebase console (one time, ~10 minutes)

Go to https://console.firebase.google.com

1. **Create a project** (or open your existing one). Google Analytics is not needed.
2. **Build → Firestore Database → Create database** → *Production mode* → location **asia-south1 (Mumbai)**.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
4. **Authentication → Users → Add user** → your admin email + a strong password.
   Copy the **User UID** shown in the list.
5. **Project settings (⚙) → General → Your apps → `</>` (Web)** → register an app (no Hosting checkbox needed) →
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
`vercel.json` already tells Vercel to serve the `public/` folder with no build step, so just click Deploy.
Every push to `main` redeploys automatically. Firestore rules/indexes are still deployed with the
Firebase CLI: `firebase deploy --only firestore:rules,firestore:indexes`.

On an office network that inspects HTTPS (errors like `SELF_SIGNED_CERT_IN_CHAIN` or
"Unable to fetch the CLI MOTD"), make Node trust the Windows certificate store first:
PowerShell `$env:NODE_OPTIONS="--use-system-ca"` · Git Bash `export NODE_OPTIONS=--use-system-ca`.

Your invite is now live at `https://<project-id>.web.app` (admin at `/admin`).
The wishes index takes a few minutes to build after the first deploy.

Run `firebase deploy --only hosting` again whenever you change files (not needed for admin edits —
those are saved to Firestore and appear instantly).

## 5. Fill in the details

Open the admin page, log in, and go through the tabs:

- **Couple & Hero** — names (Tamil optional; English is used if empty), Muhurtham date/time for the countdown, tagline, date line, hashtag, curtain verse.
- **Photos & Music** — couple cover photo, deity/emblem image, and the background song (MP3 up to 10 MB;
  3–5 MB loads best on mobile). Photos are compressed in your browser; the song is stored in ~900 KB pieces.
  The 🎵 button only appears on the invite once a song is added.
- **Events** — add/reorder/remove events. Each gets a "Get Directions" button (Maps search text or a Maps link).
- **Help & Contacts** — message for outstation guests + coordinators with tap-to-call numbers.
- **Wishes** — hide or delete any guest wish; changes are instant.

Click **Save changes** (or Ctrl+S) after editing the first four tabs.

## 6. Before sharing the link

- **WhatsApp preview:** edit the `<title>` and `og:` tags at the top of `public/index.html` —
  names, date, and replace `YOUR_PROJECT_ID` in the two URLs. Link previews never run JavaScript,
  so the admin page can't change these. Optionally replace `public/assets/og-cover.jpg` (1200×630).
- Redeploy: `firebase deploy --only hosting`.

## Notes

- **Free plan limits (Spark):** 50,000 Firestore reads/day. A guest visit costs about 1 read for details,
  photos only on the first visit (cached after), and up to 30 for the wishes wall — fine for typical weddings.
  If you expect very heavy traffic, upgrade to Blaze (pay-as-you-go; still ~free at wedding scale).
- **Security:** only the account whose UID is in `firestore.rules` can change details, photos or wishes.
  Guests can only add wishes (max 60-char name, 500-char message) and never see hidden ones.
- **"Permission denied" when saving** → the UID in `firestore.rules` doesn't match your admin user, or the rules weren't deployed.
- **iPhone HEIC photos** can't be read by browsers — export as JPG first.
