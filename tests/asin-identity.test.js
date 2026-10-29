'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { extractProductAsin } = require('../renderer/sites/_base/parsers');
const { buildScraperScript } = require('../renderer/sites');
const { BUILTIN_SITES } = require('../electron/sites-data');
const target = 'B0FVXZR93K';
const other = 'B088D1Y5RY';

async function scrape({ site = 'US', details = {}, urlAsin = target, fields = ['unused'] } = {}) {
  const context = vm.createContext({
    window: { scrollBy: () => {}, __SITE_CODE__: site, location: {
      hostname: 'www.amazon.com', pathname: `/dp/${urlAsin}`,
      href: `https://www.amazon.com/dp/${urlAsin}`
    } },
    document: { querySelector: () => null, querySelectorAll: () => [], body: { innerText: '' } },
    // Skip visual delays while keeping the generated scraper's actual control flow.
    setTimeout: fn => setTimeout(fn, 0), clearTimeout, console
  });
  vm.runInContext(buildScraperScript(site), context);
  context.details = details;
  vm.runInContext('window.__SCRAPER_CONFIG__.parsers.extractProductDetails = () => details', context);
  return context.window.__SCRAPER__.scrapePageData({ asin: target, useStability: false, enabledFields: fields });
}

test('shared parser reads only a valid, explicitly labelled product-detail ASIN', () => {
  assert.equal(extractProductAsin({ Details: { '\u200e ASIN ：': other.toLowerCase() } }), other);
  assert.equal(extractProductAsin({ Details: { 'Parent ASIN': other, ASIN: 'invalid' } }), '');
  assert.equal(extractProductAsin({}), '');
});

test('unchanged URL with different details fails even when productInfo and BSR are disabled', async () => {
  const result = await scrape({ details: { 'Product Details': { ASIN: other } } });
  assert.equal(result.status, 'failed');
  assert.equal(result.asin, target);
  assert.equal(result.error, `商品已下架：目标 ASIN ${target} 的产品详情显示为 ASIN ${other}`);
  assert.ok(result.error.includes(other));
  assert.equal(result.asinEvidence.targetAsin, target);
  assert.equal(result.asinEvidence.detailAsin, other);
  assert.equal(result.productInfo['Product Details'].ASIN, other);
  assert.equal(result.price, '');
});

test('matching, missing, invalid and parent ASINs do not trigger identity failures', async () => {
  for (const details of [{ Details: { ASIN: target } }, {}, { Details: { ASIN: 'N/A' } }, { Details: { 'Parent ASIN': other } }]) {
    const result = await scrape({ details });
    assert.equal(result.status, 'success');
    assert.equal(result.asinEvidence, undefined);
  }
});

test('existing URL redirect detection still reports the original target', async () => {
  const result = await scrape({ urlAsin: other });
  assert.equal(result.status, 'failed');
  assert.equal(result.asin, target);
  assert.equal(result.error, `商品已下架，页面跳转至 ${other}`);
});

test('all built-in sites and a custom site share identity checks, including base fallback', async () => {
  for (const site of [...BUILTIN_SITES.map(s => s.code), 'CUSTOM']) {
    for (const [value, status] of [[other, 'failed'], [target, 'success'], ['', 'success'], ['N/A', 'success']]) {
      const result = await scrape({ site, details: { '本地化详情 / Product Details': { ASIN: value } } });
      assert.equal(result.status, status, `${site}: ${value}`);
      assert.equal(result.asin, target);
      if (status === 'failed') assert.equal(result.asinEvidence.detailAsin, other);
    }
  }
});

test('failure enters DingTalk report without reference data and preserves history evidence', async () => {
  const result = await scrape({ details: { 'Product Details': { ASIN: other } } });
  const data = { sites: [{ code: 'US', domain: 'amazon.com' }] };
  const store = { get: key => data[key], set: (key, value) => { data[key] = value; } };
  const context = vm.createContext({
    require: name => name === './store' ? store : {},
    module: { exports: {} }, console, setTimeout, clearTimeout
  });
  const source = fs.readFileSync(path.join(__dirname, '../electron/ipc-handlers.js'), 'utf8');
  vm.runInContext(source + '\nglobalThis.check = { buildDingTalkText, savePatrolHistory, setResults: r => { completedResults = r; } };', context);
  context.check.setResults([result]);
  const summary = { total: 1, success: 0, failed: 1, captcha: 0, elapsed: 1000 };
  const report = await context.check.buildDingTalkText(summary);
  assert.ok(report.includes(target));
  assert.ok(report.includes(other));
  assert.ok(report.includes(result.error));
  context.check.savePatrolHistory(summary);
  assert.equal(data.patrolHistory[0].results[0].asinEvidence.detailAsin, other);
  assert.equal(data.patrolHistory[0].results[0].url, result.url);
});
