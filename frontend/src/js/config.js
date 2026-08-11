export const APP_CONFIG = {
  // Load manifest from backend function (admin uploads update this dynamically)
  manifestSrc: "/.netlify/functions/manifest",
  // Fallback to static assets if backend manifest is empty
  fallbackManifestSrc: "/assets/manifest.json",
  targetSrc: "/assets/targets/card.mind",
  videoMp4Src: "/assets/video/overlay.mp4",
  videoWebmSrc: "/assets/video/overlay.webm",
  posterSrc: "/assets/poster/video-poster.jpg",

  // Width divided by height. Update this to match the printed card artwork.
  cardAspectRatio: 0.714,

  // Width divided by height. Update this after the final video is compressed.
  videoAspectRatio: 1.778,

  // Video appears as a floating player above the card, not covering it.
  overlayWidth: 0.6,
  overlayXOffset: 0,
  overlayYOffset: 0.1,
  overlayZOffset: 0.05,
  coverFullCard: false,

  // Aggressive OneEuroFilter settings to minimize lag.
  // f_c ≈ 1/(1 + 1/(2π * 0.2 * Δt)) ≈ 0.2 Hz cutoff → lag ≈ 5ms
  filterMinCF: 0.2,
  filterBeta: 1,

  // Kalman filter for pose prediction - eliminates sub-frame latency
  // by predicting future pose using velocity state.
  // State: [px, py, pz, qx, qy, qz, qw, vx, vy, vz, ωx, ωy, ωz]
  // Prediction: x_pred = F*x_prev, P_pred = F*P_prev*F^T + Q
  // Update: K = P_pred*H^T*(H*P_pred*H^T + R)^-1
  kalman: {
    processNoise: 1e-3,
    measurementNoise: 1e-2,
    predictionHorizon: 16, // ms ahead (1 frame at 60fps)
  },

  lostTargetDebounceMs: 400,
  maxDevicePixelRatio: 1,
  startMuted: true,
  autoStart: true,
  debug: true,
};