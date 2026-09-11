const vscode = require('vscode');
const { CursorAuth } = require('./src/cursor_auth.js');
const { CursorApi } = require('./src/cursor_api.js');
const { TokenAggregator } = require('./src/token_aggregator.js');
const { StatusBarManager } = require('./src/status_bar.js');
const { WebviewProvider } = require('./src/webview_provider.js');

let refreshTimer = null;

/**
 * Extension activation entrypoint
 */
async function activate(context) {
  console.log('[CursorQuota] Extension activating...');

  const auth = new CursorAuth(context);
  const api = new CursorApi(auth);

  let storagePath = null;
  try {
    storagePath = context.globalStorageUri.fsPath;
  } catch (e) {
    // fallback
  }

  const aggregator = new TokenAggregator(api, storagePath);
  const statusBar = new StatusBarManager(context);
  const webviewProvider = new WebviewProvider(context, aggregator, statusBar);

  // Register Webview View Provider (Sidebar)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cursorQuota.dashboard', webviewProvider)
  );

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('cursorQuota.refresh', async () => {
      await webviewProvider.refreshAll(true);
      vscode.window.setStatusBarMessage('$(check) Cursor Quota refreshed', 2500);
    }),

    vscode.commands.registerCommand('cursorQuota.openDashboard', async () => {
      await webviewProvider.openTabPanel();
    }),

    vscode.commands.registerCommand('cursorQuota.setToken', async () => {
      const input = await vscode.window.showInputBox({
        title: 'Set Cursor Session Token',
        prompt: 'Paste your WorkosCursorSessionToken cookie value or Cursor access token JWT',
        password: true,
        placeHolder: 'user_01KA...::eyJhbGci...'
      });

      if (input && input.trim()) {
        await context.secrets.store('cursor_session_token', input.trim());
        vscode.window.showInformationMessage('Cursor session token saved successfully.');
        await webviewProvider.refreshAll(true);
      }
    }),

    vscode.commands.registerCommand('cursorQuota.clearToken', async () => {
      await context.secrets.delete('cursor_session_token');
      vscode.window.showInformationMessage('Manual session token cleared. Extension will use auto-detected local credentials.');
      await webviewProvider.refreshAll(true);
    })
  );

  // Function to setup interval timer
  function setupTimer() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }

    const config = vscode.workspace.getConfiguration('cursorQuota');
    const intervalMinutes = config.get('refreshInterval', 10);
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

    refreshTimer = setInterval(() => {
      webviewProvider.refreshAll(true);
    }, intervalMs);
  }

  // Setup configuration listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('cursorQuota.refreshInterval')) {
        setupTimer();
      }
      if (e.affectsConfiguration('cursorQuota.statusBarFormat') || e.affectsConfiguration('cursorQuota.lowQuotaThreshold')) {
        webviewProvider.refreshAll(false);
      }
    })
  );

  setupTimer();

  // Trigger initial fetch
  setTimeout(() => {
    webviewProvider.refreshAll(false);
  }, 1000);

  console.log('[CursorQuota] Extension activated successfully.');
}

/**
 * Extension deactivation
 */
function deactivate() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

module.exports = {
  activate,
  deactivate
};
