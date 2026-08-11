import { MindARThree } from "mindar-image-three";

/**
 * Creates a MindAR image-tracking AR session that manages camera access,
 * target detection, video overlay anchors, and the Three.js render loop.
 *
 * @param {object} config                  - Runtime configuration (spread from APP_CONFIG + manifest).
 * @param {string} config.targetSrc        - Path to the compiled `.mind` target file.
 * @param {Array}  [config.experiences]    - Experience descriptors from the manifest.
 * @param {number} [config.maxDevicePixelRatio] - Caps renderer pixel ratio.
 * @param {object} [handlers]              - Session-level event handlers.
 * @param {Function} [handlers.onTargetFound]  - Called with targetIndex when a target appears.
 * @param {Function} [handlers.onTargetLost]   - Called with targetIndex when a target disappears.
 * @returns {{ getAnchor: Function, start: Function, dispose: Function }}
 */
export function createARSession(config, handlers = {}) {
  const {
    targetSrc,
    experiences = [],
    maxDevicePixelRatio = 1.5,
    // Pull only what MindAR needs; the rest (video paths, aspect ratios, etc.)
    // belong to the video-plane layer and are ignored here.
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
  });

  // Cap pixel ratio for performance on mobile devices.
  mindAR.renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, maxDevicePixelRatio),
  );

  const anchors = new Map();

  for (const experience of experiences) {
    const targetIndex = experience.targetIndex;
    const anchor = mindAR.addAnchor(targetIndex);

    // MindAR calls these with no arguments; forward the targetIndex so the
    // app layer can look up the matching experience.
    if (typeof onTargetFound === "function") {
      anchor.onTargetFound = () => onTargetFound(targetIndex);
    }
    if (typeof onTargetLost === "function") {
      anchor.onTargetLost = () => onTargetLost(targetIndex);
    }

    anchors.set(targetIndex, anchor);
  }

  let animationFrameId = null;

  function startAnimationLoop() {
    function render() {
      mindAR.renderer.render(mindAR.scene, mindAR.camera);
      mindAR.cssRenderer.render(mindAR.cssScene, mindAR.camera);
      animationFrameId = requestAnimationFrame(render);
    }

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

    /**
     * Returns the anchor (THREE.Group container) for a given target index.
     * @param {number} targetIndex
     * @returns {{ group: THREE.Group, ... } | undefined}
     */
    getAnchor(targetIndex) {
      return anchors.get(targetIndex);
    },

    /**
     * Starts the camera, loads the target database, and begins the render loop.
     */
    async start() {
      await mindAR.start();
      startAnimationLoop();
    },

    /**
     * Fully tears down the session: stops video, removes DOM elements,
     * disposes WebGL context, and clears anchors.
     */
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
    },
  };
}
