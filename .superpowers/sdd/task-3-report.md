# Task 3 Report: tab-manager.js

**Status:** DONE

## 完成内容

创建了 `electron/tab-manager.js`，实现 BrowserWindow 抓取窗口管理。

## 关键实现

- `openTabForTask(task, config)` — 创建 `show: false` 隐藏窗口，加载 Amazon 商品页，等待页面加载完成后注入 selectors.js + 打补丁的 content.js，通过 `ipcMain.handleOnce` + `ipcRenderer.invoke` 回传抓取结果，`finally` 块确保窗口总被关闭。
- `closeAll()` — 关闭 activeTabs 中所有存活窗口并清空 Map。

## 技术细节

- `chrome.runtime.onMessage.addListener(...)` 块用正则替换为立即执行的 async IIFE，直接调用 `handleScrape()` 并通过 `ipcRenderer.invoke(channel, result)` 回传结果。
- `channel` 格式为 `scrape-result-<winId>`，防止多窗口并发时冲突。
- catch 块内也通过 channel 回传失败结果，避免超时才能感知错误。
- `contextIsolation: false` 允许注入的 content.js 直接访问 DOM 和调用 `require('electron')`。

## 验证

`node --check electron/tab-manager.js` → OK
