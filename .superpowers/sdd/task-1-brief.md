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

