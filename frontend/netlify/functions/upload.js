const { getStore } = require("@netlify/blobs");
const path = require("path");

// Persistent Netlify Blob store for uploaded assets
// This persists across function invocations
const STORE_NAME = "ar-assets-store";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const payload = JSON.parse(event.body);
    const { imageBase64, videoBase64, cardName, cardId, mindBase64 } = payload;
    if (!videoBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "videoBase64 is required" }) };
    }

    const id = cardId || `card-${Date.now()}`;
    const name = cardName || id;
    const store = getStore(STORE_NAME);

    // Normalize name: lowercase, alphanumeric + dashes only
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || id;

    // Store video
    const videoBuffer = Buffer.from(videoBase64, "base64");
    await store.set(`videos/${safeName}.mp4`, videoBuffer, {
      contentType: "video/mp4",
      metadata: { id, cardName: name },
    });

    // Store poster (either from uploaded image or generate later)
    let posterKey = null;
    if (imageBase64) {
      const imageBuffer = Buffer.from(imageBase64, "base64");
      const ext = sniffImageExt(imageBuffer);
      posterKey = `posters/${safeName}${ext}`;
      await store.set(posterKey, imageBuffer, {
        contentType: ext === ".png" ? "image/png" : "image/jpeg",
        metadata: { id, cardName: name },
      });
    }

    // Store target image (for reference / future compilation)
    let targetImageKey = null;
    if (imageBase64) {
      const imageBuffer = Buffer.from(imageBase64, "base64");
      const ext = sniffImageExt(imageBuffer);
      targetImageKey = `targets/${safeName}-image${ext}`;
      await store.set(targetImageKey, imageBuffer, {
        contentType: ext === ".png" ? "image/png" : "image/jpeg",
        metadata: { id, cardName: name },
      });
    }

    // Store .mind target if provided
    let mindKey = null;
    if (mindBase64) {
      const mindBuffer = Buffer.from(mindBase64, "base64");
      mindKey = `targets/${safeName}.mind`;
      await store.set(mindKey, mindBuffer, {
        contentType: "application/octet-stream",
        metadata: { id, cardName: name },
      });
    }

    // Read current manifest
    let manifest = null;
    try {
      const existing = await store.get("manifest.json", { type: "json" });
      manifest = existing;
    } catch {
      manifest = null;
    }

    if (!manifest) {
      manifest = { version: 1, targetSrc: "./assets/targets/card.mind", experiences: [] };
    }

    const targetIndex = manifest.experiences.length;

    // If first card and no .mind provided, keep card.mind reference
    const targetSrc = mindKey
      ? `./assets/targets/${safeName}.mind`
      : manifest.experiences.length === 0
        ? "./assets/targets/card.mind"
        : manifest.targetSrc;

    // Use the file-serving endpoint URLs so the scanner can fetch them
    manifest.experiences.push({
      id,
      targetIndex,
      videoMp4Src: `/.netlify/functions/files?key=videos/${safeName}.mp4`,
      videoWebmSrc: null,
      posterSrc: posterKey ? `/.netlify/functions/files?key=${posterKey}` : null,
      cardAspectRatio: 0.714,
      videoAspectRatio: 1.0, // detected client-side from video metadata
      overlayWidth: 0.6,
      overlayXOffset: 0,
      overlayYOffset: 0.1,
      overlayZOffset: 0.05,
      coverFullCard: false,
    });

    // Target src default to the first available .mind
    manifest.targetSrc = targetSrc;

    // Save manifest
    await store.set("manifest.json", JSON.stringify(manifest), {
      contentType: "application/json",
    });

    // Build response with file URLs via the files function
    const base = "/.netlify/functions/files";

    const result = {
      success: true,
      id,
      name: safeName,
      targetIndex,
      manifest: {
        version: manifest.version,
        targetSrc: manifest.targetSrc,
        experiences: manifest.experiences.map((e, i) => ({
          ...e,
          videoMp4Src: e.videoMp4Src,
          posterSrc: e.posterSrc,
        })),
      },
      urls: {
        video: `${base}?key=videos/${safeName}.mp4`,
        poster: posterKey ? `${base}?key=${posterKey}` : null,
        manifest: "/.netlify/functions/files?key=manifest.json",
      },
      message: `Uploaded ${name}. Target index ${targetIndex}`,
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(error.message || error) }),
    };
  }
};

function sniffImageExt(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return ".png";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return ".webp";
  return ".jpg";
}