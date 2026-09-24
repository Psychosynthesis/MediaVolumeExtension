(() => {
  const GLOBAL_KEY = 'PerSiteMediaVolumeUtils';

  if (globalThis[GLOBAL_KEY]) {
    return;
  }

  const COMMON_SECOND_LEVEL_DOMAINS = new Set([
    'ac',
    'co',
    'com',
    'edu',
    'gov',
    'net',
    'org',
  ]);

  const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    volume: 0.5,
  });

  const STORAGE_PREFIX = 'site-media-volume:';

  function normalizeHostname(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim().toLowerCase().replace(/\.$/, '');
  }

  function isIpAddress(hostname) {
    if (hostname.includes(':')) {
      return true;
    }

    const parts = hostname.split('.');

    return parts.length === 4 && parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) {
        return false;
      }

      const value = Number.parseInt(part, 10);
      return value >= 0 && value <= 255;
    });
  }

  function getSiteDomain(value) {
    const hostname = normalizeHostname(value);

    if (!hostname || hostname === 'localhost' || isIpAddress(hostname)) {
      return hostname || null;
    }

    const labels = hostname.split('.');

    if (labels.length <= 2) {
      return hostname;
    }

    const topLevelDomain = labels.at(-1);
    const secondLevelDomain = labels.at(-2);
    const hasCommonCountrySuffix = topLevelDomain.length === 2
      && COMMON_SECOND_LEVEL_DOMAINS.has(secondLevelDomain);

    return labels.slice(hasCommonCountrySuffix ? -3 : -2).join('.');
  }

  function getStorageKey(siteDomain) {
    return `${STORAGE_PREFIX}${siteDomain}`;
  }

  function clampVolume(value) {
    return Math.min(1, Math.max(0, value));
  }

  function validateConfig(value) {
    if (value === undefined) {
      return { ...DEFAULT_CONFIG };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      console.warn('[Per-site Media Volume] Invalid site configuration:', value);
      return { ...DEFAULT_CONFIG };
    }

    const enabled = typeof value.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_CONFIG.enabled;
    const volume = Number.isFinite(value.volume)
      ? clampVolume(value.volume)
      : DEFAULT_CONFIG.volume;

    if (enabled !== value.enabled || volume !== value.volume) {
      console.warn('[Per-site Media Volume] Site configuration was normalized:', value);
    }

    return { enabled, volume };
  }

  globalThis[GLOBAL_KEY] = Object.freeze({
    DEFAULT_CONFIG,
    clampVolume,
    getSiteDomain,
    getStorageKey,
    normalizeHostname,
    validateConfig,
  });
})();
