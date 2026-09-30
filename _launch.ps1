# 超频 OVERCLOCK · 启动器（便携版）
# 用 Edge / Chrome 的「应用窗口」模式打开本地页面，看起来就是一个独立软件。
#
# 便携要点：
#   · 全部路径都由 $PSScriptRoot 推出来，解压到任何位置都能跑（中文/空格路径也支持）
#   · 浏览器位置自动探测（注册表 App Paths + 常见安装目录 + 每用户安装 + LOCALAPPDATA）
#   · 窗口默认尺寸按本机屏幕工作区自适应（小屏笔记本不会被裁掉）
#   · 脚本自身按 UTF-8 带 BOM 保存，中文在任何系统区域设置下都不乱码
#
# 可选环境变量：
#   XCTERM_FULL=1      以全屏无边框启动（F11 可切回窗口）
#   XCTERM_KIOSK=1     以 kiosk 全屏启动（Alt+F4 退出，无任何浏览器 UI）
#   XCTERM_FRAME=1     不加 --force-dark-mode（保留浏览器默认的浅色标题栏）
#   XCTERM_ISOLATED=1  用独立数据目录（%LOCALAPPDATA%\XingceTerm\profile）启动：
#                      不受你平时浏览器是否开着影响，标题栏一定是深色，进度也和平时浏览分开
#   XCTERM_PROFILE=D:\data\myprofile    指定任意数据目录（优先于 XCTERM_ISOLATED）
#   XCTERM_DEBUG_PORT=9333              开远程调试端口（自动化测试用）
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$app  = Join-Path $root 'app\index.html'

if (-not (Test-Path -LiteralPath $app)) {
  Write-Host '找不到 app\index.html —— 请确认 _launch.ps1、启动.cmd 和 app 文件夹在同一个目录里。' -ForegroundColor Red
  exit 1
}

# 窗口标题：直接从 index.html 的 <title> 读，避免脚本文件编码问题导致对不上
$title = ''
try {
  $html = Get-Content -LiteralPath $app -Raw -Encoding UTF8
  if ($html -match '<title>\s*([^<]+?)\s*</title>') { $title = $Matches[1] }
} catch { }
if (-not $title) { $title = 'XingceTerm' }

# 控制台窗口标题在这里设（启动.cmd 故意保持纯 ASCII，避开 cmd.exe 解析 UTF-8 批处理的坑）
try { $Host.UI.RawUI.WindowTitle = $title } catch { }

# 关键：路径里有中文/空格，必须转成百分号编码的 file:// URL，
# 否则浏览器会忽略 --app 参数、只开一个空白新标签页。
if ($env:XCTERM_URL) {
  # 联网模式：走 server.mjs 起的本地服务，页面和粉笔接口同源，扫码登录/作答回传才做得了
  $appUrl = $env:XCTERM_URL
} else {
  # ★默认就联网：起本地服务 + 粉笔反向代理（/fenbi/<host>/）。
  #   file:// 下 fetch 粉笔会被 CORS 挡死，所以只要机器上有 node 就一定走 http://127.0.0.1:端口/
  $appUrl = $null
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  $srv = Join-Path $PSScriptRoot 'server.mjs'
  if ($nodeCmd -and (Test-Path -LiteralPath $srv)) {
    $basePort = 5178
    if ($env:XCTERM_PORT) { try { $basePort = [int]$env:XCTERM_PORT } catch { } }

    for ($try = 0; $try -lt 12 -and -not $appUrl; $try++) {
      $p = $basePort + $try
      $ping = $null
      try { $ping = Invoke-WebRequest -Uri "http://127.0.0.1:$p/ping" -UseBasicParsing -TimeoutSec 1 } catch { }
      if ($ping -and $ping.StatusCode -eq 200) {
        # 服务已经在跑了（上次没退干净 / 别的实例），直接用
        $appUrl = "http://127.0.0.1:$p/?win=1"
        break
      }

      $proc = Start-Process -FilePath $nodeCmd.Source -ArgumentList @($srv, '--port', "$p") -WindowStyle Hidden -PassThru
      for ($i = 0; $i -lt 40 -and -not $appUrl; $i++) {
        Start-Sleep -Milliseconds 150
        $ping = $null
        try { $ping = Invoke-WebRequest -Uri "http://127.0.0.1:$p/ping" -UseBasicParsing -TimeoutSec 1 } catch { }
        if ($ping -and $ping.StatusCode -eq 200) { $appUrl = "http://127.0.0.1:$p/?win=1" }
      }
      if (-not $appUrl -and $proc) {
        try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
      }
    }
  }

  if (-not $appUrl) {
    # 离线回退：Node 没装 / 服务起不来时才走纯静态 file://（老行为，但连不上粉笔）
    $url = ([uri](Get-Item -LiteralPath $app).FullName).AbsoluteUri
    # ?win=1 告诉页面「我跑在应用窗口里」→ 顶栏可拖动、右上角出现 ⛶ / ✕ 按钮
    $appUrl = $url + '?win=1'
  }
}

# ---------------- 找浏览器 ----------------
function Find-Browser {
  $cands = New-Object System.Collections.Generic.List[string]

  foreach ($hive in @('HKLM:', 'HKCU:')) {
    foreach ($exe in @('msedge.exe', 'chrome.exe')) {
      $key = "$hive\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exe"
      try {
        $v = (Get-ItemProperty -Path $key -ErrorAction Stop).'(default)'
        if ($v) { $cands.Add($v) }
      } catch { }
    }
  }

  $pf    = $env:ProgramFiles
  $pf86  = ${env:ProgramFiles(x86)}
  $local = $env:LOCALAPPDATA
  foreach ($base in @($pf, $pf86, $local)) {
    if (-not $base) { continue }
    $cands.Add((Join-Path $base 'Microsoft\Edge\Application\msedge.exe'))
    $cands.Add((Join-Path $base 'Google\Chrome\Application\chrome.exe'))
  }

  # Edge 装在 LOCALAPPDATA 下时带版本号子目录；Chrome 同理
  foreach ($base in @($local, $pf, $pf86)) {
    if (-not $base) { continue }
    foreach ($pat in @('Microsoft\Edge\Application\*\msedge.exe', 'Google\Chrome\Application\*\chrome.exe')) {
      try {
        Get-ChildItem -Path (Join-Path $base $pat) -ErrorAction SilentlyContinue |
          Sort-Object FullName -Descending | ForEach-Object { $cands.Add($_.FullName) }
      } catch { }
    }
  }

  foreach ($c in $cands) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  return $null
}

$br = Find-Browser

if (-not $br) {
  Write-Host '没找到 Edge / Chrome —— 改用系统默认浏览器打开（会带地址栏和标题栏）。' -ForegroundColor Yellow
  Write-Host '想有独立窗口：装一个 Microsoft Edge 或 Google Chrome 再双击 启动.cmd 即可。' -ForegroundColor Yellow
  Start-Process -FilePath $app
  exit 0
}

# ---------------- 参数 ----------------
$kiosk     = ($env:XCTERM_KIOSK -eq '1')
$full      = ($env:XCTERM_FULL  -eq '1')
$keepFrame = ($env:XCTERM_FRAME -eq '1')

# 窗口尺寸：按本机屏幕工作区自适应，小屏也不会超出
$winW = 1500; $winH = 1000
try {
  Add-Type -AssemblyName System.Windows.Forms
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $winW = [Math]::Min(1500, [Math]::Max(900,  $wa.Width  - 40))
  $winH = [Math]::Min(1000, [Math]::Max(620,  $wa.Height - 40))
} catch { }

$profileDir = $null
if ($env:XCTERM_PROFILE) {
  $profileDir = $env:XCTERM_PROFILE
} elseif ($env:XCTERM_ISOLATED -eq '1') {
  $profileDir = Join-Path $env:LOCALAPPDATA 'XingceTerm\profile'
}

$flags = @(
  $(if ($kiosk) { "--kiosk=$appUrl" } else { "--app=$appUrl" }),
  $(if ($kiosk -or $full) { '--start-fullscreen' } else { "--window-size=$winW,$winH" }),
  '--allow-file-access-from-files',
  '--no-first-run',
  '--no-default-browser-check',
  # 1.9.0 音乐：启动就随机放一首，没有用户手势也得允许出声
  # （用户 m11719：「每次启动都会随机放里面的歌曲」）
  '--autoplay-policy=no-user-gesture-required',
  '--disable-features=Translate,MSEdgeSidebar'
)
if ($profileDir) {
  if (-not (Test-Path -LiteralPath $profileDir)) { New-Item -ItemType Directory -Force -Path $profileDir | Out-Null }
  $flags += "--user-data-dir=$profileDir"
  # 独立数据目录没登录任何账号，这两条避免「正在同步浏览数据」之类的弹窗
  $flags += '--disable-sync'
  $flags += '--no-service-autorun'
}
if (-not $kiosk -and -not $keepFrame) { $flags += '--force-dark-mode' }
if ($env:XCTERM_DEBUG_PORT) { $flags += "--remote-debugging-port=$($env:XCTERM_DEBUG_PORT)" }
# 探针专用逃生口：XCTERM_EXTRA_FLAGS="--a --b" 追加在最末（同名前缀的开关以它为准）。
# 平时不设这个变量就等于没这回事，不影响真人启动。
if ($env:XCTERM_EXTRA_FLAGS) {
  $flags += @($env:XCTERM_EXTRA_FLAGS -split '\s+' | Where-Object { $_ })
}

Start-Process -FilePath $br -ArgumentList $flags | Out-Null

if ($kiosk) { exit 0 }

# ---------------- 窗口状态复位 ----------------
# 浏览器会记住上次窗口状态，有时会带着「最小化」直接起来 → 先正常显示并拿到前台
Add-Type -Namespace XcTerm -Name Win -MemberDefinition @'
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowW(string cls, string title);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int val, int size);
'@

# 顺手把过去的「去标题栏小助手」停掉（老版本可能还在后台跑）
$pidFile = Join-Path $env:TEMP 'xcterm_frameless.pid'
if (Test-Path -LiteralPath $pidFile) {
  $oldPid = (Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue)
  if ($oldPid -and $oldPid.Trim() -match '^\d+$') { Stop-Process -Id ([int]$oldPid.Trim()) -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

$h = [IntPtr]::Zero
for ($i = 0; $i -lt 40 -and $h -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 250
  $h = [XcTerm.Win]::FindWindowW('Chrome_WidgetWin_1', $title)
}
if ($h -eq [IntPtr]::Zero) {
  Write-Host '已经交给浏览器打开（没抓到应用窗口句柄，可能启动较慢，稍等一下就好）。' -ForegroundColor DarkGray
  exit 0
}

if ([XcTerm.Win]::IsIconic($h)) { [XcTerm.Win]::ShowWindow($h, 9) | Out-Null }   # SW_RESTORE
[XcTerm.Win]::SetForegroundWindow($h) | Out-Null
$round = 2
[XcTerm.Win]::DwmSetWindowAttribute($h, 33, [ref]$round, 4) | Out-Null   # 圆角

if ($keepFrame) {
  Write-Host '已启动（保留浏览器默认标题栏）。' -ForegroundColor DarkGray
} else {
  Write-Host '已启动：标题栏已调成深色融进皮肤。想完全去掉那条栏，按 F11 或点顶栏 ⛶ 全屏。' -ForegroundColor DarkGray
}
exit 0
