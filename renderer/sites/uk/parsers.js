'use strict';

// UK 使用英文，extractRating / extractPrice 与 _base 一致，无需覆盖
// extractProductDetails：结构与 _base 相同（#productDetails_feature_div），
// 但 BSR 行的 <td> 没有 prodDetAttrValue class，需要加 td 兜底

function extractProductDetails() {
  const result = {};

  // UK 部分商品用结构1（#productDetails_feature_div），部分用结构3（#productDetails_expanderSectionTables）
  // 优先尝试结构1，无数据时回落到结构3
  const selector1 = '#productDetails_feature_div .a-expander-section-container';
  const selector3 = '#productDetails_expanderSectionTables .a-expander-section-container';
  const s1 = document.querySelectorAll(selector1);
  const sections = s1.length > 0 ? s1 : document.querySelectorAll(selector3);

  sections.forEach(section => {
    const titleEl = section.querySelector('.a-expander-prompt');
    if (!titleEl) return;
    const title = titleEl.textContent.trim();
    const rows = section.querySelectorAll('.prodDetTable tr');
    if (!rows.length) return;
    const sectionData = {};
    rows.forEach(row => {
      const keyEl = row.querySelector('th.prodDetSectionEntry');
      // BSR 行 td 无 prodDetAttrValue class，兜底用普通 td
      const valEl = row.querySelector('td.prodDetAttrValue') || row.querySelector('td');
      if (!keyEl || !valEl) return;
      const key = keyEl.textContent.replace(/\s+/g, ' ').trim();
      const val = valEl.textContent.replace(/\s+/g, ' ').trim();
      if (!key || !val) return;
      if (val.includes('out of 5 stars') || val.includes('P.when') ||
          key.includes('Customer Reviews')) return;
      sectionData[key] = val;
    });
    if (Object.keys(sectionData).length > 0) result[title] = sectionData;
  });

  return result;
}

function extractBsr(productInfo) {
  // UK BSR key: "Best Sellers Rank"
  // 值格式: "123 in Health & Personal Care (See Top 100...) 1 in Body Fat..."
  const BSR_KEY = 'Best Sellers Rank';
  let raw = null;
  for (const section of Object.values(productInfo)) {
    if (section && section[BSR_KEY]) { raw = section[BSR_KEY]; break; }
  }
  if (!raw) return null;

  // 格式: "123 in Category (See Top 100...) 1 in SubCategory"
  const matches = [...raw.matchAll(/([\d,]+)\s+in\s+([^(\n\d]+)/g)];
  if (!matches.length) return null;

  function parseMatch(m) {
    return {
      rank: parseInt(m[1].replace(/,/g, '')),
      category: m[2].trim().replace(/\s+/g, ' ')
    };
  }
  return {
    main: parseMatch(matches[0]),
    sub: matches.length > 1 ? parseMatch(matches[matches.length - 1]) : null
  };
}

function parseCoupon(rawText) {
  if (!rawText) return '';
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (text.length > 300) return '';
  // Strip trailing noise: "Terms"
  const clean = text.replace(/\s+Terms\b.*/i, '').trim();
  if (!clean) return '';
  // "Apply £10.20 voucher" / "Save 5%"
  if (clean.match(/voucher/i) || clean.match(/coupon/i) || clean.match(/save\s+\d+%/i)) return clean;
  return '';
}

const UK_PARSERS = { extractProductDetails, extractBsr, parseCoupon };
if (typeof module !== 'undefined' && module.exports) module.exports = UK_PARSERS;
