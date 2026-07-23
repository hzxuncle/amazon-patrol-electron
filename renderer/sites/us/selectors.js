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
  acBadge: ['#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = US_SELECTORS;
