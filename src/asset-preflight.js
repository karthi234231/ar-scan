export async function preflightManifestAssets(manifest) {
  await assertAssetReachable(manifest.targetSrc, "AR target");

  await Promise.all(
    manifest.experiences.flatMap((experience) => {
      const checks = [
        assertAssetReachable(experience.videoMp4Src, `video for ${experience.id}`),
        assertAssetReachable(experience.posterSrc, `poster for ${experience.id}`),
      ];

      if (experience.videoWebmSrc) {
        checks.push(
          assertAssetReachable(
            experience.videoWebmSrc,
            `webm video for ${experience.id}`,
            { optional: true },
          ),
        );
      }

      return checks;
    }),
  );
}

async function assertAssetReachable(src, label, options = {}) {
  let response;

  try {
    response = await fetchAssetHead(src);
  } catch {
    response = await fetchAssetRange(src);
  }

  if (response.ok) {
    await response.body?.cancel();
    return;
  }

  if (response.status === 405 || response.status === 501) {
    let fallbackResponse;

    try {
      fallbackResponse = await fetchAssetRange(src);
    } catch (error) {
      throw new Error(`${label} failed to load: ${src}`, { cause: error });
    }

    if (fallbackResponse.ok || fallbackResponse.status === 206) {
      await fallbackResponse.body?.cancel();
      return;
    }

    if (options.optional && fallbackResponse.status === 404) {
      return;
    }

    throw new Error(`${label} failed to load: ${src}`);
  }

  if (options.optional && response.status === 404) {
    await response.body?.cancel();
    return;
  }

  await response.body?.cancel();
  throw new Error(`${label} failed to load: ${src}`);
}

function fetchAssetHead(src) {
  return fetch(src, {
    method: "HEAD",
    cache: "no-store",
    credentials: "same-origin",
  });
}

function fetchAssetRange(src) {
  return fetch(src, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Range: "bytes=0-0",
    },
  });
}