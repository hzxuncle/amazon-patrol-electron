'use strict';

const { BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const activeTabs = new Map();

const SELECTORS_JS = fs.readFileSync(
  path.join(__dirname, '../renderer/selectors.js'), 'utf8'
);

const rawContent = fs.readFileSync(
  path.join(__dirname, '../renderer/content.js'), 'utf8'
);
const CONTENT_BODY = rawContent
  .replace(/^[\s\S]*?\(function\s*\(\s*\)\s*\{/, '')
  .replace(/\}\)\(\);?\s*$/, '')
  .replace(/^\s*'use strict';\s*\n/m, '')
  .replace(/chrome\.runtime\.onMessage\.addListener\([\s\S]*?\n  \}\);/, '')
  .replace(/^\s*console\.log\('[^']*Content script[^']*'\);\s*$/m, '');

const SITE_URLS = {
  'www.amazon.ca':     'https://www.amazon.ca',
  'www.amazon.com':    'https://www.amazon.com',
  'www.amazon.com.au': 'https://www.amazon.com.au',
  'www.amazon.com.mx': 'https://www.amazon.com.mx'
};

const SITE_LANG = {
  'www.amazon.ca':     'en_CA',
  'www.amazon.com':    'en_US',
  'www.amazon.com.au': 'en_AU',
  'www.amazon.com.mx': 'es_MX'
};

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 记录已经初始化过配送地的站点，巡店期间每站点只设一次
const initializedSites = new Set();

function getSiteUrl(site) {
  return SITE_URLS[site] || `https://${site}`;
}

function buildProductUrl(site, asin) {
  const base = getSiteUrl(site);
  const lang = SITE_LANG[site] || 'en_US';
  return `${base}/dp/${asin}?language=${lang}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForLoad(win, maxWait = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, maxWait);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      // 从 2000ms 降到 500ms，页面已加载完成后只需短暂等待动态内容
      setTimeout(resolve, 500);
    });
  });
}

// 通过一个临时隐藏窗口为指定站点设置配送地，设置完毕关闭
// session 共享 Cookie，后续所有同站点窗口自动继承配送地
async function initDeliveryZip(site, zip) {
  if (!zip || initializedSites.has(site)) return;
  const siteUrl = getSiteUrl(site);

  const win = new BrowserWindow({
    show: false, width: 800, height: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: false, javascript: true }
  });
  win.webContents.setUserAgent(CHROME_UA);

  try {
    // 加载首页拿到 CSRF token（首页比商品页更稳定）
    await win.loadURL(siteUrl + `?language=${SITE_LANG[site] || 'en_US'}`);
    await waitForLoad(win);

    const ok = await win.webContents.executeJavaScript(`
      (async function() {
        try {
          const tokenEl = document.querySelector('input[name="anti-csrftoken-a2z"]');
          const token = tokenEl ? tokenEl.value : '';
          const resp = await fetch('${siteUrl}/gp/delivery/ajax/address-change.html', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              locationType: 'LOCATION_INPUT',
              zipCode: '${zip}',
              storeContext: 'generic',
              deviceType: 'web',
              pageType: 'Gateway',
              actionSource: 'glow',
              'anti-csrftoken-a2z': token
            }).toString()
          });
          return resp.ok;
        } catch(e) { return false; }
      })()
    `);

    if (ok) {
      initializedSites.add(site);
      console.log(`[TabManager] 配送地已设置: ${site} → ${zip}`);
    } else {
      console.warn(`[TabManager] 配送地设置失败: ${site}`);
    }
  } catch (e) {
    console.warn(`[TabManager] initDeliveryZip error:`, e.message);
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}

async function injectAndScrape(win, asin, config) {
  const scrapeTimeout = config.scrapeTimeout || 25000;

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
  const url = buildProductUrl(site, asin);
  const zip = (config.deliveryZips || {})[site] || '';

  // 每站点只初始化一次配送地（不阻塞，首个任务会等，后续直接跳过）
  if (zip && !initializedSites.has(site)) {
    await initDeliveryZip(site, zip);
  }

  const showWindow = !!config.showScrapeWindow;
  const win = new BrowserWindow({
    show: showWindow,
    width: 1280,
    height: 900,
    title: showWindow ? `抓取: ${asin} @ ${site}` : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      javascript: true,
      webSecurity: true
    }
  });

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

// 巡店开始时重置，让新一轮巡店重新设置配送地（邮编可能已改）
function resetSiteInit() {
  initializedSites.clear();
}

module.exports = { openTabForTask, closeAll, resetSiteInit };
