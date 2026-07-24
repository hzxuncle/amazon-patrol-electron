# 系统功能地图

记录各功能模块的完整实现位置和联动关系。**修改任何功能前先查此文档**，确认所有联动节点都已更新，避免改一处漏改其他地方。

---

## 一、抓取字段

每个抓取字段都有完整的 11 节点链路，见 README「新增字段的完整链路」。

### 当前字段清单

| 字段 key | 中文名 | 抓取位置 | 参考对比 | 备注 |
|----------|--------|---------|---------|------|
| `price` | 售价 | `_base/parsers.js` extractPrice | ✅ expectedPrice | 缺货时自动清空 |
| `listPrice` | 划线价 | `_base/parsers.js` extractPrice | ✅ expectedListPrice | 与 price 相同时清空 |
| `rating` | 星级 | `_base/parsers.js` extractRating | ✅ expectedRating | MX 覆盖：de 5 estrellas |
| `reviews` | 评论数 | `_base/parsers.js` extractReviewCount | ✅ expectedReviews | 偏差 ≥30% 报警 |
| `seller` | 卖家 | `_base/selectors.js` seller | ✅ expectedSeller | 包含匹配 |
| `stock` | 库存 | `_base/normalizers.js` normalizeStock | ✅ expectedStock | MX 覆盖：Disponible→In Stock |
| `dealBadge` | 活动标 | `_base/parsers.js` parseDealBadge | ✅ expectedDealBadge | 多语言 patterns |
| `acBadge` | AC标 | `_base/parsers.js` parseAcBadge | ✅ expectedAcBadge | `.mvt-ac-badge-rectangle` |
| `coupon` | Coupon | `_base/parsers.js` parseCoupon | ✅ expectedCoupon | |
| `parentAsin` | 父体ASIN | `_base/selectors.js` parentAsin | ❌ | regex 从 JS 变量提取 |
| `title` | 标题 | `_base/selectors.js` title | ❌ | |
| `url` | URL | `window.location.href` | ❌ | |
| `productInfo` | 产品信息 | 各站点 `parsers.js` extractProductDetails | ❌ | 结构化嵌套对象，浮层查看 |
| `bsrMainRank` | BSR大类排名 | 各站点 `parsers.js` extractBsr | ✅ expectedBsrMainRank | 排名越小越好，实际>期望报警 |
| `bsrMainCategory` | BSR大类名 | 同上 | ✅ expectedBsrMainCategory | 文本匹配 |
| `bsrSubRank` | BSR小类排名 | 同上 | ✅ expectedBsrSubRank | 同 bsrMainRank |
| `bsrSubCategory` | BSR小类名 | 同上 | ✅ expectedBsrSubCategory | 文本匹配 |

### 字段联动关系

```
字段勾选（enabledFields）
  → renderer/fullpage.js getEnabledFields()
  → 控制 th 列显隐
  → 控制 td 是否渲染
  → 控制 exportExcel() 是否输出该列
  → 传给 START_PATROL → ipc-handlers → tab-manager → content.js isEnabled(field)
  → 控制 scraper.js 是否抓取该字段

字段顺序（fieldOrder）
  → renderer/fullpage.js fieldOrder 变量
  → 持久化到 patrolSettings.fieldOrder
  → renderAllResults() 按顺序输出 td 和同步 thead 列顺序

BSR 字段特殊依赖
  → 启用任意 BSR 字段时自动触发 extractProductDetails()
  → extractBsr() 从 productInfo 里解析
  → 若未启用 productInfo，抓完后清空 productInfo 节省体积
```

---

## 二、站点管理

### 数据源

- **内置数据**：`electron/sites-data.js` BUILTIN_SITES（20 个站点，含 code/domain/zip 等）
- **持久化**：`sites.json`（userData 目录），通过 `store.get('sites')` 读取
- **初始化**：`electron/main.js` initSites()，首次启动写入，后续补全 code 字段

### 站点 code 字段联动

```
sites.json[].code（二字码，如 CA）
  → 全局 site 标识，所有内部流转使用二字码
  → tab-manager.js CODE_TO_DOMAIN / CODE_TO_LANG
      → buildProductUrl() 构建实际访问 URL
      → initDeliveryZip() 配送地设置
  → ipc-handlers.js getSiteLabel() 返回 code
  → ipc-handlers.js buildDeliveryZips() key 为 code
  → fullpage.js getSiteLabel() 查 sitesData[].code
  → fullpage.js buildSiteMap() 构建 code→www.domain 映射（参考数据导入时用）
  → content.js getSite() 返回 window.__SITE_CODE__（注入值）
```

### 站点启用状态联动

```
sites.json[].enabled
  → 站点管理页表格排序（已启用排前面）
  → fullpage.js syncEnabledSites() → enabledSites 数组
  → 巡检面板站点分组下拉选项（只显示 enabled=true 的站点）
  → ipc-handlers.js buildDeliveryZips() 只取 enabled=true 的站点
  → 参考数据导入 autoFillAsinGroups() 自动启用涉及的站点
```

### 站点邮编联动

```
sites.json[].zip
  → ipc-handlers.js buildDeliveryZips() → config.deliveryZips
  → tab-manager.js openTabForTask() → initDeliveryZip(site, zip)
  → 每次巡检开始时通过 AJAX 设置配送地，后续任务复用 Cookie
  → 并发安全：pendingSiteInit Map 防止同一站点重复初始化
```

---

## 三、参考数据对比

### 数据流

```
Excel 导入（processFile）
  → 校验：必须含 ASIN 列和站点列
  → 站点列支持：二字码（CA）或完整域名（www.amazon.ca），自动转换为二字码
  → 存储：reference.json { importedAt, fileName, rows[] }
  → 自动触发：autoFillAsinGroups() 按站点填入巡检面板分组卡片
              自动启用涉及的站点（sites.json[].enabled = true）

对比触发
  → 巡检面板「启用对比」开关 = enableRefCompare
  → findRef(asin, site)：asin 精确匹配 + site 精确匹配（支持 !r.site 兜底）
  → cmpField(actual, expected, fieldType) 按字段类型比较
  → getRowClass() 整行标色（match-success / match-error）
  → renderField() 单字段标红/绿勾
```

### 对比规则

| 字段类型 | 触发条件 | 代码位置 |
|---------|---------|---------|
| price/listPrice | 差值 ≥ 0.01 | `cmpField` price 分支 |
| rating | 差值 ≥ 0.2 | `cmpField` rating 分支 |
| reviews | 偏差 ≥ 30% | `cmpField` reviews 分支 |
| bsrRank | 实际 > 期望（排名变差） | `cmpField` bsrRank 分支 |
| text（seller/stock/dealBadge 等） | 双向包含匹配失败 | `cmpField` 兜底分支 |

### 钉钉通知联动

```
巡检完成 onPatrolComplete()
  → 读 patrolSettings.enableGroupNotify / enablePersonalNotify
  → 读 referenceData.rows（主进程从 reference.json 读）
  → 只有有参考数据且有异常时才推送
  → buildDingTalkText(summary) 按站点分组构建消息
      → findRef() 同渲染层逻辑（匹配 asin + site）
      → mismatchText/Price/Rating/Reviews 函数
  → 群通知：sendDingTalkWebhook(text, webhookUrl)
  → 个人通知：sendDingTalkPersonalByPhone(text, credentials, phones)
              → getMobileUserId(token, mobile) 手机号→userId
              → postJSON asyncsend_v2
```

---

## 四、定时巡检

```
用户配置
  → cronConfig.expr（Cron 表达式）
  → cronConfig.enabled（开关，拨动立即生效）
  → 均持久化到 settings.json

触发链路
  node-schedule tick（每分钟）
  → scheduler.js matchesCron(expr)
  → main.js onCronTrigger()
    → store.get('asinInputCache')：Array<{site, asins}>（二字码）
    → store.get('patrolSettings')：并发/超时等参数
    → store.get('sites')：buildDeliveryZipsForCron() 构建 deliveryZips
    → mainWindow.webContents.send('CRON_AUTO_START', {tasks, config})
    → fullpage.js handleBgMessage → START_PATROL

注意：定时触发时无法读取前端 DOM，故：
  - ASIN 来自 asinInputCache（实时写入，修改即生效）
  - 配置来自 patrolSettings（实时写入，修改即生效）
  - 个人通知凭证（AK/SK/AgentId）在定时触发时读 patrolSettings.dingtalkPersonal
    （手动巡检时从页面 DOM 实时读取并通过 config 传入）
```

---

## 五、数据存储

```
settings.json
  patrolSettings  → 并发/超时/字段勾选/字段顺序/钉钉配置/开关状态
  cronConfig      → 定时任务表达式和启用状态
  appTheme        → light / dark
  openAtLogin     → 开机自启动

state.json
  patrolState     → 运行状态（running/totalCount）
  patrolResults   → 最近一次巡检结果
  lastUpdate      → 最近一次巡检完成时间戳
  asinInputCache  → Array<{site: string(code), asins: string}>

history.json
  patrolHistory     → 近 10 次巡检摘要（含结果列表）
  historySnapshots  → 各 ASIN×站点 的历史价格快照（每个最多 10 条）

reference.json
  { importedAt, fileName, rows[] }

sites.json
  Array<SiteConfig>  → 20 个站点配置（code/domain/zip/enabled 等）
```

### 存量数据迁移

`electron/store.js` migrate()：旧 store.json → 5 个文件
`electron/store.js` migrateSiteCodes()：旧完整域名 → 二字码
`electron/main.js` initSites()：补全 sites.json 缺失的 code 字段

---

## 六、抓取引擎

详见 [scraper-architecture.md](scraper-architecture.md)。

### 站点文件改动影响范围

| 改动 | 影响范围 |
|------|---------|
| `xx/selectors.js` | 仅影响该站点的选择器查找 |
| `xx/parsers.js` | 仅影响该站点的字段解析和 extractBsr |
| `xx/normalizers.js` | 仅影响该站点的归一化（stock/price 等） |
| `_base/scraper.js` | 影响所有站点的抓取主流程 |
| `_base/parsers.js` | 影响所有未覆盖该函数的站点 |
| `renderer/sites/index.js` | 影响注入脚本的构建逻辑 |
| `electron/tab-manager.js` | 影响所有站点的窗口管理和注入时序 |

---

## 七、UI 联动速查

| 操作 | 触发的联动 |
|------|---------|
| 拨动站点启用开关 | saveSites() → syncEnabledSites() → refreshAllGroupOptions()（巡检面板下拉实时更新） |
| 修改站点邮编点保存 | saveSites()（下次巡检生效，当次已初始化的不变） |
| 导入参考数据 | autoFillAsinGroups()（自动填入巡检面板）→ 自动启用涉及站点 |
| 勾选/取消字段 | saveSettings() → renderAllResults()（表格列实时显隐） |
| 调整列顺序确认 | fieldOrder 更新 → saveSettings() → renderAllResults()（列顺序实时生效） |
| 拨动启用对比开关 | 校验是否有参考数据 → renderAllResults()（标红/标绿实时更新） |
| 拨动钉钉群/个人通知开关 | 互斥逻辑（开一个关另一个）→ saveSettings() |
| 拨动定时开关 | 立即调用 SAVE_CRON_CONFIG → scheduler.restart() |
| 点「开始巡检」 | buildTasks()（校验）→ 注入 dingtalkPersonal 凭证到 config → START_PATROL |
| 卸载应用（Windows） | NSIS customUnInstall 弹框询问是否删除 userData 数据目录 |
