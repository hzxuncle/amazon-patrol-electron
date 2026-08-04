'use strict';

// ES: 库存文本保留西班牙文原文，不归一化为英文
function normalizeStock(rawStock) {
  return rawStock || '';
}

const ES_NORMALIZERS = { normalizeStock };
if (typeof module !== 'undefined' && module.exports) module.exports = ES_NORMALIZERS;
