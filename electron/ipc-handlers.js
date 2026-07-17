'use strict';

const { ipcMain, Notification, app, dialog } = require('electron');
const fs = require('fs');
const https = require('https');
const store = require('./store');
const tabManager = require('./tab-manager');
const scheduler = require('./scheduler');

// ========== 状态 ==========
let activePatrol = null;
let taskQueue = [];
let completedResults = [];
let startTime = null;
let retryMap = {};
let mainWindow = null; // 由 main.js 注入

function setMainWindow(win) { mainWindow = win; }

// ========== 工具函数 ==========
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getDefaultConfig() {
  return {
    concurrency: 2, pageInterval: 4000, intervalJitter: 2000,
    batchSize: 20, batchRest: 30000, scrapeTimeout: 25000,
    maxRetries: 3, retryDelay: 2000,
    dingtalkWebhook: '', sites: ['www.amazon.ca']
  };
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h > 0) return `${h}时${m % 60}分${s % 60}秒`;
  if (m > 0) return `${m}分${s % 60}秒`;
  return `${s}秒`;
}

function broadcastUpdate(result) {
  store.set('patrolResults', completedResults);
  store.set('lastUpdate', Date.now());
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('PATROL_UPDATE', {
      result,
      progress: {
        completed: completedResults.length,
        total: activePatrol ? (activePatrol.totalCount || activePatrol.tasks.length) : 0
      }
    });
  }
  const icon = result.status === 'success' ? '✅' : result.status === 'captcha' ? '🔐' : '❌';
  broadcastLog(`${icon} ${result.asin} @ ${getSiteLabel(result.site)} — ${result.status === 'success' ? `$${result.price || 'N/A'}` : result.error || result.status}`);
}

function broadcastLog(message) {
  const entry = { time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), message };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('PATROL_LOG', entry);
  }
}

function getSiteLabel(h) {
  return { 'www.amazon.ca': 'CA', 'www.amazon.com': 'US', 'www.amazon.com.au': 'AU', 'www.amazon.com.mx': 'MX' }[h] || h;
}

// ========== Node 16 fetch 替代 ==========
function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, text: () => raw }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ========== Worker Pool ==========
function processQueue(config) {
  const concurrency = config.concurrency || 2;
  const pageInterval = config.pageInterval || 4000;
  const batchRest = config.batchRest || 30000;
  const batchSize = config.batchSize || 20;

  let globalProcessed = 0;
  let activeWorkers = 0;
  let allWorkersDone = false;

  async function worker(workerId) {
    activeWorkers++;
    while (activePatrol) {
      if (globalProcessed > 0 && globalProcessed % batchSize === 0 && taskQueue.length > 0) {
        broadcastLog(`⏸ 批次休息 ${batchRest / 1000}s，已完成 ${globalProcessed} 个任务...`);
        await sleep(batchRest);
        if (!activePatrol) break;
      }
      const task = taskQueue.shift();
      if (!task) break;

      broadcastLog(`🔍 开始抓取 ${task.asin} @ ${getSiteLabel(task.site)}（剩余队列 ${taskQueue.length}）`);

      try {
        const result = await tabManager.openTabForTask(task, config);
        result.retryCount = retryMap[`${task.asin}_${task.site}`] || 0;
        completedResults.push(result);
        broadcastUpdate(result);
      } catch (err) {
        const key = `${task.asin}_${task.site}`;
        retryMap[key] = (retryMap[key] || 0) + 1;
        const errorResult = {
          asin: task.asin, site: task.site, index: task.index,
          title: '', price: '', listPrice: '', rating: '', reviews: '',
          seller: '', stock: '', parentAsin: 'N/A',
          dealBadge: 'N/A', acBadge: 'N/A', coupon: 'N/A',
          url: `https://${task.site}/dp/${task.asin}`,
          timestamp: new Date().toISOString(),
          status: 'failed', error: err.message || 'Tab操作失败',
          retryCount: retryMap[key]
        };
        completedResults.push(errorResult);
        broadcastUpdate(errorResult);
      }

      globalProcessed++;
      if (taskQueue.length > 0 && activePatrol) {
        const jitter = Math.floor(Math.random() * (config.intervalJitter || 2000));
        await sleep(pageInterval + jitter);
      }
    }

    activeWorkers--;
    if (activeWorkers === 0 && !allWorkersDone) {
      allWorkersDone = true;
      if (activePatrol) onPatrolComplete().catch(e => console.error('[Patrol] onPatrolComplete error:', e));
    }
  }

  for (let i = 0; i < concurrency; i++) worker(i + 1);
}

// ========== 巡店完成 ==========
async function onPatrolComplete() {
  if (!activePatrol) return;
  const elapsed = Date.now() - startTime;
  completedResults.sort((a, b) => (a.index || 0) - (b.index || 0));

  const summary = {
    total: completedResults.length,
    success: completedResults.filter(r => r.status === 'success').length,
    failed: completedResults.filter(r => r.status === 'failed').length,
    captcha: completedResults.filter(r => r.status === 'captcha').length,
    retryable: completedResults.filter(r =>
      r.status === 'failed' && !r.error.includes('验证码') && !r.error.includes('captcha')
    ).length,
    elapsed,
    completedAt: new Date().toISOString(),
    isRetry: activePatrol.isRetry || false
  };

  saveHistorySnapshot();
  savePatrolHistory(summary);
  activePatrol = null;
  store.set('patrolState', { running: false });

  broadcastLog(`🏁 巡店完成 — 共 ${summary.total} | ✅${summary.success} | ❌${summary.failed} | 用时 ${formatTime(elapsed)}`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('PATROL_COMPLETE', { summary, results: completedResults });
  }

  // 系统通知
  try {
    new Notification({
      title: '亚马逊巡店完成',
      body: `共 ${summary.total} 个ASIN | 成功 ${summary.success} | 失败 ${summary.failed} | ${formatTime(elapsed)}`
    }).show();
  } catch (e) {}

  // 钉钉推送
  const patrolConfig = store.get('patrolConfig');
  if (patrolConfig && patrolConfig.dingtalkWebhook) {
    const references = store.get('referenceData') || [];
    if (references.length > 0) sendDingTalk(summary, patrolConfig.dingtalkWebhook);
  }
}

// ========== 历史快照 ==========
function saveHistorySnapshot() {
  const history = store.get('historySnapshots') || {};
  const now = new Date().toISOString();
  completedResults.forEach(r => {
    if (r.status !== 'success') return;
    const key = `${r.asin}_${r.site}`;
    if (!history[key]) history[key] = { asin: r.asin, site: r.site, snapshots: [] };
    history[key].snapshots.push({
      timestamp: now, price: r.price, listPrice: r.listPrice,
      rating: r.rating, reviews: r.reviews, seller: r.seller,
      stock: r.stock, dealBadge: r.dealBadge, acBadge: r.acBadge,
      coupon: r.coupon, parentAsin: r.parentAsin
    });
    if (history[key].snapshots.length > 10) history[key].snapshots = history[key].snapshots.slice(-10);
  });
  store.set('historySnapshots', history);
}

// ========== 巡店历史记录（近10次） ==========
function savePatrolHistory(summary) {
  const list = store.get('patrolHistory') || [];
  list.unshift({
    completedAt: summary.completedAt,
    total: summary.total,
    success: summary.success,
    failed: summary.failed,
    captcha: summary.captcha,
    elapsed: summary.elapsed,
    isRetry: summary.isRetry || false,
    results: completedResults.map(r => ({
      asin: r.asin, site: r.site, status: r.status,
      price: r.price, stock: r.stock, seller: r.seller,
      error: r.error || ''
    }))
  });
  store.set('patrolHistory', list.slice(0, 10));
}

// ========== 钉钉推送 ==========
function mismatchPrice(a, e) {
  if (!e) return false;
  const an = parseFloat(String(a||'').replace(/[^0-9.]/g,'')), en = parseFloat(String(e).replace(/[^0-9.]/g,''));
  if (isNaN(an)||isNaN(en)) return String(a||'').trim()!==String(e).trim();
  return Math.abs(an-en)>=0.01;
}
function mismatchRating(a,e) { if(!e)return false; return Math.abs(parseFloat(a||'0')-parseFloat(e))>=0.2; }
function mismatchReviews(a,e) {
  if(!e)return false;
  const an=parseInt(String(a||'').replace(/[^0-9]/g,''))||0, en=parseInt(String(e).replace(/[^0-9]/g,''))||0;
  return Math.abs(an-en)/Math.max(en,1)>=0.3;
}
function mismatchText(a,e) {
  if(!e)return false;
  const at=String(a||'').trim().toLowerCase(), et=String(e).trim().toLowerCase();
  return at!==et&&!at.includes(et)&&!et.includes(at);
}
function getSiteLabel(h) {
  return {'www.amazon.ca':'CA','www.amazon.com':'US','www.amazon.com.au':'AU','www.amazon.com.mx':'MX'}[h]||h;
}

async function sendDingTalk(summary, webhookUrl) {
  if (!webhookUrl) return;
  const references = store.get('referenceData') || [];
  function findRef(r) {
    return references.find(ref => ref.asin===r.asin &&
      (!ref.site||ref.site===r.site||ref.site.includes(r.site.split('.')[1])));
  }
  const anomalySet = new Map();
  completedResults.forEach(r => {
    const key = `${r.asin}_${r.site}`;
    const ref = findRef(r);
    const label = `${getSiteLabel(r.site)}·${(ref&&ref.aliasName)||r.asin}`;
    if (r.status !== 'success') { anomalySet.set(key,{label,details:[r.error||'抓取失败']}); return; }
    if (!ref) return;
    const diffs = [];
    if (mismatchPrice(r.price,ref.expectedPrice)) diffs.push(`售价 期望${ref.expectedPrice} 实际${r.price}`);
    if (mismatchPrice(r.listPrice,ref.expectedListPrice)) diffs.push(`划线价 期望${ref.expectedListPrice} 实际${r.listPrice}`);
    if (mismatchText(r.dealBadge,ref.expectedDealBadge)) diffs.push(`活动 期望${ref.expectedDealBadge} 实际${r.dealBadge}`);
    if (mismatchText(r.acBadge,ref.expectedAcBadge)) diffs.push(`AC标 期望${ref.expectedAcBadge} 实际${r.acBadge}`);
    if (mismatchText(r.coupon,ref.expectedCoupon)) diffs.push(`Coupon 期望${ref.expectedCoupon} 实际${r.coupon}`);
    if (mismatchRating(r.rating,ref.expectedRating)) diffs.push(`星级 期望${ref.expectedRating} 实际${r.rating}`);
    if (mismatchReviews(r.reviews,ref.expectedReviews)) diffs.push(`评论 期望${ref.expectedReviews} 实际${r.reviews}`);
    if (mismatchText(r.seller,ref.expectedSeller)) diffs.push(`卖家 期望${ref.expectedSeller} 实际${r.seller}`);
    if (mismatchText(r.stock,ref.expectedStock)) diffs.push(`库存 期望${ref.expectedStock} 实际${r.stock}`);
    if (diffs.length) anomalySet.set(key,{label,details:diffs});
  });
  let anomalyText = '';
  if (anomalySet.size>0) {
    anomalyText='\n\n### ⚠️ 异常清单\n';
    anomalySet.forEach(v=>{ anomalyText+=`- ${v.label}: ${v.details.join('; ')}\n`; });
  }
  const body = {
    msgtype:'markdown',
    markdown:{
      title:'亚马逊巡店报告',
      text:`## 📊 亚马逊巡店报告\n\n**时间**: ${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}\n\n**总计**: ${summary.total} | ✅${summary.success} | ❌${summary.failed} | 🔐${summary.captcha}\n\n**异常**: ${anomalySet.size} 个\n\n**用时**: ${formatTime(summary.elapsed)}`+anomalyText
    }
  };
  try {
    const res = await postJSON(webhookUrl, body);
    console.log('[Patrol] 钉钉推送 HTTP', res.status);
  } catch(e) { console.error('[Patrol] 钉钉推送失败:', e.message); }
}

// ========== IPC 注册 ==========
function register() {
  ipcMain.handle('START_PATROL', async (e, payload) => {
    const { tasks, config, totalCount, keepExisting } = payload;
    if (activePatrol) return { error: '巡店正在进行中' };
    if (!keepExisting) completedResults = [];
    activePatrol = { tasks: [...tasks], config, errors: [], keepExisting, totalCount };
    taskQueue = [...tasks];
    startTime = Date.now();
    retryMap = {};
    store.set('patrolConfig', config);
    store.set('patrolState', { running: true, totalCount, completedCount: 0 });
    tabManager.resetSiteInit();
    broadcastLog(`🚀 巡店开始，共 ${tasks.length} 个任务，并发 ${config.concurrency || 2}`);
    processQueue(config);
    return { success: true, totalTasks: tasks.length };
  });

  ipcMain.handle('STOP_PATROL', async () => {
    tabManager.closeAll();
    taskQueue = [];
    activePatrol = null;
    store.set('patrolState', { running: false });
    return { success: true, saved: completedResults.length };
  });

  ipcMain.handle('RETRY_FAILED', async () => {
    if (activePatrol) return { error: '巡店正在进行中' };
    const failedItems = completedResults.filter(r =>
      r.status === 'failed' && !r.error.includes('验证码') && !r.error.includes('captcha')
    );
    if (!failedItems.length) return { error: '没有可重试的失败项', retryable: 0 };
    const retryTasks = failedItems.map((r, idx) => ({ asin: r.asin, site: r.site, index: idx }));
    const config = store.get('patrolConfig') || getDefaultConfig();
    const retryConfig = { ...config, concurrency: Math.min(config.concurrency||2,2), pageInterval: Math.max(config.pageInterval||4000,6000) };
    const failedKeys = new Set(failedItems.map(r=>`${r.asin}_${r.site}`));
    completedResults = completedResults.filter(r=>!failedKeys.has(`${r.asin}_${r.site}`));
    activePatrol = { tasks: retryTasks, config: retryConfig, errors: [], isRetry: true };
    taskQueue = [...retryTasks];
    startTime = Date.now();
    retryMap = {};
    processQueue(retryConfig);
    return { success: true, retryCount: retryTasks.length };
  });

  ipcMain.handle('GET_STATUS', () => ({
    running: activePatrol !== null,
    total: activePatrol ? activePatrol.tasks.length : 0,
    completed: completedResults.length,
    queue: taskQueue.length,
    startTime,
    elapsed: startTime ? Date.now() - startTime : 0
  }));

  ipcMain.handle('GET_RESULTS', () => ({ results: completedResults }));

  ipcMain.handle('GET_HISTORY', () => store.get('historySnapshots') || {});

  ipcMain.handle('GET_PATROL_HISTORY', () => store.get('patrolHistory') || []);

  ipcMain.handle('CLEAR_PATROL_HISTORY', () => { store.remove('patrolHistory'); return { success: true }; });

  ipcMain.handle('CLEAR_RESULTS', () => {
    completedResults = [];
    store.remove('patrolState');
    store.remove('patrolResults');
    return { success: true };
  });

  ipcMain.handle('CLEAR_HISTORY', () => {
    store.remove('historySnapshots');
    return { success: true };
  });

  ipcMain.handle('STORAGE_GET', (e, key) => store.get(key));

  ipcMain.handle('STORAGE_SET', (e, key, value) => { store.set(key, value); return true; });

  ipcMain.handle('STORAGE_REMOVE', (e, key) => { store.remove(key); return true; });

  ipcMain.handle('SAVE_CRON_CONFIG', (e, config) => {
    store.set('cronConfig', config);
    scheduler.restart();
    return { success: true };
  });

  ipcMain.handle('GET_CRON_CONFIG', () => store.get('cronConfig') || { enabled: false, expr: '0 9 * * 1-5' });

  ipcMain.handle('SAVE_EXCEL', async (e, buffer) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存巡店报告',
      defaultPath: `巡店报告_${new Date().toISOString().slice(0,10)}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (!filePath) return { cancelled: true };
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true, filePath };
  });

  ipcMain.handle('GET_LOGIN_ITEM', () => app.getLoginItemSettings());

  ipcMain.handle('SET_LOGIN_ITEM', (e, openAtLogin) => {
    app.setLoginItemSettings({ openAtLogin });
    store.set('openAtLogin', openAtLogin);
    return { success: true };
  });
}

module.exports = { register, setMainWindow };
