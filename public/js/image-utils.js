// Resize + compress an uploaded photo in the browser so it fits inside a single
// Firestore document (1 MiB hard limit; we stay under ~900 KB of base64 text).

const webpSupported = (() => {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch { return false; }
})();

function loadImage(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file can't be read as an image. Use a JPG, PNG or WebP (iPhone HEIC photos must be converted first)."));
    };
    img.src = url;
  });
}

/**
 * @param {Blob} file
 * @param {{maxDim?: number, maxChars?: number, alpha?: boolean, type?: string}} opts
 *   maxDim   longest side in pixels
 *   maxChars budget for the resulting data URL
 *   alpha    keep transparency (deity image, icons) when WebP isn't available
 *   type     force an output format, e.g. "image/jpeg" for link previews
 * @returns {Promise<{dataUrl: string, w: number, h: number}>}
 */
export async function compressImage(file, { maxDim = 1600, maxChars = 900_000, alpha = false, type: forced = "" } = {}){
  const img = await loadImage(file);
  const type = forced || (webpSupported ? "image/webp" : (alpha ? "image/png" : "image/jpeg"));
  let scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));

  for(let attempt = 0; attempt < 8; attempt++){
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if(type === "image/jpeg"){ ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    for(const q of [0.9, 0.82, 0.74, 0.66, 0.58]){
      const dataUrl = canvas.toDataURL(type, q);
      if(dataUrl.length <= maxChars) return { dataUrl, w, h };
      if(type === "image/png") break; // PNG ignores quality; only shrinking helps
    }
    scale *= 0.8;
  }
  throw new Error("Image is still too large after compression — please try a smaller photo.");
}

// Small JPEG copy of the cover photo for WhatsApp/Facebook link previews,
// which want a JPEG well under 300 KB.
export const compressPreviewImage = file => compressImage(file, { maxDim: 1200, maxChars: 300_000, type: "image/jpeg" });

export const kb = dataUrl => Math.round(dataUrl.length * 0.75 / 1024);
