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

// 需要强制指定币种的站点（目前已验证的欧洲站点）
const SITE_CURRENCY_MAP = {
  'amazon.co.uk': 'GBP',
  'amazon.de':    'EUR',
  'amazon.fr':    'EUR',
  'amazon.it':    'EUR',
  'amazon.es':    'EUR',
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

// 自动使用 Electron 内置 Chromium 版本，随 Electron 升级自动更新，不需要手动维护
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

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

function getCurrencyByCode(code) {
  const domain = CODE_TO_DOMAIN[code] || code;
  const key = domain.replace(/^www\./, '');
  return SITE_CURRENCY_MAP['amazon.' + key.replace(/^amazon\./, '')] || null;
}

function buildProductUrl(site, asin) {
  const base = getSiteUrl(site);
  const lang = getSiteLang(site);
  const currency = getCurrencyByCode(site);
  const params = currency ? `language=${lang}&currency=${currency}` : `language=${lang}`;
  return `${base}/dp/${asin}?${params}`;
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

  const useUiClickMode = ['UK', 'DE'].includes(site);
  // UK/DE 的 popover 交互需要可见窗口，定位到屏幕外避免干扰用户
  const win = new BrowserWindow({
    show: useUiClickMode,
    width: 800, height: 600,
    x: -900, y: -700,  // 屏幕外，用户不可见
    skipTaskbar: true,  // 不出现在任务栏
    webPreferences: { nodeIntegration: false, contextIsolation: false, javascript: true }
  });
  win.webContents.setUserAgent(CHROME_UA);

  try {
    // 加载首页拿到 CSRF token（首页比商品页更稳定）
    await win.loadURL(siteUrl + `?language=${getSiteLang(site)}`);
    await waitForLoad(win);

    // 处理 Cookie 同意弹窗（部分站点首次访问会显示）
    const cookieClicked = await win.webContents.executeJavaScript(`
      (function() {
        const btn = document.querySelector(
          'input[name="accept"], #sp-cc-accept, [data-cell-id="accept"] input, ' +
          'button[id*="accept"], .a-button-input[name="accept"]'
        );
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `).catch(() => false);
    if (cookieClicked) {
      await waitForLoad(win);
      tabLog(`[TabManager] Cookie 弹窗已处理: ${site}`);
    }

    const useUiClick = ['UK', 'DE'].includes(site);
    const jsTimeout = new Promise(resolve => setTimeout(() => resolve(false), 20000));
    const ok = await Promise.race([jsTimeout, win.webContents.executeJavaScript(`
      (async function() {
        ${useUiClick ? `
        // UK/DE：通过点击页面 UI 弹窗设置邮编（DOM 操作，不依赖 AJAX token）
        try {
          // 等待页面主体元素加载完成
          for (let i = 0; i < 10; i++) {
            if (document.getElementById('nav-global-location-popover-link')) break;
            await new Promise(r => setTimeout(r, 500));
          }
          if (!document.getElementById('GLUXZipUpdateInput')) {
            document.getElementById('nav-global-location-popover-link')?.click();
            // 等待弹窗出现，最多 5 秒
            for (let i = 0; i < 10; i++) {
              await new Promise(r => setTimeout(r, 500));
              if (document.getElementById('GLUXZipUpdateInput')) break;
            }
          }
          const zipInput = document.getElementById('GLUXZipUpdateInput');
          if (!zipInput) return false;
          zipInput.value = ${JSON.stringify(zip)};
          zipInput.dispatchEvent(new Event('input', { bubbles: true }));
          const applyBtn = document.querySelector('#GLUXZipUpdate input[type="submit"]');
          if (!applyBtn) return false;
          applyBtn.click();
          await new Promise(r => setTimeout(r, 1500));
          const confirmBtn = document.getElementById('GLUXConfirmClose') ||
                             document.querySelector('.a-popover-footer input.a-button-input');
          if (confirmBtn) confirmBtn.click();
          await new Promise(r => setTimeout(r, 1000));
          return true;
        } catch(e) { return false; }
        ` : `
        // 其他站点：AJAX 接口设置邮编
        let token = '';
        for (let i = 0; i < 10; i++) {
          const el = document.querySelector('input[name="anti-csrftoken-a2z"]');
          if (el && el.value) { token = el.value; break; }
          await new Promise(r => setTimeout(r, 500));
        }
        try {
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
        `}
      })()
    `)]);

    if (ok) {
      // 验证配送地是否真的切换成功（读取页面上的配送地显示）
      await sleep(1000);
      const deliveryText = await win.webContents.executeJavaScript(`
        (document.querySelector('#glow-ingress-line2') || document.querySelector('#nav-global-location-slot') || {innerText:''}).innerText.replace(/\\s+/g,' ').trim()
      `).catch(() => '');
      tabLog(`[TabManager] 配送地已设置: ${site} → ${zip}（页面显示: ` + deliveryText + `）`);
      initializedSites.add(site);
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

  // 检测并跳过拦截页（在 scraper.js 稳定等待后执行，此时页面已完全渲染）
  const interceptResult = await win.webContents.executeJavaScript(`
    (function() {
      // 已有商品内容，不是拦截页
      if (document.querySelector('#productTitle,#title,.a-price,#availability')) return { status: 'none' };

      // 404 页面，不是拦截页
      if (/page not found|404/i.test(document.title)) return { status: '404' };

      const bodyText = document.body ? document.body.innerText : '';
      const bodyLen = bodyText.replace(/\\s+/g,' ').trim().length;
      // 页面内容太长，不像拦截页
      if (bodyLen > 600) return { status: 'none' };

      // 找所有可点击元素，优先匹配已知文本，否则取第一个非空按钮
      const candidates = Array.from(document.querySelectorAll('a,button,input[type="submit"]'));
      const knownBtn = candidates.find(el =>
        /continuar|continue shopping|weiter einkaufen|continuer|continua|買い物を続ける|doorgaan|continuar comprando/i
          .test(el.textContent || el.value || '')
      );
      const fallbackBtn = candidates.find(el => (el.textContent || el.value || '').replace(/\\s+/g,' ').trim().length > 2);
      const btn = knownBtn || fallbackBtn;

      if (btn) { btn.click(); return { status: 'clicked', btnText: (btn.textContent || btn.value || '').trim().slice(0, 60) }; }

      return {
        status: 'no_button',
        url: location.href,
        title: document.title.slice(0, 80),
        bodySnippet: bodyText.replace(/\\s+/g,' ').trim().slice(0, 200),
        buttons: candidates.slice(0, 10).map(el => ({
          tag: el.tagName, id: el.id || '',
          cls: el.className?.toString().slice(0, 60) || '',
          text: (el.textContent || el.value || '').replace(/\\s+/g,' ').trim().slice(0, 60)
        }))
      };
    })()
  `).catch(() => ({ status: 'none' }));
  if (interceptResult.status === '404') {
    tabLog(`[TabManager] ⚠️ 商品页不存在（404）: ${asin} @ ${siteCode}`);
    return {
      asin, site: siteCode, status: 'failed', error: '商品页面不存在（404）',
      title: '', price: '', listPrice: '', rating: '', reviews: '',
      seller: '', stock: '', parentAsin: 'N/A',
      dealBadge: 'N/A', acBadge: 'N/A', coupon: 'N/A',
      url: win.webContents.getURL(), timestamp: new Date().toISOString()
    };
  } else if (interceptResult.status === 'clicked') {
    tabLog(`[TabManager] 检测到拦截页，已自动点击继续: ${asin} @ ${siteCode} 按钮="${interceptResult.btnText}"`);
    await waitForLoad(win);
  } else if (interceptResult.status === 'no_button') {
    tabLog(`[TabManager] ⚠️ 检测到拦截页但未找到按钮: ${asin} @ ${siteCode}`);
    tabLog(`[TabManager] [拦截页诊断] url: ${interceptResult.url}`);
    tabLog(`[TabManager] [拦截页诊断] title: ${interceptResult.title}`);
    tabLog(`[TabManager] [拦截页诊断] body: ${interceptResult.bodySnippet}`);
    tabLog(`[TabManager] [拦截页诊断] 可点击元素: ${JSON.stringify(interceptResult.buttons)}`);
  }

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
