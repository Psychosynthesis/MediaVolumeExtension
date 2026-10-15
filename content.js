(() => {
  const CONTROLLER_KEY = '__perSiteMediaVolumeController';

  if (globalThis[CONTROLLER_KEY]) {
    globalThis[CONTROLLER_KEY].refresh();
    return;
  }

  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const utils = globalThis.PerSiteMediaVolumeUtils;
  const MEDIA_SELECTOR = 'audio, video';

  if (!extensionApi?.storage?.local || !utils) {
    return;
  }

  let siteDomain = utils.getSiteDomain(window.location.hostname);
  let storageKey = siteDomain ? utils.getStorageKey(siteDomain) : null;

  let config = { ...utils.DEFAULT_CONFIG };
  let originalVolumes = new WeakMap();
  const trackedMedia = new Set();
  let storageLoaded = false;

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

  function trackMedia(media) {
    if (!(media instanceof HTMLMediaElement)) {
      return;
    }

    if (!trackedMedia.has(media)) {
      originalVolumes.set(media, media.volume);
      trackedMedia.add(media);
      media.addEventListener('volumechange', handleVolumeChange);
      media.addEventListener('play', handleVolumeChange);
      media.addEventListener('playing', handleVolumeChange);
      media.addEventListener('loadedmetadata', handleVolumeChange);
    }

    if (config.enabled) {
      setMediaVolume(media, config.volume);
    }
  }

  function untrackMedia(media) {
    media.removeEventListener('volumechange', handleVolumeChange);
    media.removeEventListener('play', handleVolumeChange);
    media.removeEventListener('playing', handleVolumeChange);
    media.removeEventListener('loadedmetadata', handleVolumeChange);
    trackedMedia.delete(media);
  }

  function collectMedia(root, results) {
    if (!root) {
      return;
    }

    if (root instanceof HTMLMediaElement) {
      results.push(root);
    }

    if (typeof root.querySelectorAll === 'function') {
      root.querySelectorAll(MEDIA_SELECTOR).forEach((media) => results.push(media));
    }

    if (root.shadowRoot) {
      collectMedia(root.shadowRoot, results);
    }

    if (root.children) {
      for (const child of root.children) {
        if (child.shadowRoot) {
          collectMedia(child.shadowRoot, results);
        }
      }
    }
  }

  function applyToNode(node) {
    const elements = [];
    collectMedia(node, elements);
    elements.forEach(trackMedia);
  }

  function applyToAllMedia() {
    for (const media of trackedMedia) {
      if (!media.isConnected) {
        untrackMedia(media);
      }
    }

    const allMedia = [];
    collectMedia(document, allMedia);
    allMedia.forEach(trackMedia);
  }

  function applyIfEnabled() {
    if (config.enabled) {
      applyToAllMedia();
    }
  }

  function restoreOriginalVolumes() {
    for (const media of trackedMedia) {
      untrackMedia(media);

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

  let observerStarted = false;

  function startObserver() {
    if (observerStarted) {
      return true;
    }

    try {
      observer.observe(document, {
        childList: true,
        subtree: true,
      });
      observerStarted = true;
      return true;
    } catch {
      const root = document.documentElement;
      if (root) {
        observer.observe(root, {
          childList: true,
          subtree: true,
        });
        observerStarted = true;
        return true;
      }
      return false;
    }
  }

  function loadStoredConfig() {
    if (!storageKey || storageLoaded) {
      return;
    }

    storageLoaded = true;
    extensionApi.storage.local.get(storageKey)
      .then((result) => applyConfig(result[storageKey]))
      .catch((error) => {
        storageLoaded = false;
        console.warn('[Per-site Media Volume] Failed to load settings:', error);
      });
  }

  function updateDomainAndLoad() {
    if (!siteDomain) {
      siteDomain = utils.getSiteDomain(window.location.hostname);
      if (siteDomain) {
        storageKey = utils.getStorageKey(siteDomain);
      }
    }

    if (storageKey && !storageLoaded) {
      loadStoredConfig();
    }
  }

  function refreshNow() {
    updateDomainAndLoad();
    startObserver();
    applyIfEnabled();
  }

  updateDomainAndLoad();
  startObserver();

  document.addEventListener('DOMContentLoaded', refreshNow);
  window.addEventListener('load', refreshNow);
  setInterval(refreshNow, 1000);

  extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && storageKey && changes[storageKey]) {
      applyConfig(changes[storageKey].newValue);
    }
  });

  globalThis[CONTROLLER_KEY] = {
    refresh() {
      refreshNow();
    },
  };
})();
