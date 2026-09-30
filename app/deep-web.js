/* ============================================================
   AI 讲师 · 整页（用户 m14437：我用网页版的学）
   ------------------------------------------------------------
   把 DeepTutor 自己的网页版（Next.js，127.0.0.1:3782）整个嵌进超频，
   不用另开浏览器、不用在窗口之间来回切。实测 3782 的响应头既没有
   X-Frame-Options 也没有 CSP、页面里也没有 CSP meta ⇒ 可以 iframe。

   这一页只做四件事：
     ① 看后端在不在跑，不在就（可一键）拉起来；
     ② 起来之后顺手调一次 /deep/web/polish —— 把界面/回答语言改成中文、
        并把「行测教练」人格 + 讲题技能补上（幂等，缺什么补什么，0.1 秒）；
     ③ 把网页版放进 iframe，顶上留一条我们自己状态栏 + 三个按钮；
     ④ 接住抽屉递过来的会话号（#dp-toweb → DeepWeb.go(session)），
        直接深链到 /chat/<会话 id>，等于「把这道题送过去接着聊」。

   ★iframe 是**跨源**的（我们 5178，它 3782），所以别指望脚本进去操作它 ——
     连重新加载都只能靠重新赋 src（这招管用，见 reloadFrame）。
   ============================================================ */
(function () {
  'use strict';

  const CAN = typeof location !== 'undefined' && location.protocol !== 'file:' && !!window.fetch;
  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let st = null, stAt = 0;
  let frame = null, empty = null, stateEl = null, bar = null, tipEl = null;
  let pendingSession = '';     // 抽屉递过来、要打开的会话
  let openedUrl = '';          // 当前 iframe 挂的是什么地址
  let busy = false;

  async function status(force) {
    if (!CAN) return { ok: false, installed: false, offline: true };
    if (!force && st && Date.now() - stAt < 8000) return st;
    try { st = await (await fetch('/deep/status')).json(); }
    catch { st = { ok: false, installed: false, error: '连不上本地服务' }; }
    stAt = Date.now();
    return st;
  }
  const webUrl = s => (s && s.webUrl) || 'http://127.0.0.1:3782/';
  const chatUrl = (s, sid) => webUrl(s) + 'chat/' + encodeURIComponent(sid);

  function say(html) { if (stateEl) stateEl.innerHTML = html; }

  function mount(url) {
    if (!frame || openedUrl === url) return;
    openedUrl = url;
    try { frame.src = url; } catch { }
    frame.classList.add('on');
    if (empty) empty.classList.remove('on');
  }
  function unmount() {
    if (frame) { frame.classList.remove('on'); try { frame.src = 'about:blank'; } catch { } }
    openedUrl = '';
  }
  /* 跨源 iframe 摸不到里面，想刷新只能把同一个地址再赋一次 src（实测有效） */
  function reloadFrame() {
    if (!frame || !openedUrl) return;
    const u = openedUrl;
    openedUrl = '';
    mount(u);
  }

  function showEmpty(s) {
    unmount();
    if (!empty) return;
    empty.classList.add('on');
    empty.innerHTML = `
      <div class="dpw-e-ico">🤖</div>
      <h2>AI 讲师还没装</h2>
      <p class="mut">它的后端是开源的 DeepTutor（HKUDS/DeepTutor，Apache-2.0）：一个本地跑的 Python 服务，
      超频通过 /deep/* 把题目转过去、把回答流回来，网页版就是它自带的完整界面。</p>
      <p class="mut">没装也不影响超频别的功能。装好之后这里会直接嵌进它的网页版，不用另开浏览器。</p>
      <p class="mut">要是你机器上已经有一份在跑（比如 127.0.0.1:3782），把它开着再回到这一页，这里就会直接用那一份。</p>
      <div class="dpw-e-acts">
        <button class="btn pri" id="dpw-goset">⚙️ 去设置页装（一键帮我装，3–10 分钟）</button>
        <button class="btn" id="dpw-gogit">↗ 看看这个项目</button>
      </div>`;
    const go = empty.querySelector('#dpw-goset');
    if (go) go.onclick = () => { location.hash = '#/settings'; };
    const git = empty.querySelector('#dpw-gogit');
    if (git) git.onclick = () => window.open('https://github.com/HKUDS/DeepTutor');
  }
  function showStart(s, msg) {
    unmount();
    if (!empty) return;
    const stuck = !!(s && s.stuck);
    empty.classList.add('on');
    empty.innerHTML = `
      <div class="dpw-e-ico">${stuck ? '🧊' : '🖥'}</div>
      <h2>${stuck ? '后端僵住了' : (msg ? '网页版没起来' : '网页版还没开')}</h2>
      <p class="mut">${stuck
        ? 'DeepTutor 的后端（8001）端口还占着，但请求一概不响应 —— 多半是建索引建到一半卡住了。点下面那颗按钮会先把僵住的那份清掉再重起，你自己那个正在聊的会话不会丢（记录在它的对话历史里）。'
        : (msg ? esc(msg) : 'DeepTutor 装好了，但它的网页服务（3782）现在没在跑。')}</p>
      <div class="dpw-e-acts">
        <button class="btn pri" id="dpw-go">${stuck ? '⟳ 重启后端' : '▶ 启动网页版'}</button>
        <button class="btn" id="dpw-goset2">⚙️ 打开设置</button>
      </div>`;
    const go = empty.querySelector('#dpw-go');
    if (go) go.onclick = () => ensure(true);
    const gs = empty.querySelector('#dpw-goset2');
    if (gs) gs.onclick = () => { location.hash = '#/settings'; };
  }

  /* 「行测化」三件事：中文界面 + 行测教练人格 + 讲题技能。幂等，缺什么补什么。 */
  async function polish() {
    try {
      const r = await (await fetch('/deep/web/polish', { method: 'POST' })).json();
      st = null; stAt = 0;
      return r;
    } catch { return { ok: false }; }
  }

  async function ensure(startIt) {
    if (!CAN) { say('现在不是本地服务模式，AI 讲师用不了'); return; }
    if (busy) return;
    busy = true;
    try {
      let s = await status(true);
      if (!s.installed) {
        /* ★这台机器上已经有一份网页版在跑（可能是他早先手装的、不是我装的那份）：
           那是同一套东西，能嵌就嵌 —— 别一口回绝说「还没装」把他自己那份挡在外面。
           但**不做 polish**：语言/人格/技能是写进「home」里的，而我们认识的 home 是
           自己那套（%AppData%\超频\deeptutor），跟它正在用的不是一份，改了也不生效。 */
        if (s.running) {
          say('状态：已就绪 · 正在用这台机器上已经在跑的网页版' + (s.webPort ? '（' + s.webPort + '）' : '') +
              ' · 它不是我装的那份，界面语言归它自己管');
          if (tipEl) {
            tipEl.innerHTML = '💡 这是它自带的完整界面：左边能开新对话，它自己的设置里能挑语言和人格。' +
              '超频这边的题目也能一键送过来（抽屉里那颗「🖥 接着聊」）。';
          }
          if (bar) bar.classList.add('on');
          mount(pendingSession ? chatUrl(s, pendingSession) : webUrl(s));
          pendingSession = '';
          return;
        }
        say('状态：还没装 DeepTutor'); showEmpty(s); return;
      }
      if (!s.running) {
        if (!startIt) { say('状态：网页版没开（点「启动网页版」）'); showStart(s); return; }
        /* ★后端僵住（端口占着、请求不响应）：必须强起 —— 否则新进程绑不上 8001 会自己退出，
           等到超时也起不来（1.9.7 实测过）。 */
        say(s.stuck ? '状态：后端僵住了（端口占着但不响应），正在把它清掉重起…'
          : '状态：正在拉起 DeepTutor 的网页版…（第一次要十几秒）');
        unmount();
        if (empty) empty.classList.remove('on');
        try { await fetch('/deep/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ force: !!s.stuck }) }); } catch { }
        for (let i = 0; i < 40; i++) {
          await sleep(1500);
          s = await status(true);
          if (s.running) break;
        }
        if (!s.running) { showStart(s, s.error || '等了 60 秒还是没起来，看一眼设置页的状态行'); say('状态：网页版没起来'); return; }
      }
      /* 起来了：顺手把「行测化」补上（已经配好的话这一下几乎不花时间） */
      const w = await polish();
      s = await status(true);
      const bits = [];
      bits.push(s.web && s.web.zh ? '中文界面' : '界面还是英文（刷新一下试试）');
      if (s.web && s.web.persona) bits.push('行测教练人格');
      if (s.web && s.web.skill) bits.push('行测讲题技能');
      if (s.web && s.web.slPersona) bits.push('申论教练人格');
      if (s.web && s.web.slSkill) bits.push('申论讲题技能');
      if (s.kb && s.kb.cards) bits.push('行测知识库 ' + s.kb.cards + ' 张卡');
      else bits.push('行测知识库还没同步');
      if (s.slLocal && s.slLocal.docs) bits.push('申论讲义 ' + s.slLocal.docs + ' 份');
      if (s.memory && s.memory.exists && s.memory.entries) bits.push('学情记忆 ' + s.memory.entries + ' 条');
      if (w && w.ok === false) bits.push('（有一件事没成：' + esc(w.error || '') + '）');
      say('状态：已就绪 · ' + bits.join(' · '));
      /* 一句上手提示：不熟它那个界面的人，多半不知道知识库和人格是要自己选的 */
      if (tipEl) {
        const tip = [];
        if (s.web && s.web.skill) tip.push('做行测选人格 <b>行测教练</b>、写申论选 <b>申论教练</b>');
        if (s.kb && s.kb.cards) tip.push('做行测选知识库 <b>超频行测知识库</b>');
        if (s.slLocal && s.slLocal.docs) tip.push('写申论选知识库 <b>超频申论知识库</b>');
        /* 学情（错因/薄弱模块/知识卡进度）已经在它的长期记忆里 —— 说清「不用再交代一遍」，
           没同步过就说清去哪点，否则用户会以为它什么都没记住。 */
        if (s.memory && s.memory.exists && s.memory.entries) {
          tip.push('它记得你的学情（' + s.memory.entries + ' 条，错因/薄弱模块/进度）—— 不用再从零交代');
        } else if (s.installed) {
          tip.push('学情还没写进它的记忆 —— 去 <b>⚙️ 设置</b> 那一页点「🧠 现在同步一次学情」，它就知道你哪里弱了');
        }
        /* 语义检索没开的话，知识库就只能躺在硬盘上（DeepSeek 不提供 embedding，本机也没 Ollama）——
           这是唯一会让「某某卡里怎么写的」变成凭空编的一条，必须说出来。 */
        if (s.embed && !(s.embed.running && s.embed.loaded)) {
          tip.push('本机语义检索没开 —— 去 <b>⚙️ 设置</b> 那一页点「⚡ 开启本地语义检索」，知识库才搜得动');
        }
        tipEl.innerHTML = tip.length
          ? '💡 跟它聊的时候：' + tip.join('、') + ' —— 行测按花生十三那套讲、申论按「采点给分」那套批，并去你本地的 ' +
            (s.kb && s.kb.cards ? s.kb.cards + ' 张知识卡' : '知识卡') +
            (s.slLocal && s.slLocal.docs ? ' + ' + s.slLocal.docs + ' 份申论讲义' : '') +
            '里找依据（不选也行，就是只凭它自己的理解讲）。'
          : '';
      }
      mount(pendingSession ? chatUrl(s, pendingSession) : webUrl(s));
      /* 会话号只用一次：跳进来之后就算用掉了，下次从导航点「AI 讲师」回的是首页，
         而不是几天前那道题 —— 想再回那条会话，从它自己的侧边栏点。 */
      pendingSession = '';
      if (bar) bar.classList.add('on');
    } finally { busy = false; }
  }

  async function render(host) {
    host.innerHTML = `
      <div class="dpw">
        <div class="dpw-bar" id="dpw-bar">
          <span class="dpw-state" id="dpw-state">正在看 DeepTutor 的状态…</span>
          <div class="dpw-acts">
            <button class="btn sm" id="dpw-start" title="把 DeepTutor 的网页服务（3782）拉起来">▶ 启动</button>
            <button class="btn sm" id="dpw-reload" title="刷新网页版（跨源 iframe 只能这样刷）">↻ 重新加载</button>
            <button class="btn sm" id="dpw-browser" title="在系统浏览器里打开（想用它的多窗口 / 拖拽时）">↗ 浏览器打开</button>
            <button class="btn sm" id="dpw-set" title="AI 讲师设置（模型 / Key / 知识库）">⚙️</button>
          </div>
        </div>
        <div class="dpw-tip" id="dpw-tip"></div>
        <div class="dpw-stage">
          <iframe id="dpw-frame" class="dpw-frame" src="about:blank" title="DeepTutor 网页版"
                  referrerpolicy="no-referrer" allow="clipboard-write; autoplay"></iframe>
          <div class="dpw-empty" id="dpw-empty"></div>
        </div>
      </div>`;
    frame = host.querySelector('#dpw-frame');
    empty = host.querySelector('#dpw-empty');
    stateEl = host.querySelector('#dpw-state');
    bar = host.querySelector('#dpw-bar');
    tipEl = host.querySelector('#dpw-tip');
    const on = (id, fn) => { const el = host.querySelector(id); if (el) el.onclick = fn; };
    on('#dpw-start', () => ensure(true));
    on('#dpw-reload', () => { reloadFrame(); });
    on('#dpw-browser', async () => { const s = await status(); window.open(pendingSession ? chatUrl(s, pendingSession) : webUrl(s)); });
    on('#dpw-set', () => { location.hash = '#/settings'; });
    openedUrl = '';
    await ensure(false);
    /* 开抽屉/答完题再回来，会话可能换了：每 12 秒对一次，别让这页挂在那儿僵着 */
    const tick = setInterval(async () => {
      if (!document.body.classList.contains('ai-full')) { clearInterval(tick); return; }
      if (!openedUrl || busy) return;
      const s = await status(true);
      if (!s.running) { say('状态：网页版好像退出了（点「启动」再拉起来）'); unmount(); }
    }, 12000);
  }

  window.DeepWeb = {
    render,
    /* 抽屉那颗「🖥 在网页版接着聊」走这里：给会话号 + 跳过去 */
    go(sid) {
      const id = String(sid || '');
      if (location.hash === '#/ai' || location.hash === '#ai') {
        if (id) status(true).then(s => mount(chatUrl(s, id)));
      } else {
        pendingSession = id;       // render() 里 ensure() 会消费掉它
        location.hash = '#/ai';
      }
    },
    session() { return pendingSession; }
  };
})();
