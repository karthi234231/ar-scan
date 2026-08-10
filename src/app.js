import {
  bindUIHandlers,
  clearError,
  getUIElements,
  setError,
  setCameraPermissionPopupVisible,
  setControlsVisible,
  setLoading,
  setMutedState,
  setScanGuideVisible,
  setStartEnabled,
  setStatus,
} from "./ui.js";
import { APP_CONFIG } from "./config.js";
import { createARSession } from "./ar-session.js";
import { loadExperienceManifest } from "./manifest-loader.js";
import { createVideoPlane } from "./video-plane.js";
import { preflightManifestAssets } from "./asset-preflight.js";

let isMuted = true;
let scannerStarted = false;
let session = null;
let manifest = null;
let activeTargetIndex = null;
let videoPlanes = new Map();
let sessionState = "idle";
const targetStates = new Map();
const performanceMarks = new Map();

function setSessionState(nextState) {
  if (sessionState === nextState) {
    return;
  }

  if (APP_CONFIG.debug) {
    console.debug(`[scanner] ${sessionState} -> ${nextState}`);
  }

  sessionState = nextState;
}

function logRuntimeError(error) {
  if (APP_CONFIG.debug) {
    console.error(error);
  }
}

function markPerformance(name) {
  if (!APP_CONFIG.debug) {
    return;
  }

  performanceMarks.set(name, performance.now());
  console.debug(`[perf] ${name}`);
}

function measurePerformance(label, startName, endName) {
  if (!APP_CONFIG.debug) {
    return;
  }

  const start = performanceMarks.get(startName);
  const end = performanceMarks.get(endName);

  if (typeof start !== "number" || typeof end !== "number") {
    return;
  }

  console.debug(`[perf] ${label}: ${Math.round(end - start)}ms`);
}

function hasWebGLSupport() {
  const canvas = document.createElement("canvas");
  const context =
    canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

  return Boolean(context);
}

function detectSupport() {
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]";

  if (!window.isSecureContext && !isLocalhost) {
    return {
      supported: false,
      reason: "insecure-context",
      message: "Open this scanner from HTTPS or localhost.",
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      supported: false,
      reason: "camera-api-unavailable",
      message: "This browser cannot access the camera.",
    };
  }

  if (!hasWebGLSupport()) {
    return {
      supported: false,
      reason: "webgl-unavailable",
      message: "This device or browser cannot render AR.",
    };
  }

  return {
    supported: true,
    reason: "supported",
    message: "Ready to scan",
  };
}

/**
 * Requests camera permission on mobile browsers (especially iOS Safari).
 * On iOS, permission must be explicitly requested before getUserMedia will work.
 * Shows a popup with an "Allow Camera" button that triggers the permission prompt.
 */
async function requestCameraPermission() {
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]";

  // On iOS, use the permissions API if available
  if (typeof navigator.permissions !== "undefined" && navigator.permissions.query) {
    try {
      const permission = await navigator.permissions.query({ name: "camera" });
      if (permission.state === "granted") {
        return { granted: true };
      }
      if (permission.state === "denied") {
        return { granted: false, reason: "denied" };
      }
      // Prompt the user
      return { granted: false, needsPrompt: true };
    } catch (e) {
      // Fall through to default handling
    }
  }

  // On non-secure contexts, camera won't work anyway
  if (!window.isSecureContext && !isLocalhost) {
    return { granted: false, reason: "insecure-context" };
  }

  return { granted: false, needsPrompt: true };
}

/**
 * Proactively asks the browser for camera access so the native permission
 * dialog is shown. This is critical on iOS Safari and mobile Chrome.
 */
async function promptForCameraAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    // Stop the track immediately - we just needed the permission
    const tracks = stream.getTracks();
    for (const track of tracks) {
      if (track && typeof track.stop === "function") {
        track.stop();
      }
    }

    return { granted: true };
  } catch (error) {
    const message = String(error?.message ?? "").toLowerCase();
    if (message.includes("permission") || message.includes("denied")) {
      return { granted: false, reason: "denied" };
    }
    if (message.includes("insecure")) {
      return { granted: false, reason: "insecure-context" };
    }
    return { granted: false, reason: "unknown", error };
  }
}

async function startScanner() {
  if (scannerStarted || sessionState === "starting") {
    return;
  }

  clearError();
  markPerformance("start-tap");
  setSessionState("starting");
  setLoading(true);
  setStartEnabled(false);
  setStatus("Loading scanner");

  try {
    markPerformance("manifest-load-start");
    manifest = await loadExperienceManifest(APP_CONFIG.manifestSrc);
    markPerformance("manifest-load-end");
    measurePerformance(
      "manifest load",
      "manifest-load-start",
      "manifest-load-end",
    ); 

    markPerformance("asset-preflight-start");
    await preflightManifestAssets(manifest);
    markPerformance("asset-preflight-end");
    measurePerformance(
      "asset preflight",
      "asset-preflight-start",
      "asset-preflight-end",
    );

    markPerformance("session-create-start");
    session = createARSession(
      {
        ...APP_CONFIG,
        targetSrc: manifest.targetSrc,
        experiences: manifest.experiences,
      },
      {
        onTargetFound: handleTargetFound,
        onTargetLost: handleTargetLost,
      },
    );
    markPerformance("session-create-end");
    measurePerformance(
      "session create",
      "session-create-start",
      "session-create-end",
    );

    markPerformance("overlay-create-start");
    createExperienceOverlays();
    markPerformance("overlay-create-end");
    measurePerformance(
      "overlay create",
      "overlay-create-start",
      "overlay-create-end",
    );

    markPerformance("ar-start-start");
    await session.start();
    markPerformance("ar-start-end");
    measurePerformance("AR start", "ar-start-start", "ar-start-end");
    measurePerformance("tap to AR ready", "start-tap", "ar-start-end");

    scannerStarted = true;
    setSessionState("scanning");
    setControlsVisible(true);
    setScanGuideVisible(true);
    setStatus("Point camera at the card");
  } catch (error) {
    handleStartError(error);
    resetFailedStartup();
  } finally {
    setLoading(false);
    setStartEnabled(!scannerStarted);
  }
}

async function handleCameraAllow() {
  // Hide the popup and request camera access
  setCameraPermissionPopupVisible(false);
  setStatus("Requesting camera access...");
  setStartEnabled(false);

  const result = await promptForCameraAccess();

  if (result.granted) {
    setStatus("Camera access granted");
    // Now proceed with starting the scanner
    await startScanner();
  } else {
    if (result.reason === "denied") {
      setError("Camera access was denied. Please enable camera permission in your browser settings.");
    } else if (result.reason === "insecure-context") {
      setError("Open this scanner from HTTPS or localhost.");
    } else {
      setError("Camera access failed. Check browser settings and try again.");
    }
    setStatus("Camera access required");
    setStartEnabled(true);
  }
}

function handleCameraDeny() {
  setCameraPermissionPopupVisible(false);
  setError("Camera access is required for AR scanning. Tap Start to try again.");
  setStatus("Camera permission denied");
}

function checkCameraPermission() {
  requestCameraPermission().then((result) => {
    if (result.granted) {
      // Permission already granted, just let the user tap Start normally
      return;
    }

    if (result.reason === "denied") {
      setError("Camera permission was denied. Enable it in browser settings.");
      setStatus("Camera permission denied");
      setStartEnabled(true);
      return;
    }

    if (result.reason === "insecure-context") {
      setError("Open this scanner from HTTPS or localhost.");
      setStatus("Scanner unavailable");
      setStartEnabled(false);
      return;
    }

    // Need to show the camera permission popup
    if (result.needsPrompt) {
      setCameraPermissionPopupVisible(true);
      setStatus("Tap Allow to grant camera access");
    }
  });
}

async function handleTargetFound(targetIndex) {
  markPerformance(`target-${targetIndex}-found`);

  const experience = findExperience(targetIndex);
  const videoPlane = videoPlanes.get(targetIndex);
  const targetState = getTargetState(targetIndex);

  targetState.visible = true;
  clearLostTargetTimer(targetIndex);
  pauseInactiveTargets(targetIndex);
  activeTargetIndex = targetIndex;
  setSessionState("target-visible");
  setScanGuideVisible(false);

  if (videoPlane) {
    videoPlane.mesh.visible = true;

    try {
      markPerformance(`target-${targetIndex}-play-start`);
      await videoPlane.play();
      clearError();
      markPerformance(`target-${targetIndex}-play-end`);
      measurePerformance(
        `target ${targetIndex} video play`,
        `target-${targetIndex}-play-start`,
        `target-${targetIndex}-play-end`,
      );
    } catch (error) {
      handlePlaybackError(error);
    }
  }

  setStatus(experience ? `Card detected: ${experience.id}` : "Card detected");
}

function pauseInactiveTargets(activeIndex) {
  for (const [targetIndex, videoPlane] of videoPlanes) {
    if (targetIndex === activeIndex) {
      continue;
    }

    videoPlane.pause();
    videoPlane.mesh.visible = false;
  }
}

function handleTargetLost(targetIndex) {
  const targetState = getTargetState(targetIndex);
  targetState.visible = false;

  clearLostTargetTimer(targetIndex);

  targetState.lostTimer = window.setTimeout(() => {
    if (targetState.visible) {
      return;
    }

    const videoPlane = videoPlanes.get(targetIndex);

    if (videoPlane) {
      videoPlane.pause();
      videoPlane.mesh.visible = false;
    }

    if (activeTargetIndex === targetIndex) {
      activeTargetIndex = null;
    }

    setSessionState("target-lost");
    setScanGuideVisible(true);
    setStatus("Point camera at the card");
  }, APP_CONFIG.lostTargetDebounceMs);
}

function findExperience(targetIndex) {
  return manifest?.experiences.find(
    (experience) => experience.targetIndex === targetIndex,
  );
}

function createExperienceOverlays() {
  videoPlanes = new Map();
  targetStates.clear();

  for (const experience of manifest.experiences) {
    const videoPlane = createVideoPlane(experience, APP_CONFIG);
    const anchor = session.getAnchor(experience.targetIndex);

    if (!anchor) {
      throw new Error(`Missing anchor for targetIndex: ${experience.targetIndex}`);
    }

    anchor.group.add(videoPlane.mesh);
    videoPlanes.set(experience.targetIndex, videoPlane);
    targetStates.set(experience.targetIndex, {
      visible: false,
      lostTimer: null,
    });
  }
}

function getTargetState(targetIndex) {
  if (!targetStates.has(targetIndex)) {
    targetStates.set(targetIndex, {
      visible: false,
      lostTimer: null,
    });
  }

  return targetStates.get(targetIndex);
}

function clearLostTargetTimer(targetIndex) {
  const targetState = getTargetState(targetIndex);

  if (!targetState.lostTimer) {
    return;
  }

  window.clearTimeout(targetState.lostTimer);
  targetState.lostTimer = null;
}

function pauseAllVideos() {
  for (const videoPlane of videoPlanes.values()) {
    videoPlane.pause();
  }
}

function disposeScanner() {
  for (const targetIndex of targetStates.keys()) {
    clearLostTargetTimer(targetIndex);
  }

  for (const videoPlane of videoPlanes.values()) {
    videoPlane.dispose();
  }

  videoPlanes.clear();
  targetStates.clear();
  activeTargetIndex = null;

  if (session) {
    session.dispose();
    session = null;
  }

  manifest = null;
  scannerStarted = false;
  setControlsVisible(false);
  setScanGuideVisible(false);
  setSessionState("idle");
}

function resetFailedStartup() {
  for (const targetIndex of targetStates.keys()) {
    clearLostTargetTimer(targetIndex);
  }

  for (const videoPlane of videoPlanes.values()) {
    videoPlane.dispose();
  }

  videoPlanes.clear();
  targetStates.clear();
  activeTargetIndex = null;

  if (session) {
    session.dispose();
    session = null;
  }

  manifest = null;
  scannerStarted = false;
  setControlsVisible(false);
  setScanGuideVisible(false);
}

function handleVisibilityChange() {
  if (document.hidden) {
    pauseAllVideos();
    return;
  }

  if (scannerStarted && activeTargetIndex !== null) {
    setStatus("Point camera at the card");
  }
}

function handleBeforeUnload() {
  disposeScanner();
}

function handlePlaybackError(error) {
  logRuntimeError(error);
  setSessionState("playback-blocked");
  setError(getPlaybackErrorMessage(error));
}

function handleStartError(error) {
  logRuntimeError(error);
  setSessionState("error");
  setControlsVisible(false);
  setScanGuideVisible(false);
  setError(getStartupErrorMessage(classifyStartupError(error)));
  setStatus("Scanner unavailable");
}

function classifyStartupError(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  const name = String(error?.name ?? "").toLowerCase();

  if (!window.isSecureContext && window.location.hostname !== "localhost") {
    return "insecure-context";
  }

  if (name === "notallowederror" || message.includes("permission")) {
    return "camera-denied";
  }

  if (
    name === "notfounderror" ||
    name === "devicesnotfounderror" ||
    message.includes("no camera")
  ) {
    return "camera-unavailable";
  }

  if (message.includes("webgl")) {
    return "webgl-unavailable";
  }

  if (
    message.includes("manifest") ||
    message.includes("target") ||
    message.includes("assets/") ||
    message.includes("404") ||
    message.includes("failed to fetch")
  ) {
    return "asset-load-failed";
  }

  return "unknown";
}

function getStartupErrorMessage(errorType) {
  const messages = {
    "insecure-context": "Open this scanner from HTTPS or localhost.",
    "camera-denied": "Camera access is blocked. Allow camera permission and reload.",
    "camera-unavailable": "No camera was found for this browser.",
    "webgl-unavailable": "This device or browser cannot render AR.",
    "asset-load-failed": "Scanner assets are missing or failed to load.",
    unknown: "Scanner could not start. Check camera permission and assets.",
  };

  return messages[errorType] ?? messages.unknown;
}

function getPlaybackErrorMessage(error) {
  const name = String(error?.name ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();

  if (name === "notallowederror" || message.includes("user gesture")) {
    return "Tap Replay to start the video.";
  }

  if (message.includes("format") || message.includes("decode")) {
    return "This video format is not supported on this device.";
  }

  return "Tap Replay if the video does not start.";
}

async function toggleMute() {
  isMuted = !isMuted;
  setMutedState(isMuted);

  for (const videoPlane of videoPlanes.values()) {
    videoPlane.setMuted(isMuted);
  }
}

async function replayVideo() {
  const videoPlane = videoPlanes.get(activeTargetIndex);

  if (!videoPlane) {
    setStatus("Point camera at the card");
    return;
  }

  try {
    await videoPlane.replay();
    clearError();
    setStatus("Playing");
  } catch (error) {
    handlePlaybackError(error);
  }
}

function main() {
  getUIElements();
  clearError();
  setLoading(false);
  setControlsVisible(false);
  setMutedState(true);
  setScanGuideVisible(false);
  setSessionState("idle");

  const support = detectSupport();
  setStartEnabled(support.supported);
  setStatus(support.supported ? support.message : "Scanner unavailable");

  if (!support.supported) {
    setError(support.message);
  } else {
    // Check camera permission and show popup if needed
    checkCameraPermission();
  }

  bindUIHandlers({
    onStart: startScanner,
    onMuteToggle: toggleMute,
    onReplay: replayVideo,
    onCameraAllow: handleCameraAllow,
    onCameraDeny: handleCameraDeny,
  });

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handleBeforeUnload);
}

main();
