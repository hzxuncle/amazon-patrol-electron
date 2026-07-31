# 自动更新功能设计

**日期：** 2026-07-31  
**状态：** 已确认

---

## 背景

项目已安装 `electron-updater`，`electron/main.js` 有基础的 `initAutoUpdater()` 实现，`package.json` publish 配置指向 GitHub 仓库。但当前工作流未上传 `latest.yml` / `latest-mac.yml`，导致更新检测无法工作。

---

## 目标

用户运行软件期间，能自动发现新版本、下载安装，并在安装后看到更新内容。

---

## 发版流程

与日常代码提交完全独立：

1. 修改 `package.json` 的 `version` 字段
2. `git commit` 提交
3. `git tag vX.X.X && git push origin vX.X.X`
4. GitHub Actions 检测到 `v*` tag，自动构建并发布 Release

---

## 更新流程

```
软件启动 5 秒后
    └─ 静默检查 GitHub 是否有新版本
          ├─ 无新版本 → 无动作
          └─ 有新版本
                ├─ 读取 Release 说明，判断第一行是否含 [强制更新]
                ├─ 弹框告知版本号和更新说明
                │     ├─ 强制更新：只有「立即更新」按钮
                │     └─ 普通更新：「立即更新」+「暂不更新」
                ├─ 用户点「暂不更新」→ 记录跳过版本号，该版本不再提示
                │                      新版本发布时重新提示
                └─ 用户点「立即更新」
                      └─ 模态进度对话框（无法关闭）
                            └─ 显示下载百分比 + 进度条
                                  └─ 下载完成 → 自动退出安装
                                        └─ 重启后检测版本变化
                                              └─ 弹框展示版本信息和更新内容
```

---

## 强制更新标记

在 GitHub Release 发布说明的**第一行**写 `[强制更新]`，软件检测到后弹框不显示"暂不更新"按钮。

示例：
```
[强制更新]

- 修复重要安全漏洞
- 优化启动速度
```

---

## 跳过版本逻辑

- 用户点"暂不更新"时，将该版本号写入本地 store
- 下次启动检查时，若最新版本号 === 跳过版本号，不弹框
- 若最新版本号 > 跳过版本号，重新弹框提示（强制更新时无论如何都弹）

---

## 安装后更新说明

- 安装前将当前版本号写入本地 store（`lastVersion`）
- 软件启动时比对 `lastVersion` 与当前版本
- 若版本变化，调用 GitHub Release API 拉取对应版本的发布说明，弹框展示（Markdown 渲染）
- 展示后清除 `lastVersion` 记录，不再重复弹

---

## 工作流修复

**问题：** 当前 `build.yml` 用 `softprops/action-gh-release` 手动上传文件，未包含 `latest.yml` / `latest-mac.yml`。

**修复：** 改为 electron-builder `--publish always`，构建时自动生成并上传 `latest.yml`、`latest-mac.yml` 及安装包到 GitHub Release。

---

## 涉及文件

| 文件 | 改动内容 |
|------|---------|
| `.github/workflows/build.yml` | 改用 `--publish always` 发布 |
| `electron/main.js` | 重写 `initAutoUpdater()`，新增 IPC 推送事件 |
| `electron/ipc-handlers.js` | 注册更新相关 IPC 处理器 |
| `renderer/fullpage.html` | 新增进度对话框、更新说明弹框 HTML 结构 |
| `renderer/fullpage.js` | 新增对应 UI 逻辑、启动时版本变化检测 |

---

## 不在本次范围内

- 手动检查更新入口（菜单栏"检查更新"按钮）
- 差量更新 / 增量补丁
