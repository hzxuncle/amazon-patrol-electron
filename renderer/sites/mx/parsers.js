'use strict';

function extractRating(text) {
  if (!text) return '';
  const m = text.match(/([\d.]+)\s*(?:out\s*of|de\s*\d)/i);
  if (m) return m[1];
  const n = text.match(/^[\d.]+/);
  return n ? n[0] : '';
}

function extractProductDetails() {
  const result = {};

  // MX 使用两列布局容器：productDetails_expanderSectionTables
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
      // BSR 行 td 无 prodDetAttrValue class，兜底用普通 td
      const valEl = row.querySelector('td.prodDetAttrValue') || row.querySelector('td');
      if (!keyEl || !valEl) return;
      const key = keyEl.textContent.replace(/\s+/g, ' ').trim();
      const val = valEl.textContent.replace(/\s+/g, ' ').trim();
      if (!key || !val) return;
      // 跳过评价行（西班牙文）
      if (val.includes('de 5 estrellas') || val.includes('P.when') ||
          key.includes('Opinión media')) return;
      sectionData[key] = val;
    });
    if (Object.keys(sectionData).length > 0) result[title] = sectionData;
  });

  return result;
}

const MX_PARSERS = { extractRating, extractProductDetails };
if (typeof module !== 'undefined' && module.exports) module.exports = MX_PARSERS;
