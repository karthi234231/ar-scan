# AR Web App – Final Completion Note (Copy this whole note)

**Project root:** `C:\Users\21pa1\OneDrive\Documents\AR`  
**Last updated:** 2026-08-10

---

## 1. INSTALL PREREQUISITES (Run once)

```powershell
npm install --save-dev ffmpeg-static
npm install -g mkcert
```

(Optional: if using self-hosted compiler later: `npm install @maherboughdiri/mind-ar-compiler`)

---

## 2. VERIFY CODE FIXES (Already done, but confirm)

```powershell
if ( (Get-Content src\ar-session.js -Raw) -match "createARSession" ) { Write-Host "✅ ar-session.js OK" } else { Write-Host "❌ ar-session.js MISSING createARSession" }
if ( (Get-Content src\video-plane.js -Raw) -match "createVideoPlane" ) { Write-Host "✅ video-plane.js OK" } else { Write-Host "❌ video-plane.js MISSING createVideoPlane" }
```

If any fails, stop and fix.

---

## 3. CONVERT VIDEO & EXTRACT POSTER (Run these 3 commands)

Set FFmpeg path:

```powershell
$FFMPEG = "node_modules\ffmpeg-static\ffmpeg.exe"
```

### 3a – Convert to H.264 MP4 (Safari/Chrome)

```powershell
& $FFMPEG -y -i assets\video\overlay.webm -map_metadata -1 -an -sn -dn -vf "transpose=1" -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -crf 23 -movflags +faststart -r 30 assets\video\overlay.mp4
```

### 3b – Convert to VP9 WebM (Firefox)

```powershell
& $FFMPEG -y -i assets\video\overlay.mp4 -c:v libvpx-vp9 -b:v 0 -crf 32 -pix_fmt yuv420p -an assets\video\overlay.webm
```

### 3c – Extract poster frame (JPEG)

```powershell
& $FFMPEG -y -ss 0.2 -i assets\video\overlay.mp4 -vf "scale=960:-1" -frames:v 1 -q:v 2 assets\poster\video-poster.jpg
```

---

## 4. GENERATE `card.mind` (AR target file)

You have a real card image: **`assets/targets/IMG_1607.JPG`** (3.3 MB).  
We need to compile it into `assets/targets/card.mind`.

### Option A – Official Online Compiler (simplest, recommended)

1. Open in Chrome (incognito): **https://hiukim.github.io/mind-ar-js/tools/compile/**
2. Click "Choose Image" → select `assets/targets/IMG_1607.JPG`
3. Click "Start" – wait ~10‑30 seconds.
4. Click "Download .mind" – save file.
5. Rename downloaded file to **`card.mind`** and copy to `assets\targets\` (overwrite any existing).

**If the online compiler shows 0% stuck** → use Option B.

### Option B – Self‑hosted HTML runner (if online fails)

Create a file **`compile-card.html`** in the project root with this exact content:

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Compile card.mind</title></head>
<body>
<script type="importmap">
{
  "imports": {
    "three": "./vendor/three.module.js",
    "three/addons": "./vendor/three-addons/"
  }
}
</script>
<script type="module">
  import compiler from "./node_modules/@maherboughdiri/mind-ar-compiler/assets/index.js";

  const img = await fetch("./assets/targets/IMG_1607.JPG").then(r => r.blob());
  const file = new File([img], "IMG_1607.JPG", { type: "image/jpeg" });
  const target = await compiler.compileFiles([file]);
  compiler.download(target, "card");   // downloads card.mind
  console.log("✅ Downloaded card.mind");
</script>
</body>
</html>
```

Then install the compiler package (browser‑only) and serve the project:

```powershell
npm install @maherboughdiri/mind-ar-compiler
npx serve . -l 8080
```

Open **http://localhost:8080/compile-card.html** – it will compile and automatically download `card.mind`.  
Save it to `assets\targets\card.mind`.

### Verify `card.mind`

```powershell
Get-ChildItem assets\targets\card.mind | Select-Object Name, Length
```

It must be > 20 KB (typically 50–500 KB). If 0 bytes, compilation failed.

---

## 5. CHECK & UPDATE MANIFEST (if video aspect ratio changed)

The video was rotated 90°. Check new resolution:

```powershell
& $FFMPEG -i assets\video\overlay.mp4 2>&1 | findstr "Video:"
```

If you see `1920x1080` → aspect = 1.778 (landscape) → **no change** to `manifest.json`.  
If you see `1080x1920` → aspect = 0.5625 (portrait) → **change** `"videoAspectRatio": 0.5625` in `assets/manifest.json`.  
(All other fields already correct.)

---

## 6. SERVE WITH HTTPS FOR MOBILE TESTING

Mobile browsers require HTTPS for camera. Generate trusted local certificates:

```powershell
# Replace 192.168.1.101 with your actual local IP (find with ipconfig)
mkcert -key-file key.pem -cert-file cert.pem localhost 192.168.1.101
```

Serve with HTTPS on port 3443:

```powershell
npx serve . -l 3443 --ssl-cert cert.pem --ssl-key key.pem
```

Open on phone: **https://192.168.1.101:3443** (accept certificate warning).

---

## 7. TESTING FLOW

1. Print the card image: **`assets/targets/IMG_1607.JPG`** on paper.
2. On phone browser, tap **Start**, grant camera permission.
3. Point camera at printed card – status changes to `Card detected: card-001`.
4. Video should overlay and auto‑play (muted).
5. Test **Unmute**, **Replay** buttons.
6. Remove card → after 400ms → status reverts to `Point camera at the card`. Re‑show → video replays.

---

## 8. FINAL CHECKLIST (All must be ✔)

- [ ] `assets/targets/card.mind` exists (>20 KB)
- [ ] `assets/video/overlay.mp4` exists and plays (check with media player)
- [ ] `assets/video/overlay.webm` exists (optional but recommended)
- [ ] `assets/poster/video-poster.jpg` exists (>5 KB)
- [ ] `assets/manifest.json` points to these files (already correct)
- [ ] HTTPS server runs without errors
- [ ] Mobile test passes (detection + video overlay)

---

## 9. TROUBLESHOOTING (quick)

| Problem | Fix |
|---------|-----|
| `ffmpeg` not found | Re‑run `npm install --save-dev ffmpeg-static` |
| Online compiler stuck at 0% | Use Option B (self‑hosted HTML) |
| Certificate warning on phone | Tap “Proceed” / “Advanced → Continue” |
| Video won't play | Check file size (< 10 MB); re‑encode with `-crf 28` to reduce |
| Card not detected | Ensure printed image matches exactly the one used for compilation |
| “Asset load failed” (404) | Verify file names and paths; clear browser cache |

---

**ALL DONE.** You have everything you need. Execute steps 2–7 in order and your WebAR scanner will be fully functional.