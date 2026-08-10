// Node.js MindAR target compiler using official source + pure-JS canvas shim
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jpeg from "jpeg-js";
import * as tf from "@tensorflow/tfjs";
import * as msgpack from "@msgpack/msgpack";
import * as mathjs from "mathjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "package/src/image-target");

// --- 1. Load all source files ---
const load = (p) => readFileSync(path.join(SRC, p), "utf8");

const compilerBaseSrc = load("compiler-base.js");
const imageListSrc = load("image-list.js");
const offlineCompilerSrc = load("offline-compiler.js");
const detectorSrc = load("detector/detector.js");
const freakSrc = load("detector/freak.js");
const hierarchicalSrc = load("matching/hierarchical-clustering.js");
const hammingSrc = load("matching/hamming-distance.js");
const extractUtilsSrc = load("tracker/extract-utils.js");
const extractSrc = load("tracker/extract.js");
const imagesUtilsSrc = load("utils/images.js");
const randomizerSrc = load("utils/randomizer.js");
const cumsumSrc = load("utils/cumsum.js");
const geometrySrc = load("utils/geometry.js");
const homographySrc = load("utils/homography.js");

// --- 2. Load CPU kernels ---
const cpuKernelDir = path.join(SRC, "detector/kernels/cpu");
const loadKernel = (p) => readFileSync(path.join(cpuKernelDir, p), "utf8");

const cpuIndexSrc = loadKernel("index.js");
const binomialFilterSrc = loadKernel("binomialFilter.js");
const buildExtremasSrc = loadKernel("buildExtremas.js");
const computeExtremaAnglesSrc = loadKernel("computeExtremaAngles.js");
const computeExtremaFreakSrc = loadKernel("computeExtremaFreak.js");
const computeFreakDescriptorsSrc = loadKernel("computeFreakDescriptors.js");
const computeLocalizationSrc = loadKernel("computeLocalization.js");
const computeOrientationHistogramsSrc = loadKernel("computeOrientationHistograms.js");
const downsampleBilinearSrc = loadKernel("downsampleBilinear.js");
const extremaReductionSrc = loadKernel("extremaReduction.js");
const fakeShaderSrc = loadKernel("fakeShader.js");
const pruneSrc = loadKernel("prune.js");
const smoothHistogramsSrc = loadKernel("smoothHistograms.js");
const upsampleBilinearSrc = loadKernel("upsampleBilinear.js");

// --- 3. Pure-JS canvas shim (no native deps) ---
// Provides createCanvas(w,h) with getContext('2d') supporting
// drawImage(img, 0, 0, w, h) and getImageData(0, 0, w, h)
function createCanvasShim() {
  function makeCanvas(width, height) {
    const canvas = {
      width,
      height,
      _imageData: null,
      getContext(type) {
        if (type !== "2d") return null;
        return {
          drawImage(img, dx, dy, dw, dh) {
            // img is {width, height, data} (RGBA Uint8Array)
            canvas._imageData = img.data;
            canvas.width = dw || img.width;
            canvas.height = dh || img.height;
          },
          getImageData(sx, sy, sw, sh) {
            const data = new Uint8ClampedArray(sw * sh * 4);
            if (canvas._imageData) {
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
      const buffer = readFileSync(src);
      const raw = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
      return Promise.resolve({
        width: raw.width,
        height: raw.height,
        data: raw.data,
      });
    },
  };
}

const canvasShim = createCanvasShim();

// --- 4. Module registry + loader ---
const modules = new Map();
function registerModule(name, code) {
  modules.set(name, code);
}

registerModule("utils/images", imagesUtilsSrc);
registerModule("utils/randomizer", randomizerSrc);
registerModule("utils/cumsum", cumsumSrc);
registerModule("utils/geometry", geometrySrc);
registerModule("utils/homography", homographySrc);
registerModule("matching/hamming-distance", hammingSrc);
registerModule("matching/hierarchical-clustering", hierarchicalSrc);
registerModule("tracker/extract", extractSrc);
registerModule("tracker/extract-utils", extractUtilsSrc);
registerModule("image-list", imageListSrc);
registerModule("detector/freak", freakSrc);
registerModule("detector/detector", detectorSrc);
registerModule("compiler-base", compilerBaseSrc);
registerModule("offline-compiler", offlineCompilerSrc);

registerModule("detector/kernels/cpu/fakeShader", fakeShaderSrc);
registerModule("detector/kernels/cpu/binomialFilter", binomialFilterSrc);
registerModule("detector/kernels/cpu/buildExtremas", buildExtremasSrc);
registerModule("detector/kernels/cpu/computeExtremaAngles", computeExtremaAnglesSrc);
registerModule("detector/kernels/cpu/computeExtremaFreak", computeExtremaFreakSrc);
registerModule("detector/kernels/cpu/computeFreakDescriptors", computeFreakDescriptorsSrc);
registerModule("detector/kernels/cpu/computeLocalization", computeLocalizationSrc);
registerModule("detector/kernels/cpu/computeOrientationHistograms", computeOrientationHistogramsSrc);
registerModule("detector/kernels/cpu/downsampleBilinear", downsampleBilinearSrc);
registerModule("detector/kernels/cpu/extremaReduction", extremaReductionSrc);
registerModule("detector/kernels/cpu/prune", pruneSrc);
registerModule("detector/kernels/cpu/smoothHistograms", smoothHistogramsSrc);
registerModule("detector/kernels/cpu/upsampleBilinear", upsampleBilinearSrc);
registerModule("detector/kernels/cpu/index", cpuIndexSrc);

function createModuleLoader() {
  const cache = new Map();

  function loadModule(name) {
    if (cache.has(name)) return cache.get(name);

    const code = modules.get(name);
    if (!code) throw new Error(`Module not found: ${name}`);

    const module = { exports: {} };
    cache.set(name, module.exports);

    // Transform ES imports/exports to CommonJS
    const transformed = code
      .replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require("$2");')
      .replace(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g, 'const { $1 } = require("$2");')
      .replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require("$2");')
      .replace(/import\s+['"]([^'"]+)['"]/g, 'require("$1");')
      .replace(/export\s+const\s+(\w+)\s*=/g, 'const $1 =')
      .replace(/export\s+class\s+(\w+)/g, 'class $1')
      .replace(/export\s+\{([^}]+)\}/g, 'module.exports = { $1 };')
      .replace(/export\s+default\s+(\w+)/g, 'module.exports = $1;');

    const require = (dep) => {
      if (dep === "@tensorflow/tfjs") return tf;
      if (dep === "@msgpack/msgpack") return msgpack;
      if (dep === "mathjs") return mathjs;
      if (dep === "canvas") return canvasShim;
      if (dep.startsWith("./")) {
        const resolved = resolveModule(name, dep);
        return loadModule(resolved);
      }
      throw new Error(`Unknown dependency: ${dep}`);
    };

    const fn = new Function("require", "module", "exports", transformed);
    fn(require, module, module.exports);

    return module.exports;
  }

  function resolveModule(from, dep) {
    const fromParts = from.split("/");
    const depParts = dep.replace("./", "").replace(/\.js$/, "").split("/");
    const base = fromParts.slice(0, -1);
    return [...base, ...depParts].join("/");
  }

  return loadModule;
}

// --- 5. Load compiler ---
const loadModule = createModuleLoader();

// Register CPU kernels first
loadModule("detector/kernels/cpu/index");

// Load the OfflineCompiler
const { OfflineCompiler } = loadModule("offline-compiler");

// --- 6. Compile ---
const IMAGE_PATH = path.resolve("assets/targets/IMG_1607.JPG");
const OUTPUT_PATH = path.resolve("assets/targets/card.mind");

async function main() {
  console.log("Loading image...");
  const img = await canvasShim.loadImage(IMAGE_PATH);
  console.log(`Image: ${img.width}x${img.height}`);

  console.log("Creating compiler...");
  const compiler = new OfflineCompiler();

  console.log("Compiling (this may take 30-120s)...");
  await compiler.compileImageTargets([img], (progress) => {
    process.stdout.write(`\rProgress: ${progress.toFixed(1)}%`);
  });
  console.log("\nCompilation done!");

  console.log("Exporting data...");
  const buffer = compiler.exportData();

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, Buffer.from(buffer));
  console.log(`✅ card.mind saved to ${OUTPUT_PATH} (${buffer.length} bytes)`);
}

main().catch((err) => {
  console.error("\n❌ Compilation failed:", err);
  process.exit(1);
});