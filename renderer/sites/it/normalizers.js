'use strict';

// IT: 库存文本保留意大利文原文，不归一化为英文
function normalizeStock(rawStock) {
  return rawStock || '';
}

const IT_NORMALIZERS = { normalizeStock };
if (typeof module !== 'undefined' && module.exports) module.exports = IT_NORMALIZERS;
