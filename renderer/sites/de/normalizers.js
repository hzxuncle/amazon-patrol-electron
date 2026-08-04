'use strict';

// DE: 库存文本保留德文原文，不归一化为英文
function normalizeStock(rawStock) {
  return rawStock || '';
}

const DE_NORMALIZERS = { normalizeStock };
if (typeof module !== 'undefined' && module.exports) module.exports = DE_NORMALIZERS;
