'use strict';
const MX_SELECTORS = {
  price: [
    '#corePrice_feature_div .a-offscreen',
  ],
  listPrice: [
    '#corePriceDisplay_desktop_feature_div .a-offscreen',
    '.basisPrice .a-price .a-offscreen',
  ],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['.mvt-ac-badge-rectangle', '#acBadge_feature_div span.a-size-small'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = MX_SELECTORS;
