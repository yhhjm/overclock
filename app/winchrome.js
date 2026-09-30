/* 应用窗口适配（只在 --app 窗口里生效：启动器会给地址带上 ?win=1）
   浏览器给应用窗口画的那条标题栏是它自己渲染的，Win32 去不掉（详见 _launch.ps1 注释），
   所以这里补三件事：
   1) 拖顶栏 / 拖开机动画可以移动窗口（Chromium 应用窗口允许 window.moveBy）
   2) 顶栏右上角 ⛶ 全屏 / 退出全屏（浏览器全屏 API，比 F11 更直观）
   3) 顶栏右上角 ✕ 关闭窗口（window.close()）
   浏览器里直接打开 app/index.html（无 ?win=1）时本文件不做任何事。 */
(function () {
  if (!/[?&]win=1/.test(location.search)) return;

  var html = document.documentElement;
  html.classList.add('appwin');

  function bindDrag(el) {
    if (!el) return;
    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('input,button,a,select,textarea,.searchbox,[data-nodrag]')) return;
      var lx = e.screenX, ly = e.screenY, on = true;
      function mv(ev) {
        if (!on) return;
        var dx = ev.screenX - lx, dy = ev.screenY - ly;
        lx = ev.screenX; ly = ev.screenY;
        if (dx || dy) { try { window.moveBy(dx, dy); } catch (err) {} }
      }
      function up() {
        on = false;
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
      }
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
      e.preventDefault();
    });
  }

  // Electron 里 .topbar / .splash 已经是 -webkit-app-region:drag（见 app.css 的 .appwin 块），
  // 由 Chromium 原生拖窗口；这里再走 window.moveBy 会双重位移。
  // 浏览器的 --app 窗口没这套 app-region，才需要 moveBy 兜底。
  var nativeDrag = /Electron\//i.test(navigator.userAgent);
  if (!nativeDrag) {
    bindDrag(document.querySelector('.topbar'));
  }
  /* ★开机动画不做拖拽把手：它整块都要能点（「点任意处进入」）。
     app.css 里 .splash 已明写 -webkit-app-region:no-drag，这里也不再给它绑 moveBy ——
     否则一拖就顺手把 splash 点掉了。想拖窗口拖顶栏。 */

  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  var full = document.getElementById('win-full');
  if (full) {
    full.addEventListener('click', function (e) {
      e.stopPropagation();
      try {
        if (fsEl()) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          var el = document.documentElement;
          (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        }
      } catch (err) {}
    });
    function sync() {
      var on = !!fsEl();
      full.textContent = on ? '⤡' : '⛶';
      full.title = (on ? '退出全屏' : '全屏') + '（F11）';
    }
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
  }

  var close = document.getElementById('win-close');
  if (close) {
    close.addEventListener('click', function (e) {
      e.stopPropagation();
      try { window.close(); } catch (err) {}
    });
  }
})();
