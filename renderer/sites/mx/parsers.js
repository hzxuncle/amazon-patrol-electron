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
