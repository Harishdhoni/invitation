// Serves the invitation page for /<wedding> (see the rewrite in vercel.json) with that
// wedding's names and cover photo in the link-preview tags. WhatsApp and Facebook read
// these tags without running JavaScript, so they have to be in the HTML itself.
// The rest of the page is the same static index.html; invite.js loads the details as usual.
const fs = require("fs");
const path = require("path");
const { getDoc, isValidSlug } = require("./_firestore");

const TEMPLATE = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
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

// The generic page, still telling invite.js which wedding was asked for
// (it shows "invitation not found" itself when the wedding doesn't exist).
const genericPage = slug =>
  TEMPLATE.replace("<!-- og:end -->", () => `<meta name="wedding-id" content="${esc(slug)}">\n<!-- og:end -->`);

module.exports = async (req, res) => {
  const slug = slugFrom(req);
  if(!isValidSlug(slug)) return send(res, 404, genericPage(slug), "public, s-maxage=60");

  let w;
  try {
    w = await getDoc(`weddings/${slug}`, ["groomName", "brideName", "heroDateLine", "images"]);
  } catch(e){
    console.error("wedding lookup failed", slug, e);
    return send(res, 200, genericPage(slug), "no-store");
  }
  if(!w) return send(res, 404, genericPage(slug), "public, s-maxage=60");

  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const origin = `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const groom = en(w.groomName), bride = en(w.brideName), dateLine = en(w.heroDateLine);
  const title = groom || bride ? `${groom} weds ${bride}`.trim() : "Wedding Invitation";
  const description = dateLine
    ? `Together with our families, we invite you to celebrate with us — ${dateLine}`
    : "Together with our families, we invite you to celebrate with us.";
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

  send(res, 200, TEMPLATE.replace(OG_BLOCK, () => block), "public, s-maxage=300, stale-while-revalidate=86400");
};
