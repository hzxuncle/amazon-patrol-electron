## Task 1: _base/ — 通用基准层

**Files:**
- Create: `renderer/sites/_base/selectors.js`
- Create: `renderer/sites/_base/parsers.js`
- Create: `renderer/sites/_base/normalizers.js`
- Create: `renderer/sites/_base/scraper.js`

**Interfaces:**
- Produces:
  - `_base/selectors.js`：导出 `BASE_SELECTORS` 对象（所有字段的选择器数组）
  - `_base/parsers.js`：导出 `{ extractPrice, extractRating, extractReviewCount, cleanText, extractNumber, parseDealBadge, parseAcBadge, parseCoupon, extractProductDetails }`
  - `_base/normalizers.js`：导出 `{ normalizeStock, normalizePrice }`
  - `_base/scraper.js`：导出 `{ scrapePageData, handleScrape, checkPageType, waitForStableDOM, simulateHumanBehavior, queryWithFallback, queryAllWithFallback }`

- [ ] **Step 1: 新建 renderer/sites/_base/selectors.js**

将 `renderer/selectors/common.js` 的内容迁移，重命名导出变量为 `BASE_SELECTORS`：

```js
'use strict';
const BASE_SELECTORS = {
  price: [
    '.a-price[data-a-size="xl"] .a-offscreen',
    // ... 完整内容从 renderer/selectors/common.js 复制
  ],
  // ... 其余字段
};
if (typeof module !== 'undefined' && module.exports) module.exports = BASE_SELECTORS;
```

- [ ] **Step 2: 新建 renderer/sites/_base/parsers.js**

从 `renderer/content.js` 提取以下函数，保持逻辑完全不变：
- `cleanText(text)`
- `extractNumber(text)`
- `extractPrice(text)`
- `extractRating(text)` — 注意：base 版只支持英文 `out of`，MX 会在 mx/parsers.js 覆盖
- `extractReviewCount(text)`
- `parseDealBadge(rawText)` — 包含当前所有 patterns（含已加的多语言）
- `parseAcBadge(rawText)`
- `parseCoupon(rawText)`
- `extractProductDetails()` — 注意：这是在页面上下文运行的，不能有 require

```js
'use strict';
// 注意：此文件会被序列化后注入到浏览器页面，不能使用 require/module.exports 以外的 Node API
function cleanText(text) { /* 从 content.js 复制 */ }
function extractPrice(text) { /* 从 content.js 复制 */ }
// ... 其他函数
const BASE_PARSERS = { cleanText, extractNumber, extractPrice, extractRating, extractReviewCount, parseDealBadge, parseAcBadge, parseCoupon, extractProductDetails };
if (typeof module !== 'undefined' && module.exports) module.exports = BASE_PARSERS;
```

- [ ] **Step 3: 新建 renderer/sites/_base/normalizers.js**

从 `content.js` 的库存归一化逻辑提取：

```js
'use strict';
function normalizeStock(rawStock) {
  if (!rawStock) return null;
  const lower = rawStock.toLowerCase();
  if (lower.includes('unavailable') || lower.includes('out of stock')) return 'Out of Stock';
  if (lower.includes('only') || lower.match(/\d+\s*(left|remaining)/)) return 'In Stock (Limited)';
  if (lower.includes('stock') || lower.includes('in stock')) return 'In Stock';
  // 兜底：返回原始文本（各站点可覆盖此函数处理本地语言）
  return rawStock;
}
const BASE_NORMALIZERS = { normalizeStock };
if (typeof module !== 'undefined' && module.exports) module.exports = BASE_NORMALIZERS;
```

- [ ] **Step 4: 新建 renderer/sites/_base/scraper.js**

从 `content.js` 提取核心抓取流程，改为接受注入的 selectors/parsers/normalizers 而不是全局引用：

```js
'use strict';
// 此文件注入到页面后，通过 window.__SCRAPER_CONFIG__ 获取 selectors/parsers/normalizers

function getSite() {
  return window.__SITE_CODE__ || window.location.hostname;
}

function queryWithFallback(selectors) { /* 从 content.js 复制 */ }
function queryAllWithFallback(selectors, maxResults) { /* 从 content.js 复制 */ }
function waitForStableDOM(targetSelectors, stableMs, maxWaitMs) { /* 从 content.js 复制 */ }
function simulateHumanBehavior() { /* 从 content.js 复制 */ }
function checkPageType() { /* 从 content.js 复制 */ }

async function scrapePageData(options) {
  const cfg = window.__SCRAPER_CONFIG__;
  const { selectors, parsers, normalizers } = cfg;
  const hostname = getSite();

  // ... 完整抓取逻辑从 content.js 复制
  // 关键：将原来直接调用 extractPrice(rawPrice) 改为 parsers.extractPrice(rawPrice)
  // 将原来直接调用 getSelectors(hostname, 'price') 改为 selectors.price
  // 将库存归一化改为 normalizers.normalizeStock(rawStock)
}

async function handleScrape(message) { /* 从 content.js 复制，调用 scrapePageData */ }

const BASE_SCRAPER = { scrapePageData, handleScrape, checkPageType, waitForStableDOM, simulateHumanBehavior, queryWithFallback, queryAllWithFallback };
if (typeof module !== 'undefined' && module.exports) module.exports = BASE_SCRAPER;
```

- [ ] **Step 5: Commit**

```bash
git add renderer/sites/_base/
git commit -m "feat: add _base scraper layer (selectors/parsers/normalizers/scraper)"
```

---

