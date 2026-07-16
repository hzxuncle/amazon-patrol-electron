'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_DIR = app.getPath('userData');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

let _cache = null;

function load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(DATA_FILE)) {
      _cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } else {
      _cache = {};
    }
  } catch (e) {
    _cache = {};
  }
  return _cache;
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(_cache, null, 2), 'utf8');
  } catch (e) {
    console.error('[Store] 写入失败:', e.message);
  }
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  save();
}

function remove(key) {
  delete load()[key];
  save();
}

function getAll() {
  return { ...load() };
}

module.exports = { get, set, remove, getAll };
