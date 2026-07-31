## Task 7: getSettings() 清理 + patrolSettings 中 sites/deliveryZips 移除

**Files:**
- Modify: `renderer/fullpage.js`

**Interfaces:**
- Produces: `getSettings()` 不再包含 `sites` 和 `deliveryZips` 字段

- [ ] **Step 1: fullpage.js 修改 getSettings()**

确认 `getSettings()` 中已无 `sites` 和 `deliveryZips` 字段（Task 3 Step 7 已删除）。最终结构应为：

```js
function getSettings() {
  return {
    concurrency:      parseInt(dom.concurrency.value),
    pageInterval:     parseFloat(dom.pageInterval.value) * 1000,
    intervalJitter:   2000,
    batchSize:        parseInt(dom.batchSize.value),
    batchRest:        parseFloat(dom.batchRest.value) * 1000,
    scrapeTimeout:    parseInt(dom.scrapeTimeout.value) * 1000,
    maxRetries:       3,
    retryDelay:       2000,
    dingtalkWebhook:  dom.dingtalkEnabled.checked ? dom.dingtalkWebhook.value.trim() : '',
    enabledFields:    getEnabledFields(),
    showHistoryDiff:  dom.showHistoryDiff.checked,
    showScrapeWindow: dom.showScrapeWindow ? dom.showScrapeWindow.checked : false,
  };
}
```

- [ ] **Step 2: fullpage.js 修改 loadSettings() 移除 sites/deliveryZips 恢复逻辑**

删除 `loadSettings()` 中以下代码：

```js
// 删除：
if (s.sites && s.sites.length > 0) {
  dom.siteCheckboxes.forEach(cb => { cb.checked = s.sites.includes(cb.value); });
}
// 删除 zipUS/zipCA/zipAU/zipMX 赋值代码（若 Task 3 Step 7 已删则跳过）
```

- [ ] **Step 3: 手动验证**

```bash
npm start
# 验证：
# 1. 修改并发参数后保存，settings.json 中 patrolSettings 无 sites / deliveryZips 字段
# 2. 所有巡店功能正常（邮编由 sites.json 提供，站点由分组卡片提供）
```

- [ ] **Step 4: Commit**

```bash
git add renderer/fullpage.js
git commit -m "refactor: remove sites and deliveryZips from patrolSettings, managed by sites.json"
```

---

