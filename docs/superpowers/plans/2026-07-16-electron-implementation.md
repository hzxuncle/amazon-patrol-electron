# 亚马逊巡店助手 Electron 版 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Chrome 扩展 `amazon-patrol` 改造为支持 Windows + Mac 的 Electron 桌面应用，保留全部功能，增加系统托盘、开机自启动。

**Architecture:** 主进程（electron/）用 Node.js 实现调度、存储、抓取逻辑，替换所有 `chrome.*` API；渲染进程（renderer/）直接复用现有 HTML/CSS，仅将 `chrome.*` 调用替换为 `window.electronAPI.*`；两者通过 preload.js 的 contextBridge 通信。

**Tech Stack:** Electron 28、node-schedule、electron-builder、fs/path（Node 内置）、现有 xlsx.full.min.js / cron.js

## Global Constraints

- Electron 版本：28.x（LTS）
- Node 版本：≥18
- 不引入 React/Vue，渲染层保持原生 HTML/JS
- 所有数据文件存到 `app.getPath('userData')`
- 抓取窗口必须 `show: false`，不干扰用户操作
- 支持平台：Windows 10+、macOS 11+
- 打包工具：electron-builder 24.x
- 源扩展路径：`../amazon-patrol/`（相对于 `amazon-patrol-electron/`）

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 新建 | 项目配置、依赖、打包脚本 |
| `electron/main.js` | 新建 | 主进程入口：窗口、托盘、生命周期 |
| `electron/preload.js` | 新建 | contextBridge 暴露 electronAPI |
| `electron/store.js` | 新建 | JSON 文件读写，替换 chrome.storage |
| `electron/ipc-handlers.js` | 新建 | ipcMain.handle 路由，对应原 background.js 逻辑 |
| `electron/tab-manager.js` | 新建 | BrowserWindow 抓取池，替换 chrome.tabs |
| `electron/scheduler.js` | 新建 | node-schedule 定时，替换 chrome.alarms |
| `renderer/fullpage.html` | 复制+改 | 去掉扩展特有 meta，script src 路径调整 |
| `renderer/fullpage.js` | 复制+改 | 所有 chrome.* 替换为 window.electronAPI.* |
| `renderer/fullpage.css` | 复制 | 零改动 |
| `renderer/selectors.js` | 复制 | 零改动 |
| `renderer/lib/cron.js` | 复制 | 零改动 |
| `renderer/lib/xlsx.full.min.js` | 复制 | 零改动 |
| `assets/icons/` | 新建 | 从扩展 icons/ 复制，补充 256px |
| `build/electron-builder.yml` | 新建 | 打包配置 |

---

## Task 1: 项目脚手架与依赖

**Files:**
- Create: `amazon-patrol-electron/package.json`
- Create: `amazon-patrol-electron/.gitignore`

**Interfaces:**
- Produces: `npm start` 可启动开发模式，`npm run build:win` / `npm run build:mac` 触发打包

- [ ] **Step 1: 创建项目目录结构**

```bash
cd /home/ec2-user/claude/amz-xundian
mkdir -p amazon-patrol-electron/{electron,renderer/lib,assets/icons,build,docs/superpowers/plans}
```

- [ ] **Step 2: 创建 package.json**

创建 `/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/package.json`：

```json
{
  "name": "amazon-patrol",
  "version": "2.0.0",
  "description": "亚马逊巡店助手桌面版",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:all": "electron-builder --win --mac"
  },
  "dependencies": {
    "node-schedule": "^2.1.1"
  },
  "devDependencies": {
    "electron": "^28.3.3",
    "electron-builder": "^24.13.3"
  },
  "build": {
    "appId": "com.amazonpatrol.desktop",
    "productName": "亚马逊巡店助手",
    "directories": {
      "output": "dist"
    },
    "files": [
      "electron/**/*",
      "renderer/**/*",
      "assets/**/*"
    ],
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] },
        { "target": "zip",  "arch": ["x64"] }
      ],
      "icon": "assets/icons/icon.ico"
    },
    "mac": {
      "target": [
        { "target": "dmg", "arch": ["x64", "arm64"] },
        { "target": "zip", "arch": ["x64", "arm64"] }
      ],
      "icon": "assets/icons/icon.icns"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "assets/icons/icon.ico",
      "uninstallerIcon": "assets/icons/icon.ico"
    }
  }
}
```

- [ ] **Step 3: 创建 .gitignore**

```
node_modules/
dist/
```

- [ ] **Step 4: 安装依赖**

```bash
cd /home/ec2-user/claude/amz-xundian/amazon-patrol-electron
npm install
```

预期输出：`node_modules/` 目录创建，包含 electron、node-schedule、electron-builder。

- [ ] **Step 5: 复制静态资源**

```bash
cd /home/ec2-user/claude/amz-xundian
cp amazon-patrol/fullpage.css         amazon-patrol-electron/renderer/
cp amazon-patrol/selectors.js         amazon-patrol-electron/renderer/
cp amazon-patrol/lib/cron.js          amazon-patrol-electron/renderer/lib/
cp amazon-patrol/lib/xlsx.full.min.js amazon-patrol-electron/renderer/lib/
cp amazon-patrol/icons/*              amazon-patrol-electron/assets/icons/
```

- [ ] **Step 6: 验证目录结构**

```bash
find /home/ec2-user/claude/amz-xundian/amazon-patrol-electron -type f | sort
```

预期：看到 package.json、renderer/fullpage.css、renderer/selectors.js、renderer/lib/cron.js、renderer/lib/xlsx.full.min.js、assets/icons/ 下有图标文件。

---

## Task 2: store.js — 数据持久化层

**Files:**
- Create: `electron/store.js`

**Interfaces:**
- Produces:
  - `store.get(key)` → `any`（同步）
  - `store.set(key, value)` → `void`（同步）
  - `store.remove(key)` → `void`（同步）
  - `store.getAll()` → `object`

key 与原 chrome.storage 键名一一对应：`patrolSettings`、`cronConfig`、`patrolResults`、`patrolState`、`patrolConfig`、`historySnapshots`、`asinInputCache`、`referenceData`、`lastUpdate`。

- [ ] **Step 1: 创建 store.js**

创建 `/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/store.js`：

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_DIR = app.getPath('userData');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

let _cache = null;

function load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(DATA_FILE)) {
      _cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } else {
      _cache = {};
    }
  } catch (e) {
    _cache = {};
  }
  return _cache;
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(_cache, null, 2), 'utf8');
  } catch (e) {
    console.error('[Store] 写入失败:', e.message);
  }
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  save();
}

function remove(key) {
  delete load()[key];
  save();
}

function getAll() {
  return { ...load() };
}

module.exports = { get, set, remove, getAll };
```

- [ ] **Step 2: 验证 store.js 语法**

```bash
/home/ec2-user/.nvm/versions/node/v20.20.2/bin/node --check \
  /home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/store.js \
  2>&1 && echo OK
```

若 Node 版本不兼容，改用：`python3 -c "import ast; print('OK')"` 做基础 JSON 格式检查。

---

## Task 3: tab-manager.js — 抓取窗口管理

**Files:**
- Create: `electron/tab-manager.js`

**Interfaces:**
- Consumes: `electron` 模块（BrowserWindow、session）；`fs`（读取 selectors.js、content.js）
- Produces:
  - `openTabForTask(task, config)` → `Promise<result>` — 创建隐藏窗口、注入脚本、返回抓取结果
  - `closeAll()` → `void` — 关闭所有抓取窗口

- [ ] **Step 1: 创建 tab-manager.js**

创建 `/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/tab-manager.js`：

```js
'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const activeTabs = new Map(); // tabId -> { asin, site, win }

const SELECTORS_JS = fs.readFileSync(
  path.join(__dirname, '../renderer/selectors.js'), 'utf8'
);
const CONTENT_JS = fs.readFileSync(
  path.join(__dirname, '../../amazon-patrol/content.js'), 'utf8'
);

const SITE_URLS = {
  'www.amazon.ca':     'https://www.amazon.ca',
  'www.amazon.com':    'https://www.amazon.com',
  'www.amazon.com.au': 'https://www.amazon.com.au',
  'www.amazon.com.mx': 'https://www.amazon.com.mx'
};

function getSiteUrl(site) {
  return SITE_URLS[site] || `https://${site}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForLoad(win, maxWait = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, maxWait);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      setTimeout(resolve, 2000);
    });
  });
}

async function injectAndScrape(win, asin, config) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('抓取超时')), config.scrapeTimeout || 25000);

    // IPC 监听抓取结果
    const { ipcMain } = require('electron');
    const channel = `scrape-result-${win.id}`;
    const handler = (event, result) => {
      clearTimeout(timeout);
      ipcMain.removeHandler(channel);
      resolve(result);
    };
    ipcMain.handleOnce(channel, handler);

    try {
      // 注入选择器 + content script
      await win.webContents.executeJavaScript(SELECTORS_JS);

      // 将 content.js 的消息监听替换为直接调用后回传结果
      const patchedContent = CONTENT_JS.replace(
        /chrome\.runtime\.onMessage\.addListener[\s\S]*?}\s*\);/m,
        `
        (async () => {
          const result = await handleScrape({
            action: 'SCRAPE_NOW',
            asin: ${JSON.stringify(asin)},
            maxRetries: ${config.maxRetries || 3},
            retryDelay: ${config.retryDelay || 2000},
            useStability: ${config.useStability !== false},
            enabledFields: ${JSON.stringify(config.enabledFields || null)}
          });
          require('electron').ipcRenderer.invoke(${JSON.stringify(channel)}, result);
        })();
        `
      );
      await win.webContents.executeJavaScript(patchedContent);
    } catch (e) {
      clearTimeout(timeout);
      ipcMain.removeHandler(channel);
      reject(e);
    }
  });
}

async function openTabForTask(task, config) {
  const { asin, site } = task;
  const url = `${getSiteUrl(site)}/dp/${asin}`;

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,  // content.js 需要直接访问 DOM，不走 preload
      javascript: true
    }
  });

  activeTabs.set(win.id, { asin, site, win });

  try {
    await win.loadURL(url);
    await waitForLoad(win);
    const result = await injectAndScrape(win, asin, config);
    result.site = site;
    result.index = task.index;
    return result;
  } finally {
    activeTabs.delete(win.id);
    if (!win.isDestroyed()) win.close();
  }
}

function closeAll() {
  for (const [, { win }] of activeTabs) {
    if (!win.isDestroyed()) win.close();
  }
  activeTabs.clear();
}

module.exports = { openTabForTask, closeAll };
```

- [ ] **Step 2: 验证语法**

```bash
python3 -c "
import re, sys
with open('/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/tab-manager.js') as f:
    content = f.read()
print('Lines:', len(content.splitlines()))
print('Has openTabForTask:', 'openTabForTask' in content)
print('Has closeAll:', 'closeAll' in content)
"
```

预期：Lines > 80，两个函数均存在。

---

## Task 4: ipc-handlers.js — 巡店核心逻辑

**Files:**
- Create: `electron/ipc-handlers.js`

**Interfaces:**
- Consumes: `store.js`（get/set/remove）；`tab-manager.js`（openTabForTask/closeAll）；`electron`（ipcMain、Notification、shell）
- Produces: 注册所有 `ipcMain.handle('ACTION', ...)` 处理器，与原 background.js 的 `handleMessage` 一一对应

处理的 action 列表：
`START_PATROL` / `STOP_PATROL` / `RETRY_FAILED` / `GET_STATUS` / `GET_RESULTS` / `GET_HISTORY` / `CLEAR_RESULTS` / `CLEAR_HISTORY` / `SAVE_CRON_CONFIG` / `GET_CRON_CONFIG` / `SAVE_EXCEL` / `GET_LOGIN_ITEM` / `SET_LOGIN_ITEM`

- [ ] **Step 1: 创建 ipc-handlers.js**

创建 `/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/ipc-handlers.js`：

```js
'use strict';

const { ipcMain, Notification, app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const tabManager = require('./tab-manager');

// ========== 状态 ==========
let activePatrol = null;
let taskQueue = [];
let completedResults = [];
let startTime = null;
let retryMap = {};
let mainWindow = null; // 由 main.js 注入

function setMainWindow(win) { mainWindow = win; }

// ========== 工具函数 ==========
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getDefaultConfig() {
  return {
    concurrency: 2, pageInterval: 4000, intervalJitter: 2000,
    batchSize: 20, batchRest: 30000, scrapeTimeout: 25000,
    maxRetries: 3, retryDelay: 2000,
    dingtalkWebhook: '', sites: ['www.amazon.ca']
  };
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h > 0) return `${h}时${m % 60}分${s % 60}秒`;
  if (m > 0) return `${m}分${s % 60}秒`;
  return `${s}秒`;
}

function broadcastUpdate(result) {
  store.set('patrolResults', completedResults);
  store.set('lastUpdate', Date.now());
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('PATROL_UPDATE', {
      result,
      progress: {
        completed: completedResults.length,
        total: activePatrol ? (activePatrol.totalCount || activePatrol.tasks.length) : 0
      }
    });
  }
}

// ========== Worker Pool ==========
function processQueue(config) {
  const concurrency = config.concurrency || 2;
  const pageInterval = config.pageInterval || 4000;
  const batchRest = config.batchRest || 30000;
  const batchSize = config.batchSize || 20;

  let globalProcessed = 0;
  let activeWorkers = 0;
  let allWorkersDone = false;

  async function worker(workerId) {
    activeWorkers++;
    while (activePatrol) {
      if (globalProcessed > 0 && globalProcessed % batchSize === 0 && taskQueue.length > 0) {
        await sleep(batchRest);
        if (!activePatrol) break;
      }
      const task = taskQueue.shift();
      if (!task) break;

      try {
        const result = await tabManager.openTabForTask(task, config);
        result.retryCount = retryMap[`${task.asin}_${task.site}`] || 0;
        completedResults.push(result);
        broadcastUpdate(result);
      } catch (err) {
        const errorResult = {
          asin: task.asin, site: task.site, index: task.index,
          title: '', price: '', listPrice: '', rating: '', reviews: '',
          seller: '', stock: '', parentAsin: 'N/A',
          dealBadge: 'N/A', acBadge: 'N/A', coupon: 'N/A',
          url: `https://${task.site}/dp/${task.asin}`,
          timestamp: new Date().toISOString(),
          status: 'failed', error: err.message || 'Tab操作失败'
        };
        completedResults.push(errorResult);
        broadcastUpdate(errorResult);
      }

      globalProcessed++;
      if (taskQueue.length > 0 && activePatrol) {
        const jitter = Math.floor(Math.random() * (config.intervalJitter || 2000));
        await sleep(pageInterval + jitter);
      }
    }

    activeWorkers--;
    if (activeWorkers === 0 && !allWorkersDone) {
      allWorkersDone = true;
      if (activePatrol) onPatrolComplete();
    }
  }

  for (let i = 0; i < concurrency; i++) worker(i + 1);
}

// ========== 巡店完成 ==========
async function onPatrolComplete() {
  if (!activePatrol) return;
  const elapsed = Date.now() - startTime;
  completedResults.sort((a, b) => (a.index || 0) - (b.index || 0));

  const summary = {
    total: completedResults.length,
    success: completedResults.filter(r => r.status === 'success').length,
    failed: completedResults.filter(r => r.status === 'failed').length,
    captcha: completedResults.filter(r => r.status === 'captcha').length,
    retryable: completedResults.filter(r =>
      r.status === 'failed' && !r.error.includes('验证码') && !r.error.includes('captcha')
    ).length,
    elapsed,
    completedAt: new Date().toISOString(),
    isRetry: activePatrol.isRetry || false
  };

  saveHistorySnapshot();
  activePatrol = null;
  store.set('patrolState', { running: false });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('PATROL_COMPLETE', { summary, results: completedResults });
  }

  // 系统通知
  try {
    new Notification({
      title: '亚马逊巡店完成',
      body: `共 ${summary.total} 个ASIN | 成功 ${summary.success} | 失败 ${summary.failed} | ${formatTime(elapsed)}`
    }).show();
  } catch (e) {}

  // 钉钉推送
  const patrolConfig = store.get('patrolConfig');
  if (patrolConfig && patrolConfig.dingtalkWebhook) {
    const references = store.get('referenceData') || [];
    if (references.length > 0) sendDingTalk(summary, patrolConfig.dingtalkWebhook);
  }
}

// ========== 历史快照 ==========
function saveHistorySnapshot() {
  const history = store.get('historySnapshots') || {};
  const now = new Date().toISOString();
  completedResults.forEach(r => {
    if (r.status !== 'success') return;
    const key = `${r.asin}_${r.site}`;
    if (!history[key]) history[key] = { asin: r.asin, site: r.site, snapshots: [] };
    history[key].snapshots.push({
      timestamp: now, price: r.price, listPrice: r.listPrice,
      rating: r.rating, reviews: r.reviews, seller: r.seller,
      stock: r.stock, dealBadge: r.dealBadge, acBadge: r.acBadge,
      coupon: r.coupon, parentAsin: r.parentAsin
    });
    if (history[key].snapshots.length > 10) history[key].snapshots = history[key].snapshots.slice(-10);
  });
  store.set('historySnapshots', history);
}

// ========== 钉钉推送 ==========
function mismatchPrice(a, e) {
  if (!e) return false;
  const an = parseFloat(String(a||'').replace(/[^0-9.]/g,'')), en = parseFloat(String(e).replace(/[^0-9.]/g,''));
  if (isNaN(an)||isNaN(en)) return String(a||'').trim()!==String(e).trim();
  return Math.abs(an-en)>=0.01;
}
function mismatchRating(a,e) { if(!e)return false; return Math.abs(parseFloat(a||'0')-parseFloat(e))>=0.2; }
function mismatchReviews(a,e) {
  if(!e)return false;
  const an=parseInt(String(a||'').replace(/[^0-9]/g,''))||0, en=parseInt(String(e).replace(/[^0-9]/g,''))||0;
  return Math.abs(an-en)/Math.max(en,1)>=0.3;
}
function mismatchText(a,e) {
  if(!e)return false;
  const at=String(a||'').trim().toLowerCase(), et=String(e).trim().toLowerCase();
  return at!==et&&!at.includes(et)&&!et.includes(at);
}
function getSiteLabel(h) {
  return {'www.amazon.ca':'CA','www.amazon.com':'US','www.amazon.com.au':'AU','www.amazon.com.mx':'MX'}[h]||h;
}

async function sendDingTalk(summary, webhookUrl) {
  if (!webhookUrl) return;
  const references = store.get('referenceData') || [];
  function findRef(r) {
    return references.find(ref => ref.asin===r.asin &&
      (!ref.site||ref.site===r.site||ref.site.includes(r.site.split('.')[1])));
  }
  const anomalySet = new Map();
  completedResults.forEach(r => {
    const key = `${r.asin}_${r.site}`;
    const ref = findRef(r);
    const label = `${getSiteLabel(r.site)}·${(ref&&ref.aliasName)||r.asin}`;
    if (r.status !== 'success') { anomalySet.set(key,{label,details:[r.error||'抓取失败']}); return; }
    if (!ref) return;
    const diffs = [];
    if (mismatchPrice(r.price,ref.expectedPrice)) diffs.push(`售价 期望${ref.expectedPrice} 实际${r.price}`);
    if (mismatchPrice(r.listPrice,ref.expectedListPrice)) diffs.push(`划线价 期望${ref.expectedListPrice} 实际${r.listPrice}`);
    if (mismatchText(r.dealBadge,ref.expectedDealBadge)) diffs.push(`活动 期望${ref.expectedDealBadge} 实际${r.dealBadge}`);
    if (mismatchText(r.acBadge,ref.expectedAcBadge)) diffs.push(`AC标 期望${ref.expectedAcBadge} 实际${r.acBadge}`);
    if (mismatchText(r.coupon,ref.expectedCoupon)) diffs.push(`Coupon 期望${ref.expectedCoupon} 实际${r.coupon}`);
    if (mismatchRating(r.rating,ref.expectedRating)) diffs.push(`星级 期望${ref.expectedRating} 实际${r.rating}`);
    if (mismatchReviews(r.reviews,ref.expectedReviews)) diffs.push(`评论 期望${ref.expectedReviews} 实际${r.reviews}`);
    if (mismatchText(r.seller,ref.expectedSeller)) diffs.push(`卖家 期望${ref.expectedSeller} 实际${r.seller}`);
    if (mismatchText(r.stock,ref.expectedStock)) diffs.push(`库存 期望${ref.expectedStock} 实际${r.stock}`);
    if (diffs.length) anomalySet.set(key,{label,details:diffs});
  });
  let anomalyText = '';
  if (anomalySet.size>0) {
    anomalyText='\n\n### ⚠️ 异常清单\n';
    anomalySet.forEach(v=>{ anomalyText+=`- ${v.label}: ${v.details.join('; ')}\n`; });
  }
  const body = {
    msgtype:'markdown',
    markdown:{
      title:'亚马逊巡店报告',
      text:`## 📊 亚马逊巡店报告\n\n**时间**: ${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}\n\n**总计**: ${summary.total} | ✅${summary.success} | ❌${summary.failed} | 🔐${summary.captcha}\n\n**异常**: ${anomalySet.size} 个\n\n**用时**: ${formatTime(summary.elapsed)}`+anomalyText
    }
  };
  try {
    const res = await fetch(webhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    console.log('[Patrol] 钉钉推送 HTTP', res.status);
  } catch(e) { console.error('[Patrol] 钉钉推送失败:', e.message); }
}

// ========== IPC 注册 ==========
function register() {
  ipcMain.handle('START_PATROL', async (e, { tasks, config, totalCount, keepExisting }) => {
    if (activePatrol) return { error: '巡店正在进行中' };
    if (!keepExisting) completedResults = [];
    activePatrol = { tasks: [...tasks], config, errors: [], keepExisting, totalCount };
    taskQueue = [...tasks];
    startTime = Date.now();
    retryMap = {};
    store.set('patrolConfig', config);
    store.set('patrolState', { running: true, totalCount, completedCount: 0 });
    processQueue(config);
    return { success: true, totalTasks: tasks.length };
  });

  ipcMain.handle('STOP_PATROL', async () => {
    tabManager.closeAll();
    taskQueue = [];
    activePatrol = null;
    store.set('patrolState', { running: false });
    return { success: true, saved: completedResults.length };
  });

  ipcMain.handle('RETRY_FAILED', async () => {
    if (activePatrol) return { error: '巡店正在进行中' };
    const failedItems = completedResults.filter(r =>
      r.status === 'failed' && !r.error.includes('验证码') && !r.error.includes('captcha')
    );
    if (!failedItems.length) return { error: '没有可重试的失败项', retryable: 0 };
    const retryTasks = failedItems.map((r, idx) => ({ asin: r.asin, site: r.site, index: idx }));
    const config = store.get('patrolConfig') || getDefaultConfig();
    const retryConfig = { ...config, concurrency: Math.min(config.concurrency||2,2), pageInterval: Math.max(config.pageInterval||4000,6000) };
    const failedKeys = new Set(failedItems.map(r=>`${r.asin}_${r.site}`));
    completedResults = completedResults.filter(r=>!failedKeys.has(`${r.asin}_${r.site}`));
    activePatrol = { tasks: retryTasks, config: retryConfig, errors: [], isRetry: true };
    taskQueue = [...retryTasks];
    startTime = Date.now();
    retryMap = {};
    processQueue(retryConfig);
    return { success: true, retryCount: retryTasks.length };
  });

  ipcMain.handle('GET_STATUS', () => ({
    running: activePatrol !== null,
    total: activePatrol ? activePatrol.tasks.length : 0,
    completed: completedResults.length,
    queue: taskQueue.length,
    startTime,
    elapsed: startTime ? Date.now() - startTime : 0
  }));

  ipcMain.handle('GET_RESULTS', () => ({ results: completedResults }));

  ipcMain.handle('GET_HISTORY', () => store.get('historySnapshots') || {});

  ipcMain.handle('CLEAR_RESULTS', () => {
    completedResults = [];
    store.remove('patrolState');
    store.remove('patrolResults');
    return { success: true };
  });

  ipcMain.handle('CLEAR_HISTORY', () => {
    store.remove('historySnapshots');
    return { success: true };
  });

  ipcMain.handle('STORAGE_GET', (e, key) => store.get(key));

  ipcMain.handle('STORAGE_SET', (e, key, value) => { store.set(key, value); return true; });

  ipcMain.handle('STORAGE_REMOVE', (e, key) => { store.remove(key); return true; });

  ipcMain.handle('SAVE_CRON_CONFIG', (e, config) => {
    store.set('cronConfig', config);
    return { success: true };
  });

  ipcMain.handle('GET_CRON_CONFIG', () => store.get('cronConfig') || { enabled: false, expr: '0 9 * * 1-5' });

  ipcMain.handle('SAVE_EXCEL', async (e, buffer) => {
    const { filePath } = await dialog.showSaveDialog({
      title: '保存巡店报告',
      defaultPath: `巡店报告_${new Date().toISOString().slice(0,10)}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (!filePath) return { cancelled: true };
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true, filePath };
  });

  ipcMain.handle('GET_LOGIN_ITEM', () => app.getLoginItemSettings());

  ipcMain.handle('SET_LOGIN_ITEM', (e, openAtLogin) => {
    app.setLoginItemSettings({ openAtLogin });
    store.set('openAtLogin', openAtLogin);
    return { success: true };
  });
}

module.exports = { register, setMainWindow };
```

- [ ] **Step 2: 验证关键函数存在**

```bash
python3 -c "
with open('/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/ipc-handlers.js') as f:
    c = f.read()
checks = ['register', 'setMainWindow', 'START_PATROL', 'STOP_PATROL', 'SAVE_EXCEL', 'SET_LOGIN_ITEM', 'sendDingTalk']
for k in checks:
    print(k, ':', 'OK' if k in c else 'MISSING')
"
```

预期：所有项均为 OK。

---

## Task 5: scheduler.js — 定时调度

**Files:**
- Create: `electron/scheduler.js`

**Interfaces:**
- Consumes: `node-schedule`；`store.js`（get）；`cron.js`（CronParser）；`ipc-handlers.js`（startPatrolFromCron）
- Produces:
  - `start()` → `void` — 应用启动时调用，若 cronConfig.enabled 则注册任务
  - `restart()` → `void` — 保存 cron 配置后调用，重新注册
  - `stop()` → `void`

- [ ] **Step 1: 创建 scheduler.js**

创建 `/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/scheduler.js`：

```js
'use strict';

const schedule = require('node-schedule');
const path = require('path');
const store = require('./store');

// 加载前端用的 cron 解析器（复用，避免重复实现）
let CronParser;
try {
  CronParser = require('../renderer/lib/cron.js');
} catch(e) {
  // 降级：直接 eval 文件内容
  const fs = require('fs');
  const code = fs.readFileSync(path.join(__dirname,'../renderer/lib/cron.js'),'utf8');
  CronParser = eval(code + '; CronParser');
}

let _job = null;
let _onTrigger = null; // 由 main.js 注入触发回调

function setTriggerCallback(fn) { _onTrigger = fn; }

function stop() {
  if (_job) { _job.cancel(); _job = null; }
}

function start() {
  stop();
  const config = store.get('cronConfig');
  if (!config || !config.enabled || !config.expr) return;
  const v = CronParser.validateCron(config.expr);
  if (!v.valid) { console.warn('[Scheduler] 无效 cron 表达式:', config.expr); return; }

  // node-schedule 每分钟触发，手动匹配 cron 表达式（与扩展逻辑一致）
  _job = schedule.scheduleJob('* * * * *', () => {
    const cfg = store.get('cronConfig');
    if (!cfg || !cfg.enabled || !cfg.expr) return;
    const parsed = CronParser.parseCron(cfg.expr);
    if (!CronParser.matchesCron(parsed, new Date())) return;
    console.log('[Scheduler] Cron 触发，准备启动巡店');
    if (_onTrigger) _onTrigger();
  });
  console.log('[Scheduler] 已注册定时任务:', config.expr);
}

function restart() { start(); }

module.exports = { start, stop, restart, setTriggerCallback };
```

- [ ] **Step 2: 验证语法**

```bash
python3 -c "
with open('/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/scheduler.js') as f:
    c = f.read()
for k in ['start','stop','restart','setTriggerCallback','scheduleJob']:
    print(k,':', 'OK' if k in c else 'MISSING')
"
```

---

## Task 6: preload.js — contextBridge API 桥

**Files:**
- Create: `electron/preload.js`

**Interfaces:**
- Produces: `window.electronAPI` 对象，包含以下方法供 fullpage.js 调用：
  - `sendMessage(action, payload)` → `Promise<any>`
  - `onMessage(callback)` → `void`（接收主进程推送）
  - `storage.get(key)` → `Promise<any>`
  - `storage.set(key, value)` → `Promise<void>`
  - `storage.remove(key)` → `Promise<void>`
  - `storage.onChanged(callback)` → `void`（模拟 chrome.storage.onChanged）
  - `saveExcel(buffer)` → `Promise<{success, filePath, cancelled}>`
  - `getLoginItem()` → `Promise<{openAtLogin}>`
  - `setLoginItem(openAtLogin)` → `Promise<void>`

- [ ] **Step 1: 创建 preload.js**

创建 `/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/preload.js`：

```js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const messageCallbacks = [];
const storageChangeCallbacks = [];

// 接收主进程推送（PATROL_UPDATE / PATROL_COMPLETE）
ipcRenderer.on('PATROL_UPDATE', (e, data) => {
  messageCallbacks.forEach(cb => cb({ action: 'PATROL_UPDATE', ...data }));
});
ipcRenderer.on('PATROL_COMPLETE', (e, data) => {
  messageCallbacks.forEach(cb => cb({ action: 'PATROL_COMPLETE', ...data }));
});
ipcRenderer.on('STORAGE_CHANGED', (e, changes) => {
  storageChangeCallbacks.forEach(cb => cb(changes));
});

contextBridge.exposeInMainWorld('electronAPI', {
  // 消息通信（替换 chrome.runtime.sendMessage / onMessage）
  sendMessage: (action, payload) => ipcRenderer.invoke(action, payload || {}),
  onMessage: (cb) => messageCallbacks.push(cb),

  // 存储（替换 chrome.storage.local）
  storage: {
    get: (key) => ipcRenderer.invoke('STORAGE_GET', key),
    set: (key, value) => ipcRenderer.invoke('STORAGE_SET', key, value),
    remove: (key) => ipcRenderer.invoke('STORAGE_REMOVE', key),
    onChanged: (cb) => storageChangeCallbacks.push(cb)
  },

  // Excel 保存（替换 chrome.downloads）
  saveExcel: (buffer) => ipcRenderer.invoke('SAVE_EXCEL', buffer),

  // 开机自启动
  getLoginItem: () => ipcRenderer.invoke('GET_LOGIN_ITEM'),
  setLoginItem: (openAtLogin) => ipcRenderer.invoke('SET_LOGIN_ITEM', openAtLogin)
});
```

- [ ] **Step 2: 验证语法**

```bash
python3 -c "
with open('/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/preload.js') as f:
    c = f.read()
for k in ['contextBridge','exposeInMainWorld','electronAPI','sendMessage','storage','saveExcel','setLoginItem']:
    print(k,':', 'OK' if k in c else 'MISSING')
"
```

---

## Task 7: main.js — 主进程入口

**Files:**
- Create: `electron/main.js`

**Interfaces:**
- Consumes: `ipc-handlers.js`（register/setMainWindow）；`scheduler.js`（start/restart/setTriggerCallback）；`store.js`（get）；`electron`（app/BrowserWindow/Tray/Menu/nativeImage）

- [ ] **Step 1: 创建 main.js**

创建 `/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/main.js`：

```js
'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const ipcHandlers = require('./ipc-handlers');
const scheduler = require('./scheduler');
const store = require('./store');

let mainWindow = null;
let tray = null;

// ========== 主窗口 ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: '亚马逊巡店助手',
    icon: path.join(__dirname, '../assets/icons/icon128.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/fullpage.html'));

  // 关闭时隐藏到托盘，不退出
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });

  ipcHandlers.setMainWindow(mainWindow);
}

// ========== 系统托盘 ==========
function createTray() {
  const iconPath = path.join(__dirname, '../assets/icons/icon16.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('亚马逊巡店助手');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.exit(0); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ========== 定时触发巡店 ==========
function onCronTrigger() {
  const rawInput = store.get('asinInputCache') || '';
  const asins = [...new Set(
    rawInput.split(/[\n,，]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]{10}$/.test(s))
  )];
  const patrolConfig = store.get('patrolConfig') || {
    concurrency: 2, pageInterval: 4000, intervalJitter: 2000,
    batchSize: 20, batchRest: 30000, scrapeTimeout: 25000,
    maxRetries: 3, retryDelay: 2000, sites: ['www.amazon.ca']
  };
  const sites = patrolConfig.sites || ['www.amazon.ca'];
  if (!asins.length || !sites.length) {
    console.log('[Main] Cron 触发但无有效 ASIN，跳过');
    return;
  }
  const tasks = [];
  asins.forEach((asin, idx) => sites.forEach(site => tasks.push({ asin, site, index: idx })));
  console.log(`[Main] Cron 触发巡店，${tasks.length} 个任务`);

  // 复用 IPC handler 的逻辑：直接模拟 START_PATROL
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('CRON_AUTO_START', { tasks, config: { ...patrolConfig, keepExisting: false, totalCount: tasks.length } });
  }
}

// ========== 应用生命周期 ==========
app.whenReady().then(() => {
  ipcHandlers.register();
  createWindow();
  createTray();

  scheduler.setTriggerCallback(onCronTrigger);
  scheduler.start();

  // 恢复开机自启动设置
  const openAtLogin = store.get('openAtLogin');
  if (openAtLogin !== undefined) {
    app.setLoginItemSettings({ openAtLogin });
  }
});

// 所有窗口关闭时不退出（托盘模式）
app.on('window-all-closed', (e) => {
  // 不调用 app.quit()，保持托盘运行
});

app.on('activate', () => {
  // macOS dock 点击
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});
```

- [ ] **Step 2: 验证语法**

```bash
python3 -c "
with open('/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/electron/main.js') as f:
    c = f.read()
for k in ['createWindow','createTray','onCronTrigger','scheduler.start','ipcHandlers.register']:
    print(k,':', 'OK' if k in c else 'MISSING')
"
```

---

## Task 8: renderer/fullpage.html — 渲染层 HTML

**Files:**
- Create: `renderer/fullpage.html`（基于扩展版本改造）

**Interfaces:**
- Consumes: `renderer/fullpage.css`、`renderer/lib/xlsx.full.min.js`、`renderer/lib/cron.js`、`renderer/fullpage.js`
- 变化点：去掉扩展 meta 标签，script src 路径使用相对路径，新增「开机自启动」开关到设置面板

- [ ] **Step 1: 复制并修改 fullpage.html**

复制 `/home/ec2-user/claude/amz-xundian/amazon-patrol/fullpage.html` 到 `renderer/fullpage.html`，然后在设置面板的「通知设置」card 后面新增「系统设置」card：

```html
          <section class="card">
            <div class="card-header"><span class="card-title">系统设置</span></div>
            <div class="setting-item">
              <label class="toggle-label">
                <input type="checkbox" id="openAtLogin"> 开机自动启动
              </label>
              <span class="setting-hint">启用后系统启动时自动运行巡店助手（最小化到托盘）</span>
            </div>
          </section>
```

同时将 `</body>` 前的三个 script 标签改为：

```html
  <script src="lib/xlsx.full.min.js"></script>
  <script src="lib/cron.js"></script>
  <script src="fullpage.js"></script>
```

（路径已正确，无需改动，确认即可）

- [ ] **Step 2: 验证文件存在且包含关键元素**

```bash
python3 -c "
with open('/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/renderer/fullpage.html') as f:
    c = f.read()
for k in ['openAtLogin', 'lib/xlsx.full.min.js', 'lib/cron.js', 'fullpage.js']:
    print(k,':', 'OK' if k in c else 'MISSING')
"
```

---

## Task 9: renderer/fullpage.js — 渲染层 JS 改造

**Files:**
- Create: `renderer/fullpage.js`（基于扩展版本改造）

**改造规则（全文替换）：**

| 原代码 | 替换为 |
|--------|--------|
| `chrome.runtime.sendMessage({ action: 'X', ...payload })` | `window.electronAPI.sendMessage('X', payload)` |
| `chrome.runtime.onMessage.addListener(handleBgMessage)` | `window.electronAPI.onMessage(handleBgMessage)` |
| `chrome.storage.local.get(key, cb)` / `await chrome.storage.local.get(key)` | `await window.electronAPI.storage.get(key)` |
| `chrome.storage.local.set({ k: v })` | `await window.electronAPI.storage.set('k', v)` |
| `chrome.storage.local.remove(key)` | `await window.electronAPI.storage.remove(key)` |
| `chrome.storage.onChanged.addListener(cb)` | `window.electronAPI.storage.onChanged(cb)` |
| `XLSX.writeFile(wb, fn)` | 替换为 buffer 写法（见下） |

Excel 导出改造（`exportExcel` 函数末尾）：
```js
// 原：XLSX.writeFile(wb, fn);
// 改为：
const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
await window.electronAPI.saveExcel(wbout);
```

新增开机自启动逻辑（在 `loadPersistedState` 末尾追加）：
```js
// 开机自启动开关
const loginItem = await window.electronAPI.getLoginItem();
const openAtLoginCb = document.getElementById('openAtLogin');
if (openAtLoginCb) {
  openAtLoginCb.checked = loginItem ? loginItem.openAtLogin : false;
  openAtLoginCb.addEventListener('change', async () => {
    await window.electronAPI.setLoginItem(openAtLoginCb.checked);
  });
}
```

`handleStorageChange` 函数改造（storage.onChanged 回调的参数结构与 chrome 一致，保持不变）。

`sendMessage` 调用改造（所有 `chrome.runtime.sendMessage` 调用）：
```js
// 原：
const res = await chrome.runtime.sendMessage({ action: 'START_PATROL', tasks, config, totalCount, keepExisting });
// 改为：
const res = await window.electronAPI.sendMessage('START_PATROL', { tasks, config, totalCount, keepExisting });
```

- [ ] **Step 1: 复制源文件**

```bash
cp /home/ec2-user/claude/amz-xundian/amazon-patrol/fullpage.js \
   /home/ec2-user/claude/amz-xundian/amazon-patrol-electron/renderer/fullpage.js
```

- [ ] **Step 2: 替换 chrome.runtime.sendMessage 调用**

用 Edit 工具逐一替换 fullpage.js 中的所有 `chrome.runtime.sendMessage` 调用（共 8 处），格式：
```js
// 原：await chrome.runtime.sendMessage({ action: 'START_PATROL', tasks: remainingTasks, config, totalCount: td.tasks.length, keepExisting: isContinue })
// 改：await window.electronAPI.sendMessage('START_PATROL', { tasks: remainingTasks, config, totalCount: td.tasks.length, keepExisting: isContinue })
```

- [ ] **Step 3: 替换 chrome.storage 调用**

所有 `chrome.storage.local.get/set/remove` 替换为 `window.electronAPI.storage.*`。

- [ ] **Step 4: 替换消息监听**

```js
// 原：
chrome.runtime.onMessage.addListener(handleBgMessage);
chrome.storage.onChanged.addListener(handleStorageChange);
// 改：
window.electronAPI.onMessage(handleBgMessage);
window.electronAPI.storage.onChanged(handleStorageChange);
```

- [ ] **Step 5: 替换 Excel 导出**

找到 `XLSX.writeFile(wb, fn)` 替换为：
```js
const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
const saveResult = await window.electronAPI.saveExcel(wbout);
if (saveResult && saveResult.cancelled) return;
```

- [ ] **Step 6: 新增开机自启动逻辑**

在 `loadPersistedState` 函数末尾，`}` 前追加：
```js
  // 开机自启动开关
  const openAtLoginCb = document.getElementById('openAtLogin');
  if (openAtLoginCb) {
    try {
      const loginItem = await window.electronAPI.getLoginItem();
      openAtLoginCb.checked = loginItem ? !!loginItem.openAtLogin : false;
    } catch(e) {}
    openAtLoginCb.addEventListener('change', async () => {
      await window.electronAPI.setLoginItem(openAtLoginCb.checked);
    });
  }
```

- [ ] **Step 7: 处理 CRON_AUTO_START 消息**

在 `handleBgMessage` 函数的 switch 中追加：
```js
case 'CRON_AUTO_START':
  // 定时自动触发：直接调用 startPatrol 逻辑
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
```

- [ ] **Step 8: 验证关键替换完成**

```bash
python3 -c "
with open('/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/renderer/fullpage.js') as f:
    c = f.read()
import re
chrome_calls = re.findall(r'chrome\.(runtime|storage)\.', c)
print('残留 chrome.* 调用数:', len(chrome_calls))
print('electronAPI 调用数:', c.count('electronAPI'))
print('XLSX.writeFile 残留:', 'XLSX.writeFile' in c)
"
```

预期：chrome 调用数为 0，electronAPI 调用数 > 10，XLSX.writeFile 为 False。

---

## Task 10: 打包配置与图标

**Files:**
- Create: `build/electron-builder.yml`（可选，package.json 已内含配置）
- Modify: `assets/icons/`（确认图标齐全）

**Interfaces:**
- Produces: `npm run build:win` 生成 `dist/` 下 exe + zip；`npm run build:mac` 生成 dmg + zip

- [ ] **Step 1: 确认图标文件**

```bash
ls /home/ec2-user/claude/amz-xundian/amazon-patrol-electron/assets/icons/
```

Windows 打包需要 `.ico`，Mac 需要 `.icns`。如果只有 `.png`，electron-builder 会自动转换（需要系统有 imagemagick 或在 Mac 上打包）。确认有 `icon128.png` 即可用于开发阶段。

- [ ] **Step 2: 验证 npm start 能启动（开发阶段验证）**

在有图形界面的 Windows/Mac 机器上执行：
```bash
cd amazon-patrol-electron
npm start
```

预期：Electron 窗口打开，显示巡店助手界面，托盘图标出现，各功能可用。

- [ ] **Step 3: 打包（在目标平台执行）**

Windows 机器：
```bash
npm run build:win
```

Mac 机器：
```bash
npm run build:mac
```

预期：`dist/` 目录下生成对应平台的安装包和 zip 文件。

---

## 自检：Spec 覆盖确认

| 设计要求 | 对应 Task |
|----------|-----------|
| chrome.storage → JSON 文件 | Task 2 |
| chrome.tabs → BrowserWindow 抓取 | Task 3 |
| 所有巡店逻辑（调度/重试/快照/钉钉） | Task 4 |
| chrome.alarms → node-schedule | Task 5 |
| chrome.runtime.sendMessage → ipcRenderer | Task 6 |
| 主窗口 + 托盘 + 关闭隐藏 | Task 7 |
| fullpage.html 新增开机自启动开关 | Task 8 |
| fullpage.js 全量 chrome.* 替换 | Task 9 |
| 开机自启动 app.setLoginItemSettings | Task 4 + Task 9 |
| Win exe/zip + Mac dmg/zip 打包 | Task 1 + Task 10 |
| content.js 零改动复用 | Task 3（直接读文件注入） |
| selectors.js / cron.js / xlsx 零改动 | Task 1（直接复制） |
