export const APP_CONFIG = {
  manifestSrc: "/assets/manifest.json",
  targetSrc: "/assets/targets/card.mind",
  videoMp4Src: "/assets/video/overlay.mp4",
  videoWebmSrc: "/assets/video/overlay.webm",
  posterSrc: "/assets/poster/video-poster.jpg",

  // Width divided by height. Update this to match the printed card artwork.
  cardAspectRatio: 0.714,

  // Width divided by height. Update this after the final video is compressed.
  videoAspectRatio: 1.778,

  overlayWidth: 1,
  overlayXOffset: 0,
  overlayYOffset: 0,
  overlayZOffset: 0,

  // Aggressive OneEuroFilter settings to minimize lag.
  // f_c ≈ 1/(1 + 1/(2π * 0.2 * Δt)) ≈ 0.2 Hz cutoff → lag ≈ 5ms
  filterMinCF: 0.2,
  filterBeta: 1,

  lostTargetDebounceMs: 400,
  maxDevicePixelRatio: 1,
  startMuted: true,
  debug: true,
};
