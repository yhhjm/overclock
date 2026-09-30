/* 超频 OVERCLOCK —— 本地桌面版（纯前端，无依赖，离线可用）
 * 数据： / MINDMAP / META
 * 存储：localStorage['xcterm_v1']
 */
(() => {
'use strict';

/* ============================ 1. 存储 ============================ */
const KEY = 'xcterm_v1';
const REVIEW_STEPS = [1, 2, 4, 7, 15, 30];
const LETTERS = ['A', 'B', 'C', 'D'];
/* 多选题：q.ms 是正确字母集（如 'AB'）；单选仍用 q.a（下标） */
const qOK = (q, i) => q.ms ? q.ms.indexOf(LETTERS[i]) >= 0 : i === q.a;
const qAns = q => q.ms || LETTERS[q.a];
/* ★错因六分类（用户 m08574 第 4 条 + 复盘 prompt 的「错因六分类」对齐）：
   复盘 prompt 一直让 AI 按「知识盲区 / 方法不对 / 审题失误 / 计算粗心 / 时间不够 / 假会」六类分析，
   可本地只存三档 —— AI 分出来的六类根本存不下，回不到错题本，等于白分。
   现在存的就是这六类，AI 说的跟错题本里记的是同一套。
   g = 所属的粗三档（老数据存的就是三档那三个键，留着当分组用，一点不丢）。 */
const CAUSE = [
  { k: 'blind', i: '🕳️', n: '知识盲区', g: 'dunno', d: '这块压根没学过 / 没记住 —— 回去看这张知识卡' },
  { k: 'method', i: '🧭', n: '方法不对', g: 'dunno', d: '知识点懂，但没找对路子 —— 学这个考点的标准套路' },
  { k: 'fake', i: '🎭', n: '假会', g: 'dunno', d: '以为会，一做就错 —— 把这道题的推导从头写一遍' },
  { k: 'misread', i: '👀', n: '审题失误', g: 'careless', d: '看错题干 / 漏条件 / 选错项 —— 划关键词再动手' },
  { k: 'slip', i: '✍️', n: '计算粗心', g: 'careless', d: '会做，算错 / 抄错 —— 打草稿，别心算' },
  { k: 'time', i: '⏰', n: '时间不够', g: 'time', d: '会做但来不及，或者干脆是蒙的' }
];
/* 粗三档：只当分组和筛选用，也是老数据里存过的键 */
const CAUSE_G = [
  { k: 'dunno', i: '🤔', n: '不会', d: '知识盲区 / 方法不对 / 假会' },
  { k: 'careless', i: '😅', n: '粗心', d: '审题失误 / 计算粗心' },
  { k: 'time', i: '⏰', n: '没时间', d: '来不及，或蒙的' }
];
const CAUSE_MAP = {}; CAUSE.forEach(c => { CAUSE_MAP[c.k] = c; });
CAUSE_G.forEach(c => { if (!CAUSE_MAP[c.k]) CAUSE_MAP[c.k] = Object.assign({ coarse: true }, c); });
/* 交给 AI 讲师（DeepTutor）的那份错因：键 + 名字 + 一句话说明 */
const causeOf = id => { const c = CAUSE_MAP[(DB.cause && DB.cause[id]) || '']; return c ? { k: c.k, n: c.i + ' ' + c.n, d: c.d } : null; };
/* 这道题我上次选的是哪个（只有本次练习还记得；错题本里翻出来时是 -1） */
const mineOf = id => (EXAM && EXAM.ans && EXAM.ans[id] != null) ? EXAM.ans[id] : -1;
const askAI = (q, extra) => {
  if (!window.Deep) return;
  window.Deep.open(Object.assign({ q, mine: mineOf(q.id), cause: causeOf(q.id) }, extra || {}));
};
/* 一道题记一次错因。k 为空 = 清掉（再点一下当前选中项）。 */
function setCause(id, k) {
  DB.cause = DB.cause || {};
  if (!k || DB.cause[id] === k) delete DB.cause[id]; else DB.cause[id] = k;
  save();
  return DB.cause[id] || '';
}
/* 错因统计：只算「还在错题本里」的题，移出去的题不参与，免得老账一直压着。
   同时给出六类明细（cs.blind …）和粗三档合计（cs.dunno/careless/time，也是老数据的键）。
   老数据里存的粗档键（dunno/careless/time）只计一次，别既算明细又算合计。 */
function causeStat(ids) {
  const o = { none: 0, total: 0 };
  CAUSE.forEach(c => { o[c.k] = 0; });
  CAUSE_G.forEach(c => { o[c.k] = 0; });
  (ids || DB.wrong).forEach(id => {
    o.total++;
    const k = (DB.cause && DB.cause[id]) || '';
    const c = CAUSE_MAP[k];
    if (!c) { o.none++; return; }
    if (o[k] !== undefined) o[k]++;
    const g = c.g || c.k;
    if (g !== k && o[g] !== undefined) o[g]++;
  });
  return o;
}
/* 错因统计条的内容（错题本顶部用；标完一题就地刷新，不用重进页面） */
function causeSumHTML(ids) {
  const cs = causeStat(ids);
  return `<span class="cause-sum-h">错因构成</span>
    ${CAUSE.map(c => `<span class="cause-sum-i c-${c.k}">${c.i} ${c.n} <b>${cs[c.k]}</b></span>`).join('')}
    <span class="cause-sum-i c-none">未标 <b>${cs.none}</b></span>
    ${cs.none ? `<span class="grow"></span><span class="dim" style="font-size:12px">给错题标个错因，复习才知道该补哪儿</span>` : ''}`;
}
/* 错因选择条：result 页和错题本共用 */
function causeBarHTML(id) {
  const cur = (DB.cause && DB.cause[id]) || '';
  return `<div class="cause-bar${cur ? ' has' : ''}" data-causebar="${esc(id)}" data-curs="${cur}">
    <span class="cause-q">错因</span>
    ${CAUSE.map(c => `<button class="chip cause-c" data-cause="${c.k}" data-for="${esc(id)}" title="${esc(c.d)}"${cur === c.k ? ' on' : ''}>${c.i} ${c.n}</button>`).join('')}
    <button class="chip cause-c cause-x" data-cause="" data-for="${esc(id)}" title="清掉错因">✕</button>
  </div>`;
}
/* 错因小标（列表里显示用的） */
function causeTagHTML(id) {
  const c = CAUSE_MAP[(DB.cause && DB.cause[id]) || ''];
  return `<span class="tag cause-tag ${c ? 'c-' + c.k : 'c-none'}" data-causetag="${esc(id)}">${c ? c.i + ' ' + c.n : '错因待标'}</span>`;
}
/* 绑定：点击就记，并把同一道题的小标同步刷新（不重渲染整页，省得滚动位置丢） */
function bindCause(host) {
  host.querySelectorAll('[data-cause]').forEach(el => el.onclick = e => {
    e.stopPropagation();
    const id = el.dataset.for;
    const nx = setCause(id, el.dataset.cause);
    host.querySelectorAll('[data-causebar]').forEach(bar => {
      if (bar.dataset.causebar !== id) return;
      bar.dataset.curs = nx;
      bar.classList.toggle('has', !!nx);
      bar.querySelectorAll('[data-cause]').forEach(b => b.classList.toggle('on', !!nx && b.dataset.cause === nx));
    });
    host.querySelectorAll('[data-causetag]').forEach(t => {
      if (t.dataset.causetag !== id) return;
      const c = CAUSE_MAP[nx];
      t.className = 'tag cause-tag ' + (c ? 'c-' + c.k : 'c-none');
      t.textContent = c ? c.i + ' ' + c.n : '错因待标';
    });
    /* 统计条跟着一起变，免得用户看到「未标 3」却明明刚标完 */
    const sum = host.querySelector('[data-causesum]');
    if (sum) {
      const all = [].slice.call(host.querySelectorAll('[data-causetag]')).map(t => t.dataset.causetag);
      sum.innerHTML = causeSumHTML(all);
    }
  });
}
const dayStart = (off = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() + off * 86400000; };
const dayKey = (t = Date.now()) => { const d = new Date(t); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

/* ---------- 做题区自适应（用户 m10717：「做题框太小了希望能够自己调节」） ----------
   一个函数管三件事，全部落在 .deckwrap 上：
     · .full      → 题干卡撑满一屏（min-height 跟着视口走，见 app.css）
     · .no-side   → 收起右侧那一栏（答题卡 / 大纲定位），把宽度全让给题目
     · --side-w   → 侧栏宽度；拖侧栏左边缘那条把手改，双击复位 322
   拖动过程中只写元素内联样式（不落盘、不重渲染，跟手），松手才 Skin.set 写回设置。
   ★坑：window 上的 mousemove/mouseup 只能绑一次 —— deckFit 每次重渲染都会跑，
     在它里面 addEventListener 会越积越多（每次渲染加一对），所以拆成「一次性绑定 + 模块级 deckCur」。 */
let deckCur = null, deckGrip = null, deckDragging = false;
function deckFit(host) {
  const wrap = host.querySelector('.deckwrap');
  if (!wrap) return;
  const H = (window.Skin && Skin.get()) || {};
  wrap.classList.toggle('full', !!H.readFull);
  wrap.classList.toggle('no-side', !!H.noSide);
  if (H.sideW) wrap.style.setProperty('--side-w', Math.round(H.sideW) + 'px');
  const side = wrap.querySelector('.side');
  if (!side) return;
  /* 两个开关按钮的文案/状态也跟着一起同步（markup 里写的是默认态） */
  const bs = host.querySelector('#toggle-side');
  if (bs) { bs.classList.toggle('on', !H.noSide); bs.textContent = H.noSide ? '📋 答题卡' : '🙈 收起侧栏'; }
  const bf = host.querySelector('#toggle-full');
  if (bf) { bf.classList.toggle('on', !!H.readFull); bf.textContent = H.readFull ? '↕ 已撑满' : '↕ 撑满一屏'; }
  deckCur = wrap;
  let grip = side.querySelector('.side-grip');
  if (!grip) {
    grip = document.createElement('div');
    grip.className = 'side-grip';
    grip.title = '拖动调宽度 · 双击复位';
    side.insertBefore(grip, side.firstChild);
  }
  deckGrip = grip;
  grip.onmousedown = e => { deckDragging = true; e.preventDefault(); grip.classList.add('on'); document.body.style.cursor = 'col-resize'; };
  grip.ondblclick = () => { wrap.style.removeProperty('--side-w'); if (window.Skin) Skin.set({ sideW: 322 }); };
}
if (!window.__deckDragBound) {
  window.__deckDragBound = 1;
  window.addEventListener('mousemove', e => {
    if (!deckDragging || !deckCur) return;
    const r = deckCur.getBoundingClientRect();
    const w = Math.max(220, Math.min(460, Math.round(r.right - e.clientX)));
    deckCur.style.setProperty('--side-w', w + 'px');
  });
  window.addEventListener('mouseup', () => {
    if (!deckDragging) return;
    deckDragging = false;
    if (deckGrip) deckGrip.classList.remove('on');
    document.body.style.cursor = '';
    if (!deckCur || !window.Skin) return;
    const v = parseInt(deckCur.style.getPropertyValue('--side-w'), 10);
    if (v) Skin.set({ sideW: v });
  });
}
/* 侧栏开合 / 撑满的公共开关 —— 两个 deck 视图都用 */
function deckToggle(host, key) {
  if (!window.Skin) return;
  Skin.set({ [key]: !Skin.get()[key] });
  deckFit(host);
}

function blank() {
  return {
    seen: {}, marks: {}, review: {},
    sz: { seen: {}, marks: {}, review: {} },
      wrong: [], favs: [], log: [], days: {}, notes: {}, fenbiNoteId: {},
    /* ★错因（用户 m08574 第 4 条）：{ '<题 id>': CAUSE 里那六个键之一 }
       blind 知识盲区 / method 方法不对 / fake 假会 / misread 审题失误 / slip 计算粗心 / time 时间不够
       （老账里还存着 dunno / careless / time 三个粗档键 —— 它们是 CAUSE[i].g 分组键，照常认，不迁数据）。
       只给错题本里的题记；移出错题本时顺手删掉，免得越积越多。 */
    cause: {},
    /* ★作答轨迹落盘（m15150）：{ '<题 id>': { ms, first, picks, ans, at } }。
       本来只活在一场练习的 E.trace 里，交卷就没了 —— 留一份，翻老账 / 自动标错因 / 复盘都还有得用。 */
    tries: {},
    ask: [],
    /* ★本地做题在粉笔考点树上留的账（用户 m05778 第 4 条）：
       { '<keypointId>': { add: 做了几题, right: 对了几题 } }，
       fenbi-view.js 的 withLocal() 会把它叠到「已做 / 正确率」上，
       免得本地做完 100 题首页还停在同步那一刻的 26/2135。 */
    fbLocal: {},
    settings: { theme: 'light', onlyUnseen: true },
    createdAt: Date.now()
  };
}
let DB = blank();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); DB = Object.assign(blank(), d); }
  } catch (e) { console.warn('存储读取失败', e); }
  applyTheme();
}
let saveTimer = null;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('保存失败：' + e.message); } }, 120);
}
/* ★立刻落盘：debounce 那 120 ms 里要是页面被切走/刷新，数据就丢了。
   生成补洞题这种「写完马上可能跳走」的地方必须用它。 */
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { localStorage.setItem(KEY, JSON.stringify(DB)); return true; } catch (e) { return false; }
}
function applyTheme() {
  document.documentElement.dataset.theme = (DB.settings && DB.settings.theme) === 'dark' ? 'dark' : 'light';
}

/* ============================ 2. 小工具 ============================ */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* ---------- 题干里的「横线」还原 ----------
   粉笔原卷的填空是**带下划线的空白**（HTML 里是 <u>…</u> / &nbsp;），
   剥掉标签之后就只剩空白字符，再经 esc() 渲染出来就是看不见的空隙 ——
   所以逻辑填空「不知道选项的词该填在哪儿」。
   这里在渲染时把它还原成可见的下划线。
   ⚠️空白字符有**两套**，都要认（实测：data 全目录 U+0020 189130 / U+00A0 16346）：
     · U+0020 空格（+ 资料分析的 U+0009 TAB）—— 离线题库分片 bank\*.js
     · U+00A0 不换行空格 —— fb_bank.js（真题卷/在线题）与 notes.js（知识卡），
       形态是「NBSP 空格 NBSP 空格」交替的一串
   三类空白**不当空**、原样留白（都是原 HTML 换段/排版留下的假空，实测占绝大多数）：
     · 紧跟在句末标点、省略号、右引号/右括号后面的 —— 如「……牺牲一只脚。␣根据上述定义」
     · 紧挨着圈号序号（①②③…⑴⑵…）的 —— 如「？␣①水稻」『③④①②…␣下列关于』
     · 行首的一段（前一字是换行）—— 那是段落缩进，如「…5.1%。\n␣␣␣␣␣␣␣␣2025年…」
   ⚠️「句末标点后面」这条只在**非填空题**里成立：逻辑判断/定义判断 1644 题里 1194 题
   就一个换段假空（「……牺牲一只脚。␣根据上述定义」），必须吞掉；
   但填空题的句子开头本来就是空（「…这个根脉。␣好这个魂和根，是理论创新的基础」），
   吞了就少一条横线。所以按题型分：kd/t/q 里出现「填空 / 填入…横线」就是填空题，
   句末标点后照画。顿号（、）不算句末标点 —— 并列结构里「甲、␣、丙」的空就在顿号后面。 */
const BLANK_AFTER_P = /[。！？；…""''〉》】]/;
const BLANK_CIRCLED = /[①-⑳⑴-⒇⒈-⒛⓪❶-❿]/;
const BLANK_CH = c => c === ' ' || c === '\t' || c === '\u00a0';
const BLANK_Q = q => q && (/填空/.test(String(q.kd || '') + String(q.t || '')) || /填入|横线/.test(String(q.q || '')));
/* 下划线宽度：按选项里最长的那个「词」定（逻辑填空的选项常是「甲词 乙词」，要拆开看），
   中文算 1 em、拉字算 0.62 em，钳在 2.2~7 em，取不到选项就用 3.4 em */
function blankW(q) {
  let best = 0;
  for (const o of (q && q.o) || []) {
    for (const w of String(o == null ? '' : o).split(/[ \u3000\u00a0]+/)) {
      const t = w.replace(/^[A-D][.．、]?\s*/, '').trim();
      if (!t) continue;
      const L = [...t].reduce((a, ch) => a + (/[\u4e00-\u9fa5]/.test(ch) ? 1 : 0.62), 0);
      if (L > best) best = L;
    }
  }
  return Math.round(Math.max(2.2, Math.min(7, best || 3.4)) * 100) / 100;
}
function stemHTML(s, q) {
  const t = String(s == null ? '' : s);
  if (!/[\s\u00a0]/.test(t)) return esc(t);
  const W = blankW(q);
  let out = '', i = 0;
  while (i < t.length) {
    const c = t[i];
    if (!BLANK_CH(c)) { out += esc(c); i++; continue; }
    let j = i; while (j < t.length && BLANK_CH(t[j])) j++;
    const before = i > 0 ? t[i - 1] : '';
    const after = j < t.length ? t[j] : '';
    if (before === '\n' || before === '\r'
      || BLANK_CIRCLED.test(before) || BLANK_CIRCLED.test(after)
      || (BLANK_AFTER_P.test(before) && !BLANK_Q(q))) out += ' ';
    else out += `<i class="qblk" style="width:${W}em"></i>`;
    i = j;
  }
  return out;
}
/* ---------- 极简 Markdown → HTML（只给「AI 复盘」这类模型正文用）----------
   模型回的是 Markdown（## 小标题 / **粗体** / - 列表 / | 表格 |），原来直接 esc() 平铺成
   pre-wrap，满屏都是 ** 和 | 的记号，人根本没法读（用户 m24495 报的）。
   安全做法：**先 esc() 转义原文，再只追加自己生成的标签** —— 不是先拼 HTML 再补转义，
   所以模型正文里的 <script> 照样是纯文本。 */
function mdInline(s) {
  return String(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>');
}
function mdHTML(src) {
  const lines = String(src == null ? '' : src).replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  const isRow = s => /^\s*\|.*\|\s*$/.test(s);
  const cells = s => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim());
  for (let i = 0; i < lines.length;) {
    const t = lines[i].trim();
    if (!t) { closeList(); i++; continue; }
    /* 表格：| 表头 | 表头 | 紧跟一行 |---|---| */
    if (isRow(t) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      const head = cells(t); i += 2;
      const body = [];
      while (i < lines.length && isRow(lines[i])) { body.push(cells(lines[i])); i++; }
      out.push('<table class="md-t"><thead><tr>' + head.map(c => '<th>' + mdInline(esc(c)) + '</th>').join('')
        + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => '<td>' + mdInline(esc(c)) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(t))) { closeList(); out.push('<h4 class="md-h md-h' + m[1].length + '">' + mdInline(esc(m[2])) + '</h4>'); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { closeList(); out.push('<hr class="md-hr">'); i++; continue; }
    if ((m = /^[-*+]\s+(.*)$/.exec(t))) {
      if (list !== 'ul') { closeList(); out.push('<ul class="md-ul">'); list = 'ul'; }
      out.push('<li>' + mdInline(esc(m[1])) + '</li>'); i++; continue;
    }
    if ((m = /^\d+[.、)]\s*(.*)$/.exec(t))) {
      if (list !== 'ol') { closeList(); out.push('<ol class="md-ol">'); list = 'ol'; }
      out.push('<li>' + mdInline(esc(m[1])) + '</li>'); i++; continue;
    }
    if ((m = /^>\s?(.*)$/.exec(t))) { closeList(); out.push('<blockquote class="md-q">' + mdInline(esc(m[1])) + '</blockquote>'); i++; continue; }
    closeList();
    out.push('<p class="md-p">' + mdInline(esc(t)) + '</p>'); i++;
  }
  closeList();
  return out.join('');
}
/* 图形推理题干图：可能有多张（题干图 + 选项图），一并竖排显示 */
const figHTML = q => {
  const list = (q.figs && q.figs.length) ? q.figs : (q.fig ? [q.fig] : []);
  return list.map(f => `<img class="qfig" src="${esc(f)}" alt="题干图形">`).join('');
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/* ---------- 资料分析成组：材料图 + 原卷题干图 ----------
   q.z = { n:原卷题号, g:'组起-组止', m:材料图, s:题干图, ph:选项是纯图 }（由 patch_zl_shards.js 写入） */
const ZLMAT = q => (q.z && q.z.m) ? `<div class="zmat">
      <div class="zmat-h"><span>📊 材料 ${esc(q.z.g || '')}</span><span class="zmat-t">点图放大 · 双指/滚轮缩放</span></div>
      <img class="zimg" src="${esc(q.z.m)}" data-zoom="1" alt="资料分析材料">
    </div>` : '';
const ZLSTEM = q => (q.z && q.z.s) ? `<div class="zstem">
      <img class="zimg" src="${esc(q.z.s)}" data-zoom="1" alt="原卷题干">
      <details class="qtext"><summary>文字题干（原卷为准，文本可能被切坏）</summary><div class="qbody">${stemHTML(q.q, q)}</div></details>
    </div>` : `<div class="qbody" style="margin-top:12px">${stemHTML(q.q, q)}</div>`;
/* 纯图选项时选项文字可能是占位符「A.」⇒ 去掉重复的字母前缀 */
const OPTTEXT = (q, o) => (q.z && q.z.ph) ? String(o || '').replace(/^[ABCD][.．、]?\s*/, '') : o;
/* 材料组的唯一标识：用材料图路径（"6-10" 这种组号在不同卷里会重复，不能当 key） */
const ZKEY = q => (q.z && q.z.m) ? q.z.m : '';
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const shorten = (s, n = 90) => { s = String(s || '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; };
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  /* 文案长的给久一点，别还没读完就没了（最短 1.7s，最长 4.2s） */
  const ms = Math.max(1700, Math.min(4200, 1200 + String(msg).length * 55));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
function navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

/* 笔记卡索引：id -> {mod, card} */
const NOTE_MAP = {};
NOTES.forEach(mod => mod.cards.forEach(c => { NOTE_MAP[c.id] = { mod, card: c }; }));
/* ---------- 题库：分片懒加载（1.8 万题真题库，按 模块/题型 分片，进入练习时按需注入） ---------- */
const BANK = [], BANK_MAP = {};
const BIDX = window.XCBANK_INDEX || { mid: {}, total: 0 };
const ABBR = { zhengzhi: 'g', ziliao: 'l', shuliang: 's', panduan: 'p', yanyu: 'y', changshi: 'c', tutui: 't' };
const ABBR_REV = {}; Object.keys(ABBR).forEach(k => ABBR_REV[ABBR[k]] = k);
const MID_ORDER = ['zhengzhi', 'ziliao', 'shuliang', 'panduan', 'yanyu', 'changshi', 'tutui'];
const BANK_MODS = MID_ORDER.filter(mid => BIDX.mid[mid]).map(mid => ({
  mid, m: BIDX.mid[mid].name, total: BIDX.mid[mid].total,
  subs: Object.fromEntries(Object.entries(BIDX.mid[mid].subs).map(([k, v]) => [k, v.n]))
}));
const _loaded = {}, _ok = {};
function bankFiles(mid, sub) {
  const v = BIDX.mid[mid];
  if (!v) return [];
  if (sub) return v.subs[sub] ? v.subs[sub].parts.map(p => p.file) : [];
  return Object.keys(v.subs).reduce((a, s) => a.concat(v.subs[s].parts.map(p => p.file)), []);
}
let _merged = 0;
function bankMerge() {
  const all = window.XCBANK_PARTS || [];
  for (; _merged < all.length; _merged++) (all[_merged].q || []).forEach(q => { BANK.push(q); BANK_MAP[q.id] = q; });
}
function loadShard(file) {
  if (_loaded[file]) return _loaded[file];
  return _loaded[file] = new Promise(res => {
    const s = document.createElement('script');
    s.src = 'data/bank/' + file;
    s.onload = () => { bankMerge(); _ok[file] = 1; res(true); };
    s.onerror = () => { _ok[file] = 1; res(false); };
    document.head.appendChild(s);
  });
}
function ensureBank(mid, sub, onStep) {
  const files = bankFiles(mid, sub), total = files.length;
  let done = 0;
  if (onStep) onStep(0, total);
  return Promise.all(files.map(f => loadShard(f).then(() => { if (onStep) onStep(++done, total); })));
}
function fileOfId(id) {
  const m = /^([a-z])(\d+)_/.exec(id || '');
  return (m && ABBR_REV[m[1]]) ? 'bank_' + ABBR_REV[m[1]] + '_' + m[1] + m[2] + '.js' : null;
}
function ensureIds(ids, onStep) {
  const files = [...new Set((ids || []).map(fileOfId).filter(f => f && !_ok[f]))];
  let done = 0;
  if (onStep) onStep(0, files.length);
  return Promise.all(files.map(f => loadShard(f).then(() => { if (onStep) onStep(++done, files.length); })));
}
let _searchLoad = null;
function ensureBankSearch() {
  if (!_searchLoad) _searchLoad = new Promise(res => {
    const s = document.createElement('script');
    s.src = 'data/banksearch.js';
    s.onload = () => res(true);
    /* ★加载失败必须**把 promise 缓存清掉**。原先 `_searchLoad` 一旦缓存住就再也不动，
       `onerror` 让它永远 resolve(false) → 调用方（render 里）判断 `!SIDX` 后又去 render，
       于是每次 render 都 `ensureBankSearch().then(render())`，无限重渲染把页面卡死。
       清空缓存还能让下次进来重试一次（CDN/文件丢失不是永久性的）。 */
    s.onerror = () => { _searchLoad = null; res(false); };
    document.head.appendChild(s);
  });
  return _searchLoad;
}

/* ============================ 粉笔同步数据 ============================
   fenbi-sync/sync.mjs 把粉笔的错题/收藏拉成本地文件，随 index.html 全量载入。
   做两件事：
   1) 题目并进 BANK/BANK_MAP —— 并进去之后错题本/收藏/搜索全部自动可用，
      因为它们都只认 BANK_MAP[id] 和 DB.wrong 里的 id。
   2) 粉笔的错题 id 导入 DB.wrong，但只导**没见过**的：
      你在本地手动移出错题本的题不会被下次同步再塞回来；粉笔新增的错题会被导进来。
   没跑过同步时 window.XCFENBI 不存在，本块静默跳过，旧功能零影响。 */
const FENBI = (typeof window !== 'undefined' && window.XCFENBI) || null;
function fenbiMerge() {
  const parts = (typeof window !== 'undefined' && window.XCFENBI_BANK) || [];
  parts.forEach(p => (p.q || []).forEach(q => { if (!BANK_MAP[q.id]) BANK.push(q); BANK_MAP[q.id] = q; }));
}
function fenbiImport() {
  if (!FENBI) return { wrong: 0, favs: 0 };
  /* 导入记录必须按列表分开记：同一道题既在错题本又在收藏夹是很常见的，
     共用一个集合会让后到的那侧被当成「已经导过」而漏掉。 */
  const norm = v => Array.isArray(v)
    ? { wrong: v.slice(), favs: [] }                       // 兼容旧的数组格式
    : { wrong: ((v && v.wrong) || []).slice(), favs: ((v && v.favs) || []).slice() };
  DB.fenbiImported = norm(DB.fenbiImported);
  const take = (key, ids, arr) => {
    const seen = new Set(DB.fenbiImported[key]);
    let n = 0;
    (ids || []).forEach(id => {
      if (seen.has(id)) return;
      seen.add(id); DB.fenbiImported[key].push(id);
      if (arr && !arr.includes(id)) { arr.push(id); n++; }
    });
    return n;
  };
  const wrong = take('wrong', FENBI.wrong, DB.wrong);
  const favs = take('favs', FENBI.favs, DB.favs);
  return { wrong, favs };
}
/* 注意：fenbiMerge()/fenbiImport() 不能在这里调用 —— load() 在文件末尾（app.js:1524 附近）
   用 `DB = Object.assign(blank(), d)` **整体替换** DB，会把这里塞进去的错题/收藏全冲掉。
   两个函数在 init 段 load() 之后调用。 */

/* 复习调度：记得 → 进阶；忘了 → 归零明天 */
function bumpReview(store, id, remembered) {
  if (!store.review) store.review = {};
  const r = store.review[id] || { stage: 0 };
  if (remembered) { r.stage = Math.min((r.stage || 0) + 1, REVIEW_STEPS.length); r.due = dayStart(REVIEW_STEPS[Math.min(r.stage, REVIEW_STEPS.length) - 1]); }
  else { r.stage = 0; r.due = dayStart(1); }
  store.review[id] = r;
  return r;
}
function countDue(store, ids) {
  let n = 0; const now = Date.now();
  for (const id of ids) { const r = store.review && store.review[id]; if (r && (r.due || 0) <= now) n++; }
  return n;
}
function bumpDay(field, n = 1) {
  const k = dayKey();
  DB.days[k] = DB.days[k] || { cards: 0, quiz: 0 };
  DB.days[k][field] = (DB.days[k][field] || 0) + n;
}

/* ============================ 3b. ★今日 N 张（m15150） ============================
   1853 张知识卡 + 241 期时政一张没看过 —— 这是目前最大的闲置资源（0/1853）。
   做法：每天按**薄弱模块**推 5 张该看的卡，看完就地做题验证。
   选卡是纯算术、0 token，同一天结果固定（缓存在 DB.daily5，跨天自动重算）。
   规则：
     ① 到期复习卡优先（艾宾浩斯的账不能欠）—— 最多占 2 席、每模块最多 1 张
     ② 其余取「没看过」的新卡，按薄弱权重降序 —— 每模块最多 2 席（别全挤在一个模块）
     ③ 同权重里「配了题」的排前面（能就地做题验证）
     ④ 还不够就按权重补满；实在没有就返回已有的几张 */
const CARD2MOD = {
  zhengzhi: '政治理论', changshi: '常识判断', shizheng: '常识判断',
  yanyu: '言语理解与表达', chengyu: '言语理解与表达', shici: '言语理解与表达',
  shuliang: '数量关系', panduan: '判断推理', tutui: '判断推理', ziliao: '资料分析'
};
/* ★题库里的 q.m 跟模块名对不齐（真机实测：言语的题 q.m 是「言语理解」，不是「言语理解与表达」）——
   两边都拿去查权重就会查成 0，结果最大的薄弱模块（言语 58 道错）一张卡都轮不到。
   所以按**子串**把题型归到知识卡模块，别对字符串。 */
const QM2CARD = [
  ['政治理论', ['zhengzhi']], ['常识', ['changshi']], ['时政', ['shizheng']],
  ['言语', ['yanyu', 'chengyu', 'shici']], ['数量', ['shuliang']],
  ['判断', ['panduan', 'tutui']], ['资料', ['ziliao']]
];
/* 薄弱权重（按题型）：给页头那行「薄弱优先：…」看 */
function weakness() {
  const w = {};
  (DB.wrong || []).forEach(id => {
    const q = BANK_MAP[id];
    if (q && q.m) w[q.m] = (w[q.m] || 0) + 1;
  });
  return w;
}
/* 薄弱权重（按知识卡模块）：选卡用 */
function weaknessCard() {
  const w = {};
  (DB.wrong || []).forEach(id => {
    const q = BANK_MAP[id];
    if (!q || !q.m) return;
    const hit = QM2CARD.find(x => q.m.indexOf(x[0]) >= 0);
    if (!hit) return;
    hit[1].forEach(cid => { w[cid] = (w[cid] || 0) + 1; });
  });
  return w;
}
function cardPool() {
  const out = [];
  (NOTES || []).forEach(mod => (mod.cards || []).forEach(c => out.push({ mod, card: c, cid: mod.id, sz: false })));
  (SHIZHENG || []).forEach(c => out.push({ mod: { id: 'shizheng', m: '时政月报', icon: '🗞️' }, card: c, cid: 'shizheng', sz: true }));
  return out;
}
function dailyCards(n) {
  n = Math.max(1, Math.min(20, Number(n) || 5));
  const pool = cardPool();
  const byId = {};
  pool.forEach(it => { byId[it.card.id] = it; });
  /* 同一天返回同一批（点进去看一半退出来，回来还是那几张） */
  const cached = DB.daily5 && DB.daily5.day === dayKey() && DB.daily5.n === n ? (DB.daily5.ids || []) : [];
  if (cached.length) {
    const got = cached.map(id => byId[id]).filter(Boolean);
    if (got.length) return got.slice(0, n);
  }
  const w = weaknessCard();          // ★按知识卡模块 —— 题库的 q.m 叫「言语理解」，卡模块叫「言语理解与表达」，直接查会查成 0
  const wOf = it => w[it.cid] || 0;
  const storeOf = it => it.sz ? DB.sz : DB;
  const isSeen = it => !!storeOf(it).seen[it.card.id];
  const isDue = it => { const r = storeOf(it).review && storeOf(it).review[it.card.id]; return !!(r && (r.due || 0) <= Date.now()); };
  const hasQ = it => !!(it.card.q && (it.card.q.id || it.card.q.q));
  const rank = (a, b) => wOf(b) - wOf(a) || (hasQ(b) ? 1 : 0) - (hasQ(a) ? 1 : 0);
  const dueList = pool.filter(isDue).sort(rank);
  const newList = pool.filter(it => !isDue(it) && !isSeen(it)).sort(rank);
  const out = [], per = {};
  const can = (it, cap) => out.length < n && !out.some(x => x.card.id === it.card.id) && (per[it.cid] || 0) < cap;
  const put = it => { per[it.cid] = (per[it.cid] || 0) + 1; out.push(it); };
  for (const it of dueList) { if (out.length >= Math.min(2, n)) break; if (can(it, 1)) put(it); }
  for (const it of newList) { if (out.length >= n) break; if (can(it, 2)) put(it); }
  for (const it of newList) { if (out.length >= n) break; if (can(it, 99)) put(it); }
  for (const it of dueList) { if (out.length >= n) break; if (can(it, 99)) put(it); }
  DB.daily5 = { day: dayKey(), n, ids: out.map(it => it.card.id), at: Date.now() };
  save();
  return out;
}
/* 今日这批的薄弱说明（给页头用）：错题最多的题型排前面 */
function dailyWhy() {
  const w = weakness();
  const top = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 3);
  return top.length ? '薄弱优先：' + top.map(m => m + ' ' + w[m] + ' 道错').join(' · ') : '按模块轮流';
}
/* ★今日知识卡配额（8 小时计划的硬指标）：每天 20 张，题库 1853 张约 93 天刷完一轮。
   注意 241 条时政**本来就在这 1853 里**（zhengzhi 那 319 张含时政 241），别再加一次。
   看满就自动勾掉任务面板上的「知识卡 20 张」，不用手点 —— 勾选这件事应该由事实决定，不由用户记账。 */
const CARD_QUOTA = 20;
function cardsToday() {
  const d = (DB.days && DB.days[dayKey()]) || {};
  return Number(d.cards) || 0;
}
/* 这一轮还剩几天看完（给页头那行「剩 X 天刷完一轮」看） */
function cardsRoundLeft() {
  let s = 0;
  (NOTES || []).forEach(m => (m.cards || []).forEach(c => { if (DB.seen[c.id]) s++; }));
  (SHIZHENG || []).forEach(c => { if (DB.sz && DB.sz.seen[c.id]) s++; });
  const totalAll = META.totalNotes + (META.shizhengTotal || 0);
  return { seen: s, total: totalAll, days: Math.max(0, Math.ceil((totalAll - s) / CARD_QUOTA)) };
}
/* 事实 → 任务面板：看满 20 张就勾掉，没看满就松开（跨天/重装也能自愈，不用手点） */
function tickCardsTask() {
  try {
    const on = cardsToday() >= CARD_QUOTA;
    if (window.PlanTick) window.PlanTick('cards', on, { DB: DB, saveNow: saveNow });
  } catch (e) { }
}

/* 测试口子（IIFE 里摸不到内部状态，探针从这里读） */
window.__xctermDaily = n => dailyCards(n).map(it => ({ id: it.card.id, t: String(it.card.t || '').slice(0, 24), mod: it.cid, sz: !!it.sz, q: !!(it.card.q && (it.card.q.id || it.card.q.q)), due: (() => { const st = it.sz ? DB.sz : DB; const r = st.review && st.review[it.card.id]; return !!(r && (r.due || 0) <= Date.now()); })() }));
window.__xctermWeakness = () => weakness();
window.__xctermDailyReset = () => { delete DB.daily5; save(); return 1; };
window.__xctermDailyState = () => JSON.parse(JSON.stringify(DB.daily5 || {}));
window.__xctermCardQuota = () => ({ quota: CARD_QUOTA, today: cardsToday(), round: cardsRoundLeft() });
window.__xctermTickCards = tickCardsTask;

/* ============================ 3. 导航 ============================
   Mineradio 式：粉笔是主功能，启动就进粉笔；旧功能整包收进「本地题库」一个模块。 */
const NAV = [
  { id: 'fenbi', icon: '🌸', label: '粉笔' },
  { id: 'ai', icon: '🤖', label: 'AI 讲师' },
  { id: 'local', icon: '📚', label: '本地题库' },
  { id: 'settings', icon: '⚙️', label: '设置' }
];
/* 这些路由不再占导航条，但照常能用（从「本地题库」里点进去）。
   命中它们时导航条高亮「本地题库」。 */
const LOCAL_ROUTES = ['home', 'overview', 'notes', 'deck', 'practice', 'exam', 'result', 'wrong', 'favs',
  'bianxi', 'shizheng', 'mind', 'stats', 'search', 'achv'];
function navActive(name) {
  if (NAV.some(n => n.id === name)) return name;
  return LOCAL_ROUTES.indexOf(name) >= 0 ? 'local' : '';
}
function renderNav(active) {
  const items = (window.Skin ? window.Skin.orderNav(NAV) : NAV);
  $('#nav').innerHTML = items.map(n => {
    return `<div class="rn ${n.id === active ? 'on' : ''}" data-go="${n.id}"><span class="ri">${n.icon}</span><span class="rt">${n.label}</span></div>`;
  }).join('');
}
function refreshBadges() { renderNav(navActive(parseHash().name)); }
/* 给 skin.js 用：改了导航顺序/显隐要立刻重画导航条 */
window.__xctermNav = refreshBadges;
/* ---------- 未做完的练习：随时回得去 ----------
   ★用户 m24510：「我做题的时候如果点到了设置，进去后想回去做题时题目就没了，只能重新做」。
   实测（_resume.mjs）：EXAM 一直好好地在内存里 —— 题、已答的选项、第几题全都没丢，
   **丢的只是入口**：顶部导航只有 粉笔/AI 讲师/本地题库/设置，没有任何一条能回到 #/exam，
   所以用户只能重开一场。这里补两件事：
     ① 顶部常驻一颗「接着做」胶囊（有未交卷的练习 + 当前不在答题页时才出现）
     ② 离开答题页期间**把这一场的钟停掉** —— 限时场按离开时长顺延 deadline/startedAt。
        不然去设置翻一会儿回来，限时场已经超时甚至被判超时交卷，那跟「题目没了」是一回事。 */
const RESUME_ON = () => /^#\/exam/.test(location.hash || '');
function resumeTick() {
  if (!EXAM || EXAM.submitted) { if (EXAM) EXAM.awayAt = 0; return; }
  if (RESUME_ON()) {
    const away = Number(EXAM.awayAt) || 0;
    if (!away) return;
    EXAM.awayAt = 0;
    const d = Date.now() - away;
    if (d > 1000) {                       /* 1 秒内的抖动忽略，免得来回切把表拧歪 */
      EXAM.startedAt = (Number(EXAM.startedAt) || Date.now()) + d;
      if (EXAM.deadline) EXAM.deadline = Number(EXAM.deadline) + d;
      EXAM.awayMs = (Number(EXAM.awayMs) || 0) + d;
    }
  } else if (!EXAM.awayAt) {
    EXAM.awayAt = Date.now();             /* 从答题页走开的那一刻开始停表 */
  }
}
function resumeChip() {
  const slot = $('#resume-slot');
  if (!slot) return;
  if (!EXAM || EXAM.submitted || RESUME_ON()) { slot.innerHTML = ''; return; }
  const n = (EXAM.list || []).length;
  const done = Object.keys(EXAM.ans || {}).length;
  slot.innerHTML = `<button class="resume-chip" id="resume-exam"
      title="这一场还没交卷 —— 点一下接着做（题目和已答的都在，离开期间不计时）">
      <span class="rc-ico">⏸</span><span class="rc-t">接着做</span>
      <span class="rc-s">第 ${Math.min(Number(EXAM.i) + 1, n)}/${n} 题 · 已答 ${done}</span>
      <span class="rc-go">▶ 继续</span></button>`;
  const b = $('#resume-exam');
  if (b) b.onclick = () => navigate('#/exam');
}
window.__xctermResume = { tick: resumeTick, chip: resumeChip, has: () => !!(EXAM && !EXAM.submitted), awayMs: () => (EXAM && Number(EXAM.awayMs)) || 0 };
const CRUMB = {
  home: '粉笔', overview: '学习概览', local: '本地题库', ai: 'AI 讲师',
  notes: '知识卡', deck: '知识卡', daily: '今日 5 张', pace: '配速训练', practice: '刷题', exam: '答题中', result: '练习结果', wrong: '错题本',
  favs: '收藏夹', fenbi: '粉笔', bianxi: '易混辨析', shizheng: '时政月报', mind: '思维导图', stats: '学习统计', search: '搜索', settings: '设置', achv: '成就'
};
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { navigate('#/' + go.dataset.go); }
});

/* ============================ 4. 路由 ============================ */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const seg = path.split('/').filter(Boolean);
  return { name: seg[0] || 'home', arg: seg[1] ? decodeURIComponent(seg[1]) : '', query: new URLSearchParams(query || '') };
}
const VIEWS = {};
function render() {
  resumeTick();                       /* ★先把离开期间的表补回来，再让 VIEWS.exam 去画计时 */
  const r = parseHash();
  const view = VIEWS[r.name] || VIEWS.fenbi;
  renderNav(navActive(r.name));
  $('#crumb').textContent = CRUMB[r.name] || '超频 OVERCLOCK';
  /* AI 讲师是整页嵌入（iframe 要占满 stage）—— 给 body 挂个标记，让 deep.css 把
     这一页的内边距收掉、并处理窗口太窄时的降级 */
  document.body.classList.toggle('ai-full', r.name === 'ai');
  const host = $('#view');
  host.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'page';
  host.appendChild(page);
  view(page, r);
  /* 成就追认：开一次应用就把历史数据过一遍，别等下次交卷才发现漏了 */
  if (window.Achv && !render.__achv) {
    render.__achv = 1;
    setTimeout(() => { try { Achv.check(DB, window.XCFENBI); } catch (e) { } }, 900);
    /* 学情记忆：12 小时一次，DeepTutor 在跑才写（用户 m15150「能提高公考成绩的优化」） */
    setTimeout(() => { try { autoStudyMemory(); } catch (e) { } }, 4200);
    setTimeout(() => { try { autoWeekly(); } catch (e) { } }, 5200);   /* 周一自动落周报 → 一起写进记忆 */
    /* 今日任务 AI 排程：一天一次，DeepTutor 在跑才排；排不出来就用默认七项（用户 m21810） */
    setTimeout(() => { try { autoPlan(false); } catch (e) { } }, 6400);
  }
  /* 交错入场的 --i 必须在首帧之前就位，否则动画先跑、stagger 就白做了 */
  if (window.Motion) { try { window.Motion.reapply(); } catch (e) { } }
  resumeChip();                       /* ★未交卷的练习：顶部给一颗「接着做」 */
  host.scrollTop = 0;
}
window.addEventListener('hashchange', render);

/* ============================ 5. 首页 ============================
   启动就进粉笔（Mineradio 式：连上账号直接用它的功能）。
   旧的学习概览挪到 #/overview，从「📚 本地题库」进。 */
VIEWS.home = (host, r) => VIEWS.fenbi(host, r);
VIEWS.overview = (host) => {
  const notesTotal = META.totalNotes;
  let seen = 0, marked = 0, due = 0;
  NOTES.forEach(mod => mod.cards.forEach(c => {
    if (DB.seen[c.id]) seen++;
    if (DB.marks[c.id]) marked++;
  }));
  NOTES.forEach(mod => { due += countDue(DB, mod.cards.map(c => c.id)); });
  const szIds = SHIZHENG.map(c => c.id);
  const szDue = countDue(DB.sz, szIds);
  const logs = DB.log.slice(-14);
  const rightAll = logs.reduce((a, s) => a + s.right, 0), totAll = logs.reduce((a, s) => a + s.total, 0);
  const days = Object.keys(DB.days).sort().slice(-14);
  const today = DB.days[dayKey()] || { cards: 0, quiz: 0 };

  host.innerHTML = `
  <div class="grid g2" style="grid-template-columns:1.35fr 1fr">
    <div class="card hero-deco" style="background:linear-gradient(135deg,#4a2026 0%,#2f2022 62%,#281b1d 100%);border:1px solid rgba(201,162,75,.5);color:#f2ead8;box-shadow:inset 0 0 0 3px #281b1d,inset 0 0 0 4px rgba(201,162,75,.30),0 12px 34px rgba(0,0,0,.45)">
      <div class="row between">
        <div>
          <div style="font-size:13px;opacity:.85">知识卡总进度</div>
          <div style="font-size:40px;font-weight:800;letter-spacing:0;margin-top:2px;font-family:var(--font-display);color:#f2ead8">${pct(seen, notesTotal)}<span style="font-size:18px;font-weight:600;opacity:.9">%</span></div>
          <div style="font-size:13px;opacity:.9">已看 ${seen} / ${notesTotal} · 已记住 ${marked}</div>
        </div>
        <div class="ring" style="--p:${pct(seen, notesTotal)};background:conic-gradient(#e8c86a calc(var(--p)*1%),rgba(201,162,75,.20) 0)">
          <i style="background:transparent;color:#e8c86a;font-size:14px">${pct(seen, notesTotal)}%</i>
        </div>
      </div>
      <div class="hr" style="background:linear-gradient(90deg,rgba(201,162,75,0),rgba(201,162,75,.5) 18%,rgba(201,162,75,.5) 82%,rgba(201,162,75,0))"></div>
      <div class="row wrap" style="gap:10px">
        <button class="btn" data-go="notes" style="background:linear-gradient(135deg,#e8c86a,#c9a24b);color:#1a0507;border:0;font-weight:800">📇 继续看卡</button>
        <button class="btn" data-review="1" style="background:rgba(201,162,75,.14);color:#f2ead8;border-color:rgba(201,162,75,.45)">⏰ 待复习 ${due + szDue}</button>
        <button class="btn" data-go="practice" style="background:rgba(201,162,75,.14);color:#f2ead8;border-color:rgba(201,162,75,.45)">✏️ 开始刷题</button>
      </div>
    </div>
    <div class="grid" style="gap:14px">
      <div class="grid g2" style="gap:14px">
        <div class="stat"><div class="v">${due + szDue}</div><div class="l">待复习卡片</div></div>
        <div class="stat"><div class="v">${DB.wrong.length}</div><div class="l">错题待消化</div></div>
        <div class="stat"><div class="v">${today.quiz}</div><div class="l">今日做题</div></div>
        <div class="stat"><div class="v">${totAll ? pct(rightAll, totAll) + '%' : '—'}</div><div class="l">近 14 次正确率</div></div>
      </div>
      <div class="card" style="padding:14px 16px">
        <div class="row between"><h3 style="margin:0">近 14 天学习量</h3><span class="dim" style="font-size:12px">做题 ${totAll} 题 · 练习 ${DB.log.length} 次</span></div>
        <div class="spark">${days.length ? days.map(d => { const v = (DB.days[d].quiz || 0) + (DB.days[d].cards || 0); const max = Math.max(...days.map(x => (DB.days[x].quiz || 0) + (DB.days[x].cards || 0)), 1); return `<i class="${v ? '' : 'zero'}" style="height:${clamp(v / max * 88, 4, 88)}px" title="${d}：${v}"></i>`; }).join('') : '<div class="dim" style="font-size:13px">还没有记录，今天开始吧</div>'}</div>
      </div>
      ${(() => {
        const cs = causeStat();
        if (!cs.total) return '';
        return `<div class="card" style="padding:14px 16px" id="cause-card">
        <div class="row between"><h3 style="margin:0">错因构成 <span class="dim" style="font-size:12px;font-weight:400">错题本 ${cs.total} 题</span></h3>
          <span class="dim" style="font-size:12px">${cs.none ? '还有 ' + cs.none + ' 题没标 · ' : ''}<a href="#/wrong">去标注 ›</a></span></div>
        <div class="cause-bars">
          ${CAUSE.map(c => `<div class="cb c-${c.k}"><span class="cb-l">${c.i} ${c.n}</span><div class="bar"><i style="width:${pct(cs[c.k], cs.total)}%"></i></div><b>${cs[c.k]}</b></div>`).join('')}
          <div class="cb cb-none"><span class="cb-l">⬜ 未标</span><div class="bar"><i style="width:${pct(cs.none, cs.total)}%"></i></div><b>${cs.none}</b></div>
        </div>
        <div class="dim" style="font-size:12px;margin-top:10px">${cs.total - cs.none === 0
            ? '还没标过错因 —— 在错题本里点一下「不会 / 粗心 / 没时间」，复习才知道该补哪儿'
            : cs.dunno >= cs.careless && cs.dunno >= cs.time
            ? '🤔 「不会」最多 —— 先把对应的知识卡补上，再重做这批错题'
            : cs.careless >= cs.time
              ? '😅 「粗心」最多 —— 不缺知识点，缺的是审题和算完回头看一眼'
              : '⏰ 「没时间」最多 —— 该练速度了，掐表做题'}</div>
      </div>`;
      })()}
    </div>
  </div>

  <div class="row between" style="margin:24px 0 12px"><h2 style="margin:0">今日 ${CARD_QUOTA} 张</h2><span class="dim" style="font-size:12.5px">今天已看 ${cardsToday()}/${CARD_QUOTA} · ${esc(dailyWhy())}</span></div>
  ${(() => {
    const d5 = dailyCards(CARD_QUOTA);
    const withQ = d5.filter(it => it.card.q && (it.card.q.id || it.card.q.q)).length;
    if (!d5.length) return `<div class="card" style="padding:16px 18px"><div class="dim" style="font-size:13px">🎉 该看的卡都看完了 —— 去 <a href="#/notes?review=1">复习到期的卡</a></div></div>`;
    return `<div class="card" style="padding:16px 18px;cursor:pointer" data-go="daily">
      <div class="row between" style="align-items:center;gap:12px">
        <div class="grow">
          <div style="font-weight:800;font-size:14.5px">${d5.slice(0, 5).map(it => esc(shorten(it.card.t || '', 12))).join(' / ')}${d5.length > 5 ? ' <span class="dim" style="font-weight:600">… 等 ' + d5.length + ' 张</span>' : ''}</div>
          <div class="dim" style="font-size:12px;margin-top:6px;line-height:1.7">按你错得最多的模块挑的 · ${withQ} 张配了题，看完就地验 · 今天看完就收工</div>
        </div>
        <button class="btn pri">开始今日 ${CARD_QUOTA} 张</button>
      </div>
    </div>`;
  })()}

  <div class="row between" style="margin:24px 0 12px"><h2 style="margin:0">知识卡模块</h2><span class="dim" style="font-size:12.5px">按考试逻辑排序 · 点模块进入</span></div>
  <div class="mods">
    ${NOTES.map(mod => {
      const ids = mod.cards.map(c => c.id);
      const s = ids.filter(id => DB.seen[id]).length;
      const d = countDue(DB, ids);
      return `<div class="mod" data-note="${mod.id}">
        <div class="mh"><div class="mi">${mod.icon}</div><div><div class="mn">${esc(mod.m)}</div><div class="ms">${mod.cards.length} 张 · 大纲 ${mod.groups.length} 组${d ? ' · ⏰' + d : ''}</div></div></div>
        <div class="mt"><span>已看 ${s}</span><span>${pct(s, ids.length)}%</span></div>
        <div class="bar mp"><i style="width:${pct(s, ids.length)}%"></i></div>
      </div>`;
    }).join('')}
  </div>

  <div class="row between" style="margin:24px 0 12px"><h2 style="margin:0">刷题与专项</h2></div>
  <div class="mods">
    ${BANK_MODS.map(b => `<div class="mod" data-practice="${b.mid}">
      <div class="mh"><div class="mi">✏️</div><div><div class="mn">${esc(b.m)}</div><div class="ms">${b.total} 题 · ${Object.keys(b.subs).length} 个题型</div></div></div>
      <div class="mt"><span>开始练习</span><span>›</span></div>
    </div>`).join('')}
    <div class="mod" data-go="shizheng"><div class="mh"><div class="mi">🗞️</div><div><div class="mn">时政月报</div><div class="ms">${SHIZHENG.length} 张 · 刘志学半月时政</div></div></div><div class="mt"><span>按期次看</span><span>›</span></div></div>
    <div class="mod" data-go="mind"><div class="mh"><div class="mi">🗺️</div><div><div class="mn">思维导图</div><div class="ms">图推体系 · 含图</div></div></div><div class="mt"><span>看图</span><span>›</span></div></div>
  </div>`;

  host.querySelectorAll('[data-note]').forEach(el => el.onclick = () => navigate('#/notes/' + el.dataset.note));
  host.querySelectorAll('[data-practice]').forEach(el => el.onclick = () => navigate('#/practice/' + el.dataset.practice));
  host.querySelectorAll('[data-review]').forEach(el => el.onclick = () => navigate('#/notes?review=1'));
};

/* ============================ 6. 知识卡：模块列表 / 翻卡 ============================ */
/* ==================== 5b. 📚 本地题库（旧功能收口） ====================
   用户要求「旧的东西都放在一个模块里面」—— 这里是它们唯一的入口，
   顶部导航不再铺开。所有旧路由照常可直达（#/wrong、#/notes …）。 */
VIEWS.local = (host) => {
  let seen = 0, due = 0;
  NOTES.forEach(mod => mod.cards.forEach(c => { if (DB.seen[c.id]) seen++; }));
  NOTES.forEach(mod => { due += countDue(DB, mod.cards.map(c => c.id)); });
  due += countDue(DB.sz, SHIZHENG.map(c => c.id));

  const nWrong = DB.wrong.length, nFav = DB.favs.length;
  const item = (icon, label, go, note, tag) => `
    <button class="card" data-go="${go}" style="text-align:left;cursor:pointer;padding:18px 18px">
      <div class="row" style="align-items:center;gap:12px">
        <div style="font-size:26px;line-height:1">${icon}</div>
        <div class="grow">
          <div style="font-weight:800;font-size:15px">${label}${tag ? ` <span class="dim" style="font-size:11px;font-weight:400">${tag}</span>` : ''}</div>
          <div class="dim" style="font-size:12px;margin-top:4px;line-height:1.6">${note}</div>
        </div>
        <div class="dim" style="font-size:16px">›</div>
      </div>
    </button>`;

  /* 外观设置里关掉的模块在这里就不出现（路由仍可直达） */
  const hide = id => !!(window.Skin && window.Skin.hidden(id));
  const cards = [
    ['daily', item('📅', '今日 5 张', 'daily', `按薄弱模块每天推 5 张该看的卡 · 看完就地做题验证`, '每天一批')],
    ['overview', item('📊', '学习概览', 'overview', `已看 ${seen} 张卡 · 待复习 ${due} · 错题 ${nWrong}`, '原首页')],
    ['notes', item('📇', '知识卡', 'notes', `${META.totalNotes} 张卡片 · 艾宾浩斯 1/2/4/7/15/30 天复习`, '')],
    ['practice', item('✏️', '刷题', 'practice', `14827 道真题（2017–2026 国考省考联考）`, '')],
    ['wrong', item('❌', '错题本', 'wrong', `${nWrong} 道待消化 · 按模块分组`, '')],
    ['favs', item('⭐', '收藏夹', 'favs', `${nFav} 道收藏题`, '')],
    ['bianxi', item('🔍', '易混辨析', 'bianxi', `3224 组 · 4638 个易混词`, '')],
    ['shizheng', item('🗞️', '时政月报', 'shizheng', `241 张月报卡`, '')],
    ['mind', item('🗺️', '图推思维导图', 'mind', `379 个节点 · 148 张图`, '')],
    ['stats', item('📈', '学习统计', 'stats', '正确率 · 学习曲线 · 模块分布', '')]
  ];

  host.innerHTML = `
  <h1>📚 本地题库</h1>
  <div class="dim" style="margin:6px 0 18px;font-size:13px;line-height:1.8">
    这些是原本地功能，全部保留、可用。粉笔那边的东西在
    <a href="#/fenbi">🌸 粉笔</a>。
  </div>
  <div class="grid" style="gap:12px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))">
    ${cards.filter(([id]) => !hide(id)).map(([, html]) => html).join('')}
  </div>
  ${cards.every(([id]) => hide(id)) ? '<div class="empty"><span class="big">🎨</span>模块全被关掉了 —— 去 <a href="#/settings">设置 → 外观自定义</a> 里打开。</div>' : ''}`;
};

VIEWS.notes = (host, r) => {
  if (r.arg) return deckView(host, r);
  const review = r.query.get('review') === '1';
  if (review) {
    // 全模块复习：汇总所有到期卡
    const list = [];
    NOTES.forEach(mod => mod.cards.forEach(c => {
      const rr = DB.review[c.id];
      if (rr && (rr.due || 0) <= Date.now()) list.push({ mod, card: c });
    }));
    const szList = SHIZHENG.filter(c => { const rr = DB.sz.review[c.id]; return rr && (rr.due || 0) <= Date.now(); }).map(c => ({ mod: { id: 'shizheng', m: '时政月报', icon: '🗞️' }, card: c, sz: true }));
    return deckRender(host, '复习', '所有到期卡片', list.concat(szList), true);
  }
  host.innerHTML = `
  <h1>知识卡</h1><div class="mut" style="font-size:13.5px">9 个模块 · ${META.totalNotes} 张卡 · 每张配题 + 艾宾浩斯复习</div>
  <div class="mods" style="margin-top:18px">
    ${NOTES.map(mod => {
      const ids = mod.cards.map(c => c.id);
      const s = ids.filter(id => DB.seen[id]).length, d = countDue(DB, ids);
      return `<div class="mod" data-note="${mod.id}">
        <div class="mh"><div class="mi">${mod.icon}</div><div><div class="mn">${esc(mod.m)}</div><div class="ms">${mod.cards.length} 张 · ${mod.cards.filter(c => c.q).length} 张配题${d ? ' · ⏰' + d : ''}</div></div></div>
        <div class="mt"><span>已看 ${s} · 未看 ${ids.length - s}</span><span>${pct(s, ids.length)}%</span></div>
        <div class="bar mp"><i style="width:${pct(s, ids.length)}%"></i></div>
      </div>`;
    }).join('')}
  </div>`;
  host.querySelectorAll('[data-note]').forEach(el => el.onclick = () => navigate('#/notes/' + el.dataset.note));
};

/* ---------- 易混辨析关联（data/bianximap.js 由 zhenti_build/build_bianxi_link.js 生成） ---------- */
function bxNormTitle(s) {
  return String(s || '')
    .replace(/^[\s\d.．、,，)）(（【\[「『]+/, '')
    .replace(/[\s（(【\[「『].*$/, '')
    .replace(/[。，,．.！!？?；;：:、·…—\-]+$/, '')
    .trim();
}
const BXM = (typeof window !== 'undefined' && window.BIANXIMAP) || null;
function bxDecode(i) {
  const s = String((BXM && BXM.W && BXM.W[i]) || '');
  const p = s.indexOf('␟');
  return p < 0 ? { w: s, d: '' } : { w: s.slice(0, p), d: s.slice(p + 1) };
}
function bxForCard(card) {
  if (!BXM || !BXM.T) return [];
  const t = bxNormTitle(card && card.t);
  const gis = BXM.T[t];
  if (!gis || !gis.length) return [];
  return gis.map(gi => {
    const ws = (BXM.G[gi] || []).map(bxDecode);
    return { gi, ws: ws.map(x => ({ w: x.w, d: x.d, cur: x.w === t })) };
  });
}
function bxBlockHtml(card) {
  const gs = bxForCard(card);
  if (!gs.length) return '';
  return `<div class="bxblock">
    <div class="bxhead">🔍 易混辨析<span class="bxsub">卡里这个词常和这 ${gs.length} 组放在一起考</span></div>
    ${gs.map(g => `<div class="bxgrp">
      <div class="bxwords">${g.ws.map(x => `<span class="bxw${x.cur ? ' cur' : ''}">${esc(x.w)}</span>`).join('<span class="bxsep">/</span>')}<span class="bxmore">释义 ▾</span></div>
      <div class="bxdefs" style="display:none">
        ${g.ws.map(x => `<div class="bxdef${x.cur ? ' cur' : ''}"><b>${esc(x.w)}</b>${esc(x.d)}${x.d.length >= (BXM.defLen || 32) ? '…' : ''}</div>`).join('')}
        <div class="bxact"><button class="chip" data-bx-open="${esc(g.ws[0].w)}">在辨析页看真题语境 →</button></div>
      </div>
    </div>`).join('')}
  </div>`;
}
function bindBx(host) {
  host.querySelectorAll('.bxgrp').forEach(el => {
    const head = el.querySelector('.bxwords'), defs = el.querySelector('.bxdefs');
    if (!head || !defs) return;
    head.onclick = e => { if (e.target && e.target.dataset && e.target.dataset.bxOpen) return; defs.style.display = defs.style.display === 'none' ? 'block' : 'none'; };
  });
  host.querySelectorAll('[data-bx-open]').forEach(el => {
    el.onclick = e => { e.stopPropagation(); navigate('#/bianxi?w=' + encodeURIComponent(el.dataset.bxOpen)); };
  });
}

function deckView(host, r) {
  const mod = NOTES.find(m => m.id === r.arg);
  if (!mod) { toast('模块不存在'); return navigate('#/notes'); }
  const startId = r.query.get('card') || '';
  let onlyUnseen = DB.settings.onlyUnseen;
  if (startId && DB.seen[startId]) onlyUnseen = false;  // 从搜索点进来的卡一定可见
  const ids = mod.cards.filter(c => onlyUnseen ? !DB.seen[c.id] : true).map(c => c.id);
  const list = ids.map(id => ({ mod, card: NOTE_MAP[id].card }));
  deckRender(host, mod.m, mod.icon, list, false, mod, onlyUnseen, startId);
}

/* 统一的翻卡视图（笔记卡 / 时政 / 复习） */
function deckRender(host, title, subtitle, list, isReview, mod, onlyUnseen, startId) {
  let idx = startId ? Math.max(0, list.findIndex(x => x.card.id === startId)) : 0;
  let showQ = false, picked = -1;
  const storeOf = item => item.sz ? DB.sz : DB;
  const curItem = () => list[idx];

  // ===== 知识卡正文：分块 + 重点标记 + 长文折叠 =====
  const NB_H1 = /^(\d{1,2})[.、]\s*(.+)$/;
  const NB_H2 = /^[（(](\d{1,2})[）)]\s*(.+)$/;
  const NB_LI = /^([①-⑳])\s*(.+)$/;
  const NB_TAG = /^【([^】]{1,18})】\s*(.*)$/;
  const NB_KV = /^([\u4e00-\u9fa5·]{2,8})[：:]\s*(.+)$/;
  // 重点词：句子里真的会考「是什么」的那些提法（通用表，政治理论向）
  const NB_KEY = /《[^》]{1,40}》|“[^”]{1,60}”|[12]\d{3}\s*年|(?:[一二三四五六七八九十]{1,3}|\d{1,2})届[\u4e00-\u9fa5]{0,4}中全会|根本原因|根本保证|根本立场|根本任务|根本目的|根本遵循|核心要义|本质要求|本质特征|本质属性|首要任务|第一要务|战略基点|出发点和落脚点|总目标|总任务|总要求|灵魂|法宝|里程碑|生命线|最大优势|显著优势|决定性作用|题中应有之义|关键一招/g;
  const NB_KEY_PLAIN = new RegExp(NB_KEY.source);   // 不带 g：只用来判断「这个词是不是通用表的」
  const NB_R = s => new RegExp(s, 'g');
  // ★用户 m08574 第 3 条：原来只有通用表，数量/图推/资料分析命中为 0，整页一个重点都不标。
  //   这里按模块追加**本模块的术语**，class 用 nb-kf（虚线底）跟通用表的 kk 区分开。通用表一字未动。
  const NB_TERM = {
    zhengzhi: NB_R('中国特色社会主义|中国式现代化|高质量发展|新质生产力|全过程人民民主|全面从严治党|人类命运共同体|四个自信|五位一体|四个全面|新发展理念|共同富裕|两个确立|两个维护|总体国家安全观'),
    ziliao: NB_R('增长率|增长量|基期|现期|比重|平均数|倍数|翻番|百分点|同比|环比|年均增长|成数|顺差|逆差|拉动增长|贡献率|指数|占比|百分数|中位数'),
    shuliang: NB_R('赋值|特值|比例|工程问题|行程问题|容斥|排列组合|概率|等差数列|等比数列|最值|极值|整除|余数|浓度|牛吃草|鸡兔同笼|年龄问题|周期问题|抽屉原理|植树问题|方阵|利润|折扣|和差倍比|代入排除|数字特性|不定方程|几何|统筹|基准数|最不利'),
    panduan: NB_R('搭桥|拆桥|因果倒置|另有他因|以偏概全|三段论|直言命题|真假话|逆否|必要条件|充分条件|翻译推理|对比实验|一般归因|时间对比|削弱|加强'),
    tutui: NB_R('对称|轴对称|中心对称|笔画|一笔画|奇点|叠加|同异|旋转|翻转|平移|面数|点数|线数|角数|封闭区域|曲直|开闭|部分数|交点|切点|黑白运算|位置规律|样式规律|属性规律|数量规律|外框'),
    yanyu: NB_R('主旨|对策|关联词|尾句|说理类|科普介绍类|新闻类|标题拟定|下文推断|语句填入|语句排序|细节判断|逻辑填空'),
    changshi: NB_R('遗址|文物|彩陶|玉器|青铜|铁器|石器|朝代|时期|战役|变法|条约|发明|著作|简称|别称|节气|行星|公转|自转|洋流|季风|盆地|高原|平原|丘陵|经济特区|货币政策|财政政策|通货膨胀|汇率|二十四节气|文化|文明|最早|唯一'),
    chengyu: NB_R('释义|近义|反义|易混|褒义|贬义|中性|感情色彩|语义轻重|适用对象|搭配|例句|同组|辨析|易考'),
    shici: NB_R('侧重|本义|多用于|语义轻重|适用对象|褒义|贬义|中性|辨析|同组'),
    shizheng: NB_R('全会|峰会|论坛|白皮书|联合声明|签署|协定|首次|首个|居世界首位|五年规划|新质生产力|高质量发展|一号文件|政府工作报告'),
  };
  let curMod = '';                 // 当前这张卡属于哪个模块（draw() 里每张卡刷新）
  // 标重点的**每卡预算**（不是每段）：原来按每段各 14 处，长卡会被标花。
  // 标题最多 2 处、「核心」速记最多 5 处、「讲解」正文合计最多 9 处 —— 一张卡最多 16 个重点。
  const HL = { title: 2, lead: 5, rest: 9 };
  let hlLeft = { title: HL.title, lead: HL.lead, rest: HL.rest };
  const keyRe = {};                // 模块 → 通用表+术语 合并后的正则（懒编译）
  function keysFor(id) {
    if (!NB_TERM[id]) return NB_KEY;
    if (!keyRe[id]) keyRe[id] = new RegExp(NB_KEY.source + '|' + NB_TERM[id].source, 'g');
    return keyRe[id];
  }
  function hl(s, kind) {
    const k = HL[kind] ? kind : 'rest';
    return esc(s).replace(keysFor(curMod), m => {
      if (hlLeft[k] <= 0) return m;
      hlLeft[k]--;
      let cls;
      if (/^[《“]/.test(m)) cls = 'kn';
      else if (/年$/.test(m) && /\d/.test(m)) cls = 'kd';
      else if (NB_KEY_PLAIN.test(m)) cls = 'kk';   // 通用表的「考点提法」
      else cls = 'kf';                             // 本模块术语
      return `<em class="${cls}">${m}</em>`;
    });
  }
  function noteBlocks(txt) {
    const out = [];
    for (const raw of String(txt || '').split('\n')) {
      const ln = raw.trim(); if (!ln) continue;
      let m;
      if ((m = ln.match(NB_H1))) out.push({ k: 'h1', n: m[1], t: m[2] });
      else if ((m = ln.match(NB_H2))) out.push({ k: 'h2', n: m[1], t: m[2] });
      else if (/[✅❌]/.test(ln)) { const mm = ln.match(NB_LI); out.push({ k: 'vd', n: mm ? mm[1] : '', t: mm ? mm[2] : ln }); }
      else if ((m = ln.match(NB_LI))) out.push({ k: 'li', n: m[1], t: m[2] });
      else if ((m = ln.match(NB_TAG))) out.push({ k: 'tag', n: m[1], t: m[2] });
      else if (ln.length <= 80 && (m = ln.match(NB_KV))) out.push({ k: 'tag', n: m[1], t: m[2] });
      else out.push({ k: 'p', t: ln });
    }
    return out;
  }
  // 单遍替换：分三次 replace 会把第一次插进去的 ❌ 再包一层
  function verdictHTML(t) {
    return esc(t).replace(/❌\s*→\s*([^✅❌]*)|✅|❌/g, (m, fix) => {
      if (fix != null) return `<b class="nb-no">❌</b><em class="nb-ar">→</em><u class="nb-fix">${fix}</u>`;
      return m === '✅' ? '<b class="nb-ok">✅</b>' : '<b class="nb-no">❌</b>';
    });
  }
  function blockHTML(b) {
    if (b.k === 'h1') return `<div class="nb-h1"><i>${esc(b.n)}</i><span>${hl(b.t)}</span></div>`;
    if (b.k === 'h2') return `<div class="nb-h2"><i>${esc(b.n)}</i><span>${hl(b.t)}</span></div>`;
    if (b.k === 'li') return `<div class="nb-li"><i>${esc(b.n)}</i><span>${hl(b.t)}</span></div>`;
    if (b.k === 'tag') return `<div class="nb-tag"><i>${esc(b.n)}</i><span>${hl(b.t)}</span></div>`;
    if (b.k === 'vd') return `<div class="nb-vd">${b.n ? `<i>${esc(b.n)}</i>` : ''}<span>${verdictHTML(b.t)}</span></div>`;
    return `<p class="nb-p">${hl(b.t)}</p>`;
  }
  function noteDetailHTML(txt) {
    const bs = noteBlocks(txt);
    const HEAD = 12, FOLD_OVER = 14;
    let cut = bs.length;
    if (bs.length > FOLD_OVER) {
      cut = Math.min(HEAD, bs.length);
      // 尽量切在「1./2.」大标题上，别把一节劈两半
      for (let i = cut; i >= Math.max(2, cut - 4); i--) if (bs[i] && bs[i].k === 'h1') { cut = i; break; }
    }
    const tail = bs.slice(cut);
    const more = tail.length ? `<details class="nb-fold"><summary>展开全部剩余 ${tail.length} 段</summary><div class="nb-fold-in">${tail.map(blockHTML).join('')}</div></details>` : '';
    return `<div class="qblocks">${bs.slice(0, cut).map(blockHTML).join('')}${more}</div>`;
  }

  function draw() {
    if (!list.length) {
      host.innerHTML = `<h1>${esc(title)}</h1><div class="card"><div class="empty"><span class="big">🎉</span>${isReview ? '没有到期的复习卡，休息一下' : '这组卡都看完啦'}<div style="margin-top:14px"><button class="btn" id="back">返回</button>${isReview ? '' : '<button class="btn ghost" id="all">看全部（含已看）</button>'}</div></div></div>`;
      const b = $('#back'); if (b) b.onclick = () => navigate(isReview ? '#/home' : '#/notes');
      const a = $('#all'); if (a) a.onclick = () => { DB.settings.onlyUnseen = false; save(); idx = 0; rebuildAll(); };
      return;
    }
    const it = curItem(), card = it.card, st = storeOf(it);
    curMod = (it.mod && it.mod.id) || (mod && mod.id) || '';   // 标重点按模块取术语表
    hlLeft = { title: HL.title, lead: HL.lead, rest: HL.rest };   // 每张卡重置标重点预算
    const isSeen = !!st.seen[card.id];
    if (!isSeen) { st.seen[card.id] = Date.now(); bumpDay('cards'); save(); tickCardsTask(); }
    const marked = !!st.marks[card.id];
    const rv = (st.review && st.review[card.id]) || { stage: 0 };
    const nextDays = REVIEW_STEPS[Math.min(rv.stage || 0, REVIEW_STEPS.length - 1)];
    const q = card.q;

    host.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <div class="deckhead">
        <span class="kb">${esc(title)}</span>
        <span class="kmeta">${esc(subtitle || '')} · ${idx + 1}/${list.length}${marked ? ' · ✓已记住' : ''}${isReview ? ' · ⏰复习' : ''}</span>
      </div>
      <div class="row" style="gap:8px">
        ${isReview ? '' : `<button class="chip ${onlyUnseen ? 'on' : ''}" id="tog-unseen">只看未看</button>`}
        <button class="chip" id="toggle-side">🙈 收起侧栏</button>
        <button class="chip" id="toggle-full">↕ 撑满一屏</button>
        <button class="chip" id="rand">🔀 随机</button>
        <button class="chip on" id="go-review">⏰ 复习</button>
      </div>
    </div>
    <div class="deckwrap">
      <div>
        <div class="qcard">
          <span class="qsec">${esc(card.sec || '')}</span>
          <div class="qtitle">${hl(card.t || '', 'title')}</div>
          ${card.b ? `<div class="qbody qlead"><span class="qlead-k">${card.d ? '核心' : (card.b.indexOf('\n') >= 0 ? '要点' : '核心')}</span><span>${hl(card.b, 'lead')}</span></div>` : ''}
          ${card.d ? noteDetailHTML(card.d) : ''}
          ${bxBlockHtml(card)}
          ${q ? (showQ ? `
            <div class="qstem">${stemHTML(q.q, q)}</div>
            ${figHTML(q)}
            ${(q.o || []).map((o, i) => {
              let cls = 'opt';
              if (picked >= 0) { if (qOK(q, i)) cls += ' right'; else if (i === picked) cls += ' wrong'; }
              return `<div class="${cls}" data-opt="${i}"><span class="k">${LETTERS[i]}</span><span>${esc(o)}</span></div>`;
            }).join('')}
            ${picked >= 0 ? `<div class="expl">${qOK(q, picked) ? '✅ 答对了，这张卡吃透了' : '❌ 正确答案 ' + qAns(q)}${q.ms ? '（多选）' : ''}${q.e ? '\n\n' + esc(q.e) : ''}${q.p ? `\n\n来源：${esc(q.p)}` : ''}</div>` : ''}
            ${q.id ? `<div class="row" style="margin-top:10px"><button class="btn xs" id="gotoq">🎯 去题库做这道题</button><span class="dim" style="font-size:11px">${esc((BANK_MAP[q.id] || {}).m || '')}</span></div>` : ''}
          ` : `<button class="btn ghost" id="showq" style="margin-top:18px">📝 配一道题练练${q.ms ? '（多选）' : ''} <span class="kbd">空格</span></button>`) : `<div class="dim" style="margin-top:18px;font-size:13px">💡 纯知识卡，读懂记住就好</div>`}
        </div>
        <div class="deckbar">
          <button class="btn" id="prev">← 上一张 <span class="kbd">←</span></button>
          ${isReview ? '<button class="btn" id="forget">😵 忘了</button>' : ''}
          <button class="btn ${marked ? '' : 'pri'}" id="mark">${marked ? '✓ 已记住（点一下取消）' : (isReview ? '记得，' + nextDays + '天后' : '标记已记住')} <span class="kbd">→</span></button>
          <button class="btn" id="next">下一张 →</button>
          <button class="btn" id="ask-ai" title="把这张知识卡交给 AI 讲师带背：它讲考点、真题怎么出、最容易混的是什么、给你一个记忆钩子">🤖 问 AI 讲师</button>
          <span class="grow"></span>
          <span class="dim" style="font-size:12px">${card.sec ? '大纲：' + esc(card.sec) : ''}</span>
        </div>
      </div>
      <div class="side">
        <h3>大纲定位</h3>
        <div class="outline" id="outline"></div>
        ${(isReview || !mod) ? '' : '<div class="hr"></div><h3>本组进度</h3><div class="bar"><i id="grp-bar"></i></div><div class="dim" id="grp-txt" style="font-size:12px;margin-top:7px"></div>'}
      </div>
    </div>`;

    // 大纲
    const groups = {};
    (mod ? mod.cards : list.map(x => x.card)).forEach(c => { groups[c.sec] = (groups[c.sec] || 0) + 1; });
    $('#outline').innerHTML = Object.keys(groups).map(g => `<div class="ol" data-sec="${esc(g)}"><span>${esc(g)}</span><span class="c">${groups[g]}</span></div>`).join('');
    const curSec = curItem().card.sec;
    host.querySelectorAll('.ol').forEach(el => {
      if (el.dataset.sec === curSec) el.classList.add('on');
      el.onclick = () => {
        const target = list.findIndex(x => x.card.sec === el.dataset.sec);
        if (target >= 0) { idx = target; showQ = false; picked = -1; draw(); }
      };
    });
    if (!isReview && mod) {
      const ids = mod.cards.map(c => c.id), s = ids.filter(id => DB.seen[id]).length;
      $('#grp-bar').style.width = pct(s, ids.length) + '%';
      $('#grp-txt').textContent = `已看 ${s} / ${ids.length}（${pct(s, ids.length)}%）· 待复习 ${countDue(DB, ids)}`;
    }
    // 事件
    const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    on('showq', () => { showQ = true; picked = -1; draw(); });
    on('gotoq', () => { const qq = curItem().card.q; if (qq && qq.id) showQuestion(qq.id); });
    on('ask-ai', () => {
      if (!window.Deep) return;
      const c = curItem().card, im = curItem().mod;
      window.Deep.open({ card: { mod: (im && (im.m || im.name || im.id)) || title || '', t: c.t, sec: c.sec, b: c.b, d: c.d } });
    });
    on('prev', () => { if (idx > 0) { idx--; showQ = false; picked = -1; draw(); } });
    on('next', () => { if (idx + 1 < list.length) { idx++; showQ = false; picked = -1; draw(); } else toast('这组看完了 🎉'); });
    on('rand', () => { shuffle(list); idx = 0; showQ = false; picked = -1; draw(); });
    on('tog-unseen', () => { if (!mod) return; DB.settings.onlyUnseen = !DB.settings.onlyUnseen; save(); navigate('#/notes/' + mod.id); });
    on('toggle-side', () => deckToggle(host, 'noSide'));
    on('toggle-full', () => deckToggle(host, 'readFull'));
    on('go-review', () => navigate('#/notes?review=1'));
    on('mark', () => {
      const st2 = storeOf(curItem()), id = curItem().card.id;
      const now = !st2.marks[id];
      if (now) st2.marks[id] = 1; else delete st2.marks[id];
      bumpReview(st2, id, now);
      save();
      if (now) { toast('已记住 ✓ ' + nextDays + ' 天后复习'); if (idx + 1 < list.length) { idx++; showQ = false; picked = -1; draw(); } else draw(); }
      else draw();
    });
    on('forget', () => {
      const st2 = storeOf(curItem()), id = curItem().card.id;
      bumpReview(st2, id, false); save(); toast('没事，明天再见它');
      if (idx + 1 < list.length) { idx++; showQ = false; picked = -1; draw(); } else draw();
    });
    host.querySelectorAll('[data-opt]').forEach(el => el.onclick = () => {
      if (picked >= 0 || !q) return;
      picked = +el.dataset.opt;
      if (!qOK(q, picked)) { /* 答错计入 */ }
      draw();
    });
    bindBx(host);
    deckFit(host);
  }
  function rebuildAll() {
    if (mod) {
      const ids = mod.cards.filter(c => DB.settings.onlyUnseen ? !DB.seen[c.id] : true).map(c => c.id);
      list.length = 0; ids.forEach(id => list.push({ mod, card: NOTE_MAP[id].card }));
    }
    idx = 0; showQ = false; picked = -1; draw();
  }
  draw();
  // 键盘
  window.__deckKeys = e => {
    if (!/^#\/(notes|daily|shizheng)/.test(location.hash)) return;
    if (e.key === 'ArrowLeft') { if (idx > 0) { idx--; showQ = false; picked = -1; draw(); } }
    else if (e.key === 'ArrowRight') { if (idx + 1 < list.length) { idx++; showQ = false; picked = -1; draw(); } }
    else if (e.key === ' ') { e.preventDefault(); const card = list[idx] && list[idx].card; if (card && card.q && !showQ) { showQ = true; picked = -1; draw(); } }
    else if (/^[1-4]$/.test(e.key)) { const it = list[idx]; if (it && it.card.q && showQ && picked < 0) { picked = +e.key - 1; draw(); } }
  };
}

/* 今日 N 张：按薄弱模块每天推 N 张该看的卡，看完就地做题验证（空格→配题，1-4 选，→ 标记住） */
VIEWS.daily = (host, r) => {
  const n = Math.max(1, Math.min(20, Number((r.query && r.query.get('n')) || CARD_QUOTA) || CARD_QUOTA));
  const picked = dailyCards(n);
  tickCardsTask();   /* ★顺手把「今天看满没」的事实同步给任务面板 */
  const rl = cardsRoundLeft();
  const w = weakness();
  const seenTotal = (() => { let s = 0; NOTES.forEach(m => m.cards.forEach(c => { if (DB.seen[c.id]) s++; })); (SHIZHENG || []).forEach(c => { if (DB.sz && DB.sz.seen[c.id]) s++; }); return s; })();
  const totalAll = META.totalNotes + (META.shizhengTotal || 0);
  if (!picked.length) {
    host.innerHTML = `<h1>今日 ${n} 张</h1>
      <div class="card" style="margin-top:16px;padding:22px">
        <div style="font-size:15px;font-weight:800">🎉 该看的卡都看完了</div>
        <div class="dim" style="margin-top:8px;font-size:13px;line-height:1.8">
          已看 ${seenTotal} / ${totalAll} 张。接下来可以去
          <a href="#/notes?review=1">⏰ 复习到期的卡</a>，或者
          <a href="#/practice">✏️ 刷题</a> / <a href="#/wrong">🧭 错题本</a>。
        </div>
      </div>`;
    return;
  }
  const withQ = picked.filter(it => it.card.q && (it.card.q.id || it.card.q.q)).length;
  deckRender(host, '今日 ' + n + ' 张',
    dailyWhy() + ' · 其中 ' + withQ + ' 张配了题（空格就地验） · 今天已看 ' + cardsToday() + '/' + CARD_QUOTA
      + ' · 已看 ' + seenTotal + '/' + totalAll + ' · 剩 ' + rl.days + ' 天刷完一轮',
    picked, false, null, false, (r.query && r.query.get('card')) || '');
};

/* ============================ 7. 刷题：设置 + 答题 ============================ */
let EXAM = null;
/* ★模块分项配速训练页：挑题量就开跑，一道题一个倒计时（到点自动换下一道） */
VIEWS.pace = (host, r) => {
  const mid = r.arg;
  const b = BANK_MODS.find(x => x.mid === mid);
  if (!b) {
    host.innerHTML = `<h1>⏱ 配速训练</h1>
      <div class="mut" style="font-size:13.5px;margin-top:6px">按模块专项练速度 —— 每道题单独倒计时，到点自动换下一道，练的就是「别恋战」</div>
      <div class="mods" style="margin-top:18px">
        ${BANK_MODS.map(x => `<div class="mod" data-pace="${x.mid}">
          <div class="mh"><div class="mi">⏱</div><div><div class="mn">${esc(x.m)}</div><div class="ms">每题定额 ${Number(MODULE_PACE[x.m]) || PACE_DEFAULT} 秒 · ${x.total} 题可练</div></div></div>
          <div class="mt"><span>开始练</span><span>›</span></div>
        </div>`).join('')}
      </div>`;
    host.querySelectorAll('[data-pace]').forEach(el => el.onclick = () => navigate('#/pace/' + el.dataset.pace));
    return;
  }
  const pace = Number(MODULE_PACE[b.m]) || PACE_DEFAULT;
  const slow = (DB.tries && Object.keys(DB.tries).length) ? (() => {
    const slowIds = Object.keys(DB.tries).filter(id => { const q = BANK_MAP[id]; return q && q.mid === mid && Number(DB.tries[id].ms) > pace * 1000; });
    return slowIds.length;
  })() : 0;
  const pick = n => {
    const btns = host.querySelectorAll('[data-n]');
    btns.forEach(el => el.classList.toggle('on', el.dataset.n === String(n)));
    const go = $('#pace-go');
    if (go) go.textContent = '▶ 开始 ' + n + ' 题 · 每题 ' + pace + ' 秒（总定额 ' + fmtClock(pace * 1000 * n) + '）';
    if (go) go.onclick = () => paceDrill(mid, n);
  };
  host.innerHTML = `
  <h1>⏱ ${esc(b.m)} 配速训练</h1>
  <div class="mut" style="font-size:13.5px;margin-top:6px">
    ${esc(b.m)} 考场公认配速 <b>${pace} 秒/题</b> · 共 ${b.total} 题可练${slow ? ` · 你以前有 <b>${slow}</b> 道这模块的题做过超时` : ''}
  </div>
  <div class="card" style="margin-top:16px">
    <h3>题量</h3>
    <div class="row wrap" id="ns">
      ${[5, 10, 15, 20].map(n => `<button class="chip${n === 10 ? ' on' : ''}" data-n="${n}">${n} 题</button>`).join('')}
    </div>
    <div class="hr"></div>
    <div class="dim" style="font-size:12.5px;line-height:1.9">
      规则很简单：<b>一道题一个倒计时</b>，到点自动跳到下一道没做的题，跳下去的题会被记成「超速」。
      这不是限时模考 —— 整场限时练的是取舍，<b>配速训练练的是单题别恋战</b>。
      做完出一份「配速账」，直接告诉你几道守住、几道超速、下次重点盯哪几道。
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn pri" id="pace-go">▶ 开始 10 题 · 每题 ${pace} 秒（总定额 ${fmtClock(pace * 1000 * 10)}）</button>
      <button class="btn ghost" data-go="practice">← 回刷题</button>
    </div>
  </div>
  <div class="card" style="margin-top:14px">
    <h3>各模块配速（考场公认）</h3>
    <div class="row wrap">
      ${BANK_MODS.map(x => `<button class="chip${x.mid === mid ? ' on' : ''}" data-pace="${x.mid}">${esc(x.m)} ${Number(MODULE_PACE[x.m]) || PACE_DEFAULT}s</button>`).join('')}
    </div>
  </div>`;
  host.querySelectorAll('[data-n]').forEach(el => el.onclick = () => pick(Number(el.dataset.n)));
  host.querySelectorAll('[data-pace]').forEach(el => el.onclick = () => navigate('#/pace/' + el.dataset.pace));
  pick(10);
};
VIEWS.practice = (host, r) => {
  const mid = r.arg;
  if (!mid) {
    host.innerHTML = `<h1>刷题</h1><div class="mut" style="font-size:13.5px">真题库 ${BIDX.total} 题 · ${BANK_MODS.length} 个模块（国考/省考真题，按题型分片存盘）</div>
    <div class="mods" style="margin-top:18px">
      ${BANK_MODS.map(b => `<div class="mod" data-mid="${b.mid}">
        <div class="mh"><div class="mi">✏️</div><div><div class="mn">${esc(b.m)}</div><div class="ms">${b.total} 题 · ${Object.keys(b.subs).length} 题型 · 配速 ${Number(MODULE_PACE[b.m]) || PACE_DEFAULT}s/题</div></div></div>
        <div class="mt"><span>错题 ${DB.wrong.filter(id => BANK_MAP[id] && BANK_MAP[id].mid === b.mid).length}</span>
          <span class="pace-go" data-pace="${b.mid}">⏱ 配速训练</span></div>
      </div>`).join('')}
    </div>`;
    host.querySelectorAll('[data-mid]').forEach(el => el.onclick = () => navigate('#/practice/' + el.dataset.mid));
    host.querySelectorAll('[data-pace]').forEach(el => el.onclick = e => { e.stopPropagation(); navigate('#/pace/' + el.dataset.pace); });
    return;
  }
  const b = BANK_MODS.find(x => x.mid === mid);
  if (!b) { toast('模块不存在'); return navigate('#/practice'); }
  let sub = '', count = 20, order = 'seq', scope = 'all';
  const pending = () => bankFiles(mid, sub).filter(f => !_ok[f]).length;
  const draw = () => {
    const busy = pending();
    host.innerHTML = `
    <h1>${esc(b.m)} <span class="dim" style="font-size:14px;font-weight:400">共 ${b.total} 题</span></h1>
    <div class="card" style="margin-top:16px">
      <h3>题型</h3>
      <div class="row wrap" id="subs"></div>
      <div class="hr"></div>
      <h3>题量</h3>
      <div class="row wrap" id="counts"></div>
      <div class="hr"></div>
      <h3>范围</h3>
      <div class="row wrap" id="scopes"></div>
      <div class="hr"></div>
      <h3>顺序</h3>
      <div class="row wrap" id="orders"></div>
      <div class="hr"></div>
      <div class="row between">
        <div class="dim" style="font-size:13px" id="preview">${busy ? `<span id="loadbar">题库载入中… ${bankFiles(mid, sub).length - busy}/${bankFiles(mid, sub).length}</span>` : ''}</div>
        <button class="btn pri" id="start" ${pending() ? 'disabled' : ''}>开始练习 →</button>
      </div>
    </div>`;
    $('#subs').innerHTML = `<div class="chip ${sub === '' ? 'on' : ''}" data-sub="">全部 <span class="n">${b.total}</span></div>` +
      Object.entries(b.subs).map(([k, v]) => `<div class="chip ${sub === k ? 'on' : ''}" data-sub="${esc(k)}">${esc(k)} <span class="n">${v}</span></div>`).join('');
    $('#counts').innerHTML = [10, 20, 30, 50, 0].map(c => `<div class="chip ${count === c ? 'on' : ''}" data-c="${c}">${c === 0 ? '全部' : c + ' 题'}</div>`).join('');
    $('#scopes').innerHTML = [['all', '全部题目'], ['wrong', `只练错题（${DB.wrong.filter(id => BANK_MAP[id] && BANK_MAP[id].mid === mid).length}）`], ['fav', `只练收藏（${DB.favs.filter(id => BANK_MAP[id] && BANK_MAP[id].mid === mid).length}）`]]
      .map(([k, l]) => `<div class="chip ${scope === k ? 'on' : ''}" data-scope="${k}">${l}</div>`).join('');
    $('#orders').innerHTML = [['seq', '顺序'], ['rand', '随机']].map(([k, l]) => `<div class="chip ${order === k ? 'on' : ''}" data-order="${k}">${l}</div>`).join('');
    const pool = poolOf(mid, sub, scope);
    const n = count === 0 ? pool.length : Math.min(count, pool.length);
    if (!busy) {
      $('#preview').textContent = pool.some(q => ZKEY(q))
        ? `本次将按「一篇材料 + 小题」整组抽取，约 ${n} 题（题库 ${pool.length} 题）`
        : `本次将从 ${pool.length} 题中抽取 ${n} 题`;
      $('#start').disabled = !n;
    }
    const bind = (sel, attr, set) => host.querySelectorAll(sel).forEach(el => el.onclick = () => { set(el.dataset[attr]); draw(); });
    bind('[data-sub]', 'sub', v => sub = v);
    bind('[data-c]', 'c', v => count = +v);
    bind('[data-scope]', 'scope', v => scope = v);
    bind('[data-order]', 'order', v => order = v);
    $('#start').onclick = () => {
      let pool = poolOf(mid, sub, scope).slice();
      let list;
      if (pool.some(q => ZKEY(q))) {
        /* 资料分析：按「一篇材料 + 若干小题」整组抽取，组内小题连续出现 */
        const gs = new Map(), solo = [];
        for (const q of pool) { const k = ZKEY(q); if (!k) { solo.push(q); continue; } if (!gs.has(k)) gs.set(k, []); gs.get(k).push(q); }
        for (const g of gs.values()) g.sort((a, b) => ((a.z && a.z.n) || 0) - ((b.z && b.z.n) || 0));   /* 组内按原卷题号排（分片是按题型存的） */
        let arr = [...gs.values()];
        if (order === 'rand') shuffle(arr);
        list = [];
        const cap = count === 0 ? Infinity : count;
        for (const g of arr) { if (list.length >= cap) break; list = list.concat(g); }
        if (count !== 0 && list.length < cap) list = list.concat(order === 'rand' ? shuffle(solo).slice(0, cap - list.length) : solo.slice(0, cap - list.length));
      } else {
        if (order === 'rand') shuffle(pool);
        list = pool.slice(0, n);
      }
      EXAM = { list, i: 0, ans: {}, submitted: false, mid, m: b.m, sub, startedAt: Date.now() };
      navigate('#/exam');
    };
    if (busy) loadAndDraw();
  };
  let loadingKey = '';
  const loadAndDraw = () => {
    const key = mid + '|' + sub;
    if (loadingKey === key) return;
    loadingKey = key;
    ensureBank(mid, sub, (done, total) => {
      if (loadingKey !== key) return;
      const el = document.getElementById('loadbar');
      if (el) el.textContent = `题库载入中… ${done}/${total}`;
      if (done === total) { loadingKey = ''; draw(); }
    });
  };
  draw();
};

function poolOf(mid, sub, scope) {
  let list = BANK.filter(q => q.mid === mid && (!sub || q.t === sub));
  if (scope === 'wrong') list = list.filter(q => DB.wrong.indexOf(q.id) >= 0);
  if (scope === 'fav') list = list.filter(q => DB.favs.indexOf(q.id) >= 0);
  return list;
}

VIEWS.exam = (host) => {
  if (!EXAM) return navigate('#/practice');
  const E = EXAM;
  const draw = () => {
    const q = E.list[E.i];
    traceView(E, q.id);          /* ★作答轨迹：这一题开始计时 */
    const picked = E.ans[q.id];
    const done = Object.keys(E.ans).length;
    /* 每画一次就把「新出现的答案」增量回传粉笔（见 fenbi-bridge.js） */
    if (window.FenbiBridge && E.fenbi) { try { window.FenbiBridge.record(E); } catch (e) { } }
    /* 资料分析：本组第几小题 / 共几题 */
    let zinfo = '';
    if (ZKEY(q)) {
      const g = E.list.filter(x => ZKEY(x) === ZKEY(q));
      const k = g.findIndex(x => x.id === q.id) + 1;
      if (k > 0) zinfo = `材料 ${q.z.g} · 第 ${k}/${g.length} 小题`;
    }
    host.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <div class="deckhead"><span class="kb">${esc(E.m)}</span><span class="kmeta">${E.sub ? esc(E.sub) + ' · ' : ''}第 ${E.i + 1}/${E.list.length} 题 · 已答 ${done}${zinfo ? ' · ' + esc(zinfo) : ''}</span></div>
      <div class="row" style="gap:8px">
        ${E.limit ? `<span class="xtime" id="xtimer">⏱ ${fmtClock(E.limit)}</span>` : ''}
        <span class="xtime sub" id="xtimer2" style="display:none"></span>
        <span class="xtime sub" id="xtimer3" style="display:none"></span>
        <button class="chip" id="quit">退出</button>
        <button class="chip" id="toggle-side">🙈 收起侧栏</button>
        <button class="chip" id="toggle-full">↕ 撑满一屏</button>
        <button class="chip on" id="submit">交卷 <span class="kbd">Enter</span></button>
      </div>
    </div>
    ${E.limit ? `<div class="xtimebar"><i id="xtimebar"></i></div>` : ''}
    <div class="deckwrap">
      <div>
        <div class="qcard">
          ${q.p || q.kd ? `<span class="qsec">${esc(q.p || '')}${q.kd ? (q.p ? ' · ' : '') + esc(q.kd) : ''}</span>` : ''}
          ${q.z && q.z.m ? ZLMAT(q) : (q.mat ? `<div class="qmat">${stemHTML(q.mat, q)}</div>` : '')}
          ${q.z && q.z.s ? ZLSTEM(q) : `<div class="qbody" style="margin-top:12px">${stemHTML(q.q, q)}</div>`}
          ${figHTML(q)}
          ${q.o.map((o, i) => `<div class="opt ${picked === i ? 'sel' : ''}" data-opt="${i}"><span class="k">${LETTERS[i]}</span>${o || '' ? `<span>${esc(OPTTEXT(q, o))}</span>` : ''}</div>`).join('')}
        </div>
        <div class="deckbar">
          <button class="btn" id="prev">← 上一题 <span class="kbd">←</span></button>
          <button class="btn" id="mark-fav">${DB.favs.indexOf(q.id) >= 0 ? '⭐ 已收藏' : '☆ 收藏'}</button>
          <button class="btn" id="ask-ai" title="把题干/选项/正确答案/你选的/错因一起交给 AI 讲师讲一遍">🤖 问 AI 讲师</button>
          <span class="grow"></span>
          <button class="btn pri" id="next">${E.i + 1 === E.list.length ? '最后一题' : '下一题'} → <span class="kbd">→</span></button>
        </div>
      </div>
      <div class="side">
        <h3>答题卡</h3>
        <div class="sheetgrid" id="sheet"></div>
        <div class="hr"></div>
        <div class="dim" style="font-size:12.5px;line-height:1.8">
          已答 <b>${done}</b> / ${E.list.length}<br>
          快捷键：<span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span><span class="kbd">4</span> 选项 · <span class="kbd">←</span><span class="kbd">→</span> 翻题 · <span class="kbd">Enter</span> 交卷
        </div>
      </div>
    </div>`;
    let prevG = null;
    $('#sheet').innerHTML = E.list.map((x, i) => {
      const g = ZKEY(x), gl = (x.z && x.z.g) ? x.z.g : '';
      const gs = (g && g !== prevG) ? ' gstart' : '';
      prevG = g;
      return `<div class="sn${gs} ${i === E.i ? 'cur' : (E.ans[x.id] != null ? 'done' : '')}" data-i="${i}"${gl ? ` title="材料 ${esc(gl)}"` : ''}>${i + 1}</div>`;
    }).join('');
    host.querySelectorAll('[data-opt]').forEach(el => el.onclick = () => { const i = +el.dataset.opt; tracePick(E, q.id, i); E.ans[q.id] = i; draw(); });
    host.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { E.i = +el.dataset.i; draw(); });
    const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    on('prev', () => { if (E.i > 0) { E.i--; draw(); } });
    on('next', () => { if (E.i + 1 < E.list.length) { E.i++; draw(); } else submit(); });
    on('mark-fav', () => { toggleFav(q.id); draw(); });
    on('ask-ai', () => askAI(q));
    on('toggle-side', () => deckToggle(host, 'noSide'));
    on('toggle-full', () => deckToggle(host, 'readFull'));
    on('quit', () => { if (confirm('退出本次练习？已答的题目不会记录。')) { timerStop(); EXAM = null; navigate('#/practice/' + E.mid); } });
    on('submit', () => submit());
    window.__examSubmit = () => submit(true);   /* ★到点自动交卷的入口：auto=true 不再弹「还有 X 题没答」 */
    window.__examGoto = (i) => {                /* ★模块硬时限到点，跳到下一模块 */
      const k = Math.max(0, Math.min(E.list.length - 1, Number(i) || 0));
      if (k === E.i) return false;
      E.i = k; draw(); return true;
    };
    timerStart(E);
    deckFit(host);
  };
  async function submit(auto) {
    const E2 = EXAM;
    timerStop();            /* ★限时：交卷就把倒计时停掉，别再触发第二次 */
    traceFlush(E2);          /* ★作答轨迹：正在看的那题时间结掉 */
    const unanswered = E2.list.filter(q => E2.ans[q.id] == null).length;
    if (!auto && unanswered && !confirm(`还有 ${unanswered} 题没答，确定交卷？`)) return;
    /* 盲做（粉笔智能组卷的新题）：本地没答案，先回传交卷，再拿粉笔解析回来判分 */
    if (E2.blind) {
      toast('交卷中，正在取粉笔解析…');
      if (window.FenbiBridge && E2.fenbi) { try { await window.FenbiBridge.finish(E2); } catch (e) { } }
      const g = window.FenbiBridge ? await window.FenbiBridge.grade(E2).catch(() => null) : null;
      if (!g || !g.ok) {
        toast('取不到粉笔解析：' + ((g && g.err) || '网络不通') + '，先不交卷，稍后再试');
        return;
      }
    }
    let right = 0;
    E2.list.forEach(q => {
      const mine = E2.ans[q.id];
      if (mine === q.a) right++;
      else if (mine != null) { /* 只有真在题库里的题才进错题本，智能组卷的新题不进（它在粉笔那边有自己的错题本） */
        if (BANK_MAP[q.id] && DB.wrong.indexOf(q.id) < 0) DB.wrong.push(q.id); }
    });
    E2.submitted = true; E2.right = right;
    E2.usedMs = Date.now() - (E2.startedAt || Date.now());   /* ★限时：结算页算「限时 vs 实际」用 */
    /* 🎵 趁用户手势把歌放起来（自动播放要吃手势，不能等渲染完再放）。
       歌只在结算画面放，离开 #/result 会自动停 —— 用户 m06028/m06031 定的。 */
    if (window.Song && Song.start) { try { Song.start(pct(right, E2.list.length)); } catch (e) { } }
    DB.log.push({ d: dayKey(), mid: E2.mid, m: E2.m, t: E2.sub, total: E2.list.length, right, at: Date.now(), startedAt: E2.startedAt || Date.now(), limit: E2.limit || 0, usedMs: E2.usedMs });
    if (DB.log.length > 500) DB.log = DB.log.slice(-500);
    /* ★本地做的这几笔记到粉笔考点树上（用户 m05778 第 4 条）：
       只有带粉笔考点 id 的练习才记（智能组卷 / 练错题 / 真题卷），
       本地题库的题对不上粉笔 keypointId，记了也是错的。 */
    const kpId = E2.fenbi && E2.fenbi.kpId;
    if (kpId) {
      DB.fbLocal = DB.fbLocal || {};
      const k = String(kpId), cur = DB.fbLocal[k] || { add: 0, right: 0 };
      cur.add += E2.list.length; cur.right += right;
      DB.fbLocal[k] = cur;
    }
    bumpDay('quiz', E2.list.length);
    save();
    /* ★错因自动标注：只补空位，手标过的不覆盖。顺手把作答轨迹落进 DB.tries。 */
    let ac = null;
    try { ac = autoCauseBatch(E2); } catch (e) { }
    if (ac && ac.filled) toast('🧭 按作答轨迹自动标了 ' + ac.filled + ' 道错因' + (ac.skipped ? '（手标的 ' + ac.skipped + ' 道没动）' : ''));
    /* ★逐题回写：把这一场每道答过的题记进 DeepTutor（AI 讲师那边才知道你做过什么）。 */
    pushAttempts(E2);
    /* ★每场自动复盘：错够 3 道才跑（省着花钱），不阻塞交卷。 */
    setTimeout(() => { try { autoReview(E2); } catch (e) { } }, 1500);
    /* 🏆 成就判定：题量 / 正确率保持 / 单次满分 / 超级成就都在这一枪里算 */
    if (window.Achv && Achv.check) { try { Achv.check(DB, window.XCFENBI); } catch (e) { } }
    /* 回传粉笔：剩下的作答推完 + 告诉它交卷（联网且这套题有粉笔句柄时才生效） */
    if (window.FenbiBridge && E2.fenbi && E2.fenbi.key && !E2.blind) {
      window.FenbiBridge.finish(E2).then(ok => {
        const st = window.FenbiBridge.state();
        toast(ok ? `已回传粉笔（${st.pushed} 题）` : ('回传粉笔没成功：' + (st.err || '未知原因')));
      }).catch(() => { });
    }
    /* 错题练习的回传：做对了同步移出粉笔错题本 */
    if (window.FenbiBridge && E2.fenbi && E2.fenbi.wrongSync) {
      window.FenbiBridge.syncWrong(E2.list, E2.ans).then(n => {
        if (n) toast(`已同步：${n} 道做对的题移出粉笔错题本`);
      }).catch(() => { });
    }
    navigate('#/result');
  }
  /* ★逐题回写（用户 m17670：「我在粉笔界面做题，DeepTutor 都能分析并总结记录」）。
     这一场每一道**答过的**题都送去 DeepTutor：upsert 算它的练习条目，再按对错推一次
     间隔重复 —— 错的 rating=again（约 10 分钟后就该再来），对的 rating=good（间隔拉长）。
     交卷不等它，后台跑完 toast 一句；失败也不吵人（AI 讲师没装/没起时静默跳过）。 */
  function pushAttempts(E2) {
    const items = (E2.list || []).filter(q => q && E2.ans[q.id] != null).map(q => {
      const T = traceOf(E2, q.id), mine = E2.ans[q.id];
      return {
        id: q.id,
        stem: q.q, options: q.o, answer: 'ABCDEFGH'[q.a],
        chosen: 'ABCDEFGH'[mine] || '',
        right: mine === q.a,
        explanation: q.e, module: q.m, from: '超频练习',
        cause: (DB.cause && DB.cause[q.id]) || '',
        /* ★作答轨迹一并送过去：AI 讲师才知道你是「不会」还是「没时间」还是「改错了」 */
        ms: T.ms, first: T.first == null ? '' : ('ABCDEFGH'[T.first] || ''),
        changed: T.picks.length > 1 && T.first !== mine,
        picks: T.picks.length
      };
    });
    if (!items.length) return;
    fetch('/deep/attempt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) })
      .then(r => r.json()).then(k => {
        if (!k || !k.reviewed) return;
        const wrong = items.filter(x => !x.right).length;
        toast('AI 讲师记下了 ' + k.reviewed + ' 道' + (wrong ? '（错的 ' + wrong + ' 道排进了「今天该复习」）' : ''));
      }).catch(() => { });
  }
  window.__xctermPushAttempts = pushAttempts;
  draw();
  window.__examKeys = e => {
    if (!/^#\/exam/.test(location.hash) || !EXAM) return;
    const q = EXAM.list[EXAM.i];
    if (/^[1-4]$/.test(e.key)) { const i = +e.key - 1; if (i < q.o.length) { tracePick(EXAM, q.id, i); EXAM.ans[q.id] = i; draw(); } }
    else if (e.key === 'ArrowLeft') { if (EXAM.i > 0) { EXAM.i--; draw(); } }
    else if (e.key === 'ArrowRight') { if (EXAM.i + 1 < EXAM.list.length) { EXAM.i++; draw(); } }
    else if (e.key === 'Enter') { EXAM.submitted ? null : ($('#submit') && $('#submit').click()); }
  };
};

/* 讲题思路块：考点 → 定位 / 步骤 / 易错（think_map：花生十三体系，按考点命中） */
function thinkHTML(q) {
  if (!q || !q.tk) return '';
  const t = q.tk;
  return `<div class="think">
    <div class="th-h">🧠 讲题思路${t.name ? ' · ' + esc(t.name) : ''}${q.kd ? `<span class="dim" style="font-weight:400">（考点：${esc(q.kd)}）</span>` : ''}</div>
    ${t.pos ? `<div class="th-r"><span class="th-k">定位</span>${esc(t.pos)}</div>` : ''}
    ${t.how ? `<div class="th-r"><span class="th-k">步骤</span>${esc(t.how)}</div>` : ''}
    ${t.pit ? `<div class="th-r"><span class="th-k">易错</span>${esc(t.pit)}</div>` : ''}
  </div>`;
}

/* ★每场自动复盘（用户 m18259：「可以那你操作吧复盘可以学习一下网上好评率很高的那些公考复盘思路」）。
   交卷之后把**这一场**交给 AI 讲师复盘一次（不是每题问一遍）。复盘方法写死在 server.mjs 的
   prompt 里：模块正确率找丢分大头 → 错因六分类 → 三问法逐题过 → 坑点清单 → 3-5 条明天就做的事。
   钱的护栏（和 server.mjs 那边一致，两边都卡才真的卡得住）：错的少于 3 道不跑、一场一次、
   一天封顶 4 场、失败静默不重试。跑完存 DB.reviews → 进学情记忆 + 结算页自己刷出来。
   ★放在顶层：VIEWS.exam 的 submit() 和 VIEWS.result 的结算卡片都要用它，塞进某个视图的
   闭包里另一头就看不见了（会 ReferenceError 把结算页整个打白）。 */
/* ★作答轨迹（第 1 步收尾，用户 m17670「我在粉笔界面做题每一次做题 DeepTutor 都能分析并总结记录」）。
   只记「最后选了哪个」不够：复盘里「E 时间不够」「F 假会」「本来对的改错了」这三类，
   必须知道每题**看了多久**、**第一直觉选的哪个**、**中途改过几次**才判得出来。
   所以每一题记：ms（看了多久）/ first（第一直觉）/ picks（每次点的选项）/ final（最终答案）。
   ★放顶层：VIEWS.exam 里采、VIEWS.result 里显示，塞进任何一边的闭包另一头就看不见。 */
function traceTouch(E, qid) {
  if (!E.trace) E.trace = {};
  if (!E.trace[qid]) E.trace[qid] = { ms: 0, first: null, picks: [] };
  return E.trace[qid];
}
/* 切到某题时开始计时（同一题反复重画不重复计时，靠 E.cur 判） */
function traceView(E, qid) {
  const now = Date.now();
  traceTouch(E, qid);
  if (E.cur === qid) return;
  if (E.cur != null && E.trace[E.cur]) E.trace[E.cur].ms += now - (E.curSince || now);
  E.cur = qid; E.curSince = now;
}
/* 每点一次选项记一笔（第一次 = 直觉，后面几次 = 改答案） */
function tracePick(E, qid, i) {
  const T = traceTouch(E, qid);
  if (T.first == null) T.first = i;
  T.picks.push(i);
}
/* 交卷前把正在看的那题的时间结掉 */
function traceFlush(E) {
  if (E.cur != null && E.trace && E.trace[E.cur]) {
    E.trace[E.cur].ms += Date.now() - (E.curSince || Date.now());
    E.curSince = Date.now();
  }
}
function traceOf(E, qid) {
  return (E && E.trace && E.trace[qid]) || { ms: 0, first: null, picks: [] };
}
/* 结算页每题后面的 ⏱ / 🔀 小标 */
function traceBadge(E, q) {
  const T = traceOf(E, q.id), mine = E.ans[q.id], out = [];
  if (T.ms >= 3000) out.push('⏱ ' + (T.ms >= 60000 ? Math.round(T.ms / 60000) + ' 分' : Math.round(T.ms / 1000) + ' 秒'));
  if (T.picks.length > 1 && T.first != null && mine != null && T.first !== mine) {
    const back = T.first === q.a && mine !== q.a;
    out.push('🔀 改过 ' + 'ABCDEFGH'[T.first] + '→' + 'ABCDEFGH'[mine] + (back ? '（改错了）' : ''));
  } else if (T.picks.length > 1) {
    out.push('🔀 犹豫过 ' + (T.picks.length - 1) + ' 次');
  }
  return out.map(s => `<span class="dim" style="font-size:11.5px;white-space:nowrap">${s}</span>`).join('');
}

/* ===================== ⏱ 限时模考（自主提分优化）=====================
   行测真正的敌人是时间：120 分钟 130+ 题，平均每题不到 55 秒 ——
   平时不限时练出来的「会做」，一到考场上就会变成「来不及做」。
   所以给牌组加一道倒计时：到点自动交卷，结算页告诉用户时间都花哪儿了，
   复盘 prompt 也会拿到「限时多少 / 实际用多少 / 超时空了几题」。
   ★放顶层：VIEWS.exam 画的时候启动、submit() 的时候停，塞进任何一边的闭包
   另一头都看不见。 */
/* ===== 模块硬时限（用户 m19645）=====
   考场上真正的病常常不是「不会做」，是「在某一个模块上失控」——言语磨了 45 分钟，
   资料分析就没时间了。所以按题型分别定额：每个模块一段配额，到点就提示并跳到下一
   模块的第一道没做的题（真考场上就该练这个反射）。
   ★配额按考场上公认配速给；开了整场限时就按比例缩放成刚好用完整场，没开限时就当作
     软目标（只提示跳题，不强制交卷）。 */
const MODULE_PACE = { '常识判断': 15, '政治理论': 15, '言语理解与表达': 45, '判断推理': 50, '资料分析': 70, '数量关系': 60 };
const PACE_DEFAULT = 45;   /* 认不出来的题型按 45 秒/题 */
/* 这个考点你以前做对过吗 —— 用来分「知识盲区」（压根不会）和「方法不对」（这块懂，这题没走对）。
   只翻自己落盘的作答记录（DB.tries），不花 API 钱。 */
function kdKnown(q) {
  const kp = q && kpOf(q);
  if (!kp) return false;
  const T = DB.tries || {};
  let seen = 0, right = 0;
  for (const id in T) {
    if (id === q.id) continue;
    const q2 = BANK_MAP[id];
    if (!q2 || kpOf(q2) !== kp) continue;
    const t = T[id];
    if (!t || t.ans == null) continue;
    seen++;
    if (t.ans === q2.a) right++;
  }
  return seen > 0 && right * 2 >= seen;
}
/* ★错因自动标注（m15150 自主提分优化）。
   错因是复盘 prompt、学情「我的错因构成」、按错因特训筛选、AI 补洞出题这四件事的共同输入，
   可错题本里 161 道全没标 —— 光等手标，等于这四个功能一直在吃空数据。
   这里只拿**作答轨迹**推（第一直觉 / 改过几次 / 用多久 / 有没有答 / 这个考点以前对没对过），
   不猜、不花 API 钱。规则按先后顺序，第一条命中就停，返回的是**六分类**里的键：
     空着没答              → time    来不及做 / 跳过了
     第一直觉对、被自己改错  → misread 会做，看漏了条件把自己改错了
     改了 3 次以上          → fake    反复改 = 没吃透，是「假会」
     15 秒内就下结论        → time    蒙的，题干都没读完
     磨到配速 2.5 倍以上     → time    会做但太慢，最后没时间检查
     其余答错              → blind / method  这个考点以前对过 = 方法不对，没对过 = 知识盲区
   ★只补空位，用户手标过的永远不覆盖 —— 他的一句话比任何猜测都准。 */
function autoCause(q, T, mine, paceMs, known) {
  if (mine == null) return 'time';
  if (T && T.first != null && T.first === q.a && mine !== q.a && (T.picks || []).length > 1) return 'misread';
  if (T && (T.picks || []).length > 3) return 'fake';
  if (T && T.ms > 0 && T.ms < 15000) return 'time';
  if (T && paceMs && T.ms > paceMs * 2.5) return 'time';
  return known ? 'method' : 'blind';
}
/* 交卷时批量补错因，并把这场的轨迹落进 DB.tries（免得交卷就丢了） */
function autoCauseBatch(E2) {
  const out = { wrong: 0, filled: 0, skipped: 0 };
  DB.cause = DB.cause || {}; DB.tries = DB.tries || {};
  (E2.list || []).forEach(q => {
    if (!q) return;
    const T = traceOf(E2, q.id), mine = E2.ans[q.id];
    DB.tries[q.id] = { ms: T.ms, first: T.first, picks: (T.picks || []).slice(), ans: mine, at: Date.now() };
    if (mine === q.a) return;
    out.wrong++;
    if (DB.cause[q.id]) { out.skipped++; return; }
    const pace = (Number(MODULE_PACE[q.m]) || PACE_DEFAULT) * 1000;
    DB.cause[q.id] = autoCause(q, T, mine, pace, kdKnown(q));
    out.filled++;
  });
  save();
  return out;
}
window.__xctermAutoCause = autoCause;
window.__xctermAutoCauseBatch = autoCauseBatch;
/* ★快速标错因（m15150）：错题本里那 161 道全空着手标太慢 —— 一道一屏、六选一、按 1-6 就能
   一分钟过几十道。历史欠账没有作答轨迹可推（轨迹从这一版才开始落盘），瞎猜等于编数据，
   所以老老实实给个最快的标法；新做的题交卷时 autoCauseBatch 已经按轨迹自动补过了。 */
let _causeDrill = null;
function causeDrill(ids) {
  const todo = (ids || []).filter(id => !(DB.cause && DB.cause[id]));
  if (!todo.length) { toast('没有待标错因的题 —— 都标完了'); return; }
  if (_causeDrill) _causeDrill.close();
  const root = document.createElement('div');
  root.className = 'cause-drill';
  root.innerHTML = `<div class="cd-card">
    <div class="cd-top"><b>🧭 快速标错因</b><span class="dim" id="cd-n"></span><span class="grow"></span><button class="btn xs" id="cd-x">✕ 关闭</button></div>
    <div class="cd-q" id="cd-q"></div>
    <div class="cd-o" id="cd-o"></div>
    <div class="cd-b" id="cd-b"></div>
    <div class="dim" style="font-size:12px;margin-top:10px">按 <b>1</b> 不会 · <b>2</b> 粗心 · <b>3</b> 没时间 · <b>空格</b> 跳过 · <b>Esc</b> 退出</div>
  </div>`;
  document.body.appendChild(root);
  let i = 0, done = 0;
  const pick = k => {
    if (k) { setCause(todo[i], k); done++; }
    i++;
    if (i >= todo.length) return close();
    render();
  };
  const key = e => {
    if (e.key === 'Escape') return close();
    if (e.key === ' ') { e.preventDefault(); return pick(''); }
    const k = ({ 1: 'blind', 2: 'method', 3: 'fake', 4: 'misread', 5: 'slip', 6: 'time' })[e.key];
    if (k) { e.preventDefault(); pick(k); }
  };
  function close() {
    root.remove();
    document.removeEventListener('keydown', key, true);
    _causeDrill = null;
    toast('标好 ' + done + ' 道错因');
  }
  _causeDrill = { close };
  function render() {
    const id = todo[i];
    const q = BANK_MAP[id];
    $('#cd-n').textContent = (i + 1) + ' / ' + todo.length + ' · 已标 ' + done;
    $('#cd-q').innerHTML = q ? stemHTML(q.q, q) : '<span class="dim">这道题的题干没载入（题库分片里没有）</span>';
    $('#cd-o').innerHTML = q ? (q.o || []).map((t, k) => `<div class="cd-li${k === q.a ? ' right' : ''}">${'ABCDEFGH'[k]}　${esc(t)}</div>`).join('') : '';
    $('#cd-b').innerHTML = CAUSE.map(c => `<button class="cd-pick" data-k="${c.k}">${c.i} ${c.n}<small>${esc(c.d)}</small></button>`).join('') + `<button class="cd-pick skip" data-k="">跳过</button>`;
    $('#cd-b').querySelectorAll('[data-k]').forEach(el => el.onclick = () => pick(el.dataset.k));
    $('#cd-x').onclick = close;
  }
  const missing = todo.filter(id => !BANK_MAP[id]);
  (missing.length ? ensureIds(missing, () => { }) : Promise.resolve()).then(render).catch(render);
  document.addEventListener('keydown', key, true);
}
window.__xctermCauseDrill = causeDrill;
/* 测试口子：错因自动标注 / 快速标错因（探针要能读到 DB 里的因果结果，IIFE 里 DB 是摸不到的） */
window.__xctermCauseOf = id => (DB.cause || {})[id] || '';
window.__xctermCauseAll = () => JSON.parse(JSON.stringify(DB.cause || {}));
window.__xctermCauseSet = m => { DB.cause = Object.assign({}, m || {}); save(); return JSON.parse(JSON.stringify(DB.cause)); };
window.__xctermTriesSet = m => { DB.tries = Object.assign({}, m || {}); save(); return JSON.parse(JSON.stringify(DB.tries)); };
window.__xctermCauseBar = id => causeBarHTML(id);
window.__xctermCauseSum = ids => causeSumHTML(ids);
window.__xctermKdKnown = qid => { const q = BANK_MAP[qid]; return q ? kdKnown(q) : false; };
window.__xctermTries = () => JSON.parse(JSON.stringify(DB.tries || {}));
window.__xctermCauseStat = ids => causeStat(ids);
window.__xctermBankIds = n => BANK.slice(0, n || 8).map(q => q.id);
window.__xctermBankById = id => { const q = BANK_MAP[id]; return q ? { id: q.id, m: q.m, t: q.t || '', kd: q.kd || '', a: q.a, o: (q.o || []).length } : null; };
/* 题干横线还原（供探针直接验规则，不必等 DOM） */
window.__xctermStemHTML = (s, q) => stemHTML(s, q);
window.__xctermBlankW = q => blankW(q);
/* 全库横线体检：真实空白段数 vs 真画出来的横线数（言语分片里假空极少，两者该基本相等） */
window.__xctermEnsureBank = (mid, sub) => ensureBank(mid, sub);
window.__xctermBlankScan = (n, re) => {
  const rx = re ? new RegExp(re) : /^y/;
  let q = 0, blanks = 0, drawn = 0, skipped = [];
  for (const item of BANK.slice(0, n || 4000)) {
    if (!rx.test(item.id)) continue;
    const s = String(item.mat || '') + '\n' + String(item.q || '');
    const runs = (s.match(/[ \t\u00a0]+/g) || []).length;
    if (!runs) continue;
    const d = (stemHTML(s, item).match(/qblk/g) || []).length;
    q++; blanks += runs; drawn += d;
    if (d < runs && skipped.length < 40) {
      /* 把**被吞掉的那几段**抓出来（不是前几段），方便人工确认它们确实是换段/缩进假空 */
      const ctxs = [];
      const re2 = /[ \t\u00a0]+/g; let m;
      while ((m = re2.exec(s)) && ctxs.length < 20) {
        const b = m.index > 0 ? s[m.index - 1] : '', a = m.index + m[0].length < s.length ? s[m.index + m[0].length] : '';
        const swallow = b === '\n' || b === '\r'
          || BLANK_CIRCLED.test(b) || BLANK_CIRCLED.test(a)
          || (BLANK_AFTER_P.test(b) && !BLANK_Q(item));
        if (swallow) ctxs.push(`${b || '^'}|\u2423\u00d7${m[0].length}|${a || '$'}`);
      }
      skipped.push({ id: item.id, runs, d, kd: String(item.kd || '').slice(0, 24), ctx: ctxs.join('   ') });
    }
  }
  return { q, blanks, drawn, skipped };
};
window.__xctermCauseClear = ids => { DB.cause = DB.cause || {}; (ids || []).forEach(id => { delete DB.cause[id]; }); save(); return (DB.cause && ids && ids.length) || 0; };
function modSegs(E) {
  const list = (E && E.list) || [];
  const segs = [];
  list.forEach((q, i) => {
    const nm = String(q.m || '其他');
    const last = segs[segs.length - 1];
    if (last && last.name === nm) { last.to = i; last.n++; }
    else segs.push({ name: nm, from: i, to: i, n: 1 });
  });
  let raw = 0;
  segs.forEach(s => { s.raw = (Number(MODULE_PACE[s.name]) || PACE_DEFAULT) * s.n; raw += s.raw; });
  const total = Number(E && E.limit) || 0;
  segs.forEach(s => { s.budget = Math.max(1000, total ? Math.round(s.raw / Math.max(1, raw) * total) : s.raw * 1000); });
  let acc = 0;
  segs.forEach(s => { s.start = acc; acc += s.budget; s.idx = segs.indexOf(s); });
  return segs;
}
/* 当前这一段 + 剩余毫秒；used = 这场已经用了多久 */
function modAt(E, used) {
  const segs = modSegs(E);
  if (!segs.length) return null;
  let cur = segs.find(s => used < s.start + s.budget);
  if (!cur) cur = segs[segs.length - 1];
  return { segs, cur, left: cur.start + cur.budget - used, over: used - (cur.start + cur.budget) };
}
let _tmr = null, _tmrFor = null;
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(Number(ms) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return (h ? h + ':' + p(m) : String(m)) + ':' + p(ss);
}
function timerStop() { if (_tmr) { clearInterval(_tmr); _tmr = null; _tmrFor = null; } }
function timerStart(E) {
  if (!E || E.submitted) return;
  /* ★没开整场限时也要跑：模块硬时限（软目标，只提示跳题）才是治「言语磨太久」的那件事；
     ★配速训练（E.paceMs）也是每题单独倒计时，同样要跑 */
  const segs0 = modSegs(E);
  if (!E.limit && !E.paceMs && segs0.length < 2) return;
  if (E.limit && !E.deadline) E.deadline = (E.startedAt || Date.now()) + Number(E.limit);
  if (_tmrFor === E) return;          /* 同一场已经在跑了就别重开（draw() 每点一下都会调） */
  timerStop(); _tmrFor = E;
  const tick = () => {
    /* ★离开答题页就把自己停掉。原先 `_tmr` 只在 `submit()` 和退出按钮里 `timerStop()`，
       走 hashchange 离开 `#/exam` 时 interval 还在跑，到点就触发 `window.__examSubmit()`
       把人拽进结果页（幽灵自动交卷）。 */
    if (!/^#\/exam/.test(location.hash || '')) { timerStop(); return; }
    const used = Date.now() - (E.startedAt || Date.now());
    const left = E.limit ? E.deadline - Date.now() : Infinity;
    const el = document.getElementById('xtimer');
    if (el && E.limit) {
      el.textContent = '⏱ ' + fmtClock(left);
      el.className = 'xtime' + (left < 60000 ? ' hot' : left < 5 * 60000 ? ' warm' : '');
      const bar = document.getElementById('xtimebar');
      if (bar) bar.style.width = Math.max(0, Math.min(100, left / Number(E.limit) * 100)) + '%';
    }
    /* 模块硬时限：这一段的配额用完就跳到下一段的第一道没做的题 */
    const m2 = document.getElementById('xtimer2');
    if (m2) {
      const M = modAt(E, used);
      if (M && M.segs.length > 1) {
        const s = M.cur;
        m2.style.display = '';
        m2.textContent = '▮ ' + s.name + ' ' + fmtClock(M.left);
        m2.className = 'xtime sub' + (M.left < 15000 ? ' hot' : M.left < 45000 ? ' warm' : '');
        if (M.left <= 0 && s.idx < M.segs.length - 1) {
          if (!E.modOver) E.modOver = [];
          if (E.modOver.indexOf(s.name) < 0) E.modOver.push(s.name);
          /* 下一段里第一道没答的题；都答了就跳下一段开头 */
          const nx = M.segs[s.idx + 1];
          let go = nx.from;
          for (let i = nx.from; i <= nx.to; i++) { if (E.ans[E.list[i].id] == null) { go = i; break; } }
          try { toast('⏱ 「' + s.name + '」时间到 —— 跳下一模块'); } catch (e) { }
          if (window.__examGoto) { try { window.__examGoto(go); } catch (e) { } }
        }
      } else { m2.style.display = 'none'; }
    }
    /* ★模块分项配速训练（E.paceMs）：每题单独倒计时 —— 把 MODULE_PACE 反过来用。
       单模块专项练速度，一道题到点就换下一道，练的就是「别恋战」。 */
    const m3 = document.getElementById('xtimer3');
    if (m3 && E.paceMs) {
      const cur = E.list[E.i];
      if (cur) {
        if (E.curQ !== cur.id) { E.curQ = cur.id; E.qAt = Date.now(); }
        const qLeft = Number(E.paceMs) - (Date.now() - (E.qAt || Date.now()));
        m3.style.display = '';
        m3.textContent = '⏲本题 ' + fmtClock(qLeft);
        m3.className = 'xtime sub' + (qLeft < 0 ? ' hot' : qLeft < Number(E.paceMs) * 0.35 ? ' warm' : '');
        if (qLeft <= 0 && !E.submitted) {
          if (!E.paceOver) E.paceOver = [];
          if (E.paceOver.indexOf(cur.id) < 0) E.paceOver.push(cur.id);
          let go = -1;
          for (let i = E.i + 1; i < E.list.length; i++) { if (E.ans[E.list[i].id] == null) { go = i; break; } }
          try { toast('⏲这题超了配速 —— 换下一题'); } catch (e) { }
          if (go >= 0 && window.__examGoto) { try { window.__examGoto(go); } catch (e) { } }
          else if (window.__examSubmit) { try { window.__examSubmit(); } catch (e) { } }
        }
      }
    } else if (m3) { m3.style.display = 'none'; }
    if (E.limit && left <= 0) {
      timerStop();
      try { toast('⏱ 时间到 —— 自动交卷'); } catch (e) { }
      if (window.__examSubmit) { try { window.__examSubmit(); } catch (e) { } }
    }
  };
  tick();
  _tmr = setInterval(tick, 500);
}
window.__xctermTimerStart = timerStart;
window.__xctermFmtClock = fmtClock;
window.__xctermModSegs = modSegs;   /* 测试口子：模块硬时限的配额分段 */
window.__xctermModAt = modAt;
/* 测试口子：探针要能看见当前这一场的限时状态（EXAM 在 IIFE 里，外面拿不到） */
window.__xctermExamState = () => ({
  has: !!EXAM,
  limit: EXAM ? Number(EXAM.limit) || 0 : 0,
  deadline: EXAM && EXAM.deadline ? Number(EXAM.deadline) : 0,
  startedAt: EXAM ? Number(EXAM.startedAt) || 0 : 0,
  usedMs: EXAM ? Number(EXAM.usedMs) || 0 : 0,
  submitted: !!(EXAM && EXAM.submitted),
  running: !!_tmr,
  /* 探针用：这一场的题目 id（验「连着点两次不会发同一组题」） */
  ids: EXAM && EXAM.list ? EXAM.list.map(q => q && q.id) : []
});
/* 结算页的时间分析条：告诉用户「时间都花哪儿了」——
   不限时时看不出慢在哪，限了时才知道是真会还是抢出来的会。 */
function timeStrip(E, usedMs, perQ, overMs, total) {
  const rows = (E.list || []).map(q => {
    const T = traceOf(E, q.id) || {};
    return { q, ms: Number(T.ms) || 0, n: (T.picks || []).length, right: E.ans[q.id] === q.a };
  }).filter(x => x.ms > 0).sort((a, b) => b.ms - a.ms).slice(0, 5);
  const blank = (E.list || []).filter(q => E.ans[q.id] == null).length;
  const slow = rows.length ? `
    <div class="xslow"><b>最慢的 ${rows.length} 题</b>
      ${rows.map((x, i) => `<div class="xslow-row"><span class="rk">${i + 1}</span><span class="tt">${esc(String(x.q.q || x.q.mat || '').slice(0, 26))}${String(x.q.q || '').length > 26 ? '…' : ''}</span><span class="mm">${fmtClock(x.ms)}</span><span class="tag ${x.right ? 'ok' : 'bad'}">${x.right ? '对' : '错'}</span>${x.n > 1 ? `<span class="tag" title="改过答案">🔀 ${x.n} 次</span>` : ''}</div>`).join('')}
    </div>` : '';
  /* 模块硬时限：哪一段失控了 —— 行测考场上「言语磨太久」比「不会做」更致命 */
  const segs = modSegs(E);
  const overMods = (E.modOver || []);
  const modRow = segs.length > 1 ? `
    <div class="xslow"><b>各模块配额（按考场上公认配速：常识/政治理论 15s · 言语 45s · 判断 50s · 数量 60s · 资料 70s）</b>
      ${segs.map(s => `<div class="xslow-row"><span class="tt">${esc(s.name)}</span><span class="mm">${s.n} 题 · 定额 ${fmtClock(s.budget)}</span><span class="tag ${overMods.indexOf(s.name) >= 0 ? 'bad' : 'ok'}">${overMods.indexOf(s.name) >= 0 ? '超了，被跳过' : '守住'}</span></div>`).join('')}
    </div>` : '';
  /* ★配速训练（E.paceMs）：每题 vs 定额的账 —— 单模块专项练速度的验收条 */
  const paceMs = Number(E.paceMs) || 0;
  const overQ = (E.paceOver || []);
  const paceRow = paceMs ? `
    <div class="xslow"><b>配速账（每题定额 ${Math.round(paceMs / 1000)}s · ${esc(E.m || '')} 专项）</b>
      <div class="xslow-row"><span class="tt">守住配速的题</span><span class="mm">${(E.list || []).length - overQ.length} / ${(E.list || []).length}</span><span class="tag ok">达标</span></div>
      ${overQ.length ? `<div class="xslow-row"><span class="tt">超了配速、被换下去的题</span><span class="mm">${overQ.length} 题</span><span class="tag bad">练的就是这个</span></div>` : ''}
      ${overQ.length ? `<div class="xslow-row"><span class="tt">${overQ.map(id => esc(String(((E.list || []).find(x => x.id === id) || {}).q || '').slice(0, 18))).join('、')}</span><span class="mm">下一遍重点盯</span><span class="tag bad">超速</span></div>` : ''}
    </div>` : '';
  return `
  <div class="xstrip">
    <div class="xitem"><b>${E.limit ? fmtClock(E.limit) : (paceMs ? fmtClock(paceMs * (E.list || []).length) : '—')}</b><span>限 时</span></div>
    <div class="xitem"><b>${fmtClock(usedMs)}</b><span>实际用时</span></div>
    <div class="xitem"><b>${perQ}s</b><span>平均每题</span></div>
    <div class="xitem"><b>${E.limit ? (overMs > 0 ? '+' + fmtClock(overMs) : '够用') : (paceMs ? overQ.length + ' 题超速' : '不限时')}</b><span>超 时</span></div>
  </div>
  ${paceRow}
  ${overMods.length ? `<div class="xwarn">⏱ 模块失控：${overMods.map(esc).join('、')} 用完了定额被跳过 —— 下次这几个模块到点就跳，别恋战。</div>` : ''}
  ${overMs > 0
    ? `<div class="xwarn">⏱ 超时 ${fmtClock(overMs)}${blank ? `，还剩 ${blank} 题没来得及做` : ''} —— 行测考场上这就是直接丢的分。下次给每类题定个硬时限，到点就跳。</div>`
    : (E.limit
      ? (blank === 0
        ? `<div class="xok">✅ 在限时 ${fmtClock(E.limit)} 内做完了全部 ${total} 题，还剩 ${fmtClock(Number(E.limit) - usedMs)}。</div>`
        : `<div class="xwarn">⏱ 时间没超（还剩 ${fmtClock(Number(E.limit) - usedMs)}），但空着 ${blank} 题没做 —— 空着的题就是白丢的分，不会做也先蒙一个。</div>`)
      : (blank > 0 ? `<div class="xwarn">空着 ${blank} 题没做 —— 考场上不会做也要蒙一个，蒙还有 1/4 的胜算。</div>` : ''))}
  ${modRow}
  ${slow}`;
}
/* 测试口子：造一场限时牌组（探针用；不动用户数据，题从本地题库现取）。
   ★mid 可以是逗号分隔的多个模块（'changshi,yanyu,ziliao'）—— 模块硬时限要跨题型才看得见。 */
window.__xctermStartTimedExam = async (mid, sub, limitMs, n) => {
  try {
    const want = String(mid || '').split(',').map(s => s.trim()).filter(Boolean);
    const total = Math.max(1, Number(n) || 8);
    const list = [];
    if (want.length > 1) {
      /* ★每个模块各取几道。两个坑都踩过：
         ① 用 q.mid 去跟模块 id 对字符串 —— 对不上就一个都取不到；
         ② BANK 是 const 数组，loadShard 一直往里 append（不清空），从 BANK[0] 扫的话
            第二个模块还是在拿第一个模块的题 → 真机报 mods:1。
         正确做法：记录加载前后 BANK 的长度，只从**这一模块新装进来的那一段**里取。 */
      const per = Math.max(2, Math.ceil(total / want.length));
      for (const m of want) {
        const before = BANK.length;
        try { await ensureBank(m, ''); } catch (e) { continue; }
        let k = 0;
        for (let i = before; i < BANK.length && k < per && list.length < total; i++) {
          const q = BANK[i];
          if (list.indexOf(q) >= 0) continue;
          list.push(q); k++;
        }
      }
    }
    if (!list.length) {
      await ensureBank(want[0] || mid, sub);
      for (const q of BANK) { if (list.length >= total) break; if (list.indexOf(q) < 0) list.push(q); }
    }
    if (!list.length) return { ok: false, reason: 'bank empty' };
    EXAM = {
      list, i: 0, ans: {}, submitted: false, mid: '', m: '限时模考',
      sub: '验证用', startedAt: Date.now(),
      limit: Number(limitMs) > 0 ? Number(limitMs) : 55000 * list.length
    };
    navigate('#/exam');
    return { ok: true, n: list.length, limit: EXAM.limit, mods: Array.from(new Set(list.map(q => q.m))).length };
  } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
};
/* ★模块分项配速训练（m15150）：把 MODULE_PACE 反过来用 —— 单模块专项练速度。
   「言语磨了 45 分钟」这种病得单独练：一道题一个倒计时，到点就换下一道，练的就是别恋战。
   这里的题不进错题本、不喂复盘，纯练速度。 */
/* ---------- 专项 / 配速的选题器 ----------
   ★用户 m24503：「我按了这个进去写题目写完了，之后再点进去还是同一组的题目」。
   原因：paceDrill / modDrill 原来都是
     for (const q of BANK) { if (list.length >= total) break; if (q.mid === want) list.push(q); }
   —— 直接取 BANK 里的**前 N 条**，而 BANK 的顺序就是分片加载顺序，永远一样，
   所以每次点都是同一批题，写完再进还是它。
   现在按三条挑：
     ① 先挑**没交过卷**的（DB.tries 里没有 —— 交卷时每题都会写进去），做过的排后面
     ② 两边都洗牌（Fisher–Yates），不再有「永远是那批」的固定顺序
     ③ 排掉**刚刚那一场**的题（EXAM.list）—— 连着点两次也不会拿到同一组
   实在不够时才允许重复，但绝不返回空。 */
function drillPick(pool, total) {
  const done = DB.tries || {};
  const avoid = new Set(((EXAM && EXAM.list) || []).map(q => q && q.id).filter(Boolean));
  const fresh = [], used = [];
  for (const q of pool) {
    if (!q || !q.id) continue;
    if (avoid.has(q.id)) { used.push(q); continue; }
    (done[q.id] ? used : fresh).push(q);
  }
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const out = shuffle(fresh).slice(0, total);
  if (out.length < total) out.push(...shuffle(used).slice(0, total - out.length));
  return out;
}
function paceDrill(mid, n) {
  const want = String(mid || '').trim();
  const total = Math.max(3, Math.min(40, Number(n) || 10));
  const m = (BANK_MODS.find(x => x.mid === want) || {});
  const pace = (Number(MODULE_PACE[m.m]) || PACE_DEFAULT) * 1000;
  return ensureBank(want, '').then(() => {
    /* ★选题走 drillPick：先没做过的、再洗牌、并排掉刚做完那一场（见它上面的注释） */
    const list = drillPick(BANK.filter(q => q.mid === want), total);
    if (!list.length) return { ok: false, reason: 'bank empty' };
    EXAM = {
      list, i: 0, ans: {}, submitted: false, mid: want,
      m: (m.m || want) + ' 配速', sub: '每题定额 ' + Math.round(pace / 1000) + ' 秒 · 到点换下一题',
      startedAt: Date.now(), paceMs: pace, paceOver: [], pace: true
    };
    navigate('#/exam');
    return { ok: true, n: list.length, paceMs: pace, mod: m.m || want };
  }, e => ({ ok: false, reason: String(e && e.message || e) }));
}
window.__xctermStartPace = paceDrill;window.__xctermPaceState = () => ({
  pace: !!(EXAM && EXAM.pace),
  paceMs: EXAM ? Number(EXAM.paceMs) || 0 : 0,
  over: EXAM && EXAM.paceOver ? EXAM.paceOver.slice() : [],
  curQ: EXAM ? String(EXAM.curQ || '') : '',
  i: EXAM ? Number(EXAM.i) || 0 : 0
});

/* ★同类考点连刷（m15150）：错一道就吃透一类。
   题库里每道题都带 `kd`（知识点）和 `t`（题型小类），同考点的题是一批一批的 ——
   从错题 / 知识卡直接长出一批同考点的题连着做，比漫无目的刷 20 道有用得多。 */
function kpOf(q) { return String((q && (q.kd || q.t)) || ''); }
/* 两个知识点共用几个前导词 —— 题库的 kd 是分层的（「新思想 其他建设 重要会议讲话」
   和「新思想 其他建设」是一支，跟「新思想 五位一体建设 …」不是一支） */
function kdShare(a, b) {
  const A = String(a || '').split(/\s+/).filter(Boolean), B = String(b || '').split(/\s+/).filter(Boolean);
  let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
  return { n: i, key: A.slice(0, i).join(' ') };
}
/* ★同类考点连刷：返回 { list, level, key, label }。
   level 是**按什么凑的**，标题必须照实写 —— 别拿种子的知识点当标题、结果整批是别的考点。 */
function sameKpList(seed, n) {
  n = Math.max(2, Math.min(30, Number(n) || 8));
  const kp = kpOf(seed);
  const out = [seed];
  const push = q => { if (q !== seed && out.indexOf(q) < 0 && out.length < n) out.push(q); };
  /* ① 同一个知识点 */
  if (kp) for (const q of BANK) { if (out.length >= n) break; if (q.mid === seed.mid && kpOf(q) === kp) push(q); }
  if (out.length >= n) return { list: out, level: 'kd', key: kp, label: kp };
  /* ② 同一支知识点（共用前导词） */
  const want = Math.min(2, kp.split(/\s+/).filter(Boolean).length);
  if (want > 0) {
    for (const q of BANK) {
      if (out.length >= n) break;
      if (q.mid !== seed.mid) continue;
      const s = kdShare(kp, kpOf(q));
      if (s.n >= want) push(q);
    }
    if (out.length >= 2) {
      const keys = out.map(kpOf).reduce((a, b) => kdShare(a, b).key || a, kp);
      return { list: out, level: 'kdp', key: keys, label: keys || kp };
    }
    out.length = 1;
  }
  /* ③ 同题型小类 */
  if (seed.t) {
    for (const q of BANK) { if (out.length >= n) break; if (q.mid === seed.mid && q.t === seed.t) push(q); }
    if (out.length >= 2) return { list: out, level: 't', key: seed.t, label: '同类题型 · ' + seed.t };
    out.length = 1;
  }
  /* ④ 同模块兜底 */
  for (const q of BANK) { if (out.length >= n) break; if (q.mid === seed.mid) push(q); }
  return { list: out, level: 'mid', key: seed.mid, label: '同模块 · ' + (seed.m || seed.mid) };
}
function kpDrill(qid, n) {
  const go = () => {
    const seed = BANK_MAP[qid];
    if (!seed) return { ok: false, reason: '题目没载入' };
    const got = sameKpList(seed, n);
    if (got.list.length < 2) return { ok: false, reason: '同考点的题不够' };
    startExam(got.list, '同类考点连刷 · ' + got.label, null);
    return { ok: true, n: got.list.length, kp: got.key, level: got.level, mid: seed.mid };
  };
  if (BANK_MAP[qid]) return Promise.resolve(go());
  return new Promise(res => { try { ensureIds([qid], () => res(go())); } catch (e) { res({ ok: false, reason: String(e && e.message || e) }); } });
}
window.__xctermKpDrill = kpDrill;
window.__xctermSameKp = (qid, n) => { const s = BANK_MAP[qid]; if (!s) return []; const g = sameKpList(s, n); return { level: g.level, label: g.label, list: g.list.map(q => ({ id: q.id, kd: kpOf(q), t: q.t, m: q.m })) }; };
window.__xctermKpOf = qid => { const s = BANK_MAP[qid]; return s ? kpOf(s) : ''; };
function examKey(E) {
  return String(E.mid || 'local') + ':' + Number(E.startedAt || 0) + ':' + (E.list || []).length;
}
function reviewItems(E) {
  return (E.list || []).map(q => {
    const mine = E.ans[q.id];
    const T = traceOf(E, q.id);
    return {
      id: q.id, stem: q.q, options: q.o,
      answer: 'ABCDEFGH'[q.a] || '',
      chosen: mine == null ? '' : ('ABCDEFGH'[mine] || ''),
      right: mine === q.a,
      explanation: q.e, module: q.m,
      cause: (DB.cause && DB.cause[q.id]) || '',
      /* ★作答轨迹：复盘 prompt 靠这三个判「时间不够 / 假会 / 本来对的改错了」 */
      ms: T.ms,
      first: T.first == null ? '' : ('ABCDEFGH'[T.first] || ''),
      changed: T.picks.length > 1 && T.first !== mine
    };
  });
}
function autoReview(E, manual) {
  const items = reviewItems(E);
  const bad = items.filter(x => !x.right).length;
  if (!items.length) return;
  if (!manual && bad < 3) return;   /* 没什么可复盘的，别花这个钱 */
  const key = examKey(E);
  /* 手动再点一次 = 用户明确要求重讲，绕过「一场一次」的去重（但一天 4 场的封顶照样卡着） */
  const again = manual && !!(DB.reviews || []).some(x => x.key === key);
  const body = {
    key, force: again, m: E.m, sub: E.sub,
    blank: items.filter(x => !x.chosen).length,
    /* ★限时：复盘要知道「是真不会还是来不及」—— 限时 30 分用了 45 分，那是时间管理问题 */
    limit: E.limit ? Math.round(Number(E.limit) / 60000) : 0,
    over: E.limit ? Math.max(0, Math.round(((Number(E.usedMs) || 0) - Number(E.limit)) / 60000)) : 0,
    mods: (E.modOver || []).slice(),   /* 模块硬时限：哪几段用完定额被跳过了 */
    mins: Math.max(1, Math.round((Number(E.usedMs) || (Date.now() - (E.startedAt || Date.now()))) / 60000)),
    items
  };
  if (manual) toast('让 AI 讲师复盘这一场…（十几秒）');
  fetch('/deep/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json()).then(k => {
      if (!k) return;
      if (!k.ok) { if (manual && k.reason) toast(k.reason); return; }
      DB.reviews = [{
        key, at: k.at, m: E.m, sub: E.sub, total: items.length,
        right: items.filter(x => x.right).length, text: k.text
      }].concat((DB.reviews || []).filter(x => x.key !== key)).slice(0, 8);
      save();
      pushStudyMemory({ silent: true });   /* 顺手把带复盘结论的学情推过去，讲师开聊就能接着讲 */
      if (location.hash.indexOf('#/result') === 0) render();
      toast('AI 讲师复盘完了 —— 结算页往下翻「🧭 这一场的复盘」');
    }).catch(() => { /* AI 讲师没装/没起：静默跳过，不吵人 */ });
}
window.__xctermAutoReview = autoReview;
window.__xctermTracePick = tracePick;
window.__xctermTraceOf = traceOf;

VIEWS.result = (host) => {
  if (!EXAM || !EXAM.submitted) return navigate('#/practice');
  const E = EXAM;
  const total = E.list.length;
  const p = pct(E.right, total);
  const blank = E.list.filter(q => E.ans[q.id] == null).length;
  const wrong = total - E.right - blank;
  const wrongPct = pct(wrong, total);
  const usedMs = Number(E.usedMs) || (Date.now() - (E.startedAt || Date.now()));
  const mins = Math.max(1, Math.round(usedMs / 60000));
  const perQ = Math.round(usedMs / 1000 / Math.max(1, total));   /* ★平均每题秒数：行测的生死线 */
  const overMs = E.limit ? Math.max(0, usedMs - Number(E.limit)) : 0;
  const verdict = p >= 90 ? '🏆 干得漂亮，这一组吃得挺透'
    : p >= 75 ? '👍 稳住了，再磨磨边角'
      : p >= 60 ? '🙂 还行，错题里能捞回不少分'
        : '💪 差得有点多，先把这组错题吃透';
  const song = (window.Song && Song.current) ? Song.current() : null;
  const vol = (window.Song && Song.prefs) ? Song.prefs().vol : 0.7;
  const online = location.protocol !== 'file:';
  host.innerHTML = `
  <h1>练习结果</h1>
  <div class="settle" id="settle">
    <div class="settle-kicker">练习结束</div>
    <div class="settle-title">${esc(E.m)}${E.sub ? ' · ' + esc(E.sub) : ''} · ${total} 题 · 用时 ${mins} 分钟</div>
    <div class="settle-score"><span class="mnum" data-countup>${p}</span><em>%</em></div>
    <div class="settle-verdict">${esc(verdict)}</div>
    ${timeStrip(E, usedMs, perQ, overMs, total)}

    <div class="settle-rest">
      <div>
        <div class="settle-metrics">
          <div class="settle-metric"><b class="mnum" data-countup>${E.right}</b><span>答 对</span></div>
          <div class="settle-metric"><b class="mnum" data-countup>${wrong}</b><span>答 错</span></div>
          <div class="settle-metric"><b class="mnum" data-countup>${blank}</b><span>未 答</span></div>
          <div class="settle-metric"><b class="mnum" data-countup>${mins}</b><span>用时 / 分</span></div>
        </div>
        <div class="settle-legend">
          <span><i style="background:var(--ok,#2fd27a)"></i>对 ${E.right}</span>
          <span><i style="background:var(--bad,#ff5470)"></i>错 ${wrong} · 占 ${wrongPct}%</span>
          <span><i style="background:rgba(255,255,255,.32)"></i>未答 ${blank}</span>
        </div>
      </div>
      <div class="settle-ring" style="--right:${p};--wrong:${wrongPct}" role="img" aria-label="错题占比 ${wrongPct}%">
        <b>${wrongPct}%<i>错题占比</i></b>
      </div>
    </div>

    <div class="settle-song${song && song.on ? ' playing' : ''}" id="settle-song">
      <div class="sk-disc"></div>
      <div class="sk-txt">
        <div class="sk-name">${song ? '🎵 ' + esc(song.stem || song.name) : '歌单是空的'}</div>
        <div class="sk-sub">${song ? esc((Song.GNAME[song.group] || song.group) + ' · 1.9.0 起切页不停，回到底部播放条继续控制') : '点「歌单」上传几首，出分时随机放一首'}</div>
      </div>
      <input type="range" id="song-vol" min="0" max="1" step="0.05" value="${vol}" title="音量" aria-label="音量">
      ${song ? '<button class="btn xs" id="song-toggle">⏸ 暂停</button><button class="btn xs" id="song-next">⏭ 换一首</button>' : ''}
      <button class="btn xs" id="song-manage">🎵 歌单</button>
    </div>
    ${online ? '' : '<div class="settle-note">♪ 歌要从「启动.cmd」或超频.exe 打开才有 —— 现在是 file://，没有本地服务。</div>'}

    <div class="settle-actions">
      <button class="btn pri" id="again">再来一组</button>
      <button class="btn" id="redo-wrong">重做本组错题</button>
      <button class="btn" id="kp-drill2" title="从这场里挑一道错题，把同考点的题连着做一批 —— 错一道就吃透一类">🔁 同类考点连刷</button>
      <button class="btn" id="go-wrong">去错题本</button>
      <button class="btn" id="back-home">回首页</button>
    </div>
  </div>
  ${(() => {
    const r = (DB.reviews || []).find(x => x.key === examKey(E));
    /* ★底色写在 settle.css 的 #review-card 里（用 --panel-read）。
       原来这里只有 border、**没有 background**，一旦挂了壁纸就是「深色字压在深色壁纸上」，
       整段复盘读不出来（用户 m24495 报的）。正文也不再 esc() 平铺，走 mdHTML 渲染。 */
    if (r && r.text) return `<div id="review-card"><h2>🧭 这一场的复盘（AI 讲师写的）</h2>
      <div class="rv-body">${mdHTML(r.text)}</div>
      <button class="btn" id="do-review" style="margin-top:12px">🧭 再复盘一次（换一种讲法）</button></div>`;
    return `<div id="review-card"><h2>🧭 这一场怎么复盘</h2>
      <div class="mut" style="margin-bottom:10px">${wrong >= 3 ? '错够 3 道，AI 讲师会自动复盘这一场（一场一次、一天封顶 4 场）—— 没出正文就点下面这颗手动来。' : '这场错题少于 3 道，自动复盘就不跑了（省着花钱）—— 想看也可以手动点。'}</div>
      <button class="btn pri" id="do-review">🧭 让讲师复盘这一场</button></div>`;
  })()}
  <h2 style="margin:24px 0 12px">逐题解析</h2>
  <div class="list">
    ${E.list.map((q, i) => {
    const mine = E.ans[q.id];
    const ok = mine === q.a;
    const sameG = i > 0 && ZKEY(q) && ZKEY(E.list[i - 1]) === ZKEY(q);
    const matBlock = (q.z && q.z.m)
      ? (sameG ? `<details class="zmat-fold"><summary>📊 材料 ${esc(q.z.g || '')}（与上一题同组，点开重看）</summary><img class="zimg" src="${esc(q.z.m)}" data-zoom="1" alt="资料分析材料"></details>` : ZLMAT(q))
      : (q.mat ? `<div class="qmat" style="max-height:180px">${stemHTML(q.mat, q)}</div>` : '');
    return `<div class="li" style="cursor:default">
        <div class="t"><span class="${ok ? '' : ''}" style="color:${ok ? 'var(--ok)' : 'var(--bad)'};font-weight:700">${ok ? '✓' : '✗'} ${i + 1}.</span> ${esc(shorten(q.q, 120))}</div>
        <div class="m"><span class="tag">${esc(q.m)}${q.t ? ' · ' + esc(q.t) : ''}</span><span class="tag">你选 ${mine == null ? '未答' : LETTERS[mine]}</span><span class="tag">答案 ${LETTERS[q.a]}</span>${q.p ? `<span class="tag">${esc(q.p)}</span>` : ''}${q.kd ? `<span class="tag">${esc(q.kd)}</span>` : ''}${traceBadge(E, q)}</div>
        ${matBlock}
        ${q.z && q.z.s ? `<div class="zstem"><img class="zimg" src="${esc(q.z.s)}" data-zoom="1" alt="原卷题干"></div>` : ''}
        ${figHTML(q)}
        <div class="expl" style="margin-top:10px">${(q.o || []).map((o, j) => `<div style="margin:2px 0;color:${j === q.a ? 'var(--ok)' : (j === mine && !ok ? 'var(--bad)' : 'inherit')}">${LETTERS[j]}. ${esc(OPTTEXT(q, o))}</div>`).join('')}
        ${thinkHTML(q)}${q.e ? '\n' + esc(q.e) : ''}</div>
        <div class="row" style="margin-top:10px;gap:8px">
          <button class="btn xs" data-fav="${q.id}">${DB.favs.indexOf(q.id) >= 0 ? '⭐ 已收藏' : '☆ 收藏'}</button>
          <button class="btn xs" data-wrong="${q.id}">${DB.wrong.indexOf(q.id) >= 0 ? '移出错题本' : '加入错题本'}</button>
        </div>
        ${ok ? '' : causeBarHTML(q.id)}
      </div>`;
  }).join('')}
  </div>`;
  host.querySelectorAll('[data-fav]').forEach(el => el.onclick = () => { toggleFav(el.dataset.fav); el.textContent = DB.favs.indexOf(el.dataset.fav) >= 0 ? '⭐ 已收藏' : '☆ 收藏'; });
  host.querySelectorAll('[data-wrong]').forEach(el => el.onclick = () => { toggleWrong(el.dataset.wrong); el.textContent = DB.wrong.indexOf(el.dataset.wrong) >= 0 ? '移出错题本' : '加入错题本'; });
  bindCause(host);
  const dr = document.getElementById('do-review');
  if (dr) dr.onclick = () => { try { autoReview(E, true); } catch (e) { toast('复盘没跑起来'); } };
  $('#again').onclick = () => { EXAM = null; navigate('#/practice/' + E.mid); };
  $('#redo-wrong').onclick = () => {
    const list = E.list.filter(q => E.ans[q.id] !== q.a);
    if (!list.length) return toast('这组全对，没有错题 🎉');
    EXAM = { list, i: 0, ans: {}, submitted: false, mid: E.mid, m: E.m, sub: E.sub + '（错题重做）', startedAt: Date.now() };
    navigate('#/exam');
  };
  $('#go-wrong').onclick = () => { EXAM = null; navigate('#/wrong'); };
  const kp2 = $('#kp-drill2');
  if (kp2) kp2.onclick = () => {
    /* 从这场的错题里挑一道（优先错因是「不会」的 —— 那才是真漏洞） */
    const wrongs = E.list.filter(q => E.ans[q.id] !== q.a);
    if (!wrongs.length) return toast('这组全对，没有可以连刷的考点 🎉');
    const seed = wrongs.find(q => { const c = (DB.cause || {})[q.id]; return c === 'blind' || c === 'dunno'; })
      || wrongs.find(q => { const c = (DB.cause || {})[q.id]; return c === 'method' || c === 'fake'; })
      || wrongs[0];
    kpDrill(seed.id, 8).then(r => { if (!r.ok) toast('同类考点的题：' + (r.reason || '不够')); });
  };
  $('#back-home').onclick = () => { EXAM = null; navigate('#/home'); };

  /* ---- 歌只在结算画面放：这里是唯一会暂停的地方 ---- */
  const sm = $('#song-manage'); if (sm) sm.onclick = () => (window.Song ? Song.open() : toast('歌模块没加载到'));
  const st = $('#song-toggle');
  if (st) st.onclick = () => {
    const a = (window.Song && Song.audioEl) ? Song.audioEl() : null;
    if (!a) return;
    if (a.paused) { a.play().catch(() => { }); st.textContent = '⏸ 暂停'; $('#settle-song').classList.add('playing'); }
    else { a.pause(); st.textContent = '▶ 继续'; $('#settle-song').classList.remove('playing'); }
  };
  const sn = $('#song-next');
  if (sn) sn.onclick = () => {
    if (!window.Song) return;
    const it = Song.pick(p);
    Song.play(it, p);
    const nm = $('#settle-song .sk-name'), sb = $('#settle-song .sk-sub');
    if (nm && it) { nm.textContent = '🎵 ' + (it.stem || it.name); sb.textContent = (Song.GNAME[it.group] || it.group) + ' · 只在结算画面放'; $('#settle-song').classList.add('playing'); }
  };
  const sv = $('#song-vol'); if (sv) sv.oninput = e => (window.Song && Song.setVol) && Song.setVol(Number(e.target.value));

  /* 缓存冷启动时 Song.start() 会异步补放一首 —— 那之后把播放条补上 */
  setTimeout(() => {
    const it = (window.Song && Song.current) ? Song.current() : null;
    const bar = $('#settle-song'); if (!it || !bar) return;
    const nm = $('.sk-name', bar), sb = $('.sk-sub', bar);
    if (nm && nm.textContent.indexOf('🎵') !== 0) {
      nm.textContent = '🎵 ' + (it.stem || it.name);
      sb.textContent = ((Song.GNAME[it.group] || it.group) + ' · 只在结算画面放');
      bar.classList.add('playing');
    }
  }, 900);

  /* ---- 开场两拍：分数先蹦出来，其余的 1.18s 后一起出来（用户 m06031） ---- */
  const hero = $('#settle');
  setTimeout(() => {
    if (!hero) return;
    hero.classList.add('go');
    if (window.Motion && Motion.burst) Motion.burst({ count: 96, x: hero.getBoundingClientRect().left + hero.offsetWidth * 0.22, y: hero.getBoundingClientRect().top + hero.offsetHeight * 0.30 });
    if (window.Motion && Motion.reapply) Motion.reapply(host);
  }, 30);
};

/* ---------- 粉笔双向同步钩子 ----------
   本地的收藏 / 错题 / 笔记一有变动就推回粉笔，两边对得上。
   不是粉笔的题（没有 fb_ 前缀）、或没连上粉笔，就安静地什么都不做。 */
function fenbiQid(id) {
  const m = /^fb_(\d+)$/.exec(String(id || ''));
  return m ? m[1] : null;
}
function fenbiPush(kind, qid, payload) {
  const A = window.FenbiAPI;
  if (!A || !qid) return Promise.resolve(false);
  const run = {
    collect: () => A.collect(qid),
    uncollect: () => A.uncollect(qid),
    unerror: () => A.deleteError(qid),
    note: () => A.addNote(qid, payload)
  }[kind];
  if (!run) return Promise.resolve(false);
  return Promise.resolve().then(run).then(() => true).catch(e => {
    console.warn('[fenbi] 推送失败', kind, qid, e && e.message);
    return false;
  });
}

function toggleFav(id) {
  const qid = fenbiQid(id), on = DB.favs.indexOf(id) < 0;
  if (on) DB.favs.push(id); else DB.favs.splice(DB.favs.indexOf(id), 1);
  save();
  toast(on ? '已收藏 ⭐' : '已取消收藏');
  if (qid) fenbiPush(on ? 'collect' : 'uncollect', qid)
    .then(ok => { if (!ok) toast('粉笔那边没同步上（本地已记下）'); });
}
function toggleWrong(id) {
  const qid = fenbiQid(id), on = DB.wrong.indexOf(id) < 0;
  if (on) DB.wrong.push(id); else DB.wrong.splice(DB.wrong.indexOf(id), 1);
  /* 移出错题本就顺手把错因删掉，不然老账会一直压在统计里 */
  if (!on && DB.cause && DB.cause[id]) delete DB.cause[id];
  save();
  toast(on ? '已加入错题本' : '已移出错题本');
  if (on) {
    /* 粉笔错题本没有手动添加接口 —— 只能靠「交卷判分」收进去（实测交卷做错后粉笔自动收） */
  } else if (qid) {
    fenbiPush('unerror', qid).then(ok => { if (ok) toast('粉笔错题本也移出了'); });
  }
}

/* ============================ 8. 错题本 / 收藏夹 ============================ */
/* ★1.9.6（用户 m15150「能提高公考成绩的优化都优化一点」）：
   把「错因构成」这件事直接交给 AI 讲师。错因是用户自己一道道标的 —— 比任何猜测都准的学情，
   而它躺在错题本顶上时只是一堆数字，接上讲师才变成一份能执行的补漏清单。 */
function causeReviewPrompt(ids) {
  const rows = (ids || []).map(id => BANK_MAP[id]).filter(Boolean);
  if (!rows.length) return '';
  const cs = causeStat(rows.map(q => q.id));
  const byMod = {};
  rows.forEach(q => { byMod[q.m] = (byMod[q.m] || 0) + 1; });
  const mods = Object.keys(byMod).sort((a, b) => byMod[b] - byMod[a]).slice(0, 5)
    .map(m => m + ' ' + byMod[m] + ' 题').join('、');
  const marks = CAUSE.map(c => c.i + ' ' + c.n + '：' + cs[c.k] + ' 题（' + c.d + '）').join('；');
  return [
    '我按你那一套刷行测，错题本里还压着 ' + rows.length + ' 道没消化。请给我一份今天 40 分钟做得完的补漏计划。',
    '',
    '【错因构成（我自己一道道标的，最准的学情）】' + marks + '；未标 ' + cs.none + ' 题',
    '【模块分布】' + mods,
    '【要求】①先说哪一类错因最该先修、为什么（结合占比）；②针对占比最高的那一类，讲 2 个最常考的点，每个配一句能记住的话；' +
      '③出 3 道自测题（含答案与坑）；④最后给我一句话：这周刷题时只盯什么。不要复述我的原话，直接开讲。'
  ].join('\n');
}
function askCauseReview(ids) {
  if (!window.Deep || !window.Deep.open) { toast('打包版或 node server.mjs 下才用得了 AI 讲师'); return; }
  const text = causeReviewPrompt(ids);
  if (!text) return;
  window.Deep.open({ text });
}
/* 探针用的口子（app.js 是 IIFE，外面看不见 causeReviewPrompt）——
   验「拼出来的那段话对不对」不需要装 DeepTutor，这样这条断言才稳定。 */
window.__xctermCausePrompt = causeReviewPrompt;

/* ======================= 8b. 学情 → AI 讲师的长期记忆 =======================
   ★1.9.7（用户 m15150「能提高公考成绩的优化都优化一点」）
   错因构成 / 薄弱模块 / 累计正确率这些数据在超频这边是齐的（错因还是用户一道道标的），
   但网页版里的 AI 讲师每一次新会话对它一无所知 —— 于是每次都要重新交代「我是谁、我哪里弱」。
   把它写进 DeepTutor 的三层记忆里的 L3/profile（跨表面、跨会话），以后每次开聊它都自带。
   正文在浏览器这边拼（数据都在 localStorage），服务端只负责落盘到 DeepTutor。 */
function studyProfileText() {
  const F = (typeof window !== 'undefined' && window.XCFENBI) || null;
  const acc = (F && F.account) || null;
  const rep = (F && (F.tikuReport || F.report)) || null;
  const fsum = (F && F.summary) || null;
  const lines = [];
  const stamp = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); })();

  /* ① 我是谁：目标考试 + 粉笔账号 + 现在的水平 */
  const me = [];
  const exam = (rep && rep.userQuiz && rep.userQuiz.name) || (acc && acc.quizName) || '';
  if (exam) me.push('备考方向：' + exam);
  if (acc && (acc.nickname || acc.userId)) me.push('粉笔账号：' + (acc.nickname || '') + (acc.userId ? '（' + acc.userId + '）' : ''));
  const ansN = Number((rep && rep.answerCount) || (fsum && fsum.answerCount) || 0);
  const okN = Number((rep && rep.correctCount) || (fsum && fsum.correctCount) || 0);
  if (ansN) me.push('粉笔累计答题 ' + ansN + ' 题 · 正确 ' + okN + ' 题 · 正确率 ' + pct(okN, ansN) + '%');
  const fc = Number((rep && rep.forecastScore) || (fsum && fsum.forecastScore) || 0);
  if (fc) me.push('粉笔预估分 ' + (Math.round(fc * 10) / 10) + '（满分 100 的量表，只当趋势看）');
  const logs = DB.log || [];
  const totAll = logs.reduce((a, s) => a + (s.total || 0), 0), rightAll = logs.reduce((a, s) => a + (s.right || 0), 0);
  if (totAll) me.push('本地练习 ' + logs.length + ' 场 / ' + totAll + ' 题 · 正确率 ' + pct(rightAll, totAll) + '%');
  if (me.length) lines.push({ n: '我是谁', l: me });

  /* ② 最近状态：连续打卡 + 近 14 天做题量（「他这两天在不在学」直接影响讲题的语气） */
  const days = DB.days || {};
  const last14 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return dayKey(d.getTime()); });
  const q14 = last14.reduce((a, k) => a + ((days[k] || {}).quiz || 0), 0);
  const c14 = last14.reduce((a, k) => a + ((days[k] || {}).cards || 0), 0);
  let streak = 0;
  for (let i = 0; i < 400; i++) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayKey(d.getTime()); const x = days[k]; if (x && (x.quiz || x.cards)) streak++; else if (i > 0) break; }
  const st = [];
  if (streak) st.push('连续学习 ' + streak + ' 天');
  if (q14 || c14) st.push('近 14 天：做题 ' + q14 + ' 题 · 看知识卡 ' + c14 + ' 张');
  if (DB.wrong.length) st.push('错题本压着 ' + DB.wrong.length + ' 道没消化');
  if (st.length) lines.push({ n: '最近状态', l: st });

  /* ③ 错因构成（用户一道道标的，最准的一条） */
  const cs = causeStat(DB.wrong);
  if (cs.total) {
    lines.push({
      n: '我的错因构成（我自己一道道标的，共 ' + cs.total + ' 道）',
      l: CAUSE.map(c => c.n + ' ' + cs[c.k] + ' 道（' + c.d + '）').concat(cs.none ? ['还没标 ' + cs.none + ' 道'] : [])
    });
  }

  /* ④ 薄弱模块：练习正确率最低的几个 + 错题最多的几个 */
  const byMod = {};
  logs.forEach(s => { const k = s.m || '未分模块'; byMod[k] = byMod[k] || { total: 0, right: 0 }; byMod[k].total += s.total || 0; byMod[k].right += s.right || 0; });
  const weak = Object.keys(byMod).filter(m => byMod[m].total >= 10).sort((a, b) => (byMod[a].right / byMod[a].total) - (byMod[b].right / byMod[b].total)).slice(0, 4)
    .map(m => m + ' ' + pct(byMod[m].right, byMod[m].total) + '%（' + byMod[m].right + '/' + byMod[m].total + '）');
  const wrongBy = {};
  (DB.wrong || []).forEach(id => { const q = BANK_MAP[id]; if (q) wrongBy[q.m] = (wrongBy[q.m] || 0) + 1; });
  const wrongTop = Object.keys(wrongBy).sort((a, b) => wrongBy[b] - wrongBy[a]).slice(0, 4).map(m => m + ' ' + wrongBy[m] + ' 道');
  const wl = [];
  if (weak.length) wl.push('正确率最低：' + weak.join('、'));
  if (wrongTop.length) wl.push('错题最多：' + wrongTop.join('、'));
  if (wl.length) lines.push({ n: '我的薄弱模块（做题正确率 + 错题分布）', l: wl });

  /* ⑤ 知识卡进度：已看 % + 最落后的模块（决定「该补哪一块」） */
  let seen = 0; const per = [];
  NOTES.forEach(m => {
    const ids = m.cards.map(c => c.id), s = ids.filter(id => DB.seen[id]).length;
    seen += s; per.push({ m: (m.icon ? m.icon + ' ' : '') + m.m, s, t: ids.length });
  });
  const kl = ['已看 ' + seen + ' / ' + META.totalNotes + ' 张（' + pct(seen, META.totalNotes) + '%）'];
  const behind = per.filter(x => x.s < x.t).sort((a, b) => (a.s / a.t) - (b.s / b.t)).slice(0, 3).map(x => x.m + ' ' + x.s + '/' + x.t);
  if (behind.length) kl.push('最落后：' + behind.join('、'));
  lines.push({ n: '知识卡进度', l: kl });

  /* ⑥ 今天做了什么 + 今天该复习（用户 m17670 第三问：每天自动同步，
        讲师开聊先 read_memory 就知道我今天干了多少、明天该干嘛）。 */
  const today = dayKey();
  const tLog = (DB.log || []).filter(s => String(s.d || '') === today);
  if (tLog.length) {
    const tT = tLog.reduce((n, s) => n + (s.total || 0), 0);
    const tR = tLog.reduce((n, s) => n + (s.right || 0), 0);
    const tBy = {};
    tLog.forEach(s => { const k = s.m || '未分模块'; tBy[k] = tBy[k] || { t: 0, r: 0 }; tBy[k].t += s.total || 0; tBy[k].r += s.right || 0; });
    lines.push({
      n: '今天做了什么（' + today + '）',
      l: [
        '练习 ' + tLog.length + ' 次 / ' + tT + ' 题，答对 ' + tR + ' 题（' + pct(tR, tT) + '%）',
        '分模块：' + Object.keys(tBy).map(m => m + ' ' + pct(tBy[m].r, tBy[m].t) + '%').join('、')
      ]
    });
  }
  let dueAll = 0;
  NOTES.forEach(m => { dueAll += countDue(DB, m.cards.map(c => c.id)); });
  if (typeof SHIZHENG !== 'undefined') dueAll += countDue(DB.sz || {}, SHIZHENG.map(c => c.id));
  lines.push({
    n: '今天该复习（越拖攒得越多）',
    l: [
      '知识卡到期 ' + dueAll + ' 张（间隔重复排的期）',
      '错题本 ' + (DB.wrong || []).length + ' 道，其中还没标错因 ' + (cs ? cs.none : 0) + ' 道'
    ]
  });

  /* ⑤ 最近复盘（每场自动复盘的产出 —— 用户 m18259：AI 讲师要能接着复盘的结论讲，
        而不是每次从零分析）。只放最近 2 场的标题 + 那几条「明天就做的事」，
        别把整篇复盘塞进记忆（会把其他段挤没）。 */
  const rv = (DB.reviews || []).slice(0, 2);
  if (rv.length) {
    lines.push({
      n: '最近复盘（AI 讲师自己写过的，接着往下盯就行）',
      l: rv.map(r => {
        const acts = String(r.text || '').split(/\n/).filter(x => /^\s*[-*\d]/.test(x))
          .map(x => x.replace(/^\s*[-*]\s*|^\s*\d+[.、)]\s*/, '').trim()).filter(x => x.length > 6);
        return (r.m || '') + (r.sub ? ' · ' + r.sub : '') + '（' + (r.at || '').slice(0, 10) + '，'
          + r.total + ' 题对 ' + r.right + '）' + (acts.length ? '：' + acts.slice(0, 4).join('；') : '');
      })
    });
  }

  /* ⑤.5 近几周趋势 + 下周计划（周报 —— 光看今天提不了分，得看走势） */
  {
    weekRoll();
    const st = weeklyStats(0);
    const prev = (DB.weeks || []).filter(w => Number(w.wk) < st.wk).slice(-1)[0] || null;
    const hist = (DB.weeks || []).slice(-4);
    const wl = [];
    if (hist.length > 1) wl.push('近 ' + hist.length + ' 周：' + hist.map(w => w.label.split(' ~ ')[0] + ' ' + w.total + ' 题/' + w.pct + '%').join(' → '));
    wl.push('本周 ' + st.total + ' 题 · 正确率 ' + st.pct + '%' + (prev ? '（上周 ' + prev.pct + '%，' + (st.pct >= prev.pct ? '+' : '') + Math.round((st.pct - prev.pct) * 10) / 10 + ' 点）' : ''));
    if (st.timed.n > 0) wl.push('限时 ' + st.timed.n + ' 场' + (st.timed.over ? '，超时 ' + st.timed.over + ' 场' : '，没超时') + '，平均每题 ' + st.timed.avgSec + ' 秒');
    const plan = weeklyPlan(st, prev);
    if (plan.length) plan.forEach((x, i) => wl.push('下周 ' + (i + 1) + '：' + x));
    lines.push({ n: '本周趋势与下周计划', l: wl });
  }

  /* ⑥ 怎么跟他说（把「怎么用这份学情」也写进去，比让人格文件里反复强调管用） */
  lines.push({
    n: '怎么用这份学情', l: [
      '讲题时优先拿我的薄弱模块和错因构成做例子，别泛泛地讲「要注意」。',
      '我错得最多的一类错因，直接在回答最后给一句这周要盯什么。',
      '需要真题/讲义原文时查知识库（行测：超频行测知识库；申论：超频申论知识库）。'
    ]
  });

  const body = lines.map(g => '## ' + g.n + '\n' + g.l.filter(Boolean).map(x => '- ' + x).join('\n')).join('\n\n');
  if (!lines.length) return '';
  // ★时间戳放**末尾**，别放开头：DeepSeek 的缓存是前缀缓存（开头逐字相同才命中），
  //   把每次都变的「同步于几点」放第一行，整份记忆的前缀就每次都不同，缓存命中率会掉到接近 0。
  return body + '\n\n> 由超频同步（' + stamp + '）· 每次同步整页覆盖，不是历史流水\n';
}
window.__xctermStudyProfile = studyProfileText;

/* ================= 📊 周报（自主提分优化）=================
   光看「今天做了多少题」提不了分 —— 得看**趋势**：哪个模块在掉、哪个错因在涨、
   限时是不是越来越紧。所以每周落一份快照，把「本周 vs 上周」和「下周该干什么」
   一起写进 AI 讲师的记忆：开聊它就知道该盯什么，不用每次从零分析。
   ★纯本地算术，0 token —— 只有你点「让讲师给建议」才花钱。 */
function wkStart(ts) {
  const d = new Date(Number(ts) || Date.now());
  d.setHours(0, 0, 0, 0);
  const wd = (d.getDay() + 6) % 7;            /* 周一 = 0 */
  d.setDate(d.getDate() - wd);
  return d.getTime();
}
function wkLabel(ts) {
  const a = new Date(Number(ts) || Date.now()), b = new Date(a.getTime() + 6 * 864e5);
  return (a.getMonth() + 1) + '月' + a.getDate() + '日 ~ ' + (b.getMonth() + 1) + '月' + b.getDate() + '日';
}
/* 一周的账：做题量 / 正确率 / 各模块 / 限时成绩 / 错因 */
function weeklyStats(off) {
  const now = Date.now();
  const from = wkStart(now - (Number(off) || 0) * 7 * 864e5);
  const to = from + 7 * 864e5;
  const logs = (DB.log || []).filter(s => { const t = Number(s.at) || 0; return t >= from && t < to; });
  const total = logs.reduce((a, s) => a + (Number(s.total) || 0), 0);
  const right = logs.reduce((a, s) => a + (Number(s.right) || 0), 0);
  const byMod = {};
  for (const s of logs) {
    const k = String(s.m || '其它');
    if (!byMod[k]) byMod[k] = { total: 0, right: 0 };
    byMod[k].total += Number(s.total) || 0;
    byMod[k].right += Number(s.right) || 0;
  }
  const timed = logs.filter(s => Number(s.limit) > 0);
  const usedMs = timed.reduce((a, s) => a + (Number(s.usedMs) || 0), 0);
  const tTotal = timed.reduce((a, s) => a + (Number(s.total) || 0), 0);
  return {
    wk: from, label: wkLabel(from), sessions: logs.length, total, right,
    pct: total ? Math.round(right / total * 1000) / 10 : 0,
    byMod,
    timed: {
      n: timed.length,
      over: timed.filter(s => (Number(s.usedMs) || 0) > (Number(s.limit) || 0)).length,
      avgSec: tTotal ? Math.round(usedMs / 1000 / tTotal) : 0
    },
    reviews: (DB.reviews || []).filter(r => { const t = Number(r.at) || 0; return t >= from && t < to; }).length
  };
}
/* 下周计划：从账里推，3-5 条，每条都要能照着做（不是「加油」这种废话） */
function weeklyPlan(st, prev) {
  const out = [];
  const mods = Object.keys(st.byMod || {}).map(k => Object.assign({ k }, st.byMod[k]))
    .filter(x => x.total >= 5).map(x => Object.assign(x, { pct: x.right / x.total * 100 }));
  const prevMod = (prev && prev.byMod) || {};
  /* ① 丢分大头（正确率最低且题量够），并说清是涨是跌 */
  mods.sort((a, b) => a.pct - b.pct);
  const weak = mods[0];
  if (weak) {
    const p = prevMod[weak.k];
    const d = p && p.total >= 5 ? Math.round(weak.pct - (p.right / p.total * 100)) : null;
    out.push('主攻「' + weak.k + '」：本周 ' + Math.round(weak.pct) + '%（' + weak.right + '/' + weak.total + '）'
      + (d === null ? '' : (d >= 0 ? '，比上周 +' + d + ' 点' : '，比上周 ' + d + ' 点'))
      + ' —— 下周每天 20 道专练它，做完当场对解析，别只对答案。');
  }
  /* ② 掉得最快的（哪怕绝对值不低） */
  const drop = mods.map(x => {
    const p = prevMod[x.k];
    return p && p.total >= 5 ? { k: x.k, d: x.pct - (p.right / p.total * 100), pct: x.pct } : null;
  }).filter(Boolean).sort((a, b) => a.d - b.d)[0];
  if (drop && drop.d <= -3 && (!weak || drop.k !== weak.k)) {
    out.push('「' + drop.k + '」在往下掉（' + Math.round(drop.pct) + '%，比上周 ' + Math.round(drop.d) + ' 点）—— 回头把这周错的题重新做一遍，别急着刷新题。');
  }
  /* ③ 限时：超时就是直接丢分 */
  if (st.timed.n > 0) {
    if (st.timed.over > 0) out.push('限时 ' + st.timed.n + ' 场有 ' + st.timed.over + ' 场超时 —— 下周给每类题定硬时限（言语 40 秒 / 判断 50 秒 / 资料 70 秒），到点就跳，最后回头蒙。');
    else out.push('限时 ' + st.timed.n + ' 场都没超时，平均每题 ' + (st.timed.avgSec || 0) + ' 秒 —— 保持，下周把限时场次加到 3 场以上。');
  } else {
    out.push('本周一场限时都没做 —— 下周至少 2 场限时（真题卷自带卷面限时，点「⏱ 限时」就开）。不限时练出来的会做，考场上就是来不及做。');
  }
  /* ④ 复盘欠账 */
  if (st.sessions >= 3 && st.reviews === 0) out.push('做了 ' + st.sessions + ' 场却一次复盘都没跑 —— 交卷后点「🧭 这一场的复盘」，错的题不复盘等于白错。');
  /* ⑤ 知识卡 */
  const seen = Object.keys(DB.seen || {}).length;
  if (seen < 200) out.push('知识卡才看了 ' + seen + ' / 1853 张 —— 每天 10 张，先看错题最多的那几个模块。');
  return out.slice(0, 5);
}
/* 每周快照：只留最近 8 周（够看趋势，又不撑爆 localStorage） */
function weekRoll() {
  const from = wkStart(Date.now());
  const st = weeklyStats(0);
  if (!st) return;
  const arr = (DB.weeks || []).filter(w => Number(w.wk) !== from);
  arr.push({
    wk: from, label: st.label, sessions: st.sessions, total: st.total, right: st.right, pct: st.pct,
    byMod: st.byMod, timed: st.timed, reviews: st.reviews,
    plan: weeklyPlan(st, (DB.weeks || []).filter(w => Number(w.wk) < from).slice(-1)[0] || null)
  });
  arr.sort((a, b) => Number(a.wk) - Number(b.wk));
  DB.weeks = arr.slice(-8);
}
/* 周报正文：给记忆用，也给设置页预览用 */
function weeklyText() {
  const st = weeklyStats(0);
  const prev = (DB.weeks || []).filter(w => Number(w.wk) < st.wk).slice(-1)[0] || null;
  const L = [];
  L.push('## 周报（' + st.label + '）');
  const dTot = prev ? st.total - prev.total : 0;
  const dPct = prev ? Math.round((st.pct - prev.pct) * 10) / 10 : null;
  L.push('- 做题 ' + st.total + ' 题 · ' + st.sessions + ' 场 · 正确率 ' + st.pct + '%'
    + (prev ? '（上周 ' + prev.total + ' 题 ' + prev.pct + '%，题量 ' + (dTot >= 0 ? '+' : '') + dTot + '、正确率 ' + (dPct >= 0 ? '+' : '') + dPct + ' 点）' : '（本周是第一份周报）'));
  const mods = Object.keys(st.byMod || {}).map(k => Object.assign({ k }, st.byMod[k]))
    .filter(x => x.total > 0).sort((a, b) => (a.right / a.total) - (b.right / b.total));
  if (mods.length) {
    L.push('- 各模块（从弱到强）：' + mods.map(x => x.k + ' ' + Math.round(x.right / x.total * 100) + '%').join(' · '));
  }
  if (st.timed.n > 0) L.push('- 限时 ' + st.timed.n + ' 场' + (st.timed.over ? '，超时 ' + st.timed.over + ' 场' : '，没超时') + '，平均每题 ' + st.timed.avgSec + ' 秒');
  else L.push('- 限时：本周一场都没做');
  L.push('- 自动复盘 ' + st.reviews + ' 次 · 错题本 ' + (DB.wrong || []).length + ' 道（还没标错因 ' + (DB.wrong || []).filter(id => !(DB.cause || {})[id]).length + ' 道）');
  /* ★走势行要恒出：第一份周报时 DB.weeks 里只有当周，hist（严格早于本周）是空的，
     以前写成 if (hist.length) 就永远不显示走势。把本周也算进点列，几点都出。 */
  const hist = (DB.weeks || []).filter(w => Number(w.wk) < st.wk).slice(-3);
  const pts = hist.map(w => w.label.split(' ~ ')[0] + ' ' + w.total + ' 题/' + w.pct + '%')
    .concat([st.label.split(' ~ ')[0] + ' ' + st.total + ' 题/' + st.pct + '%（本周）']);
  L.push('- 近 ' + pts.length + ' 周走势：' + pts.join(' → '));
  L.push('');
  L.push('### 下周计划');
  const plan = weeklyPlan(st, prev);
  if (plan.length) plan.forEach((x, i) => L.push((i + 1) + '. ' + x));
  else L.push('- 这周账上没什么可挑的，保持节奏就行。');
  return L.join('\n');
}
window.__xctermWeekText = weeklyText;
window.__xctermWeekStats = weeklyStats;
window.__xctermWeekRoll = weekRoll;

/* ===== 每周自动落周报（用户 m19645：「现在要手点，改成周一自动写进记忆」）=====
   周一开机（或跨周后第一次打开）就把上周的账收进 DB.weeks，再连同学情一起写进
   AI 讲师的记忆 —— 讲师开聊就知道「上周哪块掉了、这周该盯什么」。
   ★纯本地算术，0 token；真正写记忆走的还是 pushStudyMemory（跟学情同一条路）。 */
function autoWeekly(opts) {
  if (DB.weekAuto === false) return { ok: false, skipped: 'off' };
  const now = Date.now();
  const last = Number(DB.weekAt || 0);
  const sameWeek = last && wkStart(last) === wkStart(now);
  if (sameWeek) return { ok: false, skipped: 'same-week' };
  /* 周一才自动落；平时跨周了也落（防止周中才打开软件漏掉） */
  const wd = (new Date(now).getDay() + 6) % 7;          /* 周一 = 0 */
  if (wd !== 0 && now - last < 6 * 864e5 && last) return { ok: false, skipped: 'not-monday' };
  const st = weekRoll();
  DB.weekAt = now;
  saveNow();
  const out = { ok: true, week: st ? st.label : '', at: now };
  /* 把趋势 + 下周计划随学情一起写进记忆（学情里已经有「本周趋势与下周计划」段） */
  if (!opts || opts.push !== false) {
    try { pushStudyMemory({ silent: true }); out.pushed = true; } catch (e) { out.pushed = false; out.err = String(e && e.message || e); }
  }
  return out;
}
window.__xctermAutoWeekly = autoWeekly;


/* ================= 精通之路 & 练习要的料（用户 m16822 第三件事）=================
   DeepTutor 那边「精通之路」要一条 goal、「练习」要一批题。
   goal 就是上面那份学情（它本来就是「我哪儿弱」），题只有浏览器这边有 ——
   题干/选项/答案/解析全在题库里（BANK_MAP），所以这一步只能在前端打包。 */
function studyGoalText() {
  const t = studyProfileText();
  if (!t) return '';
  const F = (typeof window !== 'undefined' && window.XCFENBI) || null;
  const rep = (F && (F.tikuReport || F.report)) || null;
  const exam = (rep && rep.userQuiz && rep.userQuiz.name) || '国考行政执法类';
  const head = '帮我把' + exam + '行测成绩提上去：先补正确率最低的模块，再用错题做间隔重复，'
    + '每个知识点都要有可检验的过关标准。下面是我的真实学情：';
  return (head + '\n\n' + t).slice(0, 5000);
}
/* 错题打包（给 /deep/study/setup 的 questions）。★只挑题库里真有题干、且去重过的题 ——
   知识卡的配题里有一批不在 BANK_MAP 里，硬塞空题干会被 DeepTutor 拒。 */
function studyWrongPack(limit) {
  const cap = limit || 300;
  const seen = {};
  const out = [];
  const ids = (DB.wrong || []).slice().reverse();
  for (const id of ids) {
    if (out.length >= cap) break;
    const q = BANK_MAP[id];
    if (!q || !String(q.q || '').trim() || seen[id]) continue;
    seen[id] = 1;
    const ck = (DB.cause && DB.cause[id]) || '';
    const c = ck && ck !== 'none' ? CAUSE_MAP[ck] : null;
    out.push({
      id: String(id),
      stem: String(q.q || '').slice(0, 8000),
      options: (q.o || []).map(o => String(o == null ? '' : o).slice(0, 2000)),
      answer: (typeof q.a === 'number' ? LETTERS[q.a] : String(q.a || '')).slice(0, 4),
      explanation: String(q.e || '').slice(0, 8000),
      module: String(q.m || ''),
      cause: c ? c.n : '',
      from: /^fb_/.test(String(id)) ? '粉笔错题' : '超频题库'
    });
  }
  return out;
}
/* 一键交给服务端：建「行测精通之路」+ 把错题灌进练习队列（幂等，反复点不会灌重）。 */
async function setupDeepStudy(opts) {
  const opt = opts || {};
  const questions = studyWrongPack(opt.limit);
  const syl = masterySyllabus();          /* ★全科大纲：20 个模块 / 108 个知识点，不再让模型拟 */
  try {
    const r = await fetch('/deep/study/setup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: studyGoalText(), mustCover: opt.mustCover || [], questions,
        modules: syl.modules, sources: syl.sources
      })
    });
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, error: '本地服务没回话', questions: questions.length };
    return Object.assign({ questions: questions.length }, j);
  } catch (e) {
    return { ok: false, error: String(e && e.message || e), questions: questions.length };
  }
}
window.__xctermStudyGoal = studyGoalText;
window.__xctermStudyPack = () => ({ goal: studyGoalText(), questions: studyWrongPack(300) });

/* ============ 精通之路的大纲（用户 m17670 第二问）============
   原来那条精通之路只有错题 —— 因为大纲是让模型按学情拟的，学情里就只有「哪儿错得多」。
   现在改成**直接从知识卡算**：1853 张卡 + 时政 241 一张不落，全科覆盖。
   顺带省掉一次模型调用（topics/draft 是 mastery_path 里唯一碰模型的点）。

   卡片的 `sec` 是「父·子」两级（如「错误做法·不能这样做」），按 `·` 切开取父级当知识点，
   不然成语积累一上来就 185 个节点。 */
function masterySyllabus() {
  const parOf = list => {
    const par = {};
    (list || []).forEach(c => {
      const k = String(c.sec || '（未分类）').trim();
      const p = (k.split('·')[0] || k).trim();
      par[p] = (par[p] || 0) + 1;
    });
    return Object.keys(par).map(k => ({ name: k, n: par[k] })).sort((a, b) => b.n - a.n);
  };
  const M = {};
  (NOTES || []).forEach(m => { M[m.id] = parOf(m.cards); });
  const szRaw = parOf(typeof SHIZHENG !== 'undefined' ? SHIZHENG : []);

  const DATE = /^\d{4}年/;
  /* ★DeepTutor 的硬限制：一个模块最多 7 个知识点（原话
     `Route region 1 may have at most 7 waypoints; it has 53`）。超了整条路径建不出来，
     所以大模块按题型拆开、每个只取卡片数最多的前几个。 */
  const take = (list, n) => (list || []).slice(0, n).map(k => k.name);
  const noDate = (list) => (list || []).filter(k => !DATE.test(k.name));
  /* ★时政的 `sec` 是月报**期号**（「2026年4月上」），不是考点名。把期号当知识点名，DeepTutor 讲师会
     说「这个知识点是 2026年4月上｜2026年7月上｜…」——它不知道那是什么，也没法拿它去检索知识库，
     于是只好说「纯时政月报…我这边没有可靠来源可以核实」。
     正确做法：19 个期号合成**一个**知识点（学的是"那段时间发生了什么"），真考点
     （中央一号文件 / 全国两会 / 中央经济工作会议 / 新年贺词 / 建党105周年）各自单独成组。 */
  const issueKey = nm => {
    const m = /^(\d{4})年(\d{1,2})月(上|下)/.exec(String(nm));
    return m ? (Number(m[1]) * 10000 + Number(m[2]) * 100 + (m[3] === '下' ? 2 : 1)) : 0;
  };
  const szIssue = szRaw.filter(k => DATE.test(k.name)).sort((a, b) => issueKey(a.name) - issueKey(b.name));
  const szReal = szRaw.filter(k => !DATE.test(k.name));
  const szIssueName = szIssue.length
    ? ('时政月报 ' + szIssue.length + ' 期（' + szIssue[0].name + ' — ' + szIssue[szIssue.length - 1].name + '）：重大会议/文件/科技成就/外交，按时间点记')
    : '';
  const sz = (szIssueName ? [{ name: szIssueName, n: szIssue.reduce((n, k) => n + k.n, 0) }] : []).concat(szReal);
  /* ★同一考点在知识卡和时政月报里各出现一次（「中央一号文件」两边都有）。政治理论那组已经
     手工写死、把重复项用 szRealSet 剔干净了，所以这里不再需要 mergeN —— 1.9.27 删掉。 */
  /* ★全覆盖的做法：不是「取前 7 个」（那样会把分类丢掉），而是把所有分类**打包成 ≤7 组**，
     每个知识点的名字里把组内分类名全列出来（DeepTutor 知识点只有 name 一处能写字，上限 200 字）。
     这样每张卡都落在某个知识点里，一个分类都不漏。 */
  const bucket = (list, n) => {
    const items = (list || []).map(k => String(k.name));
    if (!items.length) return [];
    const g = Math.min(n, items.length);          /* 想要的组数 */
    const per = Math.ceil(items.length / g);      /* 每组几个分类 */
    const groups = [];
    for (let i = 0; i < items.length; i += per) groups.push(items.slice(i, i + per));
    return groups.slice(0, n).map(grp => {
      const nm = grp.join('｜');
      return nm.length > 197 ? nm.slice(0, 197) + '…' : nm;
    });
  };
  const mk = (ref, name, objective, kps) => ({
    name: name, order: 0, objective: objective, pass_threshold: 0.7,
    knowledge_points: kps.map((k, i) => ({
      client_ref: ref + '-kp' + i,
      name: String(typeof k === 'string' ? k : k.name).slice(0, 200),
      module_id: ''
    }))
  });

  /* 把 bucket 出来的一串知识点平均切成 n 个模块（每模块 ≤7 个，DeepTutor 的硬上限）。 */
  const chunk = (list, n) => {
    const ks = (list || []).slice();
    const g = Math.max(1, Math.min(n, ks.length));
    const per = Math.ceil(ks.length / g);
    const out = [];
    for (let i = 0; i < ks.length; i += per) out.push(ks.slice(i, i + per));
    return out;
  };
  /* ★政治理论的第一个知识点必须还叫「挖坑辨析｜习新思想」。
     用户唯一有进度的知识点就是它（mastery 0.8 + 一次 quiz、一次 review 的间隔重复状态）。
     服务端 PUT 大纲时按「模块名 + 知识点名」保留知识点 id（见 server.mjs deepMapIdInject），
     名字一变 id 就重铸、那 0.8 就没了。所以政治理论不参与 bucket，手工写死：
     自有 5 类（挖坑辨析/习新思想 合成一组 + 哲学/党史毛概/考情学法 各一组）+ 时政真考点一组。 */
  const ZZ_PAIR = ['挖坑辨析', '习新思想'];
  /* ★`noDate(M.zhengzhi)` 不是 5 项而是 10 项 —— 政治理论那 319 张卡里含时政 241 张，
     其中 5 个真考点（建党105周年/中央一号文件/全国两会/中央经济工作会议/新年贺词）名字不带
     年份前缀，noDate 滤不掉。它们等下单独合成一个知识点，所以这里必须先剔掉，否则重复。 */
  const szRealSet = {};
  szReal.forEach(x => { szRealSet[x.name] = 1; });
  const zzSelf = noDate(M.zhengzhi).filter(x => !szRealSet[x.name]);
  const zzLead = zzSelf.filter(x => ZZ_PAIR.indexOf(x.name) >= 0).map(x => x.name).join('｜');
  const zzKp = [zzLead || ZZ_PAIR.join('｜')]
    .concat(zzSelf.filter(x => ZZ_PAIR.indexOf(x.name) < 0).map(x => x.name));
  if (szReal.length) zzKp.push(('时政考点：' + szReal.map(x => x.name).join(' / ')).slice(0, 200));

  /* ★2026-09 重构（用户 m23510 问「没有我知识卡的全内容覆盖吧」→ m23549「干就完了不要害怕」）：
     从 14 模块 / 74 知识点 → **20 模块 / 108 知识点**（DeepTutor 上限 20 模块、每模块 7 知识点）。
     原来的毛病：成语 67 个分类被 bucket 塞进 7 个知识点，每个知识点名字是 10 个分类用「｜」
     拼起来的 72 字长串（「事物出现、发展、衰落｜工作学习状态｜干部易犯错误｜…」）——
     向量检索拿这种名字去知识库找卡片几乎必然跑偏。现在同一批卡片拆得更细：
     成语 4 模块 × 6 点、实词 2 × 7、逻辑判断 2 × 5、时政月报独立成模块 7 点。
     知识点名字从「10 个分类拼接」缩到「1-3 个分类」，检索命中率是这次改动真正的收益。 */
  const mods = [
    mk('zz', '政治理论', '政治理论：先分清概念（挖坑辨析），再积累时政月报，做到看到选项就知道坑在哪。', zzKp),
    mk('cs', '常识判断', '常识判断：文史/地理/科技/经济/法律五大块的系统积累，重在广度与排除法。',
      bucket(M.changshi, 7)),
    mk('yy1', '言语理解·中心理解', '中心理解题是言语的主战场：三类文段、找主题句、排除干扰项。',
      bucket(M.yanyu, 7))
  ];
  chunk(bucket(M.chengyu, 28), 4).forEach((g, i) => mods.push(mk(
    'cy' + (i + 1), '选词填空·成语积累' + '①②③④'[i],
    '成语按语义场成组记（近似成语、"说"相关、干部易犯错误…）—— 一组就是一个语义场，别混着背。', g)));
  chunk(bucket(M.shici, 14), 2).forEach((g, i) => mods.push(mk(
    'sc' + (i + 1), '选词填空·实词积累' + '①②'[i],
    '实词重在辨析与搭配，记语义场而不是背释义。', g)));
  mods.push(mk('sl', '数量关系',
    '数量关系：先拿套路小题型的分，再补工程行程利润与计数概率，学会速算与排除。',
    bucket(M.shuliang, 7)));
  chunk(bucket(M.panduan, 10), 2).forEach((g, i) => mods.push(mk(
    'pd' + (i + 1), '判断推理·逻辑判断' + '①②'[i],
    '逻辑判断：归因论证、支持与质疑、推出推理，先定题型再套方法。', g)));
  mods.push(
    mk('pd3', '判断推理·图形推理', '图形推理：先看「有没有一样的图案」，再走属性/数量/位置三条线。',
      bucket(M.tutui, 7)),
    mk('zl', '资料分析', '资料分析：速算技巧 + ABRX类/比重类/平均倍数类/盐水类，正确率必须压在 85% 以上。',
      bucket(M.ziliao, 7)),
    mk('sz', '时政月报·按月巩固', '时政月报：19 期按月过一遍，记住"那段时间发生了什么"，别背期号。',
      bucket(szIssue, 7)));
  const SL = [
    ['sl-gk', '申论·归纳概括', '归纳概括：把材料读薄，问什么答什么，要点一个不漏。', ['问法识别（问题/原因/影响/做法）', '要点提炼', '材料分类与合并', '字数压缩与条理化']],
    ['sl-zh', '申论·综合分析', '综合分析：解释清楚、评价有据、启示落地。', ['词句理解', '观点评价', '启示分析', '比较分析']],
    ['sl-dc', '申论·提出对策', '提出对策：从材料里长出来，可落地、有主体、有角度。', ['直接对策提炼', '由问题反推对策', '对策的主体与角度', '对策可行性检验']],
    ['sl-yw', '申论·应用文', '应用文：格式是送分，内容靠材料，语气看对象。', ['公文格式与落款', '讲话稿与发言稿', '倡议书与公开信', '调研报告与简报']],
    ['sl-dw', '申论·大作文', '大作文：立意稳、结构清、论证实。', ['立意与总论点', '分论点搭建', '标题与开头', '结尾与升华', '素材与论证']]
  ];
  SL.forEach(x => mods.push(mk(x[0], x[1], x[2], x[3])));
  mods.forEach((m, i) => { m.order = i; });

  return {
    modules: mods,
    sources: [
      /* ★原来写「1853 张知识卡 + 241 条时政月报」是重复计数：时政那 241 条本来就含在
         政治理论的 319 张里，1853 已经是总数（行测自有 1612 + 时政 241）。 */
      { kind: 'knowledge_base', source_id: String((window.DEF && 0) || '超频行测知识库'), label: '超频行测知识库（1853 张知识卡，含 241 条时政月报）', available: true, metadata: { cards: 1853 } },
      { kind: 'knowledge_base', source_id: '超频申论知识库', label: '超频申论知识库（30 篇申论材料）', available: true, metadata: { docs: 30 } }
    ],
    counts: {
      modules: mods.length,
      points: mods.reduce((n, m) => n + m.knowledge_points.length, 0)
    }
  };
}
window.__xctermMasterySyllabus = masterySyllabus;
window.__xctermStudySetup = setupDeepStudy;

/* 写进 DeepTutor（服务端 POST /deep/memory → PUT /api/memory/doc/L3/profile）。 */
async function pushStudyMemory(opts) {
  const opt = opts || {};
  const text = studyProfileText();
  if (!text) { if (!opt.silent) toast('还没有学情可写 —— 先做几道题或者标几个错因'); return { ok: false, error: 'empty' }; }
  try {
    const r = await fetch('/deep/memory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) {
      const msg = (j && j.error) || '写不进去';
      if (!opt.silent) toast(msg.length > 40 ? msg.slice(0, 40) + '…' : msg);
      return { ok: false, error: msg };
    }
    DB.memAt = Date.now(); DB.memBytes = j.bytes || 0; save();
    if (!opt.silent) toast('学情已写给 AI 讲师（' + (j.entries || 0) + ' 条）—— 网页版里直接开聊就行');
    return j;
  } catch (e) {
    if (!opt.silent) toast('写不进去：网络或服务没起来');
    return { ok: false, error: String(e && e.message || e) };
  }
}
/* 开机自动同步：12 小时一次，**并且跨天一定要再写一次**（学情里的「今天做了什么」
   是按天算的，不跨天重写的话讲师看到的「今天」永远是昨天）。
   只在 DeepTutor 装好 / 网页版在跑的时候悄悄做 —— 不打扰，打不通就当没这回事。 */
function autoStudyMemory() {
  try {
    if (!DB.wrong.length && !DB.log.length) return;
    if (DB.memAuto === false) return;
    const last = Number(DB.memAt || 0);
    const sameDay = last && dayKey(last) === dayKey();
    if (sameDay && Date.now() - last < 12 * 3600 * 1000) return;
    fetch('/deep/status', { cache: 'no-store' }).then(r => r.json()).then(s => {
      if (!s || !s.installed) return;
      if (!(s.running || (s.web && s.web.running))) return;
      pushStudyMemory({ silent: true });
    }).catch(() => { });
  } catch (e) { }
}
/* ============ 🧭 今日任务 AI 排程（用户 m21810） ============
   任务面板那七项以前是写死的。现在让 DeepTutor 看一眼今天的学情，决定今天该做哪几项、
   什么顺序 —— 错因没标完就排第一，知识卡没看够就排进去，弱项多排一点。

   ★两条铁律（fenbi-view.js 的 planTasks 里还有一道同样的闸）：
     ① 「点『去做』跳哪儿」永远是写死的词表，模型只能挑哪几项、排顺序、写一句话理由；
     ② 一天一次，模型坏了就退回默认七项 —— 绝不让排程挡住用户做题。 */
function planStats() {
  const s = {};
  try {
    const wrong = DB.wrong || [], c = DB.cause || {};
    s.wrong = wrong.length;
    const cause = {};
    let causeUnknown = 0;
    wrong.forEach(q => {
      const k = String((c[(q && q.id) || ''] || '')).trim();
      if (!k) causeUnknown++; else cause[k] = (cause[k] || 0) + 1;
    });
    s.cause = cause; s.causeUnknown = causeUnknown;
    s.tries = Object.keys(DB.tries || {}).length;
    /* 模块正确率：从练习记录累计（练了多少题、对了多少、一共花多久） */
    const byMod = {};
    (DB.log || []).forEach(e => {
      const m = String(e.m || '').replace(/\s*配速$/, '').trim();
      if (!m) return;
      const o = byMod[m] || (byMod[m] = { n: 0, right: 0, ms: 0 });
      o.n += Number(e.total) || 0; o.right += Number(e.right) || 0; o.ms += Number(e.usedMs) || 0;
    });
    s.modules = byMod;
    const rl = cardsRoundLeft();
    s.cards = { seen: rl.seen, total: rl.total, today: cardsToday(), quota: CARD_QUOTA };
    const d = DB.days[dayKey()] || {};
    s.today = { quiz: Number(d.quiz) || 0, cards: Number(d.cards) || 0 };
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const x = DB.days[dayKey(Date.now() - i * 86400000)];
      if (x && (x.quiz || x.cards)) streak++; else if (i > 0) break;
    }
    s.streak = streak;
    s.planDone = Object.keys((DB.plan && DB.plan.done) || {}).length;
  } catch (e) { }
  return s;
}
/* 一天一次；force = true 是用户按了 🧭，那就直接重排不省。
   ★返回值统一成「带状态的对象」，不再用裸 null —— 用户 m24503「这个功能真的有用吗」
   问的就是「按下去到底发生了什么」：原来成功/失败/命中当天缓存都长得一样（面板照旧），
   谁也看不出区别。现在带 ok/cached/model/error，🧭 那颗按钮照着给一句人话。
   ★另外去掉了「DeepTutor 网页版必须在跑」这道闸：/deep/plan 只读一次
   model_catalog.json + 直连模型，根本不经过网页后端。原来非开着 AI 讲师页才会动，
   这也是「按了没反应」的一大来源。 */
function autoPlan(force) {
  try {
    const ai = DB.plan && DB.plan.ai;
    if (!force && ai && ai.day === dayKey()) return Promise.resolve(Object.assign({}, ai, { ok: true, cached: true }));
    return fetch('/deep/status', { cache: 'no-store' }).then(r => r.json()).then(st => {
      if (!st || !st.installed) return { ok: false, error: 'DeepTutor 还没装好' };
      return fetch('/deep/plan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day: dayKey(), stats: planStats(), keys: Object.keys(window.XcPlanVocab || {}) })
      }).then(r => r.json()).then(j => {
        if (!j || !j.ok || !Array.isArray(j.tasks) || !j.tasks.length) {
          return { ok: false, error: String((j && (j.error || j.reason)) || '排程没返回任务') };
        }
        DB.plan = DB.plan || {}; DB.plan.done = DB.plan.done || {};
        DB.plan.ai = { day: dayKey(), tasks: j.tasks, why: String(j.why || ''), at: Date.now(), model: j.model || '', profile: j.profile || '' };
        save();
        return Object.assign({}, DB.plan.ai, { ok: true, cached: !!j.cached });
      });
    }).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  } catch (e) { return Promise.resolve({ ok: false, error: String(e && e.message || e) }); }
}
window.XcAutoPlan = autoPlan;
window.__xctermPlanStats = planStats;

/* ★模块专项：「去做」原来靠 data-drill-mod 那个装**考点 id** 的属性按模块名找 —— 永远找不到。
   现在直接从题库抽一个模块的题开一场，跳转才真的跳对。 */
function modDrill(mid, n) {
  const want = String(mid || '').trim();
  const total = Math.max(5, Math.min(60, Number(n) || 20));
  const m = (BANK_MODS.find(x => x.mid === want) || {});
  return ensureBank(want, '').then(() => {
    /* ★选题走 drillPick：先没做过的、再洗牌、并排掉刚做完那一场。
       （原来这里也是「取 BANK 前 N 条」，同一个 bug —— 见 drillPick 上面的注释） */
    const list = drillPick(BANK.filter(q => q.mid === want), total);
    if (!list.length) return { ok: false, reason: 'bank empty' };
    EXAM = {
      list, i: 0, ans: {}, submitted: false, mid: want,
      m: m.m || want, sub: '模块专项 · 共 ' + list.length + ' 题',
      startedAt: Date.now()
    };
    navigate('#/exam');
    return { ok: true, n: list.length, mod: m.m || want };
  }, e => ({ ok: false, reason: String(e && e.message || e) }));
}
window.XcDrill = modDrill;
window.__xctermModDrill = modDrill;

/* ============ 🧩 出题回流（用户 m19340）：错题 → 新题 ============
   错题本只能告诉我「哪儿错了」，要补洞还得有新题可做。两条路，各有各的用处：
     ① 真题补洞（0 token）：按错题的考点/题型，从真题库里挑**你还没做过的**。
        答案是真题答案，100% 可靠 —— 这条是主力。
     ② ✨ AI 补洞出题（要花一点 API 钱）：让模型照着错题出同类变式题。
        AI 出的题答案可能有争议，所以一律打 ai:true 水印、只在本地题池里，
        **不回传粉笔**（别污染粉笔那边的做题数据）。 */
function injectAIQuiz() {
  let n = 0;
  (DB.aiQuiz || []).forEach(q => {
    if (!q || !q.id || BANK_MAP[q.id]) return;
    BANK.push(q); BANK_MAP[q.id] = q; n++;
  });
  return n;
}

function aiQuizSave(list) {
  const arr = (DB.aiQuiz || []).filter(x => x && x.id);
  (list || []).forEach(x => { if (x && x.id && !arr.some(y => y.id === x.id)) arr.push(x); });
  DB.aiQuiz = arr.slice(-60);   /* 只留最近 60 道，别把 localStorage 撑爆 */
  saveNow();
  injectAIQuiz();
}
window.__xctermAiQuiz = { list: () => (DB.aiQuiz || []).slice(), inject: injectAIQuiz, save: aiQuizSave };
window.__xctermHoleList = holeList;
window.__xctermAiFromWrong = aiQuizFromWrong;

/* ① 真题补洞：同考点 / 同题型 → 你还没做过的真题 */
async function holeList(rows) {
  await ensureBankSearch();
  const done = new Set([...(DB.wrong || []), ...(DB.favs || []), ...Object.keys(DB.seen || {}), ...(rows || []).map(r => r.id)]);
  const kds = new Set((rows || []).map(r => String(r.kd || '').trim()).filter(Boolean));
  const ts = new Set((rows || []).map(r => String(r.t || '').trim()).filter(Boolean));
  const ms = new Set((rows || []).map(r => String(r.m || '').trim()).filter(Boolean));
  /* 先按考点（最准），再按题型，最后按模块兜底 —— 每一档都排掉做过的 */
  const pick = (pred, cap) => BANK.filter(q => q && q.id && !done.has(q.id) && !q.ai && pred(q)).slice(0, cap);
  const byKd = pick(q => kds.has(String(q.kd || '').trim()), 12);
  const byT = pick(q => ts.has(String(q.t || '').trim()) && !byKd.includes(q), 10);
  const byM = pick(q => ms.has(String(q.m || '').trim()) && !byKd.includes(q) && !byT.includes(q), 8);
  return byKd.concat(byT, byM).slice(0, 20);
}

/* ② AI 补洞出题：拿错题 + 错因去换同类变式题（要钱，所以默认 4 道、失败不重试） */
async function aiQuizFromWrong(n, rows) {
  const src = (rows || []).filter(r => r && r.id && String(r.q || '').trim()).slice(0, 10);
  if (!src.length) return { ok: false, error: '还没有错题可以拿去出题' };
  const body = {
    n: Math.max(1, Math.min(12, Number(n) || 4)),
    items: src.map(r => ({
      id: r.id, q: r.q, opts: (r.o || r.opts || []), a: r.a, e: r.e,
      m: r.m, t: r.t, kd: r.kd,
      cause: (DB.cause && DB.cause[r.id] && CAUSE_MAP[DB.cause[r.id]]) ? CAUSE_MAP[DB.cause[r.id]].i + ' ' + CAUSE_MAP[DB.cause[r.id]].n : ''
    }))
  };
  let j = null;
  try {
    const res = await fetch('/deep/quiz/from-wrong', { method: 'POST', body: JSON.stringify(body) });
    j = await res.json();
  } catch (e) { return { ok: false, error: '连不上本地服务（' + String(e && e.message || e).slice(0, 80) + '）' }; }
  if (!j || !j.ok) return { ok: false, error: String((j && j.error) || '出题失败') };
  const items = (j.items || []).map((x, i) => ({
    id: 'ai_' + Date.now().toString(36) + '_' + i,
    q: x.q, o: (x.opts || []), a: Number(x.a) || 0, e: x.e,
    m: (src[0] && src[0].m) || '行测', mid: (src[0] && src[0].mid) || '',
    t: (src[0] && src[0].t) || '', kd: x.kd || '', p: 'AI 补洞出题', ai: true,
    tip: x.tip || '', from: (src[0] && src[0].id) || ''
  }));
  aiQuizSave(items);
  return { ok: true, items, n: items.length, from: src.length };
}

function qList(host, title, ids, emptyText, opts = {}) {
  const missing = ids.filter(id => !BANK_MAP[id]);
  if (missing.length && !opts._loading) {
    host.innerHTML = `<h1>${esc(title)}</h1><div class="card" style="margin-top:16px"><div class="empty"><span class="big">📦</span><span id="loadbar">题库载入中… 0/${Math.min(missing.length, 99)}</span></div></div>`;
    ensureIds(missing, (d, t) => { const el = document.getElementById('loadbar'); if (el) el.textContent = `题库载入中… ${d}/${t}`; })
      .then(() => qList(host, title, ids, emptyText, Object.assign({}, opts, { _loading: false })));
    return;
  }
  const rows = ids.map(id => BANK_MAP[id]).filter(Boolean);
  const byMod = {};
  rows.forEach(q => { (byMod[q.m] = byMod[q.m] || []).push(q); });
  /* ★错因统计条（用户 m08574 第 4 条）：只在错题本里出现，收藏夹不掺和 */
  /* ★错因筛选（m15150 自主优化）：光统计没用，得能「只练哪一类错因」。
     模块筛选与错因筛选是两道独立的闸门，可以叠加（例：判断推理 × 粗心）。 */
  const ck = opts.cause || '';
  const hit = q => (!opts.filter || q.m === opts.filter) && (!ck || (((DB.cause && DB.cause[q.id]) || '') === (ck === 'none' ? '' : ck)));
  const shown = rows.filter(hit);
  const cs = opts.mode !== 'fav' ? causeStat(rows.map(q => q.id)) : null;  host.innerHTML = `
  <h1>${esc(title)} <span class="dim" style="font-size:14px;font-weight:400">${rows.length} 题</span></h1>
  ${cs ? `<div class="cause-sum" data-causesum="1">${causeSumHTML(rows.map(q => q.id))}</div>
  <div class="row wrap cause-f" style="margin:10px 0 2px;gap:8px">
    <span class="cause-q">按错因特训</span>
    <button class="chip ${!ck ? 'on' : ''}" data-cf="">全部错因</button>
    ${CAUSE.map(c => `<button class="chip ${ck === c.k ? 'on' : ''}" data-cf="${c.k}" title="${esc(c.d)}">${c.i} ${c.n} ${cs[c.k]}</button>`).join('')}
    <button class="chip ${ck === 'none' ? 'on' : ''}" data-cf="none" title="还没标错因的题">未标 ${cs.none}</button>
  </div>` : ''}
  <div class="row wrap" style="margin:16px 0;gap:10px">
    <button class="chip ${!opts.filter ? 'on' : ''}" data-f="">全部 ${rows.length}</button>
    ${Object.keys(byMod).map(m => `<button class="chip ${opts.filter === m ? 'on' : ''}" data-f="${esc(m)}">${esc(m)} ${byMod[m].length}</button>`).join('')}
    ${rows.length ? `<span class="grow"></span>${cs ? `<button class="chip" id="due-ai" title="按间隔重复排到今天该复习的错题">🧠 复习日程…</button><button class="chip" id="cause-drill" title="一道一屏、按 1-6 快速把没标的错因补齐（比手点快得多）">🧭 快速标错因 ${cs.none}</button><button class="btn sm" id="cause-ai" title="把错因构成交给 AI 讲师，换一份可以照着做的补漏计划">🧭 按错因带我复盘</button>` : ''}${opts.mode === 'wrong' ? `<button class="chip" id="hole-real" title="0 token：从真题库里挑同考点、你还没做过的真题补洞">🧩 真题补洞</button><button class="chip" id="hole-ai" title="让 AI 照着你的错题出同类变式题（要花一点点 API 钱）">✨ AI 补洞出题</button>` : ''}<button class="chip" id="time-limit" title="限时做题：按每题 55 秒估时（行测的生死线），到点自动交卷">⏱ 限时</button><button class="btn pri sm" id="practice-all">练习这些（${shown.length}）</button>` : ''}
  </div>
  ${rows.length ? (shown.length ? `<div class="list">${shown.map(q => `
    <div class="li" data-q="${q.id}">
      <div class="t">${esc(shorten(q.q, 130))}</div>
      <div class="m"><span class="tag">${esc(q.m)}${q.t ? ' · ' + esc(q.t) : ''}</span><span class="tag">答案 ${LETTERS[q.a]}</span>${q.p ? `<span class="tag">${esc(q.p)}</span>` : ''}${opts.mode === 'fav' ? '' : causeTagHTML(q.id)}</div>
      <div class="row" style="margin-top:10px;gap:8px">
        <button class="btn xs" data-view="${q.id}">看解析</button>
        <button class="btn xs" data-del="${q.id}">${opts.mode === 'fav' ? '取消收藏' : '移出错题本'}</button>
      </div>
      ${opts.mode === 'fav' ? '' : causeBarHTML(q.id)}
    </div>`).join('')}</div>` : `<div class="card"><div class="empty"><span class="big">🎯</span>这个筛选下没有题 —— 换一个错因，或者在上面点「全部错因」</div></div>`) : `<div class="card"><div class="empty"><span class="big">${opts.mode === 'fav' ? '⭐' : '🎯'}</span>${esc(emptyText)}</div></div>`}`;
  host.querySelectorAll('[data-f]').forEach(el => el.onclick = () => qList(host, title, ids, emptyText, Object.assign({}, opts, { filter: el.dataset.f })));
  host.querySelectorAll('[data-cf]').forEach(el => el.onclick = () => qList(host, title, ids, emptyText, Object.assign({}, opts, { cause: el.dataset.cf })));
  host.querySelectorAll('[data-del]').forEach(el => el.onclick = e => {
    e.stopPropagation();
    const del = el.dataset.del;
    opts.mode === 'fav' ? toggleFav(del) : toggleWrong(del);
    /* ids 是进页面时的快照，必须把刚删的这个摘掉，否则这一行会赖在屏幕上不走 */
    qList(host, title, ids.filter(x => x !== del), emptyText, opts);
  });
  host.querySelectorAll('[data-view]').forEach(el => el.onclick = e => { e.stopPropagation(); showQuestion(el.dataset.view); });
  host.querySelectorAll('[data-q]').forEach(el => el.onclick = () => showQuestion(el.dataset.q));
  bindCause(host);
  const cai = $('#cause-ai');
  if (cai) cai.onclick = () => askCauseReview(rows.map(q => q.id));
  const cdr = $('#cause-drill');
  if (cdr) cdr.onclick = () => causeDrill(rows.map(q => q.id));
  const tl = $('#time-limit');
  if (tl) {
    const hasPaper = Number(opts.limit) > 0;
    const paint = () => {
      const on = tl.classList.contains('on');
      if (!on) { tl.textContent = '⏱ 限时'; tl.title = '限时做题：真题卷按卷面限时，其它按每题 55 秒估时（行测的生死线），到点自动交卷'; return; }
      const ms = hasPaper ? Number(opts.limit) : 55000 * shown.length;
      tl.textContent = '⏱ ' + fmtClock(ms);
      tl.title = (hasPaper ? '这套真题卷的卷面限时' : '按每题 55 秒估时') + '，到点自动交卷 —— 再点一下取消限时';
    };
    if (hasPaper) tl.classList.add('on');
    paint();
    tl.onclick = () => { tl.classList.toggle('on'); paint(); };
  };
  const pa = $('#practice-all');
  /* 🧩 补洞两条路：真题（0 token）/ AI 变式题（要钱） */
  {
    const hr = $('#hole-real');
    if (hr) hr.onclick = async () => {
      hr.disabled = true; hr.textContent = '⏳ 挑题中…';
      let list = [];
      try { list = await holeList(rows); } catch (e) { }
      hr.disabled = false; hr.textContent = '🧩 真题补洞';
      if (!list.length) { toast('这个考点下的真题你都做过了 —— 试试 ✨ AI 补洞出题'); return; }
      toast('挑出 ' + list.length + ' 道没做过的同考点真题');
      EXAM = { list, i: 0, ans: {}, submitted: false, mid: '', m: '真题补洞', sub: '', startedAt: Date.now(), limit: 55000 * list.length };
      navigate('#/exam');
    };
    const ha = $('#hole-ai');
    if (ha) ha.onclick = async () => {
      ha.disabled = true; ha.textContent = '⏳ 出题中…';
      let r = null;
      try { r = await aiQuizFromWrong(4, rows); } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
      ha.disabled = false; ha.textContent = '✨ AI 补洞出题';
      if (!r || !r.ok) { toast((r && r.error) || '出题失败'); return; }
      toast('✨ 出了 ' + r.n + ' 道变式题（已进本地题池，不回传粉笔）');
      const list = r.items.map(x => BANK_MAP[x.id]).filter(Boolean);
      if (list.length) {
        EXAM = { list, i: 0, ans: {}, submitted: false, mid: '', m: 'AI 补洞出题', sub: 'AI 生成 · 答案仅供参考', startedAt: Date.now(), limit: 55000 * list.length };
        navigate('#/exam');
      }
    };
  }
  if (pa) pa.onclick = () => {
    /* ★练的就是屏幕上筛出来的这些（模块 × 错因两道闸门都算上）——
       以前无论怎么筛都只按模块取，点「练习」会把别类错因的题也塞进来。 */
    const list = shown;
    if (!list.length) { toast('这个筛选下没有题'); return; }
    const c = ck && ck !== 'none' ? CAUSE_MAP[ck] : null;
    const sub = [opts.filter, ck === 'none' ? '未标错因' : (c ? c.i + ' ' + c.n : '')].filter(Boolean).join(' · ');
    /* ★限时：真题卷用卷面限时（opts.limit），其它按每题 55 秒估时 —— 点 chip 关掉就整场不限时 */
    const on = !tl || tl.classList.contains('on');
    const limit = !on ? 0 : (Number(opts.limit) > 0 ? Number(opts.limit) : 55000 * list.length);
    EXAM = { list, i: 0, ans: {}, submitted: false, mid: '', m: title, sub, startedAt: Date.now(), limit };
    navigate('#/exam');
  };
  /* ★1.9.9 复习日程（用户 m16822「把练习给设置好」）：间隔重复只有在「到期那天真的有人来做」时才成立。
     这里把 DeepTutor 练习库里今天到期的错题捞回来，在超频里直接当一套题做掉 —— 不用再切到网页版。 */
  const da = $('#due-ai');
  if (da) {
    const at = t => { const d = new Date(t * 1000); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    fetch('/deep/study/queue').then(r => r.json()).then(k => {
      if (!k || !k.ok) { da.textContent = '🧠 复习日程（要开着 AI 讲师）'; da.disabled = true; da.title = String((k && k.error) || 'DeepTutor 没在跑'); return; }
      const n = k.count | 0;
      da.classList.toggle('on', n > 0);
      if (n > 0) {
        da.textContent = '🧠 今天该复习 ' + n + ' 道';
        da.title = '按间隔重复排到今天该复习的错题 —— 点一下就当一套题做掉';
        da.onclick = () => qList(host, '今天该复习', k.ids, '今天没有到期的错题', { mode: 'wrong' });
      } else {
        da.textContent = '🧠 今天不用复习';
        da.title = k.nextDueAt ? ('下一次该复习：' + at(k.nextDueAt)) : '还没有排期';
        da.onclick = () => toast(k.nextDueAt ? ('今天没有到期的错题 —— 下一次 ' + at(k.nextDueAt)) : '今天没有到期的错题');
      }
    }).catch(() => { da.textContent = '🧠 复习日程'; da.disabled = true; });
  }
}
VIEWS.wrong = host => qList(host, '错题本', DB.wrong.slice().reverse(), '还没有错题，去刷题吧', { mode: 'wrong' });
VIEWS.favs = host => qList(host, '收藏夹', DB.favs.slice().reverse(), '还没有收藏题目，刷题时点 ☆ 收藏', { mode: 'fav' });

/* ============================ 8b. 粉笔同步 ============================ */
/* 开考：把一组题目塞进 EXAM 并跳到答题页（原是 VIEWS.fenbi 的局部函数，
   现在提到模块作用域，好让外部的 fenbi-view.js 也能用）。
   fenbiMeta = { key: '1_1_xxx' } 时，本地作答会回传粉笔（见 fenbi-bridge.js）。 */
function startExam(rows, title, fenbiMeta) {
  if (!rows || !rows.length) { toast('这套题还没载入'); return; }
  /* blind = 粉笔智能组卷出的新题，本地没有答案，交卷后由 FenbiBridge.grade() 取粉笔解析判分 */
  const blind = !!(fenbiMeta && fenbiMeta.blind);
  EXAM = { list: rows, i: 0, ans: {}, submitted: false, mid: '', m: title || '练习', sub: '', startedAt: Date.now(), fenbi: fenbiMeta || null, blind };
  if (window.FenbiBridge && fenbiMeta) {
    try { window.FenbiBridge.start(fenbiMeta, rows); } catch (e) { }
  }
  navigate('#/exam');
}
/* 把粉笔上的错题导进本地错题本（只加没见过的） */
function importWrong(ids) {
  const want = [...new Set((ids || []).map(String).filter(x => BANK_MAP[x]))];
  if (!want.length) { toast('这些题还没拉到本地，先「📥 拉到本地」'); return 0; }
  const have = new Set(DB.wrong.map(String));
  const add = want.filter(x => !have.has(x));
  if (!add.length) { toast('错题本里已经有了'); return 0; }
  DB.wrong = DB.wrong.concat(add);
  save();
  toast(`已导进错题本 ${add.length} 题`);
  return add.length;
}
VIEWS.fenbi = (host, r) => {
  /* 在线/离线镜像视图在 fenbi-view.js 里（Separate file，保持 app.js 的老逻辑原样作兜底）。
     app.js 是 IIFE（app.js:5），内部变量不在全局，所以走参数把 helpers 递进去。 */
  if (window.FenbiView) return window.FenbiView(host, r, {
    FenbiAPI: window.FenbiAPI,
    snap: window.XCFENBI,
    BANK_MAP, DB, esc, stem: stemHTML, toast, navigate,
    startExam, importWrong, save, saveNow   /* ★save/saveNow：今日任务面板要把 DB.plan 落盘（saveNow 是同步的） */
  });
  const F = window.XCFENBI;
  const sub = (r && r.arg) || '';
  if (!F) {
    host.innerHTML = `<h1>粉笔同步</h1>
      <div class="card" style="margin-top:16px"><div class="empty"><span class="big">🌸</span>
        <div style="max-width:460px;line-height:1.9">
          还没有同步过粉笔数据。<br><br>
          在 <b>fenbi-sync</b> 文件夹里双击 <b>「同步.cmd」</b>，<br>
          粉笔上的<b>错题</b>和<b>收藏</b>就会自动进到本地的
          <a href="#/wrong">错题本</a> / <a href="#/favs">收藏夹</a>。<br><br>
          <span class="dim">整个程序仍然是离线的：同步只是把粉笔的题拉成本地文件，不联网也能刷。</span>
        </div>
      </div></div>`;
    return;
  }
  if (sub === 'wrong') return qList(host, '粉笔错题', (F.wrong || []).slice().reverse(), '粉笔上没有错题', { mode: 'wrong' });
  if (sub === 'favs') return qList(host, '粉笔收藏', (F.favs || []).slice().reverse(), '粉笔上没有收藏', { mode: 'fav' });

  const sets = F.sets || [];
  /* parseHash()（app.js:233）只把 seg[1] 当 arg，多段路径会被截断，
     所以练习集 id 直接放 arg 位：#/fenbi/fbset_5823067 */
  const mSet = /^(fbset_[\w-]+)$/.exec(sub);
  if (mSet) {
    const s = sets.find(x => x.id === mSet[1]);
    if (!s) { host.innerHTML = `<h1>粉笔真题卷</h1><div class="empty"><span class="big">📄</span>找不到这套题</div>`; return; }
    return qList(host, s.name, (s.qids || []).slice(), '这套题还没同步下来', { limit: Number(s.time || 0) * 60000 || 0 });
  }

  const d = new Date(F.syncedAt);
  const when = isNaN(d) ? F.syncedAt : d.toLocaleString('zh-CN', { hour12: false });
  const cnt = F.counts || {};
  const nWrong = (F.wrong || []).length, nFav = (F.favs || []).length;
  const imp = DB.fenbiImported && !Array.isArray(DB.fenbiImported) ? DB.fenbiImported : { wrong: [], favs: [] };
  const nImp = imp.wrong.length + imp.favs.length;
  const nRemoved = Math.max(0, nImp - DB.wrong.filter(x => /^fb_/.test(x)).length - DB.favs.filter(x => /^fb_/.test(x)).length);

  const stat = (icon, label, n, note) => `
    <div class="card" style="flex:1;min-width:150px;padding:16px">
      <div style="font-size:22px">${icon}</div>
      <div style="font-size:26px;font-weight:800;margin-top:4px">${n}</div>
      <div class="dim" style="font-size:12px;margin-top:2px">${esc(label)}</div>
      ${note ? `<div class="dim" style="font-size:11px;margin-top:6px">${esc(note)}</div>` : ''}
    </div>`;

  host.innerHTML = `
  <h1>粉笔同步 <span class="dim" style="font-size:14px;font-weight:400">上次同步 ${esc(when)}</span></h1>
  <div class="row wrap" style="margin:16px 0;gap:12px">
    ${stat('❌', '粉笔错题', cnt['错题'] ?? nWrong, `${nWrong} 题在本地`)}
    ${stat('⭐', '粉笔收藏', cnt['收藏'] ?? nFav, `${nFav} 题在本地`)}
    ${stat('📝', '粉笔笔记', cnt['笔记'] ?? 0, '')}
    ${stat('📥', '已导进本地', nImp, nRemoved ? `你手动移出了 ${nRemoved} 题` : '全部仍在错题本/收藏夹')}
  </div>

  <div class="row wrap" style="gap:10px;margin-bottom:18px">
    <button class="btn pri" data-go-sub="wrong">❌ 粉笔错题（${nWrong}）</button>
    <button class="btn" data-go-sub="favs">⭐ 粉笔收藏（${nFav}）</button>
    <button class="btn" id="fenbi-all">✏️ 全练一遍（${nWrong}）</button>
  </div>

  ${sets.length ? `
  <h2 style="margin:22px 0 10px">📄 粉笔真题卷 <span class="dim" style="font-size:13px;font-weight:400">${sets.length} 套</span></h2>
  <div class="col" style="gap:10px">
    ${sets.map(s => `
      <div class="card row" style="align-items:center;gap:14px;padding:14px 16px">
        <div class="grow">
          <div style="font-weight:700">${esc(s.name)}</div>
          <div class="dim" style="font-size:12px;margin-top:4px">
            ${esc(s.date || '')} · ${(s.qids || []).length} 题${s.time ? ' · 限时 ' + Math.round(s.time / 60) + ' 分钟' : ''}
            ${(s.chapters || []).length ? ' · ' + esc(s.chapters.map(c => c.name.replace('言语理解与表达', '言语')).join(' ')) : ''}
          </div>
        </div>
        <button class="btn" data-go-sub="${s.id}">看题</button>
        <button class="btn pri" data-exam-set="${s.id}">✏️ 开考</button>
      </div>`).join('')}
  </div>` : ''}

  <div class="card" style="padding:16px">
    <div class="dim" style="line-height:1.9;font-size:13px">
      粉笔侧变了就去 <b>fenbi-sync</b> 双击 <b>「同步.cmd」</b>，回来按 F5。<br>
      你手动移出错题本的题，下次同步<b>不会</b>被加回来。<br>
      同步下来的题和原题库混在一起用：<a href="#/wrong">错题本</a> · <a href="#/favs">收藏</a> · 顶部搜索。
    </div>
  </div>`;

  host.querySelectorAll('[data-go-sub]').forEach(el => el.onclick = () => navigate('#/fenbi/' + el.dataset.goSub));
  host.querySelectorAll('[data-exam-set]').forEach(el => el.onclick = () => {
    const s = sets.find(x => x.id === el.dataset.examSet);
    startExam((s?.qids || []).map(id => BANK_MAP[id]).filter(Boolean), s?.name || '粉笔真题卷');
  });
  const all = $('#fenbi-all');
  if (all) all.onclick = () => startExam((F.wrong || []).map(id => BANK_MAP[id]).filter(Boolean), '粉笔错题');
};

/* ★用户 m08574 第 5 条：题目 → 知识卡的反向跳转。靠 backfill_qid.mjs 回填的 card.q.id 精确反查 */
function cardsOfQuestion(id) {
  const out = [];
  (NOTES || []).forEach(m => (m.cards || []).forEach(c => {
    if (c.q && c.q.id === id) out.push({ route: '#/notes/' + m.id + '?card=' + encodeURIComponent(c.id), label: (m.icon || '📇') + ' ' + (m.m || m.id) + '：' + shorten(c.t || '', 18) });
  }));
  (SHIZHENG || []).forEach(c => {
    if (c.q && c.q.id === id) out.push({ route: '#/shizheng/' + encodeURIComponent(c.sec) + '?card=' + encodeURIComponent(c.id), label: '🗞️ ' + c.sec + '：' + shorten(c.t || '', 18) });
  });
  return out;
}
function showQuestion(id) {
  if (!BANK_MAP[id]) {
    const host = $('#view');
    host.innerHTML = `<div class="card" style="margin-top:16px"><div class="empty"><span class="big">📦</span><span id="loadbar">题目载入中…</span></div></div>`;
    return ensureIds([id], (d, t) => { const el = document.getElementById('loadbar'); if (el) el.textContent = `题目载入中… ${d}/${t}`; })
      .then(() => { if (BANK_MAP[id]) showQuestion(id); else host.innerHTML = `<div class="card" style="margin-top:16px"><div class="empty"><span class="big">🫥</span>题库里没有这道题（可能只存在于知识卡的配题里）</div></div>`; });
  }
  const q = BANK_MAP[id];
  if (!q) return;
  const inWrong = DB.wrong.indexOf(id) >= 0, inFav = DB.favs.indexOf(id) >= 0;
  const noteText = (DB.notes && DB.notes[id]) || '';
  const jump = cardsOfQuestion(id);
  const host = $('#view');
  host.innerHTML = `<div class="page">
    <div class="row between" style="margin-bottom:14px">
      <div class="deckhead"><span class="kb">题目解析</span><span class="kmeta">${esc(q.m)}${q.t ? ' · ' + esc(q.t) : ''}${q.p ? ' · ' + esc(q.p) : ''}</span></div>
      <button class="btn sm" id="back">← 返回</button>
    </div>
    <div class="qcard">
      ${q.z && q.z.m ? ZLMAT(q) : (q.mat ? `<div class="qmat">${stemHTML(q.mat, q)}</div>` : '')}
      ${q.z && q.z.s ? ZLSTEM(q) : `<div class="qbody">${stemHTML(q.q, q)}</div>`}
      ${figHTML(q)}
      ${q.o.map((o, i) => `<div class="opt ${qOK(q, i) ? 'right' : ''}" style="cursor:default"><span class="k">${LETTERS[i]}</span><span>${esc(OPTTEXT(q, o))}</span></div>`).join('')}
      <div class="expl">答案：${qAns(q)}${q.ms ? '（多选）' : ''}${thinkHTML(q)}${q.e ? '\n\n' + esc(q.e) : ''}</div>
      <div class="row" style="margin-top:14px;gap:8px">
        <button class="btn sm" id="f">${inFav ? '⭐ 已收藏' : '☆ 收藏'}</button>
        <button class="btn sm" id="w">${inWrong ? '移出错题本' : '加入错题本'}</button>
        <button class="btn sm" id="n">${noteText ? '📝 笔记（有）' : '📝 记笔记'}</button>
        <button class="btn sm" id="ask-ai" title="把题干/选项/正确答案/官方解析一起交给 AI 讲师讲一遍">🤖 问 AI 讲师</button>
        <button class="btn sm" id="kp-drill" title="同考点的题连着做一批 —— 错一道就吃透一类，比漫无目的刷 20 道有用">🔁 同类考点连刷</button>
      </div>
      ${inWrong ? causeBarHTML(id) : ''}
      ${jump.length ? `<div class="row wrap" style="margin-top:12px;gap:8px"><span class="dim" style="font-size:12px">📚 考这道题的知识卡</span>${jump.map((c, i) => `<button class="chip" data-jumpcard="${i}">${esc(c.label)}</button>`).join('')}</div>` : ''}
      <div id="notebox" style="margin-top:12px;display:${noteText ? 'block' : 'none'}">
        <textarea id="notetext" rows="3" placeholder="写点什么…"
          style="width:100%;padding:9px 11px;border-radius:9px;border:1px solid var(--line,#5a4636);background:transparent;color:inherit;resize:vertical"></textarea>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn sm pri" id="notesave">💾 保存笔记</button>
          <button class="btn sm" id="notedel">删除</button>
          <span class="dim" style="font-size:11px">${fenbiQid(id) ? '保存后同步到粉笔笔记' : '只存在本地'}</span>
        </div>
      </div>
    </div>
  </div>`;
  $('#back').onclick = () => history.back();
  const askEl = $('#ask-ai');
  if (askEl) askEl.onclick = () => askAI(q);
  const kpEl = $('#kp-drill');
  if (kpEl) kpEl.onclick = () => kpDrill(id, 8).then(r => { if (!r.ok) toast('同类考点的题：' + (r.reason || '不够')); });
  $('#f').onclick = () => { toggleFav(id); showQuestion(id); };
  $('#w').onclick = () => { toggleWrong(id); showQuestion(id); };
  host.querySelectorAll('[data-jumpcard]').forEach(el => el.onclick = () => navigate(jump[+el.dataset.jumpcard].route));
  bindCause(host);

  /* 逐题笔记：本地存 DB.notes，粉笔的题会顺手推到粉笔笔记 */
  const nEl = $('#notetext'); if (nEl) nEl.value = noteText;
  $('#n').onclick = () => {
    const box = $('#notebox');
    const show = box.style.display === 'none';
    box.style.display = show ? 'block' : 'none';
    if (show) $('#notetext').focus();
  };
  $('#notesave').onclick = () => {
    const v = $('#notetext').value.trim(), qid = fenbiQid(id);
    DB.notes = DB.notes || {};
    if (v) DB.notes[id] = v; else delete DB.notes[id];
    save();
    if (!v) return toast('笔记已清空');
    toast('笔记已存' + (qid ? '，正在同步粉笔…' : ''));
    if (qid && window.FenbiAPI) {
      window.FenbiAPI.addNote(qid, v).then(r => {
        const nid = r && (r.id || r.noteId);
        if (nid) { DB.fenbiNoteId = DB.fenbiNoteId || {}; DB.fenbiNoteId[id] = nid; save(); }
        toast('已同步到粉笔笔记 📝');
      }).catch(() => toast('粉笔那边没同步上（本地已记下）'));
    }
  };
  $('#notedel').onclick = () => {
    const nid = DB.fenbiNoteId && DB.fenbiNoteId[id];
    $('#notetext').value = '';
    if (DB.notes) delete DB.notes[id];
    if (nid) {
      delete DB.fenbiNoteId[id];
      if (window.FenbiAPI) window.FenbiAPI.delNote(nid).catch(() => { });
    }
    save(); toast('笔记已删');
  };

  /* 粉笔笔记 → 本地：本地还没写过，就先看看粉笔那边有没有，取回来落到输入框 */
  const pullQid = fenbiQid(id);
  if (pullQid && !noteText && window.FenbiAPI && window.FenbiAPI.notes) {
    window.FenbiAPI.notes([pullQid]).then(raw => {
      /* 粉笔回的形状不固定：可能是数组、可能按 questionId 分组、可能还包着 code/data/msg */
      let hit = null;
      const pick = o => o && (o.content != null ? o.content : (o.note != null ? o.note : null));
      if (Array.isArray(raw)) hit = raw.find(x => x && String(x.questionId) === pullQid) || raw[0];
      else if (raw && typeof raw === 'object') hit = raw[pullQid] || raw[String(pullQid)] || (Array.isArray(raw.list) ? raw.list[0] : null);
      const c = pick(hit);
      if (!c) return;
      const box = $('#notebox'), ta = $('#notetext');
      if (!box || !ta) return;                       /* 用户已经切走了 */
      ta.value = String(c);
      box.style.display = 'block';
      const hint = box.querySelector('span.dim');
      if (hint) hint.textContent = '来自粉笔 —— 点「保存笔记」才落到本地';
    }).catch(() => { });
  }
}

/* ============================ 10. 时政月报 ============================ */
/* ======================= 12.5 易混辨析（真题解析挖掘） ======================= */
const BX = { per: 40, page: 1, tab: 'all', sort: 'q', kw: '' };
function bxAll() { return (window.BIANXI && window.BIANXI.groups) || []; }
function bxList() {
  let list = bxAll();
  if (BX.tab === 'cheng') list = list.filter(g => g.ty === '成语');
  else if (BX.tab === 'shi') list = list.filter(g => g.ty !== '成语');
  if (BX.kw) {
    const W = window.__bxW || (window.__bxW = (() => {
      const m = new Map();
      for (const g of bxAll()) for (const e of g.ws) { if (!m.has(e.w)) m.set(e.w, []); m.get(e.w).push(g); }
      return m;
    })());
    const hit = new Set();
    for (const [w, gs] of W) if (w.indexOf(BX.kw) >= 0) for (const g of gs) hit.add(g);
    list = list.filter(g => hit.has(g) || g.ws.some(e => (e.d || '').indexOf(BX.kw) >= 0));
  }
  if (BX.sort === 'sc') list = list.slice().sort((a, b) => b.sc - a.sc || b.q - a.q || a.k.localeCompare(b.k));
  else if (BX.sort === 'n') list = list.slice().sort((a, b) => b.n - a.n || b.q - a.q || a.k.localeCompare(b.k));
  else if (BX.sort === 'hit') list = list.slice().sort((a, b) => b.hit - a.hit || b.q - a.q);
  return list;
}
function bxCard(g, i) {
  const ans = g.ans || [];
  const rows = g.ws.map(e => {
    const tags = (e.tg || []).map(t => `<i>${esc(t)}</i>`).join('');
    return `<div class="bx-row"><div class="bx-w${ans.indexOf(e.w) >= 0 ? ' ok' : ''}" data-bxw="${esc(e.w)}">${esc(e.w)}</div>` +
      `<div class="bx-d">${e.d ? esc(e.d) : '<span class="dim">解析未单讲此词</span>'}${tags}</div></div>`;
  }).join('');
  const pap = (g.pap || []).slice(0, 3).join('、');
  const eg = (g.eg || [])[0] || '';
  return `<div class="bxcard"><div class="bx-h"><span class="bx-n">${i + 1}</span>` +
    `<span class="bx-ty">${esc(g.ty)}</span>` +
    `<span class="bx-cnt">${g.ws.length} 词 · 有辨析 ${g.hit}</span>` +
    (g.n > 1 ? `<span class="bx-freq">真题出现 ${g.n} 次</span>` : '') +
    (pap ? `<span class="bx-pap">${esc(pap)}</span>` : '') + `</div>` +
    `<div class="bx-rows">${rows}</div>` +
    (eg ? `<div class="bx-eg"><b>真题语境</b>${esc(eg)}</div>` : '') + `</div>`;
}
function bxRender(host, r) {
  const all = bxAll();
  if (!all.length) {
    host.innerHTML = `<div class="card"><h3>易混辨析</h3><p class="dim">数据未加载：需要 app/data/bianxi.js（用 zhenti_build/build_bianxi.js --write 生成）</p></div>`;
    return;
  }
  const list = bxList();
  const show = list.slice(0, BX.per * BX.page);
  host.innerHTML =
    `<div class="bx-head card"><div class="bx-t">🔍 易混辨析 <span class="dim">共 ${all.length} 组 · 覆盖 ${window.BIANXI.words || ''} 词 · 由真题解析自动成组</span></div>` +
    `<div class="bx-ctl"><input id="bxq" class="bx-in" placeholder="搜索词（如 走马观花 / 引导）" value="${esc(BX.kw)}">` +
    `<div class="bx-tabs">` +
    ['all:全部', 'cheng:成语', 'shi:实词·词语'].map(x => { const [k, t] = x.split(':'); return `<button class="bx-tab${BX.tab === k ? ' on' : ''}" data-bxt="${k}">${t}</button>`; }).join('') +
    `</div><div class="bx-tabs">` +
    ['q:常考', 'hit:辨析全', 'n:真题多', 'sc:高频词'].map(x => { const [k, t] = x.split(':'); return `<button class="bx-tab${BX.sort === k ? ' on' : ''}" data-bxs="${k}">${t}</button>`; }).join('') +
    `</div></div><div class="bx-tip dim">用法：一组词就是同一道真题里互相竞争的同位词，逐条看「辨析」找差别；<b>点词</b>可反查该词的所有对比组。</div></div>` +
    `<div class="bx-wrap">${show.map(bxCard).join('')}</div>` +
    (show.length < list.length ? `<div class="bx-more"><button class="btn" id="bxmore">加载更多（还有 ${list.length - show.length} 组）</button></div>` : `<div class="dim bx-end">— 共 ${list.length} 组 —</div>`);

  const q = host.querySelector('#bxq');
  q.oninput = () => { BX.kw = q.value.trim(); BX.page = 1; const p = q.selectionStart; bxRender(host, r); const q2 = host.querySelector('#bxq'); q2.focus(); try { q2.setSelectionRange(p, p); } catch (e) { } };
  host.querySelectorAll('[data-bxt]').forEach(b => b.onclick = () => { BX.tab = b.dataset.bxt; BX.page = 1; bxRender(host, r); });
  host.querySelectorAll('[data-bxs]').forEach(b => b.onclick = () => { BX.sort = b.dataset.bxs; BX.page = 1; bxRender(host, r); });
  host.querySelectorAll('.bx-w').forEach(w => w.onclick = () => { BX.kw = w.dataset.bxw; BX.page = 1; bxRender(host, r); });
  const more = host.querySelector('#bxmore');
  if (more) more.onclick = () => { BX.page++; bxRender(host, r); const w = host.querySelector('.bx-wrap'); if (w) w.scrollIntoView({ block: 'start' }); };
}
VIEWS.bianxi = (host, r) => {
  const w = r && r.query && r.query.get('w');
  if (w) BX.kw = w;
  bxRender(host, r);
};

VIEWS.shizheng = (host, r) => {
  if (r.arg) {
    const sec = r.arg;
    const list = SHIZHENG.filter(c => c.sec === sec).map(c => ({ mod: { id: 'shizheng', m: '时政月报', icon: '🗞️' }, card: c, sz: true }));
    return deckRender(host, sec, '时政月报', list, false, null, false, r.query.get('card') || '');
  }
  const groups = {};
  SHIZHENG.forEach(c => { (groups[c.sec] = groups[c.sec] || []).push(c); });
  const ids = SHIZHENG.map(c => c.id);
  const seen = ids.filter(id => DB.sz.seen[id]).length;
  const due = countDue(DB.sz, ids);
  host.innerHTML = `
  <h1>时政月报 <span class="dim" style="font-size:14px;font-weight:400">刘志学橙啦半月时政 · ${SHIZHENG.length} 张</span></h1>
  <div class="card" style="margin-top:16px">
    <div class="row between">
      <div><div class="mut" style="font-size:13px">已看 ${seen}/${SHIZHENG.length} · 待复习 ${due}</div>
      <div class="bar" style="width:340px;margin-top:10px"><i style="width:${pct(seen, SHIZHENG.length)}%"></i></div></div>
      <div class="row" style="gap:8px">
        <button class="btn sm" id="review">⏰ 开始复习（${due}）</button>
      </div>
    </div>
  </div>
  <div class="mods" style="margin-top:18px">
    ${Object.entries(groups).map(([sec, arr]) => {
      const s = arr.filter(c => DB.sz.seen[c.id]).length;
      const d = countDue(DB.sz, arr.map(c => c.id));
      return `<div class="mod" data-sec="${esc(sec)}">
        <div class="mh"><div class="mi">🗞️</div><div><div class="mn">${esc(sec)}</div><div class="ms">${arr.length} 张${arr.filter(c => c.q).length ? ' · 含密押题' + arr.filter(c => c.q).length : ''}${d ? ' · ⏰' + d : ''}</div></div></div>
        <div class="mt"><span>已看 ${s} · 未看 ${arr.length - s}</span><span>${pct(s, arr.length)}%</span></div>
        <div class="bar mp"><i style="width:${pct(s, arr.length)}%"></i></div>
      </div>`;
    }).join('')}
  </div>`;
  host.querySelectorAll('[data-sec]').forEach(el => el.onclick = () => navigate('#/shizheng/' + encodeURIComponent(el.dataset.sec)));
  const rv = $('#review');
  if (rv) rv.onclick = () => {
    const list = SHIZHENG.filter(c => { const x = DB.sz.review[c.id]; return x && (x.due || 0) <= Date.now(); }).map(c => ({ mod: { id: 'shizheng' }, card: c, sz: true }));
    if (!list.length) return toast('没有到期的时政卡 🎉');
    deckRender(host, '时政复习', '到期卡片', list, true);
  };
};

/* ============================ 11. 思维导图 ============================ */
VIEWS.mind = (host) => {
  let cur = null;
  const render = (node) => {
    cur = node;
    host.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <div class="deckhead"><span class="kb">${esc(MINDMAP.name || '思维导图')}</span><span class="kmeta">点左侧节点定位 · 含图节点显示图片</span></div>
    </div>
    <div class="mmwrap">
      <div class="side" style="max-height:calc(100vh - 170px);overflow:auto"><div class="tree" id="tree"></div></div>
      <div>
        <div class="mmpanel">${node && node.img ? `<img class="mmimg" src="assets/mind/${encodeURIComponent(node.img)}" alt="">` : node ? `<div class="qcard mmnode"><span class="qsec">导图节点</span><div class="qtitle">${esc(node.t || '')}</div>${node.kids && node.kids.length ? `<div class="qbody">${node.kids.map(k => '· ' + esc(k.t || '')).join('\n')}</div>` : '<div class="dim" style="margin-top:12px;font-size:13px">叶子节点</div>'}</div>` : '<div class="empty"><span class="big">🗺️</span>从左侧点一个节点开始</div>'}</div>
      </div>
    </div>`;
    const buildTree = (nodes, depth) => nodes.map(n => `
      <div>
        <div class="tnode ${cur === n ? 'on' : ''}" data-k="${encodeURIComponent(n.t || '')}" style="padding-left:${6 + depth * 4}px">${n.img ? '🖼 ' : ''}${esc(n.t || '(图片)')}</div>
        ${n.kids && n.kids.length ? `<div class="tkids">${buildTree(n.kids, depth + 1)}</div>` : ''}
      </div>`).join('');
    $('#tree').innerHTML = buildTree(MINDMAP.tree || [], 0);
    // 节点点击：用 data-idx 定位更稳，这里用 t 匹配（重名极少）
    host.querySelectorAll('.tnode').forEach(el => el.onclick = () => {
      const t = decodeURIComponent(el.dataset.k);
      const found = findNode(MINDMAP.tree || [], t);
      if (found) render(found);
    });
  };
  const findNode = (nodes, t) => {
    for (const n of nodes) { if ((n.t || '') === t) return n; if (n.kids) { const f = findNode(n.kids, t); if (f) return f; } }
    return null;
  };
  render(null);
};

/* ============================ 12. 统计 ============================ */
/* ==== 成就墙（成就系统见 achv.js） ==== */
VIEWS.achv = (host) => {
  host.innerHTML = `<h1>成就</h1>` + (window.Achv
    ? `<div class="row wrap" style="gap:10px;margin:4px 0 2px">
         <button class="btn xs" id="achv-recheck">↻ 重新判定</button>
         <button class="btn xs" id="achv-reset">清空成就</button>
         <span class="dim" style="font-size:12px">成就会「掉下来就消失」—— 解锁那一刻在屏幕顶上掉一张出来，看完就没了，这里留个底。</span>
       </div>` + Achv.wallHTML(DB, window.XCFENBI)
    : `<div class="empty"><span class="big">🏆</span>成就模块没加载到</div>`);
  const rc = $('#achv-recheck');
  if (rc) rc.onclick = () => {
    const fresh = window.Achv ? Achv.check(DB, window.XCFENBI) : [];
    toast(fresh.length ? ('重新判定：新解锁 ' + fresh.length + ' 个成就') : '重新判定：没有新成就');
    VIEWS.achv(host);
  };
  const rs = $('#achv-reset');
  if (rs) rs.onclick = () => {
    if (!window.Achv) return;
    Achv.reset();
    toast('成就已清空');
    VIEWS.achv(host);
  };
};

VIEWS.stats = (host) => {
  const logs = DB.log;
  const rightAll = logs.reduce((a, s) => a + s.right, 0), totAll = logs.reduce((a, s) => a + s.total, 0);
  const days = Object.keys(DB.days).sort();
  const last14 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return dayKey(d.getTime()); });
  const maxV = Math.max(...last14.map(d => { const x = DB.days[d] || {}; return (x.quiz || 0) + (x.cards || 0); }), 1);
  let streak = 0;
  for (let i = 0; i < 400; i++) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayKey(d.getTime()); const x = DB.days[k]; if (x && (x.quiz || x.cards)) streak++; else if (i > 0) break; }
  let seen = 0, marked = 0, due = 0;
  NOTES.forEach(m => m.cards.forEach(c => { if (DB.seen[c.id]) seen++; if (DB.marks[c.id]) marked++; }));
  NOTES.forEach(m => { due += countDue(DB, m.cards.map(c => c.id)); });
  const byMod = {};
  logs.forEach(s => { const k = s.m; byMod[k] = byMod[k] || { total: 0, right: 0, n: 0 }; byMod[k].total += s.total; byMod[k].right += s.right; byMod[k].n++; });
  host.innerHTML = `
  <h1>学习统计</h1>
  ${window.Achv ? (() => {
    const st = Achv.load(), got = Object.keys(st.got || {}).length, all = Achv.LIST.length;
    return `<div class="card" style="margin-top:14px;padding:16px 18px">
      <div class="row between">
        <div class="row" style="gap:11px">
          <div style="font-size:26px">🏆</div>
          <div>
            <div style="font-weight:750">成就 ${got} / ${all}</div>
            <div class="dim" style="font-size:12px">解锁时成就会从顶上掉下来，看完就消失 —— 这里留个底</div>
          </div>
        </div>
        <button class="btn sm" data-go="achv">看成就墙 →</button>
      </div>
    </div>`;
  })() : ''}
  <div class="grid g4" style="margin-top:16px">
    <div class="stat"><div class="v">${seen}</div><div class="l">已看知识卡 / ${META.totalNotes}</div></div>
    <div class="stat"><div class="v">${marked}</div><div class="l">已记住</div></div>
    <div class="stat"><div class="v">${due}</div><div class="l">待复习</div></div>
    <div class="stat"><div class="v">${streak}</div><div class="l">连续打卡（天）</div></div>
    <div class="stat"><div class="v">${totAll}</div><div class="l">累计答题</div></div>
    <div class="stat"><div class="v">${totAll ? pct(rightAll, totAll) + '%' : '—'}</div><div class="l">总正确率</div></div>
    <div class="stat"><div class="v">${logs.length}</div><div class="l">练习次数</div></div>
    <div class="stat"><div class="v">${Object.keys(DB.wrong).length ? DB.wrong.length : 0}</div><div class="l">错题本</div></div>
  </div>
  <div class="card" style="margin-top:18px">
    <h2>近 14 天（做题 + 看卡）</h2>
    <div class="spark">${last14.map(d => { const x = DB.days[d] || {}; const v = (x.quiz || 0) + (x.cards || 0); return `<i class="${v ? '' : 'zero'}" style="height:${clamp(v / maxV * 88, 4, 88)}px" title="${d}：做题 ${x.quiz || 0} / 看卡 ${x.cards || 0}"></i>`; }).join('')}</div>
    <div class="row between dim" style="font-size:12px;margin-top:6px"><span>${last14[0]}</span><span>${last14[13]}</span></div>
  </div>
  <div class="grid g2" style="margin-top:18px">
    <div class="card">
      <h2>知识卡模块进度</h2>
      ${NOTES.map(m => { const ids = m.cards.map(c => c.id), s = ids.filter(id => DB.seen[id]).length; return `<div style="margin-bottom:12px">
        <div class="row between" style="font-size:13px"><span>${m.icon} ${esc(m.m)}</span><span class="dim">${s}/${ids.length} · ${pct(s, ids.length)}%</span></div>
        <div class="bar" style="margin-top:6px"><i style="width:${pct(s, ids.length)}%"></i></div></div>`; }).join('')}
    </div>
    <div class="card">
      <h2>刷题正确率（按模块）</h2>
      ${Object.keys(byMod).length ? Object.entries(byMod).map(([m, v]) => `<div style="margin-bottom:12px">
        <div class="row between" style="font-size:13px"><span>${esc(m)}</span><span class="dim">${v.right}/${v.total} · ${pct(v.right, v.total)}%</span></div>
        <div class="bar ${pct(v.right, v.total) >= 70 ? 'ok' : 'warn'}" style="margin-top:6px"><i style="width:${pct(v.right, v.total)}%"></i></div></div>`).join('') : '<div class="dim" style="font-size:13px">还没有刷题记录</div>'}
    </div>
  </div>
  <div class="card" style="margin-top:18px">
    <h2>最近练习</h2>
    ${logs.length ? `<div class="list">${logs.slice(-12).reverse().map(s => `<div class="li" style="cursor:default">
      <div class="t">${esc(s.m)}${s.t ? ' · ' + esc(s.t) : ''}</div>
      <div class="m"><span class="tag">${s.d}</span><span class="tag">${s.total} 题</span><span class="tag">正确率 ${pct(s.right, s.total)}%</span></div></div>`).join('')}</div>` : '<div class="dim" style="font-size:13px">还没有练习记录</div>'}
  </div>`;
};

/* ============================ 13. 搜索 ============================ */
VIEWS.search = (host, r) => {
  const kw = (r.query.get('q') || '').trim();
  /* ★用户 m08574 第 6 条：加类型过滤（kind = '' | 'note' | 'q' | 'sz'） */
  const kind = ['note', 'q', 'sz'].indexOf(r.query.get('kind') || '') >= 0 ? r.query.get('kind') : '';
  if (!kw) { host.innerHTML = '<div class="card"><div class="empty"><span class="big">🔍</span>在右上角输入关键词搜索：知识卡、题目、成语、时政</div></div>'; return; }
  const low = kw.toLowerCase();
  const hit = (s) => String(s || '').toLowerCase().indexOf(low) >= 0;
  const notes = [];
  NOTES.forEach(m => m.cards.forEach(c => { if (hit(c.t) || hit(c.b) || hit(c.d) || hit(c.sec) || (c.q && hit(c.q.q))) notes.push({ m, c }); }));
  const SIDX = window.XCBANK_SEARCH;
  const qAll = SIDX ? SIDX.filter(row => hit(row[3]) || hit(row[4]) || hit(row[2])) : [];
  const qs = qAll.slice(0, 120);
  if (!SIDX) ensureBankSearch().then(ok => { if (ok && SIDX && /^#\/search/.test(location.hash)) render(); });
  const szAll = SHIZHENG.filter(c => hit(c.t) || hit(c.b) || hit(c.d));
  const sz = szAll.slice(0, 100);
  const showN = !kind || kind === 'note', showQ = !kind || kind === 'q', showS = !kind || kind === 'sz';
  const qTxt = SIDX ? qAll.length + (qAll.length > 120 ? '（显示前 120）' : '') : '（题库索引载入中…）';
  const total = (showN ? notes.length : 0) + (showQ ? qs.length : 0) + (showS ? sz.length : 0);
  const link = k => '#/search?q=' + encodeURIComponent(kw) + (k ? '&kind=' + k : '');
  host.innerHTML = `
  <h1>搜索「${esc(kw)}」</h1>
  <div class="mut" style="font-size:13.5px;margin-top:4px">知识卡 ${notes.length} · 题目 ${qTxt} · 时政 ${szAll.length}</div>
  <div class="row wrap" style="margin:14px 0;gap:8px">
    <button class="chip ${!kind ? 'on' : ''}" data-kind="">全部</button>
    <button class="chip ${kind === 'note' ? 'on' : ''}" data-kind="note">📇 知识卡 ${notes.length}</button>
    <button class="chip ${kind === 'q' ? 'on' : ''}" data-kind="q">✏️ 题目 ${SIDX ? qAll.length : '…'}</button>
    <button class="chip ${kind === 'sz' ? 'on' : ''}" data-kind="sz">🗞️ 时政 ${szAll.length}</button>
  </div>
  ${showN && notes.length ? `<h2 style="margin:22px 0 10px">知识卡（${notes.length}）</h2><div class="list">${notes.slice(0, 60).map(x => `
    <div class="li" data-note="${x.c.id}"><div class="t">${esc(x.c.t)}</div>
    <div class="m"><span class="tag">${esc(x.m.m)}</span><span class="tag">${esc(x.c.sec || '')}</span></div>
    <div class="dim" style="font-size:12.5px;margin-top:6px">${esc(shorten(x.c.b, 130))}</div></div>`).join('')}</div>` : ''}
  ${showQ && qs.length ? `<h2 style="margin:22px 0 10px">题目（${qAll.length}）</h2><div class="list">${qs.map(row => `
    <div class="li" data-q="${row[0]}"><div class="t">${esc(row[3])}</div>
    <div class="m"><span class="tag">${esc((BIDX.mid[row[1]] || {}).name || row[1])}${row[2] ? ' · ' + esc(row[2]) : ''}</span>${row[5] ? `<span class="tag">答案 ${esc(row[5])}</span>` : ''}</div></div>`).join('')}</div>` : ''}
  ${showS && sz.length ? `<h2 style="margin:22px 0 10px">时政月报（${szAll.length}）</h2><div class="list">${sz.map(c => `
    <div class="li" data-sz="${esc(c.sec)}" data-szid="${esc(c.id)}"><div class="t">${esc(c.t)}</div>
    <div class="m"><span class="tag">${esc(c.sec)}</span></div></div>`).join('')}</div>` : ''}
  ${total ? '' : '<div class="card" style="margin-top:18px"><div class="empty"><span class="big">🫥</span>没找到相关内容，换个关键词试试</div></div>'}`;
  host.querySelectorAll('[data-kind]').forEach(el => el.onclick = () => navigate(link(el.dataset.kind)));
  host.querySelectorAll('[data-note]').forEach(el => el.onclick = () => {
    const id = el.dataset.note, nm = NOTE_MAP[id];
    if (nm) navigate('#/notes/' + nm.mod.id + '?card=' + encodeURIComponent(id));
  });
  host.querySelectorAll('[data-q]').forEach(el => el.onclick = () => showQuestion(el.dataset.q));
  host.querySelectorAll('[data-sz]').forEach(el => el.onclick = () => navigate('#/shizheng/' + encodeURIComponent(el.dataset.sz) + (el.dataset.szid ? '?card=' + encodeURIComponent(el.dataset.szid) : '')));
};

/* ============================ 14. 问AI 教练 ============================
   已按需求移除（用户：ai教练形同虚设不要了）。路由已无入口，
   旧的 #/ask 深链会按 render() 里的 VIEWS[r.name] || VIEWS.fenbi 落回粉笔页。
   ================================================================ */
/* ==================== 14c. 🤖 AI 讲师（整页嵌 DeepTutor 网页版） ====================
   用户 m14437：「你帮我完善一下网页版的DeepTutor，我用网页版的学」。
   实现放在 app/deep-web.js（window.DeepWeb）—— 这里只做委托，因为 VIEWS 在 IIFE 里，
   而那一页要 iframe 跨源地嵌 127.0.0.1:3782，逻辑单独一份更好改。
   ★不能写成 `(host, r) => window.DeepWeb.render(host, r)`：那样 this 丢了也无所谓，
     但万一 deep-web.js 没加载（老版本缓存），得给一句人话而不是白屏。 */
VIEWS.ai = (host, r) => {
  if (window.DeepWeb && window.DeepWeb.render) return window.DeepWeb.render(host, r);
  host.innerHTML = `<div class="card"><h2>🤖 AI 讲师</h2>
    <p class="mut">这一页需要 app/deep-web.js。刷新一下（Ctrl+R）就好；还是不行的话说明文件没打进包。</p></div>`;
};
/* ============================ 15. 设置 ============================ */
VIEWS.settings = (host) => {
  const sizeKB = Math.round(JSON.stringify(DB).length / 1024);
  host.innerHTML = `
  <h1>设置</h1>
  ${window.Skin ? window.Skin.panelHTML() : ''}
  ${window.Deep && window.Deep.panelHTML ? window.Deep.panelHTML() : ''}
  <div class="card" style="margin-top:16px">
    <h2>外观</h2>
    <div class="row" style="gap:10px">
      <button class="chip ${DB.settings.theme !== 'dark' ? 'on' : ''}" data-theme="light">☀️ 明亮</button>
      <button class="chip ${DB.settings.theme === 'dark' ? 'on' : ''}" data-theme="dark">🌙 暗色</button>
    </div>
    <div class="hr"></div>
    <h2>动效</h2>
    <div class="mut" style="font-size:13px;line-height:1.9">
      背景呼吸光 · 视图切换淡入 · 卡片悬浮抬起 · 数字滚动 · 按钮回弹
    </div>
    <div class="row" style="gap:10px;margin-top:10px">
      <button class="chip ${window.Motion && window.Motion.isEnabled() ? 'on' : ''}" data-motion="1">✨ 开</button>
      <button class="chip ${window.Motion && !window.Motion.isEnabled() ? 'on' : ''}" data-motion="0">🚫 关</button>
    </div>
    <div class="hr"></div>
    <h2>数据</h2>
    <div class="mut" style="font-size:13px;line-height:1.9">
      进度存本地（浏览器存储），约 ${sizeKB} KB<br>
      知识卡已看 ${Object.keys(DB.seen).length} · 已记住 ${Object.keys(DB.marks).length} · 错题 ${DB.wrong.length} · 收藏 ${DB.favs.length} · 练习 ${DB.log.length} 次
    </div>
    <div class="row wrap" style="gap:10px;margin-top:14px">
      <button class="btn pri" id="export">⬇️ 导出备份</button>
      <button class="btn" id="import">⬆️ 导入备份</button>
      <button class="btn" id="reset">🧹 清空全部进度</button>
      <input type="file" id="file" accept=".json" style="display:none">
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <h2>🧠 AI 讲师的记忆</h2>
    <div class="mut" style="font-size:13px;line-height:1.9">
      把「我是谁、我哪里弱」写进 AI 讲师的长期记忆（错题错因 / 薄弱模块 / 知识卡进度 / 近期状态）。<br>
      写一次以后，网页版里每次开聊它都自带这些 —— 不用再交代一遍。每次同步整页覆盖，是当下的学情，不是流水账。
    </div>
    <div class="row wrap" style="gap:10px;margin-top:12px;align-items:center">
      <button class="btn" id="mem-push">🧠 现在同步一次学情</button>
      <button class="btn sm" id="mem-view">看看写了什么</button>
      <span class="dim" style="font-size:12px" id="mem-when">${DB.memAt ? '上次同步：' + new Date(DB.memAt).toLocaleString('zh-CN') + '（' + Math.max(1, Math.round((DB.memBytes || 0) / 1024)) + ' KB）' : '还没同步过 —— 开机 12 小时会自动同步一次'}</span>
    </div>
    <div class="mut" id="mem-preview" style="display:none;font-size:12.5px;line-height:1.85;margin-top:12px;white-space:pre-wrap"></div>
  </div>
  <div class="card" style="margin-top:16px">
    <h2>📊 周报 · 趋势与下周计划</h2>
    <div class="mut" style="font-size:13px;line-height:1.9">
      每周落一份快照，算「本周 vs 上周」和「下周该干什么」—— <b>纯本地算术，0 token</b>。<br>
      周报会跟着学情一起写进 AI 讲师的记忆，开聊它就知道该盯什么。
    </div>
    <div class="mut" id="week-table" style="font-size:12.5px;line-height:1.9;margin-top:10px"></div>
    <div class="row wrap" style="gap:10px;margin-top:12px;align-items:center">
      <button class="btn" id="week-gen">📊 生成本周周报</button>
      <button class="btn sm" id="week-plan">看看下周计划</button>
      <button class="btn sm ${DB.weekAuto === false ? '' : 'pri'}" id="week-auto">${DB.weekAuto === false ? '⏸ 每周一自动：关' : '✅ 每周一自动：开'}</button>
      <span class="mut" style="font-size:12px">${DB.weekAt ? '上次自动落周报：' + new Date(Number(DB.weekAt)).toLocaleString('zh-CN') : '还没自动落过'}</span>
    </div>
    <div class="mut" id="week-preview" style="display:none;font-size:12.5px;line-height:1.85;margin-top:12px;white-space:pre-wrap"></div>
  </div>
  <div class="card">
    <h2>内容</h2>
    <div class="mut" style="font-size:13px;line-height:2">
      知识卡 ${META.totalNotes} 张（9 模块）· 题库 ${BIDX.total} 题（${BANK_MODS.length} 模块）· 时政 ${META.shizhengTotal} 张 · 思维导图 ${MINDMAP.name || ''}<br>
      数据版本：${META.buildAt}
    </div>
  </div>
  <div class="card">
    <h2>快捷键</h2>
    <div class="mut" style="font-size:13px;line-height:2.1">
      <span class="kbd">←</span> <span class="kbd">→</span> 上一张 / 下一张 &nbsp;·&nbsp; <span class="kbd">空格</span> 翻面 / 看配题 &nbsp;·&nbsp; <span class="kbd">1</span>~<span class="kbd">4</span> 选答案<br>
      <span class="kbd">Enter</span> 交卷 &nbsp;·&nbsp; <span class="kbd">/</span> 聚焦搜索框 &nbsp;·&nbsp; <span class="kbd">Esc</span> 返回 &nbsp;·&nbsp; 🤖 不懂就问（题目加进待问列表 → 生成文本发我）<br>
      <span class="kbd">D</span> 在题目上圈画标记 &nbsp;·&nbsp; <span class="kbd">G</span> 独立草稿纸 &nbsp;·&nbsp; <span class="kbd">Ctrl</span>+<span class="kbd">Z</span> 撤销一笔（按钮就在题目卡片右上角）
    </div>
  </div>`;
  /* 外观自定义面板（配色/字号/模块开关/排序/背景）—— 改完就地重画这一屏，并刷新导航条 */
  if (window.Skin) window.Skin.bindPanel(host, () => { VIEWS.settings(host); refreshBadges(); });
  if (window.Deep && window.Deep.bindPanel) window.Deep.bindPanel(host, () => { VIEWS.settings(host); refreshBadges(); });
  host.querySelectorAll('[data-theme]').forEach(el => el.onclick = () => { DB.settings.theme = el.dataset.theme; applyTheme(); save(); navigate('#/settings'); });
  host.querySelectorAll('[data-motion]').forEach(el => el.onclick = () => {
    if (window.Motion) window.Motion.setEnabled(el.dataset.motion === '1');
    navigate('#/settings');
    toast(el.dataset.motion === '1' ? '动效已开启' : '动效已关闭');
  });
  /* 学情记忆：手动同步 + 就地预览（预览不联网 —— 探针也靠它验正文） */
  /* 📊 周报：生成 / 看下周计划 / 周趋势小表 */
  {
    weekRoll();
    const wt = $('#week-table');
    if (wt) {
      const hist = (DB.weeks || []).slice(-6);
      wt.innerHTML = hist.length
        ? '<b>周趋势</b><br>' + hist.map(w => w.label.split(' ~ ')[0] + '　' + w.total + ' 题 · ' + w.pct + '%'
          + (w.timed && w.timed.n ? ' · 限时 ' + w.timed.n + ' 场' + (w.timed.over ? '（超 ' + w.timed.over + '）' : '') : '')
          + (w.reviews ? ' · 复盘 ' + w.reviews : '')).join('<br>')
        : '还没落过周报快照 —— 点下面「生成本周周报」。';
    }
    const wp = $('#week-preview');
    const wgen = $('#week-gen');
    if (wgen && wp) wgen.onclick = () => {
      const on = wp.style.display !== 'none';
      if (on) { wp.style.display = 'none'; wp.textContent = ''; wgen.textContent = '📊 生成本周周报'; return; }
      wp.style.display = 'block'; wgen.textContent = '收起';
      wp.textContent = weeklyText() || '（还没有数据）';
    };
    const wpl = $('#week-plan');
    if (wpl && wp) wpl.onclick = () => {
      const st = weeklyStats(0);
      const prev = (DB.weeks || []).filter(w => Number(w.wk) < st.wk).slice(-1)[0] || null;
      const plan = weeklyPlan(st, prev);
      wp.style.display = 'block';
      wp.textContent = plan.length ? '下周计划（' + st.label + '）\n\n' + plan.map((x, i) => (i + 1) + '. ' + x).join('\n') : '这周账上没什么可挑的，保持节奏就行。';
      if (wgen) wgen.textContent = '📊 生成本周周报';
    };
    const wau = $('#week-auto');
    if (wau) wau.onclick = () => {
      DB.weekAuto = !(DB.weekAuto !== false);
      saveNow();
      wau.textContent = DB.weekAuto === false ? '⏸ 每周一自动：关' : '✅ 每周一自动：开';
      wau.className = 'btn sm' + (DB.weekAuto === false ? '' : ' pri');
      try { toast(DB.weekAuto === false ? '已关掉每周一自动落周报' : '每周一会自动落周报并写进记忆'); } catch (e) { }
    };
  }
  const mp = $('#mem-push');
  if (mp) mp.onclick = async () => {
    mp.disabled = true; mp.textContent = '⏳ 正在写…';
    const r = await pushStudyMemory({});
    mp.disabled = false; mp.textContent = '🧠 现在同步一次学情';
    if (r && r.ok) { const w = $('#mem-when'); if (w) w.textContent = '上次同步：' + new Date(DB.memAt).toLocaleString('zh-CN') + '（' + Math.max(1, Math.round((r.bytes || 0) / 1024)) + ' KB · ' + (r.entries || 0) + ' 条）'; }
  };
  const mv = $('#mem-view');
  if (mv) mv.onclick = () => {
    const p = $('#mem-preview'); if (!p) return;
    const on = p.style.display !== 'none';
    if (on) { p.textContent = ''; p.style.display = 'none'; mv.textContent = '看看写了什么'; return; }
    p.style.display = 'block';
    mv.textContent = '收起';
    /* ★优先显示「DeepTutor 那边真存着的」—— 借来的后端实例数据目录不在 app 自己的
       home 下，本地文件可能根本不在，只给本地正文会让人以为没同步上。 */
    p.textContent = '正在读 AI 讲师那边的记录…';
    fetch('/deep/memory', { cache: 'no-store' }).then(r => r.json()).then(j => {
      const c = String((j && j.content) || '');
      p.textContent = c || (studyProfileText() || '（还没有数据）')
        + (j && j.backendUp === false ? '\n\n（DeepTutor 后端没起来，上面是「下次会写进去」的正文）' : '');
    }).catch(() => { p.textContent = studyProfileText() || '（还没有数据）'; });
  };
  $('#export').onclick = () => {
    const blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '超频-备份-' + dayKey() + '.json';
    a.click();
    toast('已导出备份');
  };
  $('#import').onclick = () => $('#file').click();
  $('#file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        if (!d || typeof d !== 'object') throw new Error('格式不对');
        DB = Object.assign(blank(), d); applyTheme(); save(); toast('导入成功'); navigate('#/settings');
      } catch (err) { toast('导入失败：' + err.message); }
    };
    fr.readAsText(f);
  };
  $('#reset').onclick = () => {
    if (!confirm('清空全部学习进度？（卡片已看、复习计划、错题、收藏、练习记录都会没）')) return;
    DB = blank(); applyTheme(); save(); toast('已清空'); navigate('#/home');
  };
};

/* ============================ 15. 全局键盘 & 启动 ============================ */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); return; }
  if (e.key === 'Escape') { history.back(); return; }
  if (window.__deckKeys) window.__deckKeys(e);
  if (window.__examKeys) window.__examKeys(e);
});
$('#q').addEventListener('keydown', e => {
  if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { e.target.blur(); navigate('#/search?q=' + encodeURIComponent(v)); } }
});
$('#btn-theme').onclick = () => { DB.settings.theme = DB.settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); save(); };
/* ★原先这里还有一个 `document.addEventListener('click', e => { const p = e.target.closest('[data-go]');
   … navigate('#/' + p.dataset.go); })` —— 跟 536 行那个是**同一个绑定的复制品**。
   一次点击会走两遍 navigate()，hash 没变时 navigate() 里的 `render()` 就被多调一次，
   表现为「点一下导航闪一下 / 多渲染一次」。删掉重复的那个。 */

/* ============================ 14b. 图片放大镜（资料分析材料 / 原卷题干） ============================ */
function zoomBox() {
  let el = document.getElementById('zoombox');
  if (el) return el;
  el = document.createElement('div'); el.id = 'zoombox'; el.className = 'zoombox';
  el.innerHTML = '<img id="zimg" alt="放大查看"><div class="ztip">滚轮缩放 · 拖动平移 · 双击复位 · Esc/点空白 关闭</div>';
  document.body.appendChild(el);
  const img = el.querySelector('img');
  let z = 1, x = 0, y = 0, drag = null;
  const apply = () => { img.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${z})`; };
  apply();
  el.addEventListener('wheel', e => { e.preventDefault(); z = clamp(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.4, 8); apply(); }, { passive: false });
  el.addEventListener('pointerdown', e => { if (e.target !== img) return; drag = { x: e.clientX - x, y: e.clientY - y }; try { img.setPointerCapture(e.pointerId); } catch (err) { } });
  el.addEventListener('pointermove', e => { if (!drag) return; x = e.clientX - drag.x; y = e.clientY - drag.y; apply(); });
  el.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('dblclick', () => { z = 1; x = 0; y = 0; apply(); });
  el.addEventListener('click', e => { if (e.target === el || e.target.className === 'ztip') closeZoom(); });
  el._reset = () => { z = 1; x = 0; y = 0; apply(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el.classList.contains('on')) { closeZoom(); e.stopPropagation(); e.preventDefault(); }
  }, true);
  return el;
}
function openZoom(src) {
  const el = zoomBox();
  if (el.querySelector('img').getAttribute('src') !== src) { el.querySelector('img').src = src; el._reset(); }
  el.classList.add('on');
}
function closeZoom() { const el = document.getElementById('zoombox'); if (el) el.classList.remove('on'); }
document.addEventListener('click', e => {
  const img = e.target.closest && e.target.closest('img[data-zoom]');
  if (img) { e.preventDefault(); e.stopPropagation(); openZoom(img.getAttribute('src')); }
}, true);

load();
/* 粉笔数据接入必须排在 load() 之后：load() 会整体替换 DB */
fenbiMerge();
const FENBI_ADDED = fenbiImport();
if (FENBI_ADDED && (FENBI_ADDED.wrong || FENBI_ADDED.favs)) save();
if (!location.hash) location.hash = '#/home';
render();
setTimeout(() => { try { injectAIQuiz(); } catch (e) { } }, 0);   /* ★AI 补洞题要先并进 BANK_MAP，错题本/收藏/搜索才认得它们 */
setTimeout(() => { try { ensureBankSearch(); } catch (e) {} }, 1500);   // 后台预载题库搜索索引
console.log('%c超频 OVERCLOCK已就绪', 'color:#c9a24b;font-weight:700', { 笔记卡: META.totalNotes, 题库: BIDX.total, 时政: META.shizhengTotal });
})();

