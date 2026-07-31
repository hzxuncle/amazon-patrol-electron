# 巡店面板布局重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将巡店面板重组为四个清晰区域：输入区、配置+操作区（左右并排）、状态栏、结果表格，并将「启用对比」和「显示历史对比」从 checkbox 改为 toggle 开关。

**Architecture:** 纯 HTML/CSS 结构调整，不改变任何 JS 逻辑。所有现有 DOM ID 和 class 保持不变，只调整 HTML 嵌套结构和 CSS 布局规则。JS 中对 `dom.enableRefCompare`、`dom.showHistoryDiff` 等元素的引用无需修改。

**Tech Stack:** HTML, CSS (existing CSS variables), no JS changes

## Global Constraints

- 所有现有 DOM ID 保持不变（`btnStart`、`enableRefCompare`、`showHistoryDiff` 等）
- 启用对比、显示历史对比改为 toggle 开关（复用 `.cron-toggle-wrap` / `.cron-toggle-slider` CSS）
- 字段勾选 checkbox 保持不变（只是 UI 位置调整）
- 进度条区域保持 `id="progressSection"` 和 `style="display:none"` 行为不变
- No JS changes, no new npm dependencies

---

## 新布局结构

```
┌─ 输入区 (#patrol-input) ────────────────────────────────────┐
│ 站点分组卡片（#siteGroups）+ 新增站点按钮                      │
└──────────────────────────────────────────────────────────────┘
┌─ 配置区 (#patrol-config) ────┐ ┌─ 操作区 (#patrol-actions) ─┐
│ 抓取字段勾选（#fieldToggles） │ │ [▶ 开始巡店]               │
│ ─────────────────────────── │ │ [■ 停止]  [↻ 重试失败项]   │
│ 启用对比   ○——●              │ │                            │
│ 历史对比   ○——●              │ └────────────────────────────┘
└──────────────────────────────┘
──── 进度条（巡店中显示，#progressSection）──────────────────────
┌─ 状态栏 (#toolbar) ───────────────────────────┬─────────────┐
│ 共15条 ✅12 ❌3   2026-07-23 12:18            │ [导出] [清除]│
└───────────────────────────────────────────────┴─────────────┘
┌─ 结果表格 ──────────────────────────────────────────────────┐
│ ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Task 1: HTML 结构重组

**Files:**
- Modify: `renderer/fullpage.html`

**Interfaces:**
- Produces: 新的四区布局，所有 ID 不变

- [ ] **Step 1: 替换 `#tab-patrol` 内部结构**

找到 `<div class="tab-panel active" id="tab-patrol">` 到下一个 tab 面板之间的内容，替换为：

```html
        <!-- ====== Tab: 巡店 ====== -->
        <div class="tab-panel active" id="tab-patrol">

          <!-- 输入区：站点分组 -->
          <section class="patrol-input" id="patrol-input">
            <div class="site-groups" id="siteGroups"></div>
            <button id="btnAddGroup" class="btn btn-outline btn-add-group">＋ 新增站点</button>
          </section>

          <!-- 配置区 + 操作区（左右并排） -->
          <section class="patrol-middle">

            <!-- 配置区：字段勾选 + 功能开关 -->
            <div class="patrol-config" id="patrol-config">
              <div class="config-section-label">抓取字段</div>
              <div class="field-toggles" id="fieldToggles">
                <label class="field-toggle"><input type="checkbox" data-field="price" checked> 售价</label>
                <label class="field-toggle"><input type="checkbox" data-field="listPrice" checked> 划线价</label>
                <label class="field-toggle"><input type="checkbox" data-field="dealBadge" checked> 活动标</label>
                <label class="field-toggle"><input type="checkbox" data-field="acBadge" checked> AC标</label>
                <label class="field-toggle"><input type="checkbox" data-field="coupon" checked> Coupon</label>
                <label class="field-toggle"><input type="checkbox" data-field="rating" checked> 星级</label>
                <label class="field-toggle"><input type="checkbox" data-field="reviews" checked> 评论数</label>
                <label class="field-toggle"><input type="checkbox" data-field="seller" checked> 卖家</label>
                <label class="field-toggle"><input type="checkbox" data-field="stock" checked> 库存</label>
                <label class="field-toggle"><input type="checkbox" data-field="parentAsin" checked> 父体</label>
                <label class="field-toggle"><input type="checkbox" data-field="title" checked> 标题</label>
                <label class="field-toggle"><input type="checkbox" data-field="url" checked> URL</label>
                <label class="field-toggle"><input type="checkbox" data-field="productInfo"> 产品信息</label>
                <span class="toggle-actions">
                  <button id="btnToggleAll" class="btn-ghost-sm">全选</button>
                  <button id="btnToggleNone" class="btn-ghost-sm">全不选</button>
                </span>
              </div>

              <div class="config-divider"></div>

              <div class="config-switches">
                <div class="config-switch-row">
                  <span class="config-switch-label">启用对比</span>
                  <label class="cron-toggle-wrap">
                    <input type="checkbox" id="enableRefCompare">
                    <span class="cron-toggle-slider"></span>
                  </label>
                </div>
                <div class="config-switch-row">
                  <span class="config-switch-label">历史对比</span>
                  <label class="cron-toggle-wrap">
                    <input type="checkbox" id="showHistoryDiff">
                    <span class="cron-toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <!-- 操作区：巡店按钮 -->
            <div class="patrol-actions" id="patrol-actions">
              <button id="btnStart" class="btn btn-primary btn-lg btn-patrol">
                <span>▶</span> 开始巡店
              </button>
              <button id="btnStop" class="btn btn-danger btn-lg btn-patrol" disabled>
                <span>■</span> 停止
              </button>
              <button id="btnRetry" class="btn btn-warning btn-lg btn-patrol" disabled>
                <span>↻</span> 重试失败项
              </button>
            </div>

          </section>

          <!-- 进度条 -->
          <section class="progress-bar-section" id="progressSection" style="display:none">
            <div class="progress-info-row">
              <span id="progressText">0 / 0</span>
              <span id="progressTime">00:00</span>
              <span id="progressStatus">准备中...</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" id="progressFill"></div>
            </div>
          </section>

          <!-- 状态栏 -->
          <section class="toolbar" id="toolbar">
            <div class="toolbar-left">
              <span class="results-summary" id="resultsSummary">准备就绪</span>
              <span id="patrolTimestamp" style="font-size:11px;color:var(--text-muted);margin-left:12px;font-family:var(--font-mono)"></span>
            </div>
            <div class="toolbar-right">
              <button id="btnExport" class="btn btn-outline" disabled>
                <span>⇩</span> 导出 Excel
              </button>
              <button id="btnClear" class="btn btn-ghost">清除结果</button>
            </div>
          </section>

          <!-- 结果表格 -->
          <div class="table-container" id="tableContainer">
            <div class="table-scroll">
              <table class="results-table" id="resultsTable">
                <thead>
                  <tr>
                    <th class="col-status" title="状态">状</th>
                    <th class="col-site">站点</th>
                    <th class="col-asin">ASIN</th>
                    <th class="col-title">标题</th>
                    <th class="col-alias" id="colAliasHdr" style="display:none">常用名</th>
                    <th class="col-price">售价</th>
                    <th class="col-listprice">划线价</th>
                    <th class="col-deal">活动</th>
                    <th class="col-ac">AC标</th>
                    <th class="col-coupon">Coupon</th>
                    <th class="col-rating">星级</th>
                    <th class="col-reviews">评论</th>
                    <th class="col-seller">卖家</th>
                    <th class="col-stock">库存</th>
                    <th class="col-parent">父体</th>
                    <th class="col-product-info">产品信息</th>
                    <th class="col-history" id="colHistory">上次</th>
                  </tr>
                </thead>
                <tbody id="resultsBody">
                  <tr class="empty-row">
                    <td colspan="23">
                      <div class="empty-state">
                        <span class="empty-icon">◎</span>
                        <p>点击「开始巡店」查看结果</p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Commit HTML**

```bash
git add renderer/fullpage.html
git commit -m "refactor: patrol panel - restructure into input/config/actions/toolbar/results zones"
```

---

## Task 2: CSS 布局规则

**Files:**
- Modify: `renderer/fullpage.css`

**Interfaces:**
- Produces: 新布局 CSS，旧 `.control-bar` 样式可移除

- [ ] **Step 1: 移除旧的 `.control-bar` 和 `.control-right` 规则**

找到并删除：
```css
.control-bar {
  display: flex; flex-direction: column; gap: 0; padding: 14px 20px;
  background: var(--bg-card); border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.control-right { display: flex; flex-direction: row; gap: 8px; align-items: center; }
```

- [ ] **Step 2: 移除旧的 `.field-toggles` 区域样式中的 border-bottom 和 background**

找到：
```css
.field-toggles {
  display: flex; align-items: center; flex-wrap: wrap; gap: 3px 10px;
  padding: 8px 20px; flex-shrink: 0;
  background: var(--bg-card); border-bottom: 1px solid var(--border);
}
```

替换为（去掉 padding/background/border，由父容器控制）：
```css
.field-toggles {
  display: flex; align-items: center; flex-wrap: wrap; gap: 3px 10px;
}
```

- [ ] **Step 3: 新增四区布局 CSS**

在文件 `.field-toggles` 规则之后插入：

```css
/* ===== 巡店面板布局 ===== */

/* 输入区：站点分组 */
.patrol-input {
  padding: 14px 20px 10px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

/* 配置区 + 操作区：左右并排 */
.patrol-middle {
  display: flex; flex-direction: row; gap: 0;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

/* 配置区 */
.patrol-config {
  flex: 1; padding: 12px 20px;
  border-right: 1px solid var(--border);
}
.config-section-label {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.config-divider {
  height: 1px; background: var(--border); margin: 10px 0;
}
.config-switches {
  display: flex; flex-direction: column; gap: 8px;
}
.config-switch-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: var(--text-secondary);
}
.config-switch-label {
  font-size: 12px; color: var(--text-secondary);
}

/* 操作区 */
.patrol-actions {
  display: flex; flex-direction: column; gap: 8px;
  justify-content: center; align-items: stretch;
  padding: 14px 20px; min-width: 160px;
}
.btn-patrol {
  width: 100%;
}
```

- [ ] **Step 4: 移除旧的 `.toggle-label` 中 checkbox 相关样式（不再用于此处）**

`.toggle-label` 可保留（可能其他地方还在用），不删除。

- [ ] **Step 5: Commit CSS**

```bash
git add renderer/fullpage.css
git commit -m "refactor: patrol panel CSS - new zone layout, config+actions side by side"
```
