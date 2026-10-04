// Serves the invitation page for /<event> (see the rewrite in vercel.json): the event's template
// (templates/<id> in Firestore), or the Classic index.html, with the event's names and cover photo in the
// link-preview tags. WhatsApp and Facebook read these tags without running JavaScript, so they have to be
// in the HTML itself. js/invite.js then loads the details as usual.
const fs = require("fs");
const path = require("path");
const { getDoc, isValidSlug, isValidId } = require("./_firestore");

const CLASSIC = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
const OG_BLOCK = /<!-- og:start -->[\s\S]*?<!-- og:end -->/;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const en = v => (v && typeof v === "object" ? v.en || "" : v || "").trim();

// The rewrite passes ?slug=; fall back to the original path in case only that arrives.
function slugFrom(req){
  const url = new URL(req.url, "http://localhost");
  const fromPath = url.pathname.startsWith("/api/") ? "" : url.pathname.split("/").pop();
  return (req.query && req.query.slug) || url.searchParams.get("slug") || fromPath || "";
}

function send(res, status, html, cache){
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(html);
}

// The generic page, still telling invite.js which event was asked for
// (it shows "invitation not found" itself when the event doesn't exist).
const genericPage = slug =>
  CLASSIC.replace("<!-- og:end -->", () => `<meta name="wedding-id" content="${esc(slug)}">\n<!-- og:end -->`);

// A template page with the preview tags in place of its own, and the runtime script added.
function templatePage(html, block, templateId){
  let page = html
    .replace(OG_BLOCK, "")
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(?:name|property)=["'](?:description|og:[^"']*|twitter:[^"']*)["'][^>]*>\s*/gi, "");
  const head = `${block}\n<meta name="template-id" content="${esc(templateId)}">\n`;
  page = /<head[^>]*>/i.test(page) ? page.replace(/<head[^>]*>/i, m => m + "\n" + head) : head + page;
  const script = `<script type="module" src="js/invite.js"></script>\n`;
  const end = page.toLowerCase().lastIndexOf("</body>");
  return end < 0 ? page + script : page.slice(0, end) + script + page.slice(end);
}

module.exports = async (req, res) => {
  const slug = slugFrom(req);
  if(!isValidSlug(slug)) return send(res, 404, genericPage(slug), "public, s-maxage=60");

  let w;
  try {
    w = await getDoc(`weddings/${slug}`, ["groomName", "brideName", "heroDateLine", "images", "title", "category", "templateId"]);
  } catch(e){
    console.error("event lookup failed", slug, e);
    return send(res, 200, genericPage(slug), "no-store");
  }
  if(!w) return send(res, 404, genericPage(slug), "public, s-maxage=60");

  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const origin = `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const groom = en(w.groomName), bride = en(w.brideName), dateLine = en(w.heroDateLine);
  const wedding = (w.category || "wedding") === "wedding";
  const names = [groom, bride].filter(Boolean).join(" & ");
  const title = en(w.title) || (wedding && groom && bride ? `${groom} weds ${bride}` : names) || "Invitation";
  const invite = wedding ? "Together with our families, we invite you to celebrate with us" : "You're invited to celebrate with us";
  const description = dateLine ? `${invite} — ${dateLine}` : invite + ".";
  const imgV = w.images && (w.images.og || w.images.cover);
  const image = imgV ? `${origin}/api/og-image?w=${slug}&v=${imgV}` : `${origin}/assets/og-cover.jpg`;

  const block = `<!-- og:start -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(`${origin}/${slug}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="wedding-id" content="${esc(slug)}">
<!-- og:end -->`;
  const cache = "public, s-maxage=300, stale-while-revalidate=86400";

  // The event's template; if it was deleted or can't be read, Classic (invite.js switches designs if needed).
  const templateId = w.templateId || "";
  if(isValidId(templateId)){
    try {
      const t = await getDoc(`templates/${templateId}`, ["html"]);
      if(t && t.html) return send(res, 200, templatePage(t.html, block, templateId), cache);
    } catch(e){
      console.error("template lookup failed", templateId, e);
    }
  }
  send(res, 200, CLASSIC.replace(OG_BLOCK, () => block), cache);
};
