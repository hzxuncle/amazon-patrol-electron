# 亚马逊监控助手 v1.0.0

将 Chrome 扩展版（`amazon-patrol`）改造为 Windows + Mac 双平台桌面应用，保留全部巡检功能，新增系统托盘、开机自启动、钉钉通知、产品信息抓取、站点管理等功能。

## 功能

- **多站点巡检**：支持 20 个 Amazon 站点，每个站点独立配置 ASIN 列表，内部统一用二字码（CA/US/AU/MX 等）标识
- **抓取字段**：售价、划线价、星级、评论数、卖家、库存、父体 ASIN、活动标、AC 标、Coupon、产品信息
- **产品信息**：原样抓取各站点 Product information 所有折叠区块，点击「查看」展开浮层查看完整键值对，支持 20 个站点多语言
- **参考对比**：导入 Excel 预设期望值（必须含 ASIN 和站点列），自动标红偏差项，导入时自动按站点填入巡检面板；巡检面板「启用对比」开关控制是否进行对比
- **缺货保护**：缺货商品（Out of Stock）价格自动清空，避免误抓页面推荐区价格
- **下架检测**：商品重定向到其他 ASIN 时自动标记为失败并提示已下架
- **并发安全**：多 Worker 并发时同一站点配送地只初始化一次，避免竞争条件
- **历史快照**：每次巡检后自动保存，支持与上次对比
- **智能重试**：一键重试失败项，自动降低并发
- **定时巡检**：Cron 表达式配置，到点自动触发，关闭主窗口后托盘继续运行；修改配置后无需手动触发即生效
- **站点管理**：内置 20 个 Amazon 站点，支持增删改，可启用/禁用，邮编统一管理；启用状态实时同步到巡检面板
- **钉钉通知**：支持群通知（Webhook）和个人工作通知（AppKey/AppSecret/AgentId），通过手机号自动转换为 userId；群通知和个人通知互斥，由巡检面板开关控制
- **执行日志**：实时显示每条任务抓取状态，最多保留 500 条
- **巡检历史**：保留近 10 次巡检摘要，点击可查看该次 ASIN 级别详情
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
# 国内网络建议加镜像参数，否则 Electron 二进制下载会很慢
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install --registry=https://registry.npmmirror.com

# 启动（自动打开 DevTools，方便调试）
npm start
```

> **国内网络提示**：也可以在项目根目录新建 `.npmrc` 文件，永久生效，避免每次输入参数：
> ```
> registry=https://registry.npmmirror.com
> ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> ```

> **npm 安全提示**：首次安装时 npm 可能拦截 Electron 安装脚本，提示 `allow-scripts`。执行以下命令批准后重新安装：
> ```bash
> npm approve-scripts electron
> ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install --registry=https://registry.npmmirror.com
> ```

> **Windows 控制台中文乱码**：在终端执行 `chcp 65001` 后再运行，或在 PyCharm Terminal 设置中将 Shell path 改为 `cmd.exe /K chcp 65001`。

### 打包

打包需在目标平台执行，且需先准备平台专用图标（见下方「打包准备」）。

```bash
npm run build:win   # 在 Windows 上执行，生成 dist/ 下 .exe 安装包 + .zip 绿色版
npm run build:mac   # 在 Mac 上执行，生成 dist/ 下 .dmg + .zip
npm run build:all   # 同时打两个平台（需在 Mac 上执行）
```

国内网络打包时同样需要镜像，否则 electron-builder 会从 GitHub 下载 Electron 二进制（约 100MB）：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run build:mac
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run build:win
```

### GitHub Actions 自动构建

推送 `v*` 格式的 tag 会自动触发 CI，在 Windows 和 Mac 环境下分别构建，产物上传为 Artifact，并自动创建 GitHub Release：

```bash
git tag v1.0.0
git push origin v1.0.0
```

也可以在 GitHub 仓库的 Actions 页面手动触发（workflow_dispatch）。构建产物包含：
- Windows：`.exe` 安装包 + `.zip` 绿色版
- Mac：`.dmg` + `.zip`（x64 + arm64）

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
│   ├── main.js           主进程：窗口管理、托盘、生命周期、定时触发
│   ├── preload.js        contextBridge：暴露 window.electronAPI 给渲染进程
│   ├── store.js          数据持久化：5 个 JSON 文件读写
│   ├── sites-data.js     20 个站点内置数据（域名/二字码/邮编格式）
│   ├── ipc-handlers.js   IPC 路由：巡检核心逻辑、日志推送、历史记录
│   ├── tab-manager.js    抓取层：BrowserWindow 池、配送地初始化、并发控制
│   └── scheduler.js      定时层：node-schedule
├── renderer/
│   ├── fullpage.html     主界面
│   ├── fullpage.js       界面逻辑
│   ├── fullpage.css      样式（Light/Dark 双主题）
│   ├── sites/            抓取引擎（按站点拆分）
│   │   ├── _base/        通用基准层
│   │   │   ├── selectors.js   通用选择器
│   │   │   ├── parsers.js     通用解析函数
│   │   │   ├── normalizers.js 通用归一化
│   │   │   └── scraper.js     抓取主流程
│   │   ├── us/           amazon.com 专用配置
│   │   ├── ca/           amazon.ca 专用配置
│   │   ├── au/           amazon.com.au 专用配置
│   │   ├── mx/           amazon.com.mx 专用配置（含多语言解析覆盖）
│   │   └── index.js      Node端入口：按站点构建注入脚本
│   └── lib/
│       ├── cron.js       Cron 表达式解析器
│       └── xlsx.full.min.js  Excel 库
├── docs/
│   └── scraper-architecture.md  抓取引擎架构设计文档
├── assets/
│   ├── icons/            应用图标
│   └── logo.png          RENPHO 品牌 Logo
└── package.json          依赖与打包配置
```

## 技术架构

> **抓取引擎架构设计文档**：[docs/scraper-architecture.md](docs/scraper-architecture.md)
>
> 记录了抓取引擎按站点拆分的设计决策、职责分工、实测数据和新增站点流程。

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

### 抓取引擎架构

抓取引擎按站点拆分为独立目录，每个站点有自己的选择器、解析函数和归一化逻辑，互不干扰。详见 [docs/scraper-architecture.md](docs/scraper-architecture.md)。

```
renderer/sites/
├── _base/          通用基准（选择器/解析/归一化/抓取流程）
├── us/ ca/ au/ mx/ 站点专用覆盖（只写与 _base 不同的部分）
└── index.js        Node端：按站点合并后注入页面
```

**新增站点**：在 `renderer/sites/` 下建目录，写有差异的文件（至少 `selectors.js`），其余自动 fallback 到 `_base`。

### 抓取流程

```
巡检开始
  → 每个站点初始化配送地（并发安全：同一站点只初始化一次，其余 Worker 等待同一 Promise）
    → loadURL(首页) → AJAX 设置邮编
  → Worker Pool 并发抓取
    → new BrowserWindow({ show: false })
    → setUserAgent(Chrome 120 真实 UA)
    → loadURL(amazon.xx/dp/ASIN?language=xx_XX)
    → sites/index.js 按站点构建注入脚本（选择器+解析+归一化+抓取流程）
    → executeJavaScript → window.__SCRAPER__.handleScrape()
    → Promise 直接返回抓取结果
  → broadcastUpdate → 实时推送到界面 + 日志 Tab
  → 巡检完成 → 保存历史记录 → 系统通知 → 钉钉推送
```

### 定时触发链路

```
node-schedule 每分钟 tick
  → CronParser.matchesCron 命中
  → main.js onCronTrigger()
    → 读取 asinInputCache（站点分组数组）+ patrolSettings
    → mainWindow.webContents.send('CRON_AUTO_START')
      → fullpage.js 自动调用 startPatrol()
```

### 数据存储位置

数据文件存储于：

| 平台 | 目录 |
|------|------|
| Windows | `%APPDATA%\amazon-patrol\` |
| Mac | `~/Library/Application Support/amazon-patrol/` |

数据分散为 5 个 JSON 文件：

| 文件 | 内容 | 读写频率 |
|------|------|---------|
| `settings.json` | `patrolSettings`、`cronConfig`、`appTheme`、`openAtLogin` | 高频（UI 变更时实时写入） |
| `state.json` | `patrolState`、`patrolResults`、`lastUpdate`、`asinInputCache` | 中频（巡店周期内变化） |
| `history.json` | `patrolHistory`、`historySnapshots` | 低频（每次巡店完成追加） |
| `reference.json` | `importedAt`、`fileName`、`rows`（参考数据） | 极低频（用户手动导入） |
| `sites.json` | 20 站点配置（`domain`、`zip`、`enabled` 等） | 极低频（用户手动配置） |

**settings.json 示例：**

```json
{
  "patrolSettings": {
    "concurrency": 2,
    "pageInterval": 4000,
    "intervalJitter": 2000,
    "batchSize": 20,
    "batchRest": 30000,
    "scrapeTimeout": 25000,
    "maxRetries": 3,
    "retryDelay": 2000,
    "dingtalkWebhook": "https://..."
  },
  "cronConfig": {
    "enabled": true,
    "expr": "0 9 * * 1-5"
  },
  "appTheme": "light",
  "openAtLogin": false
}
```

**state.json 示例：**

```json
{
  "patrolState": {
    "running": false,
    "totalCount": 10,
    "completedCount": 10
  },
  "patrolResults": [
    {
      "asin": "B08XYZ1234",
      "site": "www.amazon.com",
      "status": "success",
      "price": "$29.99",
      "listPrice": "$39.99",
      "rating": "4.5",
      "reviews": "1234",
      "seller": "Amazon.com",
      "stock": "有货",
      "dealBadge": "",
      "acBadge": false,
      "coupon": "优惠券 5%",
      "parentAsin": "B08XYZ0000"
    }
  ],
  "lastUpdate": 1721234567890,
  "asinInputCache": [
    { "site": "www.amazon.com", "asins": "B08XYZ1234\nB09ABC5678" },
    { "site": "www.amazon.ca",  "asins": "B0CABC1234\nB0DABC5678" }
  ]
}
```

**history.json 示例：**

```json
{
  "patrolHistory": [
    {
      "completedAt": "2026-07-01T09:05:00.000Z",
      "total": 8,
      "success": 7,
      "failed": 1,
      "captcha": 0,
      "elapsed": 42000,
      "isRetry": false,
      "results": [
        { "asin": "B08XYZ1234", "site": "www.amazon.com", "status": "success", "price": "$29.99", "stock": "有货", "seller": "Amazon.com", "error": "" }
      ]
    }
  ],
  "historySnapshots": {
    "B08XYZ1234_www.amazon.com": {
      "asin": "B08XYZ1234",
      "site": "www.amazon.com",
      "snapshots": [
        {
          "timestamp": "2026-07-01T09:00:00.000Z",
          "price": "$29.99",
          "stock": "有货"
        }
      ]
    }
  }
}
```

**reference.json 示例：**

```json
{
  "importedAt": 1721234567890,
  "fileName": "reference_2026-07-01.xlsx",
  "rows": [
    { "asin": "B08XYZ1234", "expectedPrice": "29.99", "expectedStock": "有货", "site": "www.amazon.com" }
  ]
}
```

**sites.json 示例：**

```json
{
  "sites": [
    { "domain": "www.amazon.com", "zip": "10001", "enabled": true },
    { "domain": "www.amazon.ca", "zip": "M5V 3A8", "enabled": true },
    { "domain": "www.amazon.com.au", "zip": "2000", "enabled": false },
    { "domain": "www.amazon.com.mx", "zip": "06600", "enabled": true }
  ]
}
```

**各文件/键说明：**

| 文件 | 键 | 写入时机 | 说明 |
|------|----|---------|----|
| `settings.json` | `patrolSettings` | 界面任意设置项变更时实时写入 | 并发、页面间隔、批次参数、钉钉等配置 |
| `settings.json` | `cronConfig` | 拨动定时开关 / 点「保存 Cron 表达式」时写入 | 定时任务的表达式和启用状态 |
| `settings.json` | `appTheme` | 点击主题切换按钮时写入 | `"light"` 或 `"dark"` |
| `settings.json` | `openAtLogin` | 设置面板切换开机自启动时写入 | 同步调用系统 `setLoginItemSettings` |
| `state.json` | `asinInputCache` | 站点分组内容变更时实时写入 | 数组格式 `[{site, asins}]`，供定时触发读取 |
| `state.json` | `patrolState` | 巡店开始/结束时写入 | `running` 标志用于页面刷新后恢复进行中状态 |
| `state.json` | `patrolResults` | 每次巡店完成时覆盖写入 | 当前最新一次巡店的完整结果 |
| `state.json` | `lastUpdate` | 同 `patrolResults` | 最后一次巡店完成的时间戳（毫秒） |
| `history.json` | `patrolHistory` | 每次巡店完成时追加 | 近 10 次巡店的摘要（含结果列表），用于历史 Tab |
| `history.json` | `historySnapshots` | 每次巡店完成时追加 | 按 `ASIN_站点` 为 key，每个组合最多保留 10 条价格快照 |
| `reference.json` | `importedAt`、`fileName`、`rows` | 导入 Excel 参考数据时写入 | 预设期望值，用于标红偏差和钉钉异常推送 |
| `sites.json` | `sites` | 用户在「站点」Tab 手动配置时写入 | 20 个 Amazon 站点的启用状态和配送邮编 |

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

侧边栏顺序：**监控 / 对比数据 / 定时任务 / 站点管理 / 巡店历史 / 日志 / 设置**

| 标签 | 说明 |
|------|------|
| 监控 | 站点分组卡片输入 ASIN，配置抓取字段和通知开关，查看巡检结果 |
| 对比数据 | 导入 Excel 预设期望值（必须含站点列），显示上次导入信息，自动填充巡检面板 |
| 定时任务 | 配置 Cron 定时自动巡检，启用开关实时生效无需额外保存 |
| 站点管理 | 管理 20 个 Amazon 站点，支持增删改，配置邮编和启用状态，已启用排在前面 |
| 巡店历史 | 近 10 次巡检记录，点击查看详情 |
| 日志 | 实时查看每条任务执行日志 |
| 设置 | 并发参数、钉钉群/个人通知配置、系统设置 |

### 配送地设置

在「站点」Tab 管理所有站点的配送邮编。启用开关控制该站点是否出现在巡店面板的站点选择中，邮编用于巡店前初始化配送地。

每次巡店开始时，每个启用的站点自动初始化一次配送地，后续任务复用，不会影响抓取速度。

### 单个 ASIN 执行时间参考

| 情况 | 4站点耗时 |
|------|---------|
| 正常网络 | ~19s |
| 网络较慢 | ~45s |
| 全部超时（最坏） | ~87s |

### 定时巡店配置

1. 先在「巡店」面板按站点配置好 ASIN 分组
2. 切换到「定时」面板，填写 Cron 表达式（或用快捷预设）
3. 确认右侧出现 **✓ 有效**，点「保存 Cron 表达式」
4. 拨动标题旁的启用开关（立即生效，无需额外保存）
5. 关闭主窗口后应用继续在托盘运行，到点自动触发

> 定时触发时读取「巡店」面板最新的 ASIN 分组和设置参数，修改配置后直接生效，无需手动触发一次。

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
- 缺货商品（Out of Stock）价格和划线价自动清空，避免误抓推荐区价格
- 商品已下架（页面跳转到其他 ASIN）时自动标记为失败并显示跳转目标 ASIN
- MX/BR/JP 等非英语站点响应较慢，建议将「抓取超时」设置为 45 秒以上，避免误超时
- 新增站点抓取支持：在 `renderer/sites/` 下新建站点目录，至少提供 `selectors.js`，其余逻辑自动继承 `_base`
- 数据存储在本地 5 个 JSON 文件（settings.json、state.json、history.json、reference.json、sites.json），卸载应用不会自动删除
- 定时任务在电脑睡眠/休眠时无法触发，建议关闭自动睡眠；修改配置后无需手动触发，定时任务自动读取最新配置
- 钉钉通知（群/个人）需在监控面板开启对应开关，且已导入参考数据；群通知和个人通知互斥只能开一个
- 钉钉个人通知接收人填手机号（逗号分隔），系统自动通过 API 转换为 userId 后发送
- 参考数据 Excel 必须包含「ASIN」和「站点」两列，缺少「站点」列将报错；站点值使用二字码（CA/US/AU/MX 等）或完整域名（www.amazon.ca）均可
- 「产品信息」字段默认不开启，启用后抓取各站点 Product information 所有折叠区块的完整内容
- 全系统弹框采用自定义样式，与应用主题一致
- Mac 首次运行可能提示「无法验证开发者」，在系统偏好设置 → 安全性 → 允许运行即可
- Windows 控制台中文乱码：执行 `chcp 65001` 后再运行

---

## 常见问题排查

### 打包相关

**Q：`npm run build:win` 报错"无法创建符号链接：客户端没有所需的特权"**

winCodeSign 解压时需要创建 macOS 动态库的符号链接，Windows 默认用户没有此权限。

解决方式：
1. 清除损坏缓存：`rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"`
2. 以**管理员身份**打开 PowerShell，再执行 `npm run build:win`

---

**Q：`npm run build:win` 报错"proxyconnect tcp: dial tcp 127.0.0.1:7897: connectex: No connection could be made"**
**Q：`npm run build:mac` 下载 Electron 二进制很慢或超时**

electron-builder 下载 Electron 二进制时走了本地代理（未启动），或国内网络访问 GitHub 太慢。

解决方式：在项目根目录新建 `.npmrc` 文件，内容：
```
registry=https://registry.npmmirror.com
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

Windows 清除缓存后重试：`rmdir /s /q "%APPDATA%\electron\Cache"`

Mac 清除缓存后重试：`rm -rf ~/Library/Caches/electron`

---

**Q：打包完成但安装后应用图标仍显示 Electron 默认图标**

原因：`package.json` 中设置了 `signAndEditExecutable: false`，该选项会同时跳过代码签名和图标嵌入。

解决方式：改用 `"sign": null` 替代——只跳过代码签名，保留 rcedit 的图标嵌入：
```json
"win": {
  "icon": "assets/icons/icon.ico",
  "sign": null
}
```

---

**Q：打包报错"image icon.ico must be at least 256x256"**

`.ico` 文件的第一帧尺寸不满足要求。

解决方式：用 Python Pillow 重新生成，确保 256x256 在最前：
```python
from PIL import Image
img = Image.open('assets/icons/icon256.png').convert('RGBA')
sizes = [(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)]
imgs = [img.resize(s, Image.LANCZOS) for s in sizes]
imgs[0].save('assets/icons/icon.ico', format='ICO', sizes=sizes, append_images=imgs[1:])
```

---

### 安装相关

**Q：安装 exe 时弹出"亚马逊巡店助手无法关闭，请手动关闭后重试"**

安装程序检测到旧版本进程仍在运行（托盘模式常驻），无法覆盖文件。

解决方式：右键托盘图标 → 退出，再重新安装。新版本已加入单实例锁（`app.requestSingleInstanceLock()`），安装程序启动时旧实例会自动退出，无需手动操作。

---

### 运行相关

**Q：启动时报错"ENOENT: no such file or directory, open .../content.js"**

`content.js` 或 `selectors.js` 被打包进 `app.asar` 虚拟档案，但 `fs.readFileSync` 无法在打包环境下读取路径中含 `.asar` 的文件。

解决方式：在 `package.json` 的 `build` 配置中加入 `asarUnpack`，让这两个文件保持在真实文件系统：
```json
"asarUnpack": [
  "renderer/content.js",
  "renderer/selectors.js"
]
```

---

**Q：定时任务配置了 Cron 表达式但没有自动执行**

常见原因：启用开关未打开（`cronConfig.enabled` 为 `false`）。

排查步骤：
1. 打开「定时」面板，确认顶部滑块已打开（显示「定时已启用」）
2. 点击「保存定时配置」，确认按钮显示「已保存 ✓」
3. 检查 `settings.json` 中 `cronConfig.enabled` 是否为 `true`
4. 确认巡店面板已填写 ASIN，定时触发读取的是 `asinInputCache` 键（存储在 `state.json`）

---

**Q：巡店结果全部失败，价格/库存为空**

常见原因：Electron 内嵌 Chromium 默认配送地为中国，Amazon 对中国 IP 展示不同内容。

解决方式：在「站点」Tab 中，启用目标站点并填入对应的邮编（US: `10001`，CA: `M5V 3A8`）。

---

**Q：Windows 控制台日志中文乱码**

Node.js 输出 UTF-8，但 Windows 控制台默认 GBK 编码。

解决方式：
- 临时：在终端执行 `chcp 65001` 后再运行
- 永久：PyCharm Terminal 设置 → Shell path 改为 `cmd.exe /K chcp 65001`
