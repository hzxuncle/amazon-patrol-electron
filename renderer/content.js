/**
 * Amazon Patrol Content Script v2
 * 注入到 Amazon 商品页面，负责数据抓取
 * 新增: MutationObserver稳定性感知 / Deal标签 / AC标 / Coupon
 */
(function () {
  'use strict';

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const randomSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);

  function cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  function extractNumber(text) {
    if (!text) return '';
    return text.replace(/,/g, '').replace(/[^\d.]/g, '');
  }

  function extractPrice(text) {
    if (!text) return '';
    const match = text.match(/[\d,]+\.?\d*/);
    return match ? match[0] : cleanText(text);
  }

  function extractRating(text) {
    if (!text) return '';
    const match = text.match(/([\d.]+)\s*out\s*of/);
    return match ? match[1] : '';
  }

  function extractReviewCount(text) {
    if (!text) return '';
    return text.replace(/[,，]/g, '').replace(/[^\d]/g, '');
  }

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
            const cleaned = cleanText(text);
            if (cleaned) return cleaned;
          }
        } else if (sel.type === 'attr') {
          const el = document.querySelector(sel.selector);
          if (el) {
            const val = el.getAttribute(sel.attr);
            if (val) return cleanText(val);
          }
        } else if (sel.type === 'regex') {
          const html = document.documentElement.innerHTML;
          const scripts = document.querySelectorAll('script');
          let allScriptContent = '';
          scripts.forEach(s => { allScriptContent += s.textContent + '\n'; });
          const match = (html + allScriptContent).match(sel.regex);
          if (match && match[1]) return cleanText(match[1]);
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
            const text = cleanText(el.textContent || el.innerText || '');
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

  /**
   * 解析deal标签文本，区分不同类型
   */
  function parseDealBadge(rawText) {
    if (!rawText) return '';
    const text = rawText.toLowerCase();

    // 排除明显不是deal的badge（如Best Seller, New Arrival等）
    if (text.includes('best seller') && !text.includes('deal')) return '';
    if (text.includes('new arrival') && !text.includes('deal')) return '';

    const patterns = [
      { match: /limited[\s-]*time\s*deal/i, label: 'Limited-time deal' },
      { match: /deal\s+selling\s+fast/i, label: 'Deal selling fast' },
      { match: /ends\sin\s/i, label: rawText },
      // 纯倒计时格式 HH:MM:SS 或 MM:SS（来自 .detailpage-dealBadge-countdown-timer）
      { match: /^\d{2}:\d{2}(:\d{2})?$/, label: `Ends in ${rawText}` },
      { match: /lightning\s*deal/i, label: 'Lightning Deal' },
      { match: /big\s*deal/i, label: 'Big Deal' },
      { match: /deal\s*of\s*the\s*day/i, label: 'Deal of the Day' },
      { match: /prime\s*day\s*deal/i, label: 'Prime Day Deal' },
      { match: /black\s*friday\s*deal/i, label: 'Black Friday Deal' },
      { match: /save\s+\d+%/i, label: rawText },
      { match: /\d+%\s*claimed/i, label: rawText }
    ];

    for (const p of patterns) {
      if (p.match.test(rawText)) return p.label;
    }

    if (text.includes('deal')) return rawText;

    return '';
  }

  /**
   * 解析AC标文本
   */
  function parseAcBadge(rawText) {
    if (!rawText) return '';
    const text = cleanText(rawText);
    if (text.toLowerCase().includes('amazon')) {
      return text;
    }
    return '';
  }

  /**
   * 解析Coupon文本
   */
  function parseCoupon(rawText) {
    if (!rawText) return '';
    const text = cleanText(rawText);

    // 排除误匹配（如非coupon的Save文本）
    if (text.includes('Subscribe') && text.includes('Save')) return text;
    if (text.includes('coupon') || text.includes('Coupon')) return text;
    if (text.match(/save\s+\d+%/i)) return text;
    if (text.match(/save\s+\$[\d.]+/i)) return text;
    if (text.match(/save\s+with\s+clip/i)) return text;

    return '';
  }

  function extractProductDetails() {
    const result = {};

    // 结构一：prodDetTable（主流，CA/US/AU/MX/JP 等站点）
    const sections = document.querySelectorAll(
      '#productDetails_feature_div .a-expander-section-container'
    );
    sections.forEach(section => {
      const titleEl = section.querySelector('.a-expander-prompt');
      if (!titleEl) return;
      const title = titleEl.textContent.trim();
      const rows = section.querySelectorAll('.prodDetTable tr');
      if (!rows.length) return;
      const sectionData = {};
      rows.forEach(row => {
        const keyEl = row.querySelector('th.prodDetSectionEntry');
        const valEl = row.querySelector('td.prodDetAttrValue');
        if (!keyEl || !valEl) return;
        const key = keyEl.textContent.replace(/\s+/g, ' ').trim();
        const val = valEl.textContent.replace(/\s+/g, ' ').trim();
        if (!key || !val) return;
        // 跳过评价行（含评分脚本或"out of 5 stars"）
        if (val.includes('out of 5 stars') || val.includes('P.when') ||
            key.includes('おすすめ度') || key.includes('Opinión media') ||
            key.includes('Customer Reviews')) return;
        sectionData[key] = val;
      });
      if (Object.keys(sectionData).length > 0) result[title] = sectionData;
    });

    // 結構二：detailBullets（部分商品有，作为补充）
    const bulletRows = document.querySelectorAll('#detailBullets_feature_div li');
    if (bulletRows.length) {
      const sectionData = {};
      bulletRows.forEach(row => {
        const keyEl = row.querySelector('.a-text-bold');
        const valEl = row.querySelector('span:not(.a-text-bold)');
        if (!keyEl || !valEl) return;
        const key = keyEl.textContent.replace(/[‏‎‏‎:：]/g, '').replace(/\s+/g, ' ').trim();
        const val = valEl.textContent.replace(/\s+/g, ' ').trim();
        if (!key || !val) return;
        if (val.includes('out of 5 stars') || val.includes('P.when') ||
            key.includes('Customer Reviews')) return;
        sectionData[key] = val;
      });
      if (Object.keys(sectionData).length > 0) {
        result['Product Details'] = Object.assign(result['Product Details'] || {}, sectionData);
      }
    }

    return result;
  }

  async function scrapePageData(options = {}) {
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
      url: window.location.href,
      timestamp: new Date().toISOString(),
      status: 'success',
      error: ''
    };

    // 提取ASIN
    const asinMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
    result.asin = asinMatch ? asinMatch[1] : '';

    // 辅助：判断某个字段是否启用。null=全部启用
    function isEnabled(field) {
      if (!enabledFields) return true;
      return enabledFields.includes(field);
    }

    try {
      // 标题
      if (isEnabled('title')) {
        result.title = queryWithFallback(getSelectors(hostname, 'title'));
      }

      // 价格
      if (isEnabled('price')) {
        const rawPrice = queryWithFallback(getSelectors(hostname, 'price'));
        result.price = extractPrice(rawPrice);
      }

      // 划线价
      if (isEnabled('listPrice')) {
        const rawListPrice = queryWithFallback(getSelectors(hostname, 'listPrice'));
        result.listPrice = extractPrice(rawListPrice);
        if (result.listPrice === result.price) result.listPrice = '';
      }

      // 星级
      if (isEnabled('rating')) {
        const rawRating = queryWithFallback(getSelectors(hostname, 'rating'));
        result.rating = extractRating(rawRating) || rawRating;
      }

      // 评论数
      if (isEnabled('reviews')) {
        const rawReviews = queryWithFallback(getSelectors(hostname, 'reviews'));
        result.reviews = extractReviewCount(rawReviews) || rawReviews;
      }

      // 卖家
      if (isEnabled('seller')) {
        const rawSeller = queryWithFallback(getSelectors(hostname, 'seller'));
        result.seller = rawSeller || 'N/A';
      }

      // 库存
      if (isEnabled('stock')) {
        const rawStock = queryWithFallback(getSelectors(hostname, 'stock'));
        if (rawStock) {
          const lowerStock = rawStock.toLowerCase();
          if (lowerStock.includes('unavailable') || lowerStock.includes('out of stock')) {
            result.stock = 'Out of Stock';
          } else if (lowerStock.includes('only') || lowerStock.match(/\d+\s*(left|remaining)/)) {
            result.stock = 'In Stock (Limited)';
          } else if (lowerStock.includes('stock')) {
            result.stock = 'In Stock';
          } else {
            result.stock = rawStock;
          }
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
        result.productInfo = extractProductDetails();
      }

      // 父体ASIN
      if (isEnabled('parentAsin')) {
        result.parentAsin = queryWithFallback(getSelectors(hostname, 'parentAsin')) || 'N/A';
      }

      // 活动/Deal标签
      if (isEnabled('dealBadge')) {
        const rawDeal = queryWithFallback(getSelectors(hostname, 'dealBadge'));
        result.dealBadge = parseDealBadge(rawDeal) || 'N/A';
      }

      // AC标
      if (isEnabled('acBadge')) {
        const rawAcBadge = queryWithFallback(getSelectors(hostname, 'acBadge'));
        result.acBadge = parseAcBadge(rawAcBadge) || 'N/A';
      }

      // Coupon
      if (isEnabled('coupon')) {
        const rawCoupon = queryWithFallback(getSelectors(hostname, 'coupon'));
        result.coupon = parseCoupon(rawCoupon) || 'N/A';
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'SCRAPE_NOW') {
      handleScrape(message).then(sendResponse);
      return true;
    }
    if (message.action === 'PING') {
      sendResponse({ status: 'ok', url: window.location.href });
      return true;
    }
  });

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
    let result = await scrapePageData({ useStability, enabledFields });
    result.asin = result.asin || (message.asin || '');

    // 核心数据重试
    let scrapeRetries = 0;
    while ((!result.price || !result.title) && scrapeRetries < maxRetries) {
      await sleep(retryDelay);
      window.scrollBy({ top: 100, behavior: 'smooth' });
      await randomSleep(500, 1000);
      result = await scrapePageData({ useStability: false, enabledFields });
      result.asin = result.asin || (message.asin || '');
      scrapeRetries++;
    }

    return result;
  }

  console.log('[Amazon Patrol v2] Content script loaded on:', window.location.href);

})();
