'use strict';
// 注意：此文件会被序列化后注入到浏览器页面，不能使用 require/module.exports 以外的 Node API

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

// base 版只支持英文 "out of"；MX 会在 mx/parsers.js 覆盖
function extractRating(text) {
  if (!text) return '';
  const match = text.match(/([\d.]+)\s*out\s*of/);
  return match ? match[1] : '';
}

function extractReviewCount(text) {
  if (!text) return '';
  return text.replace(/[,，]/g, '').replace(/[^\d]/g, '');
}

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
    { match: /\d+%\s*claimed/i, label: rawText },
    // 多语言活动标（MX/ES/IT/FR/DE 等）
    { match: /promoci[oó]n/i, label: rawText },          // MX/ES: Promoción
    { match: /oferta/i, label: rawText },                 // MX/ES: Oferta
    { match: /offre\s*(du\s*moment)?/i, label: rawText }, // FR: Offre du moment
    { match: /angebot/i, label: rawText },                // DE: Angebot
    { match: /offerta/i, label: rawText },                // IT: Offerta
    { match: /セール|特価|タイムセール/i, label: rawText }, // JP
    { match: /할인|특가/i, label: rawText },               // KR
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

const BASE_PARSERS = {
  cleanText,
  extractNumber,
  extractPrice,
  extractRating,
  extractReviewCount,
  parseDealBadge,
  parseAcBadge,
  parseCoupon,
  extractProductDetails
};

if (typeof module !== 'undefined' && module.exports) module.exports = BASE_PARSERS;
