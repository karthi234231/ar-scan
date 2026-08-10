\
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const COMPILE_URL = "http://localhost:8080/compile-card.html";
const OUTPUT_DIR = path.resolve("assets/targets");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "card.mind");

async function main() {
  console.log("Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Capture console + errors
  page.on("console", (msg) => console.log(`[browser] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.error(`[browser error] ${err.message}`));

  console.log(`Opening ${COMPILE_URL}...`);
  await page.goto(COMPILE_URL, { waitUntil: "networkidle", timeout: 60000 });

  // Wait for the compile button
  await page.waitForSelector("#compile-btn", { timeout: 30000 });
  console.log("Compile button found. Clicking...");

  // Set up download promise BEFORE clicking
  const downloadPromise = page.waitForEvent("download", { timeout: 300000 });

  await page.click("#compile-btn");

  console.log("Waiting for compilation to finish (may take 30-120s)...");

  // Wait for progress text to indicate completion
  await page.waitForFunction(
    () => document.getElementById("progress").textContent.includes("Done"),
    { timeout: 300000 },
  );

  console.log("Compilation done! Waiting for download...");
  const download = await downloadPromise;

  // Save the downloaded file
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await download.saveAs(OUTPUT_FILE);

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`✅ card.mind saved to ${OUTPUT_FILE} (${stats.size} bytes)`);

  await browser.close();
  console.log("Done!");
}

main().catch((err) => {
  console.error("❌ Compilation failed:", err);
  process.exit(1);
});