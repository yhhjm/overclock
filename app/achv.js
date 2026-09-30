/* achv.js —— 成就系统
   ============================================================
   规矩（用户 m06260）：
     · 做了多少题、正确率保持在某个数值以上 → 掉成就
     · 成就「掉下来就消失」—— 掉落动画，不常驻
     · 单次 20 题以上、专题百分百正确率 → 超级成就
     · 其余成就我帮着想
   纯计算 + 出 DOM，不碰 DB 内部结构，数据由 app.js 递进来。
   ============================================================ */
(function () {
  'use strict';
  const KEY = 'xcterm_achv';   // { got: {id: ts}, dropShown: {id: true} }
  const MODS = ['政治理论', '常识判断', '言语理解与表达', '数量关系', '判断推理', '资料分析'];

  function load() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      return (j && typeof j === 'object') ? { got: j.got || {}, dropShown: j.dropShown || {} } : { got: {}, dropShown: {} };
    } catch (e) { return { got: {}, dropShown: {} }; }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }

  /* ---------------- 统计口径 ---------------- */
  function dayNum(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }
  function streak(logs) {
    const days = [...new Set(logs.map(l => l.d).filter(Boolean))].map(dayNum).filter(n => !isNaN(n)).sort((a, b) => a - b);
    if (!days.length) return 0;
    /* 从最新那天往回数连续 */
    const DAY = 86400000;
    let best = 1, cur = 1;
    for (let i = days.length - 1; i > 0; i--) {
      const gap = Math.round((days[i] - days[i - 1]) / DAY);
      if (gap === 1) { cur++; best = Math.max(best, cur); }
      else if (gap === 0) { /* 同一天 */ }
      else cur = 1;
    }
    /* 还要看今天/昨天在不在，否则「昨天练完，今天还没练」也该算连着 */
    const today = Date.now(), last = days[days.length - 1];
    const edge = Math.round((today - last) / DAY);
    if (edge > 1) return best;
    return Math.max(best, cur);
  }
  function runOver(logs, minTotal, minAcc, need) {
    /* 最近连续 need 次都满足「题数 ≥ minTotal 且 正确率 ≥ minAcc」 */
    const L = logs.slice(-need);
    if (L.length < need) return false;
    return L.every(l => (l.total || 0) >= minTotal && (l.total ? l.right / l.total * 100 : 0) >= minAcc);
  }
  function statsOf(DB, snap) {
    const logs = (DB && DB.log) || [];
    const total = logs.reduce((a, b) => a + (b.total || 0), 0);
    const right = logs.reduce((a, b) => a + (b.right || 0), 0);
    const bestSet = logs.reduce((a, b) => Math.max(a, (b.total || 0) ? b.right / b.total : 0), 0);
    const biggest = logs.reduce((a, b) => Math.max(a, b.total || 0), 0);
    const fastest20 = logs.filter(l => (l.total || 0) >= 20 && l.at && l.startedAt ? (l.at - l.startedAt) <= 5 * 60000 : false).length;
    const night = logs.filter(l => {
      const t = new Date(l.at || 0); const h = t.getHours();
      return h >= 0 && h < 5;
    }).length;
    /* 六大模块各自的累计题数 */
    const perMod = {};
    logs.forEach(l => { const k = l.m || '其他'; perMod[k] = (perMod[k] || 0) + (l.total || 0); });
    const allSix = MODS.every(m => (perMod[m] || 0) >= 50);
    /* 错题本 */
    const wrongNow = ((DB && DB.wrong) || []).length;
    const favs = ((DB && DB.favs) || []).length;
    /* 粉笔快照 */
    const rep = (snap && snap.report) || {};
    return {
      logs, total, right, acc: total ? right / total * 100 : 0,
      sets: logs.length, bestSet, biggest, fastest20, night,
      streak: streak(logs), perMod, allSix, wrongNow, favs,
      forecast: typeof rep.forecastScore === 'number' ? rep.forecastScore : 0,
      better: (rep.scoreRankIndex && rep.totalUserCount) ? (1 - rep.scoreRankIndex / rep.totalUserCount) * 100 : 0
    };
  }

  /* ---------------- 成就清单 ----------------
     tier: 普通 / 稀有 / 传说 / 超级
     每条 test(s) 收上面的 stats */
  const T = { b: '普通', s: '稀有', g: '传说', x: '⭐ 超级成就' };
  const LIST = [
    /* —— 题量 —— */
    { id: 'q100', icon: '🌱', tier: T.b, name: '初出茅庐', desc: '累计做满 100 题', test: s => s.total >= 100 },
    { id: 'q500', icon: '📗', tier: T.b, name: '小有积累', desc: '累计做满 500 题', test: s => s.total >= 500 },
    { id: 'q1k', icon: '⚔️', tier: T.s, name: '千题斩', desc: '累计做满 1000 题', test: s => s.total >= 1000 },
    { id: 'q3k', icon: '🏔️', tier: T.s, name: '题海无涯', desc: '累计做满 3000 题', test: s => s.total >= 3000 },
    { id: 'q1w', icon: '👑', tier: T.g, name: '万题宗师', desc: '累计做满 10000 题', test: s => s.total >= 10000 },

    /* —— 单次表现（用户点名的那条在这）—— */
    { id: 'single20_100', icon: '💥', tier: T.x, name: '满堂彩', desc: '单次 20 题以上的专题，百分百正确率', test: s => s.logs.some(l => (l.total || 0) >= 20 && l.right === l.total) },
    { id: 'single50', icon: '🌊', tier: T.s, name: '一口气', desc: '单次做过 50 题以上', test: s => s.biggest >= 50 },
    { id: 'speed20', icon: '⚡', tier: T.s, name: '速战速决', desc: '20 题以上，5 分钟内做完', test: s => s.fastest20 > 0 },
    { id: 'night', icon: '🌙', tier: T.b, name: '深夜刷题', desc: '凌晨 0–5 点交过卷', test: s => s.night > 0 },
    { id: 'perfect', icon: '🎯', tier: T.b, name: '百发百中', desc: '单次练习全对（不限题数）', test: s => s.logs.some(l => (l.total || 0) > 0 && l.right === l.total) },

    /* —— 正确率保持 —— */
    { id: 'keep5_80', icon: '📈', tier: T.s, name: '稳定输出', desc: '连续 5 次练习正确率都在 80% 以上', test: s => runOver(s.logs, 10, 80, 5) },
    { id: 'keep10_85', icon: '🐲', tier: T.g, name: '常胜将军', desc: '连续 10 次练习正确率都在 85% 以上', test: s => runOver(s.logs, 10, 85, 10) },
    { id: 'acc90', icon: '🥇', tier: T.s, name: '九成把握', desc: '累计正确率做到 90% 以上（至少 100 题）', test: s => s.total >= 100 && s.acc >= 90 },

    /* —— 坚持 —— */
    { id: 'day3', icon: '🔥', tier: T.b, name: '日拱一卒', desc: '连续 3 天有练习', test: s => s.streak >= 3 },
    { id: 'day7', icon: '🗓️', tier: T.s, name: '坚持不懈', desc: '连续 7 天有练习', test: s => s.streak >= 7 },
    { id: 'day30', icon: '🏆', tier: T.g, name: '铁杵磨针', desc: '连续 30 天有练习', test: s => s.streak >= 30 },

    /* —— 模块 —— */
    { id: 'six50', icon: '🔷', tier: T.g, name: '六边形战士', desc: '六大模块各做满 50 题', test: s => s.allSix },
    { id: 'zero2hundred', icon: '🌱', tier: T.s, name: '从零开始', desc: '一个原来零基础的模块做到 100 题', test: s => Object.values(s.perMod).some(v => v >= 100) },
    { id: 'mod500', icon: '🪨', tier: T.s, name: '专精一门', desc: '单个模块做满 500 题', test: s => Object.values(s.perMod).some(v => v >= 500) },

    /* —— 错题 / 收藏 —— */
    { id: 'wrongClean', icon: '🕊️', tier: T.g, name: '亡羊补牢', desc: '错题本清到 0 道', test: s => s.wrongNow === 0 && s.sets >= 5 },
    { id: 'fav50', icon: '⭐', tier: T.b, name: '好记性不如烂笔头', desc: '收藏满 50 题', test: s => s.favs >= 50 },

    /* —— 粉笔 —— */
    { id: 'forecast70', icon: '🔮', tier: T.s, name: '预测分破 70', desc: '粉笔预测分上 70', test: s => s.forecast >= 70 },
    { id: 'forecast80', icon: '👑', tier: T.g, name: '预测分破 80', desc: '粉笔预测分上 80', test: s => s.forecast >= 80 },
    { id: 'top5', icon: '🚀', tier: T.g, name: '全国前 5%', desc: '成绩超过全国 95% 的考生', test: s => s.better >= 95 }
  ];

  /* ---------------- 判定 + 掉落 ---------------- */
  let busy = false;
  function check(DB, snap) {
    if (busy) return [];
    let s;
    try { s = statsOf(DB, snap); } catch (e) { return []; }
    const st = load();
    const fresh = [];
    LIST.forEach(a => {
      if (st.got[a.id]) return;
      let hit = false;
      try { hit = !!a.test(s); } catch (e) { hit = false; }
      if (hit) { st.got[a.id] = Date.now(); fresh.push(a); }
    });
    if (fresh.length) save(st);
    /* 只掉没掉过的 */
    const shown = fresh.filter(a => !st.dropShown[a.id]);
    if (shown.length) {
      st.dropShown = st.dropShown || {};
      shown.forEach(a => { st.dropShown[a.id] = true; });
      save(st);
      shown.forEach((a, i) => setTimeout(() => drop(a), i * 1100));
    }
    return fresh;
  }

  /* ★成就掉下来就消失：从顶上掉进来，停一下，再掉下去没了 */
  function drop(a) {
    if (document.getElementById('achv-layer') == null) {
      const l = document.createElement('div');
      l.id = 'achv-layer';
      document.body.appendChild(l);
    }
    const layer = document.getElementById('achv-layer');
    const el = document.createElement('div');
    el.className = 'achv-drop' + (a.tier === T.x ? ' super' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="achv-ic">${a.icon}</div>
      <div class="achv-tx">
        <div class="achv-kick">${a.tier === T.x ? '⭐ 超级成就解锁' : '成就解锁'}</div>
        <div class="achv-name">${a.name}</div>
        <div class="achv-desc">${a.desc}</div>
      </div>
      <div class="achv-tier">${a.tier === T.x ? 'SUPER' : a.tier}</div>`;
    layer.appendChild(el);
    /* 动画播完就整只删掉 —— 「掉下来就消失」 */
    el.addEventListener('animationend', () => { try { el.remove(); } catch (e) { } }, { once: true });
    /* 兜底：就算动画没触发也一定消失 */
    setTimeout(() => { try { el.remove(); } catch (e) { } }, 6200);
  }

  /* ---------------- 成就墙 ---------------- */
  function wallHTML(DB, snap) {
    let s;
    try { s = statsOf(DB, snap); } catch (e) { s = null; }
    const st = load();
    const got = LIST.filter(a => st.got[a.id]);
    const miss = LIST.filter(a => !st.got[a.id]);
    const pct = Math.round(got.length / LIST.length * 100);
    return `
  <div class="achv-wall">
    <div class="achv-head">
      <div>
        <div class="achv-kick">ACHIEVEMENTS</div>
        <h2 style="margin:2px 0 0">成就墙</h2>
        <div class="mut" style="font-size:12.5px">解锁 ${got.length} / ${LIST.length} · ${pct}%${s ? ` · 累计 ${s.total} 题 · 正确率 ${s.acc.toFixed(1)}% · 连续 ${s.streak} 天` : ''}</div>
      </div>
      <div class="achv-ring" style="--p:${pct}"><b>${pct}%<i>已解锁</i></b></div>
    </div>
    ${got.length ? `<h3 style="margin:18px 0 8px">已解锁 ${got.length}</h3>
    <div class="achv-grid">${got.map(a => card(a, true, st.got[a.id])).join('')}</div>` : ''}
    <h3 style="margin:18px 0 8px">还没拿到 ${miss.length}</h3>
    <div class="achv-grid">${miss.map(a => card(a, false, 0)).join('')}</div>
  </div>`;
  }
  function card(a, done, ts) {
    return `<div class="achv-card${done ? ' done' : ''}${a.tier === T.x ? ' super' : ''}">
      <div class="achv-ic">${a.icon}</div>
      <div class="achv-tx">
        <div class="achv-name">${a.name} <span class="achv-tier">${a.tier === T.x ? 'SUPER' : a.tier}</span></div>
        <div class="achv-desc">${a.desc}</div>
        ${done && ts ? `<div class="achv-when">${new Date(ts).toLocaleDateString('zh-CN')}</div>` : ''}
      </div>
      ${done ? '<div class="achv-mark">✓</div>' : ''}
    </div>`;
  }

  /* 一键全部重新判定（设置里那个按钮） */
  function reset() { save({ got: {}, dropShown: {} }); }

  window.Achv = { check, drop, wallHTML, stats: statsOf, reset, LIST, load };
})();
