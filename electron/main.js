'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const ipcHandlers = require('./ipc-handlers');
const scheduler = require('./scheduler');
const store = require('./store');
const { buildDefaultSites, BUILTIN_SITES } = require('./sites-data');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let tray = null;

// ========== 主窗口 ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: '亚马逊监控助手',
    icon: path.join(__dirname, '../assets/icons/icon128.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/fullpage.html'));

  // 开发模式打开 DevTools，方便调试
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 关闭时隐藏到托盘，不退出
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });

  ipcHandlers.setMainWindow(mainWindow);
}

// ========== 系统托盘 ==========
function createTray() {
  const iconPath = path.join(__dirname, '../assets/icons/icon16.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('亚马逊监控助手');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.exit(0); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ========== 定时触发巡店 ==========
function buildDeliveryZipsForCron(sites) {
  const zips = {};
  for (const s of sites) {
    if (s.enabled && s.zip && s.code) zips[s.code] = s.zip;
  }
  return zips;
}

function onCronTrigger() {
  const rawCache = store.get('asinInputCache') || [];
  const settings = store.get('patrolSettings') || {};
  const sites = store.get('sites') || [];
  const deliveryZips = buildDeliveryZipsForCron(sites);

  // asinInputCache 现为数组格式 [{site, asins}]
  const tasks = [];
  let idx = 0;
  for (const group of rawCache) {
    if (!group.site || !group.asins) continue;
    const asins = [...new Set(
      group.asins.split(/[\n,，]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]{10}$/.test(s))
    )];
    for (const asin of asins) {
      tasks.push({ asin, site: group.site, index: idx++ });
    }
  }

  if (!tasks.length) {
    console.log('[Main] Cron 触发但无有效任务，跳过');
    return;
  }

  const config = { ...settings, deliveryZips };
  console.log(`[Main] Cron 触发巡店，${tasks.length} 个任务`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('CRON_AUTO_START', { tasks, config });
  }
}

// ========== 单实例锁 ==========
// 安装程序覆盖安装时会启动新实例，旧实例收到通知后自动退出，解决"无法关闭"问题
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 第二个实例启动（如安装程序触发），直接退出让安装继续
  app.exit(0);
} else {
  app.on('second-instance', () => {
    // 正常二次启动（如用户双击）：显示已有窗口
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ========== 应用生命周期 ==========
const DEFAULT_DINGTALK_PERSONAL = {
  appKey:    '',  // 填入企业应用 AppKey
  appSecret: '',  // 填入企业应用 AppSecret
  agentId:   '',  // 填入企业应用 AgentId
};

function initDingTalkPersonal() {
  const settings = store.get('patrolSettings') || {};
  if (!settings.dingtalkPersonal || !settings.dingtalkPersonal.appKey) {
    store.set('patrolSettings', {
      ...settings,
      dingtalkPersonal: { ...DEFAULT_DINGTALK_PERSONAL, ...settings.dingtalkPersonal }
    });
    console.log('[Main] 钉钉个人通知配置初始化完成');
  }
}

function initSites() {
  const existing = store.get('sites');
  if (!existing) {
    store.set('sites', buildDefaultSites());
    console.log('[Main] sites.json 初始化完成');
    return;
  }
  // 补丁：旧版本 sites.json 没有 code 字段，按 domain 从 BUILTIN_SITES 补全
  const needsPatch = existing.some(s => !s.code);
  if (needsPatch) {
    const builtinMap = {};
    BUILTIN_SITES.forEach(b => { builtinMap[b.domain] = b.code; });
    const patched = existing.map(s => ({
      ...s,
      code: s.code || builtinMap[s.domain] || s.domain.split('.').pop().toUpperCase()
    }));
    store.set('sites', patched);
    console.log('[Main] sites.json 补全 code 字段完成');
  }
}

// ========== 自动更新 ==========
function initAutoUpdater() {
  // 开发模式不检查更新
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] 发现新版本: ${info.version}`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `亚马逊监控助手 v${info.version} 已下载完成`,
      detail: '点击「立即重启」自动安装新版本，或稍后手动重启软件完成更新。',
      buttons: ['立即重启', '稍后再说'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] 检查更新失败:', err.message);
  });

  // 启动 5 秒后检查，避免影响启动速度
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(e => console.error('[Updater]', e.message));
  }, 5000);
}

app.whenReady().then(() => {
  store.migrate();
  initSites();
  initDingTalkPersonal();
  store.migrateSiteCodes();
  ipcHandlers.register();
  createWindow();
  createTray();

  scheduler.setTriggerCallback(onCronTrigger);
  scheduler.start();

  // 恢复开机自启动设置
  const openAtLogin = store.get('openAtLogin');
  if (openAtLogin !== undefined) {
    app.setLoginItemSettings({ openAtLogin });
  }

  initAutoUpdater();
});

// 所有窗口关闭时不退出（托盘模式）
app.on('window-all-closed', () => {
  // 不调用 app.quit()，保持托盘运行
});

app.on('activate', () => {
  // macOS dock 点击
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
});
