export async function loadExperienceManifest(manifestSrc) {
  const response = await fetch(manifestSrc, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`Manifest failed to load: ${response.status}`);
  }

  const manifest = await response.json();
  return normalizeManifest(manifest);
}

function normalizeManifest(manifest) {
  validateManifest(manifest);

  return {
    version: manifest.version ?? 1,
    targetSrc: manifest.targetSrc,
    experiences: manifest.experiences.map((experience) => ({
      id: experience.id,
      targetIndex: experience.targetIndex,
      videoMp4Src: experience.videoMp4Src,
      videoWebmSrc: experience.videoWebmSrc ?? null,
      posterSrc: experience.posterSrc,
      cardAspectRatio: experience.cardAspectRatio,
      videoAspectRatio: experience.videoAspectRatio,
      overlayWidth: experience.overlayWidth,
      overlayXOffset: experience.overlayXOffset ?? 0,
      overlayYOffset: experience.overlayYOffset ?? 0,
      overlayZOffset: experience.overlayZOffset ?? 0.01,
      coverFullCard: experience.coverFullCard ?? true,
    })),
  };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Manifest must be a JSON object.");
  }

  if (!manifest.targetSrc || typeof manifest.targetSrc !== "string") {
    throw new Error("Manifest is missing targetSrc.");
  }

  validateLocalAssetPath(manifest.targetSrc, "targetSrc", ".mind");

  if (!Array.isArray(manifest.experiences) || manifest.experiences.length === 0) {
    throw new Error("Manifest must include at least one experience.");
  }

  const targetIndexes = new Set();

  for (const experience of manifest.experiences) {
    validateExperience(experience);

    if (targetIndexes.has(experience.targetIndex)) {
      throw new Error(`Duplicate targetIndex: ${experience.targetIndex}`);
    }

    targetIndexes.add(experience.targetIndex);
  }
}

function validateExperience(experience) {
  if (!experience || typeof experience !== "object") {
    throw new Error("Experience must be a JSON object.");
  }

  if (!experience.id || typeof experience.id !== "string") {
    throw new Error("Experience is missing id.");
  }

  if (!Number.isInteger(experience.targetIndex) || experience.targetIndex < 0) {
    throw new Error(`Invalid targetIndex for experience: ${experience.id}`);
  }

  if (!experience.videoMp4Src || typeof experience.videoMp4Src !== "string") {
    throw new Error(`Experience is missing videoMp4Src: ${experience.id}`);
  }

  validateLocalAssetPath(experience.videoMp4Src, "videoMp4Src", ".mp4");

  if (experience.videoWebmSrc) {
    validateLocalAssetPath(experience.videoWebmSrc, "videoWebmSrc", ".webm");
  }

  if (!experience.posterSrc || typeof experience.posterSrc !== "string") {
    throw new Error(`Experience is missing posterSrc: ${experience.id}`);
  }

  validateLocalAssetPath(experience.posterSrc, "posterSrc");
  validatePositiveNumber(experience.cardAspectRatio, "cardAspectRatio", experience.id);
  validatePositiveNumber(experience.videoAspectRatio, "videoAspectRatio", experience.id);
  validatePositiveNumber(experience.overlayWidth, "overlayWidth", experience.id);
}

function validateLocalAssetPath(path, fieldName, requiredExtension = null) {
  const lowerPath = path.toLowerCase();
  const isExternal =
    lowerPath.includes("://") ||
    lowerPath.startsWith("//") ||
    lowerPath.startsWith("data:") ||
    lowerPath.startsWith("blob:");

  if (isExternal || path.includes("\\") || !path.startsWith("./assets/")) {
    throw new Error(`${fieldName} must be a local ./assets/ path.`);
  }

  if (path.includes("..")) {
    throw new Error(`${fieldName} must not traverse directories.`);
  }

  if (requiredExtension && !lowerPath.endsWith(requiredExtension)) {
    throw new Error(`${fieldName} must end with ${requiredExtension}.`);
  }
}

function validatePositiveNumber(value, fieldName, experienceId) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${fieldName} for experience: ${experienceId}`);
  }
}
