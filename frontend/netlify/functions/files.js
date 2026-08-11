const { getStore } = require("@netlify/blobs");

const STORE_NAME = "ar-assets-store";

exports.handler = async (event) => {
  const key = event.queryStringParameters?.key;
  if (!key) {
    return { statusCode: 400, body: JSON.stringify({ error: "key query param required" }) };
  }

  try {
    const store = getStore(STORE_NAME);
    const blob = await store.get(key);

    if (!blob) {
      return { statusCode: 404, body: JSON.stringify({ error: `Not found: ${key}` }) };
    }

    const data = await blob.arrayBuffer();
    const contentType = blob.contentType || "application/octet-stream";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
      body: Buffer.from(data).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error("File serve error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};