// The round "back to top" button on the right of every page: the invitations, and the admin, editor, home and
// showcase pages. It shows once the page is scrolled most of a screen down, and glides back up (through Lenis when
// smooth scrolling is on). Its styles come with it, so templates need nothing.
// On the four site pages it sits in the corner dock, the stack of round buttons at the bottom right that the
// assistant's button shares. On an invitation it stands just above the design's music button when that is in the
// same corner, wherever the design put it.
import { smoothScroll } from "./smooth-scroll.js";

// Id selectors, so a template's own rules for button or svg can't restyle it.
const CSS = `
.corner-dock{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:var(--dock-bottom,max(16px,env(safe-area-inset-bottom)));
  z-index:30;display:flex;flex-direction:column;align-items:flex-end;gap:12px;pointer-events:none;}
.corner-dock > *{pointer-events:auto;}
#toTop{box-sizing:border-box;display:grid;place-items:center;width:44px;height:44px;margin:0;padding:0;border-radius:50%;
  cursor:pointer;opacity:0;visibility:hidden;transform:translateY(10px) scale(.92);
  transition:opacity .25s ease,transform .25s ease,visibility 0s linear .25s,background-color .2s,border-color .2s,color .2s;
  -webkit-tap-highlight-color:transparent;}
#toTop.show{opacity:1;visibility:visible;transform:none;transition-delay:0s;}
#toTop svg{display:block;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}
#toTop:focus-visible{outline:2px solid currentColor;outline-offset:3px;}
#toTop.brand{background:#fff;color:#7d1528;border:1px solid #ead9bd;box-shadow:0 6px 18px rgba(74,15,28,.16);}
#toTop.brand:hover{background:#7d1528;color:#f3dfa0;border-color:#7d1528;}
.corner-dock #toTop{margin-right:4px;}
#toTop.glass{position:fixed;z-index:1400;color:#fff;background:rgba(20,16,14,.55);border:1px solid rgba(255,255,255,.35);
  box-shadow:0 6px 18px rgba(0,0,0,.25);-webkit-backdrop-filter:blur(8px) saturate(140%);backdrop-filter:blur(8px) saturate(140%);}
#toTop.glass:hover{background:rgba(20,16,14,.75);}
@media(prefers-reduced-motion:reduce){#toTop,#toTop.show{transition:none;transform:none;}}
`;

function addStyles(){
  if(document.getElementById("toTopStyle")) return;
  const style = document.createElement("style");
  style.id = "toTopStyle";
  style.textContent = CSS;
  document.head.append(style);
}

// The stack of round buttons at the bottom right of the admin, editor, home and showcase pages. A page lifts it
// above a bar fixed to the bottom of the screen by setting --dock-bottom (admin.css does, for the save bar).
let dock = null;
export function cornerDock(){
  if(dock?.isConnected) return dock;
  addStyles();
  dock = document.createElement("div");
  dock.className = "corner-dock";
  document.body.append(dock);
  return dock;
}

// Adds the button. `above` (invitations) returns the element to stand above, the music button, when it is in the
// bottom-right corner; the button then floats on its own with the see-through look that suits any design. Without
// it the button goes into the corner dock with the site's maroon and gold. Returns the button.
export function addScrollTop({ above = null, label = "Back to top" } = {}){
  addStyles();
  document.getElementById("toTop")?.remove();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "toTop";
  btn.className = above ? "glass" : "brand";
  btn.title = label;
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5.5M5.5 11.5 12 5l6.5 6.5"/></svg>';
  if(above) document.body.append(btn);
  else cornerDock().prepend(btn);

  btn.addEventListener("click", async () => {
    // Keyboard users carry on from the top of the page, not from a button that is about to hide.
    btn.blur();
    const lenis = await smoothScroll();
    if(lenis) return lenis.scrollTo(0);
    scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  // The music button may appear, move or go at any time (it waits for the song), so check while showing.
  const place = () => {
    if(!above) return;
    const spot = standAbove(above());
    if(btn.style.right !== spot.right + "px") btn.style.right = spot.right + "px";
    if(btn.style.bottom !== spot.bottom + "px") btn.style.bottom = spot.bottom + "px";
  };
  let shown = false, ticking = false;
  const update = () => {
    ticking = false;
    const on = scrollY > Math.max(320, innerHeight * 0.75);
    if(on) place();
    if(on !== shown) btn.classList.toggle("show", shown = on);
  };
  addEventListener("scroll", () => { if(!ticking){ ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", () => { place(); update(); });
  place();
  update();
  return btn;
}

// Where the floating button goes: centred over a fixed button in the bottom-right corner, 12px above it, or in the
// corner itself. Layout sizes (offset*) ignore the transforms of a spinning or swaying music button, and the
// viewport is measured without its scroll bar, as fixed positions are.
function standAbove(node){
  const size = 44, gap = 12, corner = { right: 16, bottom: 16 };
  if(!node || !node.getClientRects().length || getComputedStyle(node).position !== "fixed") return corner;
  const { clientWidth: width, clientHeight: height } = document.documentElement;
  const right = width - (node.offsetLeft + node.offsetWidth);
  const bottom = height - (node.offsetTop + node.offsetHeight);
  if(right > width / 2 || bottom > 200) return corner;
  return {
    right: Math.max(8, Math.round(right + (node.offsetWidth - size) / 2)),
    bottom: Math.round(bottom + node.offsetHeight + gap)
  };
}
