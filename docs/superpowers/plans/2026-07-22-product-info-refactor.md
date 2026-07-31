# productInfo 字段重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除现有 7 个 Product Details 专用字段，替换为原样抓取所有站点产品信息的 `productInfo` 嵌套结构，并在结果表格新增可展开浮层查看。

**Architecture:** content.js 重写 `extractProductDetails()` 支持 `prodDetTable` 和 `detailBullets` 两种结构，结果存入 `productInfo: {}`；UI 层移除 7 列，新增一列「产品信息」点击展开 overlay。

**Tech Stack:** Vanilla JS, Electron 28, existing patterns

## Global Constraints

- 7 个旧字段（bsrMain/bsrSub/dateFirstAvailable/modelNumber/dimensions/manufacturer/batteries）在 content.js / fullpage.html / fullpage.js / fullpage.css 中全部删除
- productInfo 字段 key 为 `'productInfo'`，结构：`{ [sectionTitle: string]: { [key: string]: string } }`
- 评价行（值含 "out of 5 stars" / script 标签 / "おすすめ度" / "Opinión media"）跳过不存入
- productInfo checkbox 默认**不勾选**
- Excel 不导出 productInfo
- No new npm dependencies

---

## 文件变更一览

| 文件 | 操作 |
|------|------|
| `renderer/content.js` | 重写 extractProductDetails()；result 移除 7 字段，新增 productInfo；移除 parseBsr() 及 7 字段赋值块 |
| `renderer/fullpage.html` | 移除 7 个 checkbox + 7 个 th；新增 productInfo checkbox + th |
| `renderer/fullpage.js` | 移除 7 列渲染 + colClassMap + export columns；新增 productInfo td + overlay 逻辑 |
| `renderer/fullpage.css` | 移除 7 列宽规则；新增 overlay 样式 |

---

## Task 1: content.js — 重写抓取逻辑

**Files:**
- Modify: `renderer/content.js`

**Interfaces:**
- Produces: `result.productInfo: {}` — 嵌套键值对，原样存储

- [ ] **Step 1: result 对象移除 7 个字段，新增 productInfo**

找到 result 对象初始化（约 line 278），删除：
```js
bsrMain: '',
bsrSub: '',
dateFirstAvailable: '',
modelNumber: '',
dimensions: '',
manufacturer: '',
batteries: '',
```

在 `url:` 之前插入：
```js
productInfo: {},
```

- [ ] **Step 2: 重写 extractProductDetails()**

找到 `function extractProductDetails()` 整个函数（约 line 234-252），替换为：

```js
function extractProductDetails() {
  const result = {};

  // 结构一：prodDetTable（主流，CA/US/AU/MX/JP 等站点）
  const sections = document.querySelectorAll(
    '#productDetails_feature_div .a-expander-section-container'
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
      const valEl = row.querySelector('td.prodDetAttrValue');
      if (!keyEl || !valEl) return;
      const key = keyEl.textContent.replace(/\s+/g, ' ').trim();
      const val = valEl.textContent.replace(/\s+/g, ' ').trim();
      if (!key || !val) return;
      // 跳过评价行（含评分脚本或"out of 5 stars"）
      if (val.includes('out of 5 stars') || val.includes('P.when') ||
          key.includes('おすすめ度') || key.includes('Opinión media') ||
          key.includes('Customer Reviews')) return;
      sectionData[key] = val;
    });
    if (Object.keys(sectionData).length > 0) result[title] = sectionData;
  });

  // 结构二：detailBullets（部分商品有，作为补充）
  const bulletRows = document.querySelectorAll('#detailBullets_feature_div li');
  if (bulletRows.length) {
    const sectionData = {};
    bulletRows.forEach(row => {
      const keyEl = row.querySelector('.a-text-bold');
      const valEl = row.querySelector('span:not(.a-text-bold)');
      if (!keyEl || !valEl) return;
      const key = keyEl.textContent.replace(/[‏‎‏‎:：]/g, '').replace(/\s+/g, ' ').trim();
      const val = valEl.textContent.replace(/\s+/g, ' ').trim();
      if (!key || !val) return;
      if (val.includes('out of 5 stars') || val.includes('P.when') ||
          key.includes('Customer Reviews')) return;
      sectionData[key] = val;
    });
    if (Object.keys(sectionData).length > 0) {
      result['Product Details'] = Object.assign(result['Product Details'] || {}, sectionData);
    }
  }

  return result;
}
```

- [ ] **Step 3: 删除 parseBsr() 函数**

找到 `function parseBsr(bsrRaw)` 整个函数（约 line 254-264），删除。

- [ ] **Step 4: 替换 7 字段赋值块为 productInfo 赋值**

找到以下整个块（约 line 378-406）：
```js
// Product Details 区块（BSR/上架时间/型号等）
const productDetails = extractProductDetails();

if (isEnabled('bsrMain') || isEnabled('bsrSub')) { ... }
if (isEnabled('dateFirstAvailable')) { ... }
if (isEnabled('modelNumber')) { ... }
if (isEnabled('dimensions')) { ... }
if (isEnabled('manufacturer')) { ... }
if (isEnabled('batteries')) { ... }
```

替换为：
```js
// Product information 区块（原样存储所有站点数据）
if (isEnabled('productInfo')) {
  result.productInfo = extractProductDetails();
}
```

- [ ] **Step 5: 验证语法**

```bash
node --check renderer/content.js
```

Expected: no output (syntax OK)

- [ ] **Step 6: Commit**

```bash
git add renderer/content.js
git commit -m "refactor: replace 7 product detail fields with productInfo nested structure"
```

---

## Task 2: HTML + CSS — 移除旧列，新增 productInfo 列

**Files:**
- Modify: `renderer/fullpage.html`
- Modify: `renderer/fullpage.css`

**Interfaces:**
- Produces: productInfo checkbox (`data-field="productInfo"`, 不 checked)；`<th class="col-product-info">产品信息</th>`

- [ ] **Step 1: fullpage.html — 移除 7 个 checkbox**

删除以下 7 行：
```html
<label class="field-toggle"><input type="checkbox" data-field="bsrMain" checked> BSR大类</label>
<label class="field-toggle"><input type="checkbox" data-field="bsrSub" checked> BSR小类</label>
<label class="field-toggle"><input type="checkbox" data-field="dateFirstAvailable" checked> 上架时间</label>
<label class="field-toggle"><input type="checkbox" data-field="modelNumber"> 型号</label>
<label class="field-toggle"><input type="checkbox" data-field="dimensions"> 尺寸重量</label>
<label class="field-toggle"><input type="checkbox" data-field="manufacturer"> 制造商</label>
<label class="field-toggle"><input type="checkbox" data-field="batteries"> 电池</label>
```

插入 1 行（在 `data-field="url"` 之后）：
```html
<label class="field-toggle"><input type="checkbox" data-field="productInfo"> 产品信息</label>
```

- [ ] **Step 2: fullpage.html — 移除 7 个 th，新增 productInfo th**

删除以下 7 行：
```html
<th class="col-bsr-main">BSR大类</th>
<th class="col-bsr-sub">BSR小类</th>
<th class="col-date-first">上架时间</th>
<th class="col-model">型号</th>
<th class="col-dimensions">尺寸重量</th>
<th class="col-manufacturer">制造商</th>
<th class="col-batteries">电池</th>
```

插入 1 行（在 `<th class="col-parent">父体</th>` 之后）：
```html
<th class="col-product-info">产品信息</th>
```

- [ ] **Step 3: fullpage.css — 移除 7 列宽规则，新增 productInfo 样式**

删除以下 7 行：
```css
.col-bsr-main    { width: 200px; overflow: hidden; text-overflow: ellipsis; }
.col-bsr-sub     { width: 180px; overflow: hidden; text-overflow: ellipsis; }
.col-date-first  { width: 120px; overflow: hidden; text-overflow: ellipsis; }
.col-model       { width: 100px; overflow: hidden; text-overflow: ellipsis; }
.col-dimensions  { width: 200px; overflow: hidden; text-overflow: ellipsis; }
.col-manufacturer{ width: 100px; overflow: hidden; text-overflow: ellipsis; }
.col-batteries   { width: 160px; overflow: hidden; text-overflow: ellipsis; }
```

追加：
```css
/* ===== 产品信息列 + 浮层 ===== */
.col-product-info { width: 68px; text-align: center; }
.btn-product-info {
  font-size: 11px; padding: 2px 8px; cursor: pointer;
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text-secondary); border-radius: 4px;
  transition: all 0.15s;
}
.btn-product-info:hover { border-color: var(--accent); color: var(--accent); }
.product-info-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.product-info-modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 0;
  width: 560px; max-width: 90vw; max-height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.product-info-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
  font-weight: 600; font-size: 13px;
}
.product-info-modal-close {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); font-size: 18px; padding: 0 4px;
  line-height: 1;
}
.product-info-modal-close:hover { color: var(--text-primary); }
.product-info-modal-body { overflow-y: auto; padding: 12px 18px 18px; }
.product-info-section-title {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin: 14px 0 6px; padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.product-info-section-title:first-child { margin-top: 4px; }
.product-info-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.product-info-table td { padding: 4px 6px; vertical-align: top; }
.product-info-table td:first-child {
  color: var(--text-muted); width: 45%; font-family: var(--font-mono);
  font-size: 11px;
}
.product-info-table td:last-child { color: var(--text-primary); }
```

- [ ] **Step 4: Commit**

```bash
git add renderer/fullpage.html renderer/fullpage.css
git commit -m "feat: replace 7 product detail columns with productInfo column + overlay styles"
```

---

## Task 3: fullpage.js — 移除旧列逻辑，新增 productInfo 渲染 + overlay

**Files:**
- Modify: `renderer/fullpage.js`

**Interfaces:**
- Consumes: `r.productInfo` — `{ [section]: { [key]: value } }`
- Produces: 结果行中「产品信息」td；overlay 展开/关闭逻辑

- [ ] **Step 1: 移除 colClassMap 和 7 列 th 显隐逻辑**

在 `renderAllResults()` 中找到：
```js
const colClassMap = {
  bsrMain: 'col-bsr-main', bsrSub: 'col-bsr-sub',
  dateFirstAvailable: 'col-date-first', modelNumber: 'col-model',
  dimensions: 'col-dimensions', manufacturer: 'col-manufacturer', batteries: 'col-batteries'
};
Object.entries(colClassMap).forEach(([field, cls]) => {
  const th = document.querySelector(`th.${cls}`);
  if (th) th.style.display = enabled.includes(field) ? '' : 'none';
});
```

替换为：
```js
const piTh = document.querySelector('th.col-product-info');
if (piTh) piTh.style.display = enabled.includes('productInfo') ? '' : 'none';
```

- [ ] **Step 2: 移除 7 个条件 td，新增 productInfo td**

在行模板中找到并删除：
```js
${enabled.includes('bsrMain') ? `<td class="col-bsr-main" ...>...</td>` : ''}
${enabled.includes('bsrSub') ? `<td class="col-bsr-sub" ...>...</td>` : ''}
${enabled.includes('dateFirstAvailable') ? `<td class="col-date-first">...</td>` : ''}
${enabled.includes('modelNumber') ? `<td class="col-model">...</td>` : ''}
${enabled.includes('dimensions') ? `<td class="col-dimensions" ...>...</td>` : ''}
${enabled.includes('manufacturer') ? `<td class="col-manufacturer">...</td>` : ''}
${enabled.includes('batteries') ? `<td class="col-batteries" ...>...</td>` : ''}
```

在 `col-parent` td 之后、`col-history` td 之前插入：
```js
${enabled.includes('productInfo') ? `<td class="col-product-info">${r.productInfo && Object.keys(r.productInfo).length ? `<button class="btn-product-info" data-asin="${esc(r.asin)}" data-site="${esc(r.site)}">查看</button>` : ''}</td>` : ''}
```

- [ ] **Step 3: 移除 7 个 export columns 条目**

在 `exportExcel()` 的 `columns` 数组中找到并删除：
```js
{ key: 'bsrMain',            label: 'BSR大类',   enabledField: 'bsrMain' },
{ key: 'bsrSub',             label: 'BSR小类',   enabledField: 'bsrSub' },
{ key: 'dateFirstAvailable', label: '上架时间',  enabledField: 'dateFirstAvailable' },
{ key: 'modelNumber',        label: '型号',      enabledField: 'modelNumber' },
{ key: 'dimensions',         label: '尺寸重量',  enabledField: 'dimensions' },
{ key: 'manufacturer',       label: '制造商',    enabledField: 'manufacturer' },
{ key: 'batteries',          label: '电池',      enabledField: 'batteries' },
```

- [ ] **Step 4: 新增 productInfo overlay 逻辑**

在 `exportExcel` 函数之前插入以下代码：

```js
// ========== 产品信息浮层 ==========
function initProductInfoOverlay() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-product-info');
    if (btn) {
      const asin = btn.dataset.asin;
      const site = btn.dataset.site;
      const r = allResults.find(r => r.asin === asin && r.site === site);
      if (r && r.productInfo) showProductInfoOverlay(r);
      return;
    }
    if (e.target.closest('.product-info-overlay') && !e.target.closest('.product-info-modal')) {
      closeProductInfoOverlay();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProductInfoOverlay();
  });
}

function showProductInfoOverlay(r) {
  closeProductInfoOverlay();
  const sections = Object.entries(r.productInfo);
  if (!sections.length) return;

  const sectionsHtml = sections.map(([title, data]) => {
    const rows = Object.entries(data).map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`
    ).join('');
    return `
      <div class="product-info-section-title">${esc(title)}</div>
      <table class="product-info-table"><tbody>${rows}</tbody></table>
    `;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'product-info-overlay';
  overlay.id = 'productInfoOverlay';
  overlay.innerHTML = `
    <div class="product-info-modal">
      <div class="product-info-modal-header">
        <span>产品信息 — ${esc(r.asin)} @ ${getSiteLabel(r.site)}</span>
        <button class="product-info-modal-close" onclick="closeProductInfoOverlay()">×</button>
      </div>
      <div class="product-info-modal-body">${sectionsHtml}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeProductInfoOverlay() {
  const el = document.getElementById('productInfoOverlay');
  if (el) el.remove();
}
```

- [ ] **Step 5: 在 DOMContentLoaded init 中调用 initProductInfoOverlay()**

在 `initHistoryTab()` 之后添加：
```js
initProductInfoOverlay();
```

- [ ] **Step 6: 验证语法**

```bash
node --check renderer/fullpage.js
```

Expected: no output (syntax OK)

- [ ] **Step 7: 手动验证**

```bash
npm start
```

1. 巡店一个 ASIN（任意 CA/US/AU/MX 站点）
2. 勾选「产品信息」字段后开始巡店
3. 结果出来后「产品信息」列显示「查看」按钮
4. 点击「查看」，浮层展示各 section 的键值对
5. 按 Esc 或点浮层外部可关闭
6. 不勾选「产品信息」时该列不显示

- [ ] **Step 8: Commit**

```bash
git add renderer/fullpage.js
git commit -m "feat: add productInfo overlay, remove 7 legacy product detail columns"
```
