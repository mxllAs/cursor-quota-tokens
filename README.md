# Cursor Quota & Token Monitor

<p align="center">
  <img src="images/icon.png" width="128" height="128" alt="Cursor Quota Logo" />
</p>

<p align="center">
  <strong>Real-time monitor for Cursor fast requests, reset countdown, Grok/Sand weekly quota, and detailed token consumption (featuring a GitHub-style 90-day activity heatmap).</strong>
</p>

<p align="center">
  <a href="https://github.com/mxllAs/cursor-quota-tokens/releases"><img src="https://img.shields.io/github/v/release/mxllAs/cursor-quota-tokens?color=38bdf8&label=Release" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/Platform-Cursor%20%7C%20VS%20Code-purple.svg" alt="Platform">
</p>

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">简体中文</a>
</p>

---

## ✨ Features

- **⚡ Zero-Config Auto-Authentication**:
  - Automatically locates and extracts Cursor credentials from local SQLite storage (`state.vscdb`) across Windows, macOS, and Linux. No manual cookie copying or login required.
- **👑 Smart Membership Plan Detection**:
  - Intelligently recognizes and displays your subscription plan (**Free**, **Hobby**, **Pro**, **Pro+**, **Business**, **Enterprise**) with adaptive high-contrast badges for both light and dark themes.
- **📈 1:1 Official Quota Pools (Included in Plan)**:
  - Separate progress bars for **Cursor Models** (Composer, Agent, Grok, etc.) and **Other Models** (Claude 3.5/3.7 Sonnet, GPT-4o, etc.).
  - Automatically indicates **Fast Mode** (⚡) or **Slow Queue** (🐢) when standard fast quotas are consumed and On-Demand pricing is inactive.
- **⏳ Billing Cycle & Reset Countdown**:
  - Real-time countdown of remaining days until your monthly quota reset, clearly displaying cycle start and end dates.
- **🤖 Weekly Reasoning Quota (Grok / Sand)**:
  - Tracks weekly quota consumption percentage and weekly reset schedules for advanced reasoning models.
- **📊 Granular Token Analytics & Cache Rates**:
  - Tracks today's and monthly usage: **Input Tokens**, **Prompt Cache Read Tokens**, **Output Tokens**, and **Estimated Dollar Value ($)**.
  - Visualizes Prompt Cache hit ratio and segmented proportion bar.
- **🍩 Model Usage Breakdown**:
  - Real-time distribution breakdown for Claude 3.5/3.7 Sonnet, GPT-4o, o1, o3-mini, Cursor Small, and Composer agents.
- **🟩 GitHub-Style 90-Day Activity Heatmap**:
  - Color-coded activity cells for the past 90 days. Hover over any date to inspect session count, token volume, and estimated compute cost.
- **📋 Recent Prompt Request History**:
  - Detailed logs of the last 30 requests: timestamp, model name, token metrics (Input / Output / Cache), and cost.
- **📌 Lightweight Status Bar Indicator**:
  - Persistent status bar item with customizable display modes (e.g. `⚡ 0/2000 | 61.2M tok`), low-quota warning alerts, and a rich hover preview card.

---

## 🚀 Installation

### Option 1: One-Click from VS Code / Cursor Marketplace (Recommended)
1. Open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`);
2. Search for:
   ```
   Cursor Quota & Token Monitor
   ```
3. Click **Install**.

### Option 2: Install from VSIX
1. Download the latest `.vsix` file from [GitHub Releases](https://github.com/mxllAs/cursor-quota-tokens/releases) (e.g. `cursor-quota-tokens-1.0.10.vsix`);
2. In Cursor or VS Code, press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS);
3. Type and run:
   ```
   Extensions: Install from VSIX...
   ```
4. Select the downloaded `.vsix` file.

### Option 3: Command Line
```bash
cursor --install-extension releases/cursor-quota-tokens-1.0.10.vsix --force
```

---

## ⚙️ Configuration

Search for `cursorQuota` in your Cursor / VS Code Settings:

| Setting Key | Default | Description |
| :--- | :--- | :--- |
| `cursorQuota.refreshInterval` | `10` | Automatic background refresh interval in minutes (1–120). |
| `cursorQuota.statusBarFormat` | `"requests_and_tokens"` | Status bar format: `requests_and_tokens`, `requests_only`, `percent_only`, or `tokens_only`. |
| `cursorQuota.lowQuotaThreshold` | `15` | Low quota percentage warning threshold (status bar turns yellow/red below this). |

---

## ⌨️ Commands

| Command | Title | Description |
| :--- | :--- | :--- |
| `cursorQuota.refresh` | Refresh Cursor Quota & Tokens | Immediately fetch latest data from official API and update all views |
| `cursorQuota.openDashboard` | Open Cursor Usage Dashboard | Opens the full-width usage dashboard in a separate editor tab |
| `cursorQuota.setToken` | Set Cursor Session Token Manually | Paste WorkosCursorSessionToken or JWT (overrides auto-detection) |
| `cursorQuota.clearToken` | Clear Custom Session Token | Clears custom credentials and restores local auto-detection |

---

## 🔒 Privacy & Security

- **100% Local Execution**: All requests are dispatched directly from your local machine to official Cursor API endpoints (`https://cursor.com/api`) using your local credentials.
- **Zero Third-Party Proxies / Telemetry**: No tracking, no external proxy servers, and no telemetry services. Your code and credentials never leave your local environment.
- **Zero External Runtime Dependencies**: Built entirely on native Node.js APIs, keeping the extension bundle ultra-lightweight (< 36 KB).

---

## 📄 License

[MIT License](LICENSE) © [isArray](https://github.com/mxllAs)
