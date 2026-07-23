# 日常工作台 (Daily Workbench)

基于 **Tauri 2.x + 原生 Vanilla JS** 的本地优先（local-first）桌面应用，用于记录与沉淀日常工作与生活的点滴：待办、日程、灵感、备忘录、日记、复盘、学习、健康、收支、心情、习惯、番茄钟、周报等。

数据全部存于本地，**可脱机使用、可导出/导入备份**，并可作为后续接入 AI 智能总结的底层数据与知识库。

---

## ✨ 功能概览

- **多模块记录**：待办 / 日程 / 灵感 / 备忘录 / 日记 / 复盘 / 学习 / 爱好 / 健康 / 收支 / 心情 / 习惯 / 番茄钟 / 周报
- **检索与筛选**：后端 SQL 分页检索 + 前端虚拟滚动；支持关键词、模块、分类、日期范围过滤
- **日历回溯**：按日期检索当天全部记录
- **知识库上下文**：可将历史记录作为 AI 回答的底层数据与知识库（`get_knowledge_context`）
- **🤖 AI 智能能力（设置中配置）**：在「设置 → AI 配置」选择 Provider 并填入 API Key / 模型即可启用；支持 **OpenAI / DeepSeek（兼容 OpenAI 接口）/ Ollama（本地模型，隐私优先）**。密钥仅存于本机 `plugin-store`（`settings.json`），不上传、不入库。配置后可点「测试连接」即时验证
  - 每日总结 `generate_daily_summary`、心情洞察 `generate_mood_insight`、灵感智能打标 `suggest_idea_tags`、AI 对话 `ai_chat`
  - *说明：AI 命令走 Rust 后端，属桌面端能力；浏览器回退模式不实现 AI 调用*
- **🔔 桌面通知（本地提醒）**：在「设置 → 桌面通知」开启后，番茄钟结束、应用启动概览（待办 / 逾期 / 今日日程 / 未打卡习惯）会通过系统通知提醒。桌面端走 Tauri `notification` 插件，浏览器回退为应用内 toast
- **📎 截图 / 图片附件上传**：
  - 在 10 个录入弹窗（待办 / 日程 / 灵感 / 备忘录 / 爱好 / 复盘 / 学习 / 学习进度 / 健康 / 收支）与 2 个常驻表单（日记 / 心情）中均可上传多张截图
  - 列表卡片右上角显示 `📎N` 角标，点击可在弹窗中查看大图、删除附件
  - **拖拽放置 + 全局粘贴上传**：把图片拖到附件区的「拖拽区」，或在弹窗内直接 `Ctrl+V` 粘贴截图即可暂存，确认时一并落库
  - **截图自动压缩**：上传前用 canvas 缩放至最长边 ≤1280px、JPEG quality 0.7，显著降低体积；压缩失败自动回退原图
  - **持久化升级（突破 localStorage 上限）**：浏览器侧附件改用 **IndexedDB** 存储（localStorage 回退），单键不再受 ~5MB 限制，可存更多/更大图片；旧 localStorage 附件数据在首次启动自动迁移
  - 附件持久化按平台区分：桌面端随 SQLite 备份一并导出/导入；浏览器端存于 IndexedDB（首次启动自动迁移旧 localStorage 附件数据），刷新/重开不丢失。*注意：浏览器侧 JSON 导出当前不含附件，与既有 LocalBackend 设计一致*
  - 附件以 dataURL 形式存储（浏览器侧 IndexedDB 键 `dw_attachments`；桌面侧 SQLite `attachments` 表，字段：`id / module / record_id / name / data / created_at`）
- **本地可迁移**：导出为 JSON 备份；导入还原（含 attachments 表）

---

## 🚀 运行与构建

### 环境要求
- Node.js 18+
- Rust 工具链（`cargo` + `rustc`）——用于构建 Tauri 桌面壳
- 目标平台 WebView 依赖（Windows/macOS/Linux 按 Tauri 官方文档安装系统库）

### 开发模式
```bash
npm install            # 安装前端依赖
npx vite              # 前端开发服务器（浏览器预览，走 LocalBackend 回退）
cargo tauri dev       # 启动桌面应用（含 Rust 后端 + WebView）
```

### 生产构建
```bash
cargo tauri build     # 产出各平台安装包（自动构建前端并嵌入）
```

### 一键启动 / 打包脚本（推荐，免手敲命令）
项目根目录已内置开箱即用脚本：

| 脚本 | 平台 | 作用 |
|------|------|------|
| `start.bat` | Windows | **双击**即启动浏览器预览版（无需 Rust；AI 不可用、通知回退为页面内 toast） |
| `start.sh`  | Linux/macOS | 同上，终端执行 `./start.sh` |
| `build.bat` | Windows | **一键**检测/安装 Rust、构建出真正的桌面 `.exe`（产物在 `src-tauri/target/release/bundle/`）。**前置**：本机需装 Node.js + Visual Studio 生成工具(MSVC+Windows SDK) + WebView2 |
| `.github/workflows/build-windows.yml` | 云端 | 推送到 GitHub 后**自动**构建 Windows `.exe` 并作为 Artifact 下载（本机无需装 Rust） |

> 说明：浏览器预览版地址为 `http://localhost:1420`（由 `vite.config.js` 的 `server.port` 决定）。
> 本交付运行环境为 Linux 且无 Rust 工具链，**无法在此直接编译 Windows `.exe`**；请在 Windows 本机运行 `build.bat`，或走 GitHub Actions 云端构建获取 `.exe`。

### 数据层
- 桌面端：`src-tauri/` 内 Rust + SQLite，命令已注册（含 `list_attachments` / `save_attachment` / `delete_attachment`）
- 浏览器回退：`src/scripts/api.js` 的 `LocalBackend`，附件存储基于 **IndexedDB**（localStorage 回退），其余接口与 Rust 端一致

---

## 🧪 测试

Node 冒烟测试（验证数据层逻辑，无需 Tauri）：
```bash
node test_attachment.cjs     # 附件 list/save/delete 三分支 + 模块隔离
node test_local_backend.cjs  # 基础数据层（增删改查、统计、周报）
node test_search.cjs         # SQL 分页检索 + 知识库上下文
node test_backup.cjs         # 导出/导入（含设置与多表还原）
```

> 前端已通过 `npx vite build` 验证（含附件交互层）。Rust 端需在本地具备 `cargo` 环境时运行 `cargo tauri build` 验证（本交付包生成环境无 cargo，未做 Rust 编译验证）。

---

## 📦 交付说明

本目录为项目源码（已排除 `node_modules` 与 Rust 构建产物 `src-tauri/target`）。首次运行请先 `npm install`，再用 `cargo tauri dev` / `cargo tauri build` 启动。
