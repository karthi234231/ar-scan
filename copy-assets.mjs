import { cpSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

const src = "assets";
const dst = "dist/assets";

if (!existsSync(dst)) {
  mkdirSync(dst, { recursive: true });
}

function copyDir(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const from = join(dir, entry);
    const to = join(dst, entry);
    cpSync(from, to, { recursive: true });
  }
}

copyDir(src);
console.log("Assets copied to dist/assets/");