# Cursor Quota & Tokens Tracker (Cursor 配额与 Token 监控)

<p align="center">
  <img src="images/icon.png" width="128" height="128" alt="Cursor Quota Logo" />
</p>

<p align="center">
  <strong>实时监控 Cursor 快速请求配额、重置倒计时、Grok/思维模型周额度以及分模型 Token 消耗（支持 GitHub 风格活跃度热力图）。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

---

## ✨ 核心特性

- **⚡ 0 配置全自动凭据探测**：
  - 无需手动登录或繁琐复制 Cookie，智能穿透本地 SQLite 存储（`state.vscdb`），秒级完成官方凭据解析认证，跨平台支持 Windows、macOS 与 Linux。
- **👑 智能会员身份识别**：
  - 自动识别并展示当前账号计划（**Free 免费版**、**Pro**、**Pro+**、**Business**、**Enterprise**），自适应深浅色主题高对比度徽章。
- **📈 1:1 官方双配额池监控**：
  - **Cursor Models**（含 Composer、Agent、Grok 等）与 **Other Models**（Claude 3.5/3.7、GPT-4o 等）双进度条独立展示；
  - 超额未开按量付费时自适应呈现慢速队列（Slow Queue 🐢）预警，额度充足时呈现高速通道（Fast Mode ⚡）。
- **⏳ 账单周期与重置倒计时**：
  - 实时计算距离月度额度刷新还剩多少天，清晰标明本期起始与重置日期。
- **🤖 每周专项配额 (Grok / 思维模型)**：
  - 实时追踪高阶思维模型的周额度消耗百分比与每周自动刷新节点。
- **📊 细粒度 Token 消耗统计**：
  - 实时统计今日及本月：**输入 Token**、**提示词缓存读取 (Prompt Cache)**、**生成输出 Token** 与 **美元估算成本**；
  - 贴合中文习惯的“万 / 亿”单位展示，直观掌握上下文缓存命中率。
- **🍩 模型用量占比分布**：
  - 动态展示 Claude 3.5/3.7 Sonnet、GPT-4o、o1/o3-mini、Cursor Small 等各模型的调用比例与 Token 消耗。
- **🟩 GitHub 风格活跃度热力图**：
  - 过去 90 天每日 Coding 活跃度热力格，鼠标悬浮 Tooltip 即可查看当日调用频次、Token 总量与算力成本。
- **📋 近期 Prompt 调用明细**：
  - 详细罗列最近 30 次 Prompt 请求的具体时间、使用模型、三段 Token 分布与预估成本。
- **📌 底部状态栏轻量常驻**：
  - 在 Cursor 底部状态栏常驻显示余量（如 `⚡ 0/2000 | 61.2M tok`），支持 4 种格式切换；悬停可查看全景信息卡片，点击一键展开大盘。

---

## 🚀 安装指南

### 方式一：VS Code / Cursor 插件市场一键安装（推荐）
1. 在 Cursor 或 VS Code 扩展面板中搜索：
   ```
   Cursor Quota & Tokens Tracker
   ```
2. 点击 **Install** 即可开始使用。

### 方式二：VSIX 安装包本地安装
1. 从 GitHub [Releases](https://github.com/mxllAs/cursor-quota-tokens/releases) 页面获取最新 `.vsix` 文件（如 `cursor-quota-tokens-1.0.10.vsix`）；
2. 打开 Cursor IDE（或 VS Code）；
3. 按下快捷键 `Ctrl+Shift+P`（macOS 为 `Cmd+Shift+P`），输入并执行：
   ```
   Extensions: Install from VSIX...
   ```
4. 选择下载好的 `.vsix` 文件完成安装。

### 方式三：命令行安装
```bash
cursor --install-extension releases/cursor-quota-tokens-1.0.10.vsix --force
```

---

## ⚙️ 个性化配置

在 Cursor 设置中搜索 `cursorQuota` 即可自由调整：

| 配置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `cursorQuota.refreshInterval` | `10` | 自动刷新频率（单位：分钟，范围 1–120）。 |
| `cursorQuota.statusBarFormat` | `"requests_and_tokens"` | 状态栏显示格式：`requests_and_tokens`（请求+Token）、`requests_only`（仅请求）、`percent_only`（仅百分比）、`tokens_only`（仅Token）。 |
| `cursorQuota.lowQuotaThreshold` | `15` | 配额余量警告阈值百分比（低于该值时状态栏提示预警）。 |

---

## ⌨️ 快捷命令

| 命令 ID | 命令名称 | 说明 |
| :--- | :--- | :--- |
| `cursorQuota.refresh` | 刷新 Cursor 额度与 Token | 手动即时拉取官方最新数据并刷新视图 |
| `cursorQuota.openDashboard` | 打开 Cursor 用量大盘 | 在主编辑区以独立全尺寸标签页打开用量大盘 |
| `cursorQuota.setToken` | 手动设置 Cursor 会话令牌 | 支持手动粘贴 Session Token 或 JWT（覆盖本地自动检测） |
| `cursorQuota.clearToken` | 清除已保存的会话令牌 | 清除手动配置，恢复为自动检测本地凭据 |

---

## 🔒 隐私与安全性保障

- **纯本地运行**：本插件所有数据均通过本地网络直接请求 Cursor 官方后台接口（`https://cursor.com/api`），复用本地官方登录凭据；
- **零中转服务器**：插件不含任何第三方遥测上报、不收集上传任何代码、不向任何非官方服务器发送凭据；
- **零外部依赖**：基于 Node 原生模块构建，发布包体积不足 36 KB，安全轻盈。

---

## 📄 开源许可

[MIT License](LICENSE) © [isArray](https://github.com/mxllAs)
