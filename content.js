(() => {
  const CONTROLLER_KEY = '__perSiteMediaVolumeController';

  if (globalThis[CONTROLLER_KEY]) {
    globalThis[CONTROLLER_KEY].refresh();
    return;
  }

  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const utils = globalThis.PerSiteMediaVolumeUtils;
  const MEDIA_SELECTOR = 'audio, video';

  const siteDomain = utils.getSiteDomain(window.location.hostname);

  if (!siteDomain || !extensionApi?.storage?.local) {
    return;
  }

  const storageKey = utils.getStorageKey(siteDomain);

  let config = { ...utils.DEFAULT_CONFIG };
  let originalVolumes = new WeakMap();

  const trackedMedia = new Set();

  function setMediaVolume(media, volume) {
    if (Math.abs(media.volume - volume) < 0.001) {
      return;
    }

    try {
      media.volume = volume;
    } catch (error) {
      console.warn('[Per-site Media Volume] Failed to change media volume:', error);
    }
  }

  function handleVolumeChange(event) {
    if (config.enabled) {
      setMediaVolume(event.currentTarget, config.volume);
    }
  }

  function applyToMedia(media) {
    if (!(media instanceof HTMLMediaElement)) {
      return;
    }

    if (!trackedMedia.has(media)) {
      originalVolumes.set(media, media.volume);
      trackedMedia.add(media);
      media.addEventListener('volumechange', handleVolumeChange);
    }

    setMediaVolume(media, config.volume);
  }

  function applyToNode(node) {
    if (node instanceof HTMLMediaElement) {
      applyToMedia(node);
    }

    if (typeof node.querySelectorAll === 'function') {
      node.querySelectorAll(MEDIA_SELECTOR).forEach(applyToMedia);
    }
  }

  function applyToAllMedia() {
    for (const media of trackedMedia) {
      if (!media.isConnected) {
        media.removeEventListener('volumechange', handleVolumeChange);
        trackedMedia.delete(media);
      }
    }

    document.querySelectorAll(MEDIA_SELECTOR).forEach(applyToMedia);
  }

  function applyIfEnabled() {
    if (config.enabled) {
      applyToAllMedia();
    }
  }

  function restoreOriginalVolumes() {
    for (const media of trackedMedia) {
      media.removeEventListener('volumechange', handleVolumeChange);

      const originalVolume = originalVolumes.get(media);

      if (media.isConnected && Number.isFinite(originalVolume)) {
        setMediaVolume(media, utils.clampVolume(originalVolume));
      }
    }

    trackedMedia.clear();
    originalVolumes = new WeakMap();
  }

  function applyConfig(nextConfig) {
    const wasEnabled = config.enabled;
    config = utils.validateConfig(nextConfig);

    if (config.enabled) {
      applyToAllMedia();
    } else if (wasEnabled) {
      restoreOriginalVolumes();
    }
  }

  const observer = new MutationObserver((records) => {
    if (!config.enabled) {
      return;
    }

    for (const record of records) {
      record.addedNodes.forEach(applyToNode);
    }
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
  });

  document.addEventListener('DOMContentLoaded', applyIfEnabled);
  window.addEventListener('load', applyIfEnabled);

  extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[storageKey]) {
      applyConfig(changes[storageKey].newValue);
    }
  });

  globalThis[CONTROLLER_KEY] = {
    refresh() {
      applyIfEnabled();
    },
  };

  extensionApi.storage.local.get(storageKey)
    .then((result) => applyConfig(result[storageKey]))
    .catch((error) => {
      console.warn('[Per-site Media Volume] Failed to load settings:', error);
    });
})();
