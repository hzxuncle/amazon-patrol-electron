'use strict';
const US_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['.mvt-ac-badge-rectangle', '#acBadge_feature_div span.a-size-small'],
  coupon: [
    '[id^="greenBadgepct"]',    // 百分比優惠，如 "Save 5%"
    '[id^="greenBadgedollar"]', // 美元金額優惠，如 "Save $2.00"
  ],
};
if (typeof module !== 'undefined' && module.exports) module.exports = US_SELECTORS;
