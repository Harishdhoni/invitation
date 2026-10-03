# Wedding Invitation

A Tamil maroon & gold wedding invitation website with an admin page.

- **Invite** (`public/index.html`): curtain intro with music, couple names, events with directions, Muhurtham countdown, guest wishes wall, help contacts. English / தமிழ் switch.
- **Many weddings at once**: each has its own link (`/arjun-meera`), details, photos, music and guest book, with its own WhatsApp/Facebook link preview.
- **Admin** (`public/admin.html`): one login lists every wedding; create, import, delete, and edit names, dates, events, photos, music and contacts, and hide or delete wishes.

Plain HTML, CSS and JavaScript with no build step. Firebase provides the data (Firestore) and the admin login (Auth).
The static `public/` folder can be hosted on Firebase Hosting or Vercel.

Setup and deployment steps are in [SETUP.md](SETUP.md).
