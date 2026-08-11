import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 8080,
    host: true,
  },
  resolve: {
    alias: [
      {
        find: "three/addons/renderers/CSS3DRenderer.js",
        replacement: fileURLToPath(new URL("./src/vendor/three-addons/renderers/CSS3DRenderer.js", import.meta.url)),
      },
      {
        find: "three/addons/",
        replacement: fileURLToPath(new URL("./src/vendor/three-addons", import.meta.url)),
      },
      {
        find: "three",
        replacement: fileURLToPath(new URL("./src/vendor/three.module.js", import.meta.url)),
      },
      {
        find: "mindar-image-three",
        replacement: fileURLToPath(new URL("./src/vendor/mindar-image-three.prod.js", import.meta.url)),
      },
    ],
  },
  optimizeDeps: {
    exclude: ["@maherboughdiri/mind-ar-compiler"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      external: [],
    },
  },
});