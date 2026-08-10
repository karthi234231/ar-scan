
import * as THREE from "three";

export function createVideoElement(experience, defaults = {}) {
  const video = document.createElement("video");
  video.id = `video-source-${experience.id}`;
  video.playsInline = true;
  video.muted = defaults.startMuted ?? true;
  video.loop = false;
  video.preload = "metadata";
  video.poster = experience.posterSrc;
  video.style.display = "none";
  video.controls = false;
  video.disablePictureInPicture = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("x-webkit-airplay", "deny");
  video.setAttribute("controlslist", "nodownload noplaybackrate noremoreplayback");

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
  const videoAspectRatio =
    experience.videoAspectRatio ?? defaults.videoAspectRatio ?? cardAspectRatio;
  const overlayWidth = experience.overlayWidth ?? defaults.overlayWidth ?? 1;
  const coverFullCard = experience.coverFullCard ?? defaults.coverFullCard ?? true;

  const planeWidth = overlayWidth;
  const planeHeight = coverFullCard
    ? overlayWidth / cardAspectRatio
    : overlayWidth / videoAspectRatio;

  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `video-plane-${experience.id}`;
  mesh.visible = false;
  mesh.position.set(
    experience.overlayXOffset ?? defaults.overlayXOffset ?? 0,
    experience.overlayYOffset ?? defaults.overlayYOffset ?? 0,
    experience.overlayZOffset ?? defaults.overlayZOffset ?? 0.01,
  );

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
