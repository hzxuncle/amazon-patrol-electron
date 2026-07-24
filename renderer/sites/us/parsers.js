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
  }

  // US 结构一：productDetails_feature_div（部分商品）
  document.querySelectorAll(
    '#productDetails_feature_div .a-expander-section-container'
  ).forEach(parseSection);

  // US 结构二：productDetails_expanderSectionTables（两列布局，部分商品）
  if (Object.keys(result).length === 0) {
    document.querySelectorAll(
      '#productDetails_expanderSectionTables .a-expander-section-container'
    ).forEach(parseSection);
  }

  return result;
}

const US_PARSERS = { extractProductDetails };
if (typeof module !== 'undefined' && module.exports) module.exports = US_PARSERS;
