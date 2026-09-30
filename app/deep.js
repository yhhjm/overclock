/* ============================================================
   AI 讲师（超频 ⇄ 开源项目 DeepTutor / HKUDS）
   ------------------------------------------------------------
   我们对 DeepTutor 的用法只有一条：POST /deep/run。server.mjs 在那边
   spawn `deeptutor run <capability> <msg> -f json -l zh`，把它的 NDJSON
   事件流转成 SSE 吐回来。**刻意不碰它的内部 WebSocket** —— 那条是
   extra="forbid" 的强类型契约，上游一升级就会整帧被拒；CLI 才是稳定面。
   没装 / 没配 / 没跑，界面就诚实地说缺什么并给出下一步，绝不报错崩。

   用户 m12960 要的是「和超频整体联通」，所以入口贴在题目本身里
   （题目解析页 + 答题页），带上题干 / 选项 / 正确答案 / 我选的 / 错因 /
   官方解析一起问，而不是让他另开一个网页从零描述题目。
   ============================================================ */
(function () {
  'use strict';

  const CAN = typeof location !== 'undefined' && location.protocol !== 'file:' && !!window.fetch;
  const L = ['A', 'B', 'C', 'D'];
  let st = null, stAt = 0, stP = null;

  let mask = null, body = null, ta = null, sub = null, chips = null, sendBtn = null;
  let ctx = null;        // 当前这道题 / 这张卡的上下文，追问时一直带着
  let turns = [];        // 这次会话的问答对（用于「换个讲法」之类做上下文提示）
  let busy = false;
  /* 抽屉里这轮对话在 DeepTutor 那边的会话号。server.mjs 的 /deep/run 一拿到
     session_id 就先补发一个 {kind:'session'} 事件（早于 end），所以这里能在
     流式过程中就知道「这批话被记在哪个会话里」——「🖥 接着聊」靠它深链到
     http://127.0.0.1:3782/chat/<会话号>，两边看的是同一条会话（同一个 chat_history.db）。 */
  let curSession = '';

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* 极简 markdown：够用就行（粗体 / 行内码 / $$公式$$ / 【小标题】/ 列表 / 段落） */
  function mdLite(s) {
    let t = esc(s);
    t = t.replace(/\$\$([\s\S]+?)\$\$/g, (m, x) => '\n<div class="dp-tex">' + x.trim() + '</div>\n');
    t = t.replace(/\$([^$\n]+?)\$/g, '<code class="dp-tex-i">$1</code>');
    t = t.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>');
    t = t.replace(/^[ \t]*#{1,6}[ \t]*(.+)$/gm, '<b>$1</b>');
    /* 【题型定位】这种段头单独成行、加点下划线的样式，五段结构一眼能扫 */
    t = t.replace(/^([ \t]*)(【[^】\n]{2,12}】)[ \t]*$/gm, '$1<b class="dp-set">$2</b>');
    t = t.replace(/^[ \t]*[·•\-][ \t]+(.+)$/gm, '· $1');
    return t.split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }

  /* ---------------- 后端探测 ---------------- */
  async function status(force) {
    if (!CAN) return { ok: false, installed: false, offline: true, error: '现在不是本地服务模式，AI 讲师用不了' };
    if (!force && st && Date.now() - stAt < 15000) return st;
    if (stP) return stP;
    stP = fetch('/deep/status')
      .then(r => r.json())
      .then(j => { st = j; stAt = Date.now(); return j; })
      .catch(() => { st = { ok: false, installed: false, error: '连不上本地服务' }; stAt = Date.now(); return st; })
      .then(j => { stP = null; return j; });
    return stP;
  }

  /* ---------------- prompt 打包 ----------------
     这是「整体联通」的核心：把超频这边已有的现场信息全塞进去，
     省掉用户重新打字的痛苦。格式对齐 xingce-tutor 那套五段式。 */
  const RULE = '你是我的一对一行测教练（花生十三那一套思路）。请严格按这五段讲：【题型定位】【考点】【选项过堂】【答案】【坑与复盘】。'
    + '直接讲题，不要复述题干，不要客套，不要说"如果你需要我可以继续"。'
    + '【选项过堂】要逐项说清对在哪 / 错在哪；【坑与复盘】必须给这条规律下一次怎么用。';

  function promptOf(c) {
    if (!c) return '';
    /* ★1.9.6：自由提问（超频这边已经把现场信息拼好了，比如错题本的「按错因带我复盘」）。
       不做任何加工，原样发出去 —— 拼 prompt 的知识只有 caller 有。 */
    if (c.text) return String(c.text).trim();
    if (c.card) {
      const k = c.card;
      return [
        '你是我行测知识卡的带背讲师。下面这张卡是我平时背的，请：',
        '①用一句话说清它到底在考什么；②真题里它通常怎么被出题（给个典型题干的样子）；',
        '③最容易和它混的那个考点是什么、一句话怎么分；④给我一个记得住的钩子。别客套。',
        '', '【所属模块】' + (k.mod || ''), '【卡片标题】' + (k.t || ''),
        k.sec ? '【所在小节】' + k.sec : '', '【卡片正文】' + (k.b || ''), k.d ? '【补充】' + k.d : ''
      ].filter(Boolean).join('\n');
    }
    const q = c.q || {};
    const opts = (q.o || []).map((o, i) => L[i] + '. ' + String(o == null ? '' : o)).join('\n');
    return [
      RULE, '',
      '【模块】' + (q.m || '') + (q.t ? ' · ' + q.t : ''),
      q.p ? '【来源】' + q.p : '',
      q.kd ? '【考点标签】' + q.kd : '',
      q.mat ? '【材料】' + q.mat : '',
      '【题干】' + (q.q || ''),
      opts ? '【选项】\n' + opts : '',
      '【正确答案】' + (q.ms || L[q.a] || '（本地没答案）') + (q.ms ? '（多选）' : ''),
      (c.mine != null && c.mine >= 0) ? '【我选的】' + L[c.mine] : '【我选的】（这题没记到）',
      c.cause ? '【我标记的错因】' + c.cause.n + '（' + c.cause.d + '）' : '',
      q.e ? '【官方解析】' + q.e : ''
    ].filter(x => x !== '').join('\n');
  }

  /* ---------------- DOM ---------------- */
  function build() {
    if (mask) return;
    mask = document.createElement('div');
    mask.className = 'dp-mask';
    mask.innerHTML = `
      <div class="dp-panel" role="dialog" aria-label="AI 讲师">
        <div class="dp-head">
          <div class="dp-title">
            <span class="dp-logo">🤖</span>
            <div>
              <div class="dp-h1">AI 讲师</div>
              <div class="dp-sub" id="dp-sub">正在探测 DeepTutor…</div>
            </div>
          </div>
          <div class="row" style="gap:6px">
            <button class="chip" id="dp-toweb" title="把这轮对话搬到「AI 讲师」整页里接着聊（两边同一条会话）">🖥 接着聊</button>
            <button class="chip" id="dp-web" title="在系统浏览器里打开 DeepTutor 的完整界面">🌐 网页版</button>
            <button class="chip" id="dp-clear" title="清空这次对话">🧹</button>
            <button class="chip" id="dp-close" title="关闭（Esc）">✕</button>
          </div>
        </div>
        <div class="dp-body" id="dp-body"></div>
        <div class="dp-chips" id="dp-chips"></div>
        <div class="dp-foot">
          <textarea id="dp-ta" rows="2" placeholder="追问一句…（Enter 发送 · Shift+Enter 换行）"></textarea>
          <button class="btn pri" id="dp-send">发送</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    body = mask.querySelector('#dp-body');
    ta = mask.querySelector('#dp-ta');
    sub = mask.querySelector('#dp-sub');
    chips = mask.querySelector('#dp-chips');
    sendBtn = mask.querySelector('#dp-send');

    mask.querySelector('#dp-close').onclick = close;
    mask.querySelector('#dp-clear').onclick = () => { turns = []; body.innerHTML = ''; hello(); };
    mask.querySelector('#dp-web').onclick = async () => {
      const s = await status();
      if (s.webUrl) window.open(s.webUrl, '_blank', 'noopener');
    };
    /* 「接着聊」：把这轮对话交给整页的网页版（VIEWS.ai / deep-web.js），
       它会把会话号深链成 /chat/<sid>。没有会话号就诚实说不急。 */
    mask.querySelector('#dp-toweb').onclick = async () => {
      const s = await status();
      if (!curSession) {
        push('ai', '还没有可接过去的会话 —— 等它把这轮讲完（网页版会记在同一个会话里），再点「🖥 接着聊」。');
        return;
      }
      close();
      if (window.DeepWeb && window.DeepWeb.go) window.DeepWeb.go(curSession);
      else window.open(((s && s.webUrl) || 'http://127.0.0.1:3782/') + 'chat/' + encodeURIComponent(curSession), '_blank', 'noopener');
    };
    mask.onclick = e => { if (e.target === mask) close(); };
    sendBtn.onclick = () => { const v = ta.value.trim(); if (v) { ta.value = ''; ask(v); } };
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = ta.value.trim(); if (v) { ta.value = ''; ask(v); } }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && mask.classList.contains('on')) close(); });
  }

  function scrollEnd() { try { body.scrollTop = body.scrollHeight; } catch { } }

  function push(role, text, raw) {
    const d = document.createElement('div');
    d.className = 'dp-msg ' + role;
    if (role === 'user') d.textContent = text;
    else d.innerHTML = raw || mdLite(text);
    body.appendChild(d);
    scrollEnd();
    return d;
  }

  function hello() {
    if (body.childElementCount) return;
    body.innerHTML = `<div class="dp-hello"><span class="big">🤖</span>
      我是接在超频里的 AI 讲师（后端是开源的 <b>DeepTutor</b>）。<br>
      在<b>题目解析页</b>或<b>答题页</b>点「🤖 问 AI 讲师」，我会自动把题干、选项、正确答案、
      你选的、你标的错因、官方解析一起带上——不用你复述题目。<br>
      也可以直接在下面打字问任何行测问题。</div>`;
  }

  function chipsFor() {
    const list = ctx && ctx.card
      ? ['这张卡怎么考', '最容易混的是什么', '给我一个记忆钩子']
      : ctx && ctx.text
        ? ['再具体一点，给例子', '我自己去试试，给我 2 道题', '把要背的压成 3 句话']
      : ctx
        ? ['讲一遍这道题', '我到底错在哪', '换个讲法，通俗点', '同类题再给我 2 道']
        : ['资料分析怎么提速', '判断推理的加强削弱怎么分', '数量关系哪些值得做'];
    chips.innerHTML = list.map((t, i) => `<button class="chip" data-q="${i}">${esc(t)}</button>`).join('');
    chips.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
      const t = list[+b.dataset.q];
      if (!ctx) return ask(t);
      /* 有题目上下文时，把用户的意图接在题目后面一起发，保持一次成型的 prompt */
      ask(promptOf(ctx) + '\n\n【我这次的追问】' + t);
    });
  }

  async function refreshSub() {
    const s = await status();
    if (sub) {
      if (!s.installed) { sub.className = 'dp-sub bad'; sub.textContent = '还没装 DeepTutor —— 在设置页可以看到怎么装'; }
      else if (!s.keySet) { sub.className = 'dp-sub bad'; sub.textContent = 'DeepTutor 还没配模型 key'; }
      else { sub.className = 'dp-sub ok'; sub.textContent = (s.version ? 'DeepTutor ' + s.version + ' · ' : '') + (s.model || '已就绪') + (s.running ? ' · 网页版在跑' : ''); }
    }
    return s;
  }

  /* ---------------- 流式提问 ---------------- */
  async function ask(text) {
    if (busy || !text) return;
    const s = await refreshSub();
    if (!s.installed || !s.keySet) {
      push('ai', s.installed
        ? 'DeepTutor 装好了，但还没配模型 key，所以它答不了。到「设置 → AI 讲师」里填一个就行。'
        : '还没装 DeepTutor。到「设置 → AI 讲师」里有一键安装的说明（它是开源的 Python 项目 HKUDS/DeepTutor）。');
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    push('user', text);
    const ai = push('ai', '', '<span class="dp-dots"></span>');
    let acc = '';
    let noteLine = null;
    try {
      const r = await fetch('/deep/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ capability: 'chat', message: text, lang: 'zh' })
      });
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
      const rd = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = chunk.split('\n').find(x => x.indexOf('data: ') === 0);
          if (!line) continue;
          let o; try { o = JSON.parse(line.slice(6)); } catch { continue; }
          if (o.kind === 'chunk') {
            acc += o.text;
            ai.innerHTML = mdLite(acc) + '<span class="dp-dots"></span>';
            scrollEnd();
          } else if (o.kind === 'note') {
            if (!noteLine) { noteLine = document.createElement('div'); noteLine.className = 'dp-note'; body.insertBefore(noteLine, ai); }
            noteLine.textContent = '🔎 ' + o.text;
            scrollEnd();
          } else if (o.kind === 'final' && o.text) {
            acc = o.text;   // result 里的完整回答是权威版本，用它盖掉拼接结果
          } else if (o.kind === 'session' && o.session) {
            curSession = o.session;   // 会话号一到手就记下，「接着聊」随时能跳
          } else if (o.kind === 'usage' && o.usage) {
            const u = document.createElement('div');
            u.className = 'dp-usage';
            u.textContent = `⏱ ${Math.round(o.usage.duration_seconds * 10) / 10}s · ${o.usage.completion_tokens} tokens · ${Math.round(o.usage.tokens_per_second)} tok/s`;
            body.appendChild(u);
          } else if (o.kind === 'end') {
            if (o.session) curSession = o.session;   // end 里也带（老服务端没有 session 事件时的兜底）
            if (!o.ok) throw new Error(o.error || 'DeepTutor 没跑通');
          }
        }
      }
      ai.innerHTML = mdLite(acc || '（没有内容）');
      turns.push({ q: text, a: acc });
    } catch (e) {
      ai.className = 'dp-msg ai err';
      ai.textContent = '没问成：' + String(e && e.message || e);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      scrollEnd();
    }
  }

  function open(c) {
    if (!CAN) { try { alert('AI 讲师需要本地服务模式（打包版或 node server.mjs）才用得了。'); } catch { } return; }
    build();
    ctx = c || null;
    mask.classList.add('on');
    if (!body.childElementCount) hello();
    if (ctx) { turns = []; body.innerHTML = ''; ask(promptOf(ctx)); }
    chipsFor();
    refreshSub();
    setTimeout(() => { try { ta.focus(); } catch { } }, 60);
  }
  function close() { if (mask) mask.classList.remove('on'); }

  /* ================= 设置页那一组（第 1 期 ③） =================
     为什么放在 deep.js 而不是 app.js：装没装 / 配没配 / 在不在跑 这套探测
     只写一处，app.js 只负责把这块 HTML 摆进设置页、并在改完后就地重画。 */
  const CLI_HINT = 'pip install -U deeptutor';

  function e2(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function panelHTML() {
    return `<div class="card" id="deep-card" style="margin-top:16px">
      <h2>🤖 AI 讲师</h2>
      <div class="mut" id="dp-deep-state" style="font-size:13px;line-height:1.9">正在探测 DeepTutor…</div>
      <div id="dp-deep-more"></div>
    </div>`;
  }

  /* 改完设置要重画这一屏，但重画会把状态行冲掉 —— 所以结果先记在 flash 里，
     下一次 bindPanel 直接拿它当状态行显示（比 setTimeout 抢时序稳）。 */
  let flash = '';

  async function bindPanel(host, redraw) {
    const card = host.querySelector('#deep-card');
    if (!card) return;
    const stEl = card.querySelector('#dp-deep-state');
    let s = { ok: false, installed: false };
    try { s = await status(true) || s; } catch { }
    const more = card.querySelector('#dp-deep-more');
    const say = m => { if (stEl) stEl.innerHTML = m; };
    const repaint = () => { try { (redraw || (() => { }))(); } catch { } };

    const stateBits = s.installed
      ? `DeepTutor <b>${e2(s.version || '已装')}</b> · 模型 <b>${e2(s.model || '（没配）')}</b> · ${s.running ? '网页版在跑' : '网页版没开'}`
      : '还没装（不影响超频别的功能，题目里那颗「问 AI 讲师」会告诉你缺什么）';
    if (flash) { say(flash); flash = ''; } else say(`状态：${stateBits}`);

    if (s.installed) {
      more.innerHTML = `
      <div class="hr"></div>
      <div class="mut" style="font-size:12.5px;line-height:1.9">
        <b>怎么用：</b>题目页 / 答题页 / 错题本 / 知识卡上那颗「🤖 问 AI 讲师」就是它 ——
        它会把题干、选项、正确答案、你选的、错因和官方解析一起打包发过去，直接讲这道题。
        想自己随便聊、让它出题、深挖某个考点，用顶栏的「🤖 AI 讲师」那一页（它自己的完整界面就嵌在超频里，不用另开浏览器）。
      </div>
      <div class="mut" style="font-size:12.5px;line-height:2">
        可执行：<code>${e2(s.cli)}</code><br>
        数据目录：<code>${e2(s.home)}</code><br>
        模型 Key：${s.keySet ? '已配 <code>' + e2(s.keyTip) + '</code>' : '<span class="dp-warn">没配 —— 没 key 它答不了题</span>'}
      </div>
      <div class="row wrap" style="gap:10px;margin-top:14px">
        <button class="btn pri" id="dp-deep-goto" title="打开超频里的「AI 讲师」整页（把它的网页版嵌进来）">🤖 去 AI 讲师页</button>
        <button class="btn" id="dp-deep-polish" title="把网页版的界面/回答语言改成中文，并装上「行测教练」「申论教练」两个人格和对应的讲题技能">🎨 一键公考化</button>
        <button class="btn" id="dp-deep-open" title="在系统浏览器里打开 DeepTutor 的完整界面（题库/知识库/深度研究）">🌐 浏览器打开</button>
        <button class="btn" id="dp-deep-start">▶ 启动网页版</button>
        <button class="btn" id="dp-deep-redo">🔄 重新探测</button>
      </div>
      <div class="hr"></div>
      <h3>模型接入</h3>
      <div class="mut" style="font-size:12.5px;line-height:1.9">
        填 DeepSeek 的 key，或者任何 OpenAI 兼容的本地服务（Ollama / LM Studio / llama.cpp 都行，比如 <code>http://127.0.0.1:11434/v1</code>）。
        key 只写进你自己的 DeepTutor 数据目录，不进发行包、不上传任何地方。
      </div>
      <div class="row wrap" style="gap:8px;margin-top:10px">
        <input class="dp-inp" id="dp-deep-base" placeholder="https://api.deepseek.com" value="${e2(s.baseUrl || '')}">
        <input class="dp-inp sm" id="dp-deep-model" placeholder="deepseek-chat" value="${e2(s.model || '')}">
      </div>
      <div class="row wrap" style="gap:8px;margin-top:8px">
        <input class="dp-inp" id="dp-deep-key" type="password" autocomplete="off" placeholder="sk-…（留空＝只改上面两项）">
        <button class="btn pri" id="dp-deep-save">保存</button>
        <button class="btn" id="dp-deep-clear" title="把数据目录里存的 key 抹掉">🗑 清除 key</button>
      </div>
      <div class="hr"></div>
      <h3>📚 知识库（把超频的资料喂给它）</h3>
      <div class="mut" id="dp-deep-kbstate" style="font-size:12.5px;line-height:1.95">正在读知识库状态…</div>
      <div class="row wrap" style="gap:10px;margin-top:12px">
        <button class="btn pri" id="dp-deep-kbsync" title="把 1853 张知识卡 + 241 条时政渲染成 md 灌进 DeepTutor 的知识库">📚 一键同步行测知识卡</button>
        <button class="btn pri" id="dp-deep-slsync" title="把 30 份申论讲义（袁东 2027：方法实战 / 套题实战 / 大作文专项 / 各题型小讲义，约 2.2MB）灌进 DeepTutor 的申论知识库">📝 同步申论讲义</button>
        <button class="btn" id="dp-deep-kbrefresh">🔄 刷新状态</button>
      </div>
      <div class="mut" id="dp-deep-slstate" style="font-size:12.5px;line-height:1.95;margin-top:7px"></div>
      <div id="dp-deep-kbembed"></div>
      <div id="dp-deep-study"></div>`;

      const openBtn = card.querySelector('#dp-deep-open');
      if (openBtn) openBtn.onclick = () => { try { window.open(s.webUrl, '_blank'); } catch { } };
      /* 顶栏那一页（VIEWS.ai）—— 把它的网页版整个嵌进超频 */
      const gotoBtn = card.querySelector('#dp-deep-goto');
      if (gotoBtn) gotoBtn.onclick = () => { location.hash = '#/ai'; };
      /* 一键行测化：界面/回答语言 → 中文；装上「行测教练」人格 + 讲题技能。
         服务端这一步是直接写它数据目录里的文件（不走它的 API —— 见 server.mjs
         里 deepPolish 的注释：走 API 会写进「内容工作区」作用域，换个工作区就没了）。 */
      const polishBtn = card.querySelector('#dp-deep-polish');
      if (polishBtn) polishBtn.onclick = async () => {
        say('状态：正在把网页版调成公考专用…');
        const r = await fetch('/deep/web/polish', { method: 'POST' }).then(x => x.json()).catch(() => ({ ok: false, error: '连不上本地服务' }));
        if (!r.ok) { say(`状态：<span class="dp-warn">没弄成：${e2(r.error || '')}</span>`); return; }
        const did = (r.steps || []).filter(x => x.ok && !x.skip).map(x => x.name);
        const w = r.web || {};
        say('状态：' + (did.length ? '已' + did.join('、') : '本来就是配好的')
          + ' · 界面' + (w.zh ? '中文' : '<span class="dp-warn">还是英文</span>')
          + (w.persona ? ' · 行测教练人格' : '') + (w.skill ? ' · 行测讲题技能' : '')
          + (w.slPersona ? ' · 申论教练人格' : '') + (w.slSkill ? ' · 申论讲题技能' : '')
          + (r.note ? '（' + e2(r.note) + '）' : ''));
        status(true);
      };
      const startBtn = card.querySelector('#dp-deep-start');
      if (startBtn) startBtn.onclick = async () => {
        /* 后端僵住（8001 端口占着但不响应）时必须强起：不然新进程绑不上端口会自己退出。
           s.stuck 由 /deep/status 给（只读探测，不起进程）。 */
        const stuck = !!(s && s.stuck);
        say(stuck ? '状态：后端僵住了，正在清掉重起…' : '状态：正在启动网页版（第一次要十几秒）…');
        const r = await fetch('/deep/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ force: stuck }) })
          .then(x => x.json()).catch(() => ({ ok: false, error: '连不上本地服务' }));
        say(r.ok ? `状态：网页版${r.already ? '本来就在跑' : '起来了'}${r.killed ? '（清掉了 ' + r.killed + ' 个僵住的进程）' : ''} → <code>${e2(r.webUrl || s.webUrl)}</code>` : `状态：<span class="dp-warn">没起来：${e2(r.error || '')}</span>`);
      };
      const saveBtn = card.querySelector('#dp-deep-save');
      if (saveBtn) saveBtn.onclick = async () => {
        const body = {
          baseUrl: card.querySelector('#dp-deep-base').value.trim(),
          model: card.querySelector('#dp-deep-model').value.trim()
        };
        const key = card.querySelector('#dp-deep-key').value.trim();
        if (key) body.apiKey = key;
        say('状态：保存中…');
        const r = await fetch('/deep/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => ({ ok: false, error: '连不上本地服务' }));
        if (!r.ok) say(`状态：<span class="dp-warn">没存成：${e2(r.error || '')}</span>`);
        else { status(true); say(`状态：已保存 · 模型 <b>${e2(r.model || '')}</b> · Key ${r.keySet ? '已配' : '<span class="dp-warn">还没给</span>'}`); }
      };
      const clrBtn = card.querySelector('#dp-deep-clear');
      if (clrBtn) clrBtn.onclick = async () => {
        if (!window.confirm('把存在本机的 DeepTutor 模型 key 抹掉？（以后再问 AI 讲师会提示「还没配 key」）')) return;
        flash = '状态：key 已清除（再问 AI 讲师会提示还没配 key）';
        await fetch('/deep/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clearKey: true }) }).catch(() => { });
        status(true); repaint();
      };

      /* ---- 知识库（第 ④ 项）：把知识卡 + 时政灌进去，配完 embedding 才搜得动 ---- */
      const kbEl = card.querySelector('#dp-deep-kbstate');
      const slEl = card.querySelector('#dp-deep-slstate');
      const embEl = card.querySelector('#dp-deep-kbembed');
      const kbSay = m => { if (kbEl) kbEl.innerHTML = m; };
      const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }).then(x => x.json()).catch(() => ({ ok: false, error: '连不上本地服务' }));

      function embForm(k) {
        if (!embEl) return;
        const em = (k && k.embed) || {};
        const ol = k.ollama || { up: false, models: [] };
        const pick = (ol.models || []).find(m => /nomic-embed|bge-m3|bge-|mxbai-embed|all-minilm|embed/i.test(m)) || '';
        const emModel = em.model || 'BAAI/bge-small-zh-v1.5';
        /* 状态一句话：没装依赖 / 装了没起 / 起来了在加载 / 好了 */
        const emLine = !em.fastembed
          ? '还没装 —— 点上面那颗按钮，超频会替你装好（≈120MB，清华源）'
          : (em.running ? (em.loaded ? `已开启 · <b style="color:#63c07a">${e2(emModel)}</b>${em.dim ? ' · ' + em.dim + ' 维' : ''} · 离线` : '服务在起，模型加载中…')
            : '依赖装好了，点上面那颗按钮就起来');
        embEl.innerHTML = `
        <div class="hr"></div>
        <div class="mut" style="font-size:12.5px;line-height:1.95">
          知识库<b>索引/检索</b>需要一个 embedding 模型 —— DeepSeek 不提供 embedding。
          最省事的办法是用超频自带的<b>本机小模型</b>：离线、免费、中文，装一次就一直在。
        </div>
        <div class="row wrap" style="gap:10px;margin-top:10px;align-items:center">
          <button class="btn pri" id="dp-deep-embedstart" title="装 fastembed + 下载 ${e2(emModel)}（512 维中文小模型，≈95MB，走 hf-mirror），起一个只在 127.0.0.1:${em.port || 5399} 上的服务，并把它配成 DeepTutor 的 embedding">⚡ 开启本地语义检索（离线 · 免费）</button>
          <span class="mut" id="dp-deep-embedstate" style="font-size:12.5px">状态：${emLine}</span>
        </div>
        <div class="mut" style="font-size:12px;line-height:1.9;margin-top:6px">
          会下到 <code>${e2(em.cache || '<你的数据目录>\\deeptutor\\models')}</code>；开好之后<b>自动配好 + 重跑两个库的索引</b>（1342 个片段，一两分钟）。
        </div>
        <details style="margin-top:10px">
          <summary class="mut" style="cursor:pointer;font-size:12.5px">或者用别的（本机 Ollama / 云端 key）</summary>
          <div class="mut" style="font-size:12.5px;line-height:1.95;margin-top:8px">
            两条路，都不用动超频${ol.up ? '' : '；本机现在没装 Ollama'}：
          </div>
          ${ol.up ? `<div class="row wrap" style="gap:10px;margin-top:8px">
            <button class="btn" id="dp-deep-kbollama">🦙 用本机 Ollama${pick ? '（' + e2(pick) + '）' : ''}</button>
            ${pick ? '' : '<span class="dp-warn" style="font-size:12.5px">Ollama 里还没拉 embedding 模型，先跑一次 <code>ollama pull nomic-embed-text</code></span>'}
          </div>` : `<div class="mut" style="font-size:12.5px;line-height:1.95;margin-top:6px">
            想用 Ollama：<code>winget install Ollama.Ollama</code>，装完 <code>ollama pull nomic-embed-text</code>，回来刷新。
          </div>`}
          <div class="row wrap" style="gap:8px;margin-top:10px">
            <input class="dp-inp" id="dp-deep-embbase" placeholder="https://api.siliconflow.cn/v1">
            <input class="dp-inp sm" id="dp-deep-embmodel" placeholder="BAAI/bge-m3">
            <input class="dp-inp sm" id="dp-deep-embkey" type="password" autocomplete="off" placeholder="key（本机服务可留空）">
            <button class="btn" id="dp-deep-embsave">配好并重跑索引</button>
          </div>
          <div class="mut" style="font-size:12px;line-height:1.9;margin-top:6px">
            云端只填到 <code>/v1</code>（硅基流动 <code>BAAI/bge-m3</code>、OpenAI <code>text-embedding-3-small</code>…）；
            本机自己搭的端点必须写全 <code>/embeddings</code>。key 同样只落你自己的 DeepTutor 数据目录。
          </div>
        </details>`;
        const esb = card.querySelector('#dp-deep-embedstart');
        if (esb) esb.onclick = async () => {
          const line = card.querySelector('#dp-deep-embedstate');
          const say2 = m => { if (line) line.innerHTML = '状态：' + m; };
          esb.disabled = true;
          say2(em.fastembed ? '正在起服务（第一次要下 ≈95MB 模型）…' : '正在装 fastembed（清华源 ≈120MB）…');
          /* 装依赖 + 起服务 + 配好 + 重跑索引 都在服务端一条龙，可能要几分钟，所以先写进度 */
          const iv = setInterval(async () => {
            const s2 = await fetch('/deep/status').then(x => x.json()).catch(() => null);
            const l = s2 && s2.embed && s2.embed.log;
            if (l && l.running && l.now) say2(e2(l.now));
          }, 3000);
          const r = await post('/deep/embed/start', { install: true, reindex: true });
          clearInterval(iv);
          esb.disabled = false;
          if (!r.ok) { say2(`<span class="dp-warn">${e2(r.error || '没弄成')}</span>`); await kbRefresh(); return; }
          const rx = r.reindex || {}, rx2 = r.reindex2 || {};
          say2(`<b style="color:#63c07a">已开启</b> · ${e2(r.model || emModel)}${r.dim ? ' · ' + r.dim + ' 维' : ''}`
            + (rx.ok ? ' · 行测库索引重跑中' : '') + (rx2 && rx2.ok ? ' · 申论库索引重跑中' : '')
            + '<span class="mut">（一两分钟后点「刷新状态」看结果）</span>');
          await kbRefresh();
        };
        const ob = card.querySelector('#dp-deep-kbollama');
        if (ob) ob.onclick = async () => {
          kbSay('状态：正在让 Ollama 当 embedding 并重跑索引…');
          const r = await post('/deep/kb/embed', { ollama: true });
          kbSay(r.ok ? `状态：embedding 配好了（<code>${e2(r.model || '')}</code>），索引在后台跑` : `状态：<span class="dp-warn">${e2(r.error || '没配成')}</span>`);
          setTimeout(() => kbRefresh(), 1500);
        };
        const sb = card.querySelector('#dp-deep-embsave');
        if (sb) sb.onclick = async () => {
          const body = {
            baseUrl: card.querySelector('#dp-deep-embbase').value.trim(),
            model: card.querySelector('#dp-deep-embmodel').value.trim(),
            apiKey: card.querySelector('#dp-deep-embkey').value.trim()
          };
          if (!body.baseUrl || !body.model) { kbSay('状态：<span class="dp-warn">地址和模型名都得填</span>'); return; }
          kbSay('状态：正在写 embedding 配置并重跑索引…');
          const r = await post('/deep/kb/embed', body);
          kbSay(r.ok ? `状态：embedding 配好了（<code>${e2(r.model || '')}</code>），索引在后台跑` : `状态：<span class="dp-warn">${e2(r.error || '没配成')}</span>`);
          setTimeout(() => kbRefresh(), 1500);
        };
      }

      /* 申论那半（用户 m15146）：第二个知识库「超频申论知识库」，30 份袁东 2027 讲义。
         跟行测库分开是故意的 —— 两种考法混在一个库里会互相污染检索结果。 */
      function slPaint(k) {
        if (!slEl) return;
        const sl = k.sl || {}, loc = k.slLocal || {}, live = k.slLive || {}, emb = k.embedding || {};
        const name = e2(sl.name || '超频申论知识库');
        const parts = [`本地：<b>${loc.docs || 0}</b> 份申论讲义` + (loc.kb ? `（${loc.kb} KB）` : '')];
        if (!sl.docs) parts.push(`还没同步 —— 点「📝 同步申论讲义」灌进「${name}」`);
        else if (emb.ready && live.ragReady) parts.push(`已同步 <b>${sl.docs}</b> 份 · <b style="color:#63c07a">能搜了</b>`);
        else if (!emb.ready) parts.push(`文件已同步 <b>${sl.docs}</b> 份，索引还缺一个 embedding 模型`);
        else parts.push(`已同步 <b>${sl.docs}</b> 份 · 索引中${live.percent ? ' ' + live.percent + '%' : ''}`);
        if (sl.syncedAt) parts.push('上次同步 ' + e2(String(sl.syncedAt).slice(0, 16).replace('T', ' ')));
        slEl.innerHTML = '📝 申论教练 / 讲题技能已经装好了，讲义在「' + name + '」里 · ' + parts.join(' · ');
      }

      function kbPaint(k) {
        const local = k.local || {}, live = k.live || {}, emb = k.embedding || {};
        const mine = `本地内容：<b>${local.cards || 0}</b> 张知识卡（${local.modules || 0} 个模块）+ <b>${local.szs || 0}</b> 条时政`;
        const when = k.syncedAt ? ' · 上次同步 ' + e2(k.syncedAt.slice(0, 16).replace('T', ' ')) : '';
        let line;
        if (!k.docs) line = `还没同步 —— 点「一键同步知识库」就会把这 ${local.cards || 0} 张卡 + ${local.szs || 0} 条时政渲染成 md 灌进去${when}`;
        else if (emb.ready && live.ragReady) line = `已同步 <b>${k.docs}</b> 份（${k.cards} 张卡 + ${k.szs} 条时政）· <b style="color:#63c07a">能搜了</b>${when}`;
        else if (!emb.ready) line = `文件已同步 <b>${k.docs}</b> 份（${k.cards} 张卡 + ${k.szs} 条时政），但<b>索引还缺一个 embedding 模型</b>${when}`;
        else line = `已同步 <b>${k.docs}</b> 份 · 索引中${live.percent ? ' ' + live.percent + '%' : ''}${live.message ? ' · ' + e2(String(live.message).slice(0, 120)) : ''}${when}`;
        kbSay(`状态：${line}<div class="mut" style="font-size:12px;margin-top:3px">${mine}</div>`);
        slPaint(k);

        if (!embEl) return;
        const em = k.embed || {};
        if (emb.ready) {
          const ours = !!em.bound;
          const down = ours && !em.running;
          embEl.innerHTML = `
          <div class="mut" style="font-size:12.5px;line-height:1.95;margin-top:10px">
            embedding：<code>${e2(emb.model)}</code>${ours ? ' · 本机离线服务（' + e2(em.url || '') + '）' : ''}${emb.baseUrl && !ours ? ' · <code>' + e2(emb.baseUrl) + '</code>' : ''}
            ${down ? '<br><span class="dp-warn">⚠ 这个服务现在没在跑 —— 索引/检索会失败，点「重跑索引」会顺带把它叫起来</span>'
              : (ours && em.running ? '<br>服务状态：<b style="color:#63c07a">在跑</b>' + (em.loaded ? ' · ' + e2(em.model || '') + (em.dim ? ' · ' + em.dim + ' 维' : '') : ' · 模型加载中') : '')}
            <div class="row wrap" style="gap:10px;margin-top:8px">
              <button class="btn sm" id="dp-deep-kbreindex">🔄 重跑索引</button>
              <button class="btn sm" id="dp-deep-kbchg">换一个 embedding</button>
            </div>
          </div>`;
          const rb = card.querySelector('#dp-deep-kbreindex');
          if (rb) rb.onclick = async () => {
            rb.disabled = true; kbSay('状态：正在重跑索引…（33 份文档要一两分钟）');
            const r = await post('/deep/kb/embed', { reindex: true });
            rb.disabled = false;
            kbSay(r.ok ? '状态：索引重跑起来了，一会儿点「刷新状态」看结果' : `状态：<span class="dp-warn">${e2(r.error || '没跑起来')}</span>`);
            setTimeout(() => kbRefresh(), 2000);
          };
          const cb = card.querySelector('#dp-deep-kbchg');
          if (cb) cb.onclick = () => embForm(k);
        } else {
          embForm(k);
        }
      }

      async function kbRefresh() {
        const k = await fetch('/deep/kb/status').then(x => x.json()).catch(() => null);
        if (!k || !k.ok) { kbSay('<span class="dp-warn">读不到知识库状态（本地服务是不是断了）</span>'); return; }
        kbPaint(k);
      }
      const kbSyncBtn = card.querySelector('#dp-deep-kbsync');
      if (kbSyncBtn) kbSyncBtn.onclick = async () => {
        kbSyncBtn.disabled = true;
        kbSay('状态：正在渲染知识卡并灌进 DeepTutor…（第一次要十几秒）');
        const r = await post('/deep/kb/sync');
        kbSyncBtn.disabled = false;
        if (!r.ok) { kbSay(`状态：<span class="dp-warn">没同步成：${e2(r.error || '')}</span>`); return; }
        await kbRefresh();
      };
      const kbReBtn = card.querySelector('#dp-deep-kbrefresh');
      if (kbReBtn) kbReBtn.onclick = () => { kbSay('状态：刷新中…'); kbRefresh(); };
      const slSyncBtn = card.querySelector('#dp-deep-slsync');
      if (slSyncBtn) slSyncBtn.onclick = async () => {
        slSyncBtn.disabled = true;
        if (slEl) slEl.innerHTML = '📝 正在把 30 份申论讲义灌进 DeepTutor…（约 2.2MB，第一次要一两分钟）';
        const r = await post('/deep/kb/sync', { subject: 'shenlun' });
        slSyncBtn.disabled = false;
        if (!r.ok) { if (slEl) slEl.innerHTML = `📝 <span class="dp-warn">没同步成：${e2(r.error || '')}</span>`; return; }
        await kbRefresh();
      };
      kbRefresh();

      /* ---- 🧭 精通之路 & 练习（用户 m16822）：DeepTutor 的「学习」那两块 ----
         它不是「问答」，而是两条有状态的学习线：精通之路（带知识点/掌握度的路线）
         和练习（SM-2 间隔重复）。料由超频出（学情当 goal、错题当题库），活由服务端干
         （/deep/study/setup）。 */
      const studyEl = card.querySelector('#dp-deep-study');
      const sBase = String(s.webUrl || '').replace(/\/$/, '');

      function studyPaint(k) {
        if (!studyEl) return;
        const tz = (k && k.tz) || {}, m = (k && k.mastery) || {}, p = (k && k.practice) || {};
        const paths = m.paths || [];
        const mine = paths.find(x => /行测精通之路/.test(x.name || '')) || null;
        const good = t => `<b style="color:#63c07a">${t}</b>`;
        const bad = t => `<b class="dp-warn">${t}</b>`;
        let line;
        if (k && k.installed === false) line = '还没装 DeepTutor —— 先把上面那份装好，这两块才有地方落。';
        else if (k && !k.running) line = '后端没在跑 —— 点下面的「一键设置」会先把它拉起来（第一次要二三十秒）。';
        else {
          line = [
            paths.length ? (`精通之路 <b>${paths.length}</b> 条` + (mine ? '（有「' + e2(mine.name) + '」）' : '')) : '精通之路<b>还没有</b>',
            `练习库 <b>${Number(p.total) || 0}</b> 道` + (p.wrong ? ' · 待消化 ' + p.wrong + ' 道' : '') + (p.due ? ' · 今天到期 ' + p.due + ' 道' : ''),
            tz.ok ? good('练习页时区数据齐') : bad('缺 tzdata —— 练习页打不开')
          ].join(' · ');
        }
        studyEl.innerHTML = `
        <div class="hr"></div>
        <h3>🧭 精通之路 &amp; 练习</h3>
        <div class="mut" style="font-size:12.5px;line-height:1.95">${line}</div>
        <div class="mut" style="font-size:12.5px;line-height:1.9;margin-top:6px">
          超频拿你的<b>真实学情</b>当目标，在它那边建一条「行测精通之路」（模块 + 知识点 + 过关标准），
          再把错题本里的题灌进它的<b>间隔重复</b>练习队列（今天该复习哪些、几天后再来一次）。
          两边都用你自己的数据；反复点也只灌一份（按题目 id 去重）。
        </div>
        <div class="row wrap" style="gap:10px;margin-top:10px">
          <button class="btn pri" id="dp-deep-studygo">🧭 一键设置（建路径 + 灌错题）</button>
          <button class="btn" id="dp-deep-studyopen"${mine ? '' : ' disabled'} title="${mine ? '在系统浏览器里打开这条精通之路' : '先点「一键设置」建一条'}">🌐 打开精通之路</button>
          <button class="btn" id="dp-deep-pracopen"${tz.ok ? '' : ' disabled'}>📝 打开练习</button>
          ${tz.ok ? '' : '<button class="btn" id="dp-deep-tzfix">🔧 修练习页（补时区数据）</button>'}
          <button class="btn" id="dp-deep-studyref">🔄 刷新</button>
        </div>
        <div class="mut" id="dp-deep-studyline" style="font-size:12.5px;line-height:1.9;margin-top:8px"></div>`;

        const lineEl = card.querySelector('#dp-deep-studyline');
        const say3 = t => { if (lineEl) lineEl.innerHTML = t; };
        const go = card.querySelector('#dp-deep-studygo');
        if (go) go.onclick = async () => {
          if (!window.__xctermStudySetup) { say3('<span class="dp-warn">学情模块没加载到（刷新一下页面）</span>'); return; }
          const pack = (window.__xctermStudyPack && window.__xctermStudyPack()) || { questions: [] };
          go.disabled = true;
          say3('正在建精通之路 / 灌错题…（大纲由超频从知识卡直接算，不叫模型拟，很快；升级时原有知识点会保住进度）<br><span style="opacity:.7">这次会带 ' + ((pack.questions || []).length) + ' 道错题过去</span>');
          const r = await window.__xctermStudySetup({});
          go.disabled = false;
          const steps = (r.steps || []).map(x => (x.ok ? '✅ ' : '❌ ') + e2(x.name) + (x.tail ? '：' + e2(String(x.tail).slice(0, 200)) : '')).join('<br>');
          say3((r.ok ? '<b style="color:#63c07a">设置好了</b>' : '<span class="dp-warn">没全成</span>')
            + (r.error ? '：' + e2(r.error) : '')
            + (r.mastery && r.mastery.id ? '<br>精通之路：<code>' + e2(r.mastery.name || '') + '</code>' : '')
            + (r.practice && r.practice.saved ? '<br>灌进练习：<b>' + r.practice.saved + '</b> 道' : '')
            + (steps ? '<br>' + steps : '')
            + '<br><span style="opacity:.7">点「🔄 刷新」看最新状态</span>');
        };
        const ob = card.querySelector('#dp-deep-studyopen');
        if (ob) ob.onclick = () => { try { window.open(sBase + '/learning/mastery' + (mine ? '/' + mine.id : ''), '_blank'); } catch { } };
        const pb = card.querySelector('#dp-deep-pracopen');
        if (pb) pb.onclick = () => { try { window.open(sBase + '/learning/practice', '_blank'); } catch { } };
        const tb = card.querySelector('#dp-deep-tzfix');
        if (tb) tb.onclick = async () => {
          tb.disabled = true;
          say3('正在补时区数据（pip 装 tzdata，几秒到一分钟）…');
          const r = await post('/deep/tz/fix');
          tb.disabled = false;
          say3(r.ok ? '<b style="color:#63c07a">装好了</b> —— 练习页现在能打开了（点「📝 打开练习」）'
            : '<span class="dp-warn">' + e2(r.error || '没装上') + '</span>');
        };
        const rb = card.querySelector('#dp-deep-studyref');
        if (rb) rb.onclick = () => { rb.disabled = true; say3('刷新中…'); studyRefresh().then(() => { }); };
      }

      async function studyRefresh() {
        const k = await fetch('/deep/study/status').then(x => x.json()).catch(() => null);
        studyPaint(k || { tz: {}, mastery: {}, practice: {} });
      }
      studyPaint({ installed: true, running: false, tz: {}, mastery: {}, practice: {} });
      studyRefresh();
    } else {
      /* 把「我们将来去哪儿找数据目录」的真实路径写进命令里 —— 用户照着抄就不会装到别处去 */
      const homeHint = (s && s.home) ? s.home : 'D:\\超频-DeepTutor';
      const initCmd = 'deeptutor init --cli --home "' + homeHint + '"';
      const py = (s && s.py) || null;
      const pyLine = py
        ? `超频在你机器上找到了 <code>Python ${e2(py.version)}</code>，可以直接替你装好，不用碰命令行。`
        : `⚠ 没找到 Python <b>3.11–3.14</b>。这台机器 PATH 上的 <code>python</code> 是 3.6，<b>照下面敲 pip 会装不上</b> —— 先去装个 3.12（装的时候勾上 Add to PATH），回来刷新这一页。`;
      more.innerHTML = `
      <div class="hr"></div>
      <div class="mut" style="font-size:13px;line-height:1.95">
        AI 讲师的后端是开源的 <b>DeepTutor</b>（Apache-2.0），本机装一份就行。
        它是个本地 Python 服务，超频通过 <code>/deep/*</code> 把题目转给它、把它的回答流式接回来 ——
        <b>不装也能用超频的其它全部功能</b>，只是那颗「🤖 问 AI 讲师」会告诉你去哪装。
      </div>
      <div class="row wrap" style="gap:10px;margin-top:12px">
        ${py ? '<button class="btn pri" id="dp-deep-install">⬇ 帮我装（推荐）</button>' : '<button class="btn" id="dp-deep-py">📂 去下 Python</button>'}
        <button class="btn" id="dp-deep-home">📂 打开项目主页</button>
        <button class="btn" id="dp-deep-redo">🔄 装好了，重新探测</button>
      </div>
      <div class="mut" id="dp-deep-pyline" style="font-size:12.5px;line-height:1.9;margin-top:8px">${pyLine}</div>
      <div class="hr"></div>
      <h3>想自己装也行</h3>
      <div class="dp-cmd">${e2(CLI_HINT)}<br>${e2(initCmd)}</div>
      <div class="row wrap" style="gap:10px;margin-top:10px">
        <button class="btn" id="dp-deep-copy">📋 复制这两条命令</button>
      </div>
      <div class="hr"></div>
      <h3>已经装了？把路径告诉我</h3>
      <div class="mut" style="font-size:12.5px;line-height:1.9">
        指到 venv 里的 <code>deeptutor.exe</code> 或 <code>python.exe</code> 都行（python 那种会自动补 <code>-m deeptutor</code>）。
        数据目录留空的话，超频会去找 <code>${e2(homeHint)}</code>。
      </div>
      <div class="row wrap" style="gap:8px;margin-top:10px">
        <input class="dp-inp" id="dp-deep-cli" placeholder="C:\\…\\venv\\Scripts\\deeptutor.exe">
        <input class="dp-inp sm" id="dp-deep-homep" placeholder="数据目录（可留空）">
        <button class="btn pri" id="dp-deep-setpath">保存路径</button>
      </div>`;

      const pBtn = card.querySelector('#dp-deep-py');
      if (pBtn) pBtn.onclick = () => { try { window.open('https://www.python.org/downloads/', '_blank'); } catch { } };
      const ib = card.querySelector('#dp-deep-install');
      /* 装是真活在后台跑，这里每 2 秒拉一次进度（挂一个十几分钟的 fetch 会看不见进度，
         而且面板一重画就断了）。 */
      const watchInstall = () => {
        const t0 = Date.now();
        const tick = setInterval(async () => {
          const s2 = await fetch('/deep/install/status').then(x => x.json()).catch(() => null);
          if (!s2) return;
          const mins = Math.round((Date.now() - t0) / 600) / 100;
          const steps = s2.steps || [];
          const cur = s2.now || (steps.length ? steps[steps.length - 1].name : '准备中');
          if (s2.running) {
            say('状态：正在装 DeepTutor…（<b>' + e2(cur) + '</b>，已等 ' + mins + ' 分钟）'
              + '<br><span class="mut">第一次要下 100 多 MB 的依赖，看网速大概 3–10 分钟；装完这里会自己变，别关这个窗口。</span>');
            return;
          }
          clearInterval(tick);
          if (s2.ok) {
            flash = '状态：装好了！DeepTutor <b>' + e2(s2.version || '') + '</b> · 入口已经认到，下面把模型和 Key 填上就能用';
            await status(true);
            repaint();
            return;
          }
          const bb = card.querySelector('#dp-deep-install');
          if (bb) bb.disabled = false;
          const tail = steps.filter(x => !x.ok).map(x => x.name + '：' + (x.tail || '')).join('\n');
          say('状态：<span class="dp-warn">' + e2(s2.error || '没装成') + '</span>'
            + (tail ? '<br><span class="mut" style="font-size:12px">' + e2(tail).split('\n').join('<br>') + '</span>' : ''));
        }, 2000);
      };
      if (ib) ib.onclick = async () => {
        ib.disabled = true;
        say('状态：正在装 DeepTutor…<br><span class="mut">第一次要下 100 多 MB 的依赖，看网速大概 3–10 分钟；装完这里会自己变，别关这个窗口。</span>');
        const r = await fetch('/deep/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
          .then(x => x.json()).catch(() => ({ ok: false, error: '连不上本地服务' }));
        if (!r.ok) {
          ib.disabled = false;
          say('状态：<span class="dp-warn">' + e2(r.error || '没装成') + '</span>');
          return;
        }
        watchInstall();
      };
      /* 面板重画 / 重开的时候如果安装还在后头跑，直接接着看进度，不用再点一次 */
      if (ib) fetch('/deep/install/status').then(x => x.json()).then(s2 => {
        if (s2 && s2.running) { ib.disabled = true; watchInstall(); }
      }).catch(() => { });

      const cpBtn = card.querySelector('#dp-deep-copy');
      if (cpBtn) cpBtn.onclick = async () => {
        const txt = CLI_HINT + '\n' + initCmd;
        try { await navigator.clipboard.writeText(txt); say('状态：命令已复制到剪贴板'); }
        catch { try { window.prompt('手动复制这两条：', txt); } catch { } }
      };
      const hpBtn = card.querySelector('#dp-deep-home');
      if (hpBtn) hpBtn.onclick = () => { try { window.open('https://github.com/HKUDS/DeepTutor', '_blank'); } catch { } };
      const spBtn = card.querySelector('#dp-deep-setpath');
      if (spBtn) spBtn.onclick = async () => {
        const cli = card.querySelector('#dp-deep-cli').value.trim();
        const hm = card.querySelector('#dp-deep-homep').value.trim();
        if (!cli && !hm) { say('状态：<span class="dp-warn">先填一个路径</span>'); return; }
        say('状态：保存中…');
        const body = {}; if (cli) body.cli = cli; if (hm) body.home = hm;
        const r = await fetch('/deep/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => ({ ok: false, error: '连不上本地服务' }));
        if (!r.ok) say(`状态：<span class="dp-warn">${e2(r.error || '没存成')}</span>`);
        else if (!r.installed) say('状态：<span class="dp-warn">路径存下了，但那儿没找到 deeptutor，检查一下</span>');
        else { flash = `状态：找到了 DeepTutor <b>${e2(r.version || '')}</b> · 模型 <b>${e2(r.model || '（没配）')}</b>`; repaint(); }
      };
    }

    const redo = card.querySelector('#dp-deep-redo');
    if (redo) redo.onclick = async () => { say('状态：重新探测中…'); await status(true); repaint(); };
  }

  window.Deep = {
    open, close, ask, status, promptOf, panelHTML, bindPanel,
    ready: () => status(true),
    current: () => ctx,
    reset: () => { turns = []; if (body) { body.innerHTML = ''; hello(); } }
  };
})();
