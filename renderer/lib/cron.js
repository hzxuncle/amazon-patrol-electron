/**
 * Lightweight 5-field Cron Parser
 * Fields: minute(0-59) hour(0-23) dom(1-31) month(1-12) dow(0-7, 0&7=Sunday)
 * Supports: *  n  n-m  n/step  n-m/step  n,m,...
 */

function _cronParseField(str, min, max) {
  const values = new Set();
  for (const part of str.split(',')) {
    const s = part.trim();
    if (s === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (s.includes('/')) {
      const [rangeStr, stepStr] = s.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) throw new Error('invalid step: ' + s);
      let start = min, end = max;
      if (rangeStr !== '*') {
        if (rangeStr.includes('-')) {
          const [a, b] = rangeStr.split('-').map(Number);
          start = a; end = b;
        } else {
          start = parseInt(rangeStr, 10);
        }
      }
      if (isNaN(start) || isNaN(end)) throw new Error('invalid range: ' + s);
      for (let i = start; i <= end; i += step) values.add(i);
    } else if (s.includes('-')) {
      const [a, b] = s.split('-').map(Number);
      if (isNaN(a) || isNaN(b)) throw new Error('invalid range: ' + s);
      for (let i = a; i <= b; i++) values.add(i);
    } else {
      const n = parseInt(s, 10);
      if (isNaN(n)) throw new Error('invalid value: ' + s);
      values.add(n);
    }
  }
  for (const v of values) {
    if (v < min || v > max) throw new Error('value ' + v + ' out of [' + min + ',' + max + ']');
  }
  return values;
}

const CronParser = {
  parseCron: function(expr) {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) throw new Error('需要5个字段: 分 时 日 月 周（空格分隔）');
    return {
      minutes: _cronParseField(parts[0], 0, 59),
      hours:   _cronParseField(parts[1], 0, 23),
      doms:    _cronParseField(parts[2], 1, 31),
      months:  _cronParseField(parts[3], 1, 12),
      dows:    _cronParseField(parts[4], 0, 7)
    };
  },

  matchesCron: function(parsed, date) {
    const dow = date.getDay();
    const dowMatch = parsed.dows.has(dow) || (dow === 0 && parsed.dows.has(7));
    return (
      parsed.minutes.has(date.getMinutes()) &&
      parsed.hours.has(date.getHours()) &&
      parsed.doms.has(date.getDate()) &&
      parsed.months.has(date.getMonth() + 1) &&
      dowMatch
    );
  },

  getNextTimes: function(expr, count, fromDate) {
    count = count || 5;
    fromDate = fromDate || new Date();
    const parsed = this.parseCron(expr);
    const results = [];
    const d = new Date(fromDate);
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    const limit = 1051200;
    for (let i = 0; i < limit && results.length < count; i++) {
      if (this.matchesCron(parsed, d)) results.push(new Date(d));
      d.setMinutes(d.getMinutes() + 1);
    }
    return results;
  },

  validateCron: function(expr) {
    try {
      this.parseCron(expr);
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }
};

if (typeof module !== 'undefined') module.exports = CronParser;
