const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class CursorAuth {
  constructor(context) {
    this.context = context;
    this.cachedSession = null;
  }

  /**
   * Resolve Cursor's global storage state.vscdb path
   */
  getDatabasePath() {
    const platform = os.platform();
    const home = os.homedir();

    let dbPath = '';
    if (platform === 'win32') {
      dbPath = path.join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    } else if (platform === 'darwin') {
      dbPath = path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    } else {
      dbPath = path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    }

    if (fs.existsSync(dbPath)) {
      return dbPath;
    }

    // Fallback: check if standard VS Code storage path has cursorAuth keys
    let altPath = '';
    if (platform === 'win32') {
      altPath = path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'state.vscdb');
    } else if (platform === 'darwin') {
      altPath = path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'state.vscdb');
    } else {
      altPath = path.join(home, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb');
    }

    return fs.existsSync(altPath) ? altPath : dbPath;
  }

  /**
   * Read raw accessToken from state.vscdb using multi-engine fallback
   */
  async getRawToken() {
    // 1. Check SecretStorage first (manual override)
    if (this.context && this.context.secrets) {
      try {
        const manual = await this.context.secrets.get('cursor_session_token');
        if (manual && manual.trim()) {
          return manual.trim();
        }
      } catch (e) {
        // ignore
      }
    }

    const dbPath = this.getDatabasePath();
    if (!fs.existsSync(dbPath)) {
      return null;
    }

    // Engine 1: node:sqlite (native Node 22+, synchronous, fast)
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'").get();
      db.close();
      if (row && row.value) {
        return row.value;
      }
    } catch (e) {
      // node:sqlite not available or failed
    }

    // Engine 2: Python 3 with sqlite3 (standard, handles gigabyte databases instantly in 5ms)
    try {
      const script = `import sqlite3, os; conn = sqlite3.connect('file:' + os.path.expandvars(r'${dbPath.replace(/\\/g, '\\\\')}') + '?mode=ro', uri=True); cur = conn.cursor(); cur.execute("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'"); r = cur.fetchone(); conn.close(); print(r[0] if r else '')`;
      const out = execSync(`python -c "${script}"`, { timeout: 4000, encoding: 'utf-8' }).trim();
      if (out) {
        return out;
      }
    } catch (e) {
      // Python not available
    }

    // Engine 3: sqlite3 command line
    try {
      const out = execSync(`sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken';"`, {
        timeout: 4000,
        encoding: 'utf-8'
      }).trim();
      if (out) {
        return out;
      }
    } catch (e) {
      // sqlite3 cli failed
    }

    return null;
  }

  /**
   * Decode JWT payload and extract userId
   */
  extractUserId(token) {
    if (!token) return null;

    // Check if token is already in format `userId::accessToken` or `userId%3A%3AaccessToken`
    if (token.includes('::')) {
      return token.split('::')[0];
    }
    if (token.includes('%3A%3A')) {
      return token.split('%3A%3A')[0];
    }

    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) {
          b64 += '=';
        }
        const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
        if (json.sub) {
          // sub format: `google-oauth2|user_01KAJ...` or `auth0|user_01...` or `user_01...`
          const match = json.sub.match(/user_[A-Za-z0-9]+/);
          if (match) {
            return match[0];
          }
          const subParts = json.sub.split('|');
          return subParts[subParts.length - 1];
        }
      }
    } catch (e) {
      console.error('[CursorAuth] Failed to decode JWT payload:', e);
    }
    return null;
  }

  /**
   * Obtain full session credentials
   */
  async getSession() {
    const rawToken = await this.getRawToken();
    if (!rawToken) {
      return null;
    }

    let accessToken = rawToken;
    let userId = null;

    if (rawToken.includes('::') || rawToken.includes('%3A%3A')) {
      const sep = rawToken.includes('%3A%3A') ? '%3A%3A' : '::';
      const parts = rawToken.split(sep);
      userId = parts[0];
      accessToken = parts.slice(1).join(sep);
    } else {
      userId = this.extractUserId(rawToken);
    }

    if (!userId) {
      console.warn('[CursorAuth] Could not extract userId from accessToken');
      return null;
    }

    const cookieValue = `${userId}%3A%3A${accessToken}`;
    const cookieHeader = `WorkosCursorSessionToken=${cookieValue}`;

    this.cachedSession = {
      accessToken,
      userId,
      cookieValue,
      cookieHeader
    };

    return this.cachedSession;
  }
}

module.exports = { CursorAuth };
