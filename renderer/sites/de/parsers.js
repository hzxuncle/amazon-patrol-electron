'use strict';

// DE: 逗号小数分隔符（53,54€），评分格式 "4,3 von 5 Sternen"
function extractPrice(text) {
  if (!text) return '';
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const match = normalized.match(/[\d]+\.?\d*/);
  return match ? match[0] : '';
}

function extractRating(text) {
  if (!text) return '';
  const m = text.match(/([\d,]+)\s*von\s*\d/i);
  if (m) return m[1].replace(',', '.');
  const e = text.match(/([\d.]+)\s*out\s*of/i);
  return e ? e[1] : '';
}

function extractProductDetails() {
  const result = {};

  // DE 使用 productDetails_expanderSectionTables 结构
  const sections = document.querySelectorAll(
    '#productDetails_expanderSectionTables .a-expander-section-container'
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
      const valEl = row.querySelector('td.prodDetAttrValue') || row.querySelector('td');
      if (!keyEl || !valEl) return;
      const key = keyEl.textContent.replace(/\s+/g, ' ').trim();
      const val = valEl.textContent.replace(/\s+/g, ' ').trim();
      if (!key || !val) return;
      if (val.includes('von 5 Sternen') || val.includes('P.when') ||
          key.includes('Durchschnittliche Kundenbewertung')) return;
      sectionData[key] = val;
    });
    if (Object.keys(sectionData).length > 0) result[title] = sectionData;
  });

  return result;
}

function extractBsr(productInfo) {
  // DE BSR key: "Amazon Bestseller-Rang"
  // 值格式: "Nr. 73.529 in Drogerie & Körperpflege (...) Nr. 1 in SubCategory"
  const BSR_KEY = 'Amazon Bestseller-Rang';
  let raw = null;
  for (const section of Object.values(productInfo)) {
    if (section && section[BSR_KEY]) { raw = section[BSR_KEY]; break; }
  }
  if (!raw) return null;

  // 格式: "Nr. 73.529 in Category"，千位点分隔
  const matches = [...raw.matchAll(/Nr\.\s*([\d.]+)\s+in\s+([^(\nN]+)/gi)];
  if (!matches.length) return null;

  function parseMatch(m) {
    return {
      rank: parseInt(m[1].replace(/\./g, '')),
      category: m[2].trim().replace(/\s+/g, ' ')
    };
  }
  return {
    main: parseMatch(matches[0]),
    sub: matches.length > 1 ? parseMatch(matches[matches.length - 1]) : null
  };
}

const DE_PARSERS = { extractPrice, extractRating, extractProductDetails, extractBsr };
if (typeof module !== 'undefined' && module.exports) module.exports = DE_PARSERS;
