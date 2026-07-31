'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const { BUILTIN_SITES } = require('./sites-data');

let debugWin = null;

const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

const PANEL_SCRIPT = fs.readFileSync(
  path.join(__dirname, '../renderer/debugger/panel.js'), 'utf8'
);

function getSiteUrl(code) {
  const site = BUILTIN_SITES.find(s => s.code === code.toUpperCase());
  if (site) return `https://www.${site.domain}`;
  return `https://www.amazon.com`;
}

function getLang(code) {
  const langMap = {
    US: 'en_US', CA: 'en_CA', AU: 'en_AU', MX: 'es_MX',
    UK: 'en_GB', DE: 'de_DE', FR: 'fr_FR', IT: 'it_IT',
    ES: 'es_ES', JP: 'ja_JP', BR: 'pt_BR',
  };
  return langMap[code.toUpperCase()] || 'en_US';
}

/**
 * 打开选择器调试窗口
 * @param {string} asin
 * @param {string} siteCode  二字码，如 CA / US / MX
 */
async function openDebugger(asin, siteCode, theme) {
  // 已有窗口则复用
  if (debugWin && !debugWin.isDestroyed()) {
    debugWin.focus();
    if (asin && siteCode) {
      const url = `${getSiteUrl(siteCode)}/dp/${asin}?language=${getLang(siteCode)}`;
      await debugWin.loadURL(url);
      await injectPanel(debugWin, theme);
    }
    return;
  }

  debugWin = new BrowserWindow({
    width: 1400,
    height: 900,
    title: '选择器调试器',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      javascript: true,
      webSecurity: true,
    },
  });

  debugWin.webContents.setUserAgent(CHROME_UA);

  const url = asin && siteCode
    ? `${getSiteUrl(siteCode)}/dp/${asin}?language=${getLang(siteCode)}`
    : getSiteUrl(siteCode || 'US');

  debugWin.on('closed', () => { debugWin = null; });

  await debugWin.loadURL(url);
  await waitForLoad(debugWin);
  await injectPanel(debugWin, theme);
}

async function injectPanel(win, theme) {
  // 先把主题变量写入页面，panel.js 会读取
  await win.webContents.executeJavaScript(
    `window.__SD_THEME__ = ${JSON.stringify(theme || 'light')};`
  ).catch(() => {});
  await win.webContents.executeJavaScript(PANEL_SCRIPT).catch(e => {
    console.error('[SelectorDebugger] 注入失败:', e.message);
  });
}

function waitForLoad(win, maxWait = 15000) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, maxWait);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      setTimeout(resolve, 800);
    });
  });
}

/**
 * 获取当前调试窗口的拾取结果
 */
async function getCaptures() {
  if (!debugWin || debugWin.isDestroyed()) return [];
  return debugWin.webContents.executeJavaScript(
    'window.__SD_GET_CAPTURES__ ? window.__SD_GET_CAPTURES__() : []'
  ).catch(() => []);
}

module.exports = { openDebugger, getCaptures };
