# 钉钉个人通知 + 巡店面板开关重排 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增钉钉工作通知（个人推送）功能，设置面板增加 AppKey/AppSecret/AgentId/userId 配置，巡店面板配置区开关重排为两行各2个。

**Architecture:** 设置面板「通知设置」卡片拆分为「群通知」和「个人通知」两个区块；`patrolSettings` 新增 `dingtalkPersonal` 对象存储个人通知配置；`ipc-handlers.js` 新增 `sendDingTalkPersonal()` 函数，先获取 access_token 再发工作通知；巡店面板 `config-switches` 改为 2×2 网格布局，新增群通知/个人通知两个开关。

**Tech Stack:** Electron 28, Node.js ≥16, 钉钉开放平台 API（https 模块，已有 postJSON 封装）

## Global Constraints

- 钉钉工作通知 API：gettoken → `https://oapi.dingtalk.com/gettoken?appkey=&appsecret=`
- 发送工作通知：POST `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2`
- userId 支持多个，逗号分隔，API 参数为 `userid_list`（逗号分隔字符串）
- 消息内容与群通知复用同一份 markdown 模板（`sendDingTalk` 里构建的 text）
- 个人通知消息类型：`markdown`（支持 markdown 格式）
- 群通知开关 id: `enableGroupNotify`；个人通知开关 id: `enablePersonalNotify`
- 原有 `dingtalkEnabled` checkbox 和逻辑保留向后兼容，新开关独立控制
- No new npm dependencies（使用 Node.js 内置 https 模块）
- node --check 所有修改文件

---

## 文件变更一览

| 文件 | 变更 |
|------|------|
| `renderer/fullpage.html` | 通知设置卡片拆为群通知+个人通知；config-switches 改为 2×2 布局，新增群通知/个人通知开关 |
| `renderer/fullpage.js` | dom 新增字段；getSettings/loadSettings 处理新配置；initSettingsSliders 绑定新输入框 |
| `renderer/fullpage.css` | config-switches 改为 2 列网格布局 |
| `electron/ipc-handlers.js` | 新增 `sendDingTalkPersonal()`；`onPatrolComplete` 按开关决定推送 |

---

## Task 1: HTML — 通知设置 + 开关重排

**Files:**
- Modify: `renderer/fullpage.html`

**Interfaces:**
- Produces:
  - 设置面板「通知设置」卡片新增个人通知配置（AppKey/AppSecret/AgentId/userId）
  - 巡店面板 config-switches 变为 2×2 布局，含 enableGroupNotify / enablePersonalNotify

- [ ] **Step 1: 替换设置面板「通知设置」卡片**

找到：
```html
<section class="card">
  <div class="card-header"><span class="card-title">通知设置</span></div>
  <div class="setting-item">
    <label>钉钉机器人 Webhook</label>
    ...
    <input type="checkbox" id="dingtalkEnabled"> 启用钉钉推送
  </div>
</section>
```

替换为：
```html
<section class="card">
  <div class="card-header"><span class="card-title">通知设置</span></div>

  <div class="card-subtitle">群通知</div>
  <div class="setting-item">
    <label>钉钉机器人 Webhook</label>
    <input type="text" id="dingtalkWebhook" class="text-input"
           placeholder="https://oapi.dingtalk.com/robot/send?access_token=...">
    <span class="setting-hint">巡店完成后通过群机器人发送异常报告</span>
  </div>

  <div class="card-subtitle" style="margin-top:16px">个人通知</div>
  <div class="settings-grid">
    <div class="setting-item">
      <label>AppKey</label>
      <input type="text" id="dingtalkAppKey" class="text-input" placeholder="dingxxxxxxxxxx">
    </div>
    <div class="setting-item">
      <label>AppSecret</label>
      <input type="password" id="dingtalkAppSecret" class="text-input" placeholder="xxxxxxxxxx">
    </div>
    <div class="setting-item">
      <label>AgentId</label>
      <input type="text" id="dingtalkAgentId" class="text-input" placeholder="123456789">
    </div>
    <div class="setting-item">
      <label>接收人 userId</label>
      <input type="text" id="dingtalkUserIds" class="text-input" placeholder="user1,user2">
      <span class="setting-hint">多个用户用逗号分隔</span>
    </div>
  </div>
</section>
```

- [ ] **Step 2: 替换巡店面板 config-switches 为 2×2 布局**

找到 `<div class="config-switches">` 整个 div，替换为：

```html
<div class="config-switches">
  <div class="config-switch-row">
    <span class="config-switch-label">启用对比</span>
    <label class="cron-toggle-wrap">
      <input type="checkbox" id="enableRefCompare">
      <span class="cron-toggle-slider"></span>
    </label>
  </div>
  <div class="config-switch-row">
    <span class="config-switch-label">历史对比</span>
    <label class="cron-toggle-wrap">
      <input type="checkbox" id="showHistoryDiff">
      <span class="cron-toggle-slider"></span>
    </label>
  </div>
  <div class="config-switch-row">
    <span class="config-switch-label">群通知</span>
    <label class="cron-toggle-wrap">
      <input type="checkbox" id="enableGroupNotify">
      <span class="cron-toggle-slider"></span>
    </label>
  </div>
  <div class="config-switch-row">
    <span class="config-switch-label">个人通知</span>
    <label class="cron-toggle-wrap">
      <input type="checkbox" id="enablePersonalNotify">
      <span class="cron-toggle-slider"></span>
    </label>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add renderer/fullpage.html
git commit -m "feat: add personal DingTalk config to settings, 2x2 switch grid in patrol panel"
```

---

## Task 2: CSS — config-switches 2×2 网格

**Files:**
- Modify: `renderer/fullpage.css`

**Interfaces:**
- Produces: `.config-switches` 改为 2 列网格，`.card-subtitle` 分组小标题样式

- [ ] **Step 1: 修改 .config-switches 为 2 列网格**

找到：
```css
.config-switches {
  display: flex; flex-direction: column; gap: 8px;
}
```

替换为：
```css
.config-switches {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px;
}
```

- [ ] **Step 2: 新增 .card-subtitle 样式**

在 `.config-section-label` 规则之后插入：

```css
.card-subtitle {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 8px; padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
```

- [ ] **Step 3: Commit**

```bash
git add renderer/fullpage.css
git commit -m "feat: config-switches 2-column grid, add card-subtitle style"
```

---

## Task 3: fullpage.js — 新配置字段绑定

**Files:**
- Modify: `renderer/fullpage.js`

**Interfaces:**
- Produces:
  - `dom` 新增：`dingtalkAppKey`, `dingtalkAppSecret`, `dingtalkAgentId`, `dingtalkUserIds`, `enableGroupNotify`, `enablePersonalNotify`
  - `getSettings()` 新增 `dingtalkPersonal` 对象和两个通知开关
  - `loadSettings()` 恢复新字段
  - `initSettingsSliders()` 绑定新输入框的 input 事件

- [ ] **Step 1: dom 对象新增字段**

在 `dingtalkEnabled: $('#dingtalkEnabled'),` 之后添加：

```js
dingtalkAppKey:      $('#dingtalkAppKey'),
dingtalkAppSecret:   $('#dingtalkAppSecret'),
dingtalkAgentId:     $('#dingtalkAgentId'),
dingtalkUserIds:     $('#dingtalkUserIds'),
enableGroupNotify:   $('#enableGroupNotify'),
enablePersonalNotify:$('#enablePersonalNotify'),
```

- [ ] **Step 2: getSettings() 新增字段**

在 `dingtalkWebhook: dom.dingtalkEnabled.checked ? dom.dingtalkWebhook.value.trim() : '',` 之后添加：

```js
enableGroupNotify:   dom.enableGroupNotify   ? dom.enableGroupNotify.checked   : false,
enablePersonalNotify:dom.enablePersonalNotify ? dom.enablePersonalNotify.checked : false,
dingtalkPersonal: {
  appKey:    dom.dingtalkAppKey    ? dom.dingtalkAppKey.value.trim()    : '',
  appSecret: dom.dingtalkAppSecret ? dom.dingtalkAppSecret.value.trim() : '',
  agentId:   dom.dingtalkAgentId   ? dom.dingtalkAgentId.value.trim()   : '',
  userIds:   dom.dingtalkUserIds   ? dom.dingtalkUserIds.value.trim()   : '',
},
```

- [ ] **Step 3: loadSettings() 恢复新字段**

在 `dom.dingtalkEnabled.checked = !!s.dingtalkWebhook;` 之后添加：

```js
if (dom.enableGroupNotify)    dom.enableGroupNotify.checked    = s.enableGroupNotify    || false;
if (dom.enablePersonalNotify) dom.enablePersonalNotify.checked = s.enablePersonalNotify || false;
if (s.dingtalkPersonal) {
  if (dom.dingtalkAppKey)    dom.dingtalkAppKey.value    = s.dingtalkPersonal.appKey    || '';
  if (dom.dingtalkAppSecret) dom.dingtalkAppSecret.value = s.dingtalkPersonal.appSecret || '';
  if (dom.dingtalkAgentId)   dom.dingtalkAgentId.value   = s.dingtalkPersonal.agentId   || '';
  if (dom.dingtalkUserIds)   dom.dingtalkUserIds.value   = s.dingtalkPersonal.userIds   || '';
}
```

- [ ] **Step 4: initSettingsSliders() 绑定新输入框**

在 `dom.dingtalkEnabled.addEventListener('change', saveSettings);` 之后添加：

```js
if (dom.dingtalkAppKey)     dom.dingtalkAppKey.addEventListener('input', saveSettings);
if (dom.dingtalkAppSecret)  dom.dingtalkAppSecret.addEventListener('input', saveSettings);
if (dom.dingtalkAgentId)    dom.dingtalkAgentId.addEventListener('input', saveSettings);
if (dom.dingtalkUserIds)    dom.dingtalkUserIds.addEventListener('input', saveSettings);
if (dom.enableGroupNotify)  dom.enableGroupNotify.addEventListener('change', saveSettings);
if (dom.enablePersonalNotify) dom.enablePersonalNotify.addEventListener('change', saveSettings);
```

- [ ] **Step 5: node --check 验证**

```bash
node --check renderer/fullpage.js
```

- [ ] **Step 6: Commit**

```bash
git add renderer/fullpage.js
git commit -m "feat: bind DingTalk personal config and notify switches to settings"
```

---

## Task 4: ipc-handlers.js — 个人通知发送逻辑

**Files:**
- Modify: `electron/ipc-handlers.js`

**Interfaces:**
- Consumes: `patrolSettings.dingtalkPersonal`, `patrolSettings.enableGroupNotify`, `patrolSettings.enablePersonalNotify`
- Produces: `sendDingTalkPersonal(text, config)` — 获取 token 后发工作通知

- [ ] **Step 1: 新增 getAccessToken() 函数**

在 `sendDingTalk()` 函数之前插入：

```js
async function getAccessToken(appKey, appSecret) {
  const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = require('https').request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.errcode === 0) resolve(data.access_token);
          else reject(new Error(`获取 access_token 失败: ${data.errmsg}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
```

- [ ] **Step 2: 新增 sendDingTalkPersonal() 函数**

在 `getAccessToken()` 之后插入：

```js
async function sendDingTalkPersonal(text, config) {
  const { appKey, appSecret, agentId, userIds } = config;
  if (!appKey || !appSecret || !agentId || !userIds) return;
  try {
    const token = await getAccessToken(appKey, appSecret);
    const body = {
      agent_id: parseInt(agentId),
      userid_list: userIds,
      msg: {
        msgtype: 'markdown',
        markdown: { title: '亚马逊巡店异常报告', text }
      }
    };
    const res = await postJSON(
      `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${token}`,
      body
    );
    console.log('[Patrol] 钉钉个人通知 HTTP', res.status);
  } catch (e) {
    console.error('[Patrol] 钉钉个人通知失败:', e.message);
  }
}
```

- [ ] **Step 3: 修改 onPatrolComplete() 按开关控制推送**

找到：
```js
const patrolSettings = store.get('patrolSettings');
if (patrolSettings && patrolSettings.dingtalkWebhook) {
  const references = (store.get('referenceData') || {}).rows || [];
  if (references.length > 0) sendDingTalk(summary, patrolSettings.dingtalkWebhook);
}
```

替换为：
```js
const patrolSettings = store.get('patrolSettings');
if (patrolSettings) {
  const references = (store.get('referenceData') || {}).rows || [];
  // 构建消息文本（复用 sendDingTalk 逻辑，需提取为可复用函数）
  const webhookEnabled = patrolSettings.enableGroupNotify && patrolSettings.dingtalkWebhook;
  const personalEnabled = patrolSettings.enablePersonalNotify && patrolSettings.dingtalkPersonal &&
    patrolSettings.dingtalkPersonal.appKey;

  if ((webhookEnabled || personalEnabled) && references.length > 0) {
    const text = buildDingTalkText(summary);
    if (text && webhookEnabled) {
      sendDingTalkWebhook(text, patrolSettings.dingtalkWebhook).catch(e =>
        console.error('[Patrol] 群通知失败:', e.message));
    }
    if (text && personalEnabled) {
      sendDingTalkPersonal(text, patrolSettings.dingtalkPersonal).catch(e =>
        console.error('[Patrol] 个人通知失败:', e.message));
    }
  }
}
```

- [ ] **Step 4: 重构 sendDingTalk() — 提取 buildDingTalkText() 和 sendDingTalkWebhook()**

当前 `sendDingTalk(summary, webhookUrl)` 混合了文本构建和发送。将其拆分：

找到 `async function sendDingTalk(summary, webhookUrl)` 整个函数，替换为：

```js
async function buildDingTalkText(summary) {
  const references = (store.get('referenceData') || {}).rows || [];
  const sites = store.get('sites') || [];

  function findRef(r) {
    return references.find(ref => ref.asin === r.asin && (!ref.site || ref.site === r.site));
  }

  const siteMap = new Map();

  completedResults.forEach(r => {
    const ref = findRef(r);
    const alias = ref && ref.aliasName ? ref.aliasName : '';

    if (r.status !== 'success') {
      if (!siteMap.has(r.site)) siteMap.set(r.site, []);
      siteMap.get(r.site).push({ asin: r.asin, alias, failed: true, error: r.error || '抓取失败' });
      return;
    }
    if (!ref) return;

    const diffs = [];
    if (mismatchPrice(r.price, ref.expectedPrice))
      diffs.push({ field: '售价', expected: ref.expectedPrice, actual: r.price });
    if (mismatchPrice(r.listPrice, ref.expectedListPrice))
      diffs.push({ field: '划线价', expected: ref.expectedListPrice, actual: r.listPrice });
    if (mismatchText(r.dealBadge, ref.expectedDealBadge))
      diffs.push({ field: '活动标', expected: ref.expectedDealBadge, actual: r.dealBadge });
    if (mismatchText(r.acBadge, ref.expectedAcBadge))
      diffs.push({ field: 'AC标', expected: ref.expectedAcBadge, actual: r.acBadge });
    if (mismatchText(r.coupon, ref.expectedCoupon))
      diffs.push({ field: 'Coupon', expected: ref.expectedCoupon, actual: r.coupon });
    if (mismatchRating(r.rating, ref.expectedRating))
      diffs.push({ field: '星级', expected: ref.expectedRating, actual: r.rating });
    if (mismatchReviews(r.reviews, ref.expectedReviews))
      diffs.push({ field: '评论数', expected: ref.expectedReviews, actual: r.reviews });
    if (mismatchText(r.seller, ref.expectedSeller))
      diffs.push({ field: '卖家', expected: ref.expectedSeller, actual: r.seller });
    if (mismatchText(r.stock, ref.expectedStock))
      diffs.push({ field: '库存', expected: ref.expectedStock, actual: r.stock });

    if (diffs.length) {
      if (!siteMap.has(r.site)) siteMap.set(r.site, []);
      siteMap.get(r.site).push({ asin: r.asin, alias, failed: false, diffs });
    }
  });

  if (siteMap.size === 0) return null;

  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  let text = `## 亚马逊巡店异常报告\n\n- **时间**: ${time}\n`;

  siteMap.forEach((items, site) => {
    const siteLabel = getSiteLabel(site);
    const siteInfo = sites.find(s => s.code === site);
    const domain = siteInfo ? siteInfo.domain : site;
    text += `\n---\n\n#### ${siteLabel} · ${domain}\n`;

    items.forEach(item => {
      const nameStr = item.alias ? ` · ${item.alias}` : '';
      text += `\n##### **${item.asin}**${nameStr}\n\n`;
      if (item.failed) {
        text += `- **原因**: <font color=#fa8c16>${item.error}</font>\n`;
      } else {
        item.diffs.forEach(d => {
          const actual = d.actual !== '' && d.actual !== null && d.actual !== undefined
            ? `\`${d.actual}\`` : '`(空)`';
          text += `- **${d.field}**: <font color=#07b807>期望 \`${d.expected}\`</font> → <font color=#ff4d4f>实际 ${actual}</font>\n`;
        });
      }
    });
  });

  text += `\n---\n\n> **汇总**　总计 ${summary.total} 条　用时 ${formatTime(summary.elapsed)}\n`;
  return text;
}

async function sendDingTalkWebhook(text, webhookUrl) {
  if (!webhookUrl || !text) return;
  const body = {
    msgtype: 'markdown',
    markdown: { title: '亚马逊巡店异常报告', text }
  };
  const res = await postJSON(webhookUrl, body);
  console.log('[Patrol] 钉钉群通知 HTTP', res.status);
}
```

- [ ] **Step 5: node --check 验证**

```bash
node --check electron/ipc-handlers.js
```

- [ ] **Step 6: Commit**

```bash
git add electron/ipc-handlers.js
git commit -m "feat: add DingTalk personal notification, split sendDingTalk into build+send"
```
