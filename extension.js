const vscode = require('vscode');
const { CursorAuth } = require('./src/cursor_auth.js');
const { CursorApi } = require('./src/cursor_api.js');
const { TokenAggregator } = require('./src/token_aggregator.js');
const { StatusBarManager } = require('./src/status_bar.js');
const { WebviewProvider } = require('./src/webview_provider.js');

let refreshTimer = null;

/**
 * 插件激活入口
 */
async function activate(context) {
  console.log('[CursorQuota] 插件正在激活...');

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

  // 注册侧边栏 Webview View Provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cursorQuota.dashboard', webviewProvider)
  );

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('cursorQuota.refresh', async () => {
      await webviewProvider.refreshAll(true);
      vscode.window.setStatusBarMessage('$(check) Cursor 额度已刷新', 2500);
    }),

    vscode.commands.registerCommand('cursorQuota.openDashboard', async () => {
      await webviewProvider.openTabPanel();
    }),

    vscode.commands.registerCommand('cursorQuota.setToken', async () => {
      const input = await vscode.window.showInputBox({
        title: '设置 Cursor 会话令牌 (Session Token)',
        prompt: '请粘贴您的 WorkosCursorSessionToken Cookie 值或 Cursor accessToken JWT',
        password: true,
        placeHolder: 'user_xxxx...::eyJhbGci...'
      });

      if (input && input.trim()) {
        await context.secrets.store('cursor_session_token', input.trim());
        vscode.window.showInformationMessage('Cursor 会话令牌已成功保存。');
        await webviewProvider.refreshAll(true);
      }
    }),

    vscode.commands.registerCommand('cursorQuota.clearToken', async () => {
      await context.secrets.delete('cursor_session_token');
      vscode.window.showInformationMessage('已清除手动保存的令牌，恢复为自动检测本地凭证。');
      await webviewProvider.refreshAll(true);
    })
  );

  // 定时器刷新逻辑
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

  // 监听配置更改
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

  // 首次自启动查询
  setTimeout(() => {
    webviewProvider.refreshAll(false);
  }, 1000);

  console.log('[CursorQuota] 插件激活完成。');
}

/**
 * 插件停用清理
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
