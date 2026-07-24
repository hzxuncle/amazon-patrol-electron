'use strict';
// 注意：此文件会被序列化后注入到浏览器页面，不能使用 require/module.exports 以外的 Node API
// 运行时通过 window.__SCRAPER_CONFIG__ 获取 selectors/parsers/normalizers

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);

function getSite() {
  // 优先使用注入的 site code，fallback 到 hostname（兼容直接调用场景）
  return window.__SITE_CODE__ || window.location.hostname;
}

/**
 * 多层fallback选择器查询
 */
function queryWithFallback(selectors) {
  for (const sel of selectors) {
    try {
      if (typeof sel === 'string') {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.textContent || el.innerText || '';
          const cleaned = text.replace(/\s+/g, ' ').trim();
          if (cleaned) return cleaned;
        }
      } else if (sel.type === 'attr') {
        const el = document.querySelector(sel.selector);
        if (el) {
          const val = el.getAttribute(sel.attr);
          if (val) return val.replace(/\s+/g, ' ').trim();
        }
      } else if (sel.type === 'regex') {
        const html = document.documentElement.innerHTML;
        const scripts = document.querySelectorAll('script');
        let allScriptContent = '';
        scripts.forEach(s => { allScriptContent += s.textContent + '\n'; });
        const match = (html + allScriptContent).match(sel.regex);
        if (match && match[1]) return match[1].replace(/\s+/g, ' ').trim();
      }
    } catch (e) { continue; }
  }
  return '';
}

/**
 * 批量查询多个选择器，返回所有非空结果（用于deal标签检测多个同时存在的label）
 */
function queryAllWithFallback(selectors, maxResults = 3) {
  const results = new Set();
  for (const sel of selectors) {
    if (results.size >= maxResults) break;
    try {
      if (typeof sel === 'string') {
        document.querySelectorAll(sel).forEach(el => {
          if (results.size >= maxResults) return;
          const text = (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
          if (text && text.length > 1) results.add(text);
        });
      }
    } catch (e) { continue; }
  }
  return [...results];
}

// ========== MutationObserver 稳定性感知 ==========

/**
 * 等待关键DOM节点稳定（N毫秒内无变化即视为稳定）
 */
function waitForStableDOM(targetSelectors, stableMs = 2000, maxWaitMs = 8000) {
  return new Promise((resolve) => {
    let lastChangeTime = Date.now();
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      clearInterval(checkInterval);
      clearTimeout(maxTimeout);
      resolve();
    };

    // 超时兜底
    const maxTimeout = setTimeout(() => {
      console.log('[Patrol] 稳定等待超时，直接抓取');
      finish();
    }, maxWaitMs);

    const observer = new MutationObserver(() => {
      lastChangeTime = Date.now();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    // 定时检查是否稳定
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastChangeTime;
      if (elapsed >= stableMs) {
        console.log(`[Patrol] DOM已稳定 ${stableMs}ms，开始抓取`);
        finish();
      }
    }, 200);
  });
}

// ========== 页面类型检测 ==========

function checkPageType() {
  const isCaptcha = document.querySelector('#captcha') || document.querySelector('form[action*="captcha"]');
  if (isCaptcha) return 'captcha';

  const isSearchPage = document.querySelector('[data-component-type="s-search-result"]');
  if (isSearchPage) return 'search';

  const hasPrice = document.querySelector('.a-price');
  const hasTitle = document.querySelector('#productTitle') || document.querySelector('#title');
  if (hasPrice || hasTitle) return 'product';

  return 'loading';
}

// ========== 模拟人工 ==========

async function simulateHumanBehavior() {
  await randomSleep(500, 1200);
  window.scrollBy({ top: Math.floor(Math.random() * 300) + 100, behavior: 'smooth' });
  await randomSleep(400, 800);
  window.scrollBy({ top: -Math.floor(Math.random() * 150), behavior: 'smooth' });
  await randomSleep(300, 600);
}

// ========== 核心抓取 ==========

async function scrapePageData(options = {}) {
  const cfg = window.__SCRAPER_CONFIG__;
  const { selectors, parsers, normalizers } = cfg;
  const hostname = getSite();
  const useStability = options.useStability !== false;
  const enabledFields = options.enabledFields || null; // null = 全部启用

  // 如果启用稳定性感知，等待DOM稳定
  if (useStability) {
    await waitForStableDOM(['.a-price', '#productTitle'], 2000, 10000);
  }

  await simulateHumanBehavior();

  const result = {
    asin: '',
    site: hostname,
    title: '',
    price: '',
    listPrice: '',
    rating: '',
    reviews: '',
    seller: '',
    stock: '',
    parentAsin: 'N/A',
    dealBadge: 'N/A',
    acBadge: 'N/A',
    coupon: 'N/A',
    productInfo: {},
    bsr: null,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    status: 'success',
    error: ''
  };

  // 提取ASIN，检测重定向
  const asinMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
  const actualAsin = asinMatch ? asinMatch[1] : '';
  const targetAsin = (options.asin || '').toUpperCase();

  if (targetAsin && actualAsin && actualAsin !== targetAsin) {
    // 页面跳转到其他 ASIN，原商品已下架
    result.asin = targetAsin;
    result.status = 'failed';
    result.error = `商品已下架，页面跳转至 ${actualAsin}`;
    return result;
  }

  result.asin = actualAsin;

  // 辅助：判断某个字段是否启用。null=全部启用
  function isEnabled(field) {
    if (!enabledFields) return true;
    return enabledFields.includes(field);
  }

  try {
    // 标题
    if (isEnabled('title')) {
      result.title = queryWithFallback(selectors.title);
    }

    // 价格
    if (isEnabled('price')) {
      const rawPrice = queryWithFallback(selectors.price);
      result.price = parsers.extractPrice(rawPrice);
    }

    // 划线价
    if (isEnabled('listPrice')) {
      const rawListPrice = queryWithFallback(selectors.listPrice);
      result.listPrice = parsers.extractPrice(rawListPrice);
      if (result.listPrice === result.price) result.listPrice = '';
    }

    // 星级
    if (isEnabled('rating')) {
      const rawRating = queryWithFallback(selectors.rating);
      result.rating = parsers.extractRating(rawRating) || rawRating;
    }

    // 评论数
    if (isEnabled('reviews')) {
      const rawReviews = queryWithFallback(selectors.reviews);
      result.reviews = parsers.extractReviewCount(rawReviews) || rawReviews;
    }

    // 卖家
    if (isEnabled('seller')) {
      const rawSeller = queryWithFallback(selectors.seller);
      result.seller = rawSeller || 'N/A';
    }

    // 库存
    if (isEnabled('stock')) {
      const rawStock = queryWithFallback(selectors.stock);
      if (rawStock) {
        result.stock = normalizers.normalizeStock(rawStock) || rawStock;
      } else {
        const unavailable = document.body.innerText.includes('Currently unavailable');
        result.stock = unavailable ? 'Out of Stock' : 'N/A';
      }
    }

    // 缺货时价格无效，清空避免抓到推荐商品轮播的价格
    if (result.stock === 'Out of Stock') {
      result.price = '';
      result.listPrice = '';
    }

    // Product information 区块（原样存储所有站点数据）
    if (isEnabled('productInfo')) {
      result.productInfo = parsers.extractProductDetails();
      // BSR 从产品信息里提取（各站点独立解析逻辑）
      if (parsers.extractBsr && Object.keys(result.productInfo).length > 0) {
        result.bsr = parsers.extractBsr(result.productInfo);
      }
    }

    // 父体ASIN
    if (isEnabled('parentAsin')) {
      result.parentAsin = queryWithFallback(selectors.parentAsin) || 'N/A';
    }

    // 活动/Deal标签
    if (isEnabled('dealBadge')) {
      const rawDeal = queryWithFallback(selectors.dealBadge);
      result.dealBadge = parsers.parseDealBadge(rawDeal) || 'N/A';
    }

    // AC标
    if (isEnabled('acBadge')) {
      const rawAcBadge = queryWithFallback(selectors.acBadge);
      result.acBadge = parsers.parseAcBadge(rawAcBadge) || 'N/A';
    }

    // Coupon
    if (isEnabled('coupon')) {
      const rawCoupon = queryWithFallback(selectors.coupon);
      result.coupon = parsers.parseCoupon(rawCoupon) || 'N/A';
    }

    // 验证
    if ((!result.price && isEnabled('price')) || (!result.title && isEnabled('title'))) {
      if (!result.price && !result.title && (isEnabled('price') || isEnabled('title'))) {
        result.status = 'failed';
        result.error = '无法提取价格和标题';
      }
    }

  } catch (e) {
    result.status = 'failed';
    result.error = '抓取异常: ' + e.message;
  }

  return result;
}

// ========== 消息监听 ==========

async function handleScrape(message) {
  const maxRetries = message.maxRetries || 3;
  const retryDelay = message.retryDelay || 2000;
  const useStability = message.useStability !== false;
  const enabledFields = message.enabledFields || null;

  // 检测页面类型
  let pageType = checkPageType();

  // Loading状态重试
  let retries = 0;
  while (pageType === 'loading' && retries < maxRetries) {
    await sleep(retryDelay);
    pageType = checkPageType();
    retries++;
  }

  if (pageType === 'captcha') {
    return {
      asin: message.asin || '', site: getSite(),
      title: '', price: '', listPrice: '', rating: '', reviews: '',
      seller: '', stock: '', parentAsin: 'N/A',
      dealBadge: 'N/A', acBadge: 'N/A', coupon: 'N/A',
      url: window.location.href, timestamp: new Date().toISOString(),
      status: 'captcha', error: '遇到验证码，请手动处理后重试'
    };
  }

  if (pageType === 'search') {
    return {
      asin: message.asin || '', site: getSite(),
      title: '', price: '', listPrice: '', rating: '', reviews: '',
      seller: '', stock: '', parentAsin: 'N/A',
      dealBadge: 'N/A', acBadge: 'N/A', coupon: 'N/A',
      url: window.location.href, timestamp: new Date().toISOString(),
      status: 'failed', error: '页面不是商品详情页'
    };
  }

  // 执行抓取（默认启用稳定性感知）
  let result = await scrapePageData({ useStability, enabledFields, asin: message.asin || '' });
  result.asin = result.asin || (message.asin || '');

  // 核心数据重试（失败/重定向不重试）
  let scrapeRetries = 0;
  while (result.status !== 'failed' && (!result.price || !result.title) && scrapeRetries < maxRetries) {
    await sleep(retryDelay);
    window.scrollBy({ top: 100, behavior: 'smooth' });
    await randomSleep(500, 1000);
    result = await scrapePageData({ useStability: false, enabledFields, asin: message.asin || '' });
    result.asin = result.asin || (message.asin || '');
    scrapeRetries++;
  }

  return result;
}

const BASE_SCRAPER = {
  scrapePageData,
  handleScrape,
  checkPageType,
  waitForStableDOM,
  simulateHumanBehavior,
  queryWithFallback,
  queryAllWithFallback
};

if (typeof module !== 'undefined' && module.exports) module.exports = BASE_SCRAPER;
