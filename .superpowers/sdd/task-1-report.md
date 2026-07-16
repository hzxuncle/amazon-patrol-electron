# Task 1 Report: 项目脚手架与依赖

## 状态：DONE_WITH_CONCERNS

## Commit Hash
`bcb77d4`

## 完成的步骤

1. **Step 1: 创建目录结构**  
   创建了 `electron/`, `renderer/lib/`, `assets/icons/`, `build/` 目录。

2. **Step 2: 创建 package.json**  
   按 brief 规范创建，包含 electron 28.3.3、node-schedule、electron-builder 24.13.3。

3. **Step 3: 创建 .gitignore**  
   包含 `node_modules/` 和 `dist/`。

4. **Step 4: 安装依赖**  
   安装成功，共 315 个包（electron、node-schedule、electron-builder）。  
   **注意（concern）：** 系统默认 `node` 命令（nvm v20.20.2）因 GLIBC 版本不兼容无法执行。  
   使用 Node v16.20.2（`/home/ec2-user/.nvm/versions/node/v16.20.2/bin/node`）完成安装，  
   需将 v16 bin 目录加入 `PATH` 才能让 electron 的 postinstall 脚本正常运行。  
   **后续 `npm start` 等命令也需要用 `PATH=/home/ec2-user/.nvm/versions/node/v16.20.2/bin:$PATH` 前缀执行。**

5. **Step 5: 复制静态资源**  
   - `renderer/fullpage.css` ← `amazon-patrol/fullpage.css`  
   - `renderer/selectors.js` ← `amazon-patrol/selectors.js`  
   - `renderer/lib/cron.js` ← `amazon-patrol/lib/cron.js`  
   - `renderer/lib/xlsx.full.min.js` ← `amazon-patrol/lib/xlsx.full.min.js`  
   - `assets/icons/icon16.png`, `icon48.png`, `icon128.png` ← `amazon-patrol/icons/`

6. **Step 6: 验证目录结构**  
   所有预期文件均存在。

## 遇到的问题

**GLIBC 版本兼容性问题：**  
- nvm v20 和 v18 均需要 `GLIBC_2.27`/`GLIBC_2.28`，当前系统不支持。
- nvm v16.20.2 可正常运行（不需要更新版 GLIBC）。
- 解决方案：所有 npm/node 命令需使用 `PATH=/home/ec2-user/.nvm/versions/node/v16.20.2/bin:$PATH` 前缀。
- 这不影响打包产物（electron-builder 会下载预编译的 Electron 二进制），但开发环境需注意。

## 测试结果

- `node_modules/` 包含 electron、electron-builder、node-schedule ✓  
- 所有静态资源文件已正确复制 ✓  
- 目录结构符合 brief 规范 ✓  
- npm start 未实际运行（缺少 electron/main.js，为 Task 2 的工作）

---

## Review 修复（commit efc3cdc）

修复了 Task 1 review 发现的两个问题：

1. **icon256.png**：使用 Python Pillow 将 icon128.png resize 为 256×256 并保存为 `assets/icons/icon256.png`。
2. **engines 字段**：在 `package.json` 顶层添加 `"engines": { "node": ">=16", "npm": ">=8" }`，与实际开发环境（Node v16.20.2）保持一致。
