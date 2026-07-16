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

