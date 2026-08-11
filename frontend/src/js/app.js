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
 * Detects if the current browser is likely a mobile device.
 * On mobile, we need to explicitly request camera permission before
 * starting the AR session (especially on iOS Safari).
 */
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/**
 * Proactively asks the browser for camera access so the native permission
 * dialog is shown. This is critical on iOS Safari and mobile Chrome.
 * Must be called within a user gesture event handler.
 */
async function requestCameraAccess() {
  try {
    // Get a temporary video stream to trigger the permission prompt
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    // Stop all tracks immediately - we just needed the permission
    const tracks = stream.getTracks();
    for (const track of tracks) {
      if (track && typeof track.stop === "function") {
        track.stop();
      }
    }

    return { granted: true };
  } catch (error) {
    const message = String(error?.message ?? "").toLowerCase();
    const name = String(error?.name ?? "").toLowerCase();

    if (name === "notallowederror" || message.includes("permission")) {
      return { granted: false, reason: "denied", error };
    }
    if (message.includes("insecure")) {
      return { granted: false, reason: "insecure-context", error };
    }
    return { granted: false, reason: "unknown", error };
  }
}

/**
 * Shows the camera permission popup on mobile devices.
 * On desktop, permission is typically handled by the browser automatically.
 */
function showCameraPermissionPopup() {
  setCameraPermissionPopupVisible(true);
  setStatus("Tap Allow to grant camera access");
}

/**
 * Checks camera permission state and shows the popup if needed.
 * Uses the Permissions API where available, falls back to showing
 * the popup on mobile devices.
 */
function checkCameraPermission() {
  const support = detectSupport();

  if (!support.supported) {
    setError(support.message);
    setStartEnabled(false);
    return;
  }

  // Check if we can use the Permissions API
  if (typeof navigator.permissions !== "undefined" && navigator.permissions.query) {
    navigator.permissions
      .query({ name: "camera" })
      .then((permission) => {
        permission.addEventListener("change", () => {
          if (permission.state === "granted") {
            setCameraPermissionPopupVisible(false);
            setStatus("Ready to scan");
            setStartEnabled(true);
          }
        });

        if (permission.state === "granted") {
          // Permission already granted
          setStatus("Ready to scan");
          setStartEnabled(true);
        } else if (permission.state === "denied") {
          setError("Camera permission was denied. Enable it in browser settings.");
          setStatus("Camera permission denied");
          setStartEnabled(true);
        } else {
          // permission.state === "prompt" or any other state
          showCameraPermissionPopup();
        }
      })
      .catch(() => {
        // Permissions API not working, fall back to mobile detection
        if (isMobileDevice()) {
          showCameraPermissionPopup();
        } else {
          setStatus("Ready to scan");
          setStartEnabled(true);
        }
      });
  } else {
    // No Permissions API, fall back to mobile detection
    if (isMobileDevice()) {
      showCameraPermissionPopup();
    } else {
      setStatus("Ready to scan");
      setStartEnabled(true);
    }
  }
}

/**
 * Formats an error object into a readable detail string for debugging.
 * Includes error name, message, stack, and any additional properties.
 */
function formatErrorDetails(error) {
  if (!error) {
    return "No error details available";
  }

  const parts = [];

  // Error name and message
  const name = error.name || "Error";
  const message = error.message || String(error);
  parts.push(`${name}: ${message}`);

  // Stack trace if available
  if (error.stack) {
    parts.push(`Stack: ${error.stack}`);
  }

  // Any additional properties (e.g., MindAR-specific error info)
  for (const key of Object.keys(error)) {
    if (key !== "name" && key !== "message" && key !== "stack") {
      try {
        const value = typeof error[key] === "object" ? JSON.stringify(error[key]) : String(error[key]);
        parts.push(`${key}: ${value}`);
      } catch (e) {
        parts.push(`${key}: [unable to serialize]`);
      }
    }
  }

  return parts.join("\n");
}

/**
 * Displays a detailed error popup with full error information for debugging.
 * The popup shows the error name, message, stack trace, and additional details.
 */
function showDetailedError(title, error) {
  const details = formatErrorDetails(error);
  const fullMessage = `${title}\n\n${details}`;

  // Set the error message in the UI
  setError(fullMessage);

  // Also log to console for desktop debugging
  console.error(`[scanner] ${title}`, error);

  // Show a detailed alert for immediate visibility
  console.warn(`[DEBUG] ${title}:\n${details}`);
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
    // Log full error details for debugging
    console.error("[scanner] startScanner error:", error);
    
    handleStartError(error);
    resetFailedStartup();
  } finally {
    setLoading(false);
    setStartEnabled(!scannerStarted);
  }
}

/**
 * Handles the "Allow Camera" button click.
 * This function MUST call getUserMedia directly (within the user gesture)
 * to ensure the browser shows the permission prompt on mobile.
 */
async function handleCameraAllow(event) {
  event.preventDefault();

  setCameraPermissionPopupVisible(false);
  setStatus("Requesting camera access...");
  setStartEnabled(false);

  const result = await requestCameraAccess();

  if (result.granted) {
    setStatus("Camera access granted, starting scanner...");
    await startScanner();
  } else {
    if (result.reason === "denied") {
      setError("Camera access was denied.\n\nPlease:\n1. Check browser settings for camera permission\n2. Tap the lock/icon in your browser's address bar\n3. Ensure camera is set to 'Allow'\n4. Reload the page and try again");
    } else if (result.reason === "insecure-context") {
      setError("Open this scanner from HTTPS or localhost.");
    } else {
      // Show detailed error for unknown failures
      showDetailedError(
        "Camera access failed. Check browser settings and try again.",
        result.error,
      );
    }
    setStatus("Camera access required");
    setStartEnabled(true);
  }
}

function handleCameraDeny(event) {
  event.preventDefault();
  setCameraPermissionPopupVisible(false);
  setError("Camera access is required for AR scanning.\n\nTo enable:\n1. Tap the Start button\n2. When prompted, tap 'Allow Camera'\n3. If denied, check browser settings");
  setStatus("Camera permission denied");
  setStartEnabled(true);
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

  // Get detailed error info for debugging
  const classified = classifyStartupError(error);
  const detailedMessage = getStartupErrorMessage(classified);
  const errorDetails = formatErrorDetails(error);

  // Combine classified message with raw error details
  setError(`${detailedMessage}\n\nDetails:\n${errorDetails}`);
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

  // Attach direct event listeners to popup buttons for reliability
  const { cameraPopupAllow, cameraPopupDeny } = getUIElements();
  cameraPopupAllow.addEventListener("click", handleCameraAllow);
  cameraPopupDeny.addEventListener("click", handleCameraDeny);

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
