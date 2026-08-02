'use strict';

/**
 * 选择器调试面板 — 注入到 Amazon 页面的自包含脚本
 * 运行于 BrowserWindow 的页面上下文，不依赖 Node.js
 */
(function () {
  if (window.__SELECTOR_DEBUGGER_LOADED__) return;
  window.__SELECTOR_DEBUGGER_LOADED__ = true;

  // ── 状态 ──────────────────────────────────────────────────────
  let pickMode = false;
  let scanMode = false;
  let hoveredEl = null;
  const captures = [];   // { selector, candidates, textContent, innerText, offscreen, ts }
  let scanReport = '';   // 最近一次區域掃描的文字報告

  // ── 生成候选选择器（按稳定性排序）──────────────────────────────
  function buildCandidates(el) {
    const results = [];

    function push(type, selector, stars) {
      if (!selector) return;
      try {
        const hits = document.querySelectorAll(selector);
        if (hits.length === 0) return;
        results.push({ type, selector, stars, hits: hits.length });
      } catch (e) { /* 无效选择器跳过 */ }
    }

    // ⭐⭐⭐⭐⭐ ID
    if (el.id) push('ID', `#${CSS.escape(el.id)}`, 5);

    // ⭐⭐⭐⭐ Amazon 专有数据属性
    const aSize = el.getAttribute('data-a-size');
    if (aSize) push('Amazon属性', `.a-price[data-a-size="${aSize}"] .a-offscreen`, 4);
    const featureName = el.closest('[data-feature-name]')?.getAttribute('data-feature-name');
    if (featureName) push('feature-name', `[data-feature-name="${featureName}"] .a-offscreen`, 4);
    const componentType = el.closest('[data-component-type]')?.getAttribute('data-component-type');
    if (componentType) push('component-type', `[data-component-type="${componentType}"]`, 4);

    // ⭐⭐⭐⭐ 祖先 ID + 后代
    let ancestor = el.parentElement;
    let depth = 0;
    while (ancestor && depth < 5) {
      if (ancestor.id) {
        const tag = el.tagName.toLowerCase();
        const cls = [...el.classList].slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
        push('祖先ID+后代', `#${CSS.escape(ancestor.id)} ${tag}${cls}`, 4);
        push('祖先ID+后代', `#${CSS.escape(ancestor.id)} .a-offscreen`, 3);
        break;
      }
      ancestor = ancestor.parentElement;
      depth++;
    }

    // ⭐⭐⭐ 有意义的 class 组合（过滤掉纯样式 class）
    const meaningfulCls = [...el.classList].filter(c =>
      !c.match(/^(a-size|a-color|a-spacing|a-section|a-row|a-col|a-padding|a-margin|a-text|a-align|a-float|a-expander|a-truncate|a-hidden|a-visible|a-clear|sg-|_|sc-)/)
    );
    if (meaningfulCls.length > 0) {
      push('语义类', meaningfulCls.slice(0, 3).map(c => `.${CSS.escape(c)}`).join(''), 3);
    }

    // ⭐⭐ 标签 + class
    const tagCls = el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
    push('标签+类', tagCls, 2);

    // ⭐⭐⭐⭐ 整組兄弟（點中一個，識別同類重複結構）
    const parent = el.parentElement;
    if (parent) {
      const tag = el.tagName.toLowerCase();
      const elCls = [...el.classList].filter(c => c.length > 0);
      const siblings = [...parent.children].filter(c =>
        c !== el && c.tagName === el.tagName &&
        elCls.some(cls => c.classList.contains(cls))
      );
      if (siblings.length > 0) {
        const allSiblings = [el, ...siblings];
        const commonCls = elCls.filter(cls =>
          allSiblings.every(s => s.classList.contains(cls)) &&
          !cls.match(/^(a-size|a-color|a-spacing|a-section|a-row|a-col|a-padding|a-margin|a-text|a-align|a-float|a-expander|a-truncate|a-hidden|a-visible)/)
        );
        if (commonCls.length > 0) {
          const groupSel = parent.id
            ? `#${CSS.escape(parent.id)} ${tag}.${commonCls.slice(0, 2).map(c => CSS.escape(c)).join('.')}`
            : `${tag}.${commonCls.slice(0, 2).map(c => CSS.escape(c)).join('.')}`;
          push('整組兄弟', groupSel, 4);
        } else if (parent.id) {
          push('整組兄弟', `#${CSS.escape(parent.id)} > ${tag}`, 3);
        }
      }
    }

    // ⭐ CSS 路径（兜底，始终唯一但不稳定）
    push('CSS路径', buildCssPath(el), 1);

    // 去重
    const seen = new Set();
    return results.filter(r => {
      if (seen.has(r.selector)) return false;
      seen.add(r.selector);
      return true;
    });
  }

  function buildCssPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body) {
      let selector = cur.tagName.toLowerCase();
      if (cur.id) {
        selector = `#${CSS.escape(cur.id)}`;
        parts.unshift(selector);
        break;
      }
      const siblings = cur.parentElement
        ? [...cur.parentElement.children].filter(c => c.tagName === cur.tagName)
        : [];
      if (siblings.length > 1) {
        const idx = siblings.indexOf(cur) + 1;
        selector += `:nth-of-type(${idx})`;
      }
      parts.unshift(selector);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  // ── 提取值 ────────────────────────────────────────────────────
  function extractValues(el) {
    const textContent = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const innerText = (el.innerText || '').replace(/\s+/g, ' ').trim();
    const offscreenEl = el.classList.contains('a-offscreen') ? el : el.querySelector('.a-offscreen');
    const offscreen = offscreenEl ? (offscreenEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const attrVal = el.value || el.getAttribute('data-value') || el.getAttribute('content') || '';

    // 圖片：優先取元素自身，再找後代 img
    const imgEl = (el.tagName === 'IMG') ? el : el.querySelector('img');
    const src = el.getAttribute('src') || imgEl?.getAttribute('src') || imgEl?.currentSrc || '';
    const srcset = el.getAttribute('srcset') || imgEl?.getAttribute('srcset') || '';
    const dataSrc = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || imgEl?.getAttribute('data-src') || '';

    // 視頻：優先取元素自身，再找後代 video/source
    const videoEl = (el.tagName === 'VIDEO') ? el : el.querySelector('video');
    const sourceEl = el.querySelector('source');
    const videoSrc = el.getAttribute('data-video-url') || videoEl?.getAttribute('src') || sourceEl?.getAttribute('src') || '';

    // 鏈接
    const href = el.getAttribute('href') || el.closest('a')?.getAttribute('href') || '';

    return { textContent, innerText, offscreen, attrVal, src, srcset, dataSrc, videoSrc, href };
  }

  // ── 高亮样式 ──────────────────────────────────────────────────
  function getThemeVars() {
    const dark = (window.__SD_THEME__ === 'dark');
    return dark ? {
      bg:        '#111827',
      bgHeader:  '#131a2b',
      bgInput:   '#0a0f1a',
      bgHover:   '#182032',
      border:    '#1a2940',
      accent:    '#00e5ff',
      success:   '#00e676',
      warning:   '#ffab00',
      danger:    '#ff3d47',
      textPri:   '#e0e6f0',
      textSec:   '#7a8ba0',
      textMuted: '#455570',
      valueClr:  '#c0caf5',
      selectorClr:'#00e676',
      tabBg:     '#131a2b',
    } : {
      bg:        '#ffffff',
      bgHeader:  '#f5f6fa',
      bgInput:   '#f5f6fa',
      bgHover:   '#f0f1f8',
      border:    '#e2e4ef',
      accent:    '#5b5edb',
      success:   '#00a854',
      warning:   '#fa8c16',
      danger:    '#f5222d',
      textPri:   '#1a1d2e',
      textSec:   '#5a5e7a',
      textMuted: '#9a9eb8',
      valueClr:  '#5b5edb',
      selectorClr:'#00a854',
      tabBg:     '#f5f6fa',
    };
  }

  function injectStyle() {
    if (document.getElementById('__sd_style__')) return;
    const v = getThemeVars();
    const style = document.createElement('style');
    style.id = '__sd_style__';
    style.textContent = `
      #__sd_panel__ {
        position: fixed; top: 0; right: 0; width: 360px; height: 100vh;
        background: ${v.bg}; color: ${v.textPri};
        font-family: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
        font-size: 12px; z-index: 2147483647; display: flex; flex-direction: column;
        border-left: 2px solid ${v.accent}; box-shadow: -4px 0 24px rgba(0,0,0,0.18);
        transition: transform 0.2s;
      }
      #__sd_panel__.collapsed { transform: translateX(332px); }
      #__sd_expand_tab__ {
        display: none; position: absolute; left: -28px; top: 50%;
        transform: translateY(-50%);
        width: 28px; height: 80px;
        background: ${v.accent}; border-radius: 6px 0 0 6px;
        cursor: pointer; writing-mode: vertical-rl;
        font-size: 11px; color: ${v.bg}; font-weight: 700;
        align-items: center; justify-content: center;
        letter-spacing: 2px; user-select: none;
      }
      #__sd_panel__.collapsed #__sd_expand_tab__ { display: flex; }
      #__sd_header__ {
        padding: 8px 12px; background: ${v.bgHeader}; border-bottom: 1px solid ${v.border};
        display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
      }
      #__sd_header__ .title { color: ${v.accent}; font-weight: 700; font-size: 13px; }
      #__sd_header__ .controls { display: flex; gap: 6px; align-items: center; }
      #__sd_tabs__ {
        display: flex; border-bottom: 1px solid ${v.border}; flex-shrink: 0;
        background: ${v.tabBg};
      }
      .sd-tab {
        flex: 1; padding: 7px 4px; text-align: center; cursor: pointer;
        color: ${v.textMuted}; font-size: 11px; border-bottom: 2px solid transparent;
        transition: all 0.15s;
      }
      .sd-tab.active { color: ${v.accent}; border-bottom-color: ${v.accent}; }
      .sd-tab-panel { flex: 1; overflow-y: auto; padding: 10px; display: none; }
      .sd-tab-panel.active { display: block; }
      .sd-btn {
        padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer;
        font-size: 11px; font-family: inherit; transition: all 0.15s;
      }
      .sd-btn-pick { background: ${v.success}; color: ${v.bg}; }
      .sd-btn-pick.active { background: ${v.danger}; color: #fff; }
      .sd-btn-ghost { background: transparent; color: ${v.textMuted}; border: 1px solid ${v.border}; }
      .sd-btn-ghost:hover { color: ${v.textPri}; border-color: ${v.textSec}; }
      .sd-capture-card {
        background: ${v.bgInput}; border: 1px solid ${v.border}; border-radius: 6px;
        margin-bottom: 8px; overflow: hidden;
      }
      .sd-capture-card-header {
        padding: 7px 10px; display: flex; justify-content: space-between;
        align-items: center; border-bottom: 1px solid ${v.border}; cursor: pointer;
      }
      .sd-capture-card-header:hover { background: ${v.bgHover}; }
      .sd-capture-ts { color: ${v.textMuted}; font-size: 10px; }
      .sd-capture-body { padding: 8px 10px; display: none; }
      .sd-capture-body.open { display: block; }
      .sd-section-label {
        font-size: 10px; color: ${v.textMuted}; text-transform: uppercase;
        letter-spacing: 0.5px; margin: 8px 0 4px;
      }
      .sd-section-label:first-child { margin-top: 0; }
      .sd-candidate {
        display: flex; align-items: center; gap: 6px;
        padding: 4px 6px; border-radius: 4px; margin-bottom: 3px;
        background: ${v.bgHover}; cursor: pointer;
      }
      .sd-candidate:hover { background: ${v.border}; }
      .sd-stars { color: ${v.warning}; font-size: 10px; flex-shrink: 0; }
      .sd-selector { color: ${v.selectorClr}; flex: 1; word-break: break-all; font-size: 11px; }
      .sd-hits { font-size: 10px; flex-shrink: 0; }
      .sd-hits.ok { color: ${v.success}; }
      .sd-hits.warn { color: ${v.warning}; }
      .sd-hits.bad { color: ${v.danger}; }
      .sd-value-row { display: flex; gap: 6px; margin-bottom: 4px; align-items: flex-start; }
      .sd-value-label { color: ${v.textMuted}; font-size: 10px; flex-shrink: 0; width: 64px; }
      .sd-value { color: ${v.valueClr}; word-break: break-all; font-size: 11px; }
      .sd-value.empty { color: ${v.border}; font-style: italic; }
      .sd-del-btn {
        background: none; border: none; color: ${v.textMuted}; cursor: pointer;
        font-size: 14px; padding: 0 2px; line-height: 1;
      }
      .sd-del-btn:hover { color: ${v.danger}; }
      .sd-input {
        width: 100%; background: ${v.bgInput}; border: 1px solid ${v.border};
        color: ${v.textPri}; border-radius: 4px; padding: 6px 8px;
        font-family: inherit; font-size: 11px; box-sizing: border-box;
        outline: none; margin-bottom: 6px;
      }
      .sd-input:focus { border-color: ${v.accent}; }
      .sd-test-result {
        background: ${v.bgInput}; border-radius: 4px; padding: 8px;
        margin-top: 6px; font-size: 11px;
      }
      .sd-test-hit { color: ${v.success}; margin-bottom: 4px; }
      .sd-test-item {
        padding: 3px 0; border-bottom: 1px solid ${v.border}; color: ${v.valueClr};
      }
      .sd-test-item:last-child { border-bottom: none; }
      .sd-test-none { color: ${v.danger}; }
      .sd-copy-btn {
        font-size: 10px; padding: 1px 6px; border-radius: 3px;
        border: 1px solid ${v.border}; background: transparent; color: ${v.textMuted};
        cursor: pointer; margin-left: 4px;
      }
      .sd-copy-btn:hover { color: ${v.textPri}; border-color: ${v.accent}; }
      .sd-copy-btn.copied { color: ${v.success}; border-color: ${v.success}; }
      .__sd_highlight__ {
        outline: 2px solid ${v.danger} !important;
        outline-offset: 2px !important;
        background: rgba(245,34,45,0.08) !important;
        cursor: crosshair !important;
      }
      .__sd_captured__ {
        outline: 2px solid ${v.success} !important;
        outline-offset: 2px !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ── 面板 HTML ─────────────────────────────────────────────────
  function buildPanel() {
    // 让页面内容区域腾出右边空间，避免面板遮挡
    document.body.style.marginRight = '360px';
    document.body.style.boxSizing = 'border-box';

    const panel = document.createElement('div');
    panel.id = '__sd_panel__';
    panel.innerHTML = `
      <div id="__sd_expand_tab__" title="展开面板">调试</div>
      <div id="__sd_header__">
        <span class="title">🔍 选择器调试</span>
        <div class="controls">
          <button class="sd-btn sd-btn-pick" id="__sd_pick__">拾取</button>
          <button class="sd-btn sd-btn-pick" id="__sd_scan__" style="background:#7c3aed">掃描區域</button>
          <button class="sd-btn sd-btn-ghost" id="__sd_clear__">清空</button>
          <button class="sd-btn sd-btn-ghost" id="__sd_collapse__" title="收起 (ESC)">◀</button>
        </div>
      </div>
      <div id="__sd_tabs__">
        <div class="sd-tab active" data-tab="capture">拾取 <span id="__sd_capture_count__">0</span></div>
        <div class="sd-tab" data-tab="scan">掃描</div>
        <div class="sd-tab" data-tab="test">測試</div>
        <div class="sd-tab" data-tab="history">歷史 <span id="__sd_history_count__">0</span></div>
      </div>
      <div class="sd-tab-panel active" id="__sd_panel_capture__">
        <div id="__sd_capture_list__">
          <div style="color:#565f89;text-align:center;padding:32px 0;font-size:11px;">
            点击「拾取」按钮后<br>在页面上点击任意元素
          </div>
        </div>
      </div>
      <div class="sd-tab-panel" id="__sd_panel_scan__">
        <div style="color:#565f89;text-align:center;padding:32px 0;font-size:11px;">
          點擊「掃描區域」按鈕後<br>在頁面上點選任意容器元素
        </div>
      </div>
      <div class="sd-tab-panel" id="__sd_panel_test__">
        <div style="color:#565f89;font-size:11px;margin-bottom:6px;">输入 CSS 选择器，实时查看命中结果</div>
        <input class="sd-input" id="__sd_test_input__" placeholder="例：#productTitle  或  .a-price .a-offscreen" />
        <div id="__sd_test_result__"></div>
      </div>
      <div class="sd-tab-panel" id="__sd_panel_history__">
        <div id="__sd_history_list__">
          <div style="color:#565f89;text-align:center;padding:32px 0;font-size:11px;">暂无历史</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  // ── 渲染拾取列表 ──────────────────────────────────────────────
  function renderCaptures() {
    const list = document.getElementById('__sd_capture_list__');
    const count = document.getElementById('__sd_capture_count__');
    if (!list) return;
    count.textContent = captures.length;

    if (captures.length === 0) {
      list.innerHTML = `<div style="color:#565f89;text-align:center;padding:32px 0;font-size:11px;">点击「拾取」按钮后<br>在页面上点击任意元素</div>`;
      return;
    }

    list.innerHTML = captures.map((c, i) => {
      const topCandidate = c.candidates[0];
      const preview = topCandidate ? topCandidate.selector.slice(0, 40) : '—';
      const hasValue = c.values.innerText || c.values.offscreen || c.values.attrVal;
      const valuePreview = (c.values.offscreen || c.values.innerText || c.values.attrVal || '').slice(0, 30);

      return `
        <div class="sd-capture-card">
          <div class="sd-capture-card-header" data-idx="${i}">
            <div>
              <div style="color:#9ece6a;font-size:11px;margin-bottom:2px">${escHtml(preview)}${topCandidate?.selector.length > 40 ? '…' : ''}</div>
              <div style="color:#bb9af7;font-size:10px">${escHtml(valuePreview) || '<span style="color:#3b4261">空值</span>'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              <span class="sd-capture-ts">${c.ts}</span>
              <button class="sd-del-btn" data-del="${i}">×</button>
            </div>
          </div>
          <div class="sd-capture-body" id="__sd_body_${i}__">
            <div class="sd-section-label">候选选择器（按稳定性排序）</div>
            ${c.candidates.map(cd => {
              const hitsClass = cd.hits === 1 ? 'ok' : cd.hits <= 5 ? 'warn' : 'bad';
              const hitsLabel = cd.hits === 1 ? '唯一✓' : `${cd.hits}个`;
              return `
                <div class="sd-candidate" data-sel="${escHtml(cd.selector)}">
                  <span class="sd-stars">${'★'.repeat(cd.stars)}${'☆'.repeat(5 - cd.stars)}</span>
                  <span class="sd-selector">${escHtml(cd.selector)}</span>
                  <span class="sd-hits ${hitsClass}">${hitsLabel}</span>
                  <button class="sd-copy-btn" data-copy="${escHtml(cd.selector)}">复制</button>
                </div>
              `;
            }).join('')}
            <div class="sd-section-label" style="margin-top:10px">提取值</div>
            ${renderValueRow('textContent', c.values.textContent)}
            ${renderValueRow('innerText', c.values.innerText)}
            ${c.values.offscreen ? renderValueRow('a-offscreen', c.values.offscreen) : ''}
            ${c.values.attrVal ? renderValueRow('attr/value', c.values.attrVal) : ''}
            ${c.values.src ? renderValueRow('src', c.values.src) : ''}
            ${c.values.dataSrc ? renderValueRow('data-src', c.values.dataSrc) : ''}
            ${c.values.srcset ? renderValueRow('srcset', c.values.srcset) : ''}
            ${c.values.videoSrc ? renderValueRow('video-src', c.values.videoSrc) : ''}
            ${c.values.href ? renderValueRow('href', c.values.href) : ''}
          </div>
        </div>
      `;
    }).join('');

    // 展开/折叠
    list.querySelectorAll('.sd-capture-card-header').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        if (e.target.closest('.sd-del-btn, .sd-copy-btn')) return;
        const idx = hdr.dataset.idx;
        const body = document.getElementById(`__sd_body_${idx}__`);
        if (body) body.classList.toggle('open');
      });
    });

    // 删除
    list.querySelectorAll('.sd-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.del);
        captures.splice(idx, 1);
        renderCaptures();
        renderHistory();
      });
    });

    // 复制
    list.querySelectorAll('.sd-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.copy).then(() => {
          btn.textContent = '✓';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1500);
        });
      });
    });

    // 鼠标悬停候选选择器时高亮页面元素
    list.querySelectorAll('.sd-candidate').forEach(item => {
      item.addEventListener('mouseenter', () => {
        clearHighlights('__sd_hover_hl__');
        try {
          document.querySelectorAll(item.dataset.sel).forEach(el => {
            el.classList.add('__sd_hover_hl__');
          });
        } catch (e) {}
      });
      item.addEventListener('mouseleave', () => clearHighlights('__sd_hover_hl__'));
    });

    // 默认展开第一张卡片
    const firstBody = document.getElementById('__sd_body_0__');
    if (firstBody) firstBody.classList.add('open');
  }

  const PREVIEW_LEN = 80;
  let _expandCounter = 0;

  function renderValueRow(label, val) {
    if (!val) return `
      <div class="sd-value-row">
        <span class="sd-value-label">${label}</span>
        <span class="sd-value empty">(空)</span>
      </div>`;

    const copyBtn = `<button class="sd-copy-btn" data-copy="${escHtml(val)}" style="margin-left:4px">复制</button>`;

    if (val.length <= PREVIEW_LEN) {
      return `
        <div class="sd-value-row">
          <span class="sd-value-label">${label}</span>
          <span class="sd-value">${escHtml(val)}${copyBtn}</span>
        </div>`;
    }

    const id = `__sd_expand_${_expandCounter++}__`;
    const preview = escHtml(val.slice(0, PREVIEW_LEN));
    const full = escHtml(val);
    return `
      <div class="sd-value-row">
        <span class="sd-value-label">${label}</span>
        <span class="sd-value">
          <span id="${id}_short">${preview}<span style="color:#9a9eb8">…</span>
            <button class="sd-copy-btn" onclick="
              document.getElementById('${id}_short').style.display='none';
              document.getElementById('${id}_full').style.display='inline';
            " style="margin-left:4px">展開</button>
          </span>
          <span id="${id}_full" style="display:none">${full}${copyBtn}
            <button class="sd-copy-btn" onclick="
              document.getElementById('${id}_short').style.display='inline';
              document.getElementById('${id}_full').style.display='none';
            " style="margin-left:4px">收起</button>
          </span>
        </span>
      </div>`;
  }

  // ── 历史 Tab ──────────────────────────────────────────────────
  const history = [];
  function renderHistory() {
    const list = document.getElementById('__sd_history_list__');
    const count = document.getElementById('__sd_history_count__');
    if (!list) return;
    count.textContent = history.length;
    if (history.length === 0) {
      list.innerHTML = `<div style="color:#565f89;text-align:center;padding:32px 0;font-size:11px;">暂无历史</div>`;
      return;
    }
    list.innerHTML = history.slice().reverse().map((h, i) => `
      <div style="padding:6px 0;border-bottom:1px solid #292e42">
        <div style="color:#9ece6a;font-size:11px;margin-bottom:2px">${escHtml(h.selector)}</div>
        <div style="color:#bb9af7;font-size:10px">${escHtml(h.value)}</div>
        <div style="color:#565f89;font-size:10px;margin-top:2px">${h.ts}</div>
      </div>
    `).join('');
  }

  // ── 实时测试 Tab ──────────────────────────────────────────────
  let testTimer = null;
  function initTestTab() {
    const input = document.getElementById('__sd_test_input__');
    const result = document.getElementById('__sd_test_result__');
    if (!input) return;

    input.addEventListener('input', () => {
      clearTimeout(testTimer);
      testTimer = setTimeout(() => runTest(input.value.trim(), result), 300);
    });
  }

  function runTest(selector, container) {
    if (!selector) { container.innerHTML = ''; return; }
    try {
      const els = [...document.querySelectorAll(selector)];
      if (els.length === 0) {
        container.innerHTML = `<div class="sd-test-result"><div class="sd-test-none">❌ 未命中任何元素</div></div>`;
        clearHighlights('__sd_test_hl__');
        return;
      }
      clearHighlights('__sd_test_hl__');
      els.forEach(el => el.classList.add('__sd_test_hl__'));

      const hitsClass = els.length === 1 ? 'ok' : els.length <= 5 ? 'warn' : 'bad';
      container.innerHTML = `
        <div class="sd-test-result">
          <div class="sd-test-hit sd-hits ${hitsClass}">命中 ${els.length} 个元素</div>
          ${els.slice(0, 10).map((el, i) => {
            const offscreen = el.querySelector('.a-offscreen');
            const val = (offscreen?.textContent || el.innerText || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
            return `<div class="sd-test-item">[${i + 1}] ${escHtml(val) || '<span style="color:#3b4261">(空)</span>'}</div>`;
          }).join('')}
          ${els.length > 10 ? `<div style="color:#565f89;font-size:10px;margin-top:4px">…还有 ${els.length - 10} 个</div>` : ''}
        </div>
      `;

      // 复制按钮绑定
      container.querySelectorAll('.sd-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(btn.dataset.copy).then(() => {
            btn.textContent = '✓'; btn.classList.add('copied');
            setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1500);
          });
        });
      });
    } catch (e) {
      container.innerHTML = `<div class="sd-test-result"><div class="sd-test-none">⚠️ 选择器语法错误: ${escHtml(e.message)}</div></div>`;
    }
  }

  // ── 區域掃描 ─────────────────────────────────────────────────
  function buildShortSelector(el) {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const cls = [...el.classList].filter(c =>
      !c.match(/^(a-size|a-color|a-spacing|a-section|a-row|a-col|a-padding|a-margin|a-text|a-align|a-float|a-expander|a-truncate|a-hidden|a-visible|sg-|sc-)/)
    ).slice(0, 2).map(c => `.${c}`).join('');
    return tag + cls;
  }

  function extractNodeValue(el) {
    const src = el.getAttribute('src') || el.querySelector('img')?.getAttribute('src') || '';
    const href = el.getAttribute('href') || '';
    const videoSrc = el.getAttribute('data-video-url') || el.querySelector('video')?.getAttribute('src') || '';
    if (src) return `[img] ${src}`;
    if (videoSrc) return `[video] ${videoSrc}`;
    if (href) return `[link] ${href}`;
    const offscreen = el.querySelector('.a-offscreen');
    if (offscreen) return offscreen.textContent.replace(/\s+/g, ' ').trim();
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function scanRegion(root) {
    const lines = [];
    const rootSel = buildShortSelector(root);
    lines.push(`容器: ${rootSel}  (${root.tagName.toLowerCase()}#${root.id || '—'}  class="${[...root.classList].slice(0,3).join(' ')}")`);
    lines.push(`頁面: ${location.hostname}${location.pathname.slice(0, 60)}`);
    lines.push('');

    // 判斷節點是否是噪音（不含任何有意義的文字或媒體）
    function isNoise(el) {
      const tag = el.tagName.toLowerCase();
      if (['script','style','noscript','svg','path'].includes(tag)) return true;
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const hasSrc = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data-video-url');
      return !text && !hasSrc;
    }

    // 是否是葉節點（沒有有意義的子元素）
    function isLeaf(el) {
      const meaningfulChildren = [...el.children].filter(c => !isNoise(c));
      return meaningfulChildren.length === 0;
    }

    // 取葉節點的值
    function getLeafValue(el) {
      const src = el.getAttribute('src') || el.querySelector('img')?.getAttribute('src') || '';
      const href = el.getAttribute('href') || '';
      const videoSrc = el.getAttribute('data-video-url') || el.querySelector('video')?.getAttribute('src') || '';
      if (videoSrc) return `[video] ${videoSrc}`;
      if (src && el.tagName === 'IMG') return `[img] ${src}`;
      if (href) return `[link] ${href}`;
      const offscreen = el.querySelector('.a-offscreen');
      if (offscreen) return offscreen.textContent.replace(/\s+/g, ' ').trim();
      return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    // 生成相對於 root 的選擇器
    function relSel(el) {
      const parts = [];
      let cur = el;
      while (cur && cur !== root) {
        let seg = cur.tagName.toLowerCase();
        if (cur.id) seg = `#${cur.id}`;
        else {
          const dataHook = cur.getAttribute('data-hook');
          if (dataHook) seg = `[data-hook="${dataHook}"]`;
          else {
            const cls = [...cur.classList].filter(c =>
              !c.match(/^(a-size|a-color|a-spacing|a-section|a-row|a-col|a-padding|a-margin|a-text|a-align|a-float|a-expander|a-truncate|a-hidden|a-visible|__sd_)/)
            ).slice(0, 2);
            if (cls.length) seg = cur.tagName.toLowerCase() + cls.map(c => `.${c}`).join('');
          }
        }
        parts.unshift(seg);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    // 識別重複兄弟組
    function groupKey(el) {
      const tag = el.tagName.toLowerCase();
      const cls = [...el.classList].filter(c => !c.match(/^__sd_/)).slice(0, 3).join('.');
      const hook = el.getAttribute('data-hook') || '';
      return `${tag}.${cls}[${hook}]`;
    }

    function walk(el, depth) {
      if (depth > 8) return;
      const indent = '  '.repeat(depth);
      const children = [...el.children].filter(c => !isNoise(c));

      // 把子元素按 groupKey 分組，找出重複的
      const groups = new Map();
      for (const child of children) {
        const key = groupKey(child);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(child);
      }

      const seen = new Set();
      for (const child of children) {
        const key = groupKey(child);
        const group = groups.get(key);

        if (group.length > 1) {
          // 重複組：只展開第一個作範例
          if (!seen.has(key)) {
            seen.add(key);
            lines.push(`${indent}── 重複組 [${group.length} 個]  ${buildShortSelector(child)}`);
            lines.push(`${indent}   範例 (第 1 個):`);
            walk(child, depth + 2);
          }
        } else {
          // 唯一節點
          if (isLeaf(child)) {
            const val = getLeafValue(child);
            if (val && val.length > 0) {
              const display = val.length > 150 ? val.slice(0, 150) + '…' : val;
              lines.push(`${indent}${relSel(child)}  →  "${display}"`);
            }
          } else {
            lines.push(`${indent}${relSel(child)}`);
            walk(child, depth + 1);
          }
        }
      }
    }

    walk(root, 0);
    lines.push('');
    lines.push(`共掃描: ${root.querySelectorAll('*').length} 個元素`);
    return lines.join('\n');
  }

  function renderScanTab(report) {
    const container = document.getElementById('__sd_panel_scan__');
    if (!container) return;
    const v = getThemeVars();
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="color:${v.textMuted};font-size:11px">點擊容器元素後生成報告</span>
        <button class="sd-copy-btn" id="__sd_scan_copy__" style="font-size:11px;padding:3px 10px">複製全部</button>
      </div>
      <pre id="__sd_scan_pre__" style="
        background:${v.bgInput};border:1px solid ${v.border};border-radius:4px;
        padding:8px;font-size:10px;line-height:1.6;white-space:pre-wrap;word-break:break-all;
        color:${v.valueClr};margin:0;max-height:calc(100vh - 160px);overflow-y:auto;
      ">${report ? escHtml(report) : '尚無掃描結果'}</pre>
    `;
    const copyBtn = document.getElementById('__sd_scan_copy__');
    if (copyBtn && report) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(report).then(() => {
          copyBtn.textContent = '已複製 ✓';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = '複製全部'; copyBtn.classList.remove('copied'); }, 2000);
        });
      });
    }
  }

  // ── 高亮辅助 ──────────────────────────────────────────────────
  function clearHighlights(cls) {
    document.querySelectorAll(`.${cls}`).forEach(el => el.classList.remove(cls));
  }

  // ── 拾取模式事件 ──────────────────────────────────────────────
  function onMouseOver(e) {
    const panel = document.getElementById('__sd_panel__');
    if ((!pickMode && !scanMode) || !e.target || panel?.contains(e.target)) return;
    if (hoveredEl) hoveredEl.classList.remove('__sd_highlight__');
    hoveredEl = e.target;
    hoveredEl.classList.add('__sd_highlight__');
  }

  function onClick(e) {
    const panel = document.getElementById('__sd_panel__');
    if ((!pickMode && !scanMode) || panel?.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    if (hoveredEl) hoveredEl.classList.remove('__sd_highlight__');

    if (scanMode) {
      // 區域掃描模式：遞歸輸出容器下所有內容
      el.classList.add('__sd_captured__');
      setTimeout(() => el.classList.remove('__sd_captured__'), 2000);

      scanReport = scanRegion(el);
      renderScanTab(scanReport);
      switchTab('scan');

      // 掃描完自動退出掃描模式
      scanMode = false;
      const btn = document.getElementById('__sd_scan__');
      if (btn) { btn.textContent = '掃描區域'; btn.classList.remove('active'); }
      document.body.style.cursor = '';
      return;
    }

    // 普通拾取模式
    const candidates = buildCandidates(el);
    const values = extractValues(el);
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const topSel = candidates[0]?.selector || buildCssPath(el);

    const capture = { candidates, values, ts, el };
    captures.unshift(capture);

    history.push({ selector: topSel, value: values.offscreen || values.innerText || values.textContent, ts });

    el.classList.add('__sd_captured__');
    setTimeout(() => el.classList.remove('__sd_captured__'), 2000);

    renderCaptures();
    renderHistory();
    switchTab('capture');
  }

  // ── Tab 切换 ──────────────────────────────────────────────────
  function switchTab(name) {
    document.querySelectorAll('.sd-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.sd-tab-panel').forEach(p => p.classList.toggle('active', p.id === `__sd_panel_${name}__`));
    if (name === 'test') {
      // 测试 Tab 清理高亮
      clearHighlights('__sd_hover_hl__');
    }
  }

  // ── HTML 转义 ─────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 初始化 ────────────────────────────────────────────────────
  function init() {
    injectStyle();

    const v = getThemeVars();
    const extraStyle = document.createElement('style');
    extraStyle.textContent = `
      .__sd_hover_hl__ { outline: 2px dashed ${v.warning} !important; outline-offset: 2px !important; background: rgba(250,140,22,0.08) !important; }
      .__sd_test_hl__ { outline: 2px solid ${v.accent} !important; outline-offset: 2px !important; background: rgba(91,94,219,0.08) !important; }
    `;
    document.head.appendChild(extraStyle);

    const panel = buildPanel();
    renderCaptures();
    renderHistory();
    initTestTab();

    // 拾取按钮
    document.getElementById('__sd_pick__').addEventListener('click', () => {
      pickMode = !pickMode;
      const btn = document.getElementById('__sd_pick__');
      btn.textContent = pickMode ? '停止拾取' : '拾取';
      btn.classList.toggle('active', pickMode);
      document.body.style.cursor = pickMode ? 'crosshair' : '';
      if (!pickMode && hoveredEl) {
        hoveredEl.classList.remove('__sd_highlight__');
        hoveredEl = null;
      }
    });

    // 掃描區域按鈕
    document.getElementById('__sd_scan__').addEventListener('click', () => {
      // 互斥：關閉拾取模式
      if (pickMode) {
        pickMode = false;
        const pickBtn = document.getElementById('__sd_pick__');
        if (pickBtn) { pickBtn.textContent = '拾取'; pickBtn.classList.remove('active'); }
      }
      scanMode = !scanMode;
      const btn = document.getElementById('__sd_scan__');
      btn.textContent = scanMode ? '取消掃描' : '掃描區域';
      btn.classList.toggle('active', scanMode);
      document.body.style.cursor = scanMode ? 'cell' : '';
      if (!scanMode && hoveredEl) {
        hoveredEl.classList.remove('__sd_highlight__');
        hoveredEl = null;
      }
    });

    // 清空
    document.getElementById('__sd_clear__').addEventListener('click', () => {
      captures.length = 0;
      renderCaptures();
    });

    // 折叠 / 展开
    function toggleCollapse() {
      const collapsed = panel.classList.toggle('collapsed');
      document.getElementById('__sd_collapse__').textContent = collapsed ? '▶' : '◀';
      document.body.style.marginRight = collapsed ? '28px' : '360px';
    }
    document.getElementById('__sd_collapse__').addEventListener('click', toggleCollapse);
    document.getElementById('__sd_expand_tab__').addEventListener('click', toggleCollapse);

    // ESC：拾取模式中取消拾取；已收起时展开
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (pickMode) {
        // 取消拾取模式
        pickMode = false;
        const btn = document.getElementById('__sd_pick__');
        if (btn) { btn.textContent = '拾取'; btn.classList.remove('active'); }
        document.body.style.cursor = '';
        if (hoveredEl) { hoveredEl.classList.remove('__sd_highlight__'); hoveredEl = null; }
      } else if (panel.classList.contains('collapsed')) {
        // 展开面板
        toggleCollapse();
      }
    }, true);

    // Tab 切换
    document.querySelectorAll('.sd-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        clearHighlights('__sd_hover_hl__');
        clearHighlights('__sd_test_hl__');
        switchTab(tab.dataset.tab);
      });
    });

    // 鼠标事件
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
  }

  // 等 DOM 就绪
  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  // 暴露给主进程用于获取捕获结果
  window.__SD_GET_CAPTURES__ = () => captures.map(c => ({
    topSelector: c.candidates[0]?.selector || '',
    candidates: c.candidates,
    values: c.values,
    ts: c.ts
  }));

})();
