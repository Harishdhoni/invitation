# Wedding Invitation

A Tamil maroon & gold wedding invitation website with an admin page.

- **Invite** (`public/index.html`): curtain intro with music, couple names, events with directions, Muhurtham countdown, guest wishes wall, help contacts. English / தமிழ் switch.
- **Admin** (`public/admin.html`): log in to edit names, dates, events, photos, music and contacts, and to hide or delete wishes.

Plain HTML, CSS and JavaScript with no build step. Firebase provides the data (Firestore) and the admin login (Auth).
The static `public/` folder can be hosted on Firebase Hosting or Vercel.

Setup and deployment steps are in [SETUP.md](SETUP.md).
