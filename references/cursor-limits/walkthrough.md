# Cursor Limits Extension Walkthrough

This document outlines the architecture, features, and testing instructions for the Cursor Limits extension we just built.

## What Are We Achieving?

We set out to build a utility for Cursor IDE that replicates the experience of the popular `claude-statusline` VS Code extension. Specifically, we wanted to surface the user's hidden "Pro Limits" (such as Fast Requests and Composer Limits) directly into the bottom status bar of the editor.

Cursor does not provide a public API for this, nor do they expose your remaining usage within the IDE easily without clicking into external dashboards. This extension completely automates parsing those limits and visualizes them natively.

---

## What We Have Done

We built a complete, production-ready VS Code extension specifically tailored for the Cursor environment, focusing on minimizing "user friction." 

### 1. Zero-Friction Authentication (The "Hacker" Way)

Rather than forcing you to dig through DevTools to find your `Workos-Session` token, we automated the extraction process.

- The extension loads **[sql.js](https://github.com/sql-js/sql.js)** (SQLite compiled to WebAssembly) inside the extension host—no `child_process` shell-out and **no dependency on a system `sqlite3` binary**. That matters especially on **Windows**, where `sqlite3` is rarely on `PATH` by default.
- It reads Cursor’s global state SQLite file and selects the `cursorAuth/accessToken` row from `ItemTable`. Typical paths:
  - **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
  - **Windows**: `%APPDATA%\Cursor\User\globalStorage\state.vscdb`
  - **Linux**: `~/.config/Cursor/User/globalStorage/state.vscdb`
- The token is turned into the same `WorkosCursorSessionToken` cookie shape the dashboard uses, then the extension calls Cursor’s usage/plan HTTP APIs (e.g. `https://cursor.com/api/usage-summary`, with a fallback to `https://cursor.com/api/usage`).

### 2. High-Fidelity UI Integrations

We leveraged standard VS Code API endpoints to build a beautiful status item:

- **Visual Progress Bar**: Generates a fast, localized ASCII progress bar (e.g., `[██████░░░░]`) directly in the status text.
- **Dynamic Color Coding**: Uses native `vscode.ThemeColor` integrations. It gracefully shifts from normal foreground to `statusBarItem.warningForeground` (yellow) at 80% usage and `statusBarItem.errorForeground` (red) at 95% usage.
- **Detailed Markdown Tooltip**: Hovering over the status item reveals a formatted Markdown popup showing exactly how many Premium Requests and Composer/Auto requests remain.
- **Click Action**: Directly tied the `statusBarItem.command` to an environment open command that instantly launches `https://cursor.com/dashboard` in your browser.

### 3. Build & Packaging

- Successfully scaffolded all configuration files (`tsconfig.json`, `launch.json`, `tasks.json`, `package.json`).
- Handled all TypeScript typings and native Node.js ES modules.
- Compiled down to JavaScript (including the `sql.js` dependency in `node_modules`) and packaged into a `.vsix` (name includes the version from `package.json`).

---

## How to Test It

After `npm run compile` (and optionally `npm run vsix`), you can run from source or install the packaged extension.

### Method 1: The Dev Host (For fast iteration)

If you want to view or tweak the TypeScript code (`src/extension.ts`):

1. Open this repository folder in Cursor: **File → Open Folder** (e.g. your clone of `cursor-limits`).
2. Press **F5** (or **Run → Start Debugging**).
3. An **Extension Development Host** window opens. The status bar item should appear there once you are signed into Cursor on that machine.

### Method 2: Permanent installation (VSIX)

1. Open the Extensions view (**Ctrl+Shift+X** on Windows/Linux, **Cmd+Shift+X** on macOS).
2. Open the **…** menu on the Extensions view title bar.
3. Choose **Install from VSIX…** and pick the generated `cursor-limits-<version>.vsix` from `npm run vsix`.
4. Reload if prompted; the extension stays enabled across workspaces.

### Windows checklist

- Confirm you are logged into Cursor (token must exist in `state.vscdb`).
- If the DB is extremely large, first load may use more memory because sql.js reads the file into memory; that is a known tradeoff for not requiring a native SQLite binary.

