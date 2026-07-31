/**
 * Amazon 多站点选择器配置
 * 每个字段提供多层 fallback，按优先级排列
 * 支持站点: amazon.ca / amazon.com / amazon.com.au / amazon.com.mx
 */

const SELECTOR_CONFIG = {
  // ============ 价格（当前售价） ============
  price: [
    // 核心价格模块 - 最常用
    '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
    '#corePrice_desktop .a-price .a-offscreen',
    // 大号价格（主显示区）
    '.a-price[data-a-size="xl"] .a-offscreen',
    '.a-price.aok-align-center[data-a-size="xl"] .a-offscreen',
    // 标准价格块
    '.a-price .a-offscreen',
    // 独立价格ID
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
    // 买框价格
    '#buybox-price .a-price .a-offscreen',
    '#newBuyBoxPrice',
    // TMM价格
    '#tmmSwatches .a-price .a-offscreen',
    // 通用价格span
    'span.a-price[data-a-size="xl"] span.a-offscreen',
    // 任何价格元素
    'span.a-price:not(.a-text-price) span.a-offscreen'
  ],

  // ============ 划线价（原价/List Price） ============
  listPrice: [
    // 基础价格块（含划线价）
    '.basisPrice .a-price .a-offscreen',
    '.basisPrice span.a-offscreen',
    // 独立划线价元素
    '#listPrice',
    '#listPriceValue',
    // 文字价格（带划线）
    '.a-text-price .a-offscreen',
    'span.a-text-strike',
    '.a-price.a-text-price .a-offscreen',
    // 节省价格区块
    '#regularprice_saveprice .a-text-strike',
    // 详情页划线
    '#price .a-text-strike',
    '#usedPrice .a-text-strike',
    // 带class的划线价格
    '.a-size-small.a-color-secondary .a-text-strike',
    // listPrice元数据块
    'span[data-a-strike="true"]',
    'td.a-text-strike',
    // 详细页list price
    '#listPriceBlock .a-text-strike',
    // 节省区块中的划线价
    'span.priceBlockStrikePriceString',
    // RRP / Was Price
    '.a-text-price[data-a-size="b"] .a-offscreen',
    // deal页
    '#pep-list-price .a-price .a-offscreen'
  ],

  // ============ 星级评分 ============
  rating: [
    // acrPopover中的评分文本
    '#acrPopover .a-icon-alt',
    '#acrPopover span.a-icon-alt',
    // 平均评分区
    '#averageCustomerReviews .a-icon-alt',
    '#averageCustomerReviews span.a-declarative .a-icon-alt',
    // 星级汇总链接
    '#acrCustomerReviewLink .a-icon-alt',
    // 星级文本
    'span[data-hook="rating-out-of-text"]',
    // 通用星级图标alt文本
    '.a-icon-star .a-icon-alt',
    '.a-icon-star-medium .a-icon-alt',
    '.a-icon-star-small .a-icon-alt',
    // review摘要
    '[data-hook="review-summary"] .a-icon-alt',
    // 众包评分
    '#cm_cr_dpwidget .a-icon-alt',
    'i.a-icon-star span.a-icon-alt',
    // 产品标题旁边的星级
    '#titleSection .a-icon-star .a-icon-alt',
    '.a-star-small-4-5 .a-icon-alt',
    // 更宽泛匹配
    '.a-icon-alt'
  ],

  // ============ 评论数量 ============
  reviews: [
    // 客户评论数文本
    '#acrCustomerReviewText',
    // 评论链接中的数字
    '#acrCustomerReviewLink .a-size-base',
    '#acrCustomerReviewLink span',
    'a[data-hook="see-all-reviews-link-foot"]',
    // 总评论数
    'span[data-hook="total-review-count"]',
    '#reviews-medley-footer .a-size-base',
    // rating计数文本
    '[data-hook="rating-count"]',
    // 评分分布区
    '#cm_cr_dpwidget .a-size-base',
    'a#acrCustomerReviewLink',
    // 任何 review 数量标识
    'span#acrCustomerReviewText',
    'div[data-hook="total-review-count"] span'
  ],

  // ============ 购物车卖家（Buy Box Seller） ============
  seller: [
    // 商户信息区
    '#merchant-info',
    '#merchantInfo',
    '#tabular-buybox .tabular-buybox-text',
    // 第三方卖家标识
    '#soldByThirdParty',
    '#soldByThirdParty span',
    // 买框卖家名
    '#sellerName',
    '#buybox-seller-name',
    // 卖家链接文本
    'a#sellerProfileTriggerId',
    'a[href*="seller="] span',
    // 发货和售卖信息
    '#shipsFromSoldBy_feature_div span',
    '#shipsFromSoldBy_feature_div .a-size-small',
    '#ships-from-sold-by .a-size-small',
    // 卖家信息区块
    '#seller-info .a-size-small',
    'div[data-buybox="merchant"] span',
    // Offer信息
    '#olpOfferWidget .a-size-small',
    '#usedBuyBox .a-size-small',
    // 通用商户信息
    'div[id*="merchant"] span',
    '[data-feature-name="merchantInfo"] span.a-size-small'
  ],

  // ============ 库存状态 ============
  stock: [
    // 可用性区块
    '#availability span',
    '#availability',
    '#availability-brief span',
    // 缺货标识
    '#outOfStock',
    '#outOfStock .a-color-error',
    // delivery信息
    '#deliveryBlockMessage span',
    '#deliveryMessageMirId span',
    // 买框库存
    'div[data-buybox="availability"]',
    '#buybox-availability',
    // 库存信息
    '#quantityRelocateFeature_feature_div',
    '#quantity',
    // 配送消息
    '#ddmDeliveryMessage span',
    '#ddmDeliveryMessage',
    // 可用性消息
    'span[data-action="show-all-offers-display"]',
    '#desktop_buybox .a-color-success',
    // prime delivery
    '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE span',
    // 通用库存指示
    'div[id*="availability"] span.a-size-medium',
    'span.a-declarative[data-csa-c-type="widget"] .a-color-success'
  ],

  // ============ 父体ASIN（变体关系） ============
  parentAsin: [
    // 从twister变体容器获取
    { type: 'attr', selector: '#twister', attr: 'data-parent-asin' },
    { type: 'attr', selector: '#twister-plus', attr: 'data-parent-asin' },
    { type: 'attr', selector: '.twister-plus', attr: 'data-parent-asin' },
    { type: 'attr', selector: '#variation_size_name', attr: 'data-parent-asin' },
    { type: 'attr', selector: '#variation_color_name', attr: 'data-parent-asin' },
    { type: 'attr', selector: 'div[id*="twister"]', attr: 'data-parent-asin' },
    // 从dimension容器的parent属性获取
    { type: 'attr', selector: '#native_dropdown_selected_size_name', attr: 'data-parent-asin' },
    // 从页面内JS变量提取 (content.js中专门处理)
    { type: 'regex', regex: /"parentAsin"\s*:\s*"([A-Z0-9]+)"/ },
    { type: 'regex', regex: /'parentAsin'\s*:\s*'([A-Z0-9]+)'/ },
    { type: 'regex', regex: /parentAsin["']?\s*[:=]\s*["']([A-Z0-9]+)["']/ },
    { type: 'regex', regex: /"dimensionToAsinMap"\s*:\s*\{[^}]*\}/ },
    // 从hidden input获取
    { type: 'attr', selector: 'input[name="parentAsin"]', attr: 'value' },
    { type: 'attr', selector: 'input[id*="parentAsin"]', attr: 'value' }
  ],

  // ============ 商品标题（辅助验证） ============
  title: [
    '#productTitle',
    '#title',
    '#ebooksProductTitle',
    'h1.a-size-large span#productTitle',
    '#title_feature_div h1'
  ],

  // ============ 活动/Deal标签 ============
  dealBadge: [
    // 倒计时活动（Ends in HH:MM:SS）— 内容最干净
    '.detailpage-dealBadge-countdown-timer',
    // Deal专用组件 - 最精准（参考 B0D96373RS / B0FZHST8J7 的结构）
    '#dealBadgeSupportingText span',
    '#dealBadgeSupportingText',
    'span.dealBadge #dealBadgeSupportingText span',
    'span.dealBadge span.dealBadgeTextColor',
    'span.dealBadge span',
    'span.dealBadge',
    // Deal Badge 通用选择器
    '#dealBadge',
    '#deal-badge',
    '.dealBadge',
    // Badge组件
    '#dealBadge_feature_div .a-badge-label-inner',
    // 价格下方的deal标签
    '#priceblock_dealprice_row .a-color-base',
    // Deal of the day
    '#dealOfTheDay_feature_div .a-badge-label-inner',
    // Lightning deal
    'span.a-badge-supplementary-text',
    // Pivotal deal badge
    '#pep-deal-badge .a-badge-label-inner',
    // 红色deal标签（通用）
    'span.a-badge-label-inner',
    'span.a-badge-text',
    // 橙色/红色促销标签
    'span[data-a-badge-color="sx-lightning-deal-red"]',
    // Deal标在价格行附近
    '.a-declarative[data-csa-c-type="widget"] .a-badge-label-inner',
    // 秒杀/限时标签
    '#dealPrice_feature_div .a-badge-label-inner',
    // 通用deal文本匹配（最后兜底）
    'span:contains("deal")',
    'span:contains("Deal")'
  ],

  // ============ Amazon's Choice 标识 ============
  acBadge: [
    // AC标主容器
    '#acBadge_feature_div .a-badge-label-inner',
    '#acBadge_feature_div span.a-size-small',
    // AC标完整文本
    '#acBadge_feature_div',
    // AC标链接
    'a#acBadge_feature_div',
    // AC标在标题下
    '#acBadge_feature_div .a-badge',
    // Detail page AC
    '#detail_ac_badge .a-badge-label-inner',
    '#detail_ac_badge',
    // 通配
    'span.ac-badge-text',
    '.ac-badge-wrapper span',
    // Widget形式的AC标
    '[data-feature-name="acBadge"] .a-badge-label-inner',
    '[data-csa-c-type="widget"][data-csa-c-content-id="acBadge"] span'
  ],

  // ============ Coupon 优惠券 ============
  coupon: [
    // 主Coupon容器
    '#couponTextpct',
    '#couponTextdollar',
    '#coupon_feature_div .a-size-small',
    '#promo_price_details_row .a-size-small',
    // Coupon label
    '.promoPriceBlockMessage',
    '#promoMessage',
    '.vpcoupon-text',
    '#vcCouponContainer span',
    // 绿底coupon标签
    'span[style*="green"]',
    'div.couponBannerText',
    // VPC/Vine coupon
    'span.vpcoupon',
    '#vpcoupon_feature_div span',
    // 通用coupon文本
    'span:contains("coupon")',
    'span:contains("Coupon")',
    'span:contains("Save")',
    // 百分比/金额 coupon
    'span.a-color-success:contains("%")',
    'span.a-color-success:contains("$")',
    // Clip coupon按钮文字
    '#clipCouponButton span',
    '.clipCouponButton span',
    // Coupon badges
    '.couponBadge',
    '#couponBadge_feature_div .a-badge-label-inner'
  ],

  // ============ 页面类型检测（非商品页） ============
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

// 站点特定选择器覆盖（各站点差异较大时使用）
const SITE_OVERRIDES = {
  'www.amazon.ca': {
    price: [], listPrice: [], rating: [], reviews: [],
    seller: [], stock: [], parentAsin: [],
    dealBadge: [], acBadge: [], coupon: []
  },
  'www.amazon.com': {
    price: [], listPrice: [], rating: [], reviews: [],
    seller: [], stock: [], parentAsin: [],
    dealBadge: [], acBadge: [], coupon: []
  },
  'www.amazon.com.au': {
    price: [], listPrice: [], rating: [], reviews: [],
    seller: [], stock: [], parentAsin: [],
    dealBadge: [], acBadge: [], coupon: []
  },
  'www.amazon.com.mx': {
    price: [], listPrice: [], rating: [], reviews: [],
    seller: [], stock: [], parentAsin: [],
    dealBadge: [], acBadge: [], coupon: []
  }
};

/**
 * 获取合并后的选择器列表（默认+站点覆盖）
 * @param {string} hostname - 站点hostname
 * @param {string} field - 字段名
 * @returns {Array} 选择器列表
 */
function getSelectors(hostname, field) {
  // 优先使用 tab-manager 注入的站点专用合并选择器
  if (window.__SITE_SELECTORS__ && window.__SITE_SELECTORS__[field]) {
    return window.__SITE_SELECTORS__[field];
  }
  // fallback：旧版逻辑
  const defaults = SELECTOR_CONFIG[field] || [];
  const overrides = (SITE_OVERRIDES[hostname] && SITE_OVERRIDES[hostname][field]) || [];
  return [...overrides, ...defaults];
}

// 导出给content.js使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SELECTOR_CONFIG, SITE_OVERRIDES, getSelectors };
}
