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
