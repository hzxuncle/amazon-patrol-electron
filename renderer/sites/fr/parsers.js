'use strict';

// FR: 逗号小数分隔符，评分格式 "4,2 sur 5 étoiles"
// price 未命中时由 _base 兜底，extractPrice 需处理欧洲格式
function extractPrice(text) {
  if (!text) return '';
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const match = normalized.match(/[\d]+\.?\d*/);
  return match ? match[0] : '';
}

function extractRating(text) {
  if (!text) return '';
  // "4,2 sur 5 étoiles" → "4.2"
  const m = text.match(/([\d,]+)\s*sur\s*\d/i);
  if (m) return m[1].replace(',', '.');
  const e = text.match(/([\d.]+)\s*out\s*of/i);
  return e ? e[1] : '';
}

const FR_PARSERS = { extractPrice, extractRating };
if (typeof module !== 'undefined' && module.exports) module.exports = FR_PARSERS;
