# Store 重构 + 巡店面板重设计 + 邮编管理页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 store.json 拆分为 5 个文件、删除 patrolConfig、重设计巡店面板为站点分组卡片、新增邮编管理页。

**Architecture:** store.js 对外接口不变，内部按 FILE_MAP 路由到 5 个独立 JSON 文件；巡店面板替换 ASIN 输入框+站点勾选为站点分组卡片，asinInputCache 改为数组结构；新增 sites.json 存储 20 站点配置，新增侧边栏「站点」Tab 管理邮编和启用状态。

**Tech Stack:** Electron 28, Node.js ≥16, Vanilla JS (no framework), electron-builder 24

## Global Constraints

- Node.js ≥ 16，不使用 fetch（用 https 模块替代）
- 渲染进程通过 `window.electronAPI` 访问存储，不直接 require
- 所有文件存储在 `app.getPath('userData')` 目录下
- 不引入新的 npm 依赖
- ASIN 格式：10 位大写字母数字 `/^[A-Z0-9]{10}$/`
- 站点域名格式：`amazon.xxx`（不含 `www.`前缀为简称，完整域名含 `www.`）

---

## 文件变更一览

| 文件 | 操作 | 说明 |
|------|------|------|
| `electron/store.js` | 修改 | 拆分为 5 文件路由，添加迁移逻辑 |
| `electron/sites-data.js` | 新建 | 20 站点内置常量 |
| `electron/ipc-handlers.js` | 修改 | 删除 patrolConfig 读写，改读 patrolSettings；getSiteLabel 扩展为 20 站点；读 sites.json 传 deliveryZips 给 tab-manager |
| `electron/tab-manager.js` | 修改 | SITE_URLS/SITE_LANG 改为动态从参数读取，支持任意站点域名 |
| `electron/main.js` | 修改 | onCronTrigger 改读 patrolSettings + asinInputCache（数组格式） |
| `renderer/fullpage.html` | 修改 | 巡店面板替换控制栏；新增「站点」Tab；删除设置面板邮编区块 |
| `renderer/fullpage.js` | 修改 | 站点分组卡片逻辑；参考数据导入新结构；邮编管理页逻辑；删除 patrolSettings 中 sites/deliveryZips |
| `renderer/fullpage.css` | 修改 | 站点分组卡片样式；邮编管理表格样式 |

---

## Task 1: store.js 拆分 + 迁移

**Files:**
- Modify: `electron/store.js`

**Interfaces:**
- Produces: `store.get(key)`, `store.set(key, value)`, `store.remove(key)`, `store.getAll()` — 接口签名不变，行为不变

- [ ] **Step 1: 替换 store.js 全文**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_DIR = app.getPath('userData');

const FILE_MAP = {
  patrolSettings:   'settings.json',
  cronConfig:       'settings.json',
  appTheme:         'settings.json',
  openAtLogin:      'settings.json',
  patrolState:      'state.json',
  patrolResults:    'state.json',
  lastUpdate:       'state.json',
  asinInputCache:   'state.json',
  patrolHistory:    'history.json',
  historySnapshots: 'history.json',
  referenceData:    'reference.json',
  sites:            'sites.json',
};

// 每个文件独立内存缓存
const _caches = {};

function filePath(fileName) {
  return path.join(DATA_DIR, fileName);
}

function loadFile(fileName) {
  if (_caches[fileName]) return _caches[fileName];
  try {
    const fp = filePath(fileName);
    if (fs.existsSync(fp)) {
      _caches[fileName] = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } else {
      _caches[fileName] = {};
    }
  } catch (e) {
    _caches[fileName] = {};
  }
  return _caches[fileName];
}

function saveFile(fileName) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(filePath(fileName), JSON.stringify(_caches[fileName], null, 2), 'utf8');
  } catch (e) {
    console.error(`[Store] 写入 ${fileName} 失败:`, e.message);
  }
}

function get(key) {
  const fileName = FILE_MAP[key];
  if (!fileName) return undefined;
  return loadFile(fileName)[key];
}

function set(key, value) {
  const fileName = FILE_MAP[key];
  if (!fileName) { console.warn(`[Store] 未知 key: ${key}`); return; }
  loadFile(fileName)[key] = value;
  saveFile(fileName);
}

function remove(key) {
  const fileName = FILE_MAP[key];
  if (!fileName) return;
  const cache = loadFile(fileName);
  delete cache[key];
  saveFile(fileName);
}

function getAll() {
  const result = {};
  for (const key of Object.keys(FILE_MAP)) {
    const val = get(key);
    if (val !== undefined) result[key] = val;
  }
  return result;
}

// 首次启动时从旧 store.json 迁移数据
function migrate() {
  const oldPath = path.join(DATA_DIR, 'store.json');
  if (!fs.existsSync(oldPath)) return;
  try {
    const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
    for (const [key, fileName] of Object.entries(FILE_MAP)) {
      if (key in old && old[key] !== undefined) {
        loadFile(fileName)[key] = old[key];
        saveFile(fileName);
      }
    }
    // 旧 asinInputCache 是字符串，新格式是数组；无法还原站点信息，清空让用户重配
    const oldCache = old['asinInputCache'];
    if (typeof oldCache === 'string' && oldCache.trim()) {
      // 保留 ASIN 内容但丢弃站点，写入空数组并打印提示
      console.warn('[Store] asinInputCache 格式已变更，请在巡店面板重新配置站点分组');
      loadFile('state.json')['asinInputCache'] = [];
      saveFile('state.json');
    }
    fs.renameSync(oldPath, oldPath + '.bak');
    console.log('[Store] 迁移完成，旧文件已备份为 store.json.bak');
  } catch (e) {
    console.error('[Store] 迁移失败:', e.message);
  }
}

module.exports = { get, set, remove, getAll, migrate };
```

- [ ] **Step 2: 在 main.js 启动时调用 migrate()**

找到 `electron/main.js` 中 `app.whenReady()` 的回调，在最顶部调用：

```js
const store = require('./store');
store.migrate(); // 放在 app.whenReady 回调的第一行
```

- [ ] **Step 3: 手动测试迁移**

```bash
# 在 userData 目录手动创建一个旧格式 store.json 来测试
# Windows: %APPDATA%\amazon-patrol\store.json
# Mac: ~/Library/Application Support/amazon-patrol/store.json
# 内容示例：
# {"patrolSettings":{"concurrency":3},"appTheme":"dark","asinInputCache":"B08XYZ1234"}
npm start
# 预期：控制台输出 "[Store] 迁移完成"，userData 目录出现 settings.json / state.json，store.json.bak 存在
```

- [ ] **Step 4: Commit**

```bash
git add electron/store.js electron/main.js
git commit -m "refactor: split store.json into 5 files with migration"
```

---

## Task 2: sites-data.js 内置站点常量 + sites.json 初始化

**Files:**
- Create: `electron/sites-data.js`
- Modify: `electron/ipc-handlers.js`（新增 GET_SITES / SAVE_SITES IPC handler）
- Modify: `electron/main.js`（首次启动时初始化 sites.json）

**Interfaces:**
- Produces:
  - `BUILTIN_SITES`: `Array<{domain, region, country, zipLabel, zipExample, zipFormat}>`
  - `initSites()`: void — 若 sites.json 不存在则从内置数据生成默认值写入
  - IPC `GET_SITES` → `Array<SiteConfig>`
  - IPC `SAVE_SITES` (sites: Array<SiteConfig>) → `{success: true}`
  - `SiteConfig`: `{domain, region, country, zipLabel, zipExample, zipFormat, zip, enabled}`

- [ ] **Step 1: 新建 electron/sites-data.js**

```js
'use strict';

const BUILTIN_SITES = [
  { domain: 'amazon.com',    region: '北美', country: '美国',       zipLabel: 'ZIP Code',         zipExample: '10001',    zipFormat: '5位数字' },
  { domain: 'amazon.ca',     region: '北美', country: '加拿大',     zipLabel: 'Postal Code',      zipExample: 'K1A 0B1',  zipFormat: '字母数字混合 (A1A 1A1)' },
  { domain: 'amazon.co.uk',  region: '欧洲', country: '英国',       zipLabel: 'Postcode',         zipExample: 'SW1A 1AA', zipFormat: '字母数字混合' },
  { domain: 'amazon.de',     region: '欧洲', country: '德国',       zipLabel: 'Postleitzahl',     zipExample: '10115',    zipFormat: '5位数字' },
  { domain: 'amazon.fr',     region: '欧洲', country: '法国',       zipLabel: 'Code Postal',      zipExample: '75008',    zipFormat: '5位数字' },
  { domain: 'amazon.it',     region: '欧洲', country: '意大利',     zipLabel: 'CAP',              zipExample: '00100',    zipFormat: '5位数字' },
  { domain: 'amazon.es',     region: '欧洲', country: '西班牙',     zipLabel: 'Código Postal',    zipExample: '28001',    zipFormat: '5位数字' },
  { domain: 'amazon.nl',     region: '欧洲', country: '荷兰',       zipLabel: 'Postcode',         zipExample: '1012 AB',  zipFormat: '4位数字+2字母' },
  { domain: 'amazon.se',     region: '欧洲', country: '瑞典',       zipLabel: 'Postnummer',       zipExample: '111 22',   zipFormat: '5位数字' },
  { domain: 'amazon.pl',     region: '欧洲', country: '波兰',       zipLabel: 'Kod Pocztowy',     zipExample: '00-001',   zipFormat: '5位数字' },
  { domain: 'amazon.com.be', region: '欧洲', country: '比利时',     zipLabel: 'Code Postal',      zipExample: '1000',     zipFormat: '4位数字' },
  { domain: 'amazon.co.jp',  region: '亚太', country: '日本',       zipLabel: '郵便番号',          zipExample: '100-0001', zipFormat: '7位数字' },
  { domain: 'amazon.com.au', region: '亚太', country: '澳大利亚',   zipLabel: 'Postcode',         zipExample: '2000',     zipFormat: '4位数字' },
  { domain: 'amazon.in',     region: '亚太', country: '印度',       zipLabel: 'PIN Code',         zipExample: '110001',   zipFormat: '6位数字' },
  { domain: 'amazon.sg',     region: '亚太', country: '新加坡',     zipLabel: 'Postal Code',      zipExample: '238859',   zipFormat: '6位数字' },
  { domain: 'amazon.com.mx', region: '拉美', country: '墨西哥',     zipLabel: 'Código Postal',    zipExample: '01000',    zipFormat: '5位数字' },
  { domain: 'amazon.com.br', region: '拉美', country: '巴西',       zipLabel: 'CEP',              zipExample: '01001-000',zipFormat: '8位数字' },
  { domain: 'amazon.ae',     region: '中东', country: '阿联酋',     zipLabel: 'Postal Code',      zipExample: '00000',    zipFormat: '5位数字(可选)' },
  { domain: 'amazon.sa',     region: '中东', country: '沙特阿拉伯', zipLabel: 'Postal Code',      zipExample: '11564',    zipFormat: '5位数字' },
  { domain: 'amazon.com.tr', region: '中东', country: '土耳其',     zipLabel: 'Posta Kodu',       zipExample: '34400',    zipFormat: '5位数字' },
];

// 默认启用的站点
const DEFAULT_ENABLED = new Set([
  'amazon.com', 'amazon.ca', 'amazon.com.au', 'amazon.com.mx'
]);

function buildDefaultSites() {
  return BUILTIN_SITES.map(s => ({
    ...s,
    zip: s.zipExample,
    enabled: DEFAULT_ENABLED.has(s.domain),
  }));
}

module.exports = { BUILTIN_SITES, buildDefaultSites };
```

- [ ] **Step 2: 在 main.js 添加 initSites() 调用**

在 `store.migrate()` 之后添加：

```js
const { buildDefaultSites } = require('./sites-data');

function initSites() {
  if (!store.get('sites')) {
    store.set('sites', buildDefaultSites());
    console.log('[Main] sites.json 初始化完成');
  }
}

// app.whenReady 回调中，migrate() 之后调用
initSites();
```

- [ ] **Step 3: 在 ipc-handlers.js 注册 GET_SITES / SAVE_SITES**

在 `register()` 函数的 IPC 注册区块中添加：

```js
ipcMain.handle('GET_SITES', () => {
  return store.get('sites') || require('./sites-data').buildDefaultSites();
});

ipcMain.handle('SAVE_SITES', (e, sites) => {
  store.set('sites', sites);
  return { success: true };
});
```

- [ ] **Step 4: 在 preload.js 暴露新 IPC**

找到 `electron/preload.js`，在 `contextBridge.exposeInMainWorld` 的 API 对象中追加：

```js
getSites: () => ipcRenderer.invoke('GET_SITES'),
saveSites: (sites) => ipcRenderer.invoke('SAVE_SITES', sites),
```

- [ ] **Step 5: 手动验证**

```bash
npm start
# 预期：userData 目录出现 sites.json，包含 20 个站点，amazon.com/ca/au/mx enabled=true，其余 false
```

- [ ] **Step 6: Commit**

```bash
git add electron/sites-data.js electron/ipc-handlers.js electron/main.js electron/preload.js
git commit -m "feat: add sites-data.js with 20 builtin sites, init sites.json on startup"
```

---

## Task 3: 邮编管理页 UI

**Files:**
- Modify: `renderer/fullpage.html`（新增「站点」Tab；删除设置面板邮编区块）
- Modify: `renderer/fullpage.js`（邮编管理页逻辑）
- Modify: `renderer/fullpage.css`（邮编管理表格样式）

**Interfaces:**
- Consumes: `window.electronAPI.getSites()`, `window.electronAPI.saveSites(sites)`
- Produces: 侧边栏新增「站点」Tab，表格展示 20 站点，启用开关实时保存，邮编编辑后点「保存」写入

- [ ] **Step 1: 在 fullpage.html 侧边栏添加「站点」Tab 按钮**

在 `<button class="side-tab" data-tab="settings">` 之前插入：

```html
<button class="side-tab" data-tab="sites">
  <span class="side-tab-icon">🌐</span>
  <span>站点</span>
</button>
```

- [ ] **Step 2: 在 fullpage.html 添加站点 Tab 面板**

在 `<div class="tab-panel scrollable" id="tab-settings">` 之前插入：

```html
<!-- ====== Tab: 站点管理 ====== -->
<div class="tab-panel scrollable" id="tab-sites">
  <section class="card">
    <div class="card-header">
      <span class="card-title">站点管理</span>
      <span class="card-hint">启用的站点将出现在巡店面板的站点选择中</span>
    </div>
    <div class="sites-toolbar">
      <button id="btnResetZips" class="btn btn-outline">恢复默认邮编</button>
      <button id="btnSaveSites" class="btn btn-primary">保存</button>
    </div>
    <div class="table-container">
      <div class="table-scroll">
        <table class="sites-table">
          <thead>
            <tr>
              <th>启用</th>
              <th>地区</th>
              <th>国家</th>
              <th>站点域名</th>
              <th>邮编</th>
              <th>格式说明</th>
            </tr>
          </thead>
          <tbody id="sitesTableBody"></tbody>
        </table>
      </div>
    </div>
  </section>
</div>
```

- [ ] **Step 3: 删除设置面板中的邮编区块**

在 `fullpage.html` 中找到并删除整个「配送地设置」section（含 zipUS/zipCA/zipAU/zipMX 四个输入框的 card），替换为一行引导文字：

```html
<section class="card">
  <div class="card-header"><span class="card-title">配送地设置</span></div>
  <p class="setting-hint" style="padding:8px 0">请前往「站点」Tab 管理各站点邮编。</p>
</section>
```

- [ ] **Step 4: 在 fullpage.css 添加站点表格样式**

在文件末尾追加：

```css
/* ===== 站点管理页 ===== */
.sites-toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px; }
.sites-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.sites-table th { background: var(--bg-card); color: var(--text-muted); font-weight: 500; padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); }
.sites-table td { padding: 7px 10px; border-bottom: 1px solid var(--border-light, rgba(255,255,255,0.05)); vertical-align: middle; }
.sites-table tr:hover td { background: var(--bg-hover, rgba(255,255,255,0.03)); }
.sites-table .zip-input { width: 120px; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-primary); border-radius: 4px; padding: 4px 8px; font-size: 12px; font-family: var(--font-mono); }
.sites-table .zip-input:focus { outline: none; border-color: var(--accent); }
.zip-format-hint { font-size: 11px; color: var(--text-muted); }
```

- [ ] **Step 5: 在 fullpage.js 添加邮编管理页逻辑**

在文件合适位置（settings 相关逻辑附近）添加：

```js
// ========== 站点管理页 ==========
let sitesData = [];

const sitesDom = {
  tableBody: () => document.getElementById('sitesTableBody'),
  btnSave:   () => document.getElementById('btnSaveSites'),
  btnReset:  () => document.getElementById('btnResetZips'),
};

async function initSitesTab() {
  sitesData = await window.electronAPI.getSites();
  renderSitesTable();
  sitesDom.btnSave().addEventListener('click', saveSites);
  sitesDom.btnReset().addEventListener('click', resetZips);
}

function renderSitesTable() {
  sitesDom.tableBody().innerHTML = sitesData.map((s, i) => `
    <tr>
      <td>
        <label class="cron-toggle-wrap" title="${s.enabled ? '点击禁用' : '点击启用'}">
          <input type="checkbox" class="site-enable-chk" data-index="${i}" ${s.enabled ? 'checked' : ''}>
          <span class="cron-toggle-slider"></span>
        </label>
      </td>
      <td>${esc(s.region)}</td>
      <td>${esc(s.country)}</td>
      <td><code style="font-size:12px">${esc(s.domain)}</code></td>
      <td><input type="text" class="zip-input" data-index="${i}" value="${esc(s.zip || '')}" placeholder="${esc(s.zipExample)}"></td>
      <td><span class="zip-format-hint">${esc(s.zipFormat)}</span></td>
    </tr>
  `).join('');

  // 启用开关实时保存
  sitesDom.tableBody().querySelectorAll('.site-enable-chk').forEach(chk => {
    chk.addEventListener('change', async () => {
      const idx = parseInt(chk.dataset.index);
      sitesData[idx].enabled = chk.checked;
      await window.electronAPI.saveSites(sitesData);
    });
  });
}

async function saveSites() {
  // 从输入框读取最新邮编值
  sitesDom.tableBody().querySelectorAll('.zip-input').forEach(input => {
    const idx = parseInt(input.dataset.index);
    sitesData[idx].zip = input.value.trim();
  });
  await window.electronAPI.saveSites(sitesData);
  const btn = sitesDom.btnSave();
  btn.textContent = '已保存 ✓';
  setTimeout(() => { btn.textContent = '保存'; }, 2000);
}

async function resetZips() {
  if (!confirm('将所有邮编恢复为默认示例值？')) return;
  sitesData = sitesData.map(s => ({ ...s, zip: s.zipExample }));
  await window.electronAPI.saveSites(sitesData);
  renderSitesTable();
}
```

- [ ] **Step 6: 在页面初始化入口调用 initSitesTab()**

找到页面主初始化函数（`async function init()` 或 `window.addEventListener('DOMContentLoaded', ...)`），在其中追加：

```js
await initSitesTab();
```

- [ ] **Step 7: 删除 fullpage.js 中 settings 相关的 zipUS/zipCA/zipAU/zipMX 逻辑**

在 `getSettings()` 中删除 `deliveryZips` 字段：

```js
// 删除这段：
deliveryZips: {
  'www.amazon.com':    dom.zipUS ? dom.zipUS.value.trim() : '',
  'www.amazon.ca':     dom.zipCA ? dom.zipCA.value.trim() : '',
  'www.amazon.com.au': dom.zipAU ? dom.zipAU.value.trim() : '',
  'www.amazon.com.mx': dom.zipMX ? dom.zipMX.value.trim() : ''
}
```

在 `loadSettings()` 中删除 deliveryZips 相关的 DOM 恢复代码（zipUS/zipCA/zipAU/zipMX 的赋值行）。

删除 settings 初始化时对这四个 input 的 `addEventListener('input', saveSettings)` 调用（`dom.zipUS`, `dom.zipCA`, `dom.zipAU`, `dom.zipMX`）。

- [ ] **Step 8: 手动验证**

```bash
npm start
# 预期：
# 1. 侧边栏出现「站点」Tab
# 2. 点击后展示 20 行站点表格，前 4 行（US/CA/AU/MX）开关为启用状态
# 3. 拨动开关后立即保存（无需点「保存」），sites.json 中对应 enabled 值变化
# 4. 修改邮编后点「保存」写入，点「恢复默认邮编」重置
# 5. 设置面板「配送地设置」区域显示引导文字，无 4 个输入框
```

- [ ] **Step 9: Commit**

```bash
git add renderer/fullpage.html renderer/fullpage.js renderer/fullpage.css
git commit -m "feat: add sites management tab with 20 sites, zip editing and enable toggle"
```

---

## Task 4: ipc-handlers 和 tab-manager 使用 sites.json

**Files:**
- Modify: `electron/ipc-handlers.js`
- Modify: `electron/tab-manager.js`
- Modify: `electron/main.js`

**Interfaces:**
- Consumes: `store.get('sites')` → `Array<SiteConfig>`
- Produces:
  - `tab-manager.openTabForTask(task, config)` — config.deliveryZips 由主进程从 sites.json 构建后传入（结构不变）
  - `getSiteLabel(domain)` — 支持全部 20 个站点，返回对应 country 字段或域名
  - 删除 `patrolConfig` 所有读写

- [ ] **Step 1: ipc-handlers.js 删除 patrolConfig 写入**

在 `START_PATROL` handler 中，删除这一行：

```js
store.set('patrolConfig', config);  // 删除
```

- [ ] **Step 2: ipc-handlers.js 修改 getDefaultConfig()**

```js
function getDefaultConfig() {
  return {
    concurrency: 2, pageInterval: 4000, intervalJitter: 2000,
    batchSize: 20, batchRest: 30000, scrapeTimeout: 25000,
    maxRetries: 3, retryDelay: 2000,
    dingtalkWebhook: '',
  };
}
```

- [ ] **Step 3: ipc-handlers.js 修改 RETRY_FAILED 读取来源**

将：
```js
const config = store.get('patrolConfig') || getDefaultConfig();
```
改为：
```js
const settings = store.get('patrolSettings') || getDefaultConfig();
const sites = store.get('sites') || [];
const deliveryZips = buildDeliveryZips(sites);
const config = { ...settings, deliveryZips };
```

- [ ] **Step 4: ipc-handlers.js 修改钉钉推送读取来源**

将：
```js
const patrolConfig = store.get('patrolConfig');
if (patrolConfig && patrolConfig.dingtalkWebhook) {
  if (references.length > 0) sendDingTalk(summary, patrolConfig.dingtalkWebhook);
}
```
改为：
```js
const patrolSettings = store.get('patrolSettings');
if (patrolSettings && patrolSettings.dingtalkWebhook) {
  if (references.length > 0) sendDingTalk(summary, patrolSettings.dingtalkWebhook);
}
```

- [ ] **Step 5: ipc-handlers.js 添加 buildDeliveryZips 工具函数**

在文件顶部工具函数区域添加：

```js
function buildDeliveryZips(sites) {
  const zips = {};
  for (const s of sites) {
    if (s.enabled && s.zip) {
      zips[`www.${s.domain}`] = s.zip;
    }
  }
  return zips;
}
```

- [ ] **Step 6: ipc-handlers.js 修改 START_PATROL 注入 deliveryZips**

在 `START_PATROL` handler 中，config 来自渲染进程 payload，需在主进程合并最新 deliveryZips：

```js
ipcMain.handle('START_PATROL', async (e, payload) => {
  const { tasks, config: rendererConfig, totalCount, keepExisting } = payload;
  if (activePatrol) return { error: '巡店正在进行中' };
  if (!keepExisting) completedResults = [];
  // 从 sites.json 实时读取邮编，不依赖渲染进程传入
  const sites = store.get('sites') || [];
  const config = { ...rendererConfig, deliveryZips: buildDeliveryZips(sites) };
  activePatrol = { tasks: [...tasks], config, errors: [], keepExisting, totalCount };
  // ... 其余不变
```

- [ ] **Step 7: ipc-handlers.js 扩展 getSiteLabel() 支持 20 站点**

```js
function getSiteLabel(domain) {
  const sites = store.get('sites') || [];
  const found = sites.find(s => `www.${s.domain}` === domain || s.domain === domain);
  if (found) return found.country;
  // 降级：从域名提取简称
  const m = domain.match(/amazon\.(.+)$/);
  return m ? m[1].toUpperCase() : domain;
}
```

- [ ] **Step 8: tab-manager.js 移除硬编码的 SITE_URLS 和 SITE_LANG**

原来 `SITE_URLS` 和 `SITE_LANG` 只支持 4 个站点，现改为动态构建。

删除：
```js
const SITE_URLS = { ... };
const SITE_LANG = { ... };
```

添加：
```js
const SITE_LANG_MAP = {
  'amazon.com':    'en_US',
  'amazon.ca':     'en_CA',
  'amazon.co.uk':  'en_GB',
  'amazon.de':     'de_DE',
  'amazon.fr':     'fr_FR',
  'amazon.it':     'it_IT',
  'amazon.es':     'es_ES',
  'amazon.nl':     'nl_NL',
  'amazon.se':     'sv_SE',
  'amazon.pl':     'pl_PL',
  'amazon.com.be': 'fr_BE',
  'amazon.co.jp':  'ja_JP',
  'amazon.com.au': 'en_AU',
  'amazon.in':     'en_IN',
  'amazon.sg':     'en_SG',
  'amazon.com.mx': 'es_MX',
  'amazon.com.br': 'pt_BR',
  'amazon.ae':     'en_AE',
  'amazon.sa':     'ar_SA',
  'amazon.com.tr': 'tr_TR',
};

function getSiteUrl(site) {
  return `https://${site}`;
}

function getSiteLang(site) {
  // site 是完整域名如 www.amazon.ca，提取 amazon.ca 查表
  const key = site.replace(/^www\./, '');
  return SITE_LANG_MAP[key] || 'en_US';
}
```

修改 `buildProductUrl`：

```js
function buildProductUrl(site, asin) {
  const base = getSiteUrl(site);
  const lang = getSiteLang(site);
  return `${base}/dp/${asin}?language=${lang}`;
}
```

修改 `initDeliveryZip` 中的 loadURL：

```js
await win.loadURL(siteUrl + `?language=${getSiteLang(site)}`);
```

- [ ] **Step 9: main.js 修改 onCronTrigger 删除 patrolConfig 读取**

```js
function onCronTrigger() {
  const rawCache = store.get('asinInputCache') || [];
  const settings = store.get('patrolSettings') || {};
  const sites = store.get('sites') || [];
  const deliveryZips = buildDeliveryZipsForCron(sites);

  // asinInputCache 现为数组格式 [{site, asins}]
  const tasks = [];
  let idx = 0;
  for (const group of rawCache) {
    if (!group.site || !group.asins) continue;
    const asins = [...new Set(
      group.asins.split(/[\n,，]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]{10}$/.test(s))
    )];
    for (const asin of asins) {
      tasks.push({ asin, site: group.site, index: idx++ });
    }
  }

  if (!tasks.length) {
    console.log('[Main] Cron 触发但无有效任务，跳过');
    return;
  }

  const config = { ...settings, deliveryZips };
  console.log(`[Main] Cron 触发巡店，${tasks.length} 个任务`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('CRON_AUTO_START', { tasks, config });
  }
}

function buildDeliveryZipsForCron(sites) {
  const zips = {};
  for (const s of sites) {
    if (s.enabled && s.zip) zips[`www.${s.domain}`] = s.zip;
  }
  return zips;
}
```

- [ ] **Step 10: 手动验证**

```bash
npm start
# 验证：
# 1. 开始一次手动巡店，控制台无 patrolConfig 相关写入
# 2. 修改站点邮编后（在站点Tab），重新巡店，日志显示新邮编生效
# 3. 定时触发（临时改为 */1 * * * * 测试）能正确读取 asinInputCache 并开始巡店
```

- [ ] **Step 11: Commit**

```bash
git add electron/ipc-handlers.js electron/tab-manager.js electron/main.js
git commit -m "refactor: remove patrolConfig, read settings+sites.json for all execution paths"
```

---

## Task 5: 巡店面板重设计（站点分组卡片）

**Files:**
- Modify: `renderer/fullpage.html`
- Modify: `renderer/fullpage.js`
- Modify: `renderer/fullpage.css`

**Interfaces:**
- Consumes: `window.electronAPI.getSites()` → `Array<SiteConfig>`（取 `enabled: true` 的站点）
- Produces:
  - `asinInputCache` 写入格式：`Array<{site: string, asins: string}>`
  - `buildTasks()` → `{tasks: Array<{asin, site, index}>, totalCount: number}` 或 null（含校验错误提示）

- [ ] **Step 1: fullpage.html 替换巡店面板控制栏**

找到 `<section class="control-bar">` 整个 section（含 asinInput textarea 和 site-tags div），替换为：

```html
<section class="control-bar">
  <div class="site-groups" id="siteGroups"></div>
  <button id="btnAddGroup" class="btn btn-outline btn-add-group">＋ 新增站点</button>
  <div class="control-right">
    <button id="btnStart" class="btn btn-primary btn-lg">
      <span>▶</span> 开始巡店
    </button>
    <button id="btnStop" class="btn btn-danger btn-lg" disabled>
      <span>■</span> 停止
    </button>
    <button id="btnRetry" class="btn btn-warning btn-lg" disabled>
      <span>↻</span> 重试失败项
    </button>
  </div>
</section>
```

- [ ] **Step 2: fullpage.css 添加站点分组卡片样式**

在文件末尾追加：

```css
/* ===== 站点分组卡片 ===== */
.site-groups { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.site-group-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.site-group-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.site-group-select { background: var(--bg-input); border: 1px solid var(--border); color: var(--text-primary); border-radius: 4px; padding: 4px 8px; font-size: 13px; cursor: pointer; }
.site-group-select:focus { outline: none; border-color: var(--accent); }
.site-group-delete { margin-left: auto; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; }
.site-group-delete:hover { background: var(--bg-hover, rgba(255,0,0,0.1)); color: var(--danger, #ff4d4f); }
.site-group-delete:disabled { opacity: 0.3; cursor: not-allowed; }
.site-group-textarea { width: 100%; min-height: 72px; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-primary); border-radius: 4px; padding: 6px 8px; font-size: 12px; font-family: var(--font-mono); resize: vertical; box-sizing: border-box; }
.site-group-textarea:focus { outline: none; border-color: var(--accent); }
.site-group-textarea.error { border-color: var(--danger, #ff4d4f); }
.btn-add-group { width: 100%; margin-bottom: 8px; }
```

- [ ] **Step 3: fullpage.js 添加站点分组卡片逻辑**

替换原有的 `asinInput` / `siteCheckboxes` 相关逻辑，添加以下代码：

```js
// ========== 站点分组卡片 ==========
let enabledSites = []; // [{domain, country, ...}] — 从 sites.json 读取 enabled=true 的站点

async function initSiteGroups() {
  const allSites = await window.electronAPI.getSites();
  enabledSites = allSites.filter(s => s.enabled);

  const cached = await window.electronAPI.storage.get('asinInputCache');
  const groups = Array.isArray(cached) && cached.length
    ? cached
    : [{ site: enabledSites[0] ? `www.${enabledSites[0].domain}` : 'www.amazon.ca', asins: '' }];

  const container = document.getElementById('siteGroups');
  container.innerHTML = '';
  for (const g of groups) renderGroupCard(g.site, g.asins);

  document.getElementById('btnAddGroup').addEventListener('click', () => {
    const usedSites = getUsedSites();
    const next = enabledSites.find(s => !usedSites.has(`www.${s.domain}`));
    if (!next) { alert('所有已启用站点均已添加'); return; }
    renderGroupCard(`www.${next.domain}`, '');
    saveGroupsToCache();
  });
}

function getUsedSites() {
  return new Set(
    [...document.querySelectorAll('.site-group-select')].map(s => s.value)
  );
}

function renderGroupCard(site, asins) {
  const container = document.getElementById('siteGroups');
  const card = document.createElement('div');
  card.className = 'site-group-card';

  const usedSites = getUsedSites();
  const options = enabledSites.map(s => {
    const val = `www.${s.domain}`;
    const disabled = usedSites.has(val) && val !== site ? 'disabled' : '';
    const selected = val === site ? 'selected' : '';
    return `<option value="${val}" ${selected} ${disabled}>${s.country} (${s.domain})</option>`;
  }).join('');

  card.innerHTML = `
    <div class="site-group-header">
      <select class="site-group-select">${options}</select>
      <button class="site-group-delete" title="删除此站点">✕</button>
    </div>
    <textarea class="site-group-textarea" placeholder="每行一个ASIN&#10;B08XYZ1234&#10;B09ABC5678">${esc(asins)}</textarea>
  `;

  const select = card.querySelector('.site-group-select');
  const textarea = card.querySelector('.site-group-textarea');
  const deleteBtn = card.querySelector('.site-group-delete');

  select.addEventListener('change', () => {
    refreshAllGroupOptions();
    saveGroupsToCache();
  });
  textarea.addEventListener('input', () => saveGroupsToCache());
  deleteBtn.addEventListener('click', () => {
    if (document.querySelectorAll('.site-group-card').length <= 1) return;
    card.remove();
    refreshAllGroupOptions();
    saveGroupsToCache();
  });

  container.appendChild(card);
  updateDeleteButtons();
}

function refreshAllGroupOptions() {
  const usedSites = getUsedSites();
  document.querySelectorAll('.site-group-select').forEach(select => {
    const currentVal = select.value;
    select.innerHTML = enabledSites.map(s => {
      const val = `www.${s.domain}`;
      const disabled = usedSites.has(val) && val !== currentVal ? 'disabled' : '';
      const selected = val === currentVal ? 'selected' : '';
      return `<option value="${val}" ${selected} ${disabled}>${s.country} (${s.domain})</option>`;
    }).join('');
  });
  updateDeleteButtons();
}

function updateDeleteButtons() {
  const cards = document.querySelectorAll('.site-group-card');
  cards.forEach(card => {
    card.querySelector('.site-group-delete').disabled = cards.length <= 1;
  });
}

function saveGroupsToCache() {
  const groups = [...document.querySelectorAll('.site-group-card')].map(card => ({
    site: card.querySelector('.site-group-select').value,
    asins: card.querySelector('.site-group-textarea').value,
  }));
  window.electronAPI.storage.set('asinInputCache', groups).catch(() => {});
}

function readGroupsFromDom() {
  return [...document.querySelectorAll('.site-group-card')].map(card => ({
    site: card.querySelector('.site-group-select').value,
    asins: card.querySelector('.site-group-textarea').value.trim(),
  }));
}
```

- [ ] **Step 4: fullpage.js 重写 buildTasks()**

```js
function buildTasks() {
  const groups = readGroupsFromDom();
  const tasks = [];
  let idx = 0;

  for (const group of groups) {
    const { site, asins } = group;
    if (!asins) {
      const siteFound = enabledSites.find(s => `www.${s.domain}` === site);
      const label = siteFound ? siteFound.country : site;
      alert(`[${label}] 站点 ASIN 不能为空`);
      return null;
    }
    const asinList = [...new Set(
      asins.split(/[\n,，]+/).map(a => a.trim().toUpperCase()).filter(a => a)
    )];
    const invalid = asinList.filter(a => !/^[A-Z0-9]{10}$/.test(a));
    if (invalid.length) {
      const siteFound = enabledSites.find(s => `www.${s.domain}` === site);
      const label = siteFound ? siteFound.country : site;
      alert(`[${label}] 包含无效 ASIN：${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`);
      return null;
    }
    if (asinList.length > 100) {
      alert(`单站点最多100个ASIN，当前${asinList.length}个`);
      return null;
    }
    for (const asin of asinList) {
      tasks.push({ asin, site, index: idx++ });
    }
  }

  if (!tasks.length) { alert('请输入有效ASIN'); return null; }
  return { tasks, totalCount: tasks.length };
}
```

- [ ] **Step 5: fullpage.js 删除旧的 parseAsins / getSelectedSites 函数**

删除以下函数（已被 buildTasks 内联替代）：
- `function parseAsins()`
- `function getSelectedSites()`

删除 dom 对象中对应的 `asinInput` 和 `siteCheckboxes` 引用（若存在）。

- [ ] **Step 6: fullpage.js 修改 startPatrol() 适配新 buildTasks 返回值**

原来 `buildTasks()` 返回 `{ tasks, asinCount, siteCount }`，新返回 `{ tasks, totalCount }`。修改 `startPatrol()` 中相关引用：

```js
async function startPatrol() {
  const td = buildTasks();
  if (!td) return;

  const config = getSettings();
  // ... 其余逻辑中将 td.asinCount / td.siteCount 的显示文案改为：
  const msg = isContinue
    ? `继续巡店: 剩余 ${remainingTasks.length} 个未完成任务 (共 ${td.totalCount})`
    : `共 ${td.totalCount} 个任务\n并发:${config.concurrency} | 间隔:${config.pageInterval/1000}秒\n确认开始？`;
```

- [ ] **Step 7: fullpage.js 修改 CRON_AUTO_START handler**

```js
case 'CRON_AUTO_START': {
  (async () => {
    const { tasks, config } = msg;
    allResults = [];
    const res = await window.electronAPI.sendMessage('START_PATROL', {
      tasks, config, totalCount: tasks.length, keepExisting: false
    });
    if (res && res.success) {
      patrolRunning = true;
      updateUiRunning(tasks.length, 0);
      startTimer();
    }
  })();
  break;
}
```

（此处逻辑本身不变，确认 totalCount 使用 tasks.length 即可。）

- [ ] **Step 8: 在主初始化函数中调用 initSiteGroups()**

```js
await initSiteGroups();
```

- [ ] **Step 9: 手动验证**

```bash
npm start
# 验证：
# 1. 巡店面板显示一个站点分组卡片（默认第一个启用站点）
# 2. 点「新增站点」追加新卡片，已选站点在其他卡片下拉中置灰
# 3. 只剩一个卡片时删除按钮置灰
# 4. 输入 ASIN 后开始巡店，任务数 = 分组1 ASIN 数 + 分组2 ASIN 数（非笛卡尔积）
# 5. 某分组 ASIN 为空时点「开始巡店」弹出正确错误提示
# 6. 输入格式不对的 ASIN 时弹出正确错误提示
```

- [ ] **Step 10: Commit**

```bash
git add renderer/fullpage.html renderer/fullpage.js renderer/fullpage.css
git commit -m "feat: replace asin+site checkboxes with site-group cards, precise ASIN-site binding"
```

---

## Task 6: 参考数据功能扩展（元信息 + 自动填 ASIN）

**Files:**
- Modify: `renderer/fullpage.js`
- Modify: `renderer/fullpage.html`（参考数据 Tab 顶部信息栏）

**Interfaces:**
- Consumes: `asinInputCache`（数组格式），`referenceData`（新结构 `{importedAt, fileName, rows}`）
- Produces:
  - `referenceData` 写入格式：`{ importedAt: string, fileName: string, rows: Array<RefRow> }`
  - Excel 必须含 `ASIN` 列和 `站点` 列，缺失时报错
  - 导入成功后自动按站点分组填入巡店面板

- [ ] **Step 1: fullpage.html 参考数据 Tab 顶部添加信息栏**

找到 `<div class="tab-panel scrollable" id="tab-import">` 内第一个 section 的 card-header 后，在上传区域之前插入：

```html
<div id="refImportInfo" class="ref-import-info" style="display:none">
  <span id="refInfoFileName" class="ref-info-filename"></span>
  <span class="ref-info-sep">|</span>
  <span id="refInfoTime" class="ref-info-time"></span>
  <span class="ref-info-sep">|</span>
  <span id="refInfoCount" class="ref-info-count"></span>
</div>
```

在 `fullpage.css` 末尾追加：

```css
/* ===== 参考数据导入信息栏 ===== */
.ref-import-info { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-input); border-radius: 6px; margin-bottom: 12px; font-size: 12px; color: var(--text-muted); }
.ref-info-filename { color: var(--text-primary); font-weight: 500; }
.ref-info-sep { opacity: 0.4; }
```

- [ ] **Step 2: fullpage.js 修改 processFile() 适配新结构**

```js
function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (typeof XLSX === 'undefined') { alert('Excel库加载中'); return; }
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rawRows.length === 0) { alert('没有数据'); return; }

      // 校验必须列
      const sample = rawRows[0];
      const hasAsin = 'ASIN' in sample || 'asin' in sample;
      const hasSite = '站点' in sample || 'Site' in sample || 'site' in sample;
      if (!hasAsin) { alert('导入失败：Excel 缺少 ASIN 列'); return; }
      if (!hasSite) { alert('导入失败：Excel 缺少 站点 列（列名：站点 或 Site）'); return; }

      const rows = rawRows.map(r => ({
        asin:               String(r['ASIN'] || r['asin'] || '').trim(),
        site:               String(r['站点'] || r['Site'] || r['site'] || '').trim(),
        aliasName:          String(r['常用名'] || r['Alias'] || r['alias'] || '').trim(),
        expectedPrice:      String(r['期望售价'] || r['Expected Price'] || r['expectedPrice'] || '').trim(),
        expectedListPrice:  String(r['期望划线价'] || r['Expected List Price'] || r['expectedListPrice'] || '').trim(),
        expectedDealBadge:  String(r['期望活动标'] || r['Expected Deal'] || r['expectedDeal'] || '').trim(),
        expectedAcBadge:    String(r['期望AC标'] || r['Expected AC'] || r['expectedAc'] || '').trim(),
        expectedCoupon:     String(r['期望Coupon'] || r['Expected Coupon'] || r['expectedCoupon'] || '').trim(),
        expectedRating:     String(r['期望星级'] || r['Expected Rating'] || r['expectedRating'] || '').trim(),
        expectedReviews:    String(r['期望评论数'] || r['Expected Reviews'] || r['expectedReviews'] || '').trim(),
        expectedSeller:     String(r['期望卖家'] || r['Expected Seller'] || r['expectedSeller'] || '').trim(),
        expectedStock:      String(r['期望库存'] || r['Expected Stock'] || r['expectedStock'] || '').trim(),
      })).filter(r => r.asin);

      // 将站点简称转换为完整域名
      const SITE_MAP = {
        'US': 'www.amazon.com', 'CA': 'www.amazon.ca',
        'AU': 'www.amazon.com.au', 'MX': 'www.amazon.com.mx',
        'UK': 'www.amazon.co.uk', 'DE': 'www.amazon.de',
        'FR': 'www.amazon.fr',    'IT': 'www.amazon.it',
        'ES': 'www.amazon.es',    'JP': 'www.amazon.co.jp',
      };
      rows.forEach(r => {
        if (r.site && !r.site.startsWith('www.')) {
          r.site = SITE_MAP[r.site.toUpperCase()] || r.site;
        }
      });

      const now = new Date().toISOString();
      referenceData = { importedAt: now, fileName: file.name, rows };
      window.electronAPI.storage.set('referenceData', referenceData)
        .catch(e => console.error('[Store] referenceData 保存失败:', e));
      renderRefPreview();
      autoFillAsinGroups(rows);
    } catch (err) { alert('解析失败: ' + err.message); }
  };
  reader.readAsArrayBuffer(file);
}
```

- [ ] **Step 3: fullpage.js 修改初始化时加载 referenceData 新结构**

```js
// 原来：
const refData = await window.electronAPI.storage.get('referenceData');
if (refData) { referenceData = refData; renderRefPreview(); }

// 改为：
const refData = await window.electronAPI.storage.get('referenceData');
if (refData) {
  // 兼容旧格式（数组）
  if (Array.isArray(refData)) {
    referenceData = { importedAt: null, fileName: '（历史数据）', rows: refData };
  } else {
    referenceData = refData;
  }
  renderRefPreview();
}
```

- [ ] **Step 4: fullpage.js 修改 renderRefPreview() 展示信息栏**

```js
function renderRefPreview() {
  if (!referenceData || !referenceData.rows || !referenceData.rows.length) {
    dom.refCard.style.display = 'none';
    document.getElementById('refImportInfo').style.display = 'none';
    return;
  }
  // 信息栏
  const info = document.getElementById('refImportInfo');
  info.style.display = 'flex';
  document.getElementById('refInfoFileName').textContent = referenceData.fileName || '';
  document.getElementById('refInfoTime').textContent = referenceData.importedAt
    ? new Date(referenceData.importedAt).toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
    : '';
  document.getElementById('refInfoCount').textContent = `共 ${referenceData.rows.length} 条`;

  // 表格
  dom.refCard.style.display = 'block';
  dom.refCount.textContent = `${referenceData.rows.length}条`;
  dom.refBody.innerHTML = referenceData.rows.slice(0, 50).map(r =>
    `<tr><td>${esc(r.asin)}</td><td>${esc(r.site)}</td><td>${esc(r.aliasName||'')}</td><td>${esc(r.expectedPrice)}</td><td>${esc(r.expectedListPrice)}</td><td>${esc(r.expectedDealBadge||'')}</td><td>${esc(r.expectedAcBadge||'')}</td><td>${esc(r.expectedCoupon||'')}</td><td>${esc(r.expectedRating)}</td><td>${esc(r.expectedReviews)}</td><td>${esc(r.expectedSeller)}</td><td>${esc(r.expectedStock)}</td></tr>`
  ).join('');
}
```

- [ ] **Step 5: fullpage.js 添加 autoFillAsinGroups()**

```js
function autoFillAsinGroups(rows) {
  // 按 site 分组
  const grouped = {};
  for (const r of rows) {
    if (!r.asin || !r.site) continue;
    if (!grouped[r.site]) grouped[r.site] = [];
    if (!grouped[r.site].includes(r.asin)) grouped[r.site].push(r.asin);
  }

  const groups = Object.entries(grouped).map(([site, asins]) => ({
    site, asins: asins.join('\n')
  }));

  if (!groups.length) return;

  // 重新渲染分组卡片
  const container = document.getElementById('siteGroups');
  container.innerHTML = '';
  for (const g of groups) renderGroupCard(g.site, g.asins);
  saveGroupsToCache();

  // 切换到巡店 Tab 提示
  alert(`已自动填入 ${rows.length} 条 ASIN 到巡店面板（${groups.length} 个站点分组）`);
}
```

- [ ] **Step 6: fullpage.js 修改 clearRef()**

```js
function clearRef() {
  if (!confirm('清除所有参考数据？')) return;
  referenceData = { importedAt: null, fileName: '', rows: [] };
  window.electronAPI.storage.remove('referenceData').catch(() => {});
  dom.refCard.style.display = 'none';
  document.getElementById('refImportInfo').style.display = 'none';
}
```

- [ ] **Step 7: fullpage.js 修改 findReference() 适配新结构**

原来 `referenceData` 是数组，现改为对象：

```js
function findReference(asin, site) {
  const rows = referenceData && referenceData.rows ? referenceData.rows : [];
  return rows.find(r => r.asin === asin && (!r.site || r.site === site || r.site.includes(site.split('.')[1])));
}

function hasAliasColumn() {
  const rows = referenceData && referenceData.rows ? referenceData.rows : [];
  return rows.some(r => r.aliasName && r.aliasName.trim());
}
```

- [ ] **Step 8: 手动验证**

```bash
npm start
# 验证：
# 1. 导入一个含「ASIN」和「站点」列的 Excel，成功后顶部信息栏显示文件名、时间、条数
# 2. 巡店面板自动出现对应的站点分组卡片，ASIN 已填入
# 3. 导入缺少「站点」列的 Excel，弹出明确错误提示
# 4. 清除数据后信息栏隐藏
```

- [ ] **Step 9: Commit**

```bash
git add renderer/fullpage.html renderer/fullpage.js renderer/fullpage.css
git commit -m "feat: extend reference import with meta info display and auto-fill ASIN groups"
```

---

## Task 7: getSettings() 清理 + patrolSettings 中 sites/deliveryZips 移除

**Files:**
- Modify: `renderer/fullpage.js`

**Interfaces:**
- Produces: `getSettings()` 不再包含 `sites` 和 `deliveryZips` 字段

- [ ] **Step 1: fullpage.js 修改 getSettings()**

确认 `getSettings()` 中已无 `sites` 和 `deliveryZips` 字段（Task 3 Step 7 已删除）。最终结构应为：

```js
function getSettings() {
  return {
    concurrency:      parseInt(dom.concurrency.value),
    pageInterval:     parseFloat(dom.pageInterval.value) * 1000,
    intervalJitter:   2000,
    batchSize:        parseInt(dom.batchSize.value),
    batchRest:        parseFloat(dom.batchRest.value) * 1000,
    scrapeTimeout:    parseInt(dom.scrapeTimeout.value) * 1000,
    maxRetries:       3,
    retryDelay:       2000,
    dingtalkWebhook:  dom.dingtalkEnabled.checked ? dom.dingtalkWebhook.value.trim() : '',
    enabledFields:    getEnabledFields(),
    showHistoryDiff:  dom.showHistoryDiff.checked,
    showScrapeWindow: dom.showScrapeWindow ? dom.showScrapeWindow.checked : false,
  };
}
```

- [ ] **Step 2: fullpage.js 修改 loadSettings() 移除 sites/deliveryZips 恢复逻辑**

删除 `loadSettings()` 中以下代码：

```js
// 删除：
if (s.sites && s.sites.length > 0) {
  dom.siteCheckboxes.forEach(cb => { cb.checked = s.sites.includes(cb.value); });
}
// 删除 zipUS/zipCA/zipAU/zipMX 赋值代码（若 Task 3 Step 7 已删则跳过）
```

- [ ] **Step 3: 手动验证**

```bash
npm start
# 验证：
# 1. 修改并发参数后保存，settings.json 中 patrolSettings 无 sites / deliveryZips 字段
# 2. 所有巡店功能正常（邮编由 sites.json 提供，站点由分组卡片提供）
```

- [ ] **Step 4: Commit**

```bash
git add renderer/fullpage.js
git commit -m "refactor: remove sites and deliveryZips from patrolSettings, managed by sites.json"
```

---

## Task 8: README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新数据存储章节**

将 README 中「数据存储位置」章节的内容替换为 5 个文件的说明，结构参考 spec 文档中的文件结构表和各文件 JSON 示例。

**文件路径：**

| 平台 | 目录 |
|------|------|
| Windows | `%APPDATA%\amazon-patrol\` |
| Mac | `~/Library/Application Support/amazon-patrol/` |

**5 个文件说明表：**

| 文件 | 内容 | 读写频率 |
|------|------|---------|
| `settings.json` | patrolSettings、cronConfig、appTheme、openAtLogin | 高频（UI 变更时实时写入） |
| `state.json` | patrolState、patrolResults、lastUpdate、asinInputCache | 中频（巡店周期内变化） |
| `history.json` | patrolHistory、historySnapshots | 低频（每次巡店完成追加） |
| `reference.json` | importedAt、fileName、rows（参考数据） | 极低频（用户手动导入） |
| `sites.json` | 20 站点配置（domain、zip、enabled 等） | 极低频（用户手动配置） |

- [ ] **Step 2: 更新界面标签页说明表**

在「使用说明 → 界面标签页」表格中新增「站点」Tab：

```
| 站点 | 管理 20 个 Amazon 站点的启用状态和配送邮编 |
```

删除或更新「设置」Tab 中关于邮编配置的说明（改为引导至「站点」Tab）。

- [ ] **Step 3: 更新配送地设置章节**

删除「配送地设置」章节中的 4 站点邮编表格，替换为：

> 在「站点」Tab 管理所有站点的配送邮编。启用开关控制该站点是否出现在巡店面板的站点选择中，邮编用于巡店前初始化配送地。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for 5-file store, site group patrol panel, sites management tab"
```
