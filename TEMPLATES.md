# Invitation templates

A template is one self-contained HTML page: its own `<style>`, Google Fonts links, inline SVG and
(optionally) inline scripts for decoration and the intro animation. Templates are stored in Firestore
(`templates/<id>`) and edited on the admin page under **Templates**. Every event that uses a template
gets the same design with its own details, photos, music and wishes.

The site fills a template with `js/invite.js` (the *runtime*). It runs after the template's own scripts,
finds the hooks below and puts the event's details in them. **Every hook is optional** — leave out what
the design doesn't need. A hook whose value is empty is hidden (`style.display = "none"`).

The starter templates in `public/templates/` follow this contract and are a good place to copy from.

## Single values: `data-bind`

The element's content is replaced with the value.

| `data-bind=` | Value | Also accepted |
|---|---|---|
| `names` | Both names: `<span class="name-part">Arjun</span> <span class="hero-amp">&amp;</span> <span class="name-part">Meera</span>`. With one name (birthdays) only one `name-part`. | `class="couple-names"` |
| `name1`, `name2` | Each name on its own (groom / bride, or the host's names) | |
| `initial1`, `initial2` | First letter of each name, for monograms | |
| `title` | The invitation title, e.g. *Aarav turns 1!* (optional field) | |
| `tagline` | The message under the names | `id="heroTagline"` |
| `dateLine` | Short date and place line, e.g. *💍 12th February 2027 • Chennai* | `id="heroDatePill"` |
| `verse` | Opening verse; each line becomes `<span class="vl" style="display:block">` | `id="curtainVerse"` |
| `help` | Message for outstation guests | `id="stayText"` |
| `hashtag` | Hashtag | `id="footerHashtag"` |
| `day`, `month`, `mon`, `monthNum`, `year`, `weekday`, `time`, `dateLong` | The main date and time (the countdown target): `12`, `February`, `FEB`, `02`, `2027`, `Friday`, `6:00 AM`, `Friday, 12 February 2027` | |

Images keep the template's own `src` until the admin uploads one:

| Hook | Image |
|---|---|
| `data-bind="cover"` or `id="coverImg"` on an `<img>` | Cover photo |
| `data-bind="emblem"` or `id="deityImg"` on an `<img>` | Deity / emblem image |

## Lists: a `<template>` inside the container

Put one `<template>` element directly inside the container; it is copied once per item. Everything else
in the container is removed on each render, so don't put sample items there.

| Container | One item | `data-field=` inside the item |
|---|---|---|
| `id="eventsGrid"` | an event | `number` (01, 02…), `name`, `date`, `time`, `place` (venue name), `venue` (address), `desc`, `icon` (emoji, or an `<img>` for uploaded icons), and from the event's date text: `day`, `month`, `mon`, `year`, `weekday` |
| `id="wishesWall"` | a guest wish | `message`, `name` |
| `id="coordinators"` | a coordinator | `name`, `phone` (first number), `phones` (every number as a tap-to-call link) |

Inside an item:

- `data-href="map"` sets the `href` to the event's Google Maps directions link; `data-href="tel"` to the coordinator's first number.
  Hidden when there's no link.
- `data-if="<field>"` hides the element when that field is empty (use it for labels like *Time* next to an empty time).
- `data-i18n` works inside items too (e.g. `data-i18n="getDirections"` on the directions link).
- Alternate styles between items with CSS, not with classes in the markup. The `<template>` element stays in the
  container as its first child, so use `:nth-of-type(even)` (or account for it in `:nth-child`).

Without a `<template>`, the runtime uses the Classic design's markup.

## Behaviour the runtime provides

- **Intro**: `id="curtain-overlay"`. A click on `id="openCurtainBtn"` or any `[data-open-invite]` adds `open` to the overlay,
  removes `locked` from `<body>`, and adds `hidden` to the overlay 1.5 s later (change with `data-hide-after="<ms>"` on the overlay).
  The background music starts from this tap. The template's own script may play its animation on the same click.
- **Reveal on scroll**: elements with class `reveal` get class `in` when they scroll into view, including list items rendered later.
  `<html>` gets class `js` first, so `.js .reveal{opacity:0}` is safe.
- **Countdown**: `id="cdDays"`, `cdHours`, `cdMins`, `cdSecs`, updated every second.
- **Guest book**: `id="wishForm"` with `id="wishName"` and `id="wishMessage"` saves wishes; optional `id="wishesMore"`
  (show more button) and `id="wishesEmpty"` (shown when there are no wishes).
- **Music**: `id="musicToggle"` (gets class `spinning` while playing) and `<audio id="bgMusic">`. Added automatically, as a
  round button at the bottom right, if the event has music and the template doesn't have them.
- **Toast** messages: `id="toast"`, gets class `show`. Added automatically if missing.
- **Language**: buttons `class="lang-btn" data-lang="en"` / `"ta"` switch between English and Tamil, and `data-i18n="<key>"`
  elements get the built-in UI text (see `TRANSLATIONS` in `js/defaults.js`). Without buttons the page is English.
- **Share**: `id="shareBtn"` copies the event's link.
- After every render the runtime fires `invite:render` on `document`, with the event's details in `event.detail`, for
  template scripts that draw something from the names or date.

## Template scripts

- Fine for decoration and intro animations. They run once the page's markup is in place.
- Don't count down, handle the wish form, or fill in names — the runtime does that.
- Don't wait for `DOMContentLoaded`/`load` (the page may be put in place after the browser fired them).
- Skip the intro inside previews: `if (window.self !== window.top) overlay.remove();`
- Don't include `js/invite.js` yourself; the site adds it.

## Previews

- **Admin → Templates → Preview** opens `/?template=<id>`, the template with sample details for its category.
- `/?template=<id>&w=<event>` shows an event's details in another template (nothing is saved; wishes aren't sent).
- `/?template-file=templates/<file>.html&category=<id>` previews a starter file from `public/templates/` before it's added.
