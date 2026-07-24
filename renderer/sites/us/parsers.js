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
