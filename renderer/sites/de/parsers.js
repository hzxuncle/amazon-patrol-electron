'use strict';

// DE: 逗号小数分隔符（53,54€），评分格式 "4,3 von 5 Sternen"
function extractPrice(text) {
  if (!text) return '';
  // 欧洲格式：千位点分隔 + 逗号小数，如 1.234,56 → 1234.56
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const match = normalized.match(/[\d]+\.?\d*/);
  return match ? match[0] : '';
}

function extractRating(text) {
  if (!text) return '';
  // "4,3 von 5 Sternen" → "4.3"
  const m = text.match(/([\d,]+)\s*von\s*\d/i);
  if (m) return m[1].replace(',', '.');
  // 兜底：英文格式
  const e = text.match(/([\d.]+)\s*out\s*of/i);
  return e ? e[1] : '';
}

const DE_PARSERS = { extractPrice, extractRating };
if (typeof module !== 'undefined' && module.exports) module.exports = DE_PARSERS;
