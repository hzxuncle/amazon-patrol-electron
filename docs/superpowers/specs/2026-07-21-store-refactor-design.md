# Store 重构 + 巡店面板重设计 + 邮编管理页

## 背景

现有 `store.json` 将所有数据混存在单个文件中，存在以下问题：

- 高频小键（设置项每次改动就写）和大体量历史数据混在一起，每次写入都重写整个文件
- `patrolConfig` 与 `patrolSettings` 14 个字段完全重复，`patrolConfig` 是 `patrolSettings` 的滞后副本，导致"改了 UI 设置定时任务不生效"的用户困惑
- `referenceData` 缺少元信息，用户无法知道上次导入的是哪个文件、什么时候导入的
- 巡店面板 ASIN 输入框 + 站点勾选是笛卡尔积逻辑，无法为不同 ASIN 指定不同站点
- 配送邮编配置分散在设置面板，仅支持 4 个站点，缺乏格式参考，无法扩展

## 目标

1. 按读写频率和数据性质将 `store.json` 拆分为 5 个独立文件
2. 删除 `patrolConfig`，统一从 `patrolSettings` 读取执行参数
3. `reference.json` 增加元信息（文件名、导入时间），界面展示导入记录和数据明细
4. 导入参考数据时自动将 ASIN 按站点分组填入巡店面板
5. 巡店面板改为站点分组卡片，支持 ASIN 与站点的精确绑定
6. 新增邮编管理页，基于内置 20 站点数据，支持启用/禁用站点和编辑邮编，统一管理所有配送地配置

---

## 一、存储文件拆分

### 文件一览

| 文件 | 键 | 读写频率 |
|------|----|---------|
| `settings.json` | `patrolSettings` `cronConfig` `appTheme` `openAtLogin` | 高频（每次 UI 变更） |
| `state.json` | `patrolState` `patrolResults` `lastUpdate` `asinInputCache` | 中频（每次巡店周期） |
| `history.json` | `patrolHistory` `historySnapshots` | 低频（只追加） |
| `reference.json` | `importedAt` `fileName` `rows` | 极低频（用户手动导入） |
| `sites.json` | `sites` | 极低频（用户手动配置站点） |

### settings.json

```json
{
  "patrolSettings": {
    "concurrency": 2,
    "pageInterval": 4000,
    "intervalJitter": 2000,
    "batchSize": 20,
    "batchRest": 30000,
    "scrapeTimeout": 25000,
    "maxRetries": 3,
    "retryDelay": 2000,
    "dingtalkWebhook": "",
    "enabledFields": ["price", "stock", "seller"],
    "showHistoryDiff": false,
    "showScrapeWindow": false
  },
  "cronConfig": {
    "enabled": false,
    "expr": "0 9 * * 1-5"
  },
  "appTheme": "light",
  "openAtLogin": false
}
```

注：`sites` 字段和 `deliveryZips` 从 `patrolSettings` 中移除，站点信息由 `asinInputCache` 的分组结构携带，邮编由 `sites.json` 统一管理。

### state.json

```json
{
  "patrolState": {
    "running": false,
    "totalCount": 0,
    "completedCount": 0
  },
  "patrolResults": [],
  "lastUpdate": 1721234567890,
  "asinInputCache": [
    { "site": "www.amazon.ca",     "asins": "B08XYZ1234\nB09ABC5678\nB0CABC1234" },
    { "site": "www.amazon.com.mx", "asins": "B0DABC5678\nB0EABC9012" }
  ]
}
```

### history.json

```json
{
  "patrolHistory": [
    {
      "completedAt": "2026-07-01T09:05:00.000Z",
      "total": 8,
      "success": 7,
      "failed": 1,
      "captcha": 0,
      "elapsed": 42000,
      "isRetry": false,
      "results": [
        {
          "asin": "B08XYZ1234",
          "site": "www.amazon.com",
          "status": "success",
          "price": "$29.99",
          "stock": "有货",
          "seller": "Amazon.com",
          "error": ""
        }
      ]
    }
  ],
  "historySnapshots": {
    "B08XYZ1234_www.amazon.com": {
      "asin": "B08XYZ1234",
      "site": "www.amazon.com",
      "snapshots": [
        {
          "timestamp": "2026-07-01T09:00:00.000Z",
          "price": "$29.99",
          "listPrice": "$39.99",
          "rating": "4.5",
          "reviews": "1234",
          "seller": "Amazon.com",
          "stock": "有货",
          "dealBadge": "",
          "acBadge": false,
          "coupon": "",
          "parentAsin": "B08XYZ0000"
        }
      ]
    }
  }
}
```

### reference.json

```json
{
  "importedAt": "2026-07-21T09:00:00.000Z",
  "fileName": "产品参考数据_2026Q3.xlsx",
  "rows": [
    {
      "asin": "B08XYZ1234",
      "site": "www.amazon.ca",
      "expectedPrice": "29.99",
      "expectedSeller": "Amazon.com",
      "expectedStock": "有货"
    }
  ]
}
```

---

## 二、patrolConfig 删除

### 现状问题

`patrolConfig` 在用户点击「开始巡店」时写入，内容与 `patrolSettings` 完全重复（14 个字段相同）。定时触发、重试失败项均读取 `patrolConfig`，导致用户修改 UI 设置后必须手动点一次「开始巡店」才能让定时任务使用新参数。

### 变更

| 场景 | 变更前 | 变更后 |
|------|--------|--------|
| 定时触发 | 读 `patrolConfig` | 读 `patrolSettings` + `asinInputCache` |
| 重试失败项 | 读 `patrolConfig` | 读 `patrolSettings` |
| 钉钉推送 | 读 `patrolConfig.dingtalkWebhook` | 读 `patrolSettings.dingtalkWebhook` |
| `START_PATROL` payload | 写 `patrolConfig` | 不写任何 store |

### keepExisting / totalCount 处理

- `keepExisting`：由调用方在调用时传入，不持久化（定时触发固定传 `false`，手动触发由用户确认决定）
- `totalCount`：调用时传入 `tasks.length`，主进程写入 `patrolState.totalCount`，页面刷新后从 `state.json` 恢复进度条

---

## 三、巡店面板重设计

### 现状问题

ASIN 输入框 + 站点勾选栏采用笛卡尔积逻辑：N 个 ASIN × M 个站点 = N×M 个任务。无法为不同 ASIN 指定不同站点。

### 新交互：站点分组卡片

顶部站点勾选栏移除，改为站点分组卡片列表：

```
┌─────────────────────────────────────┐
│  [CA ▼]                        [删除] │
│  B08XYZ1234                          │
│  B09ABC5678                          │
│  B0CABC1234                          │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  [MX ▼]                        [删除] │
│  B0DABC5678                          │
│  B0EABC9012                          │
└─────────────────────────────────────┘
          [＋ 新增站点]
```

**交互规则：**

- 每个分组：站点下拉选择器（CA / US / AU / MX）+ ASIN 多行输入框 + 删除按钮
- 同一站点只能出现一次，已被其他分组选用的站点在下拉中置灰不可选
- 默认展示一个分组，站点默认为上次使用的第一个站点
- 点「新增站点」追加一个空白分组，自动选下一个未使用站点
- 删除分组时若只剩一个，禁止删除（至少保留一个分组）
- ASIN 格式校验：每行10位大写字母数字，不合法时行内标红提示
- 任意分组的 ASIN 输入框为空时，点「开始巡店」报错："[CA] 站点 ASIN 不能为空"

**任务构建逻辑（替代笛卡尔积）：**

```
分组1: CA → [ASIN1, ASIN2, ASIN3] → 3个任务
分组2: MX → [ASIN4, ASIN5, ASIN6] → 3个任务
共 6 个任务（而非原来的 12 个）
```

### asinInputCache 结构变更

从字符串改为数组，每个元素对应一个分组：

```json
[
  { "site": "www.amazon.ca",     "asins": "B08XYZ1234\nB09ABC5678\nB0CABC1234" },
  { "site": "www.amazon.com.mx", "asins": "B0DABC5678\nB0EABC9012" }
]
```

实时写入（每次输入框变更或站点切换时），页面加载时恢复分组卡片状态。

---

## 四、参考数据功能扩展

### Excel 格式要求

Excel 必须包含 `ASIN` 列和 `站点` 列（站点值为 `CA` / `US` / `AU` / `MX`）。缺少任一列时导入报错提示。

### 导入时自动填 ASIN

导入成功后：
1. 从 `rows` 按 `site` 分组提取 ASIN
2. 将分组数据写入 `asinInputCache`（数组格式）
3. 同步更新巡店面板，重新渲染分组卡片

### 导入记录展示

参考数据 Tab 顶部增加信息栏：

```
上次导入：产品参考数据_2026Q3.xlsx  |  2026-07-21 09:00  |  共 24 条
```

下方现有表格保持不变，展示 `rows` 明细（含站点列）。若 `reference.json` 不存在或 `rows` 为空，显示"暂无数据，请导入 Excel"。

---

## 五、store.js 改造

### 接口不变，底层按文件路由

```js
const FILE_MAP = {
  patrolSettings:   'settings.json',
  cronConfig:       'settings.json',
  appTheme:         'settings.json',
  openAtLogin:      'settings.json',
  patrolState:      'state.json',
  patrolResults:    'state.json',
  lastUpdate:       'state.json',
  asinInputCache:   'state.json',
  patrolHistory:    'history.json',
  historySnapshots: 'history.json',
  referenceData:    'reference.json',
  sites:            'sites.json',
};
```

`get(key)` / `set(key, value)` / `remove(key)` 对外接口不变，内部根据 `FILE_MAP` 定位文件读写，每个文件独立缓存。

`referenceData` 键对应 `reference.json` 的整体内容对象 `{ importedAt, fileName, rows }`。

### 迁移

应用首次启动时检查旧 `store.json` 是否存在，若存在则：
1. 将各键按 `FILE_MAP` 迁移到对应新文件
2. 将旧 `asinInputCache`（字符串）转换为新格式（数组）：若旧数据无站点信息则提示用户重新配置
3. 删除旧 `store.json`

整个过程静默完成，用户无感知（除站点信息丢失需提示外）。

---

## 六、邮编管理页

### 内置站点数据

源自 `亚马逊各站点邮编汇总.xlsx`，20 个站点内嵌为代码常量（不在运行时解析 xlsx），结构如下：

```js
const BUILTIN_SITES = [
  { domain: 'amazon.com',    region: '北美', country: '美国',     zipLabel: 'ZIP Code',      zipExample: '10001',    zipFormat: '5位数字' },
  { domain: 'amazon.ca',     region: '北美', country: '加拿大',   zipLabel: 'Postal Code',   zipExample: 'K1A 0B1',  zipFormat: '字母数字混合 (A1A 1A1)' },
  { domain: 'amazon.co.uk',  region: '欧洲', country: '英国',     zipLabel: 'Postcode',      zipExample: 'SW1A 1AA', zipFormat: '字母数字混合' },
  // ... 其余 17 个站点
];
```

### sites.json 结构

首次启动时由内置数据生成，用户后续编辑保存到此文件：

```json
[
  {
    "domain": "amazon.com",
    "region": "北美",
    "country": "美国",
    "zipLabel": "ZIP Code",
    "zipExample": "10001",
    "zipFormat": "5位数字",
    "zip": "10001",
    "enabled": true
  },
  {
    "domain": "amazon.ca",
    "region": "北美",
    "country": "加拿大",
    "zipLabel": "Postal Code",
    "zipExample": "K1A 0B1",
    "zipFormat": "字母数字混合 (A1A 1A1)",
    "zip": "K1A 0B1",
    "enabled": true
  },
  {
    "domain": "amazon.co.uk",
    "region": "欧洲",
    "country": "英国",
    "zipLabel": "Postcode",
    "zipExample": "SW1A 1AA",
    "zipFormat": "字母数字混合",
    "zip": "",
    "enabled": false
  }
]
```

- `zip`：用户填写的实际邮编，初始值等于 `zipExample`
- `enabled`：是否启用该站点，默认仅 US/CA/AU/MX 为 `true`，其余为 `false`

### 页面 UI

新增侧边栏 Tab「站点」，展示所有 20 个站点的管理表格：

```
┌──────┬────────┬──────────┬──────────────────┬──────────────┬──────┐
│ 启用 │  地区  │  国家    │  站点域名         │  邮编        │ 格式 │
├──────┼────────┼──────────┼──────────────────┼──────────────┼──────┤
│  ✅  │  北美  │  美国    │  amazon.com      │ [10001     ] │ 5位  │
│  ✅  │  北美  │  加拿大  │  amazon.ca       │ [K1A 0B1   ] │ A1A  │
│  ❌  │  欧洲  │  英国    │  amazon.co.uk    │ [SW1A 1AA  ] │ ...  │
└──────┴────────┴──────────┴──────────────────┴──────────────┴──────┘
                                              [恢复默认]  [保存]
```

**交互规则：**

- 启用开关拨动后立即写入 `sites.json`，无需点保存
- 邮编输入框编辑后需点「保存」才写入
- 「恢复默认」将所有邮编重置为内置 `zipExample` 值
- 邮编列旁边展示格式说明（`zipFormat`），帮助用户填写正确格式

### 对其他模块的影响

| 模块 | 变更前 | 变更后 |
|------|--------|--------|
| 巡店面板站点下拉 | 固定 CA/US/AU/MX | 读 `sites.json` 中 `enabled: true` 的站点 |
| 配送地初始化（tab-manager） | 读 `patrolSettings.deliveryZips[site]` | 读 `sites.json` 中对应站点的 `zip` 字段 |
| 设置面板邮编输入框 | 展示 4 个独立输入框 | 移除，引导用户前往「站点」Tab 管理 |

---

## 七、README 更新

数据存储章节替换为 4 文件说明，各文件路径：

| 平台 | 目录 |
|------|------|
| Windows | `%APPDATA%\amazon-patrol\` |
| Mac | `~/Library/Application Support/amazon-patrol/` |
