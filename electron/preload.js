'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const messageCallbacks = [];
const storageChangeCallbacks = [];
const logCallbacks = [];

// 接收主进程推送（PATROL_UPDATE / PATROL_COMPLETE / CRON_AUTO_START）
ipcRenderer.on('PATROL_UPDATE', (e, data) => {
  messageCallbacks.forEach(cb => cb({ action: 'PATROL_UPDATE', ...data }));
});
ipcRenderer.on('PATROL_COMPLETE', (e, data) => {
  messageCallbacks.forEach(cb => cb({ action: 'PATROL_COMPLETE', ...data }));
});
ipcRenderer.on('CRON_AUTO_START', (e, data) => {
  messageCallbacks.forEach(cb => cb({ action: 'CRON_AUTO_START', ...data }));
});
ipcRenderer.on('STORAGE_CHANGED', (e, changes) => {
  storageChangeCallbacks.forEach(cb => cb(changes));
});
ipcRenderer.on('PATROL_LOG', (e, entry) => {
  logCallbacks.forEach(cb => cb(entry));
});

const updateCallbacks = { available: [], progress: [], downloaded: [], error: [] };

ipcRenderer.on('UPDATE_AVAILABLE', (e, data) => {
  updateCallbacks.available.forEach(cb => cb(data));
});
ipcRenderer.on('UPDATE_PROGRESS', (e, data) => {
  updateCallbacks.progress.forEach(cb => cb(data));
});
ipcRenderer.on('UPDATE_DOWNLOADED', (e, data) => {
  updateCallbacks.downloaded.forEach(cb => cb(data));
});
ipcRenderer.on('UPDATE_ERROR', (e, data) => {
  updateCallbacks.error.forEach(cb => cb(data));
});

contextBridge.exposeInMainWorld('electronAPI', {
  // 消息通信（替换 chrome.runtime.sendMessage / onMessage）
  sendMessage: (action, payload) => ipcRenderer.invoke(action, payload || {}),
  onMessage: (cb) => messageCallbacks.push(cb),

  // 存储（替换 chrome.storage.local）
  storage: {
    get: (key) => ipcRenderer.invoke('STORAGE_GET', key),
    set: (key, value) => ipcRenderer.invoke('STORAGE_SET', key, value),
    remove: (key) => ipcRenderer.invoke('STORAGE_REMOVE', key),
    onChanged: (cb) => storageChangeCallbacks.push(cb)
  },

  // Excel 保存（替换 chrome.downloads）
  saveExcel: (buffer) => ipcRenderer.invoke('SAVE_EXCEL', buffer),

  // 开机自启动
  getLoginItem: () => ipcRenderer.invoke('GET_LOGIN_ITEM'),
  setLoginItem: (openAtLogin) => ipcRenderer.invoke('SET_LOGIN_ITEM', openAtLogin),

  // 执行日志
  onLog: (cb) => logCallbacks.push(cb),

  // 巡店历史
  getPatrolHistory: () => ipcRenderer.invoke('GET_PATROL_HISTORY'),
  clearPatrolHistory: () => ipcRenderer.invoke('CLEAR_PATROL_HISTORY'),

  // 站点管理
  getSites: () => ipcRenderer.invoke('GET_SITES'),
  saveSites: (sites) => ipcRenderer.invoke('SAVE_SITES', sites),

  // 在系统默认浏览器打开链接
  openExternal: (url) => ipcRenderer.invoke('OPEN_EXTERNAL', url),

  // 应用版本与环境信息
  getAppVersion: () => ipcRenderer.invoke('GET_APP_VERSION'),
  getAppInfo: () => ipcRenderer.invoke('GET_APP_INFO'),

  // 选择器调试器
  openSelectorDebugger: (asin, siteCode, theme) => ipcRenderer.invoke('OPEN_SELECTOR_DEBUGGER', { asin, siteCode, theme }),
  getSelectorCaptures: () => ipcRenderer.invoke('GET_SELECTOR_CAPTURES'),

  // 自动更新
  startUpdateDownload: () => ipcRenderer.invoke('START_DOWNLOAD'),
  skipUpdateVersion: (version) => ipcRenderer.invoke('SKIP_UPDATE_VERSION', version),
  onUpdateAvailable: (cb) => updateCallbacks.available.push(cb),
  onUpdateProgress: (cb) => updateCallbacks.progress.push(cb),
  onUpdateDownloaded: (cb) => updateCallbacks.downloaded.push(cb),
  onUpdateError: (cb) => updateCallbacks.error.push(cb),
});
