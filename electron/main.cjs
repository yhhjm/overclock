/* electron/main.cjs —— 超频 OVERCLOCK 的 Electron 壳（照 Mineradio 的形态：独立 .exe）
 *
 * 它只做三件事：
 *   1) 在主进程里把项目根的 server.mjs 起起来（静态文件 + 粉笔反向代理 + 壁纸接口）
 *   2) 开一个无边框窗口指到 http://127.0.0.1:端口/?win=1
 *      —— 顶栏、⛶ 全屏、✕ 关闭都是页面自己画的，见 app/winchrome.js
 *   3) 外链走系统默认浏览器，窗口一关就退出
 *
 * 关键：app/ 下的网页代码一个字都不用改。浏览器里直接打开 app\index.html（或用 启动.cmd）
 * 照旧能跑；这只是把它包成 Mineradio 那样的 .exe。
 *
 * 静态根不用显式给：server.mjs 用的是「server.mjs 同级的 app 目录」，
 * 打包后是 resources\app\{server.mjs,app\}，跟开发时的目录结构一模一样。
 */
'use strict';

const { app, BrowserWindow, shell, Menu } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const net = require('node:net');
const http = require('node:http');

const ROOT = join(__dirname, '..');          // 行测学习终端\
const SERVER = join(ROOT, 'server.mjs');
const fs = require('node:fs');

// 任务栏/通知里显示的是中文名，不是 electron.exe
app.setAppUserModelId('com.xingce.terminal');

/* 1.9.0 音乐：启动就随机放一首，不能等用户手势。
   Electron 的默认值本来就是这个，但不想赌 —— 显式写死。
   （用户 m11719：「每次启动都会随机放里面的歌曲」） */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

/* ---------- 端口探测 ----------
 * 跟 _launch.ps1 一样的策略：从 5178 起找一个能用的；被别的实例占了就往后顺延。 */
function freePort(base) {
  return new Promise((resolve) => {
    let p = base;
    const probe = () => {
      const srv = net.createServer();
      srv.once('error', () => {
        srv.close();
        p += 1;
        if (p > base + 40) return resolve(base);
        probe();
      });
      srv.once('listening', () => {
        const got = srv.address().port;
        srv.close(() => resolve(got));
      });
      srv.listen(p, '127.0.0.1');
    };
    probe();
  });
}

function ping(port, tries) {
  const n = tries == null ? 40 : tries;
  return new Promise((resolve) => {
    let left = n;
    const once = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/ping', timeout: 400 }, (r) => {
        r.resume();
        resolve(r.statusCode === 200);
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
      function retry() {
        left -= 1;
        if (left <= 0) return resolve(false);
        setTimeout(once, 150);
      }
    };
    once();
  });
}

function cookieFile() {
  /* ★打包后一律用 %AppData%\超频，不再优先放程序目录：
     便携版/自解压版的「程序目录」是启动时刚解压出来的临时目录 —— 登录态写那儿，
     下次开就没了（自解压版表现为每次启动都要重扫码）；而且那个目录会被打进 zip，
     等于把粉笔登录态、网易云 cookie 一起发出去。
     只有开发时（没打包）才跟 `启动.cmd` 共用 ROOT\fenbi-cookies.json，
     从 .exe 开和从 `启动.cmd` 开看到的是同一个账号。 */
  if (!app.isPackaged) {
    try {
      fs.accessSync(ROOT, fs.constants.W_OK);
      return join(ROOT, 'fenbi-cookies.json');
    } catch { }
  }
  const dir = app.getPath('userData');
  const dst = join(dir, 'fenbi-cookies.json');
  const dstNcm = join(dir, 'netease.json');
  /* 1.9.3 及以前把这两份写在程序目录里，升级上来的用户不该被迫重扫一次码 / 重登网易云：
     新位置还没有、老的那份还在，就搬过去（`netease.json` 跟 cookie 同目录）。 */
  try {
    const old = join(ROOT, 'fenbi-cookies.json');
    if (old !== dst && !fs.existsSync(dst) && fs.existsSync(old)) fs.copyFileSync(old, dst);
    const oldNcm = join(ROOT, 'netease.json');
    if (oldNcm !== dstNcm && !fs.existsSync(dstNcm) && fs.existsSync(oldNcm)) fs.copyFileSync(oldNcm, dstNcm);
  } catch { }
  return dst;
}

async function startServer() {
  const base = Number(process.env.XCTERM_PORT || 5178);
  const port = await freePort(base);

  // server.mjs 是被 import 进主进程的，所以两件事必须在这里定：
  //   1) 空闲看门狗要关掉 —— 它会 process.exit(0)，那会把整个 .exe 一起关掉
  //   2) cookie 存哪
  if (!process.env.XCTERM_IDLE_MS) process.env.XCTERM_IDLE_MS = '0';
  if (!process.env.XCTERM_COOKIES) process.env.XCTERM_COOKIES = cookieFile();
  /* DeepTutor 的 venv / home / deeptutor.json 一律落在 %AppData%\超频\deeptutor。
     ★不能跟着 cookieFile() 走：打包后那个是「程序目录」，便携版每次启动都是新解压的
     临时目录 —— 让用户把 DeepTutor 装进去等于下次开就没了。 */
  if (!process.env.XCTERM_DEEP_ROOT) process.env.XCTERM_DEEP_ROOT = join(app.getPath('userData'), 'deeptutor');

  // server.mjs 里的端口是 argOf('port', process.env.XCTERM_PORT || 5178)：
  // argv 和 env 都给一份，谁先被认到都行。
  process.env.XCTERM_PORT = String(port);
  process.argv.push('--port', String(port));
  await import(pathToFileURL(SERVER).href);
  const up = await ping(port);
  if (!up) throw new Error('server.mjs 起来了但 /ping 不通（端口 ' + port + '）');
  return port;
}

/* ---------- 窗口 ---------- */
let win = null;

function createWindow(port) {
  win = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 960,
    minHeight: 620,
    show: false,
    frame: false,                       // 照 Mineradio：无边框，标题栏由页面画
    backgroundColor: '#08090B',         // 跟 app.css 的 --bg 一致，免得启动那下白闪
    icon: join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => win.show());

  // 外链一律丢给系统浏览器，别把题库窗口变成万能浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const ok = url.startsWith('http://127.0.0.1:' + port + '/');
    if (!ok) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.on('closed', () => { win = null; });

  return win.loadURL('http://127.0.0.1:' + port + '/?win=1');
}

/* ---------- 生命周期 ---------- */
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on('window-all-closed', () => {
  app.quit();
});

// 退出前把粉笔 cookie 落盘（server.mjs 里的 saveJar()）
app.on('before-quit', () => {
  try { process.emit('xcterm-save'); } catch { /* server.mjs 还没起来就无所谓 */ }
});

app.whenReady().then(async () => {
  let port;
  try {
    port = await startServer();
  } catch (err) {
    console.error('[xcterm] 本地服务启动失败：', err && err.message);
    app.quit();
    return;
  }
  try {
    await createWindow(port);
  } catch (err) {
    console.error('[xcterm] 窗口创建失败：', err && err.message);
    app.quit();
  }
});
