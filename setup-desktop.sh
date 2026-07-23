#!/usr/bin/env bash
# ============================================================
# Daily Workbench — 桌面模式一键环境安装脚本 (macOS / Linux)
# 作用：安装 Node、Rust(toolchain)、Tauri 系统依赖，并 npm install
# 特点：幂等（已安装则跳过），交互式确认后可自动执行
# 用法：
#   chmod +x setup-desktop.sh
#   ./setup-desktop.sh
# 之后即可：
#   npm run build        # 产出 桌面安装包 (需 Rust 工具链)
#   npm run dev          # 调试模式
# ============================================================
set -euo pipefail

BOLD='\033[1m'; CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; NC='\033[0m'
info()  { echo -e "${CYAN}[setup]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }

OS="$(uname -s)"
info "检测到系统: $OS"

# ---------- 0. 前置：需要包管理器权限 ----------
need_cmd() { command -v "$1" >/dev/null 2>&1; }

# ---------- 1. 安装 Node.js ----------
if need_cmd node && need_cmd npm; then
  ok "Node.js 已安装: $(node -v) (npm $(npm -v))"
else
  warn "未检测到 Node.js，开始安装…"
  case "$OS" in
    Darwin)
      if need_cmd brew; then brew install node; else echo "请先安装 Homebrew: https://brew.sh"; exit 1; fi ;;
    Linux)
      # 优先检测发行版包管理器
      if need_cmd apt-get; then
        sudo apt-get update && sudo apt-get install -y nodejs npm
      elif need_cmd dnf; then
        sudo dnf install -y nodejs npm
      elif need_cmd pacman; then
        sudo pacman -Syu --noconfirm nodejs npm
      else
        warn "未识别的包管理器，尝试用 nvm 安装…"
        curl -fsSL https://fnm.vercel.app/install | bash
        export PATH="$HOME/.fnm:$PATH"; fnm install --lts
      fi ;;
    *) echo "不支持的系统 $OS"; exit 1 ;;
  esac
  ok "Node.js 安装完成: $(node -v)"
fi

# ---------- 2. 安装 Rust (rustup) ----------
if need_cmd cargo; then
  ok "Rust 工具链已安装: $(rustc --version)"
else
  warn "未检测到 Rust，开始安装 (rustup)…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  # shellcheck disable=SC1091
  [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
  ok "Rust 安装完成: $(rustc --version 2>/dev/null || echo '请重新打开终端以加载 cargo')"
fi

# ---------- 3. 安装 Tauri 系统依赖 ----------
info "安装 Tauri 系统依赖…"
case "$OS" in
  Darwin)
    warn "macOS 请确认已安装 Xcode Command Line Tools: xcode-select --install"
    need_cmd xcode-select && xcode-select --install >/dev/null 2>&1 || true ;;
  Linux)
    if need_cmd apt-get; then
      sudo apt-get update
      sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential \
        curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev \
        librsvg2-dev libgtk-3-dev patchelf
    elif need_cmd dnf; then
      sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file \
        gtk3-devel libappindicator-gtk3-devel librsvg2-devel
    elif need_cmd pacman; then
      sudo pacman -Syu --noconfirm webkit2gtk-4.1 base-devel openssl appindicator \
        librsvg gtk3
    else
      warn "未识别的发行版，请参考 Tauri 文档手动安装系统依赖：https://tauri.app/start/prerequisites/"
    fi ;;
  *) warn "跳过系统依赖安装（请参考 Tauri 文档）" ;;
esac
ok "Tauri 系统依赖处理完成"

# ---------- 4. 安装前端依赖 ----------
if [ -f package.json ]; then
  info "执行 npm install…"
  npm install
  ok "npm install 完成"
else
  echo "当前目录未找到 package.json，请在项目根目录运行此脚本。"
  exit 1
fi

echo ""
echo -e "${BOLD}🎉 桌面模式环境已就绪！${NC}"
echo "  构建桌面安装包:  npm run build"
echo "  开发调试:        npm run dev"
echo "  纯网页预览(无需Rust): npm run build:web"
