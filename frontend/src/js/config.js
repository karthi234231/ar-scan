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
  overlayYOffset: 0,
  overlayZOffset: 0.01,

  lostTargetDebounceMs: 400,
  maxDevicePixelRatio: 1.5,
  startMuted: true,
  debug: true,
};