# 站点管理页 CRUD 设计文档

## 背景

当前站点管理页只支持启用/禁用和编辑邮编，无法增删改站点，也没有二字码字段。用户填写 Excel 参考数据时无法直接查看二字码，新增自定义站点也无法支持。

## 目标

1. `BUILTIN_SITES` 和 `SiteConfig` 增加 `code` 字段（二字码）
2. 站点管理页表格新增「二字码」列
3. 支持新增站点（填写 6 个字段）
4. 支持行内编辑站点（所有字段可改）
5. 支持删除站点（含确认弹窗）
6. `getSiteLabel()`、`SITE_MAP`、`syncEnabledSites()` 联动使用 `code` 字段

---

## 一、数据结构变更

### SiteConfig 新增 `code` 字段

```js
{
  code: 'CA',              // 新增：二字码，大写，用于 Excel 匹配和标签显示
  domain: 'amazon.ca',
  region: '北美',
  country: '加拿大',
  zipLabel: 'Postal Code',
  zipExample: 'K1A 0B1',
  zipFormat: '字母数字混合 (A1A 1A1)',
  zip: 'K1A 0B1',
  enabled: true
}
```

### BUILTIN_SITES 各站点对应 code

| domain | code |
|--------|------|
| amazon.com | US |
| amazon.ca | CA |
| amazon.co.uk | UK |
| amazon.de | DE |
| amazon.fr | FR |
| amazon.it | IT |
| amazon.es | ES |
| amazon.nl | NL |
| amazon.se | SE |
| amazon.pl | PL |
| amazon.com.be | BE |
| amazon.co.jp | JP |
| amazon.com.au | AU |
| amazon.in | IN |
| amazon.sg | SG |
| amazon.com.mx | MX |
| amazon.com.br | BR |
| amazon.ae | AE |
| amazon.sa | SA |
| amazon.com.tr | TR |

---

## 二、UI 变更

### 表格列顺序

```
# | 启用 | 二字码 | 地区 | 国家 | 站点域名 | 邮编 | 格式说明 | 操作
```

### 工具栏

```
[+ 新增站点]  [恢复默认邮编]  [保存]
```
「+ 新增站点」按钮放在工具栏左侧。

### 行内编辑模式

点击某行「编辑」按钮，该行所有字段变为 input，「编辑」变为「确认」+「取消」。同一时刻只允许一行处于编辑状态，打开新行时自动关闭前一行（不保存）。

**编辑行 HTML 结构：**
```html
<tr class="site-row-editing">
  <td>序号</td>
  <td>启用开关（不变）</td>
  <td><input class="site-edit-code" value="CA" maxlength="5"></td>
  <td><input class="site-edit-region" value="北美"></td>
  <td><input class="site-edit-country" value="加拿大"></td>
  <td><input class="site-edit-domain" value="amazon.ca"></td>
  <td><input class="site-edit-zip" value="K1A 0B1"></td>
  <td><input class="site-edit-zipformat" value="字母数字混合"></td>
  <td>
    <button class="btn-site-confirm">确认</button>
    <button class="btn-site-cancel">取消</button>
  </td>
</tr>
```

**确认时校验：**
- `code`：必填，1-5 位大写字母数字，自动转大写
- `domain`：必填，格式 `amazon.xxx`（不含 www.），不允许与已有站点重复
- `country`：必填
- 其余字段：选填

### 新增站点

点「+ 新增站点」在表格**底部**追加一行空白编辑行（同行内编辑结构），`enabled` 默认 `true`，`zip` 和 `zipExample` 默认空。

### 删除站点

每行操作列有「删除」按钮，点击后弹窗确认：`删除站点 [CA - amazon.ca]？此操作不可恢复。`，确认后从 `sitesData` 中移除并立即调用 `saveSites()`。

---

## 三、联动变更

### renderer/fullpage.js

**`SITE_MAP` 常量移除**（硬编码），改为从 `sitesData` 动态构建：

```js
function buildSiteMap() {
  const map = {};
  sitesData.forEach(s => { if (s.code) map[s.code.toUpperCase()] = `www.${s.domain}`; });
  return map;
}
```

`processFile()` 中 SITE_MAP 使用改为 `buildSiteMap()`。

**`getSiteLabel(domain)`** 改为优先返回 `code`（简洁），找不到时 fallback 到 country：

```js
function getSiteLabel(domain) {
  const found = enabledSites.find(s => `www.${s.domain}` === domain);
  if (found) return found.code || found.country;
  const m = domain.match(/amazon\.(.+)$/);
  return m ? m[1].toUpperCase() : domain;
}
```

注意：`getSiteLabel` 已从 `sitesData` 全集而非只 `enabledSites` 查找会更准确，改为从 `sitesData` 查：

```js
function getSiteLabel(domain) {
  const found = sitesData.find(s => `www.${s.domain}` === domain);
  if (found) return found.code || found.country;
  const m = domain.match(/amazon\.(.+)$/);
  return m ? m[1].toUpperCase() : domain;
}
```

---

## 四、文件变更一览

| 文件 | 变更 |
|------|------|
| `electron/sites-data.js` | BUILTIN_SITES 每项加 `code` 字段；buildDefaultSites() 带上 code |
| `renderer/fullpage.html` | sites-table thead 加「二字码」列；工具栏加「+ 新增站点」按钮 |
| `renderer/fullpage.js` | renderSitesTable() 加二字码列 + 操作列；新增 editSiteRow/confirmSiteEdit/cancelSiteEdit/addSiteRow/deleteSite；SITE_MAP 改为 buildSiteMap()；getSiteLabel 改从 sitesData 查 code |
| `renderer/fullpage.css` | 新增编辑行 input 样式；操作按钮样式 |
