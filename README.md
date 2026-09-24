# Per-site Media Volume

A Manifest V3 browser extension for adjusting volume on websites that lack this feature.

## Features

- one setting shared by all subdomains of the same main domain;
- ON/OFF switch for the current main domain;
- volume slider from 0% to 100%;
- detection of `<audio>` and `<video>` elements in the page and its frames;
- support for dynamically added media elements;
- restoration of the original volume when control is disabled;
- WebExtensions i18n support with English and Russian locales;

For example, these hosts share one setting:

```text
artist.bandcamp.com
bandcamp.com
www.bandcamp.com
```

The built-in domain resolver handles regular domains and common compound public suffixes such as `co.uk`, `com.au`, and `com.kz`. It does not bundle the complete Public Suffix List, so uncommon suffix structures may be grouped approximately.

## Chrome / Chromium

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Select this directory.

## Firefox

1. Open `about:debugging`.
2. Open **This Firefox**.
3. Select **Load Temporary Add-on**.
4. Select `manifest.json`.

A temporary Firefox add-on is removed after restarting the browser. Permanent installation requires Mozilla signing.
