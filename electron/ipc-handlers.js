'use strict';

const { ipcMain, Notification, app, dialog, shell } = require('electron');
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
    dingtalkWebhook: '',
  };
}

function buildDeliveryZips(sites) {
  const zips = {};
  for (const s of sites) {
    if (s.enabled && s.zip && s.code) zips[s.code] = s.zip;
  }
  return zips;
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

function getSiteLabel(siteCode) {
  // siteCode 现在就是二字码，直接返回
  if (!siteCode) return '';
  // 兼容旧格式：如果传入的是域名则查一下
  if (siteCode.includes('.')) {
    const sites = store.get('sites') || [];
    const found = sites.find(s => `www.${s.domain}` === siteCode || s.domain === siteCode);
    return found ? (found.code || siteCode) : siteCode;
  }
  return siteCode;
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
  const lastPatrolConfig = activePatrol ? activePatrol.config : null;
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
  const patrolSettings = store.get('patrolSettings');
  if (patrolSettings) {
    const references = (store.get('referenceData') || {}).rows || [];
    const webhookEnabled = patrolSettings.enableGroupNotify && patrolSettings.dingtalkWebhook;
    // AK/SK/AgentId 从 settings.json 的 dingtalkPersonal 读（管理员配置），手机号从 dingtalkPersonalPhones 读
    const personalCredentials = patrolSettings.dingtalkPersonal || {};
    const phones = patrolSettings.dingtalkPersonalPhones || '';
    const personalEnabled = patrolSettings.enablePersonalNotify && personalCredentials.appKey && phones;

    if ((webhookEnabled || personalEnabled) && references.length > 0) {
      const text = await buildDingTalkText(summary);
      if (text && webhookEnabled) {
        sendDingTalkWebhook(text, patrolSettings.dingtalkWebhook).catch(e =>
          console.error('[Patrol] 群通知失败:', e.message));
      }
      if (text && personalEnabled) {
        // 手机号转 userId 后发送
        sendDingTalkPersonalByPhone(text, personalCredentials, phones).catch(e =>
          console.error('[Patrol] 个人通知失败:', e.message));
      }
    }
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

async function getMobileUserId(token, mobile) {
  const res = await postJSON(
    `https://oapi.dingtalk.com/topapi/v2/user/getbymobile?access_token=${token}`,
    { mobile }
  );
  const data = JSON.parse(res.text());
  if (data.errcode !== 0) throw new Error(`手机号 ${mobile} 查询失败: ${data.errmsg}`);
  return data.result.userid;
}

async function sendDingTalkPersonalByPhone(text, credentials, phones) {
  const { appKey, appSecret, agentId } = credentials;
  if (!appKey || !appSecret || !agentId || !phones) return;
  try {
    const token = await getAccessToken(appKey, appSecret);
    const phoneList = phones.split(',').map(p => p.trim()).filter(Boolean);
    const userIds = await Promise.all(phoneList.map(p => getMobileUserId(token, p)));
    const body = {
      agent_id: parseInt(agentId),
      userid_list: userIds.join(','),
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

  text += `\n---\n\n> **汇总**　共: ${summary.total}　<font color=#07b807>成功: ${summary.success}</font>　<font color=#ff4d4f>失败: ${summary.failed}</font>　验证码: ${summary.captcha}　用时: ${formatTime(summary.elapsed)}\n`;
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

// ========== IPC 注册 ==========
function register() {
  ipcMain.handle('START_PATROL', async (e, payload) => {
    const { tasks, config: rendererConfig, totalCount, keepExisting } = payload;
    if (activePatrol) return { error: '巡店正在进行中' };
    if (!keepExisting) completedResults = [];
    // 从 sites.json 实时读取邮编，不依赖渲染进程传入
    const sites = store.get('sites') || [];
    const config = { ...rendererConfig, deliveryZips: buildDeliveryZips(sites) };
    activePatrol = { tasks: [...tasks], config, errors: [], keepExisting, totalCount };
    taskQueue = [...tasks];
    startTime = Date.now();
    retryMap = {};
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
    const settings = store.get('patrolSettings') || getDefaultConfig();
    const sitesList = store.get('sites') || [];
    const deliveryZips = buildDeliveryZips(sitesList);
    const config = { ...settings, deliveryZips };
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

  ipcMain.handle('GET_SITES', () => {
    return store.get('sites') || require('./sites-data').buildDefaultSites();
  });

  ipcMain.handle('OPEN_EXTERNAL', (e, url) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
    return { success: true };
  });

  ipcMain.handle('SAVE_SITES', (e, sites) => {
    store.set('sites', sites);
    return { success: true };
  });
}

module.exports = { register, setMainWindow };
