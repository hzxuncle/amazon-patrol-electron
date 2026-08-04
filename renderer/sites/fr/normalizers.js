'use strict';

// FR: 库存文本保留法文原文，不归一化为英文
function normalizeStock(rawStock) {
  return rawStock || '';
}

const FR_NORMALIZERS = { normalizeStock };
if (typeof module !== 'undefined' && module.exports) module.exports = FR_NORMALIZERS;
