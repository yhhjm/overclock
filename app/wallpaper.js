/* 壁纸库 —— Wallpaper Engine 项目 + 本地图片/视频
 * 数据流：/wall/scan 扫 Steam 库 → 卡片 → 「用它」写 localStorage['xcterm_wallpaper'] → mount() 铺 #wall 层
 * 只在走本地服务（启动.cmd）时可用；纯 file:// 下给提示并只认 assets/wallpaper/ 里的本地文件。
 */
(() => {
  'use strict';
  const KEY = 'xcterm_wallpaper';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const online = () => location.protocol !== 'file:';

  /* ---------------- 当前壁纸 ---------------- */
  const cur = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const setCur = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) { /* 存不下就算了 */ } };

  function mount() {
    const c = cur();
    let layer = $('#wall');
    if (!c || !c.src) {
      if (layer) layer.remove();
      document.documentElement.classList.remove('has-wall');
      return;
    }
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'wall';
      (document.body || document.documentElement).prepend(layer);
    }
    layer.innerHTML = c.kind === 'video'
      ? `<video id="wall-v" src="${esc(c.src)}" autoplay muted loop playsinline></video>`
      : `<img id="wall-i" src="${esc(c.src)}" alt="">`;
    document.documentElement.classList.add('has-wall');
    const v = $('#wall-v');
    if (v) v.addEventListener('error', () => { layer.innerHTML = `<div class="wall-fail">壁纸文件不见了：${esc(c.name || '')}</div>`; });
  }

  function apply(cfg) {
    setCur(cfg);
    mount();
    if (window.Motion && window.Motion.reapply) window.Motion.reapply();
    return cfg;
  }

  /* ---------------- 面板 ---------------- */
  let S = null;
  const blank = () => ({ items: [], q: '', busy: false, msg: '', dirPath: '', dirs: [], browsing: false, ms: 0 });

  async function scan(dir) {
    if (S.busy) return;              /* 一次只跑一个，别让两次扫描抢连接 */
    S.busy = true; S.msg = '正在识别…';
    paint();
    /* 偶发的网络抖动不该让用户以为功能坏了：60s 超时 + 自动重试一次 + 把错误说人话 */
    const once = () => {
      const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
      const timer = ctl && setTimeout(() => ctl.abort(), 60000);
      return fetch('/wall/scan' + (dir ? '?dir=' + encodeURIComponent(dir) : ''),
        { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then(async r => {
          const j = await r.json();
          if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
          return j;
        })
        .finally(() => { if (timer) clearTimeout(timer); });
    };
    let j = null, err = null;
    for (let i = 0; i < 2 && !j; i++) { try { j = await once(); } catch (e) { err = e; } }
    if (j) {
      S.items = j.items || [];
      S.ms = j.ms || 0;
      S.counts = j.counts || {};
      S.msg = '';
    } else {
      S.items = [];
      const m = String((err && err.message) || err || '');
      S.msg = /fetch|abort|network|load failed/i.test(m)
        ? '本地服务没答话（' + m + '）—— 壁纸识别要靠「启动.cmd」或超频.exe 起的本地服务；确认是从那两个打开的，再点「刷新识别」。'
        : '扫不到：' + m;
    }
    S.busy = false;
    paint();
  }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    if (!q) return S.items;
    return S.items.filter(x => (x.title + ' ' + x.projectType + ' ' + x.source + ' ' + x.workshopId).toLowerCase().indexOf(q) >= 0);
  }

  function rawURL(abs) { return '/wall/raw?p=' + encodeURIComponent(abs); }

  function paint() {
    const box = $('#wp-panel');
    if (!box) return;
    const list = filtered();
    const c = cur();
    const counts = S.counts || {};
    box.innerHTML = `
      <div class="wp-head">
        <div>
          <div class="mi-insight-kicker">LOCAL WALLPAPER LIBRARY</div>
          <div class="wp-title">壁纸库</div>
          <div class="wp-sub">扫 Steam 创意工坊与本地 Wallpaper Engine 项目（只读 project.json 元数据，不解包几十 GB 素材），也能直接导入自己的图片 / 视频。</div>
        </div>
        <button class="wp-x" id="wp-close">✕</button>
      </div>
      <div class="wp-bar">
        <input id="wp-q" class="wp-q" placeholder="搜索壁纸名称 / 类型 / 来源" value="${esc(S.q)}">
        <button class="btn sm" id="wp-rescan" ${S.busy ? 'disabled' : ''}>${S.busy ? '识别中…' : '🔄 刷新识别'}</button>
        <button class="btn sm" id="wp-dir">📁 导入目录</button>
        <button class="btn sm" id="wp-file">🖼 导入本地文件</button>
        <input type="file" id="wp-file-in" accept="image/*,video/*" hidden>
        ${c ? `<button class="btn sm pri" id="wp-clear">还原默认背景</button>` : ''}
      </div>
      <div class="wp-stats">${S.msg ? esc(S.msg)
        : `已识别 ${list.length} 个项目 · ${counts.video || 0} 个媒体动态 · ${counts.scene || 0} 个 Scene${S.ms ? ' · 用时 ' + S.ms + 'ms' : ''}${S.q ? '（已按「' + esc(S.q) + '」筛选）' : ''}`}</div>
      ${S.browsing ? dirHTML() : ''}
      <div class="wp-grid">${list.map(cardHTML).join('') || '<div class="wp-empty">没识别到壁纸项目。点「导入目录」选一个目录，或直接「导入本地文件」。</div>'}</div>`;

    $('#wp-close').onclick = close;
    $('#wp-rescan').onclick = () => scan(S.dirPath || '');
    $('#wp-dir').onclick = () => { S.browsing = !S.browsing; if (S.browsing) browse(S.dirPath || ''); else paint(); };
    $('#wp-file').onclick = () => $('#wp-file-in').click();
    $('#wp-file-in').onchange = ev => importLocal(ev.target.files && ev.target.files[0]);
    const cl = $('#wp-clear');
    if (cl) cl.onclick = () => { apply(null); paint(); };
    const q = $('#wp-q');
    q.oninput = e => { S.q = e.target.value; const at = e.target.selectionStart; paint(); const n = $('#wp-q'); if (n) { n.focus(); n.setSelectionRange(at, at); } };

    $$('#wp-panel [data-wp-use]').forEach(b => b.onclick = () => {
      const it = S.items.find(x => x.id === b.dataset.wpUse);
      if (!it) return;
      const src = it.playable ? rawURL(it.media) : (it.hasPreview ? rawURL(it.preview) : '');
      if (!src) { S.msg = '这个项目只有元数据，没有可直接播放的媒体或预览图'; paint(); return; }
      apply({ kind: it.playable ? it.mediaType : 'image', src, name: it.title, from: it.source });
      paint();
    });
    $$('#wp-panel [data-wp-browse]').forEach(b => b.onclick = () => browse(b.dataset.wpBrowse));
    $$('#wp-panel [data-wp-here]').forEach(b => b.onclick = () => { S.dirPath = b.dataset.wpHere; S.browsing = false; scan(S.dirPath); });
    lazyThumbs(box);
  }

  /* ★缩略图按需加载（用户 m05778 挑的第 7 条）：
     79 张卡同时要预览图，就算 loading=lazy 浏览器也会先拉一大片；
     改成 IntersectionObserver 才给 src，只拉屏幕附近那几张。 */
  function lazyThumbs(root) {
    const imgs = $$('img[data-src]', root);
    if (!imgs.length) return;
    const put = im => { if (im.dataset.src) { im.src = im.dataset.src; im.removeAttribute('data-src'); } };
    if (!('IntersectionObserver' in window)) { imgs.forEach(put); return; }
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); put(e.target); } });
    }, { rootMargin: '320px 0px' });
    imgs.forEach(i => io.observe(i));
  }

  const cardHTML = it => {
    const c = cur();
    const on = c && c.name === it.title;
    /* 缩略图：预览图优先。没有预览图才用媒体本体，而且必须 preload=none ——
       <video> 不加它会去把整个文件拉回来，158 张卡就是上百 MB，连接池直接打满。 */
    const thumb = it.hasPreview
      ? `<img data-src="${rawURL(it.preview)}" alt="" decoding="async">`
      : (it.playable && it.mediaType === 'video'
          ? `<video src="${rawURL(it.media)}" muted playsinline preload="none"></video>`
          : '');
    return `<div class="wp-card${on ? ' on' : ''}">
      <div class="wp-thumb">${thumb}<div class="wp-kind">${it.playable ? (it.mediaType === 'video' ? '视频' : '图片') : (it.projectType === 'scene' ? 'Scene · 仅预览图' : '仅预览图')}</div></div>
      <div class="wp-name">${esc(it.title)}</div>
      <div class="wp-src">${esc(it.source)}${it.workshopId ? ' · ' + esc(it.workshopId) : ''}</div>
      <div class="wp-acts"><button class="btn sm pri" data-wp-use="${esc(it.id)}">🎯 用它</button></div>
    </div>`;
  };

  const dirHTML = () => `<div class="wp-dir">
    <div class="mi-insight-kicker">FOLDER · 选一个装壁纸的目录</div>
    <div class="wp-dir-list">
      ${(S.dirs || []).map(d => `<button class="wp-dir-row" data-wp-browse="${esc(d.path)}">📁 ${esc(d.name)}</button>`).join('') || '<div class="wp-empty">这个目录下没有子目录</div>'}
    </div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn sm pri" data-wp-here="${esc(S.dirPath)}">✔ 就扫这个目录</button>
      <span class="dim" style="font-size:11px">${esc(S.dirPath || '我的电脑')}</span>
    </div>
  </div>`;

  async function browse(path) {
    S.browsing = true; S.dirPath = path || '';
    try {
      const j = await (await fetch('/wall/dir?p=' + encodeURIComponent(path || ''), { cache: 'no-store' })).json();
      S.dirs = j.dirs || [];
      if (j.path) S.dirPath = j.path;
    } catch (e) {
      S.dirs = []; S.msg = '读不了目录：' + (e && e.message || e);
    }
    paint();
  }

  async function importLocal(file) {
    if (!file) return;
    if (!online()) { S.msg = '导入本地文件需要走「启动.cmd」的本地服务'; paint(); return; }
    S.busy = true; S.msg = '正在导入 ' + file.name + '…'; paint();
    try {
      const buf = await file.arrayBuffer();
      const ext = (/\.[a-z0-9]{2,5}$/i.exec(file.name) || ['.png'])[0].toLowerCase();
      const r = await fetch('/wall/save?ext=' + encodeURIComponent(ext), { method: 'POST', body: buf });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || r.status);
      apply({ kind: j.kind, src: j.url, name: file.name, from: '本地文件' });
      S.msg = '';
    } catch (e) {
      S.msg = '导入失败：' + (e && e.message || e);
    }
    S.busy = false;
    paint();
  }

  function open() {
    if ($('#wp-panel')) return;
    S = blank();
    const ov = document.createElement('div');
    ov.id = 'wp-panel';
    ov.className = 'wp-panel';
    document.body.appendChild(ov);
    if (!online()) {
      S.msg = '壁纸识别要走本地服务 —— 用「启动.cmd」打开就能扫 Steam 壁纸库';
      paint();
    } else {
      scan('');
    }
  }

  function close() {
    const ov = $('#wp-panel');
    if (ov) ov.remove();
    S = null;
  }

  window.Wallpaper = { open, close, mount, apply, current: cur };

  /* 页面一进来就把上次选的壁纸铺上 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
