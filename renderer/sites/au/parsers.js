'use strict';

function extractProductDetails() {
  const result = {};

  // AU 主要使用 detailBullets 结构（无 prodDetTable）
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
      // 清理 val 里重复的 key 名前缀（如 "Batteries ‏ : ‎ 2 AAA..." → "2 AAA..."）
      const keyClean = key.replace(/[‏‎\s]/g, '').toLowerCase();
      const valNorm = val.replace(/[‏‎]/g, '').replace(/\s+/g, ' ');
      const colonIdx = valNorm.indexOf(':');
      if (colonIdx > 0 && colonIdx < 40) {
        const prefix = valNorm.slice(0, colonIdx).trim().toLowerCase().replace(/\s/g, '');
        if (prefix === keyClean) val = valNorm.slice(colonIdx + 1).trim();
      }
      sectionData[key] = val;
    });
    if (Object.keys(sectionData).length > 0) result['Product Details'] = sectionData;
  }

  return result;
}

const AU_PARSERS = { extractProductDetails };
if (typeof module !== 'undefined' && module.exports) module.exports = AU_PARSERS;
