'use strict';

/**
 * 选择器入口 — Node.js 端使用（tab-manager.js 读取）
 * 将各站点覆盖和通用选择器合并，注入到页面前准备好完整配置
 */

const COMMON_SELECTORS = require('./common');
const SITE_OVERRIDES_MAP = {
  US: require('./us'),
  CA: require('./ca'),
  AU: require('./au'),
  MX: require('./mx'),
};

/**
 * 获取指定站点 + 字段的合并选择器列表
 * 站点专用覆盖放在前面，通用 fallback 在后面
 * @param {string} siteCode - 站点二字码（CA/US/AU/MX 等）
 * @param {string} field - 字段名
 * @returns {Array}
 */
function getSelectors(siteCode, field) {
  const overrides = SITE_OVERRIDES_MAP[siteCode] || {};
  const siteSpecific = overrides[field] || [];
  const common = COMMON_SELECTORS[field] || [];

  // 站点专用在前，通用 fallback 在后，去重
  const seen = new Set();
  const merged = [];
  for (const sel of [...siteSpecific, ...common]) {
    // 对象类型选择器（attr/regex）直接加入，不去重
    if (typeof sel === 'object') { merged.push(sel); continue; }
    if (!seen.has(sel)) { seen.add(sel); merged.push(sel); }
  }
  return merged;
}

/**
 * 获取所有站点的完整覆盖配置，供注入页面使用
 * tab-manager 将此对象序列化后注入为 window.__SITE_OVERRIDES__
 */
function getAllOverrides() {
  return SITE_OVERRIDES_MAP;
}

module.exports = { getSelectors, getAllOverrides, COMMON_SELECTORS, SITE_OVERRIDES_MAP };
