const extensionApi = globalThis.browser ?? globalThis.chrome;
const utils = globalThis.PerSiteMediaVolumeUtils;

const siteDomainElement = document.querySelector('#site-domain');
const switchElement = document.querySelector('#switch');
const enabledElement = document.querySelector('#enabled');
const enabledLabelElement = document.querySelector('#enabled-label');
const volumeElement = document.querySelector('#volume');
const volumeValueElement = document.querySelector('#volume-value');
const statusElement = document.querySelector('#status');

let siteDomain = null;
let storageKey = null;
let mediaCount = 0;
let config = { ...utils.DEFAULT_CONFIG };
let saveQueue = Promise.resolve();

function getMessage(name, substitutions) {
  return extensionApi.i18n.getMessage(name, substitutions) || name;
}

function applyTranslations() {
  document.documentElement.lang = extensionApi.i18n.getUILanguage();

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = getMessage(element.dataset.i18n);
  });

  switchElement.setAttribute('aria-label', getMessage('toggleAriaLabel'));
}

function getHostname(url) {
  try {
    const parsedUrl = new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }

    return utils.normalizeHostname(parsedUrl.hostname) || null;
  } catch {
    return null;
  }
}

function renderVolume() {
  const percent = Math.round(config.volume * 100);
  volumeElement.value = String(percent);
  volumeValueElement.value = `${percent}%`;
}

function render() {
  siteDomainElement.textContent = siteDomain ?? getMessage('unavailablePage');
  enabledElement.checked = config.enabled;
  enabledLabelElement.textContent = config.enabled ? 'ON' : 'OFF';
  renderVolume();

  statusElement.classList.remove('error');
  statusElement.textContent = mediaCount > 0
    ? getMessage(
      config.enabled ? 'mediaFoundEnabled' : 'mediaFoundDisabled',
      String(mediaCount),
    )
    : getMessage('mediaNotFound');
}

function renderError(message) {
  enabledElement.disabled = true;
  volumeElement.disabled = true;
  statusElement.classList.add('error');
  statusElement.textContent = message;
}

function saveConfig() {
  const snapshot = { ...config };

  saveQueue = saveQueue
    .then(() => extensionApi.storage.local.set({
      [storageKey]: snapshot,
    }))
    .catch((error) => {
      console.error('[Per-site Media Volume] Failed to save settings:', error);
      renderError(getMessage('saveError'));
    });
}

async function initialize() {
  applyTranslations();
  enabledElement.disabled = true;
  volumeElement.disabled = true;

  const [activeTab] = await extensionApi.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!Number.isInteger(activeTab?.id)) {
    throw new Error(getMessage('activeTabError'));
  }

  const hostname = getHostname(activeTab.url);

  if (!hostname) {
    siteDomainElement.textContent = getMessage('unavailablePage');
    throw new Error(getMessage('httpOnlyError'));
  }

  siteDomain = utils.getSiteDomain(hostname);

  if (!siteDomain) {
    throw new Error(getMessage('siteDomainError'));
  }

  storageKey = utils.getStorageKey(siteDomain);
  siteDomainElement.textContent = siteDomain;

  await extensionApi.scripting.executeScript({
    target: {
      tabId: activeTab.id,
      allFrames: true,
    },
    files: ['shared.js', 'content.js'],
  });

  const [storedConfigs, frameResults] = await Promise.all([
    extensionApi.storage.local.get(storageKey),
    extensionApi.scripting.executeScript({
      target: {
        tabId: activeTab.id,
        allFrames: true,
      },
      func: () => document.querySelectorAll('audio, video').length,
    }),
  ]);

  config = utils.validateConfig(storedConfigs[storageKey]);
  mediaCount = frameResults.reduce((total, frameResult) => {
    return total + (Number.isInteger(frameResult.result) ? frameResult.result : 0);
  }, 0);

  enabledElement.disabled = false;
  volumeElement.disabled = false;
  render();
}

enabledElement.addEventListener('change', () => {
  config.enabled = enabledElement.checked;
  render();
  saveConfig();
});

volumeElement.addEventListener('input', () => {
  const percent = Number.parseInt(volumeElement.value, 10);

  if (!Number.isFinite(percent)) {
    return;
  }

  config.volume = utils.clampVolume(percent / 100);
  renderVolume();
  saveConfig();
});

initialize().catch((error) => {
  console.error('[Per-site Media Volume] Initialization failed:', error);
  renderError(error.message || getMessage('initializationError'));
});
