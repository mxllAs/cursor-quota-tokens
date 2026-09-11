# Cursor 配额与 Token 监控 (Cursor Quota & Tokens Tracker)

<p align="center">
  <img src="images/icon.png" width="128" height="128" alt="Cursor Quota Logo" />
</p>

<p align="center">
  <strong>实时监控 Cursor 快速请求配额、重置倒计时、Grok/思维模型周额度以及分模型 Token 消耗（支持 GitHub 风格活跃度热力图）。</strong>
</p>

---

## ✨ 核心特性

- **⚡ 0 配置全自动探测**：
  - 无需手动登录或配置 Cookie，自动快速读取本地 Cursor 存储凭据（`state.vscdb`），秒级完成认证。
- **📈 快速请求与配额监控**：
  - 环形 SVG 动态刻度盘，直观展示 Pro/Business 计划的快速请求已用量、剩余量及使用百分比，余量低时自适应变色预警。
- **⏳ 账单周期与重置倒计时**：
  - 实时计算距离月度额度刷新还剩多少天，清晰标明本期起始与重置日期。
- **🤖 每周额外配额 (Grok / 思维模型)**：
  - 追踪高阶思维模型的周额度消耗进度条与每周自动刷新节点。
- **📊 细粒度 Token 消耗统计**：
  - 实时统计今日及本月：**输入 Token**、**输出 Token**、**缓存读取 (Cache Read)** 与 **美元估算成本**。
- **🍩 模型用量占比分布**：
  - 动态 SVG 甜甜圈环形图与图例，精确展示 Claude 3.5 Sonnet、Claude 3.7、GPT-4o、Composer 等各模型的调用比例与 Token 消耗。
- **🟩 GitHub 风格活跃度热力图**：
  - 过去 90 天每日 Coding 活跃度热力格，悬浮 Tooltip 即可查看当日调用次数、Token 总量与费用。
- **📋 近期 Prompt 调用明细**：
  - 详细罗列最近 30 次 Prompt 请求的具体时间、使用模型、生成 Token、缓存读取与预估成本。
- **📌 底部状态栏轻量常驻**：
  - 在 Cursor 底部状态栏常驻显示余量（如 `⚡ 0/2000 | 61.2M tok`），悬停可查看全景信息卡片，点击一键展开完整大盘。

---

## 🚀 安装指南

### 方式一：VSIX 安装包（推荐）
1. 从 `releases/` 目录获取最新 `cursor-quota-tokens-1.0.1.vsix`；
2. 打开 Cursor IDE（或 VS Code）；
3. 按下快捷键 `Ctrl+Shift+P`（Mac 为 `Cmd+Shift+P`），输入并执行：
   ```
   Extensions: Install from VSIX...
   ```
4. 选择 `.vsix` 文件即可完成安装。

### 方式二：命令行安装
```bash
cursor --install-extension releases/cursor-quota-tokens-1.0.1.vsix --force
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

| 命令 | 名称 |
| :--- | :--- |
| `cursorQuota.refresh` | 刷新 Cursor 额度与 Token |
| `cursorQuota.openDashboard` | 打开 Cursor 用量大盘 |
| `cursorQuota.setToken` | 手动设置 Cursor 会话令牌 (可选覆盖) |
| `cursorQuota.clearToken` | 清除已保存的会话令牌 (恢复自动检测) |

---

## 🔒 隐私与安全性保障

- **纯本地运行**：本插件所有数据均通过本地网络直接请求 Cursor 官方后台接口（`https://cursor.com/api`），复用本地官方登录凭据；
- **零中转服务器**：插件不含任何第三方遥测、不上传任何代码、不向任何中间代理服务器发送凭据。

---

## 📄 开源许可

MIT License © weiyi
