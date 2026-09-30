/* ============================================================
   motion.js —— Mineradio 式交互动效的 JS 部分
   只做三件事：铺背景光斑、给内容加交错入场、数字滚动。
   不碰业务逻辑；view 的内容一律照旧由 app.js / fenbi-view.js 渲染。
   关掉动效：window.Motion.setEnabled(false) 或系统「减少动态效果」。
   ============================================================ */
(() => {
  'use strict';

  const KEY = 'xcterm_motion';
  const root = document.documentElement;

  const enabled = () => {
    try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
  };
  const applyFlag = () => root.classList.toggle('motion-off', !enabled());

  /* ---------- 背景呼吸光 ---------- */
  function injectBg() {
    if (document.getElementById('motion-bg')) return;
    const d = document.createElement('div');
    d.id = 'motion-bg';
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = '<i></i><i></i><i></i>';
    document.body.insertBefore(d, document.body.firstChild);
  }

  /* ---------- 粒子星场（Mineradio 式） ----------
     Mineradio 用 three.js 画一整套星河 / 歌词光粒 / 骷髅粒子，太重。
     这里用 canvas 2D 造同款观感：点阵在三层深度里缓慢自转，
     鼠标移动给一个视差偏转（Mineradio 用 0.055 ease），
     按住拖动则甩出角速度、每帧乘 0.90 阻尼衰减（它的 particleSpin 就是这个手感），
     彼此靠近的点牵一根很淡的线。 */
  const TONES = [[0, 245, 212], [36, 66, 255], [248, 244, 238]];   /* --tone-a/b/c */
  const P_COUNT = 150, P_BOX = 660, P_DAMP = 0.90;
  const pc = {
    el: null, ctx: null, pts: [], w: 0, h: 0, dpr: 1,
    raf: 0, last: 0, drift: 0,
    rot: { x: -0.10, y: 0.20 }, spin: { vx: 0, vy: 0 },
    ptr: { x: 0.5, y: 0.5 }, down: false, lx: 0, ly: 0, lt: 0
  };

  function pResize() {
    if (!pc.el) return;
    pc.dpr = Math.min(2, window.devicePixelRatio || 1);
    pc.w = window.innerWidth; pc.h = window.innerHeight;
    pc.el.width = Math.max(1, Math.round(pc.w * pc.dpr));
    pc.el.height = Math.max(1, Math.round(pc.h * pc.dpr));
    pc.el.style.width = pc.w + 'px';
    pc.el.style.height = pc.h + 'px';
    if (pc.ctx) pc.ctx.setTransform(pc.dpr, 0, 0, pc.dpr, 0, 0);
  }

  function pSeed() {
    pc.pts = [];
    for (let i = 0; i < P_COUNT; i++) {
      pc.pts.push({
        x: (Math.random() - 0.5) * P_BOX * 2,
        y: (Math.random() - 0.5) * P_BOX * 1.35,
        z: (Math.random() - 0.5) * P_BOX * 2,
        s: 0.7 + Math.random() * 2.2,
        c: TONES[i % TONES.length],
        tw: Math.random() * 6.2832, sp: 0.22 + Math.random() * 0.5
      });
    }
  }

  /* 画一帧粒子场。跟动画循环拆开，是为了让「同步画一帧」能单独调用 ——
     窗口不可见时 Chrome 会把 rAF 停掉（document.hidden 也是 true），
     那种情况永远等不到一帧，断言就拿不到像素。 */
  function pDraw(k) {
    const cx = pc.w / 2, cy = pc.h / 2, cam = 960;
    const fov = Math.min(pc.w, pc.h) * 0.86;
    const cosX = Math.cos(pc.rot.x), sinX = Math.sin(pc.rot.x);
    const cosY = Math.cos(pc.rot.y), sinY = Math.sin(pc.rot.y);
    const ctx = pc.ctx;
    ctx.clearRect(0, 0, pc.w, pc.h);

    const proj = [];
    for (let i = 0; i < pc.pts.length; i++) {
      const p = pc.pts[i];
      let x = p.x * cosY - p.z * sinY;
      let z = p.x * sinY + p.z * cosY;
      let y = p.y * cosX - z * sinX;
      z = p.y * sinX + z * cosX;
      const depth = cam + z;
      if (depth < 80) continue;
      const kk = fov / depth;
      proj.push({ X: cx + x * kk, Y: cy + y * kk, k: kk, p });
    }

    /* 连线：只牵很近的，最多 90 根 */
    ctx.lineWidth = 1;
    let links = 0;
    for (let i = 0; i < proj.length && links < 90; i++) {
      const a = proj[i];
      for (let j = i + 1; j < proj.length && links < 90; j++) {
        const b = proj[j];
        const dx = a.X - b.X, dy = a.Y - b.Y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 10201) continue;
        const al = (1 - Math.sqrt(d2) / 101) * 0.22 * Math.min(a.k, b.k);
        if (al < 0.012) continue;
        ctx.strokeStyle = 'rgba(0,245,212,' + al.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke();
        links++;
      }
    }

    for (let i = 0; i < proj.length; i++) {
      const q = proj[i], p = q.p;
      p.tw += p.sp * 0.02 * k;
      const tw = 0.72 + 0.28 * Math.sin(p.tw);
      const r = Math.max(0.35, p.s * q.k * 1.2);
      const al = Math.min(0.92, (0.16 + 0.76 * q.k) * tw);
      const c = p.c;
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(q.X, q.Y, r, 0, 6.2832); ctx.fill();
    }

  }

  function pFrame(now) {
    pc.raf = 0;
    if (!pc.ctx) return;
    const dt = Math.min(50, now - (pc.last || now));
    pc.last = now;
    const k = Math.min(3, dt / 16.667);

    /* 鼠标视差 ease + 甩动角速度 + 阻尼衰减 */
    pc.drift += 0.00040 * k;
    const tgtY = pc.drift + (pc.ptr.x - 0.5) * 0.62;
    const tgtX = -0.10 + (pc.ptr.y - 0.5) * -0.42;
    pc.rot.y += (tgtY - pc.rot.y) * 0.055 * k + pc.spin.vy * k;
    pc.rot.x += (tgtX - pc.rot.x) * 0.055 * k + pc.spin.vx * k;
    const damp = Math.pow(P_DAMP, k);
    pc.spin.vx *= damp; pc.spin.vy *= damp;
    if (Math.abs(pc.spin.vx) < 1e-4) pc.spin.vx = 0;
    if (Math.abs(pc.spin.vy) < 1e-4) pc.spin.vy = 0;

    pDraw(k);

    if (document.hidden) { pc.last = 0; return; }
    pc.raf = requestAnimationFrame(pFrame);
  }

  /** 同步画一帧粒子场（不走 rAF）—— 测试/排障用：
   *  窗口不可见时 Chrome 会把 rAF 停掉，那种环境永远等不到一帧，断言会误判成「没画」。 */
  function paintParticlesOnce() {
    if (!pc.ctx || !enabled()) return false;
    if (!pc.pts || !pc.pts.length) { pResize(); pSeed(); }
    pDraw(1);
    return true;
  }

  function pStart() {
    if (pc.raf || !pc.ctx || !enabled() || document.hidden) return;
    pc.last = 0;
    pc.raf = requestAnimationFrame(pFrame);
  }
  function pStop() {
    if (pc.raf) cancelAnimationFrame(pc.raf);
    pc.raf = 0;
    if (pc.ctx) pc.ctx.clearRect(0, 0, pc.w, pc.h);
  }

  function injectParticles() {
    if (pc.el || !document.body) return;
    const c = document.createElement('canvas');
    c.id = 'motion-particles';
    c.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(c, document.body.firstChild);
    pc.el = c;
    pc.ctx = c.getContext('2d');
    if (!pc.ctx) return;
    pResize();
    pSeed();

    window.addEventListener('resize', pResize, { passive: true });
    window.addEventListener('pointermove', e => {
      pc.ptr.x = e.clientX / Math.max(1, pc.w);
      pc.ptr.y = e.clientY / Math.max(1, pc.h);
      if (!pc.down) return;
      const t = Date.now();
      if (pc.lt) {
        const dt = Math.max(8, t - pc.lt);
        pc.spin.vy = Math.max(-0.05, Math.min(0.05, (e.clientX - pc.lx) / dt * 0.0070));
        pc.spin.vx = Math.max(-0.05, Math.min(0.05, (e.clientY - pc.ly) / dt * 0.0070));
      }
      pc.lx = e.clientX; pc.ly = e.clientY; pc.lt = t;
    }, { passive: true });
    const endDrag = () => { pc.down = false; pc.lt = 0; };
    window.addEventListener('pointerdown', e => {
      pc.down = true; pc.lx = e.clientX; pc.ly = e.clientY; pc.lt = Date.now();
    }, { passive: true });
    window.addEventListener('pointerup', endDrag, { passive: true });
    window.addEventListener('pointercancel', endDrag, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pStop(); else pStart();
    });
    pStart();
  }

  function pSync() {
    if (!pc.el) return;
    if (enabled() && !document.hidden) pStart(); else pStop();
  }

  /* ---------- 交错入场：给每一层内容排个先后 ----------
     不吃 scope —— 一律扫文档里的 .page，避免「在 #view 里查 #view .page」这种
     作用域歧义（那样第一层子元素可能拿不到 --i）。 */
  function stagger() {
    const roots = document.querySelectorAll('#view .page');
    for (const host of roots) {
      const seen = new Set();
      [...host.children].forEach((el, i) => {
        seen.add(el);
        if (el.style) el.style.setProperty('--i', String(Math.min(i, 12)));
      });
      host.querySelectorAll('.card, .stat, .qcard, .opt').forEach((el, i) => {
        if (seen.has(el) || !el.style) return;
        el.style.setProperty('--i', String(Math.min(i % 9, 9)));
      });
    }
  }

  /* ---------- 结算画面的「爆开」：一次性粒子，画完就散 ----------
     跟常驻星场分开一层画布，免得把 pc.pts 的 3D 投影搞乱。
     动效关着 / 系统要求减少动态 就不放（尊重设置）。 */
  function burst(opts) {
    const o = opts || {};
    const N = o.count || 96;
    const cx = o.x != null ? o.x : (window.innerWidth || 1) / 2;
    const cy = o.y != null ? o.y : (window.innerHeight || 1) / 2;
    if (!enabled() || document.hidden) return false;
    let c = document.getElementById('motion-burst');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'motion-burst';
      c.setAttribute('aria-hidden', 'true');
      document.body.appendChild(c);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tones = o.tones || TONES;
    const pts = [];
    const spread = o.spread || 1;
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * 2 * i) / N + Math.random() * 0.32;
      const sp = (2.2 + Math.random() * 8.4) * spread;
      pts.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.1,
        r: 1.2 + Math.random() * 3.6,
        tone: tones[i % tones.length],
        life: 1, decay: 0.010 + Math.random() * 0.012,
      });
    }
    const t0 = Date.now(), DUR = 1400;
    let raf = 0;
    const frame = () => {
      raf = 0;
      const done = Date.now() - t0 > DUR;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.955; p.vy = p.vy * 0.955 + 0.16;   // 重力，往下掉一点更像「爆开」
        p.life -= p.decay;
        if (p.life <= 0) continue;
        const t = p.tone;
        ctx.globalAlpha = Math.max(0, p.life) * 0.92;
        ctx.fillStyle = 'rgb(' + t[0] + ',' + t[1] + ',' + t[2] + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.45 + p.life * 0.75), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!done) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return true;
  }

  /* ---------- 数字滚动：统计卡里的数字从 0 走到目标值 ---------- */
  function countUp(scope) {
    if (!scope || !scope.querySelectorAll) return;
    const nodes = scope.querySelectorAll('.stat .v, .mnum, [data-countup]');
    nodes.forEach(el => {
      if (el.__mcounted) return;
      const raw = (el.textContent || '').trim();
      const m = /^([+-]?[\d.]+)([^]*)$/.exec(raw);
      if (!m) return;
      const to = parseFloat(m[1]);
      if (!isFinite(to) || to === 0) return;
      const suffix = m[2] || '';
      const dec = (m[1].split('.')[1] || '').length;
      el.__mcounted = true;
      const dur = 760, t0 = Date.now();
      /* ★用 setTimeout 而不是 requestAnimationFrame —— 窗口在后台时 rAF 会停，
         数字就永远停在 0% 上不动。 */
      const tick = () => {
        const k = Math.min(1, (Date.now() - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);          /* easeOutCubic */
        el.textContent = (to * e).toFixed(dec) + suffix;
        if (k < 1) setTimeout(tick, 20);
        else el.textContent = raw;
      };
      setTimeout(tick, 20);
    });
  }

  function reapply(scope) {
    if (!enabled()) return;
    try { stagger(); countUp(scope || document); } catch { /* 动效坏了不影响使用 */ }
  }

  window.Motion = {
    setEnabled(v) {
      try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { }
      applyFlag();
      pSync();
      if (v) reapply();
    },
    isEnabled: enabled,
    reapply,
    burst,
    /* 测试/排障用：同步画一帧粒子场，不依赖 rAF 跑没跑 */
    paintParticlesOnce
  };

  /* ---------- 启动 & 跟随视图变化 ---------- */
  let timer = 0;
  function scheduleCount() {
    /* 数字滚动可以晚一点，24ms 合流。★不用 requestAnimationFrame：
       窗口在后台时 rAF 不触发，pending 标志会永远卡住。 */
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      countUp(document.getElementById('view') || document);
    }, 24);
  }

  /* ★交错入场的 --i 必须赶在首帧之前打上：
     MutationObserver 回调是微任务，跑在 paint 前；一旦像下面那样 setTimeout 晚 24ms，
     元素已经用 --i:0 开播了动画，再改 --i 也追不回来。 */
  function onMutate() {
    try { stagger(); } catch { }
    scheduleCount();
  }

  function boot() {
    applyFlag();
    injectBg();
    injectParticles();
    reapply();

    const view = document.getElementById('view');
    if (view && typeof MutationObserver !== 'undefined') {
      /* 只看 childList —— 我们自己改 style/textContent 不会再触发，不会自激 */
      new MutationObserver(onMutate).observe(view, { childList: true, subtree: true });
    }
    window.addEventListener('hashchange', scheduleCount);
    /* 首屏的 splash 会挡住，等它走完再播一次 */
    setTimeout(scheduleCount, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
