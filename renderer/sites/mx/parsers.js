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

function extractBsr(productInfo) {
  // MX BSR key: "Clasificación en los más vendidos de Amazon"
  // 值格式: "nº1,526 en Salud y Cuidado Personal (Ver el Top 100...) nº1 en Masajeadores Eléctricos"
  const BSR_KEY = 'Clasificación en los más vendidos de Amazon';
  let raw = null;
  for (const section of Object.values(productInfo)) {
    if (section && section[BSR_KEY]) { raw = section[BSR_KEY]; break; }
  }
  if (!raw) return null;

  // MX 格式: nº1,526 en 分类
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

function parseCoupon(rawText) {
  if (!rawText) return '';
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (text.length > 300) return '';
  // Strip trailing noise: "Comprar artículos | Términos" / "Términos"
  const clean = text
    .replace(/\s*\|\s*T[eé]rminos\b.*/i, '')
    .replace(/\s+Comprar art[ií]culos\b.*/i, '')
    .replace(/\s+T[eé]rminos\b.*/i, '')
    .trim();
  if (!clean) return '';
  // "Aplica el cupón de 5 %" / "Se aplicó el cupón de descuento de 5 %"
  if (clean.match(/cup[oó]n/i)) return clean;
  return '';
}

const MX_PARSERS = { extractRating, extractProductDetails, extractBsr, parseCoupon };
if (typeof module !== 'undefined' && module.exports) module.exports = MX_PARSERS;
