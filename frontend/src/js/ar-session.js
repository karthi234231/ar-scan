import { MindARThree } from "mindar-image-three";
import { KalmanPoseFilter } from "./kalman-pose-filter.js";

/**
 * Creates a MindAR image-tracking AR session that manages camera access,
 * target detection, video overlay anchors, and the Three.js render loop.
 * Uses a Kalman filter for pose prediction to reduce latency and jitter.
 */
export function createARSession(config, handlers = {}) {
  const {
    targetSrc,
    experiences = [],
    maxDevicePixelRatio = 1.5,
    kalman = null, // { processNoise, measurementNoise, predictionHorizon }
  } = config;

  const { onTargetFound, onTargetLost } = handlers;

  const container = document.getElementById("ar-root");

  if (!container) {
    throw new Error("AR container element #ar-root was not found in the document.");
  }

  const mindAR = new MindARThree({
    container,
    imageTargetSrc: targetSrc,
    maxTrack: Math.max(experiences.length, 1),
    uiLoading: "no",
    uiScanning: "no",
    uiError: "no",
    // Aggressive OneEuroFilter: minimize lag (~5ms instead of ~1000ms)
    filterMinCF: config.filterMinCF ?? 0.2,
    filterBeta: config.filterBeta ?? 1,
    warmupTolerance: 1,
    missTolerance: 1,
  });

  mindAR.renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, maxDevicePixelRatio),
  );

  const anchors = new Map();
  // Per-anchor Kalman filter for pose prediction
  const kalmanFilters = new Map();

  for (const experience of experiences) {
    const targetIndex = experience.targetIndex;
    const anchor = mindAR.addAnchor(targetIndex);

    if (typeof onTargetFound === "function") {
      anchor.onTargetFound = () => onTargetFound(targetIndex);
    }
    if (typeof onTargetLost === "function") {
      anchor.onTargetLost = () => onTargetLost(targetIndex);
    }

    anchors.set(targetIndex, anchor);

    // Create a Kalman filter for this anchor
    if (kalman) {
      kalmanFilters.set(targetIndex, new KalmanPoseFilter(kalman));
    }
  }

  let animationFrameId = null;

  function render() {
    // Apply Kalman-filtered pose to each detected anchor's group
    for (const [targetIndex, kalmanFilter] of kalmanFilters) {
      const anchor = anchors.get(targetIndex);
      if (!anchor) continue;

      // Only update if the target is currently visible
      if (anchor.group.visible) {
        const rawPos = anchor.group.position;
        const rawQuat = anchor.group.quaternion;

        const filtered = kalmanFilter.update(
          rawPos,
          rawQuat,
          performance.now(),
        );

        // Apply filtered pose directly to the group
        anchor.group.position.copy(filtered.position);
        anchor.group.quaternion.copy(filtered.quaternion);
      } else {
        // Reset the filter when target is lost to avoid stale state
        kalmanFilter.reset();
      }
    }

    mindAR.renderer.render(mindAR.scene, mindAR.camera);
    mindAR.cssRenderer.render(mindAR.cssScene, mindAR.camera);
    animationFrameId = requestAnimationFrame(render);
  }

  function startAnimationLoop() {
    animationFrameId = requestAnimationFrame(render);
  }

  function stopAnimationLoop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  return {
    mindAR,

    getAnchor(targetIndex) {
      return anchors.get(targetIndex);
    },

    async start() {
      await mindAR.start();
      startAnimationLoop();
    },

    dispose() {
      stopAnimationLoop();
      try {
        mindAR.stop();
      } catch {
        // Video / controller may not have been initialised if start() failed.
      }

      mindAR.renderer.domElement.remove();
      mindAR.cssRenderer.domElement.remove();
      mindAR.renderer.dispose();
      mindAR.cssRenderer.dispose();
      anchors.clear();
      kalmanFilters.clear();
    },
  };
}