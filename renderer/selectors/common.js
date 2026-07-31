'use strict';

/**
 * 通用选择器配置（所有站点共用 fallback）
 * 基于实测数据精简，已删除全站点无效的选择器
 */
const COMMON_SELECTORS = {

  price: [
    // xl 价格块 — 实测 US/CA/AU/MX 全部命中，值正确
    '.a-price[data-a-size="xl"] .a-offscreen',
    '.a-price.aok-align-center[data-a-size="xl"] .a-offscreen',
    // 核心价格模块（注意：命中但值可能为空，需外层检查）
    '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
    '#corePrice_desktop .a-price .a-offscreen',
    // 通用价格 span
    'span.a-price[data-a-size="xl"] span.a-offscreen',
    // 买框价格
    '#buybox-price .a-price .a-offscreen',
    '#newBuyBoxPrice',
    // 旧版价格 ID
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
    // 兜底
    'span.a-price:not(.a-text-price) span.a-offscreen'
  ],

  listPrice: [
    // basisPrice 块 — 实测四站点全部命中，值正确
    '.basisPrice .a-price .a-offscreen',
    '.basisPrice span.a-offscreen',
    // 独立划线价
    '#listPrice',
    '#listPriceValue',
    '.a-price.a-text-price .a-offscreen',
    '#pep-list-price .a-price .a-offscreen',
    // 以下命中但可能误值，放靠后
    '.a-text-price .a-offscreen',
    '#listPriceBlock .a-text-strike',
    '.a-text-price[data-a-size="b"] .a-offscreen'
  ],

  rating: [
    // acrPopover — 实测四站点全部命中，返回本地化文本如 "4.6 out of 5 stars" / "4.7 de 5 estrellas"
    '#acrPopover .a-icon-alt',
    '#acrPopover span.a-icon-alt',
    '#averageCustomerReviews .a-icon-alt',
    '#averageCustomerReviews span.a-declarative .a-icon-alt',
    '#acrCustomerReviewLink .a-icon-alt',
    'span[data-hook="rating-out-of-text"]',
    // 注意：.a-icon-star .a-icon-alt 会误命中评论卡片，已移除
    '[data-hook="review-summary"] .a-icon-alt',
    '#cm_cr_dpwidget .a-icon-alt',
    'i.a-icon-star span.a-icon-alt'
  ],

  reviews: [
    // 实测四站点全部命中
    '#acrCustomerReviewText',
    '#acrCustomerReviewLink .a-size-base',
    '#acrCustomerReviewLink span',
    'a[data-hook="see-all-reviews-link-foot"]',
    'span[data-hook="total-review-count"]',
    '#reviews-medley-footer .a-size-base',
    '[data-hook="rating-count"]',
    '#cm_cr_dpwidget .a-size-base',
    'a#acrCustomerReviewLink',
    'span#acrCustomerReviewText',
    'div[data-hook="total-review-count"] span'
  ],

  seller: [
    // 实测唯一有效选择器 — 四站点全部命中
    'a#sellerProfileTriggerId',
    // 以下实测全部 ❌，保留作为兜底
    '#merchant-info',
    '#merchantInfo',
    '#tabular-buybox .tabular-buybox-text',
    '#soldByThirdParty',
    '#soldByThirdParty span',
    '#sellerName',
    '#buybox-seller-name',
    'a[href*="seller="] span',
    '#shipsFromSoldBy_feature_div .a-size-small',
    '#ships-from-sold-by .a-size-small',
    '#seller-info .a-size-small',
    'div[data-buybox="merchant"] span',
    '[data-feature-name="merchantInfo"] span.a-size-small'
  ],

  stock: [
    // #availability span — 实测四站点全部命中，文本最干净
    '#availability span',
    '#availability',
    '#outOfStock',
    '#outOfStock .a-color-error',
    '#deliveryBlockMessage span',
    '#deliveryMessageMirId span',
    'div[data-buybox="availability"]',
    '#buybox-availability',
    '#desktop_buybox .a-color-success',
    '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE span'
  ],

  title: [
    // 实测四站点全部命中
    '#productTitle',
    '#title',
    // #ebooksProductTitle 实测全 ❌，仅保留兜底
    '#ebooksProductTitle',
    'h1.a-size-large span#productTitle',
    '#title_feature_div h1'
  ],

  dealBadge: [
    // 倒计时（Ends in HH:MM:SS）
    '.detailpage-dealBadge-countdown-timer',
    // 实测四站点命中，文本最干净
    '#dealBadgeSupportingText span',
    '#dealBadgeSupportingText',
    'span.dealBadge span.dealBadgeTextColor',
    'span.dealBadge span',
    'span.dealBadge',
    '#dealBadge',
    '#deal-badge',
    '.dealBadge',
    '#dealBadge_feature_div .a-badge-label-inner',
    '#priceblock_dealprice_row .a-color-base',
    '#dealOfTheDay_feature_div .a-badge-label-inner',
    'span.a-badge-supplementary-text',
    '#pep-deal-badge .a-badge-label-inner',
    'span.a-badge-label-inner',
    'span.a-badge-text',
    'span[data-a-badge-color="sx-lightning-deal-red"]',
    '.a-declarative[data-csa-c-type="widget"] .a-badge-label-inner',
    '#dealPrice_feature_div .a-badge-label-inner'
  ],

  acBadge: [
    // CA/AU 命中 span.a-size-small，US/MX 直接命中容器（返回 JSON）
    '#acBadge_feature_div span.a-size-small',
    '#acBadge_feature_div .a-badge-label-inner',
    '#acBadge_feature_div',
    'a#acBadge_feature_div',
    '#acBadge_feature_div .a-badge',
    '#detail_ac_badge .a-badge-label-inner',
    '#detail_ac_badge',
    'span.ac-badge-text',
    '.ac-badge-wrapper span',
    '[data-feature-name="acBadge"] .a-badge-label-inner',
    '[data-csa-c-type="widget"][data-csa-c-content-id="acBadge"] span'
  ],

  coupon: [
    '#couponTextpct',
    '#couponTextdollar',
    '#coupon_feature_div .a-size-small',
    '#promo_price_details_row .a-size-small',
    '.promoPriceBlockMessage',
    '#promoMessage',
    '.vpcoupon-text',
    '#vcCouponContainer span',
    'div.couponBannerText',
    'span.vpcoupon',
    '#vpcoupon_feature_div span',
    '#clipCouponButton span',
    '.clipCouponButton span',
    '.couponBadge',
    '#couponBadge_feature_div .a-badge-label-inner'
  ],

  parentAsin: [
    { type: 'attr', selector: '#twister', attr: 'data-parent-asin' },
    { type: 'attr', selector: '#twister-plus', attr: 'data-parent-asin' },
    { type: 'attr', selector: '.twister-plus', attr: 'data-parent-asin' },
    { type: 'attr', selector: '#variation_size_name', attr: 'data-parent-asin' },
    { type: 'attr', selector: '#variation_color_name', attr: 'data-parent-asin' },
    { type: 'attr', selector: 'div[id*="twister"]', attr: 'data-parent-asin' },
    { type: 'attr', selector: '#native_dropdown_selected_size_name', attr: 'data-parent-asin' },
    { type: 'regex', regex: /"parentAsin"\s*:\s*"([A-Z0-9]+)"/ },
    { type: 'regex', regex: /'parentAsin'\s*:\s*'([A-Z0-9]+)'/ },
    { type: 'regex', regex: /parentAsin["']?\s*[:=]\s*["']([A-Z0-9]+)["']/ },
    { type: 'attr', selector: 'input[name="parentAsin"]', attr: 'value' },
    { type: 'attr', selector: 'input[id*="parentAsin"]', attr: 'value' }
  ],

  nonProductPage: [
    '#captcha',
    'form[action*="validateCaptcha"]',
    'img[src*="captcha"]',
    '#ap_error_page',
    '.a-alert-error',
    '#search-results',
    'div[data-component-type="s-search-result"]',
    '.s-result-list',
    '#nav-logo-sprites'
  ]
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = COMMON_SELECTORS;
}
