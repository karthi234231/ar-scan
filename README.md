# AR Wedding Platform

Web-based AR card scanner with admin panel for managing wedding video experiences.

## Structure
```
ar-wedding-platform/
├── frontend/           # WebAR scanner (Vite + MindAR + Three.js)
├── admin-backend/      # Express API (batch/card/video management)
├── admin-dashboard/    # React admin panel
└── deployment/         # Docker + NGINX configs
```

## Frontend

### Development
```bash
cd frontend
npm install
npm run dev
```

### Build
```bash
npm run build
```

### AR Tracking Optimizations
- **OneEuroFilter**: `filterMinCF: 0.2`, `filterBeta: 1` — reduces lag to ~5ms
- **Camera**: 30fps cap, 720p resolution to reduce CPU load
- **Render**: `maxDevicePixelRatio: 1`, video `preload="metadata"`, `playsinline`, `autoplay`
- **Target enhancement**: `tools/enhance-target.py` — histogram equalization + unsharp masking + resize to 800x800+
- **Video compression**: `ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset ultrafast -b:v 1M -c:a aac -b:a 128k -movflags +faststart output.mp4`

### Deployment
Deployed to Netlify: https://scan-mee.netlify.app

## Backend
```bash
cd admin-backend
npm install
npm run dev
```

## Dashboard
```bash
cd admin-dashboard
npm install
npm run dev
```

## Docker Deployment
```bash
cd deployment
docker-compose up -d
```
</arg_value>
<task_progress>
- [x] Update APP_CONFIG with aggressive filter settings
- [x] Pass filter config to MindARThree constructor
- [x] Optimize video element attributes for low latency
- [x] Disable anti-aliasing and cap pixel ratio
- [x] Limit camera frame rate to 30fps
- [x] Rewrite app.js
- [x] Create target image enhancement script
- [x] Build and verify
- [x] Commit and push
- [ ] Deploy to Netlify
- [ ] Update README</task_progress>
</write_to_file>