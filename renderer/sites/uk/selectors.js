'use strict';

const UK_SELECTORS = {
  price: ['#corePrice_feature_div .a-offscreen'],
  seller: [
    'a#sellerProfileTriggerId',
    '#merchant-info a',          // 二手/第三方卖家链接文字，比完整文本干净
    '#merchantInfoFeature_feature_div .offer-display-feature-text',
  ],
};

if (typeof module !== 'undefined' && module.exports) module.exports = UK_SELECTORS;
