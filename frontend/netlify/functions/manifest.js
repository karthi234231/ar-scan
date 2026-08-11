const { getStore } = require("@netlify/blobs");

const STORE_NAME = "ar-assets-store";

exports.handler = async (event) => {
  try {
    const store = getStore(STORE_NAME);
    const manifest = await store.get("manifest.json", { type: "json" });

    if (!manifest) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          version: 1,
          targetSrc: "./assets/targets/card.mind",
          experiences: [],
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(manifest),
    };
  } catch (error) {
    console.error("Manifest error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};