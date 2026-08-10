@echo off
cd /d "%~dp0"

:: 1. Copy official MindAR source to compile-src/
echo Copying source files...
xcopy /E /I /Y "package\src\image-target" "compile-src" >nul 2>&1
echo Source copied to compile-src/

:: 2. Create package.json with type:module
echo {"type":"module"} > compile-src\package.json
echo Created compile-src\package.json

:: 3. Create local canvas.js shim (pure JS, replaces native canvas package)
echo Creating canvas shim...
>compile-src\canvas.js (
echo import fs from "fs";
echo import jpeg from "jpeg-js";
echo.
echo function createCanvas(width, height^) {
echo   const canvas = {
echo     width,
echo     height,
echo     _imageData: null,
echo     getContext(type^) {
echo       if ^(type !== "2d"^) return null;
echo       return {
echo         drawImage(img, dx, dy, dw, dh^) {
echo           canvas._imageData = img.data;
echo           canvas.width = dw || img.width;
echo           canvas.height = dh || img.height;
echo         },
echo         getImageData(sx, sy, sw, sh^) {
echo           const data = new Uint8ClampedArray(sw * sh * 4^);
echo           if ^(canvas._imageData^) {
echo             const srcW = canvas.width;
echo             const srcH = canvas.height;
echo             for ^(let y = 0; y < sh; y++^) {
echo               for ^(let x = 0; x < sw; x++^) {
echo                 const srcX = Math.min^(Math.floor^(x / sw * srcW^), srcW - 1^);
echo                 const srcY = Math.min^(Math.floor^(y / sh * srcH^), srcH - 1^);
echo                 const srcIdx = ^(srcY * srcW + srcX^) * 4;
echo                 const dstIdx = ^(y * sw + x^) * 4;
echo                 data[dstIdx] = canvas._imageData[srcIdx];
echo                 data[dstIdx + 1] = canvas._imageData[srcIdx + 1];
echo                 data[dstIdx + 2] = canvas._imageData[srcIdx + 2];
echo                 data[dstIdx + 3] = canvas._imageData[srcIdx + 3];
echo               }
echo             }
echo           }
echo           return { data, width: sw, height: sh };
echo         },
echo       };
echo       return canvas;
echo     },
echo   };
echo   return canvas;
echo }
echo.
echo async function loadImage(src^) {
echo   const buffer = fs.readFileSync^(src^);
echo   const raw = jpeg.decode^(buffer, { useTArray: true, maxMemoryUsageInMB: 512 }^);
echo   return {
echo     width: raw.width,
echo     height: raw.height,
echo     data: raw.data,
echo   };
echo }
echo.
echo export { createCanvas, loadImage };
)

echo Created compile-src\canvas.js

:: 4. Modify offline-compiler.js to use local canvas shim
echo Patching offline-compiler.js...
powershell -Command "(gc compile-src\offline-compiler.js) -replace \"from 'canvas'\", 'from \"./canvas.js\"' | Out-File -encoding UTF8 compile-src\offline-compiler.js"
echo Patched offline-compiler.js

echo ===DONE===
