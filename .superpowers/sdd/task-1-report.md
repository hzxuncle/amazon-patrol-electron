# Task 1: _base/ — 通用基准层

## Status: DONE

## Commits Made
- `818178b` feat: add _base scraper layer (selectors/parsers/normalizers/scraper)

## Test Summary
All 4 modules verified via Node.js require(): correct exports, correct logic. `extractPrice('USD 29.99')` → `29.99`; `extractRating('4.5 out of 5 stars')` → `4.5`; `normalizeStock('Only 3 left in stock')` → `In Stock (Limited)`; `normalizeStock('Currently unavailable')` → `Out of Stock`. All 7 scraper exports present.

## Changes Made

### renderer/sites/_base/selectors.js
- Copied all selectors from `renderer/selectors/common.js` verbatim
- Renamed export variable from `COMMON_SELECTORS` to `BASE_SELECTORS`
- All 12 field keys preserved: price, listPrice, rating, reviews, seller, stock, title, dealBadge, acBadge, coupon, parentAsin, nonProductPage

### renderer/sites/_base/parsers.js
- Extracted all 9 parser functions from `renderer/content.js` with no logic changes:
  `cleanText`, `extractNumber`, `extractPrice`, `extractRating`, `extractReviewCount`, `parseDealBadge`, `parseAcBadge`, `parseCoupon`, `extractProductDetails`
- `extractRating` is base/EN-only (`out of` pattern); MX override lives in mx/parsers.js
- `extractProductDetails` uses DOM APIs — correct for browser injection context
- Exported as `BASE_PARSERS`

### renderer/sites/_base/normalizers.js
- `normalizeStock(rawStock)` extracted and cleaned from inline if/else in content.js scrapePageData
- Added `normalizePrice(rawPrice)` as a companion utility (mirrors extractPrice logic, useful for site overrides)
- Exported as `BASE_NORMALIZERS`

### renderer/sites/_base/scraper.js
- All 7 functions from content.js faithfully copied: `queryWithFallback`, `queryAllWithFallback`, `waitForStableDOM`, `checkPageType`, `simulateHumanBehavior`, `scrapePageData`, `handleScrape`
- `scrapePageData` refactored: reads `window.__SCRAPER_CONFIG__` for `{ selectors, parsers, normalizers }`
  - `getSelectors(hostname, 'price')` → `selectors.price`
  - `extractPrice(rawPrice)` → `parsers.extractPrice(rawPrice)`
  - inline stock if/else → `normalizers.normalizeStock(rawStock)`
- `getSite()`, `sleep`, `randomSleep` defined locally (no imports)
- `chrome.runtime.onMessage` listener removed (belongs in content.js entry point, not in injected library)
- Exported as `BASE_SCRAPER`
