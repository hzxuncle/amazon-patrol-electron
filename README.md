# 亚马逊巡店助手 Electron 版

将 Chrome 扩展版（`amazon-patrol`）改造为 Windows + Mac 双平台桌面应用，保留全部巡店功能，新增系统托盘、开机自启动、定时任务运行时不依赖浏览器窗口。

## 功能

与扩展版完全一致：

- **多站点巡检**：CA / US / AU / MX
- **抓取字段**：售价、划线价、星级、评论数、卖家、库存、父体 ASIN、活动标、AC 标、Coupon
- **参考对比**：导入 Excel 预设期望值，自动标红偏差项
- **历史快照**：每次巡检后自动保存，支持与上次对比
- **智能重试**：一键重试失败项，自动降低并发
- **定时巡店**：Cron 表达式配置，到点自动触发，关闭主窗口后托盘继续运行
- **钉钉推送**：巡检完成后发送异常报告（需导入参考数据）
- **Excel 导出**：巡检明细 + 异常汇总双 Sheet

Electron 版新增：

- **系统托盘**：关闭主窗口后应用最小化到托盘，不退出
- **开机自启动**：设置面板可选，系统启动时自动进托盘
- **无浏览器依赖**：不需要安装 Chrome 扩展，独立运行

## 安装与运行

### 开发模式

```bash
# 安装依赖（需 Node.js ≥16）
npm install

# 启动
npm start
```

### 打包

打包需在目标平台执行，且需先准备平台专用图标（见下方「打包准备」）。

```bash
npm run build:win   # 在 Windows 上执行，生成 dist/ 下 .exe 安装包 + .zip 绿色版
npm run build:mac   # 在 Mac 上执行，生成 dist/ 下 .dmg + .zip
npm run build:all   # 同时打两个平台（需在 Mac 上执行）
```

### 打包准备：生成平台图标

**Windows（.ico）**

在有 ImageMagick 的环境下：
```bash
magick convert assets/icons/icon256.png -define icon:auto-resize=256,128,64,48,32,16 assets/icons/icon.ico
```

**Mac（.icns）**

在 Mac 上：
```bash
mkdir icon.iconset
sips -z 16 16   assets/icons/icon256.png --out icon.iconset/icon_16x16.png
sips -z 32 32   assets/icons/icon256.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32   assets/icons/icon256.png --out icon.iconset/icon_32x32.png
sips -z 64 64   assets/icons/icon256.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 assets/icons/icon256.png --out icon.iconset/icon_128x128.png
sips -z 256 256 assets/icons/icon256.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 assets/icons/icon256.png --out icon.iconset/icon_256x256.png
iconutil -c icns icon.iconset -o assets/icons/icon.icns
rm -rf icon.iconset
```

## 目录结构

```
amazon-patrol-electron/
├── electron/
│   ├── main.js          主进程：窗口管理、托盘、生命周期
│   ├── preload.js       contextBridge：暴露 window.electronAPI 给渲染进程
│   ├── store.js         数据持久化：JSON 文件读写，替换 chrome.storage
│   ├── ipc-handlers.js  IPC 路由：巡店核心逻辑，替换 background.js
│   ├── tab-manager.js   抓取层：BrowserWindow 池，替换 chrome.tabs
│   └── scheduler.js     定时层：node-schedule，替换 chrome.alarms
├── renderer/
│   ├── fullpage.html    主界面（新增「开机自启动」开关）
│   ├── fullpage.js      界面逻辑（chrome.* → window.electronAPI.*）
│   ├── fullpage.css     样式（零改动）
│   ├── selectors.js     CSS 选择器配置（零改动）
│   └── lib/
│       ├── cron.js      Cron 表达式解析器（零改动）
│       └── xlsx.full.min.js  Excel 库（零改动）
├── assets/icons/        应用图标（16/48/128/256px PNG）
└── package.json         依赖与打包配置
```

## 技术架构

### 与 Chrome 扩展版的对比

| 模块 | Chrome 扩展 | Electron 版 |
|------|------------|-------------|
| 调度与逻辑 | `background.js`（Service Worker） | `electron/ipc-handlers.js`（主进程） |
| 定时任务 | `chrome.alarms` | `node-schedule` |
| Tab 管理 | `chrome.tabs` | `BrowserWindow`（`show: false`） |
| 数据存储 | `chrome.storage.local` | 本地 JSON 文件（`userData` 目录） |
| 消息通信 | `chrome.runtime.sendMessage` | `ipcRenderer.invoke` / `ipcMain.handle` |
| 系统通知 | Chrome Notifications API | `electron.Notification` |
| 文件下载 | `chrome.downloads` | `dialog.showSaveDialog` + `fs.writeFileSync` |
| 抓取逻辑 | `content.js`（扩展注入） | `content.js`（`executeJavaScript` 注入，零改动） |

### 数据流

```
renderer/fullpage.js
  → window.electronAPI.sendMessage('START_PATROL', payload)
    → ipcRenderer.invoke
      → ipcMain.handle('START_PATROL')   [ipc-handlers.js]
        → Worker Pool（async 循环）
          → tab-manager.openTabForTask()
            → new BrowserWindow({ show: false })
            → loadURL(amazon.com/dp/ASIN)
            → executeJavaScript(selectors.js + content.js)
            → ipcMain.handleOnce(channel) ← ipcRenderer.invoke(channel, result)
          → broadcastUpdate(result)
            → mainWindow.webContents.send('PATROL_UPDATE')
              → preload PATROL_UPDATE → window.electronAPI.onMessage(cb)
                → fullpage.js handleUpdate()

chrome.alarms → scheduler.js (node-schedule)
  → 每分钟 tick，CronParser.matchesCron
  → 命中 → main.js onCronTrigger()
    → mainWindow.webContents.send('CRON_AUTO_START', { tasks, config })
      → fullpage.js handleBgMessage → startPatrol()
```

### 数据存储位置

所有数据存为单一 `store.json` 文件：

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\amazon-patrol\store.json` |
| Mac | `~/Library/Application Support/amazon-patrol/store.json` |

存储的键：

| 键 | 内容 |
|----|------|
| `patrolSettings` | 并发/间隔/超时等参数、钉钉 Webhook |
| `cronConfig` | Cron 表达式、是否启用 |
| `patrolConfig` | 最后一次使用的巡店参数（供定时触发读取） |
| `patrolResults` | 上次巡店结果 |
| `patrolState` | 巡店运行状态 |
| `historySnapshots` | 历史快照（每 ASIN 最多 10 条） |
| `asinInputCache` | ASIN 输入框内容（供定时触发读取） |
| `referenceData` | 导入的参考数据 |
| `openAtLogin` | 开机自启动开关状态 |

### 反反爬策略

与扩展版完全一致（抓取逻辑零改动）：

- `content.js` 通过 `executeJavaScript` 注入真实 Chromium 页面（非无头浏览器）
- BrowserWindow 使用真实 Chromium 内核，UA 和指纹与正常浏览器一致
- MutationObserver 等待 DOM 稳定后再抓取
- 随机延迟 + 模拟滚动
- 批次休息、重试降速

## 使用说明

### 首次启动

1. 运行安装包或直接启动 exe/app
2. 主窗口打开，点击顶部扩展图标区域进入全屏面板
3. 界面与 Chrome 扩展版完全一致

### 定时巡店配置

1. 先在「巡店」面板输入 ASIN 并勾选目标站点
2. 切换到「定时」面板，填写 Cron 表达式（或用快捷预设）
3. 确认右侧出现 **✓ 有效**，打开启用开关
4. 点击「保存定时配置」
5. 关闭主窗口后应用继续在托盘运行，到点自动触发

### 托盘操作

- **左键**托盘图标：显示主窗口
- **右键**托盘图标：菜单（显示窗口 / 退出）
- 点击主窗口关闭按钮：隐藏到托盘（不退出）
- 彻底退出：右键托盘 → 退出

### 开机自启动

设置面板 → 系统设置 → 勾选「开机自动启动」，系统启动时应用自动进托盘后台。

## 注意事项

- 遇到验证码（status = captcha）需手动打开对应页面完成验证，不会自动重试
- 数据存储在本地 `store.json`，卸载应用不会自动删除，如需清除请手动删除对应目录
- 定时任务在电脑睡眠/休眠时无法触发，建议在电源设置中关闭自动睡眠
- 钉钉推送需同时满足：启用 Webhook + 已导入参考数据
- Mac 首次运行可能提示「无法验证开发者」，在系统偏好设置 → 安全性 → 允许运行即可
