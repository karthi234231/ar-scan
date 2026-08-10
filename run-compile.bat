@echo off
cd /d "%~dp0"

:: 1. Create node_modules/canvas shim
echo Creating canvas shim in node_modules...
mkdir node_modules\canvas 2>nul
copy /Y compile-src\canvas.js node_modules\canvas\index.js >nul 2>&1
echo {"type":"module"} > node_modules\canvas\package.json
echo Canvas shim created

:: 2. Create compile entry script
echo Creating compile entry script...
>compile-src\compile-entry.mjs (
echo import { OfflineCompiler } from "../../package/src/image-target/offline-compiler.js";
echo import { loadImage } from "../../compile-src/canvas.js";
echo import { writeFileSync, mkdirSync } from "fs";
echo import path from "path";
echo.
echo const IMAGE_PATH = path.resolve("assets/targets/IMG_1607.JPG");
echo const OUTPUT_PATH = path.resolve("assets/targets/card.mind");
echo.
echo async function main() {
echo   console.log("Loading image...");
echo   const img = await loadImage(IMAGE_PATH);
echo   console.log("Image: " + img.width + "x" + img.height);
echo.
echo   console.log("Compiling...");
echo   const compiler = new OfflineCompiler();
echo   await compiler.compileImageTargets([img], (p) => {
echo     process.stdout.write("\rProgress: " + p.toFixed(1) + "%");
echo   });
echo   console.log("");
echo   console.log("Exporting...");
echo   const buffer = compiler.exportData();
echo   mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
echo   writeFileSync(OUTPUT_PATH, Buffer.from(buffer));
echo   console.log("DONE: " + OUTPUT_PATH + " (" + buffer.length + " bytes)");
echo }
echo.
echo main().catch(e => { console.error(e); process.exit(1); });
)
echo Compile entry created

:: 3. Copy source files using Node
echo Copying source files...
node -e "const fs=require('fs'),path=require('path');function c(s,d){fs.mkdirSync(d,{recursive:true});for(const e of fs.readdirSync(s,{withFileTypes:true})){const sn=path.join(s,e.name),dn=path.join(d,e.name);if(e.isDirectory())c(sn,dn);else fs.copyFileSync(sn,dn);}}c('package/src/image-target','compile-src');"
echo Copy complete

:: 4. Patch offline-compiler.js to use local canvas shim
echo Patching offline-compiler.js...
powershell -Command "(gc compile-src\offline-compiler.js) -replace \"from 'canvas'\", 'from \"../../compile-src/canvas.js\"' | Out-File -encoding UTF8 compile-src\offline-compiler.js"
echo Patch complete

:: 5. Check what we have
echo.
echo Files in compile-src:
dir compile-src\*.js compile-src\*.mjs 2>nul
echo.

:: 6. Run the compiler
echo === RUNNING COMPILER ===
node compile-src\compile-entry.mjs
echo === COMPILE EXIT CODE: %ERRORLEVEL% ===
