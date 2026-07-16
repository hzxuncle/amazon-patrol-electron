# Task 7 Report: main.js — 主进程入口

**Status:** DONE

## 实现内容

创建了 `electron/main.js`，实现主进程所有生命周期功能：

### 主窗口 (`createWindow`)
- BrowserWindow 1400×900，最小 1000×600
- 加载 `renderer/fullpage.html`（`path.join(__dirname, '../renderer/fullpage.html')`）
- preload 指向 `path.join(__dirname, 'preload.js')`
- `contextIsolation: true`，`nodeIntegration: false`
- `close` 事件：`e.preventDefault()` + `mainWindow.hide()`（隐藏到托盘，不退出）
- 调用 `ipcHandlers.setMainWindow(mainWindow)`

### 系统托盘 (`createTray`)
- 图标：`assets/icons/icon16.png`
- 左键单击：`show` + `focus` 主窗口
- 右键菜单：「显示窗口」和「退出」（`app.exit(0)`）

### 定时触发 (`onCronTrigger`)
- 读取 `store.get('asinInputCache')` 解析 ASIN 列表
- 读取 `store.get('patrolConfig')` 或使用默认配置
- 构建 tasks 数组（asin × site 笛卡尔积）
- 向 `mainWindow.webContents.send('CRON_AUTO_START', { tasks, config })` 发送

### 应用生命周期
- `app.whenReady()`：注册 IPC、创建窗口与托盘、设置 scheduler 回调、启动 scheduler、恢复 openAtLogin 设置
- `window-all-closed`：不调用 `app.quit()`（托盘模式）
- `activate`：显示主窗口（macOS Dock 点击）

## 验证

```
node --check electron/main.js → OK
所有关键符号：createWindow/createTray/onCronTrigger/scheduler.start/ipcHandlers.register → OK
```
