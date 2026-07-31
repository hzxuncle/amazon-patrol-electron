'use strict';

/**
 * amazon.com.mx (MX) 站点专用选择器覆盖
 * 实测数据：B01N1UX8RW @ 2026-07-23
 *
 * 注意事项：
 * - rating 返回西班牙文 "4.7 de 5 estrellas"，extractRating 需支持多语言
 * - stock 返回 "Disponible"（有货），"No disponible"（缺货）
 * - dealBadge 返回 "Promoción"（促销）
 */
const MX_OVERRIDES = {
  code: 'MX',
  domain: 'amazon.com.mx',

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
    // MX 测试：span.a-size-small ❌，直接命中容器
    '#acBadge_feature_div',
  ],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MX_OVERRIDES;
}
