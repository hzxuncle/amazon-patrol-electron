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

  document.querySelectorAll(
    '#productDetails_expanderSectionTables .a-expander-section-container'
  ).forEach(parseSection);

  if (Object.keys(result).length === 0) {
    document.querySelectorAll(
      '#productDetails_feature_div .a-expander-section-container'
    ).forEach(parseSection);
  }

  // 结构3：detailBullets（部分商品只有此结构）
  if (Object.keys(result).length === 0) {
    const bulletRows = document.querySelectorAll('#detailBullets_feature_div li');
    if (bulletRows.length) {
      const sectionData = {};
      bulletRows.forEach(row => {
        const keyEl = row.querySelector('.a-text-bold');
        const valEl = row.querySelector('span:not(.a-text-bold)');
        if (!keyEl || !valEl) return;
        const key = keyEl.textContent.replace(/[‏‎‏‎:：]/g, '').replace(/\s+/g, ' ').trim();
        let val = valEl.textContent.replace(/\s+/g, ' ').trim();
        if (!key || !val) return;
        if (val.includes('out of 5 stars') || val.includes('P.when') ||
            key.includes('Customer Reviews')) return;
        const keyClean = key.replace(/[‏‎\s]/g, '').toLowerCase();
        const valPrefix = val.replace(/[‏‎]/g, '').replace(/\s+/g, ' ');
        const colonIdx = valPrefix.indexOf(':');
        if (colonIdx > 0 && colonIdx < 40) {
          const prefix = valPrefix.slice(0, colonIdx).trim().toLowerCase().replace(/\s/g, '');
          if (prefix === keyClean) val = valPrefix.slice(colonIdx + 1).trim();
        }
        sectionData[key] = val;
      });
      if (Object.keys(sectionData).length > 0) result['Product Details'] = sectionData;
    }
  }

  return result;
}

function extractBsr(productInfo) {
  // US BSR key: "Best Sellers Rank"，值格式: "#7,378 in Health & Household ... #3 in Body Fat Monitors"
  let raw = null;
  for (const section of Object.values(productInfo)) {
    if (section && section['Best Sellers Rank']) { raw = section['Best Sellers Rank']; break; }
  }
  if (!raw) return null;

  const matches = [...raw.matchAll(/#([\d,]+)\s+in\s+([^(#\n]+)/g)];
  if (!matches.length) return null;

  function parseMatch(m) {
    return { rank: parseInt(m[1].replace(/,/g, '')), category: m[2].trim().replace(/\s+/g, ' ') };
  }
  return {
    main: parseMatch(matches[0]),
    sub: matches.length > 1 ? parseMatch(matches[matches.length - 1]) : null
  };
}

const US_PARSERS = { extractProductDetails, extractBsr };
if (typeof module !== 'undefined' && module.exports) module.exports = US_PARSERS;
