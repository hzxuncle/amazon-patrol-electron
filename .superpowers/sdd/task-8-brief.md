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

## Task 8: renderer/fullpage.html — 渲染层 HTML

**Files:**
- Create: `renderer/fullpage.html`（基于扩展版本改造）

**Interfaces:**
- Consumes: `renderer/fullpage.css`、`renderer/lib/xlsx.full.min.js`、`renderer/lib/cron.js`、`renderer/fullpage.js`
- 变化点：去掉扩展 meta 标签，script src 路径使用相对路径，新增「开机自启动」开关到设置面板

- [ ] **Step 1: 复制并修改 fullpage.html**

复制 `/home/ec2-user/claude/amz-xundian/amazon-patrol/fullpage.html` 到 `renderer/fullpage.html`，然后在设置面板的「通知设置」card 后面新增「系统设置」card：

```html
          <section class="card">
            <div class="card-header"><span class="card-title">系统设置</span></div>
            <div class="setting-item">
              <label class="toggle-label">
                <input type="checkbox" id="openAtLogin"> 开机自动启动
              </label>
              <span class="setting-hint">启用后系统启动时自动运行巡店助手（最小化到托盘）</span>
            </div>
          </section>
```

同时将 `</body>` 前的三个 script 标签改为：

```html
  <script src="lib/xlsx.full.min.js"></script>
  <script src="lib/cron.js"></script>
  <script src="fullpage.js"></script>
```

（路径已正确，无需改动，确认即可）

- [ ] **Step 2: 验证文件存在且包含关键元素**

```bash
python3 -c "
with open('/home/ec2-user/claude/amz-xundian/amazon-patrol-electron/renderer/fullpage.html') as f:
    c = f.read()
for k in ['openAtLogin', 'lib/xlsx.full.min.js', 'lib/cron.js', 'fullpage.js']:
    print(k,':', 'OK' if k in c else 'MISSING')
"
```

---

