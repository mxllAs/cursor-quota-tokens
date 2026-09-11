const https = require('https');
const { URL } = require('url');

class CursorApi {
  constructor(auth) {
    this.auth = auth;
    this.baseUrl = 'https://cursor.com/api';
  }

  /**
   * Internal HTTPS request helper
   */
  request(method, endpoint, body = null) {
    return new Promise(async (resolve, reject) => {
      try {
        const session = await this.auth.getSession();
        if (!session) {
          return reject(new Error('Cursor authentication token not found. Please log in to Cursor or configure a session token.'));
        }

        const fullUrl = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        const parsedUrl = new URL(fullUrl);

        const bodyData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: method,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Cookie': session.cookieHeader,
            'Origin': 'https://cursor.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 12000
        };

        if (bodyData && method === 'POST') {
          options.headers['Content-Length'] = Buffer.byteLength(bodyData);
        }

        const req = https.request(options, (res) => {
          let chunks = [];

          res.on('data', (d) => chunks.push(d));

          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const text = buffer.toString('utf-8');

            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const json = JSON.parse(text);
                resolve(json);
              } catch (e) {
                resolve(text);
              }
            } else if (res.statusCode === 401 || res.statusCode === 403) {
              reject(new Error(`Cursor API Unauthorized (HTTP ${res.statusCode}). Session token may be expired.`));
            } else {
              reject(new Error(`Cursor API request failed (HTTP ${res.statusCode}): ${text.slice(0, 300)}`));
            }
          });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Cursor API request timed out'));
        });

        if (bodyData && method === 'POST') {
          req.write(bodyData);
        }
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Fetch user plan quota & billing cycle
   */
  async getUsageSummary() {
    return this.request('GET', '/usage-summary');
  }

  /**
   * Fetch authenticated user profile (name, email, avatar URL)
   */
  async getUserProfile() {
    return this.request('GET', '/auth/me');
  }

  /**
   * Fetch weekly Grok / Sand usage status & countdown
   */
  async getSandUsage() {
    try {
      return await this.request('POST', '/dashboard/get-sand-usage-status', {});
    } catch (e) {
      console.warn('[CursorApi] getSandUsage failed:', e.message);
      return null;
    }
  }

  /**
   * Fetch filtered usage events (tokens per model, timestamps, costs)
   */
  async getFilteredEvents(options = {}) {
    const {
      startDate = null,
      endDate = Date.now(),
      page = 1,
      pageSize = 100
    } = options;

    const payload = {
      teamId: 0,
      page,
      pageSize
    };

    if (startDate) {
      payload.startDate = String(startDate);
    }
    if (endDate) {
      payload.endDate = String(endDate);
    }

    return this.request('POST', '/dashboard/get-filtered-usage-events', payload);
  }
}

module.exports = { CursorApi };
