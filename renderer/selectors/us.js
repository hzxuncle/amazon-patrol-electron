'use strict';

/**
 * amazon.com (US) 站点专用选择器覆盖
 * 实测数据：B01N1UX8RW @ 2026-07-23
 * 放在 common 之前，精确命中时无需遍历通用 fallback
 */
const US_OVERRIDES = {
  code: 'US',
  domain: 'amazon.com',

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
    // US 测试：#acBadge_feature_div span.a-size-small ❌，直接命中容器（JSON）
    // 由 content.js 的 parseAcBadge 判断是否含 acAsin
    '#acBadge_feature_div',
  ],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = US_OVERRIDES;
}
