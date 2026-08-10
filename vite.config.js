import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    port: 8080,
    host: true,
  },
  resolve: {
    alias: [
      // MindAR's internal import: "three/addons/renderers/CSS3DRenderer.js"
      {
        find: "three/addons/renderers/CSS3DRenderer.js",
        replacement: resolve("vendor/three-addons/renderers/CSS3DRenderer.js"),
      },
      {
        find: "three/addons/",
        replacement: resolve("vendor/three-addons"),
      },
      {
        find: "three",
        replacement: resolve("vendor/three.module.js"),
      },
      {
        find: "mindar-image-three",
        replacement: resolve("vendor/mindar-image-three.prod.js"),
      },
    ],
  },
  optimizeDeps: {
    exclude: ["@maherboughdiri/mind-ar-compiler"],
  },
  ssr: {
    noExternal: ["three", "mindar-image-three"],
  },
  build: {
    rollupOptions: {
      external: [],
    },
  },
});