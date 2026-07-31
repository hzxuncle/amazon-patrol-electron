# 站点管理页 CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为站点管理页增加二字码字段、行内编辑、新增、删除功能，并联动更新 SITE_MAP 和 getSiteLabel。

**Architecture:** sites-data.js 增加 code 字段；渲染层 renderSitesTable 增加二字码列和操作列，行内编辑用 class 标记编辑态；SITE_MAP 常量改为从 sitesData 动态构建；ipc-handlers.js 的 getSiteLabel 改为返回 code。

**Tech Stack:** Vanilla JS, Electron 28, existing patterns

## Global Constraints

- SiteConfig 新字段：`code: string`（1-5 位大写字母数字）
- `domain` 格式：`amazon.xxx`（不含 www. 前缀）
- 同一时刻只允许一行处于编辑状态
- 编辑确认时校验：code 必填且唯一（大小写不敏感）、domain 必填且唯一、country 必填
- 删除时弹窗确认
- 新增站点 enabled 默认 true
- SITE_MAP 常量移除，改为 buildSiteMap() 动态构建
- getSiteLabel 优先返回 code，找不到时 fallback 到域名后缀
- No new npm dependencies

---

## 文件变更一览

| 文件 | 操作 |
|------|------|
| `electron/sites-data.js` | BUILTIN_SITES 每项加 code；buildDefaultSites 透传 code |
| `electron/ipc-handlers.js` | getSiteLabel 改为返回 found.code |
| `renderer/fullpage.html` | thead 加二字码列；工具栏加「+ 新增站点」按钮 |
| `renderer/fullpage.js` | renderSitesTable 加二字码+操作列；增删改函数；SITE_MAP→buildSiteMap；getSiteLabel 改从 sitesData 查 code |
| `renderer/fullpage.css` | 编辑行 input 样式；操作按钮样式 |

---

## Task 1: sites-data.js + ipc-handlers.js — 加 code 字段

**Files:**
- Modify: `electron/sites-data.js`
- Modify: `electron/ipc-handlers.js`

**Interfaces:**
- Produces: BUILTIN_SITES 每项含 `code` 字段；ipc-handlers getSiteLabel 返回 code

- [ ] **Step 1: sites-data.js — BUILTIN_SITES 每项加 code**

找到 `const BUILTIN_SITES = [` 数组，为每一项加 `code` 字段（紧跟 `domain` 之后）：

```js
const BUILTIN_SITES = [
  { domain: 'amazon.com',    code: 'US', region: '北美', country: '美国',       zipLabel: 'ZIP Code',         zipExample: '10001',    zipFormat: '5位数字' },
  { domain: 'amazon.ca',     code: 'CA', region: '北美', country: '加拿大',     zipLabel: 'Postal Code',      zipExample: 'K1A 0B1',  zipFormat: '字母数字混合 (A1A 1A1)' },
  { domain: 'amazon.co.uk',  code: 'UK', region: '欧洲', country: '英国',       zipLabel: 'Postcode',         zipExample: 'SW1A 1AA', zipFormat: '字母数字混合' },
  { domain: 'amazon.de',     code: 'DE', region: '欧洲', country: '德国',       zipLabel: 'Postleitzahl',     zipExample: '10115',    zipFormat: '5位数字' },
  { domain: 'amazon.fr',     code: 'FR', region: '欧洲', country: '法国',       zipLabel: 'Code Postal',      zipExample: '75008',    zipFormat: '5位数字' },
  { domain: 'amazon.it',     code: 'IT', region: '欧洲', country: '意大利',     zipLabel: 'CAP',              zipExample: '00100',    zipFormat: '5位数字' },
  { domain: 'amazon.es',     code: 'ES', region: '欧洲', country: '西班牙',     zipLabel: 'Código Postal',    zipExample: '28001',    zipFormat: '5位数字' },
  { domain: 'amazon.nl',     code: 'NL', region: '欧洲', country: '荷兰',       zipLabel: 'Postcode',         zipExample: '1012 AB',  zipFormat: '4位数字+2字母' },
  { domain: 'amazon.se',     code: 'SE', region: '欧洲', country: '瑞典',       zipLabel: 'Postnummer',       zipExample: '111 22',   zipFormat: '5位数字' },
  { domain: 'amazon.pl',     code: 'PL', region: '欧洲', country: '波兰',       zipLabel: 'Kod Pocztowy',     zipExample: '00-001',   zipFormat: '5位数字' },
  { domain: 'amazon.com.be', code: 'BE', region: '欧洲', country: '比利时',     zipLabel: 'Code Postal',      zipExample: '1000',     zipFormat: '4位数字' },
  { domain: 'amazon.co.jp',  code: 'JP', region: '亚太', country: '日本',       zipLabel: '郵便番号',          zipExample: '100-0001', zipFormat: '7位数字' },
  { domain: 'amazon.com.au', code: 'AU', region: '亚太', country: '澳大利亚',   zipLabel: 'Postcode',         zipExample: '2000',     zipFormat: '4位数字' },
  { domain: 'amazon.in',     code: 'IN', region: '亚太', country: '印度',       zipLabel: 'PIN Code',         zipExample: '110001',   zipFormat: '6位数字' },
  { domain: 'amazon.sg',     code: 'SG', region: '亚太', country: '新加坡',     zipLabel: 'Postal Code',      zipExample: '238859',   zipFormat: '6位数字' },
  { domain: 'amazon.com.mx', code: 'MX', region: '拉美', country: '墨西哥',     zipLabel: 'Código Postal',    zipExample: '01000',    zipFormat: '5位数字' },
  { domain: 'amazon.com.br', code: 'BR', region: '拉美', country: '巴西',       zipLabel: 'CEP',              zipExample: '01001-000',zipFormat: '8位数字' },
  { domain: 'amazon.ae',     code: 'AE', region: '中东', country: '阿联酋',     zipLabel: 'Postal Code',      zipExample: '00000',    zipFormat: '5位数字(可选)' },
  { domain: 'amazon.sa',     code: 'SA', region: '中东', country: '沙特阿拉伯', zipLabel: 'Postal Code',      zipExample: '11564',    zipFormat: '5位数字' },
  { domain: 'amazon.com.tr', code: 'TR', region: '中东', country: '土耳其',     zipLabel: 'Posta Kodu',       zipExample: '34400',    zipFormat: '5位数字' },
];
```

- [ ] **Step 2: sites-data.js — buildDefaultSites() 透传 code**

`buildDefaultSites()` 已经用 `...s` spread，code 字段自动包含，无需修改。但需确认 `buildDefaultSites()` 输出中确实含 `code`——如无需改动，skip。

- [ ] **Step 3: ipc-handlers.js — getSiteLabel 返回 code**

找到 `function getSiteLabel(domain)` 函数，将 `return found.country` 改为：

```js
if (found) return found.code || found.country;
```

- [ ] **Step 4: Commit**

```bash
git add electron/sites-data.js electron/ipc-handlers.js
git commit -m "feat: add code field to BUILTIN_SITES, getSiteLabel returns code"
```

---

## Task 2: HTML + CSS — 二字码列 + 操作列 + 新增按钮

**Files:**
- Modify: `renderer/fullpage.html`
- Modify: `renderer/fullpage.css`

**Interfaces:**
- Produces: thead 含「二字码」列和「操作」列；工具栏含「+ 新增站点」按钮

- [ ] **Step 1: fullpage.html — 表头加二字码列和操作列**

找到 `<thead>` 里的 `<tr>`，在 `<th>启用</th>` 之后插入二字码列，在 `<th>格式说明</th>` 之后插入操作列：

```html
<tr>
  <th style="width:32px;text-align:center">#</th>
  <th>启用</th>
  <th>二字码</th>
  <th>地区</th>
  <th>国家</th>
  <th>站点域名</th>
  <th>邮编</th>
  <th>格式说明</th>
  <th style="width:100px">操作</th>
</tr>
```

- [ ] **Step 2: fullpage.html — 工具栏加「+ 新增站点」按钮**

找到 `<div class="sites-toolbar">` 内容，在最前面加：

```html
<button id="btnAddSite" class="btn btn-outline">＋ 新增站点</button>
```

完整工具栏变为：
```html
<div class="sites-toolbar">
  <button id="btnAddSite" class="btn btn-outline">＋ 新增站点</button>
  <button id="btnResetZips" class="btn btn-outline">恢复默认邮编</button>
  <button id="btnSaveSites" class="btn btn-primary">保存</button>
</div>
```

- [ ] **Step 3: fullpage.css — 编辑行 input 和操作按钮样式**

在文件末尾追加：

```css
/* ===== 站点管理行内编辑 ===== */
.site-edit-input {
  width: 100%; background: var(--bg-input); border: 1px solid var(--accent);
  color: var(--text-primary); border-radius: 4px; padding: 3px 6px;
  font-size: 12px; font-family: var(--font-mono); box-sizing: border-box;
}
.site-edit-input:focus { outline: none; }
.site-row-editing td { background: rgba(91,94,219,0.04); }
.btn-site-op {
  font-size: 11px; padding: 2px 7px; cursor: pointer;
  background: none; border: 1px solid var(--border);
  color: var(--text-secondary); border-radius: 4px; margin-right: 3px;
  transition: all 0.15s;
}
.btn-site-op:hover { border-color: var(--accent); color: var(--accent); }
.btn-site-op.danger:hover { border-color: var(--danger); color: var(--danger); }
.btn-site-op.confirm { border-color: var(--success); color: var(--success); }
.btn-site-op.confirm:hover { background: rgba(0,168,84,0.08); }
```

- [ ] **Step 4: Commit**

```bash
git add renderer/fullpage.html renderer/fullpage.css
git commit -m "feat: add code column, ops column, add-site button to sites table"
```

---

## Task 3: fullpage.js — 完整 CRUD 逻辑

**Files:**
- Modify: `renderer/fullpage.js`

**Interfaces:**
- Consumes: `sitesData[i].code`
- Produces: renderSitesTable 含二字码+操作列；editSiteRow/confirmSiteEdit/cancelSiteEdit/addSiteRow/deleteSite；buildSiteMap()；getSiteLabel 查 sitesData.code

- [ ] **Step 1: 移除 SITE_MAP 常量，新增 buildSiteMap()**

删除：
```js
const SITE_MAP = {
  'US': 'www.amazon.com', 'CA': 'www.amazon.ca',
  ...
};
```

在其位置插入：
```js
function buildSiteMap() {
  const map = {};
  sitesData.forEach(s => { if (s.code) map[s.code.toUpperCase()] = `www.${s.domain}`; });
  return map;
}
```

- [ ] **Step 2: processFile() 改用 buildSiteMap()**

在 `processFile()` 中，找到：
```js
const SITE_MAP = { ... };  // 如果还有局部定义的话
rows.forEach(r => {
  if (r.site && !r.site.startsWith('www.')) {
    r.site = SITE_MAP[r.site.toUpperCase()] || r.site;
  }
});
```

改为：
```js
const siteMap = buildSiteMap();
rows.forEach(r => {
  if (r.site && !r.site.startsWith('www.')) {
    r.site = siteMap[r.site.toUpperCase()] || r.site;
  }
});
```

- [ ] **Step 3: getSiteLabel 改从 sitesData 查 code**

找到 `function getSiteLabel(domain)` 函数，替换为：

```js
function getSiteLabel(domain) {
  const found = sitesData.find(s => `www.${s.domain}` === domain || s.domain === domain);
  if (found) return found.code || found.country;
  const m = domain.match(/amazon\.(.+)$/);
  return m ? m[1].toUpperCase() : domain;
}
```

- [ ] **Step 4: renderSitesTable 加二字码列和操作列**

找到 `renderSitesTable()` 函数，将行模板替换为（在现有字段基础上加 code 列和操作列）：

```js
function renderSitesTable() {
  const sorted = sitesData
    .map((s, i) => ({ ...s, _origIdx: i }))
    .sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));

  sitesDom.tableBody().innerHTML = sorted.map((s, seq) => `
    <tr data-index="${s._origIdx}">
      <td style="color:var(--text-muted);font-size:11px;text-align:center;width:32px">${seq + 1}</td>
      <td>
        <label class="cron-toggle-wrap" title="${s.enabled ? '点击禁用' : '点击启用'}">
          <input type="checkbox" class="site-enable-chk" data-index="${s._origIdx}" ${s.enabled ? 'checked' : ''}>
          <span class="cron-toggle-slider"></span>
        </label>
      </td>
      <td><code style="font-size:12px">${esc(s.code || '')}</code></td>
      <td>${esc(s.region || '')}</td>
      <td>${esc(s.country || '')}</td>
      <td><code style="font-size:12px">${esc(s.domain || '')}</code></td>
      <td><input type="text" class="zip-input" data-index="${s._origIdx}" value="${esc(s.zip || '')}" placeholder="${esc(s.zipExample || '')}"></td>
      <td><span class="zip-format-hint">${esc(s.zipFormat || '')}</span></td>
      <td>
        <button class="btn-site-op" onclick="editSiteRow(${s._origIdx})">编辑</button>
        <button class="btn-site-op danger" onclick="deleteSite(${s._origIdx})">删除</button>
      </td>
    </tr>
  `).join('');

  sitesDom.tableBody().querySelectorAll('.site-enable-chk').forEach(chk => {
    chk.addEventListener('change', async () => {
      const idx = parseInt(chk.dataset.index);
      sitesData[idx].enabled = chk.checked;
      await window.electronAPI.saveSites(sitesData);
      syncEnabledSites();
      renderSitesTable();
    });
  });
}
```

- [ ] **Step 5: 新增行内编辑函数 editSiteRow / confirmSiteEdit / cancelSiteEdit**

在 `renderSitesTable` 函数之后插入：

```js
function editSiteRow(idx) {
  // 关闭已有编辑行（不保存）
  const existing = sitesDom.tableBody().querySelector('.site-row-editing');
  if (existing) existing.remove();  // 新增行直接删除；已有行还原
  renderSitesTable();

  const s = sitesData[idx];
  const rows = sitesDom.tableBody().querySelectorAll('tr');
  // 找到对应行（data-index 匹配）
  const row = [...rows].find(r => r.dataset.index === String(idx));
  if (!row) return;

  row.classList.add('site-row-editing');
  row.innerHTML = `
    <td style="color:var(--text-muted);font-size:11px;text-align:center"></td>
    <td>
      <label class="cron-toggle-wrap">
        <input type="checkbox" class="site-enable-chk-edit" ${s.enabled ? 'checked' : ''}>
        <span class="cron-toggle-slider"></span>
      </label>
    </td>
    <td><input class="site-edit-input site-edit-code" value="${esc(s.code || '')}" maxlength="5" placeholder="US"></td>
    <td><input class="site-edit-input site-edit-region" value="${esc(s.region || '')}" placeholder="北美"></td>
    <td><input class="site-edit-input site-edit-country" value="${esc(s.country || '')}" placeholder="美国"></td>
    <td><input class="site-edit-input site-edit-domain" value="${esc(s.domain || '')}" placeholder="amazon.com"></td>
    <td><input class="site-edit-input site-edit-zip" value="${esc(s.zip || '')}" placeholder="${esc(s.zipExample || '')}"></td>
    <td><input class="site-edit-input site-edit-zipformat" value="${esc(s.zipFormat || '')}" placeholder="5位数字"></td>
    <td>
      <button class="btn-site-op confirm" onclick="confirmSiteEdit(${idx})">确认</button>
      <button class="btn-site-op" onclick="cancelSiteEdit()">取消</button>
    </td>
  `;
}

async function confirmSiteEdit(idx) {
  const row = sitesDom.tableBody().querySelector('.site-row-editing');
  if (!row) return;

  const code    = row.querySelector('.site-edit-code').value.trim().toUpperCase();
  const region  = row.querySelector('.site-edit-region').value.trim();
  const country = row.querySelector('.site-edit-country').value.trim();
  const domain  = row.querySelector('.site-edit-domain').value.trim().replace(/^www\./, '');
  const zip     = row.querySelector('.site-edit-zip').value.trim();
  const zipFormat = row.querySelector('.site-edit-zipformat').value.trim();
  const enabled = row.querySelector('.site-enable-chk-edit').checked;

  if (!code || !/^[A-Z0-9]{1,5}$/.test(code)) { alert('二字码必填，仅限 1-5 位大写字母或数字'); return; }
  if (!domain) { alert('站点域名必填'); return; }
  if (!country) { alert('国家名称必填'); return; }

  // 唯一性校验（排除自身）
  const codeConflict = sitesData.some((s, i) => i !== idx && s.code && s.code.toUpperCase() === code);
  if (codeConflict) { alert(`二字码 ${code} 已存在`); return; }
  const domainConflict = sitesData.some((s, i) => i !== idx && s.domain === domain);
  if (domainConflict) { alert(`域名 ${domain} 已存在`); return; }

  sitesData[idx] = { ...sitesData[idx], code, region, country, domain, zip, zipFormat, enabled };
  await window.electronAPI.saveSites(sitesData);
  syncEnabledSites();
  renderSitesTable();
}

function cancelSiteEdit() {
  renderSitesTable();
}
```

- [ ] **Step 6: 新增 addSiteRow 函数**

```js
function addSiteRow() {
  // 关闭已有编辑行
  const existing = sitesDom.tableBody().querySelector('.site-row-editing');
  if (existing) existing.remove();
  renderSitesTable();

  // 新增临时站点占位（idx = sitesData.length，新增时再 push）
  const newIdx = sitesData.length;
  const newRow = document.createElement('tr');
  newRow.className = 'site-row-editing';
  newRow.dataset.index = String(newIdx);
  newRow.innerHTML = `
    <td style="color:var(--text-muted);font-size:11px;text-align:center">新</td>
    <td>
      <label class="cron-toggle-wrap">
        <input type="checkbox" class="site-enable-chk-edit" checked>
        <span class="cron-toggle-slider"></span>
      </label>
    </td>
    <td><input class="site-edit-input site-edit-code" value="" maxlength="5" placeholder="NZ"></td>
    <td><input class="site-edit-input site-edit-region" value="" placeholder="亚太"></td>
    <td><input class="site-edit-input site-edit-country" value="" placeholder="新西兰"></td>
    <td><input class="site-edit-input site-edit-domain" value="" placeholder="amazon.co.nz"></td>
    <td><input class="site-edit-input site-edit-zip" value="" placeholder="1010"></td>
    <td><input class="site-edit-input site-edit-zipformat" value="" placeholder="4位数字"></td>
    <td>
      <button class="btn-site-op confirm" onclick="confirmAddSite()">确认</button>
      <button class="btn-site-op" onclick="cancelSiteEdit()">取消</button>
    </td>
  `;
  sitesDom.tableBody().appendChild(newRow);
}

async function confirmAddSite() {
  const row = sitesDom.tableBody().querySelector('.site-row-editing');
  if (!row) return;

  const code    = row.querySelector('.site-edit-code').value.trim().toUpperCase();
  const region  = row.querySelector('.site-edit-region').value.trim();
  const country = row.querySelector('.site-edit-country').value.trim();
  const domain  = row.querySelector('.site-edit-domain').value.trim().replace(/^www\./, '');
  const zip     = row.querySelector('.site-edit-zip').value.trim();
  const zipFormat = row.querySelector('.site-edit-zipformat').value.trim();
  const enabled = row.querySelector('.site-enable-chk-edit').checked;

  if (!code || !/^[A-Z0-9]{1,5}$/.test(code)) { alert('二字码必填，仅限 1-5 位大写字母或数字'); return; }
  if (!domain) { alert('站点域名必填'); return; }
  if (!country) { alert('国家名称必填'); return; }

  const codeConflict = sitesData.some(s => s.code && s.code.toUpperCase() === code);
  if (codeConflict) { alert(`二字码 ${code} 已存在`); return; }
  const domainConflict = sitesData.some(s => s.domain === domain);
  if (domainConflict) { alert(`域名 ${domain} 已存在`); return; }

  sitesData.push({ code, region, country, domain, zip, zipExample: zip, zipFormat, enabled });
  await window.electronAPI.saveSites(sitesData);
  syncEnabledSites();
  renderSitesTable();
}
```

- [ ] **Step 7: 新增 deleteSite 函数**

```js
async function deleteSite(idx) {
  const s = sitesData[idx];
  const label = `${s.code || s.domain} - ${s.country || s.domain}`;
  if (!confirm(`删除站点 [${label}]？此操作不可恢复。`)) return;
  sitesData.splice(idx, 1);
  await window.electronAPI.saveSites(sitesData);
  syncEnabledSites();
  renderSitesTable();
}
```

- [ ] **Step 8: initSitesTab 绑定「+ 新增站点」按钮**

找到 `initSitesTab()` 函数，在 `sitesDom.btnSave()` 和 `sitesDom.btnReset()` 绑定之后加：

```js
document.getElementById('btnAddSite').addEventListener('click', addSiteRow);
```

- [ ] **Step 9: node --check 验证**

```bash
node --check renderer/fullpage.js
```

Expected: no output

- [ ] **Step 10: 手动验证**

```bash
npm start
```

1. 站点页面表格显示「二字码」列（US/CA/AU/MX 等）和「操作」列（编辑/删除按钮）
2. 点「编辑」，该行变为可编辑状态，修改二字码后点「确认」，表格刷新
3. 点「+ 新增站点」，表格底部出现空白编辑行，填写后确认，新站点出现在表格且可在巡店面板选择
4. 点「删除」，弹窗确认后站点消失
5. 巡店结果表格「站点」列显示二字码（如 CA、US）而非完整域名
6. Excel 导入时站点列填 CA 或 www.amazon.ca 均正确匹配

- [ ] **Step 11: Commit**

```bash
git add renderer/fullpage.js
git commit -m "feat: sites CRUD - add/edit/delete, code field, dynamic SITE_MAP, getSiteLabel returns code"
```
