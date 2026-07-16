# 亚马逊巡店助手 Electron 版 设计文档

日期：2026-07-16

## 背景

将现有 Chrome 扩展 `amazon-patrol` 改造为 Electron 桌面应用，保留全部现有功能，增加系统级定时、托盘后台运行、开机自启动能力，支持 Windows 和 Mac 双平台。

## 目标

- 保留现有所有功能：多站点巡检、参考对比、历史快照、定时任务、钉钉推送、Excel 导出
- 增加：系统托盘、最小化到托盘、开机自启动（可选）
- 支持平台：Windows + Mac
- 分发格式：安装包（exe/dmg）+ 免安装绿色版（zip），每个平台各出两种

## 技术方案

方案一（最小改动封装）：主进程用 Electron 替换 `chrome.*` API，渲染进程直接复用现有 `fullpage.html/js`，改动集中在 API 映射层。界面零改动，开发周期最短。

## 目录结构

```
amazon-patrol-electron/
├── package.json
├── electron/
│   ├── main.js          # 主进程：窗口管理、托盘、自启动
│   ├── preload.js       # 预加载脚本：暴露安全 API 给渲染进程
│   ├── store.js         # 数据层：替换 chrome.storage → JSON 文件
│   ├── scheduler.js     # 定时层：替换 chrome.alarms → node-schedule
│   ├── tab-manager.js   # 抓取层：替换 chrome.tabs → BrowserWindow
│   └── ipc-handlers.js  # IPC 路由：替换 chrome.runtime.onMessage
├── renderer/
│   ├── fullpage.html    # 复制自扩展，少量修改
│   ├── fullpage.js      # 复制自扩展，chrome.* 替换为 window.electronAPI.*
│   ├── fullpage.css     # 直接复制，零改动
│   ├── selectors.js     # 直接复制，零改动
│   └── lib/
│       ├── cron.js              # 直接复制，零改动
│       └── xlsx.full.min.js     # 直接复制，零改动
├── assets/
│   └── icons/           # 托盘图标、应用图标（16/48/128/256px）
└── build/               # electron-builder 打包配置
```

## API 替换映射

| Chrome 扩展 API | Electron 替换 | 说明 |
|---|---|---|
| `chrome.storage.local.get/set` | `store.js`（JSON 文件读写） | 存到 userData 目录 |
| `chrome.runtime.sendMessage` | `ipcRenderer.invoke` | 渲染进程 → 主进程 |
| `chrome.runtime.onMessage` | `ipcMain.handle` | 主进程接收消息 |
| `chrome.tabs.create` | `new BrowserWindow` | 后台隐藏抓取窗口 |
| `chrome.tabs.remove` | `win.close()` | 关闭抓取窗口 |
| `chrome.tabs.sendMessage` | `win.webContents.send` | 向抓取页注入指令 |
| `chrome.tabs.onUpdated` | `win.webContents.on('did-finish-load')` | 页面加载完成 |
| `chrome.alarms` | `node-schedule` | 定时触发 |
| `chrome.notifications` | `electron.Notification` | 系统通知 |
| `chrome.downloads` | `dialog.showSaveDialog` + `fs.writeFile` | Excel 保存 |
| `chrome.scripting.executeScript` | `webContents.executeJavaScript` | 注入 content.js |

## 主进程设计

### 窗口管理
- 启动时创建主窗口，加载 `renderer/fullpage.html`
- 点击关闭按钮：隐藏窗口，不退出进程
- 托盘左键：呼出主窗口
- 托盘右键菜单：显示窗口 / 退出应用

### 开机自启动
- 通过 `app.setLoginItemSettings()` 实现，Win/Mac 通用
- 设置面板新增「开机自启动」开关，状态存到 `config.json`

### 定时任务（scheduler.js）
- 应用启动时读取 `cron.json`，若已启用则注册 `node-schedule` 任务
- 每分钟 tick，命中 cron 表达式时向主进程触发巡店
- 主窗口隐藏时定时任务照常运行

### 抓取窗口（tab-manager.js）
- 每个任务创建隐藏 `BrowserWindow`（`show: false`）
- 加载 Amazon 页面，`did-finish-load` 后注入 `selectors.js` + `content.js`
- 抓取完成后关闭窗口，与扩展后台 Tab 行为一致，反爬能力不变

## 数据存储

所有数据存为 JSON 文件，位置：

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\amazon-patrol\` |
| Mac | `~/Library/Application Support/amazon-patrol/` |

| 文件 | 内容 |
|------|------|
| `config.json` | 巡店参数、钉钉 Webhook、站点、字段勾选、开机自启动 |
| `cron.json` | 定时配置（表达式、是否启用） |
| `results.json` | 上次巡店结果 |
| `snapshots.json` | 历史快照（每 ASIN 最多 10 条） |
| `asin-cache.json` | ASIN 输入缓存 |

## 打包与分发

使用 `electron-builder`：

| 平台 | 产物 |
|------|------|
| Windows | `.exe` 安装包（NSIS）+ `.zip` 绿色版 |
| Mac | `.dmg` 安装镜像 + `.zip` 免安装版 |

```bash
npm run build:win    # 打 Windows 包
npm run build:mac    # 打 Mac 包
npm run build:all    # 同时打两个平台
```

> Mac 包须在 Mac 机器上执行打包命令。

## 渲染进程改动范围

`fullpage.js` 中所有 `chrome.*` 调用替换为 `window.electronAPI.*`，由 `preload.js` 统一暴露。其余文件（`fullpage.css`、`selectors.js`、`lib/`）零改动。

`content.js` 不在渲染进程加载，由主进程通过 `webContents.executeJavaScript` 注入到抓取窗口。
