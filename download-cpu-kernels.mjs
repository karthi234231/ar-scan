// Download CPU kernels from the official MindAR repo
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = "https://raw.githubusercontent.com/hiukim/mind-ar-js/master/src/image-target/detector/kernels/cpu";
const files = [
  "index.js",
  "BinomialFilter.js",
  "BuildExtremas.js",
  "ComputeLocalization.js",
  "ComputeOrientationHistograms.js",
  "ComputeExtremaAngles.js",
  "ComputeExtremaFreak.js",
  "ComputeFreakDescriptors.js",
  "ExtremaReduction.js",
  "SmoothHistograms.js",
];

const outputDir = path.resolve("node_modules/@maherboughdiri/mind-ar-compiler/assets/detector/kernels/cpu");
mkdirSync(outputDir, { recursive: true });

for (const file of files) {
  const url = `${BASE}/${file}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.log(`❌ ${file} (${resp.status})`);
    continue;
  }
  const text = await resp.text();
  writeFileSync(path.join(outputDir, file), text);
  console.log(`✅ ${file} (${(text.length / 1024).toFixed(1)} KB)`);
}

console.log("All CPU kernels downloaded!");