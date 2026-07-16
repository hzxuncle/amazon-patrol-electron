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

