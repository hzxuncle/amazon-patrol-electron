# Task 4 Report: ipc-handlers.js

**Status:** DONE

## 文件
- `electron/ipc-handlers.js` — 新建，317行

## 导出接口
- `register()` — 注册所有 ipcMain.handle 处理器
- `setMainWindow(win)` — 由 main.js 注入主窗口引用

## 注册的 Action（共15个）
START_PATROL / STOP_PATROL / RETRY_FAILED / GET_STATUS / GET_RESULTS / GET_HISTORY / CLEAR_RESULTS / CLEAR_HISTORY / STORAGE_GET / STORAGE_SET / STORAGE_REMOVE / SAVE_CRON_CONFIG / GET_CRON_CONFIG / SAVE_EXCEL / GET_LOGIN_ITEM / SET_LOGIN_ITEM

## 关键实现说明

1. **Worker Pool** — async 函数循环（非 Promise.all），支持 concurrency 并发、batchSize/batchRest 批量休息、pageInterval+jitter 间隔
2. **START_PATROL payload** — 回调签名 `(e, payload)` 再解构，符合 ipcMain.handle 规范
3. **Node 16 fetch 替代** — 用 `https` 模块实现 `postJSON(url, body)`，替换 `fetch()`
4. **系统通知** — `new Notification({...}).show()` 包在 try/catch 中
5. **SAVE_EXCEL** — `dialog.showSaveDialog` + `fs.writeFileSync`
6. **钉钉推送** — 对比 referenceData，差异汇总后推送 Markdown 消息

## 验证
```
node --check → OK
所有17项符号检查 → OK
```
