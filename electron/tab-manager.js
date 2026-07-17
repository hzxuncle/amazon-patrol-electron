'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const activeTabs = new Map(); // winId -> { asin, site, win }

const SELECTORS_JS = fs.readFileSync(
  path.join(__dirname, '../renderer/selectors.js'), 'utf8'
);
const CONTENT_JS = fs.readFileSync(
  path.join(__dirname, '../renderer/content.js'), 'utf8'
);

const SITE_URLS = {
  'www.amazon.ca':     'https://www.amazon.ca',
  'www.amazon.com':    'https://www.amazon.com',
  'www.amazon.com.au': 'https://www.amazon.com.au',
  'www.amazon.com.mx': 'https://www.amazon.com.mx'
};

function getSiteUrl(site) {
  return SITE_URLS[site] || `https://${site}`;
}

async function waitForLoad(win, maxWait = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, maxWait);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      // 额外等待 2s 让动态内容渲染
      setTimeout(resolve, 2000);
    });
  });
}

async function injectAndScrape(win, asin, config) {
  return new Promise((resolve, reject) => {
    const { ipcMain } = require('electron');
    const channel = `scrape-result-${win.id}`;
    const scrapeTimeout = config.scrapeTimeout || 25000;
    const timeout = setTimeout(() => {
      ipcMain.removeHandler(channel);
      reject(new Error('抓取超时'));
    }, scrapeTimeout);

    ipcMain.handleOnce(channel, (_event, result) => {
      clearTimeout(timeout);
      resolve(result);
    });

    // 将 chrome.runtime.onMessage.addListener(...) 替换为直接执行并通过 ipcRenderer 回传
    const patchedContent = CONTENT_JS.replace(
      /chrome\.runtime\.onMessage\.addListener\([\s\S]*?\n  \}\);/,
      `(async () => {
        try {
          const result = await handleScrape({
            action: 'SCRAPE_NOW',
            asin: ${JSON.stringify(asin)},
            maxRetries: ${config.maxRetries || 3},
            retryDelay: ${config.retryDelay || 2000},
            useStability: ${config.useStability !== false},
            enabledFields: ${JSON.stringify(config.enabledFields || null)}
          });
          require('electron').ipcRenderer.invoke(${JSON.stringify(channel)}, result);
        } catch (e) {
          require('electron').ipcRenderer.invoke(${JSON.stringify(channel)}, {
            asin: ${JSON.stringify(asin)},
            status: 'failed',
            error: 'content script error: ' + e.message
          });
        }
      })();`
    );

    // 注入选择器，再注入（已打补丁的）content script
    win.webContents.executeJavaScript(SELECTORS_JS)
      .then(() => win.webContents.executeJavaScript(patchedContent))
      .catch((e) => {
        clearTimeout(timeout);
        ipcMain.removeHandler(channel);
        reject(e);
      });
  });
}

/**
 * openTabForTask — 打开隐藏抓取窗口，注入脚本，返回抓取结果
 * @param {{ asin: string, site: string, index?: number }} task
 * @param {object} config  — scrapeTimeout, maxRetries, retryDelay, useStability, enabledFields
 * @returns {Promise<object>} 抓取结果
 */
async function openTabForTask(task, config) {
  const { asin, site } = task;
  const url = `${getSiteUrl(site)}/dp/${asin}`;

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // content.js 需直接访问 DOM，不经 preload
      javascript: true
    }
  });

  activeTabs.set(win.id, { asin, site, win });

  try {
    await win.loadURL(url);
    await waitForLoad(win);
    const result = await injectAndScrape(win, asin, config);
    result.site = site;
    result.index = task.index !== undefined ? task.index : null;
    return result;
  } finally {
    activeTabs.delete(win.id);
    if (!win.isDestroyed()) win.close();
  }
}

/**
 * closeAll — 关闭所有尚存活的抓取窗口
 */
function closeAll() {
  for (const [, { win }] of activeTabs) {
    if (!win.isDestroyed()) win.close();
  }
  activeTabs.clear();
}

module.exports = { openTabForTask, closeAll };
