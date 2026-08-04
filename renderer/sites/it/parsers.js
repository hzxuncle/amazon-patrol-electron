'use strict';

// IT: 逗号小数分隔符，评分格式 "4,2 su 5 stelle"
function extractPrice(text) {
  if (!text) return '';
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const match = normalized.match(/[\d]+\.?\d*/);
  return match ? match[0] : '';
}

function extractRating(text) {
  if (!text) return '';
  // "4,2 su 5 stelle" → "4.2"
  const m = text.match(/([\d,]+)\s*su\s*\d/i);
  if (m) return m[1].replace(',', '.');
  const e = text.match(/([\d.]+)\s*out\s*of/i);
  return e ? e[1] : '';
}

const IT_PARSERS = { extractPrice, extractRating };
if (typeof module !== 'undefined' && module.exports) module.exports = IT_PARSERS;
