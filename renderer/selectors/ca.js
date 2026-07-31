'use strict';

/**
 * amazon.ca (CA) 站点专用选择器覆盖
 * 实测数据：B01N1UX8RW @ 2026-07-23
 */
const CA_OVERRIDES = {
  code: 'CA',
  domain: 'amazon.ca',

  price: [
    '.a-price[data-a-size="xl"] .a-offscreen',
  ],

  listPrice: [
    '.basisPrice .a-price .a-offscreen',
  ],

  rating: [
    '#acrPopover .a-icon-alt',
  ],

  reviews: [
    '#acrCustomerReviewText',
  ],

  seller: [
    'a#sellerProfileTriggerId',
  ],

  stock: [
    '#availability span',
  ],

  title: [
    '#productTitle',
  ],

  dealBadge: [
    '.detailpage-dealBadge-countdown-timer',
    '#dealBadgeSupportingText span',
  ],

  acBadge: [
    // CA 测试：span.a-size-small 命中，返回可读文本
    '#acBadge_feature_div span.a-size-small',
    '#acBadge_feature_div',
  ],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CA_OVERRIDES;
}
