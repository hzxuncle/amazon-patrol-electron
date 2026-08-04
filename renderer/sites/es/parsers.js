'use strict';

// ES: 逗号小数分隔符，评分格式 "4,3 de 5 estrellas"（与 MX 相同）
function extractPrice(text) {
  if (!text) return '';
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const match = normalized.match(/[\d]+\.?\d*/);
  return match ? match[0] : '';
}

function extractRating(text) {
  if (!text) return '';
  // "4,3 de 5 estrellas" → "4.3"
  const m = text.match(/([\d,]+)\s*de\s*\d/i);
  if (m) return m[1].replace(',', '.');
  const e = text.match(/([\d.]+)\s*out\s*of/i);
  return e ? e[1] : '';
}

const ES_PARSERS = { extractPrice, extractRating };
if (typeof module !== 'undefined' && module.exports) module.exports = ES_PARSERS;
