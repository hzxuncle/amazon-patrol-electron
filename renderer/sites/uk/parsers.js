'use strict';

// UK 使用英文，extractRating 与 _base 一致，无需覆盖
// extractPrice 使用英镑符号 £，格式为 £92.48，点号做小数分隔，_base 直接可用

const UK_PARSERS = {};
if (typeof module !== 'undefined' && module.exports) module.exports = UK_PARSERS;
