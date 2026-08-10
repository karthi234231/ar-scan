// Download the official MindAR compiler source files from GitHub
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = "https://raw.githubusercontent.com/hiukim/mind-ar-js/master/src/image-target";
const files = [
  "compiler-base.js",
  "image-list.js",
  "offline-compiler.js",
  "detector/detector.js",
  "detector/freak.js",
  "detector/kernels/cpu/index.js",
  "detector/kernels/cpu/BinomialFilter.js",
  "detector/kernels/cpu/BuildExtremas.js",
  "detector/kernels/cpu/ComputeLocalization.js",
  "detector/kernels/cpu/ComputeOrientationHistograms.js",
  "detector/kernels/cpu/ComputeExtremaAngles.js",
  "detector/kernels/cpu/ComputeExtremaFreak.js",
  "detector/kernels/cpu/ComputeFreakDescriptors.js",
  "detector/kernels/cpu/ExtremaReduction.js",
  "detector/kernels/cpu/SmoothHistograms.js",
  "matching/hierarchical-clustering.js",
  "tracker/extract-utils.js",
  "tracker/extract.js",
  "tracker/tracker.js",
  "utils/images.js",
  "utils/geometry.js",
  "utils/homography.js",
  "utils/cumsum.js",
  "utils/randomizer.js",
];

const outputDir = path.resolve("mindar-compiler-src");
mkdirSync(outputDir, { recursive: true });

let ok = 0;
let fail = 0;

for (const file of files) {
  const url = `${BASE}/${file}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.log(`❌ ${file} (${resp.status})`);
    fail++;
    continue;
  }
  const text = await resp.text();
  const outPath = path.join(outputDir, file);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, text);
  console.log(`✅ ${file} (${(text.length / 1024).toFixed(1)} KB)`);
  ok++;
}

console.log(`\nDownloaded ${ok} files, ${fail} failed.`);