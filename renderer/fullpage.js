/**
 * Amazon Patrol Fullpage Controller v2
 * 全屏面板交互：巡店控制 / 参考对比标红 / 历史Diff / 智能重试 / Excel导出
 */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ========== DOM ==========
const dom = {
  // Side tabs
  sideTabs: $$('.side-tab'),
  tabPanels: $$('.tab-panel'),

  // Buttons
  btnStart: $('#btnStart'),
  btnStop: $('#btnStop'),
  btnRetry: $('#btnRetry'),
  btnExport: $('#btnExport'),
  btnClear: $('#btnClear'),

  // Progress
  progressSection: $('#progressSection'),
  progressText: $('#progressText'),
  progressTime: $('#progressTime'),
  progressStatus: $('#progressStatus'),
  progressFill: $('#progressFill'),

  // Table
  resultsBody: $('#resultsBody'),
  resultsSummary: $('#resultsSummary'),
  showHistoryDiff: $('#showHistoryDiff'),

  // Import
  uploadZone: $('#uploadZone'),
  fileInput: $('#fileInput'),
  btnDownloadTemplate: $('#btnDownloadTemplate'),
  btnClearRef: $('#btnClearRef'),
  refCard: $('#refCard'),
  refBody: $('#refBody'),
  refCount: $('#refCount'),

  // Settings
  concurrency: $('#concurrency'),
  concurrencyVal: $('#concurrencyVal'),
  pageInterval: $('#pageInterval'),
  pageIntervalVal: $('#pageIntervalVal'),
  batchSize: $('#batchSize'),
  batchSizeVal: $('#batchSizeVal'),
  batchRest: $('#batchRest'),
  batchRestVal: $('#batchRestVal'),
  scrapeTimeout: $('#scrapeTimeout'),
  scrapeTimeoutVal: $('#scrapeTimeoutVal'),
  dingtalkWebhook: $('#dingtalkWebhook'),
  dingtalkEnabled: $('#dingtalkEnabled'),
  dingtalkAppKey:      $('#dingtalkAppKey'),
  dingtalkAppSecret:   $('#dingtalkAppSecret'),
  dingtalkAgentId:     $('#dingtalkAgentId'),
  dingtalkUserIds:     $('#dingtalkUserIds'),
  enableGroupNotify:   $('#enableGroupNotify'),
  enablePersonalNotify:$('#enablePersonalNotify'),
  showScrapeWindow: $('#showScrapeWindow'),

  // Status
  statusBadge: $('#statusBadge'),
  statusLabel: $('#statusLabel'),
  statusDot: $('#statusBadge .status-dot'),

  // Column toggle
  colHistory: $('#colHistory'),
  enableRefCompare: $('#enableRefCompare'),

  // Field toggles
  fieldToggles: $$('.field-toggle input[type="checkbox"]'),
  btnToggleAll: $('#btnToggleAll'),
  btnToggleNone: $('#btnToggleNone')
};


// ========== State ==========
let patrolRunning = false;
let patrolTimer = null;
let referenceData = null;
let allResults = [];
let historySnapshots = {};

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initTabs();
  initSettingsSliders();
  initImportHandlers();
  initActionHandlers();
  initFieldToggles();
  initCronTab();
  initLogTab();
  initHistoryTab();
  initProductInfoOverlay();
  await initSitesTab();
  await initSiteGroups();
  await loadPersistedState();

  window.electronAPI.onMessage(handleBgMessage);
  window.electronAPI.storage.onChanged(handleStorageChange);

  setInterval(refreshStatus, 2000);
});

// ========== Tabs ==========
function initTabs() {
  dom.sideTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      dom.sideTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      dom.tabPanels.forEach(p => p.classList.remove('active'));
      $(`#tab-${name}`).classList.add('active');
    });
  });
}

// ========== Settings ==========
function initSettingsSliders() {
  const pairs = [
    [dom.concurrency, dom.concurrencyVal],
    [dom.pageInterval, dom.pageIntervalVal],
    [dom.batchSize, dom.batchSizeVal],
    [dom.batchRest, dom.batchRestVal],
    [dom.scrapeTimeout, dom.scrapeTimeoutVal]
  ];
  pairs.forEach(([slider, display]) => {
    display.textContent = slider.value;
    slider.addEventListener('input', () => { display.textContent = slider.value; saveSettings(); });
  });
  dom.dingtalkWebhook.addEventListener('input', saveSettings);
  if (dom.dingtalkEnabled) dom.dingtalkEnabled.addEventListener('change', saveSettings);
  if (dom.dingtalkAppKey)     dom.dingtalkAppKey.addEventListener('input', saveSettings);
  if (dom.dingtalkAppSecret)  dom.dingtalkAppSecret.addEventListener('input', saveSettings);
  if (dom.dingtalkAgentId)    dom.dingtalkAgentId.addEventListener('input', saveSettings);
  if (dom.dingtalkUserIds)    dom.dingtalkUserIds.addEventListener('input', saveSettings);
  if (dom.enableGroupNotify) dom.enableGroupNotify.addEventListener('change', () => {
    if (dom.enableGroupNotify.checked && dom.enablePersonalNotify) dom.enablePersonalNotify.checked = false;
    saveSettings();
  });
  if (dom.enablePersonalNotify) dom.enablePersonalNotify.addEventListener('change', () => {
    if (dom.enablePersonalNotify.checked && dom.enableGroupNotify) dom.enableGroupNotify.checked = false;
    saveSettings();
  });
  if (dom.showScrapeWindow) dom.showScrapeWindow.addEventListener('change', saveSettings);
  dom.showHistoryDiff.addEventListener('change', () => {
    renderAllResults();
    saveSettings();
  });
  dom.enableRefCompare.addEventListener('change', async () => {
    if (dom.enableRefCompare.checked) {
      const hasRef = referenceData && referenceData.rows && referenceData.rows.length > 0;
      if (!hasRef) {
        await showAlert('提示', '请先在「参考数据」Tab 导入参考数据');
        dom.enableRefCompare.checked = false;
        return;
      }
    }
    renderAllResults();
    saveSettings();
  });
}

function getSettings() {
  return {
    concurrency: parseInt(dom.concurrency.value),
    pageInterval: parseFloat(dom.pageInterval.value) * 1000,
    intervalJitter: 2000,
    batchSize: parseInt(dom.batchSize.value),
    batchRest: parseFloat(dom.batchRest.value) * 1000,
    scrapeTimeout: parseInt(dom.scrapeTimeout.value) * 1000,
    maxRetries: 3,
    retryDelay: 2000,
    dingtalkWebhook: dom.dingtalkWebhook ? dom.dingtalkWebhook.value.trim() : '',
    enableGroupNotify:   dom.enableGroupNotify   ? dom.enableGroupNotify.checked   : false,
    enablePersonalNotify:dom.enablePersonalNotify ? dom.enablePersonalNotify.checked : false,
    dingtalkPersonal: {
      appKey:    dom.dingtalkAppKey    ? dom.dingtalkAppKey.value.trim()    : '',
      appSecret: dom.dingtalkAppSecret ? dom.dingtalkAppSecret.value.trim() : '',
      agentId:   dom.dingtalkAgentId   ? dom.dingtalkAgentId.value.trim()   : '',
    },
    dingtalkPersonalPhones: dom.dingtalkUserIds ? dom.dingtalkUserIds.value.trim() : '',
    showHistoryDiff: dom.showHistoryDiff.checked,
    enableRefCompare: dom.enableRefCompare ? dom.enableRefCompare.checked : false,
    enabledFields: getEnabledFields(),
    fieldOrder: fieldOrder,
    showScrapeWindow: dom.showScrapeWindow ? dom.showScrapeWindow.checked : false
  };
}

// ========== Field Toggles ==========

// 所有可排序字段的默认顺序（与 HTML 中 data-field 顺序一致）
const DEFAULT_FIELD_ORDER = [
  'price','listPrice','dealBadge','acBadge','coupon',
  'rating','reviews','seller','stock','parentAsin',
  'title','url','productInfo',
  'bsrMainRank','bsrMainCategory','bsrSubRank','bsrSubCategory'
];

const FIELD_LABELS = {
  price: '售价', listPrice: '划线价', dealBadge: '活动标', acBadge: 'AC标',
  coupon: 'Coupon', rating: '星级', reviews: '评论数', seller: '卖家',
  stock: '库存', parentAsin: '父体', title: '标题', url: 'URL',
  productInfo: '产品信息', bsrMainRank: 'BSR大类排名', bsrMainCategory: 'BSR大类名',
  bsrSubRank: 'BSR小类排名', bsrSubCategory: 'BSR小类名'
};

let fieldOrder = [...DEFAULT_FIELD_ORDER];

function initFieldToggles() {
  dom.btnToggleAll.addEventListener('click', () => {
    dom.fieldToggles.forEach(cb => { cb.checked = true; });
    saveSettings();
  });
  dom.btnToggleNone.addEventListener('click', () => {
    dom.fieldToggles.forEach(cb => { cb.checked = false; });
    saveSettings();
  });
  dom.fieldToggles.forEach(cb => {
    cb.addEventListener('change', () => saveSettings());
  });
  document.getElementById('btnColumnOrder').addEventListener('click', showColumnOrderDialog);
}

function getEnabledFields() {
  return [...dom.fieldToggles]
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.field);
}

// 返回按当前 fieldOrder 排序后的 enabledFields
function getOrderedEnabledFields() {
  const enabled = new Set(getEnabledFields());
  const ordered = fieldOrder.filter(f => enabled.has(f));
  // 未在 fieldOrder 里的字段追加到末尾
  getEnabledFields().forEach(f => { if (!fieldOrder.includes(f)) ordered.push(f); });
  return ordered;
}

function showColumnOrderDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'product-info-overlay';
  overlay.id = 'colOrderOverlay';

  const listHtml = fieldOrder.map((f, i) => `
    <div class="col-order-item" data-field="${f}" draggable="true">
      <span class="col-order-handle">⠿</span>
      <span>${esc(FIELD_LABELS[f] || f)}</span>
    </div>
  `).join('');

  overlay.innerHTML = `
    <div class="col-order-dialog">
      <div class="confirm-dialog-header"><span>调整列顺序</span></div>
      <p class="col-order-hint">拖拽调整显示顺序，固定列（状态/站点/ASIN/标题/上次）不参与排序</p>
      <div class="col-order-list" id="colOrderList">${listHtml}</div>
      <div class="confirm-dialog-footer">
        <button class="btn btn-ghost confirm-cancel" onclick="closeColOrderDialog(false)">取消</button>
        <button class="btn btn-outline" onclick="resetColOrder()">重置</button>
        <button class="btn btn-primary confirm-ok" onclick="closeColOrderDialog(true)">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  initColOrderDrag();
  overlay.addEventListener('click', e => { if (e.target === overlay) closeColOrderDialog(false); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { closeColOrderDialog(false); document.removeEventListener('keydown', onKey); }
  });
}

function initColOrderDrag() {
  const list = document.getElementById('colOrderList');
  let dragSrc = null;
  let scrollTimer = null;
  const SCROLL_ZONE = 48; // px from edge to trigger scroll
  const SCROLL_SPEED = 8;

  list.querySelectorAll('.col-order-item').forEach(item => {
    item.addEventListener('dragstart', () => { dragSrc = item; item.classList.add('dragging'); });
    item.addEventListener('dragend', () => {
      dragSrc = null;
      item.classList.remove('dragging');
      list.querySelectorAll('.col-order-item').forEach(i => i.classList.remove('drag-over'));
      clearInterval(scrollTimer); scrollTimer = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (dragSrc && dragSrc !== item) item.classList.add('drag-over');
      // 边缘自动滚动
      const rect = list.getBoundingClientRect();
      const y = e.clientY;
      clearInterval(scrollTimer);
      if (y - rect.top < SCROLL_ZONE) {
        scrollTimer = setInterval(() => { list.scrollTop -= SCROLL_SPEED; }, 16);
      } else if (rect.bottom - y < SCROLL_ZONE) {
        scrollTimer = setInterval(() => { list.scrollTop += SCROLL_SPEED; }, 16);
      }
    });
    item.addEventListener('dragleave', () => { item.classList.remove('drag-over'); clearInterval(scrollTimer); scrollTimer = null; });
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      clearInterval(scrollTimer); scrollTimer = null;
      if (!dragSrc || dragSrc === item) return;
      const items = [...list.querySelectorAll('.col-order-item')];
      const srcIdx = items.indexOf(dragSrc);
      const dstIdx = items.indexOf(item);
      if (srcIdx < dstIdx) item.after(dragSrc);
      else item.before(dragSrc);
    });
  });
}

function closeColOrderDialog(save) {
  const overlay = document.getElementById('colOrderOverlay');
  if (!overlay) return;
  if (save) {
    const newOrder = [...overlay.querySelectorAll('.col-order-item')].map(el => el.dataset.field);
    fieldOrder = newOrder;
    saveSettings();
    renderAllResults();
  }
  overlay.remove();
}

function resetColOrder() {
  fieldOrder = [...DEFAULT_FIELD_ORDER];
  const list = document.getElementById('colOrderList');
  if (!list) return;
  const items = [...list.querySelectorAll('.col-order-item')];
  DEFAULT_FIELD_ORDER.forEach(f => {
    const item = items.find(el => el.dataset.field === f);
    if (item) list.appendChild(item);
  });
}

async function saveSettings() {
  await window.electronAPI.storage.set('patrolSettings', getSettings());
}

async function loadSettings() {
  const data = await window.electronAPI.storage.get('patrolSettings');
  if (data) {
    const s = data;
    dom.concurrency.value = s.concurrency || 2; dom.concurrencyVal.textContent = s.concurrency || 2;
    dom.pageInterval.value = (s.pageInterval || 4000) / 1000; dom.pageIntervalVal.textContent = (s.pageInterval || 4000) / 1000;
    dom.batchSize.value = s.batchSize || 20; dom.batchSizeVal.textContent = s.batchSize || 20;
    dom.batchRest.value = (s.batchRest || 30000) / 1000; dom.batchRestVal.textContent = (s.batchRest || 30000) / 1000;
    dom.scrapeTimeout.value = (s.scrapeTimeout || 25000) / 1000; dom.scrapeTimeoutVal.textContent = (s.scrapeTimeout || 25000) / 1000;
    dom.dingtalkWebhook.value = s.dingtalkWebhook || '';
    if (dom.enableGroupNotify)    dom.enableGroupNotify.checked    = s.enableGroupNotify    || false;
    if (dom.enablePersonalNotify) dom.enablePersonalNotify.checked = s.enablePersonalNotify || false;
    if (s.dingtalkPersonal) {
      if (dom.dingtalkAppKey)    dom.dingtalkAppKey.value    = s.dingtalkPersonal.appKey    || '';
      if (dom.dingtalkAppSecret) dom.dingtalkAppSecret.value = s.dingtalkPersonal.appSecret || '';
      if (dom.dingtalkAgentId)   dom.dingtalkAgentId.value   = s.dingtalkPersonal.agentId   || '';
    }
    if (dom.dingtalkUserIds) dom.dingtalkUserIds.value = s.dingtalkPersonalPhones || '';
    dom.showHistoryDiff.checked = s.showHistoryDiff || false;
    if (dom.enableRefCompare) dom.enableRefCompare.checked = s.enableRefCompare || false;
    // 恢复字段勾选
    if (s.enabledFields && s.enabledFields.length > 0) {
      dom.fieldToggles.forEach(cb => { cb.checked = s.enabledFields.includes(cb.dataset.field); });
    }
    if (s.fieldOrder && s.fieldOrder.length > 0) {
      fieldOrder = s.fieldOrder;
    }
    if (dom.showScrapeWindow) dom.showScrapeWindow.checked = s.showScrapeWindow || false;
  }
}

// ========== Persistence ==========
async function loadPersistedState() {
  // 恢复设置
  await loadSettings();

  // 恢复参考数据
  const refData = await window.electronAPI.storage.get('referenceData');
  if (refData) {
    // 兼容旧格式（数组）
    if (Array.isArray(refData)) {
      referenceData = { importedAt: null, fileName: '（历史数据）', rows: refData };
    } else {
      referenceData = refData;
    }
    renderRefPreview();
  }

  // 恢复历史快照
  const hist = await window.electronAPI.storage.get('historySnapshots');
  if (hist) { historySnapshots = hist; }

  // 恢复结果
  const resultsData = await window.electronAPI.storage.get('patrolResults');
  if (resultsData && resultsData.length > 0) {
    allResults = resultsData;
    renderAllResults();
    dom.btnExport.disabled = false;
    // 用最后一条结果的时间戳作为"上次巡店"时间
    const lastTs = allResults[allResults.length - 1]?.timestamp;
    if (lastTs) setPatrolTimestamp('restored', lastTs);
  }

  // 恢复巡店状态
  const state = await window.electronAPI.storage.get('patrolState');
  if (state && state.running) {
    patrolRunning = true;
    updateUiRunning(state.totalCount || 0);
    startTimer();
    refreshStatus();
  }

  // 开机自启动开关
  const openAtLoginCb = document.getElementById('openAtLogin');
  if (openAtLoginCb) {
    try {
      const loginItem = await window.electronAPI.getLoginItem();
      openAtLoginCb.checked = loginItem ? !!loginItem.openAtLogin : false;
    } catch(e) {}
    openAtLoginCb.addEventListener('change', async () => {
      await window.electronAPI.setLoginItem(openAtLoginCb.checked);
    });
  }
}

// ========== Import ==========
function initImportHandlers() {
  dom.uploadZone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') dom.fileInput.click();
  });
  dom.uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); dom.uploadZone.style.borderColor = 'var(--accent)'; });
  dom.uploadZone.addEventListener('dragleave', () => { dom.uploadZone.style.borderColor = 'var(--border)'; });
  dom.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault(); dom.uploadZone.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  });
  dom.fileInput.addEventListener('change', (e) => { if (e.target.files[0]) processFile(e.target.files[0]); });
  dom.btnDownloadTemplate.addEventListener('click', downloadTemplate);
  dom.btnClearRef.addEventListener('click', clearRef);
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      if (typeof XLSX === 'undefined') { await showAlert('提示', 'Excel库加载中'); return; }
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rawRows.length === 0) { await showAlert('导入失败', '没有数据'); return; }

      // 校验必须列
      const sample = rawRows[0];
      const hasAsin = 'ASIN' in sample || 'asin' in sample;
      const hasSite = '站点' in sample || 'Site' in sample || 'site' in sample;
      if (!hasAsin) { await showAlert('导入失败', '导入失败：Excel 缺少 ASIN 列'); return; }
      if (!hasSite) { await showAlert('导入失败', '导入失败：Excel 缺少 站点 列（列名：站点 或 Site）'); return; }

      const rows = rawRows.map(r => ({
        asin:               String(r['ASIN'] || r['asin'] || '').trim(),
        site:               String(r['站点'] || r['Site'] || r['site'] || '').trim(),
        aliasName:          String(r['常用名'] || r['Alias'] || r['alias'] || '').trim(),
        expectedPrice:      String(r['期望售价'] || r['Expected Price'] || r['expectedPrice'] || '').trim(),
        expectedListPrice:  String(r['期望划线价'] || r['Expected List Price'] || r['expectedListPrice'] || '').trim(),
        expectedDealBadge:  String(r['期望活动标'] || r['Expected Deal'] || r['expectedDeal'] || '').trim(),
        expectedAcBadge:    String(r['期望AC标'] || r['Expected AC'] || r['expectedAc'] || '').trim(),
        expectedCoupon:     String(r['期望Coupon'] || r['Expected Coupon'] || r['expectedCoupon'] || '').trim(),
        expectedRating:     String(r['期望星级'] || r['Expected Rating'] || r['expectedRating'] || '').trim(),
        expectedReviews:    String(r['期望评论数'] || r['Expected Reviews'] || r['expectedReviews'] || '').trim(),
        expectedSeller:          String(r['期望卖家'] || r['Expected Seller'] || r['expectedSeller'] || '').trim(),
        expectedStock:           String(r['期望库存'] || r['Expected Stock'] || r['expectedStock'] || '').trim(),
        expectedBsrMainRank:     String(r['期望BSR大类排名'] || r['Expected BSR Main Rank'] || r['expectedBsrMainRank'] || '').trim(),
        expectedBsrMainCategory: String(r['期望BSR大类名'] || r['Expected BSR Main Category'] || r['expectedBsrMainCategory'] || '').trim(),
        expectedBsrSubRank:      String(r['期望BSR小类排名'] || r['Expected BSR Sub Rank'] || r['expectedBsrSubRank'] || '').trim(),
        expectedBsrSubCategory:  String(r['期望BSR小类名'] || r['Expected BSR Sub Category'] || r['expectedBsrSubCategory'] || '').trim(),
      })).filter(r => r.asin);

      // 将站点标识规范化为二字码（code）
      rows.forEach(r => {
        if (!r.site) return;
        // 如果已经是代码形式（不含点号），转为大写即可
        if (!r.site.includes('.')) {
          r.site = r.site.toUpperCase();
          return;
        }
        // 如果是域名形式（www.amazon.ca 或 amazon.ca），查找对应 code
        const found = sitesData.find(s => `www.${s.domain}` === r.site || s.domain === r.site);
        if (found && found.code) r.site = found.code;
      });

      const now = new Date().toISOString();
      referenceData = { importedAt: now, fileName: file.name, rows };
      window.electronAPI.storage.set('referenceData', referenceData)
        .catch(e => console.error('[Store] referenceData 保存失败:', e));
      renderRefPreview();
      autoFillAsinGroups(rows);
    } catch (err) { await showAlert('导入失败', '解析失败: ' + err.message); }
  };
  reader.readAsArrayBuffer(file);
}

function renderRefPreview() {
  if (!referenceData || !referenceData.rows || !referenceData.rows.length) {
    dom.refCard.style.display = 'none';
    return;
  }

  dom.refCard.style.display = 'block';
  dom.refCount.textContent = `${referenceData.rows.length}条`;

  // 最近一次导入信息栏
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('refLastFileName').textContent = referenceData.fileName || '';
  document.getElementById('refLastTime').textContent = referenceData.importedAt
    ? (() => {
        const d = new Date(referenceData.importedAt);
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      })()
    : '';
  document.getElementById('refLastCount').textContent = `共 ${referenceData.rows.length} 条`;

  dom.refBody.innerHTML = referenceData.rows.slice(0, 50).map(r =>
    `<tr><td>${esc(r.asin)}</td><td>${esc(r.site)}</td><td>${esc(r.aliasName||'')}</td><td>${esc(r.expectedPrice)}</td><td>${esc(r.expectedListPrice)}</td><td>${esc(r.expectedDealBadge||'')}</td><td>${esc(r.expectedAcBadge||'')}</td><td>${esc(r.expectedCoupon||'')}</td><td>${esc(r.expectedRating)}</td><td>${esc(r.expectedReviews)}</td><td>${esc(r.expectedSeller)}</td><td>${esc(r.expectedStock)}</td></tr>`
  ).join('');
}

async function clearRef() {
  const ok = await showConfirmDialog('清除参考数据', ['所有参考数据将被清除，此操作不可恢复。'], '清除', '取消');
  if (!ok) return;
  referenceData = { importedAt: null, fileName: '', rows: [] };
  window.electronAPI.storage.remove('referenceData').catch(() => {});
  dom.refCard.style.display = 'none';
  // 重置 file input，否则再次选择同一文件时 change 事件不触发
  dom.fileInput.value = '';
}

async function autoFillAsinGroups(rows) {
  // 按 site 分组
  const grouped = {};
  for (const r of rows) {
    if (!r.asin || !r.site) continue;
    if (!grouped[r.site]) grouped[r.site] = [];
    if (!grouped[r.site].includes(r.asin)) grouped[r.site].push(r.asin);
  }

  const groups = Object.entries(grouped).map(([site, asins]) => ({
    site, asins: asins.join('\n')
  }));

  if (!groups.length) return;

  // 确保涉及的站点都已启用，否则下拉选项里没有该站点会导致错配
  let needSave = false;
  for (const g of groups) {
    const found = sitesData.find(s => s.code === g.site);
    if (found && !found.enabled) {
      found.enabled = true;
      needSave = true;
    }
  }
  if (needSave) {
    await window.electronAPI.saveSites(sitesData);
    syncEnabledSites();
  }

  // 重新渲染分组卡片
  const container = document.getElementById('siteGroups');
  container.innerHTML = '';
  for (const g of groups) renderGroupCard(g.site, g.asins);
  saveGroupsToCache();

  await showAlert('导入成功', `已自动填入 ${rows.length} 条 ASIN 到巡店面板（${groups.length} 个站点分组）`);
}

async function downloadTemplate() {
  if (typeof XLSX === 'undefined') { await showAlert('提示', 'Excel库加载中'); return; }
  const ws = XLSX.utils.aoa_to_sheet([
    ['ASIN','站点','常用名','期望售价','期望划线价','期望活动标','期望AC标','期望Coupon','期望星级','期望评论数','期望卖家','期望库存','期望BSR大类排名','期望BSR大类名','期望BSR小类排名','期望BSR小类名'],
    ['B082W886W9','CA','手机壳','29.99','39.99','Limited-time deal','Amazon\'s Choice','Save 10%','4.5','2000','Amazon','In Stock']
  ]);
  ws['!cols'] = [{wch:14},{wch:18},{wch:16},{wch:12},{wch:12},{wch:16},{wch:30},{wch:16},{wch:10},{wch:10},{wch:15},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '参考数据');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const saveResult = await window.electronAPI.saveExcel(wbout);
  if (saveResult && saveResult.cancelled) return;
}

// ========== Actions ==========
function initActionHandlers() {
  dom.btnStart.addEventListener('click', startPatrol);
  dom.btnStop.addEventListener('click', stopPatrol);
  dom.btnRetry.addEventListener('click', retryFailed);
  dom.btnExport.addEventListener('click', exportExcel);
  dom.btnClear.addEventListener('click', clearResults);
}

// ========== 站点分组卡片 ==========
let enabledSites = []; // [{domain, country, ...}] — 从 sites.json 读取 enabled=true 的站点

async function initSiteGroups() {
  const allSites = await window.electronAPI.getSites();
  enabledSites = allSites.filter(s => s.enabled);

  const cached = await window.electronAPI.storage.get('asinInputCache');
  const groups = Array.isArray(cached) && cached.length
    ? cached
    : [{ site: enabledSites[0] ? enabledSites[0].code : 'CA', asins: '' }];

  const container = document.getElementById('siteGroups');
  container.innerHTML = '';
  for (const g of groups) renderGroupCard(g.site, g.asins);

  document.getElementById('btnAddGroup').addEventListener('click', async () => {
    const usedSites = getUsedSites();
    const next = enabledSites.find(s => !usedSites.has(s.code));
    if (!next) { await showAlert('提示', '所有已启用站点均已添加'); return; }
    renderGroupCard(next.code, '');
    saveGroupsToCache();
  });

  document.getElementById('btnClearGroups').addEventListener('click', async () => {
    const ok = await showConfirmDialog('清空站点', ['所有站点分组和 ASIN 将被清除。'], '清空', '取消');
    if (!ok) return;
    const container = document.getElementById('siteGroups');
    container.innerHTML = '';
    renderGroupCard(enabledSites[0] ? enabledSites[0].code : 'CA', '');
    saveGroupsToCache();
  });
}

function getUsedSites() {
  return new Set(
    [...document.querySelectorAll('.site-group-select')].map(s => s.value)
  );
}

function renderGroupCard(site, asins) {
  const container = document.getElementById('siteGroups');
  const card = document.createElement('div');
  card.className = 'site-group-card';

  const usedSites = getUsedSites();
  const options = enabledSites.map(s => {
    const val = s.code;
    const disabled = usedSites.has(val) && val !== site ? 'disabled' : '';
    const selected = val === site ? 'selected' : '';
    return `<option value="${val}" ${selected} ${disabled}>${esc(s.country)} (${esc(s.domain)})</option>`;
  }).join('');

  card.innerHTML = `
    <div class="site-group-header">
      <select class="site-group-select">${options}</select>
      <button class="site-group-delete" title="删除此站点">✕</button>
    </div>
    <textarea class="site-group-textarea" placeholder="每行一个ASIN&#10;B08XYZ1234&#10;B09ABC5678">${esc(asins)}</textarea>
  `;

  const select = card.querySelector('.site-group-select');
  const textarea = card.querySelector('.site-group-textarea');
  const deleteBtn = card.querySelector('.site-group-delete');

  select.addEventListener('change', () => {
    refreshAllGroupOptions();
    saveGroupsToCache();
  });
  textarea.addEventListener('input', () => saveGroupsToCache());
  deleteBtn.addEventListener('click', () => {
    if (document.querySelectorAll('.site-group-card').length <= 1) return;
    card.remove();
    refreshAllGroupOptions();
    saveGroupsToCache();
  });

  container.appendChild(card);
  updateDeleteButtons();
}

function refreshAllGroupOptions() {
  const usedSites = getUsedSites();
  document.querySelectorAll('.site-group-select').forEach(select => {
    const currentVal = select.value;
    select.innerHTML = enabledSites.map(s => {
      const val = s.code;
      const disabled = usedSites.has(val) && val !== currentVal ? 'disabled' : '';
      const selected = val === currentVal ? 'selected' : '';
      return `<option value="${val}" ${selected} ${disabled}>${esc(s.country)} (${esc(s.domain)})</option>`;
    }).join('');
  });
  updateDeleteButtons();
}

function updateDeleteButtons() {
  const cards = document.querySelectorAll('.site-group-card');
  cards.forEach(card => {
    card.querySelector('.site-group-delete').disabled = cards.length <= 1;
  });
}

function saveGroupsToCache() {
  const groups = [...document.querySelectorAll('.site-group-card')].map(card => ({
    site: card.querySelector('.site-group-select').value,
    asins: card.querySelector('.site-group-textarea').value,
  }));
  window.electronAPI.storage.set('asinInputCache', groups).catch(() => {});
}

function readGroupsFromDom() {
  return [...document.querySelectorAll('.site-group-card')].map(card => ({
    site: card.querySelector('.site-group-select').value,
    asins: card.querySelector('.site-group-textarea').value.trim(),
  }));
}

async function buildTasks() {
  const groups = readGroupsFromDom();
  const tasks = [];
  let idx = 0;

  for (const group of groups) {
    const { site, asins } = group;
    if (!asins) {
      const siteFound = enabledSites.find(s => s.code === site);
      const label = siteFound ? siteFound.country : site;
      await showAlert('校验失败', `[${label}] 站点 ASIN 不能为空`);
      return null;
    }
    const asinList = [...new Set(
      asins.split(/[\n,，]+/).map(a => a.trim().toUpperCase()).filter(a => a)
    )];
    const invalid = asinList.filter(a => !/^[A-Z0-9]{10}$/.test(a));
    if (invalid.length) {
      const siteFound = enabledSites.find(s => s.code === site);
      const label = siteFound ? siteFound.country : site;
      await showAlert('校验失败', `[${label}] 包含无效 ASIN：${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`);
      return null;
    }
    if (asinList.length > 100) {
      await showAlert('校验失败', `单站点最多100个ASIN，当前${asinList.length}个`);
      return null;
    }
    for (const asin of asinList) {
      tasks.push({ asin, site, index: idx++ });
    }
  }

  if (!tasks.length) { await showAlert('校验失败', '请输入有效ASIN'); return null; }
  return { tasks, totalCount: tasks.length };
}

async function startPatrol() {
  const td = await buildTasks();
  if (!td) return;

  const config = getSettings();
  // 凭证不存本地，每次启动时从 DOM 实时读取附入 config（主进程内存持有，不落盘）
  config.dingtalkPersonal = {
    appKey:    dom.dingtalkAppKey    ? dom.dingtalkAppKey.value.trim()    : '',
    appSecret: dom.dingtalkAppSecret ? dom.dingtalkAppSecret.value.trim() : '',
    agentId:   dom.dingtalkAgentId   ? dom.dingtalkAgentId.value.trim()   : '',
    userIds:   dom.dingtalkUserIds   ? dom.dingtalkUserIds.value.trim()   : '',
  };

  // 检查是否有未完成的任务 (已停止但还有结果)
  const hasExisting = allResults.length > 0;
  const existingKeys = new Set(allResults.map(r => `${r.asin}_${r.site}`));

  // 构建新任务的key集合
  const newKeys = new Set(td.tasks.map(t => `${t.asin}_${t.site}`));

  // 检测任务是否变化
  let taskChanged = false;
  if (hasExisting) {
    const onlyInOld = [...existingKeys].filter(k => !newKeys.has(k));
    const onlyInNew = [...newKeys].filter(k => !existingKeys.has(k));
    taskChanged = onlyInOld.length > 0 || onlyInNew.length > 0;
  }

  // 过滤出未完成的任务
  const completedKeys = new Set(allResults.map(r => `${r.asin}_${r.site}`));
  const remainingTasks = td.tasks.filter(t => !completedKeys.has(`${t.asin}_${t.site}`));

  if (remainingTasks.length === 0 && allResults.length >= td.tasks.length) {
    await showAlert('提示', '所有任务均已完成');
    return;
  }

  const isContinue = hasExisting && !taskChanged && remainingTasks.length < td.tasks.length;

  // 构建确认对话框信息
  const confirmLines = [];
  if (taskChanged) confirmLines.push('任务列表已变更，已有结果将被清除');
  if (isContinue) {
    confirmLines.push(`继续上次巡店，剩余 ${remainingTasks.length} / ${td.totalCount} 个任务`);
  } else {
    confirmLines.push(`共 ${td.totalCount} 个任务`);
    confirmLines.push(`并发 ${config.concurrency} · 间隔 ${config.pageInterval/1000}s`);
  }

  const confirmed = await showConfirmDialog('开始巡店', confirmLines, '开始', '取消');
  if (!confirmed) return;

  if (taskChanged) allResults = [];

  const res = await window.electronAPI.sendMessage('START_PATROL', {
    tasks: remainingTasks,
    config,
    totalCount: td.tasks.length,
    keepExisting: isContinue
  });
  if (res && res.success) {
    patrolRunning = true;
    updateUiRunning(td.tasks.length, allResults.length);
    startTimer();
    setPatrolTimestamp('running');
  } else {
    await showAlert('启动失败', '启动失败: ' + (res ? res.error : '未知错误'));
  }
}

async function stopPatrol() {
  await window.electronAPI.sendMessage('STOP_PATROL', {});
  patrolRunning = false;
  updateUiStopped();
}

async function retryFailed() {
  if (patrolRunning) return;
  const res = await window.electronAPI.sendMessage('RETRY_FAILED', {});
  if (res && res.success) {
    patrolRunning = true;
    updateUiRunning(allResults.length + res.retryCount, allResults.length);
    startTimer();
  } else {
    await showAlert('提示', res ? (res.error || '无可重试项') : '失败');
  }
}

async function clearResults() {
  allResults = [];
  await window.electronAPI.sendMessage('CLEAR_RESULTS', {});
  renderAllResults();
  dom.btnExport.disabled = true;
  dom.btnRetry.disabled = true;
  dom.btnStart.innerHTML = '<span>▶</span> 开始巡店';
}

// ========== UI State ==========
function updateUiRunning(totalCount, alreadyDone = 0) {
  dom.btnStart.disabled = true;
  dom.btnStart.innerHTML = '<span>▶</span> 继续巡店';
  dom.btnStop.disabled = false;
  dom.btnRetry.disabled = true;
  dom.btnExport.disabled = true;
  dom.progressSection.style.display = 'block';
  dom.progressText.textContent = `${alreadyDone} / ${totalCount}`;
  dom.progressFill.style.width = totalCount > 0 ? `${Math.round(alreadyDone / totalCount * 100)}%` : '0%';
  dom.progressStatus.textContent = '准备中...';
  dom.statusDot.className = 'status-dot running';
  dom.statusLabel.textContent = '巡店中';
}

function updateUiStopped() {
  dom.btnStart.disabled = false;
  const hasRemaining = allResults.length > 0;
  dom.btnStart.innerHTML = hasRemaining ? '<span>▶</span> 继续巡店' : '<span>▶</span> 开始巡店';
  dom.btnStop.disabled = true;
  dom.btnExport.disabled = allResults.length === 0;
  dom.progressStatus.textContent = '已停止';
  dom.statusDot.className = 'status-dot';
  dom.statusLabel.textContent = '就绪';
}

// ========== Messages ==========
async function refreshStatus() {
  try {
    const status = await window.electronAPI.sendMessage('GET_STATUS', {});
    if (status) {
      const running = status.running;
      dom.statusDot.className = running ? 'status-dot running' : 'status-dot online';
      dom.statusLabel.textContent = running ? '巡店中' : '就绪';
      patrolRunning = running;

      if (running) {
        dom.btnStart.disabled = true;
        dom.btnStop.disabled = false;
        dom.btnRetry.disabled = true;
        dom.progressSection.style.display = 'block';
      }
    }
  } catch (e) { /* bg maybe not ready */ }
}

function handleBgMessage(msg) {
  switch (msg.action) {
    case 'PATROL_UPDATE':
      handleUpdate(msg.result, msg.progress);
      break;
    case 'PATROL_COMPLETE':
      handleComplete(msg.summary, msg.results);
      break;
    case 'CRON_AUTO_START':
      (async () => {
        const { tasks, config } = msg;
        allResults = [];
        const res = await window.electronAPI.sendMessage('START_PATROL', {
          tasks, config, totalCount: tasks.length, keepExisting: false
        });
        if (res && res.success) {
          patrolRunning = true;
          updateUiRunning(tasks.length, 0);
          startTimer();
        }
      })();
      break;
  }
}

function handleStorageChange(changes) {
  if (changes.lastUpdate || changes.patrolResults) {
    window.electronAPI.storage.get('patrolResults').then(data => {
      if (data) { allResults = data; renderAllResults(); }
    });
  }
  if (changes.patrolState) {
    const s = changes.patrolState.newValue;
    if (s && !s.running) { patrolRunning = false; updateUiStopped(); }
  }
  // 重新加载历史
  if (changes.historySnapshots) {
    historySnapshots = changes.historySnapshots.newValue || {};
  }
}

function handleUpdate(result, progress) {
  const idx = allResults.findIndex(r => r.asin === result.asin && r.site === result.site);
  if (idx >= 0) allResults[idx] = result; else allResults.push(result);
  allResults.sort((a, b) => (a.index || 0) - (b.index || 0));

  if (progress) {
    dom.progressText.textContent = `${progress.completed} / ${progress.total}`;
    dom.progressFill.style.width = `${Math.round(progress.completed / progress.total * 100)}%`;
    dom.progressStatus.textContent = `抓取: ${result.asin} @ ${getSiteLabel(result.site)}`;
  }
  renderAllResults();
}

function handleComplete(summary, results) {
  patrolRunning = false;
  stopTimer();
  if (results) { allResults = results.sort((a, b) => (a.index || 0) - (b.index || 0)); renderAllResults(); }
  updateUiStopped();

  dom.progressStatus.textContent = '✓ 完成';
  dom.btnExport.disabled = false;
  dom.btnStart.innerHTML = '<span>▶</span> 开始巡店';
  setPatrolTimestamp('done', summary.completedAt);

  // 加载最新历史快照
  window.electronAPI.storage.get('historySnapshots').then(d => {
    if (d) historySnapshots = d;
  });

  // 刷新历史列表
  loadPatrolHistory();

  // 更新重试按钮
  if (summary.retryable > 0) {
    dom.btnRetry.disabled = false;
    dom.btnRetry.textContent = `↻ 重试(${summary.retryable})`;
  }

  dom.resultsSummary.innerHTML =
    `共: <b>${summary.total}</b> &nbsp;` +
    `<span style="color:var(--success)">成功: ${summary.success}</span> &nbsp;` +
    (summary.failed  ? `<span style="color:var(--danger)">失败: ${summary.failed}</span> &nbsp;` : '') +
    (summary.captcha ? `<span style="color:var(--warning)">验证码: ${summary.captcha}</span> &nbsp;` : '') +
    `<span style="color:var(--text-muted)">用时: ${fmtTime(summary.elapsed)}</span>`;
}

// ========== Reference Compare ==========
function findRef(asin, site) {
  if (!dom.enableRefCompare || !dom.enableRefCompare.checked) return null;
  const rows = referenceData && referenceData.rows ? referenceData.rows : [];
  return rows.find(r => r.asin === asin && (!r.site || r.site === site));
}
function getAlias(asin, site) {
  const ref = findRef(asin, site);
  return ref ? ref.aliasName || '' : '';
}
function hasAliases() {
  const rows = referenceData && referenceData.rows ? referenceData.rows : [];
  return rows.some(r => r.aliasName && r.aliasName.trim());
}

function cmpField(actual, expected, field) {
  if (!expected) return { match: true, display: actual || 'N/A' };
  const a = String(actual || '').trim(), e = String(expected).trim();
  if (field === 'bsrRank') {
    // BSR 排名越小越好，实际 > 期望则异常
    const an = parseInt(a.replace(/[^0-9]/g, '')), en = parseInt(e.replace(/[^0-9]/g, ''));
    if (isNaN(an) || isNaN(en)) return { match: true, display: a || 'N/A' };
    return { match: an <= en, display: a || 'N/A' };
  }
  if (field === 'price' || field === 'listPrice') {
    const an = parseFloat(a.replace(/[^0-9.]/g, '')), en = parseFloat(e.replace(/[^0-9.]/g, ''));
    if (isNaN(an) || isNaN(en)) return { match: a === e, display: a || 'N/A' };
    return { match: Math.abs(an - en) < 0.01, display: a || 'N/A' };
  }
  if (field === 'rating') {
    const an = parseFloat(a), en = parseFloat(e);
    if (isNaN(an) || isNaN(en)) return { match: a === e, display: a || 'N/A' };
    return { match: Math.abs(an - en) < 0.2, display: a || 'N/A' };
  }
  if (field === 'reviews') {
    const an = parseInt(a.replace(/[^0-9]/g, '')), en = parseInt(e.replace(/[^0-9]/g, ''));
    if (isNaN(an) || isNaN(en)) return { match: a === e, display: a || 'N/A' };
    return { match: Math.abs(an - en) / Math.max(en, 1) < 0.3, display: a || 'N/A' };
  }
  return { match: a.toLowerCase().includes(e.toLowerCase()) || e.toLowerCase().includes(a.toLowerCase()), display: a || 'N/A' };
}

function renderField(actual, expected, field) {
  const cmp = cmpField(actual, expected, field);
  if (!expected) return `<span>${esc(cmp.display)}</span>`;
  if (cmp.match) return `<span>${esc(cmp.display)}</span> <span class="match-ok">✓</span>`;
  return `<span class="diff-highlight">${esc(cmp.display)}</span>`;
}

function renderFieldAc(actual, expected) {
  const display = actual || 'N/A';
  const truncated = display.length > 20 ? display.substring(0, 20) + '...' : display;
  const cmp = cmpField(actual, expected, 'text');
  if (!expected) return `<span>${esc(truncated)}</span>`;
  if (cmp.match) return `<span>${esc(truncated)}</span> <span class="match-ok">✓</span>`;
  return `<span class="diff-highlight">${esc(truncated)}</span>`;
}

// ========== History Diff ==========
function getLastSnapshot(asin, site) {
  const key = `${asin}_${site}`;
  const entry = historySnapshots[key];
  if (!entry || !entry.snapshots || entry.snapshots.length < 2) return null;
  return entry.snapshots[entry.snapshots.length - 2]; // 倒数第二个
}

function renderHistoryDiff(result) {
  const last = getLastSnapshot(result.asin, result.site);
  if (!last) return '<span class="history-same">--</span>';

  const parts = [];
  const priceDiff = parseFloat(result.price) - parseFloat(last.price);
  if (!isNaN(priceDiff) && Math.abs(priceDiff) > 0.005) {
    const arrow = priceDiff > 0 ? '🔺' : '🔻';
    const cls = priceDiff > 0 ? 'history-up' : 'history-down';
    parts.push(`<span class="${cls}">${arrow}${Math.abs(priceDiff).toFixed(2)}</span>`);
  }

  if (result.stock !== last.stock && last.stock && result.stock) {
    parts.push(`<span class="history-down">📦变</span>`);
  }

  if (result.seller !== last.seller && last.seller && result.seller) {
    parts.push(`<span class="history-up">🏪变</span>`);
  }

  if (parts.length === 0) return '<span class="history-same">持平</span>';
  return parts.join(' ');
}

// ========== Render Table ==========
function getStatusIcon(status) {
  switch (status) {
    case 'success': return '✅';
    case 'failed': return '❌';
    case 'captcha': return '🔐';
    default: return '⏳';
  }
}

function getRowClass(result) {
  if (result.status !== 'success') return 'status-' + result.status;
  const ref = findRef(result.asin, result.site);
  if (!ref) return '';
  const checks = [
    cmpField(result.price, ref.expectedPrice, 'price'),
    cmpField(result.listPrice, ref.expectedListPrice, 'listPrice'),
    cmpField(result.dealBadge, ref.expectedDealBadge, 'text'),
    cmpField(result.acBadge, ref.expectedAcBadge, 'text'),
    cmpField(result.coupon, ref.expectedCoupon, 'text'),
    cmpField(result.rating, ref.expectedRating, 'rating'),
    cmpField(result.reviews, ref.expectedReviews, 'reviews'),
    cmpField(result.seller, ref.expectedSeller, 'seller'),
    cmpField(result.stock, ref.expectedStock, 'stock')
  ];
  return checks.every(c => c.match) ? 'match-success' : 'match-error';
}

function renderAllResults() {
  const enabled = getEnabledFields();
  const showAlias = hasAliases();
  const colSpan = document.querySelectorAll('#resultsTable thead th:not([style*="display: none"]):not([style*="display:none"])').length || (showAlias ? 16 : 15);

  if (!allResults.length) {
    dom.resultsBody.innerHTML = `<tr class="empty-row"><td colspan="${colSpan}"><div class="empty-state"><span class="empty-icon">◎</span><p>点击「开始巡店」查看结果</p></div></td></tr>`;
    dom.resultsSummary.textContent = '准备就绪';
    $('#colAliasHdr').style.display = showAlias ? '' : 'none';
    dom.colHistory.style.display = dom.showHistoryDiff.checked ? '' : 'none';
    return;
  }

  $('#colAliasHdr').style.display = showAlias ? '' : 'none';
  const showHistory = dom.showHistoryDiff.checked;
  dom.colHistory.style.display = showHistory ? '' : 'none';

  // 按 fieldOrder 重建 thead 列顺序和显隐
  const FIELD_TO_COL = {
    price: 'col-price', listPrice: 'col-listprice', dealBadge: 'col-deal',
    acBadge: 'col-ac', coupon: 'col-coupon', rating: 'col-rating',
    reviews: 'col-reviews', seller: 'col-seller', stock: 'col-stock',
    parentAsin: 'col-parent', title: 'col-title', url: null,
    productInfo: 'col-product-info',
    bsrMainRank: 'col-bsr-main-rank', bsrMainCategory: 'col-bsr-main-cat',
    bsrSubRank: 'col-bsr-sub-rank', bsrSubCategory: 'col-bsr-sub-cat'
  };
  const FIELD_TO_LABEL = {
    price: '售价', listPrice: '划线价', dealBadge: '活动', acBadge: 'AC标',
    coupon: 'Coupon', rating: '星级', reviews: '评论', seller: '卖家',
    stock: '库存', parentAsin: '父体', title: '标题', url: 'URL',
    productInfo: '产品信息', bsrMainRank: 'BSR大类排名', bsrMainCategory: 'BSR大类名',
    bsrSubRank: 'BSR小类排名', bsrSubCategory: 'BSR小类名'
  };
  // 重建可排序区域的 th：先隐藏所有可排序 th，再按 fieldOrder 顺序重新插入到 col-history 之前
  const theadTr = document.querySelector('#resultsTable thead tr');
  const historyTh = theadTr ? theadTr.querySelector('th#colHistory') : null;
  if (theadTr && historyTh) {
    // 移除所有可排序 th
    Object.values(FIELD_TO_COL).filter(Boolean).forEach(cls => {
      const th = theadTr.querySelector(`th.${cls}`);
      if (th) th.remove();
    });
    // 按 fieldOrder 重新插入
    [...fieldOrder].reverse().forEach(f => {
      const colCls = FIELD_TO_COL[f];
      if (!colCls) return;
      const th = document.createElement('th');
      th.className = colCls;
      th.textContent = FIELD_TO_LABEL[f] || f;
      th.style.display = enabled.includes(f) ? '' : 'none';
      theadTr.insertBefore(th, historyTh);
    });
  }

  // 可排序字段的 td 渲染函数
  function renderFieldTd(f, r, ref) {
    switch(f) {
      case 'price':       return `<td class="col-price">${renderField(r.price, ref ? ref.expectedPrice : '', 'price')}</td>`;
      case 'listPrice':   return `<td class="col-listprice">${renderField(r.listPrice, ref ? ref.expectedListPrice : '', 'listPrice')}</td>`;
      case 'dealBadge':   return `<td class="col-deal" title="${esc(r.dealBadge || '')}">${renderField(r.dealBadge, ref ? ref.expectedDealBadge : '', 'dealBadge')}</td>`;
      case 'acBadge':     return `<td class="col-ac" title="${esc(r.acBadge || '')}">${renderFieldAc(r.acBadge, ref ? ref.expectedAcBadge : '')}</td>`;
      case 'coupon':      return `<td class="col-coupon" title="${esc(r.coupon || '')}">${renderField(r.coupon, ref ? ref.expectedCoupon : '', 'coupon')}</td>`;
      case 'rating':      return `<td class="col-rating">${renderField(r.rating, ref ? ref.expectedRating : '', 'rating')}</td>`;
      case 'reviews':     return `<td class="col-reviews">${renderField(r.reviews, ref ? ref.expectedReviews : '', 'reviews')}</td>`;
      case 'seller':      return `<td class="col-seller" title="${esc(r.seller || '')}">${renderField(r.seller, ref ? ref.expectedSeller : '', 'seller')}</td>`;
      case 'stock':       return `<td class="col-stock" title="${esc(r.stock || '')}">${renderField(r.stock, ref ? ref.expectedStock : '', 'stock')}</td>`;
      case 'parentAsin':  return `<td class="col-parent" title="${esc(r.parentAsin || '')}">${esc(r.parentAsin || 'N/A')}</td>`;
      case 'title':       return `<td class="col-title" title="${esc(r.title || '')}">${esc(truncateTitle(r.title))}</td>`;
      case 'url':         return '';
      case 'productInfo': return `<td class="col-product-info">${r.productInfo && Object.keys(r.productInfo).length ? `<button class="btn-product-info" data-asin="${esc(r.asin)}" data-site="${esc(r.site)}">查看</button>` : ''}</td>`;
      case 'bsrMainRank':     return `<td class="col-bsr-main-rank">${renderField(r.bsrMainRank, ref ? ref.expectedBsrMainRank : '', 'bsrRank')}</td>`;
      case 'bsrMainCategory': return `<td class="col-bsr-main-cat" title="${esc(r.bsrMainCategory || '')}">${renderField(r.bsrMainCategory, ref ? ref.expectedBsrMainCategory : '', 'text')}</td>`;
      case 'bsrSubRank':      return `<td class="col-bsr-sub-rank">${renderField(r.bsrSubRank, ref ? ref.expectedBsrSubRank : '', 'bsrRank')}</td>`;
      case 'bsrSubCategory':  return `<td class="col-bsr-sub-cat" title="${esc(r.bsrSubCategory || '')}">${renderField(r.bsrSubCategory, ref ? ref.expectedBsrSubCategory : '', 'text')}</td>`;
      default: return '';
    }
  }

  const orderedEnabled = fieldOrder.filter(f => enabled.includes(f));

  dom.resultsBody.innerHTML = allResults.map(r => {
    const ref = findRef(r.asin, r.site);
    const cls = getRowClass(r);
    const alias = showAlias ? `<td class="col-alias">${esc(getAlias(r.asin, r.site) || r.asin)}</td>` : '';
    const fieldTds = orderedEnabled.map(f => renderFieldTd(f, r, ref)).join('');

    return `
      <tr class="${cls}">
        <td class="col-status">${getStatusIcon(r.status)}</td>
        <td class="col-site">${getSiteLabel(r.site)}</td>
        <td class="col-asin" title="${esc(r.asin)}">${esc(r.asin)}</td>
        ${alias}
        ${fieldTds}
        <td class="col-history">${showHistory ? renderHistoryDiff(r) : ''}</td>
      </tr>
    `;
  }).join('');

  const success = allResults.filter(r => r.status === 'success').length;
  const failed = allResults.filter(r => r.status !== 'success').length;
  dom.resultsSummary.innerHTML =
    `共: <b>${allResults.length}</b> &nbsp;` +
    `<span style="color:var(--success)">成功: ${success}</span>` +
    (failed ? ` &nbsp;<span style="color:var(--danger)">失败: ${failed}</span>` : '');
}

// ========== 产品信息浮层 ==========
// ========== 通用对话框 ==========
function showAlert(title, message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'product-info-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-dialog-header"><span>${esc(title)}</span></div>
        <div class="confirm-dialog-body"><p>${esc(message)}</p></div>
        <div class="confirm-dialog-footer">
          <button class="btn btn-primary confirm-ok">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); resolve(); };
    overlay.querySelector('.confirm-ok').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') { close(); document.removeEventListener('keydown', onKey); }
    });
  });
}

// ========== 通用确认对话框 ==========
function showConfirmDialog(title, lines, confirmText = '确认', cancelText = '取消') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'product-info-overlay';
    overlay.id = 'confirmDialogOverlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-dialog-header">
          <span>${esc(title)}</span>
        </div>
        <div class="confirm-dialog-body">
          ${lines.map(l => `<p>${esc(l)}</p>`).join('')}
        </div>
        <div class="confirm-dialog-footer">
          <button class="btn btn-ghost confirm-cancel">${esc(cancelText)}</button>
          <button class="btn btn-primary confirm-ok">${esc(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-ok').addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { overlay.remove(); resolve(false); document.removeEventListener('keydown', onKey); }
      if (e.key === 'Enter') { overlay.remove(); resolve(true); document.removeEventListener('keydown', onKey); }
    });
  });
}

function initProductInfoOverlay() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-product-info');
    if (btn) {
      const asin = btn.dataset.asin;
      const site = btn.dataset.site;
      const r = allResults.find(r => r.asin === asin && r.site === site);
      if (r && r.productInfo) showProductInfoOverlay(r);
      return;
    }
    if (e.target.closest('.product-info-overlay') && !e.target.closest('.product-info-modal')) {
      closeProductInfoOverlay();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProductInfoOverlay();
  });
}

function showProductInfoOverlay(r) {
  closeProductInfoOverlay();
  const sections = Object.entries(r.productInfo);
  if (!sections.length) return;

  const sectionsHtml = sections.map(([title, data]) => {
    const rows = Object.entries(data).map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`
    ).join('');
    return `
      <div class="product-info-section-title">${esc(title)}</div>
      <table class="product-info-table"><tbody>${rows}</tbody></table>
    `;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'product-info-overlay';
  overlay.id = 'productInfoOverlay';
  overlay.innerHTML = `
    <div class="product-info-modal">
      <div class="product-info-modal-header">
        <span>产品信息 — ${esc(r.asin)} @ ${getSiteLabel(r.site)}</span>
        <button class="product-info-modal-close" onclick="closeProductInfoOverlay()">×</button>
      </div>
      <div class="product-info-modal-body">${sectionsHtml}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeProductInfoOverlay() {
  const el = document.getElementById('productInfoOverlay');
  if (el) el.remove();
}

// ========== Excel Export (HTML-based .xls, red font for mismatches, no borders) ==========
async function exportExcel() {
  if (!allResults.length) { await showAlert('提示', '无结果'); return; }

  const sorted = [...allResults].sort((a, b) => (a.index || 0) - (b.index || 0));
  const enabled = getEnabledFields();

  // 列定义 — 含deal/ac/coupon的参考对比
  const columns = [
    { key: 'status', label: '状态' },
    { key: 'site', label: '站点' },
    { key: 'asin', label: 'ASIN' },
    { key: 'title', label: '标题', enabledField: 'title' },
    { key: 'price', label: '售价', refField: 'expectedPrice', compareType: 'price' },
    { key: 'listPrice', label: '划线价', refField: 'expectedListPrice', compareType: 'listPrice' },
    { key: 'dealBadge', label: '活动', refField: 'expectedDealBadge', enabledField: 'dealBadge' },
    { key: 'acBadge', label: 'AC标', refField: 'expectedAcBadge', enabledField: 'acBadge' },
    { key: 'coupon', label: 'Coupon', refField: 'expectedCoupon', enabledField: 'coupon' },
    { key: 'rating', label: '星级', refField: 'expectedRating', compareType: 'rating' },
    { key: 'reviews', label: '评论数', refField: 'expectedReviews', compareType: 'reviews' },
    { key: 'seller', label: '卖家', refField: 'expectedSeller' },
    { key: 'stock', label: '库存', refField: 'expectedStock' },
    { key: 'parentAsin', label: '父体ASIN', enabledField: 'parentAsin' },
    { key: 'bsrMainRank',     label: 'BSR大类排名', enabledField: 'bsrMainRank',     refField: 'expectedBsrMainRank',     compareType: 'bsrRank' },
    { key: 'bsrMainCategory', label: 'BSR大类名',   enabledField: 'bsrMainCategory', refField: 'expectedBsrMainCategory' },
    { key: 'bsrSubRank',      label: 'BSR小类排名', enabledField: 'bsrSubRank',      refField: 'expectedBsrSubRank',      compareType: 'bsrRank' },
    { key: 'bsrSubCategory',  label: 'BSR小类名',   enabledField: 'bsrSubCategory',  refField: 'expectedBsrSubCategory' },
    { key: 'url', label: 'URL', enabledField: 'url' },
    { key: 'timestamp', label: '时间' }
  ];

  // 按 fieldOrder 对可排序列排序，固定列（status/site/asin/timestamp）保持原位
  const fixedKeys = new Set(['status', 'site', 'asin', 'timestamp']);
  const orderedColumns = [
    ...columns.filter(c => fixedKeys.has(c.key)),
    ...fieldOrder
      .map(f => columns.find(c => c.key === f))
      .filter(Boolean)
      .filter(c => !fixedKeys.has(c.key)),
    ...columns.filter(c => !fixedKeys.has(c.key) && !fieldOrder.includes(c.key))
  ];
  const activeColumns = orderedColumns.filter(col => {
    if (col.enabledField) return enabled.includes(col.enabledField);
    return true;
  });

  function getCellValue(r, col) {
    switch (col.key) {
      case 'status': {
        if (r.status !== 'success') return r.status === 'captcha' ? '验证码' : '失败';
        const ref = findRef(r.asin, r.site);
        if (!ref) return '成功';
        return columns.filter(c => c.refField).every(c =>
          cmpField(r[c.key], ref[c.refField], (c.compareType || c.key)).match
        ) ? '匹配' : '偏差';
      }
      case 'site': return getSiteLabel(r.site);
      default: return r[col.key] != null ? String(r[col.key]) : '';
    }
  }

  function isMismatch(r, col) {
    if (r.status !== 'success') return false;
    if (!col.refField) return false;
    const ref = findRef(r.asin, r.site);
    if (!ref) return false;
    return !cmpField(r[col.key], ref[col.refField], (col.compareType || col.key)).match;
  }

  // ====== Sheet 1: 巡店明细 ======
  const headers1 = activeColumns.map(c => c.label);
  const detailData = sorted.map(r => activeColumns.map(col => {
    const val = getCellValue(r, col);
    return isMismatch(r, col) ? `[!]${val}` : val;
  }));

  const ws1 = XLSX.utils.aoa_to_sheet([headers1, ...detailData]);

  // ====== Sheet 2: 异常汇总 ======
  const anomHeaders = ['ASIN', '站点', '问题', '详情', 'URL'];
  const anomData = [];
  sorted.forEach(r => {
    if (r.status !== 'success') {
      anomData.push([r.asin, getSiteLabel(r.site), '抓取失败', r.error || '', r.url || '']);
      return;
    }
    const ref = findRef(r.asin, r.site);
    if (!ref) return;
    const diffs = [];
    columns.filter(c => c.refField).forEach(col => {
      const c = cmpField(r[col.key], ref[col.refField], (col.compareType || col.key));
      if (!c.match) diffs.push(`${col.label}: 期望${ref[col.refField]} 实际${r[col.key]}`);
    });
    if (diffs.length) {
      anomData.push([r.asin, getSiteLabel(r.site), '数据偏差', diffs.join('; '), r.url || '']);
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, '巡店明细');
  if (anomData.length) {
    const ws2 = XLSX.utils.aoa_to_sheet([anomHeaders, ...anomData]);
    XLSX.utils.book_append_sheet(wb, ws2, '异常汇总');
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const saveResult = await window.electronAPI.saveExcel(wbout);
  if (saveResult && saveResult.cancelled) return;
}

// ========== Timer ==========
function startTimer() {
  stopTimer();
  const ts = allResults.length ? new Date(allResults[0].timestamp).getTime() : Date.now();
  patrolTimer = setInterval(() => {
    dom.progressTime.textContent = fmtTime(Math.max(0, Date.now() - ts));
  }, 1000);
}

function stopTimer() { if (patrolTimer) { clearInterval(patrolTimer); patrolTimer = null; } }

// ========== Utils ==========
function getSiteLabel(siteCode) {
  if (!siteCode) return '';
  // 兼容旧格式域名（迁移期间可能存在）
  if (siteCode.includes('.')) {
    const found = sitesData.find(s => `www.${s.domain}` === siteCode || s.domain === siteCode);
    return found ? (found.code || siteCode) : siteCode;
  }
  return siteCode;
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h) return `${h}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

// ========== 站点管理页 ==========
let sitesData = [];

const sitesDom = {
  tableBody: () => document.getElementById('sitesTableBody'),
  btnSave:   () => document.getElementById('btnSaveSites'),
  btnReset:  () => document.getElementById('btnResetZips'),
};

async function initSitesTab() {
  sitesData = await window.electronAPI.getSites();
  renderSitesTable();
  sitesDom.btnSave().addEventListener('click', saveSites);
  sitesDom.btnReset().addEventListener('click', resetZips);
  document.getElementById('btnAddSite').addEventListener('click', addSiteRow);
}

function renderSitesTable() {
  // 已启用排前面，组内保持原顺序；序号按显示顺序从 1 开始
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

  // 启用开关实时保存
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

function editSiteRow(idx) {
  // 关闭已有编辑行（不保存）
  renderSitesTable(); // 关闭任何已有编辑行（不保存），重新渲染

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

  if (!code || !/^[A-Z0-9]{1,5}$/.test(code)) { await showAlert('校验失败', '二字码必填，仅限 1-5 位大写字母或数字'); return; }
  if (!domain) { await showAlert('校验失败', '站点域名必填'); return; }
  if (!country) { await showAlert('校验失败', '国家名称必填'); return; }

  // 唯一性校验（排除自身）
  const codeConflict = sitesData.some((s, i) => i !== idx && s.code && s.code.toUpperCase() === code);
  if (codeConflict) { await showAlert('校验失败', `二字码 ${code} 已存在`); return; }
  const domainConflict = sitesData.some((s, i) => i !== idx && s.domain === domain);
  if (domainConflict) { await showAlert('校验失败', `域名 ${domain} 已存在`); return; }

  sitesData[idx] = { ...sitesData[idx], code, region, country, domain, zip, zipFormat, enabled };
  await window.electronAPI.saveSites(sitesData);
  syncEnabledSites();
  renderSitesTable();
}

function cancelSiteEdit() {
  renderSitesTable();
}

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

  if (!code || !/^[A-Z0-9]{1,5}$/.test(code)) { await showAlert('校验失败', '二字码必填，仅限 1-5 位大写字母或数字'); return; }
  if (!domain) { await showAlert('校验失败', '站点域名必填'); return; }
  if (!country) { await showAlert('校验失败', '国家名称必填'); return; }

  const codeConflict = sitesData.some(s => s.code && s.code.toUpperCase() === code);
  if (codeConflict) { await showAlert('校验失败', `二字码 ${code} 已存在`); return; }
  const domainConflict = sitesData.some(s => s.domain === domain);
  if (domainConflict) { await showAlert('校验失败', `域名 ${domain} 已存在`); return; }

  sitesData.push({ code, region, country, domain, zip, zipExample: zip, zipFormat, enabled });
  await window.electronAPI.saveSites(sitesData);
  syncEnabledSites();
  renderSitesTable();
}

async function deleteSite(idx) {
  const s = sitesData[idx];
  const label = `${s.code || s.domain} - ${s.country || s.domain}`;
  const ok = await showConfirmDialog('删除站点', [`确认删除 ${label}？此操作不可恢复。`], '删除', '取消');
  if (!ok) return;
  sitesData.splice(idx, 1);
  await window.electronAPI.saveSites(sitesData);
  syncEnabledSites();
  renderSitesTable();
}

async function saveSites() {
  // 从输入框读取最新邮编值
  sitesDom.tableBody().querySelectorAll('.zip-input').forEach(input => {
    const idx = parseInt(input.dataset.index);
    sitesData[idx].zip = input.value.trim();
  });
  await window.electronAPI.saveSites(sitesData);
  syncEnabledSites();
  const btn = sitesDom.btnSave();
  btn.textContent = '已保存 ✓';
  setTimeout(() => { btn.textContent = '保存'; }, 2000);
}

function syncEnabledSites() {
  enabledSites = sitesData.filter(s => s.enabled);
  refreshAllGroupOptions();
}

async function resetZips() {
  const ok = await showConfirmDialog('恢复默认邮编', ['所有站点邮编将恢复为默认示例值。'], '恢复', '取消');
  if (!ok) return;
  sitesData = sitesData.map(s => ({ ...s, zip: s.zipExample }));
  await window.electronAPI.saveSites(sitesData);
  renderSitesTable();
}

// ========== Cron Tab ==========

const cronDom = {
  get enabled()   { return document.getElementById('cronEnabled'); },
  get enableLabel(){ return document.getElementById('cronEnableLabel'); },
  get expr()      { return document.getElementById('cronExpr'); },
  get validBadge(){ return document.getElementById('cronValidBadge'); },
  get errorMsg()  { return document.getElementById('cronErrorMsg'); },
  get nextList()  { return document.getElementById('cronNextList'); },
  get nextHint()  { return document.getElementById('cronNextHint'); },
  get saveBtn()   { return document.getElementById('btnSaveCron'); },
  get presetBtns(){ return document.querySelectorAll('.cron-preset-btn'); }
};

const WEEK_NAMES = ['周日','周一','周二','周三','周四','周五','周六'];

function initCronTab() {
  cronDom.expr.addEventListener('input', onCronExprInput);
  cronDom.enabled.addEventListener('change', onCronEnabledChange);
  cronDom.saveBtn.addEventListener('click', saveCronConfig);
  cronDom.presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cronDom.expr.value = btn.dataset.expr;
      onCronExprInput();
    });
  });
  loadCronConfig();
}

function onCronExprInput() {
  const expr = cronDom.expr.value.trim();
  if (!expr) {
    cronDom.validBadge.textContent = '';
    cronDom.validBadge.className = 'cron-validation-badge';
    cronDom.errorMsg.textContent = '';
    renderNextTimes([]);
    return;
  }
  const result = CronParser.validateCron(expr);
  if (result.valid) {
    cronDom.validBadge.textContent = '✓ 有效';
    cronDom.validBadge.className = 'cron-validation-badge valid';
    cronDom.errorMsg.textContent = '';
    const times = CronParser.getNextTimes(expr, 5);
    renderNextTimes(times);
  } else {
    cronDom.validBadge.textContent = '✗ 无效';
    cronDom.validBadge.className = 'cron-validation-badge invalid';
    cronDom.errorMsg.textContent = result.error;
    renderNextTimes([]);
  }
}

async function onCronEnabledChange() {
  const on = cronDom.enabled.checked;
  cronDom.enableLabel.textContent = on ? '定时已启用' : '定时未启用';
  cronDom.enableLabel.className = 'cron-enable-label' + (on ? ' active' : '');
  const current = await window.electronAPI.storage.get('cronConfig') || {};
  await window.electronAPI.sendMessage('SAVE_CRON_CONFIG', { expr: current.expr || '', enabled: on });
}

function renderNextTimes(times) {
  const list = cronDom.nextList;
  if (!times || !times.length) {
    list.innerHTML = '<li class="cron-next-empty">请先输入有效的 Cron 表达式</li>';
    cronDom.nextHint.textContent = '输入有效表达式后自动预览';
    return;
  }
  const now = new Date();
  list.innerHTML = times.map((t, i) => {
    const diff = Math.round((t - now) / 60000);
    const diffStr = diff < 60
      ? `${diff} 分钟后`
      : diff < 1440
      ? `${Math.floor(diff / 60)} 小时 ${diff % 60} 分钟后`
      : `${Math.floor(diff / 1440)} 天后`;
    const weekDay = WEEK_NAMES[t.getDay()];
    const dateStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    return `<li class="cron-next-item ${i === 0 ? 'first' : ''}">
      <span class="cron-next-index">${i + 1}</span>
      <span class="cron-next-datetime"><span class="cron-next-date">${dateStr}</span> <span class="cron-next-weekday">${weekDay}</span> <span class="cron-next-time">${timeStr}</span></span>
      <span class="cron-next-diff">${diffStr}</span>
    </li>`;
  }).join('');
  cronDom.nextHint.textContent = `基于当前时间 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} 计算`;
}

async function saveCronConfig() {
  const expr = cronDom.expr.value.trim();
  const enabled = cronDom.enabled.checked;

  if (!expr) {
    await showAlert('校验失败', '请先填写 Cron 表达式');
    return;
  }

  const v = CronParser.validateCron(expr);
  if (!v.valid) { await showAlert('校验失败', 'Cron 表达式无效：' + v.error); return; }

  const btn = cronDom.saveBtn;
  btn.disabled = true;
  btn.textContent = '保存中...';
  try {
    const config = { enabled, expr };
    await window.electronAPI.sendMessage('SAVE_CRON_CONFIG', config);
    btn.textContent = '已保存 ✓';
    setTimeout(() => { btn.textContent = '保存 Cron 表达式'; btn.disabled = false; }, 2000);
  } catch (e) {
    btn.textContent = '保存失败';
    btn.disabled = false;
    await showAlert('保存失败', '保存失败：' + (e.message || '后台无响应，请刷新页面重试'));
  }
}

async function loadCronConfig() {
  try {
    const config = await window.electronAPI.sendMessage('GET_CRON_CONFIG', {});
    if (!config) return;
    cronDom.enabled.checked = config.enabled || false;
    cronDom.expr.value = config.expr || '';
    onCronEnabledChange();
    if (config.expr) onCronExprInput();
  } catch (e) {
    // Service Worker 未就绪时静默忽略，表单保持默认值
  }
}

function setPatrolTimestamp(state, isoStr) {
  const el = document.getElementById('patrolTimestamp');
  if (!el) return;
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };
  if (state === 'running') {
    el.textContent = `▶ 本次巡店开始于 ${fmt(new Date().toISOString())}`;
    el.style.color = 'var(--accent)';
  } else if (state === 'done') {
    el.textContent = `✓ 本次巡店完成于 ${fmt(isoStr)}`;
    el.style.color = 'var(--success)';
  } else if (state === 'restored') {
    el.textContent = `↺ 上次巡店完成于 ${fmt(isoStr)}`;
    el.style.color = 'var(--text-muted)';
  }
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function truncateTitle(s) {
  if (!s) return 'N/A';
  if (s.length <= 40) return s;
  return s.substring(0, 40) + '...';
}

// ========== 日志 Tab ==========
const logEntries = [];
const MAX_LOG = 500;

function initLogTab() {
  document.getElementById('btnClearLog').addEventListener('click', () => {
    logEntries.length = 0;
    renderLog();
  });

  if (window.electronAPI && window.electronAPI.onLog) {
    window.electronAPI.onLog(entry => {
      logEntries.push(entry);
      if (logEntries.length > MAX_LOG) logEntries.shift();
      appendLogEntry(entry);
      document.getElementById('logCount').textContent = `${logEntries.length} 条`;
    });
  }
}

function appendLogEntry(entry) {
  const list = document.getElementById('logList');
  if (!list) return;
  // 清除初始占位文字
  if (list.children.length === 1 && list.children[0].tagName === 'SPAN') {
    list.innerHTML = '';
  }
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;line-height:1.5';
  row.innerHTML = `<span style="color:var(--text-muted);flex-shrink:0">${esc(entry.time)}</span><span style="color:var(--text-primary)">${esc(entry.message)}</span>`;
  list.appendChild(row);
  // 自动滚到底部
  const container = document.getElementById('logContainer');
  if (container) container.scrollTop = container.scrollHeight;
}

function renderLog() {
  const list = document.getElementById('logList');
  if (!list) return;
  if (!logEntries.length) {
    list.innerHTML = '<span style="color:var(--text-muted)">等待巡店启动...</span>';
    document.getElementById('logCount').textContent = '0 条';
    return;
  }
  list.innerHTML = logEntries.map(e =>
    `<div style="display:flex;gap:8px;align-items:flex-start;line-height:1.5"><span style="color:var(--text-muted);flex-shrink:0">${esc(e.time)}</span><span style="color:var(--text-primary)">${esc(e.message)}</span></div>`
  ).join('');
  document.getElementById('logCount').textContent = `${logEntries.length} 条`;
}

// ========== 历史 Tab ==========
function initHistoryTab() {
  document.getElementById('btnClearPatrolHistory').addEventListener('click', async () => {
    const ok = await showConfirmDialog('清空历史', ['所有巡店历史记录将被清除，此操作不可恢复。'], '清空', '取消');
    if (!ok) return;
    await window.electronAPI.clearPatrolHistory();
    renderPatrolHistory([]);
  });
  document.getElementById('btnCloseDetail').addEventListener('click', () => {
    document.getElementById('historyDetailCard').style.display = 'none';
  });
  loadPatrolHistory();
}

async function loadPatrolHistory() {
  if (!window.electronAPI || !window.electronAPI.getPatrolHistory) return;
  const list = await window.electronAPI.getPatrolHistory();
  renderPatrolHistory(list || []);
}

function renderPatrolHistory(list) {
  const container = document.getElementById('historyList');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<div class="empty-state" style="padding:24px 0"><span class="empty-icon">🕐</span><p>暂无历史记录</p></div>';
    return;
  }
  container.innerHTML = list.map((h, i) => {
    const dt = new Date(h.completedAt);
    const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const elapsed = formatPatrolTime(h.elapsed);
    const badge = h.isRetry ? '<span style="color:var(--warning);font-size:11px">[重试]</span>' : '';
    return `<div class="history-row" data-index="${i}" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="showHistoryDetail(${i})">
      <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);width:120px;flex-shrink:0">${esc(dateStr)}</span>
      <span style="font-size:13px;color:var(--text-primary);flex:1">共 ${h.total} 个 ${badge}</span>
      <span style="color:var(--success);font-size:12px">✅${h.success}</span>
      <span style="color:var(--danger);font-size:12px">❌${h.failed}</span>
      <span style="color:var(--text-muted);font-size:12px">${esc(elapsed)}</span>
      <span style="color:var(--accent);font-size:12px">›</span>
    </div>`;
  }).join('');
}

function showHistoryDetail(index) {
  window.electronAPI.getPatrolHistory().then(list => {
    if (!list || !list[index]) return;
    const h = list[index];
    const dt = new Date(h.completedAt);
    const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    document.getElementById('historyDetailTitle').textContent = `${dateStr} — 共${h.total}个`;
    const SITE_LABELS = { 'www.amazon.ca':'CA','www.amazon.com':'US','www.amazon.com.au':'AU','www.amazon.com.mx':'MX' };
    document.getElementById('historyDetailBody').innerHTML = (h.results || []).map(r => {
      const icon = r.status === 'success' ? '✅' : r.status === 'captcha' ? '🔐' : '❌';
      const site = SITE_LABELS[r.site] || r.site;
      return `<tr>
        <td>${icon}</td>
        <td>${esc(site)}</td>
        <td style="font-family:var(--font-mono)">${esc(r.asin)}</td>
        <td>${esc(r.price || '')}</td>
        <td>${esc(r.stock || '')}</td>
        <td>${esc(r.seller || '')}</td>
        <td style="color:var(--danger);font-size:11px">${esc(r.error || '')}</td>
      </tr>`;
    }).join('');
    document.getElementById('historyDetailCard').style.display = 'block';
    document.getElementById('historyDetailCard').scrollIntoView({ behavior: 'smooth' });
  });
}

function formatPatrolTime(ms) {
  if (!ms) return '';
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h > 0) return `${h}h${m % 60}m`;
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

// ========== 主题切换 ==========
function initTheme() {
  const btn = document.getElementById('btnTheme');
  if (!btn) return;

  // 从 storage 恢复主题
  window.electronAPI.storage.get('appTheme').then(theme => {
    applyTheme(theme || 'light');
  }).catch(() => applyTheme('light'));

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    window.electronAPI.storage.set('appTheme', next).catch(() => {});
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
