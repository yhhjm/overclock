# 超频 打包脚本 —— 打 1.9.x 三件套（安装版 / 自解压版 / 便携版 zip）
#
# ★为什么要有这个脚本（2026-09-30 的教训）：
#   以前打包用 `Get-Process | Where-Object { $_.ProcessName -match '^(超频|便携版|安装版)' } | Stop-Process`
#   —— 按【进程名】匹配，不管装在哪儿。结果用户正在用的正式安装版
#   （D:\新建文件夹\overclock\超频.exe）被一起杀掉，iframe 里 DeepTutor 的流当场断掉，
#   界面上就是「本轮执行中断了」。
#   所以这里改成【按路径】匹配：只杀构建输出目录 dist\ 下的实例（那些本来就要被删），
#   正式安装版只检测、只提示，绝不碰。
#
# 用法：pwsh -File 打包.ps1 [-Version 1.9.27] [-SkipKill]

param(
  [string]$Version = '',
  [switch]$SkipKill
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Say($m, $c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Fail($m) { Write-Host "!! $m" -ForegroundColor Red; exit 1 }

# ── 0. 版本号 ────────────────────────────────────────────────
$pkg = Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $pkg.version }
Say "版本: $Version  (package.json = $($pkg.version))" Cyan

# ── 1. 只杀构建目录下的实例 ──────────────────────────────────
$distDir = Join-Path $Root 'dist'
$installedDirs = @('D:\新建文件夹\overclock')   # 正式安装版，永不碰

if ($SkipKill) {
  Say '[跳过] 未清理构建目录实例（-SkipKill）' Yellow
} else {
  $procs = Get-Process -Name '超频','便携版','安装版' -ErrorAction SilentlyContinue
  if ($procs) {
    foreach ($p in $procs) {
      $path = ''
      try { $path = $p.Path } catch { }
      $inDist = $path -and $path.StartsWith($distDir, [System.StringComparison]::OrdinalIgnoreCase)
      $inInstall = $false
      foreach ($d in $installedDirs) {
        if ($path -and $path.StartsWith($d, [System.StringComparison]::OrdinalIgnoreCase)) { $inInstall = $true }
      }
      if ($inInstall) {
        # ★正式安装版：绝不杀。真要更新它，让用户自己关掉再装。
        Say ("[保留] 正式安装版正在运行，不动它：PID {0}  {1}" -f $p.Id, $path) Green
      } elseif ($inDist) {
        Say ("[停止] 构建目录实例：PID {0}  {1}" -f $p.Id, $path) Yellow
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      } else {
        Say ("[保留] 路径不在构建目录下，不动它：PID {0}  {1}" -f $p.Id, $path) Green
      }
    }
    Start-Sleep -Milliseconds 800
  } else {
    Say '[干净] 没有超频进程在跑' Green
  }
}

# ── 2. 清掉上次产物和 NSIS 临时目录 ──────────────────────────
if (Test-Path $distDir) {
  Say '[清理] 删除 dist\' Yellow
  Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue
}
$tmpLeft = @(Get-ChildItem $env:TEMP -Directory -Filter 'ns*.tmp' -ErrorAction SilentlyContinue)
if ($tmpLeft.Count) {
  Say ("[清理] {0} 个 NSIS 临时目录" -f $tmpLeft.Count) Yellow
  $tmpLeft | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

# ── 3. 走国内镜像（否则 electron 会卡在下载）──────────────────
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

# ── 4. 打包 ──────────────────────────────────────────────────
Say '[打包] npm run dist  (= bundle-sync + electron-builder --win)' Cyan
npm run dist
if ($LASTEXITCODE -ne 0) { Fail "electron-builder 退出码 $LASTEXITCODE" }

# ── 5. 校验包里确实是新代码 ──────────────────────────────────
$packed = Join-Path $distDir 'win-unpacked\resources\app\server.mjs'
if (-not (Test-Path $packed)) { Fail "包里没有 server.mjs: $packed" }
$code = Get-Content $packed -Raw
# 剥掉注释再判，否则会命中我自己写的说明注释（假阳性）
$noComment = $code -replace '(?s)/\*.*?\*/', ' ' -replace '(?m)(^|[^:''"`])//.*$', '$1'
if ($noComment -match 'LOGIN\.alive') { Fail '包里仍是旧的 LOGIN.alive，看门狗修复没进去' }
if ($noComment -notmatch 'LOGIN\.watch\s*&&\s*LOGIN\.watch\.alive') { Fail '包里没找到已修复的看门狗判断' }
Say '[校验] 包内 server.mjs 是新代码' Green

# ── 6. 便携版 exe 改名成自解压版 ─────────────────────────────
$portableExe = Join-Path $distDir "超频-$Version-便携版.exe"
$selfExtract = Join-Path $distDir "超频-$Version-自解压版.exe"
if (Test-Path $portableExe) {
  if (Test-Path $selfExtract) { Remove-Item $selfExtract -Force }   # 先删目标，绝不删源
  Rename-Item $portableExe "超频-$Version-自解压版.exe"
  Say '[改名] 便携版.exe -> 自解压版.exe' Green
} else {
  Say '[跳过] 没有便携版 exe' Yellow
}

# ── 7. win-unpacked 打成便携版 zip ───────────────────────────
$unpacked = Join-Path $distDir 'win-unpacked'
if (Test-Path $unpacked) {
  Push-Location $unpacked
  tar -a -cf "..\超频-$Version-便携版.zip" *
  Pop-Location
  Say '[压缩] 便携版 zip 已生成' Green
}

# ── 8. 凭据扫描 ──────────────────────────────────────────────
Say '[扫描] 凭据（sk-… / cookie）…' Cyan
$hits = 0
$scanFiles = Get-ChildItem $Root -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -notmatch '\\node_modules\\|\\dist\\|\.git\\' -and
    $_.Extension -match '^\.(js|mjs|cjs|json|md|py|html|css)$'
  }
foreach ($f in $scanFiles) {
  $m = Select-String -Path $f.FullName -Pattern 'sk-[A-Za-z0-9]{16,}' -ErrorAction SilentlyContinue
  if ($m) { $hits += $m.Count; Write-Host "  !! $($f.FullName)" -ForegroundColor Red }
}
if ($hits -gt 0) { Fail "凭据扫描发现 $hits 处疑似密钥" }
Say ("[扫描] {0} 个源文件，0 命中" -f $scanFiles.Count) Green

# ── 9. 列产物 ────────────────────────────────────────────────
Say '' ''
Say '=== 产物 ===' Cyan
Get-ChildItem $distDir -File | Select-Object @{n='MB';e={[math]::Round($_.Length/1MB,2)}}, Name | Format-Table -AutoSize
Say "打包完成：$Version" Green
