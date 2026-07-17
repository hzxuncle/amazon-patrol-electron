'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const activeTabs = new Map();

const SELECTORS_JS = fs.readFileSync(
  path.join(__dirname, '../renderer/selectors.js'), 'utf8'
);

// 提取 content.js 的函数体（去掉 IIFE 包装和消息监听），供 executeJavaScript 直接调用
const rawContent = fs.readFileSync(
  path.join(__dirname, '../renderer/content.js'), 'utf8'
);
const CONTENT_BODY = rawContent
  .replace(/^[\s\S]*?\(function\s*\(\s*\)\s*\{/, '')    // 去掉 IIFE 开头
  .replace(/\}\)\(\);?\s*$/, '')                          // 去掉 IIFE 结尾 })();
  .replace(/^\s*'use strict';\s*\n/m, '')                 // 去掉 'use strict'（外层会加）
  .replace(/chrome\.runtime\.onMessage\.addListener\([\s\S]*?\n  \}\);/, '') // 去掉消息监听
  .replace(/^\s*console\.log\('[^']*Content script[^']*'\);\s*$/m, '');      // 去掉末尾 log

const SITE_URLS = {
  'www.amazon.ca':     'https://www.amazon.ca',
  'www.amazon.com':    'https://www.amazon.com',
  'www.amazon.com.au': 'https://www.amazon.com.au',
  'www.amazon.com.mx': 'https://www.amazon.com.mx'
};

// Electron 28 内置 Chrome 120，使用对应的真实 UA
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getSiteUrl(site) {
  return SITE_URLS[site] || `https://${site}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForLoad(win, maxWait = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, maxWait);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      setTimeout(resolve, 2000);
    });
  });
}

async function injectAndScrape(win, asin, config) {
  const scrapeTimeout = config.scrapeTimeout || 25000;

  // 将 selectors + content 函数体 + 直接调用 handleScrape 合成一个 async 脚本
  // executeJavaScript 会等待返回的 Promise，直接拿到抓取结果
  const fullScript = `
(async function() {
  'use strict';
  try {
    ${SELECTORS_JS}
    ${CONTENT_BODY}
    const result = await handleScrape({
      action: 'SCRAPE_NOW',
      asin: ${JSON.stringify(asin)},
      maxRetries: ${config.maxRetries || 3},
      retryDelay: ${config.retryDelay || 2000},
      useStability: ${config.useStability !== false},
      enabledFields: ${JSON.stringify(config.enabledFields || null)}
    });
    return result;
  } catch(e) {
    return {
      asin: ${JSON.stringify(asin)},
      status: 'failed',
      error: 'inject error: ' + e.message
    };
  }
})()
`;

  const scrapePromise = win.webContents.executeJavaScript(fullScript);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('抓取超时')), scrapeTimeout)
  );

  return Promise.race([scrapePromise, timeoutPromise]);
}

async function openTabForTask(task, config) {
  const { asin, site } = task;
  const url = `${getSiteUrl(site)}/dp/${asin}`;

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,   // 关闭，避免 window.require 被 Amazon 检测
      contextIsolation: false,  // 关闭，让 executeJavaScript 能访问页面全局变量
      javascript: true,
      webSecurity: true
    }
  });

  // 使用真实 Chrome UA，去掉 Electron 标记
  win.webContents.setUserAgent(CHROME_UA);

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

function closeAll() {
  for (const [, { win }] of activeTabs) {
    if (!win.isDestroyed()) win.close();
  }
  activeTabs.clear();
}

module.exports = { openTabForTask, closeAll };
