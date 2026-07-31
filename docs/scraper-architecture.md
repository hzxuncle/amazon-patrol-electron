# 抓取引擎架构设计

## 背景与问题

原始架构中，`selectors.js` 和 `content.js` 是所有站点共用的单一文件：

```
tab-manager.js
  ↓ 注入
selectors.js（所有站点共用一套选择器）
content.js（所有站点共用一套解析/归一化逻辑）
```

这带来三个核心问题：

1. **选择器 fallback 链冗长**：每次抓取要遍历十几个选择器，其中大量是无效的（实测 `a#sellerProfileTriggerId` 排在第 7 位，前 6 个全部 ❌）
2. **多语言解析失败**：`extractRating` 只处理英文 `out of`，MX 站 `4.7 de 5 estrellas` 无法提取数字；库存归一化只处理英文关键词，MX `Disponible` 原样输出
3. **维护困难**：新增站点差异只能往共用函数里堆条件判断，越来越难维护；AI 分析某站点问题需要读整个文件

## 实测数据（2026-07-23）

基于 B01N1UX8RW 在 US/CA/AU/MX 四个站点的实测，关键发现：

| 字段 | 精确选择器 | 备注 |
|------|-----------|------|
| price | `.a-price[data-a-size="xl"] .a-offscreen` | US/CA/MX 命中；AU 的 `data-a-size` 不稳定（实测出现过 `l`、`s`），`xl` 可能返回空，依赖 `_base` fallback 链兜底 |
| listPrice | `.basisPrice .a-price .a-offscreen` | 四站点全部命中，值正确 |
| seller | `a#sellerProfileTriggerId` | 其余 7 个选择器全部 ❌ |
| stock | `#availability span` | 四站点命中，但 MX 返回 `Disponible`（西班牙文） |
| rating | `#acrPopover .a-icon-alt` | MX 返回 `4.7 de 5 estrellas`，现有正则无法提取 |
| dealBadge | `#dealBadgeSupportingText span` | MX 返回 `Promoción`，现有 pattern 不匹配 |
| acBadge | US/MX 只命中容器（JSON），CA/AU 命中 `span.a-size-small` | 需分站点处理 |

## 目标架构

### 整体结构

```
renderer/sites/
├── _base/
│   ├── selectors.js    ← 基准选择器（当前通用选择器精简后）
│   ├── parsers.js      ← 不变的解析函数（extractPrice、extractReviewCount 等）
│   ├── normalizers.js  ← 默认归一化（英文关键词）
│   └── scraper.js      ← 抓取主流程（协调层）
├── us/
│   └── selectors.js    ← US 精确选择器（只写差异）
├── ca/
│   └── selectors.js
├── au/
│   └── selectors.js
├── mx/
│   ├── selectors.js
│   ├── parsers.js      ← extractRating 支持 "de 5 estrellas"
│   └── normalizers.js  ← normalizeStock: Disponible→In Stock；parseDealBadge: Promoción
└── index.js            ← Node端总入口：按 siteCode 合并 _base + 站点覆盖
```

### 职责分工

| 文件 | 职责 | 示例 |
|------|------|------|
| `selectors.js` | 找哪个元素（CSS 选择器列表） | `price: ['.a-price[data-a-size="xl"] .a-offscreen']` |
| `parsers.js` | 从原始文本提取有效值 | `extractRating('4.7 de 5 estrellas')` → `'4.7'` |
| `normalizers.js` | 将提取值标准化 | `normalizeStock('Disponible')` → `'In Stock'` |
| `scraper.js` | 协调三层，组装最终 result | `scrapePageData(options)` |

### 覆盖机制

站点文件只写与 `_base` 有差异的部分，`index.js` 按文件存在与否决定使用哪个实现。

**选择器合并规则（数组字段）：**

```
最终选择器列表 = [站点专用] + [_base] + [站点 Fallback]
```

- **站点专用**（`site/selectors.js` 里的字段）：精准选择器，优先匹配
- **_base**：通用兜底，站点专用失败后依次尝试
- **站点 Fallback**（`${field}Fallback` 字段）：最低优先级兜底，追加到最末尾

`priceFallback` 示例：

```js
// au/selectors.js
price: ['.a-price[data-a-size="xl"] .a-offscreen'],   // 精准，优先
priceFallback: ['.olpWrapper.a-size-small'],           // 最末兜底（如无 Featured Offer 时的第三方报价）
```

最终合并结果：

```
[AU 精准] → [_base 全部] → [AU priceFallback]
```

所有字段均支持 `${field}Fallback`，不限于 price。

### 为何选择 `_base` 而非完全独立

**完全独立**（每个站点 4 个文件全部独立）的代价：
- `extractPrice`、`queryWithFallback`、`scrapePageData` 主流程等纯逻辑会在 4 个站点里完全重复
- 发现一个通用 bug 需要改 N 个文件，且 N 个版本会逐渐出现细微差异

**`_base` 方案**的核心原则：
- **有语言/地区差异的** → 按站点独立（selectors/parsers/normalizers 里有差异的部分）
- **纯逻辑，没有语言/地区差异的** → 放 `_base`（extractPrice 就是从字符串提取数字，这不会因站点不同而不同）

## 运行时流程

```
tab-manager.js（Node端）
  ↓ 读取 sites/index.js
  ↓ 按 siteCode 合并 _base + 站点覆盖，得到完整 scraper 对象
  ↓ 序列化为字符串，注入 window.__SCRAPER__
页面端
  ↓ content.js（简化为入口）调用 window.__SCRAPER__.scrapePageData(options)
  ↓ scraper 内部调用 selectors → parsers → normalizers
  ↓ 返回 result
```

## 新增站点流程

1. 在 `renderer/sites/` 下建目录，如 `jp/`
2. 只需写有差异的文件：
   - `selectors.js`：JP 精确选择器（必须，每个站点 DOM 不同）
   - `parsers.js`：如需处理日文评分格式（`5つ星のうち4.3`）
   - `normalizers.js`：如需处理日文库存文本（`在庫あり`→`In Stock`）
3. `index.js` 自动发现并合并，其余 fallback 到 `_base`

## 已废弃文件（重构完成后删除）

- `renderer/selectors.js`
- `renderer/selectors/`（已拆的中间产物）
- `renderer/content.js`（逻辑迁移到 `_base/scraper.js`）
