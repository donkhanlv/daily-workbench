# ============================================================
# Daily Workbench - 桌面模式一键环境安装脚本 (Windows)
# 作用：安装 Node、Rust(toolchain)、Tauri 系统依赖，并 npm install
# 用法（PowerShell，建议以管理员身份运行）：
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup-desktop.ps1
# 之后：npm run build / npm run dev
# ============================================================
$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "[setup] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ok] $m"    -ForegroundColor Green }
function Warn($m) { Write-Host "[warn] $m"  -ForegroundColor Yellow }

function Need-Cmd($name) { return (Get-Command $name -ErrorAction SilentlyContinue) -ne $null }

# ---------- 1. 安装 Node.js ----------
if (Need-Cmd node -and (Need-Cmd npm)) {
  Ok "Node.js 已安装: $(node -v) (npm $(npm -v))"
} else {
  Warn "未检测到 Node.js，尝试通过 winget 安装…"
  if (Need-Cmd winget) {
    winget install --id OpenJS.NodeJS.LTS -e --source winget
  } elseif (Need-Cmd choco) {
    choco install nodejs-lts -y
  } else {
    Write-Error "未找到 winget 或 choco，请手动安装 Node.js LTS：https://nodejs.org"
    exit 1
  }
  # 刷新 PATH 以便后续脚本可用
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  Ok "Node.js 安装完成"
}

# ---------- 2. 安装 Rust (rustup) ----------
if (Need-Cmd cargo) {
  Ok "Rust 工具链已安装: $(rustc --version)"
} else {
  Warn "未检测到 Rust，开始安装 (rustup)…"
  if (Need-Cmd winget) {
    winget install --id Rustlang.Rustup -e --source winget
  } else {
    # 官方安装器
    $tmp = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest -Uri "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe" -OutFile $tmp
    Start-Process -FilePath $tmp -ArgumentList "-y","--default-toolchain","stable" -Wait
  }
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  Ok "Rust 安装完成"
}

# ---------- 3. Tauri 系统依赖 ----------
Warn "Windows 需安装 Microsoft C++ 生成工具 (Visual Studio Build Tools)。"
Warn "请确认已安装：vswhere / 'Desktop development with C++' 工作负载。"
Warn "可访问 https://visualstudio.microsoft.com/zh-hans/downloads/ 安装生成工具。"
Warn "WebView2 运行时通常已随 Windows 预装；若缺失请安装：winget install Microsoft.WebView2"

# ---------- 4. npm install ----------
if (Test-Path package.json) {
  Info "执行 npm install…"
  npm install
  Ok "npm install 完成"
} else {
  Write-Error "当前目录未找到 package.json，请在项目根目录运行此脚本。"
  exit 1
}

Write-Host ""
Write-Host "🎉 桌面模式环境已就绪！" -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "  构建桌面安装包:  npm run build"
Write-Host "  开发调试:        npm run dev"
Write-Host "  纯网页预览:      npm run build:web"
