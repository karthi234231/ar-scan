const response = await fetch("https://api.github.com/repos/hiukim/mind-ar-js/contents/src/image-target", {
  headers: { "User-Agent": "Mozilla/5.0" },
});
const data = await response.json();
if (Array.isArray(data)) {
  for (const item of data) {
    console.log(`  ${item.type}: ${item.name}`);
  }
} else {
  console.log("Response:", JSON.stringify(data, null, 2).slice(0, 2000));
}