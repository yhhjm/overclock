/* ================= 题面批注 + 草稿纸 v3 =================
   独立模块，不动 app.js：
   ① 题面批注（主）：按 ✏️ / D 键 → 直接在题目卡片上画（黑笔/红笔/荧光笔/橡皮），
      用来圈重点数据、划材料；再按 D 锁定 → 笔迹保留但鼠标穿透，可正常点选项/翻页
   ② 草稿纸面板：按工具条「📝 草稿纸」/ G 键 → 可拖动、可拉伸的独立草稿本（做计算）
   两者都按“当前这道题”分别保存（localStorage: xcterm_scratch_v1），换题自动切换
   实现：画布作为题目卡片内部的绝对定位子元素（跟着卡片走，滚动/换题都不用重定位）
   ========================================================= */
(function () {
  const LS_KEY = 'xcterm_scratch_v1';
  const LS_POS = 'xcterm_scratch_pos_v1';
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  /* ---------- 存储 ---------- */
  let STORE = {};
  try { STORE = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { STORE = {}; }
  let saveTimer = null, dirty = false;
  function saveSoon() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
  function saveNow() {
    if (!dirty) return;
    dirty = false;
    try {
      const keys = Object.keys(STORE);
      if (keys.length > 400) {                       // 太多了先丢最旧的
        keys.sort((a, b) => (STORE[a].t || 0) - (STORE[b].t || 0));
        keys.slice(0, keys.length - 400).forEach(k => delete STORE[k]);
      }
      localStorage.setItem(LS_KEY, JSON.stringify(STORE));
    } catch (e) { /* 存储满就算了，不打断做题 */ }
  }
  window.addEventListener('beforeunload', saveNow);

  /* ---------- 当前题目的 key ---------- */
  function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function subjectKey() {
    const el = document.querySelector('.qbody') || document.querySelector('.qstem') || document.querySelector('#flip .bigword') || document.querySelector('.qdetail');
    const t = el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    if (t) return 'q' + hash32(t.slice(0, 300));
    return 'v' + hash32((location.hash || '#/home').split('?')[0]);
  }
  let keyNow = null;
  function recOf(k) {
    if (!STORE[k]) STORE[k] = { t: Date.now(), s: [], m: [] };
    const r = STORE[k];
    if (!r.s) r.s = []; if (!r.m) r.m = [];
    return r;
  }
  function rec() { return recOf(keyNow || (keyNow = subjectKey())); }

  /* ---------- 画笔颜色 ---------- */
  function ink(c) {
    const cs = getComputedStyle(document.documentElement);
    if (c === 1) return (cs.getPropertyValue('--sc-ink2') || '#ff6f61').trim() || '#ff6f61';
    if (c === 2) return 'rgba(255,201,0,.95)';
    return (cs.getPropertyValue('--sc-ink') || '#f2ead8').trim() || '#f2ead8';
  }
  /* px=true：点是相对题目左上角的像素；false：点是 0~1 比例（草稿纸面板可拉伸）
     X/Y 收的是**标量**坐标（曾经写成收点数组、调用处传 pt[0]，得到 NaN → moveTo(NaN,NaN) → 什么都画不出来） */
  function paint(c2, s, cvEl, px) {
    if (!s || !s.p || !s.p.length) return;
    const W = cvEl.width, H = cvEl.height;
    const X = v => (px ? v * dpr : v * W), Y = v => (px ? v * dpr : v * H);
    c2.save();
    c2.lineCap = 'round'; c2.lineJoin = 'round';
    if (s.e) { c2.globalCompositeOperation = 'destination-out'; c2.strokeStyle = '#000'; c2.lineWidth = (px ? 22 : 18) * dpr; }
    else if (s.c === 2) { c2.globalCompositeOperation = 'source-over'; c2.strokeStyle = ink(2); c2.lineWidth = (px ? 13 : 12) * dpr; }
    else { c2.globalCompositeOperation = 'source-over'; c2.strokeStyle = ink(s.c); c2.lineWidth = (px ? 2.4 : 2.1) * dpr; }
    c2.beginPath();
    s.p.forEach((pt, i) => { const x = X(pt[0]), y = Y(pt[1]); i ? c2.lineTo(x, y) : c2.moveTo(x, y); });
    if (s.p.length === 1) c2.lineTo(X(s.p[0][0]) + 0.7, Y(s.p[0][1]) + 0.7);
    c2.stroke();
    c2.restore();
  }

  /* ---------- DOM：题目卡片右上角的按钮组（跟着题目走）+ 提示 ---------- */
  const rail = document.createElement('div');
  rail.className = 'sc-rail'; rail.id = 'sc-rail';
  rail.innerHTML = `
    <button class="sc-rb" id="sc-mark" title="在题目上圈画重点（按 D 开合）">✏️ 标记</button>
    <button class="sc-rb" id="sc-note" title="独立草稿纸（按 G 开合）">📝 草稿纸</button>
    <span class="sc-tools" id="sc-tools">
      <button class="sc-b" data-tool="pen" data-c="0" title="黑笔"><i class="sc-dot ink0"></i></button>
      <button class="sc-b" data-tool="pen" data-c="1" title="红笔"><i class="sc-dot ink1"></i></button>
      <button class="sc-b" data-tool="hl" data-c="2" title="荧光笔（划重点）"><i class="sc-dot ink2"></i></button>
      <button class="sc-b" data-tool="eraser" title="橡皮">橡皮</button>
      <span class="sc-sep"></span>
      <button class="sc-b" id="sc-undo" title="撤销（Ctrl+Z）">↶ 撤销</button>
      <button class="sc-b" id="sc-clear" title="清空本题标记">清空</button>
      <button class="sc-b" id="sc-hide" title="退出标记">✕</button>
    </span>`;

  const hint = document.createElement('div');
  hint.className = 'sc-hint'; hint.id = 'sc-hint';
  hint.innerHTML = '✏️ <b>标记中</b>：直接在题目上圈画重点数据 · 再按 <b>D</b> 锁定（锁定后仍可点选项）';

  const panel = document.createElement('div');
  panel.className = 'sc-panel'; panel.id = 'sc-panel';
  panel.innerHTML = `
    <div class="sc-bar" id="sc-bar">
      <b>📝 草稿纸</b>
      <button class="sc-b" data-tool="pen" data-c="0" title="黑笔"><i class="sc-dot ink0"></i>笔</button>
      <button class="sc-b" data-tool="pen" data-c="1" title="红笔"><i class="sc-dot ink1"></i>红笔</button>
      <button class="sc-b" data-tool="eraser" title="橡皮">橡皮</button>
      <span class="grow"></span>
      <button class="sc-b" id="sc-p-undo" title="撤销（Ctrl+Z）">撤销</button>
      <button class="sc-b" id="sc-p-clear" title="清空本题草稿">清空</button>
      <button class="sc-b" id="sc-p-close" title="收起">收起</button>
    </div>
    <div class="sc-wrap" id="sc-wrap"><canvas id="sc-canvas"></canvas></div>
    <div class="sc-foot">
      <span class="sc-tip" id="sc-tip">本题草稿另存，换题自动切换</span>
      <span class="grow"></span>
      <label class="sc-lbl">透明度<input type="range" id="sc-alpha" min="35" max="100" value="96"></label>
    </div>`;

  rail.appendChild(hint);            // 提示跟着题目右上角（第二行，右对齐）
  document.body.appendChild(panel);

  /* ---------- 草稿纸面板画布 ---------- */
  const wrap = panel.querySelector('#sc-wrap'), pcv = panel.querySelector('#sc-canvas'), pctx = pcv.getContext('2d');
  const tip = panel.querySelector('#sc-tip');
  let tool = 'pen', colorIdx = 0, cur = null, armed = false, host = null, mcv = null, mctx = null;

  function redrawP() { pctx.clearRect(0, 0, pcv.width, pcv.height); rec().s.forEach(s => paint(pctx, s, pcv, false)); }
  function redrawMk() {
    if (!mctx) return;
    mctx.clearRect(0, 0, mcv.width, mcv.height);
    rec().m.forEach(s => paint(mctx, s, mcv, true));
  }
  function redrawAll() { redrawMk(); redrawP(); }
  function updTips() {
    const r = rec(), n = r.m.length, m = r.s.length;
    if (host) host.classList.toggle('sc-has', n > 0);
    markBtn.title = n ? `在题目上圈画重点（本题已有 ${n} 笔）` : '在题目上圈画重点（按 D 开合）';
    tip.textContent = m ? `本题已有 ${m} 笔草稿` : '本题草稿另存，换题自动切换';
  }
  function loadKey() {
    const k = subjectKey();
    if (k === keyNow) return;
    saveNow();
    keyNow = k; recOf(k).t = Date.now();
    redrawAll(); updTips();
  }

  /* ---------- 题面批注画布：挂在题目卡片里 ---------- */
  function fitMark(force) {
    if (!host || !mcv || cur) return;
    const r = host.getBoundingClientRect();
    const W = Math.round(r.width), H = Math.round(r.height);
    if (W < 80 || H < 40) return;
    if (!force && mcv.width === Math.round(W * dpr) && mcv.height === Math.round(H * dpr)) return;
    mcv.width = Math.round(W * dpr); mcv.height = Math.round(H * dpr);
    mcv.style.width = W + 'px'; mcv.style.height = H + 'px';
    redrawMk();
  }
  function attach() {
    if (/^#\/(search|ask)/.test(location.hash)) { rail.style.display = 'none'; return; }
    const el = document.querySelector('#view .qcard') || document.querySelector('#view .mmnode');
    if (!el) { rail.style.display = 'none'; return; }
    rail.style.display = '';
    if (el !== host) {
      if (host) host.classList.remove('sc-has', 'sc-armed');
      host = el;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      mcv = el.querySelector(':scope > canvas.sc-markcv');
      if (!mcv) {
        mcv = document.createElement('canvas');
        mcv.className = 'sc-markcv' + (armed ? ' arm' : '');
        el.appendChild(mcv);
      }
      if (rail.parentNode !== el) el.appendChild(rail);   // 按钮组跟着题目卡片走
      mctx = mcv.getContext('2d');
      keyNow = null; loadKey(); fitMark(true); redrawMk(); updTips();
    }
    host.classList.toggle('sc-armed', armed);
    mcv.classList.toggle('arm', armed);
    fitMark();
  }

  /* ---------- 绘制交互 ---------- */
  function bind(cvEl, c2, which, px) {
    const posFn = e => {
      const r = cvEl.getBoundingClientRect();
      return px ? [e.clientX - r.left, e.clientY - r.top] : [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    cvEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { cvEl.setPointerCapture(e.pointerId); } catch (err) {}
      cur = { which, c: colorIdx, e: tool === 'eraser', p: [posFn(e)] };
      rec()[which].push(cur);
      paint(c2, cur, cvEl, px);
    });
    cvEl.addEventListener('pointermove', e => {
      if (!cur || cur.which !== which) return;
      const p = posFn(e), last = cur.p[cur.p.length - 1];
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < (px ? 1.2 : 0.0022)) return;
      cur.p.push(p); paint(c2, { ...cur, p: [last, p] }, cvEl, px);
    });
    const end = () => { if (cur && cur.which === which) { cur = null; saveSoon(); updTips(); } };
    cvEl.addEventListener('pointerup', end); cvEl.addEventListener('pointercancel', end); cvEl.addEventListener('pointerleave', end);
  }
  bind(pcv, pctx, 's', false);   // 草稿纸面板画布（节点不会被替换，直接绑）
  // 批注画布随卡片重建 → 用代理事件绑定（一次绑定到 document）
  document.addEventListener('pointerdown', e => {
    const c = e.target;
    if (!c.classList || !c.classList.contains('sc-markcv') || !armed) return;
    e.preventDefault();
    const r = c.getBoundingClientRect();
    try { c.setPointerCapture(e.pointerId); } catch (err) {}
    const c2 = c.getContext('2d');
    cur = { which: 'm', c: colorIdx, e: tool === 'eraser', p: [[e.clientX - r.left, e.clientY - r.top]], cv: c };
    rec().m.push(cur);
    paint(c2, cur, c, true);
  });
  document.addEventListener('pointermove', e => {
    if (!cur || cur.which !== 'm') return;
    const c = cur.cv; if (!c || !c.isConnected) return;
    const r = c.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top], last = cur.p[cur.p.length - 1];
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 1.2) return;
    cur.p.push(p); paint(c.getContext('2d'), { ...cur, p: [last, p] }, c, true);
  });
  const endMk = () => { if (cur && cur.which === 'm') { cur = null; saveSoon(); updTips(); } };
  document.addEventListener('pointerup', endMk);
  document.addEventListener('pointercancel', endMk);

  /* ---------- 工具 ---------- */
  const TOOL_BTNS = [...rail.querySelectorAll('[data-tool]'), ...panel.querySelectorAll('[data-tool]')];
  function setTool(t, c) {
    tool = t; colorIdx = +c || 0;
    TOOL_BTNS.forEach(b => {
      b.classList.toggle('on', b.dataset.tool === t && (+b.dataset.c || 0) === colorIdx);
    });
  }
  TOOL_BTNS.forEach(b => b.onclick = () => setTool(b.dataset.tool, b.dataset.c));
  setTool('pen', 0);

  rail.querySelector('#sc-undo').onclick = () => { const arr = (armed ? rec().m : (panel.classList.contains('on') ? rec().s : rec().m)); if (!arr.length) return; arr.pop(); saveSoon(); redrawAll(); updTips(); };
  rail.querySelector('#sc-clear').onclick = () => { const arr = (armed ? rec().m : (panel.classList.contains('on') ? rec().s : rec().m)); if (!arr.length) return; arr.length = 0; saveSoon(); redrawAll(); updTips(); };
  document.querySelector('#sc-p-undo').onclick = () => { const r = rec(); if (!r.s.length) return; r.s.pop(); saveSoon(); redrawP(); updTips(); };
  document.querySelector('#sc-p-clear').onclick = () => { const r = rec(); r.s.length = 0; saveSoon(); redrawP(); updTips(); };
  document.querySelector('#sc-p-close').onclick = () => note(false);
  rail.querySelector('#sc-hide').onclick = () => arm(false);
  panel.querySelector('#sc-alpha').oninput = e => panel.style.setProperty('--sc-bg-a', (e.target.value / 100).toFixed(2));
  panel.style.setProperty('--sc-bg-a', '0.96');

  /* ---------- 开关 ---------- */
  const markBtn = rail.querySelector('#sc-mark'), toolsBox = rail.querySelector('#sc-tools');
  function chrome() {
    const anyOn = armed || panel.classList.contains('on');
    toolsBox.classList.toggle('on', anyOn);          // 工具条就近展开在题目右上角
    markBtn.classList.toggle('on', armed);
    rail.classList.toggle('open', anyOn);
    hint.classList.toggle('on', armed);
    if (mcv) { mcv.classList.toggle('arm', armed); }
    if (host) host.classList.toggle('sc-armed', armed);
  }
  function arm(on) {
    armed = on == null ? !armed : !!on;
    if (armed) { attach(); loadKey(); fitMark(); redrawMk(); updTips(); } else saveNow();
    chrome();
  }
  function note(on) {
    const to = on == null ? !panel.classList.contains('on') : !!on;
    panel.classList.toggle('on', to);
    if (to) { loadKey(); fitPanel(); setTimeout(fitPanel, 60); } else saveNow();
    chrome();
  }
  markBtn.onclick = () => arm();
  rail.querySelector('#sc-note').onclick = () => note();

  /* ---------- 草稿纸面板 ---------- */
  function fitPanel() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    pcv.width = Math.round(r.width * dpr); pcv.height = Math.round(r.height * dpr);
    pcv.style.width = r.width + 'px'; pcv.style.height = r.height + 'px';
    redrawP();
  }
  try {
    const p = JSON.parse(localStorage.getItem(LS_POS) || 'null');
    if (p && p.w) {
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = (p.l || 'auto'); panel.style.top = (p.t || 'auto');
      panel.style.width = p.w + 'px'; panel.style.height = p.h + 'px';
    }
  } catch (e) {}
  if (window.ResizeObserver) new ResizeObserver(() => fitPanel()).observe(wrap);
  window.addEventListener('resize', () => { fitPanel(); redrawAll(); setTimeout(fitMark, 60); });

  (function drag() {
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
    const bar = panel.querySelector('#sc-bar');
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button,input')) return;
      on = true; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      panel.style.right = 'auto'; panel.style.bottom = 'auto'; panel.style.left = ox + 'px'; panel.style.top = oy + 'px';
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      panel.classList.add('moving');
    });
    bar.addEventListener('pointermove', e => {
      if (!on) return;
      panel.style.left = Math.max(0, Math.min(window.innerWidth - 120, ox + e.clientX - sx)) + 'px';
      panel.style.top = Math.max(0, Math.min(window.innerHeight - 60, oy + e.clientY - sy)) + 'px';
    });
    const stop = () => { if (!on) return; on = false; panel.classList.remove('moving'); try { localStorage.setItem(LS_POS, JSON.stringify({ l: panel.style.left, t: panel.style.top, w: panel.offsetWidth, h: panel.offsetHeight })); } catch (e) {} };
    bar.addEventListener('pointerup', stop); bar.addEventListener('pointercancel', stop);
  })();

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (!armed && !panel.classList.contains('on')) return;
      e.preventDefault(); e.stopPropagation();
      (armed ? rail.querySelector('#sc-undo') : document.querySelector('#sc-p-undo')).click();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'd') { if (!/^#\/(search|ask)/.test(location.hash)) { e.preventDefault(); arm(); } }
    else if (k === 'g') { if (!/^#\/(search|ask)/.test(location.hash)) { e.preventDefault(); note(); } }
  }, true);

  /* ---------- 跟随换题 ---------- */
  window.addEventListener('hashchange', () => setTimeout(() => { attach(); loadKey(); }, 80));
  setInterval(() => { attach(); loadKey(); }, 350);
  attach();
  chrome();

  /* ---------- 调试出口（自检用） ---------- */
  window.__sc = {
    get armed() { return armed; }, get key() { return keyNow; }, get host() { return host; }, get mcv() { return mcv; },
    get tool() { return tool; }, get color() { return colorIdx; },
    paint, rec, subjectKey, fitMark, redrawMk, arm, note
  };
})();
