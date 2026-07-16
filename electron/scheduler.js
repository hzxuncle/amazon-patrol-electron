'use strict';

const schedule = require('node-schedule');
const store = require('./store');
const CronParser = require('../renderer/lib/cron.js');

let _job = null;
let _onTrigger = null; // 由 main.js 注入触发回调

function setTriggerCallback(fn) { _onTrigger = fn; }

function stop() {
  if (_job) { _job.cancel(); _job = null; }
}

function start() {
  stop();
  const config = store.get('cronConfig');
  if (!config || !config.enabled || !config.expr) return;
  const v = CronParser.validateCron(config.expr);
  if (!v.valid) { console.warn('[Scheduler] 无效 cron 表达式:', config.expr); return; }

  // node-schedule 每分钟触发，手动匹配 cron 表达式（与扩展逻辑一致）
  _job = schedule.scheduleJob('* * * * *', () => {
    const cfg = store.get('cronConfig');
    if (!cfg || !cfg.enabled || !cfg.expr) return;
    const parsed = CronParser.parseCron(cfg.expr);
    if (!CronParser.matchesCron(parsed, new Date())) return;
    console.log('[Scheduler] Cron 触发，准备启动巡店');
    if (_onTrigger) _onTrigger();
  });
  console.log('[Scheduler] 已注册定时任务:', config.expr);
}

function restart() { start(); }

module.exports = { start, stop, restart, setTriggerCallback };
