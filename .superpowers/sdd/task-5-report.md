# Task 5 Report: content.js — result.site 改为 code

**Status:** DONE_WITH_CONCERNS

## Commits
- `b473a61` feat: inject site code into page context, result.site returns code

## Changes Made

### electron/tab-manager.js
- In `injectAndScrape`: added `await win.webContents.executeJavaScript(...)` to inject `window.__SITE_CODE__` before the main scrape script runs.
- In `openTabForTask`: replaced `injectAndScrape(win, asin, config)` with `const configWithCode = { ...config, _siteCode: site }; injectAndScrape(win, asin, configWithCode)`.

### renderer/content.js
- Replaced `function getSite() { return window.location.hostname; }` with a version that returns `window.__SITE_CODE__ || window.location.hostname`.

## Test Summary
No automated tests. Manual verification required: when `task.site` is a code (e.g. `CA`), `window.__SITE_CODE__` is injected before content.js runs, so `getSite()` returns `CA`, and `result.site` = `CA`. The `result.site = site` override in `openTabForTask` (which runs after `injectAndScrape` returns) provides an additional safety net ensuring the code is always used regardless of what content.js returns.

## Concerns

### SITE_OVERRIDES key mismatch in selectors.js
`selectors.js` has `SITE_OVERRIDES` keyed on full hostnames (`www.amazon.ca`, `www.amazon.com`, etc.). Once `getSite()` returns a code like `CA`, the call `getSelectors('CA', field)` will not match any override entry and will fall back to defaults only.

**Impact currently: zero** — all SITE_OVERRIDES entries have empty arrays for every field, so the fallback-to-defaults behavior is identical. No selector lookups break.

**Future risk**: if site-specific selector overrides are ever populated, they will be silently ignored because the hostname key no longer matches the code returned by `getSite()`. To fix this properly, `SITE_OVERRIDES` keys should be migrated to codes (`CA`, `US`, etc.) OR `getSelectors` should receive the full hostname separately from the site code.
