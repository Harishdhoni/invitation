// Smooth scrolling for every page. With a mouse wheel or trackpad the page glides, using Lenis (loaded from the CDN
// the first time). Lenis moves the page's real scroll position, so sticky parts, scroll listeners and
// reveal-on-scroll keep working. Phones and tablets keep their own touch scrolling, which already glides, and so
// does anyone whose device asks for less motion. Pages in a frame (admin thumbnails and previews) are left alone.
// If the CDN can't be reached the page scrolls normally.
const LENIS_URL = "https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.mjs";

// From Lenis's own stylesheet: a frame under the pointer doesn't catch the wheel in the middle of a glide.
const LENIS_CSS = ".lenis.lenis-smooth iframe{pointer-events:none;}";

let started = null;

// Starts smooth scrolling once per page. Resolves to the Lenis instance, or null when the page scrolls natively.
export function smoothScroll(){
  return started ||= start();
}

async function start(){
  if(window.self !== window.top) return null;
  if(!matchMedia("(hover: hover) and (pointer: fine)").matches) return null;
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  let Lenis;
  try {
    ({ default: Lenis } = await import(LENIS_URL));
  } catch(e){
    console.warn("Smooth scrolling isn't available; the page scrolls normally.", e);
    return null;
  }
  const style = document.createElement("style");
  style.textContent = LENIS_CSS;
  document.head.append(style);
  const lenis = new Lenis({
    autoRaf: true,
    // Text boxes, the sidebar, tables and lists that scroll on their own keep scrolling themselves first.
    allowNestedScroll: true,
    // An open dialog scrolls itself (or not at all), never the page behind it.
    prevent: node => node.tagName === "DIALOG"
  });
  followScrollLocks(lenis);
  return lenis;
}

// Pages stop scrolling with overflow:hidden on <html> or <body>: the templates' intro (html.intro-open),
// Classic's body.locked and the sidebar menu on phones (html.nav-open). Lenis scrolls from script, which
// overflow:hidden doesn't stop, so it pauses while either one is locked.
const locked = node => ["hidden", "clip"].includes(getComputedStyle(node).overflowY);
// Lenis keeps its own state in <html>'s classes (lenis-scrolling and so on); only the page's changes matter.
const ownClasses = value => (value || "").split(/\s+/).filter(c => c && !c.startsWith("lenis")).join(" ");

function followScrollLocks(lenis){
  const check = () => (locked(document.documentElement) || locked(document.body)) ? lenis.stop() : lenis.start();
  const watch = new MutationObserver(records => {
    if(records.some(r => r.attributeName !== "class" || ownClasses(r.oldValue) !== ownClasses(r.target.getAttribute("class")))) check();
  });
  const options = { attributes: true, attributeFilter: ["class", "style"], attributeOldValue: true };
  watch.observe(document.documentElement, options);
  watch.observe(document.body, options);
  check();
}
