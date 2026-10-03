// The link-preview image for a wedding: /api/og-image?w=<wedding>&v=<version>.
// Photos are stored in Firestore as data URLs, so this turns one back into an image file.
// Uses the small JPEG made for previews ("og"), else the cover photo, else the generic card.
const { getDoc, isValidSlug } = require("./_firestore");

module.exports = async (req, res) => {
  const slug = new URL(req.url, "http://localhost").searchParams.get("w") || "";
  try {
    if(isValidSlug(slug)){
      for(const id of ["og", "cover"]){
        const img = await getDoc(`weddings/${slug}/images/${id}`, ["dataUrl"]);
        const m = /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec((img && img.dataUrl) || "");
        if(!m) continue;
        const bytes = Buffer.from(m[2], "base64");
        res.statusCode = 200;
        res.setHeader("Content-Type", m[1]);
        res.setHeader("Content-Length", bytes.length);
        // The URL carries the image version, so a new photo gets a new URL.
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.end(bytes);
      }
    }
  } catch(e){
    console.error("preview image failed", slug, e);
  }
  res.statusCode = 302;
  res.setHeader("Location", "/assets/og-cover.jpg");
  res.setHeader("Cache-Control", "public, s-maxage=300");
  res.end();
};
