# Invitations

Tamil-friendly invitation websites — weddings, housewarmings, birthdays, baby showers and any other kind of event — with an admin page.

- **Invite** (`public/index.html` + `public/js/invite.js`): intro with music, names, events with directions, countdown,
  guest wishes wall, help contacts. English / தமிழ் switch.
- **Many events at once**: each has its own link (`/arjun-meera`), details, photos, music and guest book, with its own
  WhatsApp/Facebook link preview.
- **Templates**: each event is shown in a template chosen from its category. Templates are HTML pages stored in Firestore
  and managed on the admin page; 27 starter designs ship in `public/templates/`. How a template shows an event's details
  is described in [TEMPLATES.md](TEMPLATES.md).
- **Admin** (`public/admin.html`): one login. **Events** lists every event (filter by category); create, import, delete,
  pick a template, and edit names, dates, events, photos, music and contacts, and hide or delete wishes.
  **Templates** shows templates grouped by category: add, edit (with a live preview), duplicate, preview and delete
  templates, and add, rename or delete categories. Each event can get an **editor PIN**.
- **Editor** (`public/editor.html`, at `/editor`): one PIN field. A valid PIN opens the editor for that one event only;
  the admin can change or revoke the PIN at any time. See SETUP.md section 9.

Plain HTML, CSS and JavaScript with no build step. Firebase provides the data (Firestore) and the admin login (Auth).
The static `public/` folder can be hosted on Firebase Hosting or Vercel.

Setup and deployment steps are in [SETUP.md](SETUP.md).
