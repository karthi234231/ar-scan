import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const COMPILE_URL = "https://hiukim.github.io/mind-ar-js/tools/compile/";
const IMAGE_PATH = path.resolve("assets/targets/IMG_1607.JPG");
const OUTPUT_DIR = path.resolve("assets/targets");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "card.mind");

async function main() {
  console.log("Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  page.on("console", (msg) => console.log(`[browser] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.error(`[browser error] ${err.message}`));

  console.log(`Opening official MindAR compiler: ${COMPILE_URL}`);
  await page.goto(COMPILE_URL, { waitUntil: "networkidle", timeout: 60000 });

  // Wait for the page to load
  await page.waitForTimeout(3000);

  // Find the file input
  console.log("Looking for file input...");
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    // Try to find any input element
    const inputs = await page.$$("input");
    console.log(`Found ${inputs.length} input elements`);
    for (const input of inputs) {
      const type = await input.getAttribute("type");
      console.log(`  - type: ${type}`);
    }
    throw new Error("No file input found on the page");
  }

  console.log(`Uploading ${IMAGE_PATH}...`);
  await fileInput.setInputFiles(IMAGE_PATH);

  // Wait for the image to load and compilation to start
  console.log("Waiting for compilation to complete...");
  await page.waitForTimeout(5000);

  // Look for a "Start" or "Compile" button
  const buttons = await page.$$("button");
  console.log(`Found ${buttons.length} buttons`);
  for (const btn of buttons) {
    const text = await btn.textContent();
    console.log(`  - button: "${text?.trim()}"`);
  }

  // Try clicking a compile/start button
  const compileBtn = await page.$('button:has-text("Start"), button:has-text("Compile"), button:has-text("Generate")');
  if (compileBtn) {
    console.log("Clicking compile button...");
    await compileBtn.click();
  }

  // Wait for download to appear
  console.log("Waiting for download...");
  const downloadPromise = page.waitForEvent("download", { timeout: 300000 });
  const download = await downloadPromise;

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