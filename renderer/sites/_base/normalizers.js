'use strict';
// 注意：此文件会被序列化后注入到浏览器页面，不能使用 require/module.exports 以外的 Node API

function normalizeStock(rawStock) {
  if (!rawStock) return null;
  const lower = rawStock.toLowerCase();
  if (lower.includes('unavailable') || lower.includes('out of stock')) return 'Out of Stock';
  if (lower.includes('only') || lower.match(/\d+\s*(left|remaining)/)) return 'In Stock (Limited)';
  if (lower.includes('stock') || lower.includes('in stock')) return 'In Stock';
  // 兜底：返回原始文本（各站点可覆盖此函数处理本地语言）
  return rawStock;
}

function normalizePrice(rawPrice) {
  if (!rawPrice) return '';
  const match = rawPrice.match(/[\d,]+\.?\d*/);
  return match ? match[0] : rawPrice.replace(/\s+/g, ' ').trim();
}

const BASE_NORMALIZERS = { normalizeStock, normalizePrice };

if (typeof module !== 'undefined' && module.exports) module.exports = BASE_NORMALIZERS;
