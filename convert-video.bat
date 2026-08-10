@echo off
cd /d "%~dp0"

echo === Converting overlay.webm to H.264 MP4 ===
node_modules\ffmpeg-static\ffmpeg.exe -y -i assets\video\overlay.webm -map_metadata -1 -an -sn -dn -vf "transpose=1" -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -crf 23 -movflags +faststart -r 30 assets\video\overlay.mp4
if errorlevel 1 (
  echo MP4 conversion FAILED
  exit /b 1
)
echo MP4 conversion OK

echo === Re-encoding to VP9 WebM ===
node_modules\ffmpeg-static\ffmpeg.exe -y -i assets\video\overlay.mp4 -c:v libvpx-vp9 -b:v 0 -crf 32 -pix_fmt yuv420p -an assets\video\overlay.webm
if errorlevel 1 (
  echo WebM conversion FAILED
  exit /b 1
)
echo WebM conversion OK

echo === Extracting poster frame ===
node_modules\ffmpeg-static\ffmpeg.exe -y -ss 0.2 -i assets\video\overlay.mp4 -vf "scale=960:-1" -frames:v 1 -q:v 2 assets\poster\video-poster.jpg
if errorlevel 1 (
  echo Poster extraction FAILED
  exit /b 1
)
echo Poster extraction OK

echo === All conversions complete ===
dir assets\video\overlay.mp4 assets\video\overlay.webm assets\poster\video-poster.jpg