const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

class CursorAuth {
  constructor(context) {
    this.context = context;
    this.cachedSession = null;
    this.windowsMasterKey = null;
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
   * Decrypt Electron safeStorage encrypted tokens (e.g. cursor-safe-storage:v1:...)
   */
  decryptSafeStorage(val) {
    if (!val || typeof val !== 'string' || !val.startsWith('cursor-safe-storage:v1:')) {
      return val;
    }

    try {
      const platform = os.platform();
      if (platform === 'win32') {
        let masterKey = this.windowsMasterKey;
        if (!masterKey) {
          const localStatePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'Local State');
          if (fs.existsSync(localStatePath)) {
            const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf-8'));
            const encKeyB64 = localState?.os_crypt?.encrypted_key;
            if (encKeyB64) {
              const psCmd = `Add-Type -AssemblyName System.Security; $b = [Convert]::FromBase64String('${encKeyB64}'); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b[5..($b.Length-1)], $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))`;
              const outB64 = execSync(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 4000, encoding: 'utf-8' }).trim();
              if (outB64) {
                masterKey = Buffer.from(outB64, 'base64');
                this.windowsMasterKey = masterKey;
              }
            }
          }
        }

        if (masterKey) {
          const rawB64 = val.slice('cursor-safe-storage:v1:'.length);
          const buf = Buffer.from(rawB64, 'base64');
          // 'v10' (3 bytes) + nonce (12 bytes) + ciphertext + tag (16 bytes)
          const nonce = buf.subarray(3, 15);
          const ciphertext = buf.subarray(15, buf.length - 16);
          const tag = buf.subarray(buf.length - 16);

          const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, nonce);
          decipher.setAuthTag(tag);
          const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
          if (decrypted && decrypted.includes('.')) {
            return decrypted;
          }
        }
      }
    } catch (e) {
      console.warn('[CursorAuth] Failed to decrypt safe-storage token:', e.message);
    }

    return val;
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
          return this.decryptSafeStorage(manual.trim());
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
        return this.decryptSafeStorage(row.value);
      }
    } catch (e) {
      // node:sqlite not available or failed
    }

    // Engine 2: Python 3 with sqlite3 (standard, handles gigabyte databases instantly in 5ms)
    try {
      const script = `import sqlite3, os; conn = sqlite3.connect('file:' + os.path.expandvars(r'${dbPath.replace(/\\/g, '\\\\')}') + '?mode=ro', uri=True); cur = conn.cursor(); cur.execute("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'"); r = cur.fetchone(); conn.close(); print(r[0] if r else '')`;
      const out = execSync(`python -c "${script}"`, { timeout: 4000, encoding: 'utf-8' }).trim();
      if (out) {
        return this.decryptSafeStorage(out);
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
        return this.decryptSafeStorage(out);
      }
    } catch (e) {
      // sqlite3 cli failed
    }

    return null;
  }

  /**
   * Decode JWT payload and extract userId, with database fallback
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
          // sub format: `google-oauth2|user_xxxx...` or `auth0|user_xxxx...` or `user_xxxx...`
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

    // Fallback: check state.vscdb for stripeMembershipAuthId or cachedScopedProfile
    const dbPath = this.getDatabasePath();
    if (fs.existsSync(dbPath)) {
      try {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const row = db.prepare("SELECT value FROM ItemTable WHERE key IN ('cursorAuth/stripeMembershipAuthId', 'cursorAuth/cachedScopedProfile') AND value LIKE '%user_%' LIMIT 1").get();
        db.close();
        if (row && row.value) {
          const match = row.value.match(/user_[A-Za-z0-9]+/);
          if (match) {
            return match[0];
          }
        }
      } catch (e) {}
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
