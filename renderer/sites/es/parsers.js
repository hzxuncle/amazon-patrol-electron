'use strict';

// ES: 逗号小数分隔符，评分格式 "4,3 de 5 estrellas"
function extractPrice(text) {
  if (!text) return '';
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const match = normalized.match(/[\d]+\.?\d*/);
  return match ? match[0] : '';
}

function extractRating(text) {
  if (!text) return '';
  const m = text.match(/([\d,]+)\s*de\s*\d/i);
  if (m) return m[1].replace(',', '.');
  const e = text.match(/([\d.]+)\s*out\s*of/i);
  return e ? e[1] : '';
}

function extractProductDetails() {
  const result = {};

  // 优先尝试结构1，无数据时回落到结构3
  const s1 = document.querySelectorAll('#productDetails_feature_div .a-expander-section-container');
  const sections = s1.length > 0 ? s1 : document.querySelectorAll('#productDetails_expanderSectionTables .a-expander-section-container');
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
      if (val.includes('de 5 estrellas') || val.includes('P.when') ||
          key.includes('Valoración media')) return;
      sectionData[key] = val;
    });
    if (Object.keys(sectionData).length > 0) result[title] = sectionData;
  });

  return result;
}

function extractBsr(productInfo) {
  // ES BSR key: "Clasificación en los más vendidos de Amazon"
  // 值格式: "nº4.478 en Salud y cuidado personal (...) nº1 en SubCategory"
  // 千位点分隔
  const BSR_KEY = 'Clasificación en los más vendidos de Amazon';
  let raw = null;
  for (const section of Object.values(productInfo)) {
    if (section && section[BSR_KEY]) { raw = section[BSR_KEY]; break; }
  }
  if (!raw) return null;

  // 格式: "nº4.478 en Category"
  const matches = [...raw.matchAll(/nº([\d,.]+)\s+en\s+([^(\nnº]+)/g)];
  if (!matches.length) return null;

  function parseMatch(m) {
    return {
      rank: parseInt(m[1].replace(/[,.]/g, '').replace(/\D/g, '')),
      category: m[2].trim().replace(/\s+/g, ' ')
    };
  }
  return {
    main: parseMatch(matches[0]),
    sub: matches.length > 1 ? parseMatch(matches[matches.length - 1]) : null
  };
}

const ES_PARSERS = { extractPrice, extractRating, extractProductDetails, extractBsr };
if (typeof module !== 'undefined' && module.exports) module.exports = ES_PARSERS;
