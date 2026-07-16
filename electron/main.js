'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const ipcHandlers = require('./ipc-handlers');
const scheduler = require('./scheduler');
const store = require('./store');

let mainWindow = null;
let tray = null;

// ========== 主窗口 ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: '亚马逊巡店助手',
    icon: path.join(__dirname, '../assets/icons/icon128.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/fullpage.html'));

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
  tray.setToolTip('亚马逊巡店助手');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.exit(0); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ========== 定时触发巡店 ==========
function onCronTrigger() {
  const rawInput = store.get('asinInputCache') || '';
  const asins = [...new Set(
    rawInput.split(/[\n,，]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]{10}$/.test(s))
  )];
  const patrolConfig = store.get('patrolConfig') || {
    concurrency: 2, pageInterval: 4000, intervalJitter: 2000,
    batchSize: 20, batchRest: 30000, scrapeTimeout: 25000,
    maxRetries: 3, retryDelay: 2000, sites: ['www.amazon.ca']
  };
  const sites = patrolConfig.sites || ['www.amazon.ca'];
  if (!asins.length || !sites.length) {
    console.log('[Main] Cron 触发但无有效 ASIN，跳过');
    return;
  }
  const tasks = [];
  asins.forEach((asin, idx) => sites.forEach(site => tasks.push({ asin, site, index: idx })));
  console.log(`[Main] Cron 触发巡店，${tasks.length} 个任务`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('CRON_AUTO_START', { tasks, config: { ...patrolConfig, keepExisting: false, totalCount: tasks.length } });
  }
}

// ========== 应用生命周期 ==========
app.whenReady().then(() => {
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
});

// 所有窗口关闭时不退出（托盘模式）
app.on('window-all-closed', () => {
  // 不调用 app.quit()，保持托盘运行
});

app.on('activate', () => {
  // macOS dock 点击
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});
