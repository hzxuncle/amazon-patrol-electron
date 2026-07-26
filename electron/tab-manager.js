'use strict';

const { BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const activeTabs = new Map();
let _logFn = null;
function setLogCallback(fn) { _logFn = fn; }
function tabLog(msg) { console.log(msg); if (_logFn) _logFn(msg); }

// asarUnpack 后文件在 app.asar.unpacked/ 而非 app.asar/ 内
// 开发模式下路径不含 .asar，直接使用原路径
function unpackedPath(p) {
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

const sitesIndex = require(path.join(__dirname, '../renderer/sites/index.js'));

const SITE_LANG_MAP = {
  'amazon.com':    'en_US',
  'amazon.ca':     'en_CA',
  'amazon.co.uk':  'en_GB',
  'amazon.de':     'de_DE',
  'amazon.fr':     'fr_FR',
  'amazon.it':     'it_IT',
  'amazon.es':     'es_ES',
  'amazon.nl':     'nl_NL',
  'amazon.se':     'sv_SE',
  'amazon.pl':     'pl_PL',
  'amazon.com.be': 'fr_BE',
  'amazon.co.jp':  'ja_JP',
  'amazon.com.au': 'en_AU',
  'amazon.in':     'en_IN',
  'amazon.sg':     'en_SG',
  'amazon.com.mx': 'es_MX',
  'amazon.com.br': 'pt_BR',
  'amazon.ae':     'en_AE',
  'amazon.sa':     'ar_SA',
  'amazon.com.tr': 'tr_TR',
};

const { BUILTIN_SITES } = require('./sites-data');

// code → { domain, lang } 映射，优先用内置数据
const CODE_TO_DOMAIN = {};
const CODE_TO_LANG = {};
BUILTIN_SITES.forEach(s => {
  if (s.code) {
    CODE_TO_DOMAIN[s.code] = s.domain;
    // SITE_LANG_MAP 的 key 是 amazon.xxx，直接查
    CODE_TO_LANG[s.code] = SITE_LANG_MAP[s.domain] || 'en_US';
  }
});

function getDomainByCode(code) {
  return CODE_TO_DOMAIN[code] || null;
}

function getLangByCode(code) {
  return CODE_TO_LANG[code] || 'en_US';
}

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 记录已经初始化过配送地的站点，巡店期间每站点只设一次
const initializedSites = new Set();
// 记录正在初始化中的站点，防止并发重复初始化
const pendingSiteInit = new Map(); // site → Promise

function getSiteUrl(code) {
  const domain = getDomainByCode(code);
  if (domain) return `https://www.${domain}`;
  // 兼容旧格式：如果传入的是域名
  if (code.includes('.')) return `https://${code.startsWith('www.') ? code : 'www.' + code}`;
  return `https://www.amazon.${code.toLowerCase()}`;
}

function getSiteLang(code) {
  if (!code.includes('.')) return getLangByCode(code);
  // 兼容旧格式域名
  const key = code.replace(/^www\./, '');
  return SITE_LANG_MAP[key] || 'en_US';
}

function buildProductUrl(site, asin) {
  const base = getSiteUrl(site);
  const lang = getSiteLang(site);
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
    await win.loadURL(siteUrl + `?language=${getSiteLang(site)}`);
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
              zipCode: ${JSON.stringify(zip)},
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
      tabLog(`[TabManager] 配送地已设置: ${site} → ${zip}`);
    } else {
      // 设置失败时标记为已初始化（跳过），避免异常 session 影响后续抓取
      initializedSites.add(site);
      tabLog(`[TabManager] ⚠️ 配送地设置失败，跳过继续抓取: ${site}`);
    }
  } catch (e) {
    // 初始化出错时同样标记跳过，不让异常 session 阻塞后续任务
    initializedSites.add(site);
    tabLog(`[TabManager] ⚠️ initDeliveryZip error，跳过: ${e.message}`);
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}

async function injectAndScrape(win, asin, config) {
  const scrapeTimeout = config.scrapeTimeout || 25000;

  const siteCode = config._siteCode || '';

  // 注入 site code，供 scraper 使用
  await win.webContents.executeJavaScript(`window.__SITE_CODE__ = ${JSON.stringify(siteCode)}`);

  // 页面诊断日志
  const diagInfo = await win.webContents.executeJavaScript(`({
    url: location.href,
    title: document.title.slice(0,60),
    hasProduct: !!document.querySelector('#productTitle,#title'),
    hasCaptcha: !!document.querySelector('#captcha,form[action*="captcha"]'),
    isSearch: !!document.querySelector('[data-component-type="s-search-result"]'),
    bodyText: document.body?.innerText?.slice(0,100)?.replace(/\\s+/g,' ')
  })`).catch(() => null);
  if (diagInfo) {
    tabLog(`[Diag] ${siteCode}/${asin} url=${diagInfo.url.slice(0,80)}`);
    tabLog(`[Diag] title="${diagInfo.title}" hasProduct=${diagInfo.hasProduct} hasCaptcha=${diagInfo.hasCaptcha} isSearch=${diagInfo.isSearch}`);
    if (!diagInfo.hasProduct) tabLog(`[Diag] bodyText: ${diagInfo.bodyText}`);
  }

  // 使用新的站点专用 scraper（包含选择器+解析+归一化+抓取流程）
  const scraperScript = sitesIndex.buildScraperScript(siteCode);

  const fullScript = `
(async function() {
  'use strict';
  try {
    ${scraperScript}
    const result = await window.__SCRAPER__.handleScrape({
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
  tabLog(`[TabManager] 抓取: ${asin} @ ${site} → ${url}`);

  // 每站点只初始化一次配送地，并发时后续 worker 等待同一个 Promise 而不是重复初始化
  if (zip && !initializedSites.has(site)) {
    if (!pendingSiteInit.has(site)) {
      const p = initDeliveryZip(site, zip);
      pendingSiteInit.set(site, p);
      p.finally(() => pendingSiteInit.delete(site));
    }
    await pendingSiteInit.get(site);
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
    const finalUrl = win.webContents.getURL();
    if (finalUrl !== url) tabLog(`[TabManager] 重定向: ${url} → ${finalUrl}`);
    const configWithCode = { ...config, _siteCode: site };
    const result = await injectAndScrape(win, asin, configWithCode);
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
  pendingSiteInit.clear();
}

module.exports = { openTabForTask, closeAll, resetSiteInit, setLogCallback };
