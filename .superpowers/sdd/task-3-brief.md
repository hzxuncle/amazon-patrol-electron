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

