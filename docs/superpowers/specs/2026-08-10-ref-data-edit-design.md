# 参考数据行内编辑与导出 Design

**日期**: 2026-08-10

## 目标

在「对比数据」页的「已导入参考数据」卡片中，支持全局编辑模式和导出功能，让用户无需重新上传 Excel 即可修改个别期望值。

## 现有问题

- 表格 `max-height: 300px`，数据多时显示区太小
- 表头缺 BSR 四列（期望BSR大类排名、期望BSR大类名、期望BSR小类排名、期望BSR小类名）
- 渲染只显示前 50 条

## 设计

### 1. 表格展示修复

- `table-scroll.short` max-height 改为 600px
- 表头补全 BSR 四列
- `renderRefTable()` 渲染全量数据（去掉 `slice(0, 50)`）

### 2. 全局编辑模式

**触发**：卡片 header 右侧加「编辑」按钮，点击进入编辑模式。

**编辑模式行为**：
- 「编辑」按钮变为「保存」+「取消」
- 「导出」按钮隐藏（编辑中不允许导出）
- 所有单元格变 `<input type="text">`，除 ASIN 和站点列（只读，作为唯一标识）
- 输入框宽度撑满单元格

**保存**：
- 读取所有行的输入框值，更新 `referenceData.rows`
- 调用 `window.electronAPI.storage.set('referenceData', referenceData)` 持久化
- 退出编辑模式，重新渲染表格

**取消**：
- 丢弃所有修改，重新渲染表格（使用内存中原始数据）
- 退出编辑模式

### 3. 导出

**触发**：卡片 header 右侧加「导出」按钮（编辑模式下隐藏）。

**行为**：
- 把当前 `referenceData.rows` 全量写入 Excel
- 列名与导入模板完全一致，方便修改后再次导入
- 调用已有的 `window.electronAPI.saveExcel()` 保存文件

## 文件变动

| 文件 | 改动 |
|------|------|
| `renderer/fullpage.html` | 卡片 header 加「编辑」「导出」按钮；表头补 BSR 四列 |
| `renderer/fullpage.js` | `renderRefTable()` 全量渲染；新增 `enterRefEditMode()` / `saveRefEdit()` / `cancelRefEdit()` / `exportRefData()` 函数 |
| `renderer/fullpage.css` | `.table-scroll.short` max-height 改为 600px；编辑模式输入框样式 |

## 约束

- ASIN 和站点列不可编辑
- 导入仍为覆盖逻辑，不受此功能影响
- 编辑模式下不显示导出按钮，避免导出未保存的数据
