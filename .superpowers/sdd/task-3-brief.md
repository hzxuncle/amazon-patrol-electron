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

