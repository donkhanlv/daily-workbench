#!/bin/bash
# 一键启动「浏览器预览版」（无需 Rust，AI 不可用、通知回退为页面内 toast）
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装：https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[1/2] 首次运行，正在安装前端依赖..."
  npm install
else
  echo "[1/2] 依赖已存在，跳过安装"
fi

echo "[2/2] 启动浏览器预览版（默认 http://localhost:5173）..."
npm run dev:web &
VITE_PID=$!
sleep 4
( command -v xdg-open >/dev/null && xdg-open http://localhost:1420 ) \
  || ( command -v open >/dev/null && open http://localhost:1420 ) \
  || echo "请手动打开浏览器访问 http://localhost:1420"
wait $VITE_PID
