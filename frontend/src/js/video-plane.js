import * as THREE from "three";

/**
 * Classifies a video's orientation based on its intrinsic width/height.
 * Modern browsers apply rotation metadata, so videoWidth/videoHeight
 * already reflect the effective orientation.
 * @param {number} width
 * @param {number} height
 * @returns {"vertical" | "horizontal" | "square"}
 */
export function classifyVideoOrientation(width, height) {
  if (!width || !height) return "square";
  const ratio = width / height;
  if (ratio < 0.9) return "vertical"; // e.g. Instagram Reels 9:16
  if (ratio > 1.1) return "horizontal"; // e.g. YouTube 16:9
  return "square"; // 1:1
}

/**
 * Computes the mesh scale so the video displays in its native aspect ratio.
 *
 * The geometry is created as a SQUARE base (overlayWidth x overlayWidth).
 * We then scale it based on the actual video aspect ratio:
 *   - vertical (AR < 1):   scale = (1, 1/AR, 1)  → tall
 *   - horizontal (AR > 1): scale = (AR, 1, 1)    → wide
 *   - square (AR ≈ 1):     scale = (1, 1, 1)     → square
 *
 * @param {"vertical" | "horizontal" | "square"} orientation
 * @param {number} aspectRatio width/height
 * @returns {{ scaleX: number, scaleY: number }}
 */
export function computeOrientationScale(orientation, aspectRatio) {
  if (orientation === "vertical") {
    // AR < 1, e.g. 0.5625 (9:16) → scaleY = 1/0.5625 = 1.778 → tall
    return { scaleX: 1, scaleY: 1 / (aspectRatio || 1) };
  }
  if (orientation === "horizontal") {
    // AR > 1, e.g. 1.778 (16:9) → scaleX = 1.778 → wide
    return { scaleX: aspectRatio || 1, scaleY: 1 };
  }
  return { scaleX: 1, scaleY: 1 };
}

export function createVideoElement(experience, defaults = {}) {
  const video = document.createElement("video");
  video.id = `video-source-${experience.id}`;
  video.playsInline = true;
  video.muted = defaults.startMuted ?? true;
  video.loop = true;
  video.preload = "metadata";
  video.poster = experience.posterSrc;
  video.style.display = "none";
  video.controls = false;
  video.disablePictureInPicture = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("x-webkit-airplay", "deny");
  video.setAttribute("controlslist", "nodownload noplaybackrate noremoreplayback");
  video.setAttribute("preload", "metadata");
  video.setAttribute("playsinline", "");
  video.autoplay = true;

  appendVideoSource(video, experience.videoMp4Src, "video/mp4");

  if (experience.videoWebmSrc) {
    appendVideoSource(video, experience.videoWebmSrc, "video/webm");
  }

  document.body.appendChild(video);
  return video;
}

export function createVideoPlane(experience, defaults = {}) {
  const video = createVideoElement(experience, defaults);
  const texture = new THREE.VideoTexture(video);

  if ("colorSpace" in texture && THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }

  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const cardAspectRatio =
    experience.cardAspectRatio ?? defaults.cardAspectRatio ?? 1;
  const overlayWidth = experience.overlayWidth ?? defaults.overlayWidth ?? 1;
  const coverFullCard = experience.coverFullCard ?? defaults.coverFullCard ?? true;

  // IMPORTANT: Create a SQUARE base geometry (overlayWidth x overlayWidth).
  // The actual video aspect ratio is applied via mesh.scale after metadata loads.
  // This ensures vertical videos display tall and horizontal videos display wide.
  const planeWidth = overlayWidth;
  const planeHeight = coverFullCard
    ? overlayWidth / cardAspectRatio
    : overlayWidth; // square base for floating player

  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `video-plane-${experience.id}`;
  mesh.visible = false;
  mesh.position.set(
    experience.overlayXOffset ?? defaults.overlayXOffset ?? 0,
    experience.overlayYOffset ?? defaults.overlayYOffset ?? 0,
    experience.overlayZOffset ?? defaults.overlayZOffset ?? 0,
  );

  // Orientation auto-detection + dynamic scaling ---------------------------------
  let currentOrientation = "square";
  let orientationScale = { scaleX: 1, scaleY: 1 };

  /**
   * Applies orientation-based scale to the mesh, centered at (0,0,0).
   * The geometry is a square base, so scaling by (1, 1/AR) makes it tall
   * for vertical videos, and (AR, 1) makes it wide for horizontal videos.
   */
  function applyOrientationScale() {
    mesh.scale.set(
      orientationScale.scaleX,
      orientationScale.scaleY,
      1,
    );
  }

  /**
   * Called once metadata has loaded. Reads videoWidth/videoHeight,
   * classifies orientation, and recomputes the plane scale.
   */
  function handleMetadata() {
    const w = video.videoWidth || 0;
    const h = video.videoHeight || 0;
    if (!w || !h) return;

    const aspect = w / h;
    currentOrientation = classifyVideoOrientation(w, h);
    orientationScale = computeOrientationScale(currentOrientation, aspect);

    if (defaults.debug) {
      console.debug(
        `[video-plane] ${experience.id}: ${w}x${h} (AR=${aspect.toFixed(2)}, ${currentOrientation}) -> scale=${JSON.stringify(orientationScale)}`,
      );
    }

    applyOrientationScale();
  }

  video.addEventListener("loadedmetadata", handleMetadata, { once: true });
  // Fallback if metadata loads before listener or edge cases
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    handleMetadata();
  }
  // -----------------------------------------------------------------------------

  async function play() {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForVideoEvent(video, "loadedmetadata", 5000);
    }

    return video.play();
  }

  function pause() {
    if (!video.paused) {
      video.pause();
    }
  }

  async function replay() {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = 0;
    }

    return play();
  }

  function setMuted(isMuted) {
    video.muted = isMuted;
  }

  function dispose() {
    pause();
    video.removeEventListener("loadedmetadata", handleMetadata);
    mesh.removeFromParent();
    texture.dispose();
    material.dispose();
    geometry.dispose();
    video.removeAttribute("src");
    video.replaceChildren();
    video.load();
    video.remove();
  }

  return {
    id: experience.id,
    targetIndex: experience.targetIndex,
    video,
    texture,
    material,
    geometry,
    mesh,
    get orientation() {
      return currentOrientation;
    },
    play,
    pause,
    replay,
    setMuted,
    dispose,
  };
}

function appendVideoSource(video, src, type) {
  if (!src) {
    return;
  }

  const source = document.createElement("source");
  source.src = src;
  source.type = type;
  video.appendChild(source);
}

function waitForVideoEvent(video, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for video ${eventName}: ${video.currentSrc}`));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener("error", handleError);
    };

    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Video failed before ${eventName}: ${video.currentSrc}`));
    };

    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}