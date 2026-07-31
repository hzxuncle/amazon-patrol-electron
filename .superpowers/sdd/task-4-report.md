# Task 4 Report: tab-manager.js — 切换到新入口

**Status:** DONE

## Commits
- `f29b153` refactor: tab-manager uses new sites/index.js per-site scraper

## Changes Summary

### electron/tab-manager.js

1. **Removed** `const selectorsIndex = require(...)` and `const SELECTORS_JS = fs.readFileSync(...)` (old selectors/index.js + selectors.js read).
2. **Removed** `rawContent` / `CONTENT_BODY` block (fs.readFileSync of content.js + string processing).
3. **Added** `const sitesIndex = require(path.join(__dirname, '../renderer/sites/index.js'))`.
4. **In `injectAndScrape`:**
   - Kept: `window.__SITE_CODE__` injection.
   - Removed: `siteSelectors` build loop and `window.__SITE_SELECTORS__` injection.
   - Replaced `fullScript` to call `sitesIndex.buildScraperScript(siteCode)` and invoke `window.__SCRAPER__.handleScrape(...)` instead of inlining `SELECTORS_JS` + `CONTENT_BODY`.

### package.json

Added `"renderer/sites/**/*"` to `asarUnpack` array (existing entries preserved).

## Verification
- `node --check electron/tab-manager.js` → SYNTAX OK (Node v16.20.2, no output = pass)
- No new npm dependencies introduced
