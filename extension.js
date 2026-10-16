const vscode = require('vscode');
const { CursorAuth } = require('./src/cursor_auth.js');
const { CursorApi } = require('./src/cursor_api.js');
const { TokenAggregator } = require('./src/token_aggregator.js');
const { StatusBarManager } = require('./src/status_bar.js');
const { WebviewProvider } = require('./src/webview_provider.js');
const { pushTokenStatsToRemote } = require('./src/sync_client.js');

let refreshTimer = null;
let syncTimer = null;
let lastSyncTime = 0;

/**
 * Format token counts with Chinese units (万 / 亿)
 */
function formatTokensChinese(num) {
  if (num == null || isNaN(num)) return '0';
  num = Number(num);
  if (num === 0) return '0';
  if (num >= 100000000) {
    const yi = num / 100000000;
    return parseFloat(yi.toFixed(yi >= 100 ? 1 : 2)) + ' 亿';
  }
  if (num >= 10000) {
    const wan = num / 10000;
    return parseFloat(wan.toFixed(wan >= 100 ? 1 : 2)) + ' 万';
  }
  return num.toLocaleString();
}

/**
 * Read sync configuration with automatic fallback to Antigravity settings
 */
async function getSyncConfig(context) {
  const config = vscode.workspace.getConfiguration('cursorQuota');
  let enabled = config.get('sync.enabled', false);
  let endpoint = config.get('sync.endpoint', '');
  let secretKey = config.get('sync.secretKey', '');
  let intervalMinutes = config.get('sync.intervalMinutes', 10);
  let mode = config.get('sync.mode', 'full');

  // Check SecretStorage for secretKey
  if (context && context.secrets) {
    try {
      const stored = await context.secrets.get('cursor_sync_secret_key');
      if (stored && stored.trim()) {
        secretKey = stored.trim();
      }
    } catch (e) {}
  }

  // Automatic fallback to Antigravity configuration if empty
  if (!endpoint || !endpoint.trim()) {
    const agyConfig = vscode.workspace.getConfiguration('antigravityQuota');
    const agyEndpoint = agyConfig.get('sync.endpoint', '');
    if (agyEndpoint && agyEndpoint.trim()) {
      endpoint = agyEndpoint.trim();
    }
  }
  if (!secretKey || !secretKey.trim()) {
    const agyConfig = vscode.workspace.getConfiguration('antigravityQuota');
    const agyKey = agyConfig.get('sync.secretKey', '');
    if (agyKey && agyKey.trim()) {
      secretKey = agyKey.trim();
    } else if (context && context.secrets) {
      try {
        const agyStored = await context.secrets.get('antigravity_sync_secret_key');
        if (agyStored && agyStored.trim()) {
          secretKey = agyStored.trim();
        }
      } catch (e) {}
    }
  }

  return {
    enabled,
    endpoint: endpoint.trim(),
    secretKey: secretKey.trim(),
    intervalMinutes: Math.max(1, intervalMinutes),
    mode
  };
}

/**
 * Execute remote sync to backend server
 */
async function executeRemoteSync(context, aggregator, silent = false) {
  const syncConfig = await getSyncConfig(context);
  let { endpoint, secretKey, mode } = syncConfig;

  if (!endpoint) {
    if (!silent) {
      const action = await vscode.window.showWarningMessage(
        '尚未配置云端同步接口地址。是否现在进行配置？',
        '立即配置',
        '取消'
      );
      if (action === '立即配置') {
        await configureSyncInteractive(context, aggregator);
      }
    }
    return false;
  }

  // Ensure aggregator has data
  if (!aggregator.cachedData && !aggregator.loadDiskCache()) {
    try {
      await aggregator.getDashboardData(false);
    } catch (e) {}
  }

  const payload = aggregator.exportDataForSync();

  const doSync = async () => {
    const res = await pushTokenStatsToRemote(endpoint, secretKey, payload);
    if (res.success) {
      lastSyncTime = Date.now();
      if (!silent) {
        const daysCount = payload.all_daily?.length || 0;
        const totalTokens = payload.summary?.all_time_tokens || 0;
        vscode.window.showInformationMessage(
          `Cursor Token 数据已成功同步到远程服务器！(共 ${daysCount} 天热力图，累计 ${formatTokensChinese(totalTokens)} tokens)`
        );
      }
      return true;
    } else {
      if (!silent) {
        vscode.window.showErrorMessage(`云端同步失败: ${res.error}`);
      } else {
        console.warn('[CursorQuota] Remote sync error:', res.error);
      }
      return false;
    }
  };

  if (!silent) {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在同步 Cursor Token 数据到远程服务器...',
      },
      doSync
    );
  } else {
    return await doSync();
  }
}

/**
 * Interactive sync configuration wizard
 */
async function configureSyncInteractive(context, aggregator) {
  const config = vscode.workspace.getConfiguration('cursorQuota');
  const syncConfig = await getSyncConfig(context);

  const currentEndpoint = syncConfig.endpoint || '未设置';
  const currentKeyMasked = syncConfig.secretKey
    ? (syncConfig.secretKey.length > 8 ? `${syncConfig.secretKey.slice(0, 4)}...${syncConfig.secretKey.slice(-4)}` : '******')
    : '未设置';
  const statusStr = syncConfig.enabled ? '已启用 $(check)' : '未启用 $(x)';

  const items = [
    {
      label: '$(cloud-upload) 立即同步数据到云端 (Sync Now)',
      description: '立即打包并上传当前 Cursor Token 统计到远程服务器',
      action: 'sync_now',
    },
    {
      label: `$(link) 设置同步接口地址 (${currentEndpoint})`,
      description: '修改远程 API 接收地址 (如 https://your-domain.com/api/token-stats/sync)',
      action: 'set_endpoint',
    },
    {
      label: `$(key) 设置同步鉴权密钥 (${currentKeyMasked})`,
      description: '设置与服务端环境变量 TOKEN_SYNC_SECRET 对应的 Secret Key',
      action: 'set_secret',
    },
    {
      label: `$(sync) 自动同步状态: ${statusStr}`,
      description: `点击切换自动同步开关（当前间隔: ${syncConfig.intervalMinutes} 分钟）`,
      action: 'toggle_enabled',
    },
    {
      label: '$(debug-alt) 测试接口连接 (Test Connection)',
      description: '测试当前填写的接口地址与密钥是否可用',
      action: 'test_connection',
    },
  ];

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: '选择要配置的 Cursor 云端同步项目',
  });

  if (!selection) return;

  if (selection.action === 'sync_now') {
    await executeRemoteSync(context, aggregator, false);
    return;
  }

  if (selection.action === 'toggle_enabled') {
    const nextVal = !syncConfig.enabled;
    await config.update('sync.enabled', nextVal, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Cursor 云端自动同步已${nextVal ? '启用' : '停用'}。`);
    setupSyncTimer(context, aggregator);
    return;
  }

  if (selection.action === 'set_endpoint') {
    const newEndpoint = await vscode.window.showInputBox({
      title: '配置 Cursor 云端同步接口地址',
      prompt: '请输入完整的 HTTP/HTTPS POST 地址',
      value: syncConfig.endpoint,
      placeHolder: 'https://your-domain.com/api/token-stats/sync',
    });

    if (newEndpoint !== undefined) {
      const cleanEndpoint = newEndpoint.trim();
      if (cleanEndpoint) {
        // Pre-save validation test
        const testRes = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: '正在测试接口连通性...',
          },
          async () => {
            const payload = aggregator.exportDataForSync();
            return await pushTokenStatsToRemote(cleanEndpoint, syncConfig.secretKey, payload, 8000);
          }
        );

        if (testRes.success) {
          await config.update('sync.endpoint', cleanEndpoint, vscode.ConfigurationTarget.Global);
          await config.update('sync.enabled', true, vscode.ConfigurationTarget.Global);
          setupSyncTimer(context, aggregator);
          vscode.window.showInformationMessage('接口测试成功！地址已保存并已自动启用云端同步。');
        } else {
          const force = await vscode.window.showWarningMessage(
            `连接测试未通过 (${testRes.error})。是否仍要保存该地址？`,
            '依然保存',
            '取消'
          );
          if (force === '依然保存') {
            await config.update('sync.endpoint', cleanEndpoint, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('已保存同步接口地址。');
          }
        }
      } else {
        await config.update('sync.endpoint', '', vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('已清空同步接口地址。');
      }
    }
    return;
  }

  if (selection.action === 'set_secret') {
    const newSecret = await vscode.window.showInputBox({
      title: '配置 Cursor 云端同步鉴权密钥',
      prompt: '请输入与服务端环境变量 TOKEN_SYNC_SECRET 对应的鉴权 Secret Key',
      password: true,
      value: syncConfig.secretKey,
      placeHolder: '请输入 Secret Key',
    });

    if (newSecret !== undefined) {
      const cleanSecret = newSecret.trim();
      if (context.secrets) {
        if (cleanSecret) {
          await context.secrets.store('cursor_sync_secret_key', cleanSecret);
        } else {
          await context.secrets.delete('cursor_sync_secret_key');
        }
      }
      await config.update('sync.secretKey', cleanSecret, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('同步密钥已更新。');
    }
    return;
  }

  if (selection.action === 'test_connection') {
    if (!syncConfig.endpoint) {
      vscode.window.showWarningMessage('尚未配置接口地址，无法测试连接。');
      return;
    }

    const testRes = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在测试连接到 ${syncConfig.endpoint}...`,
      },
      async () => {
        const payload = aggregator.exportDataForSync();
        return await pushTokenStatsToRemote(syncConfig.endpoint, syncConfig.secretKey, payload, 8000);
      }
    );

    if (testRes.success) {
      vscode.window.showInformationMessage('恭喜！接口连接测试成功，服务端验证通过！');
    } else {
      vscode.window.showErrorMessage(`接口连接测试失败: ${testRes.error}`);
    }
  }
}

/**
 * Setup recurring background sync timer
 */
function setupSyncTimer(context, aggregator) {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }

  const config = vscode.workspace.getConfiguration('cursorQuota');
  const enabled = config.get('sync.enabled', false);
  const intervalMinutes = config.get('sync.intervalMinutes', 10);
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  if (enabled) {
    syncTimer = setInterval(() => {
      executeRemoteSync(context, aggregator, true);
    }, intervalMs);
  }
}

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
    }),

    vscode.commands.registerCommand('cursorQuota.syncNow', async () => {
      await executeRemoteSync(context, aggregator, false);
    }),

    vscode.commands.registerCommand('cursorQuota.configureSync', async () => {
      await configureSyncInteractive(context, aggregator);
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
      if (e.affectsConfiguration('cursorQuota.sync.enabled') || e.affectsConfiguration('cursorQuota.sync.intervalMinutes')) {
        setupSyncTimer(context, aggregator);
      }
    })
  );

  setupTimer();
  setupSyncTimer(context, aggregator);

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
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

module.exports = {
  activate,
  deactivate
};
