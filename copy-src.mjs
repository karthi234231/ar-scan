import fs from "fs";
import path from "path";

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyDir("package/src/image-target", "compile-src");
console.log("Source files copied to compile-src/");

// List what was copied
function listDir(dir, prefix = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    console.log(prefix + entry.name + (entry.isDirectory() ? "/" : ""));
    if (entry.isDirectory()) {
      listDir(path.join(dir, entry.name), prefix + "  ");
    }
  }
}
listDir("compile-src");
