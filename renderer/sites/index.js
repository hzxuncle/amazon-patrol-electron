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
 * Strip Node-only guards from inlined browser-destined source files.
 * Removes lines matching:
 *   if (typeof module !== 'undefined' && module.exports) module.exports = ...
 *   const BASE_XXX = { ... };   (the named export object declarations)
 * Also strips top-level 'use strict'; because the IIFE wrapper provides its own.
 */
function stripNodeGuards(src) {
  if (!src) return '';
  return src
    // Remove module.exports guard lines (single-line form used in all base files)
    .replace(/^if\s*\(typeof module[^\n]*\n?/gm, '')
    // Remove single-line named export objects like: const AU_PARSERS = { extractProductDetails, extractBsr };
    .replace(/^const\s+(?:BASE|MX|US|CA|AU)_[A-Z_]+\s*=\s*\{[\w\s,]*\};\s*$/gm, '')
    // Remove top-level 'use strict'; (the wrapper already has it)
    .replace(/^'use strict';\s*\n?/m, '')
    .trim();
}

/**
 * 构建指定站点的完整 scraper 配置
 * 返回可注入页面的 JS 字符串（用于 executeJavaScript）
 */
function buildScraperScript(siteCode) {
  const code = (siteCode || 'US').toUpperCase();
  const siteDir = path.join(__dirname, code.toLowerCase());

  // 加载选择器：数组字段做追加合并（子在前优先，base 在后兜底），非数组字段子覆盖父
  // 站点可定义 `${field}Fallback` 数组，追加到合并结果最末尾（低优先级兜底）
  const baseSelectors = require(path.join(BASE_DIR, 'selectors'));
  const siteSelectors = tryRequire(path.join(siteDir, 'selectors')) || {};
  const selectors = {};
  const allKeys = new Set([...Object.keys(baseSelectors), ...Object.keys(siteSelectors)
    .filter(k => !k.endsWith('Fallback'))]);
  for (const key of allKeys) {
    const base = baseSelectors[key];
    const site = siteSelectors[key];
    const siteFallback = siteSelectors[key + 'Fallback'] || [];
    if (Array.isArray(base) && Array.isArray(site)) {
      // 子在前，base 在后，fallback 在最末，字符串选择器去重，对象类型直接保留
      const seen = new Set();
      const merged = [];
      for (const sel of [...site, ...base, ...siteFallback]) {
        if (typeof sel === 'object') { merged.push(sel); continue; }
        if (!seen.has(sel)) { seen.add(sel); merged.push(sel); }
      }
      selectors[key] = merged;
    } else {
      selectors[key] = site !== undefined ? site : base;
    }
  }

  // 读取 parsers/normalizers/scraper 各层源码（供内联）
  const baseParserContent = fs.readFileSync(path.join(BASE_DIR, 'parsers.js'), 'utf8');
  const baseNormContent   = fs.readFileSync(path.join(BASE_DIR, 'normalizers.js'), 'utf8');
  const scraperContent    = fs.readFileSync(path.join(BASE_DIR, 'scraper.js'), 'utf8');

  const siteParserContent = readFileContent(path.join(siteDir, 'parsers'))   || '';
  const siteNormContent   = readFileContent(path.join(siteDir, 'normalizers')) || '';

  // 站点函数与 _base 函数同名时，JS 函数声明后覆盖前（hoisting），
  // 故先写 _base、再写 site — site 函数会覆盖 _base 同名函数。
  return `
(function() {
  'use strict';

  // ===== selectors =====
  var __SEL__ = ${JSON.stringify(selectors, null, 2)};

  // ===== parsers (_base) =====
  ${stripNodeGuards(baseParserContent)}

  // ===== parsers (site override: ${code}) =====
  ${stripNodeGuards(siteParserContent)}

  // ===== normalizers (_base) =====
  ${stripNodeGuards(baseNormContent)}

  // ===== normalizers (site override: ${code}) =====
  ${stripNodeGuards(siteNormContent)}

  // ===== scraper =====
  ${stripNodeGuards(scraperContent)}

  // ===== 挂载到全局供 tab-manager 调用 =====
  window.__SCRAPER__ = { scrapePageData, handleScrape };
  window.__SCRAPER_CONFIG__ = {
    selectors: __SEL__,
    parsers: {
      extractPrice,
      extractRating,
      extractReviewCount,
      cleanText,
      parseDealBadge,
      parseAcBadge,
      parseCoupon,
      extractProductDetails,
      extractBsr: (typeof extractBsr === 'function') ? extractBsr : null
    },
    normalizers: {
      normalizeStock,
      normalizePrice
    }
  };
})();
`;
}

module.exports = { buildScraperScript };
