'use strict';

// FR price 实测未命中 _base 主选择器（B07JKS3HXS 为二手商品页）
// 补充二手商品价格选择器
const FR_SELECTORS = {
  price: [
    '#usedOnlyBuybox .a-price .a-offscreen',
    '#price_inside_buybox',
    '.a-price[data-a-size="l"] .a-offscreen',
    '.a-price[data-a-size="m"] .a-offscreen',
    '#corePrice_feature_div .a-offscreen',
  ],
};

if (typeof module !== 'undefined' && module.exports) module.exports = FR_SELECTORS;
