// Node.js MindAR target compiler using the official OfflineCompiler
// with a pure-JS canvas shim (no native `canvas` package needed).
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- 1. Minimal canvas shim (pure JS, no native deps) ---
import jpeg from "jpeg-js";

function decodeImage(filePath) {
  const buffer = readFileSync(filePath);
  const raw = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
  return {
    width: raw.width,
    height: raw.height,
    data: raw.data, // RGBA Uint8Array
  };
}

// Canvas shim: provides createCanvas(w,h) with getContext('2d')
// that supports drawImage(img, 0, 0, w, h) and getImageData(0,0,w,h)
function createCanvasShim() {
  function makeCanvas(width, height, imageData = null) {
    const canvas = {
      width,
      height,
      getContext(type) {
        if (type !== "2d") return null;
        return {
          drawImage(img, dx, dy, dw, dh) {
            // img is our decoded image object {width, height, data}
            canvas._imageData = img.data;
            canvas.width = dw || img.width;
            canvas.height = dh || img.height;
          },
          getImageData(sx, sy, sw, sh) {
            const data = new Uint8ClampedArray(sw * sh * 4);
            if (canvas._imageData) {
              // Simple nearest-neighbor scale from source to dest
              const srcW = canvas.width;
              const srcH = canvas.height;
              for (let y = 0; y < sh; y++) {
                for (let x = 0; x < sw; x++) {
                  const srcX = Math.min(Math.floor((x / sw) * srcW), srcW - 1);
                  const srcY = Math.min(Math.floor((y / sh) * srcH), srcH - 1);
                  const srcIdx = (srcY * srcW + srcX) * 4;
                  const dstIdx = (y * sw + x) * 4;
                  data[dstIdx] = canvas._imageData[srcIdx];
                  data[dstIdx + 1] = canvas._imageData[srcIdx + 1];
                  data[dstIdx + 2] = canvas._imageData[srcIdx + 2];
                  data[dstIdx + 3] = canvas._imageData[srcIdx + 3];
                }
              }
            }
            return { data, width: sw, height: sh };
          },
        };
      },
    };
    return canvas;
  }

  return {
    createCanvas(width, height) {
      return makeCanvas(width, height);
    },
    loadImage(src) {
      // src is a path to a JPEG file
      const { width, height, data } = decodeImage(src);
      return Promise.resolve({ width, height, data });
    },
  };
}

// --- 2. Load the compiler source files ---
import { readFileSync } from "fs";

// Read the compiler source from the installed package
const compilerBaseSrc = readFileSync(
  path.join(__dirname, "node_modules/@maherboughdiri/mind-ar-compiler/assets/compiler-base.js"),
  "utf8",
);
const imageListSrc = readFileSync(
  path.join(__dirname, "node_modules/@maherboughdiri/mind-ar-compiler/assets/image-list.js"),
  "utf8",
);
const extractUtilsSrc = readFileSync(
  path.join(__dirname, "node_modules/@maherboughdiri/mind-ar-compiler/assets/tracker/extract-utils.js"),
  "utf8",
);
const extractSrc = readFileSync(
  path.join(__dirname, "node_modules/@maherboughdiri/mind-ar-compiler/assets/tracker/extract.js"),
  "utf8",
);
const detectorSrc = readFileSync(
  path.join(__dirname, "node_modules/@maherboughdiri/mind-ar-compiler/assets/detector/detector.js"),
  "utf8",
);
const hierarchicalSrc = readFileSync(
  path.join(__dirname, "node_modules/@maherboughdiri/mind-ar-compiler/assets/matching/hierarchical-clustering.js"),
  "utf8",
);
const imagesUtilsSrc = readFileSync(
  path.join(__dirname, "node_modules/@maherboughdiri/mind-ar-compiler/assets/utils/images.js"),
  "utf8",
);

// --- 3. Set up the module system ---
// We'll use a simple module loader that handles the ES module imports
// by creating a virtual module system.

// Create a module registry
const modules = new Map();

function registerModule(name, code) {
  modules.set(name, code);
}

// Register all modules with their dependencies rewritten
registerModule("images", imagesUtilsSrc);
registerModule("hierarchical-clustering", hierarchicalSrc);
registerModule("extract", extractSrc);
registerModule("extract-utils", extractUtilsSrc);
registerModule("image-list", imageListSrc);
registerModule("detector", detectorSrc);
registerModule("compiler-base", compilerBaseSrc);

// --- 4. Create the OfflineCompiler ---
// The OfflineCompiler extends CompilerBase and overrides:
// - createProcessCanvas(img) -> uses canvas shim
// - compileTrack() -> uses CPU kernels (no WebGL)

// We'll implement it directly using the source logic
import * as tf from "@tensorflow/tfjs";

// Load the CPU kernels
// The detector imports './kernels/webgl/index.js' which registers WebGL kernels.
// For CPU, we need './kernels/cpu/index.js' from the official repo.
// Let's check if the installed package has CPU kernels.

console.log("Checking for CPU kernels...");
try {
  const cpuKernelSrc = readFileSync(
    path.join(__dirname, "node_modules/@maherboughdiri/mind-ar-compiler/assets/detector/kernels/cpu/index.js"),
    "utf8",
  );
  console.log("CPU kernels found!");
  // Evaluate it
  // This registers kernels with tf.engine()
  // We need to eval it in a context where `tf` is available
  const fn = new Function("tf", cpuKernelSrc);
  fn(tf);
} catch (e) {
  console.log("CPU kernels not found in installed package:", e.message);
  console.log("Will need to download from official repo.");
}

console.log("Setup complete. Ready to compile.");