
const REQUIRED_ELEMENTS = {
  app: "#app",
  arRoot: "#ar-root",
  uiLayer: "#ui-layer",
  controls: "#controls",
  startButton: "#start-ar",
  muteButton: "#mute-video",
  replayButton: "#replay-video",
  status: "#status",
  errorMessage: "#error-message",
  scanGuide: "#scan-guide",
  cameraPopup: "#camera-permission-popup",
  cameraPopupAllow: "#camera-allow",
  cameraPopupDeny: "#camera-deny",
};

let cachedElements = null;
let boundHandlers = null;

export function getUIElements() {
  if (cachedElements) {
    return cachedElements;
  }

  const elements = {};

  for (const [name, selector] of Object.entries(REQUIRED_ELEMENTS)) {
    const element = document.querySelector(selector);

    if (!element) {
      throw new Error(`Missing UI element: ${selector}`);
    }

    elements[name] = element;
  }

  cachedElements = elements;
  return elements;
}

export function setStatus(message) {
  const { status } = getUIElements();
  status.textContent = message;
}

export function setError(message) {
  const { errorMessage } = getUIElements();
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

export function clearError() {
  const { errorMessage } = getUIElements();
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

export function setLoading(isLoading) {
  const { app, startButton, muteButton, replayButton } = getUIElements();
  app.dataset.loading = String(isLoading);
  startButton.disabled = isLoading;
  muteButton.disabled = isLoading;
  replayButton.disabled = isLoading;
}

export function setControlsVisible(isVisible) {
  const { muteButton, replayButton } = getUIElements();
  muteButton.hidden = !isVisible;
  replayButton.hidden = !isVisible;
}

export function setStartEnabled(isEnabled) {
  const { startButton } = getUIElements();
  startButton.disabled = !isEnabled;
}

export function setStartVisible(isVisible) {
  const { startButton } = getUIElements();
  startButton.hidden = !isVisible;
}

export function setMutedState(isMuted) {
  const { muteButton } = getUIElements();
  muteButton.textContent = isMuted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-pressed", String(!isMuted));
}

export function setScanGuideVisible(isVisible) {
  const { scanGuide } = getUIElements();
  scanGuide.hidden = !isVisible;
}

export function setCameraPermissionPopupVisible(isVisible) {
  const { cameraPopup } = getUIElements();
  if (cameraPopup) {
    cameraPopup.hidden = !isVisible;
  }
}

export function bindUIHandlers(handlers = {}) {
  const { startButton, muteButton, replayButton, cameraPopupAllow, cameraPopupDeny } = getUIElements();

  if (boundHandlers) {
    startButton.removeEventListener("click", boundHandlers.start);
    muteButton.removeEventListener("click", boundHandlers.mute);
    replayButton.removeEventListener("click", boundHandlers.replay);
    cameraPopupAllow?.removeEventListener("click", boundHandlers.cameraAllow);
    cameraPopupDeny?.removeEventListener("click", boundHandlers.cameraDeny);
  }

  const safeCall = (handlerName) => async (event) => {
    event.preventDefault();

    const handler = handlers[handlerName];
    if (typeof handler !== "function") {
      return;
    }

    await handler(event);
  };

  boundHandlers = {
    start: safeCall("onStart"),
    mute: safeCall("onMuteToggle"),
    replay: safeCall("onReplay"),
    cameraAllow: safeCall("onCameraAllow"),
    cameraDeny: safeCall("onCameraDeny"),
  };

  startButton.addEventListener("click", boundHandlers.start);
  muteButton.addEventListener("click", boundHandlers.mute);
  replayButton.addEventListener("click", boundHandlers.replay);
  cameraPopupAllow?.addEventListener("click", boundHandlers.cameraAllow);
  cameraPopupDeny?.addEventListener("click", boundHandlers.cameraDeny);
}
