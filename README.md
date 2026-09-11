# Cursor Quota & Tokens Tracker

<p align="center">
  <img src="images/icon.png" width="128" height="128" alt="Cursor Quota Logo" />
</p>

<p align="center">
  <strong>Real-time tracking of Cursor fast requests, plan quota, Grok/Sand weekly allowance, reset countdown, and detailed token consumption per model with a GitHub-style activity heatmap.</strong>
</p>

---

## ✨ Features

- **⚡ Zero Configuration Auto-Detection**:
  - Automatically reads your local Cursor authentication state (`state.vscdb`) with zero manual setup or login required.
- **📈 Fast Requests & Quota Monitor**:
  - Visual circular gauge displaying fast requests used, remaining, and total plan limits.
- **⏳ Billing Cycle & Reset Countdown**:
  - Live countdown showing exactly how many days remain until your monthly quota resets.
- **🤖 Weekly Allowance (Grok / Thinking Models)**:
  - Tracks weekly bonus/sand quota usage percentage and weekly reset dates.
- **📊 Granular Token Consumption**:
  - Tracks real-time token metrics: **Input Tokens**, **Output Tokens**, **Cache Read Tokens**, and **Estimated USD Cost**.
- **🍩 Model Usage Breakdown**:
  - Dynamic interactive SVG donut chart displaying percentage share across models (Claude 3.5 Sonnet, Claude 3.7, GPT-4o, Cursor Agent, etc.).
- **🟩 GitHub-Style Activity Heatmap**:
  - Visual calendar grid showing your daily AI coding activity and token volume over the past 90 days with hover tooltips.
- **📋 Live Recent Activity Table**:
  - Inspect the last 30 requests with exact timestamps, model name, tokens, cache reads, and estimated cost.
- **📌 Status Bar Integration**:
  - Lightweight status bar item showing quota remaining & tokens at a glance with customizable formats and color-coded threshold alerts.

---

## 🚀 Installation

### Option 1: Install from VSIX
1. Download the latest `.vsix` release package.
2. Open Cursor IDE or VS Code.
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and run:
   ```
   Extensions: Install from VSIX...
   ```
4. Select `cursor-quota-tokens-1.0.0.vsix`.

### Option 2: Command Line
```bash
cursor --install-extension releases/cursor-quota-tokens-1.0.0.vsix
```

---

## ⚙️ Configuration

In your Cursor / VS Code `settings.json`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `cursorQuota.refreshInterval` | `10` | Auto-refresh interval in minutes (1–120). |
| `cursorQuota.statusBarFormat` | `"requests_and_tokens"` | Format for status bar: `requests_and_tokens`, `requests_only`, `percent_only`, or `tokens_only`. |
| `cursorQuota.lowQuotaThreshold` | `15` | Percentage threshold to trigger warning color in the status bar. |

---

## ⌨️ Commands

| Command | Title |
| :--- | :--- |
| `cursorQuota.refresh` | Refresh Cursor Quota & Tokens |
| `cursorQuota.openDashboard` | Open Cursor Usage Dashboard |
| `cursorQuota.setToken` | Set Cursor Session Token Manually (Optional Override) |
| `cursorQuota.clearToken` | Clear Stored Cursor Token (Restore Auto-detect) |

---

## 🔒 Privacy & Security

- **Local Only**: All data is fetched directly from Cursor's official dashboard API (`https://cursor.com/api`) using your local session token.
- **No Third-Party Servers**: No telemetry or credentials are sent to any external or third-party servers.

---

## 📄 License

MIT © weiyi
