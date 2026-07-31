# Task 3 Report: sites/index.js — Node-side scraper builder

**Status:** DONE

## Commits

- `69fa347` feat: add sites/index.js - build per-site scraper script for injection

## Changes Made

### renderer/sites/index.js (new file)

Created the Node-side entry point that builds a per-site injectable JS string.

Key design decisions:

1. **`stripNodeGuards(src)`** — strips `'use strict';`, the `const BASE_XXX = {...};` export objects, and `if (typeof module !== 'undefined' && module.exports) module.exports = ...` guard lines before inlining each file. Uses regex that handles all naming variants (BASE/MX/US/CA/AU).

2. **Inline order** — `_base` parsers/normalizers first, then site-specific parsers/normalizers second. Because both layers use `function` declarations (hoisted), the site-level re-declaration of a same-named function (e.g. `extractRating` for MX, `normalizeStock` for MX) wins at runtime.

3. **Selectors** — JSON-serialized via `JSON.stringify` (arrays of strings and plain objects are JSON-safe).

4. **`window.__SCRAPER_CONFIG__`** — exposes `selectors` (the merged JSON object), `parsers` (references to the inlined named functions), and `normalizers` (same).

5. **`window.__SCRAPER__`** — exposes `{ scrapePageData, handleScrape }` for tab-manager.

6. Wrapped in an IIFE `(function() { 'use strict'; ... })();` to avoid polluting the page global scope beyond the two `window.__*` assignments.

## Test Summary

Exact brief test: `script length: 20244 / has handleScrape: true / has __SCRAPER__: true`

Additional checks all pass:
- `node --check renderer/sites/index.js` — syntax OK
- US script: all core functions present (extractRating, normalizeStock, scrapePageData, handleScrape, __SCRAPER_CONFIG__)
- MX script: 2× `function extractRating` (base + MX override), 2× `function normalizeStock` (base + MX override), contains "estrellas" and "no disponible"

## Concerns

None.
