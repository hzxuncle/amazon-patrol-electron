'use strict';

const ES_SELECTORS = {
  seller: [
    'a#sellerProfileTriggerId',
    '#merchant-info a',
    '#merchantInfoFeature_feature_div .offer-display-feature-text',
  ],
};

if (typeof module !== 'undefined' && module.exports) module.exports = ES_SELECTORS;
