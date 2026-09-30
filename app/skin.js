/* ============================================================
   skin.js —— 「皮肤 + 布局」自定义（Mineradio 那种玩家模式）
   只做这几样：配色 / 字号 / 模块开关 / 导航排序 / 背景。
   全部存 localStorage['xcterm_skin']，随时可一键还原。
   与 app.css / motion.css 并列加载，靠 CSS 变量覆盖生效，不动老样式。
   ============================================================ */
(() => {
  'use strict';

  const KEY = 'xcterm_skin';

  /* ---------------- 配色预设：只覆盖 app.css 里那几个变量 ---------------- */
  const SANS = '"Noto Sans SC","PingFang SC","HarmonyOS Sans SC","Alibaba PuHuiTi","Inter",-apple-system,BlinkMacSystemFont,system-ui,sans-serif';
  const THEMES = [
    {
      /* 数值全部照抄 Mineradio public/css/index.css 的 :root 令牌（见 fenbi-sync\mineradio-home.css）：
         --fc-bg:#08090B --fc-paper:#0E1014 --fc-ink:#E8ECEF --fc-ink-2:#D2D7DC --fc-muted:#8A9099
         --glass-border-soft:rgba(255,255,255,.095) --home-accent:#00f5d4 --champagne:#f4d28a
         --champagne-deep:#9a6f2c --source-qishui:#45d68f --source-netease:#d95b67 */
      id: 'mineradio', name: 'Mineradio', desc: '近黑 + 青光，Mineradio 原版',
      vars: {
        '--bg': '#08090B', '--panel': '#0E1014', '--panel-2': '#14171C',
        '--line': 'rgba(255,255,255,.095)', '--line-2': 'rgba(255,255,255,.055)',
        '--txt': '#E8ECEF', '--txt-2': '#D2D7DC', '--txt-3': '#8A9099',
        '--brand': '#00f5d4', '--brand-2': '#7ff0dc', '--brand-soft': 'rgba(0,245,212,.13)',
        '--gold': '#f4d28a', '--gold-2': '#f7dca6', '--gold-deep': '#9a6f2c',
        '--ok': '#45d68f', '--ok-soft': 'rgba(69,214,143,.13)', '--warn': '#e0a04a', '--bad': '#d95b67', '--bad-soft': 'rgba(217,91,103,.13)',
        '--font-sans': SANS, '--font-display': SANS
      }
    },
    {
      id: 'gold', name: '暗棕金', desc: '原来的配色',
      vars: { '--bg': '#281b1d', '--panel': '#372628', '--panel-2': '#443033', '--line': 'rgba(201,162,75,.22)', '--line-2': 'rgba(201,162,75,.12)', '--txt': '#f2ead8', '--txt-2': '#c8bda4', '--txt-3': '#a89c80', '--brand': '#c9a24b', '--brand-2': '#e8c86a', '--brand-soft': 'rgba(201,162,75,.12)', '--gold': '#c9a24b', '--gold-2': '#e8c86a', '--gold-deep': '#a3773a', '--font-sans': SANS, '--font-display': '"Songti SC","STSong","SimSun","Noto Serif SC",Georgia,serif' }
    },
    {
      id: 'ocean', name: '深海蓝', desc: '冷静的靛蓝',
      vars: { '--bg': '#101822', '--panel': '#18232f', '--panel-2': '#202f3e', '--line': 'rgba(122,178,255,.22)', '--line-2': 'rgba(122,178,255,.12)', '--txt': '#e7f0fa', '--txt-2': '#b3c4d4', '--txt-3': '#8798a8', '--brand': '#5aa2e8', '--brand-2': '#8cc4ff', '--brand-soft': 'rgba(90,162,232,.14)', '--gold': '#5aa2e8', '--gold-2': '#8cc4ff', '--gold-deep': '#3b6f9e' }
    },
    {
      id: 'forest', name: '墨玉绿', desc: '护眼的低饱和',
      vars: { '--bg': '#121a16', '--panel': '#1a2620', '--panel-2': '#22322a', '--line': 'rgba(120,200,160,.22)', '--line-2': 'rgba(120,200,160,.12)', '--txt': '#e6f2ea', '--txt-2': '#b0c4b8', '--txt-3': '#84968b', '--brand': '#6fbf92', '--brand-2': '#93dcb2', '--brand-soft': 'rgba(111,191,146,.14)', '--gold': '#6fbf92', '--gold-2': '#93dcb2', '--gold-deep': '#438061' }
    },
    {
      id: 'plum', name: '绛紫', desc: '夜间阅读',
      vars: { '--bg': '#1a1220', '--panel': '#241a2c', '--panel-2': '#2e2238', '--line': 'rgba(198,132,220,.22)', '--line-2': 'rgba(198,132,220,.12)', '--txt': '#f2e9f7', '--txt-2': '#c6b6ce', '--txt-3': '#97879f', '--brand': '#b268d0', '--brand-2': '#d295ea', '--brand-soft': 'rgba(178,104,208,.14)', '--gold': '#b268d0', '--gold-2': '#d295ea', '--gold-deep': '#7c4494' }
    },
    {
      id: 'noir', name: '纯黑', desc: '最省眼、最沉浸',
      vars: { '--bg': '#0a0a0b', '--panel': '#141416', '--panel-2': '#1c1c1f', '--line': 'rgba(255,255,255,.14)', '--line-2': 'rgba(255,255,255,.08)', '--txt': '#f0f0f2', '--txt-2': '#b6b6bc', '--txt-3': '#83838a', '--brand': '#d8d8dc', '--brand-2': '#ffffff', '--brand-soft': 'rgba(255,255,255,.10)', '--gold': '#d8d8dc', '--gold-2': '#ffffff', '--gold-deep': '#8a8a90' }
    },
    {
      id: 'paper', name: '素纸', desc: '白天模式',
      vars: { '--bg': '#f6f2ea', '--panel': '#fffdf8', '--panel-2': '#f0e9dc', '--line': 'rgba(120,92,40,.20)', '--line-2': 'rgba(120,92,40,.11)', '--txt': '#2b2118', '--txt-2': '#5d4c38', '--txt-3': '#8a7658',
        /* ★--brand 从 #a3773a 调深到 #8f6731（用户 m06726「有些配色看不清字」）：主色按钮的浅字
           在 #a3773a 那端只有 3.7:1，调深后渐变两端都过 4.5:1（4.8 / 6.2） */
        '--brand': '#8f6731', '--brand-2': '#7c5622', '--brand-soft': 'rgba(143,103,49,.12)', '--gold': '#8f6731', '--gold-2': '#7c5622', '--gold-deep': '#6b4718' }
    }
  ];

  const BGS = [
    { id: 'glow', name: '呼吸光斑', desc: 'Mineradio 式缓慢漂移' },
    { id: 'flat', name: '纯色', desc: '最干净' },
    { id: 'gradient', name: '渐变', desc: '柔和的斜向渐变' },
    { id: 'image', name: '自定义图片', desc: '填一个图片地址' }
  ];

  const blank = () => ({
    theme: 'mineradio', fontScale: 1, bg: 'glow', bgImage: '', bgDim: 0.35, blur: 0, panelAlpha: 1, wallDim: 0,
    /* 做题区自适应（用户 m10717）：sideW 右侧栏宽 / readScale 题干区字号 / readFull 撑满一屏 / noSide 收起侧栏 */
    sideW: 322, readScale: 1, readFull: 0, noSide: 0,
    navOrder: ['fenbi', 'ai', 'local', 'settings'],
    tabOrder: ['point', 'wrong', 'fav', 'paper', 'hist'],
    hideTabs: [], hideModules: []
  });

  let S = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) S = Object.assign(blank(), JSON.parse(raw));
  } catch { }

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { } };

  /* 一次性迁移：老默认配色「暗棕金」→「Mineradio」（用户 m02640：「继续做的和 Mineradio 一样帅」）。
     想回去：设置 → 外观自定义 → 配色 → 点「暗棕金」，其它 5 套也都在。 */
  if (!S.__skinV2) {
    if (S.theme === 'gold') S.theme = 'mineradio';
    S.__skinV2 = 1;
    save();
  }

  /* ---------------- 应用：写进 <style id="skin-css"> ---------------- */
  function apply() {
    let el = document.getElementById('skin-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'skin-css';
      el.setAttribute('data-skin', '1');
      document.head.appendChild(el);
    }
    const th = THEMES.find(t => t.id === S.theme) || THEMES[0];
    /* ★字色反相（用户 m06726：「有些配色看不清字」）：主色按钮的字色必须跟它自己的底色反相，
       且按 **WCAG 对比度** 挑，不是拍脑袋定阈值。`.btn.pri` 的底是 `linear-gradient(135deg,var(--brand),var(--brand-2))`
       渐变，所以要按**两端里最差点**算：深字看最亮那端、浅字看最暗那端，哪个整体更稳用哪个。
       原来字色跟 --txt 走，实测 7 个配色里 5 个看不清字（纯黑 1.3:1 / Mineradio 1.2:1 / 墨玉绿 1.8:1 /
       暗棕金 1.9:1 / 深海蓝 2.3:1），改成按对比度挑之后全过 3.5:1，其中 6 个过 8:1。 */
    const lum = (hex) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
      if (!m) return 0;
      const n = parseInt(m[1], 16);
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
    };
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const l1 = lum(th.vars['--brand']), l2 = lum(th.vars['--brand-2']);
    const INK_DARK = '#0b0d10', INK_LIGHT = '#fff5f0';
    const cDark = ratio(Math.max(l1, l2), lum(INK_DARK));
    const cLight = ratio(Math.min(l1, l2), lum(INK_LIGHT));
    const brightBrand = cDark < cLight;
    const ink = brightBrand ? INK_LIGHT : INK_DARK;
    const halo = brightBrand ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.60)';

    /* ★面板透明度（用户 m06726：「透明度也要可以自己调整」）—— 只动 --panel / --panel-2，
       文字色不动，所以调透明不会把字调糊。 */
    const pa = Math.max(0.35, Math.min(1, Number(S.panelAlpha) || 1));
    const mixc = v => (pa >= 0.995 ? v : `color-mix(in srgb, ${v} ${Math.round(pa * 100)}%, transparent)`);

    /* ★阅读面不透明度地板（用户 m10717：「我把透明度调到最低时，做题目的时候根本看不清题」）。
       --panel / --panel-2 是**全局**一对：壳层（顶栏/导航/卡片）和**阅读面**（.qcard 题干卡、
       .opt 选项、.qdetail、.expl 解析、.qmat/.qfig 材料图、.side 答题卡栏、.sn 答题卡格子）
       共用一个值。滑杆拉到底 35% 时题干卡只有 35% 不透明，壁纸直接透穿 —— 字必糊。
       所以再导出一对**只给阅读面用**的变量：地板 0.88，滑杆 35% 也保底 88%；
       调到 100% 时两者相等，什么都不变。
       （备选方案是拆成「界面透明度 + 题目区不透明度」两个滑杆，最后选了地板 ——
        用户的原话是「根本看不清题」，要的是「不许调到看不见」，而不是让他自己再调一次。） */
    const pr = Math.max(0.88, pa);
    const mixr = v => (pr >= 0.995 ? v : `color-mix(in srgb, ${v} ${Math.round(pr * 100)}%, transparent)`);

    /* ★壁纸压暗：以前只有「背景=图片」时才有压暗滑杆，壁纸库（#wall）那一路完全没有压暗层，
       所以 35% 面板 + 亮壁纸 = 灾难。现在给壁纸也铺一层可调的压暗，并且跟透明度滑杆联动：
       面板越透，壁纸自动越暗（这是保底，用户自己的滑杆值只会更暗、不会被顶回去）。 */
    const dimFloor = Math.min(0.62, Math.max(0, (1 - pa) * 0.72));
    const wallDim = Math.max(Math.max(0, Math.min(0.85, Number(S.wallDim) || 0)), dimFloor);

    /* 加 !important 并把选择器铺到 body 与它的明暗类上 —— 否则 app.css 的 body.light
       会把这些变量又盖回去，「配色」就形同虚设。 */
    const root = Object.entries(th.vars).map(([k, v]) => `${k}:${v} !important;`).join('')
      + `--brand-ink:${ink} !important;--brand-ink-halo:${halo} !important;`
      + `--panel:${mixc(th.vars['--panel'])} !important;--panel-2:${mixc(th.vars['--panel-2'])} !important;`
      + `--panel-read:${mixr(th.vars['--panel'])} !important;--panel-read-2:${mixr(th.vars['--panel-2'])} !important;`
      + `--wall-dim:${wallDim.toFixed(3)} !important;`
      /* 做题区自适应（用户 m10717）：--side-w 右侧栏宽、--read 题干区字号系数（见 app.css 末尾那一段） */
      + `--side-w:${Math.round(Math.max(220, Math.min(460, Number(S.sideW) || 322)))}px !important;`
      + `--read:${(function () { const r = Number(S.readScale) || 1; return Math.max(.85, Math.min(1.5, r)).toFixed(2); })()} !important;`
      /* --mi-bg-m：粉笔首页那几张卡的背景是写死的 rgba(...)，靠这个系数跟滑杆联动（见 home.css） */
      + `--mi-bg-m:${(0.5 + 0.85 * pa).toFixed(3)} !important;`;

    /* 背景 */
    let bg = '';
    if (S.bg === 'flat') bg = `background:var(--bg) !important;`;
    else if (S.bg === 'gradient') bg = `background:linear-gradient(145deg,var(--bg) 0%,var(--panel) 52%,var(--bg) 100%) !important;`;
    else if (S.bg === 'image' && S.bgImage) {
      /* ★压暗取 max(用户滑杆, 联动地板)：面板拉到 35% 时 bgDim 至少 0.62，
         否则「图片背景 + 全透明面板」就是用户截图里那种看不清的场面。 */
      const bd = Math.max(Math.max(0, Math.min(0.9, Number(S.bgDim) || 0)), wallDim);
      bg = `background:linear-gradient(rgba(0,0,0,${bd.toFixed(3)}),rgba(0,0,0,${bd.toFixed(3)})),url("${String(S.bgImage).replace(/["\\]/g, '')}") center/cover no-repeat fixed !important;`;
    } else bg = `background:var(--bg) !important;`;

    /* 光斑只在「呼吸光斑」下出现 */
    const glow = (S.bg === 'glow') ? '' : '#motion-bg{display:none !important;}';

    /* 图片模糊（只对 image 有意义） */
    const blur = (S.bg === 'image' && S.blur > 0) ? `body::after{content:'';position:fixed;inset:0;backdrop-filter:blur(${S.blur}px);pointer-events:none;z-index:0;}` : '';

    el.textContent = `
:root,body,body.light,body.dark{${root}}
html{font-size:${Math.round(16 * S.fontScale)}px;}
body{${bg}font-family:var(--font-sans,${SANS});}
#view{zoom:${S.fontScale};}
${glow}${blur}
.sk-grp{margin:15px 0}
.sk-lab{font-size:11px;font-weight:800;letter-spacing:.10em;color:var(--txt-3);margin-bottom:8px}
#skin-panel input[type="range"]{accent-color:var(--brand)}
#skin-panel input.inp{background:var(--panel-2);border:1px solid var(--line);color:var(--txt);padding:8px 10px;border-radius:var(--r)}
`;
    /* body 直接改背景会盖住 app.css，这里用高优先级确保生效 */
    document.documentElement.setAttribute('data-theme', S.theme);
    document.documentElement.setAttribute('data-bg', S.bg);
    /* 导航条要跟着顺序/显隐立刻重画 */
    if (window.__xctermNav) { try { window.__xctermNav(); } catch { } }
    if (window.Motion && S.bg !== 'glow') { /* 光斑交给 CSS 隐藏即可 */ }
  }

  /* ---------------- 顺序 / 显隐工具 ---------------- */
  const orderList = (list, ids) => {
    const byId = new Map(list.map(x => [x.id, x]));
    const out = [];
    for (const id of (ids || [])) if (byId.has(id)) { out.push(byId.get(id)); byId.delete(id); }
    for (const x of list) if (byId.has(x.id)) out.push(x.id ? byId.get(x.id) : x), byId.delete(x.id);
    return out;
  };
  const hidden = id => S.hideTabs.indexOf(id) >= 0 || S.hideModules.indexOf(id) >= 0;

  /* ★1.9.0：设置页里的「粉笔账号」一行 —— 谁登着、上次同步什么时候。
     登录态的真身是 fenbi-view 闭包里的 S，外面只能问它挂出来的 FenbiViewAccount。 */
  /* 昵称/考点名是从粉笔接口拿的，落到 innerHTML 前一律转义 */
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fbWhoHTML = () => {
    try {
      const A = window.FenbiViewAccount;
      const i = (A && A.info) ? A.info() : null;
      const acc = (window.XCFENBI && window.XCFENBI.account) || null;
      const uid = (i && i.uid) || (acc && acc.userId) || '';
      const quiz = (i && i.quiz) || (acc && acc.quizName) || '';
      const at = (i && i.syncedAt) || window.XCFENBI_SYNCED_AT || '';
      const when = at ? (() => { try { return new Date(at).toLocaleString('zh-CN', { hour12: false }); } catch { return String(at); } })() : '';
      if (!uid) return '<span class="dim">○ 还没登录粉笔（去首页「🌸 粉笔」扫码）</span>';
      return '● 已连接粉笔 · <b>' + h(uid) + '</b>'
        + (quiz ? ' <span class="dim">' + h(quiz) + '</span>' : '')
        + (when ? ' <span class="dim">· 上次同步 ' + h(when) + '</span>' : '');
    } catch (e) { return '<span class="dim">○ 拿不到登录态</span>'; }
  };

  /* ---------------- 外观设置面板 ---------------- */
  const wallState = () => {
    try {
      const w = JSON.parse(localStorage.getItem('xcterm_wallpaper') || 'null');
      return w && w.src ? `当前壁纸：${w.name || '未命名'}` : '当前没设壁纸';
    } catch (e) { return '当前没设壁纸'; }
  };
  function panelHTML() {
    const th = THEMES.find(t => t.id === S.theme) || THEMES[0];
    const chip = (on, label, attr) => `<button class="btn sm ${on ? 'pri' : ''}" ${attr}>${label}</button>`;
    return `
    <section class="card" id="skin-panel" style="margin-bottom:16px">
      <h2 style="margin:0 0 4px">🎨 外观自定义</h2>
      <div class="dim" style="font-size:12px;margin-bottom:14px">配色 / 字号 / 模块开关 / 排序 / 背景 —— 都只存在这台机器上，随时还原。</div>

      <div class="sk-grp"><div class="sk-lab">配色</div>
        <div class="row wrap" style="gap:8px">
          ${THEMES.map(t => `<button class="btn sm ${t.id === S.theme ? 'pri' : ''}" data-sk-theme="${t.id}" title="${t.desc}">
            <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${t.vars['--brand']};margin-right:6px;vertical-align:-1px"></span>${t.name}</button>`).join('')}
        </div></div>

      <div class="sk-grp"><div class="sk-lab">字号 <span class="dim">（${Math.round(S.fontScale * 100)}%）</span></div>
        <div class="row" style="gap:8px;align-items:center">
          <button class="btn sm" data-sk-font="-">A−</button>
          <input type="range" id="sk-font" min="85" max="135" step="5" value="${Math.round(S.fontScale * 100)}" style="flex:1;min-width:140px">
          <button class="btn sm" data-sk-font="+">A+</button>
          <button class="btn sm" data-sk-font="1">100%</button>
        </div></div>

      <div class="sk-grp"><div class="sk-lab">背景</div>
        <div class="row wrap" style="gap:8px">
          ${BGS.map(b => chip(S.bg === b.id, b.name, `data-sk-bg="${b.id}"`)).join('')}
        </div>
        ${S.bg === 'image' ? `
        <div class="row" style="gap:8px;margin-top:10px;align-items:center">
          <input class="inp" id="sk-bgimg" placeholder="图片地址（本地文件或 http(s)）" value="${String(S.bgImage || '').replace(/"/g, '&quot;')}" style="flex:1;min-width:220px">
          <button class="btn sm" data-sk-bg-apply="1">用这张</button>
        </div>
        <div class="row" style="gap:14px;margin-top:10px;align-items:center">
          <label class="dim row" style="gap:6px;align-items:center">压暗
            <input type="range" id="sk-dim" min="0" max="80" step="5" value="${Math.round(S.bgDim * 100)}"></label>
          <label class="dim row" style="gap:6px;align-items:center">模糊
            <input type="range" id="sk-blur" min="0" max="20" step="1" value="${S.blur}"></label>
        </div>` : ''}
      </div>

      <div class="sk-grp"><div class="sk-lab">透明度 <span class="dim">（${Math.round(S.panelAlpha * 100)}%）</span></div>
        <div class="row" style="gap:10px;align-items:center">
          <span class="dim" style="font-size:12px">实</span>
          <input type="range" id="sk-alpha" min="35" max="100" step="5" value="${Math.round(S.panelAlpha * 100)}" style="flex:1;min-width:160px">
          <span class="dim" style="font-size:12px">透</span>
          <button class="btn sm" data-sk-alpha="1">100%</button>
        </div>
        <div class="dim" style="font-size:12px;margin-top:8px">只调卡片/面板的透明度，不动文字颜色。调小 → 底下的壁纸透出来更多；调到 100% → 完全不透明，字最清楚。<b>做题区的题干卡/选项/解析有 88% 的不透明度地板</b>，所以就算拉到最左，题目照样看得清。</div>
      </div>

      <div class="sk-grp"><div class="sk-lab">做题区 <span class="dim">（刷题 / 知识卡翻页那一屏）</span></div>
        <div class="row" style="gap:10px;align-items:center">
          <span class="dim" style="font-size:12px">小</span>
          <input type="range" id="sk-read" min="85" max="150" step="5" value="${Math.round((S.readScale || 1) * 100)}" style="flex:1;min-width:160px">
          <span class="dim" style="font-size:12px">大</span>
          <button class="btn sm" data-sk-read="1">100%</button>
        </div>
        <div class="dim" style="font-size:12px;margin-top:6px">做题区大小 <b data-read-num="1">${Math.round((S.readScale || 1) * 100)}%</b>：只放大题干、选项、解析的字号与留白，顶栏和导航不受影响（那是上面「字号」滑杆管的事）。</div>
        <div class="row" style="gap:10px;align-items:center;margin-top:12px">
          <span class="dim" style="font-size:12px">窄</span>
          <input type="range" id="sk-side" min="220" max="460" step="10" value="${Math.round(S.sideW || 322)}" style="flex:1;min-width:160px">
          <span class="dim" style="font-size:12px">宽</span>
          <button class="btn sm" data-sk-side="1">322</button>
        </div>
        <div class="dim" style="font-size:12px;margin-top:6px">右侧那一栏（答题卡 / 大纲定位）宽度 <b>${Math.round(S.sideW || 322)}px</b>。也可以直接拖它左边缘那条把手，双击复位。</div>
        <div class="row wrap" style="gap:8px;margin-top:12px">
          <button class="btn sm ${S.noSide ? '' : 'pri'}" data-sk-sidebar="1">${S.noSide ? '🙈 收起侧栏' : '📋 显示侧栏'}</button>
          <button class="btn sm ${S.readFull ? 'pri' : ''}" data-sk-full="1">${S.readFull ? '↕ 已撑满一屏' : '↕ 撑满一屏'}</button>
        </div>
      </div>

      <div class="sk-grp"><div class="sk-lab">壁纸 <span class="dim">（Wallpaper Engine · 本地视频/图片）</span></div>
        <div class="row wrap" style="gap:8px;align-items:center">
          <button class="btn sm" data-sk-wall="1">🖼 打开壁纸库</button>
          <button class="btn sm" data-sk-wall-clear="1">清掉壁纸</button>
          <span class="dim" style="font-size:12px">${wallState()}</span>
        </div>
        <div class="dim" style="font-size:12px;margin-top:8px">扫 Steam 创意工坊与本地 Wallpaper Engine 工程；也能选一个本地视频/图片当壁纸。🌸粉笔首页那排按钮里的「🖼 壁纸」是同一个入口。</div>
        <div class="row" style="gap:10px;align-items:center;margin-top:12px">
          <span class="dim" style="font-size:12px">亮</span>
          <input type="range" id="sk-wall-dim" min="0" max="85" step="5" value="${Math.round(Math.max(0, Math.min(0.85, Number(S.wallDim) || 0)) * 100)}" style="flex:1;min-width:160px">
          <span class="dim" style="font-size:12px">暗</span>
          <button class="btn sm" data-sk-wall-dim="1">自动</button>
        </div>
        <div class="dim" style="font-size:12px;margin-top:8px">壁纸压暗：壁纸再亮也不影响看题。点「自动」= 跟上面的「透明度」联动（面板越透 → 壁纸自动越暗），这是保底，你手动调的值只会更暗。</div>
      </div>

      <div class="sk-grp"><div class="sk-lab">音乐 <span class="dim">（底部常驻播放条，切页不停）</span></div>
        <div class="row wrap" style="gap:8px;align-items:center">
          <button class="btn sm" data-sk-song="1">🎵 打开歌单</button>
          <span class="dim" style="font-size:12px">启动随机放 · 切歌方式 · 做题时暂停/降音量 · 分数区间，全在播放条右边的 ☰ 里</span>
        </div>
        <div class="dim" style="font-size:12px;margin-top:8px">支持 mp3 / flac / ogg / m4a / wav 和网易云 .ncm（服务端自动解密），也能扫码挂上自己的网易云歌单在线放。Ctrl+Space 播放暂停，Ctrl+←/→ 切歌。</div>
      </div>

      <div class="sk-grp"><div class="sk-lab">粉笔账号 <span class="dim">（登录 / 重新同步 / 退出）</span></div>
        <div class="row wrap" style="gap:8px;align-items:center">
          <span class="grow" id="sk-fb-who" style="font-size:13px">${fbWhoHTML()}</span>
          <button class="btn sm" data-sk-fb="resync">🔄 重新同步</button>
          <button class="btn sm" data-sk-fb="relogin">🍪 换账号扫码</button>
          <button class="btn sm" data-sk-fb="logout">⏻ 退出登录</button>
        </div>
        <div class="dim" style="font-size:12px;margin-top:8px">退出只清粉笔登录态，本地的错题 / 收藏 / 笔记都留着。想在首页随手退，就点首页右上角状态胶囊旁边的「⏻ 退出」。</div>
      </div>

      <div class="sk-grp"><div class="sk-lab">导航顺序 <span class="dim">（点上移/下移）</span></div>
        <div class="col" style="gap:6px">
          ${orderList([{ id: 'fenbi', label: '🌸 粉笔' }, { id: 'ai', label: '🤖 AI 讲师' }, { id: 'local', label: '📚 本地题库' }, { id: 'settings', label: '⚙️ 设置' }], S.navOrder).map((n, i, arr) => `
          <div class="row" style="gap:8px;align-items:center">
            <span class="grow">${n.label}</span>
            <button class="btn sm" data-sk-nav="${n.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn sm" data-sk-nav="${n.id}" data-dir="1" ${i === arr.length - 1 ? 'disabled' : ''}>↓</button>
          </div>`).join('')}
        </div></div>

      <div class="sk-grp"><div class="sk-lab">粉笔板块开关 & 排序</div>
        <div class="col" style="gap:6px">
          ${orderList([{ id: 'point', label: '🌳 考点练习' }, { id: 'wrong', label: '❌ 错题本' }, { id: 'fav', label: '⭐ 收藏夹' }, { id: 'paper', label: '📄 真题卷' }, { id: 'hist', label: '🕘 练习记录' }], S.tabOrder).map(t => `
          <div class="row" style="gap:8px;align-items:center">
            <input type="checkbox" data-sk-tab="${t.id}" ${S.hideTabs.indexOf(t.id) < 0 ? 'checked' : ''}>
            <span class="grow">${t.label}</span>
            <button class="btn sm" data-sk-tabmove="${t.id}" data-dir="-1">↑</button>
            <button class="btn sm" data-sk-tabmove="${t.id}" data-dir="1">↓</button>
          </div>`).join('')}
        </div></div>

      <div class="sk-grp"><div class="sk-lab">本地题库模块开关</div>
        <div class="row wrap" style="gap:8px">
          ${[['overview', '📊 学习概览'], ['notes', '🃏 知识卡'], ['practice', '✏️ 刷题'], ['wrong', '❌ 错题本'], ['favs', '⭐ 收藏夹'], ['bianxi', '🔍 易混辨析'], ['shizheng', '📰 时政月报'], ['mind', '🗺 图推思维导图'], ['stats', '📈 学习统计']]
        .map(([id, label]) => `<button class="btn sm ${S.hideModules.indexOf(id) < 0 ? 'pri' : ''}" data-sk-mod="${id}">${label}</button>`).join('')}
        </div></div>

      <div class="row" style="gap:10px;margin-top:16px">
        <button class="btn sm" data-sk-reset="1">↩️ 全部还原</button>
        <span class="dim" style="font-size:12px">当前：${th.name} · 字号 ${Math.round(S.fontScale * 100)}% · 透明度 ${Math.round(S.panelAlpha * 100)}%</span>
      </div>
    </section>`;
  }

  function bindPanel(host, onChange) {
    const $ = s => host.querySelector(s);
    const $$ = s => [...host.querySelectorAll(s)];
    const fire = () => { apply(); save(); if (onChange) onChange(); };

    $$('[data-sk-theme]').forEach(b => b.onclick = () => { S.theme = b.dataset.skTheme; fire(); });
    $$('[data-sk-bg]').forEach(b => b.onclick = () => { S.bg = b.dataset.skBg; fire(); });
    const ba = $('[data-sk-bg-apply]');
    if (ba) ba.onclick = () => { S.bgImage = ($('#sk-bgimg') || {}).value || ''; fire(); };

    /* 壁纸：跟 hero 上「🖼 壁纸」是同一个入口，只是这边在设置里常驻 */
    const wo = $('[data-sk-wall]');
    if (wo) wo.onclick = () => {
      if (window.Wallpaper) window.Wallpaper.open();
      else if (window.__toast) window.__toast('壁纸模块没加载到');
    };
    const wc = $('[data-sk-wall-clear]');
    if (wc) wc.onclick = () => {
      if (window.Wallpaper) { window.Wallpaper.apply(null); fire(); }
    };

    const fs = $('#sk-font');
    if (fs) fs.oninput = () => { S.fontScale = Number(fs.value) / 100; apply(); };
    if (fs) fs.onchange = fire;
    $$('[data-sk-font]').forEach(b => b.onclick = () => {
      const d = b.dataset.skFont;
      S.fontScale = d === '1' ? 1 : Math.max(.85, Math.min(1.35, S.fontScale + (d === '+' ? .05 : -.05)));
      fire();
    });

    const dim = $('#sk-dim'); if (dim) dim.onchange = () => { S.bgDim = Number(dim.value) / 100; fire(); };
    const bl = $('#sk-blur'); if (bl) bl.onchange = () => { S.blur = Number(bl.value); fire(); };

    /* 面板透明度（用户 m06726：「透明度也要可以自己调整」） */
    const al = $('#sk-alpha');
    if (al) al.onchange = () => { S.panelAlpha = Number(al.value) / 100; fire(); };
    const alr = $('[data-sk-alpha]'); if (alr) alr.onclick = () => { S.panelAlpha = 1; fire(); };
    const wd = $('#sk-wall-dim'); if (wd) wd.onchange = () => { S.wallDim = Number(wd.value) / 100; fire(); };
    const wdr = $('[data-sk-wall-dim]'); if (wdr) wdr.onclick = () => { S.wallDim = 0; fire(); };

    /* 做题区自适应（用户 m10717：「做题框太小了希望能够自己调节」） */
    const rd = $('#sk-read');
    if (rd) rd.oninput = () => {
      S.readScale = Number(rd.value) / 100;
      apply();                                   /* 拖动时只重刷变量，别整页重画，跟手 */
      const lab = host.querySelector('[data-read-num]');
      if (lab) lab.textContent = rd.value + '%';
    };
    if (rd) rd.onchange = fire;
    const rdr = $('[data-sk-read]'); if (rdr) rdr.onclick = () => { S.readScale = 1; fire(); };
    const sw = $('#sk-side'); if (sw) sw.onchange = () => { S.sideW = Number(sw.value); fire(); };
    const swr = $('[data-sk-side]'); if (swr) swr.onclick = () => { S.sideW = 322; fire(); };
    const sb = $('[data-sk-sidebar]'); if (sb) sb.onclick = () => { S.noSide = !S.noSide; fire(); };
    const rf = $('[data-sk-full]'); if (rf) rf.onclick = () => { S.readFull = !S.readFull; fire(); };

    /* 音乐歌单 —— 之前只有结算画面里才有入口（用户 m06726：「添加音乐的功能哪去了？」），这里常驻一份 */
    const so = $('[data-sk-song]');
    if (so) so.onclick = () => {
      if (window.Song && Song.open) Song.open();
      else if (window.__toast) window.__toast('音乐模块没加载到');
    };

    /* ★1.9.0：粉笔账号 —— 用户 m11719「粉笔登录之后退出的功能有没有我怎么没看到」。
       动作统一走 window.FenbiViewAccount（fenbi-view.js 挂出来的），设置页不用知道自己怎么重渲染。 */
    const fbToast = t => { try { if (window.__toast) window.__toast(t); } catch { } };
    $$('[data-sk-fb]').forEach(b => b.onclick = async () => {
      const act = b.dataset.skFb;
      const A = window.FenbiViewAccount;
      if (act === 'logout' || act === 'relogin') {
        const q = act === 'logout' ? '退出粉笔登录？（本地的错题/收藏/笔记都留着）' : '换账号：先退出当前粉笔登录，再扫码登录新账号？';
        if (!window.confirm(q)) return;
        b.disabled = true;
        try { A ? await A.logout() : (window.FenbiAPI && await window.FenbiAPI.logout()); } catch { }
        fbToast(act === 'logout' ? '已退出登录' : '已退出，去首页「🌸 粉笔」扫码换账号');
        b.disabled = false;
        const w0 = $('#sk-fb-who'); if (w0) w0.innerHTML = fbWhoHTML();
        return;
      }
      if (act === 'resync') {
        b.disabled = true;
        try {
          if (A && A.resync) { const okr = await A.resync(); fbToast(okr ? '已重新同步粉笔数据' : '粉笔没连上，先登录'); }
          else fbToast('粉笔没连上');
        } catch (e) { fbToast('同步失败：' + e.message); }
        finally { b.disabled = false; const w = $('#sk-fb-who'); if (w) w.innerHTML = fbWhoHTML(); }
      }
    });

    const move = (arr, id, dir) => {
      const i = arr.indexOf(id), j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      arr.splice(j, 0, arr.splice(i, 1)[0]);
    };
    $$('[data-sk-nav]').forEach(b => b.onclick = () => { move(S.navOrder, b.dataset.skNav, Number(b.dataset.dir)); fire(); });
    $$('[data-sk-tabmove]').forEach(b => b.onclick = () => { move(S.tabOrder, b.dataset.skTabmove, Number(b.dataset.dir)); fire(); });
    $$('[data-sk-tab]').forEach(c => c.onchange = () => {
      const id = c.dataset.skTab, at = S.hideTabs.indexOf(id);
      if (c.checked && at >= 0) S.hideTabs.splice(at, 1);
      if (!c.checked && at < 0) S.hideTabs.push(id);
      fire();
    });
    $$('[data-sk-mod]').forEach(b => b.onclick = () => {
      const id = b.dataset.skMod, at = S.hideModules.indexOf(id);
      if (at >= 0) S.hideModules.splice(at, 1); else S.hideModules.push(id);
      fire();
    });
    const rs = $('[data-sk-reset]');
    if (rs) rs.onclick = () => { S = blank(); fire(); };
  }

  window.Skin = {
    get: () => JSON.parse(JSON.stringify(S)),
    set(patch) { S = Object.assign(S, patch || {}); apply(); save(); },
    reset() { S = blank(); apply(); save(); },
    apply, panelHTML, bindPanel,
    themes: THEMES, bgs: BGS,
    /* 给 app.js / fenbi-view.js 用的排序与显隐 */
    orderNav: list => orderList(list, S.navOrder),
    orderTabs: list => orderList(list, S.tabOrder).filter(x => !hidden(x.id)),
    hidden
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
