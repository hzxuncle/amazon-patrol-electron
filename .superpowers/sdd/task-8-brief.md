## Task 8: README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新数据存储章节**

将 README 中「数据存储位置」章节的内容替换为 5 个文件的说明，结构参考 spec 文档中的文件结构表和各文件 JSON 示例。

**文件路径：**

| 平台 | 目录 |
|------|------|
| Windows | `%APPDATA%\amazon-patrol\` |
| Mac | `~/Library/Application Support/amazon-patrol/` |

**5 个文件说明表：**

| 文件 | 内容 | 读写频率 |
|------|------|---------|
| `settings.json` | patrolSettings、cronConfig、appTheme、openAtLogin | 高频（UI 变更时实时写入） |
| `state.json` | patrolState、patrolResults、lastUpdate、asinInputCache | 中频（巡店周期内变化） |
| `history.json` | patrolHistory、historySnapshots | 低频（每次巡店完成追加） |
| `reference.json` | importedAt、fileName、rows（参考数据） | 极低频（用户手动导入） |
| `sites.json` | 20 站点配置（domain、zip、enabled 等） | 极低频（用户手动配置） |

- [ ] **Step 2: 更新界面标签页说明表**

在「使用说明 → 界面标签页」表格中新增「站点」Tab：

```
| 站点 | 管理 20 个 Amazon 站点的启用状态和配送邮编 |
```

删除或更新「设置」Tab 中关于邮编配置的说明（改为引导至「站点」Tab）。

- [ ] **Step 3: 更新配送地设置章节**

删除「配送地设置」章节中的 4 站点邮编表格，替换为：

> 在「站点」Tab 管理所有站点的配送邮编。启用开关控制该站点是否出现在巡店面板的站点选择中，邮编用于巡店前初始化配送地。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for 5-file store, site group patrol panel, sites management tab"
```
