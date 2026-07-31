## Task 2: 站点目录 — us/ca/au/mx

**Files:**
- Create: `renderer/sites/us/selectors.js`
- Create: `renderer/sites/ca/selectors.js`
- Create: `renderer/sites/au/selectors.js`
- Create: `renderer/sites/mx/selectors.js`
- Create: `renderer/sites/mx/parsers.js`
- Create: `renderer/sites/mx/normalizers.js`

**Interfaces:**
- Produces: 每个站点的覆盖文件，结构与 `_base` 对应文件相同，只包含差异部分

- [ ] **Step 1: us/selectors.js**

基于实测数据（2026-07-23 B01N1UX8RW）：

```js
'use strict';
const US_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = US_SELECTORS;
```

- [ ] **Step 2: ca/selectors.js**

```js
'use strict';
const CA_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['#acBadge_feature_div span.a-size-small', '#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = CA_SELECTORS;
```

- [ ] **Step 3: au/selectors.js**

```js
'use strict';
const AU_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['#acBadge_feature_div span.a-size-small', '#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = AU_SELECTORS;
```

- [ ] **Step 4: mx/selectors.js**

```js
'use strict';
const MX_SELECTORS = {
  price: ['.a-price[data-a-size="xl"] .a-offscreen'],
  listPrice: ['.basisPrice .a-price .a-offscreen'],
  rating: ['#acrPopover .a-icon-alt'],
  reviews: ['#acrCustomerReviewText'],
  seller: ['a#sellerProfileTriggerId'],
  stock: ['#availability span'],
  title: ['#productTitle'],
  dealBadge: ['.detailpage-dealBadge-countdown-timer', '#dealBadgeSupportingText span'],
  acBadge: ['#acBadge_feature_div'],
};
if (typeof module !== 'undefined' && module.exports) module.exports = MX_SELECTORS;
```

- [ ] **Step 5: mx/parsers.js — 覆盖 extractRating 支持西班牙文**

```js
'use strict';
function extractRating(text) {
  if (!text) return '';
  // 英文：4.6 out of 5 stars
  // 西班牙文：4.7 de 5 estrellas
  // 通用：提取首个数字（小数）
  const m = text.match(/([\d.]+)\s*(?:out\s*of|de\s*\d)/i);
  if (m) return m[1];
  // fallback：直接提取第一个数字
  const n = text.match(/^[\d.]+/);
  return n ? n[0] : '';
}
const MX_PARSERS = { extractRating };
if (typeof module !== 'undefined' && module.exports) module.exports = MX_PARSERS;
```

- [ ] **Step 6: mx/normalizers.js — 覆盖 normalizeStock 支持西班牙文**

```js
'use strict';
function normalizeStock(rawStock) {
  if (!rawStock) return null;
  const lower = rawStock.toLowerCase();
  // 西班牙文缺货
  if (lower.includes('no disponible') || lower.includes('agotado') ||
      lower.includes('unavailable') || lower.includes('out of stock')) return 'Out of Stock';
  // 西班牙文有货
  if (lower.includes('disponible') || lower.includes('en stock') ||
      lower.includes('stock') || lower.includes('in stock')) return 'In Stock';
  // 限量
  if ((lower.includes('solo') || lower.includes('only')) && lower.match(/\d+/)) return 'In Stock (Limited)';
  // 配送中（也算有货）
  if (lower.includes('env') || lower.includes('deliver')) return 'In Stock';
  return rawStock;
}
const MX_NORMALIZERS = { normalizeStock };
if (typeof module !== 'undefined' && module.exports) module.exports = MX_NORMALIZERS;
```

- [ ] **Step 7: Commit**

```bash
git add renderer/sites/us/ renderer/sites/ca/ renderer/sites/au/ renderer/sites/mx/
git commit -m "feat: add per-site scraper configs (us/ca/au/mx)"
```

---

