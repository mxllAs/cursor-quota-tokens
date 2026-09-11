# Security policy

## What this extension does

**Local**

- Reads Cursor’s SQLite database at:
  - **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
  - **Windows**: `%APPDATA%\Cursor\User\globalStorage\state.vscdb`
  - **Linux**: `~/.config/Cursor/User/globalStorage/state.vscdb`
- Extracts the value stored under the key `cursorAuth/accessToken` (session token) by opening the file with **sql.js** (SQLite in WebAssembly) inside the extension process—no external `sqlite3` binary.
- The token is kept **in memory** inside the extension host process for the purpose of API calls described below. It is **not** written to project files or logs by this extension (beyond normal VS Code / OS diagnostics you should assume may exist).

**Network**

- Sends HTTPS requests to Cursor-controlled hosts (see `src/extension.ts`), including usage endpoints and opening the dashboard in the browser when you run the command or click the status bar item.
- Requests use headers consistent with what the Cursor web app expects (e.g. session cookie derived from the token).

## Threat model (short)

- Anyone with access to your machine and user account can already read the same database; this extension does not strengthen or weaken OS-level access control.
- **Malware or compromised extensions** are a general risk—only install from sources you trust.

## Reporting security issues

If you believe you have found a **security vulnerability in this extension’s code** (not in Cursor itself), please:

1. **Do not** open a public issue with exploit details.
2. Open a **private** security advisory on this GitHub repository (if GitHub Security Advisories are enabled), or contact the maintainers through a channel they publish in the repo.

For vulnerabilities in **Cursor** or its services, report through [Cursor](https://cursor.com/)’s official channels, not this project.

## Disclaimer

This extension relies on **undocumented** storage keys and HTTP routes. Cursor may change them without notice. See [POLICY.md](POLICY.md) for publishing and terms-of-use considerations.
