# 亚马逊巡店助手 Electron 版

将 Chrome 扩展版（`amazon-patrol`）改造为 Windows + Mac 双平台桌面应用，保留全部巡店功能，新增系统托盘、开机自启动、配送地设置、执行日志、历史记录等功能。

## 功能

- **多站点巡检**：CA / US / AU / MX
- **抓取字段**：售价、划线价、星级、评论数、卖家、库存、父体 ASIN、活动标、AC 标、Coupon
- **参考对比**：导入 Excel 预设期望值，自动标红偏差项
- **历史快照**：每次巡检后自动保存，支持与上次对比
- **智能重试**：一键重试失败项，自动降低并发
- **定时巡店**：Cron 表达式配置，到点自动触发，关闭主窗口后托盘继续运行
- **配送地设置**：按站点配置邮编，确保价格/库存按目标地区显示
- **执行日志**：实时显示每条任务抓取状态，最多保留 500 条
- **巡店历史**：保留近 10 次巡店摘要，点击可查看该次 ASIN 级别详情
- **钉钉推送**：巡检完成后发送异常报告（需导入参考数据）
- **Excel 导出**：巡检明细 + 异常汇总双 Sheet
- **主题切换**：浅色（RENPHO 品牌风格）/ 深色双主题，右上角一键切换，自动记忆

Electron 版新增：

- **系统托盘**：关闭主窗口后应用最小化到托盘，不退出
- **开机自启动**：设置面板可选，系统启动时自动进托盘
- **显示抓取窗口**：设置面板可开启，巡店时可见后台 Amazon 页面，便于调试
- **无浏览器依赖**：不需要安装 Chrome 扩展，独立运行

## 安装与运行

### 开发模式

```bash
# 安装依赖（需 Node.js ≥16）
npm install

# 启动（自动打开 DevTools，方便调试）
npm start
```

> **Windows 控制台中文乱码**：在终端执行 `chcp 65001` 后再运行，或在 PyCharm Terminal 设置中将 Shell path 改为 `cmd.exe /K chcp 65001`。

### 打包

打包需在目标平台执行，且需先准备平台专用图标（见下方「打包准备」）。

```bash
npm run build:win   # 在 Windows 上执行，生成 dist/ 下 .exe 安装包 + .zip 绿色版
npm run build:mac   # 在 Mac 上执行，生成 dist/ 下 .dmg + .zip
npm run build:all   # 同时打两个平台（需在 Mac 上执行）
```

### 打包准备：生成平台图标

**Windows（.ico）**

```bash
magick convert assets/icons/icon256.png -define icon:auto-resize=256,128,64,48,32,16 assets/icons/icon.ico
```

**Mac（.icns）**

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
│   ├── main.js          主进程：窗口管理、托盘、生命周期、定时触发
│   ├── preload.js       contextBridge：暴露 window.electronAPI 给渲染进程
│   ├── store.js         数据持久化：JSON 文件读写，替换 chrome.storage
│   ├── ipc-handlers.js  IPC 路由：巡店核心逻辑、执行日志推送、历史记录保存
│   ├── tab-manager.js   抓取层：BrowserWindow 池、配送地初始化、UA 伪装
│   └── scheduler.js     定时层：node-schedule，替换 chrome.alarms
├── renderer/
│   ├── fullpage.html    主界面
│   ├── fullpage.js      界面逻辑（chrome.* → window.electronAPI.*）
│   ├── fullpage.css     样式（Light/Dark 双主题）
│   ├── content.js       Amazon 页面抓取脚本（零改动）
│   ├── selectors.js     CSS 选择器配置（零改动）
│   └── lib/
│       ├── cron.js      Cron 表达式解析器
│       └── xlsx.full.min.js  Excel 库
├── assets/
│   ├── icons/           应用图标（16/48/128/256px PNG）
│   └── logo.png         RENPHO 品牌 Logo
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

### 抓取流程

```
巡店开始
  → 每个站点初始化配送地（仅第一个任务触发，后续复用 Cookie）
    → loadURL(首页) → AJAX 设置邮编
  → Worker Pool 并发抓取
    → new BrowserWindow({ show: false })
    → setUserAgent(Chrome 120 真实 UA)
    → loadURL(amazon.com/dp/ASIN?language=en_US)
    → executeJavaScript(selectors.js + content.js)
    → Promise 直接返回抓取结果
  → broadcastUpdate → 实时推送到界面 + 日志 Tab
  → 巡店完成 → 保存历史记录 → 系统通知 → 钉钉推送
```

### 定时触发链路

```
node-schedule 每分钟 tick
  → CronParser.matchesCron 命中
  → main.js onCronTrigger()
    → 读取 asinInputCache + patrolConfig
    → mainWindow.webContents.send('CRON_AUTO_START')
      → fullpage.js 自动调用 startPatrol()
```

### 数据存储位置

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\amazon-patrol\store.json` |
| Mac | `~/Library/Application Support/amazon-patrol/store.json` |

| 键 | 内容 |
|----|------|
| `patrolSettings` | 并发/间隔/超时/钉钉 Webhook/配送地邮编等 |
| `cronConfig` | Cron 表达式、是否启用 |
| `patrolConfig` | 最后一次巡店完整参数（供定时触发读取） |
| `patrolResults` | 上次巡店结果 |
| `patrolState` | 巡店运行状态 |
| `historySnapshots` | 各 ASIN 历史价格快照（每个最多 10 条） |
| `patrolHistory` | 近 10 次巡店摘要 + 结果 |
| `asinInputCache` | ASIN 输入框内容（供定时触发读取） |
| `referenceData` | 导入的参考数据 |
| `openAtLogin` | 开机自启动状态 |
| `appTheme` | 界面主题（light / dark） |

### 反反爬策略

- `content.js` 通过 `executeJavaScript` 注入真实 Chromium 页面（非无头浏览器）
- `nodeIntegration: false`，避免 `window.require` 被 Amazon 检测
- UA 设置为 Chrome 120 真实 User-Agent，去掉 Electron 标记
- 每个站点首次抓取前通过 AJAX 设置配送地邮编，后续任务复用 Cookie
- MutationObserver 等待 DOM 稳定后再抓取
- 随机延迟 + 模拟滚动
- 批次休息、重试降速

## 使用说明

### 界面标签页

| 标签 | 说明 |
|------|------|
| 巡店 | 输入 ASIN、选站点、开始巡店、查看结果 |
| 参考数据 | 导入 Excel 预设期望值 |
| 定时 | 配置 Cron 定时自动巡店 |
| 日志 | 实时查看每条任务执行日志 |
| 历史 | 近 10 次巡店记录，点击查看详情 |
| 设置 | 并发参数、配送地邮编、钉钉、系统设置 |

### 配送地设置

设置面板 → 配送地设置，填入各站点邮编：

| 站点 | 建议邮编 | 说明 |
|------|---------|------|
| US | `10001` | 纽约 |
| CA | `M5V 3A8` | 多伦多 |
| AU | `2000` | 悉尼 |
| MX | `06600` | 墨西哥城 |

每次巡店开始时，每站点自动初始化一次配送地，后续任务复用，不会影响抓取速度。

### 单个 ASIN 执行时间参考

| 情况 | 4站点耗时 |
|------|---------|
| 正常网络 | ~19s |
| 网络较慢 | ~45s |
| 全部超时（最坏） | ~87s |

### 定时巡店配置

1. 先在「巡店」面板填好 ASIN 并勾选目标站点
2. 切换到「定时」面板，填写 Cron 表达式（或用快捷预设）
3. 确认右侧出现 **✓ 有效**，打开启用开关
4. 点击「保存定时配置」
5. 关闭主窗口后应用继续在托盘运行，到点自动触发

> 定时触发时读取「巡店」面板保存的 ASIN 和上次巡店配置，无需手动操作。

### 托盘操作

- **左键**托盘图标：显示主窗口
- **右键**托盘图标：显示窗口 / 退出
- 点击主窗口关闭按钮：隐藏到托盘（不退出）
- 彻底退出：右键托盘 → 退出

### 主题切换

右上角 🌙 / ☀️ 按钮一键切换浅色/深色主题，自动保存。

### 调试

开发模式（`npm start`）下主窗口自动打开 DevTools，可在 Console 查看所有执行日志。也可在「日志」标签页查看实时抓取日志。设置面板开启「显示抓取窗口」后巡店时可见后台 Amazon 页面。

## 注意事项

- 遇到验证码（status = captcha）需手动打开对应页面完成验证，不会自动重试
- 数据存储在本地 `store.json`，卸载应用不会自动删除
- 定时任务在电脑睡眠/休眠时无法触发，建议关闭自动睡眠
- 钉钉推送需同时满足：启用 Webhook + 已导入参考数据
- Mac 首次运行可能提示「无法验证开发者」，在系统偏好设置 → 安全性 → 允许运行即可
- Windows 控制台中文乱码：执行 `chcp 65001` 后再运行
