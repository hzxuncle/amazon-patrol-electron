'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_DIR = app.getPath('userData');

const FILE_MAP = {
  patrolSettings:   'settings.json',
  cronConfig:       'settings.json',
  appTheme:         'settings.json',
  openAtLogin:      'settings.json',
  patrolState:      'state.json',
  patrolResults:    'state.json',
  lastUpdate:       'state.json',
  asinInputCache:   'state.json',
  patrolHistory:    'history.json',
  historySnapshots: 'history.json',
  referenceData:    'reference.json',
  sites:            'sites.json',
};

// 每个文件独立内存缓存
const _caches = {};

function filePath(fileName) {
  return path.join(DATA_DIR, fileName);
}

function loadFile(fileName) {
  if (fileName in _caches) return _caches[fileName];
  try {
    const fp = filePath(fileName);
    if (fs.existsSync(fp)) {
      _caches[fileName] = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } else {
      _caches[fileName] = {};
    }
  } catch (e) {
    _caches[fileName] = {};
  }
  return _caches[fileName];
}

function saveFile(fileName) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(filePath(fileName), JSON.stringify(_caches[fileName], null, 2), 'utf8');
  } catch (e) {
    console.error(`[Store] 写入 ${fileName} 失败:`, e.message);
  }
}

function get(key) {
  const fileName = FILE_MAP[key];
  if (!fileName) return undefined;
  return loadFile(fileName)[key];
}

function set(key, value) {
  const fileName = FILE_MAP[key];
  if (!fileName) { console.warn(`[Store] 未知 key: ${key}`); return; }
  loadFile(fileName)[key] = value;
  saveFile(fileName);
}

function remove(key) {
  const fileName = FILE_MAP[key];
  if (!fileName) return;
  const cache = loadFile(fileName);
  delete cache[key];
  saveFile(fileName);
}

function getAll() {
  const result = {};
  for (const key of Object.keys(FILE_MAP)) {
    const val = get(key);
    if (val !== undefined) result[key] = val;
  }
  return result;
}

// 首次启动时从旧 store.json 迁移数据
function migrate() {
  const oldPath = path.join(DATA_DIR, 'store.json');
  if (!fs.existsSync(oldPath)) return;
  try {
    const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
    // Collect all keys by file first, then save each file once
    const filesToSave = new Set();
    for (const [key, fileName] of Object.entries(FILE_MAP)) {
      if (key in old && old[key] !== undefined) {
        // Skip asinInputCache if it's the legacy string format — handled below
        if (key === 'asinInputCache' && typeof old[key] === 'string') continue;
        loadFile(fileName)[key] = old[key];
        filesToSave.add(fileName);
      }
    }
    for (const fileName of filesToSave) saveFile(fileName);
    // 旧 asinInputCache 是字符串，新格式是数组；无法还原站点信息，清空让用户重配
    const oldCache = old['asinInputCache'];
    if (typeof oldCache === 'string' && oldCache.trim()) {
      // 保留 ASIN 内容但丢弃站点，写入空数组并打印提示
      console.warn('[Store] asinInputCache 格式已变更，请在巡店面板重新配置站点分组');
      loadFile('state.json')['asinInputCache'] = [];
      saveFile('state.json');
    }
    fs.renameSync(oldPath, oldPath + '.bak');
    console.log('[Store] 迁移完成，旧文件已备份为 store.json.bak');
  } catch (e) {
    console.error('[Store] 迁移失败:', e.message);
  }
}

module.exports = { get, set, remove, getAll, migrate };
