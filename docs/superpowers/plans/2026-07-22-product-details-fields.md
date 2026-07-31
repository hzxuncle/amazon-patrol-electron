# Product Details 字段扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 7 个 Product Details 字段（BSR大类、BSR小类、上架时间、型号、尺寸重量、制造商、电池），贯穿抓取、展示、导出三层。

**Architecture:** 在 content.js 新增 `extractProductDetails()` 统一解析 `#detailBullets_feature_div` 键值对，一次 DOM 查询提取全部字段；selectors.js 不动；UI 层（字段勾选、结果表格、Excel 导出）按现有 `enabledField` 模式接入，默认启用 bsrMain/bsrSub/dateFirstAvailable，其余默认关闭。

**Tech Stack:** Vanilla JS, Electron 28, existing patterns in content.js / fullpage.js / fullpage.html / fullpage.css

## Global Constraints

- 新字段 key 命名：`bsrMain`、`bsrSub`、`dateFirstAvailable`、`modelNumber`、`dimensions`、`manufacturer`、`batteries`
- 默认启用（`checked`）：`bsrMain`、`bsrSub`、`dateFirstAvailable`
- 默认关闭：`modelNumber`、`dimensions`、`manufacturer`、`batteries`
- BSR 大类格式：`#34,015 in Health & Household`（保留原文）
- BSR 小类格式：`#64 in Handheld Massagers`（只取第一个小类）
- 无数据时统一返回空字符串 `''`（不用 N/A）
- 不引入新 npm 依赖
- ASIN 格式：`/^[A-Z0-9]{10}$/`

---

## 文件变更一览

| 文件 | 操作 |
|------|------|
| `renderer/content.js` | 新增 `extractProductDetails()`，result 对象加 7 个字段，isEnabled 调用 |
| `renderer/fullpage.html` | 字段勾选栏新增 7 个 checkbox；结果表格 thead 新增 7 列 |
| `renderer/fullpage.js` | 结果行渲染新增 7 列；exportExcel columns 数组新增 7 项 |
| `renderer/fullpage.css` | 新增 7 列的列宽 CSS |

---

## Task 1: content.js — extractProductDetails() + 字段抓取

**Files:**
- Modify: `renderer/content.js`

**Interfaces:**
- Produces: result 对象新增字段：
  - `bsrMain: string` — BSR 大类，如 `#34,015 in Health & Household`
  - `bsrSub: string` — BSR 第一小类，如 `#64 in Handheld Massagers`
  - `dateFirstAvailable: string` — 如 `February 19, 2025`
  - `modelNumber: string` — 如 `R-WMG06`
  - `dimensions: string` — 如 `5.83 x 2.56 x 8.27 inches; 1.98 pounds`
  - `manufacturer: string` — 如 `RENPHO`
  - `batteries: string` — 如 `1 Lithium Ion batteries required. (included)`

- [ ] **Step 1: 在 result 对象初始化中新增 7 个字段**

在 `renderer/content.js` 的 result 对象（`const result = { asin: '', site: hostname, ...`）末尾，在 `status: 'success'` 之前插入：

```js
bsrMain: '',
bsrSub: '',
dateFirstAvailable: '',
modelNumber: '',
dimensions: '',
manufacturer: '',
batteries: '',
```

- [ ] **Step 2: 新增 extractProductDetails() 辅助函数**

在 `parseDealBadge` 函数之后、`handleScrape` 函数之前，插入：

```js
function extractProductDetails() {
  const details = {};
  // 支持两种常见 Product Details 容器
  const rows = document.querySelectorAll(
    '#detailBullets_feature_div li, ' +
    '#productDetails_techSpec_section_1 tr, ' +
    '#productDetails_detailBullets_sections1 tr'
  );
  rows.forEach(row => {
    const keyEl = row.querySelector('.a-text-bold, th');
    const valEl = row.querySelector('span:not(.a-text-bold), td');
    if (!keyEl || !valEl) return;
    // 清理 Amazon 特有的双向控制字符和多余空白
    const key = keyEl.textContent.replace(/[‏‎‪-‮:：]/g, '').trim();
    const val = valEl.textContent.replace(/\s+/g, ' ').trim();
    if (key && val) details[key] = val;
  });
  return details;
}

function parseBsr(bsrRaw) {
  if (!bsrRaw) return { main: '', sub: '' };
  // 大类：第一个 #数字 in 分类名（不含括号链接文字）
  const mainMatch = bsrRaw.match(/#[\d,]+ in [^(#\n]+/);
  const main = mainMatch ? mainMatch[0].trim().replace(/\s+/g, ' ') : '';
  // 小类：ul 里的第一个子分类排名
  const subMatch = bsrRaw.match(/#[\d,]+ in [^(#\n]+/g);
  // subMatch[0] 是大类，subMatch[1] 是第一个小类（如果有）
  const sub = subMatch && subMatch.length > 1 ? subMatch[1].trim().replace(/\s+/g, ' ') : '';
  return { main, sub };
}
```

- [ ] **Step 3: 在 handleScrape 中调用 extractProductDetails()**

在 `result.stock` 赋值逻辑之后、`result.parentAsin` 赋值之前，插入：

```js
// Product Details 区块（BSR/上架时间/型号等）
const productDetails = extractProductDetails();

if (isEnabled('bsrMain') || isEnabled('bsrSub')) {
  const bsr = parseBsr(productDetails['Best Sellers Rank'] || productDetails['Best Sellers Rank:'] || '');
  if (isEnabled('bsrMain')) result.bsrMain = bsr.main;
  if (isEnabled('bsrSub')) result.bsrSub = bsr.sub;
}
if (isEnabled('dateFirstAvailable')) {
  const raw = productDetails['Date First Available'] || '';
  // 清理键名污染（值里可能重复含键名）
  result.dateFirstAvailable = raw.replace(/Date First Available[\s\S]*?:\s*/i, '').trim();
}
if (isEnabled('modelNumber')) {
  const raw = productDetails['Item model number'] || productDetails['Model Number'] || '';
  result.modelNumber = raw.replace(/Item model number[\s\S]*?:\s*/i, '').trim();
}
if (isEnabled('dimensions')) {
  const raw = productDetails['Product Dimensions'] || productDetails['Item Dimensions'] || '';
  result.dimensions = raw.replace(/Product Dimensions[\s\S]*?:\s*/i, '').replace(/Item Dimensions[\s\S]*?:\s*/i, '').trim();
}
if (isEnabled('manufacturer')) {
  const raw = productDetails['Manufacturer'] || '';
  result.manufacturer = raw.replace(/Manufacturer[\s\S]*?:\s*/i, '').trim();
}
if (isEnabled('batteries')) {
  const raw = productDetails['Batteries'] || '';
  result.batteries = raw.replace(/Batteries[\s\S]*?:\s*/i, '').trim();
}
```

- [ ] **Step 4: 手动验证**

```bash
npm start
```

开启「显示抓取窗口」，抓取 B0DKSYFK5Z（US站），在 DevTools Console 打印：

```js
// 应输出包含 bsrMain/bsrSub/dateFirstAvailable 等字段
```

在日志 Tab 确认无报错，结果对象包含新字段。

- [ ] **Step 5: Commit**

```bash
git add renderer/content.js
git commit -m "feat: extract Product Details fields (BSR, dateFirstAvailable, modelNumber, etc.)"
```

---

## Task 2: HTML + CSS — 字段勾选栏 + 表头列

**Files:**
- Modify: `renderer/fullpage.html`
- Modify: `renderer/fullpage.css`

**Interfaces:**
- Produces:
  - 7 个新 `data-field` checkbox（bsrMain/bsrSub 默认 checked，其余不 checked）
  - 7 个新 `<th>` 列（紧跟 `<th class="col-parent">父体</th>` 之后，`<th class="col-history">` 之前）

- [ ] **Step 1: fullpage.html — 字段勾选栏新增 7 个 checkbox**

在 `<label class="field-toggle"><input type="checkbox" data-field="url" checked> URL</label>` 之后插入：

```html
<label class="field-toggle"><input type="checkbox" data-field="bsrMain" checked> BSR大类</label>
<label class="field-toggle"><input type="checkbox" data-field="bsrSub" checked> BSR小类</label>
<label class="field-toggle"><input type="checkbox" data-field="dateFirstAvailable" checked> 上架时间</label>
<label class="field-toggle"><input type="checkbox" data-field="modelNumber"> 型号</label>
<label class="field-toggle"><input type="checkbox" data-field="dimensions"> 尺寸重量</label>
<label class="field-toggle"><input type="checkbox" data-field="manufacturer"> 制造商</label>
<label class="field-toggle"><input type="checkbox" data-field="batteries"> 电池</label>
```

- [ ] **Step 2: fullpage.html — 结果表格 thead 新增 7 列**

在 `<th class="col-parent">父体</th>` 之后、`<th class="col-history" id="colHistory">上次</th>` 之前插入：

```html
<th class="col-bsr-main">BSR大类</th>
<th class="col-bsr-sub">BSR小类</th>
<th class="col-date-first">上架时间</th>
<th class="col-model">型号</th>
<th class="col-dimensions">尺寸重量</th>
<th class="col-manufacturer">制造商</th>
<th class="col-batteries">电池</th>
```

- [ ] **Step 3: fullpage.css — 新增 7 列列宽**

在现有列宽定义（`col-parent`、`col-history` 附近）后追加：

```css
.col-bsr-main    { width: 200px; overflow: hidden; text-overflow: ellipsis; }
.col-bsr-sub     { width: 180px; overflow: hidden; text-overflow: ellipsis; }
.col-date-first  { width: 120px; overflow: hidden; text-overflow: ellipsis; }
.col-model       { width: 100px; overflow: hidden; text-overflow: ellipsis; }
.col-dimensions  { width: 200px; overflow: hidden; text-overflow: ellipsis; }
.col-manufacturer{ width: 100px; overflow: hidden; text-overflow: ellipsis; }
.col-batteries   { width: 160px; overflow: hidden; text-overflow: ellipsis; }
```

- [ ] **Step 4: Commit**

```bash
git add renderer/fullpage.html renderer/fullpage.css
git commit -m "feat: add Product Details columns to field toggles and results table header"
```

---

## Task 3: fullpage.js — 结果行渲染 + Excel 导出

**Files:**
- Modify: `renderer/fullpage.js`

**Interfaces:**
- Consumes: `r.bsrMain`, `r.bsrSub`, `r.dateFirstAvailable`, `r.modelNumber`, `r.dimensions`, `r.manufacturer`, `r.batteries`
- Produces:
  - `renderAllResults()` 中每行新增 7 个 `<td>`，按 `enabledFields` 控制列显隐
  - `exportExcel()` 的 columns 数组新增 7 项

- [ ] **Step 1: fullpage.js — 结果行渲染新增 7 列**

在 `renderAllResults()` 函数的行模板中，找到：

```js
<td class="col-parent" title="${esc(r.parentAsin || '')}">${esc(r.parentAsin || 'N/A')}</td>
<td class="col-history">${showHistory ? renderHistoryDiff(r) : ''}</td>
```

在两者之间插入：

```js
${enabled.includes('bsrMain') ? `<td class="col-bsr-main" title="${esc(r.bsrMain || '')}">${esc(r.bsrMain || '')}</td>` : ''}
${enabled.includes('bsrSub') ? `<td class="col-bsr-sub" title="${esc(r.bsrSub || '')}">${esc(r.bsrSub || '')}</td>` : ''}
${enabled.includes('dateFirstAvailable') ? `<td class="col-date-first">${esc(r.dateFirstAvailable || '')}</td>` : ''}
${enabled.includes('modelNumber') ? `<td class="col-model">${esc(r.modelNumber || '')}</td>` : ''}
${enabled.includes('dimensions') ? `<td class="col-dimensions" title="${esc(r.dimensions || '')}">${esc(r.dimensions || '')}</td>` : ''}
${enabled.includes('manufacturer') ? `<td class="col-manufacturer">${esc(r.manufacturer || '')}</td>` : ''}
${enabled.includes('batteries') ? `<td class="col-batteries" title="${esc(r.batteries || '')}">${esc(r.batteries || '')}</td>` : ''}
```

注意：`renderAllResults()` 中需要在函数顶部读取 `enabled`：

```js
const enabled = getEnabledFields();
```

检查该函数是否已有此行，若没有则加上。

同时更新表头 th 的显隐逻辑——当前表头是静态 HTML，7 个新列需要根据 enabledFields 动态显隐。在 `renderAllResults()` 中加：

```js
['bsrMain','bsrSub','dateFirstAvailable','modelNumber','dimensions','manufacturer','batteries'].forEach(field => {
  const th = document.querySelector(`.col-${field.replace(/([A-Z])/g, '-$1').toLowerCase().replace('bsr-main','bsr-main').replace('bsr-sub','bsr-sub')}`);
  // 用 class 名映射
});
```

实际上更简单：直接用 querySelector 按 class 找并控制 display：

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

- [ ] **Step 2: fullpage.js — exportExcel columns 数组新增 7 项**

在 `exportExcel()` 函数的 `columns` 数组中，在 `{ key: 'parentAsin', label: '父体ASIN', enabledField: 'parentAsin' }` 之后插入：

```js
{ key: 'bsrMain',            label: 'BSR大类',   enabledField: 'bsrMain' },
{ key: 'bsrSub',             label: 'BSR小类',   enabledField: 'bsrSub' },
{ key: 'dateFirstAvailable', label: '上架时间',  enabledField: 'dateFirstAvailable' },
{ key: 'modelNumber',        label: '型号',      enabledField: 'modelNumber' },
{ key: 'dimensions',         label: '尺寸重量',  enabledField: 'dimensions' },
{ key: 'manufacturer',       label: '制造商',    enabledField: 'manufacturer' },
{ key: 'batteries',          label: '电池',      enabledField: 'batteries' },
```

- [ ] **Step 3: 手动验证**

```bash
npm start
```

1. 巡店一个有 BSR 和上架时间的 ASIN（如 B082W886W9 CA 站）
2. 确认结果表格显示 BSR大类、BSR小类、上架时间三列数据正确
3. 勾选「型号」字段，确认该列出现
4. 点「导出 Excel」，确认新字段出现在导出文件中
5. 取消勾选「BSR大类」，确认该列消失

- [ ] **Step 4: Commit**

```bash
git add renderer/fullpage.js
git commit -m "feat: render and export Product Details fields in results table"
```
