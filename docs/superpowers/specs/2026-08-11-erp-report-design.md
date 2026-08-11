# ERP 数据上报 Design

**日期**: 2026-08-11

## 目标

巡店完成后，将全部抓取结果（含成功和失败）批量推送到外部 ERP 接口，接口地址和认证信息在设置页配置。

## 接口规格

- **URL**: 用户在设置页配置，POST，`application/json`
- **请求体**: 对象数组，每条对应一个抓取结果
- **认证**: 可选，支持无需认证 / Bearer Token（`Authorization: Bearer <token>`）
- **响应**: `{ success: boolean, code, message, data }`

### 字段映射

| 接口字段 | 来源 | 处理 |
|---------|------|------|
| `reportingTime` | `r.timestamp` | 直接用（ISO 字符串） |
| `asin` | `r.asin` | 直接用 |
| `site` | `r.site` | 直接用 |
| `title` | `r.title` | 直接用 |
| `price` | `r.price` | 去货币符号转 float，失败传 0 |
| `listPrice` | `r.listPrice` | 同上 |
| `rating` | `r.rating` | 转 float，失败传 0 |
| `reviews` | `r.reviews` | 去逗号转 int，失败传 0 |
| `seller` | `r.seller` | 直接用 |
| `stock` | `r.stock` | 直接用 |
| `dealBadge` | `r.dealBadge` | 直接用 |
| `acBadge` | `r.acBadge` | 直接用 |
| `coupon` | `r.coupon` | 直接用 |
| `parentAsin` | `r.parentAsin` | 直接用 |
| `bsrMainRank` | `r.bsrMainRank` | 直接用 |
| `bsrMainCategory` | `r.bsrMainCategory` | 直接用 |
| `bsrSubRank` | `r.bsrSubRank` | 直接用 |
| `bsrSubCategory` | `r.bsrSubCategory` | 直接用 |
| `productInfo` | `r.productInfo` | 若为对象则 JSON.stringify，否则原样 |
| `url` | `r.url` | 直接用 |

## 设计

### 1. 设置持久化

新增 4 个 key 到 `patrolSettings`（已在 `FILE_MAP` 映射到 `settings.json`，无需改 store.js）：

| key | 类型 | 说明 |
|-----|------|------|
| `enableErpReport` | boolean | 是否启用上报 |
| `erpReportUrl` | string | 接口地址 |
| `erpAuthType` | `'none'` \| `'bearer'` | 认证方式 |
| `erpBearerToken` | string | Bearer Token（authType=bearer 时使用） |

### 2. 设置页 UI（renderer/fullpage.html）

在「通知设置」卡片之后、「系统设置」卡片之前，新增「数据上报」卡片：

```
[ 启用数据上报 ] (toggle)
接口地址: [________________]
认证方式: [ 无需认证 ▼ ]      <- select
Bearer Token: [__________]   <- 仅 authType=bearer 时显示
```

- 启用开关：`id="enableErpReport"`，`class="cron-toggle-wrap"`
- 接口地址：`id="erpReportUrl"`，`class="text-input"`
- 认证方式：`id="erpAuthType"`，`class="text-input"`（select），选项 `none`/`bearer`
- Token：`id="erpBearerToken"`，`class="text-input"`，`type="password"`，`id="erpTokenRow"` 包裹行默认隐藏

### 3. 渲染层逻辑（renderer/fullpage.js）

**dom 对象**（加入 `dom` map）：
- `enableErpReport`, `erpReportUrl`, `erpAuthType`, `erpBearerToken`, `erpTokenRow`

**getSettings()** 补充：
```js
enableErpReport: dom.enableErpReport ? dom.enableErpReport.checked : false,
erpReportUrl: dom.erpReportUrl ? dom.erpReportUrl.value.trim() : '',
erpAuthType: dom.erpAuthType ? dom.erpAuthType.value : 'none',
erpBearerToken: dom.erpBearerToken ? dom.erpBearerToken.value.trim() : '',
```

**loadSettings()** 补充：
```js
if (dom.enableErpReport) dom.enableErpReport.checked = s.enableErpReport || false;
if (dom.erpReportUrl)    dom.erpReportUrl.value    = s.erpReportUrl    || '';
if (dom.erpAuthType)     dom.erpAuthType.value     = s.erpAuthType     || 'none';
if (dom.erpBearerToken)  dom.erpBearerToken.value  = s.erpBearerToken  || '';
if (dom.erpTokenRow)     dom.erpTokenRow.style.display = (s.erpAuthType === 'bearer') ? '' : 'none';
```

**事件监听**：`erpReportUrl`/`erpAuthType`/`erpBearerToken` 的 input/change → `saveSettings()`；`erpAuthType` change 时同步切换 `erpTokenRow` 显隐。

### 4. 主进程推送逻辑（electron/ipc-handlers.js）

巡店完成后（`completedResults` 已排序，`PATROL_COMPLETE` 推送前），新增调用：

```js
await sendErpReport(completedResults, patrolSettings).catch(e =>
  broadcastLog(`[ERP] 上报失败: ${e.message}`)
);
```

新增函数 `sendErpReport(results, settings)`：
- 检查 `settings.enableErpReport` 和 `settings.erpReportUrl`，否则直接返回
- 构造 payload 数组（字段映射见上表）
- 调用扩展后的 `postJSON(url, body, headers)`
- 响应 `success: true` 则 `broadcastLog('[ERP] 上报成功，共 N 条')`，否则 log 错误信息
- `postJSON` 需支持可选 headers 参数（当前不支持），修改签名为 `postJSON(url, body, headers = {})`

## 文件变动

| 文件 | 操作 |
|------|------|
| `renderer/fullpage.html` | 新增「数据上报」卡片 HTML |
| `renderer/fullpage.js` | dom 注册、getSettings、loadSettings、事件监听 |
| `electron/ipc-handlers.js` | `postJSON` 加 headers 参数、新增 `sendErpReport`、巡店完成时调用 |

## 约束

- `patrolSettings` 已在 FILE_MAP 映射 settings.json，新增 key 不需要改 store.js
- `postJSON` 只扩展 headers 参数，不改变现有调用方（传入 `{}` 默认即可）
- 推送失败只记录日志，不弹框、不阻塞
- 失败条目（status !== 'success'）的数值字段传 0，字符串字段传空字符串
