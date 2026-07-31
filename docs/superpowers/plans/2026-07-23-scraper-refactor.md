# 抓取引擎按站点拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `selectors.js` 和 `content.js` 按站点重构为 `renderer/sites/` 目录结构，每个站点独立可维护，通用逻辑放 `_base/`。

**Architecture:** `_base/` 包含完整默认实现（选择器/解析/归一化/抓取流程），各站点目录只写有差异的文件，`index.js` 按 siteCode 合并后注入页面。tab-manager.js 改为读新的入口，注入合并后的完整 scraper。

**Tech Stack:** Vanilla JS, Node.js ≥16, Electron 28

## Global Constraints

- 所有站点使用二字码（US/CA/AU/MX）标识，不使用域名
- 站点文件只写差异，缺失文件自动 fallback 到 `_base`
- 注入到页面的 scraper 对象通过 `window.__SCRAPER__` 访问
- `scrapePageData(options)` 是页面端的统一入口函数
- 旧文件（`renderer/selectors.js`、`renderer/selectors/`、`renderer/content.js`）在最后一个 Task 完成后删除
- No new npm dependencies
- node --check 所有 Node 端修改文件

---

## 文件变更一览

| 操作 | 文件 |
|------|------|
| 新建 | `renderer/sites/_base/selectors.js` |
| 新建 | `renderer/sites/_base/parsers.js` |
| 新建 | `renderer/sites/_base/normalizers.js` |
| 新建 | `renderer/sites/_base/scraper.js` |
| 新建 | `renderer/sites/us/selectors.js` |
| 新建 | `renderer/sites/ca/selectors.js` |
| 新建 | `renderer/sites/au/selectors.js` |
| 新建 | `renderer/sites/mx/selectors.js` |
| 新建 | `renderer/sites/mx/parsers.js` |
| 新建 | `renderer/sites/mx/normalizers.js` |
| 新建 | `renderer/sites/index.js` |
| 修改 | `electron/tab-manager.js` |
| 修改 | `package.json`（asarUnpack） |
| 删除 | `renderer/selectors.js`、`renderer/selectors/`、`renderer/content.js` |

---

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

## Task 2: 站点目录 — us/ca/au/mx

**Files:**
- Create: `renderer/sites/us/selectors.js`
- Create: `renderer/sites/ca/selectors.js`
- Create: `renderer/sites/au/selectors.js`
- Create: `renderer/sites/mx/selectors.js`
- Create: `renderer/sites/mx/parsers.js`
- Create: `renderer/sites/mx/normalizers.js`

**Interfaces:**
- Produces: 每个站点的覆盖文件，结构与 `_base` 对应文件相同，只包含差异部分

- [ ] **Step 1: us/selectors.js**

基于实测数据（2026-07-23 B01N1UX8RW）：

```js
'use strict';
const US_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = US_SELECTORS;
```

- [ ] **Step 2: ca/selectors.js**

```js
'use strict';
const CA_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['#acBadge_feature_div span.a-size-small', '#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = CA_SELECTORS;
```

- [ ] **Step 3: au/selectors.js**

```js
'use strict';
const AU_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['#acBadge_feature_div span.a-size-small', '#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = AU_SELECTORS;
```

- [ ] **Step 4: mx/selectors.js**

```js
'use strict';
const MX_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = MX_SELECTORS;
```

- [ ] **Step 5: mx/parsers.js — 覆盖 extractRating 支持西班牙文**

```js
'use strict';
function extractRating(text) {
  if (!text) return '';
  // 英文：4.6 out of 5 stars
  // 西班牙文：4.7 de 5 estrellas
  // 通用：提取首个数字（小数）
  const m = text.match(/([\d.]+)\s*(?:out\s*of|de\s*\d)/i);
  if (m) return m[1];
  // fallback：直接提取第一个数字
  const n = text.match(/^[\d.]+/);
  return n ? n[0] : '';
}
const MX_PARSERS = { extractRating };
if (typeof module !== 'undefined' && module.exports) module.exports = MX_PARSERS;
```

- [ ] **Step 6: mx/normalizers.js — 覆盖 normalizeStock 支持西班牙文**

```js
'use strict';
function normalizeStock(rawStock) {
  if (!rawStock) return null;
  const lower = rawStock.toLowerCase();
  // 西班牙文缺货
  if (lower.includes('no disponible') || lower.includes('agotado') ||
      lower.includes('unavailable') || lower.includes('out of stock')) return 'Out of Stock';
  // 西班牙文有货
  if (lower.includes('disponible') || lower.includes('en stock') ||
      lower.includes('stock') || lower.includes('in stock')) return 'In Stock';
  // 限量
  if ((lower.includes('solo') || lower.includes('only')) && lower.match(/\d+/)) return 'In Stock (Limited)';
  // 配送中（也算有货）
  if (lower.includes('env') || lower.includes('deliver')) return 'In Stock';
  return rawStock;
}
const MX_NORMALIZERS = { normalizeStock };
if (typeof module !== 'undefined' && module.exports) module.exports = MX_NORMALIZERS;
```

- [ ] **Step 7: Commit**

```bash
git add renderer/sites/us/ renderer/sites/ca/ renderer/sites/au/ renderer/sites/mx/
git commit -m "feat: add per-site scraper configs (us/ca/au/mx)"
```

---

## Task 3: sites/index.js — Node端总入口

**Files:**
- Create: `renderer/sites/index.js`

**Interfaces:**
- Produces: `buildScraper(siteCode)` → 返回合并后的完整 scraper 字符串（可直接注入页面）

- [ ] **Step 1: 新建 renderer/sites/index.js**

```js
'use strict';
const path = require('path');
const fs = require('fs');

const BASE_DIR = path.join(__dirname, '_base');

function tryRequire(filePath) {
  try {
    if (fs.existsSync(filePath + '.js')) return require(filePath);
  } catch (e) {}
  return null;
}

function readFileContent(filePath) {
  try {
    if (fs.existsSync(filePath + '.js')) return fs.readFileSync(filePath + '.js', 'utf8');
  } catch (e) {}
  return null;
}

/**
 * 构建指定站点的完整 scraper 配置
 * 返回可注入页面的 JS 字符串
 */
function buildScraperScript(siteCode) {
  const code = (siteCode || 'US').toUpperCase();
  const siteDir = path.join(__dirname, code.toLowerCase());

  // 加载各层（站点覆盖优先，缺失则用 _base）
  const baseSelectors = require(path.join(BASE_DIR, 'selectors'));
  const baseParsers   = require(path.join(BASE_DIR, 'parsers'));
  const baseNormalizers = require(path.join(BASE_DIR, 'normalizers'));

  const siteSelectors   = tryRequire(path.join(siteDir, 'selectors'))   || {};
  const siteParsers     = tryRequire(path.join(siteDir, 'parsers'))     || {};
  const siteNormalizers = tryRequire(path.join(siteDir, 'normalizers')) || {};

  // 合并：站点覆盖 > _base
  const selectors   = { ...baseSelectors,   ...siteSelectors };
  const parsers     = { ...baseParsers,     ...siteParsers };
  const normalizers = { ...baseNormalizers, ...siteNormalizers };

  // 读取 scraper 主文件（直接内联字符串，不序列化函数）
  const scraperContent = fs.readFileSync(path.join(BASE_DIR, 'scraper.js'), 'utf8');
  // parsers/normalizers 各层文件内容内联
  const baseParserContent   = fs.readFileSync(path.join(BASE_DIR, 'parsers.js'), 'utf8');
  const baseNormContent     = fs.readFileSync(path.join(BASE_DIR, 'normalizers.js'), 'utf8');
  const siteParserContent   = readFileContent(path.join(siteDir, 'parsers'))   || '';
  const siteNormContent     = readFileContent(path.join(siteDir, 'normalizers')) || '';

  // 注入配置：selectors 作为 JSON，parsers/normalizers 作为代码（支持函数覆盖）
  return `
(function() {
  'use strict';

  // ===== selectors =====
  var __SEL__ = ${JSON.stringify(selectors)};

  // ===== parsers (_base) =====
  ${baseParserContent.replace(/if \(typeof module.*\n?/g, '').replace(/module\.exports.*\n?/g, '')}

  // ===== parsers (site override) =====
  ${siteParserContent.replace(/if \(typeof module.*\n?/g, '').replace(/module\.exports.*\n?/g, '')}

  // ===== normalizers (_base) =====
  ${baseNormContent.replace(/if \(typeof module.*\n?/g, '').replace(/module\.exports.*\n?/g, '')}

  // ===== normalizers (site override) =====
  ${siteNormContent.replace(/if \(typeof module.*\n?/g, '').replace(/module\.exports.*\n?/g, '')}

  // ===== scraper =====
  ${scraperContent.replace(/if \(typeof module.*\n?/g, '').replace(/module\.exports.*\n?/g, '')}

  // 挂载到全局供 tab-manager 调用
  window.__SCRAPER__ = { scrapePageData, handleScrape };
  window.__SCRAPER_CONFIG__ = {
    selectors: __SEL__,
    parsers:   { extractPrice, extractRating, extractReviewCount, cleanText, parseDealBadge, parseAcBadge, parseCoupon, extractProductDetails },
    normalizers: { normalizeStock }
  };
})();
`;
}

module.exports = { buildScraperScript };
```

- [ ] **Step 2: node --check renderer/sites/index.js**

```bash
/home/ec2-user/.nvm/versions/node/v16.20.2/bin/node -e "const s = require('./renderer/sites/index.js'); console.log('buildScraperScript ok:', typeof s.buildScraperScript)"
```

Expected: `buildScraperScript ok: function`

- [ ] **Step 3: Commit**

```bash
git add renderer/sites/index.js
git commit -m "feat: add sites/index.js - build per-site scraper script for injection"
```

---

## Task 4: tab-manager.js — 切换到新入口

**Files:**
- Modify: `electron/tab-manager.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `renderer/sites/index.js` 的 `buildScraperScript(siteCode)`
- Produces: 注入页面的脚本改为新的 scraper 字符串

- [ ] **Step 1: tab-manager.js 改用新入口**

找到：
```js
const selectorsIndex = require(path.join(__dirname, '../renderer/selectors/index.js'));
const SELECTORS_JS = fs.readFileSync(
  unpackedPath(path.join(__dirname, '../renderer/selectors.js')), 'utf8'
);
```

替换为：
```js
const sitesIndex = require(path.join(__dirname, '../renderer/sites/index.js'));
```

找到 `injectAndScrape` 函数中的注入逻辑：
```js
// 注入 site code
await win.webContents.executeJavaScript(`window.__SITE_CODE__ = ${JSON.stringify(siteCode)}`);
// 注入站点选择器
const siteSelectors = {};
// ...
await win.webContents.executeJavaScript(`window.__SITE_SELECTORS__ = ${JSON.stringify(siteSelectors)}`);

const fullScript = `
(async function() {
  'use strict';
  try {
    ${SELECTORS_JS}
    ${CONTENT_BODY}
    const result = await handleScrape({...});
```

替换为：
```js
// 注入 site code
await win.webContents.executeJavaScript(`window.__SITE_CODE__ = ${JSON.stringify(siteCode)}`);

// 使用新的站点专用 scraper（包含选择器+解析+归一化+抓取流程）
const scraperScript = sitesIndex.buildScraperScript(siteCode);

const fullScript = `
(async function() {
  'use strict';
  try {
    ${scraperScript}
    const result = await window.__SCRAPER__.handleScrape({
      action: 'SCRAPE_NOW',
      asin: ${JSON.stringify(asin)},
      maxRetries: ${config.maxRetries || 3},
      retryDelay: ${config.retryDelay || 2000},
      useStability: ${config.useStability !== false},
      enabledFields: ${JSON.stringify(config.enabledFields || null)}
    });
    return result;
  } catch(e) {
    return {
      asin: ${JSON.stringify(asin)},
      status: 'failed',
      error: 'inject error: ' + e.message
    };
  }
})()
`;
```

同时删除旧的 `CONTENT_BODY` 相关代码（读取和处理 content.js 的部分）。

- [ ] **Step 2: package.json 更新 asarUnpack**

```json
"asarUnpack": [
  "renderer/content.js",
  "renderer/selectors.js",
  "renderer/selectors/**/*",
  "renderer/sites/**/*"
]
```

- [ ] **Step 3: node --check**

```bash
/home/ec2-user/.nvm/versions/node/v16.20.2/bin/node --check electron/tab-manager.js
```

- [ ] **Step 4: Commit**

```bash
git add electron/tab-manager.js package.json
git commit -m "refactor: tab-manager uses new sites/index.js per-site scraper"
```

---

## Task 5: 手动验证 + 清理旧文件

**Files:**
- Delete: `renderer/selectors.js`
- Delete: `renderer/selectors/`（整个目录）
- Delete: `renderer/content.js`

- [ ] **Step 1: 手动验证**

```bash
npm start
```

四个站点各巡一个 ASIN，确认：
1. US：价格/星级/库存/卖家/活动标全部正确
2. CA：同上，AC标返回可读文本
3. AU：同上
4. MX：星级返回 `4.7`（不是 `4.7 de 5 estrellas`），库存返回 `In Stock`（不是 `Disponible`），活动标返回 `Promoción`

- [ ] **Step 2: 删除旧文件**

```bash
rm renderer/selectors.js
rm -rf renderer/selectors/
rm renderer/content.js
```

- [ ] **Step 3: package.json 移除旧的 asarUnpack 条目**

```json
"asarUnpack": [
  "renderer/sites/**/*"
]
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy selectors.js, selectors/, content.js — replaced by sites/"
```
