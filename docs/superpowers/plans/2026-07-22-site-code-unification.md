# Site Code Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有内部流转的 site 字段从完整域名（`www.amazon.ca`）统一为二字码（`CA`），域名只在 tab-manager 发起网络请求时使用。

**Architecture:** 以 `sites.json` 中的 `code` 字段为唯一标识，content.js 抓取时从 hostname 反查 code，tab-manager 入参改为接收 code 并内部反查 domain 构建 URL；store.js 新增迁移逻辑将存量数据中的完整域名转为 code；全链路 asinInputCache / allResults / referenceData / historySnapshots / deliveryZips 全部改用 code。

**Tech Stack:** Electron 28, Node.js ≥16, Vanilla JS

## Global Constraints

- `code` 格式：1-5 位大写字母数字（如 `CA`、`US`、`UK`）
- `domain` 格式：不含 www. 前缀（如 `amazon.ca`）
- `www.${domain}` 仅在 tab-manager 内部构建 URL 时使用，对外不暴露
- `sites.json` 的 `code` 字段是唯一权威来源
- 所有 task.site、result.site、asinInputCache[].site、referenceData.rows[].site、deliveryZips key、historySnapshots key 统一为 code
- No new npm dependencies
- node --check 所有修改文件

---

## 文件变更一览

| 文件 | 变更 |
|------|------|
| `electron/store.js` | 新增迁移函数 `migrateSiteCodes()` |
| `electron/main.js` | 启动时调用 `migrateSiteCodes()`；`buildDeliveryZipsForCron` 改用 code；`onCronTrigger` site 已是 code（无需改） |
| `electron/tab-manager.js` | `openTabForTask` 接收 code，内部通过 `require('./sites-data').BUILTIN_SITES` + 运行时 store 反查 domain |
| `electron/ipc-handlers.js` | `buildDeliveryZips` key 改为 code；`getSiteLabel` 直接返回 code；`result.site` 赋值改为 code；historySnapshots key 改为 code |
| `renderer/content.js` | `getSite()` 从 hostname 反查 code（通过注入的全局变量）；`result.site` 改为 code |
| `renderer/fullpage.js` | `getSiteLabel` 直接返回 code；`findRef` 直接匹配 code；`asinInputCache` site 字段已是 code（巡店面板已用 code）；`renderGroupCard` 下拉 value 改为 code |
| `renderer/fullpage.html` | 无结构变更 |

---

## Task 1: store.js 存量数据迁移

**Files:**
- Modify: `electron/store.js`

**Interfaces:**
- Produces: `migrateSiteCodes()` — 将 asinInputCache、referenceData.rows[].site、historySnapshots key 从完整域名转为 code

- [ ] **Step 1: 在 store.js 新增 `migrateSiteCodes()` 函数**

在 `module.exports` 之前插入：

```js
function migrateSiteCodes() {
  const sites = get('sites') || [];
  if (!sites.length) return;

  // domain → code 映射（www.amazon.ca → CA，amazon.ca → CA）
  const domainToCode = {};
  sites.forEach(s => {
    if (s.code && s.domain) {
      domainToCode[s.domain] = s.code;
      domainToCode[`www.${s.domain}`] = s.code;
    }
  });

  function toCode(siteValue) {
    if (!siteValue) return siteValue;
    // 已经是 code（不含点）则直接返回
    if (!siteValue.includes('.')) return siteValue.toUpperCase();
    return domainToCode[siteValue] || siteValue;
  }

  let changed = false;

  // 迁移 asinInputCache
  const cache = get('asinInputCache');
  if (Array.isArray(cache)) {
    const migrated = cache.map(g => ({ ...g, site: toCode(g.site) }));
    const needsUpdate = migrated.some((g, i) => g.site !== cache[i].site);
    if (needsUpdate) { set('asinInputCache', migrated); changed = true; }
  }

  // 迁移 referenceData.rows[].site
  const refData = get('referenceData');
  if (refData && Array.isArray(refData.rows)) {
    const migratedRows = refData.rows.map(r => ({ ...r, site: toCode(r.site) }));
    const needsUpdate = migratedRows.some((r, i) => r.site !== refData.rows[i].site);
    if (needsUpdate) { set('referenceData', { ...refData, rows: migratedRows }); changed = true; }
  }

  // 迁移 historySnapshots key（B01N1UX8RW_www.amazon.ca → B01N1UX8RW_CA）
  const snapshots = get('historySnapshots');
  if (snapshots && typeof snapshots === 'object') {
    const newSnapshots = {};
    let snapshotChanged = false;
    for (const [key, val] of Object.entries(snapshots)) {
      const parts = key.split('_');
      if (parts.length < 2) { newSnapshots[key] = val; continue; }
      const asin = parts[0];
      const siteRaw = parts.slice(1).join('_');
      const siteCode = toCode(siteRaw);
      const newKey = `${asin}_${siteCode}`;
      newSnapshots[newKey] = { ...val, site: siteCode };
      if (newKey !== key) snapshotChanged = true;
    }
    if (snapshotChanged) { set('historySnapshots', newSnapshots); changed = true; }
  }

  // 迁移 patrolResults[].site
  const results = get('patrolResults');
  if (Array.isArray(results)) {
    const migrated = results.map(r => ({ ...r, site: toCode(r.site) }));
    const needsUpdate = migrated.some((r, i) => r.site !== results[i].site);
    if (needsUpdate) { set('patrolResults', migrated); changed = true; }
  }

  if (changed) console.log('[Store] 站点 code 迁移完成');
}
```

- [ ] **Step 2: 在 module.exports 加入 migrateSiteCodes**

```js
module.exports = { get, set, remove, getAll, migrate, migrateSiteCodes };
```

- [ ] **Step 3: Commit**

```bash
git add electron/store.js
git commit -m "feat: add migrateSiteCodes() to normalize site fields to code"
```

---

## Task 2: main.js 调用迁移 + buildDeliveryZipsForCron 改用 code

**Files:**
- Modify: `electron/main.js`

**Interfaces:**
- Consumes: `store.migrateSiteCodes()`
- Produces: `buildDeliveryZipsForCron(sites)` 返回 `{ CA: 'K1A 0B1', ... }`（key 为 code）

- [ ] **Step 1: 引入 migrateSiteCodes 并在启动时调用**

找到 `app.whenReady().then(...)` 回调，在 `store.migrate()` 和 `initSites()` 之后加：

```js
store.migrateSiteCodes();
```

完整顺序：
```js
app.whenReady().then(() => {
  store.migrate();
  initSites();
  store.migrateSiteCodes(); // ← 新增，在 initSites 之后（需要 sites.json 有 code）
  // ... 其余不变
```

- [ ] **Step 2: buildDeliveryZipsForCron 改用 code 作为 key**

找到 `function buildDeliveryZipsForCron(sites)` 函数，替换为：

```js
function buildDeliveryZipsForCron(sites) {
  const zips = {};
  for (const s of sites) {
    if (s.enabled && s.zip && s.code) zips[s.code] = s.zip;
  }
  return zips;
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: call migrateSiteCodes on startup, buildDeliveryZipsForCron uses code key"
```

---

## Task 3: ipc-handlers.js 全面改用 code

**Files:**
- Modify: `electron/ipc-handlers.js`

**Interfaces:**
- Produces: `buildDeliveryZips(sites)` 返回 `{ CA: 'K1A 0B1' }`；`getSiteLabel(code)` 直接返回 code；historySnapshots key 为 `ASIN_CODE`

- [ ] **Step 1: buildDeliveryZips 改用 code 作为 key**

找到 `function buildDeliveryZips(sites)` 函数，替换为：

```js
function buildDeliveryZips(sites) {
  const zips = {};
  for (const s of sites) {
    if (s.enabled && s.zip && s.code) zips[s.code] = s.zip;
  }
  return zips;
}
```

- [ ] **Step 2: getSiteLabel 直接返回 code**

找到 `function getSiteLabel(domain)` 函数，替换为：

```js
function getSiteLabel(siteCode) {
  // siteCode 现在就是二字码，直接返回
  if (!siteCode) return '';
  // 兼容旧格式：如果传入的是域名则查一下
  if (siteCode.includes('.')) {
    const sites = store.get('sites') || [];
    const found = sites.find(s => `www.${s.domain}` === siteCode || s.domain === siteCode);
    return found ? (found.code || siteCode) : siteCode;
  }
  return siteCode;
}
```

- [ ] **Step 3: historySnapshots key 改为 code**

找到 `saveHistorySnapshot()` 函数中的 key 构建：

```js
const key = `${r.asin}_${r.site}`;
```

`r.site` 现在已经是 code（Task 4/5 完成后），key 自然就是 `B01N1UX8RW_CA`，无需额外改动。但需确认 `history[key].site` 赋值：

```js
if (!history[key]) history[key] = { asin: r.asin, site: r.site, snapshots: [] };
```

`r.site` 为 code，此处不动即可。

- [ ] **Step 4: START_PATROL 中 deliveryZips 注入确认**

找到 `START_PATROL` handler：
```js
const config = { ...rendererConfig, deliveryZips: buildDeliveryZips(sites) };
```

`buildDeliveryZips` 已改为 code key，不需要额外修改。

- [ ] **Step 5: Commit**

```bash
git add electron/ipc-handlers.js
git commit -m "refactor: ipc-handlers uses code for deliveryZips, getSiteLabel, historySnapshots"
```

---

## Task 4: tab-manager.js 接收 code，内部反查 domain

**Files:**
- Modify: `electron/tab-manager.js`

**Interfaces:**
- Consumes: `task.site` = code（如 `CA`）；`config.deliveryZips` = `{ CA: 'K1A 0B1' }`
- Produces: 实际访问 `https://www.amazon.ca/dp/ASIN`；`result.site` = code

- [ ] **Step 1: 新增 codeToSiteInfo 辅助函数**

在文件顶部（`SITE_LANG_MAP` 之后）插入：

```js
const { BUILTIN_SITES } = require('./sites-data');

// code → { domain, lang } 映射，优先用内置数据
const CODE_TO_DOMAIN = {};
const CODE_TO_LANG = {};
BUILTIN_SITES.forEach(s => {
  if (s.code) {
    CODE_TO_DOMAIN[s.code] = s.domain;
    // SITE_LANG_MAP 的 key 是 amazon.xxx，直接查
    CODE_TO_LANG[s.code] = SITE_LANG_MAP[s.domain] || 'en_US';
  }
});

function getDomainByCode(code) {
  return CODE_TO_DOMAIN[code] || null;
}

function getLangByCode(code) {
  return CODE_TO_LANG[code] || 'en_US';
}
```

- [ ] **Step 2: 修改 getSiteUrl 和 getSiteLang 接受 code**

替换 `getSiteUrl` 和 `getSiteLang`：

```js
function getSiteUrl(code) {
  const domain = getDomainByCode(code);
  if (domain) return `https://www.${domain}`;
  // 兼容旧格式：如果传入的是域名
  if (code.includes('.')) return `https://${code.startsWith('www.') ? code : 'www.' + code}`;
  return `https://www.amazon.${code.toLowerCase()}`;
}

function getSiteLang(code) {
  if (!code.includes('.')) return getLangByCode(code);
  // 兼容旧格式域名
  const key = code.replace(/^www\./, '');
  return SITE_LANG_MAP[key] || 'en_US';
}
```

- [ ] **Step 3: buildProductUrl 和 initDeliveryZip 不需要改动**

这两个函数调用 `getSiteUrl(site)` 和 `getSiteLang(site)`，`site` 现在是 code，上面两个函数已经处理，无需改。

- [ ] **Step 4: openTabForTask 中 deliveryZips 查找改为 code**

找到：
```js
const zip = (config.deliveryZips || {})[site] || '';
```

`site` 现在是 code，`config.deliveryZips` key 也是 code，直接匹配，无需改动。

- [ ] **Step 5: Commit**

```bash
git add electron/tab-manager.js
git commit -m "refactor: tab-manager accepts site code, looks up domain internally"
```

---

## Task 5: content.js — result.site 改为 code

**Files:**
- Modify: `renderer/content.js`

**Interfaces:**
- Produces: `result.site` = code（如 `CA`）；通过 `window.__SITE_CODE__` 接收注入值

content.js 运行在 BrowserWindow 页面上下文里，无法直接访问 Node.js 模块。tab-manager 在 `executeJavaScript` 调用前注入 site code：

- [ ] **Step 1: tab-manager.js 注入 __SITE_CODE__ 到页面上下文**

找到 `injectAndScrape(win, asin, config)` 函数，在 `const fullScript = `` 之前加：

```js
// 注入 site code，供 content.js 使用
await win.webContents.executeJavaScript(`window.__SITE_CODE__ = ${JSON.stringify(config._siteCode || '')}`);
```

在 `openTabForTask` 中，调用 `injectAndScrape` 时传入 `_siteCode`：

找到：
```js
const result = await injectAndScrape(win, asin, config);
```

在调用之前确保 config 有 `_siteCode`，修改 `openTabForTask`：

```js
async function openTabForTask(task, config) {
  const { asin, site } = task; // site is now code
  const configWithCode = { ...config, _siteCode: site };
  // ...
  const result = await injectAndScrape(win, asin, configWithCode);
```

- [ ] **Step 2: content.js 修改 getSite() 返回 code**

找到 `function getSite()` 和 `result.site = hostname`：

```js
function getSite() {
  return window.location.hostname;
}
```

替换为：

```js
function getSite() {
  // 优先使用注入的 site code，fallback 到 hostname（兼容直接调用场景）
  return window.__SITE_CODE__ || window.location.hostname;
}
```

`result.site = hostname` 已经通过 `getSite()` 赋值，这里 hostname 变量名保持不变（它现在存的是 code 或 hostname），功能正确。

- [ ] **Step 3: Commit**

```bash
git add electron/tab-manager.js renderer/content.js
git commit -m "feat: inject site code into page context, result.site returns code"
```

---

## Task 6: fullpage.js — 渲染层全面改用 code

**Files:**
- Modify: `renderer/fullpage.js`

**Interfaces:**
- Consumes: `allResults[].site` = code；`asinInputCache[].site` = code；`referenceData.rows[].site` = code
- Produces: 巡店面板下拉 value = code；`getSiteLabel(code)` 直接返回 code

- [ ] **Step 1: renderGroupCard 下拉 value 改为 code**

找到 `renderGroupCard(site, asins)` 函数中的 options 构建：

```js
const options = enabledSites.map(s => {
  const val = `www.${s.domain}`;
  const disabled = usedSites.has(val) && val !== site ? 'disabled' : '';
  const selected = val === site ? 'selected' : '';
  return `<option value="${val}" ...>`;
});
```

替换为：

```js
const options = enabledSites.map(s => {
  const val = s.code;
  const disabled = usedSites.has(val) && val !== site ? 'disabled' : '';
  const selected = val === site ? 'selected' : '';
  return `<option value="${val}" ${selected} ${disabled}>${esc(s.country)} (${esc(s.domain)})</option>`;
});
```

同时 `refreshAllGroupOptions()` 中的 options 构建做同样修改（`val = s.code`）。

`initSiteGroups()` 中默认 site 改为 code：

```js
// 旧：
enabledSites[0] ? `www.${enabledSites[0].domain}` : 'www.amazon.ca'
// 新：
enabledSites[0] ? enabledSites[0].code : 'CA'
```

同样 `btnAddGroup` 的 next site：
```js
// 旧：
renderGroupCard(`www.${next.domain}`, '');
// 新：
renderGroupCard(next.code, '');
```

`getUsedSites()` 改为收集 code：
```js
function getUsedSites() {
  return new Set(
    [...document.querySelectorAll('.site-group-select')].map(s => s.value)
  );
}
```
这个函数本身不变，因为 select.value 现在就是 code。

- [ ] **Step 2: getSiteLabel 直接返回 code**

找到 `function getSiteLabel(domain)` 函数，替换为：

```js
function getSiteLabel(siteCode) {
  if (!siteCode) return '';
  // 兼容旧格式域名（迁移期间可能存在）
  if (siteCode.includes('.')) {
    const found = sitesData.find(s => `www.${s.domain}` === siteCode || s.domain === siteCode);
    return found ? (found.code || siteCode) : siteCode;
  }
  return siteCode;
}
```

- [ ] **Step 3: findRef 改为直接 code 匹配**

找到 `function findRef(asin, site)` 函数，替换为：

```js
function findRef(asin, site) {
  if (!dom.enableRefCompare || !dom.enableRefCompare.checked) return null;
  const rows = referenceData && referenceData.rows ? referenceData.rows : [];
  return rows.find(r => r.asin === asin && (!r.site || r.site === site));
}
```

（移除之前的兼容 siteCode 查找，迁移后直接精确匹配）

- [ ] **Step 4: buildTasks 里 site 改为 code**

找到 `buildTasks()` 中读取 select value 的地方：

```js
function readGroupsFromDom() {
  return [...document.querySelectorAll('.site-group-card')].map(card => ({
    site: card.querySelector('.site-group-select').value,
    asins: card.querySelector('.site-group-textarea').value.trim(),
  }));
}
```

select value 现在已经是 code，无需修改。

`buildTasks()` 中的错误提示：

```js
const siteFound = enabledSites.find(s => `www.${s.domain}` === site);
const label = siteFound ? siteFound.country : site;
```

改为：

```js
const siteFound = enabledSites.find(s => s.code === site);
const label = siteFound ? siteFound.country : site;
```

同样的 siteFound 查找在 buildTasks 里出现两次，都改。

- [ ] **Step 5: autoFillAsinGroups 里 site 使用 code**

找到 `autoFillAsinGroups(rows)` 中：

```js
const found = sitesData.find(s => `www.${s.domain}` === g.site);
```

`g.site` 现在是 code（referenceData 迁移后），改为：

```js
const found = sitesData.find(s => s.code === g.site);
```

- [ ] **Step 6: syncEnabledSites 不需要改动**

```js
function syncEnabledSites() {
  enabledSites = sitesData.filter(s => s.enabled);
  refreshAllGroupOptions();
}
```

`enabledSites` 现在包含 `code` 字段，后续所有用 `s.code` 的地方自然正确。

- [ ] **Step 7: node --check 验证**

```bash
node --check renderer/fullpage.js
```

Expected: no output

- [ ] **Step 8: Commit**

```bash
git add renderer/fullpage.js
git commit -m "refactor: fullpage.js uses site code throughout - dropdowns, getSiteLabel, findRef, buildTasks"
```

---

## Task 7: 手动验证 + 存量数据清理

**Files:**
- 无代码修改，验证 + 必要时手动清理 userData

- [ ] **Step 1: 重启应用，验证迁移日志**

```bash
npm start
```

观察控制台：
- `[Store] 站点 code 迁移完成` — 存量数据已迁移
- `[Main] sites.json 补全 code 字段完成`（如有旧 sites.json）

- [ ] **Step 2: 验证巡店面板**

1. 站点分组下拉选项正常显示（CA/US/AU/MX）
2. 选择 CA 站点，输入 ASIN，开始巡店
3. 巡店结果 `result.site` 显示 `CA`（站点列）
4. 日志显示 `抓取: ASIN @ CA`

- [ ] **Step 3: 验证参考数据对比**

1. 导入参考数据（含站点列 `CA`/`US`）
2. 勾选「启用对比」
3. 巡店结果行出现红/绿标色，确认对比正常

- [ ] **Step 4: 验证定时任务**

1. 配置 Cron 为 1 分钟后触发
2. 确认触发后任务 site 为 code（日志可见）

- [ ] **Step 5: Commit（如有手动修复）**

```bash
git add -A
git commit -m "fix: post-migration manual fixes"
```
