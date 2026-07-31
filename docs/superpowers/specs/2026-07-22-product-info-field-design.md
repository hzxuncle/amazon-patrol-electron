# productInfo 字段设计文档

## 背景

现有 7 个 Product Details 字段（bsrMain/bsrSub/dateFirstAvailable/modelNumber/dimensions/manufacturer/batteries）仅支持 `#detailBullets_feature_div`，CA/US/AU/MX/JP 等站点用的是 `prodDetTable` 结构，导致全部抓不到数据。

## 目标

1. 移除现有 7 个 Product Details 专用字段（代码、UI、导出）
2. 新增 `productInfo` 字段，原样抓取所有站点的 Product information 区块
3. 结果表格新增「产品信息」列，点击展开浮层查看完整键值对
4. Excel 不导出 productInfo

## 数据结构

```js
// result.productInfo — 嵌套结构，section 标题为一级 key
{
  "Features & Specs": {
    "Special Features": "Auto Shut Off, Body Fat",
    "Display Type": "LED"
  },
  "Additional details": {
    "Color": "Black",
    "Best Sellers Rank": "#1,297 in Health & Household"
  },
  "Item details": {
    "ASIN": "B01N1UX8RW",
    "Manufacturer": "RENPHO"
  }
}
```

## 抓取逻辑（content.js）

### extractProductDetails() 重写

支持两种结构，合并到同一嵌套对象：

**结构一：`prodDetTable`（主流，所有样本站点均有）**
```
#productDetails_feature_div .a-expander-section-container
  → .a-expander-prompt          → section 标题
  → .prodDetTable tr
      → th.prodDetSectionEntry  → key
      → td.prodDetAttrValue     → value
```

**结构二：`detailBullets`（部分商品有，作为补充）**
```
#detailBullets_feature_div li
  → .a-text-bold  → key
  → span:not(.a-text-bold) → value
```
section 标题固定为 `"Product Details"`

清理规则：
- key：去除 Unicode 控制字符（`‏‎`）和冒号，trim
- value：去除多余空白，trim；不清理键名污染（原样保留）
- 跳过 `Customer Reviews`、`おすすめ度`、`Opinión media` 等评价行（值含 script 标签或 "out of 5 stars"）

### result 对象变更

移除：`bsrMain`, `bsrSub`, `dateFirstAvailable`, `modelNumber`, `dimensions`, `manufacturer`, `batteries`

新增：`productInfo: {}`

## UI 变更

### 字段勾选栏

移除 7 个 checkbox（bsrMain/bsrSub/dateFirstAvailable/modelNumber/dimensions/manufacturer/batteries）

新增 1 个：
```html
<label class="field-toggle"><input type="checkbox" data-field="productInfo"> 产品信息</label>
```
默认**不勾选**（数据量大，按需开启）

### 结果表格

移除 7 列（col-bsr-main/col-bsr-sub/col-date-first/col-model/col-dimensions/col-manufacturer/col-batteries）

新增 1 列，紧跟 col-parent 之后：
```html
<th class="col-product-info">产品信息</th>
```

单元格内容：有数据时显示「查看」按钮，无数据时空白。

### 产品信息浮层

点击「查看」按钮，在页面中央显示 overlay，内容：

```
产品信息 — B01N1UX8RW @ amazon.com          [×]
─────────────────────────────────────────
Features & Specs
  Special Features    Auto Shut Off, Body Fat...
  Display Type        LED
─────────────────────────────────────────
Additional details
  Color               Black
  Best Sellers Rank   #1,297 in Health & Household
─────────────────────────────────────────
Item details
  ASIN                B01N1UX8RW
  Manufacturer        RENPHO
```

点击 × 或浮层外部关闭。

### CSS

移除 7 列的列宽规则（`.col-bsr-main` 等）

新增：
```css
.col-product-info { width: 72px; text-align: center; }
.btn-product-info { font-size: 11px; padding: 2px 8px; cursor: pointer; ... }
.product-info-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; }
.product-info-modal { ... }
```

## Excel 导出

不导出 productInfo。移除 7 个专用字段的 columns 条目。

## 文件变更一览

| 文件 | 变更 |
|------|------|
| `renderer/content.js` | 重写 extractProductDetails()；result 对象移除 7 字段，新增 productInfo |
| `renderer/fullpage.html` | 移除 7 个 checkbox + 7 个 th；新增 productInfo checkbox + th |
| `renderer/fullpage.js` | 移除 7 列渲染 + export columns；新增 productInfo td + 浮层逻辑 |
| `renderer/fullpage.css` | 移除 7 列宽规则；新增浮层样式 |
