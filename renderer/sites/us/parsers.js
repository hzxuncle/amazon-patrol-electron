'use strict';

function extractProductDetails() {
  const result = {};

  function parseSection(section) {
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
      if (val.includes('out of 5 stars') || val.includes('P.when') ||
          key.includes('Customer Reviews')) return;
      sectionData[key] = val;
    });
    if (Object.keys(sectionData).length > 0) result[title] = sectionData;
  }

  // 主流结构：productDetails_expanderSectionTables（两列布局，US/CA/MX 均使用）
  document.querySelectorAll(
    '#productDetails_expanderSectionTables .a-expander-section-container'
  ).forEach(parseSection);

  // 旧布局 fallback：productDetails_feature_div（少数商品）
  if (Object.keys(result).length === 0) {
    document.querySelectorAll(
      '#productDetails_feature_div .a-expander-section-container'
    ).forEach(parseSection);
  }

  return result;
}

const US_PARSERS = { extractProductDetails };
if (typeof module !== 'undefined' && module.exports) module.exports = US_PARSERS;
