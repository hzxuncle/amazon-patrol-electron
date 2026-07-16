# Task 5 Report: scheduler.js — 定时调度

**Status:** DONE

## 文件变更

### `renderer/lib/cron.js`
在文件末尾追加了 CommonJS 导出：
```js
if (typeof module !== 'undefined') module.exports = CronParser;
```
这样 Node.js `require('../renderer/lib/cron.js')` 可以正确获得 `CronParser` 对象，同时不影响浏览器环境（`module` 未定义时该行不执行）。

### `electron/scheduler.js`（新建）
实现了以下导出接口：
- `start()` — 从 store 读取 `cronConfig`，若 enabled 则用 `node-schedule` 注册每分钟轮询任务，每次触发时用 `CronParser.matchesCron` 精确匹配
- `stop()` — 取消已注册的 job
- `restart()` — 等同于 `start()`（先 stop 再 start）
- `setTriggerCallback(fn)` — 由 `main.js` 注入实际触发动作（如调用 `ipc-handlers.js` 的 `startPatrolFromCron`）

## 验证
- `node --check electron/scheduler.js` → OK
- 所有关键符号（start/stop/restart/setTriggerCallback/scheduleJob）均存在

## 依赖关系
- `node-schedule`（已在 package.json 中安装）
- `./store`（Task 2 完成）
- `../renderer/lib/cron.js`（已修改添加 module.exports）
