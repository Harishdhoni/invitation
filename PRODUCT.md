# Product: Invitations

An invitation website, in Tamil and English, for each family event: weddings, housewarmings, birthdays, baby showers, or any other
category the admin adds. Guests get one link, usually over WhatsApp. It opens a designed page on their phone with
music, every event's time and directions, a countdown, a guest book and tap-to-call contacts. One admin runs any
number of these invitations from a single admin page. They can give a family member a PIN so that person can edit
one invitation and nothing else.

It is sold to the public: **₹200 buys one invitation** (the price is set in the admin). A customer orders on
WhatsApp, gets their editor PIN, fills in and previews the invitation, and pays by UPI. The admin marks it paid and
its link opens to guests.

This document describes what the product does and the rules it follows. The code itself is described in
[CLAUDE.md](CLAUDE.md), setup in [SETUP.md](SETUP.md) and template authoring in [TEMPLATES.md](TEMPLATES.md).

---

## 1. Goals

| Goal | What it means in the product |
|---|---|
| **Easy to share on WhatsApp** | Each event has a short link (`/arjun-meera`). On Vercel the link preview shows that event's title, date line and cover photo |
| **Tamil-first, bilingual** | Every text field has an English and a Tamil version. Guests switch with one tap. The admin types English and the Tamil fills in automatically |
| **Phone-first for guests** | Made for mobile browsers on slow data. Repeat visits load from the cache, music is fetched while the intro shows, and the iOS audio limits are handled |
| **Easy for families to run** | The admin and editor pages assume no technical knowledge. Photos are compressed and songs are cut in the browser, with no other tools |
| **Cheap to run** | Firebase (pay-as-you-go Blaze plan once selling: about ₹1–3 per invitation) and static hosting. There is no server to maintain |
| **Simple to sell** | One price per invitation. Customers try before they pay; the admin tracks who paid and opens their link |
| **One design per event** | Each event picks its template from its category, and a template change applies to every event that uses it |

## 2. Users

| User | Who | Access | Main needs |
|---|---|---|---|
| **Guest** | Relatives and friends, mostly on phones, opening a link from WhatsApp. May prefer Tamil | Opens an event by its link. No login | See when and where, get directions, call someone, leave a wish, feel the occasion |
| **Admin** | The site owner. One person, who did the one-time Firebase setup | Email + password. Full control | Create and manage many events, choose designs, hand off editing, moderate wishes |
| **Editor (customer)** | Whoever bought the invitation, or a family member they trust. Not technical | Taps the editor link (with the PIN in it) or types the 8-character PIN on `/editor` | Fill in and update their own invitation, preview it, pay, share it |
| **Visitor** | Someone thinking of buying | The sales page at `/` | See the designs and the price, order on WhatsApp |

## 3. Surfaces and features

### 3.1 The invitation (guests)

Every event's page has these parts. Each template decides which parts to show and how they look.

- **Intro**: a full-screen opening (the curtain in Classic; doors, an envelope or a mandala in other templates)
  with the opening verse and the names. Tapping it opens the invitation and starts the music.
- **Hero**: both names (or one name, for a birthday), the optional invitation title, a tagline or message, a date
  line (e.g. *💍 12th February 2027 • Chennai*), and a deity or emblem image.
- **Cover photo**: one photo of the couple or the hosts.
- **Events**: one card per ceremony (e.g. Reception, Muhurtham), each with an emoji or uploaded icon, date, time,
  venue name, address, an optional description and a **Get Directions** button that opens Google Maps.
- **Countdown**: days, hours, minutes and seconds until the main date and time (India time).
- **Guest book**: guests leave a wish (name up to 60 characters, message up to 500). The wall shows the newest
  visible wishes, 30 at a time, with **Show more**. A new wish appears immediately.
- **Help & contacts**: a message for guests travelling from out of town, and coordinators with tap-to-call numbers.
- **Footer**: the hashtag and a thank-you line.
- **Controls**: an EN / தமிழ் switch (remembered on that device), **Copy Invite Link** (always the live link), and a
  music button that appears only when the event has a song.
- **Link problems**: a mistyped or deleted link shows "This invitation link isn't valid…" instead of sample content.
  A link that is switched off, not open yet, or past its end shows "This invitation isn't open right now…".
- **Extra links**: an event can be shared at up to three links, each in its own design. Each link can leave parts
  out (cover photo, events, countdown, guest book, help message, contact numbers, music). Guests on every link
  see the same details and write in the same guest book.
- **Signature and contact**: every invitation ends by asking guests “Would you like an invitation like this for your
  celebration?” with a **Contact us on WhatsApp** button (a ready message naming the link they saw; the contact page
  when no WhatsApp number is set), then a small “Made with <name>” line linking to the sales page. It shows once the
  admin sets a business name or WhatsApp number, in English or Tamil with the page.
- **Link previews**: on Vercel, each event link previews with its own title, date line and cover photo. The main
  link always shows the generic card.
- **Repeat visits**: details, photos and music are cached on the device. If Firebase can't be reached, the last
  saved copy is shown.

### 3.2 The admin page (`/admin`)

The header has the admin's sections (**Events**, **Templates**, **Settings**) and, in a new tab, the pages customers
see: **Home page ↗** (the sales page) and **Showcase ↗** (every design, the page to share with customers).

**Events**
- A list of every event: upcoming ones first (soonest at the top), then past ones. Above it: this month's takings,
  how many are waiting for payment, and all-time takings; status chips (**All / Unpaid / Open / Closed**); a search
  box (names, link names, customer name or phone); and category chips once there is more than one category.
- **＋ New event**: pick a category, type the name(s), pick a template, confirm the link name (suggested from
  the names, e.g. `arjun-meera`, `aarav-birthday`), and optionally the customer's name and WhatsApp number and
  **Already paid**. With a number, the editor PIN is made at once and WhatsApp opens on the customer's chat with the
  message typed in (the admin taps Send).
  The new event starts with that category's sample events and contacts, ready to replace. Unless **Already paid** is
  ticked it starts **Unpaid**.
- On each event card: whether guests can open it now (**Open**, **Unpaid**, **Off**, **Not open yet**, **Ended**) and
  until when, its extra links with theirs, the customer (with a WhatsApp link) and payment (**Mark as paid** with
  amount, method, reference and note; **Mark unpaid**), **Edit**, **Copy link**, **Switch off** / **Switch on**,
  **Delete** (type the link name to confirm; this removes the details, photos, music, wishes, extra links and PIN,
  and keeps the order for the accounts) and the **Editor PIN** panel. **Send on WhatsApp** (when the customer's number is
  known) and **Copy details** there give the customer message: their one-tap editor link, the PIN, their invitation
  link, and while unpaid, how to pay with their name in the payment note.
- **Export CSV**: every invitation with its customer and payment, for the accounts.
- **Clean up ended**: deletes the photos, music and wishes of invitations that closed more than 90 days ago.

**Share** (top bar, every admin page): the link to the home page or to the showcase (all designs, or one kind of
event) in a ready-written message with the price and business name, to send on WhatsApp (to a number or any
chat), through the phone's share menu, or to copy.

**Settings** (`?view=settings`): business name (also signs every invitation), price, UPI ID, GPay / PhonePe number,
WhatsApp number (also the contact button at the end of every invitation), support email, business address, and the
wording of the WhatsApp message to new customers (with placeholders such as `{customer}`, `{editorLink}` and
`{payment}`, and a preview). Customers see these on the sales page, on the editor page and in that message.
- **Import your current invitation**: shown once, for sites that started before multi-event support. It copies
  the old invitation into an event with its own link.

**Event editor** (also used by editors, see 3.3)

| Tab | Contents |
|---|---|
| Couple & Hero (Names & Hero for other categories) | Names, optional title, main date and time (countdown target), date line, tagline, hashtag, opening verse |
| Photos & Music | Cover photo, deity or emblem image, background song with the in-browser cutter |
| Events | Add, reorder or remove events. Name, date, time, venue, address, description, Maps search text or link, emoji or image icon |
| Help & Contacts | Message for outstation guests, and coordinators with any number of phone numbers |
| Design | The event's category (admin only) and template, with previews of the event in any template |
| Links | The event link and its extra links. For each: its status, what it shows (**Show on this link**), its design (extra links), and (admin only) **Open to guests**, **Start date** and **End date**. **＋ Add another link** and **Delete** take effect at once |
| Wishes | Every wish, live: hide, unhide or delete. Changes apply immediately |

- **Auto-translate**: about a second after you stop typing in an English box, the Tamil box fills in (Gemini through
  Firebase AI Logic). Names and places are written in Tamil script, not translated. If you edit a Tamil box by hand,
  your text is kept until you click **↻ Translate again**. **அ Fill missing Tamil** fills every empty Tamil box at once.
- **Saving**: **Save changes** or Ctrl+S. Wish moderation saves immediately. The page warns before you leave with
  unsaved changes.
- **Music cutter**: choose a song up to 60 MB, drag the start and end handles on the waveform (or type the
  seconds), preview it, optionally fade in and out, and use the clip. The saved clip is at most 10 MB, and 3–5 MB
  loads best on mobile.

**Templates**
- Templates are grouped by category. Each card shows a live thumbnail, which events use the template, and the
  buttons **Edit**, **Preview ↗**, **Copy link**, **Duplicate** and **Delete**. A template that an event uses can't be
  deleted.
- **Add N starter templates** copies any shipped designs that haven't been added yet.
- **Template editor**: name, category, description, and the HTML (paste, type, or upload a `.html` file; download is
  also available). A live preview with sample details shows it at phone or desktop size. A size meter warns when
  no hooks are found. Hook help is built in.
- **Categories**: add (e.g. Engagement), rename, and delete once a category has no templates or events. Weddings
  can't be deleted.

### 3.3 The editor page (`/editor`)

- One field: the PIN (e.g. `K7QM-X2PD`; case, spaces and dashes don't matter). The link in the PIN message
  (`/editor?pin=K7QM-X2PD`) fills it in and opens the editor straight away.
- **While unpaid**: a banner says guests can open it once ₹200 is paid, with **Pay ₹200 by UPI** (opens GPay, PhonePe
  or any UPI app with the amount filled in), the UPI ID to copy, and **Send the payment screenshot on WhatsApp**.
- **View site** (and **Open ↗** in Links) shows the customer their own invitation even while guests can't open it,
  with a note saying whether guests can see it yet.
- A valid PIN opens the event editor for **that event only**. It has the same tabs as the admin's, except:
  no list of other events, no category change, no creating templates, and no switching links on or off or changing
  their dates. The Design tab offers only templates from the event's own category.
- In **Links** the editor can add extra links up to three in all, each with a different design, choose what each
  link shows, and delete extra links. New links start open, until the event's own end.
- The browser remembers the PIN until the admin changes or revokes it, or the editor clicks **Leave editor**.
- When the admin changes or revokes the PIN, the editor's next save is refused and they are asked for the new PIN.

### 3.4 The sales page and information pages

- **`/`** (`home.html`): what you get, a gallery of every design (screenshots that open a live preview with sample
  details), the price, how it works in three steps, questions and answers, and **Order on WhatsApp** buttons that open
  a chat with a message ready.
- **`/showcase`** (`showcase.html`): the page to share with anyone who asks what this is. It walks through what
  guests see (a sample WhatsApp chat with the link), every design with category chips (`/showcase?category=birthday`
  opens on birthdays), what the customer can change in their editor, the steps, the price and a few questions. Each
  design has **Preview** (a live phone-sized preview beside its details on a computer, the full page on a phone) and
  **Choose**, a WhatsApp message naming the design.
- **Help** (how to make your invitation, step by step), **Terms**, **Privacy**, **Refunds** and **Contact**. They show
  the business name, price and contact details from Settings.

## 4. Key journeys

1. **Set up a wedding and share it** (admin): ＋ New event → Weddings, *Arjun* and *Meera*, pick *Temple Gold*, link
   `arjun-meera` → replace the sample events → add photos and a song → **Fill missing Tamil** → Save → **Copy link** →
   paste it into WhatsApp. The preview shows "Arjun weds Meera", the date line and the cover photo.
2. **Hand editing to family** (admin, then editor): on the event card, **Create editor PIN** → **Copy details** (the
   invitation link, the editor page and the PIN) → send it. The editor opens `/editor`, enters the PIN, updates the
   venue and saves. Guests see the change the next time they open or refresh the invite.
3. **Open and bless** (guest): tap the link → tap the intro (music starts) → switch to தமிழ் → **Get Directions** for
   the reception → write a wish → it appears on the wall.
4. **Moderate** (admin or editor): Wishes tab → **Hide** an inappropriate wish. It disappears from every guest's wall
   immediately.
5. **New kind of event** (admin): Templates → ＋ New category "Engagement" → ＋ New template (it starts from the blank
   starter) → restyle it, check the phone preview → Save → create an event in that category.
6. **Revoke access** (admin): **Revoke** on the event card. The PIN stops working immediately, even for someone
   editing at that moment.
7. **A second link for friends** (editor or admin): Links → **＋ Add another link** → `arjun-meera-friends`, pick
   *Modern Editorial* → untick **Contact numbers** and **Countdown** on its card → Save → **Copy link** on that card.
8. **Close a link** (admin): **Switch off** on the event card, or set an **End date** in the Links tab. Without one,
   the event's links close 15 days after its main date.
9. **Sell one** (visitor → admin → customer): the visitor taps **Order on WhatsApp** on the sales page → the admin
   creates the event with the customer's name and phone (unpaid), creates a PIN and sends **Copy details** → the
   customer taps the link, fills in the invitation and checks it with **View site** → pays with **Pay ₹200 by UPI** and
   sends the screenshot → the admin clicks **Mark as paid** → the customer shares the link.

## 5. Business rules and limits

| Rule | Value |
|---|---|
| Link name (slug) | 3–40 characters: lowercase letters, numbers, single dashes. **Can't be changed after creation.** Reserved: `admin`, `api`, `assets`, `css`, `editor`, `index`, `js`, `templates`, `home`, `help`, `terms`, `privacy`, `refund`, `contact` |
| Category and template ids | 2–40 characters, same pattern. Reserved template ids: `classic`, `new`, `blank` |
| Names per event | Two (groom and bride for weddings). Other categories use one name, or two shown as "Ravi & Priya" |
| Main date and time | Entered and shown in India time (IST, UTC+05:30) |
| Wish | Name 1–60 characters, message 1–500. New wishes are visible. Only the admin or that event's editor can hide or delete them |
| Price | ₹200 per invitation by default (Settings). Payment by UPI, recorded by the admin with **Mark as paid** |
| Unpaid invitations | Can be filled in and previewed by the customer; guests can't open their links or write wishes until marked paid. Events made before selling count as paid |
| When a link is open | While paid and switched on, from its start date to its end date (both optional, India time, inclusive). With no end date: until 15 days after the event's main date. An extra link is also closed whenever its event link is. Only the admin sets these. Guests on a closed link can't read the details or write wishes |
| Links per event | Up to 3 in all (the event link and 2 extra) when an editor adds them; the admin isn't limited. Each link uses a different design. Extra link names follow the slug rules and can't be changed |
| Editor PIN | 8 characters from `A–Z` and `2–9` without look-alikes (32⁸ ≈ 10¹² combinations). One PIN per event at a time |
| Photos | Compressed in the browser to fit one Firestore document (≈ 900 KB). Cover up to 1600 px, emblem 900 px, event icons 256 px. The link-preview copy is a JPEG of 1200 px or less, under 300 KB. HEIC isn't supported |
| Music | Source file up to 60 MB, saved clip up to 10 MB (MP3 or M4A), stored in ≈ 900 KB pieces |
| Template HTML | Up to 900 KB |
| How fast changes reach guests | Details: the next time they open or refresh. Template or preview changes on event links: within ≈ 5 minutes |
| Classic design | Built in, for weddings only, always available |
| Deleting | An event (and everything in it) requires typing its link name. A template can't be deleted while an event uses it. A category can't be deleted while it has templates or events |

## 6. Templates catalog

All templates fill in the same event details (see TEMPLATES.md).

| Template | Category | Look |
|---|---|---|
| Classic Maroon & Gold (built in) | Wedding | Curtain intro, gold corners, falling petals, EN / தமிழ் switch |
| Temple Gold | Wedding | Ivory with maroon bands, gold gopuram arch, kolam knots, temple doors that swing open |
| Mango Leaf & Marigold | Wedding | Thoranam garlands of mango leaves and marigolds, and a rice-flour kolam that draws itself |
| Kanjivaram Silk | Wedding | Peacock teal and magenta silk with gold zari borders and paisley |
| Kerala Kasavu | Wedding | Ivory and kasavu gold stripes, a nilavilakku lamp and jasmine strings |
| Blush Botanical | Wedding | Watercolour blush and sage, line-art roses, wax-sealed envelope intro |
| Midnight Art Deco | Wedding | Navy and gold, sunburst gates, deco countdown tiles |
| Modern Editorial | Wedding | Magazine minimalism, oversized serif type, a terracotta accent |
| Henna Mandala | Wedding | Mehendi line-work around a turning mandala |
| Celestial Night | Wedding | Indigo sky, crescent moon, the couple's initials as a constellation |
| Vintage Postcard | Wedding | Airmail stripes, stamps, postmarks, ticket-style events |
| Thoranam Housewarming | Housewarming | Thoranam over the door and a kolam at the threshold, for a Gruhapravesam |
| Twinkle Little Star | Birthday | A soft night sky with the birthday child's initial in the stars |
| Sprinkle Cake | Birthday | Blow out the candle on a two-tier cake; drip icing, a party-hat photo frame, macaron countdown |
| Level Up | Birthday | 8-bit game: PRESS START intro, game HUD, coin-popping ? blocks, stage select, high-score wishes |
| Neon Nights | Birthday | Flip a light switch and a neon sign flickers on over a brick wall; photo-booth strip. Teens and adults |
| Web Hero | Birthday | Superhero comic book: break free of a web, comic-cover hero, mission-briefing events |
| Goggles & Bananas | Birthday | Yellow and denim: peel a banana, the photo in a giant goggle, overall-pocket events |
| Little Boss | Birthday | Baby CEO: open the briefcase, an APPROVED memo, meeting agenda, flip clock, message slips |
| Glass Slipper | Birthday | Fairy-tale royal ball: the clock strikes twelve, a glass slipper, a silver portrait frame |
| Rainbow Unicorn | Birthday | Tap the golden horn for a rainbow; gold-foil title, an original unicorn, cloud countdown |
| Monster Trainer | Birthday | A mystery egg hatches; holo trainer card, events as trading cards, badge countdown |
| Vel Muruga | Birthday | Lord Murugan's blessings: a peacock-feather fan, a golden Vel (or the family's Murugan picture), Tamil-first |
| Valaikappu | Baby shower | The traditional Tamil bangle ceremony: glass bangles that jingle open, jasmine garland, a wreath of bangles round the photo, Tamil-first |
| Little Sprout | Baby shower | Water the seed and it sprouts; watercolour leaves, an arched photo window, seed-packet events |
| Special Delivery | Baby shower | A stork brings the bundle; shipping-label events, a tracking-timeline countdown, gift-tag wishes |
| Oh Baby | Baby shower | Boho balloon garland with pearl OH BABY letters; let the balloons fly; earthy arch frames |
| Sweet Dreams | Baby shower | A felt nursery mobile that turns when you wind the music box; stitched felt cards |

The themed birthday and baby-shower designs use original artwork only (no copyrighted characters, logos or franchise
names). Their fixed labels carry `data-ta` attributes, so they switch to Tamil with the தமிழ் button. The baby-shower
designs are gender-neutral: no "boy or girl" or gender reveal, which is not allowed in India.

New templates start from `public/templates/blank.html`, which uses every hook with plain styling.

## 7. Privacy and safety

- **Unlisted, not private.** Guests can't list events. An event opens only by its link. But link names are usually
  readable names, so anyone who guesses `arjun-meera` can open it. Everything on an invitation (details, photos,
  visible wishes) is readable by anyone with the link.
- **Access is enforced by the server** (Firestore security rules), not only by what the pages show. Only the admin
  can create or delete events, change categories or templates, or issue PINs. An editor can't touch any other event
  or change their event's category.
- **The admin and editor pages** are marked `noindex, nofollow`.
- **Guest input** (wishes) is length-limited by the rules and always shown as plain text.
- **Closed links** are refused by the rules, so the details can't be read while a link is off or outside its dates.
  Photos and music stay readable by their ids.
- **Customer and payment details** (orders) can be read only by the admin, never through an invitation link.
  The sales details in Settings are public by design.
- **Retention**: photos, music and wishes are deleted with **Clean up ended** about 3 months after an invitation
  closes, as the privacy page says. Order records are kept for the accounts.
- **Hidden parts are not secret.** A link that hides the contacts doesn't show them, but the event's details are
  saved once and downloaded by every link's page.
- **No tracking.** There are no analytics, ads or third-party trackers. Guests' devices keep only caches (details,
  photos, music, language choice).

## 8. Running costs and limits

- **Firebase**: a guest visit costs about 2 reads for the details and the signature, photos on the first visit only,
  and up to 30 for the wishes wall. The free Spark plan's 50,000 reads a day are shared by all events, so two big
  weddings on one day can use them up. **Selling needs the pay-as-you-go Blaze plan** (with a budget alert): a
  300-guest wedding costs about ₹1–3.
- **Gemini through Firebase AI Logic**: the free tier. When the quota is hit, the admin sees "Translation limit
  reached for the moment".
- **Hosting**: static pages plus two small functions for link previews. Vercel's free Hobby plan is for
  non-commercial use only; selling needs Vercel Pro (about $20 a month) or a host whose free plan allows commercial use.

## 9. Known limitations

These are things the product doesn't do today.

- **One admin account.** The admin UID is fixed in the rules. There are no roles and no second admin.
- **Payments are confirmed by hand.** There is no online checkout yet: the admin checks the UPI payment and clicks
  **Mark as paid**. (Planned: Razorpay checkout that marks it paid automatically.)
- **One editor PIN per event.** There's no record of who changed what.
- **No RSVP or headcount**, no guest list, no reminders or messages sent from the site.
- **No analytics** on how many people opened an invitation.
- **Link names are permanent.** Fixing a typo means creating a new event.
- **Fixed to India time**, and only English and Tamil. Translation runs only from English to Tamil.
- **One cover photo.** There is no gallery.
- **Per-event link previews need Vercel.** On Firebase Hosting every link shows the generic card.
- **No staging environment.** Local testing uses the live database, unless the browser is switched to the local Firebase emulator (SETUP.md §1).
- **Extra links share everything but the design and the hidden parts.** A link can't have its own wording, photos or
  guest book.

## 10. Glossary

| Term | Meaning |
|---|---|
| Event | One invitation (a wedding, housewarming, birthday…). Stored as `weddings/<slug>` for historical reasons |
| Link name / slug | The part after the site address that identifies an event, e.g. `arjun-meera` |
| Event link | An event's own link (`/arjun-meera`), as opposed to its extra links |
| Extra link | Another link to the same event, in its own design and with its own hidden parts, on/off switch and dates |
| Order | The record of who bought an invitation and how they paid (`orders/<slug>`, admin only) |
| Unpaid | A sold invitation whose payment hasn't been recorded yet: its customer can edit and preview it, guests can't open it |
| Sales page | The bare site address `/`: designs, price and **Order on WhatsApp** |
| Category | A kind of event (Weddings, Housewarmings, Birthdays, Baby Showers, or one the admin adds). Each has its own templates and sample details |
| Template | A whole HTML page design that any event in its category can use |
| Classic | The built-in Maroon & Gold wedding design in `index.html` |
| Starter template | A design shipped in `public/templates/`, copied into Firestore on request |
| Hook | A marker in a template (`data-bind`, `data-field`, ids) that the site fills with an event's details |
| Editor PIN | The code that lets one person edit one event |
| Muhurtham | The auspicious time of a Hindu wedding ceremony. The main countdown target for weddings |
| Gruhapravesam | A Hindu housewarming ceremony |
| Thoranam | A garland of mango leaves (and flowers) hung over a doorway for festive occasions |
| Kolam | A geometric design drawn with rice flour at a threshold |
| Kasavu, Kanjivaram, zari | Kerala gold-bordered cloth, Tamil silk sarees, and gold thread, used as design themes |
